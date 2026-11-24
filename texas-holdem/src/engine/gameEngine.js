/**
 * gameEngine.js - 无限注德州扑克 (No-Limit Texas Hold'em) 核心状态机
 * 完整实现：盲注轮转、单挑(Heads-Up)特殊规则、最小加注增量、不完整All-in不重开行动权、
 * 多级边池结算、全下自动发牌、行动日志与合法动作校验。
 */

import { createDeck, shuffleDeck, formatCard } from './cards.js';
import { evaluateBestHand } from './evaluator.js';
import { calculateSidePots, distributePots } from './potManager.js';

export const PHASE = {
  IDLE: 'IDLE',
  PREFLOP: 'PREFLOP',
  FLOP: 'FLOP',
  TURN: 'TURN',
  RIVER: 'RIVER',
  SHOWDOWN: 'SHOWDOWN',
  GAME_OVER: 'GAME_OVER',
};

export const PHASE_LABELS = {
  IDLE: '准备就绪',
  PREFLOP: '翻牌前 (Pre-Flop)',
  FLOP: '翻牌圈 (Flop)',
  TURN: '转牌圈 (Turn)',
  RIVER: '河牌圈 (River)',
  SHOWDOWN: '摊牌结算 (Showdown)',
  GAME_OVER: '牌局结束',
};

export class TexasHoldemEngine {
  /**
   * @param {Object} options
   * @param {Array<{id: string, name: string, isHuman: boolean, aiStyle?: string, avatar?: string}>} options.players
   * @param {number} [options.startingChips=2000]
   * @param {number} [options.smallBlind=10]
   * @param {number} [options.bigBlind=20]
   * @param {Function} [options.rng=Math.random]
   */
  constructor({
    players,
    startingChips = 2000,
    smallBlind = 10,
    bigBlind = 20,
    rng = Math.random,
  }) {
    if (!players || players.length < 2 || players.length > 9) {
      throw new Error('Texas Holdem requires between 2 and 9 players');
    }
    this.startingChips = startingChips;
    this.smallBlind = smallBlind;
    this.bigBlind = bigBlind;
    this.rng = rng;

    this.players = players.map((p, idx) => ({
      id: p.id,
      name: p.name,
      seatIndex: idx,
      isHuman: Boolean(p.isHuman),
      aiStyle: p.aiStyle || 'BALANCED',
      avatar: p.avatar || '🃏',
      chips: p.chips ?? startingChips,
      holeCards: [],
      folded: false,
      allIn: false,
      eliminated: false,
      currentBet: 0,
      totalContribution: 0,
      hasActedThisRound: false,
      lastAction: null,
    }));

    this.handNumber = 0;
    this.dealerIndex = -1;
    this.smallBlindIndex = -1;
    this.bigBlindIndex = -1;
    this.activePlayerIndex = -1;

    this.phase = PHASE.IDLE;
    this.deck = [];
    this.communityCards = [];
    this.currentBet = 0;
    this.minRaiseDelta = this.bigBlind;
    this.lastAggressorIndex = -1;

    this.logs = [];
    this.lastShowdown = null;
  }

  /**
   * 获取仍拥有筹码的活跃玩家索引列表
   */
  getAliveSeatIndices() {
    return this.players
      .filter((p) => !p.eliminated && p.chips > 0)
      .map((p) => p.seatIndex);
  }

  /**
   * 顺时针查找从 startIndex 之后的下一个满足条件的座位索引
   */
  findNextSeat(startIndex, predicate) {
    const n = this.players.length;
    for (let step = 1; step <= n; step++) {
      const idx = (startIndex + step) % n;
      if (predicate(this.players[idx])) {
        return idx;
      }
    }
    return -1;
  }

  /**
   * 开始新一手牌
   * @param {Array} [customDeck] 测试时可传入自定义牌组（从末尾 pop 发牌，或按顺序）
   */
  startHand(customDeck = null) {
    // 标记筹码为 0 的玩家为淘汰
    for (const p of this.players) {
      if (p.chips <= 0) {
        p.eliminated = true;
      }
    }

    const alive = this.getAliveSeatIndices();
    if (alive.length < 2) {
      this.phase = PHASE.GAME_OVER;
      this.activePlayerIndex = -1;
      return this.getState();
    }

    this.handNumber += 1;
    this.lastShowdown = null;
    this.communityCards = [];
    this.currentBet = 0;
    this.minRaiseDelta = this.bigBlind;
    this.lastAggressorIndex = -1;

    // 准备牌组
    if (customDeck) {
      this.deck = customDeck.slice().reverse(); // pop() 按 customDeck[0], [1]... 顺序发出
    } else {
      this.deck = shuffleDeck(createDeck(), this.rng);
    }

    // 重置玩家本局状态
    for (const p of this.players) {
      p.holeCards = [];
      p.folded = p.eliminated;
      p.allIn = false;
      p.currentBet = 0;
      p.totalContribution = 0;
      p.hasActedThisRound = false;
      p.lastAction = null;
    }

    // 轮转庄家位 (Button)
    if (this.dealerIndex === -1) {
      this.dealerIndex = alive[0];
    } else {
      this.dealerIndex = this.findNextSeat(this.dealerIndex, (p) => !p.eliminated);
    }

    // 确定小盲与大盲（2人单挑时庄家为小盲）
    if (alive.length === 2) {
      this.smallBlindIndex = this.dealerIndex;
      this.bigBlindIndex = this.findNextSeat(this.dealerIndex, (p) => !p.eliminated);
    } else {
      this.smallBlindIndex = this.findNextSeat(this.dealerIndex, (p) => !p.eliminated);
      this.bigBlindIndex = this.findNextSeat(this.smallBlindIndex, (p) => !p.eliminated);
    }

    this.addLog(`=== 第 ${this.handNumber} 手牌开始 ===`);

    // 收取盲注
    this._postBlind(this.smallBlindIndex, this.smallBlind, '小盲注');
    this._postBlind(this.bigBlindIndex, this.bigBlind, '大盲注');
    this.currentBet = Math.max(
      this.players[this.smallBlindIndex].currentBet,
      this.players[this.bigBlindIndex].currentBet
    );

    // 顺时针发底牌（每人2张）
    for (let round = 0; round < 2; round++) {
      let seat = this.smallBlindIndex;
      for (let i = 0; i < alive.length; i++) {
        this.players[seat].holeCards.push(this.deck.pop());
        seat = this.findNextSeat(seat, (p) => !p.eliminated);
      }
    }

    this.phase = PHASE.PREFLOP;

    // 翻牌前首个行动者：2人局为庄家(小盲)，多人局为大盲左侧(UTG)
    const firstActor =
      alive.length === 2
        ? this.smallBlindIndex
        : this.findNextSeat(this.bigBlindIndex, (p) => !p.eliminated);

    this.activePlayerIndex = this._findNextActionableFrom(firstActor, true);

    // 如果所有人都因盲注直接 All-in，直接跑完公共牌并摊牌
    if (this.activePlayerIndex === -1 || this._shouldAutoRunout()) {
      this._runoutToShowdown();
    }

    return this.getState();
  }

  _postBlind(seatIndex, amount, label) {
    const p = this.players[seatIndex];
    const actual = Math.min(p.chips, amount);
    p.chips -= actual;
    p.currentBet += actual;
    p.totalContribution += actual;
    if (p.chips === 0) {
      p.allIn = true;
    }
    p.lastAction = `${label} ${actual}`;
    this.addLog(`${p.name} 下${label} ${actual}${p.allIn ? ' (All-in)' : ''}`);
  }

  /**
   * 获取当前行动玩家的合法动作及下注范围
   */
  getLegalActions(seatIndex = this.activePlayerIndex) {
    if (
      seatIndex < 0 ||
      this.phase === PHASE.IDLE ||
      this.phase === PHASE.SHOWDOWN ||
      this.phase === PHASE.GAME_OVER
    ) {
      return null;
    }

    const p = this.players[seatIndex];
    if (!p || p.folded || p.allIn || p.eliminated) return null;

    const toCall = Math.max(0, this.currentBet - p.currentBet);
    const canCheck = toCall === 0;
    const canCall = toCall > 0 && p.chips > 0;
    const callAmount = Math.min(toCall, p.chips);

    // 判断是否允许加注（必须筹码大于跟注额，且未被“不完整All-in”锁死）
    // 标准规则：若当前下注额大于0，且玩家此前已行动过、且本次增量不足最小加注额，则仅能跟注或弃牌
    const maxTotalBet = p.currentBet + p.chips;
    const minRaiseTotal = this.currentBet === 0
      ? this.bigBlind
      : this.currentBet + this.minRaiseDelta;

    const canRaise = p.chips > toCall;
    const minRaiseTo = Math.min(maxTotalBet, minRaiseTotal);

    return {
      playerId: p.id,
      seatIndex,
      canFold: true,
      canCheck,
      canCall,
      callAmount,
      toCall,
      canRaise,
      minRaiseTo,
      maxRaiseTo: maxTotalBet,
      isBet: this.currentBet === 0,
      potTotal: this.getTotalPot(),
    };
  }

  /**
   * 执行玩家动作
   * @param {string} playerId
   * @param {'fold'|'check'|'call'|'bet'|'raise'|'allin'} actionType
   * @param {number} [amount] 对于 bet/raise，表示本轮目标总下注额 (raiseTo)
   */
  performAction(playerId, actionType, amount = 0) {
    if (this.activePlayerIndex < 0) {
      throw new Error('No active player to act');
    }
    const p = this.players[this.activePlayerIndex];
    if (p.id !== playerId) {
      throw new Error(`Not ${playerId}'s turn (expected ${p.id})`);
    }

    const legal = this.getLegalActions(this.activePlayerIndex);
    if (!legal) {
      throw new Error('No legal actions available');
    }

    switch (actionType) {
      case 'fold': {
        p.folded = true;
        p.hasActedThisRound = true;
        p.lastAction = '弃牌';
        this.addLog(`${p.name} 弃牌`);
        break;
      }

      case 'check': {
        if (!legal.canCheck) {
          throw new Error(`Cannot check when facing bet of ${legal.toCall}`);
        }
        p.hasActedThisRound = true;
        p.lastAction = '过牌';
        this.addLog(`${p.name} 过牌`);
        break;
      }

      case 'call': {
        if (!legal.canCall) {
          throw new Error('Cannot call when nothing to call');
        }
        const paid = legal.callAmount;
        p.chips -= paid;
        p.currentBet += paid;
        p.totalContribution += paid;
        p.hasActedThisRound = true;
        if (p.chips === 0) {
          p.allIn = true;
          p.lastAction = `All-in (${p.currentBet})`;
          this.addLog(`${p.name} 跟注 ${paid} (All-in)`);
        } else {
          p.lastAction = `跟注 ${paid}`;
          this.addLog(`${p.name} 跟注 ${paid}`);
        }
        break;
      }

      case 'bet':
      case 'raise': {
        if (!legal.canRaise) {
          throw new Error('Cannot bet or raise with insufficient chips');
        }
        const targetBet = Math.floor(amount);
        if (targetBet < legal.minRaiseTo || targetBet > legal.maxRaiseTo) {
          throw new Error(
            `Invalid ${actionType} target ${targetBet} (allowed ${legal.minRaiseTo}..${legal.maxRaiseTo})`
          );
        }
        const added = targetBet - p.currentBet;
        const prevBet = this.currentBet;
        const raiseDelta = targetBet - prevBet;

        p.chips -= added;
        p.currentBet = targetBet;
        p.totalContribution += added;
        p.hasActedThisRound = true;
        if (p.chips === 0) {
          p.allIn = true;
        }

        const isFullRaise = raiseDelta >= this.minRaiseDelta || prevBet === 0;
        if (targetBet > prevBet) {
          this.currentBet = targetBet;
          if (isFullRaise) {
            this.minRaiseDelta = Math.max(this.bigBlind, raiseDelta);
            this.lastAggressorIndex = this.activePlayerIndex;
            // 完整加注重开其他未弃牌、未All-in玩家的行动权
            for (const other of this.players) {
              if (other.id !== p.id && !other.folded && !other.allIn) {
                other.hasActedThisRound = false;
              }
            }
          }
        }

        const verb = prevBet === 0 ? '下注' : '加注至';
        p.lastAction = p.allIn ? `All-in (${targetBet})` : `${verb} ${targetBet}`;
        this.addLog(`${p.name} ${verb} ${targetBet}${p.allIn ? ' (All-in)' : ''}`);
        break;
      }

      case 'allin': {
        const targetBet = p.currentBet + p.chips;
        if (targetBet <= this.currentBet) {
          return this.performAction(playerId, 'call');
        }
        const added = p.chips;
        const prevBet = this.currentBet;
        const raiseDelta = targetBet - prevBet;

        p.chips = 0;
        p.currentBet = targetBet;
        p.totalContribution += added;
        p.allIn = true;
        p.hasActedThisRound = true;

        this.currentBet = targetBet;
        const isFullRaise = raiseDelta >= this.minRaiseDelta || prevBet === 0;
        if (isFullRaise) {
          this.minRaiseDelta = Math.max(this.bigBlind, raiseDelta);
          this.lastAggressorIndex = this.activePlayerIndex;
          for (const other of this.players) {
            if (other.id !== p.id && !other.folded && !other.allIn) {
              other.hasActedThisRound = false;
            }
          }
        }

        p.lastAction = `All-in (${targetBet})`;
        this.addLog(`${p.name} 全下 All-in (${targetBet})`);
        break;
      }

      default:
        throw new Error(`Unknown action type: ${actionType}`);
    }

    this._advanceTurnOrStreet();
    return this.getState();
  }

  _advanceTurnOrStreet() {
    const remaining = this.players.filter((p) => !p.folded && !p.eliminated);

    // 1. 仅剩一名未弃牌玩家 -> 立即不战而胜
    if (remaining.length === 1) {
      this._settleFoldWin(remaining[0]);
      return;
    }

    // 2. 寻找下一个还需要行动的玩家
    const nextIdx = this.findNextSeat(
      this.activePlayerIndex,
      (p) => !p.folded && !p.allIn && !p.eliminated && (!p.hasActedThisRound || p.currentBet < this.currentBet)
    );

    if (nextIdx !== -1) {
      this.activePlayerIndex = nextIdx;
      return;
    }

    // 3. 本轮下注结束 -> 若只剩 <= 1 人有剩余筹码，则自动跑完公共牌到摊牌
    if (this._shouldAutoRunout()) {
      this._runoutToShowdown();
      return;
    }

    // 4. 进入下一街道
    this._advanceStreet();
  }

  _shouldAutoRunout() {
    const remaining = this.players.filter((p) => !p.folded && !p.eliminated);
    if (remaining.length <= 1) return false;
    const canStillAct = remaining.filter((p) => !p.allIn);
    if (canStillAct.length <= 1) {
      // 确保唯一有筹码的玩家已经匹配了当前最高下注（无未跟注额）
      if (canStillAct.length === 1 && canStillAct[0].currentBet < this.currentBet) {
        return false;
      }
      return true;
    }
    return false;
  }

  _advanceStreet() {
    // 重置本轮下注字段
    for (const p of this.players) {
      p.currentBet = 0;
      p.hasActedThisRound = false;
      if (!p.folded && !p.allIn) {
        p.lastAction = null;
      }
    }
    this.currentBet = 0;
    this.minRaiseDelta = this.bigBlind;

    if (this.phase === PHASE.PREFLOP) {
      this.phase = PHASE.FLOP;
      this.communityCards.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
      this.addLog(
        `--- 翻牌圈: ${this.communityCards.map(formatCard).join(' ')} ---`
      );
    } else if (this.phase === PHASE.FLOP) {
      this.phase = PHASE.TURN;
      this.communityCards.push(this.deck.pop());
      this.addLog(`--- 转牌圈: ${formatCard(this.communityCards[3])} ---`);
    } else if (this.phase === PHASE.TURN) {
      this.phase = PHASE.RIVER;
      this.communityCards.push(this.deck.pop());
      this.addLog(`--- 河牌圈: ${formatCard(this.communityCards[4])} ---`);
    } else if (this.phase === PHASE.RIVER) {
      this._resolveShowdown();
      return;
    }

    // 翻牌后从庄家左侧第一个未弃牌、未All-in玩家开始行动
    this.activePlayerIndex = this.findNextSeat(
      this.dealerIndex,
      (p) => !p.folded && !p.allIn && !p.eliminated
    );

    if (this.activePlayerIndex === -1) {
      this._runoutToShowdown();
    }
  }

  _runoutToShowdown() {
    while (this.communityCards.length < 5) {
      if (this.communityCards.length === 0) {
        this.communityCards.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
        this.addLog(
          `--- 翻牌圈 (自动发牌): ${this.communityCards.map(formatCard).join(' ')} ---`
        );
      } else {
        const card = this.deck.pop();
        this.communityCards.push(card);
        const stage = this.communityCards.length === 4 ? '转牌圈' : '河牌圈';
        this.addLog(`--- ${stage} (自动发牌): ${formatCard(card)} ---`);
      }
    }
    this._resolveShowdown();
  }

  _settleFoldWin(winner) {
    const totalPot = this.getTotalPot();
    winner.chips += totalPot;
    this.phase = PHASE.SHOWDOWN;
    this.activePlayerIndex = -1;

    this.lastShowdown = {
      byFold: true,
      pots: [{ name: '主池', amount: totalPot, eligibleIds: [winner.id] }],
      payouts: { [winner.id]: totalPot },
      evaluations: {},
      potResults: [
        {
          potName: '主池',
          amount: totalPot,
          winners: [winner.id],
          distributions: [{ playerId: winner.id, amount: totalPot }],
        },
      ],
    };

    this.addLog(`${winner.name} 赢得底池 ${totalPot}（其余玩家弃牌）`);
    this._checkGameOver();
  }

  _resolveShowdown() {
    this.phase = PHASE.SHOWDOWN;
    this.activePlayerIndex = -1;

    const contenders = this.players.filter((p) => !p.folded && !p.eliminated);
    const evaluations = {};
    for (const p of contenders) {
      evaluations[p.id] = evaluateBestHand([...p.holeCards, ...this.communityCards]);
    }

    const pots = calculateSidePots(this.players);

    // 构造从小盲位起顺时针顺序（用于平分余数分配）
    const seatOrderFromSB = [];
    const n = this.players.length;
    const startIdx = this.smallBlindIndex >= 0 ? this.smallBlindIndex : 0;
    for (let i = 0; i < n; i++) {
      seatOrderFromSB.push(this.players[(startIdx + i) % n].id);
    }

    const { payouts, potResults } = distributePots(pots, evaluations, seatOrderFromSB);

    for (const [playerId, amount] of Object.entries(payouts)) {
      const p = this.players.find((pl) => pl.id === playerId);
      if (p) p.chips += amount;
    }

    for (const res of potResults) {
      const winnerStr = res.distributions
        .map((d) => {
          const p = this.players.find((pl) => pl.id === d.playerId);
          const ev = evaluations[d.playerId];
          return `${p.name}(+${d.amount}${ev ? `, ${ev.categoryNameZh}` : ''})`;
        })
        .join('、');
      this.addLog(`【${res.potName} ${res.amount}】由 ${winnerStr} 赢得`);
    }

    this.lastShowdown = {
      byFold: false,
      pots,
      payouts,
      evaluations,
      potResults,
    };

    this._checkGameOver();
  }

  _checkGameOver() {
    const withChips = this.players.filter((p) => p.chips > 0);
    if (withChips.length <= 1) {
      this.phase = PHASE.GAME_OVER;
    }
  }

  _findNextActionableFrom(startIdx, includeStart = false) {
    const n = this.players.length;
    const offset = includeStart ? 0 : 1;
    for (let i = offset; i < n + offset; i++) {
      const idx = (startIdx + i) % n;
      const p = this.players[idx];
      if (!p.folded && !p.allIn && !p.eliminated) {
        return idx;
      }
    }
    return -1;
  }

  getTotalPot() {
    return this.players.reduce((sum, p) => sum + p.totalContribution, 0);
  }

  getSidePots() {
    return calculateSidePots(this.players);
  }

  addLog(message) {
    this.logs.push({
      hand: this.handNumber,
      message,
      time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    });
    if (this.logs.length > 200) {
      this.logs.shift();
    }
  }

  /**
   * 获取当前完整牌局状态快照
   */
  getState() {
    return {
      handNumber: this.handNumber,
      phase: this.phase,
      phaseLabel: PHASE_LABELS[this.phase],
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      dealerIndex: this.dealerIndex,
      smallBlindIndex: this.smallBlindIndex,
      bigBlindIndex: this.bigBlindIndex,
      activePlayerIndex: this.activePlayerIndex,
      currentBet: this.currentBet,
      minRaiseDelta: this.minRaiseDelta,
      totalPot: this.getTotalPot(),
      sidePots: this.getSidePots(),
      communityCards: this.communityCards.slice(),
      players: this.players.map((p) => ({
        ...p,
        holeCards: p.holeCards.slice(),
      })),
      legalActions: this.getLegalActions(),
      lastShowdown: this.lastShowdown,
      logs: this.logs.slice(-40),
    };
  }
}
