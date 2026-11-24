// KOF Web Arcade - Browser Entry Point, Input Manager & UI Controller
import {
  FIXED_DT,
  STAGE_WIDTH,
  STAGE_HEIGHT,
  GAME_MODES,
  DIFFICULTY,
  MATCH_PHASES,
  STAGES
} from './constants.js';
import { FIGHTERS, FIGHTER_LIST } from './fighters.js';
import { FighterAI, createEmptyInput } from './ai.js';
import { ArcadeAudio } from './audio.js';
import { MatchEngine } from './engine.js';
import { ArcadeRenderer } from './renderer.js';

function initKofApp() {
  const canvas = document.getElementById('gameCanvas');
  if (!canvas) return;
  canvas.width = STAGE_WIDTH;
  canvas.height = STAGE_HEIGHT;

  const audio = new ArcadeAudio();
  const renderer = new ArcadeRenderer(canvas);
  const ai = new FighterAI(DIFFICULTY.NORMAL);

  const state = {
    mode: GAME_MODES.TEAM_3V3,
    difficulty: DIFFICULTY.NORMAL,
    stageIndex: 0,
    p1Team: ['kyo', 'iori', 'terry'],
    p2Team: ['iori', 'mai', 'kyo'],
    paused: false,
    inMenu: true,
    engine: null,
    rafId: null,
    lastTime: 0,
    accumulator: 0
  };

  // Keyboard & Touch input states
  const keys = new Set();
  const touchInputP1 = createEmptyInput();

  const P1_KEYMAP = {
    KeyA: 'left',
    KeyD: 'right',
    KeyW: 'up',
    KeyS: 'down',
    KeyJ: 'LP',
    KeyU: 'HP',
    KeyK: 'LK',
    KeyI: 'HK',
    KeyO: 'SP',
    KeyL: 'SUPER',
    ShiftLeft: 'ROLL',
    Space: 'ROLL'
  };

  const P2_KEYMAP = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'up',
    ArrowDown: 'down',
    Numpad1: 'LP',
    Numpad4: 'HP',
    Numpad2: 'LK',
    Numpad5: 'HK',
    Numpad3: 'SP',
    Numpad6: 'SUPER',
    Numpad0: 'ROLL'
  };

  function readInput(keymap, touchFallback = null) {
    const inp = createEmptyInput();
    for (const [code, action] of Object.entries(keymap)) {
      if (keys.has(code)) inp[action] = true;
    }
    if (touchFallback) {
      for (const k of Object.keys(inp)) {
        if (touchFallback[k]) inp[k] = true;
      }
    }
    return inp;
  }

  window.addEventListener('keydown', (e) => {
    audio.unlock();
    if (P1_KEYMAP[e.code] || P2_KEYMAP[e.code]) {
      e.preventDefault();
    }
    keys.add(e.code);
    if (e.code === 'Escape' && !state.inMenu) {
      togglePause();
    }
  });

  window.addEventListener('keyup', (e) => {
    keys.delete(e.code);
  });

  // DOM References
  const menuOverlay = document.getElementById('menuOverlay');
  const matchOverOverlay = document.getElementById('matchOverOverlay');
  const matchOverTitle = document.getElementById('matchOverTitle');
  const moveListModal = document.getElementById('moveListModal');
  const moveListBody = document.getElementById('moveListBody');
  const rosterGrid = document.getElementById('rosterGrid');
  const p1TeamBadges = document.getElementById('p1TeamBadges');
  const p2TeamBadges = document.getElementById('p2TeamBadges');
  const modeSelect = document.getElementById('modeSelect');
  const diffSelect = document.getElementById('diffSelect');
  const stageSelect = document.getElementById('stageSelect');
  const btnPause = document.getElementById('btnPause');
  const btnMute = document.getElementById('btnMute');
  const btnHitbox = document.getElementById('btnHitbox');
  const statusHint = document.getElementById('statusHint');

  function renderTeamBadges() {
    const maxSlots = state.mode === GAME_MODES.TEAM_3V3 ? 3 : 1;
    p1TeamBadges.innerHTML = state.p1Team
      .slice(0, maxSlots)
      .map(
        (id, idx) =>
          `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/20 border border-amber-400/50 text-amber-200 text-xs font-bold">${idx + 1}. ${FIGHTERS[id].name}</span>`
      )
      .join('');
    p2TeamBadges.innerHTML = state.p2Team
      .slice(0, maxSlots)
      .map(
        (id, idx) =>
          `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-rose-500/20 border border-rose-400/50 text-rose-200 text-xs font-bold">${idx + 1}. ${FIGHTERS[id].name}</span>`
      )
      .join('');
  }

  function renderRoster() {
    rosterGrid.innerHTML = FIGHTER_LIST.map((f) => {
      const inP1 = state.p1Team[0] === f.id;
      return `
        <div class="rounded-xl border ${inP1 ? 'border-amber-400 bg-zinc-800/90' : 'border-zinc-700 bg-zinc-900/80'} p-3 flex flex-col justify-between gap-2 transition hover:border-amber-300">
          <div>
            <div class="flex items-center justify-between gap-2">
              <span class="font-extrabold text-sm text-white">${f.name}</span>
              <span class="text-[11px] px-1.5 py-0.5 rounded font-semibold" style="background:${f.colors.flame}33;color:${f.colors.flameCore};border:1px solid ${f.colors.flame}66">${f.archetype}</span>
            </div>
            <div class="text-[11px] text-zinc-400 mt-0.5">${f.title} · HP ${f.maxHp}</div>
          </div>
          <div class="flex gap-1.5 mt-1">
            <button type="button" data-pick-p1="${f.id}" class="flex-1 py-1 rounded bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs transition cursor-pointer">选为 P1</button>
            <button type="button" data-pick-p2="${f.id}" class="flex-1 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition cursor-pointer">选为 P2</button>
          </div>
        </div>
      `;
    }).join('');

    rosterGrid.querySelectorAll('[data-pick-p1]').forEach((btn) => {
      btn.addEventListener('click', () => {
        audio.unlock();
        audio.playSelect();
        const id = btn.getAttribute('data-pick-p1');
        state.p1Team = [id, ...state.p1Team.filter((x) => x !== id)].slice(0, 3);
        while (state.p1Team.length < 3) state.p1Team.push(id);
        renderTeamBadges();
        renderRoster();
      });
    });

    rosterGrid.querySelectorAll('[data-pick-p2]').forEach((btn) => {
      btn.addEventListener('click', () => {
        audio.unlock();
        audio.playSelect();
        const id = btn.getAttribute('data-pick-p2');
        state.p2Team = [id, ...state.p2Team.filter((x) => x !== id)].slice(0, 3);
        while (state.p2Team.length < 3) state.p2Team.push(id);
        renderTeamBadges();
        renderRoster();
      });
    });
  }

  function renderMoveList() {
    moveListBody.innerHTML = FIGHTER_LIST.map((f) => {
      const m = f.moves;
      return `
        <div class="rounded-lg border border-zinc-700 bg-zinc-900/90 p-3">
          <div class="font-extrabold text-amber-300 text-sm mb-1.5">${f.name} (${f.enName})</div>
          <ul class="space-y-1 text-xs text-zinc-200">
            <li><span class="font-bold text-white">${m.SP1.name}</span>：${m.SP1.commandLabel}（快捷 <kbd class="px-1 bg-zinc-800 rounded">O</kbd>）</li>
            <li><span class="font-bold text-white">${m.SP2.name}</span>：${m.SP2.commandLabel}（快捷 <kbd class="px-1 bg-zinc-800 rounded">W+O</kbd>）</li>
            <li><span class="font-bold text-white">${m.SP3.name}</span>：${m.SP3.commandLabel}（快捷 <kbd class="px-1 bg-zinc-800 rounded">后+O</kbd>）</li>
            <li><span class="font-bold text-rose-400">${m.SUPER.name}</span>：${m.SUPER.commandLabel}（快捷 <kbd class="px-1 bg-zinc-800 rounded">L</kbd>）</li>
          </ul>
        </div>
      `;
    }).join('');
  }

  function startMatch() {
    audio.unlock();
    audio.playRoundStart();
    audio.startBgm();
    ai.setDifficulty(state.difficulty);

    const teamSize = state.mode === GAME_MODES.TEAM_3V3 ? 3 : 1;
    state.engine = new MatchEngine({
      mode: state.mode,
      stageIndex: state.stageIndex,
      p1Team: state.p1Team.slice(0, teamSize),
      p2Team: state.p2Team.slice(0, teamSize),
      audio
    });
    state.inMenu = false;
    state.paused = false;
    btnPause.textContent = '暂停';
    menuOverlay.classList.add('hidden');
    matchOverOverlay.classList.add('hidden');
    statusHint.textContent =
      state.mode === GAME_MODES.VS_2P
        ? '双人模式：P1 WASD+J/U/K/I/O/L/Space · P2 方向键+小键盘1-6/0'
        : 'P1：WASD 移动 · J/U 轻重拳 · K/I 轻重脚 · O 必杀 · L 超必杀 · Space 闪避翻滚';
  }

  function togglePause() {
    if (state.inMenu || !state.engine) return;
    state.paused = !state.paused;
    btnPause.textContent = state.paused ? '继续' : '暂停';
  }

  function gameLoop(now) {
    state.rafId = requestAnimationFrame(gameLoop);
    if (!state.lastTime) state.lastTime = now;
    const dt = Math.min(0.1, (now - state.lastTime) / 1000);
    state.lastTime = now;

    if (!state.engine) return;

    if (!state.inMenu && !state.paused) {
      state.accumulator += dt;
      while (state.accumulator >= FIXED_DT) {
        const p1Input = readInput(P1_KEYMAP, touchInputP1);
        let p2Input;
        if (state.mode === GAME_MODES.VS_2P) {
          p2Input = readInput(P2_KEYMAP);
        } else if (state.mode === GAME_MODES.TRAINING) {
          p2Input = createEmptyInput();
        } else {
          p2Input = ai.computeInput(state.engine.p2, state.engine.p1, state.engine.projectiles);
        }
        state.engine.step(p1Input, p2Input);
        state.accumulator -= FIXED_DT;
      }

      if (
        state.engine.phase === MATCH_PHASES.MATCH_OVER &&
        matchOverOverlay.classList.contains('hidden')
      ) {
        matchOverTitle.textContent = state.engine.announcement;
        matchOverOverlay.classList.remove('hidden');
      }
    }

    renderer.render(state.engine);
  }

  // Bind UI controls
  STAGES.forEach((s, idx) => {
    const opt = document.createElement('option');
    opt.value = String(idx);
    opt.textContent = `${s.name} (${s.enName})`;
    stageSelect.appendChild(opt);
  });

  modeSelect.addEventListener('change', () => {
    state.mode = modeSelect.value;
    renderTeamBadges();
  });
  diffSelect.addEventListener('change', () => {
    state.difficulty = diffSelect.value;
    ai.setDifficulty(state.difficulty);
  });
  stageSelect.addEventListener('change', () => {
    state.stageIndex = Number(stageSelect.value) || 0;
  });

  document.getElementById('btnStartFight').addEventListener('click', startMatch);
  document.getElementById('btnRematch').addEventListener('click', startMatch);
  document.getElementById('btnBackMenu').addEventListener('click', () => {
    state.inMenu = true;
    matchOverOverlay.classList.add('hidden');
    menuOverlay.classList.remove('hidden');
  });
  document.getElementById('btnMenu').addEventListener('click', () => {
    state.inMenu = true;
    state.paused = false;
    matchOverOverlay.classList.add('hidden');
    menuOverlay.classList.remove('hidden');
  });
  document.getElementById('btnRestart').addEventListener('click', () => {
    if (!state.inMenu) startMatch();
  });
  btnPause.addEventListener('click', togglePause);
  btnMute.addEventListener('click', () => {
    audio.unlock();
    const muted = audio.toggleMute();
    btnMute.textContent = muted ? '音效: 关' : '音效: 开';
  });
  btnHitbox.addEventListener('click', () => {
    renderer.showHitboxes = !renderer.showHitboxes;
    btnHitbox.textContent = renderer.showHitboxes ? '判定框: 开' : '判定框: 关';
  });

  document.getElementById('btnMoves').addEventListener('click', () => {
    moveListModal.classList.remove('hidden');
  });
  document.getElementById('btnCloseMoves').addEventListener('click', () => {
    moveListModal.classList.add('hidden');
  });

  // Bind on-screen arcade touch/pointer buttons
  document.querySelectorAll('[data-pad]').forEach((btn) => {
    const action = btn.getAttribute('data-pad');
    const press = (e) => {
      e.preventDefault();
      audio.unlock();
      touchInputP1[action] = true;
      btn.classList.add('scale-95', 'brightness-125');
    };
    const release = (e) => {
      e.preventDefault();
      touchInputP1[action] = false;
      btn.classList.remove('scale-95', 'brightness-125');
    };
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointerleave', release);
    btn.addEventListener('pointercancel', release);
  });

  // Initial attract-mode background engine preview
  state.engine = new MatchEngine({
    mode: state.mode,
    stageIndex: state.stageIndex,
    p1Team: state.p1Team,
    p2Team: state.p2Team,
    audio: null
  });

  renderTeamBadges();
  renderRoster();
  renderMoveList();

  if (state.rafId) cancelAnimationFrame(state.rafId);
  state.rafId = requestAnimationFrame(gameLoop);
}

if (typeof window !== 'undefined') {
  window.addEventListener('load', initKofApp);
}
