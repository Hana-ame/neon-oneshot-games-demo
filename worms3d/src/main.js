/**
 * 百战天虫 3D - 浏览器入口与输入调度器 (main.js)
 */

import { TURN_PHASE, WEAPON_LIST } from './core/constants.js';
import { GameEngine } from './core/gameEngine.js';
import { AIController } from './core/ai.js';
import { SoundEngine } from './audio/soundEngine.js';
import { Renderer3D } from './render/renderer3d.js';
import { HUDController } from './ui/hud.js';

export function bootWorms3D() {
  const canvas = document.getElementById('game-canvas');
  if (!canvas || typeof THREE === 'undefined') return null;

  const engine = new GameEngine({
    mode: 'ai',
    wormsPerTeam: 3,
    themeId: 'tropical',
  });
  const ai = new AIController(engine);
  const sound = new SoundEngine();
  const renderer = new Renderer3D(canvas, engine);
  const hud = new HUDController(engine, renderer, sound);

  // 音效绑定
  engine.on('fire', (ev) => sound.playLaunch(ev.weaponId));
  engine.on('explosion', (ev) => sound.playExplosion(ev.radius));
  engine.on('bounce', () => sound.playBounce());
  engine.on('splash', () => sound.playSplash());
  engine.on('drown', () => sound.playSplash());
  engine.on('jump', () => sound.playJump());
  engine.on('crate_pickup', () => sound.playPickup());
  engine.on('turn_change', () => ai.resetPlan());

  // 键盘与触控状态
  const keys = new Set();
  const touchState = { forward: 0, turn: 0, pitch: 0 };

  window.addEventListener('keydown', (e) => {
    sound.unlock();
    const code = e.code;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
      e.preventDefault();
    }
    if (e.repeat) return;
    keys.add(code);

    if (code === 'KeyC') {
      const mode = renderer.toggleCameraMode();
      hud.showBanner(mode === 'tactical' ? '🎥 战术上帝视角（拖拽旋转/滚轮缩放）' : '🎯 第三人称追尾视角', 1.4);
      updateCameraBtnLabel();
      return;
    }
    if (code === 'KeyM') {
      const muted = sound.toggleMute();
      updateMuteBtnLabel(muted);
      return;
    }

    if (engine.getActiveTeam().isAI) return;

    if (code === 'Space') {
      engine.startCharge();
    } else if (code === 'KeyJ' || code === 'Enter') {
      engine.jumpActiveWorm();
    } else if (code.startsWith('Digit')) {
      const idx = parseInt(code.replace('Digit', ''), 10) - 1;
      if (WEAPON_LIST[idx]) {
        engine.selectWeapon(WEAPON_LIST[idx].id);
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    keys.delete(e.code);
    if (e.code === 'Space' && !engine.getActiveTeam().isAI) {
      engine.releaseCharge();
    }
  });

  // 鼠标拖拽调整视角/瞄准
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  canvas.addEventListener('pointerdown', (e) => {
    sound.unlock();
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  });
  window.addEventListener('pointerup', () => {
    dragging = false;
  });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;

    if (renderer.cameraMode === 'tactical') {
      renderer.orbitTacticalCamera(dx, dy);
    } else if (!engine.getActiveTeam().isAI && (engine.phase === TURN_PHASE.AIM || engine.phase === TURN_PHASE.RETREAT)) {
      const worm = engine.getActiveWorm();
      if (worm && worm.alive) {
        worm.yaw -= dx * 0.007;
        worm.pitch = Math.max(-0.55, Math.min(1.25, worm.pitch - dy * 0.005));
      }
    }
  });

  canvas.addEventListener(
    'wheel',
    (e) => {
      if (renderer.cameraMode === 'tactical') {
        e.preventDefault();
        renderer.zoomTacticalCamera(e.deltaY);
      }
    },
    { passive: false }
  );

  // 顶部与弹窗控制按钮
  function updateCameraBtnLabel() {
    const btn = document.getElementById('btn-camera');
    if (btn) btn.textContent = renderer.cameraMode === 'tactical' ? '🎥 战术视角' : '🎯 追尾视角';
  }
  function updateMuteBtnLabel(muted) {
    const btn = document.getElementById('btn-mute');
    if (btn) btn.textContent = muted ? '🔇 静音' : '🔊 音效';
  }

  document.getElementById('btn-camera')?.addEventListener('click', () => {
    sound.unlock();
    renderer.toggleCameraMode();
    updateCameraBtnLabel();
  });

  document.getElementById('btn-mute')?.addEventListener('click', () => {
    const muted = sound.toggleMute();
    updateMuteBtnLabel(muted);
  });

  const settingsModal = document.getElementById('settings-modal');
  document.getElementById('btn-settings')?.addEventListener('click', () => {
    sound.unlock();
    settingsModal?.classList.remove('hidden');
  });
  document.getElementById('btn-close-settings')?.addEventListener('click', () => {
    settingsModal?.classList.add('hidden');
  });

  const helpModal = document.getElementById('help-modal');
  document.getElementById('btn-help')?.addEventListener('click', () => {
    sound.unlock();
    helpModal?.classList.remove('hidden');
  });
  document.getElementById('btn-close-help')?.addEventListener('click', () => {
    helpModal?.classList.add('hidden');
  });

  function startNewMatchFromUI() {
    const mode = document.getElementById('opt-mode')?.value || 'ai';
    const themeId = document.getElementById('opt-theme')?.value || 'tropical';
    const wormsPerTeam = parseInt(document.getElementById('opt-worms')?.value || '3', 10);
    engine.initMatch({ mode, themeId, wormsPerTeam });
    settingsModal?.classList.add('hidden');
  }

  document.getElementById('btn-apply-match')?.addEventListener('click', startNewMatchFromUI);
  document.getElementById('btn-restart')?.addEventListener('click', () => {
    sound.unlock();
    startNewMatchFromUI();
  });

  // 触控/屏幕操作按钮绑定
  function bindHoldButton(id, onDown, onUp) {
    const btn = document.getElementById(id);
    if (!btn) return;
    const start = (e) => {
      e.preventDefault();
      sound.unlock();
      onDown();
    };
    const end = (e) => {
      e.preventDefault();
      onUp();
    };
    btn.addEventListener('pointerdown', start);
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointerleave', end);
    btn.addEventListener('pointercancel', end);
  }

  bindHoldButton('ctrl-fwd', () => (touchState.forward = 1), () => (touchState.forward = 0));
  bindHoldButton('ctrl-back', () => (touchState.forward = -1), () => (touchState.forward = 0));
  bindHoldButton('ctrl-left', () => (touchState.turn = 1), () => (touchState.turn = 0));
  bindHoldButton('ctrl-right', () => (touchState.turn = -1), () => (touchState.turn = 0));
  bindHoldButton('ctrl-up', () => (touchState.pitch = 1), () => (touchState.pitch = 0));
  bindHoldButton('ctrl-down', () => (touchState.pitch = -1), () => (touchState.pitch = 0));

  document.getElementById('ctrl-jump')?.addEventListener('click', () => {
    sound.unlock();
    if (!engine.getActiveTeam().isAI) engine.jumpActiveWorm();
  });

  bindHoldButton(
    'ctrl-fire',
    () => {
      if (!engine.getActiveTeam().isAI) engine.startCharge();
    },
    () => {
      if (!engine.getActiveTeam().isAI) engine.releaseCharge();
    }
  );

  window.addEventListener('resize', () => renderer.resize());

  // 主渲染与物理循环
  let lastTime = performance.now();
  let rafId = null;

  function loop(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    if (!engine.getActiveTeam().isAI) {
      const fwd =
        (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) -
        (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) +
        touchState.forward;
      const turn =
        (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) -
        (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) +
        touchState.turn;
      const pitch = (keys.has('KeyR') ? 1 : 0) - (keys.has('KeyF') ? 1 : 0) + touchState.pitch;

      if (fwd !== 0 || turn !== 0 || pitch !== 0) {
        engine.moveActiveWorm(Math.max(-1, Math.min(1, fwd)), Math.max(-1, Math.min(1, turn)), Math.max(-1, Math.min(1, pitch)), dt);
      }
    } else {
      ai.update(dt);
    }

    engine.update(dt);
    renderer.update(dt);
    hud.update(dt);

    rafId = requestAnimationFrame(loop);
  }

  rafId = requestAnimationFrame(loop);
  return { engine, renderer, hud, ai, sound, stop: () => cancelAnimationFrame(rafId) };
}

if (typeof window !== 'undefined') {
  window.addEventListener('load', () => bootWorms3D());
}
