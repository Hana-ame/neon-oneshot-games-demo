/**
 * Main UI controller, input handler, HUD updates, modals, and game loop.
 */

import {
  BUILDING_INFO,
  RESOURCE_INFO,
  TERRAIN_INFO,
  NATURAL_INFO,
  WORK_CATEGORIES,
  TECH_TREE,
} from './constants.js';
import { World } from './simulation.js';
import { Renderer } from './renderer.js';
import { SoundEngine } from './audio.js';

const SAVE_KEY = 'rimweb_colony_save_v1';

const SUB_MENUS = {
  orders: [
    { id: 'chop', label: '🪓 砍伐树木', mode: 'order', value: 'chop' },
    { id: 'mine', label: '⛏ 开采矿石', mode: 'order', value: 'mine' },
    { id: 'harvest', label: '🫐 采摘浆果', mode: 'order', value: 'harvest' },
    { id: 'cancel', label: '✖ 取消/退料', mode: 'order', value: 'cancel' },
  ],
  zones: [
    { id: 'growing', label: '🌾 种植区', mode: 'zone', value: 'growing' },
    { id: 'stockpile', label: '📦 储存区', mode: 'zone', value: 'stockpile' },
    { id: 'clear_zone', label: '🧹 清除区域', mode: 'zone', value: 'clear' },
  ],
  build: Object.entries(BUILDING_INFO).map(([key, info]) => {
    const costStr = Object.entries(info.cost)
      .map(([r, n]) => `${RESOURCE_INFO[r]?.name || r}${n}`)
      .join(' ');
    return {
      id: `build_${key}`,
      label: `${info.name}`,
      hint: costStr,
      mode: 'build',
      value: key,
    };
  }),
};

function initApp() {
  const canvas = document.getElementById('game-canvas');
  if (!canvas) return;

  let world = new World({ seed: Math.floor(Date.now() % 100000) });
  const renderer = new Renderer(canvas);
  const sound = new SoundEngine();
  world.onSound = (name) => sound.play(name);

  const uiState = {
    activeMenu: 'select',
    activeTool: { mode: 'select', value: null },
    selectedColonistId: world.colonists[0]?.id || null,
    selectedTile: null,
    hoverTile: null,
    dragStart: null,
    isPanning: false,
    panLast: null,
    keysDown: new Set(),
    modalOpen: null,
  };

  renderer.resize();
  renderer.centerOn(world.map.spawnPoint.x, world.map.spawnPoint.y);

  // DOM refs
  const elColonistBar = document.getElementById('colonist-bar');
  const elClockTime = document.getElementById('clock-time');
  const elClockSub = document.getElementById('clock-sub');
  const elPopCount = document.getElementById('pop-count');
  const elResourceList = document.getElementById('resource-list');
  const elPowerVal = document.getElementById('power-val');
  const elAlerts = document.getElementById('alerts-panel');
  const elInspector = document.getElementById('inspector-panel');
  const elLogList = document.getElementById('log-list');
  const elSubToolbar = document.getElementById('sub-toolbar');
  const elMainToolbar = document.getElementById('main-toolbar');
  const elModalBackdrop = document.getElementById('modal-backdrop');
  const elModalTitle = document.getElementById('modal-title');
  const elModalBody = document.getElementById('modal-body');

  const btnPause = document.getElementById('btn-pause');
  const btnS1 = document.getElementById('btn-s1');
  const btnS2 = document.getElementById('btn-s2');
  const btnS3 = document.getElementById('btn-s3');
  const btnMute = document.getElementById('btn-mute');

  function updateSpeedButtons() {
    btnPause.classList.toggle('active', world.paused);
    btnPause.textContent = world.paused ? '▶' : '⏸';
    btnS1.classList.toggle('active', !world.paused && world.speed === 1);
    btnS2.classList.toggle('active', !world.paused && world.speed === 2);
    btnS3.classList.toggle('active', !world.paused && world.speed === 3);
  }

  function setMenu(menuName) {
    uiState.activeMenu = menuName;
    elMainToolbar.querySelectorAll('[data-menu]').forEach((b) => {
      b.classList.toggle('active', b.dataset.menu === menuName);
    });

    if (menuName === 'select' || !SUB_MENUS[menuName]) {
      uiState.activeTool = { mode: 'select', value: null };
      elSubToolbar.classList.remove('visible');
      elSubToolbar.innerHTML = '';
      return;
    }

    const items = SUB_MENUS[menuName];
    elSubToolbar.innerHTML = items
      .map(
        (it, idx) =>
          `<button class="btn${idx === 0 ? ' active' : ''}" data-mode="${it.mode}" data-val="${it.value}">${it.label}${
            it.hint ? `<span class="tool-hint">${it.hint}</span>` : ''
          }</button>`
      )
      .join('');
    elSubToolbar.classList.add('visible');
    uiState.activeTool = { mode: items[0].mode, value: items[0].value };
  }

  // Event delegation for main toolbar & sub toolbar
  elMainToolbar.addEventListener('click', (e) => {
    sound.unlock();
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.menu) {
      sound.play('click');
      setMenu(btn.dataset.menu);
    }
  });

  elSubToolbar.addEventListener('click', (e) => {
    sound.unlock();
    const btn = e.target.closest('button');
    if (!btn || !btn.dataset.mode) return;
    sound.play('click');
    elSubToolbar.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    uiState.activeTool = { mode: btn.dataset.mode, value: btn.dataset.val };
  });

  // Speed & audio buttons
  btnPause.addEventListener('click', () => {
    sound.unlock();
    world.paused = !world.paused;
    updateSpeedButtons();
  });
  btnS1.addEventListener('click', () => {
    sound.unlock();
    world.paused = false;
    world.speed = 1;
    updateSpeedButtons();
  });
  btnS2.addEventListener('click', () => {
    sound.unlock();
    world.paused = false;
    world.speed = 2;
    updateSpeedButtons();
  });
  btnS3.addEventListener('click', () => {
    sound.unlock();
    world.paused = false;
    world.speed = 3;
    updateSpeedButtons();
  });
  btnMute.addEventListener('click', () => {
    sound.unlock();
    const muted = sound.toggleMute();
    btnMute.textContent = muted ? '🔇' : '🔊';
  });

  // Modal Helpers
  function openModal(type, title) {
    uiState.modalOpen = type;
    elModalTitle.textContent = title;
    renderModalContent();
    elModalBackdrop.classList.add('visible');
  }

  function closeModal() {
    uiState.modalOpen = null;
    elModalBackdrop.classList.remove('visible');
  }

  document.getElementById('modal-close').addEventListener('click', closeModal);
  elModalBackdrop.addEventListener('click', (e) => {
    if (e.target === elModalBackdrop) closeModal();
  });

  document.getElementById('btn-open-work').addEventListener('click', () => openModal('work', '工作优先级调度 (1最高 / 0关闭)'));
  document.getElementById('btn-open-tech').addEventListener('click', () => openModal('tech', '殖民地科技树'));
  document.getElementById('btn-open-story').addEventListener('click', () => openModal('story', 'AI 叙事者与沙盒事件'));
  document.getElementById('btn-open-save').addEventListener('click', () => openModal('save', '存档与新开局'));
  document.getElementById('btn-open-help').addEventListener('click', () => openModal('help', 'RimWeb 操作与生存指南'));

  function renderModalContent() {
    if (uiState.modalOpen === 'work') {
      const headers = WORK_CATEGORIES.map((c) => `<th>${c.label}</th>`).join('');
      const rows = world.colonists
        .filter((c) => c.alive)
        .map((c) => {
          const cells = WORK_CATEGORIES.map((cat) => {
            const p = c.workPriorities[cat.id] ?? 0;
            return `<td><button class="prio-btn p${p}" data-col="${c.id}" data-cat="${cat.id}">${p === 0 ? '-' : p}</button></td>`;
          }).join('');
          return `<tr><td>${c.name} <span style="color:#94a3b8;font-weight:400">(${c.trait.name})</span></td>${cells}</tr>`;
        })
        .join('');
      elModalBody.innerHTML = `<table class="work-table"><thead><tr><th>殖民者</th>${headers}</tr></thead><tbody>${rows}</tbody></table>
        <p style="color:#94a3b8;font-size:11px;margin-top:10px;">点击数字可在 1 → 2 → 3 → 4 → 关闭(-) 间循环切换。</p>`;
    } else if (uiState.modalOpen === 'tech') {
      elModalBody.innerHTML = TECH_TREE.map((t) => {
        const done = world.researchedTechs.has(t.id);
        const active = world.activeTechId === t.id && !done;
        const prog = Math.min(t.cost, Math.round(world.techProgress[t.id] || 0));
        return `<div class="tech-card ${done ? 'done' : active ? 'active' : ''}">
          <div>
            <div style="font-weight:700">${t.name} ${done ? '✅' : active ? '(研究中)' : ''}</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px">${t.desc}</div>
            <div style="font-size:11px;color:#38bdf8;margin-top:4px">进度：${done ? t.cost : prog} / ${t.cost}</div>
          </div>
          ${
            done
              ? '<span style="color:#22c55e;font-weight:700">已解锁</span>'
              : `<button class="btn ${active ? 'active' : ''}" data-select-tech="${t.id}">${active ? '当前研究' : '设为研究'}</button>`
          }
        </div>`;
      }).join('') + '<p style="color:#94a3b8;font-size:11px;">提示：建造「研究台」后，殖民者会自动前来推进当前科技。</p>';
    } else if (uiState.modalOpen === 'story') {
      elModalBody.innerHTML = `
        <p style="color:#cbd5e1;margin-top:0">AI 叙事者会随时间自动触发随机事件，你也可以在此手动测试各类突发状况：</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">
          <button class="btn btn-danger" data-event="raid">⚔ 触发海盗袭击</button>
          <button class="btn" data-event="cargo_pods">📦 投放空投补给</button>
          <button class="btn" data-event="wanderer">🧑 招募流浪者</button>
          <button class="btn" data-event="caravan">🪙 呼叫商队赠礼</button>
          <button class="btn" data-event="weather">🌦 切换随机天气</button>
        </div>
        <div style="margin-top:14px;padding-top:10px;border-top:1px solid rgba(148,163,184,0.2);font-size:12px;color:#94a3b8">
          已击退掠夺者：<b>${world.stats.raidersDefeated}</b> · 已建成建筑：<b>${world.stats.buildingsBuilt}</b> · 已烹制餐食：<b>${world.stats.mealsCooked}</b>
        </div>`;
    } else if (uiState.modalOpen === 'save') {
      elModalBody.innerHTML = `
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">
          <button class="btn active" id="btn-save-local">💾 保存到浏览器本地</button>
          <button class="btn" id="btn-load-local">📂 读取本地存档</button>
          <button class="btn" id="btn-export-json">📤 导出 JSON 存档</button>
          <button class="btn btn-danger" id="btn-new-game">🔄 生成新地图开局</button>
        </div>
        <div id="save-feedback" style="font-size:12px;color:#38bdf8;min-height:18px;margin-bottom:8px"></div>
        <label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px">JSON 存档导入/导出区：</label>
        <textarea id="save-json-area" rows="5" style="width:100%;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:8px;font-family:monospace;font-size:11px"></textarea>
        <button class="btn" id="btn-import-json" style="margin-top:6px">📥 从上方 JSON 载入</button>`;
    } else if (uiState.modalOpen === 'help') {
      elModalBody.innerHTML = `
        <ul style="line-height:1.7;padding-left:18px;margin:0;color:#e2e8f0">
          <li><b>视角控制</b>：WASD / 方向键平移，右键拖拽地图，滚轮缩放视野。</li>
          <li><b>资源采集</b>：点击底部「指令」选择砍树、采矿或采摘，在地图上拖拽框选目标区域。</li>
          <li><b>农耕与建造</b>：在肥沃土壤划定「种植区」自动播种收割；建造「木床」提升休息效率，「太阳能板 + 自动机枪塔」构建自动防线。</li>
          <li><b>战斗征召</b>：选中殖民者后按 <b>R</b> 键或点击「征召」，右键点击地图任意可行走位置进行战术走位，进入射程后自动迎敌。</li>
          <li><b>快捷键</b>：<code>Space</code> 暂停/继续，<code>1/2/3</code> 切换倍速，<code>Esc</code> 返回选择模式。</li>
        </ul>`;
    }
  }

  elModalBody.addEventListener('click', (e) => {
    sound.unlock();
    const prioBtn = e.target.closest('.prio-btn');
    if (prioBtn) {
      const col = world.colonists.find((c) => c.id === prioBtn.dataset.col);
      if (col) {
        const cur = col.workPriorities[prioBtn.dataset.cat] ?? 0;
        col.workPriorities[prioBtn.dataset.cat] = (cur + 1) % 5;
        sound.play('click');
        renderModalContent();
      }
      return;
    }

    const techBtn = e.target.closest('[data-select-tech]');
    if (techBtn) {
      world.activeTechId = techBtn.dataset.selectTech;
      sound.play('click');
      renderModalContent();
      return;
    }

    const evBtn = e.target.closest('[data-event]');
    if (evBtn) {
      world.triggerStorytellerEvent(evBtn.dataset.event);
      closeModal();
      return;
    }

    const feedback = document.getElementById('save-feedback');
    if (e.target.id === 'btn-save-local') {
      try {
        localStorage.setItem(SAVE_KEY, world.serialize());
        if (feedback) feedback.textContent = '✅ 已成功保存到浏览器本地存储。';
      } catch {
        if (feedback) feedback.textContent = '⚠️ 当前环境受限，请使用下方 JSON 导出备份。';
      }
    } else if (e.target.id === 'btn-load-local') {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) {
          if (feedback) feedback.textContent = '未找到本地存档。';
        } else {
          world = World.deserialize(raw);
          world.onSound = (name) => sound.play(name);
          renderer.centerOn(world.map.spawnPoint.x, world.map.spawnPoint.y);
          if (feedback) feedback.textContent = '✅ 已读取本地存档！';
        }
      } catch {
        if (feedback) feedback.textContent = '⚠️ 读取失败或当前环境不支持本地存储。';
      }
    } else if (e.target.id === 'btn-export-json') {
      const area = document.getElementById('save-json-area');
      if (area) {
        area.value = world.serialize();
        area.select();
        try { document.execCommand('copy'); } catch {}
        if (feedback) feedback.textContent = '✅ 已生成 JSON 存档文本。';
      }
    } else if (e.target.id === 'btn-import-json') {
      const area = document.getElementById('save-json-area');
      try {
        world = World.deserialize(area.value);
        world.onSound = (name) => sound.play(name);
        renderer.centerOn(world.map.spawnPoint.x, world.map.spawnPoint.y);
        if (feedback) feedback.textContent = '✅ JSON 存档导入成功！';
      } catch {
        if (feedback) feedback.textContent = '❌ JSON 格式无效，无法载入。';
      }
    } else if (e.target.id === 'btn-new-game') {
      world = new World({ seed: Math.floor(Math.random() * 100000) });
      world.onSound = (name) => sound.play(name);
      uiState.selectedColonistId = world.colonists[0]?.id || null;
      renderer.centerOn(world.map.spawnPoint.x, world.map.spawnPoint.y);
      closeModal();
    }
  });

  // Canvas Input (Mouse & Touch)
  function getCanvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointerdown', (e) => {
    sound.unlock();
    const pos = getCanvasPos(e);
    const tilePos = renderer.screenToTile(pos.x, pos.y);

    // Right click: drafted move OR pan
    if (e.button === 2 || e.button === 1) {
      if (e.button === 2 && uiState.selectedColonistId) {
        const col = world.colonists.find((c) => c.id === uiState.selectedColonistId && c.alive);
        if (col && col.drafted) {
          if (world.commandDraftedMove(col.id, tilePos.x, tilePos.y)) {
            world.spawnFloatingText(tilePos.x, tilePos.y - 0.3, '→ 移动', '#facc15');
            return;
          }
        }
      }
      uiState.isPanning = true;
      uiState.panLast = pos;
      canvas.setPointerCapture(e.pointerId);
      return;
    }

    // Left click
    if (uiState.activeTool.mode === 'select') {
      // Check if clicked on a colonist
      const clickedCol = world.colonists.find(
        (c) => c.alive && Math.hypot(c.x + 0.5 - tilePos.wx, c.y + 0.5 - tilePos.wy) < 0.85
      );
      if (clickedCol) {
        uiState.selectedColonistId = clickedCol.id;
        uiState.selectedTile = null;
        sound.play('click');
      } else {
        uiState.selectedColonistId = null;
        uiState.selectedTile = { x: tilePos.x, y: tilePos.y };
        sound.play('click');
      }
      updateInspector();
    } else if (uiState.activeTool.mode === 'build') {
      const res = world.placeBlueprint(tilePos.x, tilePos.y, uiState.activeTool.value);
      if (!res.ok) {
        world.spawnFloatingText(tilePos.x, tilePos.y - 0.3, res.reason, '#fca5a5');
      }
    } else {
      uiState.dragStart = { x: tilePos.x, y: tilePos.y };
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const pos = getCanvasPos(e);
    if (uiState.isPanning && uiState.panLast) {
      const dx = (pos.x - uiState.panLast.x) / renderer.camera.zoom;
      const dy = (pos.y - uiState.panLast.y) / renderer.camera.zoom;
      renderer.camera.x -= dx;
      renderer.camera.y -= dy;
      uiState.panLast = pos;
      return;
    }
    const tilePos = renderer.screenToTile(pos.x, pos.y);
    if (tilePos.x >= 0 && tilePos.x < world.map.width && tilePos.y >= 0 && tilePos.y < world.map.height) {
      uiState.hoverTile = { x: tilePos.x, y: tilePos.y };
    } else {
      uiState.hoverTile = null;
    }
  });

  canvas.addEventListener('pointerup', (e) => {
    if (uiState.isPanning) {
      uiState.isPanning = false;
      uiState.panLast = null;
      return;
    }
    if (uiState.dragStart && uiState.hoverTile) {
      const { x: x1, y: y1 } = uiState.dragStart;
      const { x: x2, y: y2 } = uiState.hoverTile;
      if (uiState.activeTool.mode === 'order') {
        world.designateOrder(x1, y1, x2, y2, uiState.activeTool.value);
      } else if (uiState.activeTool.mode === 'zone') {
        world.designateZone(x1, y1, x2, y2, uiState.activeTool.value);
      }
    }
    uiState.dragStart = null;
  });

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 0.89;
      renderer.camera.zoom = Math.max(0.55, Math.min(2.2, renderer.camera.zoom * factor));
    },
    { passive: false }
  );

  // Keyboard controls
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
    uiState.keysDown.add(e.code);

    if (e.code === 'Space') {
      e.preventDefault();
      world.paused = !world.paused;
      updateSpeedButtons();
    } else if (e.code === 'Digit1') {
      world.paused = false;
      world.speed = 1;
      updateSpeedButtons();
    } else if (e.code === 'Digit2') {
      world.paused = false;
      world.speed = 2;
      updateSpeedButtons();
    } else if (e.code === 'Digit3') {
      world.paused = false;
      world.speed = 3;
      updateSpeedButtons();
    } else if (e.code === 'Escape') {
      if (uiState.modalOpen) closeModal();
      else setMenu('select');
    } else if (e.code === 'KeyR' && uiState.selectedColonistId) {
      const col = world.colonists.find((c) => c.id === uiState.selectedColonistId && c.alive);
      if (col) {
        world.draftColonist(col.id, !col.drafted);
        updateInspector();
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    uiState.keysDown.delete(e.code);
  });

  window.addEventListener('resize', () => {
    renderer.resize();
  });

  // Top colonist bar click
  elColonistBar.addEventListener('click', (e) => {
    const chip = e.target.closest('.colonist-chip');
    if (!chip) return;
    const col = world.colonists.find((c) => c.id === chip.dataset.id && c.alive);
    if (col) {
      uiState.selectedColonistId = col.id;
      uiState.selectedTile = null;
      renderer.centerOn(col.x, col.y);
      sound.play('click');
      updateInspector();
    }
  });

  // Inspector actions (Draft button)
  elInspector.addEventListener('click', (e) => {
    const btn = e.target.closest('#btn-toggle-draft');
    if (!btn || !uiState.selectedColonistId) return;
    const col = world.colonists.find((c) => c.id === uiState.selectedColonistId && c.alive);
    if (col) {
      world.draftColonist(col.id, !col.drafted);
      updateInspector();
    }
  });

  // Dismiss alerts
  elAlerts.addEventListener('click', (e) => {
    const card = e.target.closest('.alert-card');
    if (card) world.dismissAlert(card.dataset.id);
  });

  function updateInspector() {
    if (uiState.selectedColonistId) {
      const c = world.colonists.find((col) => col.id === uiState.selectedColonistId && col.alive);
      if (!c) {
        elInspector.classList.remove('visible');
        return;
      }
      const thoughtsHtml = c.thoughts
        .map((t) => `<span class="thought-tag ${t.delta >= 0 ? 'pos' : 'neg'}">${t.label} ${t.delta > 0 ? '+' : ''}${t.delta}</span>`)
        .join('');
      elInspector.innerHTML = `
        <div class="insp-header">
          <span class="insp-name">${c.name} <span style="font-size:11px;color:#94a3b8;font-weight:400">${c.trait.name}</span></span>
          <button id="btn-toggle-draft" class="btn ${c.drafted ? 'btn-warn active' : ''}">${c.drafted ? '⚔ 取消征召 (R)' : '⚔ 征召 (R)'}</button>
        </div>
        <div style="font-size:11px;color:#38bdf8;margin-bottom:4px">状态：${c.statusText}</div>
        <div class="insp-grid">
          <div>生命：<b>${Math.round(c.hp)}/${c.maxHp}</b></div>
          <div>心情：<b>${Math.round(c.mood)}%</b></div>
          <div>饱食：<b>${Math.round(c.needs.hunger)}%</b></div>
          <div>精力：<b>${Math.round(c.needs.rest)}%</b></div>
          <div>娱乐：<b>${Math.round(c.needs.joy)}%</b></div>
          <div>射击/建造：<b>${c.skills.shooting}/${c.skills.build}</b></div>
        </div>
        <div class="thought-tags">${thoughtsHtml}</div>`;
      elInspector.classList.add('visible');
      return;
    }

    if (uiState.selectedTile) {
      const t = world.getTile(uiState.selectedTile.x, uiState.selectedTile.y);
      if (!t) {
        elInspector.classList.remove('visible');
        return;
      }
      const tInfo = TERRAIN_INFO[t.terrain];
      const bInfo = t.building ? BUILDING_INFO[t.building.type] : null;
      const nInfo = t.natural ? NATURAL_INFO[t.natural] : null;
      elInspector.innerHTML = `
        <div class="insp-header">
          <span class="insp-name">${bInfo ? bInfo.name : nInfo ? nInfo.name : tInfo.name}</span>
          <span style="font-size:11px;color:#94a3b8">(${t.x}, ${t.y})</span>
        </div>
        <div style="font-size:11px;color:#cbd5e1;line-height:1.5">
          地形：${tInfo.name}（肥力 ${Math.round(tInfo.fertile * 100)}%）<br/>
          ${bInfo ? `建筑耐久：${Math.round(t.building.hp)}/${t.building.maxHp}${t.building.built ? '' : '（建造中）'}<br/>${bInfo.desc}` : ''}
          ${t.crop ? `作物进度：${Math.round(t.crop.progress)}%` : ''}
          ${t.zone ? `区域：${t.zone === 'growing' ? '种植区' : '储存区'}` : ''}
        </div>`;
      elInspector.classList.add('visible');
      return;
    }

    elInspector.classList.remove('visible');
  }

  let hudAccum = 0;
  function updateHUD() {
    // Clock
    const hh = String(Math.floor(world.timeOfDay)).padStart(2, '0');
    const mm = String(Math.floor((world.timeOfDay % 1) * 60)).padStart(2, '0');
    elClockTime.textContent = `第 ${world.day} 天 · ${hh}:${mm}`;
    elClockSub.textContent = `${world.weather.name} · ${world.getTemperature()}°C`;

    // Colonist Bar
    const living = world.colonists.filter((c) => c.alive);
    elPopCount.textContent = `${living.length}人`;
    elColonistBar.innerHTML = living
      .map((c) => {
        const moodColor = c.mood > 60 ? '#22c55e' : c.mood > 35 ? '#eab308' : '#ef4444';
        const hpColor = c.hp > 60 ? '#38bdf8' : '#ef4444';
        return `<div class="hud-panel colonist-chip ${uiState.selectedColonistId === c.id ? 'selected' : ''} ${c.drafted ? 'drafted' : ''}" data-id="${c.id}">
          <div class="chip-top">
            <span class="pawn-dot" style="background:${c.shirtColor}"></span>
            <span class="chip-name">${c.name}</span>
          </div>
          <div class="mini-bar"><div class="mini-bar-fill" style="width:${Math.round(c.hp)}%;background:${hpColor}"></div></div>
          <div class="mini-bar"><div class="mini-bar-fill" style="width:${Math.round(c.mood)}%;background:${moodColor}"></div></div>
          <div class="chip-status">${c.statusText}</div>
        </div>`;
      })
      .join('');

    // Resources
    elResourceList.innerHTML = Object.entries(RESOURCE_INFO)
      .map(
        ([k, info]) =>
          `<div class="res-row"><span>${info.icon} ${info.name}</span><span class="res-val">${Math.floor(world.resources[k] || 0)}</span></div>`
      )
      .join('');
    elPowerVal.textContent = `${world.power.net >= 0 ? '+' : ''}${world.power.net}W`;
    elPowerVal.style.color = world.power.net >= 0 ? '#86efac' : '#fca5a5';

    // Alerts
    elAlerts.innerHTML = world.alerts
      .map(
        (a) =>
          `<div class="hud-panel alert-card ${a.level}" data-id="${a.id}"><div class="alert-title">${a.title}</div><div class="alert-msg">${a.message}</div></div>`
      )
      .join('');

    // Logs
    elLogList.innerHTML = world.logs
      .slice(0, 12)
      .map((l) => `<div class="log-item ${l.level}">[D${l.day} ${l.time}] ${l.text}</div>`)
      .join('');

    updateInspector();
  }

  // Main Animation Loop
  let lastTs = performance.now();
  let rafId = null;

  function frame(ts) {
    const rawDt = Math.min(0.08, (ts - lastTs) / 1000);
    lastTs = ts;

    // Keyboard camera pan
    const panSpeed = (340 / renderer.camera.zoom) * rawDt;
    if (uiState.keysDown.has('KeyW') || uiState.keysDown.has('ArrowUp')) renderer.camera.y -= panSpeed;
    if (uiState.keysDown.has('KeyS') || uiState.keysDown.has('ArrowDown')) renderer.camera.y += panSpeed;
    if (uiState.keysDown.has('KeyA') || uiState.keysDown.has('ArrowLeft')) renderer.camera.x -= panSpeed;
    if (uiState.keysDown.has('KeyD') || uiState.keysDown.has('ArrowRight')) renderer.camera.x += panSpeed;

    world.tick(rawDt);
    renderer.render(world, uiState, ts / 1000);

    hudAccum += rawDt;
    if (hudAccum >= 0.2) {
      hudAccum = 0;
      updateHUD();
    }

    rafId = requestAnimationFrame(frame);
  }

  updateHUD();
  updateSpeedButtons();
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(frame);
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'complete') {
    initApp();
  } else {
    window.addEventListener('load', initApp);
  }
}
