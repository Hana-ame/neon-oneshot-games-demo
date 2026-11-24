/**
 * app.js - 网页德州扑克前端控制器与视图渲染器
 */

import { RANK_LABELS, SUIT_SYMBOLS, isRedSuit } from '../engine/cards.js';
import { evaluateBestHand } from '../engine/evaluator.js';
import { TexasHoldemEngine, PHASE } from '../engine/gameEngine.js';
import { AI_PROFILES, decideAIAction, estimateEquity, evaluatePreflopStrength } from '../engine/aiEngine.js';
import { SoundManager } from './sound.js';

const AI_ROSTER = [
  { id: 'ai_1', name: '艾琳 (紧凶)', aiStyle: 'TAG', avatar: '🦊' },
  { id: 'ai_2', name: '雷克 (松凶)', aiStyle: 'LAG', avatar: '🦁' },
  { id: 'ai_3', name: '巴克 (岩石)', aiStyle: 'ROCK', avatar: '🪨' },
  { id: 'ai_4', name: '小马 (跟注)', aiStyle: 'CALLING_STATION', avatar: '🐬' },
  { id: 'ai_5', name: '维拉 (均衡)', aiStyle: 'BALANCED', avatar: '🦉' },
];

const AI_DELAY_MAP = {
  fast: 360,
  normal: 720,
  slow: 1150,
};

export class PokerAppController {
  constructor() {
    this.sound = new SoundManager();
    this.aiTimer = null;
    this.settings = {
      playerCount: 6,
      startingChips: 2000,
      smallBlind: 10,
      bigBlind: 20,
      aiSpeed: 'normal',
      showEquity: true,
    };
    this.engine = null;
    this.currentRaiseValue = 40;
    this.heroEquity = null;

    this._cacheElements();
    this._bindEvents();
    this.startNewMatch();
  }

  _cacheElements() {
    this.el = {
      handMeta: document.getElementById('hand-meta'),
      opponentsRow: document.getElementById('opponents-row'),
      phaseBadge: document.getElementById('phase-badge'),
      potDisplay: document.getElementById('pot-display'),
      sidePotsBar: document.getElementById('side-pots-bar'),
      communityCards: document.getElementById('community-cards'),
      showdownBanner: document.getElementById('showdown-banner'),
      heroArea: document.getElementById('hero-area'),
      actionButtonsRow: document.getElementById('action-buttons-row'),
      raiseControlsRow: document.getElementById('raise-controls-row'),
      statusHint: document.getElementById('status-hint'),
      logDrawer: document.getElementById('log-drawer'),
      logList: document.getElementById('log-list'),
      btnEquity: document.getElementById('btn-toggle-equity'),
      btnSound: document.getElementById('btn-toggle-sound'),
      btnLog: document.getElementById('btn-toggle-log'),
      btnCloseLog: document.getElementById('btn-close-log'),
      btnRules: document.getElementById('btn-open-rules'),
      btnSettings: document.getElementById('btn-open-settings'),
      rulesModal: document.getElementById('rules-modal'),
      btnCloseRules: document.getElementById('btn-close-rules'),
      settingsModal: document.getElementById('settings-modal'),
      btnCloseSettings: document.getElementById('btn-close-settings'),
      btnApplySettings: document.getElementById('btn-apply-settings'),
      selectPlayers: document.getElementById('setting-players'),
      selectChips: document.getElementById('setting-chips'),
      selectBlinds: document.getElementById('setting-blinds'),
      selectSpeed: document.getElementById('setting-speed'),
    };
  }

  _bindEvents() {
    this.el.btnEquity.addEventListener('click', () => {
      this.settings.showEquity = !this.settings.showEquity;
      this.el.btnEquity.classList.toggle('active', this.settings.showEquity);
      this.render();
    });

    this.el.btnSound.addEventListener('click', () => {
      const muted = this.sound.toggleMute();
      this.el.btnSound.textContent = muted ? '🔇 静音' : '🔊 音效';
      this.el.btnSound.classList.toggle('active', !muted);
    });

    this.el.btnLog.addEventListener('click', () => {
      this.el.logDrawer.classList.toggle('open');
    });

    this.el.btnCloseLog.addEventListener('click', () => {
      this.el.logDrawer.classList.remove('open');
    });

    this.el.btnRules.addEventListener('click', () => {
      this.el.rulesModal.classList.add('open');
    });
    this.el.btnCloseRules.addEventListener('click', () => {
      this.el.rulesModal.classList.remove('open');
    });
    this.el.rulesModal.addEventListener('click', (e) => {
      if (e.target === this.el.rulesModal) this.el.rulesModal.classList.remove('open');
    });

    this.el.btnSettings.addEventListener('click', () => {
      this.el.selectPlayers.value = String(this.settings.playerCount);
      this.el.selectChips.value = String(this.settings.startingChips);
      this.el.selectBlinds.value = `${this.settings.smallBlind}/${this.settings.bigBlind}`;
      this.el.selectSpeed.value = this.settings.aiSpeed;
      this.el.settingsModal.classList.add('open');
    });
    this.el.btnCloseSettings.addEventListener('click', () => {
      this.el.settingsModal.classList.remove('open');
    });
    this.el.settingsModal.addEventListener('click', (e) => {
      if (e.target === this.el.settingsModal) this.el.settingsModal.classList.remove('open');
    });

    this.el.btnApplySettings.addEventListener('click', () => {
      const [sb, bb] = this.el.selectBlinds.value.split('/').map(Number);
      this.settings.playerCount = Number(this.el.selectPlayers.value);
      this.settings.startingChips = Number(this.el.selectChips.value);
      this.settings.smallBlind = sb;
      this.settings.bigBlind = bb;
      this.settings.aiSpeed = this.el.selectSpeed.value;
      this.el.settingsModal.classList.remove('open');
      this.startNewMatch();
    });

    // 快捷键支持
    window.addEventListener('keydown', (e) => {
      if (
        this.el.rulesModal.classList.contains('open') ||
        this.el.settingsModal.classList.contains('open')
      ) {
        if (e.key === 'Escape') {
          this.el.rulesModal.classList.remove('open');
          this.el.settingsModal.classList.remove('open');
        }
        return;
      }

      const state = this.engine?.getState();
      if (!state) return;

      if (e.code === 'Space' && (state.phase === PHASE.SHOWDOWN || state.phase === PHASE.GAME_OVER)) {
        e.preventDefault();
        this.handleNextOrRestart();
        return;
      }

      const active = state.players[state.activePlayerIndex];
      if (!active || !active.isHuman || !state.legalActions) return;

      const key = e.key.toLowerCase();
      if (key === 'f') {
        this.handleHumanAction('fold');
      } else if (key === 'c') {
        this.handleHumanAction(state.legalActions.canCheck ? 'check' : 'call');
      } else if (key === 'r' && state.legalActions.canRaise) {
        this.handleHumanAction(state.legalActions.isBet ? 'bet' : 'raise', this.currentRaiseValue);
      } else if (key === 'a') {
        this.handleHumanAction('allin');
      }
    });
  }

  _clearAITimer() {
    if (this.aiTimer) {
      clearTimeout(this.aiTimer);
      this.aiTimer = null;
    }
  }

  startNewMatch() {
    this._clearAITimer();
    const aiCount = Math.max(1, Math.min(5, this.settings.playerCount - 1));
    const players = [
      { id: 'hero', name: '你 (玩家)', isHuman: true, avatar: '😎' },
      ...AI_ROSTER.slice(0, aiCount).map((ai) => ({ ...ai, isHuman: false })),
    ];

    this.engine = new TexasHoldemEngine({
      players,
      startingChips: this.settings.startingChips,
      smallBlind: this.settings.smallBlind,
      bigBlind: this.settings.bigBlind,
    });

    this.startNextHand();
  }

  startNextHand() {
    this._clearAITimer();
    const state = this.engine.startHand();
    this.sound.playDeal();
    this._updateHeroEquity(state);
    this._syncDefaultRaise(state);
    this.render();
    this._scheduleAIIfNeeded();
  }

  handleNextOrRestart() {
    const state = this.engine.getState();
    const hero = state.players.find((p) => p.isHuman);
    if (state.phase === PHASE.GAME_OVER || !hero || hero.chips <= 0) {
      this.startNewMatch();
    } else {
      this.startNextHand();
    }
  }

  handleHumanAction(actionType, amount = 0) {
    const state = this.engine.getState();
    const active = state.players[state.activePlayerIndex];
    if (!active || !active.isHuman) return;

    try {
      this.engine.performAction(active.id, actionType, amount);
      this._playSoundForAction(actionType);
      const nextState = this.engine.getState();
      this._updateHeroEquity(nextState);
      this._syncDefaultRaise(nextState);
      if (nextState.phase === PHASE.SHOWDOWN || nextState.phase === PHASE.GAME_OVER) {
        if (nextState.lastShowdown?.payouts?.hero > 0) {
          this.sound.playWin();
        }
      }
      this.render();
      this._scheduleAIIfNeeded();
    } catch (err) {
      this.el.statusHint.textContent = `操作提示: ${err.message}`;
    }
  }

  _playSoundForAction(actionType) {
    if (actionType === 'fold') this.sound.playFold();
    else if (actionType === 'check') this.sound.playCheck();
    else if (actionType === 'allin') this.sound.playAllIn();
    else this.sound.playChip();
  }

  _scheduleAIIfNeeded() {
    this._clearAITimer();
    const state = this.engine.getState();
    if (
      state.phase === PHASE.SHOWDOWN ||
      state.phase === PHASE.GAME_OVER ||
      state.activePlayerIndex < 0
    ) {
      return;
    }

    const active = state.players[state.activePlayerIndex];
    if (!active || active.isHuman) return;

    const delay = AI_DELAY_MAP[this.settings.aiSpeed] || 700;
    this.aiTimer = setTimeout(() => {
      const currentState = this.engine.getState();
      const currentActive = currentState.players[currentState.activePlayerIndex];
      if (!currentActive || currentActive.isHuman || !currentState.legalActions) return;

      const decision = decideAIAction(currentState, currentActive, currentState.legalActions);
      this.engine.performAction(currentActive.id, decision.action, decision.amount || 0);
      this._playSoundForAction(decision.action);

      const updated = this.engine.getState();
      this._updateHeroEquity(updated);
      this._syncDefaultRaise(updated);
      if (
        (updated.phase === PHASE.SHOWDOWN || updated.phase === PHASE.GAME_OVER) &&
        updated.lastShowdown?.payouts?.hero > 0
      ) {
        this.sound.playWin();
      }
      this.render();
      this._scheduleAIIfNeeded();
    }, delay);
  }

  _syncDefaultRaise(state) {
    if (state.legalActions && state.legalActions.canRaise) {
      this.currentRaiseValue = state.legalActions.minRaiseTo;
    }
  }

  _updateHeroEquity(state) {
    const hero = state.players.find((p) => p.isHuman);
    if (!hero || hero.folded || hero.holeCards.length !== 2) {
      this.heroEquity = null;
      return;
    }
    const opps = state.players.filter((p) => !p.folded && !p.eliminated && !p.isHuman).length;
    if (opps === 0) {
      this.heroEquity = 1;
      return;
    }
    if (state.communityCards.length === 0) {
      this.heroEquity = Math.max(0.08, evaluatePreflopStrength(hero.holeCards) - (opps - 1) * 0.04);
    } else {
      this.heroEquity = estimateEquity(hero.holeCards, state.communityCards, opps, 120);
    }
  }

  _renderCardHtml(card, { hidden = false, extraClass = '', highlight = false } = {}) {
    if (hidden || !card) {
      return `<div class="card back ${extraClass}"></div>`;
    }
    const redClass = isRedSuit(card.suit) ? 'red' : '';
    const winClass = highlight ? 'winner-card' : '';
    const rankStr = RANK_LABELS[card.rank];
    const suitStr = SUIT_SYMBOLS[card.suit];
    return `
      <div class="card ${redClass} ${extraClass} ${winClass}">
        <div class="card-corner">
          <span>${rankStr}</span>
          <span>${suitStr}</span>
        </div>
        <div class="card-center">${suitStr}</div>
      </div>
    `;
  }

  render() {
    const state = this.engine.getState();
    const isShowdown = state.phase === PHASE.SHOWDOWN || state.phase === PHASE.GAME_OVER;
    const winnerIds = new Set(Object.keys(state.lastShowdown?.payouts || {}));

    // 收集赢家最佳 5 张牌 ID 用于高亮
    const winningCardIds = new Set();
    if (isShowdown && state.lastShowdown && !state.lastShowdown.byFold) {
      for (const wid of winnerIds) {
        const ev = state.lastShowdown.evaluations[wid];
        if (ev?.bestFive) {
          ev.bestFive.forEach((c) => winningCardIds.add(c.id));
        }
      }
    }

    // 1. 顶部信息
    this.el.handMeta.textContent = `第 ${state.handNumber} 手 · 盲注 ${state.smallBlind}/${state.bigBlind}`;
    this.el.phaseBadge.textContent = state.phaseLabel;
    this.el.potDisplay.textContent = `🪙 总底池: ${state.totalPot}`;

    // 2. 边池展示
    const hasActiveAllIn = state.players.some((p) => !p.folded && p.allIn);
    if (state.sidePots.length > 1 && hasActiveAllIn) {
      this.el.sidePotsBar.innerHTML = state.sidePots
        .map((sp) => `<span class="side-pot-chip">${sp.name}: ${sp.amount}</span>`)
        .join('');
    } else {
      this.el.sidePotsBar.innerHTML = '';
    }

    // 3. 公共牌
    let boardHtml = '';
    for (let i = 0; i < 5; i++) {
      const card = state.communityCards[i];
      if (card) {
        boardHtml += this._renderCardHtml(card, {
          highlight: winningCardIds.has(card.id),
        });
      } else {
        boardHtml += `<div class="card-slot"></div>`;
      }
    }
    this.el.communityCards.innerHTML = boardHtml;

    // 4. 摊牌结果横幅
    if (isShowdown && state.lastShowdown) {
      const summaryParts = state.lastShowdown.potResults.map((pr) => {
        const names = pr.distributions
          .map((d) => {
            const p = state.players.find((pl) => pl.id === d.playerId);
            const ev = state.lastShowdown.evaluations[d.playerId];
            return `${p.name} +${d.amount}${ev ? ` (${ev.categoryNameZh})` : ''}`;
          })
          .join(' / ');
        return `${pr.potName}: ${names}`;
      });
      this.el.showdownBanner.style.display = 'block';
      this.el.showdownBanner.textContent = summaryParts.join('  |  ');
    } else {
      this.el.showdownBanner.style.display = 'none';
    }

    // 5. 对手座位
    const opponents = state.players.filter((p) => !p.isHuman);
    this.el.opponentsRow.innerHTML = opponents
      .map((p) => {
        const isTurn = state.activePlayerIndex === p.seatIndex;
        const isWinner = isShowdown && winnerIds.has(p.id);
        const revealCards = isShowdown && !p.folded && !state.lastShowdown?.byFold && p.holeCards.length === 2;

        const badges = [];
        if (state.dealerIndex === p.seatIndex) badges.push('<span class="role-pill dealer">D</span>');
        if (state.smallBlindIndex === p.seatIndex) badges.push('<span class="role-pill sb">SB</span>');
        if (state.bigBlindIndex === p.seatIndex) badges.push('<span class="role-pill bb">BB</span>');

        const cardsHtml = p.eliminated
          ? ''
          : p.holeCards.length === 2
          ? p.holeCards
              .map((c) =>
                this._renderCardHtml(c, {
                  hidden: !revealCards,
                  extraClass: 'mini',
                  highlight: revealCards && winningCardIds.has(c.id),
                })
              )
              .join('')
          : '';

        let statusText = p.eliminated
          ? '已淘汰'
          : isTurn
          ? '思考中...'
          : isWinner
          ? `获胜 +${state.lastShowdown.payouts[p.id]}`
          : p.lastAction || '等待行动';

        if (revealCards && state.lastShowdown?.evaluations[p.id]) {
          statusText = `${state.lastShowdown.evaluations[p.id].categoryNameZh}${isWinner ? ` (+${state.lastShowdown.payouts[p.id]})` : ''}`;
        }

        const tagClass = isWinner ? 'win-tag' : isTurn ? 'thinking' : '';
        const profileName = AI_PROFILES[p.aiStyle]?.name || p.aiStyle;

        return `
          <div class="seat-card ${isTurn ? 'active-turn' : ''} ${p.folded ? 'folded' : ''} ${p.eliminated ? 'eliminated' : ''} ${isWinner ? 'winner-seat' : ''}">
            <div class="seat-top">
              <div class="seat-name-wrap">
                <span class="seat-avatar">${p.avatar}</span>
                <div>
                  <div class="seat-name">${p.name}</div>
                  <div class="seat-style">${profileName}</div>
                </div>
              </div>
              <div class="seat-badges">${badges.join('')}</div>
            </div>
            <div class="seat-middle">
              <div class="seat-cards">${cardsHtml}</div>
              <div class="seat-info-right">
                <div class="chip-stack">🪙 ${p.chips}</div>
                ${p.currentBet > 0 ? `<div class="bet-pill">下注 ${p.currentBet}</div>` : ''}
              </div>
            </div>
            <div class="action-tag ${tagClass}">${statusText}</div>
          </div>
        `;
      })
      .join('');

    // 6. 主角座位
    const hero = state.players.find((p) => p.isHuman);
    const isHeroTurn = state.activePlayerIndex === hero.seatIndex;
    const isHeroWinner = isShowdown && winnerIds.has(hero.id);

    const heroBadges = [];
    if (state.dealerIndex === hero.seatIndex) heroBadges.push('<span class="role-pill dealer">D</span>');
    if (state.smallBlindIndex === hero.seatIndex) heroBadges.push('<span class="role-pill sb">SB</span>');
    if (state.bigBlindIndex === hero.seatIndex) heroBadges.push('<span class="role-pill bb">BB</span>');

    let heroHandRankStr = '';
    if (!hero.folded && hero.holeCards.length === 2 && state.communityCards.length >= 3) {
      const ev = evaluateBestHand([...hero.holeCards, ...state.communityCards]);
      heroHandRankStr = `当前最佳牌型: ${ev.categoryNameZh}`;
    } else if (!hero.folded && hero.holeCards.length === 2) {
      heroHandRankStr = '底牌已发，等待翻牌';
    } else if (hero.folded) {
      heroHandRankStr = '本手已弃牌';
    }

    const eqPct = this.heroEquity !== null ? Math.round(this.heroEquity * 100) : null;
    const equityHtml =
      this.settings.showEquity && eqPct !== null && !isShowdown
        ? `
        <div class="equity-bar-wrap">
          <span>胜率参考 ${eqPct}%</span>
          <div class="equity-track"><div class="equity-fill" style="width:${eqPct}%"></div></div>
        </div>`
        : '';

    const heroCardsHtml = hero.holeCards
      .map((c) =>
        this._renderCardHtml(c, {
          extraClass: 'hero-card',
          highlight: isShowdown && winningCardIds.has(c.id),
        })
      )
      .join('');

    this.el.heroArea.innerHTML = `
      <div class="hero-card-panel ${isHeroTurn ? 'active-turn' : ''} ${hero.folded ? 'folded' : ''} ${isHeroWinner ? 'winner-seat' : ''}">
        <div class="seat-cards">${heroCardsHtml}</div>
        <div class="hero-details">
          <div class="seat-top">
            <div class="seat-name-wrap">
              <span class="seat-avatar">${hero.avatar}</span>
              <span class="seat-name">${hero.name}</span>
            </div>
            <div class="seat-badges">${heroBadges.join('')}</div>
          </div>
          <div class="chip-stack">🪙 ${hero.chips} ${hero.currentBet > 0 ? `<span class="bet-pill">本轮已下 ${hero.currentBet}</span>` : ''}</div>
          <div class="hero-hand-rank">${heroHandRankStr}</div>
          ${equityHtml}
        </div>
      </div>
    `;

    // 7. 底部操作栏
    this._renderControls(state, hero, isHeroTurn, isShowdown);

    // 8. 日志抽屉
    this.el.logList.innerHTML = state.logs
      .slice()
      .reverse()
      .map((item) => {
        const hl = item.message.startsWith('===') || item.message.startsWith('【') ? 'highlight' : '';
        return `<div class="log-item ${hl}">[${item.time}] ${item.message}</div>`;
      })
      .join('');
  }

  _renderControls(state, hero, isHeroTurn, isShowdown) {
    if (isShowdown) {
      const heroBusted = hero.chips <= 0;
      const heroWonTournament = state.phase === PHASE.GAME_OVER && hero.chips > 0;
      const btnText = heroWonTournament
        ? '🏆 夺冠！再来一局 (Space)'
        : heroBusted
        ? '🔄 筹码耗尽，重新开局 (Space)'
        : '▶ 下一手牌 (Space)';

      this.el.actionButtonsRow.innerHTML = `<button id="btn-next-hand" class="btn-action btn-next">${btnText}</button>`;
      this.el.raiseControlsRow.innerHTML = '';
      this.el.statusHint.textContent = heroWonTournament
        ? '恭喜你击败了全部 AI 对手！'
        : heroBusted
        ? '你已被淘汰，点击按钮可立即重新开始新一局。'
        : '本手已结算，按空格键或点击按钮继续下一手。';

      document.getElementById('btn-next-hand').addEventListener('click', () => {
        this.handleNextOrRestart();
      });
      return;
    }

    if (!isHeroTurn || !state.legalActions) {
      const active = state.players[state.activePlayerIndex];
      this.el.actionButtonsRow.innerHTML = '';
      this.el.raiseControlsRow.innerHTML = '';
      this.el.statusHint.textContent = active
        ? `等待 ${active.name} 思考并行动...`
        : '正在发牌...';
      return;
    }

    const legal = state.legalActions;
    const minR = legal.minRaiseTo;
    const maxR = legal.maxRaiseTo;
    if (this.currentRaiseValue < minR) this.currentRaiseValue = minR;
    if (this.currentRaiseValue > maxR) this.currentRaiseValue = maxR;

    const callLabel = legal.canCheck ? '过牌 (C)' : `跟注 ${legal.callAmount} (C)`;
    const raiseVerb = legal.isBet ? '下注' : '加注至';

    this.el.actionButtonsRow.innerHTML = `
      <button id="act-fold" class="btn-action btn-fold">弃牌 (F)</button>
      <button id="act-call" class="btn-action btn-check-call">${callLabel}</button>
      ${
        legal.canRaise
          ? `<button id="act-raise" class="btn-action btn-raise">${raiseVerb} ${this.currentRaiseValue} (R)</button>`
          : ''
      }
      <button id="act-allin" class="btn-action btn-allin">全下 ${hero.currentBet + hero.chips} (A)</button>
    `;

    if (legal.canRaise && maxR > minR) {
      const pot = Math.max(state.bigBlind * 2, legal.potTotal);
      const halfPot = Math.min(maxR, Math.max(minR, Math.round(state.currentBet + pot * 0.5)));
      const threeQuarter = Math.min(maxR, Math.max(minR, Math.round(state.currentBet + pot * 0.75)));
      const fullPot = Math.min(maxR, Math.max(minR, Math.round(state.currentBet + pot)));

      this.el.raiseControlsRow.innerHTML = `
        <button class="btn-preset" data-val="${minR}">最小 (${minR})</button>
        <button class="btn-preset" data-val="${halfPot}">1/2 池</button>
        <button class="btn-preset" data-val="${threeQuarter}">3/4 池</button>
        <button class="btn-preset" data-val="${fullPot}">底池</button>
        <input id="raise-slider" class="raise-slider" type="range" min="${minR}" max="${maxR}" step="${Math.max(1, Math.floor(state.smallBlind / 2))}" value="${this.currentRaiseValue}" />
        <span id="raise-val-display" class="raise-value-badge">${this.currentRaiseValue}</span>
      `;

      const slider = document.getElementById('raise-slider');
      const valDisplay = document.getElementById('raise-val-display');
      const raiseBtn = document.getElementById('act-raise');

      const updateRaiseVal = (v) => {
        this.currentRaiseValue = Math.min(maxR, Math.max(minR, Number(v)));
        slider.value = String(this.currentRaiseValue);
        valDisplay.textContent = String(this.currentRaiseValue);
        if (raiseBtn) {
          raiseBtn.textContent = `${raiseVerb} ${this.currentRaiseValue} (R)`;
        }
      };

      slider.addEventListener('input', (e) => updateRaiseVal(e.target.value));
      this.el.raiseControlsRow.querySelectorAll('.btn-preset').forEach((btn) => {
        btn.addEventListener('click', () => updateRaiseVal(btn.dataset.val));
      });
    } else {
      this.el.raiseControlsRow.innerHTML = '';
    }

    this.el.statusHint.textContent = '轮到你行动 · 快捷键: F弃牌 / C过牌跟注 / R加注 / A全下';

    document.getElementById('act-fold').addEventListener('click', () => this.handleHumanAction('fold'));
    document.getElementById('act-call').addEventListener('click', () =>
      this.handleHumanAction(legal.canCheck ? 'check' : 'call')
    );
    const raiseBtnEl = document.getElementById('act-raise');
    if (raiseBtnEl) {
      raiseBtnEl.addEventListener('click', () =>
        this.handleHumanAction(legal.isBet ? 'bet' : 'raise', this.currentRaiseValue)
      );
    }
    document.getElementById('act-allin').addEventListener('click', () => this.handleHumanAction('allin'));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new PokerAppController();
});
