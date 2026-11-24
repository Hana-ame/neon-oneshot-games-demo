/**
 * Web COD — Operation Ironline
 * Main browser entry point: DOM bindings, Pointer Lock + drag/touch controls,
 * HUD synchronization, and animation loop.
 */
(function (root) {
  'use strict';

  function initWebCOD() {
    const { Config, GameEngine, TacticalRenderer, SoundEngine } = root.WebCOD;

    const canvas = document.getElementById('game-canvas');
    const stage = document.getElementById('game-stage');
    if (!canvas || !stage) return;

    const engine = new GameEngine({ mapId: 'killhouse' });
    const renderer = new TacticalRenderer(canvas);
    const sound = new SoundEngine();

    // DOM elements
    const startOverlay = document.getElementById('start-overlay');
    const pauseOverlay = document.getElementById('pause-overlay');
    const gameoverOverlay = document.getElementById('gameover-overlay');
    const waveBanner = document.getElementById('wave-banner');
    const killFeedEl = document.getElementById('kill-feed');
    const hudHp = document.getElementById('hud-hp');
    const hudHpBar = document.getElementById('hud-hp-bar');
    const hudArmor = document.getElementById('hud-armor');
    const hudArmorBar = document.getElementById('hud-armor-bar');
    const hudWave = document.getElementById('hud-wave');
    const hudEnemies = document.getElementById('hud-enemies');
    const hudScore = document.getElementById('hud-score');
    const hudStreak = document.getElementById('hud-streak');
    const hudWeaponName = document.getElementById('hud-weapon-name');
    const hudAmmo = document.getElementById('hud-ammo');
    const hudReserve = document.getElementById('hud-reserve');
    const hudReloading = document.getElementById('hud-reloading');
    const btnUav = document.getElementById('btn-uav');
    const btnAirstrike = document.getElementById('btn-airstrike');
    const btnMute = document.getElementById('btn-mute');
    const btnPause = document.getElementById('btn-pause');
    const toastEl = document.getElementById('tactical-toast');

    let selectedMapId = 'killhouse';
    let rafId = null;
    let lastTs = 0;
    let isPointerLocked = false;
    let dragLookActive = false;
    let lastDragX = 0;
    let lastDragY = 0;
    let toastTimer = null;

    const keys = {};
    const mouse = { left: false, right: false, justPressed: false };
    const touchState = { forward: 0, strafe: 0, turn: 0, fire: false, ads: false };

    function showToast(msg) {
      if (!toastEl) return;
      toastEl.textContent = msg;
      toastEl.classList.add('visible');
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('visible'), 2200);
    }

    function resizeCanvas() {
      const rect = stage.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(320, Math.floor(rect.width * dpr));
      canvas.height = Math.max(200, Math.floor(rect.height * dpr));
      renderer.render(engine, 0);
    }

    function selectMap(mapId) {
      selectedMapId = mapId;
      document.querySelectorAll('[data-map-btn]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.mapBtn === mapId);
      });
    }

    function startMatch() {
      sound.init();
      engine.startGame(selectedMapId);
      startOverlay.classList.add('hidden');
      pauseOverlay.classList.add('hidden');
      gameoverOverlay.classList.add('hidden');
      syncWeaponBar();
      showToast(`已部署至 ${engine.map.name}`);
      try {
        if (canvas.requestPointerLock) {
          canvas.requestPointerLock();
        }
      } catch (_) {}
    }

    function togglePause() {
      if (engine.status === 'MENU' || engine.status === 'GAMEOVER') return;
      const paused = engine.togglePause();
      pauseOverlay.classList.toggle('hidden', !paused);
      if (paused && document.pointerLockElement && document.exitPointerLock) {
        try { document.exitPointerLock(); } catch (_) {}
      }
    }

    function syncWeaponBar() {
      document.querySelectorAll('[data-weapon-slot]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.weaponSlot === engine.weapons.currentId);
      });
    }

    function updateHud() {
      const p = engine.player;
      const wSpec = engine.weapons.getCurrentSpec();
      const wSlot = engine.weapons.getCurrentSlot();
      const aliveEnemies = engine.enemies.filter((e) => e.alive).length + engine.waveQueue.length;

      hudHp.textContent = Math.ceil(p.hp);
      hudHpBar.style.width = `${(p.hp / p.maxHp) * 100}%`;
      hudArmor.textContent = Math.ceil(p.armor);
      hudArmorBar.style.width = `${(p.armor / p.maxArmor) * 100}%`;

      hudWave.textContent = `WAVE ${engine.wave}`;
      hudEnemies.textContent = aliveEnemies;
      hudScore.textContent = p.score;
      hudStreak.textContent = p.currentStreak;

      hudWeaponName.textContent = wSpec.name;
      hudAmmo.textContent = wSlot.ammo;
      hudReserve.textContent = `/ ${wSlot.reserve}`;
      hudReloading.classList.toggle('hidden', !engine.weapons.reloading);

      btnUav.disabled = !p.uavReady;
      btnUav.classList.toggle('ready', p.uavReady);
      btnUav.classList.toggle('active-ks', p.isUavActive(engine.nowMs));

      btnAirstrike.disabled = !p.airstrikeReady;
      btnAirstrike.classList.toggle('ready', p.airstrikeReady);

      if (engine.waveBannerTimer > 0) {
        waveBanner.textContent = `第 ${engine.wave} 波敌军来袭 — 消灭所有目标`;
        waveBanner.classList.remove('hidden');
      } else {
        waveBanner.classList.add('hidden');
      }

      // Kill feed
      killFeedEl.innerHTML = engine.killFeed
        .map(
          (item) =>
            `<div class="kf-item ${item.isHeadshot ? 'kf-hs' : ''}">${item.text}</div>`
        )
        .join('');
    }

    function showGameOver() {
      const stats = engine.getSummaryStats();
      document.getElementById('go-score').textContent = stats.score;
      document.getElementById('go-wave').textContent = stats.wave;
      document.getElementById('go-kills').textContent = stats.kills;
      document.getElementById('go-headshots').textContent = stats.headshots;
      document.getElementById('go-accuracy').textContent = `${stats.accuracy}%`;
      document.getElementById('go-streak').textContent = stats.bestStreak;
      gameoverOverlay.classList.remove('hidden');
      if (document.pointerLockElement && document.exitPointerLock) {
        try { document.exitPointerLock(); } catch (_) {}
      }
    }

    // Bind UI buttons
    document.querySelectorAll('[data-map-btn]').forEach((btn) => {
      btn.addEventListener('click', () => selectMap(btn.dataset.mapBtn));
    });
    document.getElementById('btn-deploy').addEventListener('click', startMatch);
    document.getElementById('btn-resume').addEventListener('click', togglePause);
    document.getElementById('btn-restart-pause').addEventListener('click', startMatch);
    document.getElementById('btn-restart-go').addEventListener('click', startMatch);
    document.getElementById('btn-menu-go').addEventListener('click', () => {
      engine.reset(selectedMapId);
      gameoverOverlay.classList.add('hidden');
      startOverlay.classList.remove('hidden');
    });

    btnPause.addEventListener('click', togglePause);
    btnMute.addEventListener('click', () => {
      sound.init();
      const m = sound.toggleMute();
      btnMute.textContent = m ? '🔇 静音' : '🔊 音效';
    });

    btnUav.addEventListener('click', () => {
      sound.init();
      if (engine.triggerUav()) {
        showToast('UAV 战术侦察机已升空！雷达全图扫描 15 秒');
      }
    });
    btnAirstrike.addEventListener('click', () => {
      sound.init();
      if (engine.triggerAirstrike()) {
        renderer.notifyAirstrike();
        showToast('精确空袭已命中敌军集群！');
      }
    });

    document.querySelectorAll('[data-weapon-slot]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (engine.weapons.switchWeapon(btn.dataset.weaponSlot)) {
          syncWeaponBar();
        }
      });
    });

    // On-screen mobile / fallback tactical buttons
    const bindHold = (id, onDown, onUp) => {
      const el = document.getElementById(id);
      if (!el) return;
      const start = (e) => { e.preventDefault(); sound.init(); onDown(); };
      const end = (e) => { e.preventDefault(); onUp(); };
      el.addEventListener('pointerdown', start);
      el.addEventListener('pointerup', end);
      el.addEventListener('pointerleave', end);
      el.addEventListener('pointercancel', end);
    };

    bindHold('touch-up', () => { touchState.forward = 1; }, () => { touchState.forward = 0; });
    bindHold('touch-down', () => { touchState.forward = -1; }, () => { touchState.forward = 0; });
    bindHold('touch-left', () => { touchState.turn = -1; }, () => { touchState.turn = 0; });
    bindHold('touch-right', () => { touchState.turn = 1; }, () => { touchState.turn = 0; });
    bindHold(
      'touch-fire',
      () => { touchState.fire = true; mouse.justPressed = true; },
      () => { touchState.fire = false; }
    );

    const touchAdsBtn = document.getElementById('touch-ads');
    if (touchAdsBtn) {
      touchAdsBtn.addEventListener('click', () => {
        touchState.ads = !touchState.ads;
        touchAdsBtn.classList.toggle('active', touchState.ads);
      });
    }
    const touchReloadBtn = document.getElementById('touch-reload');
    if (touchReloadBtn) {
      touchReloadBtn.addEventListener('click', () => {
        sound.init();
        if (engine.weapons.startReload(engine.nowMs)) {
          sound.playReload();
        }
      });
    }

    // Keyboard controls
    window.addEventListener('keydown', (e) => {
      const code = e.code;
      keys[code] = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
        e.preventDefault();
      }
      if (code === 'Escape' || code === 'KeyP') {
        togglePause();
        return;
      }
      if (engine.status !== 'PLAYING') return;

      if (code === 'KeyR') {
        if (engine.weapons.startReload(engine.nowMs)) {
          sound.playReload();
        }
      } else if (code === 'Digit1') {
        engine.weapons.switchByIndex(0); syncWeaponBar();
      } else if (code === 'Digit2') {
        engine.weapons.switchByIndex(1); syncWeaponBar();
      } else if (code === 'Digit3') {
        engine.weapons.switchByIndex(2); syncWeaponBar();
      } else if (code === 'Digit4') {
        engine.weapons.switchByIndex(3); syncWeaponBar();
      } else if (code === 'KeyQ') {
        if (engine.triggerUav()) showToast('UAV 战术侦察机已升空！');
      } else if (code === 'KeyE') {
        if (engine.triggerAirstrike()) {
          renderer.notifyAirstrike();
          showToast('精确空袭已命中目标！');
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      keys[e.code] = false;
    });

    // Pointer lock & mouse controls
    document.addEventListener('pointerlockchange', () => {
      isPointerLocked = document.pointerLockElement === canvas;
    });

    canvas.addEventListener('mousedown', (e) => {
      if (engine.status !== 'PLAYING') return;
      sound.init();
      if (e.button === 0) {
        mouse.left = true;
        mouse.justPressed = true;
        if (!isPointerLocked) {
          dragLookActive = true;
          lastDragX = e.clientX;
          lastDragY = e.clientY;
        }
      } else if (e.button === 2) {
        mouse.right = true;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        mouse.left = false;
        dragLookActive = false;
      } else if (e.button === 2) {
        mouse.right = false;
      }
    });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('mousemove', (e) => {
      if (engine.status !== 'PLAYING') return;
      const sens = engine.weapons.isAds ? 0.0014 : 0.0026;
      if (isPointerLocked) {
        engine.player.rotate(e.movementX * sens, -e.movementY * sens * 0.45);
      } else if (dragLookActive) {
        const dx = e.clientX - lastDragX;
        const dy = e.clientY - lastDragY;
        lastDragX = e.clientX;
        lastDragY = e.clientY;
        engine.player.rotate(dx * sens * 1.4, -dy * sens * 0.5);
      }
    });

    canvas.addEventListener('wheel', (e) => {
      if (engine.status !== 'PLAYING') return;
      e.preventDefault();
      engine.weapons.cycleWeapon(e.deltaY > 0 ? 1 : -1);
      syncWeaponBar();
    }, { passive: false });

    function tick(ts) {
      const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016;
      lastTs = ts;

      if (engine.status === 'PLAYING') {
        const forward =
          (keys.KeyW || keys.ArrowUp ? 1 : 0) -
          (keys.KeyS || keys.ArrowDown ? 1 : 0) +
          touchState.forward;
        const strafe =
          (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + touchState.strafe;
        const turn =
          (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0) + touchState.turn;

        engine.update(dt, {
          forward: Math.max(-1, Math.min(1, forward)),
          strafe: Math.max(-1, Math.min(1, strafe)),
          turn: Math.max(-1, Math.min(1, turn)),
          sprint: Boolean(keys.ShiftLeft || keys.ShiftRight),
          crouch: Boolean(keys.KeyC || keys.ControlLeft),
          ads: mouse.right || Boolean(keys.KeyF) || touchState.ads,
          fire: mouse.left || Boolean(keys.Space) || touchState.fire,
          fireJustPressed: mouse.justPressed
        });
        mouse.justPressed = false;

        const events = engine.consumeEvents();
        sound.handleEvents(events);
        for (const ev of events) {
          if (ev.type === 'killstreak_unlocked') {
            const label = ev.payload.killstreak === 'uav' ? 'UAV 侦察机 (Q)' : '精确空袭 (E)';
            showToast(`连杀奖励解锁：${label}`);
          } else if (ev.type === 'airstrike') {
            renderer.notifyAirstrike();
          } else if (ev.type === 'game_over') {
            showGameOver();
          }
        }
        updateHud();
      }

      renderer.render(engine, dt);
      rafId = requestAnimationFrame(tick);
    }

    window.addEventListener('resize', resizeCanvas);
    selectMap('killhouse');
    resizeCanvas();
    updateHud();

    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('load', initWebCOD);
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
