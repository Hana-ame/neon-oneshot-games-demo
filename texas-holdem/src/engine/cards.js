/**
 * cards.js - 扑克牌数据结构、洗牌与格式化工具
 */

export const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];

export const SUIT_SYMBOLS = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

export const SUIT_SHORT = {
  spades: 's',
  hearts: 'h',
  diamonds: 'd',
  clubs: 'c',
};

const SHORT_TO_SUIT = {
  s: 'spades',
  h: 'hearts',
  d: 'diamonds',
  c: 'clubs',
};

export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export const RANK_LABELS = {
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
};

const CHAR_TO_RANK = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  T: 10,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

/**
 * 创建标准 52 张扑克牌组
 * @returns {Array<{rank: number, suit: string, id: string}>}
 */
export function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        rank,
        suit,
        id: `${RANK_LABELS[rank] === '10' ? 'T' : RANK_LABELS[rank]}${SUIT_SHORT[suit]}`,
      });
    }
  }
  return deck;
}

/**
 * 使用 Fisher-Yates 算法进行无偏原地洗牌（返回新数组，不修改原数组）
 * @param {Array} deck
 * @param {Function} [rng=Math.random]
 * @returns {Array}
 */
export function shuffleDeck(deck, rng = Math.random) {
  const copy = deck.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

/**
 * 解析简写牌面字符串，如 "As", "Td", "10h", "2c"
 * @param {string} code
 * @returns {{rank: number, suit: string, id: string}}
 */
export function parseCard(code) {
  if (typeof code !== 'string' || code.length < 2 || code.length > 3) {
    throw new Error(`Invalid card code: ${code}`);
  }
  const suitChar = code.slice(-1).toLowerCase();
  const rankStr = code.slice(0, -1).toUpperCase();
  const suit = SHORT_TO_SUIT[suitChar];
  const rank = CHAR_TO_RANK[rankStr];
  if (!suit || !rank) {
    throw new Error(`Invalid card code: ${code}`);
  }
  const canonicalRank = rank === 10 ? 'T' : RANK_LABELS[rank];
  return { rank, suit, id: `${canonicalRank}${suitChar}` };
}

/**
 * 批量解析牌面数组
 * @param {string|string[]} input
 */
export function parseCards(input) {
  const list = Array.isArray(input) ? input : input.trim().split(/\s+/);
  return list.map(parseCard);
}

/**
 * 格式化牌面用于展示，如 "A♠"
 * @param {{rank: number, suit: string}} card
 * @returns {string}
 */
export function formatCard(card) {
  return `${RANK_LABELS[card.rank]}${SUIT_SYMBOLS[card.suit]}`;
}

/**
 * 判断花色是否为红色
 * @param {string} suit
 * @returns {boolean}
 */
export function isRedSuit(suit) {
  return suit === 'hearts' || suit === 'diamonds';
}
