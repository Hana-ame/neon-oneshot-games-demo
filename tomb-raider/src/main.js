/**
 * 浏览器入口与 UI 控制器
 * 管理键盘/触屏输入、固定时间步长循环、HUD 同步、关卡切换与本地最高分存储
 */

import { PHYSICS, GAME_STATE } from './constants.js';
import { TombRaiderEngine } from './engine.js';
import { SoundEngine } from './audio.js';
import { TombRenderer } from './renderer.js';

const STORAGE_KEY = 'tomb_raider_web_best_v1';

function loadBestRecord() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { bestScore: 0, bestRelics: 0 };
  } catch {
    return { bestScore: 0, bestRelics: 0 };
  }
}

function saveBestRecord(score, relics) {
  try {
    const prev = loadBestRecord();
    const next = {
      bestScore: Math.max(prev.bestScore || 0, score),
      bestRelics: Math.max(prev.bestRelics || 0, relics)
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch {
    return { bestScore: score, bestRelics: relics };
  }
}

function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function bootGame() {
  const canvas = document.getElementById('gameCanvas');
  const stageWrap = document.getElementById('stageWrap');
  const hpFill = document.getElementById('hpFill');
  const hpText = document.getElementById('hpText');
  const levelLabel = document.getElementById('levelLabel');
  const relicCount = document.getElementById('relicCount');
  const scoreVal = document.getElementById('scoreVal');
  const timerVal = document.getElementById('timerVal');
  const hintBar = document.getElementById('hintBar');
  const bossHud = document.getElementById('bossHud');
  const bossNameEl = document.getElementById('bossName');
  const bossHpFill = document.getElementById('bossHpFill');
  const toastEl = document.getElementById('toast');

  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlayDesc = document.getElementById('overlayDesc');
  const overlayStats = document.getElementById('overlayStats');
  const primaryBtn = document.getElementById('primaryActionBtn');
  const secondaryBtn = document.getElementById('secondaryActionBtn');
  const levelSelectRow = document.getElementById('levelSelectRow');

  const btnMute = document.getElementById('btnMute');
  const btnPause = document.getElementById('btnPause');
  const btnRestart = document.getElementById('btnRestart');
  const btnTouchToggle = document.getElementById('btnTouchToggle');
  const touchControls = document.getElementById('touchControls');

  const sound = new SoundEngine();
  const renderer = new TombRenderer(canvas);

  let toastTimer = null;
  function showToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('visible'), 2400);
  }

  const engine = new TombRaiderEngine({
    onSfx: (name) => sound.play(name),
    onToast: (msg) => showToast(msg)
  });

  // 键盘与触屏统一输入状态
  const keys = {
    left: false,
    right: false,
    up: false,
    down: false,
    jump: false,
    shoot: false
  };
  const edge = {
    jumpPressed: false,
    rollPressed: false,
    interactPressed: false
  };

  function handleResize() {
    const rect = stageWrap.getBoundingClientRect();
    const w = Math.max(320, Math.floor(rect.width));
    const h = Math.max(260, Math.floor(rect.height));
    renderer.resize(w, h);
    renderer.render(engine);
  }

  window.addEventListener('resize', handleResize);
  handleResize();

  const keyMap = {
    ArrowLeft: 'left',
    KeyA: 'left',
    ArrowRight: 'right',
    KeyD: 'right',
    ArrowUp: 'up',
    KeyW: 'up',
    ArrowDown: 'down',
    KeyS: 'down',
    Space: 'jump',
    KeyJ: 'shoot',
    KeyZ: 'shoot'
  };

  window.addEventListener('keydown', (e) => {
    sound.unlock();
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (engine.state === GAME_STATE.PLAYING || engine.state === GAME_STATE.PAUSED) {
        engine.togglePause();
        syncOverlay();
      }
      return;
    }
    if (e.code === 'KeyR' && engine.state === GAME_STATE.PLAYING) {
      engine.loadLevel(engine.levelIndex, true);
      syncOverlay();
      return;
    }

    const mapped = keyMap[e.code];
    if (mapped) {
      e.preventDefault();
      if (mapped === 'jump' && !keys.jump) edge.jumpPressed = true;
      keys[mapped] = true;
    }
    if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyK') && !e.repeat) {
      e.preventDefault();
      edge.rollPressed = true;
    }
    if ((e.code === 'KeyE' || e.code === 'KeyF') && !e.repeat) {
      e.preventDefault();
      edge.interactPressed = true;
    }
  });

  window.addEventListener('keyup', (e) => {
    const mapped = keyMap[e.code];
    if (mapped) {
      keys[mapped] = false;
    }
  });

  // 画布鼠标点击射击支持
  canvas.addEventListener('mousedown', () => {
    sound.unlock();
    if (engine.state === GAME_STATE.PLAYING) {
      keys.shoot = true;
    }
  });
  window.addEventListener('mouseup', () => {
    keys.shoot = false;
  });

  // 触屏虚拟按键绑定
  function bindTouchHold(el, prop, triggerEdge = null) {
    if (!el) return;
    const onDown = (e) => {
      e.preventDefault();
      sound.unlock();
      if (prop) keys[prop] = true;
      if (triggerEdge) edge[triggerEdge] = true;
    };
    const onUp = (e) => {
      e.preventDefault();
      if (prop) keys[prop] = false;
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointerleave', onUp);
    el.addEventListener('pointercancel', onUp);
  }

  bindTouchHold(document.getElementById('tcLeft'), 'left');
  bindTouchHold(document.getElementById('tcRight'), 'right');
  bindTouchHold(document.getElementById('tcUp'), 'up');
  bindTouchHold(document.getElementById('tcDown'), 'down');
  bindTouchHold(document.getElementById('tcJump'), 'jump', 'jumpPressed');
  bindTouchHold(document.getElementById('tcShoot'), 'shoot');
  bindTouchHold(document.getElementById('tcRoll'), null, 'rollPressed');
  bindTouchHold(document.getElementById('tcInteract'), null, 'interactPressed');

  // 顶部工具栏按钮
  btnMute.addEventListener('click', () => {
    sound.unlock();
    const muted = sound.toggleMute();
    btnMute.textContent = muted ? '静音' : '音效';
  });

  btnPause.addEventListener('click', () => {
    sound.unlock();
    if (engine.state === GAME_STATE.PLAYING || engine.state === GAME_STATE.PAUSED) {
      engine.togglePause();
      syncOverlay();
    }
  });

  btnRestart.addEventListener('click', () => {
    sound.unlock();
    engine.loadLevel(engine.levelIndex, true);
    syncOverlay();
  });

  btnTouchToggle.addEventListener('click', () => {
    touchControls.classList.toggle('force-show');
  });

  // 关卡选择按钮
  levelSelectRow.querySelectorAll('button[data-level]').forEach((btn) => {
    btn.addEventListener('click', () => {
      sound.unlock();
      const idx = Number(btn.getAttribute('data-level')) || 0;
      engine.startNewGame(idx);
      syncOverlay();
    });
  });

  primaryBtn.addEventListener('click', () => {
    sound.unlock();
    if (engine.state === GAME_STATE.TITLE || engine.state === GAME_STATE.VICTORY) {
      engine.startNewGame(0);
    } else if (engine.state === GAME_STATE.PAUSED) {
      engine.togglePause();
    } else if (engine.state === GAME_STATE.LEVEL_CLEAR) {
      engine.nextLevel();
    } else if (engine.state === GAME_STATE.GAME_OVER) {
      engine.loadLevel(engine.levelIndex, true);
    }
    syncOverlay();
  });

  secondaryBtn.addEventListener('click', () => {
    sound.unlock();
    engine.startNewGame(0);
    syncOverlay();
  });

  let lastOverlayState = null;
  function syncOverlay() {
    const snap = engine.getHudSnapshot();
    lastOverlayState = snap.state;

    if (snap.state === GAME_STATE.PLAYING) {
      overlay.classList.add('hidden');
      return;
    }

    overlay.classList.remove('hidden');
    const best = loadBestRecord();
    secondaryBtn.classList.add('hidden');
    levelSelectRow.classList.add('hidden');

    if (snap.state === GAME_STATE.TITLE) {
      overlayTitle.textContent = '古墓丽影：太阳圣殿';
      overlayDesc.textContent =
        '化身劳拉深入失落神庙：运用抓崖攀爬、双枪射击、翻滚闪避与古墓机关解谜，收集全部圣物并击败黑曜石守卫！';
      overlayStats.textContent = `历史最高分：${best.bestScore} · 历史最多圣物：${best.bestRelics}/9`;
      primaryBtn.textContent = '开始探险';
      levelSelectRow.classList.remove('hidden');
    } else if (snap.state === GAME_STATE.PAUSED) {
      overlayTitle.textContent = '探险已暂停';
      overlayDesc.textContent = '按 P / ESC 或点击下方按钮继续探索古墓。';
      overlayStats.textContent = `当前关卡：${snap.levelName} · 分数：${snap.score}`;
      primaryBtn.textContent = '继续游戏';
      secondaryBtn.textContent = '重头开始';
      secondaryBtn.classList.remove('hidden');
    } else if (snap.state === GAME_STATE.LEVEL_CLEAR) {
      saveBestRecord(snap.score, snap.totalRelicsCollected);
      overlayTitle.textContent = `${snap.levelName} · 通关！`;
      overlayDesc.textContent = '你成功解开了神庙机关并抵达圣殿传送门，前方还有更深层的秘境等待探索。';
      overlayStats.textContent = `本关圣物：${snap.relicsInLevel}/${snap.relicsTotalInLevel} · 当前总分：${snap.score} · 用时：${formatTime(snap.elapsedTime)}`;
      primaryBtn.textContent = '进入下一关';
    } else if (snap.state === GAME_STATE.GAME_OVER) {
      saveBestRecord(snap.score, snap.totalRelicsCollected);
      overlayTitle.textContent = '探险受挫';
      overlayDesc.textContent = '古墓陷阱与守卫异常凶险，调整节奏并善用 Shift 翻滚无敌帧再试一次！';
      overlayStats.textContent = `当前总分：${snap.score} · 已收集圣物：${snap.totalRelicsCollected}`;
      primaryBtn.textContent = '重玩本关';
      secondaryBtn.textContent = '回到第一关';
      secondaryBtn.classList.remove('hidden');
    } else if (snap.state === GAME_STATE.VICTORY) {
      const updated = saveBestRecord(snap.score, snap.totalRelicsCollected);
      overlayTitle.textContent = '传奇达成 · 夺取太阳圣器！';
      overlayDesc.textContent = '恭喜你征服全部三座古墓、击溃黑曜石守卫，成功带回传说中的太阳圣器！';
      overlayStats.textContent = `最终得分：${snap.score} · 圣物收集：${snap.totalRelicsCollected}/9 · 总用时：${formatTime(snap.elapsedTime)} · 最高纪录：${updated.bestScore}`;
      primaryBtn.textContent = '再次挑战';
      levelSelectRow.classList.remove('hidden');
    }
  }

  function syncHud() {
    const snap = engine.getHudSnapshot();
    const pct = Math.max(0, Math.min(100, (snap.hp / snap.maxHp) * 100));
    hpFill.style.width = `${pct}%`;
    hpText.textContent = `${Math.ceil(snap.hp)} / ${snap.maxHp}`;
    levelLabel.textContent = snap.levelName;
    relicCount.textContent = `${snap.relicsInLevel}/${snap.relicsTotalInLevel}`;
    scoreVal.textContent = String(snap.score);
    timerVal.textContent = formatTime(snap.elapsedTime);
    hintBar.textContent = snap.hint;

    if (snap.boss && snap.boss.alive) {
      bossHud.classList.remove('hidden');
      bossNameEl.textContent = snap.boss.name;
      bossHpFill.style.width = `${Math.max(0, (snap.boss.hp / snap.boss.maxHp) * 100)}%`;
    } else {
      bossHud.classList.add('hidden');
    }

    if (snap.state !== lastOverlayState) {
      syncOverlay();
    }
  }

  syncOverlay();
  syncHud();

  let rafId = null;
  let lastTime = performance.now();
  let accumulator = 0;

  function frame(now) {
    const dt = Math.min(PHYSICS.MAX_DT, (now - lastTime) / 1000);
    lastTime = now;

    if (engine.state === GAME_STATE.PLAYING) {
      accumulator += dt;
      while (accumulator >= PHYSICS.FIXED_DT) {
        engine.step(PHYSICS.FIXED_DT, {
          left: keys.left,
          right: keys.right,
          up: keys.up,
          down: keys.down,
          jump: keys.jump,
          shoot: keys.shoot,
          jumpPressed: edge.jumpPressed,
          rollPressed: edge.rollPressed,
          interactPressed: edge.interactPressed
        });
        edge.jumpPressed = false;
        edge.rollPressed = false;
        edge.interactPressed = false;
        accumulator -= PHYSICS.FIXED_DT;
      }
    }

    renderer.render(engine);
    syncHud();
    rafId = window.requestAnimationFrame(frame);
  }

  if (rafId) cancelAnimationFrame(rafId);
  rafId = window.requestAnimationFrame(frame);
}

window.addEventListener('load', bootGame);
