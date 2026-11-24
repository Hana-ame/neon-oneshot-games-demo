import {
  BASE_PLAYER_STATS,
  ENEMY_CONFIGS,
  GRID_COLS,
  GRID_ROWS,
  ROOM_LEFT,
  ROOM_TOP,
  ROOM_WIDTH,
  ROOM_HEIGHT
} from './constants.js';
import { ACTIVE_ITEMS } from './items.js';

export function getCellSize() {
  return {
    cw: ROOM_WIDTH / GRID_COLS,
    ch: ROOM_HEIGHT / GRID_ROWS
  };
}

export function tileToWorld(col, row) {
  const { cw, ch } = getCellSize();
  return {
    x: ROOM_LEFT + (col + 0.5) * cw,
    y: ROOM_TOP + (row + 0.5) * ch
  };
}

export function worldToTile(x, y) {
  const { cw, ch } = getCellSize();
  return {
    col: Math.floor((x - ROOM_LEFT) / cw),
    row: Math.floor((y - ROOM_TOP) / ch)
  };
}

export function createPlayer() {
  const center = tileToWorld(7, 4);
  return {
    x: center.x,
    y: center.y,
    vx: 0,
    vy: 0,
    radius: 16,
    facing: { x: 0, y: 1 },
    fireCooldown: 0,
    invulnTimer: 0,
    hurtFlash: 0,
    blinkTimer: 0,
    eyeToggle: false,
    coins: 3,
    bombs: 2,
    keys: 1,
    stats: { ...BASE_PLAYER_STATS },
    ownedItems: [],
    ownedItemIds: new Set(),
    activeItem: {
      ...ACTIVE_ITEMS.yum_heart,
      charge: ACTIVE_ITEMS.yum_heart.maxCharge
    },
    score: 0
  };
}

let nextEntityId = 1;

export function createEnemy(type, x, y, floorLevel = 1) {
  const cfg = ENEMY_CONFIGS[type] || ENEMY_CONFIGS.FLY;
  const hpScale = cfg.isBoss ? 1 + (floorLevel - 1) * 0.15 : 1 + (floorLevel - 1) * 0.2;
  const maxHp = Math.round(cfg.hp * hpScale);
  return {
    id: nextEntityId++,
    type: cfg.id,
    name: cfg.name,
    x,
    y,
    vx: 0,
    vy: 0,
    z: 0, // vertical height for jumping bosses
    vz: 0,
    radius: cfg.radius,
    hp: maxHp,
    maxHp,
    speed: cfg.speed,
    flying: Boolean(cfg.flying),
    isBoss: Boolean(cfg.isBoss),
    color: cfg.color,
    accent: cfg.accent,
    score: cfg.score,
    hitFlash: 0,
    poisonTimer: 0,
    poisonTick: 0,
    state: 'IDLE',
    stateTimer: 0.6 + Math.random() * 0.5,
    fireTimer: cfg.fireInterval ? cfg.fireInterval * 0.7 : 1.5,
    chargeDir: { x: 0, y: 0 },
    targetX: x,
    targetY: y,
    phase: 0,
    alive: true
  };
}

export function createTear(player, dirX, dirY, angleOffset = 0) {
  const baseAngle = Math.atan2(dirY, dirX) + angleOffset;
  const cos = Math.cos(baseAngle);
  const sin = Math.sin(baseAngle);
  // Classic Binding of Isaac tear physics: inherits ~32% of player velocity
  const vx = cos * player.stats.tearSpeed + player.vx * 0.32;
  const vy = sin * player.stats.tearSpeed + player.vy * 0.32;
  const damage = +(player.stats.damage * player.stats.damageMultiplier).toFixed(2);
  const maxFlightTime = Math.max(0.25, player.stats.range / Math.max(180, player.stats.tearSpeed));

  return {
    id: nextEntityId++,
    x: player.x + cos * 12,
    y: player.y + sin * 12,
    vx,
    vy,
    z: 18,
    radius: player.stats.tearSize,
    damage,
    age: 0,
    maxFlightTime,
    homing: player.stats.homing,
    piercing: player.stats.piercing,
    bouncing: player.stats.bouncing,
    bouncesLeft: player.stats.bouncing ? 2 : 0,
    poison: player.stats.poison,
    hitIds: new Set(),
    alive: true
  };
}

export function createEnemyBullet(x, y, vx, vy, radius = 8, color = '#e03131') {
  return {
    id: nextEntityId++,
    x,
    y,
    vx,
    vy,
    radius,
    color,
    age: 0,
    maxAge: 2.8,
    alive: true
  };
}

export function createBomb(x, y) {
  return {
    id: nextEntityId++,
    x,
    y,
    fuse: 1.5,
    maxFuse: 1.5,
    radius: 13,
    blastRadius: 105,
    exploded: false
  };
}

export function createPickup(type, x, y) {
  return {
    id: nextEntityId++,
    type, // 'red_heart' | 'half_heart' | 'soul_heart' | 'coin' | 'bomb' | 'key'
    x,
    y,
    bobPhase: Math.random() * Math.PI * 2,
    collected: false
  };
}
