/**
 * 国家战略与战术 AI 引擎
 * 负责非玩家国家的：国策选择、科技研发、军工分配、建造、新师招募、前线调动与局部进攻评估。
 */

import { getAllNeighbors } from '../data/mapData.js';
import { TECHNOLOGIES } from '../data/technologies.js';
import { NATIONAL_FOCUSES } from '../data/focuses.js';
import { computeNationEconomy, queueConstruction, queueDivisionTraining } from './economy.js';
import { areAtWar, declareWar } from './diplomacy.js';

/**
 * 每日执行一次 AI 国家内政与军事决策
 */
export function runNationAI(nationId, state) {
  const nation = state.nations[nationId];
  if (!nation || nation.capitulated || nationId === state.playerNationId) return;

  // 1. 自动选择国家焦点
  if (!nation.activeFocus) {
    const avail = NATIONAL_FOCUSES.filter(
      (f) =>
        !nation.completedFocuses.includes(f.id) &&
        f.prereq.every((p) => nation.completedFocuses.includes(p))
    );
    if (avail.length > 0) {
      const preferred =
        avail.find((f) => nation.aiProfile?.focusPriority?.includes(f.id)) || avail[0];
      state.startFocus(nationId, preferred.id);
    }
  }

  // 2. 自动选择科技研发
  if (!nation.activeTech) {
    const availTech = TECHNOLOGIES.filter(
      (t) =>
        !nation.completedTechs.includes(t.id) &&
        t.prereq.every((p) => nation.completedTechs.includes(p))
    );
    if (availTech.length > 0) {
      state.startResearch(nationId, availTech[0].id);
    }
  }

  // 3. 自动分配空闲军工工厂
  const econ = computeNationEconomy(nationId, state);
  if (econ.freeMil > 0) {
    const targetLine =
      nation.productionLines.find((l) => l.equipmentId === 'infantry_eq') ||
      nation.productionLines[0];
    if (targetLine) targetLine.factories += econ.freeMil;
  }

  // 4. 自动建造（队列为空时优先扩建军工）
  if (nation.constructionQueue.length === 0) {
    const ownedProvs = Object.values(state.provinces).filter((p) => p.owner === nationId);
    if (ownedProvs.length > 0) {
      const targetProv = ownedProvs.find((p) => p.id === nation.capital) || ownedProvs[0];
      queueConstruction(nationId, targetProv.id, 'milFactory', state);
    }
  }

  // 5. 自动训练步兵师（最多保持 2 个并发训练任务）
  if (nation.trainingQueue.length < 2 && nation.manpower > 50000) {
    queueDivisionTraining(nationId, 'infantry', nation.capital, state);
  }

  // 6. 历史趋势外交事件：高侵略性 AI 在完成关键焦点或日期推进后主动宣战
  if (
    nationId === 'GER' &&
    state.totalDays >= 45 &&
    !areAtWar('GER', 'POL', state) &&
    !state.nations.POL.capitulated
  ) {
    declareWar('GER', 'POL', state);
  }

  // 7. 军事前线调度与进攻评估
  manageMilitaryFronts(nationId, state);
}

function manageMilitaryFronts(nationId, state) {
  const myDivs = Object.values(state.divisions).filter(
    (d) => d.owner === nationId && !d.movingTo && !d.inCombat
  );
  if (myDivs.length === 0) return;

  const enemyProvinces = new Set(
    Object.values(state.provinces)
      .filter((p) => areAtWar(nationId, p.owner, state))
      .map((p) => p.id)
  );

  // 处于和平状态：不主动进攻，保持首都与边境驻防
  if (enemyProvinces.size === 0) return;

  // 找出所有接壤敌军的前线省份
  const frontlineProvs = Object.values(state.provinces).filter(
    (p) => p.owner === nationId && getAllNeighbors(p).some((nb) => enemyProvinces.has(nb))
  );

  for (const div of myDivs) {
    if (div.org < 22) continue; // 低组织度先休整

    const currProv = state.provinces[div.provinceId];
    const neighbors = getAllNeighbors(currProv);

    // 优先检查相邻敌省是否可发起优势进攻
    const adjacentEnemies = neighbors.filter((nbId) => enemyProvinces.has(nbId));
    if (adjacentEnemies.length > 0) {
      const myCountHere = Object.values(state.divisions).filter(
        (d) => d.owner === nationId && d.provinceId === currProv.id && d.org >= 20
      ).length;

      let bestTarget = null;
      let bestScore = -Infinity;

      for (const enemyId of adjacentEnemies) {
        const enemyDivs = Object.values(state.divisions).filter(
          (d) => d.provinceId === enemyId && areAtWar(nationId, d.owner, state)
        ).length;
        const score = myCountHere - enemyDivs * 1.1 + (state.provinces[enemyId].vp || 0) * 0.05;
        if (score > bestScore) {
          bestScore = score;
          bestTarget = enemyId;
        }
      }

      if (bestTarget && bestScore >= 0.2) {
        state.orderMoveDivision(div.id, bestTarget);
        continue;
      }
    }

    // 若当前在后方，向前线空虚或薄弱省份增援
    if (adjacentEnemies.length === 0 && frontlineProvs.length > 0) {
      const nextStep = findStepToward(currProv.id, frontlineProvs.map((p) => p.id), nationId, state);
      if (nextStep) {
        state.orderMoveDivision(div.id, nextStep);
      }
    }
  }
}

/**
 * 简单 BFS 寻找后方部队通向前线省份的下一步邻省
 */
function findStepToward(startId, goalIds, nationId, state) {
  const goalSet = new Set(goalIds);
  const visited = new Set([startId]);
  const queue = [{ id: startId, firstStep: null }];

  while (queue.length > 0) {
    const { id, firstStep } = queue.shift();
    if (goalSet.has(id) && firstStep) return firstStep;

    const prov = state.provinces[id];
    for (const nbId of getAllNeighbors(prov)) {
      if (visited.has(nbId)) continue;
      const nb = state.provinces[nbId];
      if (!nb || nb.owner !== nationId) continue;
      visited.add(nbId);
      queue.push({ id: nbId, firstStep: firstStep || nbId });
    }
  }
  return null;
}
