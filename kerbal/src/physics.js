(function (root) {
  'use strict';

  const Constants =
    typeof module !== 'undefined' && module.exports
      ? require('./constants')
      : root.KSP.Constants;

  const { PHYSICS } = Constants;
  const KERBIN = PHYSICS.KERBIN;
  const MUN = PHYSICS.MUN;

  /**
   * Exponential atmospheric density model for Kerbin.
   * Returns 0 above atmosphereHeight (70 km).
   */
  function getAtmosphericDensity(altitude) {
    if (altitude >= KERBIN.atmosphereHeight) return 0;
    const h = Math.max(0, altitude);
    return KERBIN.seaLevelDensity * Math.exp(-h / KERBIN.scaleHeight);
  }

  /**
   * Normalized atmospheric pressure (0 in vacuum, 1 at sea level).
   */
  function getAtmosphericPressureRatio(altitude) {
    if (altitude >= KERBIN.atmosphereHeight) return 0;
    const h = Math.max(0, altitude);
    return Math.exp(-h / KERBIN.scaleHeight);
  }

  /**
   * Effective specific impulse (Isp) interpolated between sea level and vacuum.
   */
  function getEffectiveIsp(ispAtm, ispVac, altitude) {
    const p = getAtmosphericPressureRatio(altitude);
    return ispVac - (ispVac - ispAtm) * p;
  }

  /**
   * Tsiolkovsky rocket equation: deltaV = Isp * g0 * ln(m0 / m1)
   */
  function calculateDeltaV(isp, wetMass, dryMass) {
    if (isp <= 0 || wetMass <= 0 || dryMass <= 0 || wetMass <= dryMass) {
      return 0;
    }
    return isp * PHYSICS.g0 * Math.log(wetMass / dryMass);
  }

  /**
   * Gravitational acceleration vector from Kerbin (centered at origin (0,0)).
   */
  function getKerbinGravity(x, y) {
    const r2 = x * x + y * y;
    const r = Math.sqrt(r2);
    if (r < 1) return { ax: 0, ay: 0 };
    const mag = KERBIN.mu / r2;
    return {
      ax: -mag * (x / r),
      ay: -mag * (y / r)
    };
  }

  /**
   * Mun's orbital position around Kerbin at mission elapsed time t (seconds).
   */
  function getMunPosition(t) {
    const omega = Math.sqrt(KERBIN.mu / Math.pow(MUN.orbitRadius, 3));
    const angle = MUN.initialAngle + omega * t;
    return {
      x: MUN.orbitRadius * Math.cos(angle),
      y: MUN.orbitRadius * Math.sin(angle),
      angle
    };
  }

  /**
   * Gravitational acceleration from Kerbin + optional Mun perturbation (when inside Mun SOI).
   */
  function getTotalGravity(x, y, t, includeMun = true) {
    const gK = getKerbinGravity(x, y);
    if (!includeMun) return { ax: gK.ax, ay: gK.ay, inMunSOI: false, munDist: Infinity };

    const mun = getMunPosition(t);
    const dx = mun.x - x;
    const dy = mun.y - y;
    const dist2 = dx * dx + dy * dy;
    const dist = Math.sqrt(dist2);
    const inMunSOI = dist <= MUN.soiRadius;

    if (inMunSOI && dist > 1) {
      const magM = MUN.mu / dist2;
      return {
        ax: gK.ax + magM * (dx / dist),
        ay: gK.ay + magM * (dy / dist),
        inMunSOI: true,
        munDist: dist - MUN.radius
      };
    }

    return {
      ax: gK.ax,
      ay: gK.ay,
      inMunSOI: false,
      munDist: dist - MUN.radius
    };
  }

  /**
   * Aerodynamic drag acceleration vector opposing velocity.
   * F_drag = 0.5 * rho * v^2 * Cd * A
   */
  function getDragAcceleration(vx, vy, altitude, mass, dragArea) {
    if (mass <= 0) return { ax: 0, ay: 0, dynamicPressure: 0 };
    const rho = getAtmosphericDensity(altitude);
    if (rho <= 0) return { ax: 0, ay: 0, dynamicPressure: 0 };

    const v2 = vx * vx + vy * vy;
    const v = Math.sqrt(v2);
    const q = 0.5 * rho * v2; // Dynamic pressure (Pa)
    if (v < 1e-6) return { ax: 0, ay: 0, dynamicPressure: q };

    const dragForce = q * dragArea;
    const aDrag = dragForce / mass;
    return {
      ax: -aDrag * (vx / v),
      ay: -aDrag * (vy / v),
      dynamicPressure: q
    };
  }

  /**
   * Compute 2D Keplerian orbital elements around Kerbin from state vector (x, y, vx, vy).
   */
  function computeOrbitalElements(x, y, vx, vy, mu = KERBIN.mu, bodyRadius = KERBIN.radius) {
    const r = Math.sqrt(x * x + y * y);
    const v2 = vx * vx + vy * vy;
    const v = Math.sqrt(v2);

    if (r < 1) {
      return {
        r: 0, v: 0, semiMajorAxis: 0, eccentricity: 0,
        apoapsis: 0, periapsis: 0, period: 0,
        argOfPeriapsis: 0, trueAnomaly: 0, specificEnergy: 0,
        isEscape: false, isStableOrbit: false
      };
    }

    // Specific angular momentum (scalar in 2D: r x v)
    const h = x * vy - y * vx;
    // Specific orbital energy
    const energy = v2 / 2 - mu / r;

    // Eccentricity vector e = ((v^2 - mu/r)*r - (r.v)*v) / mu
    const rDotV = x * vx + y * vy;
    const ex = ((v2 - mu / r) * x - rDotV * vx) / mu;
    const ey = ((v2 - mu / r) * y - rDotV * vy) / mu;
    const e = Math.sqrt(ex * ex + ey * ey);

    const isEscape = energy >= 0 || e >= 1;
    const semiMajorAxis = Math.abs(energy) > 1e-9 ? -mu / (2 * energy) : Infinity;

    let periapsisRadius, apoapsisRadius;
    if (isEscape) {
      periapsisRadius = (h * h) / (mu * (1 + e));
      apoapsisRadius = Infinity;
    } else {
      periapsisRadius = semiMajorAxis * (1 - e);
      apoapsisRadius = semiMajorAxis * (1 + e);
    }

    const periapsis = periapsisRadius - bodyRadius;
    const apoapsis = isEscape ? Infinity : apoapsisRadius - bodyRadius;

    const period =
      !isEscape && semiMajorAxis > 0
        ? 2 * Math.PI * Math.sqrt(Math.pow(semiMajorAxis, 3) / mu)
        : Infinity;

    const argOfPeriapsis = e > 1e-6 ? Math.atan2(ey, ex) : Math.atan2(y, x);
    const posAngle = Math.atan2(y, x);
    let trueAnomaly = posAngle - argOfPeriapsis;
    while (trueAnomaly > Math.PI) trueAnomaly -= 2 * Math.PI;
    while (trueAnomaly < -Math.PI) trueAnomaly += 2 * Math.PI;

    const isStableOrbit = !isEscape && periapsis >= KERBIN.atmosphereHeight;

    return {
      r,
      v,
      h,
      semiMajorAxis,
      eccentricity: e,
      apoapsis,
      periapsis,
      apoapsisRadius,
      periapsisRadius,
      period,
      argOfPeriapsis,
      trueAnomaly,
      specificEnergy: energy,
      isEscape,
      isStableOrbit
    };
  }

  /**
   * Sample points along the predicted Keplerian orbit for rendering in Map View.
   */
  function sampleOrbitPath(elements, segments = 120) {
    const points = [];
    if (!elements || elements.r < 1) return points;

    const { eccentricity: e, semiMajorAxis: a, argOfPeriapsis: omega, h, isEscape } = elements;
    if (Math.abs(h) < 1e3) return points; // Almost radial trajectory

    const p = isEscape
      ? (h * h) / KERBIN.mu
      : a * (1 - e * e);

    if (p <= 0 || !isFinite(p)) return points;

    let nuMin = -Math.PI;
    let nuMax = Math.PI;
    if (isEscape) {
      const limit = Math.acos(-1 / Math.max(e, 1.0001)) - 0.12;
      nuMin = -limit;
      nuMax = limit;
    }

    for (let i = 0; i <= segments; i++) {
      const nu = nuMin + ((nuMax - nuMin) * i) / segments;
      const denom = 1 + e * Math.cos(nu);
      if (denom <= 0.05) continue;
      const rad = p / denom;
      if (rad > 8e7) continue;
      const theta = omega + nu;
      points.push({
        x: rad * Math.cos(theta),
        y: rad * Math.sin(theta)
      });
    }
    return points;
  }

  /**
   * RK4 single integration step for spacecraft state under gravity, thrust, and drag.
   * State: { x, y, vx, vy, angle, mass }
   * Control: { thrustForce, dragArea, t, includeMun }
   */
  function stepRK4(state, control, dt) {
    const { thrustForce, dragArea, t, includeMun = true } = control;
    const dirX = Math.cos(state.angle);
    const dirY = Math.sin(state.angle);
    const mass = Math.max(1, state.mass);

    function deriv(px, py, pvx, pvy, pt) {
      const r = Math.sqrt(px * px + py * py);
      const alt = r - KERBIN.radius;
      const grav = getTotalGravity(px, py, pt, includeMun);
      const drag = getDragAcceleration(pvx, pvy, alt, mass, dragArea);
      const thrustAx = (thrustForce / mass) * dirX;
      const thrustAy = (thrustForce / mass) * dirY;
      return {
        dx: pvx,
        dy: pvy,
        dvx: grav.ax + drag.ax + thrustAx,
        dvy: grav.ay + drag.ay + thrustAy,
        dynamicPressure: drag.dynamicPressure,
        inMunSOI: grav.inMunSOI,
        munDist: grav.munDist
      };
    }

    const k1 = deriv(state.x, state.y, state.vx, state.vy, t);
    const k2 = deriv(
      state.x + 0.5 * dt * k1.dx,
      state.y + 0.5 * dt * k1.dy,
      state.vx + 0.5 * dt * k1.dvx,
      state.vy + 0.5 * dt * k1.dvy,
      t + 0.5 * dt
    );
    const k3 = deriv(
      state.x + 0.5 * dt * k2.dx,
      state.y + 0.5 * dt * k2.dy,
      state.vx + 0.5 * dt * k2.dvx,
      state.vy + 0.5 * dt * k2.dvy,
      t + 0.5 * dt
    );
    const k4 = deriv(
      state.x + dt * k3.dx,
      state.y + dt * k3.dy,
      state.vx + dt * k3.dvx,
      state.vy + dt * k3.dvy,
      t + dt
    );

    const nx = state.x + (dt / 6) * (k1.dx + 2 * k2.dx + 2 * k3.dx + k4.dx);
    const ny = state.y + (dt / 6) * (k1.dy + 2 * k2.dy + 2 * k3.dy + k4.dy);
    const nvx = state.vx + (dt / 6) * (k1.dvx + 2 * k2.dvx + 2 * k3.dvx + k4.dvx);
    const nvy = state.vy + (dt / 6) * (k1.dvy + 2 * k2.dvy + 2 * k3.dvy + k4.dvy);

    // Total non-gravitational acceleration for G-force readout
    const gStart = getTotalGravity(state.x, state.y, t, includeMun);
    const feltAx = k1.dvx - gStart.ax;
    const feltAy = k1.dvy - gStart.ay;
    const gForce = Math.sqrt(feltAx * feltAx + feltAy * feltAy) / PHYSICS.g0;

    return {
      x: nx,
      y: ny,
      vx: nvx,
      vy: nvy,
      dynamicPressure: k1.dynamicPressure,
      gForce,
      inMunSOI: k1.inMunSOI,
      munDist: k1.munDist
    };
  }

  /**
   * Fuel mass flow rate (kg/s) for a given thrust (N) and effective Isp (s).
   */
  function getFuelBurnRate(thrust, isp) {
    if (thrust <= 0 || isp <= 0) return 0;
    return thrust / (isp * PHYSICS.g0);
  }

  const KSPPhysics = {
    getAtmosphericDensity,
    getAtmosphericPressureRatio,
    getEffectiveIsp,
    calculateDeltaV,
    getKerbinGravity,
    getMunPosition,
    getTotalGravity,
    getDragAcceleration,
    computeOrbitalElements,
    sampleOrbitPath,
    stepRK4,
    getFuelBurnRate
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = KSPPhysics;
  } else {
    root.KSP = root.KSP || {};
    root.KSP.Physics = KSPPhysics;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
