// 浏览器入口模块：负责 Canvas 自适应、输入绑定、控制栏事件与固定步长主循环

import { GAME_WIDTH, GAME_HEIGHT, FIXED_DT, GAME_STATES } from './constants.js';
import { RetroAudio } from './audio.js';
import { InputManager } from './input.js';
import { ContraEngine } from './engine.js';
import { ContraRenderer } from './renderer.js';

export function bootstrapGame() {
  const canvas = document.getElementById('game-canvas');
  const stageWrapper = document.getElementById('stage-wrapper');
  const startBtn = document.getElementById('btn-start');
  const pauseBtn = document.getElementById('btn-pause');
  const muteBtn = document.getElementById('btn-mute');
  const crtBtn = document.getElementById('btn-crt');
  const konamiBtn = document.getElementById('btn-konami');
  const statusToast = document.getElementById('status-toast');

  if (!canvas) return null;

  canvas.width = GAME_WIDTH;
  canvas.height = GAME_HEIGHT;

  let storage = null;
  try {
    storage = window.localStorage;
  } catch {
    storage = null;
  }

  const audio = new RetroAudio();
  const input = new InputManager();
  const engine = new ContraEngine({ audio, storage });
  const renderer = new ContraRenderer(canvas);

  let rafId = null;
  let lastTime = 0;
  let accumulator = 0;
  let toastTimer = null;

  function showToast(msg) {
    if (!statusToast) return;
    statusToast.textContent = msg;
    statusToast.classList.add('visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      statusToast.classList.remove('visible');
    }, 2200);
  }

  function syncToolbar() {
    if (startBtn) {
      startBtn.textContent =
        engine.state === GAME_STATES.TITLE ? '开始游戏' : '重新开始';
    }
    if (pauseBtn) {
      pauseBtn.textContent =
        engine.state === GAME_STATES.PAUSED ? '继续' : '暂停';
      pauseBtn.disabled =
        engine.state !== GAME_STATES.PLAYING && engine.state !== GAME_STATES.PAUSED;
    }
    if (muteBtn) {
      muteBtn.textContent = audio.muted ? '静音: 开' : '音效: 开';
    }
    if (crtBtn) {
      crtBtn.textContent = renderer.crtEnabled ? 'CRT: 开' : 'CRT: 关';
    }
  }

  function resizeCanvas() {
    if (!stageWrapper) return;
    const availW = Math.max(280, stageWrapper.clientWidth);
    const targetH = Math.round((availW * GAME_HEIGHT) / GAME_WIDTH);
    canvas.style.width = `${availW}px`;
    canvas.style.height = `${targetH}px`;
    renderer.render(engine);
  }

  function startOrRestart() {
    audio.init();
    engine.startGame();
    syncToolbar();
    showToast('任务开始！摧毁红隼军团防御核心');
  }

  input.onKonamiCallback = () => {
    audio.init();
    engine.activateKonamiCode();
    syncToolbar();
    showToast('★ 科乐美秘籍激活：30 命模式！');
  };

  input.onPauseCallback = () => {
    if (engine.state === GAME_STATES.PLAYING || engine.state === GAME_STATES.PAUSED) {
      engine.togglePause();
      syncToolbar();
    }
  };

  input.onMuteCallback = () => {
    audio.init();
    const muted = audio.toggleMute();
    if (!muted && engine.state === GAME_STATES.PLAYING) {
      audio.startBgm(engine.stageIndex);
    }
    syncToolbar();
  };

  input.onStartCallback = () => {
    if (
      engine.state === GAME_STATES.TITLE ||
      engine.state === GAME_STATES.GAME_OVER ||
      engine.state === GAME_STATES.VICTORY
    ) {
      startOrRestart();
    }
  };

  const blockedKeys = new Set([
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'
  ]);

  window.addEventListener('keydown', (e) => {
    if (blockedKeys.has(e.code)) {
      e.preventDefault();
    }
    audio.init();
    input.handleKeyDown(e.code);
  });

  window.addEventListener('keyup', (e) => {
    input.handleKeyUp(e.code);
  });

  window.addEventListener('blur', () => {
    input.reset();
  });

  window.addEventListener('resize', resizeCanvas);

  if (startBtn) {
    startBtn.addEventListener('click', () => {
      startOrRestart();
    });
  }

  if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
      audio.init();
      engine.togglePause();
      syncToolbar();
    });
  }

  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      audio.init();
      const muted = audio.toggleMute();
      if (!muted && engine.state === GAME_STATES.PLAYING) {
        audio.startBgm(engine.stageIndex);
      }
      syncToolbar();
    });
  }

  if (crtBtn) {
    crtBtn.addEventListener('click', () => {
      renderer.toggleCrt();
      syncToolbar();
      renderer.render(engine);
    });
  }

  if (konamiBtn) {
    konamiBtn.addEventListener('click', () => {
      audio.init();
      engine.activateKonamiCode();
      syncToolbar();
      showToast('★ 已开启 30 命秘籍模式！');
    });
  }

  // 点击画布标题/结束界面直接开战
  canvas.addEventListener('click', () => {
    audio.init();
    if (
      engine.state === GAME_STATES.TITLE ||
      engine.state === GAME_STATES.GAME_OVER ||
      engine.state === GAME_STATES.VICTORY
    ) {
      startOrRestart();
    }
  });

  // 虚拟触控与鼠标手柄绑定
  const padButtons = document.querySelectorAll('[data-action]');
  padButtons.forEach((btn) => {
    const action = btn.getAttribute('data-action');
    const press = (ev) => {
      ev.preventDefault();
      audio.init();
      btn.classList.add('active');
      if (engine.state === GAME_STATES.TITLE && (action === 'shoot' || action === 'jump')) {
        startOrRestart();
        return;
      }
      input.setVirtualButton(action, true);
    };
    const release = (ev) => {
      ev.preventDefault();
      btn.classList.remove('active');
      input.setVirtualButton(action, false);
    };
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointerleave', release);
    btn.addEventListener('pointercancel', release);
  });

  function loop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const rawDt = Math.min(0.05, (timestamp - lastTime) / 1000);
    lastTime = timestamp;
    accumulator += rawDt;

    while (accumulator >= FIXED_DT) {
      engine.update(FIXED_DT, input.getState());
      input.endFrame();
      accumulator -= FIXED_DT;
    }

    renderer.render(engine);
    syncToolbar();
    rafId = window.requestAnimationFrame(loop);
  }

  if (rafId) {
    window.cancelAnimationFrame(rafId);
  }
  resizeCanvas();
  syncToolbar();
  rafId = window.requestAnimationFrame(loop);

  return { engine, renderer, input, audio };
}

if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    bootstrapGame();
  });
}
