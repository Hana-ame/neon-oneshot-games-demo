import { GAME_STATE, CANVAS_WIDTH, CANVAS_HEIGHT } from './constants.js';
import { STAGES } from './maps.js';
import { SoundEngine } from './audio.js';
import { BattleCityEngine } from './engine.js';
import { BattleCityRenderer } from './renderer.js';

const HIGH_SCORE_KEY = 'fc_battle_city_highscore_v1';

function loadHighScore() {
  try {
    const raw = window.localStorage.getItem(HIGH_SCORE_KEY);
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 20000;
  } catch {
    return 20000;
  }
}

function saveHighScore(score) {
  try {
    window.localStorage.setItem(HIGH_SCORE_KEY, String(score));
  } catch {
    // Ignore storage quota or sandbox restrictions
  }
}

let rafId = null;
let lastTime = 0;
let engine = null;
let renderer = null;
let sound = null;
let lastSavedHigh = 0;

function updateScoreReadout() {
  const scoreEl = document.getElementById('hud-score');
  const highEl = document.getElementById('hud-highscore');
  const stageEl = document.getElementById('hud-stage');
  const pauseBtn = document.getElementById('btn-pause');

  if (scoreEl) scoreEl.textContent = String(engine.getTotalScore()).padStart(6, '0');
  if (highEl) highEl.textContent = String(engine.highScore).padStart(6, '0');
  if (stageEl) stageEl.textContent = `STAGE ${engine.stageNumber}`;

  if (engine.highScore > lastSavedHigh) {
    lastSavedHigh = engine.highScore;
    saveHighScore(lastSavedHigh);
  }

  if (pauseBtn) {
    pauseBtn.textContent = engine.state === GAME_STATE.PAUSED ? '继续 (P)' : '暂停 (P)';
  }
}

function resizeCanvas() {
  const canvas = document.getElementById('game-canvas');
  const wrap = document.querySelector('.stage-wrap');
  if (!canvas || !wrap) return;
  const maxWidth = Math.min(640, Math.max(260, wrap.clientWidth - 16));
  const aspect = CANVAS_HEIGHT / CANVAS_WIDTH;
  canvas.style.width = `${Math.floor(maxWidth)}px`;
  canvas.style.height = `${Math.floor(maxWidth * aspect)}px`;
  if (renderer && engine) {
    renderer.render(engine);
  }
}

function startLoop() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
  }
  lastTime = performance.now();
  const frame = (now) => {
    const dt = (now - lastTime) / 1000;
    lastTime = now;
    engine.update(dt);
    renderer.render(engine);
    updateScoreReadout();
    rafId = requestAnimationFrame(frame);
  };
  rafId = requestAnimationFrame(frame);
}

function syncModeButtons() {
  const btn1p = document.getElementById('btn-1p');
  const btn2p = document.getElementById('btn-2p');
  if (btn1p) btn1p.classList.toggle('btn-active', engine.playerCount === 1);
  if (btn2p) btn2p.classList.toggle('btn-active', engine.playerCount === 2);
}

function bindUI() {
  const btnStart = document.getElementById('btn-start');
  const btn1p = document.getElementById('btn-1p');
  const btn2p = document.getElementById('btn-2p');
  const stageSelect = document.getElementById('stage-select');
  const btnPause = document.getElementById('btn-pause');
  const btnMute = document.getElementById('btn-mute');
  const btnMenu = document.getElementById('btn-menu');

  if (stageSelect) {
    stageSelect.innerHTML = '';
    for (const s of STAGES) {
      const opt = document.createElement('option');
      opt.value = String(s.id);
      opt.textContent = `第 ${s.id} 关 · ${s.name}`;
      stageSelect.appendChild(opt);
    }
    stageSelect.value = String(engine.selectedStage);
    stageSelect.addEventListener('change', () => {
      sound.unlock();
      const val = parseInt(stageSelect.value, 10) || 1;
      engine.selectedStage = val;
      engine.stageName = STAGES[(val - 1) % STAGES.length].name;
      if (engine.state !== GAME_STATE.MENU) {
        engine.startNewGame({ playerCount: engine.playerCount, startStage: val });
      }
      renderer.render(engine);
    });
  }

  if (btn1p) {
    btn1p.addEventListener('click', () => {
      sound.unlock();
      engine.playerCount = 1;
      syncModeButtons();
      renderer.render(engine);
    });
  }

  if (btn2p) {
    btn2p.addEventListener('click', () => {
      sound.unlock();
      engine.playerCount = 2;
      syncModeButtons();
      renderer.render(engine);
    });
  }

  if (btnStart) {
    btnStart.addEventListener('click', () => {
      sound.unlock();
      const stageVal = stageSelect ? parseInt(stageSelect.value, 10) || 1 : engine.selectedStage;
      engine.startNewGame({ playerCount: engine.playerCount, startStage: stageVal });
    });
  }

  if (btnPause) {
    btnPause.addEventListener('click', () => {
      sound.unlock();
      engine.togglePause();
      updateScoreReadout();
    });
  }

  if (btnMute) {
    btnMute.addEventListener('click', () => {
      sound.unlock();
      const muted = sound.toggleMute();
      btnMute.textContent = muted ? '音效: 关' : '音效: 开';
      btnMute.classList.toggle('btn-active', !muted);
    });
  }

  if (btnMenu) {
    btnMenu.addEventListener('click', () => {
      sound.unlock();
      engine.returnToMenu();
      renderer.render(engine);
    });
  }

  // Touch & mouse virtual gamepad controls (controls P1)
  const touchButtons = document.querySelectorAll('[data-action]');
  touchButtons.forEach((btn) => {
    const action = btn.getAttribute('data-action');
    const press = (e) => {
      e.preventDefault();
      sound.unlock();
      btn.classList.add('pressed');
      if (engine.state === GAME_STATE.MENU && action === 'fire') {
        engine.startNewGame({ playerCount: engine.playerCount, startStage: engine.selectedStage });
        return;
      }
      if (engine.state === GAME_STATE.PLAYING) {
        engine.setInput(0, action, true);
      }
    };
    const release = (e) => {
      e.preventDefault();
      btn.classList.remove('pressed');
      engine.setInput(0, action, false);
    };
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointerleave', release);
    btn.addEventListener('pointercancel', release);
  });
}

function bindKeyboard() {
  const handleKey = (e, pressed) => {
    const code = e.code;
    const isGameKey = [
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
      'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyJ', 'KeyK', 'KeyZ', 'Enter', 'KeyP', 'KeyM',
    ].includes(code);

    if (isGameKey) {
      e.preventDefault();
    }

    if (pressed) {
      sound.unlock();
      if (code === 'KeyP') {
        engine.togglePause();
        updateScoreReadout();
        return;
      }
      if (code === 'KeyM') {
        const muted = sound.toggleMute();
        const btnMute = document.getElementById('btn-mute');
        if (btnMute) {
          btnMute.textContent = muted ? '音效: 关' : '音效: 开';
          btnMute.classList.toggle('btn-active', !muted);
        }
        return;
      }
      if (engine.state === GAME_STATE.MENU) {
        if (code === 'ArrowUp' || code === 'KeyW') {
          engine.playerCount = 1;
          syncModeButtons();
          return;
        }
        if (code === 'ArrowDown' || code === 'KeyS') {
          engine.playerCount = 2;
          syncModeButtons();
          return;
        }
        if (code === 'Enter' || code === 'Space') {
          engine.startNewGame({ playerCount: engine.playerCount, startStage: engine.selectedStage });
          return;
        }
      }
      if (engine.state === GAME_STATE.GAME_OVER && code === 'Enter') {
        engine.startNewGame({ playerCount: engine.playerCount, startStage: engine.selectedStage });
        return;
      }
    }

    if (engine.state !== GAME_STATE.PLAYING) {
      if (!pressed) engine.clearInputs();
      return;
    }

    // Player 1 controls: WASD + J/Space/Z (and Arrow keys when in 1P mode)
    if (code === 'KeyW') engine.setInput(0, 'up', pressed);
    if (code === 'KeyS') engine.setInput(0, 'down', pressed);
    if (code === 'KeyA') engine.setInput(0, 'left', pressed);
    if (code === 'KeyD') engine.setInput(0, 'right', pressed);
    if (code === 'Space' || code === 'KeyJ' || code === 'KeyZ') engine.setInput(0, 'fire', pressed);

    if (engine.playerCount === 1) {
      if (code === 'ArrowUp') engine.setInput(0, 'up', pressed);
      if (code === 'ArrowDown') engine.setInput(0, 'down', pressed);
      if (code === 'ArrowLeft') engine.setInput(0, 'left', pressed);
      if (code === 'ArrowRight') engine.setInput(0, 'right', pressed);
    } else {
      // Player 2 controls: Arrow keys + Enter/K
      if (code === 'ArrowUp') engine.setInput(1, 'up', pressed);
      if (code === 'ArrowDown') engine.setInput(1, 'down', pressed);
      if (code === 'ArrowLeft') engine.setInput(1, 'left', pressed);
      if (code === 'ArrowRight') engine.setInput(1, 'right', pressed);
      if (code === 'Enter' || code === 'KeyK') engine.setInput(1, 'fire', pressed);
    }
  };

  window.addEventListener('keydown', (e) => handleKey(e, true));
  window.addEventListener('keyup', (e) => handleKey(e, false));
  window.addEventListener('blur', () => {
    if (engine) engine.clearInputs();
  });
}

function initApp() {
  const canvas = document.getElementById('game-canvas');
  if (!canvas) return;
  sound = new SoundEngine();
  const savedHigh = loadHighScore();
  lastSavedHigh = savedHigh;

  engine = new BattleCityEngine({
    onSound: (ev) => sound.play(ev),
    highScore: savedHigh,
  });
  renderer = new BattleCityRenderer(canvas);

  bindUI();
  bindKeyboard();
  syncModeButtons();
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  startLoop();
}

window.addEventListener('load', initApp);
