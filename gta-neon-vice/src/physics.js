(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./config'));
  } else {
    root.GTAPhysics = factory(root.GTAConfig);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Config) {
  'use strict';

  function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  }

  function normalizeAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function distSq(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
  }

  function dist(ax, ay, bx, by) {
    return Math.hypot(ax - bx, ay - by);
  }

  /**
   * Resolve circle vs AABB building collision.
   * Returns { hit, nx, ny, penetration } and mutates entity x, y.
   */
  function resolveCircleAABB(entity, radius, rect) {
    const closestX = clamp(entity.x, rect.x, rect.x + rect.w);
    const closestY = clamp(entity.y, rect.y, rect.y + rect.h);
    const dx = entity.x - closestX;
    const dy = entity.y - closestY;
    const d2 = dx * dx + dy * dy;

    if (d2 >= radius * radius) {
      return { hit: false, nx: 0, ny: 0, penetration: 0 };
    }

    const d = Math.sqrt(d2);
    let nx = 0;
    let ny = 0;
    let penetration = 0;

    if (d > 0.0001) {
      nx = dx / d;
      ny = dy / d;
      penetration = radius - d;
    } else {
      // Center is inside rect — push out along shallowest axis
      const leftPen = entity.x - rect.x;
      const rightPen = rect.x + rect.w - entity.x;
      const topPen = entity.y - rect.y;
      const bottomPen = rect.y + rect.h - entity.y;
      const minPen = Math.min(leftPen, rightPen, topPen, bottomPen);
      if (minPen === leftPen) { nx = -1; ny = 0; penetration = leftPen + radius; }
      else if (minPen === rightPen) { nx = 1; ny = 0; penetration = rightPen + radius; }
      else if (minPen === topPen) { nx = 0; ny = -1; penetration = topPen + radius; }
      else { nx = 0; ny = 1; penetration = bottomPen + radius; }
    }

    entity.x += nx * penetration;
    entity.y += ny * penetration;
    return { hit: true, nx, ny, penetration };
  }

  /**
   * Resolve circle vs world boundaries and all buildings.
   */
  function resolveWorldCollisions(entity, radius, world, restitution = 0.25) {
    let collided = false;
    let impactSpeed = 0;

    // World boundary clamp
    const pad = radius + 8;
    if (entity.x < pad) {
      entity.x = pad;
      if (entity.vx < 0) { impactSpeed = Math.max(impactSpeed, -entity.vx); entity.vx = -entity.vx * restitution; }
      collided = true;
    } else if (entity.x > world.size - pad) {
      entity.x = world.size - pad;
      if (entity.vx > 0) { impactSpeed = Math.max(impactSpeed, entity.vx); entity.vx = -entity.vx * restitution; }
      collided = true;
    }

    if (entity.y < pad) {
      entity.y = pad;
      if (entity.vy < 0) { impactSpeed = Math.max(impactSpeed, -entity.vy); entity.vy = -entity.vy * restitution; }
      collided = true;
    } else if (entity.y > world.size - pad) {
      entity.y = world.size - pad;
      if (entity.vy > 0) { impactSpeed = Math.max(impactSpeed, entity.vy); entity.vy = -entity.vy * restitution; }
      collided = true;
    }

    // Building collisions
    const buildings = world.buildings;
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i];
      if (
        entity.x + radius < b.x ||
        entity.x - radius > b.x + b.w ||
        entity.y + radius < b.y ||
        entity.y - radius > b.y + b.h
      ) {
        continue;
      }
      const res = resolveCircleAABB(entity, radius, b);
      if (res.hit) {
        collided = true;
        if (typeof entity.vx === 'number' && typeof entity.vy === 'number') {
          const vn = entity.vx * res.nx + entity.vy * res.ny;
          if (vn < 0) {
            impactSpeed = Math.max(impactSpeed, -vn);
            entity.vx -= (1 + restitution) * vn * res.nx;
            entity.vy -= (1 + restitution) * vn * res.ny;
          }
        }
      }
    }

    return { collided, impactSpeed };
  }

  /**
   * 2D arcade-realistic vehicle dynamics with forward/lateral velocity decomposition and drifting.
   */
  function stepVehiclePhysics(car, input, dt, world) {
    const spec = car.spec;
    const cos = Math.cos(car.angle);
    const sin = Math.sin(car.angle);

    // Decompose velocity into forward & lateral components
    let forwardVel = car.vx * cos + car.vy * sin;
    let lateralVel = -car.vx * sin + car.vy * cos;

    // Throttle / Brake / Reverse
    const throttle = input.throttle || 0; // -1..1
    const steer = input.steer || 0;       // -1..1
    const handbrake = !!input.handbrake;

    if (throttle > 0) {
      if (forwardVel < -10) {
        forwardVel += spec.brake * throttle * dt;
      } else {
        forwardVel += spec.accel * throttle * dt;
      }
    } else if (throttle < 0) {
      if (forwardVel > 10) {
        forwardVel += spec.brake * throttle * dt;
      } else {
        forwardVel += spec.accel * 0.65 * throttle * dt;
      }
    } else {
      // Natural rolling resistance
      const drag = Math.pow(0.28, dt);
      forwardVel *= drag;
      if (Math.abs(forwardVel) < 4) forwardVel = 0;
    }

    if (handbrake) {
      forwardVel *= Math.pow(0.18, dt);
    }

    forwardVel = clamp(forwardVel, -spec.reverseSpeed, spec.maxSpeed);

    // Speed-dependent steering
    const speedRatio = clamp(Math.abs(forwardVel) / 140, 0, 1);
    const dirSign = forwardVel >= -1 ? 1 : -1;
    const turnMult = handbrake ? 1.38 : 1.0;
    car.angle = normalizeAngle(car.angle + steer * spec.turnRate * speedRatio * turnMult * dirSign * dt);

    // Recompute basis after turning
    const nCos = Math.cos(car.angle);
    const nSin = Math.sin(car.angle);

    // Lateral friction (lower grip during handbrake => drift)
    const grip = handbrake ? spec.driftGrip : spec.normalGrip;
    lateralVel *= Math.pow(grip, dt * 60 * 0.16);
    if (Math.abs(lateralVel) < 1.5) lateralVel = 0;

    car.vx = nCos * forwardVel - nSin * lateralVel;
    car.vy = nSin * forwardVel + nCos * lateralVel;
    car.speed = Math.hypot(car.vx, car.vy);
    car.forwardSpeed = forwardVel;
    car.drifting = (handbrake && car.speed > 130) || Math.abs(lateralVel) > 85;

    car.x += car.vx * dt;
    car.y += car.vy * dt;

    const col = resolveWorldCollisions(car, car.radius, world, 0.3);
    if (col.collided && col.impactSpeed > 150) {
      const dmg = (col.impactSpeed - 150) * 0.11;
      car.hp = Math.max(0, car.hp - dmg);
    }
    return col;
  }

  /**
   * Resolve elastic-ish collision between two vehicles.
   */
  function resolveVehiclePair(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const minDist = a.radius + b.radius;
    const d2 = dx * dx + dy * dy;
    if (d2 >= minDist * minDist || d2 === 0) {
      return { hit: false, impactSpeed: 0 };
    }

    const d = Math.sqrt(d2);
    const nx = dx / d;
    const ny = dy / d;
    const overlap = minDist - d;

    const totalMass = a.spec.mass + b.spec.mass;
    const aShare = b.spec.mass / totalMass;
    const bShare = a.spec.mass / totalMass;

    a.x -= nx * overlap * aShare;
    a.y -= ny * overlap * aShare;
    b.x += nx * overlap * bShare;
    b.y += ny * overlap * bShare;

    const rvx = b.vx - a.vx;
    const rvy = b.vy - a.vy;
    const velAlongNormal = rvx * nx + rvy * ny;
    if (velAlongNormal > 0) {
      return { hit: true, impactSpeed: 0 };
    }

    const restitution = 0.35;
    const j = (-(1 + restitution) * velAlongNormal) / (1 / a.spec.mass + 1 / b.spec.mass);
    const ix = j * nx;
    const iy = j * ny;

    a.vx -= ix / a.spec.mass;
    a.vy -= iy / a.spec.mass;
    b.vx += ix / b.spec.mass;
    b.vy += iy / b.spec.mass;

    const impactSpeed = Math.abs(velAlongNormal);
    if (impactSpeed > 130) {
      const dmg = (impactSpeed - 130) * 0.12;
      a.hp = Math.max(0, a.hp - dmg * aShare * 1.4);
      b.hp = Math.max(0, b.hp - dmg * bShare * 1.4);
    }

    return { hit: true, impactSpeed };
  }

  return {
    clamp,
    normalizeAngle,
    distSq,
    dist,
    resolveCircleAABB,
    resolveWorldCollisions,
    stepVehiclePhysics,
    resolveVehiclePair
  };
});
