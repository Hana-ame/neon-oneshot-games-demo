/**
 * Web COD — Operation Ironline
 * Weapon loadout state, firing, recoil, reload, ADS, and ballistic damage calculation.
 */
(function (root) {
  'use strict';

  const Config =
    typeof module !== 'undefined' && module.exports
      ? require('./config')
      : root.WebCOD.Config;

  class WeaponSystem {
    constructor(weaponOrder = Config.WEAPON_ORDER) {
      this.order = weaponOrder.slice();
      this.slots = {};
      for (const id of this.order) {
        const spec = Config.WEAPONS[id];
        if (!spec) continue;
        this.slots[id] = {
          id,
          ammo: spec.magSize,
          reserve: spec.reserveAmmo
        };
      }
      this.currentId = this.order[0];
      this.lastShotTime = -99999;
      this.reloading = false;
      this.reloadEndTime = 0;
      this.recoilOffset = 0;
      this.muzzleFlashTimer = 0;
      this.adsProgress = 0;
      this.isAds = false;
    }

    getCurrentSpec() {
      return Config.WEAPONS[this.currentId];
    }

    getCurrentSlot() {
      return this.slots[this.currentId];
    }

    switchWeapon(weaponId) {
      if (!this.slots[weaponId] || weaponId === this.currentId) return false;
      this.currentId = weaponId;
      this.reloading = false;
      this.reloadEndTime = 0;
      this.recoilOffset = 0;
      this.isAds = false;
      this.adsProgress = 0;
      return true;
    }

    switchByIndex(index) {
      if (index < 0 || index >= this.order.length) return false;
      return this.switchWeapon(this.order[index]);
    }

    cycleWeapon(delta) {
      const idx = this.order.indexOf(this.currentId);
      const next = (idx + delta + this.order.length) % this.order.length;
      return this.switchWeapon(this.order[next]);
    }

    setAds(active) {
      this.isAds = Boolean(active) && !this.reloading;
    }

    startReload(nowMs) {
      const spec = this.getCurrentSpec();
      const slot = this.getCurrentSlot();
      if (this.reloading) return false;
      if (slot.ammo >= spec.magSize || slot.reserve <= 0) return false;
      this.reloading = true;
      this.isAds = false;
      this.reloadEndTime = nowMs + spec.reloadTimeMs;
      return true;
    }

    update(dtSec, nowMs) {
      let reloadCompleted = false;
      if (this.reloading && nowMs >= this.reloadEndTime) {
        const spec = this.getCurrentSpec();
        const slot = this.getCurrentSlot();
        const needed = spec.magSize - slot.ammo;
        const load = Math.min(needed, slot.reserve);
        slot.ammo += load;
        slot.reserve -= load;
        this.reloading = false;
        reloadCompleted = true;
      }

      // Smooth recoil recovery
      this.recoilOffset = Math.max(0, this.recoilOffset - dtSec * 0.24);
      this.muzzleFlashTimer = Math.max(0, this.muzzleFlashTimer - dtSec);

      // Smooth ADS blend
      const targetAds = this.isAds && !this.reloading ? 1 : 0;
      const blendRate = 8.5 * dtSec;
      if (this.adsProgress < targetAds) {
        this.adsProgress = Math.min(targetAds, this.adsProgress + blendRate);
      } else {
        this.adsProgress = Math.max(targetAds, this.adsProgress - blendRate);
      }

      return { reloadCompleted };
    }

    canFire(nowMs) {
      const spec = this.getCurrentSpec();
      const slot = this.getCurrentSlot();
      if (this.reloading) return false;
      if (slot.ammo <= 0) return false;
      return nowMs - this.lastShotTime >= spec.fireRateMs;
    }

    /**
     * Fires the active weapon if ready. Returns array of pellet angle offsets, or null.
     */
    fire(nowMs, rng = Math.random) {
      if (!this.canFire(nowMs)) return null;
      const spec = this.getCurrentSpec();
      const slot = this.getCurrentSlot();

      slot.ammo -= 1;
      this.lastShotTime = nowMs;
      this.recoilOffset = Math.min(0.18, this.recoilOffset + spec.recoilKick);
      this.muzzleFlashTimer = 0.065;

      const spread =
        spec.spreadHip * (1 - this.adsProgress) +
        spec.spreadAds * this.adsProgress +
        this.recoilOffset * 0.22;

      const pellets = [];
      for (let i = 0; i < spec.pellets; i++) {
        const angleOffset = (rng() - 0.5) * 2 * spread;
        const verticalOffset = (rng() - 0.5) * 2 * spread * 0.6;
        pellets.push({ angleOffset, verticalOffset });
      }

      return {
        weaponId: spec.id,
        pellets,
        ammoLeft: slot.ammo,
        autoReloadNeeded: slot.ammo === 0 && slot.reserve > 0
      };
    }

    /**
     * Computes distance-attenuated ballistic damage with optional headshot multiplier.
     */
    computeDamage(weaponId, distance, isHeadshot = false) {
      const spec = Config.WEAPONS[weaponId];
      if (!spec || distance > spec.range) return 0;

      let ratio = 1.0;
      if (distance > spec.falloffStart) {
        const span = Math.max(0.001, spec.range - spec.falloffStart);
        const t = Math.min(1, (distance - spec.falloffStart) / span);
        ratio = 1 - t * (1 - spec.minDamageRatio);
      }

      let dmg = spec.damage * ratio;
      if (isHeadshot) {
        dmg *= spec.headshotMultiplier;
      }
      return Math.round(dmg);
    }

    refillAmmo(ratio = 0.5) {
      for (const id of this.order) {
        const spec = Config.WEAPONS[id];
        const slot = this.slots[id];
        const add = Math.ceil(spec.reserveAmmo * ratio);
        slot.reserve = Math.min(spec.reserveAmmo, slot.reserve + add);
      }
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WeaponSystem };
  } else {
    root.WebCOD = root.WebCOD || {};
    root.WebCOD.WeaponSystem = WeaponSystem;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
