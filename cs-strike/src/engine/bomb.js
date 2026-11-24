import { MATCH_CONFIG } from './constants.js';

export class BombSystem {
  constructor() {
    this.reset();
  }

  reset() {
    this.state = 'CARRIED'; // CARRIED, DROPPED, PLANTING, PLANTED, DEFUSED, EXPLODED
    this.x = 0;
    this.y = 0;
    this.site = null;
    this.timer = MATCH_CONFIG.BOMB_TIMER_SEC;
    this.plantProgress = 0;
    this.defuseProgress = 0;
    this.planterId = null;
    this.defuserId = null;
    this.beepAccum = 0;
  }

  startOrContinuePlant(combatant, map, dt) {
    if (this.state !== 'CARRIED' && this.state !== 'PLANTING') return { completed: false };
    if (!combatant.alive || !combatant.hasBomb || combatant.team !== 'T') return { completed: false };
    const site = map.getBombsiteAt(combatant.x, combatant.y);
    if (!site) {
      this.cancelPlant(combatant.id);
      return { completed: false, reason: 'NOT_IN_SITE' };
    }
    this.state = 'PLANTING';
    this.planterId = combatant.id;
    this.plantProgress += dt;
    if (this.plantProgress >= MATCH_CONFIG.PLANT_TIME_SEC) {
      this.state = 'PLANTED';
      this.x = combatant.x;
      this.y = combatant.y;
      this.site = site;
      this.timer = MATCH_CONFIG.BOMB_TIMER_SEC;
      this.plantProgress = MATCH_CONFIG.PLANT_TIME_SEC;
      this.planterId = null;
      combatant.hasBomb = false;
      return { completed: true, site };
    }
    return { completed: false, progress: this.plantProgress / MATCH_CONFIG.PLANT_TIME_SEC };
  }

  cancelPlant(combatantId) {
    if (this.state === 'PLANTING' && (!combatantId || this.planterId === combatantId)) {
      this.state = 'CARRIED';
      this.plantProgress = 0;
      this.planterId = null;
    }
  }

  startOrContinueDefuse(combatant, dt) {
    if (this.state !== 'PLANTED') return { completed: false };
    if (!combatant.alive || combatant.team !== 'CT') return { completed: false };
    const dist = Math.hypot(combatant.x - this.x, combatant.y - this.y);
    if (dist > 1.6) {
      this.cancelDefuse(combatant.id);
      return { completed: false, reason: 'TOO_FAR' };
    }
    const reqTime = combatant.hasDefuseKit
      ? MATCH_CONFIG.DEFUSE_TIME_WITH_KIT_SEC
      : MATCH_CONFIG.DEFUSE_TIME_NO_KIT_SEC;
    this.defuserId = combatant.id;
    this.defuseProgress += dt;
    if (this.defuseProgress >= reqTime) {
      this.state = 'DEFUSED';
      this.defuserId = null;
      return { completed: true };
    }
    return { completed: false, progress: this.defuseProgress / reqTime };
  }

  cancelDefuse(combatantId) {
    if (this.defuserId && (!combatantId || this.defuserId === combatantId)) {
      this.defuseProgress = 0;
      this.defuserId = null;
    }
  }

  update(dt) {
    if (this.state !== 'PLANTED') return { exploded: false, beeped: false };
    this.timer -= dt;
    const beepInterval = Math.max(0.18, (this.timer / MATCH_CONFIG.BOMB_TIMER_SEC) * 1.15);
    this.beepAccum += dt;
    let beeped = false;
    if (this.beepAccum >= beepInterval) {
      this.beepAccum = 0;
      beeped = true;
    }
    if (this.timer <= 0) {
      this.timer = 0;
      this.state = 'EXPLODED';
      return { exploded: true, beeped: false };
    }
    return { exploded: false, beeped };
  }
}
