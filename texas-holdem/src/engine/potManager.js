/**
 * potManager.js - 主池与多级边池 (Main Pot & Side Pots) 计算与结算引擎
 * 精确处理多人不同筹码 All-in、弃牌死钱、平分底池及奇数筹码余数分配（顺时针距庄家最近者得）
 */

/**
 * 根据本局所有玩家的总投入和弃牌状态构建主池与边池
 * @param {Array<{id: string, totalContribution: number, folded: boolean}>} players
 * @returns {Array<{name: string, amount: number, eligibleIds: string[]}>}
 */
export function calculateSidePots(players) {
  const contributors = players.filter((p) => p.totalContribution > 0);
  if (contributors.length === 0) return [];

  // 收集所有正投入层级并升序排列
  const levels = Array.from(
    new Set(contributors.map((p) => p.totalContribution))
  ).sort((a, b) => a - b);

  const rawPots = [];
  let prevLevel = 0;

  for (const level of levels) {
    const sliceHeight = level - prevLevel;
    if (sliceHeight <= 0) continue;

    let sliceAmount = 0;
    const eligibleIds = [];

    for (const p of contributors) {
      if (p.totalContribution > prevLevel) {
        const contribInSlice = Math.min(p.totalContribution, level) - prevLevel;
        sliceAmount += contribInSlice;
      }
      if (!p.folded && p.totalContribution >= level) {
        eligibleIds.push(p.id);
      }
    }

    if (sliceAmount > 0) {
      if (eligibleIds.length === 0 && rawPots.length > 0) {
        // 极端情况：弃牌玩家投入高于所有未弃牌玩家，死钱并入上一个有效底池
        rawPots[rawPots.length - 1].amount += sliceAmount;
      } else {
        rawPots.push({
          amount: sliceAmount,
          eligibleIds,
        });
      }
    }

    prevLevel = level;
  }

  // 合并具有完全相同合格竞争者集合的相邻底池
  const merged = [];
  for (const pot of rawPots) {
    const key = pot.eligibleIds.slice().sort().join('|');
    if (merged.length > 0 && merged[merged.length - 1]._key === key) {
      merged[merged.length - 1].amount += pot.amount;
    } else {
      merged.push({
        amount: pot.amount,
        eligibleIds: pot.eligibleIds,
        _key: key,
      });
    }
  }

  return merged.map((pot, idx) => ({
    name: idx === 0 ? '主池' : `边池 ${idx}`,
    amount: pot.amount,
    eligibleIds: pot.eligibleIds,
  }));
}

/**
 * 根据摊牌评估结果分配所有底池
 * @param {Array<{name: string, amount: number, eligibleIds: string[]}>} pots
 * @param {Object<string, {score: number, categoryNameZh: string}>} evaluations 玩家ID -> 牌型评估
 * @param {string[]} seatOrderFromSB 从小盲位置起顺时针排列的玩家ID列表（用于平分底池时的余数分配）
 * @returns {{ payouts: Object<string, number>, potResults: Array }}
 */
export function distributePots(pots, evaluations, seatOrderFromSB = []) {
  const payouts = {};
  const potResults = [];
  const orderIndex = new Map(seatOrderFromSB.map((id, idx) => [id, idx]));

  for (const pot of pots) {
    const eligible = pot.eligibleIds;
    if (eligible.length === 0 || pot.amount <= 0) continue;

    let winners = [];
    if (eligible.length === 1) {
      // 仅一名玩家有资格（例如其他玩家均已弃牌或未跟注的超额筹码）
      winners = [eligible[0]];
    } else {
      let bestScore = -1;
      for (const id of eligible) {
        const ev = evaluations[id];
        if (!ev) continue;
        if (ev.score > bestScore) {
          bestScore = ev.score;
          winners = [id];
        } else if (ev.score === bestScore) {
          winners.push(id);
        }
      }
    }

    if (winners.length === 0) continue;

    // 按距庄家顺时针顺序排序，用于分配奇数筹码余数
    winners.sort((a, b) => {
      const ia = orderIndex.has(a) ? orderIndex.get(a) : Number.MAX_SAFE_INTEGER;
      const ib = orderIndex.has(b) ? orderIndex.get(b) : Number.MAX_SAFE_INTEGER;
      return ia - ib;
    });

    const baseShare = Math.floor(pot.amount / winners.length);
    const remainder = pot.amount % winners.length;

    const distributions = [];
    winners.forEach((winnerId, idx) => {
      const won = baseShare + (idx < remainder ? 1 : 0);
      payouts[winnerId] = (payouts[winnerId] || 0) + won;
      distributions.push({ playerId: winnerId, amount: won });
    });

    potResults.push({
      potName: pot.name,
      amount: pot.amount,
      winners,
      distributions,
    });
  }

  return { payouts, potResults };
}
