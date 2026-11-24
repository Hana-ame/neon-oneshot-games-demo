import { MATCH_CONFIG, PLAYER_CONFIG, TEAMS } from './constants.js';
import { createWeaponState, getWeaponSpec } from './weapons.js';

export class Combatant {
  constructor({ id, name, team, isBot = false, spawn }) {
    this.id = id;
    this.name = name;
    this.team = team;
    this.isBot = isBot;

    this.money = MATCH_CONFIG.START_MONEY;
    this.kills = 0;
    this.deaths = 0;
    this.assists = 0;
    this.score = 0;

    this.inventory = {
      1: null, // Primary
      2: createWeaponState(team === TEAMS.CT ? 'usp' : 'glock'),
      3: createWeaponState('knife'),
    };
    this.activeSlot = 2;
    this.hasHelmet = false;
    this.hasDefuseKit = false;
    this.hasBomb = false;

    this.resetForRound(spawn);
  }

  resetForRound(spawn, keepGear = false) {
    this.x = spawn.x;
    this.y = spawn.y;
    this.angle = spawn.angle;
    this.pitch = 0;
    this.vx = 0;
    this.vy = 0;
    this.hp = PLAYER_CONFIG.MAX_HP;
    this.alive = true;
    this.crouching = false;
    this.walking = false;
    this.scoped = false;
    this.recoil = 0;
    this.muzzleFlashTimer = 0;
    this.hurtFlashTimer = 0;
    this.bobPhase = 0;
    this.stepTimer = 0;

    if (!keepGear) {
      this.armor = 0;
      this.hasHelmet = false;
      this.hasDefuseKit = false;
      this.inventory[1] = null;
      this.inventory[2] = createWeaponState(this.team === TEAMS.CT ? 'usp' : 'glock');
    } else {
      // Refill magazines at round start if survived
      for (const slot of [1, 2]) {
        const w = this.inventory[slot];
        if (w) {
          const spec = getWeaponSpec(w.id);
          w.ammo = spec.magSize;
          w.reserve = spec.reserveMax;
          w.reloading = false;
          w.reloadTimer = 0;
          w.fireCooldown = 0;
        }
      }
    }
    this.activeSlot = this.inventory[1] ? 1 : 2;
  }

  getActiveWeapon() {
    return this.inventory[this.activeSlot] || this.inventory[2] || this.inventory[3];
  }

  getActiveWeaponSpec() {
    return getWeaponSpec(this.getActiveWeapon().id);
  }

  switchSlot(slot) {
    if (!this.alive) return false;
    if (this.inventory[slot]) {
      const cur = this.getActiveWeapon();
      if (cur) {
        cur.reloading = false;
        cur.reloadTimer = 0;
      }
      this.activeSlot = slot;
      this.scoped = false;
      return true;
    }
    return false;
  }

  giveWeapon(weaponId) {
    const spec = getWeaponSpec(weaponId);
    if (!spec) return false;
    this.inventory[spec.slot] = createWeaponState(weaponId);
    this.activeSlot = spec.slot;
    this.scoped = false;
    return true;
  }

  startReload() {
    const w = this.getActiveWeapon();
    const spec = getWeaponSpec(w.id);
    if (!w || spec.magSize === 0) return false;
    if (w.reloading || w.ammo >= spec.magSize || w.reserve <= 0) return false;
    w.reloading = true;
    w.reloadTimer = spec.reloadTime;
    this.scoped = false;
    return true;
  }

  updateTimers(dt) {
    if (this.muzzleFlashTimer > 0) this.muzzleFlashTimer = Math.max(0, this.muzzleFlashTimer - dt);
    if (this.hurtFlashTimer > 0) this.hurtFlashTimer = Math.max(0, this.hurtFlashTimer - dt);
    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt * 0.45);

    const w = this.getActiveWeapon();
    if (!w) return;
    if (w.fireCooldown > 0) w.fireCooldown = Math.max(0, w.fireCooldown - dt);
    if (w.reloading) {
      w.reloadTimer -= dt;
      if (w.reloadTimer <= 0) {
        const spec = getWeaponSpec(w.id);
        const needed = spec.magSize - w.ammo;
        const load = Math.min(needed, w.reserve);
        w.ammo += load;
        w.reserve -= load;
        w.reloading = false;
        w.reloadTimer = 0;
      }
    }
  }

  move(forwardInput, strafeInput, dt, map) {
    if (!this.alive) return false;
    const spec = this.getActiveWeaponSpec();
    let speed = PLAYER_CONFIG.BASE_SPEED * spec.speedMult;
    if (this.crouching) speed *= PLAYER_CONFIG.CROUCH_MULTIPLIER;
    else if (this.walking || this.scoped) speed *= PLAYER_CONFIG.WALK_MULTIPLIER;

    let moveX = Math.cos(this.angle) * forwardInput - Math.sin(this.angle) * strafeInput;
    let moveY = Math.sin(this.angle) * forwardInput + Math.cos(this.angle) * strafeInput;
    const mag = Math.hypot(moveX, moveY);
    if (mag > 0.001) {
      moveX = (moveX / mag) * speed;
      moveY = (moveY / mag) * speed;
    }

    this.vx = moveX;
    this.vy = moveY;
    const resolved = map.resolveMovement(this.x, this.y, moveX * dt, moveY * dt, PLAYER_CONFIG.RADIUS);
    const movedDist = Math.hypot(resolved.x - this.x, resolved.y - this.y);
    this.x = resolved.x;
    this.y = resolved.y;

    let stepped = false;
    if (movedDist > 0.002) {
      this.bobPhase += dt * (this.crouching ? 5 : 9.5);
      if (!this.walking && !this.crouching) {
        this.stepTimer -= dt;
        if (this.stepTimer <= 0) {
          this.stepTimer = 0.42;
          stepped = true;
        }
      }
    }
    return stepped;
  }

  applyDamage(hpDamage, armorDamage) {
    if (!this.alive) return false;
    this.hp = Math.max(0, this.hp - hpDamage);
    this.armor = Math.max(0, this.armor - armorDamage);
    this.hurtFlashTimer = 0.25;
    if (this.hp <= 0) {
      this.alive = false;
      this.scoped = false;
      this.deaths += 1;
      return true; // Killed
    }
    return false;
  }
}
