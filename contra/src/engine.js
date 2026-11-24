// 核心游戏引擎与状态机：完全解耦 DOM，支持浏览器运行与 Node.js 无头自动化测试

import {
  GAME_WIDTH,
  GAME_HEIGHT,
  GRAVITY,
  MAX_FALL_SPEED,
  PLAYER_CONFIG,
  GAME_STATES,
  SCORE_VALUES
} from './constants.js';
import { createStages } from './level.js';
import {
  Player,
  Bullet,
  Enemy,
  FlyingCapsule,
  Powerup,
  Bridge,
  Boss,
  Particle,
  FloatingText,
  aabbOverlap
} from './entities.js';

export class ContraEngine {
  constructor({ audio = null, storage = null } = {}) {
    this.audio = audio;
    this.storage = storage;
    this.stages = createStages();
    this.state = GAME_STATES.TITLE;
    this.stageIndex = 0;
    this.score = 0;
    this.highScore = this.loadHighScore();
    this.nextExtraLifeScore = PLAYER_CONFIG.EXTRA_LIFE_SCORE;
    this.konamiEnabled = false;
    this.cameraX = 0;
    this.shakeTimer = 0;
    this.stageClearTimer = 0;
    this.time = 0;

    this.player = null;
    this.stage = null;
    this.platforms = [];
    this.bridges = [];
    this.pendingSpawns = [];
    this.pendingCapsules = [];
    this.enemies = [];
    this.capsules = [];
    this.powerups = [];
    this.bullets = [];
    this.particles = [];
    this.floatingTexts = [];
    this.boss = null;
    this.bossActive = false;

    this.loadStage(0, PLAYER_CONFIG.DEFAULT_LIVES);
  }

  loadHighScore() {
    if (!this.storage) return 0;
    try {
      const raw = this.storage.getItem('contra_web_highscore');
      const parsed = Number.parseInt(raw || '0', 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    } catch {
      return 0;
    }
  }

  saveHighScore() {
    if (this.score > this.highScore) {
      this.highScore = this.score;
      if (this.storage) {
        try {
          this.storage.setItem('contra_web_highscore', String(this.highScore));
        } catch {
          // 忽略存储配额或隐私模式异常
        }
      }
    }
  }

  activateKonamiCode() {
    this.konamiEnabled = true;
    if (this.player) {
      this.player.lives = PLAYER_CONFIG.KONAMI_LIVES;
    }
    if (this.audio) this.audio.playKonami();
  }

  startGame() {
    this.score = 0;
    this.nextExtraLifeScore = PLAYER_CONFIG.EXTRA_LIFE_SCORE;
    const initialLives = this.konamiEnabled
      ? PLAYER_CONFIG.KONAMI_LIVES
      : PLAYER_CONFIG.DEFAULT_LIVES;
    this.loadStage(0, initialLives);
    this.state = GAME_STATES.PLAYING;
    if (this.audio) {
      this.audio.init();
      this.audio.startBgm(0);
    }
  }

  togglePause() {
    if (this.state === GAME_STATES.PLAYING) {
      this.state = GAME_STATES.PAUSED;
      if (this.audio) this.audio.stopBgm();
    } else if (this.state === GAME_STATES.PAUSED) {
      this.state = GAME_STATES.PLAYING;
      if (this.audio) this.audio.startBgm(this.stageIndex);
    }
  }

  loadStage(index, keepLives = null, keepWeapon = 'R') {
    this.stageIndex = index;
    const template = this.stages[index];
    this.stage = template;
    this.cameraX = 0;
    this.shakeTimer = 0;
    this.stageClearTimer = 0;
    this.bossActive = false;

    const lives = keepLives !== null
      ? keepLives
      : this.player
        ? this.player.lives
        : PLAYER_CONFIG.DEFAULT_LIVES;

    this.player = new Player(48, 120, lives);
    this.player.weaponId = keepWeapon;

    this.platforms = template.platforms.map((p) => ({ ...p }));
    this.bridges = template.bridges.map((b) => new Bridge(b));
    this.pendingSpawns = template.enemySpawns.map((s) => ({ ...s, spawned: false }));
    this.pendingCapsules = template.capsules.map((c) => ({ ...c, spawned: false }));
    this.enemies = [];
    this.capsules = [];
    this.powerups = [];
    this.bullets = [];
    this.particles = [];
    this.floatingTexts = [];
    this.boss = new Boss(template.boss);
  }

  getActivePlatforms() {
    const bridgePlatforms = [];
    for (const bridge of this.bridges) {
      for (const seg of bridge.segments) {
        if (seg.intact) {
          bridgePlatforms.push({
            x: seg.x,
            y: seg.y,
            w: seg.w,
            h: seg.h,
            oneWay: true,
            type: 'bridge'
          });
        }
      }
    }
    return this.platforms.concat(bridgePlatforms);
  }

  addScore(points, x = null, y = null) {
    this.score += points;
    this.saveHighScore();
    if (x !== null && y !== null) {
      this.floatingTexts.push(new FloatingText({ x, y, text: `+${points}` }));
    }
    if (this.score >= this.nextExtraLifeScore) {
      this.nextExtraLifeScore += PLAYER_CONFIG.EXTRA_LIFE_SCORE;
      if (this.player) {
        this.player.lives += 1;
        this.floatingTexts.push(
          new FloatingText({
            x: this.player.x,
            y: this.player.y - 12,
            text: '1UP!',
            color: '#4ade80'
          })
        );
      }
      if (this.audio) this.audio.playPowerup();
    }
  }

  spawnExplosion(x, y, count = 14, big = false) {
    const palette = ['#fef08a', '#fb923c', '#ef4444', '#ffffff'];
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const speed = (big ? 95 : 55) + Math.random() * (big ? 110 : 75);
      this.particles.push(
        new Particle({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 25,
          color: palette[i % palette.length],
          size: big ? 4 : 3,
          life: big ? 0.55 : 0.35
        })
      );
    }
    if (big) {
      this.shakeTimer = Math.max(this.shakeTimer, 0.28);
    }
    if (this.audio) this.audio.playExplosion(big);
  }

  update(dt, input) {
    this.time += dt;
    if (this.shakeTimer > 0) {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
    }

    if (this.state === GAME_STATES.STAGE_CLEAR) {
      this.updateParticles(dt);
      this.stageClearTimer -= dt;
      if (this.stageClearTimer <= 0) {
        if (this.stageIndex + 1 < this.stages.length) {
          const weapon = this.player ? this.player.weaponId : 'R';
          const lives = this.player ? this.player.lives : PLAYER_CONFIG.DEFAULT_LIVES;
          this.loadStage(this.stageIndex + 1, lives, weapon);
          this.state = GAME_STATES.PLAYING;
          if (this.audio) this.audio.startBgm(this.stageIndex);
        } else {
          this.state = GAME_STATES.VICTORY;
          if (this.audio) this.audio.stopBgm();
        }
      }
      return;
    }

    if (this.state !== GAME_STATES.PLAYING) {
      return;
    }

    const activePlatforms = this.getActivePlatforms();

    this.updatePlayer(dt, input, activePlatforms);
    this.updateCamera();
    this.updateSpawns();
    this.updateBridges(dt);
    this.updateEnemies(dt, activePlatforms);
    this.updateCapsulesAndPowerups(dt, activePlatforms);
    this.updateBoss(dt);
    this.updateBullets(dt);
    this.checkCollisions();
    this.updateParticles(dt);
  }

  updatePlayer(dt, input, activePlatforms) {
    const p = this.player;
    if (!p) return;

    if (!p.alive) {
      p.respawnTimer -= dt;
      if (p.respawnTimer <= 0) {
        if (p.lives > 0) {
          p.alive = true;
          p.x = Math.max(this.cameraX + 36, Math.min(p.x, this.stage.length - 120));
          p.y = 70;
          p.vx = 0;
          p.vy = 0;
          p.weaponId = 'R';
          p.invincibleTimer = PLAYER_CONFIG.INVINCIBLE_DURATION;
        } else {
          this.state = GAME_STATES.GAME_OVER;
          if (this.audio) this.audio.stopBgm();
        }
      }
      return;
    }

    if (p.invincibleTimer > 0) p.invincibleTimer = Math.max(0, p.invincibleTimer - dt);
    if (p.fireCooldown > 0) p.fireCooldown = Math.max(0, p.fireCooldown - dt);
    if (p.dropThroughTimer > 0) p.dropThroughTimer = Math.max(0, p.dropThroughTimer - dt);

    p.computeAim(input);

    // 水平移动（匍匐时不可移动）
    let moveDir = 0;
    if (!p.prone) {
      if (input.left) moveDir -= 1;
      if (input.right) moveDir += 1;
    }
    const moveSpeed = p.inWater ? PLAYER_CONFIG.SPEED * 0.72 : PLAYER_CONFIG.SPEED;
    p.vx = moveDir * moveSpeed;

    // 跳跃或下穿单向平台
    if (input.jumpPressed && (p.onGround || p.inWater)) {
      if (input.down && p.onGround && !p.inWater) {
        // 检查脚下是否为单向平台
        const standingOnOneWay = activePlatforms.some(
          (plat) =>
            plat.oneWay &&
            p.x + p.w > plat.x &&
            p.x < plat.x + plat.w &&
            Math.abs(p.y + p.h - plat.y) <= 4
        );
        if (standingOnOneWay) {
          p.dropThroughTimer = 0.22;
          p.onGround = false;
          p.y += 4;
        } else {
          p.vy = PLAYER_CONFIG.JUMP_VELOCITY;
          p.onGround = false;
          if (this.audio) this.audio.playJump();
        }
      } else {
        p.vy = PLAYER_CONFIG.JUMP_VELOCITY;
        p.onGround = false;
        p.inWater = false;
        if (this.audio) this.audio.playJump();
      }
    }

    // 重力与位移
    const prevBottom = p.y + p.h;
    p.vy = Math.min(MAX_FALL_SPEED, p.vy + GRAVITY * dt);
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // 限制在相机左边界与关卡右边界内
    const minX = this.cameraX + 4;
    const maxX = this.boss && !this.boss.defeated
      ? this.boss.x - p.w - 4
      : this.stage.length - p.w - 8;
    p.x = Math.max(minX, Math.min(maxX, p.x));

    // 平台落地碰撞
    p.onGround = false;
    for (const plat of activePlatforms) {
      if (plat.oneWay && p.dropThroughTimer > 0) continue;
      const horiz = p.x + p.w - 2 > plat.x && p.x + 2 < plat.x + plat.w;
      if (horiz && p.vy >= 0 && prevBottom <= plat.y + 8 && p.y + p.h >= plat.y) {
        p.y = plat.y - p.h;
        p.vy = 0;
        p.onGround = true;
        break;
      }
    }

    // 水面检测（第一关可涉水游泳，第二关深渊坠落）
    p.inWater = false;
    if (!p.onGround && p.y + p.h >= this.stage.waterY) {
      if (this.stage.theme === 'jungle') {
        const inWaterZone = this.stage.waterZones.some(
          (z) => p.x + p.w * 0.5 >= z.x && p.x + p.w * 0.5 <= z.x + z.w
        );
        if (inWaterZone) {
          p.y = this.stage.waterY - p.h;
          p.vy = 0;
          p.inWater = true;
        }
      }
    }

    // 掉出屏幕底部判定阵亡
    if (p.y > GAME_HEIGHT + 24) {
      this.killPlayer();
      return;
    }

    // 动画计时
    if (Math.abs(p.vx) > 5 && p.onGround) {
      p.animTimer += dt * 10;
    }
    if (!p.onGround && !p.inWater) {
      p.spinAngle += dt * 18 * p.facing;
    } else {
      p.spinAngle = 0;
    }

    // 射击
    if (input.shoot) {
      const fired = p.fire(this.bullets);
      if (fired.length > 0) {
        this.bullets.push(...fired);
        if (this.audio) this.audio.playShoot(p.weaponId);
      }
    }
  }

  killPlayer() {
    const p = this.player;
    if (!p || !p.alive) return;
    p.alive = false;
    p.lives = Math.max(0, p.lives - 1);
    p.respawnTimer = 1.4;
    this.spawnExplosion(p.x + p.w / 2, p.y + p.h / 2, 16, true);
    if (this.audio) this.audio.playPlayerDeath();
  }

  updateCamera() {
    if (!this.player) return;
    const targetX = this.player.x - GAME_WIDTH * 0.36;
    const maxCam = Math.max(0, this.stage.length - GAME_WIDTH);
    // 魂斗罗经典单向向右卷轴
    if (targetX > this.cameraX) {
      this.cameraX = Math.min(maxCam, targetX);
    }
    if (this.cameraX >= this.stage.length - GAME_WIDTH - 40) {
      this.bossActive = true;
    }
  }

  updateSpawns() {
    for (const spawn of this.pendingSpawns) {
      if (!spawn.spawned && spawn.x <= this.cameraX + GAME_WIDTH + 32) {
        spawn.spawned = true;
        this.enemies.push(new Enemy(spawn));
      }
    }
    for (const cap of this.pendingCapsules) {
      if (!cap.spawned && this.player && this.player.x >= cap.triggerX) {
        cap.spawned = true;
        this.capsules.push(
          new FlyingCapsule({
            x: this.cameraX - 24,
            y: cap.y,
            weapon: cap.weapon
          })
        );
      }
    }
  }

  updateBridges(dt) {
    if (!this.player || !this.player.alive) return;
    for (const bridge of this.bridges) {
      if (!bridge.triggered && this.player.x + this.player.w >= bridge.x + 12) {
        bridge.triggered = true;
        bridge.explodeTimer = 0.25;
      }
      if (bridge.triggered && bridge.explodeIndex < bridge.segments.length) {
        bridge.explodeTimer -= dt;
        if (bridge.explodeTimer <= 0) {
          const seg = bridge.segments[bridge.explodeIndex];
          seg.intact = false;
          this.spawnExplosion(seg.x + seg.w / 2, seg.y + 4, 12, true);
          bridge.explodeIndex += 1;
          bridge.explodeTimer = 0.34;
        }
      }
    }
  }

  updateEnemies(dt, activePlatforms) {
    const p = this.player;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.animTimer += dt * 8;

      if (e.type === 'runner') {
        const prevBottom = e.y + e.h;
        e.vy = Math.min(MAX_FALL_SPEED, e.vy + GRAVITY * dt);
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.onGround = false;
        for (const plat of activePlatforms) {
          const horiz = e.x + e.w > plat.x && e.x < plat.x + plat.w;
          if (horiz && e.vy >= 0 && prevBottom <= plat.y + 8 && e.y + e.h >= plat.y) {
            e.y = plat.y - e.h;
            e.vy = 0;
            e.onGround = true;
            break;
          }
        }
        if (e.y > GAME_HEIGHT + 30 || e.x < this.cameraX - 60) {
          e.alive = false;
        }
      } else if (e.type === 'sniper' || e.type === 'turret') {
        if (p && p.alive) {
          e.facing = p.x >= e.x ? 1 : -1;
          e.fireTimer -= dt;
          const inView = e.x >= this.cameraX - 10 && e.x <= this.cameraX + GAME_WIDTH + 10;
          if (inView && e.fireTimer <= 0) {
            const dx = (p.x + p.w / 2) - (e.x + e.w / 2);
            const dy = (p.y + p.h / 2) - (e.y + e.h / 2);
            const dist = Math.hypot(dx, dy) || 1;
            const speed = e.type === 'turret' ? 145 : 155;
            this.bullets.push(
              new Bullet({
                x: e.x + e.w / 2,
                y: e.y + (e.type === 'turret' ? e.h / 2 : 10),
                vx: (dx / dist) * speed,
                vy: (dy / dist) * speed,
                fromPlayer: false,
                color: '#f87171',
                radius: 3
              })
            );
            e.fireTimer = e.type === 'turret' ? 1.55 : 1.75;
          }
        }
        if (e.x < this.cameraX - 80) {
          e.alive = false;
        }
      }
    }
    this.enemies = this.enemies.filter((e) => e.alive);
  }

  updateCapsulesAndPowerups(dt, activePlatforms) {
    for (const c of this.capsules) {
      c.update(dt);
      if (c.x > this.cameraX + GAME_WIDTH + 60) {
        c.alive = false;
      }
    }
    this.capsules = this.capsules.filter((c) => c.alive);

    for (const pw of this.powerups) {
      pw.update(dt, activePlatforms);
      if (pw.y > GAME_HEIGHT + 30 || pw.x < this.cameraX - 40) {
        pw.alive = false;
      }
    }
    this.powerups = this.powerups.filter((pw) => pw.alive);
  }

  updateBoss(dt) {
    const boss = this.boss;
    if (!boss || boss.defeated || !this.bossActive) return;
    if (boss.flashTimer > 0) boss.flashTimer = Math.max(0, boss.flashTimer - dt);

    const p = this.player;
    if (!p || !p.alive) return;

    for (const turret of boss.turrets) {
      if (!turret.alive) continue;
      turret.fireTimer -= dt;
      if (turret.fireTimer <= 0) {
        const dx = (p.x + p.w / 2) - (turret.x + turret.w / 2);
        const dy = (p.y + p.h / 2) - (turret.y + turret.h / 2);
        const dist = Math.hypot(dx, dy) || 1;
        const speed = boss.kind === 'alien_core' ? 165 : 140;
        this.bullets.push(
          new Bullet({
            x: turret.x,
            y: turret.y + turret.h / 2,
            vx: (dx / dist) * speed,
            vy: (dy / dist) * speed,
            fromPlayer: false,
            color: '#fb7185',
            radius: 3.5
          })
        );
        turret.fireTimer = boss.kind === 'alien_core' ? 1.25 : 1.5;
      }
    }

    if (boss.kind === 'alien_core' && boss.core.alive) {
      boss.core.fireTimer -= dt;
      if (boss.core.fireTimer <= 0) {
        for (const angle of [Math.PI - 0.25, Math.PI, Math.PI + 0.25]) {
          this.bullets.push(
            new Bullet({
              x: boss.core.x,
              y: boss.core.y + boss.core.h / 2,
              vx: Math.cos(angle) * 140,
              vy: Math.sin(angle) * 140,
              fromPlayer: false,
              color: '#c084fc',
              radius: 4
            })
          );
        }
        boss.core.fireTimer = 2.1;
      }
    }
  }

  updateBullets(dt) {
    for (const b of this.bullets) {
      b.update(dt);
      if (
        b.x < this.cameraX - 30 ||
        b.x > this.cameraX + GAME_WIDTH + 30 ||
        b.y < -30 ||
        b.y > GAME_HEIGHT + 30
      ) {
        b.alive = false;
      }
    }
    this.bullets = this.bullets.filter((b) => b.alive);
  }

  checkCollisions() {
    const p = this.player;
    const pBox = p && p.alive ? p.getHitbox() : null;

    // 1. 玩家拾取武器掉落
    if (pBox) {
      for (const pw of this.powerups) {
        if (pw.alive && aabbOverlap(pBox, pw.getHitbox())) {
          pw.alive = false;
          p.weaponId = pw.weapon;
          this.addScore(SCORE_VALUES.POWERUP, pw.x, pw.y);
          this.floatingTexts.push(
            new FloatingText({ x: p.x, y: p.y - 10, text: `WEAPON ${pw.weapon}!`, color: '#38bdf8' })
          );
          if (this.audio) this.audio.playPowerup();
        }
      }
    }

    // 2. 子弹碰撞判定
    for (const b of this.bullets) {
      if (!b.alive) continue;
      const bBox = b.getHitbox();

      if (b.fromPlayer) {
        // 击落飞碟胶囊
        for (const cap of this.capsules) {
          if (cap.alive && aabbOverlap(bBox, cap.getHitbox())) {
            cap.alive = false;
            if (!b.pierce) b.alive = false;
            this.addScore(SCORE_VALUES.CAPSULE, cap.x, cap.y);
            this.spawnExplosion(cap.x + cap.w / 2, cap.y + cap.h / 2, 10, false);
            this.powerups.push(
              new Powerup({ x: cap.x, y: cap.y, weapon: cap.weapon })
            );
            break;
          }
        }
        if (!b.alive) continue;

        // 击中普通敌人
        for (const e of this.enemies) {
          if (!e.alive || b.hitIds.has(e.id)) continue;
          if (aabbOverlap(bBox, e.getHitbox())) {
            b.hitIds.add(e.id);
            e.hp -= b.damage;
            if (!b.pierce) b.alive = false;
            if (e.hp <= 0) {
              e.alive = false;
              const pts =
                e.type === 'turret'
                  ? SCORE_VALUES.TURRET
                  : e.type === 'sniper'
                    ? SCORE_VALUES.SNIPER
                    : SCORE_VALUES.RUNNER;
              this.addScore(pts, e.x, e.y);
              this.spawnExplosion(e.x + e.w / 2, e.y + e.h / 2, 10, e.type === 'turret');
            } else if (this.audio) {
              this.audio.playHit();
            }
            if (!b.alive) break;
          }
        }
        if (!b.alive) continue;

        // 击中 Boss 炮台与核心
        if (this.boss && !this.boss.defeated && this.bossActive) {
          for (const turret of this.boss.turrets) {
            if (!turret.alive || b.hitIds.has(turret.id)) continue;
            if (aabbOverlap(bBox, turret)) {
              b.hitIds.add(turret.id);
              turret.hp -= b.damage;
              this.boss.flashTimer = 0.08;
              if (!b.pierce) b.alive = false;
              if (turret.hp <= 0) {
                turret.alive = false;
                this.addScore(SCORE_VALUES.BOSS_TURRET, turret.x, turret.y);
                this.spawnExplosion(turret.x + turret.w / 2, turret.y + turret.h / 2, 18, true);
              } else if (this.audio) {
                this.audio.playHit();
              }
              if (!b.alive) break;
            }
          }
          if (!b.alive) continue;

          const core = this.boss.core;
          if (core.alive && !b.hitIds.has(core.id) && aabbOverlap(bBox, core)) {
            b.hitIds.add(core.id);
            core.hp -= b.damage;
            this.boss.flashTimer = 0.1;
            if (!b.pierce) b.alive = false;
            if (core.hp <= 0) {
              core.alive = false;
              this.defeatBoss();
            } else if (this.audio) {
              this.audio.playHit();
            }
          }
        }
      } else if (pBox && p.invincibleTimer <= 0) {
        // 敌方子弹击中玩家
        if (aabbOverlap(bBox, pBox)) {
          b.alive = false;
          this.killPlayer();
        }
      }
    }

    // 3. 玩家与敌方身体接触
    if (pBox && p.invincibleTimer <= 0) {
      for (const e of this.enemies) {
        if (e.alive && aabbOverlap(pBox, e.getHitbox())) {
          this.killPlayer();
          break;
        }
      }
    }

    this.bullets = this.bullets.filter((b) => b.alive);
    this.enemies = this.enemies.filter((e) => e.alive);
    this.capsules = this.capsules.filter((c) => c.alive);
    this.powerups = this.powerups.filter((pw) => pw.alive);
  }

  defeatBoss() {
    if (!this.boss || this.boss.defeated) return;
    this.boss.defeated = true;
    for (const t of this.boss.turrets) {
      t.alive = false;
    }
    this.bullets = this.bullets.filter((b) => b.fromPlayer);
    this.addScore(SCORE_VALUES.BOSS_CORE + SCORE_VALUES.STAGE_CLEAR, this.boss.core.x, this.boss.core.y);
    this.spawnExplosion(this.boss.x + 30, this.boss.y + 45, 24, true);
    this.spawnExplosion(this.boss.x + 48, this.boss.y + 100, 24, true);
    this.state = GAME_STATES.STAGE_CLEAR;
    this.stageClearTimer = 2.6;
    if (this.audio) {
      this.audio.stopBgm();
      this.audio.playStageClear();
    }
  }

  updateParticles(dt) {
    for (const pt of this.particles) pt.update(dt);
    this.particles = this.particles.filter((pt) => pt.life > 0);
    for (const ft of this.floatingTexts) ft.update(dt);
    this.floatingTexts = this.floatingTexts.filter((ft) => ft.life > 0);
  }
}
