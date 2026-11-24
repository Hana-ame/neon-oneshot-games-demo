import {
  DIRECTIONS,
  DIR_LIST,
  DOOR_SIZE,
  FLOOR_THEMES,
  GRID_COLS,
  GRID_ROWS,
  ROOM_BOTTOM,
  ROOM_HEIGHT,
  ROOM_LEFT,
  ROOM_RIGHT,
  ROOM_TOP,
  ROOM_TYPES,
  ROOM_WIDTH,
  TILE_TYPES
} from './constants.js';
import { generateFloor } from './dungeon.js';
import {
  createBomb,
  createEnemy,
  createEnemyBullet,
  createPickup,
  createPlayer,
  createTear,
  getCellSize,
  tileToWorld,
  worldToTile
} from './entities.js';
import { pickItemFromPool } from './items.js';
import { SeededRNG } from './rng.js';

export function getDoorRect(direction) {
  const cx = ROOM_LEFT + ROOM_WIDTH / 2;
  const cy = ROOM_TOP + ROOM_HEIGHT / 2;
  const half = DOOR_SIZE / 2;
  switch (direction) {
    case 'NORTH':
      return { x: cx - half, y: ROOM_TOP - 28, w: DOOR_SIZE, h: 36, cx, cy: ROOM_TOP };
    case 'SOUTH':
      return { x: cx - half, y: ROOM_BOTTOM - 8, w: DOOR_SIZE, h: 36, cx, cy: ROOM_BOTTOM };
    case 'WEST':
      return { x: ROOM_LEFT - 28, y: cy - half, w: 36, h: DOOR_SIZE, cx: ROOM_LEFT, cy };
    case 'EAST':
      return { x: ROOM_RIGHT - 8, y: cy - half, w: 36, h: DOOR_SIZE, cx: ROOM_RIGHT, cy };
    default:
      return { x: cx, y: cy, w: 0, h: 0, cx, cy };
  }
}

export class IsaacGameEngine {
  constructor(options = {}) {
    this.rng = new SeededRNG(options.seed);
    this.seed = this.rng.seedString;
    this.onEvent = options.onEvent || (() => {});
    this.maxFloors = options.maxFloors || FLOOR_THEMES.length;
    this.reset(this.seed);
  }

  reset(newSeed) {
    if (newSeed !== undefined) {
      this.rng = new SeededRNG(newSeed);
      this.seed = this.rng.seedString;
    } else {
      this.rng = new SeededRNG();
      this.seed = this.rng.seedString;
    }
    this.status = 'PLAYING'; // 'PLAYING' | 'PAUSED' | 'GAMEOVER' | 'VICTORY'
    this.elapsedTime = 0;
    this.floorLevel = 1;
    this.player = createPlayer();
    this.tears = [];
    this.enemyBullets = [];
    this.bombs = [];
    this.particles = [];
    this.banner = null; // { title, subtitle, timer }
    this.screenShake = 0;
    this.roomTransitionTimer = 0;
    this.roomsClearedCount = 0;
    this.enemiesKilledCount = 0;
    this.bombKeyWasDown = false;
    this.activeKeyWasDown = false;

    this.loadFloor(1);
    this.emit('game_start', { seed: this.seed });
  }

  emit(type, payload = {}) {
    try {
      this.onEvent(type, payload);
    } catch {
      // ignore listener errors in headless tests
    }
  }

  showBanner(title, subtitle = '', duration = 2.4) {
    this.banner = { title, subtitle, timer: duration, maxTimer: duration };
  }

  loadFloor(level) {
    this.floorLevel = level;
    this.floor = generateFloor(level, this.rng, this.player.ownedItemIds);
    this.currentRoomKey = this.floor.startKey;
    this.tears = [];
    this.enemyBullets = [];
    this.bombs = [];
    this.particles = [];
    const center = tileToWorld(7, 4);
    this.player.x = center.x;
    this.player.y = center.y;
    this.player.vx = 0;
    this.player.vy = 0;
    this.enterRoom(this.currentRoomKey, null);
    this.showBanner(this.floor.theme.name, this.floor.theme.subtitle, 2.2);
  }

  getCurrentRoom() {
    return this.floor.rooms.get(this.currentRoomKey);
  }

  enterRoom(roomKey, enteredFromDir = null) {
    this.currentRoomKey = roomKey;
    const room = this.getCurrentRoom();
    room.visited = true;

    this.tears = [];
    this.enemyBullets = [];
    this.bombs = [];
    this.particles = [];
    this.roomTransitionTimer = 0.16;

    // Position player near the opposite doorway if coming from another room
    if (enteredFromDir) {
      const opposite = DIRECTIONS[enteredFromDir].opposite;
      const door = getDoorRect(opposite);
      const offset = 46;
      if (opposite === 'NORTH') {
        this.player.x = door.cx;
        this.player.y = ROOM_TOP + offset;
      } else if (opposite === 'SOUTH') {
        this.player.x = door.cx;
        this.player.y = ROOM_BOTTOM - offset;
      } else if (opposite === 'WEST') {
        this.player.x = ROOM_LEFT + offset;
        this.player.y = door.cy;
      } else if (opposite === 'EAST') {
        this.player.x = ROOM_RIGHT - offset;
        this.player.y = door.cy;
      }
      this.player.vx = 0;
      this.player.vy = 0;
    }

    // Spawn enemies if room is not cleared and enemies haven't been instantiated
    if (!room.cleared && room.enemies.length === 0 && room.enemySpawns.length > 0) {
      room.enemies = room.enemySpawns.map((sp) => {
        const pos = tileToWorld(sp.col, sp.row);
        return createEnemy(sp.type, pos.x, pos.y, this.floorLevel);
      });
      if (room.type === ROOM_TYPES.BOSS && room.enemies[0]) {
        this.showBanner(room.enemies[0].name, 'BOSS 战', 2.0);
        this.emit('boss_roar', { boss: room.enemies[0].type });
      }
    }
  }

  isSolidTile(tile) {
    return tile === TILE_TYPES.ROCK || tile === TILE_TYPES.TINTED_ROCK || tile === TILE_TYPES.POOP;
  }

  addParticles(x, y, color, count = 8, speed = 130) {
    for (let i = 0; i < count; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const sp = this.rng.range(speed * 0.35, speed);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        radius: this.rng.range(2.2, 5.2),
        color,
        life: this.rng.range(0.22, 0.48),
        maxLife: 0.48
      });
    }
  }

  placeBomb() {
    if (this.status !== 'PLAYING') return false;
    if (this.player.bombs <= 0) return false;
    this.player.bombs -= 1;
    this.bombs.push(createBomb(this.player.x, this.player.y));
    this.emit('bomb_place');
    return true;
  }

  useActiveItem() {
    if (this.status !== 'PLAYING') return false;
    const active = this.player.activeItem;
    if (!active || active.charge < active.maxCharge) return false;
    if (active.canUse && !active.canUse(this.player)) return false;
    const used = active.use(this.player);
    if (used) {
      active.charge = 0;
      this.addParticles(this.player.x, this.player.y, '#ff6b81', 14, 150);
      this.emit('active_use', { item: active.id });
    }
    return used;
  }

  applyPassiveItem(item) {
    if (!item) return;
    item.apply(this.player.stats);
    this.player.ownedItems.push(item);
    this.player.ownedItemIds.add(item.id);
    this.player.score += 150;
    this.showBanner(item.name, item.subtitle, 2.5);
    this.addParticles(this.player.x, this.player.y, item.color || '#ffd43b', 18, 170);
    this.emit('item_pickup', { id: item.id, name: item.name });
  }

  damagePlayer(halfHearts = 1) {
    if (this.player.invulnTimer > 0 || this.status !== 'PLAYING') return false;
    let remaining = halfHearts;
    if (this.player.stats.soulHearts > 0) {
      const absorbed = Math.min(this.player.stats.soulHearts, remaining);
      this.player.stats.soulHearts -= absorbed;
      remaining -= absorbed;
    }
    if (remaining > 0) {
      this.player.stats.redHearts = Math.max(0, this.player.stats.redHearts - remaining);
    }
    this.player.invulnTimer = 1.1;
    this.player.hurtFlash = 0.35;
    this.screenShake = Math.max(this.screenShake, 8);
    this.addParticles(this.player.x, this.player.y, '#e03131', 12, 160);
    this.emit('player_hurt');

    if (this.player.stats.redHearts <= 0 && this.player.stats.soulHearts <= 0) {
      this.status = 'GAMEOVER';
      this.emit('game_over', { score: this.player.score, floor: this.floorLevel });
    }
    return true;
  }

  collectPickup(pickup) {
    const p = this.player;
    switch (pickup.type) {
      case 'red_heart':
        if (p.stats.redHearts >= p.stats.maxRedHearts) return false;
        p.stats.redHearts = Math.min(p.stats.maxRedHearts, p.stats.redHearts + 2);
        this.emit('pickup_heart');
        return true;
      case 'half_heart':
        if (p.stats.redHearts >= p.stats.maxRedHearts) return false;
        p.stats.redHearts = Math.min(p.stats.maxRedHearts, p.stats.redHearts + 1);
        this.emit('pickup_heart');
        return true;
      case 'soul_heart':
        p.stats.soulHearts = Math.min(12, p.stats.soulHearts + 2);
        this.emit('pickup_heart');
        return true;
      case 'coin':
        p.coins += 1;
        p.score += 15;
        this.emit('pickup_coin');
        return true;
      case 'bomb':
        p.bombs += 1;
        this.emit('pickup_item');
        return true;
      case 'key':
        p.keys += 1;
        this.emit('pickup_item');
        return true;
      default:
        return false;
    }
  }

  /**
   * 推进游戏逻辑一帧
   * @param {number} dt 秒 (建议 <= 0.05)
   * @param {object} input { moveX, moveY, shootX, shootY, bomb, active }
   */
  step(dt, input = {}) {
    if (this.status !== 'PLAYING') return;
    const clampedDt = Math.min(Math.max(dt, 0), 0.05);
    this.elapsedTime += clampedDt;

    if (this.screenShake > 0) {
      this.screenShake = Math.max(0, this.screenShake - clampedDt * 28);
    }
    if (this.roomTransitionTimer > 0) {
      this.roomTransitionTimer = Math.max(0, this.roomTransitionTimer - clampedDt);
    }
    if (this.banner) {
      this.banner.timer -= clampedDt;
      if (this.banner.timer <= 0) this.banner = null;
    }

    // Edge-triggered bomb & active item inputs
    const bombDown = Boolean(input.bomb);
    if (bombDown && !this.bombKeyWasDown) {
      this.placeBomb();
    }
    this.bombKeyWasDown = bombDown;

    const activeDown = Boolean(input.active);
    if (activeDown && !this.activeKeyWasDown) {
      this.useActiveItem();
    }
    this.activeKeyWasDown = activeDown;

    const room = this.getCurrentRoom();
    this.updatePlayer(clampedDt, input, room);
    this.updateTears(clampedDt, room);
    this.updateEnemies(clampedDt, room);
    this.updateEnemyBullets(clampedDt, room);
    this.updateBombs(clampedDt, room);
    this.updateRoomInteractions(room);
    this.updateParticles(clampedDt);
  }

  updatePlayer(dt, input, room) {
    const p = this.player;
    if (p.invulnTimer > 0) p.invulnTimer = Math.max(0, p.invulnTimer - dt);
    if (p.hurtFlash > 0) p.hurtFlash = Math.max(0, p.hurtFlash - dt);
    if (p.fireCooldown > 0) p.fireCooldown = Math.max(0, p.fireCooldown - dt);
    if (p.blinkTimer > 0) p.blinkTimer = Math.max(0, p.blinkTimer - dt);

    let mx = Number(input.moveX || 0);
    let my = Number(input.moveY || 0);
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }

    // Smooth Isaac-like acceleration & friction
    const accel = 15;
    const targetVx = mx * p.stats.speed;
    const targetVy = my * p.stats.speed;
    p.vx += (targetVx - p.vx) * Math.min(1, accel * dt);
    p.vy += (targetVy - p.vy) * Math.min(1, accel * dt);
    if (Math.abs(p.vx) < 2) p.vx = 0;
    if (Math.abs(p.vy) < 2) p.vy = 0;

    if (len > 0.1) {
      p.facing = { x: mx, y: my };
    }

    this.moveCircleWithCollisions(p, p.vx * dt, p.vy * dt, room, false);

    // Check spikes damage
    const tilePos = worldToTile(p.x, p.y);
    if (
      tilePos.row >= 0 &&
      tilePos.row < GRID_ROWS &&
      tilePos.col >= 0 &&
      tilePos.col < GRID_COLS &&
      room.grid[tilePos.row][tilePos.col] === TILE_TYPES.SPIKES
    ) {
      this.damagePlayer(1);
    }

    // Shooting (4-directional prioritized like Isaac)
    const sx = Number(input.shootX || 0);
    const sy = Number(input.shootY || 0);
    if ((sx !== 0 || sy !== 0) && p.fireCooldown <= 0) {
      let fx = 0;
      let fy = 0;
      if (Math.abs(sx) >= Math.abs(sy)) {
        fx = Math.sign(sx);
      } else {
        fy = Math.sign(sy);
      }
      p.facing = { x: fx, y: fy };
      p.fireCooldown = 1 / Math.max(0.6, p.stats.tearRate);
      p.blinkTimer = 0.12;
      p.eyeToggle = !p.eyeToggle;

      const count = p.stats.shotCount;
      const spread = 0.16;
      for (let i = 0; i < count; i++) {
        const offset = count === 1 ? 0 : (i - (count - 1) / 2) * spread;
        this.tears.push(createTear(p, fx, fy, offset));
      }
      this.emit('tear_fire');
    }

    // Door transition check when room is cleared
    if (room.cleared && this.roomTransitionTimer <= 0) {
      for (const dir of DIR_LIST) {
        const door = room.doors[dir.key];
        if (!door) continue;
        const rect = getDoorRect(dir.key);
        const dist = Math.hypot(p.x - rect.cx, p.y - rect.cy);
        if (dist < 30) {
          if (door.locked) {
            if (p.keys > 0) {
              p.keys -= 1;
              door.locked = false;
              const targetRoom = this.floor.rooms.get(door.toKey);
              if (targetRoom && targetRoom.doors[dir.opposite]) {
                targetRoom.doors[dir.opposite].locked = false;
              }
              this.emit('door_unlock');
              this.enterRoom(door.toKey, dir.key);
              break;
            }
          } else {
            this.emit('door_enter');
            this.enterRoom(door.toKey, dir.key);
            break;
          }
        }
      }
    }
  }

  moveCircleWithCollisions(entity, dx, dy, room, isFlying) {
    const r = entity.radius;
    // Move X
    entity.x += dx;
    if (entity.x - r < ROOM_LEFT) entity.x = ROOM_LEFT + r;
    if (entity.x + r > ROOM_RIGHT) entity.x = ROOM_RIGHT - r;
    if (!isFlying) this.resolveTileCollision(entity, room, true);

    // Move Y
    entity.y += dy;
    if (entity.y - r < ROOM_TOP) entity.y = ROOM_TOP + r;
    if (entity.y + r > ROOM_BOTTOM) entity.y = ROOM_BOTTOM - r;
    if (!isFlying) this.resolveTileCollision(entity, room, false);
  }

  resolveTileCollision(entity, room, horizontal) {
    const { cw, ch } = getCellSize();
    const r = entity.radius;
    const minCol = Math.max(0, Math.floor((entity.x - r - ROOM_LEFT) / cw));
    const maxCol = Math.min(GRID_COLS - 1, Math.floor((entity.x + r - ROOM_LEFT) / cw));
    const minRow = Math.max(0, Math.floor((entity.y - r - ROOM_TOP) / ch));
    const maxRow = Math.min(GRID_ROWS - 1, Math.floor((entity.y + r - ROOM_TOP) / ch));

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        if (!this.isSolidTile(room.grid[row][col])) continue;
        const rx = ROOM_LEFT + col * cw;
        const ry = ROOM_TOP + row * ch;
        const closestX = Math.max(rx, Math.min(entity.x, rx + cw));
        const closestY = Math.max(ry, Math.min(entity.y, ry + ch));
        const distX = entity.x - closestX;
        const distY = entity.y - closestY;
        const distSq = distX * distX + distY * distY;
        if (distSq < r * r) {
          if (horizontal) {
            if (entity.x < rx + cw / 2) entity.x = rx - r;
            else entity.x = rx + cw + r;
          } else {
            if (entity.y < ry + ch / 2) entity.y = ry - r;
            else entity.y = ry + ch + r;
          }
        }
      }
    }
  }

  updateTears(dt, room) {
    for (const tear of this.tears) {
      if (!tear.alive) continue;
      tear.age += dt;

      // Homing (Spoon Bender)
      if (tear.homing && room.enemies.length > 0) {
        let nearest = null;
        let bestDist = 230;
        for (const e of room.enemies) {
          if (!e.alive || e.z > 40) continue;
          const d = Math.hypot(e.x - tear.x, e.y - tear.y);
          if (d < bestDist) {
            bestDist = d;
            nearest = e;
          }
        }
        if (nearest) {
          const speed = Math.hypot(tear.vx, tear.vy);
          const desiredX = ((nearest.x - tear.x) / bestDist) * speed;
          const desiredY = ((nearest.y - tear.y) / bestDist) * speed;
          tear.vx += (desiredX - tear.vx) * Math.min(1, 7 * dt);
          tear.vy += (desiredY - tear.vy) * Math.min(1, 7 * dt);
        }
      }

      tear.x += tear.vx * dt;
      tear.y += tear.vy * dt;

      // Pseudo-3D drop near end of range
      const progress = tear.age / tear.maxFlightTime;
      if (progress > 0.72) {
        const dropFrac = (progress - 0.72) / 0.28;
        tear.z = Math.max(0, 18 * (1 - dropFrac * dropFrac));
        tear.y += 55 * dt;
      }

      // Wall collision (or bounce with Rubber Cement)
      let hitWall = false;
      if (tear.x - tear.radius < ROOM_LEFT || tear.x + tear.radius > ROOM_RIGHT) {
        if (tear.bouncing && tear.bouncesLeft > 0) {
          tear.vx = -tear.vx;
          tear.x = Math.max(ROOM_LEFT + tear.radius, Math.min(ROOM_RIGHT - tear.radius, tear.x));
          tear.bouncesLeft--;
        } else {
          hitWall = true;
        }
      }
      if (tear.y - tear.radius < ROOM_TOP || tear.y + tear.radius > ROOM_BOTTOM) {
        if (tear.bouncing && tear.bouncesLeft > 0) {
          tear.vy = -tear.vy;
          tear.y = Math.max(ROOM_TOP + tear.radius, Math.min(ROOM_BOTTOM - tear.radius, tear.y));
          tear.bouncesLeft--;
        } else {
          hitWall = true;
        }
      }

      // Rock/poop tile collision
      if (!hitWall) {
        const tPos = worldToTile(tear.x, tear.y);
        if (
          tPos.row >= 0 &&
          tPos.row < GRID_ROWS &&
          tPos.col >= 0 &&
          tPos.col < GRID_COLS
        ) {
          const tile = room.grid[tPos.row][tPos.col];
          if (tile === TILE_TYPES.POOP) {
            room.grid[tPos.row][tPos.col] = TILE_TYPES.EMPTY;
            this.addParticles(tear.x, tear.y, '#8d6e63', 8, 110);
            if (this.rng.chance(0.28)) {
              room.pickups.push(createPickup('coin', tear.x, tear.y));
            }
            hitWall = !tear.piercing;
          } else if (tile === TILE_TYPES.ROCK || tile === TILE_TYPES.TINTED_ROCK) {
            if (tear.bouncing && tear.bouncesLeft > 0) {
              tear.vx = -tear.vx;
              tear.vy = -tear.vy;
              tear.bouncesLeft--;
            } else {
              hitWall = true;
            }
          }
        }
      }

      if (hitWall || tear.age >= tear.maxFlightTime) {
        tear.alive = false;
        const splashColor = tear.homing ? '#cc5de8' : tear.poison ? '#69db7c' : '#74c0fc';
        this.addParticles(tear.x, tear.y, splashColor, 5, 85);
        this.emit('tear_splash');
        continue;
      }

      // Enemy hit check
      for (const enemy of room.enemies) {
        if (!enemy.alive || enemy.z > 40) continue;
        if (tear.hitIds.has(enemy.id)) continue;
        const dist = Math.hypot(enemy.x - tear.x, enemy.y - tear.y);
        if (dist < enemy.radius + tear.radius) {
          this.damageEnemy(enemy, tear.damage, tear.vx, tear.vy, tear.poison, room);
          tear.hitIds.add(enemy.id);
          if (!tear.piercing) {
            tear.alive = false;
            const splashColor = tear.homing ? '#cc5de8' : tear.poison ? '#69db7c' : '#74c0fc';
            this.addParticles(tear.x, tear.y, splashColor, 6, 100);
            break;
          }
        }
      }
    }
    this.tears = this.tears.filter((t) => t.alive);
  }

  damageEnemy(enemy, amount, knockVx, knockVy, applyPoison, room) {
    enemy.hp -= amount;
    enemy.hitFlash = 0.14;
    if (applyPoison) {
      enemy.poisonTimer = 3.0;
    }
    // Knockback (lighter on bosses)
    const kbScale = enemy.isBoss ? 0.04 : 0.22;
    const mag = Math.hypot(knockVx, knockVy) || 1;
    enemy.vx += (knockVx / mag) * 140 * kbScale;
    enemy.vy += (knockVy / mag) * 140 * kbScale;

    this.emit('enemy_hit');

    if (enemy.hp <= 0 && enemy.alive) {
      enemy.alive = false;
      this.enemiesKilledCount += 1;
      this.player.score += enemy.score;
      this.addParticles(enemy.x, enemy.y, '#c92a2a', enemy.isBoss ? 32 : 12, enemy.isBoss ? 220 : 140);
      room.bloodStains.push({
        x: enemy.x,
        y: enemy.y,
        r: enemy.isBoss ? 34 : this.rng.range(10, 18)
      });
      this.emit('enemy_die', { isBoss: enemy.isBoss });
    }
  }

  updateEnemies(dt, room) {
    if (room.enemies.length === 0) return;

    const p = this.player;
    for (const e of room.enemies) {
      if (!e.alive) continue;
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);

      // Poison DoT
      if (e.poisonTimer > 0) {
        e.poisonTimer -= dt;
        e.poisonTick += dt;
        if (e.poisonTick >= 0.6) {
          e.poisonTick = 0;
          this.damageEnemy(e, 1.2, 0, 0, false, room);
          if (!e.alive) continue;
        }
      }

      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;

      if (e.type === 'FLY') {
        const wobbleX = Math.sin(this.elapsedTime * 8 + e.id) * 28;
        const wobbleY = Math.cos(this.elapsedTime * 7 + e.id) * 28;
        e.vx += ((nx * e.speed + wobbleX) - e.vx) * Math.min(1, 5 * dt);
        e.vy += ((ny * e.speed + wobbleY) - e.vy) * Math.min(1, 5 * dt);
        this.moveCircleWithCollisions(e, e.vx * dt, e.vy * dt, room, true);
      } else if (e.type === 'GAPER') {
        e.vx += (nx * e.speed - e.vx) * Math.min(1, 6 * dt);
        e.vy += (ny * e.speed - e.vy) * Math.min(1, 6 * dt);
        this.moveCircleWithCollisions(e, e.vx * dt, e.vy * dt, room, false);
      } else if (e.type === 'SPIDER') {
        e.stateTimer -= dt;
        if (e.stateTimer <= 0) {
          if (e.state === 'IDLE') {
            e.state = 'DASH';
            e.stateTimer = 0.32;
            const angle = Math.atan2(dy, dx) + this.rng.range(-0.65, 0.65);
            e.vx = Math.cos(angle) * e.speed;
            e.vy = Math.sin(angle) * e.speed;
          } else {
            e.state = 'IDLE';
            e.stateTimer = this.rng.range(0.35, 0.75);
            e.vx = 0;
            e.vy = 0;
          }
        }
        this.moveCircleWithCollisions(e, e.vx * dt, e.vy * dt, room, false);
      } else if (e.type === 'SHOOTER') {
        // Keep mid distance and shoot blood tears
        const desired = dist > 180 ? 1 : dist < 110 ? -0.8 : 0;
        e.vx += (nx * e.speed * desired - e.vx) * Math.min(1, 4 * dt);
        e.vy += (ny * e.speed * desired - e.vy) * Math.min(1, 4 * dt);
        this.moveCircleWithCollisions(e, e.vx * dt, e.vy * dt, room, true);

        e.fireTimer -= dt;
        if (e.fireTimer <= 0) {
          e.fireTimer = 1.85;
          this.enemyBullets.push(createEnemyBullet(e.x, e.y, nx * 240, ny * 240, 8));
        }
      } else if (e.type === 'CHARGER') {
        e.stateTimer -= dt;
        if (e.state !== 'CHARGE') {
          // Check orthogonal line of sight
          if (Math.abs(dx) < 28 && dist < 340) {
            e.state = 'CHARGE';
            e.chargeDir = { x: 0, y: Math.sign(dy) };
            e.stateTimer = 1.0;
          } else if (Math.abs(dy) < 28 && dist < 340) {
            e.state = 'CHARGE';
            e.chargeDir = { x: Math.sign(dx), y: 0 };
            e.stateTimer = 1.0;
          } else {
            e.vx += (nx * e.speed - e.vx) * Math.min(1, 4 * dt);
            e.vy += (ny * e.speed - e.vy) * Math.min(1, 4 * dt);
          }
        } else {
          e.vx = e.chargeDir.x * 270;
          e.vy = e.chargeDir.y * 270;
          if (e.stateTimer <= 0) e.state = 'IDLE';
        }
        const prevX = e.x;
        const prevY = e.y;
        this.moveCircleWithCollisions(e, e.vx * dt, e.vy * dt, room, false);
        if (e.state === 'CHARGE' && Math.hypot(e.x - prevX, e.y - prevY) < 1) {
          e.state = 'IDLE';
        }
      } else if (e.type === 'MONSTRO') {
        this.updateMonstro(e, dt, nx, ny, room);
      } else if (e.type === 'DUKE') {
        this.updateDuke(e, dt, room);
      } else if (e.type === 'HEART') {
        this.updateHeartBoss(e, dt, nx, ny, room);
      }

      // Contact damage to player (only if enemy is on ground / low altitude)
      if (e.alive && e.z < 28) {
        const contactDist = Math.hypot(p.x - e.x, p.y - e.y);
        if (contactDist < p.radius + e.radius - 3) {
          this.damagePlayer(1);
        }
      }
    }

    room.enemies = room.enemies.filter((e) => e.alive);

    // Check room clear!
    if (!room.cleared && room.enemies.length === 0) {
      this.onRoomCleared(room);
    }
  }

  updateMonstro(e, dt, nx, ny, room) {
    e.stateTimer -= dt;
    if (e.state === 'IDLE') {
      e.vx *= 0.85;
      e.vy *= 0.85;
      if (e.stateTimer <= 0) {
        const roll = this.rng.next();
        if (roll < 0.45) {
          // Spit shotgun blood burst
          e.state = 'SPIT';
          e.stateTimer = 0.55;
          const baseA = Math.atan2(ny, nx);
          for (let i = 0; i < 9; i++) {
            const a = baseA + this.rng.range(-0.48, 0.48);
            const sp = this.rng.range(180, 290);
            this.enemyBullets.push(createEnemyBullet(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, this.rng.range(6, 10)));
          }
          this.emit('boss_roar', { boss: 'MONSTRO' });
        } else {
          // Big leap toward player
          e.state = 'LEAP';
          e.stateTimer = 1.15;
          e.targetX = this.player.x;
          e.targetY = this.player.y;
        }
      }
    } else if (e.state === 'SPIT') {
      if (e.stateTimer <= 0) {
        e.state = 'IDLE';
        e.stateTimer = 0.9;
      }
    } else if (e.state === 'LEAP') {
      const t = 1 - Math.max(0, e.stateTimer) / 1.15;
      e.z = Math.sin(t * Math.PI) * 165;
      e.x += (e.targetX - e.x) * Math.min(1, 3.2 * dt);
      e.y += (e.targetY - e.y) * Math.min(1, 3.2 * dt);
      e.x = Math.max(ROOM_LEFT + e.radius, Math.min(ROOM_RIGHT - e.radius, e.x));
      e.y = Math.max(ROOM_TOP + e.radius, Math.min(ROOM_BOTTOM - e.radius, e.y));
      if (e.stateTimer <= 0) {
        e.z = 0;
        e.state = 'IDLE';
        e.stateTimer = 0.85;
        this.screenShake = Math.max(this.screenShake, 9);
        // Landing radial ring
        for (let i = 0; i < 10; i++) {
          const a = (Math.PI * 2 * i) / 10;
          this.enemyBullets.push(createEnemyBullet(e.x, e.y, Math.cos(a) * 210, Math.sin(a) * 210, 8));
        }
        this.emit('bomb_explode');
      }
    }
  }

  updateDuke(e, dt, room) {
    if (e.vx === 0 && e.vy === 0) {
      e.vx = 95;
      e.vy = 82;
    }
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    if (e.x - e.radius < ROOM_LEFT || e.x + e.radius > ROOM_RIGHT) {
      e.vx = -e.vx;
      e.x = Math.max(ROOM_LEFT + e.radius, Math.min(ROOM_RIGHT - e.radius, e.x));
    }
    if (e.y - e.radius < ROOM_TOP || e.y + e.radius > ROOM_BOTTOM) {
      e.vy = -e.vy;
      e.y = Math.max(ROOM_TOP + e.radius, Math.min(ROOM_BOTTOM - e.radius, e.y));
    }

    e.stateTimer -= dt;
    if (e.stateTimer <= 0) {
      e.stateTimer = 2.4;
      const aliveFlies = room.enemies.filter((x) => x.type === 'FLY' && x.alive).length;
      if (aliveFlies < 4) {
        room.enemies.push(createEnemy('FLY', e.x + 24, e.y, this.floorLevel));
        room.enemies.push(createEnemy('FLY', e.x - 24, e.y, this.floorLevel));
      }
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 * i) / 6 + this.elapsedTime;
        this.enemyBullets.push(createEnemyBullet(e.x, e.y, Math.cos(a) * 195, Math.sin(a) * 195, 8, '#74b816'));
      }
    }
  }

  updateHeartBoss(e, dt, nx, ny, room) {
    // Pulses in center area and fires rotating bullet-hell spirals
    const center = tileToWorld(7, 4);
    e.x += (center.x + Math.sin(this.elapsedTime * 1.1) * 90 - e.x) * Math.min(1, 2 * dt);
    e.y += (center.y + Math.cos(this.elapsedTime * 0.9) * 45 - e.y) * Math.min(1, 2 * dt);

    e.fireTimer -= dt;
    if (e.fireTimer <= 0) {
      e.phase = (e.phase + 1) % 3;
      if (e.phase === 0) {
        e.fireTimer = 1.1;
        for (let i = 0; i < 12; i++) {
          const a = (Math.PI * 2 * i) / 12 + this.elapsedTime * 0.7;
          this.enemyBullets.push(createEnemyBullet(e.x, e.y, Math.cos(a) * 215, Math.sin(a) * 215, 8, '#ff4d6d'));
        }
      } else if (e.phase === 1) {
        e.fireTimer = 1.3;
        const baseA = Math.atan2(ny, nx);
        for (let i = -2; i <= 2; i++) {
          const a = baseA + i * 0.18;
          this.enemyBullets.push(createEnemyBullet(e.x, e.y, Math.cos(a) * 265, Math.sin(a) * 265, 9, '#ff8787'));
        }
      } else {
        e.fireTimer = 2.0;
        const aliveAdds = room.enemies.filter((x) => !x.isBoss && x.alive).length;
        if (aliveAdds < 3) {
          room.enemies.push(createEnemy('FLY', e.x - 45, e.y + 30, this.floorLevel));
          room.enemies.push(createEnemy('FLY', e.x + 45, e.y + 30, this.floorLevel));
        }
      }
    }
  }

  updateEnemyBullets(dt, room) {
    const p = this.player;
    for (const b of this.enemyBullets) {
      if (!b.alive) continue;
      b.age += dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (
        b.age >= b.maxAge ||
        b.x < ROOM_LEFT ||
        b.x > ROOM_RIGHT ||
        b.y < ROOM_TOP ||
        b.y > ROOM_BOTTOM
      ) {
        b.alive = false;
        this.addParticles(b.x, b.y, b.color, 4, 70);
        continue;
      }
      const tPos = worldToTile(b.x, b.y);
      if (
        tPos.row >= 0 &&
        tPos.row < GRID_ROWS &&
        tPos.col >= 0 &&
        tPos.col < GRID_COLS &&
        this.isSolidTile(room.grid[tPos.row][tPos.col])
      ) {
        b.alive = false;
        this.addParticles(b.x, b.y, b.color, 4, 70);
        continue;
      }
      if (Math.hypot(p.x - b.x, p.y - b.y) < p.radius + b.radius - 2) {
        b.alive = false;
        this.damagePlayer(1);
      }
    }
    this.enemyBullets = this.enemyBullets.filter((b) => b.alive);
  }

  updateBombs(dt, room) {
    for (const bomb of this.bombs) {
      if (bomb.exploded) continue;
      bomb.fuse -= dt;
      if (bomb.fuse <= 0) {
        bomb.exploded = true;
        this.detonateBomb(bomb, room);
      }
    }
    this.bombs = this.bombs.filter((b) => !b.exploded);
  }

  detonateBomb(bomb, room) {
    this.screenShake = Math.max(this.screenShake, 14);
    this.addParticles(bomb.x, bomb.y, '#ff922b', 22, 240);
    this.addParticles(bomb.x, bomb.y, '#ffe066', 14, 180);
    this.emit('bomb_explode');

    // Destroy rocks, tinted rocks, poop within blast radius
    const { cw, ch } = getCellSize();
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const tile = room.grid[r][c];
        if (!this.isSolidTile(tile)) continue;
        const cx = ROOM_LEFT + (c + 0.5) * cw;
        const cy = ROOM_TOP + (r + 0.5) * ch;
        if (Math.hypot(cx - bomb.x, cy - bomb.y) <= bomb.blastRadius) {
          room.grid[r][c] = TILE_TYPES.EMPTY;
          this.addParticles(cx, cy, '#868e96', 8, 130);
          if (tile === TILE_TYPES.TINTED_ROCK) {
            room.pickups.push(createPickup('soul_heart', cx, cy));
            room.pickups.push(createPickup('key', cx + 16, cy));
          }
        }
      }
    }

    // Damage enemies in blast radius
    for (const e of room.enemies) {
      if (!e.alive || e.z > 40) continue;
      if (Math.hypot(e.x - bomb.x, e.y - bomb.y) <= bomb.blastRadius + e.radius) {
        this.damageEnemy(e, 45, e.x - bomb.x, e.y - bomb.y, false, room);
      }
    }

    // Damage player if too close
    if (Math.hypot(this.player.x - bomb.x, this.player.y - bomb.y) <= bomb.blastRadius * 0.72) {
      this.damagePlayer(2);
    }
  }

  onRoomCleared(room) {
    room.cleared = true;
    this.roomsClearedCount += 1;
    this.emit('door_open');

    // Charge active item +1 bar
    if (this.player.activeItem) {
      this.player.activeItem.charge = Math.min(
        this.player.activeItem.maxCharge,
        this.player.activeItem.charge + 1
      );
    }

    const center = tileToWorld(7, 4);
    if (room.type === ROOM_TYPES.BOSS) {
      // Drop Boss pool passive item
      const bossItem = pickItemFromPool(this.rng, 'boss', this.player.ownedItemIds);
      room.pedestals.push({ col: 7, row: 5, item: bossItem, taken: false });
      // Spawn Trapdoor (next floor) or Golden Victory Chest (final floor)
      if (this.floorLevel < this.maxFloors) {
        const td = tileToWorld(7, 2);
        room.trapdoor = { x: td.x, y: td.y, radius: 24, cooldown: 0.7 };
      } else {
        const vc = tileToWorld(7, 2);
        room.victoryChest = { x: vc.x, y: vc.y, radius: 26, cooldown: 0.7 };
      }
    } else if (room.type === ROOM_TYPES.NORMAL) {
      // Room clear reward drop
      const roll = this.rng.next();
      if (roll < 0.30) {
        room.pickups.push(createPickup('coin', center.x, center.y));
      } else if (roll < 0.52) {
        room.pickups.push(createPickup('red_heart', center.x, center.y));
      } else if (roll < 0.68) {
        room.pickups.push(createPickup('bomb', center.x, center.y));
      } else if (roll < 0.84) {
        room.pickups.push(createPickup('key', center.x, center.y));
      } else if (roll < 0.94) {
        room.pickups.push(createPickup('soul_heart', center.x, center.y));
      }
    }
  }

  updateRoomInteractions(room) {
    const p = this.player;

    // Pickups
    for (const pickup of room.pickups) {
      if (pickup.collected) continue;
      if (Math.hypot(p.x - pickup.x, p.y - pickup.y) < p.radius + 16) {
        if (this.collectPickup(pickup)) {
          pickup.collected = true;
        }
      }
    }
    room.pickups = room.pickups.filter((pk) => !pk.collected);

    // Item pedestals
    for (const ped of room.pedestals) {
      if (ped.taken) continue;
      const pos = tileToWorld(ped.col, ped.row);
      if (Math.hypot(p.x - pos.x, p.y - pos.y) < p.radius + 22) {
        ped.taken = true;
        this.applyPassiveItem(ped.item);
      }
    }

    // Shop items
    for (const sItem of room.shopItems) {
      if (sItem.bought) continue;
      const pos = tileToWorld(sItem.col, sItem.row);
      if (Math.hypot(p.x - pos.x, p.y - pos.y) < p.radius + 22) {
        if (p.coins >= sItem.price) {
          if (sItem.kind === 'item') {
            p.coins -= sItem.price;
            sItem.bought = true;
            this.applyPassiveItem(sItem.item);
          } else if (sItem.kind === 'pickup') {
            const tempPickup = createPickup(sItem.pickupType, pos.x, pos.y);
            if (this.collectPickup(tempPickup)) {
              p.coins -= sItem.price;
              sItem.bought = true;
            }
          }
        }
      }
    }

    // Trapdoor to next floor
    if (room.trapdoor) {
      if (room.trapdoor.cooldown > 0) {
        room.trapdoor.cooldown = Math.max(0, room.trapdoor.cooldown - 0.016);
      } else if (Math.hypot(p.x - room.trapdoor.x, p.y - room.trapdoor.y) < p.radius + 16) {
        this.emit('floor_descend');
        this.loadFloor(this.floorLevel + 1);
      }
    }

    // Victory Golden Chest on final floor
    if (room.victoryChest) {
      if (room.victoryChest.cooldown > 0) {
        room.victoryChest.cooldown = Math.max(0, room.victoryChest.cooldown - 0.016);
      } else if (Math.hypot(p.x - room.victoryChest.x, p.y - room.victoryChest.y) < p.radius + 20) {
        this.status = 'VICTORY';
        this.player.score += 1000;
        this.emit('victory', { score: this.player.score });
      }
    }
  }

  updateParticles(dt) {
    for (const pt of this.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.92;
      pt.vy *= 0.92;
      pt.life -= dt;
    }
    this.particles = this.particles.filter((pt) => pt.life > 0);
  }
}
