/**
 * Web COD — Operation Ironline
 * Player physics, movement, health regeneration, armor absorption, and killstreaks.
 */
(function (root) {
  'use strict';

  const Config =
    typeof module !== 'undefined' && module.exports
      ? require('./config')
      : root.WebCOD.Config;

  class Player {
    constructor(spawn) {
      const d = Config.PLAYER_DEFAULTS;
      this.x = spawn.x;
      this.y = spawn.y;
      this.angle = spawn.angle || 0;
      this.pitch = 0; // vertical look offset in pixels/ratio (-0.35 to 0.35)
      this.hp = d.maxHp;
      this.maxHp = d.maxHp;
      this.armor = d.maxArmor;
      this.maxArmor = d.maxArmor;
      this.radius = d.radius;
      this.alive = true;

      this.isSprinting = false;
      this.isCrouching = false;
      this.bobPhase = 0;
      this.moveIntensity = 0;

      this.lastDamageTime = -99999;
      this.damageFlash = 0;
      this.lastHitAngle = null; // world angle pointing toward attacker

      this.kills = 0;
      this.headshots = 0;
      this.score = 0;
      this.currentStreak = 0;
      this.bestStreak = 0;

      this.uavReady = false;
      this.uavActiveUntil = 0;
      this.airstrikeReady = false;
    }

    rotate(deltaAngle, deltaPitch = 0) {
      this.angle = (this.angle + deltaAngle + Math.PI * 2) % (Math.PI * 2);
      this.pitch = Math.max(-0.35, Math.min(0.35, this.pitch + deltaPitch));
    }

    move(input, dtSec, map, weaponSpeedFactor = 1.0, isAds = false) {
      if (!this.alive) return;
      const d = Config.PLAYER_DEFAULTS;

      this.isCrouching = Boolean(input.crouch);
      this.isSprinting =
        Boolean(input.sprint) && !this.isCrouching && !isAds && (input.forward || 0) > 0;

      let speed = d.baseSpeed * weaponSpeedFactor;
      if (this.isSprinting) speed *= d.sprintMultiplier;
      if (this.isCrouching) speed *= d.crouchMultiplier;
      if (isAds) speed *= d.adsSpeedMultiplier;

      const forward = (input.forward || 0);
      const strafe = (input.strafe || 0);
      const len = Math.hypot(forward, strafe);

      if (len > 0.001) {
        const nf = forward / len;
        const ns = strafe / len;
        const cos = Math.cos(this.angle);
        const sin = Math.sin(this.angle);

        const dx = (cos * nf - sin * ns) * speed * dtSec;
        const dy = (sin * nf + cos * ns) * speed * dtSec;

        const res = map.moveWithSlide(this.x, this.y, dx, dy, this.radius);
        const moved = Math.hypot(res.x - this.x, res.y - this.y);
        this.x = res.x;
        this.y = res.y;
        this.moveIntensity = Math.min(1, moved / Math.max(0.001, speed * dtSec));
        this.bobPhase += dtSec * (this.isSprinting ? 12.5 : 8.5) * this.moveIntensity;
      } else {
        this.moveIntensity = Math.max(0, this.moveIntensity - dtSec * 8);
      }
    }

    takeDamage(amount, nowMs, sourceX = null, sourceY = null) {
      if (!this.alive || amount <= 0) return 0;

      let remaining = amount;
      if (this.armor > 0) {
        const absorbed = Math.min(this.armor, Math.ceil(remaining * 0.55));
        this.armor -= absorbed;
        remaining -= absorbed;
      }

      this.hp = Math.max(0, this.hp - remaining);
      this.lastDamageTime = nowMs;
      this.damageFlash = 1.0;

      if (sourceX !== null && sourceY !== null) {
        this.lastHitAngle = Math.atan2(sourceY - this.y, sourceX - this.x);
      }

      if (this.hp <= 0) {
        this.alive = false;
        this.currentStreak = 0;
      }
      return amount;
    }

    heal(hpAmount = 35, armorAmount = 25) {
      if (!this.alive) return;
      this.hp = Math.min(this.maxHp, this.hp + hpAmount);
      this.armor = Math.min(this.maxArmor, this.armor + armorAmount);
    }

    registerKill(points, isHeadshot = false) {
      this.kills += 1;
      if (isHeadshot) this.headshots += 1;
      this.currentStreak += 1;
      if (this.currentStreak > this.bestStreak) {
        this.bestStreak = this.currentStreak;
      }
      const bonus = isHeadshot ? 50 : 0;
      this.score += points + bonus;

      const unlocked = [];
      if (
        this.currentStreak >= Config.KILLSTREAKS.uav.requiredKills &&
        this.currentStreak % Config.KILLSTREAKS.uav.requiredKills === 0 &&
        !this.uavReady
      ) {
        this.uavReady = true;
        unlocked.push('uav');
      }
      if (
        this.currentStreak >= Config.KILLSTREAKS.airstrike.requiredKills &&
        this.currentStreak % Config.KILLSTREAKS.airstrike.requiredKills === 0 &&
        !this.airstrikeReady
      ) {
        this.airstrikeReady = true;
        unlocked.push('airstrike');
      }
      return unlocked;
    }

    activateUav(nowMs) {
      if (!this.uavReady) return false;
      this.uavReady = false;
      this.uavActiveUntil = nowMs + Config.KILLSTREAKS.uav.durationMs;
      return true;
    }

    isUavActive(nowMs) {
      return nowMs < this.uavActiveUntil;
    }

    consumeAirstrike() {
      if (!this.airstrikeReady) return false;
      this.airstrikeReady = false;
      return true;
    }

    update(dtSec, nowMs) {
      const d = Config.PLAYER_DEFAULTS;
      this.damageFlash = Math.max(0, this.damageFlash - dtSec * 2.2);

      if (this.alive && this.hp < this.maxHp && nowMs - this.lastDamageTime >= d.regenDelayMs) {
        this.hp = Math.min(this.maxHp, this.hp + d.regenRatePerSec * dtSec);
      }
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Player };
  } else {
    root.WebCOD = root.WebCOD || {};
    root.WebCOD.Player = Player;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
