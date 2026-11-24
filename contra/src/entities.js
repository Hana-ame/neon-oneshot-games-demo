// 实体类定义：玩家、子弹、敌人、飞碟胶囊、武器掉落、爆破桥、Boss与粒子

import {
  GRAVITY,
  MAX_FALL_SPEED,
  PLAYER_CONFIG,
  WEAPONS
} from './constants.js';

export function aabbOverlap(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

export class Player {
  constructor(x, y, lives = PLAYER_CONFIG.DEFAULT_LIVES) {
    this.x = x;
    this.y = y;
    this.w = PLAYER_CONFIG.WIDTH;
    this.h = PLAYER_CONFIG.HEIGHT;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1; // 1 = 右, -1 = 左
    this.aimX = 1;
    this.aimY = 0;
    this.onGround = false;
    this.inWater = false;
    this.prone = false;
    this.dropThroughTimer = 0;
    this.weaponId = 'R';
    this.fireCooldown = 0;
    this.invincibleTimer = PLAYER_CONFIG.INVINCIBLE_DURATION;
    this.lives = lives;
    this.alive = true;
    this.respawnTimer = 0;
    this.animTimer = 0;
    this.spinAngle = 0;
  }

  getHitbox() {
    if (this.prone && this.onGround && !this.inWater) {
      return {
        x: this.x - 4,
        y: this.y + (PLAYER_CONFIG.HEIGHT - PLAYER_CONFIG.PRONE_HEIGHT),
        w: PLAYER_CONFIG.PRONE_WIDTH,
        h: PLAYER_CONFIG.PRONE_HEIGHT
      };
    }
    if (this.inWater) {
      return {
        x: this.x,
        y: this.y + (PLAYER_CONFIG.HEIGHT - PLAYER_CONFIG.SWIM_HEIGHT),
        w: this.w,
        h: PLAYER_CONFIG.SWIM_HEIGHT
      };
    }
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  getMuzzlePosition() {
    const hb = this.getHitbox();
    if (this.prone && this.onGround && !this.inWater) {
      return {
        x: this.facing > 0 ? hb.x + hb.w : hb.x,
        y: hb.y + 4
      };
    }
    const cx = hb.x + hb.w / 2;
    const cy = hb.y + 11;
    return {
      x: cx + this.aimX * 11,
      y: cy + this.aimY * 11
    };
  }

  computeAim(input) {
    let dx = 0;
    let dy = 0;
    if (input.left) dx -= 1;
    if (input.right) dx += 1;
    if (input.up) dy -= 1;
    if (input.down) dy += 1;

    if (dx !== 0) {
      this.facing = dx > 0 ? 1 : -1;
    }

    // 站立在地面且只按“下”键时进入匍匐状态，水平向前射击
    if (this.onGround && !this.inWater && input.down && dx === 0 && !input.up) {
      this.prone = true;
      this.aimX = this.facing;
      this.aimY = 0;
      return;
    }
    this.prone = false;

    if (dx === 0 && dy === 0) {
      this.aimX = this.facing;
      this.aimY = 0;
    } else if (dx === 0 && dy < 0) {
      this.aimX = 0;
      this.aimY = -1;
    } else if (dx === 0 && dy > 0 && !this.onGround) {
      this.aimX = 0;
      this.aimY = 1;
    } else if (dx !== 0 && dy !== 0) {
      const inv = 1 / Math.SQRT2;
      this.aimX = dx * inv;
      this.aimY = dy * inv;
    } else {
      this.aimX = dx !== 0 ? dx : this.facing;
      this.aimY = 0;
    }
  }

  fire(bullets) {
    const weapon = WEAPONS[this.weaponId] || WEAPONS.R;
    if (this.fireCooldown > 0) return [];

    const activePlayerBullets = bullets.filter((b) => b.fromPlayer).length;
    if (activePlayerBullets >= weapon.maxBullets) return [];

    const muzzle = this.getMuzzlePosition();
    const baseAngle = Math.atan2(this.aimY, this.aimX);
    const created = [];

    if (weapon.spreadAngles) {
      for (const offset of weapon.spreadAngles) {
        const angle = baseAngle + offset;
        created.push(
          new Bullet({
            x: muzzle.x,
            y: muzzle.y,
            vx: Math.cos(angle) * weapon.speed,
            vy: Math.sin(angle) * weapon.speed,
            fromPlayer: true,
            weaponId: weapon.id,
            damage: weapon.damage,
            color: weapon.color,
            radius: weapon.radius,
            pierce: weapon.pierce,
            spiral: Boolean(weapon.spiral)
          })
        );
      }
    } else {
      created.push(
        new Bullet({
          x: muzzle.x,
          y: muzzle.y,
          vx: Math.cos(baseAngle) * weapon.speed,
          vy: Math.sin(baseAngle) * weapon.speed,
          fromPlayer: true,
          weaponId: weapon.id,
          damage: weapon.damage,
          color: weapon.color,
          radius: weapon.radius,
          pierce: weapon.pierce,
          spiral: Boolean(weapon.spiral)
        })
      );
    }

    this.fireCooldown = weapon.cooldown;
    return created;
  }
}

export class Bullet {
  constructor({
    x,
    y,
    vx,
    vy,
    fromPlayer = true,
    weaponId = 'R',
    damage = 1,
    color = '#fef08a',
    radius = 3,
    pierce = false,
    spiral = false
  }) {
    this.x = x;
    this.y = y;
    this.baseX = x;
    this.baseY = y;
    this.vx = vx;
    this.vy = vy;
    this.fromPlayer = fromPlayer;
    this.weaponId = weaponId;
    this.damage = damage;
    this.color = color;
    this.radius = radius;
    this.pierce = pierce;
    this.spiral = spiral;
    this.age = 0;
    this.alive = true;
    this.hitIds = new Set();
  }

  getHitbox() {
    return {
      x: this.x - this.radius,
      y: this.y - this.radius,
      w: this.radius * 2,
      h: this.radius * 2
    };
  }

  update(dt) {
    this.age += dt;
    this.baseX += this.vx * dt;
    this.baseY += this.vy * dt;
    if (this.spiral) {
      const speed = Math.hypot(this.vx, this.vy) || 1;
      const perpX = -this.vy / speed;
      const perpY = this.vx / speed;
      const offset = Math.sin(this.age * 24) * 10;
      this.x = this.baseX + perpX * offset;
      this.y = this.baseY + perpY * offset;
    } else {
      this.x = this.baseX;
      this.y = this.baseY;
    }
    if (this.age > 3.0) {
      this.alive = false;
    }
  }
}

let nextEntityId = 1;

export class Enemy {
  constructor({ x, y, type }) {
    this.id = nextEntityId++;
    this.x = x;
    this.y = y;
    this.type = type; // 'runner' | 'sniper' | 'turret'
    this.w = type === 'turret' ? 22 : 16;
    this.h = type === 'turret' ? 22 : 28;
    this.vx = type === 'runner' ? -62 : 0;
    this.vy = 0;
    this.hp = type === 'turret' ? 4 : type === 'sniper' ? 2 : 1;
    this.maxHp = this.hp;
    this.facing = -1;
    this.fireTimer = type === 'turret' ? 1.1 : 0.9;
    this.animTimer = 0;
    this.alive = true;
    this.onGround = false;
  }

  getHitbox() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }
}

export class FlyingCapsule {
  constructor({ x, y, weapon }) {
    this.id = nextEntityId++;
    this.x = x;
    this.baseY = y;
    this.y = y;
    this.w = 24;
    this.h = 14;
    this.vx = 92;
    this.weapon = weapon;
    this.age = 0;
    this.alive = true;
  }

  getHitbox() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  update(dt) {
    this.age += dt;
    this.x += this.vx * dt;
    this.y = this.baseY + Math.sin(this.age * 5.2) * 18;
  }
}

export class Powerup {
  constructor({ x, y, weapon }) {
    this.id = nextEntityId++;
    this.x = x;
    this.y = y;
    this.w = 20;
    this.h = 16;
    this.vx = 38;
    this.vy = -170;
    this.weapon = weapon;
    this.alive = true;
    this.onGround = false;
  }

  getHitbox() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  update(dt, platforms) {
    if (!this.onGround) {
      this.vy = Math.min(MAX_FALL_SPEED, this.vy + GRAVITY * 0.72 * dt);
      const prevBottom = this.y + this.h;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      for (const p of platforms) {
        const horiz = this.x + this.w > p.x && this.x < p.x + p.w;
        if (horiz && this.vy >= 0 && prevBottom <= p.y + 6 && this.y + this.h >= p.y) {
          this.y = p.y - this.h;
          this.vy = 0;
          this.vx = 0;
          this.onGround = true;
          break;
        }
      }
    }
  }
}

export class Bridge {
  constructor({ x, y, segments, segW }) {
    this.x = x;
    this.y = y;
    this.segW = segW;
    this.triggered = false;
    this.explodeIndex = 0;
    this.explodeTimer = 0;
    this.segments = Array.from({ length: segments }, (_, i) => ({
      x: x + i * segW,
      y,
      w: segW,
      h: 14,
      intact: true
    }));
  }
}

export class Boss {
  constructor(cfg) {
    this.kind = cfg.kind;
    this.name = cfg.name;
    this.x = cfg.x;
    this.y = cfg.y;
    this.w = cfg.w;
    this.h = cfg.h;
    this.core = {
      id: nextEntityId++,
      x: cfg.coreX,
      y: cfg.coreY,
      w: cfg.coreW,
      h: cfg.coreH,
      hp: cfg.coreHp,
      maxHp: cfg.coreHp,
      alive: true,
      fireTimer: 1.6
    };
    this.turrets = cfg.turrets.map((t) => ({
      id: nextEntityId++,
      x: t.x,
      y: t.y,
      w: 22,
      h: 22,
      hp: t.hp,
      maxHp: t.hp,
      alive: true,
      fireTimer: 1.0 + Math.random() * 0.6
    }));
    this.defeated = false;
    this.flashTimer = 0;
  }

  getTotalHp() {
    const tHp = this.turrets.reduce((sum, t) => sum + (t.alive ? Math.max(0, t.hp) : 0), 0);
    return tHp + (this.core.alive ? Math.max(0, this.core.hp) : 0);
  }

  getMaxTotalHp() {
    const tMax = this.turrets.reduce((sum, t) => sum + t.maxHp, 0);
    return tMax + this.core.maxHp;
  }
}

export class Particle {
  constructor({ x, y, vx, vy, color, size = 3, life = 0.45 }) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.color = color;
    this.size = size;
    this.life = life;
    this.maxLife = life;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vy += 120 * dt;
    this.life -= dt;
  }
}

export class FloatingText {
  constructor({ x, y, text, color = '#fde047' }) {
    this.x = x;
    this.y = y;
    this.text = text;
    this.color = color;
    this.life = 0.85;
  }

  update(dt) {
    this.y -= 28 * dt;
    this.life -= dt;
  }
}
