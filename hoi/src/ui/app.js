/**
 * Web HOI 前端交互主控制器
 * 连接 GameEngine、MapRenderer、SoundEffects 与 DOM 控制面板。
 */

import { GameEngine } from '../engine/gameEngine.js';
import { computeNationEconomy, CONSTRUCTION_COSTS } from '../engine/economy.js';
import { areAllies, areAtWar } from '../engine/diplomacy.js';
import { DIVISION_TEMPLATES, EQUIPMENT_CATALOG, NATIONS } from '../data/nations.js';
import { TECHNOLOGIES } from '../data/technologies.js';
import { NATIONAL_FOCUSES } from '../data/focuses.js';
import { TERRAIN_TYPES, getAllNeighbors } from '../data/mapData.js';
import { MapRenderer } from './renderer.js';
import { SoundEffects } from './audio.js';

const SPEED_INTERVALS_MS = { 1: 750, 2: 420, 3: 240, 4: 130, 5: 65 };

export class WebHoiApp {
  constructor() {
    this.engine = new GameEngine('GER');
    this.sfx = new SoundEffects();
    this.canvas = document.getElementById('mapCanvas');
    this.renderer = new MapRenderer(this.canvas, this.engine);
    this.activeTab = 'military';
    this.moveOrderMode = false;
    this.tickTimer = null;
    this.isDragging = false;
    this.dragMoved = false;
    this.lastMouse = { x: 0, y: 0 };

    this.initNationSelector();
    this.bindEvents();
    this.renderer.resize();
    this.renderer.selectedProvinceId = this.engine.nations[this.engine.playerNationId].capital;
    this.renderAll();
    this.startRenderLoop();
  }

  initNationSelector() {
    const sel = document.getElementById('nationSelect');
    sel.innerHTML = Object.values(NATIONS)
      .map((n) => `<option value="${n.id}">${n.flag} ${n.name} (${n.ideology})</option>`)
      .join('');
    sel.value = this.engine.playerNationId;
  }

  showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  bindEvents() {
    window.addEventListener('resize', () => {
      this.renderer.resize();
      this.renderer.render();
    });

    // 切换玩家国家（重开一局）
    document.getElementById('nationSelect').addEventListener('change', (e) => {
      this.stopClock();
      this.engine.reset(e.target.value);
      this.renderer.selectedDivisionIds.clear();
      this.renderer.selectedProvinceId = this.engine.nations[this.engine.playerNationId].capital;
      this.sfx.click();
      this.renderAll();
      this.showToast(`已切换指挥国家：${this.engine.nations[this.engine.playerNationId].name}`);
    });

    // 暂停/继续与倍速控制
    document.getElementById('btnPause').addEventListener('click', () => this.togglePause());
    document.querySelectorAll('[data-speed]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.engine.speed = Number(btn.dataset.speed);
        if (this.engine.paused) this.engine.paused = false;
        this.restartClock();
        this.sfx.click();
        this.renderTopbar();
      });
    });

    // 空格键暂停/继续
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') {
        e.preventDefault();
        this.togglePause();
      }
    });

    // 静音、存档、读档
    document.getElementById('btnMute').addEventListener('click', (e) => {
      const muted = this.sfx.toggleMute();
      e.target.textContent = muted ? '🔇' : '🔊';
    });

    document.getElementById('btnSave').addEventListener('click', () => {
      try {
        localStorage.setItem('web_hoi_save_v1', this.engine.serialize());
        this.showToast('战局已保存至本地浏览器存档。');
      } catch {
        this.showToast('当前环境限制本地存储，已生成内存快照。');
        this._memSave = this.engine.serialize();
      }
    });

    document.getElementById('btnLoad').addEventListener('click', () => {
      try {
        const raw = localStorage.getItem('web_hoi_save_v1') || this._memSave;
        if (!raw) return this.showToast('暂无可用存档。');
        this.engine.deserialize(raw);
        document.getElementById('nationSelect').value = this.engine.playerNationId;
        this.renderer.selectedDivisionIds.clear();
        this.renderAll();
        this.showToast(`已读取存档：${this.engine.formatDate()}`);
      } catch {
        this.showToast('读取存档失败。');
      }
    });

    // 地图模式切换与缩放
    document.querySelectorAll('[data-mapmode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.renderer.mapMode = btn.dataset.mapmode;
        document.querySelectorAll('[data-mapmode]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.sfx.click();
      });
    });

    document.getElementById('btnZoomIn').addEventListener('click', () => {
      this.renderer.zoom = Math.min(2.2, this.renderer.zoom + 0.2);
    });
    document.getElementById('btnZoomOut').addEventListener('click', () => {
      this.renderer.zoom = Math.max(0.75, this.renderer.zoom - 0.2);
    });
    document.getElementById('btnResetView').addEventListener('click', () => {
      this.renderer.zoom = 1.0;
      this.renderer.panX = 0;
      this.renderer.panY = 0;
    });

    // 左侧标签页切换
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeTab = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.sfx.click();
        this.renderSidebar();
      });
    });

    // Canvas 交互：左键选中省份/部队，右键下达行军或进攻命令，滚轮缩放，拖拽平移
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.isDragging = true;
        this.dragMoved = false;
        this.lastMouse = { x: e.clientX, y: e.clientY };
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        const dx = e.clientX - this.lastMouse.x;
        const dy = e.clientY - this.lastMouse.y;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this.dragMoved = true;
        this.renderer.panX += dx;
        this.renderer.panY += dy;
        this.lastMouse = { x: e.clientX, y: e.clientY };
      } else {
        const pt = this.renderer.screenToLogical(e.clientX, e.clientY);
        this.renderer.hoverProvinceId = this.renderer.hitTestProvince(pt.x, pt.y);
      }
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    this.canvas.addEventListener('click', (e) => {
      if (this.dragMoved) return;
      const pt = this.renderer.screenToLogical(e.clientX, e.clientY);
      const provId = this.renderer.hitTestProvince(pt.x, pt.y);
      if (!provId) return;

      // 触控/指令模式下，左键直接作为行军目标
      if (this.moveOrderMode && this.renderer.selectedDivisionIds.size > 0) {
        this.issueMoveToProvince(provId);
        this.moveOrderMode = false;
        return;
      }

      this.renderer.selectedProvinceId = provId;
      // 若该省有玩家部队，自动全选该省玩家部队
      const myDivsHere = Object.values(this.engine.divisions).filter(
        (d) => d.provinceId === provId && d.owner === this.engine.playerNationId
      );
      if (myDivsHere.length > 0) {
        this.renderer.selectedDivisionIds = new Set(myDivsHere.map((d) => d.id));
      } else {
        this.renderer.selectedDivisionIds.clear();
      }
      this.sfx.click();
      this.renderInspector();
      this.renderSidebar();
    });

    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const pt = this.renderer.screenToLogical(e.clientX, e.clientY);
      const provId = this.renderer.hitTestProvince(pt.x, pt.y);
      if (!provId) return;
      this.issueMoveToProvince(provId);
    });

    this.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.12 : -0.12;
        this.renderer.zoom = Math.max(0.75, Math.min(2.2, this.renderer.zoom + delta));
      },
      { passive: false }
    );
  }

  issueMoveToProvince(targetProvId) {
    if (this.renderer.selectedDivisionIds.size === 0) {
      this.showToast('请先左键点击驻有己方部队的省份以选中部队。');
      return;
    }
    let success = 0;
    let lastErr = '';
    for (const divId of this.renderer.selectedDivisionIds) {
      const res = this.engine.orderMoveDivision(divId, targetProvId);
      if (res.ok) success += 1;
      else lastErr = res.reason;
    }
    if (success > 0) {
      this.sfx.march();
      this.showToast(`已命令 ${success} 个师开赴 ${this.engine.provinces[targetProvId].name}。`);
      this.renderAll();
    } else if (lastErr) {
      this.showToast(lastErr);
    }
  }

  togglePause() {
    this.engine.paused = !this.engine.paused;
    if (this.engine.paused) this.stopClock();
    else this.restartClock();
    this.sfx.click();
    this.renderTopbar();
  }

  stopClock() {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  restartClock() {
    this.stopClock();
    if (this.engine.paused) return;
    const ms = SPEED_INTERVALS_MS[this.engine.speed] || 300;
    this.tickTimer = setInterval(() => {
      this.engine.tickStep();
      this.renderAll();
    }, ms);
  }

  startRenderLoop() {
    const loop = () => {
      this.renderer.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  renderAll() {
    this.renderTopbar();
    this.renderSidebar();
    this.renderInspector();
    this.renderLog();
  }

  renderTopbar() {
    const n = this.engine.nations[this.engine.playerNationId];
    const econ = computeNationEconomy(n.id, this.engine);
    const myDivCount = Object.values(this.engine.divisions).filter((d) => d.owner === n.id).length;

    document.getElementById('statPP').textContent = Math.floor(n.politicalPower);
    document.getElementById('statMP').textContent = `${(n.manpower / 1000).toFixed(0)}k`;
    document.getElementById('statFac').textContent = `${econ.civFactories}民/${econ.milFactories}军`;
    document.getElementById('statDivs').textContent = myDivCount;
    document.getElementById('statTension').textContent = `${Math.round(this.engine.worldTension)}%`;
    document.getElementById('dateDisplay').textContent = `${this.engine.formatDate()} ${String(this.engine.hour).padStart(2, '0')}:00`;

    const pauseBtn = document.getElementById('btnPause');
    pauseBtn.textContent = this.engine.paused ? '▶ 开始' : '⏸ 暂停';
    pauseBtn.classList.toggle('active', !this.engine.paused);

    document.querySelectorAll('[data-speed]').forEach((b) => {
      b.classList.toggle('active', !this.engine.paused && Number(b.dataset.speed) === this.engine.speed);
    });
  }

  renderSidebar() {
    const container = document.getElementById('panelBody');
    const n = this.engine.nations[this.engine.playerNationId];

    if (this.activeTab === 'military') {
      this.renderMilitaryTab(container, n);
    } else if (this.activeTab === 'production') {
      this.renderProductionTab(container, n);
    } else if (this.activeTab === 'research') {
      this.renderResearchTab(container, n);
    } else if (this.activeTab === 'focus') {
      this.renderFocusTab(container, n);
    } else if (this.activeTab === 'diplomacy') {
      this.renderDiplomacyTab(container, n);
    }
  }

  renderMilitaryTab(container, nation) {
    const myDivs = Object.values(this.engine.divisions).filter((d) => d.owner === nation.id);
    container.innerHTML = `
      <div class="card">
        <div class="card-title">
          <span>部队招募（部署于首都 ${this.engine.provinces[nation.capital]?.name || ''}）</span>
        </div>
        ${Object.values(DIVISION_TEMPLATES)
          .map(
            (tpl) => `
          <div class="row">
            <div>
              <div><strong>${tpl.name}</strong> <span class="muted">软攻${tpl.softAttack} 装甲${tpl.armor}</span></div>
              <div class="muted">人力 ${(tpl.manpower / 1000).toFixed(1)}k · 训练 ${tpl.trainDays}天</div>
            </div>
            <button class="btn sm" data-train="${tpl.id}">招募</button>
          </div>`
          )
          .join('')}
      </div>
      <div class="card">
        <div class="card-title"><span>训练队列 (${nation.trainingQueue.length})</span></div>
        ${
          nation.trainingQueue.length === 0
            ? '<div class="muted">暂无正在训练的部队</div>'
            : nation.trainingQueue
                .map((item) => {
                  const pct = Math.round(((item.totalDays - item.daysLeft) / item.totalDays) * 100);
                  return `<div class="row" style="flex-direction:column;align-items:stretch;">
                    <div style="display:flex;justify-content:space-between;">
                      <span>${DIVISION_TEMPLATES[item.templateId].name}</span>
                      <span class="muted">剩余 ${item.daysLeft} 天</span>
                    </div>
                    <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
                  </div>`;
                })
                .join('')
        }
      </div>
      <div class="card">
        <div class="card-title">
          <span>现役师列表 (${myDivs.length})</span>
          <button class="btn sm ${this.moveOrderMode ? 'active' : ''}" id="btnMoveMode">指令移动</button>
        </div>
        ${myDivs
          .map((d) => {
            const p = this.engine.provinces[d.provinceId];
            const selected = this.renderer.selectedDivisionIds.has(d.id);
            return `<div class="row" style="cursor:pointer;${selected ? 'background:rgba(212,175,55,0.14);padding:4px 6px;border-radius:4px;' : ''}" data-select-div="${d.id}">
              <div>
                <div><strong>${d.name}</strong> ${d.encircled ? '<span class="badge war">断补</span>' : ''}</div>
                <div class="muted">${p?.name || ''} · 组织 ${Math.round(d.org)} · 兵力 ${Math.round(d.hp)}%</div>
              </div>
              <span class="muted">${d.movingTo ? '→' + this.engine.provinces[d.movingTo].name : d.inCombat ? '⚔️交战' : '驻守'}</span>
            </div>`;
          })
          .join('')}
      </div>
    `;

    container.querySelectorAll('[data-train]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const res = this.engine.queueDivisionTraining(nation.id, btn.dataset.train, nation.capital);
        this.showToast(res.ok ? '已加入新师训练队列。' : res.reason);
        this.sfx.click();
        this.renderAll();
      });
    });

    container.querySelector('#btnMoveMode')?.addEventListener('click', () => {
      this.moveOrderMode = !this.moveOrderMode;
      this.showToast(this.moveOrderMode ? '请点击地图上的目标相邻省份下达行军指令。' : '已取消指令移动模式。');
      this.renderSidebar();
    });

    container.querySelectorAll('[data-select-div]').forEach((row) => {
      row.addEventListener('click', () => {
        const div = this.engine.divisions[row.dataset.selectDiv];
        if (!div) return;
        this.renderer.selectedDivisionIds = new Set([div.id]);
        this.renderer.selectedProvinceId = div.provinceId;
        this.renderInspector();
        this.renderSidebar();
      });
    });
  }

  renderProductionTab(container, nation) {
    const econ = computeNationEconomy(nation.id, this.engine);
    container.innerHTML = `
      <div class="card">
        <div class="card-title">
          <span>军工产线分配</span>
          <span class="muted">空闲军工: ${econ.freeMil} · 效率 ${Math.round(econ.resourceEfficiency * 100)}%</span>
        </div>
        ${nation.productionLines
          .map((line) => {
            const eq = EQUIPMENT_CATALOG[line.equipmentId];
            const stock = Math.floor(nation.equipment[line.equipmentId] || 0);
            return `<div class="row">
              <div>
                <div><strong>${eq.name}</strong> <span class="muted">库存 ${stock}</span></div>
                <div class="muted">分配军工: ${line.factories} 座</div>
              </div>
              <div style="display:flex;gap:4px;">
                <button class="btn sm" data-prod-sub="${line.equipmentId}">-</button>
                <button class="btn sm" data-prod-add="${line.equipmentId}">+</button>
              </div>
            </div>`;
          })
          .join('')}
      </div>
      <div class="card">
        <div class="card-title"><span>战略资源供需</span></div>
        <div class="row"><span>钢铁 (Steel)</span><span>${econ.resources.steel} / 需 ${econ.resourceNeed.steel}</span></div>
        <div class="row"><span>石油 (Oil)</span><span>${econ.resources.oil} / 需 ${econ.resourceNeed.oil}</span></div>
        <div class="row"><span>钨矿 (Tungsten)</span><span>${econ.resources.tungsten} / 需 ${econ.resourceNeed.tungsten}</span></div>
      </div>
      <div class="card">
        <div class="card-title"><span>民用建造队列 (可用民工 ${econ.availableCiv})</span></div>
        ${
          nation.constructionQueue.length === 0
            ? '<div class="muted">在地图选中己方省份后可发起工厂/要塞建设</div>'
            : nation.constructionQueue
                .map((task) => {
                  const pct = Math.min(100, Math.round((task.progress / task.cost) * 100));
                  return `<div class="row" style="flex-direction:column;align-items:stretch;">
                    <div style="display:flex;justify-content:space-between;">
                      <span>${this.engine.provinces[task.provinceId]?.name} · ${CONSTRUCTION_COSTS[task.type].name}</span>
                      <span class="muted">${pct}%</span>
                    </div>
                    <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
                  </div>`;
                })
                .join('')
        }
      </div>
    `;

    container.querySelectorAll('[data-prod-add]').forEach((b) =>
      b.addEventListener('click', () => {
        const res = this.engine.adjustProductionLine(nation.id, b.dataset.prodAdd, 1);
        if (!res.ok) this.showToast(res.reason);
        this.renderAll();
      })
    );
    container.querySelectorAll('[data-prod-sub]').forEach((b) =>
      b.addEventListener('click', () => {
        this.engine.adjustProductionLine(nation.id, b.dataset.prodSub, -1);
        this.renderAll();
      })
    );
  }

  renderResearchTab(container, nation) {
    const active = nation.activeTech ? TECHNOLOGIES.find((t) => t.id === nation.activeTech.id) : null;
    container.innerHTML = `
      <div class="card">
        <div class="card-title"><span>当前科研槽</span></div>
        ${
          active
            ? `<div><strong>${active.name}</strong> <span class="muted">剩余 ${nation.activeTech.daysLeft} 天</span></div>
               <div class="progress-bar"><div class="progress-fill" style="width:${Math.round(
                 ((nation.activeTech.totalDays - nation.activeTech.daysLeft) / nation.activeTech.totalDays) * 100
               )}%"></div></div>`
            : '<div class="muted">科研槽空闲，请从下方选择科技项目</div>'
        }
      </div>
      <div class="card">
        <div class="card-title"><span>科技树 (${nation.completedTechs.length}/${TECHNOLOGIES.length})</span></div>
        ${TECHNOLOGIES.map((t) => {
          const done = nation.completedTechs.includes(t.id);
          const running = nation.activeTech?.id === t.id;
          const prereqMet = t.prereq.every((p) => nation.completedTechs.includes(p));
          return `<div class="row">
            <div>
              <div><strong>${t.name}</strong> <span class="badge">${t.branchName}</span></div>
              <div class="muted">${t.desc}</div>
            </div>
            ${
              done
                ? '<span class="badge ally">已掌握</span>'
                : running
                ? '<span class="badge">研发中</span>'
                : `<button class="btn sm" data-tech="${t.id}" ${!prereqMet || nation.activeTech ? 'disabled' : ''}>${t.costDays}天</button>`
            }
          </div>`;
        }).join('')}
      </div>
    `;

    container.querySelectorAll('[data-tech]').forEach((b) =>
      b.addEventListener('click', () => {
        const res = this.engine.startResearch(nation.id, b.dataset.tech);
        if (!res.ok) this.showToast(res.reason);
        this.sfx.click();
        this.renderAll();
      })
    );
  }

  renderFocusTab(container, nation) {
    const active = nation.activeFocus ? NATIONAL_FOCUSES.find((f) => f.id === nation.activeFocus.id) : null;
    container.innerHTML = `
      <div class="card">
        <div class="card-title"><span>当前国家焦点</span></div>
        ${
          active
            ? `<div><strong>${active.name}</strong> <span class="muted">剩余 ${nation.activeFocus.daysLeft} 天</span></div>
               <div class="progress-bar"><div class="progress-fill" style="width:${Math.round(
                 ((nation.activeFocus.totalDays - nation.activeFocus.daysLeft) / nation.activeFocus.totalDays) * 100
               )}%"></div></div>`
            : '<div class="muted">未选择国家焦点，请从下方启动国策</div>'
        }
      </div>
      <div class="card">
        <div class="card-title"><span>国家焦点树</span></div>
        ${NATIONAL_FOCUSES.map((f) => {
          const done = nation.completedFocuses.includes(f.id);
          const running = nation.activeFocus?.id === f.id;
          const prereqMet = f.prereq.every((p) => nation.completedFocuses.includes(p));
          return `<div class="row">
            <div>
              <div><strong>${f.name}</strong> <span class="badge">${f.category}</span></div>
              <div class="muted">${f.desc}</div>
            </div>
            ${
              done
                ? '<span class="badge ally">已完成</span>'
                : running
                ? '<span class="badge">进行中</span>'
                : `<button class="btn sm" data-focus="${f.id}" ${!prereqMet || nation.activeFocus ? 'disabled' : ''}>${f.days}天</button>`
            }
          </div>`;
        }).join('')}
      </div>
    `;

    container.querySelectorAll('[data-focus]').forEach((b) =>
      b.addEventListener('click', () => {
        const res = this.engine.startFocus(nation.id, b.dataset.focus);
        if (!res.ok) this.showToast(res.reason);
        this.sfx.click();
        this.renderAll();
      })
    );
  }

  renderDiplomacyTab(container, nation) {
    container.innerHTML = `
      <div class="card">
        <div class="card-title"><span>欧洲列强外交与战局</span></div>
        ${Object.values(this.engine.nations)
          .filter((other) => other.id !== nation.id)
          .map((other) => {
            const atWar = areAtWar(nation.id, other.id, this.engine);
            const ally = areAllies(nation.id, other.id, this.engine);
            const divs = Object.values(this.engine.divisions).filter((d) => d.owner === other.id).length;
            const provs = Object.values(this.engine.provinces).filter((p) => p.owner === other.id).length;
            return `<div class="row">
              <div>
                <div><strong>${other.flag} ${other.name}</strong> ${
                  other.capitulated
                    ? '<span class="badge">已投降</span>'
                    : atWar
                    ? '<span class="badge war">交战中</span>'
                    : ally
                    ? '<span class="badge ally">同盟国</span>'
                    : `<span class="badge">${other.faction}</span>`
                }</div>
                <div class="muted">省份 ${provs} · 部队 ${divs} 师 · 投降度 ${Math.round(
                  (other.surrenderProgress || 0) * 100
                )}%</div>
              </div>
              ${
                !other.capitulated && !atWar && !ally
                  ? `<button class="btn sm danger" data-war="${other.id}">宣战</button>`
                  : ''
              }
            </div>`;
          })
          .join('')}
      </div>
    `;

    container.querySelectorAll('[data-war]').forEach((b) =>
      b.addEventListener('click', () => {
        const res = this.engine.declareWar(nation.id, b.dataset.war);
        if (res.ok) {
          this.sfx.warHorn();
          this.showToast(`已向 ${this.engine.nations[b.dataset.war].name} 宣战！`);
        } else {
          this.showToast(res.reason);
        }
        this.renderAll();
      })
    );
  }

  renderInspector() {
    const box = document.getElementById('provinceInspector');
    const prov = this.engine.provinces[this.renderer.selectedProvinceId];
    if (!prov) {
      box.innerHTML = '<div class="muted">点击地图省份查看详情，选中己方部队后右键相邻省份即可行军或进攻。</div>';
      return;
    }

    const owner = this.engine.nations[prov.owner];
    const terrain = TERRAIN_TYPES[prov.terrain];
    const divs = Object.values(this.engine.divisions).filter((d) => d.provinceId === prov.id);
    const isMine = prov.owner === this.engine.playerNationId;

    box.innerHTML = `
      <div class="card-title" style="margin-bottom:4px;">
        <span>${owner.flag} ${prov.name} (${terrain.name})</span>
        <span class="muted">VP ${prov.vp}</span>
      </div>
      <div class="muted" style="margin-bottom:6px;">
        控制者: ${owner.shortName} · 工厂 ${prov.civFactories}民/${prov.milFactories}军 · 基建 ${prov.infra} · 要塞 ${prov.fortLevel || 0}<br/>
        补给负载: ${prov.supplyUsed} / ${prov.supplyCapacity} · 驻军: ${divs.length} 师
      </div>
      ${
        isMine
          ? `<div style="display:flex;gap:4px;flex-wrap:wrap;">
              <button class="btn sm" data-build="civFactory">+民工</button>
              <button class="btn sm" data-build="milFactory">+军工</button>
              <button class="btn sm" data-build="infra">+基建</button>
              <button class="btn sm" data-build="fort">+要塞</button>
            </div>`
          : `<div class="muted">相邻省份: ${getAllNeighbors(prov)
              .map((id) => this.engine.provinces[id]?.name)
              .join('、')}</div>`
      }
    `;

    box.querySelectorAll('[data-build]').forEach((b) =>
      b.addEventListener('click', () => {
        const res = this.engine.queueConstruction(this.engine.playerNationId, prov.id, b.dataset.build);
        this.showToast(res.ok ? `已将${CONSTRUCTION_COSTS[b.dataset.build].name}加入建造队列。` : res.reason);
        this.sfx.click();
        this.renderAll();
      })
    );
  }

  renderLog() {
    const el = document.getElementById('eventLog');
    el.innerHTML = this.engine.logs
      .slice(0, 12)
      .map((l) => `<div class="log-item ${l.type}">[${l.date}] ${l.text}</div>`)
      .join('');
  }
}

window.addEventListener('load', () => {
  window.__webHoiApp = new WebHoiApp();
});
