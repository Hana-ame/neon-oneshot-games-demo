/**
 * 主控制器：组装 GameEngine、GameRenderer、SoundEngine 并处理 UI 与输入事件
 */

import { MAPS, TOWER_TYPES, TOWER_MAP, MAX_STANDARD_WAVES, describeWave } from './config.js';
import { GameEngine } from './engine.js';
import { SoundEngine } from './audio.js';
import { GameRenderer } from './renderer.js';

const sfx = new SoundEngine();

const els = {
  canvas: document.getElementById('gameCanvas'),
  canvasContainer: document.getElementById('canvasContainer'),
  mapSelect: document.getElementById('mapSelect'),
  bestRecordLabel: document.getElementById('bestRecordLabel'),
  livesVal: document.getElementById('livesVal'),
  goldVal: document.getElementById('goldVal'),
  waveVal: document.getElementById('waveVal'),
  scoreVal: document.getElementById('scoreVal'),
  btnStartWave: document.getElementById('btnStartWave'),
  btnStartWaveIcon: document.getElementById('btnStartWaveIcon'),
  btnStartWaveText: document.getElementById('btnStartWaveText'),
  btnSpeed: document.getElementById('btnSpeed'),
  btnPause: document.getElementById('btnPause'),
  btnAutoWave: document.getElementById('btnAutoWave'),
  autoWaveState: document.getElementById('autoWaveState'),
  btnMute: document.getElementById('btnMute'),
  btnRestart: document.getElementById('btnRestart'),
  waveInfoText: document.getElementById('waveInfoText'),
  enemiesLeftLabel: document.getElementById('enemiesLeftLabel'),
  toastBanner: document.getElementById('toastBanner'),
  pauseOverlay: document.getElementById('pauseOverlay'),
  btnResumeOverlay: document.getElementById('btnResumeOverlay'),
  endModal: document.getElementById('endModal'),
  endIcon: document.getElementById('endIcon'),
  endTitle: document.getElementById('endTitle'),
  endSubtitle: document.getElementById('endSubtitle'),
  endWave: document.getElementById('endWave'),
  endKills: document.getElementById('endKills'),
  endScore: document.getElementById('endScore'),
  btnEndless: document.getElementById('btnEndless'),
  btnPlayAgain: document.getElementById('btnPlayAgain'),
  towerPalette: document.getElementById('towerPalette'),
  btnCancelBuild: document.getElementById('btnCancelBuild'),
  guideView: document.getElementById('guideView'),
  guideMapName: document.getElementById('guideMapName'),
  towerDetailView: document.getElementById('towerDetailView'),
  inspDot: document.getElementById('inspDot'),
  inspName: document.getElementById('inspName'),
  inspLevel: document.getElementById('inspLevel'),
  inspDesc: document.getElementById('inspDesc'),
  inspDmg: document.getElementById('inspDmg'),
  inspRange: document.getElementById('inspRange'),
  inspRate: document.getElementById('inspRate'),
  inspKills: document.getElementById('inspKills'),
  targetModeGroup: document.getElementById('targetModeGroup'),
  btnUpgrade: document.getElementById('btnUpgrade'),
  btnUpgradeLabel: document.getElementById('btnUpgradeLabel'),
  btnUpgradeCost: document.getElementById('btnUpgradeCost'),
  btnSell: document.getElementById('btnSell'),
  btnSellRefund: document.getElementById('btnSellRefund'),
  btnCloseInspector: document.getElementById('btnCloseInspector')
};

function loadBestWave(mapKey) {
  try {
    return parseInt(localStorage.getItem('td_best_wave_' + mapKey) || '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBestWave(mapKey, w) {
  try {
    const prev = loadBestWave(mapKey);
    if (w > prev) localStorage.setItem('td_best_wave_' + mapKey, String(w));
  } catch {
    // ignore storage errors
  }
}

let toastTimer = null;
function showToast(msg) {
  els.toastBanner.textContent = msg;
  els.toastBanner.style.opacity = '1';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toastBanner.style.opacity = '0';
  }, 1800);
}

const engine = new GameEngine({
  onEvent(type, payload) {
    if (type === 'sfx') sfx.play(payload.name);
    else if (type === 'toast') showToast(payload.message);
    else if (type === 'waveCleared') saveBestWave(engine.currentMapKey, payload.wave);
    else if (type === 'inspectorRefresh') renderInspector();
    else if (type === 'stateChanged' || type === 'reset') syncUI();
    else if (type === 'end') showEndModal(payload);
  }
});

const renderer = new GameRenderer(els.canvas, els.canvasContainer, engine);

function showEndModal({ victory, wave, kills, score }) {
  saveBestWave(engine.currentMapKey, wave);
  if (victory) {
    els.endIcon.textContent = '🏆';
    els.endTitle.textContent = '防线守卫成功！';
    els.endSubtitle.textContent = `你成功守住了「${MAPS[engine.currentMapKey].name}」的全部 ${MAX_STANDARD_WAVES} 波进攻！`;
    els.btnEndless.classList.remove('hidden');
  } else {
    els.endIcon.textContent = '💥';
    els.endTitle.textContent = '核心已被摧毁';
    els.endSubtitle.textContent = `防线在第 ${wave} 波失守，调整炮塔组合再来挑战吧！`;
    els.btnEndless.classList.add('hidden');
  }
  els.endWave.textContent = String(wave);
  els.endKills.textContent = String(kills);
  els.endScore.textContent = String(score);
  els.endModal.classList.remove('hidden');
  syncUI();
}

function renderPalette() {
  const state = engine.state;
  els.towerPalette.innerHTML = '';
  TOWER_TYPES.forEach((t) => {
    const canAfford = state.gold >= t.cost;
    const isSelected = state.selectedBuildId === t.id;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `tower-card text-left p-2 rounded-lg border flex items-center lg:justify-between gap-2 cursor-pointer ${
      isSelected ? 'selected' : 'border-slate-800 bg-slate-900/80 hover:border-slate-600'
    } ${!canAfford ? 'opacity-60' : ''}`;
    btn.innerHTML = `
      <div class="flex items-center gap-2 min-w-0">
        <div class="w-7 h-7 rounded-md shrink-0 flex items-center justify-center font-bold text-xs text-slate-950 shadow-inner" style="background:${t.color}">
          ${t.key}
        </div>
        <div class="min-w-0">
          <div class="text-xs font-bold text-slate-100 truncate">${t.name}</div>
          <div class="text-[10px] text-slate-400 truncate">${t.short}</div>
        </div>
      </div>
      <div class="text-xs font-bold tabular-nums shrink-0 ${canAfford ? 'text-amber-300' : 'text-rose-400'}">
        ●${t.cost}
      </div>
    `;
    btn.addEventListener('click', () => {
      sfx.init();
      if (state.gameOver) return;
      if (state.selectedBuildId === t.id) {
        state.selectedBuildId = null;
      } else {
        state.selectedBuildId = t.id;
        state.selectedTower = null;
      }
      syncUI();
    });
    els.towerPalette.appendChild(btn);
  });
  els.btnCancelBuild.classList.toggle('hidden', !state.selectedBuildId);
}

function renderInspector() {
  const state = engine.state;
  const tower = state.selectedTower;
  if (!tower) {
    els.guideView.classList.remove('hidden');
    els.towerDetailView.classList.add('hidden');
    els.guideMapName.textContent = MAPS[engine.currentMapKey].name;
    return;
  }
  els.guideView.classList.add('hidden');
  els.towerDetailView.classList.remove('hidden');

  const def = TOWER_MAP[tower.type];
  const lvlData = def.levels[tower.level];
  els.inspDot.style.background = def.color;
  els.inspName.textContent = def.name;
  els.inspLevel.textContent = `Lv.${tower.level + 1}`;
  els.inspDesc.textContent = def.desc;
  els.inspDmg.textContent = tower.type === 'laser' ? `${lvlData.damage}/秒` : String(lvlData.damage);
  els.inspRange.textContent = String(lvlData.range);
  els.inspRate.textContent = tower.type === 'laser' ? '持续射线' : `${lvlData.fireRate.toFixed(1)}/秒`;
  els.inspKills.textContent = String(tower.kills);

  els.targetModeGroup.querySelectorAll('.target-btn').forEach((b) => {
    const active = b.dataset.mode === tower.targetMode;
    b.className = `target-btn text-[11px] py-1 rounded border cursor-pointer ${
      active
        ? 'border-sky-400 bg-sky-500/25 text-sky-200 font-bold'
        : 'border-slate-700 bg-slate-800/80 text-slate-400 hover:text-slate-200'
    }`;
  });

  const upCost = lvlData.upgradeCost;
  if (upCost > 0) {
    els.btnUpgrade.disabled = state.gold < upCost || state.gameOver;
    els.btnUpgradeLabel.textContent = `升级 Lv.${tower.level + 2}`;
    els.btnUpgradeCost.textContent = `● ${upCost}`;
  } else {
    els.btnUpgrade.disabled = true;
    els.btnUpgradeLabel.textContent = '已达满级';
    els.btnUpgradeCost.textContent = 'MAX';
  }

  els.btnSellRefund.textContent = `+${Math.floor(tower.invested * 0.7)}`;
}

function syncUI() {
  const state = engine.state;
  els.livesVal.textContent = String(Math.max(0, state.lives));
  els.goldVal.textContent = String(state.gold);
  els.scoreVal.textContent = String(state.score);
  els.waveVal.textContent = state.endless
    ? `${state.wave} (无尽)`
    : `${state.wave}/${MAX_STANDARD_WAVES}`;
  els.bestRecordLabel.textContent = `最高波次: ${loadBestWave(engine.currentMapKey)}`;
  els.mapSelect.value = engine.currentMapKey;

  const nextWaveNum = state.wave + 1;
  if (state.gameOver) {
    els.btnStartWave.disabled = true;
    els.btnStartWaveText.textContent = '战斗结束';
  } else if (!state.waveInProgress) {
    els.btnStartWave.disabled = false;
    els.btnStartWaveIcon.textContent = '▶';
    els.btnStartWaveText.textContent = `开始第 ${nextWaveNum} 波`;
    els.btnStartWave.className = 'btn-action bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold px-3 py-1.5 rounded-lg shadow-md shadow-emerald-900/40 flex items-center gap-1 cursor-pointer';
  } else if (state.spawnQueue.length === 0) {
    els.btnStartWave.disabled = false;
    els.btnStartWaveIcon.textContent = '⏩';
    els.btnStartWaveText.textContent = `提前第 ${nextWaveNum} 波 (+15金)`;
    els.btnStartWave.className = 'btn-action bg-amber-600 hover:bg-amber-500 text-white text-xs sm:text-sm font-semibold px-3 py-1.5 rounded-lg shadow-md shadow-amber-900/40 flex items-center gap-1 cursor-pointer';
  } else {
    els.btnStartWave.disabled = true;
    els.btnStartWaveIcon.textContent = '⚔';
    els.btnStartWaveText.textContent = `第 ${state.wave} 波出兵中...`;
    els.btnStartWave.className = 'btn-action bg-slate-700 text-slate-300 text-xs sm:text-sm font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1 cursor-not-allowed';
  }

  const totalRemaining = state.enemies.length + state.spawnQueue.length;
  els.enemiesLeftLabel.innerHTML = `场上敌人: <strong class="text-slate-200">${totalRemaining}</strong>`;

  if (state.wave === 0) {
    els.waveInfoText.textContent = `第 1 波预告：${describeWave(1)}`;
  } else if (state.waveInProgress) {
    els.waveInfoText.textContent = `第 ${state.wave} 波进行中 · 下一波预告：${describeWave(nextWaveNum)}`;
  } else {
    els.waveInfoText.textContent = `第 ${state.wave} 波已清空！下一波预告：${describeWave(nextWaveNum)}`;
  }

  els.btnSpeed.textContent = `${state.speed}x`;
  els.btnSpeed.className = `btn-action border text-xs font-bold px-2.5 py-1.5 rounded-lg cursor-pointer ${
    state.speed > 1
      ? 'bg-sky-600/30 border-sky-400 text-sky-200'
      : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
  }`;

  els.btnPause.textContent = state.paused ? '继续' : '暂停';
  els.pauseOverlay.classList.toggle('hidden', !state.paused || state.gameOver);
  els.autoWaveState.textContent = state.autoWave ? '开' : '关';
  els.autoWaveState.className = state.autoWave ? 'font-bold text-emerald-400' : 'font-bold text-slate-400';
  els.btnMute.textContent = sfx.muted ? '🔇' : '🔊';

  renderPalette();
  renderInspector();
}

// Pointer & Control Bindings
els.canvas.addEventListener('pointermove', (e) => {
  engine.state.hoverCell = renderer.clientToCell(e.clientX, e.clientY);
});

els.canvas.addEventListener('pointerleave', () => {
  engine.state.hoverCell = null;
});

els.canvas.addEventListener('pointerdown', (e) => {
  sfx.init();
  const state = engine.state;
  if (state.gameOver) return;
  const cell = renderer.clientToCell(e.clientX, e.clientY);
  if (!cell) return;
  state.hoverCell = cell;

  const existing = engine.gridTowers[`${cell.c},${cell.r}`];
  if (existing) {
    state.selectedTower = existing;
    state.selectedBuildId = null;
    syncUI();
    return;
  }

  if (state.selectedBuildId) {
    const res = engine.placeTower(cell.c, cell.r, state.selectedBuildId);
    if (!res.ok && res.reason === 'blocked') {
      showToast('此处为敌人通道，无法建造');
    }
  } else {
    state.selectedTower = null;
    syncUI();
  }
});

els.btnStartWave.addEventListener('click', () => {
  sfx.init();
  const state = engine.state;
  if (!state.waveInProgress) engine.startNextWave(false);
  else if (state.spawnQueue.length === 0) engine.startNextWave(true);
});

els.btnSpeed.addEventListener('click', () => {
  sfx.init();
  engine.state.speed = engine.state.speed === 1 ? 2 : 1;
  syncUI();
});

els.btnPause.addEventListener('click', () => {
  sfx.init();
  if (engine.state.gameOver) return;
  engine.state.paused = !engine.state.paused;
  syncUI();
});

els.btnResumeOverlay.addEventListener('click', () => {
  sfx.init();
  engine.state.paused = false;
  syncUI();
});

els.btnAutoWave.addEventListener('click', () => {
  sfx.init();
  const state = engine.state;
  state.autoWave = !state.autoWave;
  if (state.autoWave && !state.waveInProgress && state.wave > 0 && !state.gameOver) {
    state.autoWaveDelay = 0.6;
  }
  syncUI();
});

els.btnMute.addEventListener('click', () => {
  sfx.muted = !sfx.muted;
  syncUI();
});

els.btnRestart.addEventListener('click', () => {
  sfx.init();
  els.endModal.classList.add('hidden');
  engine.reset(engine.currentMapKey);
});

els.mapSelect.addEventListener('change', (e) => {
  sfx.init();
  els.endModal.classList.add('hidden');
  engine.reset(e.target.value);
});

els.btnCancelBuild.addEventListener('click', () => {
  engine.state.selectedBuildId = null;
  syncUI();
});

els.btnCloseInspector.addEventListener('click', () => {
  engine.state.selectedTower = null;
  syncUI();
});

els.btnUpgrade.addEventListener('click', () => {
  sfx.init();
  engine.upgradeTower();
});

els.btnSell.addEventListener('click', () => {
  sfx.init();
  engine.sellTower();
});

els.targetModeGroup.addEventListener('click', (e) => {
  const btn = e.target.closest('.target-btn');
  if (!btn || !engine.state.selectedTower) return;
  engine.state.selectedTower.targetMode = btn.dataset.mode;
  renderInspector();
});

els.btnPlayAgain.addEventListener('click', () => {
  sfx.init();
  els.endModal.classList.add('hidden');
  engine.reset(engine.currentMapKey);
});

els.btnEndless.addEventListener('click', () => {
  sfx.init();
  els.endModal.classList.add('hidden');
  engine.enterEndlessMode();
});

window.addEventListener('keydown', (e) => {
  if (e.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  const state = engine.state;
  if (k >= '1' && k <= '5') {
    const idx = parseInt(k, 10) - 1;
    if (TOWER_TYPES[idx]) {
      state.selectedBuildId = TOWER_TYPES[idx].id;
      state.selectedTower = null;
      syncUI();
    }
  } else if (k === 'escape') {
    state.selectedBuildId = null;
    state.selectedTower = null;
    syncUI();
  } else if (k === ' ') {
    e.preventDefault();
    if (state.gameOver) return;
    if (state.wave === 0) engine.startNextWave(false);
    else {
      state.paused = !state.paused;
      syncUI();
    }
  } else if (k === 'f') {
    state.speed = state.speed === 1 ? 2 : 1;
    syncUI();
  } else if (k === 'u' && state.selectedTower) {
    engine.upgradeTower();
  } else if (k === 's' && state.selectedTower) {
    engine.sellTower();
  }
});

// Main Animation Loop
let animFrameId = null;
let lastFrameTs = 0;
let uiTickAccum = 0;

function loop(ts) {
  if (!lastFrameTs) lastFrameTs = ts;
  const rawDt = Math.min(0.05, (ts - lastFrameTs) / 1000);
  lastFrameTs = ts;

  const state = engine.state;
  if (!state.paused && !state.gameOver) {
    const steps = state.speed;
    for (let s = 0; s < steps; s++) {
      if (!state.paused && !state.gameOver) engine.step(rawDt);
    }
    uiTickAccum += rawDt;
    if (uiTickAccum >= 0.15) {
      uiTickAccum = 0;
      els.goldVal.textContent = String(state.gold);
      els.livesVal.textContent = String(Math.max(0, state.lives));
      els.scoreVal.textContent = String(state.score);
      els.enemiesLeftLabel.innerHTML = `场上敌人: <strong class="text-slate-200">${state.enemies.length + state.spawnQueue.length}</strong>`;
      if (state.waveInProgress && state.spawnQueue.length === 0 && els.btnStartWave.disabled) {
        syncUI();
      }
    }
  }

  renderer.draw();
  animFrameId = requestAnimationFrame(loop);
}

window.addEventListener('resize', () => renderer.resize());
window.addEventListener('load', () => {
  if (animFrameId) cancelAnimationFrame(animFrameId);
  engine.reset('canyon');
  renderer.resize();
  lastFrameTs = 0;
  animFrameId = requestAnimationFrame(loop);
});
