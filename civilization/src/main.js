/**
 * Web Civilization - Main UI & Interaction Controller
 * 负责 Canvas 交互（拖拽/缩放/点击选格/行军/攻击）、HUD 渲染、科技树/外交/新游戏弹窗与本地存档
 */

import {
  TERRAIN, RESOURCES, IMPROVEMENTS, CIVILIZATIONS,
  UNITS, BUILDINGS, TECHNOLOGIES, MAP_PRESETS
} from './constants.js';
import { hexKey, offsetToAxial } from './hex.js';
import { GameEngine } from './engine.js';
import { runAiTurn } from './ai.js';
import { SoundManager } from './audio.js';
import { MapRenderer } from './renderer.js';

const SAVE_KEY = 'web_civ_save_v1';

export class GameApp {
  constructor() {
    this.engine = new GameEngine({ preset: 'standard', playerCivId: 'huaxia', seed: 2026 });
    this.sound = new SoundManager();
    this.canvas = document.getElementById('game-canvas');
    this.minimap = document.getElementById('minimap-canvas');
    this.renderer = new MapRenderer(this.canvas, this.minimap);

    this.uiState = {
      selectedHex: null,
      hoveredHex: null,
      selectedUnitId: null,
      selectedCityId: null,
      reachable: new Map(),
      attackTargets: [],
    };

    this.dragging = false;
    this.dragMoved = false;
    this.dragStart = { x: 0, y: 0 };
    this.camStart = { x: 0, y: 0 };
    this.toastTimer = null;
    this.rafId = null;

    this.bindEvents();
    this.renderer.resize();
    this.focusInitialUnit();
    this.updateHUD();
    this.startLoop();
  }

  startLoop() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    const tick = () => {
      this.renderer.render(this.engine, this.uiState);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  focusInitialUnit() {
    const firstUnit = Array.from(this.engine.units.values())
      .find(u => u.ownerId === this.engine.playerCivId);
    if (firstUnit) {
      this.selectUnit(firstUnit.id);
      this.renderer.centerOn(firstUnit.q, firstUnit.r);
    }
  }

  showToast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  clearSelection() {
    this.uiState.selectedUnitId = null;
    this.uiState.selectedCityId = null;
    this.uiState.reachable = new Map();
    this.uiState.attackTargets = [];
  }

  selectUnit(unitId) {
    const u = this.engine.units.get(unitId);
    if (!u || u.ownerId !== this.engine.playerCivId) return;
    this.uiState.selectedUnitId = unitId;
    this.uiState.selectedCityId = null;
    this.uiState.selectedHex = { q: u.q, r: u.r };
    this.uiState.reachable = this.engine.getReachableForUnit(unitId);
    this.uiState.attackTargets = this.engine.getAttackableTargets(unitId);
    this.updateSelectionPanel();
  }

  selectCity(cityId) {
    const c = this.engine.cities.get(cityId);
    if (!c || c.ownerId !== this.engine.playerCivId) return;
    this.uiState.selectedCityId = cityId;
    this.uiState.selectedUnitId = null;
    this.uiState.selectedHex = { q: c.q, r: c.r };
    this.uiState.reachable = new Map();
    this.uiState.attackTargets = [];
    this.updateSelectionPanel();
  }

  handleMapClick(sx, sy) {
    if (this.engine.winner) return;
    const hex = this.renderer.screenToHex(sx, sy);
    const tile = this.engine.getTile(hex.q, hex.r);
    if (!tile) return;

    const key = hexKey(hex.q, hex.r);

    // 1. If a player unit is currently selected, check attack or move
    if (this.uiState.selectedUnitId) {
      const atk = this.uiState.attackTargets.find(t => t.q === hex.q && t.r === hex.r);
      if (atk) {
        const res = this.engine.attackTarget(this.uiState.selectedUnitId, hex.q, hex.r);
        if (res.ok) {
          this.sound.playAttack();
          this.showToast(`交战：造成 ${res.damageDealt} 伤害${res.damageTaken ? `，承受 ${res.damageTaken} 反击` : ''}`);
          if (this.engine.units.has(this.uiState.selectedUnitId)) {
            this.selectUnit(this.uiState.selectedUnitId);
          } else {
            this.clearSelection();
          }
          this.updateHUD();
          this.checkVictoryModal();
        } else {
          this.showToast(res.reason);
        }
        return;
      }

      if (this.uiState.reachable.has(key)) {
        const res = this.engine.moveUnit(this.uiState.selectedUnitId, hex.q, hex.r);
        if (res.ok) {
          this.sound.playMove();
          this.selectUnit(this.uiState.selectedUnitId);
          this.updateHUD();
        }
        return;
      }
    }

    // 2. Otherwise select player unit or city on that hex
    this.uiState.selectedHex = { q: hex.q, r: hex.r };
    const myUnits = this.engine.getUnitsAt(hex.q, hex.r).filter(u => u.ownerId === this.engine.playerCivId);
    const city = this.engine.getCityAt(hex.q, hex.r);

    if (myUnits.length > 0) {
      // Toggle between multiple stacked units (civilian + combat) or unit & city
      const curIdx = myUnits.findIndex(u => u.id === this.uiState.selectedUnitId);
      if (curIdx >= 0 && curIdx === myUnits.length - 1 && city && city.ownerId === this.engine.playerCivId) {
        this.sound.playClick();
        this.selectCity(city.id);
      } else {
        this.sound.playClick();
        this.selectUnit(myUnits[(curIdx + 1) % myUnits.length].id);
      }
    } else if (city && city.ownerId === this.engine.playerCivId) {
      this.sound.playClick();
      this.selectCity(city.id);
    } else {
      this.clearSelection();
      this.updateSelectionPanel();
    }
  }

  cycleNextIdleUnit() {
    const idle = Array.from(this.engine.units.values())
      .filter(u => u.ownerId === this.engine.playerCivId && u.moves > 0 && !u.fortified);
    if (idle.length === 0) {
      this.showToast('所有单位本回合已行动完毕，可点击“下一回合”');
      return;
    }
    const idx = idle.findIndex(u => u.id === this.uiState.selectedUnitId);
    const next = idle[(idx + 1) % idle.length];
    this.selectUnit(next.id);
    this.renderer.centerOn(next.q, next.r);
    this.sound.playClick();
  }

  handleEndTurn() {
    if (this.engine.winner) {
      this.openVictoryModal();
      return;
    }
    const prevTechCount = this.engine.getCiv(this.engine.playerCivId).techs.size;
    this.engine.endTurn(runAiTurn);
    const newTechCount = this.engine.getCiv(this.engine.playerCivId).techs.size;

    if (newTechCount > prevTechCount) this.sound.playTech();
    else this.sound.playTurn();

    if (this.uiState.selectedUnitId && this.engine.units.has(this.uiState.selectedUnitId)) {
      this.selectUnit(this.uiState.selectedUnitId);
    } else if (this.uiState.selectedCityId && this.engine.cities.has(this.uiState.selectedCityId)) {
      this.selectCity(this.uiState.selectedCityId);
    } else {
      this.clearSelection();
    }
    this.updateHUD();
    this.checkVictoryModal();
  }

  checkVictoryModal() {
    if (this.engine.winner) {
      this.openVictoryModal();
    }
  }

  updateHUD() {
    const civ = this.engine.getCiv(this.engine.playerCivId);
    const totals = this.engine.getCivTotals(this.engine.playerCivId);
    const tech = civ.currentTech ? TECHNOLOGIES[civ.currentTech] : null;

    document.getElementById('hud-civ-name').textContent = `${civ.emblem} ${civ.name}`;
    document.getElementById('hud-civ-dot').style.background = civ.color;
    document.getElementById('hud-turn').textContent = `第 ${this.engine.turn}/${this.engine.maxTurns} 回合 · ${this.engine.getYear()}`;
    document.getElementById('hud-gold').textContent = `${civ.gold} (${totals.goldPerTurn >= 0 ? '+' : ''}${totals.goldPerTurn})`;
    document.getElementById('hud-science').textContent = `+${totals.sciencePerTurn}`;
    document.getElementById('hud-tech-label').textContent = tech
      ? `${tech.name} (${Math.min(civ.scienceBank, tech.cost)}/${tech.cost})`
      : '全部科技已完成';
    document.getElementById('hud-score').textContent = `${this.engine.getCivScore(this.engine.playerCivId)}`;

    // Event log
    const logEl = document.getElementById('event-log');
    logEl.innerHTML = this.engine.logs.slice(0, 12).map(l =>
      `<div class="log-item log-${l.type}">[T${l.turn}] ${escapeHtml(l.text)}</div>`
    ).join('');

    this.updateSelectionPanel();
  }

  updateSelectionPanel() {
    const panel = document.getElementById('selection-panel');
    if (this.uiState.selectedUnitId) {
      const u = this.engine.units.get(this.uiState.selectedUnitId);
      if (!u) {
        this.clearSelection();
        this.updateSelectionPanel();
        return;
      }
      const def = UNITS[u.type];
      const str = def.ranged > 0 ? `远程 ${def.ranged} / 近战 ${def.strength}` : `战力 ${def.strength + (u.bonusStrength || 0)}`;
      const actions = [];

      if (u.type === 'settler') {
        const chk = this.engine.canFoundCity(u);
        actions.push(`<button class="btn btn-primary" data-action="found-city" ${chk.ok ? '' : 'disabled'} title="${escapeHtml(chk.reason || '')}">🏛 建立城市 (B)</button>`);
      }
      if (u.type === 'worker') {
        for (const impId of ['farm', 'mine', 'trade']) {
          const imp = IMPROVEMENTS[impId];
          const chk = this.engine.canBuildImprovement(u, impId);
          actions.push(`<button class="btn" data-action="improve" data-id="${impId}" ${chk.ok ? '' : 'disabled'} title="${escapeHtml(chk.reason || '')}">${imp.icon} ${imp.name}</button>`);
        }
      }
      if (def.role === 'combat') {
        actions.push(`<button class="btn" data-action="fortify" ${u.moves > 0 ? '' : 'disabled'}>🛡 驻守回血 (F)</button>`);
      }
      actions.push(`<button class="btn" data-action="next-unit">➡ 下一个单位 (Tab)</button>`);

      panel.innerHTML = `
        <div class="panel-header">
          <div class="panel-title">${def.icon} ${def.name} ${u.fortified ? '· 驻守中' : ''}</div>
          <div class="panel-sub">生命 ${u.hp}/${u.maxHp} · 移动 ${u.moves}/${u.maxMoves}</div>
        </div>
        <div class="panel-sub">${def.role === 'combat' ? str : `剩余次数: ${u.type === 'worker' ? u.charges : 1}`} · ${def.desc}</div>
        <div class="action-row">${actions.join('')}</div>
      `;
      return;
    }

    if (this.uiState.selectedCityId) {
      const c = this.engine.cities.get(this.uiState.selectedCityId);
      if (!c) {
        this.clearSelection();
        this.updateSelectionPanel();
        return;
      }
      const y = this.engine.getCityYields(c);
      const avail = this.engine.getAvailableProductions(c);
      const curProd = c.production;
      const curDef = curProd
        ? (curProd.kind === 'unit' ? UNITS[curProd.id] : BUILDINGS[curProd.id])
        : null;
      const turnsLeft = curDef ? Math.max(1, Math.ceil((curDef.cost - curProd.progress) / Math.max(1, y.prod))) : '-';

      const cardsHtml = avail.map(item => {
        const isAct = curProd && curProd.kind === item.kind && curProd.id === item.id;
        const canBuy = item.goldCost < 9999 && this.engine.getCiv(c.ownerId).gold >= item.goldCost;
        return `
          <div class="prod-card ${isAct ? 'active' : ''}">
            <div class="prod-card-top">
              <span>${item.icon} ${item.name}</span>
              <span class="val-prod">${item.cost}🔨</span>
            </div>
            <div class="prod-card-btns">
              <button class="btn btn-xs ${isAct ? 'btn-primary' : ''}" data-action="set-prod" data-kind="${item.kind}" data-id="${item.id}">${isAct ? '建造中' : '排产'}</button>
              ${item.goldCost < 9999 ? `<button class="btn btn-xs" data-action="buy-prod" data-kind="${item.kind}" data-id="${item.id}" ${canBuy ? '' : 'disabled'}>${item.goldCost}🪙</button>` : ''}
            </div>
          </div>
        `;
      }).join('');

      panel.innerHTML = `
        <div class="panel-header">
          <div class="panel-title">${c.isCapital ? '★' : '🏛'} ${c.name} · 人口 ${c.population}</div>
          <div class="panel-sub">城防 ${this.engine.getCityDefense(c)} · 生命 ${c.hp}/${c.maxHp}</div>
        </div>
        <div class="panel-sub">
          <span class="val-food">粮 ${y.netFood >= 0 ? '+' : ''}${y.netFood}</span> (${c.foodStock}/${y.foodNeeded}) ·
          <span class="val-prod">产 +${y.prod}</span> ·
          <span class="val-gold">金 +${y.gold}</span> ·
          <span class="val-sci">科 +${y.science}</span> ·
          当前：${curDef ? `${curDef.name} (${turnsLeft}回合)` : '空闲'}
        </div>
        <div class="prod-list">${cardsHtml}</div>
      `;
      return;
    }

    const myCities = Array.from(this.engine.cities.values()).filter(c => c.ownerId === this.engine.playerCivId);
    panel.innerHTML = `
      <div class="panel-header">
        <div class="panel-title">帝国指令台</div>
        <div class="panel-sub">城市 ${myCities.length} 座</div>
      </div>
      <div class="panel-sub">点击己方单位移动/攻占，点击城市管理建造队列。拖拽地图平移，滚轮缩放。</div>
      <div class="action-row">
        <button class="btn btn-primary" data-action="next-unit">🧭 定位待命单位 (Tab)</button>
        ${myCities[0] ? `<button class="btn" data-action="focus-capital">★ 定位首都</button>` : ''}
      </div>
    `;
  }

  updateHoverTooltip(hex) {
    const tip = document.getElementById('tile-tooltip');
    const tile = hex ? this.engine.getTile(hex.q, hex.r) : null;
    const playerCiv = this.engine.getCiv(this.engine.playerCivId);
    if (!tile || !playerCiv.explored.has(tile.key)) {
      tip.innerHTML = '<strong>未知迷雾</strong><br>派遣侦察兵或勇士探索此区域';
      return;
    }
    const tDef = TERRAIN[tile.terrain];
    const y = this.engine.getTileYield(tile);
    const owner = tile.ownerId ? this.engine.getCiv(tile.ownerId).name : '无主领土';
    const resStr = tile.resource ? ` · 资源：${RESOURCES[tile.resource].icon}${RESOURCES[tile.resource].name}` : '';
    const impStr = tile.improvement ? ` · 设施：${IMPROVEMENTS[tile.improvement].name}` : '';
    tip.innerHTML = `
      <strong>${tDef.name}</strong> (${tile.col},${tile.row}) · ${owner}${resStr}${impStr}<br>
      产出：粮${y.food} 产${y.prod} 金${y.gold}${y.science ? ` 科${y.science}` : ''} · 移动消耗 ${tDef.passable ? tDef.moveCost : '不可通行'}${tDef.defense ? ` · 防御+${tDef.defense}` : ''}
    `;
  }

  openTechModal() {
    const civ = this.engine.getCiv(this.engine.playerCivId);
    const body = document.getElementById('tech-modal-body');
    body.innerHTML = `<div class="tech-grid">` + Object.values(TECHNOLOGIES).map(t => {
      const done = civ.techs.has(t.id);
      const active = civ.currentTech === t.id;
      const avail = this.engine.canResearchTech(civ.id, t.id);
      const cls = done ? 'done' : active ? 'active' : avail ? '' : 'locked';
      const prereqNames = t.prereqs.length ? t.prereqs.map(p => TECHNOLOGIES[p].name).join(' + ') : '无';
      return `
        <div class="tech-card ${cls}">
          <div style="display:flex;justify-content:space-between;font-weight:700">
            <span>${t.name}</span>
            <span class="val-sci">${done ? '已掌握' : `${t.cost}🔬`}</span>
          </div>
          <div class="panel-sub">${t.era}时代 · 前置：${prereqNames}</div>
          <div style="font-size:11.5px;color:#e2e8f0">解锁：${t.unlocks.join('、')}</div>
          ${!done ? `<button class="btn btn-xs ${active ? 'btn-primary' : ''}" data-action="pick-tech" data-id="${t.id}" ${avail ? '' : 'disabled'}>${active ? '研发中' : avail ? '设为当前研发' : '未满足前置'}</button>` : ''}
        </div>
      `;
    }).join('') + `</div>`;
    document.getElementById('modal-tech').classList.add('open');
  }

  openDiploModal() {
    const body = document.getElementById('diplo-modal-body');
    const rows = Array.from(this.engine.civs.values()).map(c => {
      const totals = this.engine.getCivTotals(c.id);
      const score = this.engine.getCivScore(c.id);
      const atWar = this.engine.areAtWar(this.engine.playerCivId, c.id);
      let actionHtml = '<span class="panel-sub">我方帝国</span>';
      if (!c.isHuman) {
        if (!c.alive) {
          actionHtml = '<span class="panel-sub">已覆灭</span>';
        } else if (atWar) {
          actionHtml = `<button class="btn btn-xs" data-action="make-peace" data-id="${c.id}">🕊 议和</button>`;
        } else {
          actionHtml = `<button class="btn btn-xs btn-danger" data-action="declare-war" data-id="${c.id}">⚔ 宣战</button>`;
        }
      }
      return `
        <tr>
          <td><span style="color:${c.color};font-weight:700">${c.emblem} ${c.name}</span> (${c.leader})</td>
          <td>${c.alive ? (c.isHuman ? '玩家' : atWar ? '<span style="color:#f87171">交战中</span>' : '和平') : '覆灭'}</td>
          <td>${totals.cityCount} 城 / ${totals.totalPop} 人口</td>
          <td>${c.techs.size} 项</td>
          <td><strong>${score}</strong></td>
          <td>${actionHtml}</td>
        </tr>
      `;
    }).join('');

    body.innerHTML = `
      <table class="diplo-table">
        <thead><tr><th>文明</th><th>关系</th><th>规模</th><th>科技</th><th>总分</th><th>外交操作</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
    document.getElementById('modal-diplo').classList.add('open');
  }

  openVictoryModal() {
    const w = this.engine.winner;
    if (!w) return;
    const isPlayer = w.civId === this.engine.playerCivId;
    document.getElementById('victory-title').textContent = isPlayer ? '🏆 辉煌胜利！' : '💀 帝国陨落';
    document.getElementById('victory-desc').textContent = w.reason;
    document.getElementById('modal-victory').classList.add('open');
  }

  saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, this.engine.serialize());
      this.showToast('存档成功（已保存至本地浏览器）');
    } catch (_e) {
      this.showToast('当前环境限制本地存储，无法写入存档');
    }
  }

  loadGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) {
        this.showToast('未找到本地存档');
        return;
      }
      this.engine = GameEngine.deserialize(raw);
      this.clearSelection();
      this.focusInitialUnit();
      this.updateHUD();
      this.showToast(`已读取第 ${this.engine.turn} 回合存档`);
    } catch (_e) {
      this.showToast('读取存档失败');
    }
  }

  startNewGameFromModal() {
    const civId = document.getElementById('new-civ').value;
    const preset = document.getElementById('new-preset').value;
    const seedVal = parseInt(document.getElementById('new-seed').value, 10);
    const seed = Number.isFinite(seedVal) ? seedVal : Math.floor(Math.random() * 100000);
    this.engine = new GameEngine({ preset, playerCivId: civId, seed });
    this.clearSelection();
    this.focusInitialUnit();
    this.updateHUD();
    document.getElementById('modal-new').classList.remove('open');
    document.getElementById('modal-victory').classList.remove('open');
    this.showToast(`新纪元已开启（种子 #${seed}）`);
  }

  bindEvents() {
    window.addEventListener('resize', () => this.renderer.resize());

    // Canvas mouse drag & click
    this.canvas.addEventListener('mousedown', (e) => {
      this.dragging = true;
      this.dragMoved = false;
      this.dragStart = { x: e.clientX, y: e.clientY };
      this.camStart = { x: this.renderer.camX, y: this.renderer.camY };
    });

    window.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      if (this.dragging) {
        const dx = e.clientX - this.dragStart.x;
        const dy = e.clientY - this.dragStart.y;
        if (Math.hypot(dx, dy) > 5) this.dragMoved = true;
        this.renderer.camX = this.camStart.x - dx / this.renderer.zoom;
        this.renderer.camY = this.camStart.y - dy / this.renderer.zoom;
      } else if (e.target === this.canvas) {
        const hex = this.renderer.screenToHex(e.clientX - rect.left, e.clientY - rect.top);
        this.uiState.hoveredHex = hex;
        this.updateHoverTooltip(hex);
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (this.dragging && !this.dragMoved && e.target === this.canvas) {
        const rect = this.canvas.getBoundingClientRect();
        this.handleMapClick(e.clientX - rect.left, e.clientY - rect.top);
      }
      this.dragging = false;
    });

    // Touch pan & tap
    this.canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        const t = e.touches[0];
        this.dragging = true;
        this.dragMoved = false;
        this.dragStart = { x: t.clientX, y: t.clientY };
        this.camStart = { x: this.renderer.camX, y: this.renderer.camY };
      }
    }, { passive: true });

    this.canvas.addEventListener('touchmove', (e) => {
      if (this.dragging && e.touches.length === 1) {
        const t = e.touches[0];
        const dx = t.clientX - this.dragStart.x;
        const dy = t.clientY - this.dragStart.y;
        if (Math.hypot(dx, dy) > 6) this.dragMoved = true;
        this.renderer.camX = this.camStart.x - dx / this.renderer.zoom;
        this.renderer.camY = this.camStart.y - dy / this.renderer.zoom;
      }
    }, { passive: true });

    this.canvas.addEventListener('touchend', (e) => {
      if (this.dragging && !this.dragMoved && e.changedTouches.length === 1) {
        const t = e.changedTouches[0];
        const rect = this.canvas.getBoundingClientRect();
        this.handleMapClick(t.clientX - rect.left, t.clientY - rect.top);
      }
      this.dragging = false;
    });

    // Zoom with wheel
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 0.89;
      this.renderer.zoom = Math.max(0.55, Math.min(2.0, this.renderer.zoom * factor));
    }, { passive: false });

    // Minimap click to jump camera
    this.minimap.addEventListener('click', (e) => {
      const rect = this.minimap.getBoundingClientRect();
      const col = Math.floor(((e.clientX - rect.left) / rect.width) * this.engine.width);
      const row = Math.floor(((e.clientY - rect.top) / rect.height) * this.engine.height);
      const { q, r } = offsetToAxial(
        Math.max(0, Math.min(this.engine.width - 1, col)),
        Math.max(0, Math.min(this.engine.height - 1, row))
      );
      this.renderer.centerOn(q, r);
    });

    // Top bar & bottom buttons
    document.getElementById('btn-tech').addEventListener('click', () => { this.sound.playClick(); this.openTechModal(); });
    document.getElementById('btn-diplo').addEventListener('click', () => { this.sound.playClick(); this.openDiploModal(); });
    document.getElementById('btn-save').addEventListener('click', () => this.saveGame());
    document.getElementById('btn-load').addEventListener('click', () => this.loadGame());
    document.getElementById('btn-new-game').addEventListener('click', () => {
      document.getElementById('new-seed').value = Math.floor(Math.random() * 99999);
      document.getElementById('modal-new').classList.add('open');
    });
    document.getElementById('btn-help').addEventListener('click', () => {
      document.getElementById('modal-help').classList.add('open');
    });
    document.getElementById('btn-mute').addEventListener('click', (e) => {
      const muted = this.sound.toggleMute();
      e.currentTarget.textContent = muted ? '🔇' : '🔊';
    });
    document.getElementById('btn-zoom-in').addEventListener('click', () => {
      this.renderer.zoom = Math.min(2.0, this.renderer.zoom * 1.15);
    });
    document.getElementById('btn-zoom-out').addEventListener('click', () => {
      this.renderer.zoom = Math.max(0.55, this.renderer.zoom * 0.87);
    });
    document.getElementById('btn-next-turn').addEventListener('click', () => this.handleEndTurn());
    document.getElementById('btn-start-new').addEventListener('click', () => this.startNewGameFromModal());
    document.getElementById('btn-victory-new').addEventListener('click', () => {
      document.getElementById('modal-victory').classList.remove('open');
      document.getElementById('modal-new').classList.add('open');
    });

    // Delegated modal close & dynamic action clicks
    document.addEventListener('click', (e) => {
      const closeBtn = e.target.closest('[data-close]');
      if (closeBtn) {
        const modal = document.getElementById(closeBtn.dataset.close);
        if (modal) modal.classList.remove('open');
        return;
      }

      const actBtn = e.target.closest('[data-action]');
      if (!actBtn) return;
      const action = actBtn.dataset.action;

      if (action === 'found-city' && this.uiState.selectedUnitId) {
        const res = this.engine.foundCity(this.uiState.selectedUnitId);
        if (res.ok) {
          this.sound.playFoundCity();
          this.selectCity(res.city.id);
          this.updateHUD();
          this.showToast(`建立了城市「${res.city.name}」！`);
        } else {
          this.showToast(res.reason);
        }
      } else if (action === 'improve' && this.uiState.selectedUnitId) {
        const res = this.engine.buildImprovement(this.uiState.selectedUnitId, actBtn.dataset.id);
        if (res.ok) {
          this.sound.playFoundCity();
          if (this.engine.units.has(this.uiState.selectedUnitId)) this.selectUnit(this.uiState.selectedUnitId);
          else this.clearSelection();
          this.updateHUD();
          this.showToast('改良设施建造完成！');
        } else {
          this.showToast(res.reason);
        }
      } else if (action === 'fortify' && this.uiState.selectedUnitId) {
        this.engine.fortifyUnit(this.uiState.selectedUnitId);
        this.sound.playClick();
        this.selectUnit(this.uiState.selectedUnitId);
        this.updateHUD();
      } else if (action === 'next-unit') {
        this.cycleNextIdleUnit();
      } else if (action === 'focus-capital') {
        const cap = Array.from(this.engine.cities.values()).find(c => c.ownerId === this.engine.playerCivId);
        if (cap) {
          this.selectCity(cap.id);
          this.renderer.centerOn(cap.q, cap.r);
        }
      } else if (action === 'set-prod' && this.uiState.selectedCityId) {
        this.engine.setCityProduction(this.uiState.selectedCityId, actBtn.dataset.kind, actBtn.dataset.id);
        this.sound.playClick();
        this.updateSelectionPanel();
      } else if (action === 'buy-prod' && this.uiState.selectedCityId) {
        const res = this.engine.buyInCity(this.uiState.selectedCityId, actBtn.dataset.kind, actBtn.dataset.id);
        if (res.ok) {
          this.sound.playFoundCity();
          this.updateHUD();
          this.showToast('购买成功！');
        } else {
          this.showToast(res.reason);
        }
      } else if (action === 'pick-tech') {
        if (this.engine.setResearch(this.engine.playerCivId, actBtn.dataset.id)) {
          this.sound.playClick();
          this.updateHUD();
          this.openTechModal();
        }
      } else if (action === 'declare-war') {
        this.engine.declareWar(this.engine.playerCivId, actBtn.dataset.id);
        this.sound.playAttack();
        this.updateHUD();
        this.openDiploModal();
      } else if (action === 'make-peace') {
        this.engine.makePeace(this.engine.playerCivId, actBtn.dataset.id);
        this.sound.playClick();
        this.updateHUD();
        this.openDiploModal();
      }
    });

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      const panStep = 65 / this.renderer.zoom;
      if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') this.renderer.camY -= panStep;
      else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') this.renderer.camY += panStep;
      else if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') this.renderer.camX -= panStep;
      else if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') this.renderer.camX += panStep;
      else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        this.handleEndTurn();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        this.cycleNextIdleUnit();
      } else if (e.key === 'b' || e.key === 'B') {
        if (this.uiState.selectedUnitId) {
          const res = this.engine.foundCity(this.uiState.selectedUnitId);
          if (res.ok) {
            this.sound.playFoundCity();
            this.selectCity(res.city.id);
            this.updateHUD();
          }
        }
      } else if (e.key === 'f' || e.key === 'F') {
        if (this.uiState.selectedUnitId) {
          this.engine.fortifyUnit(this.uiState.selectedUnitId);
          this.selectUnit(this.uiState.selectedUnitId);
        }
      } else if (e.key === 't' || e.key === 'T') {
        this.openTechModal();
      } else if (e.key === 'Escape') {
        document.querySelectorAll('.modal-backdrop.open').forEach(m => m.classList.remove('open'));
      }
    });
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    window.__civApp = new GameApp();
  });
}
