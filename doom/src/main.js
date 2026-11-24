import { DoomEngine } from './engine.js';
import { DoomRenderer } from './renderer.js';
import { SoundEngine } from './audio.js';
import { WEAPON_IDS } from './constants.js';

export function bootWebDoom() {
  const canvas = document.getElementById('game-canvas');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayDesc = document.getElementById('overlay-desc');
  const overlayStats = document.getElementById('overlay-stats');
  const primaryBtn = document.getElementById('overlay-primary-btn');
  const secondaryBtn = document.getElementById('overlay-secondary-btn');
  const btnMute = document.getElementById('btn-mute');
  const btnMap = document.getElementById('btn-map');
  const btnPause = document.getElementById('btn-pause');
  const btnRestart = document.getElementById('btn-restart');

  if (!canvas) return null;

  const sound = new SoundEngine();
  const engine = new DoomEngine({
    onEvent: (evt, payload) => {
      sound.handleEvent(evt, payload);
      syncOverlay();
    },
  });
  const renderer = new DoomRenderer(canvas);

  const keys = new Set();
  const virtualInput = {
    forward: 0,
    strafe: 0,
    turn: 0,
    fire: false,
    interact: false,
  };
  let mouseTurnDelta = 0;
  let mouseDown = false;
  let isDragging = false;
  let lastPointerX = 0;
  let interactQueued = false;
  let rafId = null;

  function syncOverlay() {
    const s = engine.state;
    if (s === 'playing') {
      overlay.classList.add('hidden');
      return;
    }
    overlay.classList.remove('hidden');
    secondaryBtn.classList.add('hidden');
    overlayStats.textContent = '';

    if (s === 'title') {
      overlayTitle.textContent = 'DOOM-JS // PHOBOS SECTOR';
      overlayDesc.textContent =
        '2.5D DDA Raycasting Engine. WASD move, Mouse/Arrows turn, Click/Space fire, E open doors & switches, 1-4 weapons.';
      primaryBtn.textContent = 'START MISSION';
    } else if (s === 'paused') {
      overlayTitle.textContent = 'MISSION PAUSED';
      overlayDesc.textContent = `${engine.currentLevel.name} — ${engine.currentLevel.subtitle}`;
      overlayStats.textContent = `SCORE: ${engine.score}  |  KILLS: ${engine.levelKills}/${engine.levelTotalEnemies}`;
      primaryBtn.textContent = 'RESUME';
      secondaryBtn.textContent = 'RESTART';
      secondaryBtn.classList.remove('hidden');
    } else if (s === 'level_complete') {
      overlayTitle.textContent = 'SECTOR CLEARED';
      overlayDesc.textContent = `${engine.currentLevel.name} completed! Prepare for the next sector.`;
      overlayStats.textContent = `KILLS: ${engine.levelKills}/${engine.levelTotalEnemies}  |  ITEMS: ${engine.levelItemsCollected}/${engine.levelTotalItems}  |  SCORE: ${engine.score}`;
      primaryBtn.textContent = 'NEXT SECTOR';
    } else if (s === 'victory') {
      overlayTitle.textContent = 'HELL GATE SEALED!';
      overlayDesc.textContent = 'You conquered all three sectors of Phobos and defeated the Baron of Hell.';
      overlayStats.textContent = `TOTAL KILLS: ${engine.totalKills}  |  FINAL SCORE: ${engine.score}`;
      primaryBtn.textContent = 'PLAY AGAIN';
    } else if (s === 'gameover') {
      overlayTitle.textContent = 'YOU DIED';
      overlayDesc.textContent = `Fallen in ${engine.currentLevel.name}.`;
      overlayStats.textContent = `KILLS: ${engine.totalKills}  |  SCORE: ${engine.score}`;
      primaryBtn.textContent = 'RETRY MISSION';
    }
  }

  function handlePrimaryAction() {
    sound.unlock();
    if (engine.state === 'title' || engine.state === 'victory' || engine.state === 'gameover') {
      engine.startNewGame();
    } else if (engine.state === 'paused') {
      engine.togglePause();
    } else if (engine.state === 'level_complete') {
      engine.nextLevel();
    }
    syncOverlay();
  }

  primaryBtn.addEventListener('click', handlePrimaryAction);
  secondaryBtn.addEventListener('click', () => {
    sound.unlock();
    engine.startNewGame();
    syncOverlay();
  });

  btnMute.addEventListener('click', () => {
    sound.unlock();
    const muted = sound.toggleMute();
    btnMute.textContent = muted ? 'AUDIO: OFF' : 'AUDIO: ON';
  });

  btnMap.addEventListener('click', () => {
    renderer.showMinimap = !renderer.showMinimap;
    btnMap.textContent = renderer.showMinimap ? 'MAP: ON' : 'MAP: OFF';
  });

  btnPause.addEventListener('click', () => {
    if (engine.state === 'playing' || engine.state === 'paused') {
      engine.togglePause();
      syncOverlay();
    }
  });

  btnRestart.addEventListener('click', () => {
    sound.unlock();
    engine.startNewGame();
    syncOverlay();
  });

  // Keyboard bindings
  window.addEventListener('keydown', (e) => {
    const code = e.code;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(code)) {
      e.preventDefault();
    }
    sound.unlock();
    keys.add(code);

    if (code === 'KeyE') {
      interactQueued = true;
    } else if (code === 'Digit1') {
      engine.switchWeaponBySlot(1);
    } else if (code === 'Digit2') {
      engine.switchWeaponBySlot(2);
    } else if (code === 'Digit3') {
      engine.switchWeaponBySlot(3);
    } else if (code === 'Digit4') {
      engine.switchWeaponBySlot(4);
    } else if (code === 'KeyM' || code === 'Tab') {
      renderer.showMinimap = !renderer.showMinimap;
      btnMap.textContent = renderer.showMinimap ? 'MAP: ON' : 'MAP: OFF';
    } else if (code === 'KeyP' || code === 'Escape') {
      if (engine.state === 'playing' || engine.state === 'paused') {
        engine.togglePause();
        syncOverlay();
      }
    } else if (code === 'KeyV') {
      const muted = sound.toggleMute();
      btnMute.textContent = muted ? 'AUDIO: OFF' : 'AUDIO: ON';
    } else if (code === 'KeyR' && (engine.state === 'gameover' || engine.state === 'victory')) {
      engine.startNewGame();
      syncOverlay();
    } else if (code === 'Enter' && engine.state !== 'playing') {
      handlePrimaryAction();
    }
  });

  window.addEventListener('keyup', (e) => {
    keys.delete(e.code);
  });

  // Mouse look (Pointer Lock when allowed, plus drag fallback) & firing
  canvas.addEventListener('mousedown', (e) => {
    sound.unlock();
    if (engine.state !== 'playing') return;
    if (e.button === 0) {
      mouseDown = true;
      isDragging = true;
      lastPointerX = e.clientX;
      if (document.pointerLockElement !== canvas && canvas.requestPointerLock) {
        try {
          const p = canvas.requestPointerLock();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch (_) {
          // Pointer lock may be blocked in sandboxed iframes; drag fallback works smoothly.
        }
      }
    }
  });

  window.addEventListener('mouseup', () => {
    mouseDown = false;
    isDragging = false;
  });

  window.addEventListener('mousemove', (e) => {
    if (engine.state !== 'playing') return;
    if (document.pointerLockElement === canvas) {
      mouseTurnDelta += e.movementX * 0.015;
    } else if (isDragging) {
      const dx = e.clientX - lastPointerX;
      lastPointerX = e.clientX;
      mouseTurnDelta += dx * 0.018;
    }
  });

  canvas.addEventListener(
    'wheel',
    (e) => {
      if (engine.state !== 'playing') return;
      e.preventDefault();
      engine.cycleWeapon(e.deltaY > 0 ? 1 : -1);
    },
    { passive: false }
  );

  // On-screen / Touch control pad bindings
  const bindHoldButton = (id, onStart, onEnd) => {
    const el = document.getElementById(id);
    if (!el) return;
    const start = (e) => {
      e.preventDefault();
      sound.unlock();
      onStart();
    };
    const end = (e) => {
      e.preventDefault();
      onEnd();
    };
    el.addEventListener('pointerdown', start);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointerleave', end);
    el.addEventListener('pointercancel', end);
  };

  bindHoldButton('ctrl-fwd', () => (virtualInput.forward = 1), () => (virtualInput.forward = 0));
  bindHoldButton('ctrl-back', () => (virtualInput.forward = -1), () => (virtualInput.forward = 0));
  bindHoldButton('ctrl-left', () => (virtualInput.turn = -1), () => (virtualInput.turn = 0));
  bindHoldButton('ctrl-right', () => (virtualInput.turn = 1), () => (virtualInput.turn = 0));
  bindHoldButton('ctrl-fire', () => (virtualInput.fire = true), () => (virtualInput.fire = false));

  const ctrlUse = document.getElementById('ctrl-use');
  if (ctrlUse) {
    ctrlUse.addEventListener('click', () => {
      sound.unlock();
      interactQueued = true;
    });
  }
  const ctrlWeap = document.getElementById('ctrl-weap');
  if (ctrlWeap) {
    ctrlWeap.addEventListener('click', () => {
      sound.unlock();
      engine.cycleWeapon(1);
    });
  }

  // Responsive canvas wrapper resize handling
  function handleResize() {
    renderer.render(engine);
  }
  window.addEventListener('resize', handleResize);

  // Main requestAnimationFrame loop
  let lastTime = performance.now();
  let fpsTimer = 0;
  let frameCount = 0;

  function tick(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    fpsTimer += dt;
    frameCount++;
    if (fpsTimer >= 0.5) {
      renderer.fps = Math.round(frameCount / fpsTimer);
      fpsTimer = 0;
      frameCount = 0;
    }

    let forward = virtualInput.forward;
    if (keys.has('KeyW') || keys.has('ArrowUp')) forward += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) forward -= 1;

    let strafe = virtualInput.strafe;
    if (keys.has('KeyD')) strafe += 1;
    if (keys.has('KeyA')) strafe -= 1;

    let turn = virtualInput.turn;
    if (keys.has('ArrowRight') || keys.has('KeyQ') === false && false) turn += 0;
    if (keys.has('ArrowRight')) turn += 1;
    if (keys.has('ArrowLeft')) turn -= 1;
    if (mouseTurnDelta !== 0) {
      turn += mouseTurnDelta / Math.max(0.008, dt);
      mouseTurnDelta = 0;
    }

    const input = {
      forward,
      strafe,
      turn,
      sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'),
      fire: mouseDown || keys.has('Space') || virtualInput.fire,
      interact: interactQueued || virtualInput.interact,
    };
    interactQueued = false;

    engine.update(dt, input);
    renderer.render(engine);
    rafId = window.requestAnimationFrame(tick);
  }

  syncOverlay();
  renderer.render(engine);
  if (rafId) window.cancelAnimationFrame(rafId);
  rafId = window.requestAnimationFrame(tick);

  return { engine, renderer, sound, WEAPON_IDS };
}

window.addEventListener('load', () => {
  bootWebDoom();
});
