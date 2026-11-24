/**
 * Web HOI 核心大战略游戏引擎
 * 统一管理世界状态、时间推进（小时/日）、部队移动与交战、科研/焦点、外交与存档序列化。
 */

import { PROVINCES, TERRAIN_TYPES, getAllNeighbors } from '../data/mapData.js';
import { NATIONS, DIVISION_TEMPLATES } from '../data/nations.js';
import { TECHNOLOGIES } from '../data/technologies.js';
import { NATIONAL_FOCUSES } from '../data/focuses.js';
import { computeDivisionStats, computeNationTechModifiers, stepBattle } from './combat.js';
import { processDailyEconomy, queueConstruction, queueDivisionTraining, computeNationEconomy } from './economy.js';
import { updateAllSupply } from './supply.js';
import { areAtWar, declareWar, checkCapitulations } from './diplomacy.js';
import { runNationAI } from './ai.js';

export class GameEngine {
  constructor(playerNationId = 'GER') {
    this.reset(playerNationId);
  }

  reset(playerNationId = 'GER') {
    this.playerNationId = NATIONS[playerNationId] ? playerNationId : 'GER';
    this.year = 1936;
    this.month = 1;
    this.day = 1;
    this.hour = 0;
    this.totalDays = 0;
    this.worldTension = 10;
    this.paused = true;
    this.speed = 2; // 1..5
    this.nextDivSeq = 1;
    this.wars = [];
    this.battles = [];
    this.logs = [];
    this.provinces = {};
    this.nations = {};
    this.divisions = {};

    // 初始化省份
    for (const p of PROVINCES) {
      this.provinces[p.id] = {
        ...p,
        coreOwner: p.owner,
        fortLevel: p.fortLevel || 0,
        resources: { ...p.resources },
        neighbors: [...p.neighbors],
        seaNeighbors: [...(p.seaNeighbors || [])],
        supplyCapacity: 15,
        supplyUsed: 0,
      };
    }

    // 初始化国家
    for (const [id, n] of Object.entries(NATIONS)) {
      this.nations[id] = {
        ...n,
        equipment: { ...n.startingEquipment },
        completedTechs: [],
        activeTech: null, // { id, daysLeft, totalDays }
        completedFocuses: [],
        activeFocus: null, // { id, daysLeft, totalDays }
        constructionQueue: [],
        trainingQueue: [],
        productionLines: [
          { equipmentId: 'infantry_eq', factories: 3 },
          { equipmentId: 'artillery', factories: 1 },
          { equipmentId: 'trucks', factories: 1 },
          { equipmentId: 'tanks', factories: 2 },
        ],
        capitulated: false,
        surrenderProgress: 0,
      };

      // 按实际初始军工数校准产线工厂数
      const initMil = Object.values(this.provinces)
        .filter((p) => p.owner === id)
        .reduce((s, p) => s + p.milFactories, 0);
      this._balanceInitialProduction(this.nations[id], initMil);

      // 生成初始部队
      for (const d of n.startingDivisions) {
        this.spawnDivision(id, d.template, d.province, d.name);
      }
    }

    updateAllSupply(this, false);
    this.addLog(`1936年1月1日：${this.nations[this.playerNationId].name}进入战备状态。选择部队后右键相邻省份即可行军或进攻。`, 'system');
  }

  _balanceInitialProduction(nation, totalMil) {
    const weights = [0.4, 0.2, 0.15, 0.25];
    let assigned = 0;
    nation.productionLines.forEach((line, idx) => {
      const alloc = idx === nation.productionLines.length - 1
        ? Math.max(0, totalMil - assigned)
        : Math.floor(totalMil * weights[idx]);
      line.factories = alloc;
      assigned += alloc;
    });
  }

  spawnDivision(ownerId, templateId, provinceId, customName = null) {
    const tpl = DIVISION_TEMPLATES[templateId] || DIVISION_TEMPLATES.infantry;
    const nation = this.nations[ownerId];
    const mods = computeNationTechModifiers(nation);
    const id = `div_${this.nextDivSeq++}`;
    this.divisions[id] = {
      id,
      owner: ownerId,
      template: templateId,
      name: customName || `${nation.shortName}第${this.nextDivSeq - 1}${tpl.shortName}师`,
      provinceId,
      hp: tpl.maxHp,
      org: tpl.maxOrg + mods.maxOrgFlat,
      supply: 1.0,
      encircled: false,
      entrenchment: 1,
      movingTo: null,
      moveProgress: 0,
      inCombat: false,
    };
    return this.divisions[id];
  }

  addLog(text, type = 'info') {
    this.logs.unshift({
      date: this.formatDate(),
      text,
      type,
    });
    if (this.logs.length > 80) this.logs.length = 80;
  }

  formatDate() {
    const m = String(this.month).padStart(2, '0');
    const d = String(this.day).padStart(2, '0');
    return `${this.year}-${m}-${d}`;
  }

  /**
   * 推进游戏 6 小时（每 4 次为 1 天）
   */
  tickStep() {
    this.hour += 6;
    const isNewDay = this.hour >= 24;
    if (isNewDay) {
      this.hour = 0;
      this.advanceCalendarDay();
    }

    this.processMovements();
    this.processBattles();

    if (isNewDay) {
      this.processDailyUpdate();
    }
  }

  advanceCalendarDay() {
    const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    this.day += 1;
    this.totalDays += 1;
    if (this.day > daysInMonth[this.month - 1]) {
      this.day = 1;
      this.month += 1;
      if (this.month > 12) {
        this.month = 1;
        this.year += 1;
      }
    }
  }

  /**
   * 命令单个部队向相邻省份移动或发起进攻
   */
  orderMoveDivision(divisionId, targetProvinceId) {
    const div = this.divisions[divisionId];
    if (!div) return { ok: false, reason: '部队不存在' };
    const fromProv = this.provinces[div.provinceId];
    const toProv = this.provinces[targetProvinceId];
    if (!fromProv || !toProv) return { ok: false, reason: '省份无效' };
    if (div.provinceId === targetProvinceId) return { ok: false, reason: '部队已在该省份' };

    const neighbors = getAllNeighbors(fromProv);
    if (!neighbors.includes(targetProvinceId)) {
      return { ok: false, reason: '只能向相邻或海路直连省份移动' };
    }

    const isEnemyProv = areAtWar(div.owner, toProv.owner, this);
    const isFriendlyProv =
      toProv.owner === div.owner ||
      this.nations[div.owner].faction === this.nations[toProv.owner].faction;

    if (!isFriendlyProv && !isEnemyProv) {
      return { ok: false, reason: `未与${this.nations[toProv.owner].shortName}处于交战状态，请先宣战` };
    }

    div.movingTo = targetProvinceId;
    div.moveProgress = 0;
    div.entrenchment = 0;

    // 若目标省份有敌军驻守，立即开启/加入战斗
    if (isEnemyProv) {
      const defenders = Object.values(this.divisions).filter(
        (d) => d.provinceId === targetProvinceId && areAtWar(div.owner, d.owner, this)
      );
      if (defenders.length > 0) {
        this.joinOrCreateBattle(div, targetProvinceId, defenders);
      }
    }
    return { ok: true };
  }

  joinOrCreateBattle(attackerDiv, targetProvinceId, defenders) {
    let battle = this.battles.find(
      (b) => b.provinceId === targetProvinceId && b.attackerNation === attackerDiv.owner
    );
    if (!battle) {
      battle = {
        id: `bat_${targetProvinceId}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        provinceId: targetProvinceId,
        attackerNation: attackerDiv.owner,
        defenderNation: defenders[0].owner,
        attackerIds: [],
        defenderIds: defenders.map((d) => d.id),
        progress: 50,
        hoursElapsed: 0,
      };
      this.battles.push(battle);
    }
    if (!battle.attackerIds.includes(attackerDiv.id)) {
      battle.attackerIds.push(attackerDiv.id);
    }
    attackerDiv.inCombat = true;
    for (const def of defenders) {
      if (!battle.defenderIds.includes(def.id)) battle.defenderIds.push(def.id);
      def.inCombat = true;
    }
  }

  processMovements() {
    for (const div of Object.values(this.divisions)) {
      if (!div.movingTo || div.inCombat) continue;

      const targetProv = this.provinces[div.movingTo];
      if (!targetProv) {
        div.movingTo = null;
        continue;
      }

      // 移动途中如目标省出现敌军则转入战斗
      if (areAtWar(div.owner, targetProv.owner, this)) {
        const defenders = Object.values(this.divisions).filter(
          (d) => d.provinceId === targetProv.id && areAtWar(div.owner, d.owner, this)
        );
        if (defenders.length > 0) {
          this.joinOrCreateBattle(div, targetProv.id, defenders);
          continue;
        }
      }

      const nation = this.nations[div.owner];
      const stats = computeDivisionStats(div, nation, targetProv, true);
      const terrain = TERRAIN_TYPES[targetProv.terrain] || TERRAIN_TYPES.plains;
      // 每 6 小时推进进度（100 = 抵达）
      const stepDelta = (stats.speed * 18) / terrain.moveCost;
      div.moveProgress += stepDelta;

      if (div.moveProgress >= 100) {
        div.provinceId = targetProv.id;
        div.movingTo = null;
        div.moveProgress = 0;

        if (areAtWar(div.owner, targetProv.owner, this)) {
          const prevOwner = targetProv.owner;
          targetProv.owner = div.owner;
          this.addLog(
            `🚩 ${nation.shortName}部队占领了${this.nations[prevOwner].shortName}的${targetProv.name}！`,
            'military'
          );
          checkCapitulations(this, div.owner);
        }
      }
    }
  }

  processBattles() {
    for (let i = this.battles.length - 1; i >= 0; i--) {
      const battle = this.battles[i];
      const res = stepBattle(battle, this);

      if (res.status === 'attacker_won') {
        const prov = this.provinces[battle.provinceId];
        // 防守方撤退至相邻友方省份；若无退路则被包围全歼
        for (const defId of battle.defenderIds) {
          const def = this.divisions[defId];
          if (!def) continue;
          def.inCombat = false;
          const retreatProv = getAllNeighbors(prov).find(
            (nbId) => this.provinces[nbId]?.owner === def.owner
          );
          if (retreatProv) {
            def.provinceId = retreatProv;
            def.movingTo = null;
            def.org = Math.max(5, def.org);
          } else {
            this.addLog(`💥 ${def.name}在${prov.name}被包围歼灭！`, 'war');
            delete this.divisions[defId];
          }
        }
        // 进攻方解除战斗并继续快速进入目标省
        for (const atkId of battle.attackerIds) {
          const atk = this.divisions[atkId];
          if (!atk) continue;
          atk.inCombat = false;
          atk.moveProgress = Math.max(atk.moveProgress, 65);
        }
        this.battles.splice(i, 1);
      } else if (res.status === 'defender_won') {
        for (const atkId of battle.attackerIds) {
          const atk = this.divisions[atkId];
          if (!atk) continue;
          atk.inCombat = false;
          atk.movingTo = null;
          atk.moveProgress = 0;
        }
        for (const defId of battle.defenderIds) {
          const def = this.divisions[defId];
          if (def) def.inCombat = false;
        }
        this.battles.splice(i, 1);
      }
    }
  }

  processDailyUpdate() {
    updateAllSupply(this, true);

    for (const nation of Object.values(this.nations)) {
      if (nation.capitulated) continue;

      // 政治点数每日增长
      nation.politicalPower = Number((nation.politicalPower + 1.5 + nation.stability * 0.8).toFixed(1));

      // 科研进度推进
      if (nation.activeTech) {
        nation.activeTech.daysLeft -= 1;
        if (nation.activeTech.daysLeft <= 0) {
          const tech = TECHNOLOGIES.find((t) => t.id === nation.activeTech.id);
          nation.completedTechs.push(nation.activeTech.id);
          nation.activeTech = null;
          if (tech) {
            this.addLog(`🔬 ${nation.shortName}完成科技研发：${tech.name}。`, 'tech');
          }
        }
      }

      // 国家焦点推进
      if (nation.activeFocus) {
        nation.activeFocus.daysLeft -= 1;
        if (nation.activeFocus.daysLeft <= 0) {
          const focus = NATIONAL_FOCUSES.find((f) => f.id === nation.activeFocus.id);
          nation.completedFocuses.push(nation.activeFocus.id);
          nation.activeFocus = null;
          if (focus) {
            this.applyFocusEffect(nation, focus);
          }
        }
      }

      // 工业、生产、建造与补员
      processDailyEconomy(nation.id, this);
    }

    // 非战斗部队恢复组织度与挖掘堑壕
    for (const div of Object.values(this.divisions)) {
      if (div.inCombat) continue;
      const nation = this.nations[div.owner];
      const mods = computeNationTechModifiers(nation);
      const tpl = DIVISION_TEMPLATES[div.template] || DIVISION_TEMPLATES.infantry;
      const maxOrg = tpl.maxOrg + mods.maxOrgFlat;
      if (div.org < maxOrg && div.supply >= 0.4) {
        div.org = Math.min(maxOrg, div.org + 3.2 * mods.orgRecoveryMult * div.supply);
      }
      if (!div.movingTo) {
        div.entrenchment = Math.min(5, (div.entrenchment || 0) + 0.5);
      }
    }

    // 运行所有 AI 国家
    for (const nationId of Object.keys(this.nations)) {
      if (nationId !== this.playerNationId) {
        runNationAI(nationId, this);
      }
    }
  }

  applyFocusEffect(nation, focus) {
    const eff = focus.effect || {};
    const cap = this.provinces[nation.capital];
    if (eff.addCivToCapital && cap && cap.owner === nation.id) cap.civFactories += eff.addCivToCapital;
    if (eff.addMilToCapital && cap && cap.owner === nation.id) cap.milFactories += eff.addMilToCapital;
    if (eff.politicalPower) nation.politicalPower += eff.politicalPower;
    if (eff.stability) nation.stability = Math.min(1, nation.stability + eff.stability);
    if (eff.warSupport) nation.warSupport = Math.min(1, nation.warSupport + eff.warSupport);
    if (eff.manpower) nation.manpower += eff.manpower;
    if (eff.tension) this.worldTension = Math.min(100, this.worldTension + eff.tension);
    if (eff.equipment) {
      for (const [eqId, amt] of Object.entries(eff.equipment)) {
        nation.equipment[eqId] = (nation.equipment[eqId] || 0) + amt;
      }
    }
    this.addLog(`📜 ${nation.shortName}完成国家焦点：${focus.name}。`, 'focus');
  }

  startResearch(nationId, techId) {
    const nation = this.nations[nationId];
    const tech = TECHNOLOGIES.find((t) => t.id === techId);
    if (!nation || !tech) return { ok: false, reason: '无效科技' };
    if (nation.activeTech) return { ok: false, reason: '当前已有正在研发的科技' };
    if (nation.completedTechs.includes(techId)) return { ok: false, reason: '该科技已研发完成' };
    if (!tech.prereq.every((p) => nation.completedTechs.includes(p))) {
      return { ok: false, reason: '前置科技尚未完成' };
    }
    nation.activeTech = { id: tech.id, daysLeft: tech.costDays, totalDays: tech.costDays };
    return { ok: true };
  }

  startFocus(nationId, focusId) {
    const nation = this.nations[nationId];
    const focus = NATIONAL_FOCUSES.find((f) => f.id === focusId);
    if (!nation || !focus) return { ok: false, reason: '无效国家焦点' };
    if (nation.activeFocus) return { ok: false, reason: '当前已有正在执行的焦点' };
    if (nation.completedFocuses.includes(focusId)) return { ok: false, reason: '该焦点已完成' };
    if (!focus.prereq.every((p) => nation.completedFocuses.includes(p))) {
      return { ok: false, reason: '前置焦点尚未完成' };
    }
    nation.activeFocus = { id: focus.id, daysLeft: focus.days, totalDays: focus.days };
    return { ok: true };
  }

  adjustProductionLine(nationId, equipmentId, delta) {
    const nation = this.nations[nationId];
    if (!nation) return { ok: false, reason: '无效国家' };
    const line = nation.productionLines.find((l) => l.equipmentId === equipmentId);
    if (!line) return { ok: false, reason: '产线不存在' };
    const econ = computeNationEconomy(nationId, this);
    if (delta > 0 && econ.freeMil < delta) return { ok: false, reason: '没有空闲军用工厂' };
    if (delta < 0 && line.factories + delta < 0) return { ok: false, reason: '工厂数不能为负' };
    line.factories += delta;
    return { ok: true };
  }

  declareWar(attackerId, defenderId) {
    return declareWar(attackerId, defenderId, this);
  }

  queueConstruction(nationId, provinceId, type) {
    return queueConstruction(nationId, provinceId, type, this);
  }

  queueDivisionTraining(nationId, templateId, deployProvinceId) {
    return queueDivisionTraining(nationId, templateId, deployProvinceId, this);
  }

  /**
   * 序列化完整世界状态为 JSON 字符串（支持存档与回放）
   */
  serialize() {
    return JSON.stringify({
      version: '1.0.0',
      playerNationId: this.playerNationId,
      year: this.year,
      month: this.month,
      day: this.day,
      hour: this.hour,
      totalDays: this.totalDays,
      worldTension: this.worldTension,
      nextDivSeq: this.nextDivSeq,
      wars: this.wars,
      battles: this.battles,
      logs: this.logs,
      provinces: this.provinces,
      nations: this.nations,
      divisions: this.divisions,
    });
  }

  /**
   * 从 JSON 存档恢复游戏状态
   */
  deserialize(jsonStr) {
    const data = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
    if (!data || !data.provinces || !data.nations) {
      throw new Error('无效存档格式');
    }
    this.playerNationId = data.playerNationId;
    this.year = data.year;
    this.month = data.month;
    this.day = data.day;
    this.hour = data.hour;
    this.totalDays = data.totalDays;
    this.worldTension = data.worldTension;
    this.nextDivSeq = data.nextDivSeq;
    this.wars = data.wars;
    this.battles = data.battles;
    this.logs = data.logs;
    this.provinces = data.provinces;
    this.nations = data.nations;
    this.divisions = data.divisions;
    updateAllSupply(this, false);
  }
}
