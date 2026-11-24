/**
 * 浏览器入口模块：绑定主循环、键盘/触控输入、HUD 同步与本地高分存储
 */

import { DIR, GAME_STATE } from './constants.js';
import { PacmanGameEngine } from './gameEngine.js';
import { ArcadeAudio } from './audio.js';
import { ArcadeRenderer } from './renderer.js';

const STORAGE_KEY = 'neon_pac_arcade_highscore_v1';

function readSavedHighScore() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = Number.parseInt(raw || '0', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function saveHighScore(score) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(score));
  } catch {
    // 沙盒无权限时静默忽略
  }
}

export function bootArcadeApp() {
  const canvas = document.getElementById('arcade-canvas');
  const scoreEl = document.getElementById('hud-score');
  const highScoreEl = document.getElementById('hud-highscore');
  const levelEl = document.getElementById('hud-level');
  const livesEl = document.getElementById('hud-lives');
  const pelletsEl = document.getElementById('hud-pellets');
  const modeEl = document.getElementById('hud-mode');
  const startBtn = document.getElementById('btn-start');
  const pauseBtn = document.getElementById('btn-pause');
  const muteBtn = document.getElementById('btn-mute');
  const crtBtn = document.getElementById('btn-crt');
  const cabinetScreen = document.getElementById('cabinet-screen');

  if (!canvas) return;

  const audio = new ArcadeAudio();
  const renderer = new ArcadeRenderer(canvas);

  const engine = new PacmanGameEngine({
    highScore: readSavedHighScore(),
    onEvent: (evt) => {
      switch (evt.type) {
        case 'GAME_START':
          audio.playStartJingle();
          break;
        case 'PELLET_EATEN':
          audio.playWaka();
          break;
        case 'POWER_PELLET':
          audio.playPowerPellet();
          renderer.spawnParticles(evt.col, evt.row, '#fef08a', 14);
          break;
        case 'GHOST_EATEN':
          audio.playGhostEaten();
          renderer.spawnParticles(engine.pacman.col, engine.pacman.row, '#00f5d4', 18);
          break;
        case 'FRUIT_EATEN':
          audio.playFruit();
          renderer.spawnParticles(engine.pacman.col, engine.pacman.row, evt.fruit.color, 16);
          break;
        case 'PACMAN_DIED':
          audio.playDeath();
          renderer.spawnParticles(engine.pacman.col, engine.pacman.row, '#facc15', 22);
          break;
        case 'LEVEL_CLEAR':
          audio.playLevelClear();
          break;
        case 'EXTRA_LIFE':
          audio.playExtraLife();
          break;
        case 'GAME_OVER':
          saveHighScore(engine.highScore);
          break;
        default:
          break;
      }
      if (engine.score >= engine.highScore && engine.highScore > 0) {
        saveHighScore(engine.highScore);
      }
    },
  });

  function syncHud() {
    if (scoreEl) scoreEl.textContent = String(engine.score).padStart(6, '0');
    if (highScoreEl) highScoreEl.textContent = String(engine.highScore).padStart(6, '0');
    if (levelEl) levelEl.textContent = `STAGE ${engine.level}`;
    if (livesEl) livesEl.textContent = '● '.repeat(Math.max(0, engine.lives)).trim() || '0';
    if (pelletsEl) pelletsEl.textContent = `${engine.maze.remainingPellets}/${engine.maze.totalPellets}`;

    if (modeEl) {
      if (engine.frightenedTimer > 0) {
        modeEl.textContent = `FRIGHT ${engine.frightenedTimer.toFixed(1)}s`;
        modeEl.dataset.mode = 'fright';
      } else {
        modeEl.textContent = engine.globalGhostMode;
        modeEl.dataset.mode = engine.globalGhostMode.toLowerCase();
      }
    }

    if (startBtn) {
      startBtn.textContent =
        engine.state === GAME_STATE.TITLE
          ? '投币开始'
          : engine.state === GAME_STATE.GAME_OVER
            ? '重新开始'
            : '重开一局';
    }
    if (pauseBtn) {
      pauseBtn.textContent = engine.state === GAME_STATE.PAUSED ? '继续 (P)' : '暂停 (P)';
      pauseBtn.disabled =
        engine.state !== GAME_STATE.PLAYING && engine.state !== GAME_STATE.PAUSED;
    }
  }

  function handleStart() {
    audio.unlock();
    engine.startGame();
    syncHud();
  }

  function handleDirection(dir) {
    audio.unlock();
    if (engine.state === GAME_STATE.TITLE) {
      engine.startGame();
    }
    if (engine.state === GAME_STATE.PLAYING || engine.state === GAME_STATE.READY) {
      engine.setInputDirection(dir);
    }
  }

  // 按钮事件绑定
  if (startBtn) startBtn.addEventListener('click', handleStart);
  if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
      audio.unlock();
      engine.togglePause();
      syncHud();
    });
  }
  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      const muted = audio.toggleMute();
      muteBtn.textContent = muted ? '音效: 关 (M)' : '音效: 开 (M)';
      muteBtn.setAttribute('aria-pressed', String(!muted));
    });
  }
  if (crtBtn && cabinetScreen) {
    crtBtn.addEventListener('click', () => {
      const enabled = cabinetScreen.classList.toggle('crt-enabled');
      crtBtn.textContent = enabled ? 'CRT扫描线: 开' : 'CRT扫描线: 关';
      crtBtn.setAttribute('aria-pressed', String(enabled));
    });
  }

  // 虚拟方向键绑定
  const dpadMap = {
    'dpad-up': DIR.UP,
    'dpad-down': DIR.DOWN,
    'dpad-left': DIR.LEFT,
    'dpad-right': DIR.RIGHT,
  };
  Object.entries(dpadMap).forEach(([id, dir]) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      handleDirection(dir);
    });
  });

  // 触屏滑动手势支持
  let touchStartX = 0;
  let touchStartY = 0;
  canvas.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length === 0) return;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    },
    { passive: true },
  );
  canvas.addEventListener(
    'touchend',
    (e) => {
      if (e.changedTouches.length === 0) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        handleDirection(dx > 0 ? DIR.RIGHT : DIR.LEFT);
      } else {
        handleDirection(dy > 0 ? DIR.DOWN : DIR.UP);
      }
    },
    { passive: true },
  );

  // 键盘事件绑定
  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) {
      e.preventDefault();
    }
    if (key === 'arrowup' || key === 'w') handleDirection(DIR.UP);
    else if (key === 'arrowdown' || key === 's') handleDirection(DIR.DOWN);
    else if (key === 'arrowleft' || key === 'a') handleDirection(DIR.LEFT);
    else if (key === 'arrowright' || key === 'd') handleDirection(DIR.RIGHT);
    else if (key === 'enter' || key === ' ') {
      if (engine.state === GAME_STATE.TITLE || engine.state === GAME_STATE.GAME_OVER) {
        handleStart();
      }
    } else if (key === 'p') {
      engine.togglePause();
      syncHud();
    } else if (key === 'm') {
      const muted = audio.toggleMute();
      if (muteBtn) muteBtn.textContent = muted ? '音效: 关 (M)' : '音效: 开 (M)';
    } else if (key === 'r') {
      handleStart();
    }
  });

  // 固定步长主循环（Accumulator 模式，确保不同刷新率下逻辑一致）
  const FIXED_DT = 1 / 60;
  let accumulator = 0;
  let lastTime = performance.now();
  let rafId = null;

  function frame(now) {
    const rawDt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;
    accumulator += rawDt;

    while (accumulator >= FIXED_DT) {
      engine.update(FIXED_DT);
      accumulator -= FIXED_DT;
    }

    renderer.render(engine, rawDt);
    syncHud();
    rafId = window.requestAnimationFrame(frame);
  }

  syncHud();
  renderer.render(engine, 0);
  if (rafId !== null) window.cancelAnimationFrame(rafId);
  rafId = window.requestAnimationFrame(frame);
}

window.addEventListener('load', bootArcadeApp);
