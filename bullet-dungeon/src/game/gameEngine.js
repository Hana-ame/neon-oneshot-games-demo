// Core Headless-Compatible Bullet-Hell Dungeon Simulation Engine

import {
  createRng,
  clamp,
  dist,
  normalize,
  angleBetween,
  circleIntersectsCircle,
  circleIntersectsRect,
  resolveCircleRect
} from '../engine/math.js';
import {
  ROOM_W,
  ROOM_H,
  WALL_T,
  DOOR_W,
  PLAYER_CONFIG,
  WEAPONS,
  ENEMY_TYPES,
  FLOOR_THEMES
} from './constants.js';
import { generateDungeon } from './dungeon.js';

export class BulletDungeonEngine {
  constructor({ seed = 1001, onSound = () => {}, onToast = () => {} } = {}) {
    this.baseSeed = seed;
    this.onSound = onSound;
    this.onToast = onToast;
    this.reset(seed);
  }

  reset(seed = this.baseSeed) {
    this.baseSeed = seed;
    this.rng = createRng(seed);
    this.state = 'title'; // 'title' | 'playing' | 'paused' | 'gameover' | 'victory'
    this.floor = 1;
    this.score = 0;
    this.kills = 0;
    this.elapsedTime = 0;
    this.shakeTime = 0;
    this.shakeIntensity = 0;

    this.player = {
      x: ROOM_W / 2,
      y: ROOM_H / 2,
      vx: 0,
      vy: 0,
      radius: PLAYER_CONFIG.radius,
      aimAngle: 0,
      hp: PLAYER_CONFIG.maxHp,
      maxHp: PLAYER_CONFIG.maxHp,
      armor: PLAYER_CONFIG.startArmor,
      blanks: PLAYER_CONFIG.startBlanks,
      coins: 15,
      hitIFrameTimer: 0,
      rollTimer: 0,
      rollCooldownTimer: 0,
      rollDirX: 1,
      rollDirY: 0,
      weaponIndex: 0,
      weapons: WEAPONS.map((w, i) => ({
        ...w,
        unlocked: i === 0 || i === 1, // Start with Rusty Sidearm + Scatter Gun
        mag: w.magSize,
        reserve: w.maxAmmo === Infinity ? Infinity : w.maxAmmo,
        fireTimer: 0,
        reloadTimer: 0
      }))
    };

    this.bullets = []; // { x, y, vx, vy, radius, damage, fromPlayer, color, pierce, hitIds, life, trail }
    this.enemies = [];
    this.pickups = []; // { x, y, type, value, life }
    this.particles = [];
    this.shockwaves = []; // { x, y, radius, maxRadius, life, maxLife, color }
    this.floatingTexts = [];

    this._loadFloor(1);
  }

  startGame() {
    if (this.state === 'gameover' || this.state === 'victory') {
      this.reset(Date.now() & 0xfffffff);
    }
    this.state = 'playing';
  }

  togglePause() {
    if (this.state === 'playing') this.state = 'paused';
    else if (this.state === 'paused') this.state = 'playing';
  }

  getTheme() {
    return FLOOR_THEMES[Math.min(this.floor - 1, FLOOR_THEMES.length - 1)];
  }

  getCurrentRoom() {
    return this.dungeon.rooms.get(this.currentRoomId);
  }

  getActiveWeapon() {
    return this.player.weapons[this.player.weaponIndex];
  }

  isPlayerInvulnerable() {
    const rollingIFrames =
      this.player.rollTimer > PLAYER_CONFIG.rollDuration - PLAYER_CONFIG.rollIFrames;
    return rollingIFrames || this.player.hitIFrameTimer > 0;
  }

  _loadFloor(floorNum) {
    this.floor = floorNum;
    this.dungeon = generateDungeon(floorNum, this.baseSeed);
    this.currentRoomId = this.dungeon.startRoomId;
    this.player.x = ROOM_W / 2;
    this.player.y = ROOM_H / 2;
    this.player.blanks = Math.max(this.player.blanks, 2);
    this.bullets = [];
    this.enemies = [];
    this.pickups = [];
    this.particles = [];
    this.shockwaves = [];
    this.roomLocked = false;
    this.onToast(`${this.getTheme().name}`);
  }

  switchWeapon(index) {
    if (index < 0 || index >= this.player.weapons.length) return false;
    const target = this.player.weapons[index];
    if (!target.unlocked) return false;
    if (this.player.weaponIndex === index) return false;
    this.player.weaponIndex = index;
    return true;
  }

  cycleWeapon(delta = 1) {
    const unlockedIndices = this.player.weapons
      .map((w, i) => (w.unlocked ? i : -1))
      .filter((i) => i >= 0);
    if (unlockedIndices.length <= 1) return false;
    const pos = unlockedIndices.indexOf(this.player.weaponIndex);
    const nextPos = (pos + delta + unlockedIndices.length) % unlockedIndices.length;
    this.player.weaponIndex = unlockedIndices[nextPos];
    return true;
  }

  triggerReload() {
    const w = this.getActiveWeapon();
    if (w.reloadTimer > 0) return false;
    if (w.mag >= w.magSize) return false;
    if (w.reserve !== Infinity && w.reserve <= 0) return false;
    w.reloadTimer = w.reloadTime;
    this.onSound('reload');
    return true;
  }

  triggerDodgeRoll(moveX, moveY) {
    if (this.state !== 'playing') return false;
    if (this.player.rollTimer > 0 || this.player.rollCooldownTimer > 0) return false;

    let dir = normalize(moveX, moveY);
    if (dir.x === 0 && dir.y === 0) {
      dir = { x: Math.cos(this.player.aimAngle), y: Math.sin(this.player.aimAngle) };
    }
    this.player.rollDirX = dir.x;
    this.player.rollDirY = dir.y;
    this.player.rollTimer = PLAYER_CONFIG.rollDuration;
    this.player.rollCooldownTimer = PLAYER_CONFIG.rollDuration + PLAYER_CONFIG.rollCooldown;
    this.onSound('roll');
    this._spawnParticles(this.player.x, this.player.y, '#e2e8f0', 8, 90);
    return true;
  }

  triggerBlank() {
    if (this.state !== 'playing') return false;
    if (this.player.blanks <= 0) return false;

    this.player.blanks -= 1;
    // Clear all enemy projectiles immediately
    const cleared = this.bullets.filter((b) => !b.fromPlayer).length;
    this.bullets = this.bullets.filter((b) => b.fromPlayer);

    // Push back enemies & briefly stun their fire timers
    for (const enemy of this.enemies) {
      const d = dist(this.player.x, this.player.y, enemy.x, enemy.y);
      if (d <= PLAYER_CONFIG.blankRadius) {
        const dir = normalize(enemy.x - this.player.x, enemy.y - this.player.y);
        enemy.vx += dir.x * PLAYER_CONFIG.blankPushForce;
        enemy.vy += dir.y * PLAYER_CONFIG.blankPushForce;
        enemy.fireTimer = Math.max(enemy.fireTimer, 1.1);
      }
    }

    this.shockwaves.push({
      x: this.player.x,
      y: this.player.y,
      radius: 20,
      maxRadius: PLAYER_CONFIG.blankRadius,
      life: 0.45,
      maxLife: 0.45,
      color: '#74c0fc'
    });
    this._addShake(0.28, 9);
    this.onSound('blank');
    this._addFloatingText(
      this.player.x,
      this.player.y - 24,
      cleared > 0 ? `清弹 x${cleared}!` : '空白冲击!',
      '#74c0fc'
    );
    return true;
  }

  fireWeapon() {
    if (this.state !== 'playing') return false;
    if (this.player.rollTimer > 0) return false;

    const w = this.getActiveWeapon();
    if (w.fireTimer > 0 || w.reloadTimer > 0) return false;
    if (w.mag <= 0) {
      this.triggerReload();
      return false;
    }

    w.mag -= 1;
    w.fireTimer = w.fireRate;
    const baseAngle = this.player.aimAngle;
    const muzzleX = this.player.x + Math.cos(baseAngle) * 18;
    const muzzleY = this.player.y + Math.sin(baseAngle) * 18;

    for (let i = 0; i < w.pellets; i++) {
      const spreadOffset =
        w.pellets === 1
          ? (this.rng.next() - 0.5) * w.spread
          : ((i / (w.pellets - 1)) - 0.5) * w.spread + (this.rng.next() - 0.5) * 0.04;
      const ang = baseAngle + spreadOffset;
      this.bullets.push({
        x: muzzleX,
        y: muzzleY,
        vx: Math.cos(ang) * w.projectileSpeed,
        vy: Math.sin(ang) * w.projectileSpeed,
        radius: w.projectileRadius,
        damage: w.damage,
        fromPlayer: true,
        color: w.color,
        pierce: w.pierce,
        knockback: w.knockback,
        hitIds: new Set(),
        life: 2.2
      });
    }

    this._spawnParticles(muzzleX, muzzleY, w.color, 4, 130);
    this._addShake(0.06, w.pellets > 1 ? 4.5 : 2.2);
    this.onSound(w.sound);

    if (w.mag === 0 && (w.reserve === Infinity || w.reserve > 0)) {
      this.triggerReload();
    }
    return true;
  }

  interact() {
    if (this.state !== 'playing') return false;
    const room = this.getCurrentRoom();

    // 1. Treasure chest
    if (room.chest && !room.chest.opened) {
      if (dist(this.player.x, this.player.y, room.chest.x, room.chest.y) < 58) {
        room.chest.opened = true;
        const wIdx = room.chest.rewardWeaponIndex;
        const weapon = this.player.weapons[wIdx];
        if (weapon && !weapon.unlocked) {
          weapon.unlocked = true;
          weapon.mag = weapon.magSize;
          weapon.reserve = weapon.maxAmmo;
          this.player.weaponIndex = wIdx;
          this.onToast(`获得新武器：${weapon.name}！`);
          this._addFloatingText(room.chest.x, room.chest.y - 24, `解锁 ${weapon.name}`, '#ffd166');
        } else {
          this.player.armor += 1;
          this.player.blanks += 1;
          this.onToast('宝箱奖励：+1 护甲，+1 空白弹');
          this._addFloatingText(room.chest.x, room.chest.y - 24, '+1 护甲 +1 空白弹', '#74c0fc');
        }
        this.onSound('pickup');
        this._spawnParticles(room.chest.x, room.chest.y, '#ffd166', 18, 160);
        return true;
      }
    }

    // 2. Shop items
    if (room.shopItems && room.shopItems.length > 0) {
      for (const item of room.shopItems) {
        if (item.purchased) continue;
        if (dist(this.player.x, this.player.y, item.x, item.y) < 52) {
          if (this.player.coins < item.cost) {
            this._addFloatingText(item.x, item.y - 20, '金币不足', '#ff6b6b');
            return false;
          }
          this.player.coins -= item.cost;
          item.purchased = true;
          if (item.type === 'heart') {
            this.player.hp = Math.min(this.player.maxHp, this.player.hp + 2);
          } else if (item.type === 'armor') {
            this.player.armor += 1;
          } else if (item.type === 'blank') {
            this.player.blanks += 1;
          } else if (item.type === 'ammo') {
            for (const w of this.player.weapons) {
              if (w.maxAmmo !== Infinity) w.reserve = w.maxAmmo;
              w.mag = w.magSize;
            }
          }
          this.onSound('pickup');
          this.onToast(`已购买：${item.name}`);
          this._addFloatingText(item.x, item.y - 24, `-${item.cost}G`, '#ffd166');
          return true;
        }
      }
    }

    // 3. Floor Portal in Boss room
    if (room.portalOpen) {
      if (dist(this.player.x, this.player.y, ROOM_W / 2, ROOM_H / 2) < 58) {
        if (this.floor >= FLOOR_THEMES.length) {
          this.state = 'victory';
          this.score += 1500;
          this.onSound('roomClear');
          this.onToast('恭喜通关枪弹地牢！');
        } else {
          this.score += 500 * this.floor;
          this._loadFloor(this.floor + 1);
          this.onSound('roomClear');
        }
        return true;
      }
    }

    return false;
  }

  enterRoom(targetRoomId, fromDir) {
    const nextRoom = this.dungeon.rooms.get(targetRoomId);
    if (!nextRoom) return false;

    this.currentRoomId = targetRoomId;
    nextRoom.visited = true;
    this.bullets = [];
    this.pickups = [];
    this.enemies = [];

    // Place player just inside the opposite doorway
    const pad = WALL_T + PLAYER_CONFIG.radius + 14;
    if (fromDir === 'N') {
      this.player.x = ROOM_W / 2;
      this.player.y = ROOM_H - pad;
    } else if (fromDir === 'S') {
      this.player.x = ROOM_W / 2;
      this.player.y = pad;
    } else if (fromDir === 'W') {
      this.player.x = ROOM_W - pad;
      this.player.y = ROOM_H / 2;
    } else if (fromDir === 'E') {
      this.player.x = pad;
      this.player.y = ROOM_H / 2;
    }

    // Spawn enemies if uncleared
    if (!nextRoom.cleared) {
      this.roomLocked = true;
      if (nextRoom.type === 'boss') {
        this._spawnBoss();
      } else {
        for (let i = 0; i < nextRoom.enemySpawns.length; i++) {
          const sp = nextRoom.enemySpawns[i];
          const cfg = ENEMY_TYPES[sp.type];
          const hpScale = 1 + (this.floor - 1) * 0.22;
          this.enemies.push({
            id: `e_${this.floor}_${nextRoom.id}_${i}`,
            type: sp.type,
            isBoss: false,
            name: cfg.name,
            x: sp.x,
            y: sp.y,
            vx: 0,
            vy: 0,
            radius: cfg.radius,
            speed: cfg.speed,
            hp: Math.round(cfg.hp * hpScale),
            maxHp: Math.round(cfg.hp * hpScale),
            color: cfg.color,
            accent: cfg.accent,
            score: cfg.score,
            fireCooldown: cfg.fireCooldown,
            fireTimer: 0.6 + this.rng.next() * 0.9,
            bulletSpeed: cfg.bulletSpeed,
            pattern: cfg.pattern,
            spiralAngle: this.rng.next() * Math.PI * 2,
            hitFlash: 0,
            aiTimer: 0
          });
        }
      }
    } else {
      this.roomLocked = false;
    }
    return true;
  }

  _spawnBoss() {
    const theme = this.getTheme();
    this.enemies.push({
      id: `boss_f${this.floor}`,
      type: 'boss',
      isBoss: true,
      name: theme.bossName,
      x: ROOM_W / 2,
      y: ROOM_H / 2 - 40,
      vx: 0,
      vy: 0,
      radius: 32,
      speed: 88 + this.floor * 12,
      hp: theme.bossHp,
      maxHp: theme.bossHp,
      color: theme.accent,
      accent: '#ff006e',
      score: 1000 * this.floor,
      fireCooldown: 1.25,
      fireTimer: 1.0,
      bulletSpeed: 215 + this.floor * 15,
      pattern: 'boss',
      spiralAngle: 0,
      phaseIndex: 0,
      phaseTimer: 0,
      hitFlash: 0,
      aiTimer: 0
    });
    this.onSound('bossSpawn');
    this.onToast(`BOSS 现身：${theme.bossName}！`);
    this._addShake(0.35, 8);
  }

  step(dt, input = {}) {
    if (this.state !== 'playing') return;
    const clampedDt = Math.min(dt, 0.05);
    this.elapsedTime += clampedDt;

    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - clampedDt);
    }

    this._updatePlayer(clampedDt, input);
    this._updateEnemies(clampedDt);
    this._updateBullets(clampedDt);
    this._updatePickups(clampedDt);
    this._updateEffects(clampedDt);
    this._checkDoorTransitions();
  }

  _updatePlayer(dt, input) {
    const p = this.player;
    const room = this.getCurrentRoom();

    if (typeof input.aimAngle === 'number' && !Number.isNaN(input.aimAngle)) {
      p.aimAngle = input.aimAngle;
    }

    if (p.hitIFrameTimer > 0) p.hitIFrameTimer = Math.max(0, p.hitIFrameTimer - dt);
    if (p.rollCooldownTimer > 0) p.rollCooldownTimer = Math.max(0, p.rollCooldownTimer - dt);

    // Weapon timers & reload completion
    for (const w of p.weapons) {
      if (w.fireTimer > 0) w.fireTimer = Math.max(0, w.fireTimer - dt);
      if (w.reloadTimer > 0) {
        w.reloadTimer -= dt;
        if (w.reloadTimer <= 0) {
          w.reloadTimer = 0;
          if (w.reserve === Infinity) {
            w.mag = w.magSize;
          } else {
            const needed = w.magSize - w.mag;
            const taken = Math.min(needed, w.reserve);
            w.mag += taken;
            w.reserve -= taken;
          }
        }
      }
    }

    if (input.roll) {
      this.triggerDodgeRoll(input.moveX || 0, input.moveY || 0);
    }
    if (input.blank) {
      this.triggerBlank();
    }
    if (input.reload) {
      this.triggerReload();
    }
    if (input.interact) {
      this.interact();
    }

    // Movement
    if (p.rollTimer > 0) {
      p.rollTimer = Math.max(0, p.rollTimer - dt);
      p.vx = p.rollDirX * PLAYER_CONFIG.rollSpeed;
      p.vy = p.rollDirY * PLAYER_CONFIG.rollSpeed;
    } else {
      const dir = normalize(input.moveX || 0, input.moveY || 0);
      p.vx = dir.x * PLAYER_CONFIG.speed;
      p.vy = dir.y * PLAYER_CONFIG.speed;
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // Wall clamping (allow stepping into open doorways when unlocked)
    const minX = WALL_T + p.radius;
    const maxX = ROOM_W - WALL_T - p.radius;
    const minY = WALL_T + p.radius;
    const maxY = ROOM_H - WALL_T - p.radius;

    const inDoorX = Math.abs(p.x - ROOM_W / 2) < DOOR_W / 2 - p.radius * 0.4;
    const inDoorY = Math.abs(p.y - ROOM_H / 2) < DOOR_W / 2 - p.radius * 0.4;

    if (!( !this.roomLocked && room.doors.W && inDoorY && p.x < minX )) {
      if (p.x < minX) p.x = minX;
    }
    if (!( !this.roomLocked && room.doors.E && inDoorY && p.x > maxX )) {
      if (p.x > maxX) p.x = maxX;
    }
    if (!( !this.roomLocked && room.doors.N && inDoorX && p.y < minY )) {
      if (p.y < minY) p.y = minY;
    }
    if (!( !this.roomLocked && room.doors.S && inDoorX && p.y > maxY )) {
      if (p.y > maxY) p.y = maxY;
    }

    // Resolve obstacle collisions
    for (const obs of room.obstacles) {
      const res = resolveCircleRect(p.x, p.y, p.radius, obs.x, obs.y, obs.w, obs.h);
      p.x = res.x;
      p.y = res.y;
    }

    if (input.fire) {
      this.fireWeapon();
    }
  }

  _updateEnemies(dt) {
    const p = this.player;
    const room = this.getCurrentRoom();

    for (const e of this.enemies) {
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
      e.aiTimer += dt;
      e.fireTimer -= dt;

      const dToPlayer = dist(e.x, e.y, p.x, p.y);
      const angToPlayer = angleBetween(e.x, e.y, p.x, p.y);

      if (e.speed > 0) {
        let desiredSpeed = e.speed;
        let moveAngle = angToPlayer;

        if (e.isBoss) {
          // Orbit / stalk player smoothly
          if (dToPlayer < 170) moveAngle = angToPlayer + Math.PI * 0.65;
          else if (dToPlayer < 260) moveAngle = angToPlayer + Math.PI * 0.35;
        } else if (e.type === 'sniper_ghost' && dToPlayer < 220) {
          moveAngle = angToPlayer + Math.PI; // Keep distance
        } else if (e.type === 'shotgun_kin' && dToPlayer < 140) {
          desiredSpeed *= 0.4;
        }

        const targetVx = Math.cos(moveAngle) * desiredSpeed;
        const targetVy = Math.sin(moveAngle) * desiredSpeed;
        e.vx += (targetVx - e.vx) * Math.min(1, dt * 6);
        e.vy += (targetVy - e.vy) * Math.min(1, dt * 6);
      } else {
        e.vx *= Math.max(0, 1 - dt * 8);
        e.vy *= Math.max(0, 1 - dt * 8);
      }

      e.x += e.vx * dt;
      e.y += e.vy * dt;

      e.x = clamp(e.x, WALL_T + e.radius, ROOM_W - WALL_T - e.radius);
      e.y = clamp(e.y, WALL_T + e.radius, ROOM_H - WALL_T - e.radius);

      for (const obs of room.obstacles) {
        const res = resolveCircleRect(e.x, e.y, e.radius, obs.x, obs.y, obs.w, obs.h);
        e.x = res.x;
        e.y = res.y;
      }

      // Enemy firing patterns
      if (e.fireTimer <= 0) {
        this._fireEnemyPattern(e, angToPlayer);
      }

      // Contact damage to player
      if (circleIntersectsCircle(e.x, e.y, e.radius - 2, p.x, p.y, p.radius - 2)) {
        this.damagePlayer(1);
      }
    }
  }

  _fireEnemyPattern(e, angToPlayer) {
    const spawnEnemyBullet = (angle, speed, radius = 5.5, color = '#ff4d6d') => {
      this.bullets.push({
        x: e.x + Math.cos(angle) * (e.radius + 4),
        y: e.y + Math.sin(angle) * (e.radius + 4),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius,
        damage: 1,
        fromPlayer: false,
        color,
        pierce: 0,
        hitIds: new Set(),
        life: 5.0
      });
    };

    if (e.isBoss) {
      const hpRatio = e.hp / e.maxHp;
      const enraged = hpRatio < 0.5;
      const mode = e.phaseIndex % 3;
      e.phaseIndex++;

      if (mode === 0) {
        // Double Spiral Barrage
        const arms = enraged ? 8 : 6;
        for (let i = 0; i < arms; i++) {
          const a = e.spiralAngle + (i * Math.PI * 2) / arms;
          spawnEnemyBullet(a, e.bulletSpeed, 6, '#ff595e');
        }
        e.spiralAngle += 0.34;
        e.fireTimer = enraged ? 0.34 : 0.48;
      } else if (mode === 1) {
        // Aimed Fan + Offset Ring
        const fanCount = enraged ? 7 : 5;
        for (let i = 0; i < fanCount; i++) {
          const offset = ((i / (fanCount - 1)) - 0.5) * 0.85;
          spawnEnemyBullet(angToPlayer + offset, e.bulletSpeed * 1.18, 6, '#ffca3a');
        }
        e.fireTimer = enraged ? 0.72 : 0.95;
      } else {
        // Expanding 14-bullet Ring
        const ringCount = enraged ? 16 : 12;
        for (let i = 0; i < ringCount; i++) {
          const a = e.spiralAngle + (i * Math.PI * 2) / ringCount;
          spawnEnemyBullet(a, e.bulletSpeed * 0.9, 6.5, '#ff006e');
        }
        e.spiralAngle += 0.2;
        e.fireTimer = enraged ? 0.85 : 1.1;
      }
      return;
    }

    if (e.pattern === 'aimed') {
      spawnEnemyBullet(angToPlayer, e.bulletSpeed, 5.5, '#ff6b6b');
      e.fireTimer = e.fireCooldown;
    } else if (e.pattern === 'fan5') {
      for (let i = -2; i <= 2; i++) {
        spawnEnemyBullet(angToPlayer + i * 0.19, e.bulletSpeed, 5.5, '#ff922b');
      }
      e.fireTimer = e.fireCooldown;
    } else if (e.pattern === 'spiral') {
      for (let i = 0; i < 4; i++) {
        spawnEnemyBullet(e.spiralAngle + (i * Math.PI) / 2, e.bulletSpeed, 5, '#4cc9f0');
      }
      e.spiralAngle += 0.32;
      e.fireTimer = e.fireCooldown;
    } else if (e.pattern === 'burst3') {
      for (let i = -1; i <= 1; i++) {
        spawnEnemyBullet(angToPlayer + i * 0.08, e.bulletSpeed, 5, '#c77dff');
      }
      e.fireTimer = e.fireCooldown;
    } else if (e.pattern === 'ring8') {
      for (let i = 0; i < 8; i++) {
        spawnEnemyBullet(e.spiralAngle + (i * Math.PI) / 4, e.bulletSpeed, 5.5, '#ff4d6d');
      }
      e.spiralAngle += 0.25;
      e.fireTimer = e.fireCooldown;
    }
  }

  _updateBullets(dt) {
    const room = this.getCurrentRoom();
    const p = this.player;
    const survivors = [];

    for (const b of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;

      if (
        b.life <= 0 ||
        b.x < WALL_T ||
        b.x > ROOM_W - WALL_T ||
        b.y < WALL_T ||
        b.y > ROOM_H - WALL_T
      ) {
        this._spawnParticles(b.x, b.y, b.color, 3, 70);
        continue;
      }

      // Check obstacle hit
      let hitWall = false;
      for (let i = room.obstacles.length - 1; i >= 0; i--) {
        const obs = room.obstacles[i];
        if (circleIntersectsRect(b.x, b.y, b.radius, obs.x, obs.y, obs.w, obs.h)) {
          hitWall = true;
          if (obs.destructible && b.fromPlayer) {
            obs.hp -= b.damage;
            if (obs.hp <= 0) {
              this._spawnParticles(obs.x + obs.w / 2, obs.y + obs.h / 2, '#d4a373', 12, 130);
              room.obstacles.splice(i, 1);
            }
          }
          this._spawnParticles(b.x, b.y, b.color, 3, 70);
          break;
        }
      }
      if (hitWall) continue;

      if (b.fromPlayer) {
        let consumed = false;
        for (let i = this.enemies.length - 1; i >= 0; i--) {
          const e = this.enemies[i];
          if (b.hitIds.has(e.id)) continue;
          if (circleIntersectsCircle(b.x, b.y, b.radius, e.x, e.y, e.radius)) {
            b.hitIds.add(e.id);
            e.hp -= b.damage;
            e.hitFlash = 0.1;
            const kbDir = normalize(b.vx, b.vy);
            const kbScale = e.isBoss ? 0.12 : 1;
            e.vx += kbDir.x * (b.knockback || 50) * kbScale;
            e.vy += kbDir.y * (b.knockback || 50) * kbScale;
            this._spawnParticles(b.x, b.y, b.color, 5, 110);
            this._addFloatingText(e.x, e.y - e.radius - 6, `-${b.damage}`, '#ffffff');
            this.onSound('hit');

            if (e.hp <= 0) {
              this._killEnemy(i);
            }

            if (b.pierce > 0) {
              b.pierce -= 1;
            } else {
              consumed = true;
              break;
            }
          }
        }
        if (!consumed) survivors.push(b);
      } else {
        // Enemy projectile vs player
        if (circleIntersectsCircle(b.x, b.y, b.radius, p.x, p.y, p.radius - 3)) {
          if (!this.isPlayerInvulnerable()) {
            this.damagePlayer(b.damage);
            this._spawnParticles(b.x, b.y, '#ff4d6d', 8, 120);
            continue;
          }
        }
        survivors.push(b);
      }
    }

    this.bullets = survivors;
  }

  _killEnemy(index) {
    const e = this.enemies[index];
    this.enemies.splice(index, 1);
    this.kills += 1;
    this.score += e.score;
    this.onSound('enemyDie');
    this._spawnParticles(e.x, e.y, e.color, e.isBoss ? 36 : 14, e.isBoss ? 220 : 140);
    this._addShake(e.isBoss ? 0.4 : 0.1, e.isBoss ? 10 : 3.5);

    // Loot drops
    const coinCount = e.isBoss ? 8 : this.rng.int(1, 3);
    for (let c = 0; c < coinCount; c++) {
      this.pickups.push({
        x: e.x + (this.rng.next() - 0.5) * 32,
        y: e.y + (this.rng.next() - 0.5) * 32,
        type: 'coin',
        value: e.isBoss ? 5 : 3,
        life: 30
      });
    }
    if (e.isBoss || this.rng.next() < 0.22) {
      const dropType = this.rng.pick(['heart', 'ammo', 'blank']);
      this.pickups.push({
        x: e.x,
        y: e.y,
        type: dropType,
        value: 1,
        life: 30
      });
    }

    // Check room clear
    if (this.enemies.length === 0) {
      const room = this.getCurrentRoom();
      room.cleared = true;
      this.roomLocked = false;
      this.bullets = this.bullets.filter((b) => b.fromPlayer);
      this.onSound('roomClear');
      if (room.type === 'boss') {
        room.portalOpen = true;
        this.onToast(`击败 ${e.name}！前往房间中央传送门按 E 进入下一层`);
      } else {
        this.onToast('房间已清空！');
      }
    }
  }

  damagePlayer(amount) {
    if (this.isPlayerInvulnerable() || this.state !== 'playing') return false;
    const p = this.player;
    p.hitIFrameTimer = PLAYER_CONFIG.hitIFrames;
    this._addShake(0.24, 8);
    this.onSound('playerHit');

    if (p.armor > 0) {
      p.armor -= 1;
      // Armor break clears nearby enemy bullets (classic Gungeon mechanic)
      this.bullets = this.bullets.filter((b) => b.fromPlayer);
      this.shockwaves.push({
        x: p.x,
        y: p.y,
        radius: 16,
        maxRadius: 240,
        life: 0.3,
        maxLife: 0.3,
        color: '#a5b4fc'
      });
      this._addFloatingText(p.x, p.y - 22, '护甲碎裂!', '#a5b4fc');
    } else {
      p.hp = Math.max(0, p.hp - amount);
      this._addFloatingText(p.x, p.y - 22, `-${amount} HP`, '#ff4d6d');
    }

    if (p.hp <= 0) {
      this.state = 'gameover';
      this.onToast('你倒在了枪弹地牢中……');
    }
    return true;
  }

  _updatePickups(dt) {
    const p = this.player;
    const keep = [];
    for (const item of this.pickups) {
      item.life -= dt;
      if (item.life <= 0) continue;

      const d = dist(p.x, p.y, item.x, item.y);
      // Gentle magnetic pull for coins
      if (item.type === 'coin' && d < 95 && d > 1) {
        const dir = normalize(p.x - item.x, p.y - item.y);
        item.x += dir.x * 240 * dt;
        item.y += dir.y * 240 * dt;
      }

      if (d < p.radius + 14) {
        if (item.type === 'coin') {
          p.coins += item.value;
          this.score += item.value * 10;
        } else if (item.type === 'heart') {
          if (p.hp >= p.maxHp) {
            keep.push(item);
            continue;
          }
          p.hp = Math.min(p.maxHp, p.hp + 2);
          this._addFloatingText(p.x, p.y - 20, '+2 HP', '#ff6b6b');
        } else if (item.type === 'blank') {
          p.blanks += 1;
          this._addFloatingText(p.x, p.y - 20, '+1 空白弹', '#74c0fc');
        } else if (item.type === 'ammo') {
          for (const w of p.weapons) {
            if (w.maxAmmo !== Infinity) {
              w.reserve = Math.min(w.maxAmmo, w.reserve + Math.ceil(w.maxAmmo * 0.4));
            }
          }
          this._addFloatingText(p.x, p.y - 20, '弹药补充', '#63e6be');
        }
        this.onSound('pickup');
        continue;
      }
      keep.push(item);
    }
    this.pickups = keep;
  }

  _updateEffects(dt) {
    this.particles = this.particles.filter((pt) => {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= Math.max(0, 1 - dt * 5);
      pt.vy *= Math.max(0, 1 - dt * 5);
      pt.life -= dt;
      return pt.life > 0;
    });

    this.shockwaves = this.shockwaves.filter((sw) => {
      sw.life -= dt;
      const progress = 1 - sw.life / sw.maxLife;
      sw.radius = sw.maxRadius * progress;
      return sw.life > 0;
    });

    this.floatingTexts = this.floatingTexts.filter((ft) => {
      ft.y -= 28 * dt;
      ft.life -= dt;
      return ft.life > 0;
    });
  }

  _checkDoorTransitions() {
    if (this.roomLocked) return;
    const room = this.getCurrentRoom();
    const p = this.player;
    const inDoorX = Math.abs(p.x - ROOM_W / 2) < DOOR_W / 2;
    const inDoorY = Math.abs(p.y - ROOM_H / 2) < DOOR_W / 2;

    if (room.doors.N && inDoorX && p.y < WALL_T - 2) {
      this.enterRoom(room.doors.N, 'N');
    } else if (room.doors.S && inDoorX && p.y > ROOM_H - WALL_T + 2) {
      this.enterRoom(room.doors.S, 'S');
    } else if (room.doors.W && inDoorY && p.x < WALL_T - 2) {
      this.enterRoom(room.doors.W, 'W');
    } else if (room.doors.E && inDoorY && p.x > ROOM_W - WALL_T + 2) {
      this.enterRoom(room.doors.E, 'E');
    }
  }

  _spawnParticles(x, y, color, count, speed) {
    for (let i = 0; i < count; i++) {
      const ang = this.rng.next() * Math.PI * 2;
      const spd = (0.3 + this.rng.next() * 0.7) * speed;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        color,
        size: 2 + this.rng.next() * 3,
        life: 0.2 + this.rng.next() * 0.25
      });
    }
  }

  _addFloatingText(x, y, text, color) {
    this.floatingTexts.push({ x, y, text, color, life: 0.75 });
  }

  _addShake(duration, intensity) {
    this.shakeTime = Math.max(this.shakeTime, duration);
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
  }
}
