// Browser Bootstrap, Input Controller, HUD Synchronization & Main Loop

import { ROOM_W, ROOM_H } from './game/constants.js';
import { SoundEngine } from './engine/audio.js';
import { BulletDungeonEngine } from './game/gameEngine.js';
import { DungeonRenderer } from './game/renderer.js';

const STORAGE_KEY = 'bullet_dungeon_best_score_v1';

function loadBestScore() {
  try {
    return Number(localStorage.getItem(STORAGE_KEY) || 0);
  } catch (_) {
    return 0;
  }
}

function saveBestScore(score) {
  try {
    const prev = loadBestScore();
    if (score > prev) {
      localStorage.setItem(STORAGE_KEY, String(score));
      return score;
    }
    return prev;
  } catch (_) {
    return score;
  }
}

function initApp() {
  const canvas = document.getElementById('gameCanvas');
  const stageWrap = document.getElementById('stageWrap');
  const toastEl = document.getElementById('toast');
  const overlayEl = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlaySubtitle = document.getElementById('overlaySubtitle');
  const startBtn = document.getElementById('startBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const muteBtn = document.getElementById('muteBtn');
  const restartBtn = document.getElementById('restartBtn');
  const weaponStrip = document.getElementById('weaponStrip');

  const heartsEl = document.getElementById('hudHearts');
  const armorEl = document.getElementById('hudArmor');
  const blanksEl = document.getElementById('hudBlanks');
  const coinsEl = document.getElementById('hudCoins');
  const floorEl = document.getElementById('hudFloor');
  const scoreEl = document.getElementById('hudScore');
  const bestEl = document.getElementById('hudBest');

  canvas.width = ROOM_W;
  canvas.height = ROOM_H;

  let toastTimer = null;
  const showToast = (msg) => {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
  };

  const sound = new SoundEngine();
  const engine = new BulletDungeonEngine({
    seed: Date.now() & 0xfffffff,
    onSound: (s) => sound.play(s),
    onToast: showToast
  });
  const renderer = new DungeonRenderer(canvas);

  let bestScore = loadBestScore();
  bestEl.textContent = String(bestScore);

  const keys = new Set();
  const touchMove = { x: 0, y: 0 };
  let mouseDown = false;
  let touchFire = false;
  let pendingRoll = false;
  let pendingBlank = false;
  let pendingReload = false;
  let pendingInteract = false;
  const mouseWorld = { x: ROOM_W / 2 + 80, y: ROOM_H / 2 };

  function resizeCanvas() {
    const rect = stageWrap.getBoundingClientRect();
    const scale = Math.min(rect.width / ROOM_W, rect.height / ROOM_H);
    canvas.style.width = `${Math.floor(ROOM_W * scale)}px`;
    canvas.style.height = `${Math.floor(ROOM_H * scale)}px`;
    renderer.render(engine, mouseWorld);
  }

  function updateMouseFromClient(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    mouseWorld.x = ((clientX - rect.left) / rect.width) * ROOM_W;
    mouseWorld.y = ((clientY - rect.top) / rect.height) * ROOM_H;
  }

  function syncOverlay() {
    if (engine.state === 'playing') {
      overlayEl.classList.add('hidden');
      pauseBtn.textContent = '暂停 (P)';
      return;
    }
    overlayEl.classList.remove('hidden');
    if (engine.state === 'title') {
      overlayTitle.textContent = '枪弹地牢 · BULLET DUNGEON';
      overlaySubtitle.textContent =
        '在程序生成的三层地牢中穿梭弹幕，善用翻滚无敌帧与空白清弹，击败每层守关 Boss！';
      startBtn.textContent = '开始探险';
    } else if (engine.state === 'paused') {
      overlayTitle.textContent = '游戏已暂停';
      overlaySubtitle.textContent = `当前楼层：第 ${engine.floor} 层 · 得分：${engine.score} · 击杀：${engine.kills}`;
      startBtn.textContent = '继续战斗';
      pauseBtn.textContent = '继续 (P)';
    } else if (engine.state === 'gameover') {
      bestScore = saveBestScore(engine.score);
      bestEl.textContent = String(bestScore);
      overlayTitle.textContent = '探险失败';
      overlaySubtitle.textContent = `抵达第 ${engine.floor} 层 · 击杀 ${engine.kills} 名敌人 · 最终得分 ${engine.score}（最高 ${bestScore}）`;
      startBtn.textContent = '重新挑战';
    } else if (engine.state === 'victory') {
      bestScore = saveBestScore(engine.score);
      bestEl.textContent = String(bestScore);
      overlayTitle.textContent = '征服枪弹地牢！';
      overlaySubtitle.textContent = `全部 3 层通关 · 击杀 ${engine.kills} 名敌人 · 最终得分 ${engine.score}（最高 ${bestScore}）`;
      startBtn.textContent = '再来一局';
    }
  }

  function syncHud() {
    const p = engine.player;
    const fullHearts = Math.floor(p.hp / 2);
    const halfHeart = p.hp % 2;
    const emptyHearts = Math.max(0, Math.floor(p.maxHp / 2) - fullHearts - halfHeart);
    heartsEl.textContent = '♥'.repeat(fullHearts) + (halfHeart ? '♡' : '') + '·'.repeat(emptyHearts);
    armorEl.textContent = String(p.armor);
    blanksEl.textContent = String(p.blanks);
    coinsEl.textContent = String(p.coins);
    floorEl.textContent = `F${engine.floor}`;
    scoreEl.textContent = String(engine.score);

    // Weapon strip
    weaponStrip.innerHTML = '';
    p.weapons.forEach((w, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `weapon-slot${idx === p.weaponIndex ? ' active' : ''}${
        w.unlocked ? '' : ' locked'
      }`;
      const ammoText = !w.unlocked
        ? '未解锁'
        : w.reloadTimer > 0
        ? '装弹中...'
        : `${w.mag}/${w.reserve === Infinity ? '∞' : w.reserve}`;
      btn.innerHTML = `<span class="w-name">[${idx + 1}] ${w.shortName}</span><span class="w-ammo">${ammoText}</span>`;
      btn.addEventListener('click', () => {
        sound.unlock();
        if (engine.switchWeapon(idx)) syncHud();
      });
      weaponStrip.appendChild(btn);
    });
  }

  // Event listeners
  window.addEventListener('resize', resizeCanvas);

  canvas.addEventListener('mousemove', (e) => {
    updateMouseFromClient(e.clientX, e.clientY);
  });

  canvas.addEventListener('mousedown', (e) => {
    sound.unlock();
    updateMouseFromClient(e.clientX, e.clientY);
    if (e.button === 0) mouseDown = true;
    if (e.button === 2) pendingRoll = true;
  });

  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouseDown = false;
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener(
    'wheel',
    (e) => {
      if (engine.state !== 'playing') return;
      e.preventDefault();
      engine.cycleWeapon(e.deltaY > 0 ? 1 : -1);
      syncHud();
    },
    { passive: false }
  );

  window.addEventListener('keydown', (e) => {
    const code = e.code;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
      e.preventDefault();
    }
    sound.unlock();
    keys.add(code);

    if (code === 'KeyP' || code === 'Escape') {
      if (engine.state === 'playing' || engine.state === 'paused') {
        engine.togglePause();
        syncOverlay();
      }
      return;
    }
    if (engine.state !== 'playing') return;

    if (code === 'Space' || code === 'ShiftLeft' || code === 'ShiftRight') {
      pendingRoll = true;
    } else if (code === 'KeyQ') {
      pendingBlank = true;
    } else if (code === 'KeyR') {
      pendingReload = true;
    } else if (code === 'KeyE') {
      pendingInteract = true;
    } else if (code === 'Digit1') {
      engine.switchWeapon(0);
    } else if (code === 'Digit2') {
      engine.switchWeapon(1);
    } else if (code === 'Digit3') {
      engine.switchWeapon(2);
    } else if (code === 'Digit4') {
      engine.switchWeapon(3);
    }
  });

  window.addEventListener('keyup', (e) => {
    keys.delete(e.code);
  });

  startBtn.addEventListener('click', () => {
    sound.unlock();
    engine.startGame();
    syncOverlay();
    syncHud();
  });

  pauseBtn.addEventListener('click', () => {
    sound.unlock();
    if (engine.state === 'playing' || engine.state === 'paused') {
      engine.togglePause();
      syncOverlay();
    }
  });

  muteBtn.addEventListener('click', () => {
    sound.unlock();
    const muted = sound.toggleMute();
    muteBtn.textContent = muted ? '音效: 关' : '音效: 开';
  });

  restartBtn.addEventListener('click', () => {
    sound.unlock();
    engine.reset(Date.now() & 0xfffffff);
    engine.startGame();
    syncOverlay();
    syncHud();
  });

  // Touch / on-screen controls
  const bindHold = (id, onDown, onUp) => {
    const el = document.getElementById(id);
    if (!el) return;
    const start = (e) => {
      e.preventDefault();
      sound.unlock();
      onDown();
    };
    const end = (e) => {
      e.preventDefault();
      onUp();
    };
    el.addEventListener('pointerdown', start);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointerleave', end);
    el.addEventListener('pointercancel', end);
  };

  bindHold('btnUp', () => (touchMove.y = -1), () => (touchMove.y = 0));
  bindHold('btnDown', () => (touchMove.y = 1), () => (touchMove.y = 0));
  bindHold('btnLeft', () => (touchMove.x = -1), () => (touchMove.x = 0));
  bindHold('btnRight', () => (touchMove.x = 1), () => (touchMove.x = 0));
  bindHold('btnFire', () => (touchFire = true), () => (touchFire = false));

  const bindTap = (id, fn) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', () => {
      sound.unlock();
      fn();
    });
  };
  bindTap('btnRoll', () => (pendingRoll = true));
  bindTap('btnBlank', () => (pendingBlank = true));
  bindTap('btnReload', () => (pendingReload = true));
  bindTap('btnInteract', () => (pendingInteract = true));

  // Main animation loop
  let lastTime = performance.now();
  let hudAccum = 0;
  let lastState = engine.state;
  let rafId = null;

  function frame(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    if (engine.state === 'playing') {
      let mx = touchMove.x;
      let my = touchMove.y;
      if (keys.has('KeyW') || keys.has('ArrowUp')) my -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) my += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;

      // Auto-aim nearest enemy when using touch fire
      let aimAngle = Math.atan2(mouseWorld.y - engine.player.y, mouseWorld.x - engine.player.x);
      if (touchFire && engine.enemies.length > 0) {
        let nearest = engine.enemies[0];
        let bestD = Infinity;
        for (const e of engine.enemies) {
          const d = Math.hypot(e.x - engine.player.x, e.y - engine.player.y);
          if (d < bestD) {
            bestD = d;
            nearest = e;
          }
        }
        aimAngle = Math.atan2(nearest.y - engine.player.y, nearest.x - engine.player.x);
      }

      engine.step(dt, {
        moveX: mx,
        moveY: my,
        aimAngle,
        fire: mouseDown || touchFire,
        roll: pendingRoll,
        blank: pendingBlank,
        reload: pendingReload,
        interact: pendingInteract
      });

      pendingRoll = false;
      pendingBlank = false;
      pendingReload = false;
      pendingInteract = false;
    }

    if (engine.state !== lastState) {
      lastState = engine.state;
      syncOverlay();
    }

    hudAccum += dt;
    if (hudAccum >= 0.08) {
      hudAccum = 0;
      syncHud();
    }

    renderer.render(engine, mouseWorld);
    rafId = requestAnimationFrame(frame);
  }

  resizeCanvas();
  syncHud();
  syncOverlay();
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(frame);
}

window.addEventListener('load', initApp);
