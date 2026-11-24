import { MATCH_CONFIG, PHASES, SPAWN_POINTS, TEAMS } from './constants.js';
import { TacticalMap } from './map.js';
import { Combatant } from './entities.js';
import { BombSystem } from './bomb.js';
import { EconomySystem } from './economy.js';
import { BotController } from './bot_ai.js';
import { calculateDamage, checkHitscanAgainstEntity, computeShotSpread } from './weapons.js';

const CT_NAMES = ['Alpha-1', 'Viper', 'Kestrel', 'Frost'];
const T_NAMES = ['Shadow', 'Cobra', 'Jackal', 'Reaper'];

export class GameState {
  constructor({ playerTeam = TEAMS.CT, difficulty = 'normal', onEvent = null } = {}) {
    this.map = new TacticalMap();
    this.bomb = new BombSystem();
    this.economy = new EconomySystem();
    this.onEvent = onEvent || (() => {});

    this.playerTeam = playerTeam;
    this.difficulty = difficulty;
    this.phase = PHASES.MENU;
    this.roundNumber = 0;
    this.phaseTimer = 0;
    this.scores = { CT: 0, T: 0 };
    this.lastRoundWinner = null;
    this.lastRoundReason = '';
    this.matchWinner = null;

    this.combatants = [];
    this.botControllers = [];
    this.player = null;
    this.killFeed = [];
    this.tracers = [];
    this.hitmarker = { timer: 0, headshot: false };
    this.announcement = { text: '', subtext: '', timer: 0 };

    this.initMatch(playerTeam, difficulty);
  }

  emit(type, payload = {}) {
    this.onEvent(type, payload);
  }

  initMatch(playerTeam = this.playerTeam, difficulty = this.difficulty) {
    this.playerTeam = playerTeam;
    this.difficulty = difficulty;
    this.scores = { CT: 0, T: 0 };
    this.roundNumber = 0;
    this.matchWinner = null;
    this.killFeed = [];
    this.tracers = [];
    this.economy.reset();

    this.combatants = [];
    this.botControllers = [];

    for (let i = 0; i < MATCH_CONFIG.TEAM_SIZE; i++) {
      const isPlayerCT = playerTeam === TEAMS.CT && i === 0;
      const ct = new Combatant({
        id: `ct_${i}`,
        name: isPlayerCT ? 'YOU (CT)' : CT_NAMES[i],
        team: TEAMS.CT,
        isBot: !isPlayerCT,
        spawn: SPAWN_POINTS.CT[i],
      });
      this.combatants.push(ct);
      if (isPlayerCT) this.player = ct;
      else this.botControllers.push(new BotController(ct, difficulty));

      const isPlayerT = playerTeam === TEAMS.T && i === 0;
      const t = new Combatant({
        id: `t_${i}`,
        name: isPlayerT ? 'YOU (T)' : T_NAMES[i],
        team: TEAMS.T,
        isBot: !isPlayerT,
        spawn: SPAWN_POINTS.T[i],
      });
      this.combatants.push(t);
      if (isPlayerT) this.player = t;
      else this.botControllers.push(new BotController(t, difficulty));
    }

    this.phase = PHASES.MENU;
  }

  startMatch(playerTeam = this.playerTeam, difficulty = this.difficulty) {
    this.initMatch(playerTeam, difficulty);
    this.startNewRound();
  }

  startNewRound() {
    this.roundNumber += 1;
    this.bomb.reset();
    this.tracers = [];
    this.phase = PHASES.BUY;
    this.phaseTimer = MATCH_CONFIG.BUY_TIME_SEC;

    let ctIdx = 0;
    let tIdx = 0;
    const tPlayers = [];
    for (const c of this.combatants) {
      const spawn = c.team === TEAMS.CT ? SPAWN_POINTS.CT[ctIdx++] : SPAWN_POINTS.T[tIdx++];
      const keepGear = this.roundNumber > 1 && c.alive;
      c.hasBomb = false;
      c.resetForRound(spawn, keepGear);
      if (c.team === TEAMS.T) tPlayers.push(c);
    }

    // Assign C4 to player if T, else first T bot
    const carrier = (this.player && this.player.team === TEAMS.T) ? this.player : tPlayers[0];
    if (carrier) carrier.hasBomb = true;

    for (const ctrl of this.botControllers) {
      ctrl.resetForRound();
      this.economy.autoBuyForBot(ctrl.bot);
    }

    this.showAnnouncement(`ROUND ${this.roundNumber}`, 'BUY PHASE — PRESS [B] TO OPEN BUY MENU', 3.0);
    this.emit('round_start', { round: this.roundNumber });
  }

  skipBuyPhase() {
    if (this.phase === PHASES.BUY) {
      this.phase = PHASES.LIVE;
      this.phaseTimer = MATCH_CONFIG.ROUND_TIME_SEC;
      this.showAnnouncement('LIVE!', 'ELIMINATE ENEMIES OR COMPLETE OBJECTIVE', 2.0);
    }
  }

  showAnnouncement(text, subtext = '', duration = 2.8) {
    this.announcement = { text, subtext, timer: duration };
  }

  canBuy(combatant) {
    const inPhase = this.phase === PHASES.BUY || (this.phase === PHASES.LIVE && this.phaseTimer > MATCH_CONFIG.ROUND_TIME_SEC - 10);
    const inZone = this.map.isInBuyZone(combatant.team, combatant.x, combatant.y);
    return { inPhase, inZone, allowed: combatant.alive && inPhase && inZone };
  }

  buyForPlayer(itemId) {
    const check = this.canBuy(this.player);
    const res = this.economy.buyItem(this.player, itemId, check.inPhase, check.inZone);
    if (res.ok) {
      this.emit('buy_success', { item: res.item });
    }
    return res;
  }

  fireWeapon(shooter, aimAngle = shooter.angle, aimPitch = shooter.pitch) {
    if (!shooter.alive) return { fired: false, reason: 'DEAD' };
    if (this.phase === PHASES.BUY || this.phase === PHASES.MENU || this.phase === PHASES.MATCH_OVER) {
      return { fired: false, reason: 'FROZEN' };
    }
    const w = shooter.getActiveWeapon();
    const spec = shooter.getActiveWeaponSpec();
    if (!w || !spec) return { fired: false, reason: 'NO_WEAPON' };
    if (w.reloading || w.fireCooldown > 0) return { fired: false, reason: 'COOLDOWN' };

    if (spec.magSize > 0) {
      if (w.ammo <= 0) {
        shooter.startReload();
        return { fired: false, reason: 'EMPTY' };
      }
      w.ammo -= 1;
    }

    w.fireCooldown = 60 / spec.rpm;
    shooter.muzzleFlashTimer = spec.category === 'melee' ? 0.08 : 0.06;

    const isMoving = Math.hypot(shooter.vx, shooter.vy) > 0.35;
    const spread = computeShotSpread(spec, isMoving, shooter.crouching, shooter.scoped, shooter.recoil);
    const shotAngle = aimAngle + (Math.random() - 0.5) * spread * 2;
    const shotPitch = aimPitch + (Math.random() - 0.5) * spread * 1.4;

    shooter.recoil = Math.min(1.0, shooter.recoil + spec.recoilPitch * 2.4);
    if (shooter === this.player && spec.category !== 'melee') {
      shooter.pitch = Math.min(0.45, shooter.pitch + spec.recoilPitch * 0.45);
    }

    // Wall hit distance via DDA
    const wallRay = this.map.castRay(shooter.x, shooter.y, shotAngle, spec.range);
    const maxDist = Math.min(spec.range, wallRay.distance);

    // Check closest enemy hitscan
    let bestHit = null;
    for (const target of this.combatants) {
      if (target.id === shooter.id || !target.alive || target.team === shooter.team) continue;
      const hit = checkHitscanAgainstEntity(shooter, shotAngle, shotPitch, maxDist, target);
      if (hit && (!bestHit || hit.distance < bestHit.distance)) {
        bestHit = hit;
      }
    }

    const endX = bestHit ? bestHit.target.x : wallRay.hitX;
    const endY = bestHit ? bestHit.target.y : wallRay.hitY;
    if (spec.category !== 'melee') {
      this.tracers.push({ x1: shooter.x, y1: shooter.y, x2: endX, y2: endY, timer: 0.09, team: shooter.team });
    }

    this.emit('weapon_fire', { shooterId: shooter.id, weaponId: spec.id, isPlayer: shooter === this.player });

    let result = { fired: true, hit: false, killed: false, headshot: false, damage: 0 };
    if (bestHit) {
      const dmg = calculateDamage(spec, bestHit.hitZone, bestHit.target.armor, bestHit.target.hasHelmet, bestHit.distance);
      const killed = bestHit.target.applyDamage(dmg.hpDamage, dmg.armorDamage);
      result = {
        fired: true,
        hit: true,
        killed,
        headshot: dmg.isHeadshot,
        damage: dmg.hpDamage,
        targetId: bestHit.target.id,
      };

      if (shooter === this.player) {
        this.hitmarker = { timer: 0.22, headshot: dmg.isHeadshot };
        this.emit('hit_confirm', { headshot: dmg.isHeadshot, killed });
      }
      if (bestHit.target === this.player) {
        this.emit('player_hurt', { damage: dmg.hpDamage });
      }

      if (killed) {
        shooter.kills += 1;
        shooter.score += dmg.isHeadshot ? 3 : 2;
        this.economy.awardKill(shooter, spec.id);
        this.killFeed.unshift({
          killer: shooter.name,
          killerTeam: shooter.team,
          victim: bestHit.target.name,
          victimTeam: bestHit.target.team,
          weapon: spec.name,
          headshot: dmg.isHeadshot,
          timer: 6.0,
        });
        if (this.killFeed.length > 5) this.killFeed.pop();

        // Cancel bomb action if victim was planting or defusing
        this.bomb.cancelPlant(bestHit.target.id);
        this.bomb.cancelDefuse(bestHit.target.id);

        // Transfer C4 to another alive T if carrier died
        if (bestHit.target.hasBomb) {
          bestHit.target.hasBomb = false;
          const aliveT = this.combatants.find((c) => c.team === TEAMS.T && c.alive);
          if (aliveT) aliveT.hasBomb = true;
        }
      }
    }

    // Unscope AWP after firing
    if (spec.id === 'awp') {
      shooter.scoped = false;
    }

    return result;
  }

  handlePlantAction(combatant, dt) {
    if (this.phase !== PHASES.LIVE) return { completed: false };
    const res = this.bomb.startOrContinuePlant(combatant, this.map, dt);
    if (res.completed) {
      this.phase = PHASES.BOMB_PLANTED;
      this.phaseTimer = MATCH_CONFIG.BOMB_TIMER_SEC;
      combatant.score += 2;
      this.economy.addMoney(combatant, 300);
      this.showAnnouncement(`BOMB PLANTED AT SITE ${res.site}!`, '40 SECONDS TO DETONATION', 3.2);
      this.emit('bomb_planted', { site: res.site });
    }
    return res;
  }

  handleDefuseAction(combatant, dt) {
    if (this.phase !== PHASES.BOMB_PLANTED) return { completed: false };
    const res = this.bomb.startOrContinueDefuse(combatant, dt);
    if (res.completed) {
      combatant.score += 3;
      this.economy.addMoney(combatant, 300);
      this.endRound(TEAMS.CT, 'BOMB_DEFUSED');
      this.emit('bomb_defused', { defuser: combatant.name });
    }
    return res;
  }

  endRound(winnerTeam, reason) {
    if (this.phase === PHASES.ROUND_END || this.phase === PHASES.MATCH_OVER) return;
    this.scores[winnerTeam] += 1;
    this.lastRoundWinner = winnerTeam;
    this.lastRoundReason = reason;
    this.economy.awardRoundEnd(this.combatants, winnerTeam, reason);

    const reasonText = {
      ELIMINATION: 'ALL ENEMIES ELIMINATED',
      BOMB_EXPLODED: 'TARGET DESTROYED',
      BOMB_DEFUSED: 'BOMB HAS BEEN DEFUSED',
      TIME_EXPIRED: 'ROUND TIME EXPIRED',
    }[reason] || reason;

    if (this.scores[winnerTeam] >= MATCH_CONFIG.WIN_SCORE) {
      this.phase = PHASES.MATCH_OVER;
      this.matchWinner = winnerTeam;
      this.phaseTimer = 0;
      this.showAnnouncement(`${winnerTeam} WINS THE MATCH!`, `${this.scores.CT} : ${this.scores.T} — ${reasonText}`, 99);
      this.emit('match_over', { winner: winnerTeam });
    } else {
      this.phase = PHASES.ROUND_END;
      this.phaseTimer = MATCH_CONFIG.ROUND_END_DELAY_SEC;
      this.showAnnouncement(`${winnerTeam} WINS THE ROUND`, reasonText, 4.0);
      this.emit('round_end', { winner: winnerTeam, reason });
    }
  }

  getAliveCounts() {
    let ct = 0;
    let t = 0;
    for (const c of this.combatants) {
      if (!c.alive) continue;
      if (c.team === TEAMS.CT) ct++;
      else t++;
    }
    return { CT: ct, T: t };
  }

  update(dt) {
    if (this.phase === PHASES.MENU || this.phase === PHASES.MATCH_OVER) return;

    // Update announcements, killfeed, tracers, hitmarker
    if (this.announcement.timer > 0) this.announcement.timer = Math.max(0, this.announcement.timer - dt);
    if (this.hitmarker.timer > 0) this.hitmarker.timer = Math.max(0, this.hitmarker.timer - dt);
    this.killFeed = this.killFeed.filter((k) => {
      k.timer -= dt;
      return k.timer > 0;
    });
    this.tracers = this.tracers.filter((tr) => {
      tr.timer -= dt;
      return tr.timer > 0;
    });

    for (const c of this.combatants) {
      c.updateTimers(dt);
    }

    if (this.phase === PHASES.BUY) {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        this.skipBuyPhase();
      }
      return;
    }

    if (this.phase === PHASES.ROUND_END) {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        this.startNewRound();
      }
      return;
    }

    // LIVE or BOMB_PLANTED
    for (const ctrl of this.botControllers) {
      ctrl.update(dt, this);
    }

    if (this.phase === PHASES.BOMB_PLANTED) {
      const bRes = this.bomb.update(dt);
      this.phaseTimer = this.bomb.timer;
      if (bRes.beeped) this.emit('bomb_beep', { timer: this.bomb.timer });
      if (bRes.exploded) {
        this.emit('bomb_exploded', {});
        // Damage nearby combatants
        for (const c of this.combatants) {
          if (c.alive && Math.hypot(c.x - this.bomb.x, c.y - this.bomb.y) < 7.5) {
            c.applyDamage(120, 100);
          }
        }
        this.endRound(TEAMS.T, 'BOMB_EXPLODED');
        return;
      }
    } else if (this.phase === PHASES.LIVE) {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0) {
        this.endRound(TEAMS.CT, 'TIME_EXPIRED');
        return;
      }
    }

    // Check elimination win conditions
    const alive = this.getAliveCounts();
    if (alive.CT === 0) {
      this.endRound(TEAMS.T, 'ELIMINATION');
    } else if (alive.T === 0 && this.phase !== PHASES.BOMB_PLANTED) {
      this.endRound(TEAMS.CT, 'ELIMINATION');
    }
  }
}
