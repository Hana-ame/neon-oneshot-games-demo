// Fixed-timestep 2D physics for worms, projectiles, crates, and explosions

import { PHYSICS, WORLD } from './constants.js';

export function clamp(val, min, max) {
  return val < min ? min : val > max ? max : val;
}

// Consistent ground-support check directly beneath a worm's feet
export function isFootSupported(terrain, x, y) {
  const footY = y + PHYSICS.WORM_RADIUS + 1;
  return (
    terrain.isSolid(x, footY) ||
    terrain.isSolid(x - 4, footY) ||
    terrain.isSolid(x + 4, footY)
  );
}

// Check if a circle collides with solid terrain at (x, y, radius)
export function circleHitsTerrain(terrain, x, y, radius) {
  const samples = 12;
  for (let i = 0; i < samples; i++) {
    const a = (i / samples) * Math.PI * 2;
    if (terrain.isSolid(x + Math.cos(a) * radius, y + Math.sin(a) * radius)) {
      return true;
    }
  }
  return terrain.isSolid(x, y);
}

// Walk worm horizontally with automatic slope climbing
export function walkWorm(worm, terrain, dir, dt) {
  if (!worm.alive || !worm.grounded) return false;
  worm.facing = dir >= 0 ? 1 : -1;

  const stepDist = PHYSICS.WORM_WALK_SPEED * dt;
  const steps = Math.max(1, Math.ceil(stepDist));
  const dx = (dir * stepDist) / steps;
  let moved = false;

  for (let s = 0; s < steps; s++) {
    const nx = clamp(worm.x + dx, PHYSICS.WORM_RADIUS, terrain.width - PHYSICS.WORM_RADIUS);
    // Try climbing up to WORM_MAX_CLIMB pixels
    let climbed = false;
    for (let climb = 0; climb <= PHYSICS.WORM_MAX_CLIMB; climb++) {
      const testY = worm.y - climb;
      const footSolid = terrain.isSolid(nx, testY + PHYSICS.WORM_RADIUS - 1);
      const midSolid = terrain.isSolid(nx, testY);
      const headSolid = terrain.isSolid(nx, testY - PHYSICS.WORM_RADIUS + 2);
      if (!footSolid && !midSolid && !headSolid) {
        worm.x = nx;
        worm.y = testY;
        climbed = true;
        moved = true;
        break;
      }
    }
    if (!climbed) break;

    // Follow downward slope smoothly (up to WORM_MAX_CLIMB px)
    for (let drop = 1; drop <= PHYSICS.WORM_MAX_CLIMB; drop++) {
      if (isFootSupported(terrain, worm.x, worm.y)) {
        break;
      }
      worm.y += 1;
    }
  }

  if (moved) {
    worm.walkPhase += dt * 12;
  }
  return moved;
}

// Integrate worm physics (gravity, terrain collision, bounce, fall damage, drowning)
export function stepWormPhysics(worm, terrain, waterLevel, dt, onEvent) {
  if (!worm.alive) return;

  const supported = isFootSupported(terrain, worm.x, worm.y);
  if (worm.grounded && !supported) {
    worm.grounded = false;
  }

  if (!worm.grounded) {
    worm.vy += PHYSICS.GRAVITY * dt;
    worm.vx *= PHYSICS.AIR_DRAG;
  } else {
    worm.vx *= PHYSICS.GROUND_FRICTION;
    if (Math.abs(worm.vx) < 4) worm.vx = 0;
    worm.vy = 0;
  }

  // Fast path: worm is cleanly resting on solid ground with zero velocity
  if (worm.grounded && worm.vx === 0 && worm.vy === 0) {
    if (worm.y + PHYSICS.WORM_RADIUS * 0.5 >= waterLevel || worm.y > terrain.height + 40) {
      worm.hp = 0;
      worm.alive = false;
      worm.drowned = true;
      onEvent?.({ type: 'worm_drowned', worm });
    }
    return;
  }

  // Sub-step movement to prevent tunneling through thin terrain
  const speed = Math.hypot(worm.vx, worm.vy);
  const subSteps = Math.max(1, Math.ceil((speed * dt) / 4));
  const subDt = dt / subSteps;

  for (let i = 0; i < subSteps; i++) {
    const nextX = worm.x + worm.vx * subDt;
    const nextY = worm.y + worm.vy * subDt;

    // Horizontal check
    if (nextX < PHYSICS.WORM_RADIUS || nextX > terrain.width - PHYSICS.WORM_RADIUS) {
      worm.vx = -worm.vx * 0.4;
    } else if (
      worm.vx !== 0 &&
      terrain.isSolid(nextX + Math.sign(worm.vx) * (PHYSICS.WORM_RADIUS - 2), worm.y - 2)
    ) {
      worm.vx = -worm.vx * PHYSICS.RESTITUTION_WORM;
    } else {
      worm.x = nextX;
    }

    // Vertical check
    if (worm.vy >= 0) {
      const hitFloor =
        terrain.isSolid(worm.x, nextY + PHYSICS.WORM_RADIUS) ||
        terrain.isSolid(worm.x - 4, nextY + PHYSICS.WORM_RADIUS) ||
        terrain.isSolid(worm.x + 4, nextY + PHYSICS.WORM_RADIUS);

      if (hitFloor) {
        const impactVy = worm.vy;
        if (impactVy > PHYSICS.FALL_DAMAGE_THRESHOLD) {
          const dmg = Math.round((impactVy - PHYSICS.FALL_DAMAGE_THRESHOLD) * PHYSICS.FALL_DAMAGE_SCALE);
          if (dmg > 0) {
            worm.hp = Math.max(0, worm.hp - dmg);
            onEvent?.({ type: 'fall_damage', worm, damage: dmg });
            if (worm.hp <= 0) {
              worm.alive = false;
              onEvent?.({ type: 'worm_died', worm, reason: 'fall' });
              return;
            }
          }
        }
        if (impactVy > 150) {
          worm.vy = -impactVy * PHYSICS.RESTITUTION_WORM;
          worm.vx *= 0.65;
          worm.grounded = false;
        } else {
          // Snap cleanly right onto the top of the solid floor pixel so isFootSupported stays true
          worm.y = Math.floor(nextY + PHYSICS.WORM_RADIUS) - PHYSICS.WORM_RADIUS - 0.1;
          worm.vy = 0;
          worm.grounded = true;
          break;
        }
      } else {
        worm.y = nextY;
        worm.grounded = isFootSupported(terrain, worm.x, worm.y) && worm.vy === 0;
      }
    } else {
      // Moving upward
      if (terrain.isSolid(worm.x, nextY - PHYSICS.WORM_RADIUS)) {
        worm.vy = -worm.vy * 0.3;
      } else {
        worm.y = nextY;
      }
    }
  }

  // Water / out-of-bounds drowning check
  if (worm.y + PHYSICS.WORM_RADIUS * 0.5 >= waterLevel || worm.y > terrain.height + 40) {
    worm.hp = 0;
    worm.alive = false;
    worm.drowned = true;
    onEvent?.({ type: 'worm_drowned', worm });
  }
}

// Integrate projectile physics with wind, gravity, terrain collision, and fuse timers
export function stepProjectilePhysics(proj, terrain, worms, wind, waterLevel, dt) {
  if (!proj.active) return null;

  proj.age += dt;
  if (proj.fuse > 0) {
    proj.fuseRemaining -= dt;
    if (proj.fuseRemaining <= 0) {
      proj.active = false;
      return { reason: 'fuse', x: proj.x, y: proj.y };
    }
  }

  const ax = wind * PHYSICS.WIND_ACCEL_SCALE * proj.windFactor;
  const ay = PHYSICS.GRAVITY * proj.gravityFactor;

  proj.vx += ax * dt;
  proj.vy += ay * dt;

  const speed = Math.hypot(proj.vx, proj.vy);
  const subSteps = Math.max(1, Math.ceil((speed * dt) / 3));
  const subDt = dt / subSteps;

  for (let i = 0; i < subSteps; i++) {
    const nx = proj.x + proj.vx * subDt;
    const ny = proj.y + proj.vy * subDt;

    // Out of horizontal bounds or in water
    if (nx < -120 || nx > terrain.width + 120 || ny >= waterLevel) {
      proj.active = false;
      return { reason: 'water', x: nx, y: Math.min(ny, waterLevel) };
    }

    // Direct hit on worms (after brief grace period so shooter doesn't self-hit immediately)
    if (!proj.bounces && proj.age > 0.08) {
      for (const w of worms) {
        if (!w.alive) continue;
        if (w.id === proj.ownerId && proj.age < 0.28) continue;
        const d = Math.hypot(nx - w.x, ny - w.y);
        if (d <= PHYSICS.WORM_RADIUS + proj.radius) {
          proj.x = nx;
          proj.y = ny;
          proj.active = false;
          return { reason: 'hit_worm', x: nx, y: ny, worm: w };
        }
      }
    }

    // Terrain collision
    if (ny >= 0 && terrain.isSolid(nx, ny)) {
      if (proj.bounces) {
        const impactSpeed = Math.hypot(proj.vx, proj.vy);
        const normal = terrain.getNormal(nx, ny, 5);
        const dot = proj.vx * normal.x + proj.vy * normal.y;
        const rest = proj.restitution ?? PHYSICS.RESTITUTION_GRENADE;
        proj.vx = (proj.vx - 2 * dot * normal.x) * rest;
        proj.vy = (proj.vy - 2 * dot * normal.y) * rest;
        proj.x += normal.x * 1.2;
        proj.y += normal.y * 1.2;
        // Dampen micro-bounces so grenade settles smoothly on the floor
        if (Math.hypot(proj.vx, proj.vy) < 35) {
          proj.vx *= 0.35;
          proj.vy = 0;
        }
        proj.bounced = true;
        return impactSpeed > 55 ? { reason: 'bounce', x: proj.x, y: proj.y } : null;
      } else if (proj.type === 'drop') {
        proj.vx *= 0.5;
        proj.vy = 0;
        return null;
      } else {
        proj.x = nx;
        proj.y = ny;
        proj.active = false;
        return { reason: 'hit_terrain', x: nx, y: ny };
      }
    }

    proj.x = nx;
    proj.y = ny;
  }

  return null;
}

// Compute explosion damage and knockback impulse for all living worms
export function applyExplosionDamage(cx, cy, blastRadius, maxDamage, maxKnockback, worms) {
  const effectiveRadius = blastRadius + PHYSICS.WORM_RADIUS + 8;
  const affected = [];

  for (const w of worms) {
    if (!w.alive) continue;
    const dx = w.x - cx;
    const dy = w.y - cy;
    const dist = Math.hypot(dx, dy);

    if (dist <= effectiveRadius) {
      const falloff = Math.max(0.15, 1 - dist / effectiveRadius);
      const damage = Math.max(1, Math.round(maxDamage * falloff));
      const nx = dist > 0.01 ? dx / dist : 0;
      const ny = dist > 0.01 ? dy / dist : -1;
      const impulse = maxKnockback * falloff;

      w.hp = Math.max(0, w.hp - damage);
      w.vx += nx * impulse;
      w.vy += (ny - 0.35) * impulse;
      w.grounded = false;

      if (w.hp <= 0) {
        w.alive = false;
      }

      affected.push({ worm: w, damage, killed: !w.alive, dist });
    }
  }

  return affected;
}

// Perform hitscan raycast (Shotgun)
export function castRay(terrain, worms, ownerId, startX, startY, angleRad, maxRange) {
  const step = 3;
  const dx = Math.cos(angleRad);
  const dy = Math.sin(angleRad);

  for (let d = 10; d <= maxRange; d += step) {
    const x = startX + dx * d;
    const y = startY + dy * d;

    if (x < 0 || x >= terrain.width || y < -100 || y >= WORLD.HEIGHT) {
      return { hit: false, x, y, type: 'oob' };
    }

    // Check worm hit
    for (const w of worms) {
      if (!w.alive || w.id === ownerId) continue;
      if (Math.hypot(x - w.x, y - w.y) <= PHYSICS.WORM_RADIUS + 2) {
        return { hit: true, x, y, type: 'worm', worm: w };
      }
    }

    // Check terrain hit
    if (y >= 0 && terrain.isSolid(x, y)) {
      return { hit: true, x, y, type: 'terrain' };
    }
  }

  return {
    hit: false,
    x: startX + dx * maxRange,
    y: startY + dy * maxRange,
    type: 'range',
  };
}
