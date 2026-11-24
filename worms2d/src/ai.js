// Tactical AI controller with ballistic wind-compensated trajectory solver

import { PHYSICS, WEAPON_MAP } from './constants.js';
import { castRay } from './physics.js';

// Numerically solve ballistic firing solution (facing, aimAngle, power) to hit (tx, ty)
export function solveBallisticShot(shooter, target, terrain, wind, weaponId = 'bazooka') {
  const weapon = WEAPON_MAP[weaponId] || WEAPON_MAP.bazooka;
  const dx = target.x - shooter.x;
  const facing = dx >= 0 ? 1 : -1;

  const ax = wind * PHYSICS.WIND_ACCEL_SCALE * weapon.windFactor;
  const ay = PHYSICS.GRAVITY * weapon.gravityFactor;

  let bestSolution = null;
  let bestScore = Infinity;

  // Sweep candidate launch angles (-75 deg to +20 deg) and powers (0.25..1.0)
  const angles = [-1.25, -1.05, -0.88, -0.72, -0.56, -0.4, -0.24, -0.08, 0.12];
  const powers = [0.28, 0.4, 0.52, 0.64, 0.76, 0.88, 0.98];

  for (const aimAngle of angles) {
    const worldAngle = facing === 1 ? aimAngle : Math.PI - aimAngle;
    const cosA = Math.cos(worldAngle);
    const sinA = Math.sin(worldAngle);
    const startX = shooter.x + cosA * (PHYSICS.WORM_RADIUS + 7);
    const startY = shooter.y - 3 + sinA * (PHYSICS.WORM_RADIUS + 7);

    for (const power of powers) {
      const speed = weapon.minSpeed + (weapon.maxSpeed - weapon.minSpeed) * power;
      let x = startX;
      let y = startY;
      let vx = cosA * speed;
      let vy = sinA * speed;

      const simDt = 0.035;
      let minDist = Infinity;
      let blockedEarly = false;

      for (let step = 0; step < 95; step++) {
        vx += ax * simDt;
        vy += ay * simDt;
        x += vx * simDt;
        y += vy * simDt;

        const d = Math.hypot(x - target.x, y - target.y);
        if (d < minDist) minDist = d;

        if (d < 22) break;
        if (x < 0 || x > terrain.width || y > terrain.height) break;

        if (y >= 0 && terrain.isSolid(x, y)) {
          if (step < 5) blockedEarly = true;
          break;
        }
      }

      const penalty = blockedEarly ? 240 : 0;
      const score = minDist + penalty;
      if (score < bestScore) {
        bestScore = score;
        bestSolution = { facing, aimAngle, power, estimatedMiss: minDist };
      }
    }
  }

  return bestSolution || { facing, aimAngle: -0.65, power: 0.65, estimatedMiss: 999 };
}

// Choose best enemy target and weapon for AI worm
export function planAiTurn(game, worm) {
  const enemies = game.worms.filter((w) => w.alive && w.teamId !== worm.teamId);
  if (enemies.length === 0) return null;

  // Prefer closest or low-HP enemy
  let target = enemies[0];
  let bestPriority = Infinity;
  for (const e of enemies) {
    const dist = Math.hypot(e.x - worm.x, e.y - worm.y);
    const priority = dist - (100 - e.hp) * 2.2;
    if (priority < bestPriority) {
      bestPriority = priority;
      target = e;
    }
  }

  const dist = Math.hypot(target.x - worm.x, target.y - worm.y);
  const facing = target.x >= worm.x ? 1 : -1;
  const teamAmmo = game.teamAmmo[worm.teamId];

  // Check if direct shotgun line of sight exists at medium/close range
  if (dist < 380) {
    const directAngle = Math.atan2(target.y - (worm.y - 3), target.x - worm.x);
    const ray = castRay(
      game.terrain,
      game.worms,
      worm.id,
      worm.x + Math.cos(directAngle) * (PHYSICS.WORM_RADIUS + 6),
      worm.y - 3 + Math.sin(directAngle) * (PHYSICS.WORM_RADIUS + 6),
      directAngle,
      440
    );
    if (ray.hit && ray.type === 'worm' && ray.worm.teamId !== worm.teamId) {
      const localAim = facing === 1 ? directAngle : Math.PI - directAngle;
      return {
        weaponId: 'shotgun',
        facing,
        aimAngle: Math.max(-1.45, Math.min(1.45, localAim)),
        power: 1.0,
        targetPos: { x: target.x, y: target.y },
        walkDir: 0,
        walkDuration: 0,
      };
    }
  }

  // If very strong wind or clear overhead, consider airstrike if available
  if (teamAmmo.airstrike > 0 && Math.abs(game.wind) > 55 && dist > 300) {
    return {
      weaponId: 'airstrike',
      facing,
      aimAngle: -0.5,
      power: 1.0,
      targetPos: { x: target.x, y: target.y },
      walkDir: 0,
      walkDuration: 0,
    };
  }

  // Try Bazooka vs Grenade ballistic solution
  const bazookaSol = solveBallisticShot(worm, target, game.terrain, game.wind, 'bazooka');
  const grenadeSol = solveBallisticShot(worm, target, game.terrain, 0, 'grenade');

  let chosenWeapon = 'bazooka';
  let sol = bazookaSol;

  if (grenadeSol.estimatedMiss + 12 < bazookaSol.estimatedMiss && dist < 560) {
    chosenWeapon = teamAmmo.cluster > 0 && dist > 180 ? 'cluster' : 'grenade';
    sol = grenadeSol;
  }

  // Add slight human-like imperfection so AI feels fair and fun
  const jitter = (Math.random() - 0.5) * 0.07;
  return {
    weaponId: chosenWeapon,
    facing: sol.facing,
    aimAngle: Math.max(-1.42, Math.min(1.35, sol.aimAngle + jitter)),
    power: Math.max(0.22, Math.min(0.98, sol.power + (Math.random() - 0.5) * 0.06)),
    targetPos: { x: target.x, y: target.y },
    walkDir: sol.estimatedMiss > 90 ? facing : 0,
    walkDuration: sol.estimatedMiss > 90 ? 0.55 : 0,
  };
}
