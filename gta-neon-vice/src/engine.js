(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./config'),
      require('./world'),
      require('./physics'),
      require('./ai'),
      require('./missions')
    );
  } else {
    root.GTAEngine = factory(
      root.GTAConfig,
      root.GTAWorld,
      root.GTAPhysics,
      root.GTAAI,
      root.GTAMissions
    );
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Config, WorldMod, Physics, AI, MissionsMod) {
  'use strict';

  class GameEngine {
    constructor(options = {}) {
      this.seed = options.seed || 2026;
      this.rng = WorldMod.mulberry32(this.seed + 77);
      this.world = new WorldMod.CityWorld(this.seed);
      this.missions = new MissionsMod.MissionManager(this.world);
      this.onSound = options.onSound || null;

      this.time = 0;
      this.paused = false;
      this.nextEntityId = 1;

      this.vehicles = [];
      this.pedestrians = [];
      this.projectiles = [];
      this.particles = [];
      this.skidMarks = [];
      this.floatingTexts = [];

      this.wantedHeat = 0;   // 0..500 => 0..5 stars
      this.wantedStars = 0;
      this.timeSinceCrime = 999;
      this.bustedTimer = 0;

      this.radioIndex = 0;
      this.banner = null;
      this.toasts = [];
      this.dangerPos = null;
      this.dangerTimer = 0;

      this.stats = {
        missionsCompleted: 0,
        carsHijacked: 0,
        vehiclesDestroyed: 0,
        distanceDriven: 0,
        maxWantedReached: 0
      };

      this._initPlayer();
      this._spawnInitialEntities();
    }

    _initPlayer() {
      const spawn = this.world.getSafeSpawnPoint();
      this.player = {
        x: spawn.x,
        y: spawn.y,
        vx: 0,
        vy: 0,
        angle: 0,
        hp: 100,
        maxHp: 100,
        armor: 50,
        maxArmor: 100,
        cash: 500,
        weaponIndex: 1, // Pistol by default
        ammo: { fist: Infinity, pistol: 48, smg: 90, shotgun: 18 },
        fireCooldown: 0,
        vehicle: null,
        state: 'alive', // 'alive' | 'wasted' | 'busted'
        respawnTimer: 0
      };
    }

    _spawnInitialEntities() {
      // Spawn a starter sports car right next to player
      const spawn = this.world.getSafeSpawnPoint();
      const starter1 = this.spawnVehicle('sports', spawn.x + 52, spawn.y - 18, 0, '#ff2e63');
      starter1.driver = null;
      const starter2 = this.spawnVehicle('muscle', spawn.x - 68, spawn.y + 44, Math.PI / 2, '#00f0ff');
      starter2.driver = null;

      // Spawn ambient traffic vehicles
      const types = ['sports', 'muscle', 'taxi', 'van'];
      for (let i = 0; i < 16; i++) {
        const pt = this.world.getRandomRoadPoint();
        const type = types[Math.floor(this.rng() * types.length)];
        this.spawnVehicle(type, pt.x, pt.y, pt.angle);
      }

      // Spawn pedestrians on sidewalks
      const shirtColors = ['#ff5e7e', '#4cc9f0', '#f7b801', '#72efdd', '#c77dff', '#ffffff', '#ff9f1c'];
      for (let i = 0; i < 28; i++) {
        const pt = this.world.getRandomSidewalkPoint();
        this.pedestrians.push({
          id: this.nextEntityId++,
          x: pt.x,
          y: pt.y,
          vx: 0,
          vy: 0,
          angle: this.rng() * Math.PI * 2,
          hp: 40,
          alive: true,
          panicTimer: 0,
          changeDirTimer: 1 + this.rng() * 3,
          color: shirtColors[i % shirtColors.length]
        });
      }
    }

    spawnVehicle(typeId, x, y, angle = 0, customColor = null) {
      const spec = Config.VEHICLE_TYPES[typeId] || Config.VEHICLE_TYPES.taxi;
      const color = customColor || spec.colors[Math.floor(this.rng() * spec.colors.length)];
      const car = {
        id: this.nextEntityId++,
        type: spec.id,
        spec,
        x,
        y,
        vx: 0,
        vy: 0,
        angle,
        speed: 0,
        forwardSpeed: 0,
        drifting: false,
        radius: Math.max(spec.width, spec.length) * 0.42,
        hp: spec.maxHp,
        maxHp: spec.maxHp,
        color,
        driver: typeId === 'police' ? 'police' : 'ai', // 'player' | 'ai' | 'police' | null
        siren: typeId === 'police',
        targetInter: null,
        prevInter: null,
        stuckTimer: 0,
        destroyed: false
      };
      this.vehicles.push(car);
      return car;
    }

    emitSound(name, payload) {
      if (this.onSound) {
        try { this.onSound(name, payload); } catch (_) {}
      }
    }

    pushBanner(title, subtitle, color = '#00f0ff') {
      this.banner = { title, subtitle, color, timer: 3.4 };
    }

    pushToast(text, color = '#ffffff') {
      this.toasts.push({ text, color, timer: 2.8 });
      if (this.toasts.length > 4) this.toasts.shift();
    }

    addFloatingText(x, y, text, color = '#39ff14') {
      this.floatingTexts.push({ x, y, text, color, timer: 1.2 });
    }

    getPlayerPosition() {
      if (this.player.vehicle) {
        return { x: this.player.vehicle.x, y: this.player.vehicle.y };
      }
      return { x: this.player.x, y: this.player.y };
    }

    getCurrentWeapon() {
      return Config.WEAPONS[this.player.weaponIndex] || Config.WEAPONS[0];
    }

    selectWeapon(index) {
      const clamped = ((index % Config.WEAPONS.length) + Config.WEAPONS.length) % Config.WEAPONS.length;
      this.player.weaponIndex = clamped;
      this.emitSound('click');
      return Config.WEAPONS[clamped];
    }

    cycleRadio() {
      this.radioIndex = (this.radioIndex + 1) % Config.RADIO_STATIONS.length;
      const station = Config.RADIO_STATIONS[this.radioIndex];
      this.pushToast(`电台切换：${station.name} (${station.genre})`, '#ff2e93');
      this.emitSound('radio', station);
      return station;
    }

    addWantedHeat(amount, silent = false) {
      const prevStars = this.wantedStars;
      this.wantedHeat = Physics.clamp(this.wantedHeat + amount, 0, Config.WANTED_MAX_STARS * 100);
      this.wantedStars = Math.min(Config.WANTED_MAX_STARS, Math.ceil(this.wantedHeat / 100));
      this.timeSinceCrime = 0;
      if (this.wantedStars > this.stats.maxWantedReached) {
        this.stats.maxWantedReached = this.wantedStars;
      }
      if (!silent && this.wantedStars > prevStars) {
        this.pushToast(`通缉等级提升至 ${this.wantedStars} 星！`, '#ff2e63');
        this.emitSound('siren');
      }
    }

    toggleVehicleEntry() {
      if (this.player.state !== 'alive') return false;

      if (this.player.vehicle) {
        // Exit vehicle to left side
        const car = this.player.vehicle;
        const sideAngle = car.angle - Math.PI / 2;
        const ex = car.x + Math.cos(sideAngle) * (car.radius + 16);
        const ey = car.y + Math.sin(sideAngle) * (car.radius + 16);
        this.player.x = Physics.clamp(ex, 24, this.world.size - 24);
        this.player.y = Physics.clamp(ey, 24, this.world.size - 24);
        this.player.angle = car.angle;
        car.driver = null;
        this.player.vehicle = null;
        this.emitSound('door');
        return true;
      }

      // Find nearest intact vehicle within radius
      let best = null;
      let bestDist = Config.ENTER_VEHICLE_RADIUS;
      for (let i = 0; i < this.vehicles.length; i++) {
        const v = this.vehicles[i];
        if (v.destroyed) continue;
        const d = Physics.dist(this.player.x, this.player.y, v.x, v.y);
        if (d < bestDist) {
          bestDist = d;
          best = v;
        }
      }

      if (!best) return false;

      const wasOccupied = best.driver === 'ai' || best.driver === 'police';
      const wasPolice = best.type === 'police';
      best.driver = 'player';
      this.player.vehicle = best;
      this.player.x = best.x;
      this.player.y = best.y;
      this.stats.carsHijacked += 1;

      if (wasPolice) {
        this.addWantedHeat(150);
      } else if (wasOccupied) {
        this.addWantedHeat(60);
      }
      this.pushToast(`已驾驶：${best.spec.name}`, '#00f0ff');
      this.emitSound('door');
      return true;
    }

    fireWeapon(aimAngle) {
      if (this.player.state !== 'alive') return false;
      if (this.player.fireCooldown > 0) return false;

      const weapon = this.getCurrentWeapon();
      const ammoCount = this.player.ammo[weapon.id];
      if (!weapon.melee && ammoCount < weapon.ammoCost) {
        this.pushToast(`${weapon.name} 弹药耗尽！`, '#ffaa00');
        this.player.fireCooldown = 0.25;
        return false;
      }

      const pos = this.getPlayerPosition();
      const angle = typeof aimAngle === 'number' ? aimAngle : this.player.angle;
      this.player.angle = angle;
      this.player.fireCooldown = weapon.fireRate;
      if (!weapon.melee) {
        this.player.ammo[weapon.id] -= weapon.ammoCost;
      }

      this.dangerPos = { x: pos.x, y: pos.y };
      this.dangerTimer = 2.0;

      if (weapon.melee) {
        // Melee arc hit check
        this.emitSound('melee');
        for (const ped of this.pedestrians) {
          if (!ped.alive) continue;
          const d = Physics.dist(pos.x, pos.y, ped.x, ped.y);
          if (d <= weapon.range + Config.NPC_RADIUS) {
            this._damagePedestrian(ped, weapon.damage);
          }
        }
        return true;
      }

      for (let i = 0; i < weapon.pellets; i++) {
        const spreadOffset = (this.rng() - 0.5) * weapon.spread;
        const shotAngle = angle + spreadOffset;
        const muzzleDist = this.player.vehicle ? 28 : 16;
        this.projectiles.push({
          id: this.nextEntityId++,
          x: pos.x + Math.cos(shotAngle) * muzzleDist,
          y: pos.y + Math.sin(shotAngle) * muzzleDist,
          vx: Math.cos(shotAngle) * weapon.speed,
          vy: Math.sin(shotAngle) * weapon.speed,
          damage: weapon.damage,
          life: weapon.range / weapon.speed,
          color: weapon.color,
          owner: 'player'
        });
      }

      // Muzzle flash particles
      this._spawnParticles(
        pos.x + Math.cos(angle) * 18,
        pos.y + Math.sin(angle) * 18,
        4,
        weapon.color,
        120,
        0.16
      );
      this.emitSound('shoot', weapon.id);
      this.addWantedHeat(18);
      return true;
    }

    _damagePedestrian(ped, damage) {
      if (!ped.alive) return;
      ped.hp -= damage;
      this._spawnParticles(ped.x, ped.y, 5, '#ff2e63', 90, 0.35);
      if (ped.hp <= 0) {
        ped.alive = false;
        const drop = 25 + Math.floor(this.rng() * 60);
        this.player.cash += drop;
        this.addFloatingText(ped.x, ped.y - 10, `+$${drop}`, '#39ff14');
        this.addWantedHeat(85);
      }
    }

    _explodeVehicle(car) {
      if (car.destroyed) return;
      car.destroyed = true;
      car.hp = 0;
      car.vx *= 0.2;
      car.vy *= 0.2;
      car.driver = null;
      this.stats.vehiclesDestroyed += 1;
      this._spawnParticles(car.x, car.y, 28, '#ff6b00', 260, 0.75);
      this._spawnParticles(car.x, car.y, 16, '#ffe600', 180, 0.5);
      this.emitSound('explosion');
      this.dangerPos = { x: car.x, y: car.y };
      this.dangerTimer = 3.0;
      this.addWantedHeat(120);

      // Splash damage
      if (this.player.vehicle === car) {
        this.player.vehicle = null;
        this.player.x = car.x;
        this.player.y = car.y;
        this.damagePlayer(85);
      } else {
        const pos = this.getPlayerPosition();
        const d = Physics.dist(pos.x, pos.y, car.x, car.y);
        if (d < 110) {
          this.damagePlayer((1 - d / 110) * 65);
        }
      }
    }

    damagePlayer(amount) {
      if (this.player.state !== 'alive') return;
      let remaining = amount;
      if (this.player.armor > 0) {
        const absorbed = Math.min(this.player.armor, remaining * 0.7);
        this.player.armor -= absorbed;
        remaining -= absorbed;
      }
      this.player.hp = Math.max(0, this.player.hp - remaining);
      if (this.player.hp <= 0) {
        this._triggerDownState('wasted');
      }
    }

    _triggerDownState(mode) {
      this.player.state = mode;
      this.player.respawnTimer = 3.2;
      if (this.player.vehicle) {
        this.player.vehicle.driver = null;
        this.player.vehicle = null;
      }
      const penalty = Math.min(this.player.cash, mode === 'wasted' ? 200 : 300);
      this.player.cash -= penalty;
      if (this.missions.active) {
        this.missions.failMission(this, mode === 'wasted' ? '角色阵亡' : '被警方逮捕');
      }
      this.pushBanner(
        mode === 'wasted' ? 'WASTED 阵亡' : 'BUSTED 被捕',
        mode === 'wasted' ? `医疗账单 -$${penalty}，正在送往中心医院` : `保释金 -$${penalty}，武器已重置`,
        '#ff2e63'
      );
      this.emitSound(mode);
    }

    respawnPlayer() {
      const spawn = this.world.getSafeSpawnPoint();
      this.player.x = spawn.x;
      this.player.y = spawn.y;
      this.player.vx = 0;
      this.player.vy = 0;
      this.player.hp = this.player.maxHp;
      this.player.armor = 50;
      this.player.state = 'alive';
      this.player.respawnTimer = 0;
      this.wantedHeat = 0;
      this.wantedStars = 0;
      this.bustedTimer = 0;
      // Clear pursuing police near spawn
      this.vehicles = this.vehicles.filter(v => v.type !== 'police');
      // Ensure a ride is available near hospital spawn
      const nearbyCar = this.vehicles.find(v => !v.destroyed && Physics.dist(v.x, v.y, spawn.x, spawn.y) < 180);
      if (!nearbyCar) {
        this.spawnVehicle('sports', spawn.x + 56, spawn.y - 16, 0, '#00f0ff');
      }
    }

    _spawnParticles(x, y, count, color, maxSpeed, life) {
      for (let i = 0; i < count; i++) {
        const a = this.rng() * Math.PI * 2;
        const sp = 20 + this.rng() * maxSpeed;
        this.particles.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life,
          maxLife: life,
          size: 2 + this.rng() * 4,
          color
        });
      }
      if (this.particles.length > 220) {
        this.particles.splice(0, this.particles.length - 220);
      }
    }

    _managePoliceSpawns() {
      const targetPoliceCount = this.wantedStars === 0 ? 0 : Math.min(5, this.wantedStars + 1);
      const activePolice = this.vehicles.filter(v => v.type === 'police' && !v.destroyed);
      if (activePolice.length < targetPoliceCount) {
        const pos = this.getPlayerPosition();
        // Pick an intersection 420..850px away from player
        const candidates = this.world.intersections.filter(inter => {
          const d = Physics.dist(inter.x, inter.y, pos.x, pos.y);
          return d >= 420 && d <= 900;
        });
        const chosen = candidates.length > 0
          ? candidates[Math.floor(this.rng() * candidates.length)]
          : this.world.intersections[0];
        this.spawnVehicle('police', chosen.x, chosen.y, Math.atan2(pos.y - chosen.y, pos.x - chosen.x));
      }
    }

    step(dt, input = {}) {
      if (this.paused) return;
      const safeDt = Math.min(0.05, Math.max(0.001, dt));
      this.time += safeDt;

      // Update UI timers
      if (this.banner) {
        this.banner.timer -= safeDt;
        if (this.banner.timer <= 0) this.banner = null;
      }
      for (let i = this.toasts.length - 1; i >= 0; i--) {
        this.toasts[i].timer -= safeDt;
        if (this.toasts[i].timer <= 0) this.toasts.splice(i, 1);
      }
      for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
        this.floatingTexts[i].y -= 28 * safeDt;
        this.floatingTexts[i].timer -= safeDt;
        if (this.floatingTexts[i].timer <= 0) this.floatingTexts.splice(i, 1);
      }
      if (this.dangerTimer > 0) {
        this.dangerTimer -= safeDt;
        if (this.dangerTimer <= 0) this.dangerPos = null;
      }

      // Handle WASTED / BUSTED respawn countdown
      if (this.player.state !== 'alive') {
        this.player.respawnTimer -= safeDt;
        if (this.player.respawnTimer <= 0) {
          this.respawnPlayer();
        }
        this._updateParticles(safeDt);
        return;
      }

      if (this.player.fireCooldown > 0) {
        this.player.fireCooldown = Math.max(0, this.player.fireCooldown - safeDt);
      }

      // 1. Update player (on foot vs in vehicle)
      if (!this.player.vehicle) {
        const mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        const my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
        const len = Math.hypot(mx, my);
        const speed = input.sprint ? Config.PLAYER_SPRINT_SPEED : Config.PLAYER_SPEED;
        if (len > 0) {
          this.player.vx = (mx / len) * speed;
          this.player.vy = (my / len) * speed;
          this.player.angle = Math.atan2(my, mx);
        } else {
          this.player.vx = 0;
          this.player.vy = 0;
        }
        this.player.x += this.player.vx * safeDt;
        this.player.y += this.player.vy * safeDt;
        Physics.resolveWorldCollisions(this.player, Config.PLAYER_RADIUS, this.world, 0.05);
      }

      // Handle firing
      if (input.fire) {
        this.fireWeapon(typeof input.aimAngle === 'number' ? input.aimAngle : this.player.angle);
      }

      // 2. Update vehicles
      const playerPos = this.getPlayerPosition();
      for (let i = 0; i < this.vehicles.length; i++) {
        const car = this.vehicles[i];
        if (car.destroyed) continue;

        let carInput = { throttle: 0, steer: 0, handbrake: true };
        if (car.driver === 'player') {
          const throttle = (input.up ? 1 : 0) - (input.down ? 1 : 0);
          const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
          carInput = { throttle, steer, handbrake: !!input.handbrake };
        } else if (car.driver === 'police') {
          carInput = AI.updatePoliceCarAI(car, playerPos, this.wantedStars, safeDt);
        } else if (car.driver === 'ai') {
          carInput = AI.updateTrafficCarAI(car, this.world, this.vehicles, safeDt, this.rng);
        }

        const prevX = car.x;
        const prevY = car.y;
        const col = Physics.stepVehiclePhysics(car, carInput, safeDt, this.world);
        if (car.driver === 'player') {
          this.player.x = car.x;
          this.player.y = car.y;
          this.player.angle = car.angle;
          this.stats.distanceDriven += Math.hypot(car.x - prevX, car.y - prevY);
          if (col.collided && col.impactSpeed > 180) {
            this.emitSound('crash');
          }
          if (car.drifting) {
            this.skidMarks.push({ x: car.x, y: car.y, angle: car.angle, alpha: 0.45 });
            if (this.skidMarks.length > 260) this.skidMarks.shift();
          }
        }
        if (car.hp <= 0) {
          this._explodeVehicle(car);
        }
      }

      // Vehicle-to-vehicle collisions
      for (let i = 0; i < this.vehicles.length; i++) {
        for (let j = i + 1; j < this.vehicles.length; j++) {
          const a = this.vehicles[i];
          const b = this.vehicles[j];
          const hit = Physics.resolveVehiclePair(a, b);
          if (hit.hit && hit.impactSpeed > 140) {
            if (a.driver === 'player' || b.driver === 'player') {
              this.emitSound('crash');
              if (a.type === 'police' || b.type === 'police') {
                this.addWantedHeat(55);
              }
            }
          }
        }
      }

      // 3. Update pedestrians & vehicle-pedestrian hits
      for (let i = 0; i < this.pedestrians.length; i++) {
        const ped = this.pedestrians[i];
        if (!ped.alive) continue;
        AI.updatePedestrianAI(ped, this.world, this.dangerPos, safeDt, this.rng);

        // Check if struck by fast player car
        if (this.player.vehicle && this.player.vehicle.speed > 120) {
          const d = Physics.dist(ped.x, ped.y, this.player.vehicle.x, this.player.vehicle.y);
          if (d < this.player.vehicle.radius + Config.NPC_RADIUS) {
            this._damagePedestrian(ped, 100);
          }
        }
      }

      // 4. Update projectiles
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const p = this.projectiles[i];
        p.x += p.vx * safeDt;
        p.y += p.vy * safeDt;
        p.life -= safeDt;

        let remove = p.life <= 0 || this.world.pointInBuilding(p.x, p.y, 0) !== null;

        if (!remove) {
          // Hit pedestrians
          for (const ped of this.pedestrians) {
            if (!ped.alive) continue;
            if (Physics.dist(p.x, p.y, ped.x, ped.y) <= Config.NPC_RADIUS + 4) {
              this._damagePedestrian(ped, p.damage);
              remove = true;
              break;
            }
          }
        }

        if (!remove) {
          // Hit vehicles (excluding player's own vehicle)
          for (const v of this.vehicles) {
            if (v.destroyed || v === this.player.vehicle) continue;
            if (Physics.dist(p.x, p.y, v.x, v.y) <= v.radius) {
              v.hp = Math.max(0, v.hp - p.damage);
              this._spawnParticles(p.x, p.y, 4, '#ffaa00', 100, 0.25);
              if (v.type === 'police') this.addWantedHeat(45);
              if (v.hp <= 0) this._explodeVehicle(v);
              remove = true;
              break;
            }
          }
        }

        if (remove) this.projectiles.splice(i, 1);
      }

      // 5. Pickups
      const curPos = this.getPlayerPosition();
      for (const pk of this.world.pickups) {
        if (!pk.active) {
          pk.respawnTimer -= safeDt;
          if (pk.respawnTimer <= 0) pk.active = true;
          continue;
        }
        if (Physics.dist(curPos.x, curPos.y, pk.x, pk.y) < 30) {
          pk.active = false;
          pk.respawnTimer = 35;
          if (pk.type === 'health') {
            this.player.hp = Math.min(this.player.maxHp, this.player.hp + 45);
            this.addFloatingText(pk.x, pk.y, '+45 生命', '#39ff14');
          } else if (pk.type === 'armor') {
            this.player.armor = Math.min(this.player.maxArmor, this.player.armor + 50);
            this.addFloatingText(pk.x, pk.y, '+50 护甲', '#00f0ff');
          } else if (pk.type === 'ammo') {
            this.player.ammo.pistol += 24;
            this.player.ammo.smg += 45;
            this.player.ammo.shotgun += 8;
            this.addFloatingText(pk.x, pk.y, '+弹药补给', '#ffe600');
          } else if (pk.type === 'cash') {
            this.player.cash += 300;
            this.addFloatingText(pk.x, pk.y, '+$300', '#39ff14');
          }
          this.emitSound('pickup');
        }
      }

      // 6. Wanted system decay & police arrest check
      this.timeSinceCrime += safeDt;
      if (this.wantedStars > 0) {
        this._managePoliceSpawns();

        let policeNearby = false;
        let policeArrestRange = false;
        for (const v of this.vehicles) {
          if (v.type === 'police' && !v.destroyed) {
            const d = Physics.dist(curPos.x, curPos.y, v.x, v.y);
            if (d < 460) policeNearby = true;
            if (d < 72 && (!this.player.vehicle || this.player.vehicle.speed < 55)) {
              policeArrestRange = true;
            }
          }
        }

        if (policeArrestRange) {
          this.bustedTimer += safeDt;
          if (this.bustedTimer >= 2.2) {
            this._triggerDownState('busted');
            return;
          }
        } else {
          this.bustedTimer = Math.max(0, this.bustedTimer - safeDt * 1.5);
        }

        if (!policeNearby && this.timeSinceCrime > Config.WANTED_DECAY_DELAY) {
          this.wantedHeat = Math.max(0, this.wantedHeat - Config.WANTED_DECAY_RATE * safeDt);
          this.wantedStars = this.wantedHeat <= 0 ? 0 : Math.ceil(this.wantedHeat / 100);
          if (this.wantedStars === 0) {
            this.pushToast('已成功甩掉警方通缉！', '#39ff14');
          }
        }
      }

      // 7. Missions & particles
      this.missions.update(safeDt, this);
      this._updateParticles(safeDt);
    }

    _updateParticles(dt) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const pt = this.particles[i];
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.vx *= Math.pow(0.15, dt);
        pt.vy *= Math.pow(0.15, dt);
        pt.life -= dt;
        if (pt.life <= 0) this.particles.splice(i, 1);
      }
    }
  }

  return { GameEngine };
});
