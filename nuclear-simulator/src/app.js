(function () {
  'use strict';

  const Physics = window.NukePhysics;
  const Presets = window.NukePresets;

  // Application State
  const state = {
    lat: 39.9042,
    lng: 116.4074,
    cityId: 'beijing',
    presetId: 'w76',
    yieldKt: 100,
    burstType: 'airburst',
    autoHob: true,
    hobMeters: 882,
    windSpeedKmh: 24,
    windDirDeg: 315, // NW wind blowing SE
    fissionFraction: 0.5,
    popDensityPerKm2: 6500,
    basemap: 'dark',
    soundEnabled: true,
    activeTab: 'overview',
    layers: {
      fireball: true,
      psi20: true,
      psi5: true,
      psi1: true,
      thermal: true,
      radiation: true,
      fallout: true
    },
    pinnedDetonations: [],
    timeline: {
      playing: false,
      tSec: 0,
      maxSec: 60,
      rafId: null,
      lastFrameTs: 0
    },
    simResult: null
  };

  // Map & Chart handles
  let map = null;
  let baseLayer = null;
  let refLayer = null;
  let gzMarker = null;
  let effectLayerGroup = null;
  let falloutLayerGroup = null;
  let pinnedLayerGroup = null;
  let shockwaveCircle = null;
  let radiiChart = null;
  let decayChart = null;
  let audioCtx = null;
  let toastTimer = null;

  const LAYER_STYLES = {
    fireball: { color: '#fef08a', fillColor: '#facc15', fillOpacity: 0.55, weight: 2, label: '火球区 (汽化)' },
    psi20: { color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.28, weight: 2, label: '20 psi 重度损毁' },
    psi5: { color: '#f97316', fillColor: '#f97316', fillOpacity: 0.20, weight: 1.8, label: '5 psi 中度损毁' },
    psi1: { color: '#94a3b8', fillColor: '#64748b', fillOpacity: 0.12, weight: 1.5, dashArray: '6 4', label: '1 psi 玻璃破碎' },
    thermal: { color: '#fb923c', fillColor: '#fb923c', fillOpacity: 0.10, weight: 1.8, dashArray: '4 4', label: '热辐射三度烧伤' },
    radiation: { color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.22, weight: 2, label: '500 rem 早期辐射' }
  };

  // --- Formatting Helpers ---
  function fmtKm(km) {
    if (!Number.isFinite(km) || km <= 0) return '0.00 km';
    if (km < 1) return `${Math.round(km * 1000)} m`;
    return `${km.toFixed(2)} km`;
  }

  function fmtArea(km2) {
    if (!Number.isFinite(km2) || km2 <= 0) return '0 km²';
    if (km2 < 1) return `${km2.toFixed(2)} km²`;
    if (km2 < 100) return `${km2.toFixed(1)} km²`;
    return `${Math.round(km2).toLocaleString()} km²`;
  }

  function fmtYield(kt) {
    if (kt >= 1000) {
      const mt = kt / 1000;
      return `${mt >= 10 ? mt.toFixed(1) : mt.toFixed(2)} Mt`;
    }
    if (kt < 1) return `${Math.round(kt * 1000)} t`;
    return `${kt >= 100 ? Math.round(kt) : Number(kt.toFixed(1))} kt`;
  }

  function fmtPop(n) {
    if (!Number.isFinite(n) || n <= 0) return '0';
    if (n >= 10000) return `${(n / 10000).toFixed(1)} 万`;
    return Math.round(n).toLocaleString();
  }

  // Log slider mapping: 0..1000 -> 0.01 kt .. 100,000 kt
  function sliderToYield(val) {
    const minLog = Math.log10(Physics.MIN_YIELD_KT);
    const maxLog = Math.log10(Physics.MAX_YIELD_KT);
    const ratio = Number(val) / 1000;
    const raw = Math.pow(10, minLog + ratio * (maxLog - minLog));
    if (raw < 0.1) return Number(raw.toFixed(2));
    if (raw < 10) return Number(raw.toFixed(1));
    return Math.round(raw);
  }

  function yieldToSlider(kt) {
    const minLog = Math.log10(Physics.MIN_YIELD_KT);
    const maxLog = Math.log10(Physics.MAX_YIELD_KT);
    const clamped = Math.min(Physics.MAX_YIELD_KT, Math.max(Physics.MIN_YIELD_KT, kt));
    return Math.round(((Math.log10(clamped) - minLog) / (maxLog - minLog)) * 1000);
  }

  function showToast(msg) {
    const el = document.getElementById('toast-banner');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('opacity-0', 'translate-y-2', 'pointer-events-none');
    el.classList.add('opacity-100', 'translate-y-0');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.add('opacity-0', 'translate-y-2', 'pointer-events-none');
      el.classList.remove('opacity-100', 'translate-y-0');
    }, 2600);
  }

  // --- Synthesized Web Audio Shockwave Sound ---
  function playDetonationSound() {
    if (!state.soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtx) audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') audioCtx.resume();

      const now = audioCtx.currentTime;
      // Low sub-bass rumble oscillator
      const osc = audioCtx.createOscillator();
      const oscGain = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(95, now);
      osc.frequency.exponentialRampToValueAtTime(24, now + 1.8);
      oscGain.gain.setValueAtTime(0.32, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 2.2);

      const lpFilter = audioCtx.createBiquadFilter();
      lpFilter.type = 'lowpass';
      lpFilter.frequency.setValueAtTime(280, now);
      lpFilter.frequency.exponentialRampToValueAtTime(60, now + 1.8);

      osc.connect(lpFilter);
      lpFilter.connect(oscGain);
      oscGain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 2.3);

      // Filtered white noise blast crack
      const bufferSize = audioCtx.sampleRate * 2;
      const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (audioCtx.sampleRate * 0.65));
      }
      const whiteNoise = audioCtx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;

      const noiseFilter = audioCtx.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.setValueAtTime(900, now);
      noiseFilter.frequency.exponentialRampToValueAtTime(120, now + 1.9);

      const noiseGain = audioCtx.createGain();
      noiseGain.gain.setValueAtTime(0.35, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);

      whiteNoise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(audioCtx.destination);
      whiteNoise.start(now);
      whiteNoise.stop(now + 2.0);
    } catch (_) {
      // Ignore audio failures if blocked by browser policy
    }
  }

  // --- Map Initialization & Rendering ---
  function initMap() {
    if (typeof window.L === 'undefined') {
      showToast('地图库加载中或离线，已启用遥测数据模式');
      return;
    }

    map = L.map('map-viewport', {
      center: [state.lat, state.lng],
      zoom: 11,
      zoomControl: false,
      preferCanvas: true
    });

    L.control.zoom({ position: 'topright' }).addTo(map);
    L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);

    effectLayerGroup = L.layerGroup().addTo(map);
    falloutLayerGroup = L.layerGroup().addTo(map);
    pinnedLayerGroup = L.layerGroup().addTo(map);

    setBasemap(state.basemap);

    const gzIcon = L.divIcon({
      className: '',
      html: '<div class="gz-marker" title="拖拽移动爆心"></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });

    gzMarker = L.marker([state.lat, state.lng], {
      icon: gzIcon,
      draggable: true,
      zIndexOffset: 1000
    }).addTo(map);

    gzMarker.on('dragend', () => {
      const pos = gzMarker.getLatLng();
      state.lat = Number(pos.lat.toFixed(4));
      state.lng = Number(pos.lng.toFixed(4));
      runSimulation({ fitView: false });
    });

    map.on('click', (e) => {
      state.lat = Number(e.latlng.lat.toFixed(4));
      state.lng = Number(e.latlng.lng.toFixed(4));
      gzMarker.setLatLng([state.lat, state.lng]);
      runSimulation({ fitView: false });
    });
  }

  function setBasemap(key) {
    state.basemap = key;
    const mapEl = document.getElementById('map-viewport');
    if (!map) return;

    if (baseLayer) { map.removeLayer(baseLayer); baseLayer = null; }
    if (refLayer) { map.removeLayer(refLayer); refLayer = null; }

    const cfg = Presets.BASEMAPS[key] || Presets.BASEMAPS.dark;
    if (cfg.url) {
      mapEl.classList.remove('tactical-grid-bg');
      baseLayer = L.tileLayer(cfg.url, {
        maxZoom: 18,
        attribution: cfg.attribution
      }).addTo(map);
      if (cfg.refUrl) {
        refLayer = L.tileLayer(cfg.refUrl, { maxZoom: 18, opacity: 0.85 }).addTo(map);
      }
    } else {
      mapEl.classList.add('tactical-grid-bg');
    }
  }

  function renderMapEffects(sim, fitView) {
    if (!map || !effectLayerGroup) return;
    effectLayerGroup.clearLayers();
    falloutLayerGroup.clearLayers();

    const center = [state.lat, state.lng];
    const r = sim.radii;

    // Draw outer rings first so inner tooltips remain accessible
    const rings = [
      { key: 'thermal', radiusKm: r.thermal3rdKm, style: LAYER_STYLES.thermal, desc: '暴露皮肤三度烧伤 (~8 cal/cm²)' },
      { key: 'psi1', radiusKm: r.psi1Km, style: LAYER_STYLES.psi1, desc: '玻璃普遍破碎、轻型结构受损' },
      { key: 'psi5', radiusKm: r.psi5Km, style: LAYER_STYLES.psi5, desc: '绝大多数住宅倒塌，墙面受压超180吨' },
      { key: 'radiation', radiusKm: r.radiation500RemKm, style: LAYER_STYLES.radiation, desc: '500 rem (5 Sv) 急性致命核辐射' },
      { key: 'psi20', radiusKm: r.psi20Km, style: LAYER_STYLES.psi20, desc: '钢筋混凝土建筑严重损毁' },
      { key: 'fireball', radiusKm: r.fireballKm, style: LAYER_STYLES.fireball, desc: '核心汽化区，瞬时极高温度' }
    ].sort((a, b) => b.radiusKm - a.radiusKm);

    rings.forEach((item) => {
      if (!state.layers[item.key] || item.radiusKm <= 0) return;
      const circle = L.circle(center, {
        radius: item.radiusKm * 1000,
        color: item.style.color,
        fillColor: item.style.fillColor,
        fillOpacity: item.style.fillOpacity,
        weight: item.style.weight,
        dashArray: item.style.dashArray || null
      });
      circle.bindTooltip(
        `<div style="font-size:12px;"><strong>${item.style.label}</strong><br/>半径: ${fmtKm(item.radiusKm)}<br/>${item.desc}</div>`,
        { sticky: true, direction: 'top' }
      );
      circle.addTo(effectLayerGroup);
    });

    // Fallout Plume
    if (state.layers.fallout && sim.fallout.significant) {
      const contours = [...sim.fallout.contours].reverse(); // largest first
      contours.forEach((c) => {
        const polyPts = Physics.generatePlumePolygon(
          state.lat,
          state.lng,
          c.lengthKm,
          c.maxWidthKm,
          c.downwindBearingDeg,
          36
        );
        const poly = L.polygon(polyPts, {
          color: c.color,
          fillColor: c.color,
          fillOpacity: c.doseRate === 1000 ? 0.35 : c.doseRate === 100 ? 0.22 : 0.12,
          weight: 1.5
        });
        poly.bindTooltip(
          `<div style="font-size:12px;"><strong>${c.label}</strong><br/>下风向长度: ${fmtKm(c.lengthKm)} | 最大宽度: ${fmtKm(c.maxWidthKm)}</div>`,
          { sticky: true }
        );
        poly.addTo(falloutLayerGroup);
      });
    }

    // Fit map view cleanly to the largest visible ring using analytic lat/lng bounds
    if (fitView) {
      const maxKm = Math.max(r.psi1Km, r.thermal3rdKm, r.fireballKm, 0.5) * 1.25;
      const dLat = maxKm / 111.32;
      const cosLat = Math.max(0.1, Math.cos((state.lat * Math.PI) / 180));
      const dLng = maxKm / (111.32 * cosLat);
      const padBounds = L.latLngBounds(
        [state.lat - dLat, state.lng - dLng],
        [state.lat + dLat, state.lng + dLng]
      );
      map.fitBounds(padBounds, { padding: [32, 32], maxZoom: 15 });
    }
  }

  function renderPinnedDetonations() {
    if (!map || !pinnedLayerGroup) return;
    pinnedLayerGroup.clearLayers();

    state.pinnedDetonations.forEach((pin, idx) => {
      const center = [pin.lat, pin.lng];
      L.circle(center, {
        radius: pin.sim.radii.psi5Km * 1000,
        color: '#38bdf8',
        fillColor: '#38bdf8',
        fillOpacity: 0.14,
        weight: 1.5,
        dashArray: '5 5'
      }).bindTooltip(`对比爆点 #${idx + 1} (${fmtYield(pin.sim.params.yieldKt)}) — 5 psi: ${fmtKm(pin.sim.radii.psi5Km)}`)
        .addTo(pinnedLayerGroup);

      L.circle(center, {
        radius: pin.sim.radii.fireballKm * 1000,
        color: '#fde047',
        fillColor: '#fde047',
        fillOpacity: 0.45,
        weight: 1.5
      }).addTo(pinnedLayerGroup);

      L.circleMarker(center, {
        radius: 5,
        color: '#ffffff',
        fillColor: '#38bdf8',
        fillOpacity: 1,
        weight: 1.5
      }).addTo(pinnedLayerGroup);
    });

    const badge = document.getElementById('pin-count-badge');
    if (badge) {
      badge.textContent = String(state.pinnedDetonations.length);
      badge.classList.toggle('hidden', state.pinnedDetonations.length === 0);
    }
  }

  // --- Timeline Shockwave Animation ---
  function updateShockwaveGraphic(tSec) {
    if (!state.simResult) return;
    const tl = Physics.computeTimelineState(tSec, state.simResult);

    const timeEl = document.getElementById('timeline-time-label');
    const phaseEl = document.getElementById('timeline-phase-label');
    const shockEl = document.getElementById('timeline-shock-label');
    const cloudEl = document.getElementById('timeline-cloud-label');
    const sliderEl = document.getElementById('timeline-slider');

    if (timeEl) timeEl.textContent = `T+${tl.tSec.toFixed(1)} s`;
    if (phaseEl) phaseEl.textContent = tl.phase;
    if (shockEl) shockEl.textContent = fmtKm(tl.shockRadiusKm);
    if (cloudEl) cloudEl.textContent = fmtKm(tl.cloudHeightKm);
    if (sliderEl && !state.timeline.scrubbing) sliderEl.value = String(tl.tSec);

    if (map) {
      if (shockwaveCircle) {
        map.removeLayer(shockwaveCircle);
        shockwaveCircle = null;
      }
      if (tl.shockRadiusKm > 0.01) {
        const opacity = Math.max(0.15, 0.95 - (tl.tSec / state.timeline.maxSec) * 0.75);
        shockwaveCircle = L.circle([state.lat, state.lng], {
          radius: tl.shockRadiusKm * 1000,
          color: '#38bdf8',
          weight: 2.5,
          opacity,
          fill: false,
          interactive: false
        }).addTo(map);
      }
    }
  }

  function stopTimeline() {
    state.timeline.playing = false;
    if (state.timeline.rafId) {
      cancelAnimationFrame(state.timeline.rafId);
      state.timeline.rafId = null;
    }
    const btn = document.getElementById('btn-play-timeline');
    if (btn) btn.textContent = '▶ 播放';
  }

  function startTimeline(resetToZero) {
    stopTimeline();
    if (resetToZero) state.timeline.tSec = 0;
    state.timeline.playing = true;
    state.timeline.lastFrameTs = performance.now();
    const btn = document.getElementById('btn-play-timeline');
    if (btn) btn.textContent = '⏸ 暂停';

    function tick(now) {
      if (!state.timeline.playing) return;
      const dt = Math.min(0.1, (now - state.timeline.lastFrameTs) / 1000);
      state.timeline.lastFrameTs = now;
      // 2.5x visual time speed so 60s completes in ~24s
      state.timeline.tSec += dt * 2.5;
      if (state.timeline.tSec >= state.timeline.maxSec) {
        state.timeline.tSec = state.timeline.maxSec;
        updateShockwaveGraphic(state.timeline.tSec);
        stopTimeline();
        return;
      }
      updateShockwaveGraphic(state.timeline.tSec);
      state.timeline.rafId = requestAnimationFrame(tick);
    }
    state.timeline.rafId = requestAnimationFrame(tick);
  }

  function triggerDetonationSequence() {
    const flash = document.getElementById('flash-overlay');
    if (flash) {
      flash.classList.add('flash-active');
      setTimeout(() => flash.classList.remove('flash-active'), 110);
    }
    playDetonationSound();
    runSimulation({ fitView: true });
    startTimeline(true);
    showToast(`已引爆模拟：${fmtYield(state.yieldKt)} (${state.burstType === 'airburst' ? '空爆' : '地爆'})`);
  }

  // --- Charts (Chart.js) ---
  function updateCharts(sim) {
    if (typeof window.Chart === 'undefined') return;

    const r = sim.radii;
    const barCanvas = document.getElementById('chart-radii');
    const lineCanvas = document.getElementById('chart-decay');
    if (!barCanvas || !lineCanvas) return;

    const barData = [
      Number(r.fireballKm.toFixed(2)),
      Number(r.psi20Km.toFixed(2)),
      Number(r.radiation500RemKm.toFixed(2)),
      Number(r.psi5Km.toFixed(2)),
      Number(r.psi1Km.toFixed(2)),
      Number(r.thermal3rdKm.toFixed(2))
    ];

    if (!radiiChart) {
      radiiChart = new Chart(barCanvas.getContext('2d'), {
        type: 'bar',
        data: {
          labels: ['火球区', '20 psi', '500 rem辐射', '5 psi', '1 psi', '三度热烧伤'],
          datasets: [{
            label: '效应半径 (km)',
            data: barData,
            backgroundColor: ['#facc15', '#ef4444', '#22c55e', '#f97316', '#94a3b8', '#fb923c'],
            borderRadius: 4
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (ctx) => `${ctx.raw} km` } }
          },
          scales: {
            x: {
              grid: { color: 'rgba(148, 163, 184, 0.12)' },
              ticks: { color: '#94a3b8', font: { size: 11 } }
            },
            y: {
              grid: { display: false },
              ticks: { color: '#e2e8f0', font: { size: 11 } }
            }
          }
        }
      });
    } else {
      radiiChart.data.datasets[0].data = barData;
      radiiChart.update('none');
    }

    const labels = sim.decayCurve.map((p) => `${p.distKm}`);
    const psiSeries = sim.decayCurve.map((p) => p.psi);
    const windSeries = sim.decayCurve.map((p) => p.windKmh);

    if (!decayChart) {
      decayChart = new Chart(lineCanvas.getContext('2d'), {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: '峰值超压 (psi)',
              data: psiSeries,
              borderColor: '#f59e0b',
              backgroundColor: 'rgba(245, 158, 11, 0.15)',
              fill: true,
              tension: 0.3,
              yAxisID: 'y',
              pointRadius: 2
            },
            {
              label: '冲击风速 (km/h)',
              data: windSeries,
              borderColor: '#38bdf8',
              borderDash: [4, 3],
              tension: 0.3,
              yAxisID: 'y1',
              pointRadius: 2
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { labels: { color: '#cbd5e1', font: { size: 11 }, boxWidth: 12 } }
          },
          scales: {
            x: {
              title: { display: true, text: '距爆心距离 (km)', color: '#94a3b8', font: { size: 11 } },
              grid: { color: 'rgba(148, 163, 184, 0.1)' },
              ticks: { color: '#94a3b8', maxTicksLimit: 6, font: { size: 10 } }
            },
            y: {
              type: 'linear',
              position: 'left',
              title: { display: true, text: '超压 (psi)', color: '#f59e0b', font: { size: 10 } },
              grid: { color: 'rgba(148, 163, 184, 0.1)' },
              ticks: { color: '#f59e0b', font: { size: 10 } }
            },
            y1: {
              type: 'linear',
              position: 'right',
              title: { display: true, text: '风速 (km/h)', color: '#38bdf8', font: { size: 10 } },
              grid: { drawOnChartArea: false },
              ticks: { color: '#38bdf8', font: { size: 10 } }
            }
          }
        }
      });
    } else {
      decayChart.data.labels = labels;
      decayChart.data.datasets[0].data = psiSeries;
      decayChart.data.datasets[1].data = windSeries;
      decayChart.update('none');
    }
  }

  // --- UI Readout Updates ---
  function updateTelemetryUI(sim) {
    const r = sim.radii;
    const a = sim.areas;

    const setText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    setText('coord-readout', `${state.lat.toFixed(4)}°N, ${state.lng.toFixed(4)}°E`);
    setText('yield-badge', fmtYield(sim.params.yieldKt));
    setText('hob-display', sim.params.burstType === 'surface' ? '0 m (地爆)' : `${sim.params.hobMeters} m`);
    setText('opt-hob-hint', `最优 5 psi 爆高: ${sim.params.optHobMeters} m`);
    setText('wind-speed-val', `${sim.params.windSpeedKmh} km/h`);
    setText('wind-dir-val', `${sim.params.windDirDeg}°`);

    const windArrow = document.getElementById('wind-compass-arrow');
    if (windArrow) {
      // Downwind arrow points where fallout travels
      const downwind = (sim.params.windDirDeg + 180) % 360;
      windArrow.style.transform = `rotate(${downwind}deg)`;
    }

    // Effect cards
    setText('val-fireball-r', fmtKm(r.fireballKm));
    setText('val-fireball-a', fmtArea(a.fireballKm2));
    setText('val-psi20-r', fmtKm(r.psi20Km));
    setText('val-psi20-a', fmtArea(a.psi20Km2));
    setText('val-psi5-r', fmtKm(r.psi5Km));
    setText('val-psi5-a', fmtArea(a.psi5Km2));
    setText('val-psi1-r', fmtKm(r.psi1Km));
    setText('val-psi1-a', fmtArea(a.psi1Km2));
    setText('val-thermal-r', fmtKm(r.thermal3rdKm));
    setText('val-thermal-a', fmtArea(a.thermal3rdKm2));
    setText('val-rad-r', fmtKm(r.radiation500RemKm));
    setText('val-rad-a', fmtArea(a.radiation500RemKm2));

    // Fallout status banner
    const falloutStatusEl = document.getElementById('fallout-status-box');
    if (falloutStatusEl) {
      if (sim.fallout.significant) {
        const outer = sim.fallout.contours[2];
        falloutStatusEl.innerHTML = `<span class="text-purple-300 font-semibold">显著局部沉降（火球触地）</span>：10 rad/hr 羽流顺风延伸约 <strong>${fmtKm(outer.lengthKm)}</strong>，最大宽 <strong>${fmtKm(outer.maxWidthKm)}</strong>。`;
        falloutStatusEl.className = 'p-2.5 rounded-lg bg-purple-950/50 border border-purple-500/40 text-xs text-slate-200';
      } else {
        falloutStatusEl.innerHTML = `<span class="text-emerald-300 font-semibold">低局部沉降（高空空爆）</span>：火球未触地，放射性尘埃随蘑菇云升入平流层扩散，近地重沉降显著减少。`;
        falloutStatusEl.className = 'p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-xs text-slate-300';
      }
    }

    // Impact estimates
    setText('est-fatalities', fmtPop(sim.impactEstimate.estimatedFatalities));
    setText('est-injuries', fmtPop(sim.impactEstimate.estimatedInjuries));
    setText('est-pop-density', `${sim.params.popDensityPerKm2.toLocaleString()} 人/km²`);

    // Physics / Energy tab
    setText('energy-total', `${sim.energy.totalTJ.toFixed(1)} TJ`);
    setText('energy-blast', `${sim.energy.blastTJ.toFixed(1)} TJ (50%)`);
    setText('energy-thermal', `${sim.energy.thermalTJ.toFixed(1)} TJ (35%)`);
    setText('energy-initrad', `${sim.energy.initialRadTJ.toFixed(1)} TJ (5%)`);
    setText('energy-resrad', `${sim.energy.residualRadTJ.toFixed(1)} TJ (10%)`);
  }

  function runSimulation({ fitView = false } = {}) {
    state.simResult = Physics.simulate({
      yieldKt: state.yieldKt,
      burstType: state.burstType,
      autoHob: state.autoHob,
      hobMeters: state.hobMeters,
      windSpeedKmh: state.windSpeedKmh,
      windDirDeg: state.windDirDeg,
      fissionFraction: state.fissionFraction,
      popDensityPerKm2: state.popDensityPerKm2
    });

    if (state.autoHob && state.burstType === 'airburst') {
      state.hobMeters = state.simResult.params.hobMeters;
      const hobSlider = document.getElementById('hob-slider');
      if (hobSlider) hobSlider.value = String(Math.min(15000, state.hobMeters));
    }

    updateTelemetryUI(state.simResult);
    renderMapEffects(state.simResult, fitView);
    updateCharts(state.simResult);
    updateShockwaveGraphic(state.timeline.tSec);
  }

  // --- Controls & Event Listeners ---
  function renderPresetButtons() {
    const container = document.getElementById('weapon-presets-grid');
    if (!container) return;
    container.innerHTML = '';

    Presets.WEAPON_PRESETS.forEach((p) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.presetId = p.id;
      btn.className = `preset-btn text-left p-2 rounded-lg border border-slate-700/80 bg-slate-800/60 hover:border-amber-500/60 transition text-xs ${state.presetId === p.id ? 'active' : ''}`;
      btn.innerHTML = `<div class="font-semibold text-slate-100 truncate">${p.cnName}</div><div class="text-[11px] text-amber-400 font-mono mt-0.5">${fmtYield(p.yieldKt)}</div>`;
      btn.title = `${p.name} (${p.era}) — ${p.desc}`;
      btn.addEventListener('click', () => {
        state.presetId = p.id;
        state.yieldKt = p.yieldKt;
        state.burstType = p.defaultBurst;
        state.autoHob = true;
        syncInputsFromState();
        runSimulation({ fitView: true });
        showToast(`已载入预设：${p.cnName} (${fmtYield(p.yieldKt)})`);
      });
      container.appendChild(btn);
    });
  }

  function renderCityOptions() {
    const select = document.getElementById('city-select');
    if (!select) return;
    select.innerHTML = '';
    Presets.CITY_PRESETS.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      if (c.id === state.cityId) opt.selected = true;
      select.appendChild(opt);
    });
  }

  function syncInputsFromState() {
    const yieldSlider = document.getElementById('yield-slider');
    const yieldInput = document.getElementById('yield-input');
    const hobSlider = document.getElementById('hob-slider');
    const autoHobCb = document.getElementById('auto-hob-toggle');
    const hobGroup = document.getElementById('hob-control-group');

    if (yieldSlider) yieldSlider.value = String(yieldToSlider(state.yieldKt));
    if (yieldInput) yieldInput.value = String(state.yieldKt);
    if (autoHobCb) autoHobCb.checked = state.autoHob;
    if (hobSlider) {
      hobSlider.disabled = state.burstType === 'surface' || state.autoHob;
      hobSlider.value = String(state.burstType === 'surface' ? 0 : state.hobMeters);
    }
    if (hobGroup) {
      hobGroup.classList.toggle('opacity-50', state.burstType === 'surface');
    }

    document.querySelectorAll('.burst-type-btn').forEach((b) => {
      const active = b.dataset.burst === state.burstType;
      b.classList.toggle('bg-amber-500', active);
      b.classList.toggle('text-slate-950', active);
      b.classList.toggle('font-semibold', active);
      b.classList.toggle('bg-slate-800', !active);
      b.classList.toggle('text-slate-300', !active);
    });

    document.querySelectorAll('.preset-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.presetId === state.presetId);
    });
  }

  function bindEvents() {
    const citySelect = document.getElementById('city-select');
    if (citySelect) {
      citySelect.addEventListener('change', (e) => {
        const city = Presets.CITY_PRESETS.find((c) => c.id === e.target.value);
        if (!city) return;
        state.cityId = city.id;
        state.lat = city.lat;
        state.lng = city.lng;
        state.popDensityPerKm2 = city.popDensity;
        const popInput = document.getElementById('pop-density-input');
        if (popInput) popInput.value = String(city.popDensity);
        if (gzMarker) gzMarker.setLatLng([city.lat, city.lng]);
        if (map) map.setView([city.lat, city.lng], city.zoom);
        runSimulation({ fitView: true });
        showToast(`目标已切换至 ${city.name}`);
      });
    }

    const basemapSelect = document.getElementById('basemap-select');
    if (basemapSelect) {
      basemapSelect.addEventListener('change', (e) => setBasemap(e.target.value));
    }

    const soundBtn = document.getElementById('btn-toggle-sound');
    if (soundBtn) {
      soundBtn.addEventListener('click', () => {
        state.soundEnabled = !state.soundEnabled;
        soundBtn.textContent = state.soundEnabled ? '🔊 音效开' : '🔇 静音';
      });
    }

    const yieldSlider = document.getElementById('yield-slider');
    const yieldInput = document.getElementById('yield-input');
    if (yieldSlider) {
      yieldSlider.addEventListener('input', (e) => {
        state.presetId = '';
        state.yieldKt = sliderToYield(e.target.value);
        if (yieldInput) yieldInput.value = String(state.yieldKt);
        syncInputsFromState();
        runSimulation({ fitView: false });
      });
    }
    if (yieldInput) {
      yieldInput.addEventListener('change', (e) => {
        state.presetId = '';
        const val = Math.min(Physics.MAX_YIELD_KT, Math.max(Physics.MIN_YIELD_KT, Number(e.target.value) || 15));
        state.yieldKt = val;
        syncInputsFromState();
        runSimulation({ fitView: true });
      });
    }

    document.querySelectorAll('.burst-type-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.burstType = btn.dataset.burst;
        syncInputsFromState();
        runSimulation({ fitView: false });
      });
    });

    const autoHobCb = document.getElementById('auto-hob-toggle');
    if (autoHobCb) {
      autoHobCb.addEventListener('change', (e) => {
        state.autoHob = e.target.checked;
        syncInputsFromState();
        runSimulation({ fitView: false });
      });
    }

    const hobSlider = document.getElementById('hob-slider');
    if (hobSlider) {
      hobSlider.addEventListener('input', (e) => {
        state.autoHob = false;
        state.hobMeters = Number(e.target.value);
        if (autoHobCb) autoHobCb.checked = false;
        runSimulation({ fitView: false });
      });
    }

    const windSpeedSlider = document.getElementById('wind-speed-slider');
    if (windSpeedSlider) {
      windSpeedSlider.addEventListener('input', (e) => {
        state.windSpeedKmh = Number(e.target.value);
        runSimulation({ fitView: false });
      });
    }

    const windDirSlider = document.getElementById('wind-dir-slider');
    if (windDirSlider) {
      windDirSlider.addEventListener('input', (e) => {
        state.windDirDeg = Number(e.target.value);
        runSimulation({ fitView: false });
      });
    }

    const popInput = document.getElementById('pop-density-input');
    if (popInput) {
      popInput.addEventListener('input', (e) => {
        state.popDensityPerKm2 = Math.max(0, Number(e.target.value) || 0);
        runSimulation({ fitView: false });
      });
    }

    document.querySelectorAll('.layer-toggle').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        state.layers[e.target.dataset.layer] = e.target.checked;
        renderMapEffects(state.simResult, false);
      });
    });

    const detonateBtn = document.getElementById('btn-detonate');
    if (detonateBtn) {
      detonateBtn.addEventListener('click', triggerDetonationSequence);
    }

    const pinBtn = document.getElementById('btn-pin-compare');
    if (pinBtn) {
      pinBtn.addEventListener('click', () => {
        if (!state.simResult) return;
        state.pinnedDetonations.push({
          lat: state.lat,
          lng: state.lng,
          sim: state.simResult
        });
        renderPinnedDetonations();
        showToast(`已锁定对比爆点 #${state.pinnedDetonations.length}，可移动爆心继续对比`);
      });
    }

    const clearPinBtn = document.getElementById('btn-clear-pins');
    if (clearPinBtn) {
      clearPinBtn.addEventListener('click', () => {
        state.pinnedDetonations = [];
        renderPinnedDetonations();
        showToast('已清除所有对比爆点');
      });
    }

    const exportBtn = document.getElementById('btn-export-json');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        if (!state.simResult) return;
        const payload = {
          exportedAt: new Date().toISOString(),
          target: { lat: state.lat, lng: state.lng, cityId: state.cityId },
          simulation: state.simResult
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `nukesim_${state.yieldKt}kt_${state.burstType}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('已导出当前模拟 JSON 报告');
      });
    }

    // Timeline controls
    const playBtn = document.getElementById('btn-play-timeline');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        if (state.timeline.playing) {
          stopTimeline();
        } else {
          startTimeline(state.timeline.tSec >= state.timeline.maxSec);
        }
      });
    }

    const resetTlBtn = document.getElementById('btn-reset-timeline');
    if (resetTlBtn) {
      resetTlBtn.addEventListener('click', () => {
        stopTimeline();
        state.timeline.tSec = 0;
        updateShockwaveGraphic(0);
      });
    }

    const tlSlider = document.getElementById('timeline-slider');
    if (tlSlider) {
      tlSlider.addEventListener('input', (e) => {
        stopTimeline();
        state.timeline.scrubbing = true;
        state.timeline.tSec = Number(e.target.value);
        updateShockwaveGraphic(state.timeline.tSec);
        state.timeline.scrubbing = false;
      });
    }

    // Right panel tabs
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.tab;
        state.activeTab = target;
        document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === target));
        document.querySelectorAll('.tab-pane').forEach((p) => {
          p.classList.toggle('hidden', p.id !== `tab-${target}`);
        });
        if (target === 'charts' && radiiChart && decayChart) {
          radiiChart.resize();
          decayChart.resize();
        }
      });
    });

    // Mobile sidebar toggle
    const toggleControlsBtn = document.getElementById('btn-toggle-sidebar');
    const sidebar = document.getElementById('control-sidebar');
    if (toggleControlsBtn && sidebar) {
      toggleControlsBtn.addEventListener('click', () => {
        sidebar.classList.toggle('hidden');
        setTimeout(() => { if (map) map.invalidateSize(); }, 180);
      });
    }
  }

  function init() {
    renderPresetButtons();
    renderCityOptions();
    syncInputsFromState();
    initMap();
    bindEvents();
    runSimulation({ fitView: true });
    updateShockwaveGraphic(0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
