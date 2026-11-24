/**
 * 工业经济、资源统计、民用建造队列与军工装备生产引擎
 */

import { DIVISION_TEMPLATES, EQUIPMENT_CATALOG } from '../data/nations.js';
import { computeNationTechModifiers } from './combat.js';

export const CONSTRUCTION_COSTS = {
  civFactory: { name: '民用工厂', icCost: 120 },
  milFactory: { name: '军用工厂', icCost: 90 },
  infra: { name: '基础设施', icCost: 60 },
  fort: { name: '陆地要塞', icCost: 50 },
};

/**
 * 统计某国家当前控制的民工、军工与战略资源产出
 */
export function computeNationEconomy(nationId, state) {
  const nation = state.nations[nationId];
  const mods = computeNationTechModifiers(nation);
  let civFactories = 0;
  let milFactories = 0;
  const resources = { steel: 0, oil: 0, tungsten: 0 };

  for (const prov of Object.values(state.provinces)) {
    if (prov.owner !== nationId) continue;
    civFactories += prov.civFactories;
    milFactories += prov.milFactories;
    resources.steel += Math.round((prov.resources.steel || 0) * mods.resourceMult);
    resources.oil += Math.round((prov.resources.oil || 0) * mods.resourceMult);
    resources.tungsten += Math.round((prov.resources.tungsten || 0) * mods.resourceMult);
  }

  // 消费品占用约 20% 民工，剩余用于建造
  const consumerGoods = Math.floor(civFactories * 0.2);
  const availableCiv = Math.max(1, civFactories - consumerGoods);

  // 计算军工产线总资源需求
  const resourceNeed = { steel: 0, oil: 0, tungsten: 0 };
  let assignedMil = 0;
  for (const line of nation.productionLines) {
    assignedMil += line.factories;
    const eq = EQUIPMENT_CATALOG[line.equipmentId];
    if (!eq) continue;
    for (const [res, amt] of Object.entries(eq.resources)) {
      resourceNeed[res] += amt * line.factories;
    }
  }

  // 资源缺口效率修正：短缺越多军工产出越低，最低保留 35%
  let efficiency = 1.0;
  for (const res of ['steel', 'oil', 'tungsten']) {
    if (resourceNeed[res] > resources[res] && resourceNeed[res] > 0) {
      const deficitRatio = (resourceNeed[res] - resources[res]) / resourceNeed[res];
      efficiency -= deficitRatio * 0.35;
    }
  }
  efficiency = Math.max(0.35, Math.min(1.0, efficiency));

  return {
    civFactories,
    milFactories,
    availableCiv,
    assignedMil,
    freeMil: Math.max(0, milFactories - assignedMil),
    resources,
    resourceNeed,
    resourceEfficiency: efficiency,
  };
}

/**
 * 每日推进：民用建造队列 + 军工装备生产 + 新师训练队列 + 部队兵力补充
 */
export function processDailyEconomy(nationId, state) {
  const nation = state.nations[nationId];
  if (!nation || nation.capitulated) return;

  const mods = computeNationTechModifiers(nation);
  const econ = computeNationEconomy(nationId, state);

  // 若军工数量因占领/损失变化，自动裁剪超额分配的工厂
  let totalAssigned = nation.productionLines.reduce((s, l) => s + l.factories, 0);
  if (totalAssigned > econ.milFactories) {
    let excess = totalAssigned - econ.milFactories;
    for (let i = nation.productionLines.length - 1; i >= 0 && excess > 0; i--) {
      const cut = Math.min(excess, nation.productionLines[i].factories);
      nation.productionLines[i].factories -= cut;
      excess -= cut;
    }
  }

  // 1. 民用建造队列（每日每个可用民工贡献 5 IC）
  if (nation.constructionQueue.length > 0) {
    const task = nation.constructionQueue[0];
    const prov = state.provinces[task.provinceId];
    if (!prov || prov.owner !== nationId) {
      nation.constructionQueue.shift();
    } else {
      const dailyIC = econ.availableCiv * 5.0 * mods.constructionMult;
      task.progress += dailyIC;
      if (task.progress >= task.cost) {
        applyConstructionComplete(prov, task.type);
        nation.constructionQueue.shift();
        state.addLog(`${nation.shortName}在${prov.name}完成了${CONSTRUCTION_COSTS[task.type].name}建设。`, 'economy');
      }
    }
  }

  // 2. 军工生产（每日每个军工产出 4.5 基础 IC）
  for (const line of nation.productionLines) {
    if (line.factories <= 0) continue;
    const eq = EQUIPMENT_CATALOG[line.equipmentId];
    if (!eq) continue;
    const dailyIC = line.factories * 4.5 * mods.factoryOutputMult * econ.resourceEfficiency;
    const produced = dailyIC / eq.icCost;
    nation.equipment[line.equipmentId] = (nation.equipment[line.equipmentId] || 0) + produced;
  }

  // 3. 新建师训练队列
  for (let i = nation.trainingQueue.length - 1; i >= 0; i--) {
    const item = nation.trainingQueue[i];
    item.daysLeft -= 1;
    if (item.daysLeft <= 0) {
      const deployProv =
        state.provinces[item.deployProvinceId]?.owner === nationId
          ? item.deployProvinceId
          : findFallbackCapital(nationId, state);
      if (deployProv) {
        state.spawnDivision(nationId, item.templateId, deployProv);
        state.addLog(
          `${nation.shortName}新编成的${DIVISION_TEMPLATES[item.templateId].name}已在${state.provinces[deployProv].name}部署。`,
          'military'
        );
      }
      nation.trainingQueue.splice(i, 1);
    }
  }

  // 4. 现役部队每日人力与装备补员（非战斗且有补给时缓慢恢复 HP）
  for (const div of Object.values(state.divisions)) {
    if (div.owner !== nationId) continue;
    const tpl = DIVISION_TEMPLATES[div.template] || DIVISION_TEMPLATES.infantry;
    if (div.hp < tpl.maxHp && !div.inCombat && (div.supply ?? 1) >= 0.4) {
      const needHp = Math.min(2.5, tpl.maxHp - div.hp);
      const manpowerNeeded = Math.round((needHp / tpl.maxHp) * tpl.manpower);
      if (nation.manpower >= manpowerNeeded && (nation.equipment.infantry_eq || 0) >= 3) {
        nation.manpower -= manpowerNeeded;
        nation.equipment.infantry_eq -= 3;
        div.hp = Math.min(tpl.maxHp, div.hp + needHp);
      }
    }
  }
}

function applyConstructionComplete(prov, type) {
  if (type === 'civFactory') prov.civFactories += 1;
  else if (type === 'milFactory') prov.milFactories += 1;
  else if (type === 'infra') prov.infra = Math.min(10, prov.infra + 1);
  else if (type === 'fort') prov.fortLevel = Math.min(6, (prov.fortLevel || 0) + 1);
}

function findFallbackCapital(nationId, state) {
  const nation = state.nations[nationId];
  if (state.provinces[nation.capital]?.owner === nationId) return nation.capital;
  const anyOwned = Object.values(state.provinces).find((p) => p.owner === nationId);
  return anyOwned ? anyOwned.id : null;
}

/**
 * 发起新建师训练（扣除人力与装备库存）
 */
export function queueDivisionTraining(nationId, templateId, deployProvinceId, state) {
  const nation = state.nations[nationId];
  const tpl = DIVISION_TEMPLATES[templateId];
  if (!nation || !tpl) return { ok: false, reason: '无效编制模板' };
  if (nation.manpower < tpl.manpower) return { ok: false, reason: '可用人力不足' };

  for (const [eqId, cost] of Object.entries(tpl.equipmentCost)) {
    if ((nation.equipment[eqId] || 0) < cost) {
      return { ok: false, reason: `${EQUIPMENT_CATALOG[eqId].name}库存不足` };
    }
  }

  nation.manpower -= tpl.manpower;
  for (const [eqId, cost] of Object.entries(tpl.equipmentCost)) {
    nation.equipment[eqId] -= cost;
  }

  nation.trainingQueue.push({
    id: `train_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    templateId,
    deployProvinceId: deployProvinceId || nation.capital,
    daysLeft: tpl.trainDays,
    totalDays: tpl.trainDays,
  });
  return { ok: true };
}

/**
 * 添加建造任务到民用队列
 */
export function queueConstruction(nationId, provinceId, type, state) {
  const nation = state.nations[nationId];
  const prov = state.provinces[provinceId];
  const spec = CONSTRUCTION_COSTS[type];
  if (!nation || !prov || !spec) return { ok: false, reason: '无效建造参数' };
  if (prov.owner !== nationId) return { ok: false, reason: '只能在本国控制省份建造' };
  if (type === 'infra' && prov.infra >= 10) return { ok: false, reason: '基础设施已满级' };
  if (type === 'fort' && (prov.fortLevel || 0) >= 6) return { ok: false, reason: '要塞已满级' };

  nation.constructionQueue.push({
    id: `build_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    provinceId,
    type,
    progress: 0,
    cost: spec.icCost,
  });
  return { ok: true };
}
