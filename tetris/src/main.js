/**
 * 网页俄罗斯方块应用控制器
 * 负责主循环调度、键盘 DAS/ARR 自动连发、触屏按钮、最高分持久化与界面同步
 */

import { TetrisEngine } from './engine.js';
import { SoundEngine } from './audio.js';
import { TetrisRenderer } from './renderer.js';

const STORAGE_KEY_BEST = 'web_tetris_best_score_v1';
const DAS_MS = 140; // 首次按住延迟
const ARR_MS = 42;  // 连续重复间隔

function loadBestScore() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_BEST);
    const num = Number(raw);
    return Number.isFinite(num) && num >= 0 ? Math.floor(num) : 0;
  } catch (_) {
    return 0;
  }
}

function saveBestScore(score) {
  try {
    window.localStorage.setItem(STORAGE_KEY_BEST, String(Math.floor(score)));
  } catch (_) {
    // 忽略沙箱环境存储受限异常
  }
}

export function initTetrisApp() {
  const boardCanvas = document.getElementById('board-canvas');
  const holdCanvas = document.getElementById('hold-canvas');
  const nextCanvas = document.getElementById('next-canvas');

  const scoreEl = document.getElementById('stat-score');
  const bestEl = document.getElementById('stat-best');
  const levelEl = document.getElementById('stat-level');
  const linesEl = document.getElementById('stat-lines');
  const speedEl = document.getElementById('stat-speed');
  const statusBadgeEl = document.getElementById('status-badge');

  const overlayEl = document.getElementById('board-overlay');
  const overlayTitleEl = document.getElementById('overlay-title');
  const overlayDescEl = document.getElementById('overlay-desc');
  const overlayStatsEl = document.getElementById('overlay-stats');
  const overlayBtnEl = document.getElementById('overlay-action-btn');

  const btnPause = document.getElementById('btn-pause');
  const btnRestart = document.getElementById('btn-restart');
  const btnMute = document.getElementById('btn-mute');
  const btnGhost = document.getElementById('btn-ghost');
  const btnHelp = document.getElementById('btn-help');
  const helpModal = document.getElementById('help-modal');
  const btnCloseHelp = document.getElementById('btn-close-help');

  const sound = new SoundEngine();
  const renderer = new TetrisRenderer(boardCanvas, holdCanvas, nextCanvas);

  let bestScore = loadBestScore();
  let rafId = null;
  let lastTime = 0;

  // 键盘 DAS/ARR 状态
  const heldDir = { left: false, right: false, down: false };
  let activeHoriz = null;
  let dasTimer = 0;
  let arrTimer = 0;
  let softDropTimer = 0;

  const engine = new TetrisEngine({
    onEvent(ev) {
      switch (ev.type) {
        case 'move':
          sound.playMove();
          break;
        case 'rotate':
          sound.playRotate();
          break;
        case 'softDrop':
          sound.playSoftDrop();
          break;
        case 'hardDrop':
          sound.playHardDrop();
          break;
        case 'hold':
          sound.playHold();
          break;
        case 'lineClear':
          sound.playLineClear(ev.clearedCount, ev.isTSpin);
          if (ev.leveledUp) sound.playLevelUp();
          break;
        case 'gameover':
          sound.playGameOver();
          break;
        default:
          break;
      }
    },
  });

  function syncHud() {
    if (engine.score > bestScore) {
      bestScore = engine.score;
      saveBestScore(bestScore);
    }

    scoreEl.textContent = engine.score.toLocaleString('en-US');
    bestEl.textContent = bestScore.toLocaleString('en-US');
    levelEl.textContent = String(engine.level);
    linesEl.textContent = String(engine.lines);
    const intervalSec = (engine.getDropInterval() / 1000).toFixed(2);
    speedEl.textContent = `${intervalSec}s/格`;

    if (engine.status === 'idle') {
      statusBadgeEl.textContent = '待开始';
      statusBadgeEl.dataset.state = 'idle';
      btnPause.textContent = '暂停';
      btnPause.disabled = true;
      showOverlay('网页俄罗斯方块', '标准 SRS 旋转系统 · 7-Bag 公平发牌 · T-Spin 与连击计分', '', '开始游戏');
    } else if (engine.status === 'playing') {
      statusBadgeEl.textContent = '进行中';
      statusBadgeEl.dataset.state = 'playing';
      btnPause.textContent = '暂停';
      btnPause.disabled = false;
      hideOverlay();
    } else if (engine.status === 'paused') {
      statusBadgeEl.textContent = '已暂停';
      statusBadgeEl.dataset.state = 'paused';
      btnPause.textContent = '继续';
      btnPause.disabled = false;
      showOverlay('游戏已暂停', '按 P / Esc 或点击下方按钮继续当前对局', '', '继续游戏');
    } else if (engine.status === 'gameover') {
      statusBadgeEl.textContent = '已结束';
      statusBadgeEl.dataset.state = 'gameover';
      btnPause.textContent = '暂停';
      btnPause.disabled = true;
      const summary = `得分 ${engine.score.toLocaleString('en-US')} · 消行 ${engine.lines} · 等级 Lv.${engine.level}`;
      showOverlay('游戏结束', '本局统计已记录，随时开启新一局挑战更高分！', summary, '再来一局');
    }
  }

  function showOverlay(title, desc, stats, btnLabel) {
    overlayTitleEl.textContent = title;
    overlayDescEl.textContent = desc;
    overlayStatsEl.textContent = stats;
    overlayStatsEl.hidden = !stats;
    overlayBtnEl.textContent = btnLabel;
    overlayEl.hidden = false;
  }

  function hideOverlay() {
    overlayEl.hidden = true;
  }

  function startOrResume() {
    sound.unlock();
    if (engine.status === 'idle' || engine.status === 'gameover') {
      engine.start();
    } else if (engine.status === 'paused') {
      engine.togglePause();
    }
    syncHud();
    renderer.render(engine);
  }

  function restartGame() {
    sound.unlock();
    engine.start();
    syncHud();
    renderer.render(engine);
  }

  function handleAction(action) {
    sound.unlock();
    if (action === 'start') {
      startOrResume();
      return;
    }
    if (action === 'restart') {
      restartGame();
      return;
    }
    if (action === 'pause') {
      if (engine.status === 'playing' || engine.status === 'paused') {
        engine.togglePause();
        syncHud();
      }
      return;
    }
    if (engine.status !== 'playing') return;

    switch (action) {
      case 'left':
        engine.move(-1);
        break;
      case 'right':
        engine.move(1);
        break;
      case 'softDrop':
        engine.softDrop();
        break;
      case 'hardDrop':
        engine.hardDrop();
        break;
      case 'rotateCW':
        engine.rotate(1);
        break;
      case 'rotateCCW':
        engine.rotate(-1);
        break;
      case 'hold':
        engine.hold();
        break;
      default:
        break;
    }
    syncHud();
    renderer.render(engine);
  }

  // 键盘事件
  window.addEventListener('keydown', (e) => {
    if (!helpModal.hidden) {
      if (e.key === 'Escape') {
        helpModal.hidden = true;
      }
      return;
    }

    const preventKeys = ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Space', ' '];
    if (preventKeys.includes(e.key) || preventKeys.includes(e.code)) {
      e.preventDefault();
    }

    sound.unlock();

    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (!e.repeat) handleAction('pause');
      return;
    }
    if (e.code === 'KeyR') {
      if (!e.repeat) handleAction('restart');
      return;
    }
    if (e.code === 'KeyM') {
      if (!e.repeat) toggleMute();
      return;
    }

    if (engine.status === 'idle' && (e.code === 'Space' || e.code === 'Enter')) {
      if (!e.repeat) startOrResume();
      return;
    }

    if (engine.status !== 'playing') return;

    if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
      if (!heldDir.left) {
        heldDir.left = true;
        activeHoriz = 'left';
        dasTimer = 0;
        arrTimer = 0;
        engine.move(-1);
        syncHud();
      }
    } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
      if (!heldDir.right) {
        heldDir.right = true;
        activeHoriz = 'right';
        dasTimer = 0;
        arrTimer = 0;
        engine.move(1);
        syncHud();
      }
    } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      if (!heldDir.down) {
        heldDir.down = true;
        softDropTimer = 0;
        engine.softDrop();
        syncHud();
      }
    } else if (!e.repeat) {
      if (e.code === 'ArrowUp' || e.code === 'KeyX' || e.code === 'KeyW') {
        handleAction('rotateCW');
      } else if (e.code === 'KeyZ' || e.code === 'ControlLeft' || e.code === 'ControlRight') {
        handleAction('rotateCCW');
      } else if (e.code === 'Space') {
        handleAction('hardDrop');
      } else if (e.code === 'KeyC' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        handleAction('hold');
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
      heldDir.left = false;
      activeHoriz = heldDir.right ? 'right' : null;
      dasTimer = 0;
      arrTimer = 0;
    } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
      heldDir.right = false;
      activeHoriz = heldDir.left ? 'left' : null;
      dasTimer = 0;
      arrTimer = 0;
    } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      heldDir.down = false;
      softDropTimer = 0;
    }
  });

  function toggleMute() {
    const muted = sound.toggleMute();
    btnMute.textContent = muted ? '音效: 关' : '音效: 开';
    btnMute.setAttribute('aria-pressed', String(!muted));
  }

  function toggleGhost() {
    renderer.showGhost = !renderer.showGhost;
    btnGhost.textContent = renderer.showGhost ? '投影: 开' : '投影: 关';
    btnGhost.setAttribute('aria-pressed', String(renderer.showGhost));
    renderer.render(engine);
  }

  // 按钮绑定
  overlayBtnEl.addEventListener('click', startOrResume);
  btnPause.addEventListener('click', () => handleAction('pause'));
  btnRestart.addEventListener('click', () => handleAction('restart'));
  btnMute.addEventListener('click', toggleMute);
  btnGhost.addEventListener('click', toggleGhost);
  btnHelp.addEventListener('click', () => {
    if (engine.status === 'playing') {
      engine.togglePause();
      syncHud();
    }
    helpModal.hidden = false;
  });
  btnCloseHelp.addEventListener('click', () => {
    helpModal.hidden = true;
  });
  helpModal.addEventListener('click', (e) => {
    if (e.target === helpModal) {
      helpModal.hidden = true;
    }
  });

  // 触控/屏幕虚拟按键绑定
  document.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      handleAction(btn.getAttribute('data-action'));
    });
  });

  window.addEventListener('resize', () => {
    renderer.resize();
    renderer.render(engine);
  });

  function loop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const deltaMs = Math.min(100, Math.max(0, timestamp - lastTime));
    lastTime = timestamp;

    if (engine.status === 'playing') {
      // 处理水平方向 DAS/ARR
      if (activeHoriz) {
        dasTimer += deltaMs;
        if (dasTimer >= DAS_MS) {
          arrTimer += deltaMs;
          while (arrTimer >= ARR_MS) {
            arrTimer -= ARR_MS;
            engine.move(activeHoriz === 'left' ? -1 : 1);
          }
        }
      }
      // 处理长按软降
      if (heldDir.down) {
        softDropTimer += deltaMs;
        while (softDropTimer >= 45) {
          softDropTimer -= 45;
          engine.softDrop();
        }
      }
    }

    const prevScore = engine.score;
    const prevStatus = engine.status;
    const prevLines = engine.lines;

    engine.update(deltaMs);
    if (engine.score !== prevScore || engine.status !== prevStatus || engine.lines !== prevLines) {
      syncHud();
    }
    renderer.render(engine);
    rafId = window.requestAnimationFrame(loop);
  }

  // 启动前先清理旧帧循环
  if (rafId !== null) {
    window.cancelAnimationFrame(rafId);
  }
  syncHud();
  renderer.render(engine);
  rafId = window.requestAnimationFrame(loop);
}

if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    initTetrisApp();
  });
}
