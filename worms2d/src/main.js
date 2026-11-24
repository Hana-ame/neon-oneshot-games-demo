// Browser entry point: responsive canvas, keyboard + mouse + touch HUD, game loop

import { WORLD, TEAMS, THEMES, WEAPONS, WEAPON_MAP } from './constants.js';
import { WormsGame, PHASE } from './game.js';
import { WormsRenderer } from './renderer.js';

let game = null;
let renderer = null;
let rafId = null;
let lastTime = 0;
let accumulator = 0;

const keys = new Set();
const touchHold = { left: false, right: false, aimUp: false, aimDown: false };

function $(id) {
  return document.getElementById(id);
}

function resizeCanvas() {
  const canvas = $('game-canvas');
  const stage = $('stage-wrap');
  if (!canvas || !stage) return;
  const rect = stage.getBoundingClientRect();
  canvas.width = Math.max(320, Math.floor(rect.width));
  canvas.height = Math.max(260, Math.floor(rect.height));
  if (renderer && game) {
    renderer.render(game, 0);
  }
}

function buildWeaponBar() {
  const bar = $('weapon-bar');
  if (!bar) return;
  bar.innerHTML = '';

  for (const w of WEAPONS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'weapon-btn';
    btn.dataset.weaponId = w.id;
    btn.title = `${w.name} [${w.key}] — ${w.description}`;
    btn.innerHTML = `
      <span class="w-key">${w.key}</span>
      <span class="w-icon">${w.icon}</span>
      <span class="w-name">${w.name}</span>
      <span class="w-ammo" data-ammo-for="${w.id}">∞</span>
    `;
    btn.addEventListener('click', () => {
      game.sound.unlock();
      if (!game.isAiTurn()) {
        game.selectWeapon(w.id);
        syncHud();
      }
    });
    bar.appendChild(btn);
  }
}

function syncHud() {
  if (!game) return;
  const stats = game.getTeamStats();

  // Team HP bars
  const red = stats[0];
  const blue = stats[1];
  $('red-hp-text').textContent = `${red.totalHp} HP (${red.aliveCount})`;
  $('blue-hp-text').textContent = `${blue.totalHp} HP (${blue.aliveCount})`;
  $('red-hp-fill').style.width = `${(red.totalHp / Math.max(1, red.maxTotalHp)) * 100}%`;
  $('blue-hp-fill').style.width = `${(blue.totalHp / Math.max(1, blue.maxTotalHp)) * 100}%`;

  // Turn timer & round
  const activeTeam = TEAMS[game.activeTeamId];
  $('turn-badge').textContent = `R${game.turnNumber} · ${activeTeam.shortName}`;
  $('turn-badge').style.borderColor = activeTeam.color;

  const timerVal =
    game.phase === PHASE.RETREAT
      ? Math.ceil(game.retreatTimer)
      : game.phase === PHASE.PLAYER_TURN
      ? Math.ceil(Math.max(0, game.turnTimer))
      : '--';
  $('timer-val').textContent = `${timerVal}`;
  $('timer-val').classList.toggle('urgent', typeof timerVal === 'number' && timerVal <= 5);

  // Wind indicator
  const wind = game.wind;
  const windAbs = Math.abs(wind);
  const windPct = Math.min(100, windAbs);
  $('wind-val').textContent = wind === 0 ? '无风 0' : `${wind > 0 ? '→' : '←'} ${windAbs}`;
  const windBar = $('wind-bar-fill');
  if (wind >= 0) {
    windBar.style.left = '50%';
    windBar.style.width = `${windPct / 2}%`;
  } else {
    windBar.style.left = `${50 - windPct / 2}%`;
    windBar.style.width = `${windPct / 2}%`;
  }

  // Weapon bar active & ammo state
  const teamAmmo = game.teamAmmo[game.activeTeamId];
  const weaponBtns = document.querySelectorAll('.weapon-btn');
  weaponBtns.forEach((btn) => {
    const id = btn.dataset.weaponId;
    const ammo = teamAmmo[id];
    const ammoEl = btn.querySelector('.w-ammo');
    ammoEl.textContent = ammo === Infinity ? '∞' : `${ammo}`;
    btn.classList.toggle('active', game.selectedWeaponId === id);
    btn.disabled = ammo <= 0 || game.isAiTurn() || game.phase !== PHASE.PLAYER_TURN;
  });

  // Weapon hint text
  const curW = WEAPON_MAP[game.selectedWeaponId];
  const hint = $('weapon-hint');
  if (game.phase === PHASE.GAME_OVER) {
    hint.textContent = game.bannerText;
  } else if (game.isAiTurn()) {
    hint.textContent = 'AI 正在计算风力与弹道...';
  } else if (curW.id === 'airstrike') {
    hint.textContent = '空袭导弹已就绪：点击战场任意位置呼叫轰炸！';
  } else if (curW.id === 'shotgun') {
    hint.textContent = `霰弹枪：本回合剩余 ${game.shotsRemainingThisTurn} 发（空格/发射键开火）`;
  } else {
    hint.textContent = `${curW.name}：${curW.description}`;
  }

  // Banner overlay
  const banner = $('turn-banner');
  if (game.bannerTimer > 0 && game.bannerText) {
    banner.textContent = game.bannerText;
    banner.classList.add('visible');
  } else {
    banner.classList.remove('visible');
  }

  // Game Over modal
  const overModal = $('gameover-modal');
  if (game.phase === PHASE.GAME_OVER) {
    const title =
      game.winnerTeamId === -1
        ? '平局！'
        : `${TEAMS[game.winnerTeamId].name} 胜利！`;
    $('gameover-title').textContent = title;
    $('gameover-sub').textContent = `共激战 ${game.turnNumber} 回合 · 地图：${THEMES[game.themeId].name}`;
    overModal.classList.add('open');
  } else {
    overModal.classList.remove('open');
  }

  // Pause & Mute buttons
  $('btn-pause').textContent = game.paused ? '▶ 继续' : '⏸ 暂停';
  $('btn-mute').textContent = game.sound.muted ? '🔇 静音' : '🔊 音效';
}

function handleInputs(dt) {
  if (!game || game.paused || game.phase === PHASE.GAME_OVER || game.isAiTurn()) return;

  const moveLeft = keys.has('ArrowLeft') || keys.has('KeyA') || touchHold.left;
  const moveRight = keys.has('ArrowRight') || keys.has('KeyD') || touchHold.right;
  const aimUp = keys.has('ArrowUp') || keys.has('KeyW') || touchHold.aimUp;
  const aimDown = keys.has('ArrowDown') || keys.has('KeyS') || touchHold.aimDown;

  if (moveLeft && !moveRight) game.moveActiveWorm(-1, dt);
  if (moveRight && !moveLeft) game.moveActiveWorm(1, dt);
  if (aimUp && !aimDown) game.aimActiveWorm(-1.75 * dt);
  if (aimDown && !aimUp) game.aimActiveWorm(1.75 * dt);
}

function gameLoop(timestamp) {
  if (!lastTime) lastTime = timestamp;
  const frameDt = Math.min(0.05, (timestamp - lastTime) / 1000);
  lastTime = timestamp;

  if (!game.paused) {
    accumulator += frameDt;
    while (accumulator >= WORLD.FIXED_DT) {
      handleInputs(WORLD.FIXED_DT);
      game.step(WORLD.FIXED_DT);
      accumulator -= WORLD.FIXED_DT;
    }
  }

  renderer.render(game, frameDt);
  syncHud();
  rafId = requestAnimationFrame(gameLoop);
}

function startNewGame(options = {}) {
  const mode = options.mode ?? $('select-mode').value;
  const themeId = options.themeId ?? $('select-theme').value;
  const wormsPerTeam = Number(options.wormsPerTeam ?? $('select-worms').value) || 3;

  const prevMuted = game ? game.sound.muted : false;
  game = new WormsGame({ mode, themeId, wormsPerTeam });
  game.sound.setMuted(prevMuted);
  keys.clear();
  Object.keys(touchHold).forEach((k) => (touchHold[k] = false));
  $('gameover-modal').classList.remove('open');
  syncHud();
}

function bindEvents() {
  window.addEventListener('resize', resizeCanvas);

  // Keyboard controls
  window.addEventListener('keydown', (e) => {
    if (!game) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }
    game.sound.unlock();
    if (game.paused || game.phase === PHASE.GAME_OVER) return;

    keys.add(e.code);

    if (game.isAiTurn()) return;

    if (e.code === 'Space' && !e.repeat) {
      game.startCharge();
    } else if ((e.code === 'Enter' || e.code === 'KeyJ') && !e.repeat) {
      game.jumpActiveWorm(false);
    } else if ((e.code === 'Backspace' || e.code === 'KeyK') && !e.repeat) {
      game.jumpActiveWorm(true);
    } else if (e.code.startsWith('Digit') && !e.repeat) {
      const idx = Number(e.code.replace('Digit', '')) - 1;
      if (WEAPONS[idx]) game.selectWeapon(WEAPONS[idx].id);
    } else if (e.code === 'KeyP' && !e.repeat) {
      game.paused = !game.paused;
      syncHud();
    }
  });

  window.addEventListener('keyup', (e) => {
    keys.delete(e.code);
    if (e.code === 'Space' && game && !game.isAiTurn()) {
      game.releaseCharge();
    }
  });

  // Canvas pointer events: click for Airstrike, drag to pan camera
  const canvas = $('game-canvas');
  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let draggedDist = 0;

  canvas.addEventListener('pointerdown', (e) => {
    game.sound.unlock();
    dragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    draggedDist = 0;
  });

  window.addEventListener('pointermove', (e) => {
    if (!dragging || !game) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    draggedDist += Math.hypot(dx, dy);
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    if (draggedDist > 6) {
      game.panCamera(-dx * 1.25, -dy * 1.25);
    }
  });

  window.addEventListener('pointerup', (e) => {
    if (!dragging || !game) return;
    dragging = false;
    if (draggedDist < 8 && !game.isAiTurn() && game.selectedWeaponId === 'airstrike') {
      const rect = canvas.getBoundingClientRect();
      const world = renderer.screenToWorld(game, e.clientX - rect.left, e.clientY - rect.top);
      game.triggerAirstrikeAt(world.x, world.y);
    }
  });

  // Top bar buttons
  $('btn-new').addEventListener('click', () => {
    game.sound.unlock();
    startNewGame();
  });
  $('select-mode').addEventListener('change', () => startNewGame());
  $('select-theme').addEventListener('change', () => startNewGame());
  $('select-worms').addEventListener('change', () => startNewGame());

  $('btn-pause').addEventListener('click', () => {
    game.paused = !game.paused;
    syncHud();
  });

  $('btn-mute').addEventListener('click', () => {
    game.sound.unlock();
    game.sound.toggleMute();
    syncHud();
  });

  $('btn-help').addEventListener('click', () => {
    $('help-modal').classList.add('open');
  });
  $('btn-close-help').addEventListener('click', () => {
    $('help-modal').classList.remove('open');
  });
  $('btn-restart-modal').addEventListener('click', () => {
    game.sound.unlock();
    startNewGame();
  });

  // On-screen touch / click action controls
  const bindHold = (id, keyName) => {
    const el = $(id);
    if (!el) return;
    const onDown = (e) => {
      e.preventDefault();
      game.sound.unlock();
      touchHold[keyName] = true;
    };
    const onUp = () => {
      touchHold[keyName] = false;
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointerleave', onUp);
    el.addEventListener('pointercancel', onUp);
  };

  bindHold('ctrl-left', 'left');
  bindHold('ctrl-right', 'right');
  bindHold('ctrl-aim-up', 'aimUp');
  bindHold('ctrl-aim-down', 'aimDown');

  $('ctrl-jump').addEventListener('click', () => {
    game.sound.unlock();
    if (!game.isAiTurn()) game.jumpActiveWorm(false);
  });
  $('ctrl-backflip').addEventListener('click', () => {
    game.sound.unlock();
    if (!game.isAiTurn()) game.jumpActiveWorm(true);
  });

  const fireBtn = $('ctrl-fire');
  fireBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    game.sound.unlock();
    if (!game.isAiTurn()) game.startCharge();
  });
  const releaseFire = () => {
    if (game && !game.isAiTurn()) game.releaseCharge();
  };
  fireBtn.addEventListener('pointerup', releaseFire);
  fireBtn.addEventListener('pointerleave', releaseFire);
  fireBtn.addEventListener('pointercancel', releaseFire);
}

function init() {
  const canvas = $('game-canvas');
  renderer = new WormsRenderer(canvas);
  buildWeaponBar();
  startNewGame({ mode: 'ai', themeId: 'emerald', wormsPerTeam: 3 });
  bindEvents();
  resizeCanvas();

  if (rafId) cancelAnimationFrame(rafId);
  lastTime = 0;
  rafId = requestAnimationFrame(gameLoop);
}

window.addEventListener('load', init);
