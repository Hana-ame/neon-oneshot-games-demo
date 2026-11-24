/**
 * HOI 核心战斗结算引擎
 * 完整实现软攻/硬攻、防御/突破、装甲率/穿甲判定、地形修正、要塞、堑壕、补给惩罚与组织度/兵力损耗。
 */

import { DIVISION_TEMPLATES } from '../data/nations.js';
import { TERRAIN_TYPES } from '../data/mapData.js';
import { TECHNOLOGIES } from '../data/technologies.js';

/**
 * 汇总国家已解锁科技对部队属性的加成
 */
export function computeNationTechModifiers(nation) {
  const mods = {
    softAttackMult: 1.0,
    hardAttackMult: 1.0,
    defenseMult: 1.0,
    breakthroughMult: 1.0,
    armorFlat: 0,
    piercingFlat: 0,
    speedMult: 1.0,
    supplyUseMult: 1.0,
    maxOrgFlat: 0,
    orgRecoveryMult: 1.0,
    factoryOutputMult: 1.0,
    constructionMult: 1.0,
    resourceMult: 1.0,
  };

  const completed = nation?.completedTechs || [];
  for (const techId of completed) {
    const tech = TECHNOLOGIES.find((t) => t.id === techId);
    if (!tech) continue;
    for (const [k, v] of Object.entries(tech.effects)) {
      if (k in mods) {
        mods[k] += v;
      }
    }
  }
  mods.supplyUseMult = Math.max(0.4, mods.supplyUseMult);
  return mods;
}

/**
 * 计算单个师在当前科技、补给、兵力比与地形下的有效战斗属性
 */
export function computeDivisionStats(division, nation, province, isAttacker) {
  const tpl = DIVISION_TEMPLATES[division.template] || DIVISION_TEMPLATES.infantry;
  const mods = computeNationTechModifiers(nation);
  const terrain = TERRAIN_TYPES[province?.terrain] || TERRAIN_TYPES.plains;

  const strengthRatio = Math.max(0.15, division.hp / tpl.maxHp);
  const supplyFactor = 0.45 + 0.55 * Math.min(1, Math.max(0, division.supply ?? 1));
  const terrainMod = isAttacker ? terrain.attackMod : terrain.defenseMod;
  const mountainBonus =
    tpl.mountainBonus && (terrain.id === 'mountains' || terrain.id === 'hills')
      ? tpl.mountainBonus
      : 1.0;

  // 防守方享受堑壕与要塞加成；进攻方受要塞削弱
  const entrenchBonus = isAttacker ? 1.0 : 1.0 + Math.min(0.25, (division.entrenchment || 0) * 0.05);
  const fortLevel = province?.fortLevel || 0;
  const fortMod = isAttacker
    ? Math.max(0.4, 1.0 - fortLevel * 0.12)
    : 1.0 + fortLevel * 0.08;

  const composite = strengthRatio * supplyFactor * terrainMod * mountainBonus * entrenchBonus * fortMod;

  const maxOrg = tpl.maxOrg + mods.maxOrgFlat;
  const armor = tpl.armor > 0 ? tpl.armor + mods.armorFlat : 0;
  const piercing = tpl.piercing + mods.piercingFlat;
  // 装甲率（hardness）决定吃硬攻还是软攻比例
  const hardness = tpl.armor >= 20 ? 0.65 : tpl.armor > 0 ? 0.25 : 0.05;

  return {
    softAttack: tpl.softAttack * mods.softAttackMult * composite,
    hardAttack: tpl.hardAttack * mods.hardAttackMult * composite,
    defense: tpl.defense * mods.defenseMult * composite,
    breakthrough: tpl.breakthrough * mods.breakthroughMult * composite,
    armor,
    piercing,
    hardness,
    maxOrg,
    speed: tpl.speed * mods.speedMult * (0.6 + 0.4 * Math.min(1, division.supply ?? 1)),
  };
}

/**
 * 计算单次战斗小时轮次伤害
 * 当一方的装甲值 > 对方穿甲值时，获得装甲优势（输出 +35%，承伤 -40%）
 */
export function calculateExchange(attackerStats, defenderStats) {
  const atkRaw =
    attackerStats.softAttack * (1 - defenderStats.hardness) +
    attackerStats.hardAttack * defenderStats.hardness;
  const defRaw =
    defenderStats.softAttack * (1 - attackerStats.hardness) +
    defenderStats.hardAttack * attackerStats.hardness;

  const attackerHasArmorAdv = attackerStats.armor > defenderStats.piercing;
  const defenderHasArmorAdv = defenderStats.armor > attackerStats.piercing;

  // 超过对方防御/突破的部分造成 2.5 倍暴击伤害（简化版 HOI4 命中机制）
  const atkBlocked = Math.min(atkRaw, defenderStats.defense);
  const atkExcess = Math.max(0, atkRaw - defenderStats.defense);
  let dmgToDefender = atkBlocked * 0.08 + atkExcess * 0.22;

  const defBlocked = Math.min(defRaw, attackerStats.breakthrough);
  const defExcess = Math.max(0, defRaw - attackerStats.breakthrough);
  let dmgToAttacker = defBlocked * 0.08 + defExcess * 0.22;

  if (attackerHasArmorAdv) {
    dmgToDefender *= 1.35;
    dmgToAttacker *= 0.6;
  }
  if (defenderHasArmorAdv) {
    dmgToAttacker *= 1.35;
    dmgToDefender *= 0.6;
  }

  return {
    defenderOrgDmg: Math.max(0.4, dmgToDefender * 1.6),
    defenderHpDmg: Math.max(0.15, dmgToDefender * 0.48),
    attackerOrgDmg: Math.max(0.35, dmgToAttacker * 1.45),
    attackerHpDmg: Math.max(0.15, dmgToAttacker * 0.45),
    attackerHasArmorAdv,
    defenderHasArmorAdv,
  };
}

/**
 * 推进单个战区战斗 1 个回合（每 6 游戏小时结算一次）
 * 返回战斗状态：{ status: 'ongoing' | 'attacker_won' | 'defender_won', progress }
 */
export function stepBattle(battle, state) {
  const province = state.provinces[battle.provinceId];
  const attackers = battle.attackerIds
    .map((id) => state.divisions[id])
    .filter((d) => d && d.org > 0 && d.hp > 0);
  const defenders = battle.defenderIds
    .map((id) => state.divisions[id])
    .filter((d) => d && d.org > 0 && d.hp > 0);

  if (attackers.length === 0) {
    return { status: 'defender_won', progress: 0 };
  }
  if (defenders.length === 0) {
    return { status: 'attacker_won', progress: 100 };
  }

  // 聚合攻防双方战力（含堆叠惩罚防止无限堆兵）
  const atkStackPenalty = attackers.length > 4 ? Math.max(0.55, 1 - (attackers.length - 4) * 0.08) : 1;
  const defStackPenalty = defenders.length > 4 ? Math.max(0.55, 1 - (defenders.length - 4) * 0.08) : 1;

  const aggAtk = aggregateStats(attackers, state, province, true, atkStackPenalty);
  const aggDef = aggregateStats(defenders, state, province, false, defStackPenalty);

  const exchange = calculateExchange(aggAtk, aggDef);

  // 分摊伤害到参战各师
  for (const d of defenders) {
    d.org = Math.max(0, d.org - exchange.defenderOrgDmg / Math.sqrt(defenders.length));
    d.hp = Math.max(5, d.hp - exchange.defenderHpDmg / Math.sqrt(defenders.length));
  }
  for (const a of attackers) {
    a.org = Math.max(0, a.org - exchange.attackerOrgDmg / Math.sqrt(attackers.length));
    a.hp = Math.max(5, a.hp - exchange.attackerHpDmg / Math.sqrt(attackers.length));
  }

  const atkAlive = attackers.filter((d) => d.org > 1);
  const defAlive = defenders.filter((d) => d.org > 1);

  const atkOrgSum = attackers.reduce((s, d) => s + d.org, 0);
  const defOrgSum = defenders.reduce((s, d) => s + d.org, 0);
  const total = atkOrgSum + defOrgSum;
  const progress = total > 0 ? Math.round((atkOrgSum / total) * 100) : 50;
  battle.progress = progress;
  battle.hoursElapsed = (battle.hoursElapsed || 0) + 6;

  if (defAlive.length === 0) {
    return { status: 'attacker_won', progress: 100 };
  }
  if (atkAlive.length === 0) {
    return { status: 'defender_won', progress: 0 };
  }
  return { status: 'ongoing', progress };
}

function aggregateStats(divisions, state, province, isAttacker, stackPenalty) {
  let softAttack = 0;
  let hardAttack = 0;
  let defense = 0;
  let breakthrough = 0;
  let maxArmor = 0;
  let maxPiercing = 0;
  let hardnessSum = 0;

  for (const div of divisions) {
    const nation = state.nations[div.owner];
    const st = computeDivisionStats(div, nation, province, isAttacker);
    softAttack += st.softAttack;
    hardAttack += st.hardAttack;
    defense += st.defense;
    breakthrough += st.breakthrough;
    maxArmor = Math.max(maxArmor, st.armor);
    maxPiercing = Math.max(maxPiercing, st.piercing);
    hardnessSum += st.hardness;
  }

  return {
    softAttack: softAttack * stackPenalty,
    hardAttack: hardAttack * stackPenalty,
    defense: defense * stackPenalty,
    breakthrough: breakthrough * stackPenalty,
    armor: maxArmor,
    piercing: maxPiercing,
    hardness: divisions.length > 0 ? hardnessSum / divisions.length : 0,
  };
}
