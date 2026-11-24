(function (root) {
  'use strict';

  const Constants =
    typeof module !== 'undefined' && module.exports
      ? require('./constants')
      : root.KSP.Constants;

  const Physics =
    typeof module !== 'undefined' && module.exports
      ? require('./physics')
      : root.KSP.Physics;

  const { PARTS, PHYSICS, PRESETS } = Constants;

  /**
   * Build structured stages from a top-to-bottom array of part IDs.
   * Decouplers split the stack into distinct stages.
   * Stage 0 is the TOP stage (payload/pod), Stage N-1 is the BOTTOM stage (first to fire).
   */
  function parseRocketStages(partIds) {
    const validParts = (partIds || [])
      .map((id, idx) => (PARTS[id] ? { ...PARTS[id], instanceId: idx } : null))
      .filter(Boolean);

    if (validParts.length === 0) {
      return {
        parts: [],
        stages: [],
        totalWetMass: 0,
        totalDryMass: 0,
        totalDeltaVVac: 0,
        totalDeltaVAtm: 0,
        launchTWR: 0,
        hasPod: false,
        hasEngine: false,
        hasParachute: false,
        warnings: ['火箭为空，请添加指令舱、燃料箱和发动机。']
      };
    }

    // Group parts into stages split at decouplers.
    // A decoupler belongs to the lower stage that gets jettisoned (or acts as boundary).
    const rawGroups = [[]];
    for (const part of validParts) {
      if (part.isDecoupler) {
        // Start a new lower stage, attaching the decoupler to the top of the jettisoned lower stage
        rawGroups.push([part]);
      } else {
        rawGroups[rawGroups.length - 1].push(part);
      }
    }

    // Filter out any empty top group if rocket starts with decoupler
    const groups = rawGroups.filter((g) => g.length > 0);

    // Compute mass & propulsion metrics per stage (top=0 ... bottom=groups.length-1)
    let massAbove = 0;
    const stages = [];
    let totalWetMass = 0;
    let totalDryMass = 0;
    let totalDeltaVVac = 0;
    let totalDeltaVAtm = 0;

    for (let i = 0; i < groups.length; i++) {
      const stageParts = groups[i];
      let stageDry = 0;
      let stageFuel = 0;
      let stageThrust = 0;
      let weightedIspVacDenom = 0;
      let weightedIspAtmDenom = 0;
      let isSolid = false;
      let hasEngine = false;
      let dragArea = 0;

      for (const p of stageParts) {
        stageDry += p.dryMass;
        stageFuel += p.fuelMass;
        dragArea += p.dragCoeff * p.area;
        if (p.isEngine) {
          hasEngine = true;
          stageThrust += p.thrust;
          if (p.isSolid) isSolid = true;
          if (p.ispVac > 0) weightedIspVacDenom += p.thrust / p.ispVac;
          if (p.ispAtm > 0) weightedIspAtmDenom += p.thrust / p.ispAtm;
        }
      }

      const ispVac = weightedIspVacDenom > 0 ? stageThrust / weightedIspVacDenom : 0;
      const ispAtm = weightedIspAtmDenom > 0 ? stageThrust / weightedIspAtmDenom : 0;

      const stageWet = stageDry + stageFuel;
      const wetMassWithPayload = massAbove + stageWet;
      const dryMassWithPayload = massAbove + stageDry;

      const deltaVVac =
        hasEngine && stageFuel > 0
          ? Physics.calculateDeltaV(ispVac, wetMassWithPayload, dryMassWithPayload)
          : 0;
      const deltaVAtm =
        hasEngine && stageFuel > 0
          ? Physics.calculateDeltaV(ispAtm, wetMassWithPayload, dryMassWithPayload)
          : 0;

      const twrSeaLevel =
        wetMassWithPayload > 0 ? stageThrust / (wetMassWithPayload * PHYSICS.g0) : 0;

      stages.push({
        stageIndex: i, // 0 = top payload, last = launch stage
        displayNumber: groups.length - 1 - i, // KSP numbering: 0 is top, highest fires first (or reverse)
        parts: stageParts,
        stageDryMass: stageDry,
        stageFuelMass: stageFuel,
        remainingFuel: stageFuel,
        wetMassWithPayload,
        dryMassWithPayload,
        thrust: stageThrust,
        ispVac,
        ispAtm,
        deltaVVac,
        deltaVAtm,
        twrSeaLevel,
        hasEngine,
        isSolid,
        ignited: false,
        dragArea
      });

      massAbove += stageWet;
      totalWetMass += stageWet;
      totalDryMass += stageDry;
      totalDeltaVVac += deltaVVac;
      totalDeltaVAtm += deltaVAtm;
    }

    const bottomStage = stages[stages.length - 1];
    const launchTWR = bottomStage ? bottomStage.twrSeaLevel : 0;
    const hasPod = validParts.some((p) => p.isPod);
    const hasEngine = validParts.some((p) => p.isEngine);
    const hasParachute = validParts.some((p) => p.isParachute);

    const warnings = [];
    if (!hasPod) warnings.push('缺少指令舱（Mk1 指令舱），无法控制姿态。');
    if (!hasEngine) warnings.push('缺少发动机，火箭无法起飞。');
    if (hasEngine && launchTWR < 1.05) {
      warnings.push(`起飞推重比过低（TWR = ${launchTWR.toFixed(2)} < 1.05），可能无法离地。`);
    }
    if (!hasParachute) {
      warnings.push('未安装降落伞，返回大气层时可能无法安全着陆。');
    }

    return {
      parts: validParts,
      stages,
      totalWetMass,
      totalDryMass,
      totalDeltaVVac,
      totalDeltaVAtm,
      launchTWR,
      hasPod,
      hasEngine,
      hasParachute,
      warnings
    };
  }

  /**
   * Create a live flight vessel instance from a rocket part ID list.
   * Starts on Kerbin's surface at the North Pole / +Y launchpad (x = 0, y = R_kerbin).
   */
  function createFlightVessel(partIds) {
    const blueprint = parseRocketStages(partIds);
    // Deep clone stages for mutable fuel & staging state
    const activeStages = blueprint.stages.map((s) => ({
      ...s,
      remainingFuel: s.stageFuelMass,
      ignited: false
    }));

    return {
      partIds: [...partIds],
      stages: activeStages,
      x: 0,
      y: PHYSICS.KERBIN.radius + 1, // Launchpad at +Y (1m clearance)
      vx: 0,
      vy: 0,
      angle: Math.PI / 2, // Pointing straight up (+Y)
      angularVelocity: 0,
      throttle: 1.0,
      sasEnabled: true,
      sasMode: 'hold', // 'hold' | 'prograde' | 'retrograde'
      parachuteDeployed: false,
      status: 'prelaunch', // 'prelaunch' | 'flying' | 'orbit' | 'landed' | 'crashed'
      met: 0,
      maxAltitude: 0,
      maxSpeed: 0,
      gForce: 1.0,
      dynamicPressure: 0,
      inMunSOI: false,
      munDist: Infinity,
      milestones: {
        liftoff: false,
        atmosphereCleared: false,
        stableOrbit: false,
        munApproach: false,
        safeLanding: false
      },
      eventLog: [
        { met: 0, text: '火箭已就位于坎巴拉发射中心（KSC）发射台。按 SPACE 点火起飞！' }
      ]
    };
  }

  /**
   * Compute live total mass, drag area, and active stage properties of a flying vessel.
   */
  function getVesselLiveMetrics(vessel) {
    let totalMass = 0;
    let totalDragArea = 0;
    let hasParachute = false;

    for (const s of vessel.stages) {
      totalMass += s.stageDryMass + s.remainingFuel;
      totalDragArea += s.dragArea;
      if (s.parts.some((p) => p.isParachute)) {
        hasParachute = true;
      }
    }

    // Clamp base aerodynamic drag area to realistic cross-section
    const effectiveDragArea = Math.min(totalDragArea, 1.8) + (vessel.parachuteDeployed && hasParachute ? 85 : 0);
    const activeStage = vessel.stages.length > 0 ? vessel.stages[vessel.stages.length - 1] : null;

    return {
      totalMass: Math.max(100, totalMass),
      dragArea: effectiveDragArea,
      hasParachute,
      activeStage
    };
  }

  /**
   * Trigger staging:
   * - If bottom stage hasn't been ignited yet and has an engine, ignite it.
   * - Otherwise, jettison the bottom stage (if >1 stages remain) and ignite the new bottom stage if it has an engine.
   */
  function triggerStage(vessel) {
    if (vessel.status === 'crashed' || vessel.status === 'landed') {
      return { action: 'none', message: '任务已结束。' };
    }
    if (vessel.stages.length === 0) {
      return { action: 'none', message: '无可用分级。' };
    }

    const bottom = vessel.stages[vessel.stages.length - 1];
    if (!bottom.ignited && bottom.hasEngine) {
      bottom.ignited = true;
      if (vessel.status === 'prelaunch') {
        vessel.status = 'flying';
        vessel.milestones.liftoff = true;
      }
      const msg = `第 ${vessel.stages.length} 级主发动机点火！`;
      vessel.eventLog.unshift({ met: vessel.met, text: msg });
      return { action: 'ignite', message: msg };
    }

    if (vessel.stages.length > 1) {
      const jettisoned = vessel.stages.pop();
      const nextBottom = vessel.stages[vessel.stages.length - 1];
      let msg = `级间分离完成，抛离第 ${vessel.stages.length + 1} 级。`;
      if (nextBottom && nextBottom.hasEngine && !nextBottom.ignited) {
        nextBottom.ignited = true;
        msg += ' 下一级发动机点火！';
      }
      vessel.eventLog.unshift({ met: vessel.met, text: msg });
      return { action: 'separate', jettisoned, message: msg };
    }

    return { action: 'none', message: '已处于最终指令舱级。' };
  }

  /**
   * Step the entire vessel simulation forward by dt seconds.
   * Handles fuel burn, SAS steering, RK4 integration, collision/landing, and milestone checks.
   */
  function stepVesselSimulation(vessel, dt, controls = {}) {
    if (vessel.status === 'crashed' || vessel.status === 'landed') {
      return Physics.computeOrbitalElements(vessel.x, vessel.y, vessel.vx, vessel.vy);
    }

    const { steer = 0, includeMun = true } = controls;
    const metrics = getVesselLiveMetrics(vessel);
    const activeStage = metrics.activeStage;

    const rNow = Math.sqrt(vessel.x * vessel.x + vessel.y * vessel.y);
    const altNow = rNow - PHYSICS.KERBIN.radius;

    // Prelaunch sits on pad until ignited
    if (vessel.status === 'prelaunch') {
      vessel.gForce = 1.0;
      vessel.dynamicPressure = 0;
      return Physics.computeOrbitalElements(vessel.x, vessel.y, vessel.vx, vessel.vy);
    }

    vessel.met += dt;

    // Steering & SAS
    const turnRate = 1.65; // rad/s
    if (Math.abs(steer) > 0.01) {
      vessel.angle += steer * turnRate * dt;
    } else if (vessel.sasEnabled) {
      const speed = Math.sqrt(vessel.vx * vessel.vx + vessel.vy * vessel.vy);
      if (vessel.sasMode === 'prograde' && speed > 5) {
        const target = Math.atan2(vessel.vy, vessel.vx);
        vessel.angle = lerpAngle(vessel.angle, target, Math.min(1, 5 * dt));
      } else if (vessel.sasMode === 'retrograde' && speed > 5) {
        const target = Math.atan2(-vessel.vy, -vessel.vx);
        vessel.angle = lerpAngle(vessel.angle, target, Math.min(1, 5 * dt));
      }
    }

    // Thrust & Fuel Consumption
    let thrustForce = 0;
    if (activeStage && activeStage.ignited && activeStage.hasEngine && activeStage.remainingFuel > 0) {
      const effThrottle = activeStage.isSolid ? 1.0 : Math.max(0, Math.min(1, vessel.throttle));
      if (effThrottle > 0) {
        thrustForce = activeStage.thrust * effThrottle;
        const effIsp = Physics.getEffectiveIsp(activeStage.ispAtm, activeStage.ispVac, altNow);
        const burnRate = Physics.getFuelBurnRate(thrustForce, effIsp);
        const fuelBurned = burnRate * dt;
        if (fuelBurned >= activeStage.remainingFuel) {
          const ratio = activeStage.remainingFuel / fuelBurned;
          thrustForce *= ratio;
          activeStage.remainingFuel = 0;
          vessel.eventLog.unshift({
            met: vessel.met,
            text: `第 ${vessel.stages.length} 级燃料耗尽（MECO）。按 SPACE 分离！`
          });
        } else {
          activeStage.remainingFuel -= fuelBurned;
        }
      }
    }

    // RK4 step
    const next = Physics.stepRK4(
      {
        x: vessel.x,
        y: vessel.y,
        vx: vessel.vx,
        vy: vessel.vy,
        angle: vessel.angle,
        mass: metrics.totalMass
      },
      {
        thrustForce,
        dragArea: metrics.dragArea,
        t: vessel.met,
        includeMun
      },
      dt
    );

    vessel.x = next.x;
    vessel.y = next.y;
    vessel.vx = next.vx;
    vessel.vy = next.vy;
    vessel.gForce = next.gForce;
    vessel.dynamicPressure = next.dynamicPressure;
    vessel.inMunSOI = next.inMunSOI;
    vessel.munDist = next.munDist;

    const newR = Math.sqrt(vessel.x * vessel.x + vessel.y * vessel.y);
    const newAlt = newR - PHYSICS.KERBIN.radius;
    const newSpeed = Math.sqrt(vessel.vx * vessel.vx + vessel.vy * vessel.vy);

    if (newAlt > vessel.maxAltitude) vessel.maxAltitude = newAlt;
    if (newSpeed > vessel.maxSpeed) vessel.maxSpeed = newSpeed;

    // Surface collision / landing check
    if (newAlt <= 0) {
      // Clamp to surface
      const scale = PHYSICS.KERBIN.radius / newR;
      vessel.x *= scale;
      vessel.y *= scale;

      if (vessel.met > 3 && newSpeed > 14) {
        vessel.status = 'crashed';
        vessel.vx = 0;
        vessel.vy = 0;
        vessel.eventLog.unshift({
          met: vessel.met,
          text: `坠毁！触地速度 ${newSpeed.toFixed(1)} m/s 超过安全上限（14 m/s）。`
        });
      } else if (vessel.met > 3 && vessel.maxAltitude > 50) {
        vessel.status = 'landed';
        vessel.vx = 0;
        vessel.vy = 0;
        vessel.milestones.safeLanding = true;
        vessel.eventLog.unshift({
          met: vessel.met,
          text: `安全着陆！触地速度 ${newSpeed.toFixed(1)} m/s，坎巴拉宇航员完好无损！`
        });
      } else {
        // Still on pad (low thrust)
        vessel.vx = 0;
        vessel.vy = 0;
      }
    }

    const orbit = Physics.computeOrbitalElements(vessel.x, vessel.y, vessel.vx, vessel.vy);

    // Milestones check
    if (!vessel.milestones.atmosphereCleared && newAlt >= PHYSICS.KERBIN.atmosphereHeight) {
      vessel.milestones.atmosphereCleared = true;
      vessel.eventLog.unshift({
        met: vessel.met,
        text: '突破 70 km 卡门线，正式进入太空！'
      });
    }
    if (!vessel.milestones.stableOrbit && orbit.isStableOrbit) {
      vessel.milestones.stableOrbit = true;
      vessel.status = 'orbit';
      vessel.eventLog.unshift({
        met: vessel.met,
        text: `成功进入 Kerbin 稳定轨道！Ap ${(orbit.apoapsis / 1000).toFixed(1)} km / Pe ${(orbit.periapsis / 1000).toFixed(1)} km`
      });
    }
    if (!vessel.milestones.munApproach && (vessel.inMunSOI || orbit.apoapsis > 10000000)) {
      vessel.milestones.munApproach = true;
      vessel.eventLog.unshift({
        met: vessel.met,
        text: '已进入穆恩（Mun）转移高轨 / 引力影响范围！'
      });
    }

    return orbit;
  }

  function lerpAngle(a, b, t) {
    let diff = b - a;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return a + diff * t;
  }

  const KSPBuilder = {
    parseRocketStages,
    createFlightVessel,
    getVesselLiveMetrics,
    triggerStage,
    stepVesselSimulation,
    PRESETS
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = KSPBuilder;
  } else {
    root.KSP = root.KSP || {};
    root.KSP.Builder = KSPBuilder;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
