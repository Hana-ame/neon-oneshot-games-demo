/**
 * 游戏主逻辑引擎 (GameEngine)
 * 管理测试舱状态、玩家控制、同伴方块、双色传送门、压力板与粒子特效
 * 完全解耦 DOM/Canvas，可在 Node.js 中无头运行自动化测试
 */

import { PHYSICS, FIXED_DT, COLORS } from './constants.js';
import { RAW_LEVELS, buildLevel } from './levels.js';
import {
  castRay,
  validatePortalPlacement,
  checkPortalEntry,
  computePortalExit,
  resolveEntityCollisions,
  aabbIntersects
} from './physics.js';

export class GameEngine {
  constructor(options = {}) {
    this.sound = options.sound || null;
    this.onStateChange = options.onStateChange || null;
    this.levelIndex = 0;
    this.levelCount = RAW_LEVELS.length;
    this.completedLevels = new Set();
    this.paused = false;

    this.input = {
      left: false,
      right: false,
      jumpHeld: false,
      jumpBufferTimer: 0,
      aimX: 480,
      aimY: 280
    };

    this.loadLevel(0);
  }

  loadLevel(index) {
    const safeIdx = Math.max(0, Math.min(this.levelCount - 1, index));
    this.levelIndex = safeIdx;
    this.level = buildLevel(safeIdx);
    this.status = 'playing'; // 'playing' | 'level_clear' | 'all_clear'
    this.elapsedTime = 0;
    this.portalsFired = 0;
    this.teleportsCount = 0;
    this.deathCount = 0;

    this.player = {
      x: this.level.spawnPos.x,
      y: this.level.spawnPos.y,
      w: PHYSICS.PLAYER_WIDTH,
      h: PHYSICS.PLAYER_HEIGHT,
      vx: 0,
      vy: 0,
      onGround: false,
      coyoteTimer: 0,
      portalCooldown: 0,
      facing: 1,
      carryingCubeId: null
    };

    this.cubes = this.level.initialCubes.map((c) => ({
      id: c.id,
      x: c.x,
      y: c.y,
      w: PHYSICS.CUBE_SIZE,
      h: PHYSICS.CUBE_SIZE,
      vx: 0,
      vy: 0,
      onGround: false,
      portalCooldown: 0
    }));

    this.buttons = this.level.buttonRects.map((b) => ({ ...b, pressed: false }));
    this.doorOpen = !this.level.doorRequiresButtons;

    this.portals = {
      blue: null,
      orange: null
    };

    this.particles = [];
    this.aimPreview = null;
    this.statusMessage = this.level.subtitle;

    this.emitState();
  }

  resetLevel() {
    this.loadLevel(this.levelIndex);
  }

  nextLevel() {
    if (this.levelIndex + 1 < this.levelCount) {
      this.loadLevel(this.levelIndex + 1);
      return true;
    }
    this.status = 'all_clear';
    this.emitState();
    return false;
  }

  setInput(patch) {
    if (patch.jumpPressed) {
      this.input.jumpBufferTimer = PHYSICS.JUMP_BUFFER;
    }
    if (typeof patch.left === 'boolean') this.input.left = patch.left;
    if (typeof patch.right === 'boolean') this.input.right = patch.right;
    if (typeof patch.jumpHeld === 'boolean') this.input.jumpHeld = patch.jumpHeld;
    if (typeof patch.aimX === 'number') this.input.aimX = patch.aimX;
    if (typeof patch.aimY === 'number') this.input.aimY = patch.aimY;
  }

  getPlayerGunOrigin() {
    return {
      x: this.player.x + this.player.w / 2,
      y: this.player.y + this.player.h * 0.42
    };
  }

  firePortal(color, targetX = this.input.aimX, targetY = this.input.aimY) {
    if (this.status !== 'playing' || this.paused) return { placed: false, reason: 'not_playing' };

    const origin = this.getPlayerGunOrigin();
    const dir = { x: targetX - origin.x, y: targetY - origin.y };
    const hit = castRay(this.level.grid, origin, dir);
    this.portalsFired += 1;

    if (!hit) {
      this.sound?.playPortalFail();
      return { placed: false, reason: 'no_hit' };
    }

    const otherColor = color === 'blue' ? 'orange' : 'blue';
    const result = validatePortalPlacement(this.level.grid, hit, this.portals[otherColor]);

    if (!result.valid) {
      this.spawnBurst(hit.x, hit.y, '#EF4444', 10);
      this.sound?.playPortalFail();
      return { placed: false, reason: result.reason, hit };
    }

    this.portals[color] = {
      ...result.portal,
      color,
      age: 0
    };

    const burstColor = color === 'blue' ? COLORS.BLUE_PORTAL : COLORS.ORANGE_PORTAL;
    this.spawnBurst(result.portal.x, result.portal.y, burstColor, 18);
    this.sound?.playPortalFire(color);
    this.emitState();
    return { placed: true, portal: this.portals[color] };
  }

  clearPortals() {
    if (this.portals.blue || this.portals.orange) {
      if (this.portals.blue) this.spawnBurst(this.portals.blue.x, this.portals.blue.y, COLORS.BLUE_PORTAL, 12);
      if (this.portals.orange) this.spawnBurst(this.portals.orange.x, this.portals.orange.y, COLORS.ORANGE_PORTAL, 12);
      this.portals.blue = null;
      this.portals.orange = null;
      this.sound?.playFizzler();
      this.emitState();
    }
  }

  toggleCarryCube() {
    if (this.status !== 'playing' || this.paused) return false;

    if (this.player.carryingCubeId) {
      const cube = this.cubes.find((c) => c.id === this.player.carryingCubeId);
      if (cube) {
        cube.vx = this.player.vx * 0.4 + this.player.facing * 75;
        cube.vy = Math.min(this.player.vy * 0.3, -40);
      }
      this.player.carryingCubeId = null;
      this.sound?.playPickup(false);
      return true;
    }

    const px = this.player.x + this.player.w / 2;
    const py = this.player.y + this.player.h / 2;
    let nearest = null;
    let bestDist = PHYSICS.PICKUP_RADIUS;

    for (const cube of this.cubes) {
      const cx = cube.x + cube.w / 2;
      const cy = cube.y + cube.h / 2;
      const d = Math.hypot(cx - px, cy - py);
      if (d <= bestDist) {
        bestDist = d;
        nearest = cube;
      }
    }

    if (nearest) {
      this.player.carryingCubeId = nearest.id;
      this.sound?.playPickup(true);
      return true;
    }
    return false;
  }

  step(dt = FIXED_DT) {
    if (this.paused || this.status !== 'playing') return;

    this.elapsedTime += dt;
    this.updateAimPreview();
    this.updatePlayer(dt);
    this.updateCubes(dt);
    this.updateButtonsAndDoor();
    this.updatePortalTimers(dt);
    this.updateParticles(dt);
    this.checkExitReached();
  }

  updateAimPreview() {
    const origin = this.getPlayerGunOrigin();
    const dir = { x: this.input.aimX - origin.x, y: this.input.aimY - origin.y };
    this.aimPreview = castRay(this.level.grid, origin, dir);
    if (dir.x !== 0) {
      this.player.facing = dir.x >= 0 ? 1 : -1;
    }
  }

  updatePlayer(dt) {
    const p = this.player;
    if (p.portalCooldown > 0) p.portalCooldown = Math.max(0, p.portalCooldown - dt);
    if (this.input.jumpBufferTimer > 0) this.input.jumpBufferTimer = Math.max(0, this.input.jumpBufferTimer - dt);

    const moveDir = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0);
    const accel = p.onGround ? PHYSICS.MOVE_ACCEL : PHYSICS.AIR_ACCEL;

    if (moveDir !== 0) {
      p.facing = moveDir;
      const sameDirFast = !p.onGround && Math.sign(p.vx) === moveDir && Math.abs(p.vx) > PHYSICS.MAX_RUN_SPEED;
      if (!sameDirFast) {
        p.vx += moveDir * accel * dt;
        if (p.onGround && Math.abs(p.vx) > PHYSICS.MAX_RUN_SPEED) {
          p.vx = Math.sign(p.vx) * PHYSICS.MAX_RUN_SPEED;
        }
      }
    } else if (p.onGround) {
      p.vx *= PHYSICS.GROUND_FRICTION;
      if (Math.abs(p.vx) < 8) p.vx = 0;
    } else {
      p.vx *= PHYSICS.AIR_DRAG;
    }

    p.vy = Math.min(PHYSICS.MAX_SPEED, p.vy + PHYSICS.GRAVITY * dt);

    if (p.onGround) {
      p.coyoteTimer = PHYSICS.COYOTE_TIME;
    } else {
      p.coyoteTimer = Math.max(0, p.coyoteTimer - dt);
    }

    if (this.input.jumpBufferTimer > 0 && p.coyoteTimer > 0) {
      p.vy = PHYSICS.JUMP_VELOCITY;
      p.onGround = false;
      p.coyoteTimer = 0;
      this.input.jumpBufferTimer = 0;
      this.sound?.playJump();
    }

    if (this.tryTeleportEntity(p, true)) {
      return;
    }

    // 记录碰撞前速度，避免高速落入/撞入传送门表面时因碰撞清零而损失动量
    const preImpactVel = { vx: p.vx, vy: p.vy };
    const col = resolveEntityCollisions(p, this.level.grid, dt, [], false);
    p.onGround = col.onGround;

    if (col.hitFizzler) {
      this.clearPortals();
      if (p.carryingCubeId) {
        this.respawnCube(p.carryingCubeId);
        p.carryingCubeId = null;
      }
    }

    if (col.hitHazard) {
      this.deathCount += 1;
      this.sound?.playHazard();
      this.respawnPlayer();
      return;
    }

    this.tryTeleportEntity(p, true, preImpactVel);
  }

  updateCubes(dt) {
    const p = this.player;
    for (const cube of this.cubes) {
      if (cube.portalCooldown > 0) cube.portalCooldown = Math.max(0, cube.portalCooldown - dt);

      if (p.carryingCubeId === cube.id) {
        const targetX = p.x + p.w / 2 + p.facing * 26 - cube.w / 2;
        const targetY = p.y + p.h * 0.38 - cube.h / 2;
        cube.x += (targetX - cube.x) * 0.45;
        cube.y += (targetY - cube.y) * 0.45;
        cube.vx = p.vx;
        cube.vy = p.vy;
        cube.onGround = false;
        continue;
      }

      cube.vy = Math.min(PHYSICS.MAX_SPEED, cube.vy + PHYSICS.GRAVITY * dt);
      if (cube.onGround) {
        cube.vx *= 0.82;
        if (Math.abs(cube.vx) < 6) cube.vx = 0;
      } else {
        cube.vx *= 0.992;
      }

      if (this.tryTeleportEntity(cube, false)) {
        continue;
      }

      const preImpactVel = { vx: cube.vx, vy: cube.vy };
      const col = resolveEntityCollisions(cube, this.level.grid, dt, [], true);
      cube.onGround = col.onGround;

      if (col.hitHazard) {
        this.respawnCube(cube.id);
        continue;
      }

      this.tryTeleportEntity(cube, false, preImpactVel);
    }
  }

  tryTeleportEntity(entity, isPlayer, velocityOverride = null) {
    const { blue, orange } = this.portals;
    if (!blue || !orange) return false;

    const probe = velocityOverride
      ? { ...entity, vx: velocityOverride.vx, vy: velocityOverride.vy }
      : entity;

    let inPortal = null;
    let outPortal = null;

    if (checkPortalEntry(probe, blue)) {
      inPortal = blue;
      outPortal = orange;
    } else if (checkPortalEntry(probe, orange)) {
      inPortal = orange;
      outPortal = blue;
    }

    if (!inPortal || !outPortal) return false;

    const exitState = computePortalExit(probe, inPortal, outPortal);
    entity.x = exitState.x;
    entity.y = exitState.y;
    entity.vx = exitState.vx;
    entity.vy = exitState.vy;
    entity.onGround = false;
    entity.portalCooldown = PHYSICS.PORTAL_COOLDOWN;

    if (isPlayer && this.player.carryingCubeId) {
      const carried = this.cubes.find((c) => c.id === this.player.carryingCubeId);
      if (carried) {
        carried.x = entity.x;
        carried.y = entity.y;
        carried.portalCooldown = PHYSICS.PORTAL_COOLDOWN;
      }
    }

    this.teleportsCount += 1;
    const outColor = outPortal.color === 'blue' ? COLORS.BLUE_PORTAL : COLORS.ORANGE_PORTAL;
    this.spawnBurst(outPortal.x, outPortal.y, outColor, 16);
    this.sound?.playTeleport();
    this.emitState();
    return true;
  }

  updateButtonsAndDoor() {
    if (!this.level.doorRequiresButtons) {
      this.doorOpen = true;
      return;
    }

    let allPressed = true;
    for (const btn of this.buttons) {
      const triggerBox = { x: btn.x - 4, y: btn.y - 10, w: btn.w + 8, h: btn.h + 12 };
      const playerOn = aabbIntersects(this.player, triggerBox);
      const cubeOn = this.cubes.some(
        (c) => c.id !== this.player.carryingCubeId && aabbIntersects(c, triggerBox)
      );
      const nowPressed = playerOn || cubeOn;
      if (nowPressed !== btn.pressed) {
        btn.pressed = nowPressed;
        this.sound?.playButton(nowPressed);
      }
      if (!btn.pressed) allPressed = false;
    }

    if (allPressed !== this.doorOpen) {
      this.doorOpen = allPressed;
      this.emitState();
    }
  }

  checkExitReached() {
    if (!this.doorOpen) return;
    if (aabbIntersects(this.player, this.level.exitRect)) {
      this.completedLevels.add(this.levelIndex);
      this.status = this.levelIndex + 1 >= this.levelCount ? 'all_clear' : 'level_clear';
      this.sound?.playLevelClear();
      this.spawnBurst(
        this.level.exitRect.x + this.level.exitRect.w / 2,
        this.level.exitRect.y + this.level.exitRect.h / 2,
        '#10B981',
        26
      );
      this.emitState();
    }
  }

  respawnPlayer() {
    this.player.x = this.level.spawnPos.x;
    this.player.y = this.level.spawnPos.y;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.onGround = false;
    this.player.portalCooldown = 0.2;
    this.spawnBurst(this.player.x + 12, this.player.y + 20, '#F59E0B', 14);
    this.emitState();
  }

  respawnCube(cubeId) {
    const cube = this.cubes.find((c) => c.id === cubeId);
    const init = this.level.initialCubes.find((c) => c.id === cubeId);
    if (cube && init) {
      cube.x = init.x;
      cube.y = init.y;
      cube.vx = 0;
      cube.vy = 0;
      cube.portalCooldown = 0.2;
      this.spawnBurst(cube.x + 14, cube.y + 14, '#EC4899', 12);
    }
  }

  updatePortalTimers(dt) {
    if (this.portals.blue) this.portals.blue.age += dt;
    if (this.portals.orange) this.portals.orange.age += dt;
  }

  spawnBurst(x, y, color, count = 12) {
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const spd = 60 + Math.random() * 190;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 0.28 + Math.random() * 0.22,
        maxLife: 0.5,
        color,
        size: 2.5 + Math.random() * 3
      });
    }
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.94;
      pt.vy *= 0.94;
      pt.life -= dt;
      if (pt.life <= 0) this.particles.splice(i, 1);
    }
  }

  getSnapshot() {
    return {
      levelIndex: this.levelIndex,
      levelCount: this.levelCount,
      code: this.level.code,
      title: this.level.title,
      subtitle: this.level.subtitle,
      hint: this.level.hint,
      status: this.status,
      doorOpen: this.doorOpen,
      elapsedTime: this.elapsedTime,
      portalsFired: this.portalsFired,
      teleportsCount: this.teleportsCount,
      deathCount: this.deathCount,
      hasBlue: Boolean(this.portals.blue),
      hasOrange: Boolean(this.portals.orange),
      completedCount: this.completedLevels.size
    };
  }

  emitState() {
    if (this.onStateChange) {
      this.onStateChange(this.getSnapshot());
    }
  }
}
