(function (root) {
  'use strict';

  function initApp() {
    const canvas = document.getElementById('game-canvas');
    if (!canvas) return;

    const sound = new root.GooSound.SoundEngine();
    let game = null;
    let renderer = null;
    let rafId = null;
    let lastTime = 0;

    // Load saved progress safely
    let savedProgress = {};
    try {
      const raw = localStorage.getItem('web_world_of_goo_progress');
      if (raw) savedProgress = JSON.parse(raw);
    } catch (e) {
      savedProgress = {};
    }

    // DOM refs
    const elLevelTitle = document.getElementById('hud-level-title');
    const elCollected = document.getElementById('hud-collected');
    const elRemaining = document.getElementById('hud-remaining');
    const elMoves = document.getElementById('hud-moves');
    const elHintText = document.getElementById('hint-text');
    const elHintBanner = document.getElementById('hint-banner');

    const btnLevels = document.getElementById('btn-levels');
    const btnUndo = document.getElementById('btn-undo');
    const btnRestart = document.getElementById('btn-restart');
    const btnPause = document.getElementById('btn-pause');
    const btnMute = document.getElementById('btn-mute');
    const btnHint = document.getElementById('btn-hint');
    const btnCloseHint = document.getElementById('btn-close-hint');

    const modalLevels = document.getElementById('modal-levels');
    const levelGrid = document.getElementById('level-grid');
    const btnCloseLevels = document.getElementById('btn-close-levels');

    const modalWin = document.getElementById('modal-win');
    const winStats = document.getElementById('win-stats');
    const winBadge = document.getElementById('win-badge');
    const btnWinReplay = document.getElementById('btn-win-replay');
    const btnWinNext = document.getElementById('btn-win-next');

    const overlayPause = document.getElementById('overlay-pause');
    const btnResume = document.getElementById('btn-resume');

    function persistProgress(completedLevels) {
      try {
        localStorage.setItem('web_world_of_goo_progress', JSON.stringify(completedLevels));
      } catch (e) {
        // Ignore storage errors in sandboxed iframes
      }
    }

    function renderLevelCards(state) {
      levelGrid.innerHTML = '';
      for (const lvl of root.GooLevels.LEVELS) {
        const done = state.completedLevels[lvl.id];
        const isCurrent = lvl.id === state.levelId;
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'level-card' + (isCurrent ? ' active' : '') + (done ? ' completed' : '');
        card.innerHTML =
          '<div class="level-card-head">' +
            '<span class="level-num">第 ' + lvl.id + ' 关</span>' +
            (done ? '<span class="level-tag">' + (done.ocd ? '★ OCD 完美' : '✓ 已通关') + '</span>' : '') +
          '</div>' +
          '<div class="level-name">' + lvl.name + '</div>' +
          '<div class="level-sub">' + lvl.subtitle + '</div>';
        card.addEventListener('click', function () {
          modalLevels.classList.add('hidden');
          game.loadLevel(lvl.id);
          renderer.resize();
        });
        levelGrid.appendChild(card);
      }
    }

    function updateHUD(state) {
      elLevelTitle.textContent = '第 ' + state.levelId + ' 关 · ' + state.levelName;
      elCollected.textContent = state.collectedCount + ' / ' + state.targetCount;
      elRemaining.textContent = String(state.remainingWalkers);
      elMoves.textContent = String(state.movesCount);
      elHintText.textContent = state.hint;

      btnUndo.disabled = !state.canUndo;
      btnPause.textContent = state.status === 'paused' ? '继续' : '暂停';

      if (state.status === 'paused') {
        overlayPause.classList.remove('hidden');
      } else {
        overlayPause.classList.add('hidden');
      }

      if (state.status === 'won') {
        persistProgress(state.completedLevels);
        const isOcd = state.collectedCount >= state.ocdTarget;
        winBadge.textContent = isOcd ? '★ OCD 大师通关' : '✓ 关卡完成';
        winStats.textContent =
          '已收集 ' + state.collectedCount + ' 颗黏黏球（目标 ' + state.targetCount +
          ' 颗）· 共搭建 ' + state.movesCount + ' 步';
        btnWinNext.textContent =
          state.levelId < state.totalLevels ? '下一关 →' : '回到第 1 关';
        modalWin.classList.remove('hidden');
      } else {
        modalWin.classList.add('hidden');
      }

      renderLevelCards(state);
    }

    game = new root.GooGame.GooGameEngine({
      levelId: 1,
      sound: sound,
      onStateChange: updateHUD
    });
    game.completedLevels = { ...savedProgress };
    renderer = new root.GooRenderer.CanvasRenderer(canvas, game);

    function handleResize() {
      renderer.resize();
      renderer.render(0);
    }

    window.addEventListener('resize', handleResize);
    handleResize();
    updateHUD(game.getHUDState());

    // Pointer & touch interaction
    function getWorldPos(e) {
      return renderer.screenToWorld(e.clientX, e.clientY);
    }

    canvas.addEventListener('pointerdown', function (e) {
      sound.unlock();
      if (e.button !== undefined && e.button !== 0) return;
      canvas.setPointerCapture(e.pointerId);
      const pos = getWorldPos(e);
      game.pointerDown(pos.x, pos.y);
    });

    canvas.addEventListener('pointermove', function (e) {
      const pos = getWorldPos(e);
      game.pointerMove(pos.x, pos.y);
    });

    function endDrag(e) {
      const pos = getWorldPos(e);
      game.pointerUp(pos.x, pos.y);
    }

    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    // Toolbar controls
    btnLevels.addEventListener('click', function () {
      sound.unlock();
      renderLevelCards(game.getHUDState());
      modalLevels.classList.remove('hidden');
    });

    btnCloseLevels.addEventListener('click', function () {
      modalLevels.classList.add('hidden');
    });

    modalLevels.addEventListener('click', function (e) {
      if (e.target === modalLevels) modalLevels.classList.add('hidden');
    });

    btnUndo.addEventListener('click', function () {
      sound.unlock();
      game.undo();
    });

    btnRestart.addEventListener('click', function () {
      sound.unlock();
      game.restartLevel();
    });

    btnPause.addEventListener('click', function () {
      sound.unlock();
      game.togglePause();
    });

    btnResume.addEventListener('click', function () {
      sound.unlock();
      game.togglePause();
    });

    btnMute.addEventListener('click', function () {
      const muted = sound.toggleMute();
      btnMute.textContent = muted ? '静音' : '音效';
      btnMute.classList.toggle('muted', muted);
    });

    btnHint.addEventListener('click', function () {
      elHintBanner.classList.toggle('hidden');
    });

    btnCloseHint.addEventListener('click', function () {
      elHintBanner.classList.add('hidden');
    });

    btnWinReplay.addEventListener('click', function () {
      sound.unlock();
      game.restartLevel();
    });

    btnWinNext.addEventListener('click', function () {
      sound.unlock();
      const nextId = game.currentLevelId < root.GooLevels.LEVELS.length ? game.currentLevelId + 1 : 1;
      game.loadLevel(nextId);
      renderer.resize();
    });

    // Keyboard shortcuts
    window.addEventListener('keydown', function (e) {
      if (e.key === 'z' || e.key === 'Z') {
        game.undo();
      } else if (e.key === 'r' || e.key === 'R') {
        game.restartLevel();
      } else if (e.key === ' ') {
        e.preventDefault();
        game.togglePause();
      } else if (e.key === 'm' || e.key === 'M') {
        const muted = sound.toggleMute();
        btnMute.textContent = muted ? '静音' : '音效';
        btnMute.classList.toggle('muted', muted);
      } else if (e.key === 'Escape') {
        modalLevels.classList.add('hidden');
      }
    });

    // Main animation loop
    function loop(timestamp) {
      if (!lastTime) lastTime = timestamp;
      const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
      lastTime = timestamp;

      game.update(dt);
      renderer.render(dt);
      rafId = requestAnimationFrame(loop);
    }

    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  window.onload = initApp;
})(typeof globalThis !== 'undefined' ? globalThis : window);
