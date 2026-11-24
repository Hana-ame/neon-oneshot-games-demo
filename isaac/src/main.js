import { SoundEngine } from './audio.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from './constants.js';
import { IsaacGameEngine } from './engine.js';
import { IsaacRenderer } from './renderer.js';

export function bootGame() {
  const canvas = document.getElementById('game-canvas');
  if (!canvas) return;
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;

  const sound = new SoundEngine();
  const renderer = new IsaacRenderer(canvas);
  const overlayEl = document.getElementById('state-overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayDesc = document.getElementById('overlay-desc');
  const overlayBtn = document.getElementById('overlay-action');
  const muteBtn = document.getElementById('btn-mute');
  const pauseBtn = document.getElementById('btn-pause');
  const restartBtn = document.getElementById('btn-restart');
  const seedInput = document.getElementById('seed-input');
  const seedApplyBtn = document.getElementById('btn-apply-seed');
  const itemsDrawer = document.getElementById('items-list');

  let engine = null;
  let rafId = null;
  let lastTs = 0;

  const keys = new Set();
  const touchState = { moveX: 0, moveY: 0, shootX: 0, shootY: 0, bomb: false, active: false };

  function syncItemsUI() {
    if (!itemsDrawer || !engine) return;
    if (engine.player.ownedItems.length === 0) {
      itemsDrawer.innerHTML = '<span class="item-empty">尚未拾取被动道具（探索金色宝箱房获取）</span>';
      return;
    }
    itemsDrawer.innerHTML = engine.player.ownedItems
      .map(
        (it) =>
          `<span class="item-chip" style="border-color:${it.color}"><i style="background:${it.color}"></i>${it.name}</span>`
      )
      .join('');
  }

  function syncOverlay() {
    if (!overlayEl || !engine) return;
    if (engine.status === 'PLAYING') {
      overlayEl.classList.add('hidden');
      return;
    }
    overlayEl.classList.remove('hidden');
    if (engine.status === 'PAUSED') {
      overlayTitle.textContent = '游戏已暂停';
      overlayDesc.textContent = `当前层级：${engine.floor.theme.name} · 种子：${engine.seed}`;
      overlayBtn.textContent = '继续冒险 (P)';
    } else if (engine.status === 'GAMEOVER') {
      overlayTitle.textContent = '你倒在了地下室中';
      overlayDesc.textContent = `抵达 ${engine.floor.theme.name} · 击杀 ${engine.enemiesKilledCount} · 最终得分 ${engine.player.score}`;
      overlayBtn.textContent = '重新开始 (R)';
    } else if (engine.status === 'VICTORY') {
      overlayTitle.textContent = '通关成功！';
      overlayDesc.textContent = `恭喜击败深渊之心！清理房间 ${engine.roomsClearedCount} · 最终得分 ${engine.player.score}`;
      overlayBtn.textContent = '开启新一局';
    }
  }

  function startNewRun(customSeed) {
    engine = new IsaacGameEngine({
      seed: customSeed || undefined,
      onEvent(type) {
        sound.handleEvent(type);
        if (type === 'item_pickup' || type === 'game_start') {
          syncItemsUI();
        }
        if (type === 'game_over' || type === 'victory') {
          syncOverlay();
        }
      }
    });
    if (seedInput) seedInput.value = engine.seed;
    syncItemsUI();
    syncOverlay();
  }

  function togglePause() {
    if (!engine) return;
    if (engine.status === 'PLAYING') {
      engine.status = 'PAUSED';
      syncOverlay();
    } else if (engine.status === 'PAUSED') {
      engine.status = 'PLAYING';
      syncOverlay();
    }
  }

  function getInput() {
    let moveX = touchState.moveX;
    let moveY = touchState.moveY;
    if (keys.has('KeyA')) moveX -= 1;
    if (keys.has('KeyD')) moveX += 1;
    if (keys.has('KeyW')) moveY -= 1;
    if (keys.has('KeyS')) moveY += 1;

    let shootX = touchState.shootX;
    let shootY = touchState.shootY;
    if (keys.has('ArrowLeft')) shootX -= 1;
    if (keys.has('ArrowRight')) shootX += 1;
    if (keys.has('ArrowUp')) shootY -= 1;
    if (keys.has('ArrowDown')) shootY += 1;

    const bomb = keys.has('KeyE') || keys.has('ShiftLeft') || keys.has('ShiftRight') || touchState.bomb;
    const active = keys.has('Space') || touchState.active;

    return { moveX, moveY, shootX, shootY, bomb, active };
  }

  // Keyboard listeners
  window.addEventListener('keydown', (e) => {
    sound.unlock();
    if (document.activeElement === seedInput) return;
    const prevent = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
    if (prevent.includes(e.code)) e.preventDefault();

    if (e.code === 'KeyP' || e.code === 'Escape') {
      togglePause();
      return;
    }
    if (e.code === 'KeyR') {
      startNewRun();
      return;
    }
    if (e.code === 'KeyM') {
      const m = sound.toggleMute();
      if (muteBtn) muteBtn.textContent = m ? '🔇 静音' : '🔊 音效';
      return;
    }
    keys.add(e.code);
  });

  window.addEventListener('keyup', (e) => {
    keys.delete(e.code);
  });

  window.addEventListener('blur', () => {
    keys.clear();
  });

  // UI Button listeners
  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      sound.unlock();
      const m = sound.toggleMute();
      muteBtn.textContent = m ? '🔇 静音' : '🔊 音效';
    });
  }
  if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
      sound.unlock();
      togglePause();
    });
  }
  if (restartBtn) {
    restartBtn.addEventListener('click', () => {
      sound.unlock();
      startNewRun();
    });
  }
  if (overlayBtn) {
    overlayBtn.addEventListener('click', () => {
      sound.unlock();
      if (engine && engine.status === 'PAUSED') {
        togglePause();
      } else {
        startNewRun();
      }
    });
  }
  if (seedApplyBtn && seedInput) {
    seedApplyBtn.addEventListener('click', () => {
      sound.unlock();
      const val = seedInput.value.trim().toUpperCase();
      startNewRun(val || undefined);
    });
  }

  // Touch / On-screen pad bindings
  const bindHoldButton = (id, onDown, onUp) => {
    const el = document.getElementById(id);
    if (!el) return;
    const start = (ev) => {
      ev.preventDefault();
      sound.unlock();
      el.classList.add('active');
      onDown();
    };
    const end = (ev) => {
      ev.preventDefault();
      el.classList.remove('active');
      onUp();
    };
    el.addEventListener('pointerdown', start);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointerleave', end);
    el.addEventListener('pointercancel', end);
  };

  bindHoldButton('pad-up', () => (touchState.moveY = -1), () => (touchState.moveY = 0));
  bindHoldButton('pad-down', () => (touchState.moveY = 1), () => (touchState.moveY = 0));
  bindHoldButton('pad-left', () => (touchState.moveX = -1), () => (touchState.moveX = 0));
  bindHoldButton('pad-right', () => (touchState.moveX = 1), () => (touchState.moveX = 0));

  bindHoldButton('shoot-up', () => (touchState.shootY = -1), () => (touchState.shootY = 0));
  bindHoldButton('shoot-down', () => (touchState.shootY = 1), () => (touchState.shootY = 0));
  bindHoldButton('shoot-left', () => (touchState.shootX = -1), () => (touchState.shootX = 0));
  bindHoldButton('shoot-right', () => (touchState.shootX = 1), () => (touchState.shootX = 0));

  bindHoldButton('btn-touch-bomb', () => (touchState.bomb = true), () => (touchState.bomb = false));
  bindHoldButton('btn-touch-active', () => (touchState.active = true), () => (touchState.active = false));

  // Responsive canvas sizing
  function resizeCanvasDisplay() {
    const wrap = document.getElementById('canvas-wrap');
    if (!wrap) return;
    const maxW = wrap.clientWidth;
    const scale = Math.min(1, maxW / CANVAS_WIDTH);
    canvas.style.width = `${Math.floor(CANVAS_WIDTH * scale)}px`;
    canvas.style.height = `${Math.floor(CANVAS_HEIGHT * scale)}px`;
    if (engine) renderer.render(engine);
  }
  window.addEventListener('resize', resizeCanvasDisplay);

  function frame(ts) {
    if (!lastTs) lastTs = ts;
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;
    if (engine) {
      engine.step(dt, getInput());
      renderer.render(engine);
    }
    rafId = window.requestAnimationFrame(frame);
  }

  startNewRun();
  resizeCanvasDisplay();
  if (rafId) window.cancelAnimationFrame(rafId);
  rafId = window.requestAnimationFrame(frame);
}

if (typeof window !== 'undefined') {
  window.addEventListener('load', bootGame);
}
