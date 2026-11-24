/**
 * Web COD — Operation Ironline
 * Core game simulation engine: hitscan ray-circle intersection, wave lifecycle,
 * supply pickups, killfeed, killstreak execution, and match statistics.
 */
(function (root) {
  'use strict';

  const Config =
    typeof module !== 'undefined' && module.exports
      ? require('./config')
      : root.WebCOD.Config;
  const { TacticalMap } =
    typeof module !== 'undefined' && module.exports
      ? require('./map')
      : root.WebCOD;
  const { WeaponSystem } =
    typeof module !== 'undefined' && module.exports
      ? require('./weapons')
      : root.WebCOD;
  const { Player } =
    typeof module !== 'undefined' && module.exports
      ? require('./player')
      : root.WebCOD;
  const { Enemy, createWavePlan } =
    typeof module !== 'undefined' && module.exports
      ? require('./ai')
      : root.WebCOD;

  class GameEngine {
    constructor(options = {}) {
      this.mapId = options.mapId || 'killhouse';
      this.rng = options.rng || Math.random;
      this.events = []; // Transient events consumed by renderer/audio
      this.reset(this.mapId);
    }

    reset(mapId = this.mapId) {
      this.mapId = Config.MAPS[mapId] ? mapId : 'killhouse';
      this.map = new TacticalMap(Config.MAPS[this.mapId]);
      this.player = new Player(this.map.playerSpawn);
      this.weapons = new WeaponSystem();

      this.status = 'MENU'; // MENU | PLAYING | PAUSED | GAMEOVER
      this.nowMs = 0;
      this.wave = 1;
      this.waveQueue = [];
      this.spawnTimerMs = 0;
      this.waveBannerTimer = 0;

      this.enemies = [];
      this.pickups = []; // { id, type: 'medkit'|'ammo', x, y }
      this.killFeed = []; // { text, isHeadshot, timeMs }
      this.hitmarker = { timer: 0, type: 'normal' }; // normal | headshot | kill
      this.screenShake = 0;
      this.shotsFired = 0;
      this.shotsHit = 0;
      this.events = [];
      this.nextPickupId = 1;
    }

    startGame(mapId = this.mapId) {
      this.reset(mapId);
      this.status = 'PLAYING';
      this.startWave(1);
      this.pushEvent('game_start', { mapId: this.mapId });
    }

    togglePause() {
      if (this.status === 'PLAYING') {
        this.status = 'PAUSED';
        return true;
      }
      if (this.status === 'PAUSED') {
        this.status = 'PLAYING';
        return false;
      }
      return false;
    }

    pushEvent(type, payload = {}) {
      this.events.push({ type, payload, timeMs: this.nowMs });
    }

    consumeEvents() {
      const out = this.events.slice();
      this.events.length = 0;
      return out;
    }

    startWave(waveNum) {
      this.wave = waveNum;
      this.waveQueue = createWavePlan(waveNum);
      this.spawnTimerMs = 200;
      this.waveBannerTimer = 2.6;
      this.pushEvent('wave_start', { wave: waveNum, totalEnemies: this.waveQueue.length });
    }

    spawnNextEnemy() {
      if (this.waveQueue.length === 0) return null;
      const typeId = this.waveQueue.shift();
      const spawns = this.map.enemySpawns;
      // Pick spawn farthest from player to avoid unfair instant spawns
      let bestSpawn = spawns[0];
      let bestScore = -1;
      for (const sp of spawns) {
        const d = Math.hypot(sp.x - this.player.x, sp.y - this.player.y);
        const jitter = this.rng() * 3.5;
        if (d + jitter > bestScore) {
          bestScore = d + jitter;
          bestSpawn = sp;
        }
      }
      const enemy = new Enemy(typeId, bestSpawn.x, bestSpawn.y, this.wave);
      this.enemies.push(enemy);
      return enemy;
    }

    /**
     * Resolves a single hitscan pellet against walls and alive enemies.
     */
    tracePellet(angle, verticalOffset, weaponId) {
      const wallHit = this.map.castRay(
        this.player.x,
        this.player.y,
        angle,
        Config.WEAPONS[weaponId].range
      );
      const maxDist = wallHit.dist;
      const dirX = Math.cos(angle);
      const dirY = Math.sin(angle);

      let closestEnemy = null;
      let closestDist = maxDist;
      let hitOffsetRatio = 1.0;

      for (const enemy of this.enemies) {
        if (!enemy.alive) continue;
        const ex = enemy.x - this.player.x;
        const ey = enemy.y - this.player.y;
        const proj = ex * dirX + ey * dirY;
        if (proj <= 0.1 || proj >= closestDist) continue;

        const perpDist = Math.abs(ex * -dirY + ey * dirX);
        if (perpDist <= enemy.radius) {
          closestDist = proj;
          closestEnemy = enemy;
          hitOffsetRatio = perpDist / enemy.radius;
        }
      }

      if (!closestEnemy) {
        return {
          hitEnemy: null,
          wallHit,
          dist: maxDist,
          damage: 0,
          isHeadshot: false
        };
      }

      // Headshot when aiming near center + slightly high or tight center aim
      const isHeadshot =
        hitOffsetRatio < 0.38 &&
        Math.abs(this.player.pitch + verticalOffset) < 0.14;

      const damage = this.weapons.computeDamage(weaponId, closestDist, isHeadshot);
      return {
        hitEnemy: closestEnemy,
        wallHit,
        dist: closestDist,
        damage,
        isHeadshot
      };
    }

    firePlayerWeapon() {
      if (this.status !== 'PLAYING' || !this.player.alive) return null;
      const shot = this.weapons.fire(this.nowMs, this.rng);
      if (!shot) {
        const slot = this.weapons.getCurrentSlot();
        if (slot.ammo === 0 && !this.weapons.reloading) {
          this.weapons.startReload(this.nowMs);
          this.pushEvent('reload_start', { weaponId: this.weapons.currentId });
        }
        return null;
      }

      this.shotsFired += 1;
      this.screenShake = Math.min(1, this.screenShake + Config.WEAPONS[shot.weaponId].recoilKick * 5.5);
      this.pushEvent('weapon_fire', { weaponId: shot.weaponId });

      let anyHit = false;
      let anyHeadshot = false;
      let anyKill = false;
      const hits = [];

      for (const pellet of shot.pellets) {
        const res = this.tracePellet(
          this.player.angle + pellet.angleOffset,
          pellet.verticalOffset,
          shot.weaponId
        );
        if (res.hitEnemy && res.damage > 0) {
          anyHit = true;
          if (res.isHeadshot) anyHeadshot = true;
          const outcome = res.hitEnemy.takeDamage(res.damage);
          hits.push({
            enemyId: res.hitEnemy.id,
            damage: outcome.damage,
            isHeadshot: res.isHeadshot,
            killed: outcome.killed
          });
          if (outcome.killed) {
            anyKill = true;
            this.handleEnemyKilled(res.hitEnemy, shot.weaponId, res.isHeadshot);
          }
        }
      }

      if (anyHit) {
        this.shotsHit += 1;
        this.hitmarker = {
          timer: 0.22,
          type: anyKill ? 'kill' : anyHeadshot ? 'headshot' : 'normal'
        };
        this.pushEvent('hitmarker', { type: this.hitmarker.type });
      }

      if (shot.autoReloadNeeded) {
        this.weapons.startReload(this.nowMs);
        this.pushEvent('reload_start', { weaponId: shot.weaponId });
      }

      return { shot, hits };
    }

    handleEnemyKilled(enemy, weaponLabel, isHeadshot) {
      const unlocked = this.player.registerKill(enemy.score, isHeadshot);
      const spec = Config.WEAPONS[weaponLabel];
      const wName = spec ? spec.shortName : weaponLabel;
      this.killFeed.unshift({
        text: `YOU [${wName}] ☠ ${enemy.name}${isHeadshot ? ' 爆头' : ''}`,
        isHeadshot,
        timeMs: this.nowMs
      });
      if (this.killFeed.length > 5) this.killFeed.pop();

      for (const ks of unlocked) {
        this.pushEvent('killstreak_unlocked', { killstreak: ks });
      }

      // Chance to drop tactical supply crate
      if (this.rng() < 0.38) {
        this.pickups.push({
          id: this.nextPickupId++,
          type: this.rng() < 0.5 ? 'medkit' : 'ammo',
          x: enemy.x,
          y: enemy.y
        });
      }
    }

    triggerUav() {
      if (this.status !== 'PLAYING') return false;
      if (this.player.activateUav(this.nowMs)) {
        this.pushEvent('uav_activated', { durationMs: Config.KILLSTREAKS.uav.durationMs });
        return true;
      }
      return false;
    }

    triggerAirstrike() {
      if (this.status !== 'PLAYING') return false;
      const aliveEnemies = this.enemies.filter((e) => e.alive);
      if (aliveEnemies.length === 0) return false;
      if (!this.player.consumeAirstrike()) return false;

      // Target the enemy with most nearby allies
      let bestTarget = aliveEnemies[0];
      let bestCount = -1;
      const radius = Config.KILLSTREAKS.airstrike.radius;
      for (const e of aliveEnemies) {
        const count = aliveEnemies.filter(
          (o) => Math.hypot(o.x - e.x, o.y - e.y) <= radius
        ).length;
        if (count > bestCount) {
          bestCount = count;
          bestTarget = e;
        }
      }

      let killedCount = 0;
      for (const e of aliveEnemies) {
        const dist = Math.hypot(e.x - bestTarget.x, e.y - bestTarget.y);
        if (dist <= radius) {
          const outcome = e.takeDamage(Config.KILLSTREAKS.airstrike.damage);
          if (outcome.killed) {
            killedCount++;
            this.handleEnemyKilled(e, 'AIRSTRIKE', false);
          }
        }
      }

      this.screenShake = 1.0;
      this.pushEvent('airstrike', {
        x: bestTarget.x,
        y: bestTarget.y,
        killedCount
      });
      return true;
    }

    update(dtSec, input = {}) {
      if (this.status !== 'PLAYING') return;
      const clampedDt = Math.min(0.1, Math.max(0, dtSec));
      this.nowMs += clampedDt * 1000;

      // Update player & weapon systems
      const weaponSpec = this.weapons.getCurrentSpec();
      this.weapons.setAds(Boolean(input.ads));
      const { reloadCompleted } = this.weapons.update(clampedDt, this.nowMs);
      if (reloadCompleted) {
        this.pushEvent('reload_complete', { weaponId: this.weapons.currentId });
      }

      if (input.turn) {
        this.player.rotate(input.turn * clampedDt * 2.4, 0);
      }

      this.player.move(
        input,
        clampedDt,
        this.map,
        weaponSpec.moveSpeedFactor,
        this.weapons.isAds
      );
      this.player.update(clampedDt, this.nowMs);

      if (input.fire && (weaponSpec.auto || input.fireJustPressed)) {
        this.firePlayerWeapon();
      }

      // Collect tactical pickups
      for (let i = this.pickups.length - 1; i >= 0; i--) {
        const p = this.pickups[i];
        if (Math.hypot(p.x - this.player.x, p.y - this.player.y) < 0.75) {
          if (p.type === 'medkit') {
            this.player.heal(35, 25);
          } else {
            this.weapons.refillAmmo(0.45);
          }
          this.pushEvent('pickup', { type: p.type });
          this.pickups.splice(i, 1);
        }
      }

      // Spawn queued enemies progressively
      if (this.waveQueue.length > 0) {
        this.spawnTimerMs -= clampedDt * 1000;
        const aliveCount = this.enemies.filter((e) => e.alive).length;
        if (this.spawnTimerMs <= 0 && aliveCount < 8) {
          this.spawnNextEnemy();
          this.spawnTimerMs = Math.max(700, 1750 - this.wave * 110);
        }
      }

      // Update enemies
      for (const enemy of this.enemies) {
        if (!enemy.alive) continue;
        const shot = enemy.update(clampedDt, this.nowMs, this.player, this.map, this.rng);
        if (shot) {
          this.pushEvent('enemy_fire', { enemyId: shot.enemyId, didHit: shot.didHit });
          if (shot.didHit) {
            this.player.takeDamage(shot.damage, this.nowMs, shot.sourceX, shot.sourceY);
            this.screenShake = Math.min(1, this.screenShake + 0.35);
            this.pushEvent('player_hit', { damage: shot.damage });
          }
        }
      }

      // Clean up dead enemies when wave finishes
      const remainingAlive = this.enemies.filter((e) => e.alive).length;
      if (this.waveQueue.length === 0 && remainingAlive === 0) {
        this.enemies = [];
        this.player.heal(25, 15);
        this.weapons.refillAmmo(0.35);
        this.startWave(this.wave + 1);
      }

      // Timers
      this.hitmarker.timer = Math.max(0, this.hitmarker.timer - clampedDt);
      this.screenShake = Math.max(0, this.screenShake - clampedDt * 3.8);
      this.waveBannerTimer = Math.max(0, this.waveBannerTimer - clampedDt);

      // Trim expired killfeed entries
      this.killFeed = this.killFeed.filter((k) => this.nowMs - k.timeMs < 5500);

      if (!this.player.alive) {
        this.status = 'GAMEOVER';
        this.pushEvent('game_over', this.getSummaryStats());
      }
    }

    getAccuracyPercent() {
      if (this.shotsFired === 0) return 0;
      return Math.round((this.shotsHit / this.shotsFired) * 100);
    }

    getSummaryStats() {
      return {
        mapName: this.map.name,
        wave: this.wave,
        score: this.player.score,
        kills: this.player.kills,
        headshots: this.player.headshots,
        bestStreak: this.player.bestStreak,
        accuracy: this.getAccuracyPercent(),
        survivalSec: Math.round(this.nowMs / 1000)
      };
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GameEngine };
  } else {
    root.WebCOD = root.WebCOD || {};
    root.WebCOD.GameEngine = GameEngine;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
