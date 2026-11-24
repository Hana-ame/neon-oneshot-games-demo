/**
 * 浏览器端入口控制器：绑定 Canvas、键鼠与触屏交互、HUD 与关卡切换
 */

import { FIXED_DT, WORLD_WIDTH, WORLD_HEIGHT } from './constants.js';
import { RAW_LEVELS } from './levels.js';
import { SoundSynthesizer } from './audio.js';
import { GameEngine } from './engine.js';
import { PortalRenderer } from './renderer.js';

function bootstrap() {
  const canvas = document.getElementById('game-canvas');
  const sound = new SoundSynthesizer();
  const renderer = new PortalRenderer(canvas);

  let touchPortalColor = 'blue';
  let rafId = null;
  let lastTime = 0;
  let accumulator = 0;

  const ui = {
    chamberCode: document.getElementById('chamber-code'),
    chamberTitle: document.getElementById('chamber-title'),
    chamberSubtitle: document.getElementById('chamber-subtitle'),
    statTime: document.getElementById('stat-time'),
    statPortals: document.getElementById('stat-portals'),
    statTeleports: document.getElementById('stat-teleports'),
    blueBadge: document.getElementById('badge-blue'),
    orangeBadge: document.getElementById('badge-orange'),
    doorBadge: document.getElementById('badge-door'),
    levelSelect: document.getElementById('level-select'),
    btnReset: document.getElementById('btn-reset'),
    btnClear: document.getElementById('btn-clear'),
    btnHint: document.getElementById('btn-hint'),
    btnMute: document.getElementById('btn-mute'),
    hintBanner: document.getElementById('hint-banner'),
    hintText: document.getElementById('hint-text'),
    overlay: document.getElementById('stage-overlay'),
    overlayTitle: document.getElementById('overlay-title'),
    overlayDesc: document.getElementById('overlay-desc'),
    overlayStats: document.getElementById('overlay-stats'),
    btnNextLevel: document.getElementById('btn-next-level'),
    btnReplayLevel: document.getElementById('btn-replay-level'),
    touchModeBtn: document.getElementById('touch-portal-mode')
  };

  // 初始化关卡下拉菜单
  ui.levelSelect.innerHTML = '';
  RAW_LEVELS.forEach((lv, idx) => {
    const opt = document.createElement('option');
    opt.value = String(idx);
    opt.textContent = `${lv.code} · ${lv.title}`;
    ui.levelSelect.appendChild(opt);
  });

  const engine = new GameEngine({
    sound,
    onStateChange: (snap) => syncHUD(snap)
  });

  function syncHUD(snap) {
    ui.chamberCode.textContent = snap.code;
    ui.chamberTitle.textContent = snap.title;
    ui.chamberSubtitle.textContent = snap.subtitle;
    ui.levelSelect.value = String(snap.levelIndex);
    ui.statPortals.textContent = String(snap.portalsFired);
    ui.statTeleports.textContent = String(snap.teleportsCount);
    ui.blueBadge.classList.toggle('active', snap.hasBlue);
    ui.orangeBadge.classList.toggle('active', snap.hasOrange);
    ui.doorBadge.textContent = snap.doorOpen ? '出口已解锁' : '出口已锁定';
    ui.doorBadge.classList.toggle('open', snap.doorOpen);
    ui.hintText.textContent = snap.hint;

    if (snap.status === 'level_clear' || snap.status === 'all_clear') {
      ui.overlay.classList.remove('hidden');
      const isAll = snap.status === 'all_clear';
      ui.overlayTitle.textContent = isAll ? '全部测试舱通关！' : `${snap.code} 测试完成`;
      ui.overlayDesc.textContent = isAll
        ? '恭喜完成光圈网页实验室全部 5 项空间跃迁与动量测试！'
        : `你已通过「${snap.title}」，准备进入下一实验舱。`;
      ui.overlayStats.textContent = `用时 ${snap.elapsedTime.toFixed(1)}s · 发射 ${snap.portalsFired} 次 · 跃迁 ${snap.teleportsCount} 次`;
      ui.btnNextLevel.textContent = isAll ? '重新从第 1 关开始' : '进入下一实验舱';
    } else {
      ui.overlay.classList.add('hidden');
    }
  }

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = WORLD_WIDTH * dpr;
    canvas.height = WORLD_HEIGHT * dpr;
    renderer.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderer.render(engine, 0);
  }

  function clientToWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * WORLD_WIDTH,
      y: ((clientY - rect.top) / rect.height) * WORLD_HEIGHT
    };
  }

  // 鼠标瞄准与发射
  canvas.addEventListener('mousemove', (e) => {
    const pt = clientToWorld(e.clientX, e.clientY);
    engine.setInput({ aimX: pt.x, aimY: pt.y });
  });

  canvas.addEventListener('mousedown', (e) => {
    sound.ensureContext();
    const pt = clientToWorld(e.clientX, e.clientY);
    engine.setInput({ aimX: pt.x, aimY: pt.y });
    if (e.button === 0) {
      engine.firePortal('blue', pt.x, pt.y);
    } else if (e.button === 2) {
      engine.firePortal('orange', pt.x, pt.y);
    }
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 0) return;
    e.preventDefault();
    sound.ensureContext();
    const t = e.touches[0];
    const pt = clientToWorld(t.clientX, t.clientY);
    engine.setInput({ aimX: pt.x, aimY: pt.y });
    engine.firePortal(touchPortalColor, pt.x, pt.y);
  }, { passive: false });

  // 键盘控制
  window.addEventListener('keydown', (e) => {
    sound.ensureContext();
    const code = e.code;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
      e.preventDefault();
    }
    if (code === 'KeyA' || code === 'ArrowLeft') engine.setInput({ left: true });
    if (code === 'KeyD' || code === 'ArrowRight') engine.setInput({ right: true });
    if (code === 'KeyW' || code === 'ArrowUp' || code === 'Space') {
      engine.setInput({ jumpPressed: true, jumpHeld: true });
    }
    if (code === 'KeyQ') engine.firePortal('orange');
    if (code === 'KeyE') engine.toggleCarryCube();
    if (code === 'KeyR') {
      ui.hintBanner.classList.add('hidden');
      engine.resetLevel();
    }
    if (code === 'KeyC') engine.clearPortals();
  });

  window.addEventListener('keyup', (e) => {
    const code = e.code;
    if (code === 'KeyA' || code === 'ArrowLeft') engine.setInput({ left: false });
    if (code === 'KeyD' || code === 'ArrowRight') engine.setInput({ right: false });
    if (code === 'KeyW' || code === 'ArrowUp' || code === 'Space') engine.setInput({ jumpHeld: false });
  });

  // 工具栏按钮绑定
  ui.levelSelect.addEventListener('change', (e) => {
    ui.hintBanner.classList.add('hidden');
    engine.loadLevel(Number(e.target.value));
  });

  ui.btnReset.addEventListener('click', () => {
    ui.hintBanner.classList.add('hidden');
    engine.resetLevel();
  });

  ui.btnClear.addEventListener('click', () => engine.clearPortals());

  ui.btnHint.addEventListener('click', () => {
    ui.hintBanner.classList.toggle('hidden');
  });

  ui.btnMute.addEventListener('click', () => {
    const muted = sound.toggleMute();
    ui.btnMute.textContent = muted ? '音效：关' : '音效：开';
  });

  ui.btnNextLevel.addEventListener('click', () => {
    ui.hintBanner.classList.add('hidden');
    if (engine.status === 'all_clear') {
      engine.loadLevel(0);
    } else {
      engine.nextLevel();
    }
  });

  ui.btnReplayLevel.addEventListener('click', () => {
    ui.hintBanner.classList.add('hidden');
    engine.resetLevel();
  });

  // 触屏 / 屏幕辅助按键绑定
  function bindHoldButton(id, onDown, onUp) {
    const el = document.getElementById(id);
    if (!el) return;
    const start = (e) => {
      e.preventDefault();
      sound.ensureContext();
      onDown();
    };
    const end = (e) => {
      e.preventDefault();
      onUp();
    };
    el.addEventListener('mousedown', start);
    el.addEventListener('mouseup', end);
    el.addEventListener('mouseleave', end);
    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('touchend', end, { passive: false });
    el.addEventListener('touchcancel', end, { passive: false });
  }

  bindHoldButton('touch-left', () => engine.setInput({ left: true }), () => engine.setInput({ left: false }));
  bindHoldButton('touch-right', () => engine.setInput({ right: true }), () => engine.setInput({ right: false }));
  bindHoldButton('touch-jump', () => engine.setInput({ jumpPressed: true, jumpHeld: true }), () => engine.setInput({ jumpHeld: false }));

  const touchPickup = document.getElementById('touch-pickup');
  if (touchPickup) {
    touchPickup.addEventListener('click', () => {
      sound.ensureContext();
      engine.toggleCarryCube();
    });
  }

  if (ui.touchModeBtn) {
    ui.touchModeBtn.addEventListener('click', () => {
      touchPortalColor = touchPortalColor === 'blue' ? 'orange' : 'blue';
      ui.touchModeBtn.textContent = touchPortalColor === 'blue' ? '点击发射：蓝门' : '点击发射：橙门';
      ui.touchModeBtn.classList.toggle('orange', touchPortalColor === 'orange');
    });
  }

  // 主循环（固定物理步长累加器）
  function loop(now) {
    if (!lastTime) lastTime = now;
    const frameDt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    accumulator += frameDt;

    while (accumulator >= FIXED_DT) {
      engine.step(FIXED_DT);
      accumulator -= FIXED_DT;
    }

    ui.statTime.textContent = `${engine.elapsedTime.toFixed(1)}s`;
    renderer.render(engine, frameDt);
    rafId = window.requestAnimationFrame(loop);
  }

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
  syncHUD(engine.getSnapshot());
  if (rafId) window.cancelAnimationFrame(rafId);
  rafId = window.requestAnimationFrame(loop);
}

window.addEventListener('load', bootstrap);
