/**
 * Crimson Night - 浏览器运行入口与 UI 桥接控制器
 */

import { CHARACTERS, WEAPONS, PASSIVES } from './config.js';
import { GameEngine } from './engine.js';
import { GameRenderer } from './renderer.js';
import { SoundSynthesizer } from './audio.js';

const STORAGE_KEY = 'crimson_night_records_v1';

function loadRecords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // 忽略沙箱禁用存储
  }
  return { bestTime: 0, bestKills: 0, totalGold: 0 };
}

function saveRecords(rec) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rec));
  } catch {
    // 忽略沙箱禁用存储
  }
}

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function bootGame() {
  const canvas = document.getElementById('game-canvas');
  const hud = document.getElementById('hud');
  const xpBarFill = document.getElementById('xp-bar-fill');
  const hudHp = document.getElementById('hud-hp');
  const hudLevel = document.getElementById('hud-level');
  const hudTimer = document.getElementById('hud-timer');
  const hudWave = document.getElementById('hud-wave');
  const hudKills = document.getElementById('hud-kills');
  const hudGold = document.getElementById('hud-gold');
  const hudWeapons = document.getElementById('hud-weapons');
  const hudPassives = document.getElementById('hud-passives');
  const eventBanner = document.getElementById('event-banner');

  const modalMenu = document.getElementById('modal-menu');
  const modalLevelup = document.getElementById('modal-levelup');
  const modalChest = document.getElementById('modal-chest');
  const modalPause = document.getElementById('modal-pause');
  const modalEnd = document.getElementById('modal-end');

  const charGrid = document.getElementById('char-grid');
  const upgradeList = document.getElementById('upgrade-list');
  const btnStart = document.getElementById('btn-start');
  const btnMute = document.getElementById('btn-mute');
  const btnPause = document.getElementById('btn-pause');
  const btnChestOk = document.getElementById('btn-chest-ok');
  const btnResume = document.getElementById('btn-resume');
  const btnQuitMenu = document.getElementById('btn-quit-menu');
  const btnEndless = document.getElementById('btn-endless');
  const btnRestart = document.getElementById('btn-restart');
  const btnEndMenu = document.getElementById('btn-end-menu');

  const audio = new SoundSynthesizer();
  const renderer = new GameRenderer(canvas);
  let records = loadRecords();
  let selectedCharId = CHARACTERS[0].id;
  let rafId = null;
  let lastTs = 0;

  const keys = new Set();
  const joystick = {
    active: false,
    pointerId: null,
    originX: 0,
    originY: 0,
    knobX: 0,
    knobY: 0,
    dx: 0,
    dy: 0,
  };

  const engine = new GameEngine({
    characterId: selectedCharId,
    onAudio: (evt) => audio.play(evt),
  });
  engine.onStateChange = (reason) => syncUI(reason);

  function handleResize() {
    const size = renderer.resize();
    engine.setViewport(size.width, size.height);
    renderer.render(engine, joystick);
  }

  function renderRecords() {
    document.getElementById('rec-time').textContent = formatTime(records.bestTime);
    document.getElementById('rec-kills').textContent = String(records.bestKills);
    document.getElementById('rec-gold').textContent = String(records.totalGold);
  }

  function commitRunRecord() {
    let changed = false;
    if (engine.time > records.bestTime) {
      records.bestTime = Math.floor(engine.time);
      changed = true;
    }
    if (engine.kills > records.bestKills) {
      records.bestKills = engine.kills;
      changed = true;
    }
    if (engine.gold > 0) {
      records.totalGold += engine.gold;
      changed = true;
    }
    if (changed) {
      saveRecords(records);
      renderRecords();
    }
  }

  function renderCharacterCards() {
    charGrid.innerHTML = '';
    for (const c of CHARACTERS) {
      const startW = WEAPONS[c.startWeapon];
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `char-card${c.id === selectedCharId ? ' selected' : ''}`;
      card.innerHTML = `
        <div class="char-name">${c.name}</div>
        <div class="char-title">${c.title} · 初始武器：${startW.icon} ${startW.name}</div>
        <div class="char-desc">${c.desc}</div>
        <div class="char-meta">
          <span>HP ${c.stats.maxHp}</span>
          <span>移速 ${c.stats.moveSpeed}</span>
          <span>护甲 ${c.stats.armor}</span>
        </div>
      `;
      card.addEventListener('click', () => {
        selectedCharId = c.id;
        renderCharacterCards();
      });
      charGrid.appendChild(card);
    }
  }

  function renderDamageRows(containerEl) {
    const summary = engine.getSummary();
    containerEl.innerHTML = summary.weapons
      .map(
        (w) => `
      <div class="damage-row">
        <span>${w.icon} ${w.name} ${w.evolved ? '(超武)' : `Lv.${w.level}`}</span>
        <strong>${w.totalDamage.toLocaleString()} 伤害</strong>
      </div>
    `
      )
      .join('');
  }

  function renderUpgradeModal() {
    upgradeList.innerHTML = '';
    engine.levelUpChoices.forEach((choice, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'upgrade-card';
      btn.innerHTML = `
        <div class="upgrade-icon">${choice.icon}</div>
        <div class="upgrade-body">
          <div class="upgrade-head">
            <span class="upgrade-name">[${idx + 1}] ${choice.name}</span>
            <span class="upgrade-tag">${choice.tag}</span>
          </div>
          <div class="upgrade-desc">${choice.desc}</div>
        </div>
      `;
      btn.addEventListener('click', () => {
        engine.selectUpgrade(idx);
      });
      upgradeList.appendChild(btn);
    });
  }

  function syncUI(reason) {
    const st = engine.status;
    hud.classList.toggle('hidden', st === 'menu');
    modalMenu.classList.toggle('hidden', st !== 'menu');
    modalLevelup.classList.toggle('hidden', st !== 'levelup');
    modalChest.classList.toggle('hidden', st !== 'chest');
    modalPause.classList.toggle('hidden', st !== 'paused');
    modalEnd.classList.toggle('hidden', st !== 'gameover' && st !== 'victory');

    if (st === 'levelup') {
      renderUpgradeModal();
    } else if (st === 'chest' && engine.pendingChestReward) {
      const r = engine.pendingChestReward;
      document.getElementById('chest-icon').textContent = r.icon;
      document.getElementById('chest-title').textContent = r.title;
      document.getElementById('chest-desc').textContent = r.desc;
      document.getElementById('chest-gold').textContent = `💰 +${r.gold} 金币`;
    } else if (st === 'paused') {
      renderDamageRows(document.getElementById('pause-damage-list'));
    } else if (st === 'gameover' || st === 'victory') {
      if (reason === 'gameover' || reason === 'victory') {
        commitRunRecord();
      }
      const isWin = st === 'victory';
      document.getElementById('end-title').textContent = isWin ? '🌅 黎明降临 · 胜利！' : '💀 陨落于血夜';
      document.getElementById('end-subtitle').textContent = isWin
        ? '你成功存活 10 分钟并击退了暗夜大军！'
        : '暗夜吞噬了猎人的身影，再次磨砺你的构筑吧。';
      document.getElementById('end-time').textContent = formatTime(engine.time);
      document.getElementById('end-kills').textContent = String(engine.kills);
      document.getElementById('end-level').textContent = String(engine.player.level);
      document.getElementById('end-gold').textContent = String(engine.gold);
      btnEndless.classList.toggle('hidden', !isWin);
      renderDamageRows(document.getElementById('end-damage-list'));
    }
    updateHud();
  }

  function updateHud() {
    const p = engine.player;
    hudHp.textContent = `${Math.ceil(p.hp)}/${p.maxHp}`;
    hudLevel.textContent = String(p.level);
    hudTimer.textContent = formatTime(engine.time);
    hudWave.textContent = engine.endlessMode ? '无尽血夜模式' : '目标 10:00 · 存活';
    hudKills.textContent = String(engine.kills);
    hudGold.textContent = String(engine.gold);
    xpBarFill.style.width = `${Math.min(100, (p.xp / Math.max(1, p.xpToNext)) * 100)}%`;

    hudWeapons.innerHTML = p.weapons
      .map((w) => {
        const def = WEAPONS[w.id];
        return `<div class="slot-box${def.evolved ? ' evolved' : ''}" title="${def.name}">${def.icon}<span class="slot-lv">${def.evolved ? '★' : w.level}</span></div>`;
      })
      .join('');

    hudPassives.innerHTML = p.passives
      .map((ps) => {
        const def = PASSIVES[ps.id];
        return `<div class="slot-box" title="${def.name}">${def.icon}<span class="slot-lv">${ps.level}</span></div>`;
      })
      .join('');

    if (engine.bannerMessage) {
      eventBanner.textContent = engine.bannerMessage.text;
      eventBanner.classList.remove('hidden');
    } else {
      eventBanner.classList.add('hidden');
    }
  }

  function getInputVector() {
    let dx = 0;
    let dy = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) dy -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) dy += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) dx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) dx += 1;
    if (dx === 0 && dy === 0 && joystick.active) {
      dx = joystick.dx;
      dy = joystick.dy;
    }
    return { dx, dy };
  }

  function loop(ts) {
    if (!lastTs) lastTs = ts;
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;

    if (engine.status === 'playing') {
      engine.step(dt, getInputVector());
      updateHud();
    }
    renderer.render(engine, joystick);
    rafId = requestAnimationFrame(loop);
  }

  // 事件绑定
  window.addEventListener('resize', handleResize);

  window.addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (engine.status === 'playing' || engine.status === 'paused') {
        engine.togglePause();
      }
    } else if (engine.status === 'levelup') {
      if (e.code === 'Digit1') engine.selectUpgrade(0);
      else if (e.code === 'Digit2') engine.selectUpgrade(1);
      else if (e.code === 'Digit3') engine.selectUpgrade(2);
    }
  });

  window.addEventListener('keyup', (e) => {
    keys.delete(e.code);
  });

  // 指针/触屏虚拟摇杆
  canvas.addEventListener('pointerdown', (e) => {
    audio.unlock();
    if (engine.status !== 'playing') return;
    joystick.active = true;
    joystick.pointerId = e.pointerId;
    joystick.originX = e.clientX;
    joystick.originY = e.clientY;
    joystick.knobX = e.clientX;
    joystick.knobY = e.clientY;
    joystick.dx = 0;
    joystick.dy = 0;
  });

  window.addEventListener('pointermove', (e) => {
    if (!joystick.active || e.pointerId !== joystick.pointerId) return;
    const vx = e.clientX - joystick.originX;
    const vy = e.clientY - joystick.originY;
    const len = Math.hypot(vx, vy);
    const maxR = 46;
    const clamped = Math.min(len, maxR);
    const ang = Math.atan2(vy, vx);
    joystick.knobX = joystick.originX + Math.cos(ang) * clamped;
    joystick.knobY = joystick.originY + Math.sin(ang) * clamped;
    if (len > 6) {
      joystick.dx = Math.cos(ang);
      joystick.dy = Math.sin(ang);
    } else {
      joystick.dx = 0;
      joystick.dy = 0;
    }
  });

  function releaseJoystick(e) {
    if (!joystick.active || (e && e.pointerId !== joystick.pointerId)) return;
    joystick.active = false;
    joystick.pointerId = null;
    joystick.dx = 0;
    joystick.dy = 0;
  }

  window.addEventListener('pointerup', releaseJoystick);
  window.addEventListener('pointercancel', releaseJoystick);

  btnStart.addEventListener('click', () => {
    audio.unlock();
    engine.start(selectedCharId);
  });

  btnMute.addEventListener('click', () => {
    audio.unlock();
    const muted = audio.toggleMute();
    btnMute.textContent = muted ? '🔇 静音' : '🔊 音效';
  });

  btnPause.addEventListener('click', () => engine.togglePause());
  btnResume.addEventListener('click', () => engine.togglePause());
  btnChestOk.addEventListener('click', () => engine.closeChestModal());

  btnQuitMenu.addEventListener('click', () => {
    engine.reset(selectedCharId);
  });

  btnEndless.addEventListener('click', () => {
    engine.continueEndless();
  });

  btnRestart.addEventListener('click', () => {
    audio.unlock();
    engine.start(selectedCharId);
  });

  btnEndMenu.addEventListener('click', () => {
    engine.reset(selectedCharId);
  });

  renderRecords();
  renderCharacterCards();
  handleResize();
  syncUI('init');

  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(loop);
}

if (typeof window !== 'undefined') {
  window.addEventListener('load', () => bootGame());
}
