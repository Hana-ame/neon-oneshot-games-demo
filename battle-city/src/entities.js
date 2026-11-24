import {
  DIR,
  DIR_VECTORS,
  TANK_SIZE,
  BULLET_SIZE,
  ENEMY_SPECS,
  PLAYER_LEVEL_SPECS,
  TIMINGS,
} from './constants.js';

let nextEntityId = 1;
export function genId(prefix = 'e') {
  return `${prefix}_${nextEntityId++}`;
}

export function resetEntityIdCounter() {
  nextEntityId = 1;
}

export class Tank {
  constructor({
    id = genId('tank'),
    x,
    y,
    dir = DIR.UP,
    isPlayer = false,
    playerIndex = 0,
    enemyType = null,
    isBonus = false,
    level = 0,
  }) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.width = TANK_SIZE;
    this.height = TANK_SIZE;
    this.dir = dir;
    this.isPlayer = isPlayer;
    this.playerIndex = playerIndex;
    this.enemyType = enemyType;
    this.isBonus = isBonus;
    this.level = isPlayer ? Math.max(0, Math.min(3, level)) : 0;

    if (isPlayer) {
      const spec = PLAYER_LEVEL_SPECS[this.level];
      this.hp = 1;
      this.maxHp = 1;
      this.speed = spec.speed;
      this.bulletSpeed = spec.bulletSpeed;
      this.maxBullets = spec.maxBullets;
      this.canBreakSteel = spec.canBreakSteel;
      this.fireCooldownDuration = spec.fireCooldown;
    } else {
      const spec = ENEMY_SPECS[enemyType];
      this.hp = spec.hp;
      this.maxHp = spec.hp;
      this.speed = spec.speed;
      this.bulletSpeed = spec.bulletSpeed;
      this.maxBullets = 1;
      this.canBreakSteel = false;
      this.fireCooldownDuration = spec.fireInterval;
    }

    this.alive = true;
    this.fireCooldown = isPlayer ? 0 : 0.6 + Math.random() * 0.7;
    this.shieldTimer = isPlayer ? TIMINGS.PLAYER_RESPAWN_SHIELD : 0;
    this.trackAnim = 0;
    this.moving = false;
    this.iceSlideTimer = 0;
    this.aiDecisionTimer = 0.6 + Math.random() * 1.2;
    this.hitFlashTimer = 0;
  }

  upgrade() {
    if (!this.isPlayer) return;
    this.level = Math.min(3, this.level + 1);
    const spec = PLAYER_LEVEL_SPECS[this.level];
    this.speed = spec.speed;
    this.bulletSpeed = spec.bulletSpeed;
    this.maxBullets = spec.maxBullets;
    this.canBreakSteel = spec.canBreakSteel;
    this.fireCooldownDuration = spec.fireCooldown;
  }

  getCenter() {
    return {
      x: this.x + this.width / 2,
      y: this.y + this.height / 2,
    };
  }

  getMuzzlePosition() {
    const cx = this.x + this.width / 2;
    const cy = this.y + this.height / 2;
    const halfB = BULLET_SIZE / 2;
    switch (this.dir) {
      case DIR.UP:
        return { x: cx - halfB, y: this.y - BULLET_SIZE + 2 };
      case DIR.DOWN:
        return { x: cx - halfB, y: this.y + this.height - 2 };
      case DIR.LEFT:
        return { x: this.x - BULLET_SIZE + 2, y: cy - halfB };
      case DIR.RIGHT:
      default:
        return { x: this.x + this.width - 2, y: cy - halfB };
    }
  }
}

export class Bullet {
  constructor({ ownerId, isPlayer, playerIndex = 0, x, y, dir, speed, canBreakSteel = false }) {
    this.id = genId('bul');
    this.ownerId = ownerId;
    this.isPlayer = isPlayer;
    this.playerIndex = playerIndex;
    this.x = x;
    this.y = y;
    this.width = BULLET_SIZE;
    this.height = BULLET_SIZE;
    this.dir = dir;
    this.speed = speed;
    this.canBreakSteel = canBreakSteel;
    this.alive = true;
  }

  step(dt) {
    const v = DIR_VECTORS[this.dir];
    this.x += v.dx * this.speed * dt;
    this.y += v.dy * this.speed * dt;
  }
}

export class PowerUp {
  constructor({ type, x, y }) {
    this.id = genId('pwr');
    this.type = type;
    this.x = x;
    this.y = y;
    this.width = 28;
    this.height = 28;
    this.timer = TIMINGS.POWERUP_LIFETIME;
    this.alive = true;
  }
}

export class Explosion {
  constructor({ x, y, big = false }) {
    this.id = genId('exp');
    this.x = x;
    this.y = y;
    this.big = big;
    this.duration = big ? 0.52 : 0.24;
    this.elapsed = 0;
    this.alive = true;
  }

  update(dt) {
    this.elapsed += dt;
    if (this.elapsed >= this.duration) {
      this.alive = false;
    }
  }
}

export class FloatingText {
  constructor({ x, y, text, color = '#ffffff' }) {
    this.id = genId('txt');
    this.x = x;
    this.y = y;
    this.text = text;
    this.color = color;
    this.elapsed = 0;
    this.duration = 0.85;
    this.alive = true;
  }

  update(dt) {
    this.elapsed += dt;
    this.y -= 18 * dt;
    if (this.elapsed >= this.duration) {
      this.alive = false;
    }
  }
}

export class SpawnEffect {
  constructor({ x, y, isPlayer = false, playerIndex = 0, enemyType = null, isBonus = false }) {
    this.id = genId('spw');
    this.x = x;
    this.y = y;
    this.isPlayer = isPlayer;
    this.playerIndex = playerIndex;
    this.enemyType = enemyType;
    this.isBonus = isBonus;
    this.elapsed = 0;
    this.duration = TIMINGS.SPAWN_ANIM_DURATION;
    this.done = false;
  }

  update(dt) {
    this.elapsed += dt;
    if (this.elapsed >= this.duration) {
      this.done = true;
    }
  }
}

export function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}
