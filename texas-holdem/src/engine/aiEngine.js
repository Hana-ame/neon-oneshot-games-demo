/**
 * aiEngine.js - 多风格德州扑克 AI 决策与蒙特卡洛胜率评估引擎
 * 支持 5 种风格画像：TAG(紧凶)、LAG(松凶)、ROCK(岩石)、CALLING_STATION(跟注站)、BALANCED(均衡)
 */

import { createDeck, shuffleDeck } from './cards.js';
import { evaluateBestHand } from './evaluator.js';

export const AI_PROFILES = {
  TAG: {
    name: '紧凶型 (TAG)',
    tightness: 0.56,
    aggression: 0.72,
    bluffFreq: 0.14,
    callTolerance: 0.04,
  },
  LAG: {
    name: '松凶型 (LAG)',
    tightness: 0.36,
    aggression: 0.85,
    bluffFreq: 0.28,
    callTolerance: 0.08,
  },
  ROCK: {
    name: '稳健岩石 (Rock)',
    tightness: 0.68,
    aggression: 0.42,
    bluffFreq: 0.05,
    callTolerance: 0.02,
  },
  CALLING_STATION: {
    name: '跟注达人 (Loose)',
    tightness: 0.32,
    aggression: 0.28,
    bluffFreq: 0.08,
    callTolerance: 0.16,
  },
  BALANCED: {
    name: '均衡大师 (Balanced)',
    tightness: 0.48,
    aggression: 0.64,
    bluffFreq: 0.16,
    callTolerance: 0.06,
  },
};

/**
 * 基于改良 Chen 公式计算翻牌前起手牌强度，归一化至 [0, 1]
 * @param {Array<{rank: number, suit: string}>} holeCards
 * @returns {number}
 */
export function evaluatePreflopStrength(holeCards) {
  if (!holeCards || holeCards.length !== 2) return 0.3;
  const [c1, c2] = holeCards[0].rank >= holeCards[1].rank
    ? [holeCards[0], holeCards[1]]
    : [holeCards[1], holeCards[0]];

  const r1 = c1.rank;
  const r2 = c2.rank;
  const suited = c1.suit === c2.suit;
  const isPair = r1 === r2;
  const gap = r1 - r2;

  // 基础分值映射
  const baseScores = {
    14: 10,
    13: 8,
    12: 7,
    11: 6,
    10: 5,
    9: 4.5,
    8: 4,
    7: 3.5,
    6: 3,
    5: 2.5,
    4: 2,
    3: 1.5,
    2: 1,
  };

  let score = baseScores[r1] || 1;
  if (isPair) {
    score = Math.max(5, score * 2);
  }
  if (suited) {
    score += 2;
  }
  if (!isPair) {
    if (gap === 1) score += 0;
    else if (gap === 2) score -= 1;
    else if (gap === 3) score -= 2;
    else if (gap === 4) score -= 4;
    else score -= 5;

    // 连张小牌顺子潜力奖励
    if (gap <= 2 && r1 < 12) {
      score += 1;
    }
  }

  // 归一化到 [0.05, 0.99]
  const normalized = (score + 4) / 24;
  return Math.max(0.05, Math.min(0.99, normalized));
}

/**
 * 蒙特卡洛模拟估算当前手牌对阵 N 名未知对手的胜率 (Equity)
 * @param {Array} holeCards 2张底牌
 * @param {Array} communityCards 0/3/4/5张公共牌
 * @param {number} [numOpponents=1]
 * @param {number} [iterations=120]
 * @param {Function} [rng=Math.random]
 * @returns {number} 0..1 胜率
 */
export function estimateEquity(
  holeCards,
  communityCards,
  numOpponents = 1,
  iterations = 120,
  rng = Math.random
) {
  if (!holeCards || holeCards.length !== 2) return 0.5;
  const opps = Math.max(1, Math.min(8, numOpponents));

  const knownIds = new Set([...holeCards, ...communityCards].map((c) => c.id));
  const remainingDeck = createDeck().filter((c) => !knownIds.has(c.id));
  const missingBoard = 5 - communityCards.length;

  let wins = 0;
  let ties = 0;

  for (let i = 0; i < iterations; i++) {
    const shuffled = shuffleDeck(remainingDeck, rng);
    let cursor = 0;
    const simBoard = communityCards.slice();
    for (let b = 0; b < missingBoard; b++) {
      simBoard.push(shuffled[cursor++]);
    }

    const myEval = evaluateBestHand([...holeCards, ...simBoard]);
    let beaten = false;
    let tied = false;

    for (let o = 0; o < opps; o++) {
      const oppHole = [shuffled[cursor++], shuffled[cursor++]];
      const oppEval = evaluateBestHand([...oppHole, ...simBoard]);
      if (oppEval.score > myEval.score) {
        beaten = true;
        break;
      } else if (oppEval.score === myEval.score) {
        tied = true;
      }
    }

    if (!beaten) {
      if (tied) ties += 1;
      else wins += 1;
    }
  }

  return (wins + ties * 0.5) / iterations;
}

/**
 * 为当前 AI 玩家计算最佳合法行动
 * @param {Object} state engine.getState() 返回的牌局快照
 * @param {Object} player 当前 AI 玩家对象
 * @param {Object} legalActions engine.getLegalActions()
 * @param {Function} [rng=Math.random]
 * @returns {{ action: string, amount?: number, equity: number, reason: string }}
 */
export function decideAIAction(state, player, legalActions, rng = Math.random) {
  const profile = AI_PROFILES[player.aiStyle] || AI_PROFILES.BALANCED;
  const activeOpponents = state.players.filter(
    (p) => !p.folded && !p.eliminated && p.id !== player.id
  ).length;

  // 估算胜率：翻牌前采用快速 Chen 强度 + 位置微调；翻牌后采用蒙特卡洛模拟
  let equity;
  if (state.communityCards.length === 0) {
    const preStrength = evaluatePreflopStrength(player.holeCards);
    // 对手越多，同等起手牌胜率略微折减
    equity = Math.max(0.1, preStrength - (activeOpponents - 1) * 0.035);
  } else {
    equity = estimateEquity(
      player.holeCards,
      state.communityCards,
      activeOpponents,
      100,
      rng
    );
  }

  const pot = Math.max(1, legalActions.potTotal);
  const toCall = legalActions.toCall;
  const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;
  const noise = (rng() - 0.5) * 0.08;
  const perceivedEquity = Math.max(0.01, Math.min(0.99, equity + noise));

  // 辅助函数：构造合法的加注/下注额度
  const buildRaiseAmount = (potRatio) => {
    if (!legalActions.canRaise) return 0;
    const raw = legalActions.isBet
      ? Math.round(pot * potRatio)
      : state.currentBet + Math.round(pot * potRatio);
    const clamped = Math.max(
      legalActions.minRaiseTo,
      Math.min(legalActions.maxRaiseTo, raw)
    );
    // 筹码极少时直接全下
    if (legalActions.maxRaiseTo - clamped < state.bigBlind) {
      return legalActions.maxRaiseTo;
    }
    return clamped;
  };

  // 情况 1：无需跟注（可以过牌）
  if (legalActions.canCheck) {
    // 强牌价值下注
    if (perceivedEquity >= 0.62 && legalActions.canRaise && rng() < profile.aggression + 0.15) {
      const ratio = perceivedEquity > 0.8 ? 0.75 : 0.5;
      const target = buildRaiseAmount(ratio);
      return {
        action: legalActions.isBet ? 'bet' : 'raise',
        amount: target,
        equity,
        reason: '强牌价值下注',
      };
    }

    // 适度诈唬下注
    if (legalActions.canRaise && rng() < profile.bluffFreq && state.communityCards.length >= 3) {
      const target = buildRaiseAmount(0.45);
      return {
        action: legalActions.isBet ? 'bet' : 'raise',
        amount: target,
        equity,
        reason: '试探性下注/半诈唬',
      };
    }

    return { action: 'check', equity, reason: '控池过牌' };
  }

  // 情况 2：面对下注，需要决定弃牌 / 跟注 / 加注
  const requiredEquity = Math.max(
    potOdds - profile.callTolerance,
    state.communityCards.length === 0 ? profile.tightness * 0.55 : potOdds - profile.callTolerance
  );

  // 极强牌 -> 价值加注或全下
  if (perceivedEquity >= 0.72 && legalActions.canRaise && rng() < profile.aggression) {
    const ratio = perceivedEquity > 0.86 ? 0.9 : 0.6;
    const target = buildRaiseAmount(ratio);
    if (target >= legalActions.maxRaiseTo) {
      return { action: 'allin', equity, reason: '超强牌全下价值' };
    }
    return { action: 'raise', amount: target, equity, reason: '强牌反加注' };
  }

  // 胜率满足底池赔率 -> 跟注（偶尔反加诈唬）
  if (perceivedEquity >= requiredEquity) {
    if (
      legalActions.canRaise &&
      perceivedEquity > 0.55 &&
      rng() < profile.bluffFreq * 0.5
    ) {
      const target = buildRaiseAmount(0.55);
      return { action: 'raise', amount: target, equity, reason: '积极加注施压' };
    }
    return { action: 'call', equity, reason: '符合底池赔率跟注' };
  }

  // 偶尔用纯诈唬反加偷池（仅在筹码充裕且面对不大下注时）
  if (
    legalActions.canRaise &&
    toCall <= pot * 0.6 &&
    rng() < profile.bluffFreq * 0.35
  ) {
    const target = buildRaiseAmount(0.6);
    return { action: 'raise', amount: target, equity, reason: '诈唬偷池' };
  }

  return { action: 'fold', equity, reason: '赔率不足弃牌' };
}
