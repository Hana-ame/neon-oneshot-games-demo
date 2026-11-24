#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'src');
const MODULE_ORDER = [
  'config.js',
  'world.js',
  'physics.js',
  'ai.js',
  'missions.js',
  'engine.js',
  'audio.js',
  'renderer.js'
];

function stripNodeUmdBranch(code) {
  return code.replace(
    /if\s*\(typeof module === 'object' && module\.exports\)\s*\{[\s\S]*?\}\s*else\s*\{([\s\S]*?)\}/,
    '$1'
  );
}

const bundledModules = MODULE_ORDER.map(file => {
  const raw = fs.readFileSync(path.join(SRC_DIR, file), 'utf8');
  const content = stripNodeUmdBranch(raw);
  return `// ===== ${file} =====\n${content}`;
}).join('\n\n');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>NEON VICE — 网页版 GTA 霓虹罪恶都市</title>
  <style>
    :root {
      --bg: #0b0e17;
      --panel: rgba(13, 18, 30, 0.84);
      --border: rgba(0, 240, 255, 0.28);
      --cyan: #00f0ff;
      --pink: #ff2e93;
      --green: #39ff14;
      --gold: #ffe600;
      --danger: #ff2e63;
      --text: #f1f5f9;
      --muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; user-select: none; -webkit-user-select: none; }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: var(--bg);
      color: var(--text);
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    #app {
      position: relative;
      width: 100%;
      height: 100dvh;
      overflow: hidden;
    }
    #gameCanvas {
      display: block;
      width: 100%;
      height: 100%;
      cursor: crosshair;
      touch-action: none;
    }
    .hud-layer {
      position: absolute;
      inset: 0;
      pointer-events: none;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 12px;
      gap: 8px;
    }
    .hud-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 10px;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
      pointer-events: auto;
    }
    .left-cluster {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .minimap-wrap {
      padding: 6px;
      width: 152px;
    }
    #minimapCanvas {
      display: block;
      width: 138px;
      height: 138px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      background: #090d16;
    }
    .district-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 5px;
      font-size: 11px;
      color: var(--cyan);
      font-weight: 700;
      letter-spacing: 0.3px;
    }
    .speed-card {
      padding: 7px 10px;
      font-size: 12px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .speed-line {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 8px;
    }
    .speed-val {
      font-size: 18px;
      font-weight: 800;
      color: var(--gold);
      font-variant-numeric: tabular-nums;
    }
    .mission-bar {
      padding: 8px 14px;
      max-width: 420px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }
    .mission-title {
      font-size: 13px;
      font-weight: 800;
      color: var(--gold);
      letter-spacing: 0.4px;
    }
    .mission-sub {
      font-size: 11px;
      color: var(--text);
      opacity: 0.9;
    }
    .right-cluster {
      padding: 10px 12px;
      min-width: 196px;
      display: flex;
      flex-direction: column;
      gap: 7px;
    }
    .stars-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    .stars {
      font-size: 17px;
      letter-spacing: 2px;
      color: rgba(255, 255, 255, 0.18);
    }
    .stars .lit {
      color: var(--gold);
      text-shadow: 0 0 8px rgba(255, 46, 99, 0.9);
    }
    .cash {
      font-size: 18px;
      font-weight: 800;
      color: var(--green);
      font-variant-numeric: tabular-nums;
    }
    .bar-row {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: var(--muted);
    }
    .bar-track {
      flex: 1;
      height: 7px;
      background: rgba(255, 255, 255, 0.12);
      border-radius: 99px;
      overflow: hidden;
    }
    .bar-fill {
      height: 100%;
      border-radius: 99px;
      transition: width 0.12s ease;
    }
    .hp-fill { background: linear-gradient(90deg, #16a34a, #39ff14); }
    .armor-fill { background: linear-gradient(90deg, #0284c7, #00f0ff); }
    .car-fill { background: linear-gradient(90deg, #f59e0b, #ffe600); }
    .weapon-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      padding-top: 4px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }
    .weapon-name { font-weight: 700; color: var(--cyan); }
    .ammo-val { font-weight: 700; color: var(--gold); font-variant-numeric: tabular-nums; }
    .radio-pill {
      font-size: 11px;
      color: var(--pink);
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 180px;
    }
    .hud-bottom {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 10px;
      flex-wrap: wrap;
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 6px;
    }
    .btn {
      pointer-events: auto;
      appearance: none;
      border: 1px solid rgba(255, 255, 255, 0.18);
      background: rgba(20, 28, 46, 0.9);
      color: var(--text);
      font-size: 12px;
      font-weight: 600;
      padding: 6px 10px;
      border-radius: 8px;
      cursor: pointer;
      transition: transform 0.08s ease, border-color 0.15s ease, background 0.15s ease;
    }
    .btn:hover { border-color: var(--cyan); background: rgba(0, 240, 255, 0.16); }
    .btn:active { transform: scale(0.96); }
    .btn-primary {
      border-color: var(--pink);
      background: linear-gradient(135deg, rgba(255, 46, 147, 0.35), rgba(0, 240, 255, 0.2));
    }
    .btn-gold {
      border-color: var(--gold);
      color: var(--gold);
    }
    .touch-controls {
      display: none;
      pointer-events: auto;
      gap: 8px;
      align-items: center;
    }
    .touch-controls.visible { display: flex; }
    .dpad {
      display: grid;
      grid-template-columns: repeat(3, 42px);
      grid-template-rows: repeat(2, 42px);
      gap: 4px;
    }
    .pad-btn {
      border: 1px solid rgba(0, 240, 255, 0.4);
      background: rgba(13, 18, 30, 0.85);
      color: var(--text);
      border-radius: 10px;
      font-size: 15px;
      font-weight: 800;
      cursor: pointer;
      touch-action: none;
    }
    .pad-btn:active { background: rgba(0, 240, 255, 0.35); }
    .action-pads {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .banner-overlay {
      position: absolute;
      top: 22%;
      left: 50%;
      transform: translateX(-50%);
      text-align: center;
      pointer-events: none;
      padding: 14px 28px;
      border-radius: 14px;
      background: rgba(10, 14, 24, 0.88);
      border: 2px solid var(--cyan);
      box-shadow: 0 0 32px rgba(0, 240, 255, 0.35);
      opacity: 0;
      transition: opacity 0.2s ease;
      max-width: 90%;
    }
    .banner-overlay.show { opacity: 1; }
    .banner-title { font-size: 26px; font-weight: 900; letter-spacing: 1.5px; }
    .banner-sub { font-size: 13px; color: var(--text); margin-top: 4px; }
    .toast-stack {
      position: absolute;
      bottom: 72px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      gap: 6px;
      pointer-events: none;
      align-items: center;
    }
    .toast {
      background: rgba(13, 18, 30, 0.9);
      border: 1px solid rgba(255, 255, 255, 0.16);
      padding: 6px 14px;
      border-radius: 99px;
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
    }
    .modal-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(5, 8, 15, 0.78);
      backdrop-filter: blur(6px);
      display: none;
      align-items: center;
      justify-content: center;
      padding: 16px;
      z-index: 30;
    }
    .modal-backdrop.open { display: flex; }
    .modal-box {
      width: 100%;
      max-width: 520px;
      max-height: 86dvh;
      overflow-y: auto;
      background: #111827;
      border: 1px solid var(--cyan);
      border-radius: 16px;
      padding: 18px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.65);
    }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .modal-header h2 { font-size: 18px; color: var(--cyan); }
    .mission-item {
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      padding: 10px 12px;
      margin-bottom: 8px;
      background: rgba(255, 255, 255, 0.03);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }
    .mission-item h3 { font-size: 14px; color: var(--text); }
    .mission-item p { font-size: 12px; color: var(--muted); margin-top: 2px; }
    .key-grid {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 8px 14px;
      font-size: 13px;
      align-items: center;
    }
    kbd {
      background: #1e293b;
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 6px;
      padding: 3px 7px;
      font-size: 12px;
      font-weight: 700;
      color: var(--cyan);
      text-align: center;
    }
    @media (max-width: 720px) {
      .minimap-wrap { width: 112px; padding: 4px; }
      #minimapCanvas { width: 102px; height: 102px; }
      .right-cluster { min-width: 158px; padding: 8px; }
      .mission-bar { display: none; }
      .touch-controls { display: flex; }
    }
  </style>
</head>
<body>
  <div id="app">
    <canvas id="gameCanvas"></canvas>

    <div class="hud-layer">
      <div class="hud-top">
        <div class="left-cluster">
          <div class="card minimap-wrap">
            <canvas id="minimapCanvas" width="144" height="144"></canvas>
            <div class="district-row">
              <span id="districtName">霓虹市中心</span>
              <span id="missionCount">0/5</span>
            </div>
          </div>
          <div class="card speed-card">
            <div class="speed-line">
              <span id="vehicleName" style="color:#94a3b8">步行状态</span>
              <span><span id="speedVal" class="speed-val">0</span> <small>KM/H</small></span>
            </div>
            <div class="bar-row" id="carHpRow" style="display:none">
              <span>车况</span>
              <div class="bar-track"><div id="carHpBar" class="bar-fill car-fill" style="width:100%"></div></div>
            </div>
          </div>
        </div>

        <div class="card mission-bar">
          <div id="missionTitle" class="mission-title">自由探索模式</div>
          <div id="missionSub" class="mission-sub">按 M 接取街头任务，按 E 抢夺/驾驶附近车辆</div>
          <button id="quickMissionBtn" class="btn btn-gold" style="margin-top:2px;padding:3px 10px;font-size:11px">接取下一任务 (M)</button>
        </div>

        <div class="card right-cluster">
          <div class="stars-row">
            <div id="wantedStars" class="stars">★★★★★</div>
            <div id="cashVal" class="cash">$500</div>
          </div>
          <div class="bar-row">
            <span>生命</span>
            <div class="bar-track"><div id="hpBar" class="bar-fill hp-fill" style="width:100%"></div></div>
          </div>
          <div class="bar-row">
            <span>护甲</span>
            <div class="bar-track"><div id="armorBar" class="bar-fill armor-fill" style="width:50%"></div></div>
          </div>
          <div class="weapon-row">
            <span id="weaponName" class="weapon-name">9mm 战术手枪</span>
            <span id="ammoVal" class="ammo-val">48</span>
          </div>
          <div id="radioName" class="radio-pill">📻 VICE FM 98.3</div>
        </div>
      </div>

      <div class="hud-bottom">
        <div class="card toolbar">
          <button id="btnMission" class="btn btn-primary">任务 (M)</button>
          <button id="btnVehicle" class="btn">上/下车 (E)</button>
          <button id="btnWeapon" class="btn">换枪 (Q)</button>
          <button id="btnRadio" class="btn">电台 (R)</button>
          <button id="btnMute" class="btn">音效: 开</button>
          <button id="btnTouch" class="btn">触控键</button>
          <button id="btnPause" class="btn">暂停 (P)</button>
          <button id="btnHelp" class="btn">指南 (?)</button>
        </div>

        <div id="touchControls" class="touch-controls">
          <div class="dpad">
            <div></div>
            <button class="pad-btn" data-key="up">▲</button>
            <div></div>
            <button class="pad-btn" data-key="left">◀</button>
            <button class="pad-btn" data-key="down">▼</button>
            <button class="pad-btn" data-key="right">▶</button>
          </div>
          <div class="action-pads">
            <button class="pad-btn" style="padding:8px 12px;font-size:12px" data-key="fire">开火</button>
            <button class="pad-btn" style="padding:8px 12px;font-size:12px" data-key="handbrake">漂移</button>
          </div>
        </div>
      </div>
    </div>

    <div id="bannerOverlay" class="banner-overlay">
      <div id="bannerTitle" class="banner-title"></div>
      <div id="bannerSub" class="banner-sub"></div>
    </div>
    <div id="toastStack" class="toast-stack"></div>

    <div id="missionModal" class="modal-backdrop">
      <div class="modal-box">
        <div class="modal-header">
          <h2>霓虹都市任务面板</h2>
          <button id="closeMissionModal" class="btn">关闭</button>
        </div>
        <div id="missionList"></div>
      </div>
    </div>

    <div id="helpModal" class="modal-backdrop">
      <div class="modal-box">
        <div class="modal-header">
          <h2>NEON VICE 操作指南</h2>
          <button id="closeHelpModal" class="btn">关闭</button>
        </div>
        <div class="key-grid">
          <kbd>W A S D / 方向键</kbd><div>步行移动 / 驾驶加速、刹车、转向</div>
          <kbd>E / F</kbd><div>上车 / 抢车 / 下车</div>
          <kbd>鼠标左键</kbd><div>瞄准并射击（支持车内扫射）</div>
          <kbd>Space</kbd><div>驾驶手刹漂移 / 步行开火</div>
          <kbd>Shift</kbd><div>步行冲刺</div>
          <kbd>1 - 4 / Q</kbd><div>切换武器（格斗 / 手枪 / 冲锋枪 / 霰弹枪）</div>
          <kbd>M</kbd><div>打开任务面板</div>
          <kbd>R</kbd><div>切换车载电台频道</div>
          <kbd>P</kbd><div>暂停 / 恢复游戏</div>
        </div>
        <div style="margin-top:14px;display:flex;justify-content:flex-end;gap:8px">
          <button id="restartGameBtn" class="btn btn-primary">重置存档并重新开始</button>
        </div>
      </div>
    </div>
  </div>

  <script>
${bundledModules}

// ===== Browser Bootstrap & HUD Controller =====
(function () {
  'use strict';

  let engine = null;
  let renderer = null;
  let audio = null;
  let rafId = null;
  let lastTs = 0;

  const keys = {
    up: false, down: false, left: false, right: false,
    handbrake: false, sprint: false, fire: false
  };
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;

  const $ = id => document.getElementById(id);

  function saveHighScore(cash) {
    try {
      const prev = Number(localStorage.getItem('neon_vice_best_cash') || 0);
      if (cash > prev) localStorage.setItem('neon_vice_best_cash', String(cash));
    } catch (_) {}
  }

  function unlockAudioOnce() {
    if (audio) audio.unlock();
  }

  function renderMissionModal() {
    const list = $('missionList');
    list.innerHTML = '';
    const activeId = engine.missions.active ? engine.missions.active.id : null;
    engine.missions.catalog.forEach((m, idx) => {
      const done = engine.missions.completedIds.has(m.id);
      const isActive = activeId === m.id;
      const row = document.createElement('div');
      row.className = 'mission-item';
      row.innerHTML =
        '<div>' +
          '<h3>' + (idx + 1) + '. ' + m.title + (done ? ' <span style="color:#39ff14">✓ 已完成</span>' : '') + '</h3>' +
          '<p>' + m.subtitle + ' · 奖励 <strong style="color:#ffe600">$' + m.reward + '</strong> · 限时 ' + m.timeLimit + 's</p>' +
        '</div>' +
        '<button class="btn ' + (isActive ? 'btn-gold' : 'btn-primary') + '" data-mid="' + m.id + '">' +
          (isActive ? '放弃任务' : '接取') +
        '</button>';
      list.appendChild(row);
    });

    list.querySelectorAll('button[data-mid]').forEach(btn => {
      btn.addEventListener('click', () => {
        unlockAudioOnce();
        const mid = btn.getAttribute('data-mid');
        if (engine.missions.active && engine.missions.active.id === mid) {
          engine.missions.abandonMission(engine);
        } else {
          engine.missions.startMission(mid, engine);
        }
        $('missionModal').classList.remove('open');
        engine.paused = false;
      });
    });
  }

  function toggleModal(modalId) {
    const el = $(modalId);
    const willOpen = !el.classList.contains('open');
    $('missionModal').classList.remove('open');
    $('helpModal').classList.remove('open');
    if (willOpen) {
      if (modalId === 'missionModal') renderMissionModal();
      el.classList.add('open');
      engine.paused = true;
    } else {
      engine.paused = false;
    }
  }

  function updateHUD() {
    const pos = engine.getPlayerPosition();
    const district = engine.world.getDistrictAt(pos.x, pos.y);
    $('districtName').textContent = district.name;
    $('missionCount').textContent = engine.missions.completedIds.size + '/' + engine.missions.catalog.length;

    const car = engine.player.vehicle;
    if (car) {
      $('vehicleName').textContent = car.spec.name;
      $('vehicleName').style.color = '#00f0ff';
      $('speedVal').textContent = String(Math.round(car.speed * 0.36));
      $('carHpRow').style.display = 'flex';
      $('carHpBar').style.width = Math.max(0, Math.round((car.hp / car.maxHp) * 100)) + '%';
    } else {
      $('vehicleName').textContent = '步行状态';
      $('vehicleName').style.color = '#94a3b8';
      $('speedVal').textContent = String(Math.round(Math.hypot(engine.player.vx, engine.player.vy) * 0.14));
      $('carHpRow').style.display = 'none';
    }

    let starsHtml = '';
    for (let i = 1; i <= 5; i++) {
      starsHtml += i <= engine.wantedStars ? '<span class="lit">★</span>' : '★';
    }
    $('wantedStars').innerHTML = starsHtml;
    $('cashVal').textContent = '$' + engine.player.cash;
    $('hpBar').style.width = Math.max(0, Math.round((engine.player.hp / engine.player.maxHp) * 100)) + '%';
    $('armorBar').style.width = Math.max(0, Math.round((engine.player.armor / engine.player.maxArmor) * 100)) + '%';

    const w = engine.getCurrentWeapon();
    $('weaponName').textContent = w.name;
    $('ammoVal').textContent = w.melee ? '∞' : String(engine.player.ammo[w.id]);

    const station = window.GTAConfig.RADIO_STATIONS[engine.radioIndex];
    $('radioName').textContent = '📻 ' + station.name;

    const m = engine.missions.active;
    if (m) {
      const wp = engine.missions.getCurrentWaypoint();
      const distTxt = wp ? ' · 距离 ' + Math.round(window.GTAPhysics.dist(pos.x, pos.y, wp.x, wp.y) / 10) + 'm' : '';
      $('missionTitle').textContent = m.title + ' (' + Math.ceil(m.timeLeft) + 's)';
      $('missionSub').textContent = wp ? ('目标：' + wp.label + distTxt) : m.subtitle;
      $('quickMissionBtn').textContent = '查看任务面板 (M)';
    } else {
      $('missionTitle').textContent = '自由探索模式';
      $('missionSub').textContent = '按 M 接取任务，按 E 抢夺/驾驶附近载具';
      $('quickMissionBtn').textContent = '接取下一任务 (M)';
    }

    const bannerEl = $('bannerOverlay');
    if (engine.banner) {
      $('bannerTitle').textContent = engine.banner.title;
      $('bannerTitle').style.color = engine.banner.color;
      $('bannerSub').textContent = engine.banner.subtitle;
      bannerEl.style.borderColor = engine.banner.color;
      bannerEl.classList.add('show');
    } else {
      bannerEl.classList.remove('show');
    }

    const stack = $('toastStack');
    stack.innerHTML = engine.toasts.map(t =>
      '<div class="toast" style="color:' + t.color + '">' + t.text + '</div>'
    ).join('');

    saveHighScore(engine.player.cash);
  }

  function computeAimAngle() {
    const canvas = $('gameCanvas');
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const worldMouseX = renderer.camX + (mouseX - cx) / renderer.camZoom;
    const worldMouseY = renderer.camY + (mouseY - cy) / renderer.camZoom;
    const pos = engine.getPlayerPosition();
    return Math.atan2(worldMouseY - pos.y, worldMouseX - pos.x);
  }

  function loop(ts) {
    const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016;
    lastTs = ts;

    const aimAngle = (mouseX || mouseY) ? computeAimAngle() : engine.player.angle;
    const firing = mouseDown || keys.fire || (!engine.player.vehicle && keys.handbrake);

    engine.step(dt, {
      up: keys.up,
      down: keys.down,
      left: keys.left,
      right: keys.right,
      handbrake: keys.handbrake,
      sprint: keys.sprint,
      fire: firing,
      aimAngle
    });

    if (audio) {
      audio.updateEngine(
        engine.player.vehicle ? engine.player.vehicle.speed : 0,
        !!engine.player.vehicle && !engine.paused && engine.player.state === 'alive'
      );
    }

    renderer.render(engine);
    updateHUD();
    rafId = window.requestAnimationFrame(loop);
  }

  function initGame() {
    if (rafId) window.cancelAnimationFrame(rafId);
    audio = audio || new window.GTAAudio.SoundSynth();
    engine = new window.GTAEngine.GameEngine({
      seed: 2026,
      onSound: (name, payload) => audio.play(name, payload)
    });
    renderer = new window.GTARenderer.GameRenderer($('gameCanvas'), $('minimapCanvas'));
    renderer.resize();
    engine.pushBanner('NEON VICE 霓虹都市', '按 E 驾驶身边跑车，按 M 接取首个街头任务', '#00f0ff');
    lastTs = 0;
    rafId = window.requestAnimationFrame(loop);
  }

  function bindEvents() {
    window.addEventListener('resize', () => {
      if (renderer) {
        renderer.resize();
        renderer.render(engine);
      }
    });

    const keyMap = {
      KeyW: 'up', ArrowUp: 'up',
      KeyS: 'down', ArrowDown: 'down',
      KeyA: 'left', ArrowLeft: 'left',
      KeyD: 'right', ArrowRight: 'right',
      Space: 'handbrake',
      ShiftLeft: 'sprint', ShiftRight: 'sprint'
    };

    window.addEventListener('keydown', e => {
      unlockAudioOnce();
      if (keyMap[e.code]) {
        keys[keyMap[e.code]] = true;
        if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      } else if (e.code === 'KeyE' || e.code === 'KeyF') {
        engine.toggleVehicleEntry();
      } else if (e.code === 'KeyQ') {
        engine.selectWeapon(engine.player.weaponIndex + 1);
      } else if (e.code === 'Digit1') {
        engine.selectWeapon(0);
      } else if (e.code === 'Digit2') {
        engine.selectWeapon(1);
      } else if (e.code === 'Digit3') {
        engine.selectWeapon(2);
      } else if (e.code === 'Digit4') {
        engine.selectWeapon(3);
      } else if (e.code === 'KeyR') {
        engine.cycleRadio();
      } else if (e.code === 'KeyM') {
        toggleModal('missionModal');
      } else if (e.code === 'KeyP' || e.code === 'Escape') {
        if ($('missionModal').classList.contains('open') || $('helpModal').classList.contains('open')) {
          $('missionModal').classList.remove('open');
          $('helpModal').classList.remove('open');
          engine.paused = false;
        } else {
          engine.paused = !engine.paused;
          $('btnPause').textContent = engine.paused ? '继续 (P)' : '暂停 (P)';
        }
      }
    });

    window.addEventListener('keyup', e => {
      if (keyMap[e.code]) keys[keyMap[e.code]] = false;
    });

    const canvas = $('gameCanvas');
    canvas.addEventListener('pointermove', e => {
      const rect = canvas.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
    });
    canvas.addEventListener('pointerdown', e => {
      unlockAudioOnce();
      if (e.button === 0) {
        const rect = canvas.getBoundingClientRect();
        mouseX = e.clientX - rect.left;
        mouseY = e.clientY - rect.top;
        mouseDown = true;
      }
    });
    window.addEventListener('pointerup', () => { mouseDown = false; });

    $('btnMission').addEventListener('click', () => { unlockAudioOnce(); toggleModal('missionModal'); });
    $('quickMissionBtn').addEventListener('click', () => {
      unlockAudioOnce();
      if (!engine.missions.active) {
        engine.missions.startMission(engine.missions.nextIndex, engine);
      } else {
        toggleModal('missionModal');
      }
    });
    $('btnVehicle').addEventListener('click', () => { unlockAudioOnce(); engine.toggleVehicleEntry(); });
    $('btnWeapon').addEventListener('click', () => { unlockAudioOnce(); engine.selectWeapon(engine.player.weaponIndex + 1); });
    $('btnRadio').addEventListener('click', () => { unlockAudioOnce(); engine.cycleRadio(); });
    $('btnMute').addEventListener('click', () => {
      unlockAudioOnce();
      audio.setMuted(!audio.muted);
      $('btnMute').textContent = audio.muted ? '音效: 关' : '音效: 开';
    });
    $('btnTouch').addEventListener('click', () => {
      $('touchControls').classList.toggle('visible');
    });
    $('btnPause').addEventListener('click', () => {
      engine.paused = !engine.paused;
      $('btnPause').textContent = engine.paused ? '继续 (P)' : '暂停 (P)';
    });
    $('btnHelp').addEventListener('click', () => { unlockAudioOnce(); toggleModal('helpModal'); });
    $('closeMissionModal').addEventListener('click', () => { $('missionModal').classList.remove('open'); engine.paused = false; });
    $('closeHelpModal').addEventListener('click', () => { $('helpModal').classList.remove('open'); engine.paused = false; });
    $('restartGameBtn').addEventListener('click', () => {
      $('helpModal').classList.remove('open');
      initGame();
    });

    document.querySelectorAll('.pad-btn[data-key]').forEach(btn => {
      const k = btn.getAttribute('data-key');
      const down = e => { e.preventDefault(); unlockAudioOnce(); keys[k] = true; };
      const up = e => { e.preventDefault(); keys[k] = false; };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointerleave', up);
      btn.addEventListener('pointercancel', up);
    });
  }

  window.onload = function () {
    bindEvents();
    initGame();
  };
})();
  </script>
</body>
</html>
`;

const outLocal = path.join(ROOT, 'index.html');
fs.writeFileSync(outLocal, html, 'utf8');

const deliverablePath = path.resolve(ROOT, '../../output/web-gta-neon-vice.html');
fs.mkdirSync(path.dirname(deliverablePath), { recursive: true });
fs.writeFileSync(deliverablePath, html, 'utf8');

console.log('Built single-file HTML successfully:');
console.log(' - ' + outLocal + ' (' + html.length + ' bytes)');
console.log(' - ' + deliverablePath + ' (' + html.length + ' bytes)');
