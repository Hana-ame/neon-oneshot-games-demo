/**
 * 补给枢纽与前线补给追踪系统
 * 使用广度优先搜索 (BFS) 从首都及补给枢纽出发，经由己方/盟友控制省份计算每省补给水平与师级损耗。
 */

import { getAllNeighbors, TERRAIN_TYPES } from '../data/mapData.js';
import { DIVISION_TEMPLATES } from '../data/nations.js';
import { computeNationTechModifiers } from './combat.js';

/**
 * 判断某省份是否对指定国家开放补给通行（己方或同阵营盟友）
 */
export function isFriendlyProvince(nationId, province, state) {
  if (!province) return false;
  if (province.owner === nationId) return true;
  const n1 = state.nations[nationId];
  const n2 = state.nations[province.owner];
  return Boolean(n1 && n2 && n1.faction && n1.faction === n2.faction);
}

/**
 * 计算指定国家在所有省份的补给连通性与供给能力
 */
export function computeSupplyNetwork(nationId, state) {
  const nation = state.nations[nationId];
  if (!nation) return {};

  const visitedDist = {};
  const queue = [];

  // 起点：首都（若仍被己方控制）
  const cap = state.provinces[nation.capital];
  if (cap && isFriendlyProvince(nationId, cap, state)) {
    visitedDist[cap.id] = 0;
    queue.push(cap.id);
  } else {
    // 首都沦陷后，回退至所有己方控制的补给枢纽
    for (const p of Object.values(state.provinces)) {
      if (p.owner === nationId && p.supplyHub) {
        visitedDist[p.id] = 1;
        queue.push(p.id);
      }
    }
  }

  // BFS 计算到首都/补给源的最短跳数
  while (queue.length > 0) {
    const currId = queue.shift();
    const curr = state.provinces[currId];
    const nextDist = visitedDist[currId] + 1;

    for (const nbId of getAllNeighbors(curr)) {
      const nb = state.provinces[nbId];
      if (!isFriendlyProvince(nationId, nb, state)) continue;
      // 经过补给枢纽可重置距离衰减（相当于铁路枢纽中转）
      const effDist = nb.supplyHub ? Math.min(nextDist, 1) : nextDist;
      if (visitedDist[nbId] === undefined || effDist < visitedDist[nbId]) {
        visitedDist[nbId] = effDist;
        queue.push(nbId);
      }
    }
  }

  return visitedDist;
}

/**
 * 更新全部师的补给状态，并对断补或超载师施加每日损耗
 */
export function updateAllSupply(state, applyDailyAttrition = false) {
  const networks = {};
  for (const nationId of Object.keys(state.nations)) {
    networks[nationId] = computeSupplyNetwork(nationId, state);
  }

  // 按省份统计各师补给消耗
  const provinceDemand = {};
  for (const div of Object.values(state.divisions)) {
    const nation = state.nations[div.owner];
    const mods = computeNationTechModifiers(nation);
    const tpl = DIVISION_TEMPLATES[div.template] || DIVISION_TEMPLATES.infantry;
    const use = tpl.supplyUse * mods.supplyUseMult;
    provinceDemand[div.provinceId] = (provinceDemand[div.provinceId] || 0) + use;
  }

  for (const prov of Object.values(state.provinces)) {
    const terrain = TERRAIN_TYPES[prov.terrain] || TERRAIN_TYPES.plains;
    const capacity = terrain.supplyLimit + prov.infra * 2 + (prov.supplyHub ? 8 : 0);
    prov.supplyCapacity = capacity;
    prov.supplyUsed = Number((provinceDemand[prov.id] || 0).toFixed(1));
  }

  for (const div of Object.values(state.divisions)) {
    const prov = state.provinces[div.provinceId];
    const dist = networks[div.owner]?.[div.provinceId];

    if (dist === undefined) {
      // 完全断补（被敌军包围）
      div.supply = 0.0;
      div.encircled = true;
    } else {
      div.encircled = false;
      const distFactor = Math.max(0.4, 1.0 - dist * 0.12);
      const cap = prov.supplyCapacity || 10;
      const used = prov.supplyUsed || 1;
      const loadFactor = used <= cap ? 1.0 : Math.max(0.25, cap / used);
      div.supply = Number(Math.min(1.0, distFactor * loadFactor).toFixed(2));
    }

    if (applyDailyAttrition && div.supply < 0.5) {
      const severity = div.encircled ? 1.0 : 0.5 - div.supply;
      div.org = Math.max(2, div.org - severity * 6.5);
      div.hp = Math.max(10, div.hp - severity * 3.0);
    }
  }
}
