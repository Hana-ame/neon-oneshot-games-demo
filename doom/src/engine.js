import {
  PLAYER_DEFAULTS,
  WEAPONS,
  WEAPON_IDS,
  TILE,
  DOOR_TILES,
  FOV,
} from './constants.js';
import {
  clamp,
  normalizeAngle,
  angleDiff,
  distance,
  isTileBlockingMovement,
  castRay,
  hasLineOfSight,
} from './math.js';
import { LEVELS, parseMap } from './levels.js';
import { createEnemy, createPickup, createProjectile, buildDoorMap } from './entities.js';

export class DoomEngine {
  constructor(options = {}) {
    this.levels = options.levels || LEVELS;
    this.onEvent = typeof options.onEvent === 'function' ? options.onEvent : () => {};
    this.rng = typeof options.rng === 'function' ? options.rng : Math.random;
    this.state = 'title'; // title | playing | paused | level_complete | victory | gameover
    this.levelIndex = 0;
    this.time = 0;
    this.messages = [];
    this.damageFlash = 0;
    this.pickupFlash = 0;
    this.muzzleFlash = 0;
    this.score = 0;
    this.totalKills = 0;
    this.levelKills = 0;
    this.levelTotalEnemies = 0;
    this.levelItemsCollected = 0;
    this.levelTotalItems = 0;
    this.visited = [];
    this.grid = [];
    this.doors = new Map();
    this.enemies = [];
    this.pickups = [];
    this.projectiles = [];
    this.player = this._createFreshPlayer();
    this.loadLevel(0, true);
    this.state = 'title';
  }

  _createFreshPlayer() {
    return {
      x: 2.5,
      y: 2.5,
      angle: 0,
      health: PLAYER_DEFAULTS.maxHealth,
      maxHealth: PLAYER_DEFAULTS.maxHealth,
      armor: 25,
      maxArmor: PLAYER_DEFAULTS.maxArmor,
      radius: PLAYER_DEFAULTS.radius,
      ammo: {
        bullets: 50,
        shells: 8,
        cells: 0,
      },
      ownedWeapons: {
        [WEAPON_IDS.FIST]: true,
        [WEAPON_IDS.PISTOL]: true,
        [WEAPON_IDS.SHOTGUN]: false,
        [WEAPON_IDS.PLASMA]: false,
      },
      currentWeapon: WEAPON_IDS.PISTOL,
      weaponCooldown: 0,
      weaponRecoil: 0,
      bobPhase: 0,
      bobAmount: 0,
      keys: {
        blue: false,
        red: false,
      },
    };
  }

  startNewGame() {
    this.score = 0;
    this.totalKills = 0;
    this.player = this._createFreshPlayer();
    this.loadLevel(0, true);
    this.state = 'playing';
    this.pushMessage(this.currentLevel.name);
    this.onEvent('game_start', { level: this.currentLevel.id });
  }

  loadLevel(index, resetInventory = false) {
    this.levelIndex = clamp(index, 0, this.levels.length - 1);
    this.currentLevel = this.levels[this.levelIndex];
    this.grid = parseMap(this.currentLevel.mapRows);
    this.doors = buildDoorMap(this.grid);
    this.enemies = this.currentLevel.enemies.map((def, i) => createEnemy(def, i + 1));
    this.pickups = this.currentLevel.pickups.map((def, i) => createPickup(def, i + 1));
    this.projectiles = [];
    this.levelKills = 0;
    this.levelTotalEnemies = this.enemies.length;
    this.levelItemsCollected = 0;
    this.levelTotalItems = this.pickups.length;
    this.visited = this.grid.map((row) => row.map(() => false));

    if (resetInventory) {
      this.player = this._createFreshPlayer();
    } else {
      this.player.keys = { blue: false, red: false };
      this.player.health = Math.max(this.player.health, 60);
    }

    this.player.x = this.currentLevel.playerStart.x;
    this.player.y = this.currentLevel.playerStart.y;
    this.player.angle = this.currentLevel.playerStart.angle;
    this.player.weaponCooldown = 0;
    this.player.weaponRecoil = 0;
    this.damageFlash = 0;
    this.pickupFlash = 0;
    this.muzzleFlash = 0;
    this.messages = [];
    this._markVisited();
  }

  nextLevel() {
    if (this.levelIndex + 1 < this.levels.length) {
      this.loadLevel(this.levelIndex + 1, false);
      this.state = 'playing';
      this.pushMessage(this.currentLevel.name);
      this.onEvent('level_start', { level: this.currentLevel.id });
    } else {
      this.state = 'victory';
      this.onEvent('victory', { score: this.score });
    }
  }

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
    } else if (this.state === 'paused') {
      this.state = 'playing';
    }
  }

  pushMessage(text, duration = 2.6) {
    this.messages.unshift({ text, timer: duration });
    if (this.messages.length > 3) {
      this.messages.pop();
    }
  }

  switchWeapon(weaponId) {
    if (!this.player.ownedWeapons[weaponId]) return false;
    if (this.player.currentWeapon === weaponId) return false;
    this.player.currentWeapon = weaponId;
    this.player.weaponCooldown = Math.max(this.player.weaponCooldown, 0.12);
    this.pushMessage(`Equipped ${WEAPONS[weaponId].name}`, 1.4);
    this.onEvent('weapon_switch', { weaponId });
    return true;
  }

  switchWeaponBySlot(slot) {
    const match = Object.values(WEAPONS).find((w) => w.slot === slot);
    return match ? this.switchWeapon(match.id) : false;
  }

  cycleWeapon(dir = 1) {
    const owned = Object.values(WEAPONS)
      .sort((a, b) => a.slot - b.slot)
      .filter((w) => this.player.ownedWeapons[w.id]);
    if (owned.length <= 1) return false;
    const idx = owned.findIndex((w) => w.id === this.player.currentWeapon);
    const next = owned[(idx + dir + owned.length) % owned.length];
    return this.switchWeapon(next.id);
  }

  /**
   * Advances simulation by `dt` seconds using an input snapshot:
   * { forward, strafe, turn, sprint, fire, interact }
   */
  update(dt, input = {}) {
    const clampedDt = clamp(dt, 0, 0.1);
    this.time += clampedDt;

    for (let i = this.messages.length - 1; i >= 0; i--) {
      this.messages[i].timer -= clampedDt;
      if (this.messages[i].timer <= 0) {
        this.messages.splice(i, 1);
      }
    }

    this.damageFlash = Math.max(0, this.damageFlash - clampedDt * 2.2);
    this.pickupFlash = Math.max(0, this.pickupFlash - clampedDt * 2.5);
    this.muzzleFlash = Math.max(0, this.muzzleFlash - clampedDt * 8.0);

    if (this.state !== 'playing') return;

    this.player.weaponCooldown = Math.max(0, this.player.weaponCooldown - clampedDt);
    this.player.weaponRecoil = Math.max(0, this.player.weaponRecoil - clampedDt * 5.0);

    this._updatePlayerMovement(clampedDt, input);
    this._updateDoors(clampedDt);
    this._updatePickups();

    if (input.interact) {
      this.interact();
    }
    if (input.fire) {
      this.fireWeapon();
    }

    this._updateProjectiles(clampedDt);
    this._updateEnemies(clampedDt);
    this._markVisited();
  }

  _updatePlayerMovement(dt, input) {
    const turnInput = clamp(input.turn || 0, -3, 3);
    this.player.angle = normalizeAngle(
      this.player.angle + turnInput * PLAYER_DEFAULTS.turnSpeed * dt
    );

    const forward = clamp(input.forward || 0, -1, 1);
    const strafe = clamp(input.strafe || 0, -1, 1);
    const speed = input.sprint ? PLAYER_DEFAULTS.sprintSpeed : PLAYER_DEFAULTS.walkSpeed;

    let moveX = Math.cos(this.player.angle) * forward - Math.sin(this.player.angle) * strafe;
    let moveY = Math.sin(this.player.angle) * forward + Math.cos(this.player.angle) * strafe;
    const mag = Math.hypot(moveX, moveY);
    if (mag > 1) {
      moveX /= mag;
      moveY /= mag;
    }

    const dx = moveX * speed * dt;
    const dy = moveY * speed * dt;

    if (mag > 0.01) {
      this._moveWithCollision(this.player, dx, dy);
      this.player.bobPhase += dt * (input.sprint ? 12 : 8.5);
      this.player.bobAmount = Math.min(1, this.player.bobAmount + dt * 6);
    } else {
      this.player.bobAmount = Math.max(0, this.player.bobAmount - dt * 6);
    }
  }

  _canOccupy(x, y, radius) {
    const minGx = Math.floor(x - radius);
    const maxGx = Math.floor(x + radius);
    const minGy = Math.floor(y - radius);
    const maxGy = Math.floor(y + radius);
    for (let gy = minGy; gy <= maxGy; gy++) {
      for (let gx = minGx; gx <= maxGx; gx++) {
        if (isTileBlockingMovement(this.grid, this.doors, gx, gy)) {
          return false;
        }
      }
    }
    return true;
  }

  _moveWithCollision(entity, dx, dy) {
    const nextX = entity.x + dx;
    if (this._canOccupy(nextX, entity.y, entity.radius)) {
      entity.x = nextX;
    }
    const nextY = entity.y + dy;
    if (this._canOccupy(entity.x, nextY, entity.radius)) {
      entity.y = nextY;
    }
  }

  _markVisited() {
    const px = Math.floor(this.player.x);
    const py = Math.floor(this.player.y);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const gx = px + dx;
        const gy = py + dy;
        if (gy >= 0 && gy < this.visited.length && gx >= 0 && gx < this.visited[0].length) {
          this.visited[gy][gx] = true;
        }
      }
    }
  }

  interact() {
    const ray = castRay(
      this.grid,
      this.doors,
      this.player.x,
      this.player.y,
      this.player.angle,
      PLAYER_DEFAULTS.interactRange
    );
    if (!ray.hit) return false;

    if (ray.tile === TILE.EXIT_SWITCH) {
      this.score += 500;
      this.onEvent('level_complete', { level: this.currentLevel.id });
      if (this.levelIndex + 1 < this.levels.length) {
        this.state = 'level_complete';
        this.pushMessage('EXIT ACTIVATED! Advancing sector...', 3.0);
      } else {
        this.state = 'victory';
        this.pushMessage('HELL GATE SEALED! VICTORY!', 4.0);
      }
      return true;
    }

    if (DOOR_TILES.has(ray.tile)) {
      const door = this.doors.get(`${ray.mapX},${ray.mapY}`);
      if (!door) return false;
      if (door.requiredKey && !this.player.keys[door.requiredKey]) {
        const keyLabel = door.requiredKey === 'blue' ? 'BLUE KEYCARD' : 'RED KEYCARD';
        this.pushMessage(`LOCKED: Requires ${keyLabel}`, 2.2);
        this.onEvent('door_locked', { key: door.requiredKey });
        return false;
      }
      if (door.state === 'closed' || door.state === 'closing') {
        door.state = 'opening';
        this.onEvent('door_open', { x: door.x, y: door.y });
        return true;
      }
    }
    return false;
  }

  _updateDoors(dt) {
    for (const door of this.doors.values()) {
      if (door.state === 'opening') {
        door.openAmount = Math.min(1, door.openAmount + dt * 1.4);
        if (door.openAmount >= 1) {
          door.state = 'open';
          door.holdTimer = 4.2;
        }
      } else if (door.state === 'open') {
        door.holdTimer -= dt;
        if (door.holdTimer <= 0) {
          // Do not close on top of the player or an enemy
          const blockedByPlayer =
            Math.floor(this.player.x) === door.x && Math.floor(this.player.y) === door.y;
          const blockedByEnemy = this.enemies.some(
            (e) => e.alive && Math.floor(e.x) === door.x && Math.floor(e.y) === door.y
          );
          if (!blockedByPlayer && !blockedByEnemy) {
            door.state = 'closing';
            this.onEvent('door_close', { x: door.x, y: door.y });
          } else {
            door.holdTimer = 1.0;
          }
        }
      } else if (door.state === 'closing') {
        door.openAmount = Math.max(0, door.openAmount - dt * 1.2);
        if (door.openAmount <= 0) {
          door.state = 'closed';
        }
      }
    }
  }

  _updatePickups() {
    for (const p of this.pickups) {
      if (p.collected) continue;
      if (distance(this.player.x, this.player.y, p.x, p.y) > 0.65) continue;

      let consumed = false;
      switch (p.type) {
        case 'MEDKIT':
          if (this.player.health < this.player.maxHealth) {
            this.player.health = Math.min(this.player.maxHealth, this.player.health + 25);
            consumed = true;
          }
          break;
        case 'STIMPACK':
          if (this.player.health < this.player.maxHealth) {
            this.player.health = Math.min(this.player.maxHealth, this.player.health + 12);
            consumed = true;
          }
          break;
        case 'ARMOR':
          if (this.player.armor < this.player.maxArmor) {
            this.player.armor = Math.min(this.player.maxArmor, this.player.armor + 50);
            consumed = true;
          }
          break;
        case 'AMMO_BULLETS':
          if (this.player.ammo.bullets < PLAYER_DEFAULTS.maxAmmo.bullets) {
            this.player.ammo.bullets = Math.min(
              PLAYER_DEFAULTS.maxAmmo.bullets,
              this.player.ammo.bullets + 15
            );
            consumed = true;
          }
          break;
        case 'AMMO_SHELLS':
          if (this.player.ammo.shells < PLAYER_DEFAULTS.maxAmmo.shells) {
            this.player.ammo.shells = Math.min(
              PLAYER_DEFAULTS.maxAmmo.shells,
              this.player.ammo.shells + 6
            );
            consumed = true;
          }
          break;
        case 'AMMO_CELLS':
          if (this.player.ammo.cells < PLAYER_DEFAULTS.maxAmmo.cells) {
            this.player.ammo.cells = Math.min(
              PLAYER_DEFAULTS.maxAmmo.cells,
              this.player.ammo.cells + 25
            );
            consumed = true;
          }
          break;
        case 'WEAPON_SHOTGUN':
          this.player.ownedWeapons[WEAPON_IDS.SHOTGUN] = true;
          this.player.ammo.shells = Math.min(
            PLAYER_DEFAULTS.maxAmmo.shells,
            this.player.ammo.shells + 8
          );
          this.player.currentWeapon = WEAPON_IDS.SHOTGUN;
          consumed = true;
          break;
        case 'WEAPON_PLASMA':
          this.player.ownedWeapons[WEAPON_IDS.PLASMA] = true;
          this.player.ammo.cells = Math.min(
            PLAYER_DEFAULTS.maxAmmo.cells,
            this.player.ammo.cells + 40
          );
          this.player.currentWeapon = WEAPON_IDS.PLASMA;
          consumed = true;
          break;
        case 'KEY_BLUE':
          this.player.keys.blue = true;
          consumed = true;
          break;
        case 'KEY_RED':
          this.player.keys.red = true;
          consumed = true;
          break;
      }

      if (consumed) {
        p.collected = true;
        this.levelItemsCollected++;
        this.score += 50;
        this.pickupFlash = 0.45;
        this.pushMessage(`Picked up ${p.label}`, 2.0);
        this.onEvent('pickup', { type: p.type });
      }
    }
  }

  fireWeapon() {
    if (this.state !== 'playing') return false;
    if (this.player.weaponCooldown > 0) return false;

    const weapon = WEAPONS[this.player.currentWeapon];
    if (weapon.ammoType) {
      if (this.player.ammo[weapon.ammoType] < weapon.ammoPerShot) {
        this.pushMessage(`OUT OF ${weapon.ammoType.toUpperCase()}!`, 1.5);
        // Auto-fallback to fist or pistol if available
        if (this.player.ammo.bullets > 0 && weapon.id !== WEAPON_IDS.PISTOL) {
          this.player.currentWeapon = WEAPON_IDS.PISTOL;
        } else {
          this.player.currentWeapon = WEAPON_IDS.FIST;
        }
        return false;
      }
      this.player.ammo[weapon.ammoType] -= weapon.ammoPerShot;
    }

    this.player.weaponCooldown = weapon.cooldown;
    this.player.weaponRecoil = 1.0;
    this.muzzleFlash = weapon.id === WEAPON_IDS.FIST ? 0 : 1.0;
    this.onEvent('weapon_fire', { weaponId: weapon.id });

    if (weapon.projectile) {
      const spreadAngle = (this.rng() - 0.5) * weapon.spread;
      const fireAngle = this.player.angle + spreadAngle;
      this.projectiles.push(
        createProjectile({
          x: this.player.x + Math.cos(fireAngle) * 0.35,
          y: this.player.y + Math.sin(fireAngle) * 0.35,
          vx: Math.cos(fireAngle) * weapon.projectileSpeed,
          vy: Math.sin(fireAngle) * weapon.projectileSpeed,
          damage: weapon.damage,
          fromPlayer: true,
          color: weapon.color,
          radius: 0.18,
        })
      );
      return true;
    }

    // Hitscan pellets (Fist, Pistol, Shotgun)
    for (let i = 0; i < weapon.pellets; i++) {
      const spreadOffset =
        weapon.pellets === 1
          ? (this.rng() - 0.5) * weapon.spread
          : ((i / (weapon.pellets - 1)) - 0.5) * weapon.spread + (this.rng() - 0.5) * 0.02;
      const rayAngle = normalizeAngle(this.player.angle + spreadOffset);
      this._fireHitscanRay(rayAngle, weapon.range, weapon.damage);
    }

    // Alert nearby enemies on gunshot
    if (weapon.id !== WEAPON_IDS.FIST) {
      for (const e of this.enemies) {
        if (e.alive && e.state === 'idle' && distance(this.player.x, this.player.y, e.x, e.y) < 10) {
          e.state = 'chase';
        }
      }
    }

    return true;
  }

  _fireHitscanRay(angle, maxRange, damage) {
    const wallHit = castRay(this.grid, this.doors, this.player.x, this.player.y, angle, maxRange);
    const maxEnemyDist = wallHit.hit ? wallHit.dist : maxRange;

    let bestEnemy = null;
    let bestDist = maxEnemyDist;

    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const dx = enemy.x - this.player.x;
      const dy = enemy.y - this.player.y;
      const dist = Math.hypot(dx, dy);
      if (dist > bestDist || dist < 0.1) continue;

      const angleToEnemy = Math.atan2(dy, dx);
      const diff = Math.abs(angleDiff(angle, angleToEnemy));
      const angularRadius = Math.atan2(enemy.radius * 1.15, dist);
      if (diff <= angularRadius) {
        bestDist = dist;
        bestEnemy = enemy;
      }
    }

    if (bestEnemy) {
      this.damageEnemy(bestEnemy, damage);
    }
  }

  damageEnemy(enemy, amount) {
    if (!enemy.alive) return;
    enemy.hp -= amount;
    if (enemy.hp <= 0) {
      enemy.hp = 0;
      enemy.alive = false;
      enemy.state = 'dead';
      enemy.stateTimer = 0;
      this.levelKills++;
      this.totalKills++;
      this.score += enemy.score;
      this.onEvent('enemy_death', { type: enemy.type, id: enemy.id });
    } else {
      enemy.state = 'pain';
      enemy.stateTimer = 0.22;
      this.onEvent('enemy_hurt', { type: enemy.type, id: enemy.id });
    }
  }

  damagePlayer(amount) {
    if (this.state !== 'playing') return;
    let remaining = amount;
    if (this.player.armor > 0) {
      const absorbed = Math.min(this.player.armor, Math.ceil(amount * 0.5));
      this.player.armor -= absorbed;
      remaining -= absorbed;
    }
    this.player.health = Math.max(0, this.player.health - remaining);
    this.damageFlash = Math.min(1, this.damageFlash + 0.65);
    this.onEvent('player_hurt', { amount: remaining, health: this.player.health });

    if (this.player.health <= 0) {
      this.state = 'gameover';
      this.pushMessage('YOU DIED. Press R to restart.', 5.0);
      this.onEvent('player_death', { score: this.score });
    }
  }

  _updateProjectiles(dt) {
    for (const proj of this.projectiles) {
      if (!proj.alive) continue;
      proj.age += dt;
      if (proj.age > 5.0) {
        proj.alive = false;
        continue;
      }

      const nx = proj.x + proj.vx * dt;
      const ny = proj.y + proj.vy * dt;
      const gx = Math.floor(nx);
      const gy = Math.floor(ny);

      if (isTileBlockingMovement(this.grid, this.doors, gx, gy)) {
        proj.alive = false;
        continue;
      }

      proj.x = nx;
      proj.y = ny;

      if (proj.fromPlayer) {
        for (const enemy of this.enemies) {
          if (!enemy.alive) continue;
          if (distance(proj.x, proj.y, enemy.x, enemy.y) <= enemy.radius + proj.radius) {
            this.damageEnemy(enemy, proj.damage);
            proj.alive = false;
            break;
          }
        }
      } else {
        if (distance(proj.x, proj.y, this.player.x, this.player.y) <= this.player.radius + proj.radius) {
          this.damagePlayer(proj.damage);
          proj.alive = false;
        }
      }
    }

    if (this.projectiles.length > 0) {
      this.projectiles = this.projectiles.filter((p) => p.alive);
    }
  }

  _updateEnemies(dt) {
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;

      enemy.animTime += dt;
      enemy.attackTimer = Math.max(0, enemy.attackTimer - dt);

      const distToPlayer = distance(enemy.x, enemy.y, this.player.x, this.player.y);
      const canSee =
        distToPlayer <= enemy.sightRange &&
        hasLineOfSight(this.grid, this.doors, enemy.x, enemy.y, this.player.x, this.player.y);

      if (enemy.state === 'pain') {
        enemy.stateTimer -= dt;
        if (enemy.stateTimer <= 0) {
          enemy.state = 'chase';
        }
        continue;
      }

      if (enemy.state === 'idle') {
        if (canSee) {
          enemy.state = 'chase';
          this.onEvent('enemy_alert', { type: enemy.type });
        }
        continue;
      }

      if (enemy.state === 'attack') {
        enemy.stateTimer -= dt;
        if (enemy.stateTimer <= 0) {
          enemy.state = 'chase';
        }
        continue;
      }

      // state === 'chase'
      if (canSee && distToPlayer <= enemy.attackRange && enemy.attackTimer <= 0) {
        enemy.state = 'attack';
        enemy.stateTimer = 0.28;
        enemy.attackTimer = enemy.attackCooldown;
        this._executeEnemyAttack(enemy);
        continue;
      }

      // Move toward player if outside close personal space
      if (distToPlayer > enemy.radius + this.player.radius + 0.15) {
        const dirAngle = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x);
        const stepX = Math.cos(dirAngle) * enemy.speed * dt;
        const stepY = Math.sin(dirAngle) * enemy.speed * dt;
        this._moveWithCollision(enemy, stepX, stepY);
      }
    }
  }

  _executeEnemyAttack(enemy) {
    if (enemy.ranged) {
      const angle = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x);
      const inaccuracy = (this.rng() - 0.5) * 0.08;
      const fireAngle = angle + inaccuracy;
      this.projectiles.push(
        createProjectile({
          x: enemy.x + Math.cos(fireAngle) * (enemy.radius + 0.15),
          y: enemy.y + Math.sin(fireAngle) * (enemy.radius + 0.15),
          vx: Math.cos(fireAngle) * enemy.projectileSpeed,
          vy: Math.sin(fireAngle) * enemy.projectileSpeed,
          damage: enemy.damage,
          fromPlayer: false,
          color: enemy.projectileColor,
          radius: 0.16,
        })
      );
      this.onEvent('enemy_attack', { type: enemy.type, ranged: true });
    } else {
      const dist = distance(enemy.x, enemy.y, this.player.x, this.player.y);
      if (dist <= enemy.attackRange + 0.35) {
        this.damagePlayer(enemy.damage);
      }
      this.onEvent('enemy_attack', { type: enemy.type, ranged: false });
    }
  }

  /**
   * Casts all screen columns and returns ray hit arrays (also useful for testing).
   */
  castFrameRays(width) {
    const rays = new Array(width);
    const halfFov = FOV / 2;
    for (let x = 0; x < width; x++) {
      const cameraX = (2 * x) / width - 1;
      const rayOffset = Math.atan(cameraX * Math.tan(halfFov));
      const rayAngle = normalizeAngle(this.player.angle + rayOffset);
      const hit = castRay(this.grid, this.doors, this.player.x, this.player.y, rayAngle, 32);
      hit.perpDist = Math.max(0.05, hit.dist * Math.cos(rayOffset));
      hit.rayAngle = rayAngle;
      rays[x] = hit;
    }
    return rays;
  }
}
