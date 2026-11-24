/**
 * 无头核心游戏引擎（Headless Simulation Engine）
 * 与 DOM/Canvas 完全解耦，支持在浏览器 60FPS 运行，也支持在 Node.js 中直接执行确定性单元测试
 */

import { PHYSICS, PLAYER_CONFIG, TILE, TILE_SIZE, GAME_STATE } from './constants.js';
import { RAW_LEVELS, parseLevel } from './levels.js';
import {
  rectsOverlap,
  circleRectOverlap,
  getTileAt,
  isSolidTile,
  moveAndCollide,
  isOnVine,
  detectLedgeGrab
} from './physics.js';

export function createPlayer(spawn) {
  return {
    x: spawn.x,
    y: spawn.y,
    w: PLAYER_CONFIG.WIDTH,
    h: PLAYER_CONFIG.HEIGHT,
    vx: 0,
    vy: 0,
    facing: 1,
    hp: PLAYER_CONFIG.MAX_HP,
    maxHp: PLAYER_CONFIG.MAX_HP,
    onGround: false,
    onVine: false,
    ledgeGrab: null,
    coyoteTimer: 0,
    jumpBuffer: 0,
    rollTimer: 0,
    rollCooldown: 0,
    fireCooldown: 0,
    invulnTimer: 0,
    muzzleFlash: 0,
    animTime: 0,
    braidPoints: [
      { x: spawn.x, y: spawn.y },
      { x: spawn.x - 6, y: spawn.y + 4 },
      { x: spawn.x - 12, y: spawn.y + 10 }
    ],
    respawnX: spawn.x,
    respawnY: spawn.y
  };
}

export class TombRaiderEngine {
  constructor(options = {}) {
    this.onSfx = options.onSfx || (() => {});
    this.onToast = options.onToast || (() => {});
    this.state = GAME_STATE.TITLE;
    this.levelIndex = 0;
    this.level = null;
    this.player = null;
    this.bullets = [];
    this.enemyProjectiles = [];
    this.particles = [];
    this.floatingTexts = [];
    this.score = 0;
    this.totalRelicsCollected = 0;
    this.elapsedTime = 0;
    this.shakeTimer = 0;
    this.shakeIntensity = 0;
    this.camera = { x: 0, y: 0 };
    this.time = 0;
    this.loadLevel(0, false);
  }

  getTotalLevels() {
    return RAW_LEVELS.length;
  }

  loadLevel(index, setPlaying = true) {
    this.levelIndex = Math.max(0, Math.min(index, RAW_LEVELS.length - 1));
    this.level = parseLevel(this.levelIndex);
    this.player = createPlayer(this.level.spawn);
    this.bullets = [];
    this.enemyProjectiles = [];
    this.particles = [];
    this.floatingTexts = [];
    this.shakeTimer = 0;
    this.shakeIntensity = 0;
    if (setPlaying) {
      this.state = GAME_STATE.PLAYING;
    }
    this.onToast(this.level.name);
  }

  startNewGame(levelIndex = 0) {
    this.score = 0;
    this.totalRelicsCollected = 0;
    this.elapsedTime = 0;
    this.loadLevel(levelIndex, true);
  }

  togglePause() {
    if (this.state === GAME_STATE.PLAYING) {
      this.state = GAME_STATE.PAUSED;
    } else if (this.state === GAME_STATE.PAUSED) {
      this.state = GAME_STATE.PLAYING;
    }
  }

  nextLevel() {
    if (this.levelIndex + 1 < RAW_LEVELS.length) {
      this.loadLevel(this.levelIndex + 1, true);
    } else {
      this.state = GAME_STATE.VICTORY;
      this.onSfx('victory');
    }
  }

  spawnParticles(x, y, color, count = 8, speed = 120) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
      const spd = speed * (0.4 + Math.random() * 0.7);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd - 40,
        life: 0.35 + Math.random() * 0.35,
        maxLife: 0.7,
        size: 2.5 + Math.random() * 3,
        color
      });
    }
  }

  addFloatingText(x, y, text, color = '#f5b82e') {
    this.floatingTexts.push({
      x,
      y,
      text,
      color,
      life: 1.1
    });
  }

  triggerShake(intensity = 6, duration = 0.2) {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    this.shakeTimer = Math.max(this.shakeTimer, duration);
  }

  damagePlayer(amount, knockDir = 0) {
    const p = this.player;
    if (p.invulnTimer > 0 || p.rollTimer > 0 || this.state !== GAME_STATE.PLAYING) {
      return false;
    }
    p.hp = Math.max(0, p.hp - amount);
    p.invulnTimer = PLAYER_CONFIG.INVULN_TIME;
    p.ledgeGrab = null;
    if (knockDir !== 0) {
      p.vx = knockDir * 220;
      p.vy = -240;
    }
    this.triggerShake(7, 0.22);
    this.spawnParticles(p.x + p.w / 2, p.y + p.h / 2, '#e5484d', 10, 150);
    this.addFloatingText(p.x + p.w / 2, p.y - 8, `-${amount}`, '#ff6b6b');
    this.onSfx('hurt');

    if (p.hp <= 0) {
      this.state = GAME_STATE.GAME_OVER;
      this.onSfx('gameover');
    }
    return true;
  }

  respawnAtCheckpoint(penalty = 20) {
    const p = this.player;
    const alive = p.hp - penalty > 0;
    p.hp = Math.max(0, p.hp - penalty);
    p.invulnTimer = PLAYER_CONFIG.INVULN_TIME;
    p.ledgeGrab = null;
    p.onVine = false;
    p.vx = 0;
    p.vy = 0;
    this.triggerShake(8, 0.25);
    this.onSfx('hurt');
    if (!alive) {
      this.state = GAME_STATE.GAME_OVER;
      this.onSfx('gameover');
    } else {
      p.x = p.respawnX;
      p.y = p.respawnY;
      this.addFloatingText(p.x + p.w / 2, p.y - 12, '返回存档点', '#fbbf24');
    }
  }

  /**
   * 固定步长更新一帧
   * @param {number} dt 时间增量（秒）
   * @param {object} input 归一化输入状态 { left, right, up, down, jump, jumpPressed, shoot, rollPressed, interactPressed }
   */
  step(dt, input = {}) {
    this.time += dt;
    if (this.state !== GAME_STATE.PLAYING) return;

    this.elapsedTime += dt;
    if (this.shakeTimer > 0) {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
      if (this.shakeTimer === 0) this.shakeIntensity = 0;
    }

    this.updatePlayer(dt, input);
    this.updateCrates(dt);
    this.updateCrumbleBlocks(dt);
    this.updatePlatesLeversDoors(dt, input);
    this.updateDartTraps(dt);
    this.updateBoulders(dt);
    this.updateBullets(dt);
    this.updateEnemyProjectiles(dt);
    this.updateEnemies(dt);
    this.updateBoss(dt);
    this.updateCollectiblesAndExit();
    this.updateParticlesAndTexts(dt);
    this.updateBraid(dt);
  }

  updatePlayer(dt, input) {
    const p = this.player;
    const lvl = this.level;

    p.animTime += dt;
    if (p.invulnTimer > 0) p.invulnTimer = Math.max(0, p.invulnTimer - dt);
    if (p.fireCooldown > 0) p.fireCooldown = Math.max(0, p.fireCooldown - dt);
    if (p.rollCooldown > 0) p.rollCooldown = Math.max(0, p.rollCooldown - dt);
    if (p.muzzleFlash > 0) p.muzzleFlash = Math.max(0, p.muzzleFlash - dt);

    if (input.jumpPressed) {
      p.jumpBuffer = PHYSICS.JUMP_BUFFER;
    } else if (p.jumpBuffer > 0) {
      p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
    }

    // 抓崖状态处理
    if (p.ledgeGrab) {
      p.vx = 0;
      p.vy = 0;
      if (input.up || input.jumpPressed) {
        p.x = p.ledgeGrab.pullUpX;
        p.y = p.ledgeGrab.pullUpY;
        p.ledgeGrab = null;
        p.onGround = true;
        p.jumpBuffer = 0;
        this.onSfx('ledge');
      } else if (input.down) {
        p.ledgeGrab = null;
        p.vy = 60;
      }
      return;
    }

    // 翻滚状态处理（无敌帧+高速闪避）
    if (p.rollTimer > 0) {
      p.rollTimer = Math.max(0, p.rollTimer - dt);
      p.vx = p.facing * PHYSICS.ROLL_SPEED;
      p.vy = Math.min(PHYSICS.MAX_FALL_SPEED, p.vy + PHYSICS.GRAVITY * dt);
      const res = moveAndCollide(p, lvl, dt);
      p.onGround = res.onGround;
      if (p.rollTimer === 0) {
        p.y -= PLAYER_CONFIG.HEIGHT - PLAYER_CONFIG.CROUCH_HEIGHT;
        p.h = PLAYER_CONFIG.HEIGHT;
      }
      return;
    }

    // 触发翻滚
    if (input.rollPressed && p.onGround && p.rollCooldown <= 0 && !p.onVine) {
      p.rollTimer = PHYSICS.ROLL_DURATION;
      p.rollCooldown = PHYSICS.ROLL_COOLDOWN;
      p.y += PLAYER_CONFIG.HEIGHT - PLAYER_CONFIG.CROUCH_HEIGHT;
      p.h = PLAYER_CONFIG.CROUCH_HEIGHT;
      p.vx = p.facing * PHYSICS.ROLL_SPEED;
      this.spawnParticles(p.x + p.w / 2, p.y + p.h, '#9c8c7c', 5, 80);
      this.onSfx('roll');
      return;
    }

    // 攀爬藤蔓判定
    const touchingVine = isOnVine(p, lvl);
    if (touchingVine && (input.up || input.down)) {
      p.onVine = true;
      p.vy = 0;
    }
    if (!touchingVine) {
      p.onVine = false;
    }

    // 水平移动
    let moveDir = 0;
    if (input.left) moveDir -= 1;
    if (input.right) moveDir += 1;
    if (moveDir !== 0) p.facing = moveDir;

    if (p.onVine) {
      p.vx = moveDir * PHYSICS.CLIMB_SPEED * 0.75;
      p.vy = 0;
      if (input.up) p.vy = -PHYSICS.CLIMB_SPEED;
      if (input.down) p.vy = PHYSICS.CLIMB_SPEED;
      if (input.jumpPressed) {
        p.onVine = false;
        p.vy = PHYSICS.JUMP_VELOCITY * 0.9;
        p.jumpBuffer = 0;
        this.onSfx('jump');
      }
    } else {
      p.vx = moveDir * PHYSICS.MOVE_SPEED;
      p.vy = Math.min(PHYSICS.MAX_FALL_SPEED, p.vy + PHYSICS.GRAVITY * dt);

      if (p.onGround) {
        p.coyoteTimer = PHYSICS.COYOTE_TIME;
      } else if (p.coyoteTimer > 0) {
        p.coyoteTimer = Math.max(0, p.coyoteTimer - dt);
      }

      if (p.jumpBuffer > 0 && p.coyoteTimer > 0) {
        p.vy = PHYSICS.JUMP_VELOCITY;
        p.onGround = false;
        p.coyoteTimer = 0;
        p.jumpBuffer = 0;
        this.spawnParticles(p.x + p.w / 2, p.y + p.h, '#b8a99a', 5, 70);
        this.onSfx('jump');
      }
    }

    // 执行物理位移与碰撞
    const colRes = moveAndCollide(p, lvl, dt, {
      dropThrough: Boolean(input.down && input.jumpPressed)
    });
    p.onGround = colRes.onGround;

    // 推石箱交互
    if (colRes.pushedCrate && p.onGround && moveDir !== 0) {
      const { crate, dir } = colRes.pushedCrate;
      crate.vx = dir * PHYSICS.PUSH_SPEED;
    }

    // 碎裂石桥触发
    for (const sc of colRes.steppedCrumbles) {
      const cb = lvl.crumbleBlocks.find((b) => b.col === sc.col && b.row === sc.row);
      if (cb && cb.state === 'solid') {
        cb.state = 'shaking';
        cb.timer = 0.55;
        this.onSfx('crumble');
      }
    }

    // 自动边缘抓崖检测
    if (!p.onGround && !p.onVine && !input.down) {
      const grab = detectLedgeGrab(p, lvl);
      if (grab) {
        p.ledgeGrab = grab;
        p.x = grab.x;
        p.y = grab.y;
        p.vx = 0;
        p.vy = 0;
        this.onSfx('ledge');
      }
    }

    // 双枪射击
    if (input.shoot && p.fireCooldown <= 0 && !p.onVine) {
      p.fireCooldown = PHYSICS.FIRE_COOLDOWN;
      p.muzzleFlash = 0.08;
      const bx = p.facing > 0 ? p.x + p.w + 2 : p.x - 6;
      const by = p.y + 13;
      this.bullets.push({
        x: bx,
        y: by,
        w: 8,
        h: 3,
        vx: p.facing * PHYSICS.BULLET_SPEED,
        vy: 0,
        life: 0.9
      });
      this.onSfx('shoot');
    }

    // 地刺与深潭危险瓦片检测
    const centerCol = Math.floor((p.x + p.w * 0.5) / TILE_SIZE);
    const footRow = Math.floor((p.y + p.h - 2) / TILE_SIZE);
    const footTile = getTileAt(lvl, centerCol, footRow);
    if (footTile === TILE.SPIKES) {
      this.damagePlayer(25, -p.facing);
    } else if (footTile === TILE.WATER) {
      this.respawnAtCheckpoint(25);
    }
  }

  updateCrates(dt) {
    const lvl = this.level;
    for (const crate of lvl.crates) {
      crate.vy = Math.min(PHYSICS.MAX_FALL_SPEED, crate.vy + PHYSICS.GRAVITY * dt);
      const res = moveAndCollide(crate, lvl, dt, {
        includeCrates: true,
        excludeCrateId: crate.id,
        allowOneWayPlatforms: true
      });
      crate.onGround = res.onGround;
      crate.vx *= 0.45;
      if (Math.abs(crate.vx) < 2) crate.vx = 0;
    }
  }

  updateCrumbleBlocks(dt) {
    for (const cb of this.level.crumbleBlocks) {
      if (cb.state === 'shaking') {
        cb.timer -= dt;
        if (cb.timer <= 0) {
          cb.state = 'gone';
          cb.timer = 3.2;
          this.spawnParticles(cb.x + TILE_SIZE / 2, cb.y + TILE_SIZE / 2, '#7d6b57', 10, 110);
        }
      } else if (cb.state === 'gone') {
        cb.timer -= dt;
        if (cb.timer <= 0) {
          cb.state = 'solid';
        }
      }
    }
  }

  updatePlatesLeversDoors(dt, input) {
    const lvl = this.level;
    const p = this.player;

    // 1. 压板检测（石箱或玩家踩踏均可压下）
    for (const plate of lvl.plates) {
      const wasPressed = plate.pressed;
      const sensor = { x: plate.x + 2, y: plate.y - 6, w: plate.w - 4, h: plate.h + 8 };
      let active = rectsOverlap(p, sensor);
      if (!active) {
        for (const crate of lvl.crates) {
          if (rectsOverlap(crate, sensor)) {
            active = true;
            break;
          }
        }
      }
      plate.pressed = active;
      if (active && !wasPressed) {
        this.onSfx('lever');
        this.addFloatingText(plate.x + plate.w / 2, plate.y - 16, '压板已触发!', '#f5b82e');
      }
    }

    // 2. 拉杆交互（按 E 或近距离交互）
    if (input.interactPressed) {
      for (const lever of lvl.levers) {
        const reach = { x: lever.x - 18, y: lever.y - 12, w: lever.w + 36, h: lever.h + 24 };
        if (rectsOverlap(p, reach)) {
          lever.activated = !lever.activated;
          this.onSfx('lever');
          this.triggerShake(4, 0.14);
          this.addFloatingText(
            lever.x + lever.w / 2,
            lever.y - 14,
            lever.activated ? '机关已启动!' : '机关已复位',
            '#38bdf8'
          );
        }
      }
    }

    // 3. 石门状态更新
    for (const door of lvl.doors) {
      const allSatisfied = door.requiredIds.every((reqId) => {
        const plate = lvl.plates.find((pl) => pl.id === reqId);
        if (plate) return plate.pressed;
        const lever = lvl.levers.find((lv) => lv.id === reqId);
        if (lever) return lever.activated;
        if (lvl.boss && lvl.boss.id === reqId) return !lvl.boss.alive;
        return false;
      });

      const prevOpen = door.isOpen;
      if (allSatisfied) {
        door.openProgress = Math.min(1, door.openProgress + dt * 1.4);
        if (door.openProgress >= 0.95) door.isOpen = true;
        if (!prevOpen && door.isOpen) {
          this.onSfx('door');
          this.triggerShake(6, 0.25);
          this.addFloatingText(door.x, door.y - 12, '圣殿石门开启!', '#f5b82e');
        }
      } else {
        door.openProgress = Math.max(0, door.openProgress - dt * 1.2);
        door.isOpen = false;
      }
    }
  }

  updateDartTraps(dt) {
    for (const trap of this.level.dartTraps) {
      trap.timer -= dt;
      if (trap.timer <= 0) {
        trap.timer = trap.interval;
        this.enemyProjectiles.push({
          x: trap.x,
          y: trap.y - 3,
          w: 14,
          h: 5,
          vx: trap.dir * 320,
          vy: 0,
          damage: 18,
          type: 'dart',
          life: 3.5
        });
      }
    }
  }

  updateBoulders(dt) {
    const p = this.player;
    for (const b of this.level.boulders) {
      if (b.destroyed) continue;
      if (!b.active && p.x >= b.triggerX) {
        b.active = true;
        this.triggerShake(8, 0.35);
        this.onSfx('door');
        this.addFloatingText(p.x, p.y - 24, '小心滚石!', '#ff6b6b');
      }
      if (b.active) {
        b.x += b.dir * b.speed * dt;
        b.angle += b.dir * (b.speed / b.radius) * dt;
        if (circleRectOverlap(b.x, b.y, b.radius - 2, p)) {
          this.damagePlayer(35, b.dir);
        }
        const aheadCol = Math.floor((b.x + b.dir * b.radius) / TILE_SIZE);
        const row = Math.floor(b.y / TILE_SIZE);
        if (isSolidTile(getTileAt(this.level, aheadCol, row))) {
          b.destroyed = true;
          this.spawnParticles(b.x, b.y, '#8c7a6b', 18, 180);
          this.triggerShake(9, 0.3);
        }
      }
    }
  }

  updateBullets(dt) {
    const lvl = this.level;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;

      let remove = b.life <= 0;
      const col = Math.floor((b.x + b.w * 0.5) / TILE_SIZE);
      const row = Math.floor((b.y + b.h * 0.5) / TILE_SIZE);
      if (isSolidTile(getTileAt(lvl, col, row))) {
        this.spawnParticles(b.x, b.y, '#fcd34d', 4, 90);
        remove = true;
      }

      // 射击拉杆也可以远程激活！
      if (!remove) {
        for (const lv of lvl.levers) {
          if (rectsOverlap(b, lv)) {
            if (!lv.activated) {
              lv.activated = true;
              this.onSfx('lever');
            }
            this.spawnParticles(lv.x + lv.w / 2, lv.y + lv.h / 2, '#38bdf8', 8, 120);
            remove = true;
            break;
          }
        }
      }

      // 命中普通敌人
      if (!remove) {
        for (const e of lvl.enemies) {
          if (!e.alive) continue;
          if (rectsOverlap(b, e)) {
            e.hp -= PLAYER_CONFIG.BULLET_DAMAGE;
            e.hitFlash = 0.12;
            this.spawnParticles(b.x, b.y, '#f87171', 6, 120);
            this.onSfx('hit');
            remove = true;
            if (e.hp <= 0) {
              e.alive = false;
              this.score += e.type === 'guardian' ? 200 : 120;
              this.spawnParticles(e.x + e.w / 2, e.y + e.h / 2, '#fbbf24', 14, 170);
              this.addFloatingText(e.x + e.w / 2, e.y - 8, `+${e.type === 'guardian' ? 200 : 120}`, '#fbbf24');
              this.onSfx('enemy_die');
            }
            break;
          }
        }
      }

      // 命中 Boss
      if (!remove && lvl.boss && lvl.boss.alive && rectsOverlap(b, lvl.boss)) {
        lvl.boss.hp -= PLAYER_CONFIG.BULLET_DAMAGE;
        lvl.boss.hitFlash = 0.1;
        this.spawnParticles(b.x, b.y, '#38bdf8', 7, 130);
        this.onSfx('hit');
        remove = true;
        if (lvl.boss.hp <= 0) {
          lvl.boss.hp = 0;
          lvl.boss.alive = false;
          this.score += 1000;
          this.triggerShake(12, 0.5);
          this.spawnParticles(lvl.boss.x + lvl.boss.w / 2, lvl.boss.y + lvl.boss.h / 2, '#f5b82e', 30, 240);
          this.addFloatingText(lvl.boss.x + lvl.boss.w / 2, lvl.boss.y - 16, '黑曜石守卫已击溃! +1000', '#f5b82e');
          this.onSfx('boss_die');
        }
      }

      if (remove) {
        this.bullets.splice(i, 1);
      }
    }
  }

  updateEnemyProjectiles(dt) {
    const p = this.player;
    const lvl = this.level;
    for (let i = this.enemyProjectiles.length - 1; i >= 0; i--) {
      const pr = this.enemyProjectiles[i];
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.life -= dt;

      let remove = pr.life <= 0;
      const col = Math.floor((pr.x + pr.w * 0.5) / TILE_SIZE);
      const row = Math.floor((pr.y + pr.h * 0.5) / TILE_SIZE);
      if (isSolidTile(getTileAt(lvl, col, row))) {
        this.spawnParticles(pr.x, pr.y, '#94a3b8', 4, 80);
        remove = true;
      } else if (rectsOverlap(pr, p)) {
        const hit = this.damagePlayer(pr.damage, pr.vx >= 0 ? 1 : -1);
        if (hit) remove = true;
      }

      if (remove) this.enemyProjectiles.splice(i, 1);
    }
  }

  updateEnemies(dt) {
    const p = this.player;
    for (const e of this.level.enemies) {
      if (!e.alive) continue;
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);

      if (e.type === 'bat') {
        e.phase += dt * 3.8;
        e.x += e.vx * dt;
        e.y = e.startY + Math.sin(e.phase) * 28;
        if (e.x < e.patrolMinX) {
          e.x = e.patrolMinX;
          e.vx = Math.abs(e.vx);
        } else if (e.x > e.patrolMaxX) {
          e.x = e.patrolMaxX;
          e.vx = -Math.abs(e.vx);
        }
      } else if (e.type === 'guardian') {
        const distToPlayer = Math.abs(p.x - e.x);
        const sameRow = Math.abs(p.y - e.y) < 48;
        if (sameRow && distToPlayer < 220) {
          e.vx = p.x < e.x ? -115 : 115;
        }
        e.x += e.vx * dt;
        if (e.x < e.patrolMinX) {
          e.x = e.patrolMinX;
          e.vx = Math.abs(e.vx);
        } else if (e.x > e.patrolMaxX) {
          e.x = e.patrolMaxX;
          e.vx = -Math.abs(e.vx);
        }
      }

      if (rectsOverlap(e, p)) {
        this.damagePlayer(18, p.x < e.x ? -1 : 1);
      }
    }
  }

  updateBoss(dt) {
    const boss = this.level.boss;
    if (!boss || !boss.alive) return;
    const p = this.player;

    if (boss.hitFlash > 0) boss.hitFlash = Math.max(0, boss.hitFlash - dt);

    const enraged = boss.hp < boss.maxHp * 0.5;
    const speed = enraged ? 135 : 90;
    boss.x += Math.sign(boss.vx) * speed * dt;
    if (boss.x <= boss.minX) {
      boss.x = boss.minX;
      boss.vx = speed;
    } else if (boss.x >= boss.maxX) {
      boss.x = boss.maxX;
      boss.vx = -speed;
    }

    boss.attackTimer -= dt;
    if (boss.attackTimer <= 0) {
      boss.attackTimer = enraged ? 1.55 : 2.3;
      const dir = p.x < boss.x ? -1 : 1;
      // 发射地面冲击波
      this.enemyProjectiles.push({
        x: boss.x + boss.w / 2,
        y: boss.y + boss.h - 18,
        w: 22,
        h: 16,
        vx: dir * (enraged ? 280 : 220),
        vy: 0,
        damage: 22,
        type: 'shockwave',
        life: 3.2
      });
      this.triggerShake(5, 0.16);
      this.onSfx('boss_attack');
    }

    if (rectsOverlap(boss, p)) {
      this.damagePlayer(24, p.x < boss.x ? -1 : 1);
    }
  }

  updateCollectiblesAndExit() {
    const p = this.player;
    const lvl = this.level;

    // 圣物收集
    for (const relic of lvl.relics) {
      if (relic.collected) continue;
      const box = { x: relic.x - 14, y: relic.y - 14, w: 28, h: 28 };
      if (rectsOverlap(p, box)) {
        relic.collected = true;
        this.totalRelicsCollected += 1;
        this.score += 300;
        this.spawnParticles(relic.x, relic.y, '#f5b82e', 16, 160);
        this.addFloatingText(relic.x, relic.y - 14, `获得圣物: ${relic.name} +300`, '#f5b82e');
        this.onSfx('relic');
      }
    }

    // 急救包收集
    for (const med of lvl.medipacks) {
      if (med.collected || p.hp >= p.maxHp) continue;
      const box = { x: med.x - 12, y: med.y - 12, w: 24, h: 24 };
      if (rectsOverlap(p, box)) {
        med.collected = true;
        const heal = Math.min(35, p.maxHp - p.hp);
        p.hp += heal;
        this.spawnParticles(med.x, med.y, '#4ade80', 12, 120);
        this.addFloatingText(med.x, med.y - 12, `+${heal} HP`, '#4ade80');
        this.onSfx('heal');
      }
    }

    // 存档火盆激活
    for (const cp of lvl.checkpoints) {
      if (cp.activated) continue;
      const box = { x: cp.x - 18, y: cp.y - 38, w: 36, h: 38 };
      if (rectsOverlap(p, box)) {
        cp.activated = true;
        p.respawnX = cp.x - p.w / 2;
        p.respawnY = cp.y - p.h - 2;
        this.spawnParticles(cp.x, cp.y - 20, '#fb923c', 16, 130);
        this.addFloatingText(cp.x, cp.y - 42, '篝火存档点已激活!', '#fb923c');
        this.onSfx('relic');
      }
    }

    // 到达关卡终点（太阳传送门 / 太阳圣器）
    if (rectsOverlap(p, lvl.exit)) {
      this.score += 500;
      if (this.levelIndex + 1 >= RAW_LEVELS.length) {
        this.state = GAME_STATE.VICTORY;
        this.onSfx('victory');
      } else {
        this.state = GAME_STATE.LEVEL_CLEAR;
        this.onSfx('victory');
      }
    }
  }

  updateParticlesAndTexts(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vy += 320 * dt;
      pt.life -= dt;
      if (pt.life <= 0) this.particles.splice(i, 1);
    }

    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y -= 28 * dt;
      ft.life -= dt;
      if (ft.life <= 0) this.floatingTexts.splice(i, 1);
    }
  }

  updateBraid(dt) {
    const p = this.player;
    const anchorX = p.x + p.w * 0.5 - p.facing * 4;
    const anchorY = p.y + 8;
    p.braidPoints[0].x = anchorX;
    p.braidPoints[0].y = anchorY;
    for (let i = 1; i < p.braidPoints.length; i++) {
      const prev = p.braidPoints[i - 1];
      const curr = p.braidPoints[i];
      const targetX = prev.x - p.facing * 5.5;
      const targetY = prev.y + 4.5;
      curr.x += (targetX - curr.x) * Math.min(1, dt * 16);
      curr.y += (targetY - curr.y) * Math.min(1, dt * 16);
    }
  }

  getHudSnapshot() {
    const collectedInLevel = this.level.relics.filter((r) => r.collected).length;
    return {
      state: this.state,
      levelId: this.level.id,
      levelName: this.level.name,
      levelSubtitle: this.level.subtitle,
      hint: this.level.hint,
      hp: this.player.hp,
      maxHp: this.player.maxHp,
      relicsInLevel: collectedInLevel,
      relicsTotalInLevel: this.level.relics.length,
      totalRelicsCollected: this.totalRelicsCollected,
      score: this.score,
      elapsedTime: this.elapsedTime,
      boss: this.level.boss
        ? {
            name: this.level.boss.name,
            hp: this.level.boss.hp,
            maxHp: this.level.boss.maxHp,
            alive: this.level.boss.alive
          }
        : null
    };
  }
}
