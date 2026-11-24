/**
 * evaluator.js - 德州扑克 5~7 张牌精确牌型评估引擎
 * 支持 10 种标准牌型（皇家同花顺至高牌）、A-2-3-4-5 最小顺子及完整踢脚牌比较
 */

export const HAND_CATEGORY = {
  HIGH_CARD: 0,
  ONE_PAIR: 1,
  TWO_PAIR: 2,
  THREE_OF_A_KIND: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  FOUR_OF_A_KIND: 7,
  STRAIGHT_FLUSH: 8,
};

export const CATEGORY_NAMES = {
  0: { en: 'High Card', zh: '高牌' },
  1: { en: 'One Pair', zh: '一对' },
  2: { en: 'Two Pair', zh: '两对' },
  3: { en: 'Three of a Kind', zh: '三条' },
  4: { en: 'Straight', zh: '顺子' },
  5: { en: 'Flush', zh: '同花' },
  6: { en: 'Full House', zh: '葫芦' },
  7: { en: 'Four of a Kind', zh: '四条' },
  8: { en: 'Straight Flush', zh: '同花顺' },
};

const BASE = 15;
const POW = [
  1,
  BASE,
  BASE * BASE,
  BASE * BASE * BASE,
  BASE * BASE * BASE * BASE,
  BASE * BASE * BASE * BASE * BASE,
];

/**
 * 将牌型类别与最多 5 个比较权重编码为单一可比整数
 * @param {number} category 0..8
 * @param {number[]} tiebreakers 长度补齐为 5
 * @returns {number}
 */
function encodeScore(category, tiebreakers) {
  let score = category * POW[5];
  for (let i = 0; i < 5; i++) {
    score += (tiebreakers[i] || 0) * POW[4 - i];
  }
  return score;
}

/**
 * 评估恰好 5 张牌的牌型与分数
 * @param {Array<{rank: number, suit: string, id: string}>} fiveCards
 */
export function evaluateFiveCards(fiveCards) {
  if (!Array.isArray(fiveCards) || fiveCards.length !== 5) {
    throw new Error('evaluateFiveCards requires exactly 5 cards');
  }

  const sorted = fiveCards.slice().sort((a, b) => b.rank - a.rank);
  const ranks = sorted.map((c) => c.rank);
  const isFlush = sorted.every((c) => c.suit === sorted[0].suit);

  // 统计各点数出现次数
  const countMap = new Map();
  for (const r of ranks) {
    countMap.set(r, (countMap.get(r) || 0) + 1);
  }

  // 按 (出现次数降序, 点数降序) 排序
  const groups = Array.from(countMap.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  // 判断顺子（仅当 5 张牌点数各不相同时可能为顺子）
  let isStraight = false;
  let straightHigh = 0;
  if (groups.length === 5) {
    if (ranks[0] - ranks[4] === 4) {
      isStraight = true;
      straightHigh = ranks[0];
    } else if (
      ranks[0] === 14 &&
      ranks[1] === 5 &&
      ranks[2] === 4 &&
      ranks[3] === 3 &&
      ranks[4] === 2
    ) {
      // A-2-3-4-5 最小顺子 (Wheel)
      isStraight = true;
      straightHigh = 5;
    }
  }

  let category;
  let tiebreakers;

  if (isStraight && isFlush) {
    category = HAND_CATEGORY.STRAIGHT_FLUSH;
    tiebreakers = [straightHigh, 0, 0, 0, 0];
  } else if (groups[0][1] === 4) {
    category = HAND_CATEGORY.FOUR_OF_A_KIND;
    tiebreakers = [groups[0][0], groups[1][0], 0, 0, 0];
  } else if (groups[0][1] === 3 && groups[1][1] === 2) {
    category = HAND_CATEGORY.FULL_HOUSE;
    tiebreakers = [groups[0][0], groups[1][0], 0, 0, 0];
  } else if (isFlush) {
    category = HAND_CATEGORY.FLUSH;
    tiebreakers = ranks;
  } else if (isStraight) {
    category = HAND_CATEGORY.STRAIGHT;
    tiebreakers = [straightHigh, 0, 0, 0, 0];
  } else if (groups[0][1] === 3) {
    category = HAND_CATEGORY.THREE_OF_A_KIND;
    tiebreakers = [groups[0][0], groups[1][0], groups[2][0], 0, 0];
  } else if (groups[0][1] === 2 && groups[1][1] === 2) {
    category = HAND_CATEGORY.TWO_PAIR;
    tiebreakers = [groups[0][0], groups[1][0], groups[2][0], 0, 0];
  } else if (groups[0][1] === 2) {
    category = HAND_CATEGORY.ONE_PAIR;
    tiebreakers = [groups[0][0], groups[1][0], groups[2][0], groups[3][0], 0];
  } else {
    category = HAND_CATEGORY.HIGH_CARD;
    tiebreakers = ranks;
  }

  const isRoyal = category === HAND_CATEGORY.STRAIGHT_FLUSH && straightHigh === 14;
  const score = encodeScore(category, tiebreakers);

  return {
    category,
    isRoyalFlush: isRoyal,
    categoryName: isRoyal ? 'Royal Flush' : CATEGORY_NAMES[category].en,
    categoryNameZh: isRoyal ? '皇家同花顺' : CATEGORY_NAMES[category].zh,
    score,
    tiebreakers,
    bestFive: sorted,
  };
}

/**
 * 从 5~7 张牌中选出最佳 5 张牌组合
 * 对于 7 张牌仅需遍历 C(7,5) = 21 种组合，精确返回最佳牌型及具体 5 张牌
 * @param {Array<{rank: number, suit: string, id: string}>} cards
 */
export function evaluateBestHand(cards) {
  if (!Array.isArray(cards) || cards.length < 5 || cards.length > 7) {
    throw new Error(`evaluateBestHand expects 5 to 7 cards, received ${cards?.length}`);
  }

  if (cards.length === 5) {
    return evaluateFiveCards(cards);
  }

  const n = cards.length;
  let best = null;
  const combo = new Array(5);

  for (let a = 0; a < n - 4; a++) {
    combo[0] = cards[a];
    for (let b = a + 1; b < n - 3; b++) {
      combo[1] = cards[b];
      for (let c = b + 1; c < n - 2; c++) {
        combo[2] = cards[c];
        for (let d = c + 1; d < n - 1; d++) {
          combo[3] = cards[d];
          for (let e = d + 1; e < n; e++) {
            combo[4] = cards[e];
            const res = evaluateFiveCards(combo);
            if (!best || res.score > best.score) {
              best = res;
            }
          }
        }
      }
    }
  }

  return best;
}

/**
 * 比较两个牌型评估结果
 * @returns {number} 1 表示 a 胜，-1 表示 b 胜，0 表示平局
 */
export function compareEvaluations(a, b) {
  if (a.score > b.score) return 1;
  if (a.score < b.score) return -1;
  return 0;
}
