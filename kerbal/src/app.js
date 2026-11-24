(function (root) {
  'use strict';

  const Constants = root.KSP.Constants;
  const Physics = root.KSP.Physics;
  const Builder = root.KSP.Builder;
  const Audio = root.KSP.Audio;
  const Renderer = root.KSP.Renderer;

  const { PARTS, PRESETS, CATEGORIES, PHYSICS } = Constants;

  const WARP_LEVELS = [1, 5, 20, 100, 1000];

  class KSPApp {
    constructor() {
      this.mode = 'vab'; // 'vab' | 'flight'
      this.selectedCategory = 'pod';
      this.currentPartIds = [...PRESETS.orbiter.parts];
      this.vessel = null;
      this.orbit = null;
      this.viewMode = 'flight'; // 'flight' | 'map'
      this.zoom = 1.0;
      this.mapZoom = 1.0;
      this.warpIndex = 0;
      this.paused = false;
      this.autoGravityTurn = false;
      this.keys = {};
      this.touchSteer = 0;
      this.particles = [];
      this.sound = new Audio.SoundEngine();
      this.rafId = null;
      this.lastFrameTime = 0;
      this.prevMilestones = {};

      this.cacheDOM();
      this.bindEvents();
      this.renderVAB();
      this.startLoop();
    }

    cacheDOM() {
      this.el = {
        btnModeVab: document.getElementById('btn-mode-vab'),
        btnModeFlight: document.getElementById('btn-mode-flight'),
        btnMute: document.getElementById('btn-mute'),
        vabView: document.getElementById('vab-view'),
        flightView: document.getElementById('flight-view'),
        vabCategories: document.getElementById('vab-categories'),
        vabPartsList: document.getElementById('vab-parts-list'),
        vabCanvas: document.getElementById('vab-canvas'),
        vabStackList: document.getElementById('vab-stack-list'),
        vabPresets: document.getElementById('vab-presets'),
        vabMetrics: document.getElementById('vab-metrics'),
        vabStages: document.getElementById('vab-stages'),
        vabWarnings: document.getElementById('vab-warnings'),
        btnClearRocket: document.getElementById('btn-clear-rocket'),
        btnLaunch: document.getElementById('btn-launch'),
        flightCanvas: document.getElementById('flight-canvas'),
        navballCanvas: document.getElementById('navball-canvas'),
        hudAlt: document.getElementById('hud-alt'),
        hudVel: document.getElementById('hud-vel'),
        hudVspeed: document.getElementById('hud-vspeed'),
        hudMet: document.getElementById('hud-met'),
        hudWarp: document.getElementById('hud-warp'),
        hudAp: document.getElementById('hud-ap'),
        hudPe: document.getElementById('hud-pe'),
        hudEcc: document.getElementById('hud-ecc'),
        hudPeriod: document.getElementById('hud-period'),
        hudGforce: document.getElementById('hud-gforce'),
        hudDynQ: document.getElementById('hud-dynq'),
        hudStatusBadge: document.getElementById('hud-status-badge'),
        hudStagesList: document.getElementById('hud-stages-list'),
        hudMilestones: document.getElementById('hud-milestones'),
        hudEventLog: document.getElementById('hud-event-log'),
        throttleSlider: document.getElementById('throttle-slider'),
        throttleVal: document.getElementById('throttle-val'),
        btnStage: document.getElementById('btn-stage'),
        btnParachute: document.getElementById('btn-parachute'),
        btnSasToggle: document.getElementById('btn-sas-toggle'),
        btnSasHold: document.getElementById('btn-sas-hold'),
        btnSasPro: document.getElementById('btn-sas-pro'),
        btnSasRetro: document.getElementById('btn-sas-retro'),
        btnAutoTurn: document.getElementById('btn-auto-turn'),
        btnToggleMap: document.getElementById('btn-toggle-map'),
        btnWarpDown: document.getElementById('btn-warp-down'),
        btnWarpUp: document.getElementById('btn-warp-up'),
        btnPause: document.getElementById('btn-pause'),
        btnResetLaunch: document.getElementById('btn-reset-launch'),
        btnBackVab: document.getElementById('btn-back-vab'),
        btnZoomIn: document.getElementById('btn-zoom-in'),
        btnZoomOut: document.getElementById('btn-zoom-out'),
        btnSteerLeft: document.getElementById('btn-steer-left'),
        btnSteerRight: document.getElementById('btn-steer-right'),
        btnThrottleFull: document.getElementById('btn-throttle-full'),
        btnThrottleCut: document.getElementById('btn-throttle-cut'),
        toastBanner: document.getElementById('toast-banner')
      };
    }

    showToast(msg) {
      if (!this.el.toastBanner) return;
      this.el.toastBanner.textContent = msg;
      this.el.toastBanner.classList.add('show');
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => {
        this.el.toastBanner.classList.remove('show');
      }, 2600);
    }

    bindEvents() {
      this.el.btnModeVab.addEventListener('click', () => this.switchMode('vab'));
      this.el.btnModeFlight.addEventListener('click', () => {
        if (!this.vessel) this.launchRocket();
        else this.switchMode('flight');
      });

      this.el.btnMute.addEventListener('click', () => {
        this.sound.init();
        const nextMuted = !this.sound.muted;
        this.sound.setMuted(nextMuted);
        this.el.btnMute.textContent = nextMuted ? '🔇 静音' : '🔊 音效';
      });

      this.el.btnClearRocket.addEventListener('click', () => {
        this.currentPartIds = [];
        this.renderVAB();
      });

      this.el.btnLaunch.addEventListener('click', () => {
        this.sound.init();
        this.launchRocket();
      });

      // Flight Controls
      this.el.throttleSlider.addEventListener('input', (e) => {
        if (!this.vessel) return;
        this.vessel.throttle = parseFloat(e.target.value) / 100;
        this.updateThrottleUI();
      });

      this.el.btnThrottleFull.addEventListener('click', () => {
        if (!this.vessel) return;
        this.vessel.throttle = 1.0;
        this.updateThrottleUI();
      });

      this.el.btnThrottleCut.addEventListener('click', () => {
        if (!this.vessel) return;
        this.vessel.throttle = 0.0;
        this.updateThrottleUI();
      });

      this.el.btnStage.addEventListener('click', () => this.doStage());
      this.el.btnParachute.addEventListener('click', () => this.doParachute());

      this.el.btnSasToggle.addEventListener('click', () => {
        if (!this.vessel) return;
        this.vessel.sasEnabled = !this.vessel.sasEnabled;
        this.updateSasUI();
      });
      this.el.btnSasHold.addEventListener('click', () => this.setSasMode('hold'));
      this.el.btnSasPro.addEventListener('click', () => this.setSasMode('prograde'));
      this.el.btnSasRetro.addEventListener('click', () => this.setSasMode('retrograde'));

      this.el.btnAutoTurn.addEventListener('click', () => {
        this.autoGravityTurn = !this.autoGravityTurn;
        this.el.btnAutoTurn.classList.toggle('active', this.autoGravityTurn);
        this.showToast(this.autoGravityTurn ? '已开启重力转弯入轨辅助' : '已关闭自动重力转弯');
      });

      this.el.btnToggleMap.addEventListener('click', () => this.toggleMapView());
      this.el.btnWarpDown.addEventListener('click', () => this.changeWarp(-1));
      this.el.btnWarpUp.addEventListener('click', () => this.changeWarp(1));

      this.el.btnPause.addEventListener('click', () => {
        this.paused = !this.paused;
        this.el.btnPause.textContent = this.paused ? '▶ 继续' : '⏸ 暂停';
        if (this.paused) this.sound.updateEngine(0, 0);
      });

      this.el.btnResetLaunch.addEventListener('click', () => this.launchRocket());
      this.el.btnBackVab.addEventListener('click', () => this.switchMode('vab'));

      this.el.btnZoomIn.addEventListener('click', () => this.adjustZoom(1.25));
      this.el.btnZoomOut.addEventListener('click', () => this.adjustZoom(0.8));

      // Touch / hold steering buttons
      const bindHold = (btn, dir) => {
        const start = (e) => {
          e.preventDefault();
          this.touchSteer = dir;
        };
        const end = () => {
          if (this.touchSteer === dir) this.touchSteer = 0;
        };
        btn.addEventListener('mousedown', start);
        btn.addEventListener('touchstart', start, { passive: false });
        window.addEventListener('mouseup', end);
        window.addEventListener('touchend', end);
      };
      bindHold(this.el.btnSteerLeft, 1);
      bindHold(this.el.btnSteerRight, -1);

      // Mouse wheel zoom on flight canvas
      this.el.flightCanvas.addEventListener(
        'wheel',
        (e) => {
          e.preventDefault();
          this.adjustZoom(e.deltaY < 0 ? 1.15 : 0.87);
        },
        { passive: false }
      );

      // Keyboard controls
      window.addEventListener('keydown', (e) => {
        if (this.mode !== 'flight') return;
        const code = e.code;
        this.keys[code] = true;

        if (code === 'Space') {
          e.preventDefault();
          this.doStage();
        } else if (code === 'KeyM') {
          this.toggleMapView();
        } else if (code === 'KeyT') {
          if (this.vessel) {
            this.vessel.sasEnabled = !this.vessel.sasEnabled;
            this.updateSasUI();
          }
        } else if (code === 'KeyP') {
          this.doParachute();
        } else if (code === 'KeyZ') {
          if (this.vessel) {
            this.vessel.throttle = 1.0;
            this.updateThrottleUI();
          }
        } else if (code === 'KeyX') {
          if (this.vessel) {
            this.vessel.throttle = 0.0;
            this.updateThrottleUI();
          }
        } else if (code === 'Period') {
          this.changeWarp(1);
        } else if (code === 'Comma') {
          this.changeWarp(-1);
        }
      });

      window.addEventListener('keyup', (e) => {
        this.keys[e.code] = false;
      });

      window.addEventListener('resize', () => {
        if (this.mode === 'vab') {
          Renderer.renderVABCanvas(this.el.vabCanvas, Builder.parseRocketStages(this.currentPartIds));
        }
      });
    }

    switchMode(nextMode) {
      this.mode = nextMode;
      this.el.vabView.classList.toggle('hidden', nextMode !== 'vab');
      this.el.flightView.classList.toggle('hidden', nextMode !== 'flight');
      this.el.btnModeVab.classList.toggle('active', nextMode === 'vab');
      this.el.btnModeFlight.classList.toggle('active', nextMode === 'flight');
      if (nextMode === 'vab') {
        this.sound.updateEngine(0, 0);
        this.renderVAB();
      }
    }

    renderVAB() {
      // Categories tabs
      this.el.vabCategories.innerHTML = '';
      CATEGORIES.forEach((cat) => {
        const btn = document.createElement('button');
        btn.className = `cat-btn ${cat.id === this.selectedCategory ? 'active' : ''}`;
        btn.textContent = cat.label;
        btn.addEventListener('click', () => {
          this.selectedCategory = cat.id;
          this.renderVAB();
        });
        this.el.vabCategories.appendChild(btn);
      });

      // Parts palette
      this.el.vabPartsList.innerHTML = '';
      Object.values(PARTS)
        .filter((p) => p.category === this.selectedCategory)
        .forEach((part) => {
          const card = document.createElement('div');
          card.className = 'part-card';
          const specLine = part.isEngine
            ? `推力 ${(part.thrust / 1000).toFixed(0)} kN · Isp ${part.ispAtm}/${part.ispVac}s`
            : part.fuelMass > 0
            ? `干重 ${part.dryMass} kg · 燃料 ${part.fuelMass} kg`
            : `干重 ${part.dryMass} kg`;

          card.innerHTML = `
            <div class="part-title">${part.name}</div>
            <div class="part-spec">${specLine}</div>
            <div class="part-desc">${part.description}</div>
          `;
          card.addEventListener('click', () => {
            this.currentPartIds.push(part.id);
            this.renderVAB();
          });
          this.el.vabPartsList.appendChild(card);
        });

      // Presets
      this.el.vabPresets.innerHTML = '';
      Object.values(PRESETS).forEach((preset) => {
        const btn = document.createElement('button');
        btn.className = 'preset-btn';
        btn.innerHTML = `<div class="preset-name">${preset.name}</div><div class="preset-sub">${preset.subtitle}</div>`;
        btn.addEventListener('click', () => {
          this.currentPartIds = [...preset.parts];
          this.renderVAB();
          this.showToast(`已加载预设火箭：${preset.name}`);
        });
        this.el.vabPresets.appendChild(btn);
      });

      // Blueprint analysis
      const bp = Builder.parseRocketStages(this.currentPartIds);

      // Current stack list (top to bottom) with remove & move controls
      this.el.vabStackList.innerHTML = '';
      bp.parts.forEach((p, idx) => {
        const row = document.createElement('div');
        row.className = 'stack-row';
        row.innerHTML = `
          <span class="stack-idx">#${idx + 1}</span>
          <span class="stack-name">${p.name}</span>
          <span class="stack-actions">
            <button class="mini-btn" data-act="up" title="上移">↑</button>
            <button class="mini-btn" data-act="down" title="下移">↓</button>
            <button class="mini-btn danger" data-act="del" title="移除">✕</button>
          </span>
        `;
        row.querySelector('[data-act="up"]').addEventListener('click', () => {
          if (idx > 0) {
            const tmp = this.currentPartIds[idx - 1];
            this.currentPartIds[idx - 1] = this.currentPartIds[idx];
            this.currentPartIds[idx] = tmp;
            this.renderVAB();
          }
        });
        row.querySelector('[data-act="down"]').addEventListener('click', () => {
          if (idx < this.currentPartIds.length - 1) {
            const tmp = this.currentPartIds[idx + 1];
            this.currentPartIds[idx + 1] = this.currentPartIds[idx];
            this.currentPartIds[idx] = tmp;
            this.renderVAB();
          }
        });
        row.querySelector('[data-act="del"]').addEventListener('click', () => {
          this.currentPartIds.splice(idx, 1);
          this.renderVAB();
        });
        this.el.vabStackList.appendChild(row);
      });

      // Engineer report metrics
      this.el.vabMetrics.innerHTML = `
        <div class="metric-box"><div class="m-label">起飞总重</div><div class="m-val">${(bp.totalWetMass / 1000).toFixed(2)} t</div></div>
        <div class="metric-box"><div class="m-label">总真空 Δv</div><div class="m-val accent">${Math.round(bp.totalDeltaVVac)} m/s</div></div>
        <div class="metric-box"><div class="m-label">起飞推重比</div><div class="m-val ${bp.launchTWR >= 1.2 ? 'good' : 'warn'}">${bp.launchTWR.toFixed(2)}</div></div>
        <div class="metric-box"><div class="m-label">分级数量</div><div class="m-val">${bp.stages.length} 级</div></div>
      `;

      // Stage breakdown
      this.el.vabStages.innerHTML = bp.stages
        .map(
          (st, idx) => `
          <div class="stage-row">
            <span><strong>第 ${idx + 1} 级</strong> (${st.parts.length} 件)</span>
            <span>Δv ${Math.round(st.deltaVVac)} m/s · TWR ${st.twrSeaLevel.toFixed(2)}</span>
          </div>
        `
        )
        .join('');

      // Warnings
      this.el.vabWarnings.innerHTML = bp.warnings.length
        ? bp.warnings.map((w) => `<div class="warn-item">⚠ ${w}</div>`).join('')
        : '<div class="ok-item">✓ 火箭结构完整，满足入轨/发射基础条件</div>';

      this.el.btnLaunch.disabled = bp.parts.length === 0 || !bp.hasEngine;

      // Render visual preview
      Renderer.renderVABCanvas(this.el.vabCanvas, bp);
    }

    launchRocket() {
      const bp = Builder.parseRocketStages(this.currentPartIds);
      if (bp.parts.length === 0 || !bp.hasEngine) {
        this.showToast('请至少安装指令舱、燃料箱和发动机后再发射！');
        return;
      }
      this.vessel = Builder.createFlightVessel(this.currentPartIds);
      this.orbit = Physics.computeOrbitalElements(this.vessel.x, this.vessel.y, this.vessel.vx, this.vessel.vy);
      this.particles = [];
      this.warpIndex = 0;
      this.paused = false;
      this.viewMode = 'flight';
      this.zoom = 1.0;
      this.mapZoom = 1.0;
      this.prevMilestones = { ...this.vessel.milestones };
      this.el.btnPause.textContent = '⏸ 暂停';
      this.el.btnToggleMap.textContent = '🗺 星图视角 (M)';
      this.switchMode('flight');
      this.updateThrottleUI();
      this.updateSasUI();
      this.updateHUD();
      this.showToast('火箭已移至发射台，按 SPACE 点火起飞！');
    }

    doStage() {
      if (!this.vessel || this.paused) return;
      this.sound.init();
      const res = Builder.triggerStage(this.vessel);
      if (res.action === 'ignite' || res.action === 'separate') {
        this.sound.playStage();
        this.showToast(res.message);
        this.updateHUD();
      }
    }

    doParachute() {
      if (!this.vessel || this.paused) return;
      const metrics = Builder.getVesselLiveMetrics(this.vessel);
      if (!metrics.hasParachute) {
        this.showToast('当前火箭未配备降落伞。');
        return;
      }
      const r = Math.sqrt(this.vessel.x * this.vessel.x + this.vessel.y * this.vessel.y);
      const alt = r - PHYSICS.KERBIN.radius;
      if (alt > 25000) {
        this.showToast('高度过高（>25 km），请进入低层大气后再开伞。');
        return;
      }
      if (!this.vessel.parachuteDeployed) {
        this.vessel.parachuteDeployed = true;
        this.sound.playParachute();
        this.vessel.eventLog.unshift({ met: this.vessel.met, text: 'Mk16 降落伞已展开！' });
        this.showToast('降落伞已展开！');
      }
    }

    setSasMode(mode) {
      if (!this.vessel) return;
      this.vessel.sasEnabled = true;
      this.vessel.sasMode = mode;
      this.updateSasUI();
    }

    toggleMapView() {
      this.viewMode = this.viewMode === 'flight' ? 'map' : 'flight';
      this.el.btnToggleMap.textContent =
        this.viewMode === 'map' ? '🚀 飞行视角 (M)' : '🗺 星图视角 (M)';
    }

    changeWarp(delta) {
      if (!this.vessel) return;
      const r = Math.sqrt(this.vessel.x * this.vessel.x + this.vessel.y * this.vessel.y);
      const alt = r - PHYSICS.KERBIN.radius;
      const maxAllowed = alt < PHYSICS.KERBIN.atmosphereHeight ? 1 : WARP_LEVELS.length - 1;
      const next = Math.max(0, Math.min(maxAllowed, this.warpIndex + delta));
      if (delta > 0 && next === this.warpIndex && alt < PHYSICS.KERBIN.atmosphereHeight) {
        this.showToast('大气层内（<70 km）仅支持最高 5x 物理加速');
      }
      this.warpIndex = next;
      this.el.hudWarp.textContent = `${WARP_LEVELS[this.warpIndex]}x`;
    }

    adjustZoom(factor) {
      if (this.viewMode === 'map') {
        this.mapZoom = Math.max(0.08, Math.min(8, this.mapZoom * factor));
      } else {
        this.zoom = Math.max(0.25, Math.min(2.5, this.zoom * factor));
      }
    }

    updateThrottleUI() {
      if (!this.vessel) return;
      const pct = Math.round(this.vessel.throttle * 100);
      this.el.throttleSlider.value = pct;
      this.el.throttleVal.textContent = `${pct}%`;
    }

    updateSasUI() {
      if (!this.vessel) return;
      this.el.btnSasToggle.classList.toggle('active', this.vessel.sasEnabled);
      this.el.btnSasToggle.textContent = this.vessel.sasEnabled ? 'SAS: 开 (T)' : 'SAS: 关 (T)';
      this.el.btnSasHold.classList.toggle('active', this.vessel.sasEnabled && this.vessel.sasMode === 'hold');
      this.el.btnSasPro.classList.toggle('active', this.vessel.sasEnabled && this.vessel.sasMode === 'prograde');
      this.el.btnSasRetro.classList.toggle('active', this.vessel.sasEnabled && this.vessel.sasMode === 'retrograde');
    }

    spawnParticles(dt) {
      if (!this.vessel) return;
      const activeStage = this.vessel.stages[this.vessel.stages.length - 1];
      const isFiring =
        this.vessel.status !== 'prelaunch' &&
        this.vessel.status !== 'crashed' &&
        this.vessel.status !== 'landed' &&
        activeStage &&
        activeStage.ignited &&
        activeStage.hasEngine &&
        activeStage.remainingFuel > 0 &&
        (activeStage.isSolid || this.vessel.throttle > 0.02);

      if (isFiring && this.particles.length < 120) {
        const backX = -Math.cos(this.vessel.angle);
        const backY = -Math.sin(this.vessel.angle);
        const speed = 35 + Math.random() * 45;
        const spread = (Math.random() - 0.5) * 16;
        this.particles.push({
          x: this.vessel.x + backX * 14,
          y: this.vessel.y + backY * 14,
          vx: this.vessel.vx + backX * speed - backY * spread,
          vy: this.vessel.vy + backY * speed + backX * spread,
          life: 1.0,
          size: 4 + Math.random() * 6,
          color: Math.random() > 0.45 ? 'rgba(226, 232, 240, ALPHA)' : 'rgba(255, 167, 38, ALPHA)'
        });
      }

      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt * 1.4;
        if (p.life <= 0) this.particles.splice(i, 1);
      }
    }

    updateHUD() {
      if (!this.vessel || !this.orbit) return;
      const v = this.vessel;
      const r = Math.sqrt(v.x * v.x + v.y * v.y);
      const alt = Math.max(0, r - PHYSICS.KERBIN.radius);
      const speed = Math.sqrt(v.vx * v.vx + v.vy * v.vy);
      const vSpeed = r > 1 ? (v.x * v.vx + v.y * v.vy) / r : 0;

      this.el.hudAlt.textContent = alt >= 10000 ? `${(alt / 1000).toFixed(1)} km` : `${Math.round(alt)} m`;
      this.el.hudVel.textContent = `${speed.toFixed(1)} m/s`;
      this.el.hudVspeed.textContent = `${vSpeed >= 0 ? '+' : ''}${vSpeed.toFixed(1)} m/s`;
      this.el.hudMet.textContent = formatMET(v.met);
      this.el.hudWarp.textContent = `${WARP_LEVELS[this.warpIndex]}x`;

      this.el.hudAp.textContent = this.orbit.isEscape
        ? '逃逸轨道'
        : `${(Math.max(0, this.orbit.apoapsis) / 1000).toFixed(1)} km`;
      this.el.hudPe.textContent = `${(this.orbit.periapsis / 1000).toFixed(1)} km`;
      this.el.hudEcc.textContent = this.orbit.eccentricity.toFixed(3);
      this.el.hudPeriod.textContent = isFinite(this.orbit.period)
        ? `${(this.orbit.period / 60).toFixed(1)} min`
        : '∞';
      this.el.hudGforce.textContent = `${v.gForce.toFixed(2)} G`;
      this.el.hudDynQ.textContent = `${(v.dynamicPressure / 1000).toFixed(1)} kPa`;

      const statusLabels = {
        prelaunch: '发射台待命',
        flying: alt >= PHYSICS.KERBIN.atmosphereHeight ? '太空飞行' : '大气层内飞行',
        orbit: '稳定轨道运行',
        landed: '安全着陆',
        crashed: '任务失事'
      };
      this.el.hudStatusBadge.textContent = statusLabels[v.status] || v.status;
      this.el.hudStatusBadge.className = `status-badge status-${v.status}`;

      // Stages list
      this.el.hudStagesList.innerHTML = v.stages
        .map((st, idx) => {
          const isCurrent = idx === v.stages.length - 1;
          const fuelPct = st.stageFuelMass > 0 ? Math.round((st.remainingFuel / st.stageFuelMass) * 100) : 0;
          return `
            <div class="hud-stage ${isCurrent ? 'current' : ''}">
              <div class="hud-stage-top">
                <span>S${idx + 1} ${st.hasEngine ? (st.ignited ? '🔥' : '⏸') : '🛰'}</span>
                <span>${st.stageFuelMass > 0 ? fuelPct + '%' : '无燃料'}</span>
              </div>
              <div class="fuel-bar"><div class="fuel-fill" style="width:${fuelPct}%"></div></div>
            </div>
          `;
        })
        .reverse()
        .join('');

      // Milestones
      const ms = v.milestones;
      const items = [
        ['liftoff', '离地升空'],
        ['atmosphereCleared', '突破 70 km 卡门线'],
        ['stableOrbit', '进入 Kerbin 稳定轨道'],
        ['munApproach', '抵达高轨 / 穆恩转移'],
        ['safeLanding', '开伞安全着陆']
      ];
      this.el.hudMilestones.innerHTML = items
        .map(
          ([key, label]) =>
            `<div class="ms-item ${ms[key] ? 'done' : ''}">${ms[key] ? '✅' : '⬜'} ${label}</div>`
        )
        .join('');

      // Event log (latest 5)
      this.el.hudEventLog.innerHTML = v.eventLog
        .slice(0, 5)
        .map((e) => `<div class="log-entry"><span>T+${formatMET(e.met)}</span> ${e.text}</div>`)
        .join('');
    }

    startLoop() {
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.lastFrameTime = performance.now();

      const tick = (now) => {
        const realDt = Math.min(0.05, Math.max(0.001, (now - this.lastFrameTime) / 1000));
        this.lastFrameTime = now;

        if (this.mode === 'flight' && this.vessel && !this.paused) {
          // Continuous keyboard throttle & steering
          if (this.keys['ShiftLeft'] || this.keys['ShiftRight'] || this.keys['KeyW']) {
            this.vessel.throttle = Math.min(1, this.vessel.throttle + 0.65 * realDt);
            this.updateThrottleUI();
          }
          if (this.keys['ControlLeft'] || this.keys['ControlRight'] || this.keys['KeyS']) {
            this.vessel.throttle = Math.max(0, this.vessel.throttle - 0.65 * realDt);
            this.updateThrottleUI();
          }

          let steer = this.touchSteer;
          if (this.keys['KeyA'] || this.keys['ArrowLeft']) steer = 1;
          if (this.keys['KeyD'] || this.keys['ArrowRight']) steer = -1;

          // Optional Auto Gravity Turn Assist
          if (this.autoGravityTurn && steer === 0 && this.vessel.status === 'flying') {
            const r = Math.sqrt(this.vessel.x * this.vessel.x + this.vessel.y * this.vessel.y);
            const alt = r - PHYSICS.KERBIN.radius;
            const upAngle = Math.atan2(this.vessel.y, this.vessel.x);
            // Smooth pitch program: vertical until 2 km, gradually pitch east (-PI/2) by 55 km
            const turnFrac = Math.max(0, Math.min(1, (alt - 2000) / 53000));
            const targetAngle = upAngle - (Math.PI / 2) * Math.pow(turnFrac, 0.78);
            let diff = targetAngle - this.vessel.angle;
            while (diff > Math.PI) diff -= 2 * Math.PI;
            while (diff < -Math.PI) diff += 2 * Math.PI;
            steer = Math.max(-1, Math.min(1, diff * 2.5));
          }

          // Restrict warp automatically when entering atmosphere
          const rCur = Math.sqrt(this.vessel.x * this.vessel.x + this.vessel.y * this.vessel.y);
          const altCur = rCur - PHYSICS.KERBIN.radius;
          if (altCur < PHYSICS.KERBIN.atmosphereHeight && this.warpIndex > 1) {
            this.warpIndex = 0;
          }

          const warp = WARP_LEVELS[this.warpIndex];
          const subSteps = warp >= 100 ? 16 : warp >= 20 ? 8 : warp >= 5 ? 4 : 2;
          const simDt = (realDt * warp) / subSteps;

          const prevStatus = this.vessel.status;
          for (let s = 0; s < subSteps; s++) {
            this.orbit = Builder.stepVesselSimulation(this.vessel, simDt, {
              steer: s === 0 ? steer : 0,
              includeMun: true
            });
          }

          if (prevStatus !== 'crashed' && this.vessel.status === 'crashed') {
            this.sound.playExplosion();
            this.sound.updateEngine(0, 0);
            this.showToast('💥 火箭坠毁！点击“重置发射台”重新尝试');
            for (let k = 0; k < 45; k++) {
              const ang = Math.random() * Math.PI * 2;
              const spd = 20 + Math.random() * 140;
              this.particles.push({
                x: this.vessel.x,
                y: this.vessel.y,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd,
                life: 1.0,
                size: 8 + Math.random() * 12,
                color: 'rgba(255, 87, 34, ALPHA)'
              });
            }
          }

          // Check newly unlocked milestones for chime
          for (const k of Object.keys(this.vessel.milestones)) {
            if (this.vessel.milestones[k] && !this.prevMilestones[k]) {
              this.prevMilestones[k] = true;
              this.sound.playMilestone();
            }
          }

          // Engine audio feedback
          const activeStage = this.vessel.stages[this.vessel.stages.length - 1];
          const firingRatio =
            this.vessel.status !== 'prelaunch' &&
            this.vessel.status !== 'crashed' &&
            this.vessel.status !== 'landed' &&
            activeStage &&
            activeStage.ignited &&
            activeStage.hasEngine &&
            activeStage.remainingFuel > 0
              ? activeStage.isSolid
                ? 1
                : this.vessel.throttle
              : 0;
          this.sound.updateEngine(firingRatio, Physics.getAtmosphericPressureRatio(altCur));

          this.spawnParticles(realDt);
          this.updateHUD();
          Renderer.renderFlightCanvas(this.el.flightCanvas, {
            vessel: this.vessel,
            orbit: this.orbit,
            particles: this.particles,
            viewMode: this.viewMode,
            zoom: this.zoom,
            mapZoom: this.mapZoom
          });
          Renderer.renderNavball(this.el.navballCanvas, this.vessel);
        }

        this.rafId = requestAnimationFrame(tick);
      };

      this.rafId = requestAnimationFrame(tick);
    }
  }

  function formatMET(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('load', () => {
      root.KSP = root.KSP || {};
      root.KSP.appInstance = new KSPApp();
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
