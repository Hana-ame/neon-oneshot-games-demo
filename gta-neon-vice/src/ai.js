(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./config'), require('./physics'));
  } else {
    root.GTAAI = factory(root.GTAConfig, root.GTAPhysics);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Config, Physics) {
  'use strict';

  /**
   * Steer an AI vehicle toward a target coordinate (tx, ty).
   */
  function computeSteeringToPoint(car, tx, ty, desiredSpeed) {
    const dx = tx - car.x;
    const dy = ty - car.y;
    const targetAngle = Math.atan2(dy, dx);
    const diff = Physics.normalizeAngle(targetAngle - car.angle);

    let steer = Physics.clamp(diff * 2.2, -1, 1);
    let throttle = 0;

    if (Math.abs(diff) > 2.2 && car.speed < 80) {
      // Stuck facing away — briefly reverse while turning
      throttle = -0.6;
      steer = -Math.sign(diff || 1);
    } else {
      const turnSlowdown = Math.abs(diff) > 0.7 ? 0.55 : 1.0;
      const targetV = desiredSpeed * turnSlowdown;
      if (car.forwardSpeed < targetV) {
        throttle = Physics.clamp((targetV - car.forwardSpeed) / 120, 0.25, 1.0);
      } else {
        throttle = -0.25;
      }
    }

    return { throttle, steer, handbrake: Math.abs(diff) > 1.35 && car.speed > 260 };
  }

  /**
   * Update civilian traffic car AI along road grid waypoints.
   */
  function updateTrafficCarAI(car, world, allVehicles, dt, rng) {
    if (!car.targetInter || Physics.dist(car.x, car.y, car.targetInter.x, car.targetInter.y) < 72) {
      // Pick next adjacent intersection
      const centers = world.roadStarts.length;
      let gx = car.targetInter ? car.targetInter.gx : Math.floor(rng() * centers);
      let gy = car.targetInter ? car.targetInter.gy : Math.floor(rng() * centers);

      const candidates = [];
      const dirs = [
        { dx: 1, dy: 0 },
        { dx: -1, dy: 0 },
        { dx: 0, dy: 1 },
        { dx: 0, dy: -1 }
      ];
      for (const d of dirs) {
        const ngx = gx + d.dx;
        const ngy = gy + d.dy;
        if (ngx >= 0 && ngx < centers && ngy >= 0 && ngy < centers) {
          // Prefer not immediately reversing
          if (car.prevInter && car.prevInter.gx === ngx && car.prevInter.gy === ngy && centers > 2) {
            continue;
          }
          candidates.push(world.intersections[ngy * centers + ngx]);
        }
      }
      car.prevInter = car.targetInter || null;
      car.targetInter = candidates.length > 0
        ? candidates[Math.floor(rng() * candidates.length)]
        : world.intersections[0];
    }

    // Check for vehicle directly ahead to avoid pileups
    let blockedAhead = false;
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    for (let i = 0; i < allVehicles.length; i++) {
      const other = allVehicles[i];
      if (other.id === car.id) continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const d = Math.hypot(dx, dy);
      if (d < 95 && d > 1) {
        const dot = (dx * fx + dy * fy) / d;
        if (dot > 0.72) {
          blockedAhead = true;
          break;
        }
      }
    }

    if (blockedAhead) {
      return { throttle: -0.6, steer: 0, handbrake: true };
    }

    const cruiseSpeed = Math.min(car.spec.maxSpeed * 0.48, 210);
    return computeSteeringToPoint(car, car.targetInter.x, car.targetInter.y, cruiseSpeed);
  }

  /**
   * Update police cruiser pursuit AI based on player position & wanted level.
   */
  function updatePoliceCarAI(car, targetPos, wantedStars, dt) {
    if (wantedStars <= 0) {
      car.siren = false;
      return { throttle: 0, steer: 0, handbrake: true };
    }
    car.siren = true;

    const d = Physics.dist(car.x, car.y, targetPos.x, targetPos.y);
    // Lead target slightly when chasing
    const desiredSpeed = Math.min(
      car.spec.maxSpeed,
      260 + wantedStars * 55 + (d > 300 ? 60 : 0)
    );

    // Anti-stuck timer
    if (car.speed < 25) {
      car.stuckTimer = (car.stuckTimer || 0) + dt;
    } else {
      car.stuckTimer = 0;
    }

    if (car.stuckTimer > 1.2) {
      if (car.stuckTimer > 2.2) car.stuckTimer = 0;
      return { throttle: -0.8, steer: 0.9, handbrake: false };
    }

    return computeSteeringToPoint(car, targetPos.x, targetPos.y, desiredSpeed);
  }

  /**
   * Update pedestrian AI: wander sidewalks, panic/flee from gunfire or threats.
   */
  function updatePedestrianAI(ped, world, dangerPos, dt, rng) {
    if (!ped.alive) return;

    if (ped.panicTimer > 0) {
      ped.panicTimer = Math.max(0, ped.panicTimer - dt);
    }

    if (dangerPos) {
      const d = Physics.dist(ped.x, ped.y, dangerPos.x, dangerPos.y);
      if (d < 260) {
        ped.panicTimer = 4.5;
        ped.angle = Math.atan2(ped.y - dangerPos.y, ped.x - dangerPos.x) + (rng() - 0.5) * 0.4;
      }
    }

    ped.changeDirTimer -= dt;
    if (ped.changeDirTimer <= 0 && ped.panicTimer <= 0) {
      ped.angle += (rng() - 0.5) * Math.PI * 0.9;
      ped.changeDirTimer = 1.8 + rng() * 3.0;
    }

    const speed = ped.panicTimer > 0 ? 135 : 48;
    ped.vx = Math.cos(ped.angle) * speed;
    ped.vy = Math.sin(ped.angle) * speed;
    ped.x += ped.vx * dt;
    ped.y += ped.vy * dt;

    const col = Physics.resolveWorldCollisions(ped, Config.NPC_RADIUS, world, 0.1);
    if (col.collided) {
      ped.angle = Physics.normalizeAngle(ped.angle + Math.PI * 0.75);
    }
  }

  return {
    computeSteeringToPoint,
    updateTrafficCarAI,
    updatePoliceCarAI,
    updatePedestrianAI
  };
});
