/**
 * 百战天虫 3D - 智能 AI 决策与弹道求解器
 * 支持目标优先级评估、武器选择、考虑风力补偿的弹道仰角/力度网格搜索。
 */

import { WORLD_CONFIG, WEAPONS, TURN_PHASE } from './constants.js';
import { aimToDirection } from './physics.js';

/**
 * 为指定射手和目标求解最优 (yaw, pitch, power)
 * 通过前向物理积分模拟 + 风力补偿误差最小化
 */
export function solveBallisticShot(shooter, target, weapon, wind, terrain) {
  const dx = target.x - shooter.x;
  const dz = target.z - shooter.z;
  const baseYaw = Math.atan2(dx, dz);

  // 近战棒球棍直接朝向目标
  if (weapon.type === 'melee') {
    return { yaw: baseYaw, pitch: 0.2, power: 1.0, error: Math.hypot(dx, dz) };
  }

  // 霰弹枪直接直线瞄准目标中心
  if (weapon.type === 'hitscan') {
    const dy = (target.y + 0.9) - (shooter.y + WORLD_CONFIG.WORM_HEIGHT * 0.68);
    const horiz = Math.max(0.1, Math.hypot(dx, dz));
    const pitch = Math.max(-0.5, Math.min(1.2, Math.atan2(dy, horiz)));
    return { yaw: baseYaw, pitch, power: 1.0, error: 0.5 };
  }

  // 空中打击按距离比例计算蓄力值
  if (weapon.type === 'airstrike') {
    const horiz = Math.hypot(dx, dz);
    const power = Math.max(0.1, Math.min(1.0, (horiz - weapon.minRange) / (weapon.maxRange - weapon.minRange)));
    return { yaw: baseYaw, pitch: 0.45, power, error: 1.0 };
  }

  // 抛物线武器（火箭筒/手榴弹/集束炸弹）：候选仰角 × 力度 × 风力偏航修正搜索
  let best = { yaw: baseYaw, pitch: 0.65, power: 0.65, error: Infinity };
  const pitchCandidates = [0.35, 0.55, 0.78, 1.0];
  const powerCandidates = [0.25, 0.4, 0.55, 0.7, 0.85, 0.98];
  const yawOffsets = weapon.windFactor > 0 ? [-0.36, -0.24, -0.14, -0.06, 0, 0.06, 0.14, 0.24, 0.36] : [0];

  const originY = shooter.y + WORLD_CONFIG.WORM_HEIGHT * 0.68;

  for (const pitch of pitchCandidates) {
    for (const power of powerCandidates) {
      for (const yOff of yawOffsets) {
        const yaw = baseYaw + yOff;
        const dir = aimToDirection(yaw, pitch);
        const speed = weapon.minSpeed + (weapon.maxSpeed - weapon.minSpeed) * power;

        let x = shooter.x + dir.x * 1.15;
        let y = originY + dir.y * 0.8;
        let z = shooter.z + dir.z * 1.15;
        let vx = dir.x * speed;
        let vy = dir.y * speed;
        let vz = dir.z * speed;

        const dt = 0.06;
        let minErr = Infinity;

        for (let step = 0; step < 65; step++) {
          vx += wind.x * weapon.windFactor * dt;
          vz += wind.z * weapon.windFactor * dt;
          vy -= WORLD_CONFIG.GRAVITY * dt;
          x += vx * dt;
          y += vy * dt;
          z += vz * dt;

          const err = Math.hypot(x - target.x, y - (target.y + 0.8), z - target.z);
          if (err < minErr) minErr = err;

          const gy = terrain.getHeightAt(x, z);
          if (y <= gy || y <= WORLD_CONFIG.WATER_LEVEL) {
            break;
          }
        }

        if (minErr < best.error) {
          best = { yaw, pitch, power, error: minErr };
        }
      }
    }
  }

  return best;
}

export class AIController {
  constructor(engine, options = {}) {
    this.engine = engine;
    this.jitter = options.jitter !== undefined ? options.jitter : 0.04; // 模拟人类轻微瞄准误差
    this.thinkTimer = 0;
    this.plan = null;
  }

  resetPlan() {
    this.plan = null;
    this.thinkTimer = 0.85;
  }

  /** 为当前 AI 虫子制定战术计划 */
  computePlan() {
    const worm = this.engine.getActiveWorm();
    const team = this.engine.getActiveTeam();
    if (!worm || !worm.alive) return null;

    const enemies = this.engine.getTeamWorms(1 - worm.teamId, true);
    if (enemies.length === 0) return null;

    // 目标优先级：优先攻击距离较近、血量较低或靠近海边的敌虫
    let bestTarget = enemies[0];
    let bestScore = -Infinity;
    for (const e of enemies) {
      const dist = Math.hypot(e.x - worm.x, e.z - worm.z);
      const lowHpBonus = (100 - e.hp) * 0.35;
      const edgeBonus = e.y < this.engine.waterLevel + 3.0 ? 18 : 0;
      const score = 60 - dist + lowHpBonus + edgeBonus;
      if (score > bestScore) {
        bestScore = score;
        bestTarget = e;
      }
    }

    const dist = Math.hypot(bestTarget.x - worm.x, bestTarget.z - worm.z);

    // 武器选择策略
    let weaponId = 'bazooka';
    if (dist <= WEAPONS.bat.meleeRange - 0.3) {
      weaponId = 'bat';
    } else if (dist <= 22 && team.ammo.shotgun > 0 && Math.abs(bestTarget.y - worm.y) < 5) {
      weaponId = 'shotgun';
    } else if (dist >= 16 && dist <= 34 && team.ammo.airstrike > 0 && this.engine.round >= 2) {
      weaponId = 'airstrike';
    } else if (dist <= 26 && team.ammo.cluster > 0) {
      weaponId = 'cluster';
    } else if (Math.hypot(this.engine.wind.x, this.engine.wind.z) > 5.5) {
      // 大风天气优先用手榴弹规避风力偏移
      weaponId = 'grenade';
    }

    const weapon = WEAPONS[weaponId];
    const solution = solveBallisticShot(worm, bestTarget, weapon, this.engine.wind, this.engine.terrain);

    // 注入适度拟人误差，保证对战有趣而非100%自瞄
    const jitterYaw = (this.engine.rng() * 2 - 1) * this.jitter;
    const jitterPow = (this.engine.rng() * 2 - 1) * this.jitter;

    return {
      weaponId,
      targetYaw: solution.yaw + jitterYaw,
      targetPitch: solution.pitch,
      targetPower: Math.max(0.15, Math.min(0.98, solution.power + jitterPow)),
      fired: false,
    };
  }

  /** 每帧由主循环调用，驱动 AI 平滑瞄准并开火 */
  update(dt) {
    if (this.engine.phase !== TURN_PHASE.AIM) {
      this.plan = null;
      return;
    }
    const team = this.engine.getActiveTeam();
    if (!team || !team.isAI) {
      this.plan = null;
      return;
    }

    if (!this.plan) {
      this.thinkTimer -= dt;
      if (this.thinkTimer <= 0) {
        this.plan = this.computePlan();
        if (this.plan) {
          this.engine.selectWeapon(this.plan.weaponId);
        }
      }
      return;
    }

    const worm = this.engine.getActiveWorm();
    if (!worm || !worm.alive) return;

    // 平滑插值转向与仰角
    let diffYaw = this.plan.targetYaw - worm.yaw;
    while (diffYaw > Math.PI) diffYaw -= Math.PI * 2;
    while (diffYaw < -Math.PI) diffYaw += Math.PI * 2;

    const diffPitch = this.plan.targetPitch - worm.pitch;

    const yawStep = Math.sign(diffYaw) * Math.min(Math.abs(diffYaw), 2.8 * dt);
    const pitchStep = Math.sign(diffPitch) * Math.min(Math.abs(diffPitch), 1.8 * dt);
    worm.yaw += yawStep;
    worm.pitch += pitchStep;

    if (Math.abs(diffYaw) < 0.04 && Math.abs(diffPitch) < 0.04 && !this.plan.fired) {
      this.plan.fired = true;
      this.engine.fireWeapon(this.plan.targetPower);
      this.plan = null;
    }
  }
}
