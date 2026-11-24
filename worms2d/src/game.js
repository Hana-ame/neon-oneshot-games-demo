// Core turn-based game state machine, crates, sudden death, particles, and camera

import { WORLD, PHYSICS, TURN, TEAMS, WEAPONS, WEAPON_MAP } from './constants.js';
import { Terrain, createRng } from './terrain.js';
import { walkWorm, stepWormPhysics, stepProjectilePhysics, applyExplosionDamage, clamp } from './physics.js';
import { fireWeapon, spawnClusterBomblets } from './weapons.js';
import { planAiTurn } from './ai.js';
import { SoundEngine } from './audio.js';

export const PHASE = {
  PLAYER_TURN: 'PLAYER_TURN',
  RETREAT: 'RETREAT',
  RESOLVING: 'RESOLVING',
  TURN_TRANSITION: 'TURN_TRANSITION',
  GAME_OVER: 'GAME_OVER',
};

const MAX_RESOLVE_TIMEOUT = 6.5; // Safety net when no projectiles remain

export class WormsGame {
  constructor(options = {}) {
    this.mode = options.mode || 'ai'; // 'ai' | 'pvp'
    this.themeId = options.themeId || 'emerald';
    this.wormsPerTeam = options.wormsPerTeam || 3;
    this.seed = options.seed ?? Math.floor(Math.random() * 1000000);
    this.sound = options.sound || new SoundEngine();

    this.paused = false;
    this.reset(this.seed);
  }

  reset(seed = Math.floor(Math.random() * 1000000)) {
    this.seed = seed >>> 0;
    this.rng = createRng(this.seed);
    this.terrain = new Terrain(WORLD.WIDTH, WORLD.HEIGHT, this.themeId, this.seed);
    this.waterLevel = WORLD.INITIAL_WATER_LEVEL;
    this.turnNumber = 1;
    this.wind = this._rollWind();

    this.worms = [];
    this.projectiles = [];
    this.crates = [];
    this.particles = [];
    this.explosions = [];
    this.floatingTexts = [];
    this.hitscanBeams = [];

    this.teamAmmo = TEAMS.map(() => {
      const bag = {};
      for (const w of WEAPONS) bag[w.id] = w.ammo;
      return bag;
    });

    this.teamLastWormId = [null, null];
    this.activeTeamId = 0;
    this.activeWormId = null;
    this.selectedWeaponId = 'bazooka';
    this.shotsRemainingThisTurn = 1;
    this.hasFiredThisTurn = false;

    this.phase = PHASE.PLAYER_TURN;
    this.turnTimer = TURN.DURATION;
    this.retreatTimer = 0;
    this.resolvingTimer = 0;
    this.transitionTimer = 0;
    this.winnerTeamId = null; // 0, 1, or -1 (draw)

    this.charging = false;
    this.chargeTime = 0;
    this.chargePower = 0;

    this.aiState = null;
    this.bannerText = '';
    this.bannerTimer = 0;
    this.shakeTime = 0;
    this.shakeIntensity = 0;

    this.camera = {
      x: WORLD.WIDTH / 2,
      y: WORLD.HEIGHT / 2,
      targetX: WORLD.WIDTH / 2,
      targetY: WORLD.HEIGHT / 2,
      manual: false,
      manualTimer: 0,
    };

    this._spawnWorms();
    this._selectNextWormForTeam(0);
    this._showBanner(`回合 1 · ${TEAMS[0].shortName}行动`, 2.0);
  }

  _rollWind() {
    return Math.round((this.rng() * 2 - 1) * 95);
  }

  _spawnWorms() {
    const total = this.wormsPerTeam * 2;
    const spots = this.terrain.findSpawnPositions(total, this.waterLevel);
    let id = 1;

    for (let i = 0; i < total; i++) {
      const teamId = i % 2;
      const memberIdx = Math.floor(i / 2);
      const team = TEAMS[teamId];
      const spot = spots[i] || { x: 250 + i * 180, y: 200 };

      this.worms.push({
        id: id++,
        teamId,
        name: team.names[memberIdx % team.names.length],
        x: spot.x,
        y: spot.y,
        vx: 0,
        vy: 0,
        hp: 100,
        maxHp: 100,
        alive: true,
        drowned: false,
        grounded: false,
        facing: teamId === 0 ? 1 : -1,
        aimAngle: -0.35,
        walkPhase: 0,
      });
    }
  }

  getActiveWorm() {
    return this.worms.find((w) => w.id === this.activeWormId && w.alive) || null;
  }

  isAiTurn() {
    return this.mode === 'ai' && this.activeTeamId === 1 && this.phase === PHASE.PLAYER_TURN;
  }

  getTeamStats() {
    return TEAMS.map((t) => {
      const members = this.worms.filter((w) => w.teamId === t.id);
      const alive = members.filter((w) => w.alive);
      const totalHp = alive.reduce((sum, w) => sum + w.hp, 0);
      return {
        id: t.id,
        name: t.name,
        shortName: t.shortName,
        color: t.color,
        aliveCount: alive.length,
        totalHp,
        maxTotalHp: members.length * 100,
      };
    });
  }

  _selectNextWormForTeam(teamId) {
    const living = this.worms
      .filter((w) => w.teamId === teamId && w.alive)
      .sort((a, b) => a.id - b.id);
    if (living.length === 0) return null;

    const lastId = this.teamLastWormId[teamId];
    let worm = living[0];
    if (lastId !== null) {
      const next = living.find((w) => w.id > lastId);
      worm = next || living[0];
    }
    this.teamLastWormId[teamId] = worm.id;

    this.activeTeamId = teamId;
    this.activeWormId = worm.id;
    this.turnTimer = TURN.DURATION;
    this.resolvingTimer = 0;
    this.charging = false;
    this.chargeTime = 0;
    this.chargePower = 0;
    this.hasFiredThisTurn = false;
    this.aiState = null;

    // Ensure selected weapon has ammo
    if (!this._hasAmmo(teamId, this.selectedWeaponId)) {
      this.selectedWeaponId = 'bazooka';
    }
    const weapon = WEAPON_MAP[this.selectedWeaponId];
    this.shotsRemainingThisTurn = weapon.shotsPerTurn || 1;

    this.camera.manual = false;
    this.camera.targetX = worm.x;
    this.camera.targetY = worm.y;

    return worm;
  }

  _hasAmmo(teamId, weaponId) {
    const amt = this.teamAmmo[teamId]?.[weaponId];
    return amt === Infinity || amt > 0;
  }

  selectWeapon(weaponId) {
    if (this.phase !== PHASE.PLAYER_TURN || this.charging || this.hasFiredThisTurn) return false;
    if (!WEAPON_MAP[weaponId]) return false;
    if (!this._hasAmmo(this.activeTeamId, weaponId)) return false;

    this.selectedWeaponId = weaponId;
    const weapon = WEAPON_MAP[weaponId];
    this.shotsRemainingThisTurn = weapon.shotsPerTurn || 1;
    return true;
  }

  // Player controls
  moveActiveWorm(dir, dt) {
    if (this.phase !== PHASE.PLAYER_TURN && this.phase !== PHASE.RETREAT) return;
    if (this.charging) return;
    const worm = this.getActiveWorm();
    if (!worm) return;
    walkWorm(worm, this.terrain, dir, dt);
    this.camera.manual = false;
  }

  aimActiveWorm(deltaAngle) {
    if (this.phase !== PHASE.PLAYER_TURN) return;
    const worm = this.getActiveWorm();
    if (!worm) return;
    worm.aimAngle = clamp(worm.aimAngle + deltaAngle, -1.48, 1.42);
  }

  jumpActiveWorm(backflip = false) {
    if (this.phase !== PHASE.PLAYER_TURN && this.phase !== PHASE.RETREAT) return;
    if (this.charging) return;
    const worm = this.getActiveWorm();
    if (!worm || !worm.grounded) return;

    if (backflip) {
      worm.vx = worm.facing * PHYSICS.WORM_BACKFLIP_VX;
      worm.vy = PHYSICS.WORM_BACKFLIP_VY;
    } else {
      worm.vx = worm.facing * PHYSICS.WORM_JUMP_VX;
      worm.vy = PHYSICS.WORM_JUMP_VY;
    }
    worm.grounded = false;
    this.sound.playJump(backflip);
  }

  startCharge() {
    if (this.phase !== PHASE.PLAYER_TURN) return;
    const worm = this.getActiveWorm();
    if (!worm) return;
    const weapon = WEAPON_MAP[this.selectedWeaponId];
    if (!weapon) return;

    if (weapon.type === 'airstrike') {
      this.fireActiveWeapon(1.0, { x: worm.x + worm.facing * 260, y: worm.y });
      return;
    }

    if (!weapon.chargeable) {
      this.fireActiveWeapon(1.0);
      return;
    }

    this.charging = true;
    this.chargeTime = 0;
    this.chargePower = TURN.MIN_POWER;
  }

  releaseCharge() {
    if (!this.charging) return;
    const power = this.chargePower;
    this.charging = false;
    this.chargeTime = 0;
    this.chargePower = 0;
    this.fireActiveWeapon(power);
  }

  triggerAirstrikeAt(worldX, worldY) {
    if (this.phase !== PHASE.PLAYER_TURN || this.selectedWeaponId !== 'airstrike') return false;
    return this.fireActiveWeapon(1.0, { x: worldX, y: worldY });
  }

  _enterResolving() {
    this.charging = false;
    this.phase = PHASE.RESOLVING;
    this.resolvingTimer = 0;
  }

  fireActiveWeapon(powerRatio = 0.7, targetPos = null) {
    if (this.phase !== PHASE.PLAYER_TURN) return false;
    const worm = this.getActiveWorm();
    if (!worm) return false;
    const weapon = WEAPON_MAP[this.selectedWeaponId];
    if (!weapon || !this._hasAmmo(this.activeTeamId, weapon.id)) return false;

    const result = fireWeapon(weapon.id, worm, powerRatio, this.terrain, this.worms, targetPos);

    // Decrement finite ammo only on the first shot of a turn
    if (!this.hasFiredThisTurn && this.teamAmmo[this.activeTeamId][weapon.id] !== Infinity) {
      this.teamAmmo[this.activeTeamId][weapon.id] = Math.max(
        0,
        this.teamAmmo[this.activeTeamId][weapon.id] - 1
      );
    }
    this.hasFiredThisTurn = true;

    if (result.hitscan) {
      const hs = result.hitscan;
      this.sound.playShotgun();
      this.hitscanBeams.push({
        startX: hs.startX,
        startY: hs.startY,
        endX: hs.endX,
        endY: hs.endY,
        life: 0.2,
        maxLife: 0.2,
      });
      if (hs.hit) {
        this._detonate(hs.endX, hs.endY, hs.blastRadius, hs.maxDamage, hs.knockback, false);
      }
      this.shotsRemainingThisTurn -= 1;
      if (this.shotsRemainingThisTurn <= 0) {
        this.phase = PHASE.RETREAT;
        this.retreatTimer = weapon.retreatTime;
      }
      return true;
    }

    if (result.projectiles.length > 0) {
      this.projectiles.push(...result.projectiles);
      this.sound.playLaunch();
      if (weapon.type === 'drop' || weapon.bounces) {
        this.phase = PHASE.RETREAT;
        this.retreatTimer = weapon.retreatTime;
      } else {
        this._enterResolving();
      }
      return true;
    }

    return false;
  }

  _detonate(cx, cy, blastRadius, maxDamage, maxKnockback, shake = true) {
    this.terrain.carveCrater(cx, cy, blastRadius);
    const affected = applyExplosionDamage(cx, cy, blastRadius, maxDamage, maxKnockback, this.worms);

    this.sound.playExplosion(blastRadius / 45);
    if (shake) {
      this.shakeTime = 0.28;
      this.shakeIntensity = Math.min(14, blastRadius * 0.2);
    }

    this.explosions.push({
      x: cx,
      y: cy,
      radius: blastRadius,
      age: 0,
      duration: 0.42,
    });

    const count = Math.min(40, Math.floor(blastRadius * 0.65));
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 60 + Math.random() * (blastRadius * 4.5);
      const isFire = i < count * 0.55;
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd - 45,
        size: isFire ? 3 + Math.random() * 5 : 2 + Math.random() * 3,
        color: isFire ? (Math.random() > 0.4 ? '#ff922b' : '#ffe066') : this.terrain.theme.dirtLight,
        life: 0.45 + Math.random() * 0.55,
        maxLife: 1.0,
        gravity: isFire ? 90 : 420,
      });
    }

    for (const hit of affected) {
      this._addFloatingText(hit.worm.x, hit.worm.y - 20, `-${hit.damage}`, '#ff6b6b');
      if (hit.killed) {
        this._addFloatingText(hit.worm.x, hit.worm.y - 36, '阵亡!', '#ffd43b');
      }
    }

    return affected;
  }

  _addFloatingText(x, y, text, color = '#ffffff') {
    this.floatingTexts.push({ x, y, text, color, age: 0, duration: 1.35 });
  }

  _showBanner(text, duration = 2.0) {
    this.bannerText = text;
    this.bannerTimer = duration;
  }

  _maybeSpawnCrate() {
    if (this.crates.length >= 2) return;
    if (this.rng() > 0.45) return;

    const x = 220 + this.rng() * (WORLD.WIDTH - 440);
    const kind = this.rng() < 0.55 ? 'medkit' : 'ammo';
    this.crates.push({
      id: Date.now() + Math.random(),
      x,
      y: 35,
      vy: 42,
      kind,
      grounded: false,
      active: true,
    });
  }

  _stepCrates(dt) {
    for (const c of this.crates) {
      if (!c.active) continue;
      if (!c.grounded) {
        c.y += c.vy * dt;
        if (this.terrain.isSolid(c.x, c.y + 10)) {
          c.grounded = true;
        } else if (c.y >= this.waterLevel) {
          c.active = false;
        }
      } else if (!this.terrain.isSolid(c.x, c.y + 11)) {
        c.grounded = false;
      }

      for (const w of this.worms) {
        if (!w.alive) continue;
        if (Math.hypot(w.x - c.x, w.y - c.y) <= PHYSICS.WORM_RADIUS + 12) {
          c.active = false;
          this.sound.playPickup();
          if (c.kind === 'medkit') {
            const heal = Math.min(25, w.maxHp - w.hp);
            w.hp = Math.min(w.maxHp, w.hp + 25);
            this._addFloatingText(w.x, w.y - 24, `+${heal || 25} HP`, '#52c41a');
          } else {
            const bonus = this.rng() < 0.5 ? 'cluster' : 'airstrike';
            this.teamAmmo[w.teamId][bonus] += 1;
            const wName = WEAPON_MAP[bonus].name;
            this._addFloatingText(w.x, w.y - 24, `+1 ${wName}`, '#38bdf8');
          }
          break;
        }
      }
    }
    this.crates = this.crates.filter((c) => c.active);
  }

  _stepAi(dt) {
    const worm = this.getActiveWorm();
    if (!worm) return;

    if (!this.aiState) {
      const plan = planAiTurn(this, worm);
      if (!plan) return;
      this.selectWeapon(plan.weaponId);
      this.aiState = {
        stage: 'think',
        timer: 0.65,
        plan,
      };
      return;
    }

    const st = this.aiState;
    const plan = st.plan;

    if (st.stage === 'think') {
      st.timer -= dt;
      if (st.timer <= 0) {
        st.stage = plan.walkDuration > 0 ? 'walk' : 'aim';
        st.timer = plan.walkDuration;
      }
    } else if (st.stage === 'walk') {
      walkWorm(worm, this.terrain, plan.walkDir, dt);
      st.timer -= dt;
      if (st.timer <= 0) {
        st.stage = 'aim';
      }
    } else if (st.stage === 'aim') {
      worm.facing = plan.facing;
      const diff = plan.aimAngle - worm.aimAngle;
      if (Math.abs(diff) < 0.04) {
        worm.aimAngle = plan.aimAngle;
        st.stage = 'charge';
        st.timer = 0.4;
      } else {
        worm.aimAngle += Math.sign(diff) * Math.min(Math.abs(diff), dt * 2.5);
      }
    } else if (st.stage === 'charge') {
      const weapon = WEAPON_MAP[this.selectedWeaponId];
      if (!weapon.chargeable) {
        st.timer -= dt;
        if (st.timer <= 0) {
          this.fireActiveWeapon(1.0, plan.targetPos);
          // If multi-shot weapon (e.g. shotgun) still has shots left, pause then fire remaining shot
          if (this.phase === PHASE.PLAYER_TURN && this.shotsRemainingThisTurn > 0) {
            st.stage = 'followup';
            st.timer = 0.55;
          } else {
            this.aiState = null;
          }
        }
      } else {
        if (!this.charging) {
          this.startCharge();
        } else if (this.chargePower >= plan.power) {
          this.releaseCharge();
          this.aiState = null;
        }
      }
    } else if (st.stage === 'followup') {
      st.timer -= dt;
      if (st.timer <= 0) {
        this.fireActiveWeapon(1.0, plan.targetPos);
        if (this.phase !== PHASE.PLAYER_TURN || this.shotsRemainingThisTurn <= 0) {
          this.aiState = null;
        } else {
          st.timer = 0.55;
        }
      }
    }
  }

  _allSettled() {
    if (this.projectiles.length > 0) return false;
    for (const w of this.worms) {
      if (!w.alive) continue;
      if (!w.grounded) return false;
      if (w.vx * w.vx + w.vy * w.vy > PHYSICS.SETTLE_SPEED_SQ) return false;
    }
    return true;
  }

  _checkGameOver() {
    const redAlive = this.worms.some((w) => w.teamId === 0 && w.alive);
    const blueAlive = this.worms.some((w) => w.teamId === 1 && w.alive);

    if (!redAlive && !blueAlive) {
      this.winnerTeamId = -1;
      this.phase = PHASE.GAME_OVER;
      this._showBanner('平局！双方同归于尽', 99);
      return true;
    }
    if (!redAlive) {
      this.winnerTeamId = 1;
      this.phase = PHASE.GAME_OVER;
      this.sound.playVictory();
      this._showBanner(`${TEAMS[1].name} 获胜！`, 99);
      return true;
    }
    if (!blueAlive) {
      this.winnerTeamId = 0;
      this.phase = PHASE.GAME_OVER;
      this.sound.playVictory();
      this._showBanner(`${TEAMS[0].name} 获胜！`, 99);
      return true;
    }
    return false;
  }

  _advanceTurn() {
    if (this._checkGameOver()) return;

    this.turnNumber += 1;
    this.wind = this._rollWind();
    this._maybeSpawnCrate();

    if (this.turnNumber >= WORLD.SUDDEN_DEATH_TURN) {
      this.waterLevel = Math.max(360, this.waterLevel - WORLD.SUDDEN_DEATH_WATER_RISE);
      this._showBanner(`骤死模式！水位上升 · 回合 ${this.turnNumber}`, 2.4);
    }

    const nextTeam = 1 - this.activeTeamId;
    this._selectNextWormForTeam(nextTeam);
    this.phase = PHASE.PLAYER_TURN;
    this.sound.playTurnChime();

    if (this.turnNumber < WORLD.SUDDEN_DEATH_TURN) {
      const label = this.mode === 'ai' && nextTeam === 1 ? 'AI 行动' : `${TEAMS[nextTeam].shortName}行动`;
      this._showBanner(`回合 ${this.turnNumber} · ${label}`, 1.8);
    }
  }

  // Fixed-timestep simulation update
  step(dt = WORLD.FIXED_DT) {
    if (this.paused) return;

    if (this.bannerTimer > 0) this.bannerTimer = Math.max(0, this.bannerTimer - dt);
    if (this.shakeTime > 0) this.shakeTime = Math.max(0, this.shakeTime - dt);

    // Step worms physics
    for (const w of this.worms) {
      if (!w.alive) continue;
      stepWormPhysics(w, this.terrain, this.waterLevel, dt, (ev) => {
        if (ev.type === 'fall_damage') {
          this._addFloatingText(ev.worm.x, ev.worm.y - 20, `-${ev.damage} 摔伤`, '#ffa940');
        } else if (ev.type === 'worm_drowned') {
          this.sound.playSplash();
          this._addFloatingText(ev.worm.x, this.waterLevel - 24, '落水!', '#69c0ff');
          for (let i = 0; i < 14; i++) {
            this.particles.push({
              x: ev.worm.x,
              y: this.waterLevel,
              vx: (Math.random() - 0.5) * 140,
              vy: -80 - Math.random() * 140,
              size: 3 + Math.random() * 3,
              color: this.terrain.theme.waterFoam,
              life: 0.65,
              maxLife: 0.65,
              gravity: 340,
            });
          }
        }
      });
    }

    // Step projectiles
    const newlySpawned = [];
    for (const p of this.projectiles) {
      if (!p.active) continue;
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 18) p.trail.shift();

      const res = stepProjectilePhysics(p, this.terrain, this.worms, this.wind, this.waterLevel, dt);
      if (res) {
        if (res.reason === 'bounce') {
          this.sound.playBounce();
        } else if (res.reason === 'water') {
          this.sound.playSplash();
        } else if (res.reason === 'hit_terrain' || res.reason === 'hit_worm' || res.reason === 'fuse') {
          this._detonate(res.x, res.y, p.blastRadius, p.maxDamage, p.knockback, true);
          if (p.type === 'cluster') {
            newlySpawned.push(...spawnClusterBomblets(p));
          }
        }
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.active);
    if (newlySpawned.length > 0) {
      this.projectiles.push(...newlySpawned);
    }

    // Step crates & visual FX
    this._stepCrates(dt);

    for (const pt of this.particles) {
      pt.vy += pt.gravity * dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
    }
    this.particles = this.particles.filter((pt) => pt.life > 0);

    for (const ex of this.explosions) ex.age += dt;
    this.explosions = this.explosions.filter((ex) => ex.age < ex.duration);

    for (const ft of this.floatingTexts) {
      ft.age += dt;
      ft.y -= 26 * dt;
    }
    this.floatingTexts = this.floatingTexts.filter((ft) => ft.age < ft.duration);

    for (const b of this.hitscanBeams) b.life -= dt;
    this.hitscanBeams = this.hitscanBeams.filter((b) => b.life > 0);

    // State machine transitions
    if (this.phase === PHASE.PLAYER_TURN) {
      const activeWorm = this.getActiveWorm();
      if (!activeWorm) {
        this._enterResolving();
      } else {
        this.turnTimer -= dt;
        if (this.charging) {
          this.chargeTime += dt;
          this.chargePower = clamp(
            TURN.MIN_POWER + (this.chargeTime / TURN.MAX_CHARGE_TIME) * (1 - TURN.MIN_POWER),
            TURN.MIN_POWER,
            1.0
          );
          if (this.chargePower >= 1.0) {
            this.releaseCharge();
          }
        }

        // Keep stepping AI even while charging so AI releases at its calculated target power
        if (this.phase === PHASE.PLAYER_TURN && this.isAiTurn()) {
          this._stepAi(dt);
        }

        if (this.turnTimer <= 0 && this.phase === PHASE.PLAYER_TURN) {
          this._enterResolving();
        }
      }
    } else if (this.phase === PHASE.RETREAT) {
      this.retreatTimer -= dt;
      if (this.retreatTimer <= 0 || !this.getActiveWorm()) {
        this._enterResolving();
      }
    } else if (this.phase === PHASE.RESOLVING) {
      this.resolvingTimer += dt;
      const timedOutSafely = this.projectiles.length === 0 && this.resolvingTimer >= MAX_RESOLVE_TIMEOUT;
      if (this._allSettled() || timedOutSafely) {
        if (timedOutSafely) {
          for (const w of this.worms) {
            if (w.alive && Math.hypot(w.vx, w.vy) < 40) {
              w.vx = 0;
              w.vy = 0;
              w.grounded = true;
            }
          }
        }
        if (!this._checkGameOver()) {
          this.phase = PHASE.TURN_TRANSITION;
          this.transitionTimer = TURN.TRANSITION_DELAY;
        }
      }
    } else if (this.phase === PHASE.TURN_TRANSITION) {
      this.transitionTimer -= dt;
      if (this.transitionTimer <= 0) {
        this._advanceTurn();
      }
    }

    // Update camera tracking
    this._updateCamera(dt);
  }

  _updateCamera(dt) {
    if (this.camera.manual) {
      this.camera.manualTimer -= dt;
      if (this.camera.manualTimer <= 0) {
        this.camera.manual = false;
      }
    } else if (this.projectiles.length > 0) {
      const p = this.projectiles[0];
      this.camera.targetX = p.x;
      this.camera.targetY = p.y;
    } else {
      const active = this.getActiveWorm();
      if (active) {
        this.camera.targetX = active.x;
        this.camera.targetY = active.y;
      }
    }

    const lerp = 1 - Math.exp(-6.5 * dt);
    this.camera.x += (this.camera.targetX - this.camera.x) * lerp;
    this.camera.y += (this.camera.targetY - this.camera.y) * lerp;
  }

  panCamera(dx, dy) {
    this.camera.manual = true;
    this.camera.manualTimer = 4.0;
    this.camera.targetX = clamp(this.camera.targetX + dx, 0, WORLD.WIDTH);
    this.camera.targetY = clamp(this.camera.targetY + dy, 0, WORLD.HEIGHT);
  }
}
