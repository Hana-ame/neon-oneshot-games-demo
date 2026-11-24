/**
 * 百战天虫 3D - 物理与弹道碰撞引擎
 * 负责弹丸抛物线运动、风力偏移、手榴弹3D地形反弹、射线检测、爆炸冲击波伤害与击退、虫子重力与摔落伤害。
 */

import { WORLD_CONFIG } from './constants.js';

/** 计算瞄准方向单位向量 (yaw 绕 Y 轴, pitch 仰角) */
export function aimToDirection(yaw, pitch) {
  const cosP = Math.cos(pitch);
  return {
    x: Math.sin(yaw) * cosP,
    y: Math.sin(pitch),
    z: Math.cos(yaw) * cosP,
  };
}

/** 预测抛物线轨迹采样点（用于 3D 瞄准虚线预览） */
export function sampleTrajectory(origin, velocity, wind, windFactor = 1.0, steps = 22, dt = 0.08) {
  const points = [];
  let x = origin.x;
  let y = origin.y;
  let z = origin.z;
  let vx = velocity.x;
  let vy = velocity.y;
  let vz = velocity.z;

  for (let i = 0; i < steps; i++) {
    points.push({ x, y, z });
    vx += wind.x * windFactor * dt;
    vz += wind.z * windFactor * dt;
    vy -= WORLD_CONFIG.GRAVITY * dt;
    x += vx * dt;
    y += vy * dt;
    z += vz * dt;
  }
  return points;
}

/**
 * 步进单个弹丸物理状态
 * 返回事件对象: null | { type: 'explode', x, y, z, reason } | { type: 'splash', x, y, z } | { type: 'bounce', x, y, z }
 */
export function stepProjectile(proj, dt, terrain, worms, wind, waterLevel) {
  if (!proj.alive) return null;

  proj.age += dt;
  // 引信倒计时（手榴弹、集束炸弹）
  if (proj.fuseTime > 0 && proj.age >= proj.fuseTime) {
    proj.alive = false;
    return { type: 'explode', x: proj.x, y: proj.y, z: proj.z, reason: 'fuse' };
  }

  // 风力与重力
  proj.vx += wind.x * proj.windFactor * dt;
  proj.vz += wind.z * proj.windFactor * dt;
  proj.vy -= WORLD_CONFIG.GRAVITY * dt;

  // 子步防穿透
  const speed = Math.hypot(proj.vx, proj.vy, proj.vz);
  const subSteps = Math.max(1, Math.ceil((speed * dt) / 0.45));
  const subDt = dt / subSteps;
  let bounced = false;

  for (let s = 0; s < subSteps; s++) {
    proj.x += proj.vx * subDt;
    proj.y += proj.vy * subDt;
    proj.z += proj.vz * subDt;

    // 落水检测
    if (proj.y <= waterLevel) {
      proj.alive = false;
      return { type: 'splash', x: proj.x, y: waterLevel, z: proj.z };
    }

    // 越界检测
    if (Math.abs(proj.x) > terrain.halfSize + 15 || Math.abs(proj.z) > terrain.halfSize + 15 || proj.y < -15) {
      proj.alive = false;
      return { type: 'oob', x: proj.x, y: proj.y, z: proj.z };
    }

    // 虫子直接命中检测（发射 0.12 秒后忽略自身，避免炸脸）
    for (const worm of worms) {
      if (!worm.alive) continue;
      if (worm.id === proj.ownerId && proj.age < 0.18) continue;
      const dx = proj.x - worm.x;
      const dy = proj.y - (worm.y + WORLD_CONFIG.WORM_HEIGHT * 0.5);
      const dz = proj.z - worm.z;
      const hitDist = WORLD_CONFIG.WORM_RADIUS + proj.radius;
      if (dx * dx + dy * dy + dz * dz <= hitDist * hitDist) {
        if (proj.bounces === 0) {
          proj.alive = false;
          return { type: 'explode', x: proj.x, y: proj.y, z: proj.z, reason: 'worm_hit' };
        }
      }
    }

    // 地形碰撞检测
    const groundY = terrain.getHeightAt(proj.x, proj.z);
    if (proj.y - proj.radius <= groundY) {
      if (proj.bounces > 0 && proj.bounceCount < proj.bounces) {
        const n = terrain.getNormalAt(proj.x, proj.z);
        proj.y = groundY + proj.radius + 0.02;
        const dot = proj.vx * n.x + proj.vy * n.y + proj.vz * n.z;
        if (dot < 0) {
          const rest = proj.restitution || 0.5;
          proj.vx = (proj.vx - 2 * dot * n.x) * rest;
          proj.vy = (proj.vy - 2 * dot * n.y) * rest;
          proj.vz = (proj.vz - 2 * dot * n.z) * rest;
          // 切向摩擦
          proj.vx *= 0.86;
          proj.vz *= 0.86;
          proj.bounceCount++;
          bounced = true;
        }
      } else if (proj.fuseTime > 0) {
        // 引信武器停在地面滚动等待引爆
        proj.y = groundY + proj.radius;
        proj.vx *= 0.78;
        proj.vy = 0;
        proj.vz *= 0.78;
      } else {
        proj.y = groundY;
        proj.alive = false;
        return { type: 'explode', x: proj.x, y: proj.y, z: proj.z, reason: 'terrain_hit' };
      }
    }
  }

  return bounced ? { type: 'bounce', x: proj.x, y: proj.y, z: proj.z } : null;
}

/** 霰弹枪瞬发射线检测 */
export function castHitscanRay(origin, dir, maxRange, terrain, worms, ownerId) {
  const stepSize = 0.35;
  const steps = Math.ceil(maxRange / stepSize);
  let x = origin.x;
  let y = origin.y;
  let z = origin.z;

  for (let i = 1; i <= steps; i++) {
    x = origin.x + dir.x * stepSize * i;
    y = origin.y + dir.y * stepSize * i;
    z = origin.z + dir.z * stepSize * i;

    for (const worm of worms) {
      if (!worm.alive || worm.id === ownerId) continue;
      const dx = x - worm.x;
      const dy = y - (worm.y + WORLD_CONFIG.WORM_HEIGHT * 0.5);
      const dz = z - worm.z;
      const r = WORLD_CONFIG.WORM_RADIUS + 0.25;
      if (dx * dx + dy * dy + dz * dz <= r * r) {
        return { hit: true, type: 'worm', wormId: worm.id, x, y, z };
      }
    }

    const groundY = terrain.getHeightAt(x, z);
    if (y <= groundY) {
      return { hit: true, type: 'terrain', x, y: groundY, z };
    }
  }

  return { hit: false, type: 'miss', x, y, z };
}

/**
 * 计算爆炸对所有存活虫子的伤害与三维击退冲量
 * 返回受损虫子明细数组
 */
export function applyExplosionToWorms(cx, cy, cz, blastRadius, maxDamage, knockback, worms) {
  const impacts = [];

  for (const worm of worms) {
    if (!worm.alive) continue;
    const wy = worm.y + WORLD_CONFIG.WORM_HEIGHT * 0.45;
    const dx = worm.x - cx;
    const dy = wy - cy;
    const dz = worm.z - cz;
    const dist = Math.hypot(dx, dy, dz);

    if (dist <= blastRadius) {
      const falloff = Math.max(0.15, 1 - dist / blastRadius);
      const damage = Math.round(maxDamage * falloff);

      // 计算三维击退方向（保证带一定向上挑飞分量）
      const inv = dist > 0.01 ? 1 / dist : 0;
      const dirX = dist > 0.01 ? dx * inv : 0;
      const dirZ = dist > 0.01 ? dz * inv : 0;
      const impulse = knockback * falloff;

      worm.vx += dirX * impulse;
      worm.vz += dirZ * impulse;
      worm.vy += Math.max(4.5, (dy * inv + 0.65) * impulse * 0.72);
      worm.grounded = false;

      worm.hp = Math.max(0, worm.hp - damage);
      if (worm.hp <= 0) {
        worm.alive = false;
      }

      impacts.push({ wormId: worm.id, damage, remainingHp: worm.hp, killed: !worm.alive });
    }
  }

  return impacts;
}

/**
 * 步进单个虫子物理状态（重力、坡面贴合、空气阻力、摔落伤害、落水淹死）
 */
export function stepWormPhysics(worm, dt, terrain, waterLevel) {
  if (!worm.alive) return null;

  const events = [];

  // 如果处于浮空状态或速度较大，执行弹道运动
  const groundY = terrain.getHeightAt(worm.x, worm.z);
  if (worm.y > groundY + 0.08 || Math.abs(worm.vy) > 0.05 || !worm.grounded) {
    worm.grounded = false;
    worm.vy -= WORLD_CONFIG.GRAVITY * dt;
    worm.x += worm.vx * dt;
    worm.y += worm.vy * dt;
    worm.z += worm.vz * dt;

    // 轻微空气阻力
    worm.vx *= Math.pow(0.92, dt * 10);
    worm.vz *= Math.pow(0.92, dt * 10);

    const newGroundY = terrain.getHeightAt(worm.x, worm.z);
    if (worm.y <= newGroundY) {
      const impactSpeed = -worm.vy;
      worm.y = newGroundY;
      worm.vy = 0;
      worm.vx *= 0.35;
      worm.vz *= 0.35;
      worm.grounded = true;

      if (impactSpeed > WORLD_CONFIG.FALL_DAMAGE_THRESHOLD) {
        const dmg = Math.round((impactSpeed - WORLD_CONFIG.FALL_DAMAGE_THRESHOLD) * WORLD_CONFIG.FALL_DAMAGE_SCALE);
        if (dmg > 0) {
          worm.hp = Math.max(0, worm.hp - dmg);
          if (worm.hp <= 0) worm.alive = false;
          events.push({ type: 'fall_damage', wormId: worm.id, damage: dmg, killed: !worm.alive });
        }
      }
    }
  } else {
    // 地面摩擦阻尼
    worm.y = groundY;
    worm.vx *= Math.pow(0.25, dt * 10);
    worm.vz *= Math.pow(0.25, dt * 10);
    if (Math.hypot(worm.vx, worm.vz) < 0.08) {
      worm.vx = 0;
      worm.vz = 0;
    } else {
      worm.x += worm.vx * dt;
      worm.z += worm.vz * dt;
      worm.y = terrain.getHeightAt(worm.x, worm.z);
    }
  }

  // 落水或越界淹死判定
  if (
    worm.y <= waterLevel - 0.15 ||
    Math.abs(worm.x) > terrain.halfSize + 2 ||
    Math.abs(worm.z) > terrain.halfSize + 2
  ) {
    worm.hp = 0;
    worm.alive = false;
    events.push({ type: 'drown', wormId: worm.id, x: worm.x, y: waterLevel, z: worm.z });
  }

  return events;
}
