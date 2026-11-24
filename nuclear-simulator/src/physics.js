(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.NukePhysics = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MIN_YIELD_KT = 0.01;
  const MAX_YIELD_KT = 100000;
  const TNT_TJ_PER_KT = 4.184;
  const SOUND_SPEED_KM_S = 0.343;
  const EARTH_RADIUS_KM = 6371.0088;

  // 1 kt reference ground radii (km) calibrated to Glasstone & Dolan (1977)
  // Surface burst 1 kt: 5 psi ~1500 ft (0.46 km), 1 psi ~3700 ft (1.13 km)
  // Optimum airburst increases blast radius ~20-35% via Mach stem formation
  const BLAST_REF_1KT = {
    surface: { psi20: 0.22, psi5: 0.46, psi1: 1.13 },
    airburst: { psi20: 0.28, psi5: 0.62, psi1: 1.60 }
  };

  // Thermal radiation 1 kt airburst reference radii (km) with Y^0.41 scaling
  // Calibrated to Wikipedia / Glasstone & Dolan table:
  // 1 kt: 0.6/0.8/1.1 km; 20 kt: 2.5/3.2/4.2 km; 1 Mt: 12/15/19 km
  const THERMAL_REF_1KT = {
    thirdDegree: 0.68,  // ~8 cal/cm^2 (50%-100% 3rd degree burns)
    secondDegree: 0.88, // ~5 cal/cm^2
    firstDegree: 1.15   // ~2.5 cal/cm^2
  };

  function clamp(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function sanitizeParams(raw = {}) {
    const yieldKt = clamp(raw.yieldKt ?? 100, MIN_YIELD_KT, MAX_YIELD_KT);
    const burstType = raw.burstType === 'surface' ? 'surface' : 'airburst';
    const optHobMeters = Math.round(computeOptimumHobKm(yieldKt) * 1000);
    const autoHob = raw.autoHob !== undefined ? Boolean(raw.autoHob) : true;
    let hobMeters = 0;
    if (burstType === 'airburst') {
      hobMeters = autoHob ? optHobMeters : clamp(raw.hobMeters ?? optHobMeters, 0, 15000);
    }
    const windSpeedKmh = clamp(raw.windSpeedKmh ?? 24, 0, 120);
    const windDirDeg = ((Number(raw.windDirDeg ?? 90) % 360) + 360) % 360;
    const fissionFraction = clamp(raw.fissionFraction ?? 0.5, 0.05, 1.0);
    const popDensityPerKm2 = clamp(raw.popDensityPerKm2 ?? 3500, 0, 50000);

    return {
      yieldKt,
      burstType,
      autoHob,
      hobMeters,
      optHobMeters,
      windSpeedKmh,
      windDirDeg,
      fissionFraction,
      popDensityPerKm2
    };
  }

  /**
   * Optimum Height of Burst (km) to maximize ~5 psi blast ground area.
   * Scales with Y^(1/3): 1 kt -> 0.19 km, 20 kt -> 0.52 km, 1 Mt -> 1.90 km.
   */
  function computeOptimumHobKm(yieldKt) {
    const y = clamp(yieldKt, MIN_YIELD_KT, MAX_YIELD_KT);
    return 0.19 * Math.cbrt(y);
  }

  /**
   * Maximum luminous fireball radius (km), scaling as Y^0.4.
   * Airburst: 0.066 * Y^0.4 (21 kt -> 0.223 km; Fat Man ref 0.21-0.24 km).
   * Surface burst: 0.076 * Y^0.4 (15,000 kt -> 3.55 km; Castle Bravo ref 3.3-3.7 km).
   */
  function computeFireballRadiusKm(yieldKt, burstType) {
    const y = clamp(yieldKt, MIN_YIELD_KT, MAX_YIELD_KT);
    const coeff = burstType === 'surface' ? 0.076 : 0.066;
    return coeff * Math.pow(y, 0.4);
  }

  /**
   * Compute height-of-burst factor interpolating between surface (0),
   * optimum airburst (1.0), and high-altitude attenuation (>1.0).
   */
  function computeBlastRadiusKm(yieldKt, psiKey, burstType, hobKm) {
    const y = clamp(yieldKt, MIN_YIELD_KT, MAX_YIELD_KT);
    const scale = Math.cbrt(y);
    const rSurf = BLAST_REF_1KT.surface[psiKey] * scale;
    const rAir = BLAST_REF_1KT.airburst[psiKey] * scale;

    if (burstType === 'surface' || hobKm <= 0) {
      return rSurf;
    }

    const optHob = computeOptimumHobKm(y);
    const ratio = hobKm / Math.max(optHob, 0.01);

    if (ratio <= 1.0) {
      // Smooth Mach stem enhancement up to optimum HOB
      const t = Math.sin((ratio * Math.PI) / 2);
      return rSurf + (rAir - rSurf) * t;
    }

    // Above optimum HOB: slant range exceeds ground range; solve sqrt(R_slant^2 - hob^2)
    // Approximate effective slant range decays slowly with altitude
    const slantMax = Math.sqrt(rAir * rAir + optHob * optHob);
    const effectiveSlant = slantMax * Math.pow(ratio, -0.08);
    if (hobKm >= effectiveSlant) {
      return 0;
    }
    return Math.sqrt(Math.max(0, effectiveSlant * effectiveSlant - hobKm * hobKm));
  }

  /**
   * Thermal radiation burn radii (km), scaling as Y^0.41.
   * Surface bursts lose ~28% thermal ground range due to ground/dust shadowing.
   */
  function computeThermalRadiiKm(yieldKt, burstType, hobKm) {
    const y = clamp(yieldKt, MIN_YIELD_KT, MAX_YIELD_KT);
    const yPow = Math.pow(y, 0.41);
    const groundFactor = burstType === 'surface' ? 0.72 : 1.0;

    function adjustSlant(rBase) {
      const r = rBase * yPow * groundFactor;
      if (burstType === 'surface' || hobKm <= 0) return r;
      if (hobKm >= r) return 0;
      return Math.sqrt(Math.max(0, r * r - hobKm * hobKm * 0.25));
    }

    return {
      thirdDegreeKm: adjustSlant(THERMAL_REF_1KT.thirdDegree),
      secondDegreeKm: adjustSlant(THERMAL_REF_1KT.secondDegree),
      firstDegreeKm: adjustSlant(THERMAL_REF_1KT.firstDegree)
    };
  }

  /**
   * Prompt ionizing radiation ground radius (km) for a target dose in rem
   * (default 500 rem / 5 Sv acute lethal dose).
   * Solved numerically from D(R) = D0 * (Y / R^2) * exp(-R / lambda).
   */
  function computeRadiationRadiusKm(yieldKt, targetRem = 500, hobKm = 0) {
    const y = clamp(yieldKt, MIN_YIELD_KT, MAX_YIELD_KT);
    const doseTarget = Math.max(1, Number(targetRem) || 500);
    // Calibrated so 1 kt -> ~0.80 km, 20 kt -> ~1.45 km, 1000 kt -> ~2.55 km at 500 rem
    const D0 = 2950;
    const lambdaKm = 0.36;

    let lo = 0.01;
    let hi = 25.0;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) * 0.5;
      const dose = D0 * (y / (mid * mid)) * Math.exp(-mid / lambdaKm);
      if (dose > doseTarget) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    const slantKm = (lo + hi) * 0.5;
    if (hobKm >= slantKm) return 0;
    return Math.sqrt(Math.max(0, slantKm * slantKm - hobKm * hobKm));
  }

  /**
   * Compute peak static overpressure (psi) at a given ground distance (km)
   * using smooth power-law interpolation anchored to 20, 5, and 1 psi radii.
   */
  function computeOverpressureAtDistancePsi(distanceKm, blast) {
    const d = Math.max(0.01, Number(distanceKm) || 0.01);
    const { psi20Km, psi5Km, psi1Km } = blast;
    if (psi1Km <= 0) return 0;

    if (d <= psi20Km && psi20Km > 0) {
      return Math.min(500, 20 * Math.pow(psi20Km / d, 2.2));
    }
    if (d <= psi5Km && psi5Km > psi20Km && psi20Km > 0) {
      const exp = Math.log(20 / 5) / Math.log(psi5Km / psi20Km);
      return 5 * Math.pow(psi5Km / d, exp);
    }
    if (psi1Km > psi5Km && psi5Km > 0) {
      const exp = Math.log(5 / 1) / Math.log(psi1Km / psi5Km);
      return 1 * Math.pow(psi1Km / d, exp);
    }
    return 0;
  }

  /**
   * Dynamic blast wind velocity (km/h) approximated from overpressure (psi)
   * using Rankine-Hugoniot shock relation in sea-level air (P0 = 14.7 psi).
   */
  function computeBlastWindKmh(overpressurePsi) {
    const p = Math.max(0, Number(overpressurePsi) || 0);
    if (p <= 0) return 0;
    const p0 = 14.7;
    const c0 = 1235; // km/h speed of sound
    // u = (5 * p / (7 * p0)) * c0 / sqrt(1 + 6*p / (7*p0))
    const term = (5 * p) / (7 * p0);
    const denom = Math.sqrt(1 + (6 * p) / (7 * p0));
    return (term / denom) * c0;
  }

  /**
   * Simplified downwind radioactive fallout plume contours (1000, 100, 10 rad/hr).
   * Significant local fallout occurs only when fireball touches ground (surface/low burst).
   */
  function computeFalloutPlume(yieldKt, fissionFraction, touchesGround, windSpeedKmh, windDirDeg) {
    if (!touchesGround || windSpeedKmh <= 0) {
      return {
        significant: false,
        contours: []
      };
    }

    const fissionKt = Math.max(0.01, yieldKt * fissionFraction);
    const windFactor = Math.pow(Math.max(windSpeedKmh, 5) / 24, 0.65);
    const scaleY = Math.pow(fissionKt, 0.45);

    const defs = [
      { id: 'rad1000', label: '1,000 rad/hr 极端致死沉降区', doseRate: 1000, lenCoeff: 0.95, widCoeff: 0.14, color: '#a855f7' },
      { id: 'rad100', label: '100 rad/hr 重度辐射沉降区', doseRate: 100, lenCoeff: 2.35, widCoeff: 0.34, color: '#c084fc' },
      { id: 'rad10', label: '10 rad/hr 中度辐射沉降区', doseRate: 10, lenCoeff: 4.80, widCoeff: 0.68, color: '#e9d5ff' }
    ];

    // Wind direction: meteorological convention (degrees FROM which wind blows)
    // Plume travels downwind = (windDirDeg + 180) % 360
    const downwindBearingDeg = (windDirDeg + 180) % 360;

    const contours = defs.map((d) => {
      const lengthKm = Math.max(0.5, d.lenCoeff * scaleY * windFactor);
      const maxWidthKm = Math.max(0.18, d.widCoeff * Math.pow(fissionKt, 0.42) / Math.pow(windFactor, 0.25));
      const areaKm2 = (Math.PI * lengthKm * maxWidthKm) / 4;
      return {
        id: d.id,
        label: d.label,
        doseRate: d.doseRate,
        lengthKm,
        maxWidthKm,
        areaKm2,
        downwindBearingDeg,
        color: d.color
      };
    });

    return {
      significant: true,
      downwindBearingDeg,
      contours
    };
  }

  /**
   * Generate geographic polygon coordinates ([lat, lng]) for a teardrop/ellipse fallout plume.
   */
  function generatePlumePolygon(originLat, originLng, lengthKm, maxWidthKm, downwindBearingDeg, segments = 32) {
    const pts = [];
    const bearingRad = (downwindBearingDeg * Math.PI) / 180;
    const semiMajor = lengthKm / 2;
    const semiMinor = maxWidthKm / 2;

    for (let i = 0; i < segments; i++) {
      const theta = (2 * Math.PI * i) / segments;
      // Local coordinates: x along downwind axis [0..lengthKm], y perpendicular
      const x = semiMajor * (1 + Math.cos(theta));
      // Slight teardrop tapering near ground zero
      const taper = 0.78 + 0.22 * Math.sin((x / Math.max(lengthKm, 0.01)) * Math.PI);
      const y = semiMinor * Math.sin(theta) * taper;

      // Rotate by bearing (0 deg = North -> +lat, 90 deg = East -> +lng)
      const northKm = x * Math.cos(bearingRad) - y * Math.sin(bearingRad);
      const eastKm = x * Math.sin(bearingRad) + y * Math.cos(bearingRad);

      const dLat = (northKm / EARTH_RADIUS_KM) * (180 / Math.PI);
      const cosLat = Math.max(0.05, Math.cos((originLat * Math.PI) / 180));
      const dLng = (eastKm / (EARTH_RADIUS_KM * cosLat)) * (180 / Math.PI);

      pts.push([originLat + dLat, originLng + dLng]);
    }
    return pts;
  }

  /**
   * Shockwave front radius (km) and phase metadata at time t (seconds after detonation).
   */
  function computeTimelineState(tSec, simResult) {
    const t = Math.max(0, Number(tSec) || 0);
    const y = simResult.params.yieldKt;
    const rf = simResult.radii.fireballKm;

    // Early supersonic phase transitions smoothly into acoustic speed (~0.343 km/s)
    const supersonicBoost = Math.pow(y, 0.22) * 0.28 * Math.log1p(t * 2.5);
    const shockRadiusKm = t === 0 ? 0 : rf * Math.min(1, t / 0.6) + SOUND_SPEED_KM_S * t + supersonicBoost;

    // Fireball growth & cooling
    const fireballGrowthTime = Math.max(0.4, 0.18 * Math.pow(y, 0.35));
    const currentFireballKm = t === 0 ? 0 : rf * Math.min(1, Math.pow(t / fireballGrowthTime, 0.45));

    // Stabilized mushroom cloud top altitude (km)
    const maxCloudTopKm = Math.min(65, 2.2 * Math.pow(y, 0.32));
    const cloudHeightKm = t === 0 ? 0 : maxCloudTopKm * (1 - Math.exp(-t / Math.max(25, 12 * Math.pow(y, 0.18))));

    let phase = '起爆前待命';
    if (t > 0 && t <= 1) phase = '双脉冲强闪光与火球形成';
    else if (t > 1 && t <= 5) phase = '热辐射主脉冲与超音速冲击波分离';
    else if (t <= 20) phase = '冲击波横扫城区与火球浮升';
    else if (t <= 45) phase = '蘑菇云柱抬升与负压回吸风';
    else phase = '云顶趋稳与放射性沉降扩散阶段';

    return {
      tSec: t,
      shockRadiusKm,
      currentFireballKm,
      cloudHeightKm,
      maxCloudTopKm,
      phase
    };
  }

  /**
   * Main simulation entrypoint: computes all physical radii, areas, energy breakdown,
   * fallout contours, and simplified homogeneous-density exposure estimates.
   */
  function simulate(rawParams) {
    const params = sanitizeParams(rawParams);
    const hobKm = params.hobMeters / 1000;

    const fireballKm = computeFireballRadiusKm(params.yieldKt, params.burstType);
    const touchesGround = params.burstType === 'surface' || hobKm <= fireballKm;

    const psi20Km = computeBlastRadiusKm(params.yieldKt, 'psi20', params.burstType, hobKm);
    const psi5Km = computeBlastRadiusKm(params.yieldKt, 'psi5', params.burstType, hobKm);
    const psi1Km = computeBlastRadiusKm(params.yieldKt, 'psi1', params.burstType, hobKm);

    const thermal = computeThermalRadiiKm(params.yieldKt, params.burstType, hobKm);
    const radiation500RemKm = computeRadiationRadiusKm(params.yieldKt, 500, hobKm);

    const area = (r) => Math.PI * r * r;
    const areas = {
      fireballKm2: area(fireballKm),
      psi20Km2: area(psi20Km),
      psi5Km2: area(psi5Km),
      psi1Km2: area(psi1Km),
      thermal3rdKm2: area(thermal.thirdDegreeKm),
      radiation500RemKm2: area(radiation500RemKm)
    };

    // Simplified homogeneous population density impact estimate (for educational illustration)
    const rho = params.popDensityPerKm2;
    const rSevere = Math.max(fireballKm, psi20Km);
    const rMod = Math.max(rSevere, psi5Km);
    const rLight = Math.max(rMod, Math.max(psi1Km, thermal.thirdDegreeKm));

    const popSevere = area(rSevere) * rho;
    const popModRing = Math.max(0, area(rMod) - area(rSevere)) * rho;
    const popLightRing = Math.max(0, area(rLight) - area(rMod)) * rho;

    const estimatedFatalities = Math.round(popSevere * 0.9 + popModRing * 0.5 + popLightRing * 0.05);
    const estimatedInjuries = Math.round(popSevere * 0.1 + popModRing * 0.4 + popLightRing * 0.35);

    const totalEnergyTJ = params.yieldKt * TNT_TJ_PER_KT;
    const energy = {
      totalTJ: totalEnergyTJ,
      blastTJ: totalEnergyTJ * 0.5,
      thermalTJ: totalEnergyTJ * 0.35,
      initialRadTJ: totalEnergyTJ * 0.05,
      residualRadTJ: totalEnergyTJ * 0.1
    };

    const fallout = computeFalloutPlume(
      params.yieldKt,
      params.fissionFraction,
      touchesGround,
      params.windSpeedKmh,
      params.windDirDeg
    );

    const blast = { psi20Km, psi5Km, psi1Km };

    // Generate overpressure decay curve samples for Chart.js
    const maxChartDistKm = Math.max(1.0, Math.ceil(psi1Km * 1.4 * 10) / 10);
    const decayCurve = [];
    const steps = 24;
    for (let i = 1; i <= steps; i++) {
      const distKm = (maxChartDistKm * i) / steps;
      const psi = computeOverpressureAtDistancePsi(distKm, blast);
      decayCurve.push({
        distKm: Number(distKm.toFixed(2)),
        psi: Number(Math.min(100, psi).toFixed(2)),
        windKmh: Number(computeBlastWindKmh(psi).toFixed(1))
      });
    }

    return {
      params,
      touchesGround,
      energy,
      radii: {
        fireballKm,
        psi20Km,
        psi5Km,
        psi1Km,
        thermal3rdKm: thermal.thirdDegreeKm,
        thermal2ndKm: thermal.secondDegreeKm,
        thermal1stKm: thermal.firstDegreeKm,
        radiation500RemKm
      },
      areas,
      impactEstimate: {
        modelNote: '基于均质人口密度假设的教学简化估算，未计入建筑遮蔽与地形起伏',
        estimatedFatalities,
        estimatedInjuries,
        totalAffected: estimatedFatalities + estimatedInjuries
      },
      fallout,
      decayCurve
    };
  }

  return {
    MIN_YIELD_KT,
    MAX_YIELD_KT,
    TNT_TJ_PER_KT,
    sanitizeParams,
    computeOptimumHobKm,
    computeFireballRadiusKm,
    computeBlastRadiusKm,
    computeThermalRadiiKm,
    computeRadiationRadiusKm,
    computeOverpressureAtDistancePsi,
    computeBlastWindKmh,
    computeFalloutPlume,
    generatePlumePolygon,
    computeTimelineState,
    simulate
  };
});
