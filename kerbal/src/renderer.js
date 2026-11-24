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

  const { PHYSICS } = Constants;
  const KERBIN = PHYSICS.KERBIN;
  const MUN = PHYSICS.MUN;

  // Deterministic starfield for crisp deep-space background
  const STARS = [];
  for (let i = 0; i < 220; i++) {
    const s1 = Math.sin(i * 12.9898) * 43758.5453;
    const s2 = Math.sin(i * 78.233) * 19341.123;
    const s3 = Math.sin(i * 45.164) * 91823.77;
    STARS.push({
      u: s1 - Math.floor(s1),
      v: s2 - Math.floor(s2),
      size: 0.7 + (s3 - Math.floor(s3)) * 1.7,
      alpha: 0.35 + (s3 - Math.floor(s3)) * 0.65
    });
  }

  /**
   * Draw an individual rocket part centered at (0, yTop) downward.
   */
  function drawPart(ctx, part, yTop, isFiring, throttle) {
    const w = part.width;
    const h = part.height;
    const hw = w / 2;

    ctx.save();
    if (part.isPod) {
      // Conical Mk1 command pod
      ctx.beginPath();
      ctx.moveTo(-hw * 0.45, yTop);
      ctx.lineTo(hw * 0.45, yTop);
      ctx.lineTo(hw, yTop + h);
      ctx.lineTo(-hw, yTop + h);
      ctx.closePath();
      ctx.fillStyle = '#607d8b';
      ctx.fill();
      ctx.strokeStyle = '#263238';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Heatshield rim
      ctx.fillStyle = '#37474f';
      ctx.fillRect(-hw, yTop + h - 3.5, w, 3.5);

      // Cabin window
      ctx.beginPath();
      ctx.arc(0, yTop + h * 0.52, 4.2, 0, Math.PI * 2);
      ctx.fillStyle = '#4fc3f7';
      ctx.fill();
      ctx.strokeStyle = '#eceff1';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    } else if (part.isParachute) {
      ctx.beginPath();
      ctx.moveTo(-hw * 0.65, yTop);
      ctx.lineTo(hw * 0.65, yTop);
      ctx.lineTo(hw, yTop + h);
      ctx.lineTo(-hw, yTop + h);
      ctx.closePath();
      ctx.fillStyle = part.color;
      ctx.fill();
      ctx.strokeStyle = '#b71c1c';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else if (part.isNoseCone) {
      ctx.beginPath();
      ctx.moveTo(0, yTop);
      ctx.quadraticCurveTo(hw, yTop + h * 0.5, hw, yTop + h);
      ctx.lineTo(-hw, yTop + h);
      ctx.quadraticCurveTo(-hw, yTop + h * 0.5, 0, yTop);
      ctx.closePath();
      ctx.fillStyle = part.color;
      ctx.fill();
      ctx.strokeStyle = '#90a4ae';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else if (part.isDecoupler) {
      ctx.fillStyle = part.color;
      ctx.fillRect(-hw, yTop, w, h);
      ctx.fillStyle = '#263238';
      for (let sx = -hw + 2; sx < hw - 2; sx += 7) {
        ctx.fillRect(sx, yTop + 2, 3.5, h - 4);
      }
      ctx.strokeStyle = '#37474f';
      ctx.lineWidth = 1;
      ctx.strokeRect(-hw, yTop, w, h);
    } else if (part.isTank) {
      const grad = ctx.createLinearGradient(-hw, 0, hw, 0);
      grad.addColorStop(0, '#cfd8dc');
      grad.addColorStop(0.45, '#ffffff');
      grad.addColorStop(1, '#90a4ae');
      ctx.fillStyle = grad;
      ctx.fillRect(-hw, yTop, w, h);
      ctx.strokeStyle = '#37474f';
      ctx.lineWidth = 1;
      ctx.strokeRect(-hw, yTop, w, h);

      // Decorative aerospace stripe
      ctx.fillStyle = part.accent;
      ctx.fillRect(-hw + 1, yTop + 4, w - 2, 4);
      ctx.fillRect(-hw + 1, yTop + h - 8, w - 2, 3);
    } else if (part.isEngine) {
      if (part.isSolid) {
        // Solid Rocket Booster body + nozzle
        const bodyH = h - 10;
        const grad = ctx.createLinearGradient(-hw, 0, hw, 0);
        grad.addColorStop(0, '#e0e0e0');
        grad.addColorStop(0.5, '#ffffff');
        grad.addColorStop(1, '#b0bec5');
        ctx.fillStyle = grad;
        ctx.fillRect(-hw, yTop, w, bodyH);
        ctx.fillStyle = '#d32f2f';
        ctx.fillRect(-hw, yTop + 5, w, 6);
        ctx.fillRect(-hw, yTop + bodyH - 9, w, 4);
        ctx.strokeStyle = '#455a64';
        ctx.strokeRect(-hw, yTop, w, bodyH);

        // Nozzle
        ctx.beginPath();
        ctx.moveTo(-hw * 0.55, yTop + bodyH);
        ctx.lineTo(hw * 0.55, yTop + bodyH);
        ctx.lineTo(hw * 0.85, yTop + h);
        ctx.lineTo(-hw * 0.85, yTop + h);
        ctx.closePath();
        ctx.fillStyle = '#37474f';
        ctx.fill();
      } else {
        // Liquid engine mount + bell nozzle
        ctx.fillStyle = '#546e7a';
        ctx.fillRect(-hw * 0.85, yTop, w * 0.85, h * 0.35);
        ctx.beginPath();
        ctx.moveTo(-hw * 0.45, yTop + h * 0.35);
        ctx.lineTo(hw * 0.45, yTop + h * 0.35);
        ctx.lineTo(hw * 0.82, yTop + h);
        ctx.lineTo(-hw * 0.82, yTop + h);
        ctx.closePath();
        ctx.fillStyle = '#263238';
        ctx.fill();
        ctx.strokeStyle = part.accent;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      // Dynamic exhaust plume when firing
      if (isFiring && throttle > 0.02) {
        const flicker = 0.88 + Math.random() * 0.28;
        const plumeLen = (26 + throttle * 58) * flicker;
        const plumeW = hw * (0.68 + throttle * 0.35);

        // Outer orange flame
        const flameGrad = ctx.createLinearGradient(0, yTop + h, 0, yTop + h + plumeLen);
        flameGrad.addColorStop(0, 'rgba(255, 245, 200, 0.98)');
        flameGrad.addColorStop(0.28, 'rgba(255, 167, 38, 0.92)');
        flameGrad.addColorStop(0.7, 'rgba(255, 87, 34, 0.55)');
        flameGrad.addColorStop(1, 'rgba(255, 87, 34, 0)');
        ctx.beginPath();
        ctx.moveTo(-plumeW, yTop + h);
        ctx.quadraticCurveTo(0, yTop + h + plumeLen * 1.15, plumeW, yTop + h);
        ctx.closePath();
        ctx.fillStyle = flameGrad;
        ctx.fill();

        // Bright white-blue inner core
        ctx.beginPath();
        ctx.moveTo(-plumeW * 0.45, yTop + h);
        ctx.quadraticCurveTo(0, yTop + h + plumeLen * 0.55, plumeW * 0.45, yTop + h);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /**
   * Render the entire rocket stack for VAB preview canvas.
   */
  function renderVABCanvas(canvas, blueprint) {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(240, rect.width);
    const h = Math.max(300, rect.height);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }

    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(dpr, dpr);

    // Blueprint dark grid background
    ctx.fillStyle = '#0d1520';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
    ctx.lineWidth = 1;
    const gridStep = 24;
    for (let gx = 0; gx < w; gx += gridStep) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, h);
      ctx.stroke();
    }
    for (let gy = 0; gy < h; gy += gridStep) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(w, gy);
      ctx.stroke();
    }

    // Launch floor line
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(24, h - 28);
    ctx.lineTo(w - 24, h - 28);
    ctx.stroke();

    if (!blueprint || blueprint.parts.length === 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('从左侧部件库点击添加零件，或选择右侧预设火箭', w / 2, h / 2);
      ctx.restore();
      return;
    }

    const totalH = blueprint.parts.reduce((acc, p) => acc + p.height, 0);
    const availH = h - 80;
    const scale = Math.min(1.55, availH / Math.max(totalH, 1));

    ctx.save();
    ctx.translate(w / 2, h - 32 - totalH * scale);
    ctx.scale(scale, scale);

    let y = 0;
    blueprint.stages.forEach((stage, sIdx) => {
      const stageStartY = y;
      for (const p of stage.parts) {
        drawPart(ctx, p, y, false, 0);
        y += p.height;
      }
      // Stage bracket annotation on right
      const stageMidY = (stageStartY + y) / 2;
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
      ctx.lineWidth = 1 / scale;
      ctx.beginPath();
      ctx.moveTo(22, stageStartY + 2);
      ctx.lineTo(30, stageStartY + 2);
      ctx.lineTo(30, y - 2);
      ctx.lineTo(22, y - 2);
      ctx.stroke();

      ctx.fillStyle = '#7dd3fc';
      ctx.font = `bold ${Math.max(8, 11 / scale)}px Inter, monospace`;
      ctx.textAlign = 'left';
      ctx.fillText(`S${sIdx + 1}`, 34, stageMidY + 3 / scale);
    });

    ctx.restore();
    ctx.restore();
  }

  /**
   * Render Flight View OR Map/Orbit View on the main full-bleed canvas.
   */
  function renderFlightCanvas(canvas, state) {
    if (!canvas || !state.vessel) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(300, rect.width);
    const h = Math.max(300, rect.height);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }

    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(dpr, dpr);

    if (state.viewMode === 'map') {
      renderMapView(ctx, w, h, state);
    } else {
      renderRocketView(ctx, w, h, state);
    }

    ctx.restore();
  }

  function renderRocketView(ctx, w, h, state) {
    const { vessel, particles, zoom } = state;
    const r = Math.sqrt(vessel.x * vessel.x + vessel.y * vessel.y);
    const alt = Math.max(0, r - KERBIN.radius);
    const atmRatio = Math.max(0, Math.min(1, 1 - alt / 65000));

    // Sky gradient transitioning smoothly from Kerbin daylight blue to deep space black
    const skyTopR = Math.round(6 + 24 * Math.pow(atmRatio, 1.4));
    const skyTopG = Math.round(11 + 88 * Math.pow(atmRatio, 1.4));
    const skyTopB = Math.round(22 + 168 * Math.pow(atmRatio, 1.3));
    const skyBotR = Math.round(10 + 96 * atmRatio);
    const skyBotG = Math.round(18 + 165 * atmRatio);
    const skyBotB = Math.round(35 + 215 * atmRatio);

    const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
    skyGrad.addColorStop(0, `rgb(${skyTopR},${skyTopG},${skyTopB})`);
    skyGrad.addColorStop(1, `rgb(${skyBotR},${skyBotG},${skyBotB})`);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);

    // Stars fade in as altitude increases
    const starVis = Math.max(0, 1 - atmRatio * 1.35);
    if (starVis > 0.02) {
      for (const s of STARS) {
        ctx.fillStyle = `rgba(255, 255, 255, ${s.alpha * starVis})`;
        ctx.beginPath();
        ctx.arc(s.u * w, s.v * h, s.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Local vertical frame: up is radial outward from Kerbin center
    const upAngle = Math.atan2(vessel.y, vessel.x);
    const pxPerMeter = 1.65 * zoom;

    ctx.save();
    // Place craft at screen center
    ctx.translate(w / 2, h / 2);

    // Rotate world so local "up" is always pointing to top of screen (-Y in canvas)
    const worldRot = -(upAngle - Math.PI / 2);

    // Draw Kerbin curved surface below craft when within visual range
    const planetRadiusPx = KERBIN.radius * pxPerMeter;
    const altPx = alt * pxPerMeter;
    const surfaceCenterY = altPx + planetRadiusPx;

    if (altPx < h * 2.5) {
      ctx.save();
      // Atmosphere glow rim
      ctx.beginPath();
      ctx.arc(0, surfaceCenterY, planetRadiusPx + 70000 * pxPerMeter * 0.15, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';
      ctx.fill();

      // Kerbin lush surface
      ctx.beginPath();
      ctx.arc(0, surfaceCenterY, planetRadiusPx, 0, Math.PI * 2);
      ctx.fillStyle = '#2e7d32';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#66bb6a';
      ctx.stroke();

      // Launchpad & KSC VAB tower near initial launch site (when close)
      const launchAngle = Math.PI / 2;
      const dTheta = upAngle - launchAngle;
      if (Math.abs(dTheta) < 0.05 && alt < 3500) {
        const padOffsetX = -dTheta * planetRadiusPx;
        const padY = altPx;
        // Concrete launchpad
        ctx.fillStyle = '#546e7a';
        ctx.fillRect(padOffsetX - 55 * zoom, padY - 2, 110 * zoom, 12 * zoom);
        // Launch clamp tower
        ctx.fillStyle = '#b71c1c';
        ctx.fillRect(padOffsetX - 38 * zoom, padY - 54 * zoom, 8 * zoom, 54 * zoom);
        ctx.fillStyle = '#cfd8dc';
        ctx.fillRect(padOffsetX - 38 * zoom, padY - 46 * zoom, 22 * zoom, 4 * zoom);
        // Distant VAB building
        ctx.fillStyle = '#37474f';
        ctx.fillRect(padOffsetX + 95 * zoom, padY - 46 * zoom, 52 * zoom, 46 * zoom);
        ctx.fillStyle = '#4fc3f7';
        ctx.fillRect(padOffsetX + 105 * zoom, padY - 34 * zoom, 32 * zoom, 8 * zoom);
      }
      ctx.restore();
    }

    // Draw smoke/exhaust/explosion particles in local camera frame
    if (particles && particles.length > 0) {
      for (const pt of particles) {
        const dx = pt.x - vessel.x;
        const dy = pt.y - vessel.y;
        // Rotate (dx, dy) into local up frame
        const cosR = Math.cos(worldRot);
        const sinR = Math.sin(worldRot);
        const lx = (dx * cosR - dy * sinR) * pxPerMeter;
        const ly = -(dx * sinR + dy * cosR) * pxPerMeter;
        ctx.fillStyle = pt.color.replace('ALPHA', pt.life.toFixed(2));
        ctx.beginPath();
        ctx.arc(lx, ly, Math.max(1.5, pt.size * zoom * (1.3 - pt.life * 0.4)), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw Rocket Craft
    const rocketVisualAngle = -(vessel.angle - upAngle);
    ctx.save();
    ctx.rotate(rocketVisualAngle);

    // Parachute canopy if deployed in atmosphere
    const hasChute = vessel.stages.some((s) => s.parts.some((p) => p.isParachute));
    if (vessel.parachuteDeployed && hasChute && alt < 25000 && vessel.status !== 'crashed') {
      ctx.save();
      const canopyY = -75 * zoom;
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.8)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, -18 * zoom);
      ctx.lineTo(-34 * zoom, canopyY + 8 * zoom);
      ctx.moveTo(0, -18 * zoom);
      ctx.lineTo(34 * zoom, canopyY + 8 * zoom);
      ctx.moveTo(0, -18 * zoom);
      ctx.lineTo(0, canopyY + 5 * zoom);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, canopyY + 12 * zoom, 36 * zoom, Math.PI, 0);
      ctx.closePath();
      ctx.fillStyle = '#ef5350';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    // Reentry aerodynamic plasma glow at high dynamic pressure & speed
    const speed = Math.sqrt(vessel.vx * vessel.vx + vessel.vy * vessel.vy);
    if (vessel.dynamicPressure > 14000 && speed > 750) {
      const heatAlpha = Math.min(0.85, (vessel.dynamicPressure - 14000) / 45000);
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, -16 * zoom, 28 * zoom, Math.PI * 1.1, Math.PI * 1.9);
      ctx.strokeStyle = `rgba(255, 112, 67, ${heatAlpha})`;
      ctx.lineWidth = 6 * zoom;
      ctx.stroke();
      ctx.restore();
    }

    if (vessel.status !== 'crashed') {
      const allParts = [];
      for (const st of vessel.stages) {
        for (const p of st.parts) allParts.push({ part: p, stage: st });
      }
      const totalH = allParts.reduce((sum, item) => sum + item.part.height, 0);
      const drawScale = 0.85 * zoom;

      ctx.save();
      ctx.scale(drawScale, drawScale);
      let yCur = -totalH / 2;
      const activeStage = vessel.stages[vessel.stages.length - 1];
      const isFiring =
        activeStage &&
        activeStage.ignited &&
        activeStage.hasEngine &&
        activeStage.remainingFuel > 0 &&
        (activeStage.isSolid || vessel.throttle > 0.01);
      const effThrottle = activeStage && activeStage.isSolid ? 1.0 : vessel.throttle;

      for (const item of allParts) {
        const partFiring = isFiring && item.stage === activeStage && item.part.isEngine;
        drawPart(ctx, item.part, yCur, partFiring, effThrottle);
        yCur += item.part.height;
      }
      ctx.restore();
    }

    ctx.restore();
    ctx.restore();
  }

  function renderMapView(ctx, w, h, state) {
    const { vessel, orbit, mapZoom } = state;

    // Deep space background
    ctx.fillStyle = '#050911';
    ctx.fillRect(0, 0, w, h);

    for (const s of STARS) {
      ctx.fillStyle = `rgba(255, 255, 255, ${s.alpha * 0.7})`;
      ctx.beginPath();
      ctx.arc(s.u * w, s.v * h, s.size * 0.85, 0, Math.PI * 2);
      ctx.fill();
    }

    const baseScale = Math.min(w, h) / (KERBIN.radius * 4.5);
    const scale = baseScale * mapZoom;
    const cx = w / 2;
    const cy = h / 2;

    const toScreen = (wx, wy) => ({
      sx: cx + wx * scale,
      sy: cy - wy * scale
    });

    // Mun orbit ring
    ctx.beginPath();
    ctx.arc(cx, cy, MUN.orbitRadius * scale, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.setLineDash([]);

    // Mun position & SOI
    const mun = Physics.getMunPosition(vessel.met);
    const munPos = toScreen(mun.x, mun.y);
    ctx.beginPath();
    ctx.arc(munPos.sx, munPos.sy, MUN.soiRadius * scale, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(167, 139, 250, 0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(munPos.sx, munPos.sy, Math.max(4, MUN.radius * scale), 0, Math.PI * 2);
    ctx.fillStyle = '#94a3b8';
    ctx.fill();
    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.fillText('Mun (穆恩)', munPos.sx + Math.max(8, MUN.radius * scale + 5), munPos.sy + 4);

    // Kerbin atmosphere ring (70 km)
    ctx.beginPath();
    ctx.arc(cx, cy, (KERBIN.radius + KERBIN.atmosphereHeight) * scale, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.14)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Kerbin body
    const kerbinGrad = ctx.createRadialGradient(
      cx - KERBIN.radius * scale * 0.3,
      cy - KERBIN.radius * scale * 0.3,
      KERBIN.radius * scale * 0.1,
      cx,
      cy,
      Math.max(6, KERBIN.radius * scale)
    );
    kerbinGrad.addColorStop(0, '#38bdf8');
    kerbinGrad.addColorStop(0.65, '#1d4ed8');
    kerbinGrad.addColorStop(1, '#0f294a');
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(6, KERBIN.radius * scale), 0, Math.PI * 2);
    ctx.fillStyle = kerbinGrad;
    ctx.fill();

    // Green continents silhouette
    if (KERBIN.radius * scale > 20) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, KERBIN.radius * scale, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = 'rgba(52, 211, 153, 0.45)';
      ctx.beginPath();
      ctx.arc(cx - KERBIN.radius * scale * 0.35, cy - KERBIN.radius * scale * 0.2, KERBIN.radius * scale * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + KERBIN.radius * scale * 0.4, cy + KERBIN.radius * scale * 0.35, KERBIN.radius * scale * 0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Predicted Keplerian orbit path
    if (orbit && vessel.status !== 'prelaunch') {
      const pts = Physics.sampleOrbitPath(orbit, 140);
      if (pts.length > 2) {
        ctx.beginPath();
        pts.forEach((pt, idx) => {
          const sp = toScreen(pt.x, pt.y);
          if (idx === 0) ctx.moveTo(sp.sx, sp.sy);
          else ctx.lineTo(sp.sx, sp.sy);
        });
        ctx.strokeStyle = orbit.isStableOrbit ? '#34d399' : '#38bdf8';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Apoapsis marker
      if (!orbit.isEscape && isFinite(orbit.apoapsisRadius) && orbit.apoapsis > 1000) {
        const apAngle = orbit.argOfPeriapsis + Math.PI;
        const apP = toScreen(
          orbit.apoapsisRadius * Math.cos(apAngle),
          orbit.apoapsisRadius * Math.sin(apAngle)
        );
        drawOrbitMarker(ctx, apP.sx, apP.sy, 'Ap', `${(orbit.apoapsis / 1000).toFixed(1)} km`, '#38bdf8');
      }

      // Periapsis marker
      if (isFinite(orbit.periapsisRadius) && orbit.periapsisRadius > KERBIN.radius * 0.2) {
        const peAngle = orbit.argOfPeriapsis;
        const peP = toScreen(
          orbit.periapsisRadius * Math.cos(peAngle),
          orbit.periapsisRadius * Math.sin(peAngle)
        );
        const peColor = orbit.periapsis >= KERBIN.atmosphereHeight ? '#34d399' : '#fbbf24';
        drawOrbitMarker(ctx, peP.sx, peP.sy, 'Pe', `${(orbit.periapsis / 1000).toFixed(1)} km`, peColor);
      }
    }

    // Spacecraft icon in Map View
    const craftP = toScreen(vessel.x, vessel.y);
    ctx.save();
    ctx.translate(craftP.sx, craftP.sy);
    ctx.rotate(-vessel.angle + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5.5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5.5, 6);
    ctx.closePath();
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  function drawOrbitMarker(ctx, sx, sy, tag, label, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(sx, sy, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(sx + 8, sy - 11, 78, 18);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + 8, sy - 11, 78, 18);
    ctx.fillStyle = color;
    ctx.font = 'bold 10px Inter, monospace';
    ctx.fillText(`${tag} ${label}`, sx + 12, sy + 1);
    ctx.restore();
  }

  /**
   * Render KSP-style Navball HUD (attitudes relative to local horizon).
   */
  function renderNavball(canvas, vessel) {
    if (!canvas || !vessel) return;
    const dpr = window.devicePixelRatio || 1;
    const size = 128;
    if (canvas.width !== size * dpr) {
      canvas.width = size * dpr;
      canvas.height = size * dpr;
    }

    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;
    const radius = 56;

    const upAngle = Math.atan2(vessel.y, vessel.x);
    // Relative pitch angle (0 = straight up, +PI/2 = right/east horizon, -PI/2 = left/west)
    let relAngle = vessel.angle - upAngle;
    while (relAngle > Math.PI) relAngle -= 2 * Math.PI;
    while (relAngle < -Math.PI) relAngle += 2 * Math.PI;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    // Rotate navball background opposite to craft attitude
    ctx.translate(cx, cy);
    ctx.rotate(relAngle);

    // Sky hemisphere (top)
    ctx.fillStyle = '#1d6fa5';
    ctx.fillRect(-radius, -radius, radius * 2, radius);
    // Ground hemisphere (bottom)
    ctx.fillStyle = '#7c4a21';
    ctx.fillRect(-radius, 0, radius * 2, radius);

    // Horizon line
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-radius, 0);
    ctx.lineTo(radius, 0);
    ctx.stroke();

    // Pitch degree rings
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    [-36, -18, 18, 36].forEach((offset) => {
      ctx.beginPath();
      ctx.moveTo(-16, offset);
      ctx.lineTo(16, offset);
      ctx.stroke();
    });

    // Prograde & Retrograde markers on rim
    const speed = Math.sqrt(vessel.vx * vessel.vx + vessel.vy * vessel.vy);
    if (speed > 4) {
      const velAngle = Math.atan2(vessel.vy, vessel.vx);
      const proRel = velAngle - upAngle;
      const px = -Math.sin(proRel) * (radius * 0.68);
      const py = -Math.cos(proRel) * (radius * 0.68);

      // Prograde green marker
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.stroke();

      // Retrograde yellow marker
      ctx.strokeStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(-px, -py, 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-px - 4, -py - 4);
      ctx.lineTo(-px + 4, -py + 4);
      ctx.moveTo(-px + 4, -py - 4);
      ctx.lineTo(-px - 4, -py + 4);
      ctx.stroke();
    }

    ctx.restore();

    // Fixed orange craft nose reticle at center
    ctx.strokeStyle = '#fb923c';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx - 16, cy);
    ctx.lineTo(cx - 5, cy);
    ctx.lineTo(cx, cy + 5);
    ctx.lineTo(cx + 5, cy);
    ctx.lineTo(cx + 16, cy);
    ctx.stroke();

    // Outer bezel
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.restore();
  }

  const KSPRenderer = {
    renderVABCanvas,
    renderFlightCanvas,
    renderNavball
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = KSPRenderer;
  } else {
    root.KSP = root.KSP || {};
    root.KSP.Renderer = KSPRenderer;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
