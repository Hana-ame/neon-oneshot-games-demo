import { PHASES, PLAYER_CONFIG, TEAMS, WEAPONS } from './engine/constants.js';
import { GameState } from './engine/game_state.js';
import { SoundEngine } from './engine/audio.js';
import { FPSRenderer } from './engine/renderer.js';

function initApp() {
  const canvas = document.getElementById('fps-canvas');
  const radarCanvas = document.getElementById('radar-canvas');
  if (!canvas) return;

  const sound = new SoundEngine();
  const renderer = new FPSRenderer(canvas, radarCanvas);

  let selectedTeam = TEAMS.CT;
  let selectedDiff = 'normal';
  let paused = false;
  let buyMenuOpen = false;
  let scoreboardOpen = false;
  let touchVisible = false;
  let animFrameId = null;

  const keys = Object.create(null);
  const padState = { fwd: 0, strafe: 0, turn: 0, fire: false, use: false };
  let mouseDown = false;
  let draggingLook = false;
  let lastPointerX = 0;
  let lastPointerY = 0;

  const game = new GameState({
    playerTeam: selectedTeam,
    difficulty: selectedDiff,
    onEvent: (type, payload) => {
      if (type === 'weapon_fire') {
        sound.playShot(payload.weaponId, payload.isPlayer ? 0.36 : 0.14);
      } else if (type === 'hit_confirm') {
        sound.playHit(payload.headshot);
      } else if (type === 'bomb_beep') {
        sound.playBeep();
      } else if (type === 'bomb_exploded') {
        sound.playExplosion();
      } else if (type === 'buy_success') {
        sound.playClick();
      }
    },
  });

  // DOM references
  const menuOverlay = document.getElementById('menu-overlay');
  const buyOverlay = document.getElementById('buy-overlay');
  const scoreOverlay = document.getElementById('score-overlay');
  const matchOverOverlay = document.getElementById('matchover-overlay');
  const buyGrid = document.getElementById('buy-grid');
  const buyMoneyEl = document.getElementById('buy-money');
  const buyMsgEl = document.getElementById('buy-msg');

  const elCtScore = document.getElementById('ct-score');
  const elTScore = document.getElementById('t-score');
  const elCtAlive = document.getElementById('ct-alive');
  const elTAlive = document.getElementById('t-alive');
  const elPhaseTag = document.getElementById('phase-tag');
  const elClockVal = document.getElementById('clock-val');
  const elKillFeed = document.getElementById('kill-feed');
  const elAnnounce = document.getElementById('announce-box');
  const elAnnounceTitle = document.getElementById('announce-title');
  const elAnnounceSub = document.getElementById('announce-sub');
  const elActionProg = document.getElementById('action-progress');
  const elActionLabel = document.getElementById('action-progress-label');
  const elActionFill = document.getElementById('action-progress-fill');

  const elHp = document.getElementById('hud-hp');
  const elArmor = document.getElementById('hud-armor');
  const elMoney = document.getElementById('hud-money');
  const elAmmo = document.getElementById('hud-ammo');
  const elWeaponName = document.getElementById('hud-weapon-name');
  const elSlots = document.getElementById('hud-slots');
  const elBombHint = document.getElementById('hud-bomb-hint');
  const elMuteBtn = document.getElementById('btn-mute');
  const elPadBtn = document.getElementById('btn-pad');
  const elBuyBtn = document.getElementById('btn-buy');
  const elTouchControls = document.getElementById('touch-controls');

  function formatClock(sec) {
    const s = Math.max(0, Math.ceil(sec));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem < 10 ? '0' : ''}${rem}`;
  }

  function renderBuyMenu() {
    if (!buyGrid) return;
    const p = game.player;
    buyMoneyEl.textContent = `$${p.money}`;
    const check = game.canBuy(p);

    const items = [
      { id: 'deagle', name: 'Desert Eagle', cat: 'Pistol · High Pen', cost: WEAPONS.deagle.cost, team: 'BOTH' },
      { id: 'mp5', name: 'MP5-SD', cat: 'SMG · $600 Kill', cost: WEAPONS.mp5.cost, team: 'BOTH' },
      { id: 'ak47', name: 'AK-47', cat: 'T Rifle · 1-Tap HS', cost: WEAPONS.ak47.cost, team: 'T' },
      { id: 'm4a1', name: 'M4A1-S', cat: 'CT Rifle · Silenced', cost: WEAPONS.m4a1.cost, team: 'CT' },
      { id: 'awp', name: 'AWP', cat: 'Sniper · Scope [F/RMB]', cost: WEAPONS.awp.cost, team: 'BOTH' },
      { id: 'kevlar', name: 'Kevlar Vest', cat: '100 Body Armor', cost: PLAYER_CONFIG.KEVLAR_COST, team: 'BOTH' },
      { id: 'helmet', name: 'Kevlar + Helmet', cat: 'Full Armor + Head', cost: p.armor >= 100 ? 350 : PLAYER_CONFIG.HELMET_COST, team: 'BOTH' },
      { id: 'defuse_kit', name: 'Defuse Kit', cat: 'CT · 5s Defuse', cost: PLAYER_CONFIG.DEFUSE_KIT_COST, team: 'CT' },
    ];

    buyGrid.innerHTML = '';
    for (const item of items) {
      if (item.team !== 'BOTH' && item.team !== p.team) continue;
      const btn = document.createElement('button');
      btn.className = 'buy-item';
      btn.disabled = !check.allowed || p.money < item.cost;
      btn.innerHTML = `<div class="name">${item.name}</div><div class="meta">${item.cat}</div><div class="price">$${item.cost}</div>`;
      btn.addEventListener('click', () => {
        const res = game.buyForPlayer(item.id);
        buyMsgEl.textContent = res.ok ? `Purchased ${res.item}` : `Cannot buy: ${res.reason}`;
        renderBuyMenu();
      });
      buyGrid.appendChild(btn);
    }

    if (!check.allowed) {
      buyMsgEl.textContent = !check.inPhase ? 'Buy time expired.' : !check.inZone ? 'Return to spawn buy zone.' : 'Unavailable.';
    }
  }

  function renderScoreboard() {
    const tbody = document.getElementById('score-tbody');
    if (!tbody) return;
    const sorted = [...game.combatants].sort((a, b) => {
      if (a.team !== b.team) return a.team === TEAMS.CT ? -1 : 1;
      return b.kills - a.kills;
    });
    tbody.innerHTML = sorted.map((c) => `
      <tr style="opacity:${c.alive ? 1 : 0.55}">
        <td style="color:${c.team === TEAMS.CT ? '#38bdf8' : '#f59e0b'};font-weight:700">${c.team}</td>
        <td>${c.name}${c.hasBomb ? ' [C4]' : ''}</td>
        <td>${c.alive ? 'ALIVE' : 'DEAD'}</td>
        <td>${c.kills}</td>
        <td>${c.deaths}</td>
        <td style="color:#4ade80">$${c.money}</td>
      </tr>
    `).join('');
  }

  function toggleBuyMenu(force) {
    if (game.phase === PHASES.MENU || game.phase === PHASES.MATCH_OVER) return;
    buyMenuOpen = typeof force === 'boolean' ? force : !buyMenuOpen;
    buyOverlay.classList.toggle('hidden', !buyMenuOpen);
    if (buyMenuOpen) {
      if (document.pointerLockElement === canvas && document.exitPointerLock) {
        document.exitPointerLock();
      }
      renderBuyMenu();
    }
  }

  function updateHUD() {
    const alive = game.getAliveCounts();
    elCtScore.textContent = String(game.scores.CT);
    elTScore.textContent = String(game.scores.T);
    elCtAlive.textContent = `${alive.CT} ALIVE`;
    elTAlive.textContent = `${alive.T} ALIVE`;

    elPhaseTag.textContent = game.phase === PHASES.BOMB_PLANTED ? 'C4 PLANTED' : game.phase;
    elPhaseTag.classList.toggle('bomb', game.phase === PHASES.BOMB_PLANTED);
    elClockVal.textContent = formatClock(game.phaseTimer);

    const p = game.player;
    elHp.textContent = String(p.hp);
    elHp.classList.toggle('hp-low', p.hp <= 30);
    elArmor.textContent = `${p.armor}${p.hasHelmet ? '+H' : ''}`;
    elMoney.textContent = `$${p.money}`;

    const w = p.getActiveWeapon();
    const spec = p.getActiveWeaponSpec();
    elWeaponName.textContent = w.reloading ? `${spec.name} (RELOADING...)` : spec.name;
    elAmmo.textContent = spec.magSize > 0 ? `${w.ammo} / ${w.reserve}` : 'INF';

    // Weapon slots
    const slotsHtml = [1, 2, 3].map((s) => {
      const sw = p.inventory[s];
      const label = sw ? WEAPONS[sw.id].name.split(' ')[0] : '—';
      return `<span class="slot-pill ${p.activeSlot === s ? 'active' : ''}">[${s}] ${label}</span>`;
    }).join('');
    elSlots.innerHTML = slotsHtml;

    // Bomb / Buy contextual hint
    let hint = '';
    if (game.phase === PHASES.BUY) hint = 'BUY PHASE · Press [B] to Buy or [Space] to Start';
    else if (p.team === TEAMS.T && p.hasBomb && game.map.getBombsiteAt(p.x, p.y)) {
      hint = 'Hold [E] to Plant C4';
    } else if (p.team === TEAMS.CT && game.bomb.state === 'PLANTED' && Math.hypot(p.x - game.bomb.x, p.y - game.bomb.y) <= 1.6) {
      hint = `Hold [E] to Defuse C4 (${p.hasDefuseKit ? '5s Kit' : '10s'})`;
    }
    elBombHint.textContent = hint;

    // Progress bar for planting/defusing
    if (game.bomb.state === 'PLANTING' && game.bomb.planterId === p.id) {
      elActionProg.classList.remove('hidden');
      elActionLabel.textContent = 'PLANTING C4...';
      elActionFill.style.width = `${Math.min(100, (game.bomb.plantProgress / 3.2) * 100)}%`;
    } else if (game.bomb.defuserId === p.id && game.bomb.defuseProgress > 0) {
      const req = p.hasDefuseKit ? 5.0 : 10.0;
      elActionProg.classList.remove('hidden');
      elActionLabel.textContent = 'DEFUSING C4...';
      elActionFill.style.width = `${Math.min(100, (game.bomb.defuseProgress / req) * 100)}%`;
    } else {
      elActionProg.classList.add('hidden');
    }

    // Announcements
    if (game.announcement.timer > 0) {
      elAnnounce.classList.remove('hidden');
      elAnnounceTitle.textContent = game.announcement.text;
      elAnnounceSub.textContent = game.announcement.subtext;
    } else {
      elAnnounce.classList.add('hidden');
    }

    // Kill feed
    elKillFeed.innerHTML = game.killFeed.map((k) => `
      <div class="kill-item">
        <span class="${k.killerTeam === TEAMS.CT ? 'ct-name' : 't-name'}">${k.killer}</span>
        <span> [${k.weapon}] </span>
        ${k.headshot ? '<span class="hs-badge">HS</span>' : ''}
        <span class="${k.victimTeam === TEAMS.CT ? 'ct-name' : 't-name'}">${k.victim}</span>
      </div>
    `).join('');

    // Match over overlay
    if (game.phase === PHASES.MATCH_OVER) {
      matchOverOverlay.classList.remove('hidden');
      document.getElementById('matchover-title').textContent = `${game.matchWinner} VICTORY`;
      document.getElementById('matchover-score').textContent = `FINAL SCORE  CT ${game.scores.CT} : ${game.scores.T} T  |  YOUR K/D: ${p.kills}/${p.deaths}`;
    } else {
      matchOverOverlay.classList.add('hidden');
    }
  }

  // Menu & UI button bindings
  document.getElementById('pick-ct').addEventListener('click', () => {
    selectedTeam = TEAMS.CT;
    document.getElementById('pick-ct').classList.add('active-ct');
    document.getElementById('pick-t').classList.remove('active-t');
  });
  document.getElementById('pick-t').addEventListener('click', () => {
    selectedTeam = TEAMS.T;
    document.getElementById('pick-t').classList.add('active-t');
    document.getElementById('pick-ct').classList.remove('active-ct');
  });

  const btnEasy = document.getElementById('diff-easy');
  const btnNormal = document.getElementById('diff-normal');
  const btnHard = document.getElementById('diff-hard');
  const setDiff = (diff) => {
    selectedDiff = diff;
    btnEasy.classList.toggle('active-diff', diff === 'easy');
    btnNormal.classList.toggle('active-diff', diff === 'normal');
    btnHard.classList.toggle('active-diff', diff === 'hard');
  };
  btnEasy.addEventListener('click', () => setDiff('easy'));
  btnNormal.addEventListener('click', () => setDiff('normal'));
  btnHard.addEventListener('click', () => setDiff('hard'));

  document.getElementById('btn-start').addEventListener('click', () => {
    sound.ensureContext();
    sound.playClick();
    menuOverlay.classList.add('hidden');
    matchOverOverlay.classList.add('hidden');
    buyMenuOpen = false;
    buyOverlay.classList.add('hidden');
    paused = false;
    game.startMatch(selectedTeam, selectedDiff);
    renderer.resize();
  });

  document.getElementById('btn-rematch').addEventListener('click', () => {
    sound.playClick();
    matchOverOverlay.classList.add('hidden');
    game.startMatch(selectedTeam, selectedDiff);
  });

  document.getElementById('btn-back-menu').addEventListener('click', () => {
    sound.playClick();
    matchOverOverlay.classList.add('hidden');
    menuOverlay.classList.remove('hidden');
    game.phase = PHASES.MENU;
  });

  document.getElementById('btn-close-buy').addEventListener('click', () => toggleBuyMenu(false));
  document.getElementById('btn-skip-buy').addEventListener('click', () => {
    toggleBuyMenu(false);
    game.skipBuyPhase();
  });

  elBuyBtn.addEventListener('click', () => toggleBuyMenu());
  elMuteBtn.addEventListener('click', () => {
    const muted = sound.toggleMute();
    elMuteBtn.textContent = muted ? 'SOUND: OFF' : 'SOUND: ON';
  });
  elPadBtn.addEventListener('click', () => {
    touchVisible = !touchVisible;
    elTouchControls.classList.toggle('visible', touchVisible);
    elPadBtn.textContent = touchVisible ? 'PAD: ON' : 'PAD: OFF';
  });

  // Keyboard controls
  window.addEventListener('keydown', (e) => {
    const code = e.code;
    keys[code] = true;
    if (code === 'Tab') {
      e.preventDefault();
      if (game.phase !== PHASES.MENU) {
        scoreboardOpen = true;
        scoreOverlay.classList.remove('hidden');
        renderScoreboard();
      }
    } else if (code === 'KeyB') {
      toggleBuyMenu();
    } else if (code === 'Escape') {
      if (buyMenuOpen) toggleBuyMenu(false);
    } else if (code === 'KeyR') {
      game.player.startReload();
    } else if (code === 'Digit1') {
      game.player.switchSlot(1);
    } else if (code === 'Digit2') {
      game.player.switchSlot(2);
    } else if (code === 'Digit3') {
      game.player.switchSlot(3);
    } else if (code === 'KeyF') {
      if (game.player.getActiveWeapon().id === 'awp') {
        game.player.scoped = !game.player.scoped;
      }
    } else if (code === 'KeyM') {
      const muted = sound.toggleMute();
      elMuteBtn.textContent = muted ? 'SOUND: OFF' : 'SOUND: ON';
    } else if (code === 'Space') {
      if (game.phase === PHASES.BUY) {
        toggleBuyMenu(false);
        game.skipBuyPhase();
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
    if (e.code === 'Tab') {
      scoreboardOpen = false;
      scoreOverlay.classList.add('hidden');
    } else if (e.code === 'KeyE') {
      game.bomb.cancelPlant(game.player.id);
      game.bomb.cancelDefuse(game.player.id);
    }
  });

  // Mouse & Pointer Lock + Fallback Drag Aim
  canvas.addEventListener('mousedown', (e) => {
    if (game.phase === PHASES.MENU || buyMenuOpen || paused) return;
    sound.ensureContext();
    if (e.button === 2) {
      if (game.player.getActiveWeapon().id === 'awp') {
        game.player.scoped = !game.player.scoped;
      }
      return;
    }
    mouseDown = true;
    draggingLook = true;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    if (document.pointerLockElement !== canvas && canvas.requestPointerLock) {
      try {
        const res = canvas.requestPointerLock();
        if (res && typeof res.catch === 'function') res.catch(() => {});
      } catch (_) {}
    }
    if (!game.player.getActiveWeaponSpec().auto) {
      game.fireWeapon(game.player);
    }
  });

  window.addEventListener('mouseup', () => {
    mouseDown = false;
    draggingLook = false;
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('mousemove', (e) => {
    if (game.phase === PHASES.MENU || buyMenuOpen || paused || !game.player.alive) return;
    const sens = game.player.scoped ? 0.0014 : 0.0028;
    if (document.pointerLockElement === canvas) {
      game.player.angle += e.movementX * sens;
      game.player.pitch = Math.max(-0.42, Math.min(0.42, game.player.pitch - e.movementY * sens * 0.7));
    } else if (draggingLook) {
      const dx = e.clientX - lastPointerX;
      const dy = e.clientY - lastPointerY;
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;
      game.player.angle += dx * sens * 1.4;
      game.player.pitch = Math.max(-0.42, Math.min(0.42, game.player.pitch - dy * sens));
    }
  });

  // Touch / On-screen pad bindings
  const bindHold = (id, onDown, onUp) => {
    const el = document.getElementById(id);
    if (!el) return;
    const start = (e) => { e.preventDefault(); sound.ensureContext(); onDown(); };
    const end = (e) => { e.preventDefault(); onUp(); };
    el.addEventListener('mousedown', start);
    el.addEventListener('mouseup', end);
    el.addEventListener('mouseleave', end);
    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('touchend', end, { passive: false });
  };
  bindHold('pad-up', () => { padState.fwd = 1; }, () => { padState.fwd = 0; });
  bindHold('pad-down', () => { padState.fwd = -1; }, () => { padState.fwd = 0; });
  bindHold('pad-left', () => { padState.turn = -1; }, () => { padState.turn = 0; });
  bindHold('pad-right', () => { padState.turn = 1; }, () => { padState.turn = 0; });
  bindHold('pad-fire', () => { padState.fire = true; game.fireWeapon(game.player); }, () => { padState.fire = false; });
  bindHold('pad-use', () => { padState.use = true; }, () => {
    padState.use = false;
    game.bomb.cancelPlant(game.player.id);
    game.bomb.cancelDefuse(game.player.id);
  });
  document.getElementById('pad-reload').addEventListener('click', () => game.player.startReload());

  window.addEventListener('resize', () => {
    renderer.resize();
    renderer.render(game);
  });

  // Main 60fps Game Loop
  let lastTime = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    if (!paused && game.phase !== PHASES.MENU && game.phase !== PHASES.MATCH_OVER) {
      const p = game.player;
      if (p.alive && !buyMenuOpen) {
        let fwd = padState.fwd;
        let strafe = padState.strafe;
        if (keys.KeyW || keys.ArrowUp) fwd += 1;
        if (keys.KeyS || keys.ArrowDown) fwd -= 1;
        if (keys.KeyD) strafe += 1;
        if (keys.KeyA) strafe -= 1;

        let turn = padState.turn;
        if (keys.ArrowLeft || keys.KeyQ) turn -= 1;
        if (keys.ArrowRight) turn += 1;
        if (turn !== 0) p.angle += turn * 2.35 * dt;

        p.crouching = !!(keys.ControlLeft || keys.KeyC);
        p.walking = !!keys.ShiftLeft;

        if (game.phase !== PHASES.BUY) {
          const stepped = p.move(fwd, strafe, dt, game.map);
          if (stepped) sound.playFootstep();
        }

        if (keys.KeyE || padState.use) {
          if (p.team === TEAMS.T) game.handlePlantAction(p, dt);
          else game.handleDefuseAction(p, dt);
        }

        if ((mouseDown || padState.fire) && p.getActiveWeaponSpec().auto) {
          game.fireWeapon(p);
        }
      }
      game.update(dt);
    }

    renderer.resize();
    renderer.render(game);
    updateHUD();
    if (scoreboardOpen) renderScoreboard();

    animFrameId = requestAnimationFrame(loop);
  }

  if (animFrameId) cancelAnimationFrame(animFrameId);
  renderer.resize();
  animFrameId = requestAnimationFrame(loop);
}

window.addEventListener('load', initApp);
