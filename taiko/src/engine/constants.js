/**
 * Core constants, judgement windows, scoring rules, and visual tokens
 * for Web Taiko Master (网页太鼓达人).
 */

export const NOTE_TYPES = Object.freeze({
  DON: 'don',           // Red inner drum hit (咚)
  KA: 'ka',             // Blue rim hit (咔)
  BIG_DON: 'big_don',   // Large red hit (大咚)
  BIG_KA: 'big_ka',     // Large blue hit (大咔)
  DRUMROLL: 'drumroll', // Yellow continuous roll (连打)
  BALLOON: 'balloon',   // Orange balloon note requiring N hits (气球)
});

export const INPUT_TYPES = Object.freeze({
  DON: 'don',
  KA: 'ka',
});

export const JUDGEMENTS = Object.freeze({
  GREAT: 'great', // 良
  GOOD: 'good',   // 可
  MISS: 'miss',   // 不可
});

/**
 * Timing windows in milliseconds (symmetric around target time).
 * Based on classic arcade rhythm game standards.
 */
export const TIMING_WINDOWS_MS = Object.freeze({
  GREAT: 25, // ±25ms -> 良
  GOOD: 75,  // ±75ms -> 可
  MISS: 108, // ±108ms -> 不可 (bad hit)
});

export const SCORING = Object.freeze({
  GREAT_BASE: 1000,
  GOOD_BASE: 500,
  BIG_MULTIPLIER: 2,
  COMBO_STEP: 10,        // Every 10 combo adds bonus tier
  COMBO_TIER_BONUS: 100, // +100 per tier (capped at tier 10)
  COMBO_MAX_TIER: 10,
  DRUMROLL_HIT: 200,
  BALLOON_HIT: 300,
  BALLOON_POP_BONUS: 3000,
  GOGO_MULTIPLIER: 1.2,
});

export const DIFFICULTIES = Object.freeze({
  EASY: {
    id: 'easy',
    label: '简单',
    jpLabel: 'かんたん',
    color: '#22c55e',
    clearThreshold: 60, // 60% soul gauge to clear
    missPenalty: 1.4,
    goodRatio: 0.65,
  },
  NORMAL: {
    id: 'normal',
    label: '普通',
    jpLabel: 'ふつう',
    color: '#f59e0b',
    clearThreshold: 70, // 70% soul gauge to clear
    missPenalty: 1.8,
    goodRatio: 0.55,
  },
  ONI: {
    id: 'oni',
    label: '鬼级',
    jpLabel: 'おに',
    color: '#ef4444',
    clearThreshold: 80, // 80% soul gauge to clear
    missPenalty: 2.2,
    goodRatio: 0.5,
  },
});

export const DEFAULT_SETTINGS = Object.freeze({
  keyBindings: {
    leftKa: 'KeyD',
    leftDon: 'KeyF',
    rightDon: 'KeyJ',
    rightKa: 'KeyK',
  },
  audioOffsetMs: 0,     // -150 to +150 ms
  scrollSpeed: 1.0,     // 0.5x to 2.0x
  bgmVolume: 0.75,      // 0.0 to 1.0
  sfxVolume: 0.9,       // 0.0 to 1.0
  muted: false,
  autoPlay: false,
});

export const RANK_THRESHOLDS = Object.freeze([
  { rank: 'SS', minAccuracy: 98, requireFullCombo: true, color: '#fde047' },
  { rank: 'S',  minAccuracy: 95, requireFullCombo: false, color: '#facc15' },
  { rank: 'A',  minAccuracy: 88, requireFullCombo: false, color: '#fb923c' },
  { rank: 'B',  minAccuracy: 78, requireFullCombo: false, color: '#38bdf8' },
  { rank: 'C',  minAccuracy: 65, requireFullCombo: false, color: '#a78bfa' },
  { rank: 'D',  minAccuracy: 0,  requireFullCombo: false, color: '#94a3b8' },
]);

export function isDonNote(type) {
  return type === NOTE_TYPES.DON || type === NOTE_TYPES.BIG_DON;
}

export function isKaNote(type) {
  return type === NOTE_TYPES.KA || type === NOTE_TYPES.BIG_KA;
}

export function isBigNote(type) {
  return type === NOTE_TYPES.BIG_DON || type === NOTE_TYPES.BIG_KA;
}

export function isHittableStandardNote(type) {
  return (
    type === NOTE_TYPES.DON ||
    type === NOTE_TYPES.KA ||
    type === NOTE_TYPES.BIG_DON ||
    type === NOTE_TYPES.BIG_KA
  );
}
