import {
  DIFFICULTIES,
  INPUT_TYPES,
  JUDGEMENTS,
  NOTE_TYPES,
  RANK_THRESHOLDS,
  SCORING,
  TIMING_WINDOWS_MS,
  isBigNote,
  isDonNote,
  isHittableStandardNote,
  isKaNote,
} from './constants.js';
import { cloneNotes } from './chart.js';

/**
 * Pure, deterministic Taiko judgement, scoring, combo, and soul-gauge engine.
 * Designed to run identically in the browser loop and in Node.js automated tests.
 */
export class TaikoGameEngine {
  /**
   * @param {object} options
   * @param {Array} options.notes - Compiled note list from parseTJALiteChart
   * @param {string} [options.difficulty='normal'] - 'easy' | 'normal' | 'oni'
   * @param {Array} [options.gogoRanges=[]] - [{startMs, endMs}]
   */
  constructor({ notes, difficulty = 'normal', gogoRanges = [] }) {
    if (!Array.isArray(notes)) {
      throw new Error('TaikoGameEngine requires a notes array');
    }
    const diffKey = String(difficulty).toUpperCase();
    this.difficultyConfig = DIFFICULTIES[diffKey] || DIFFICULTIES.NORMAL;
    this.notes = cloneNotes(notes);
    this.gogoRanges = Array.isArray(gogoRanges) ? gogoRanges : [];

    this.standardTotal = this.notes.filter((n) => isHittableStandardNote(n.type)).length;
    // Soul gauge per-note increment: calibrated so ~85% GREAT reaches 100%
    this.soulUnit = this.standardTotal > 0 ? 100 / (this.standardTotal * 0.82) : 0;

    this.reset();
  }

  reset() {
    for (const n of this.notes) {
      n.judged = false;
      n.judgement = null;
      n.hits = 0;
      n.popped = false;
    }
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.soul = 0; // 0 .. 100
    this.counts = {
      great: 0,
      good: 0,
      miss: 0,
      drumrollHits: 0,
      balloonHits: 0,
      balloonsPopped: 0,
    };
    this.timingDeltas = []; // signed ms (negative = early, positive = late)
    this.cursor = 0;
  }

  isGogoTime(timeMs) {
    for (const r of this.gogoRanges) {
      if (timeMs >= r.startMs && timeMs <= r.endMs) return true;
    }
    return false;
  }

  /**
   * Process a drum hit input ('don' or 'ka') at songTimeMs.
   * @param {'don'|'ka'} inputType
   * @param {number} songTimeMs
   * @returns {object} Event descriptor for visual/audio feedback
   */
  processInput(inputType, songTimeMs) {
    if (inputType !== INPUT_TYPES.DON && inputType !== INPUT_TYPES.KA) {
      throw new Error(`Unsupported inputType: ${inputType}`);
    }

    // 1. Check active special notes (drumroll / balloon) first
    for (let i = this.cursor; i < this.notes.length; i++) {
      const note = this.notes[i];
      if (note.timeMs > songTimeMs + TIMING_WINDOWS_MS.MISS) break;
      if (note.judged) continue;

      if (note.type === NOTE_TYPES.DRUMROLL) {
        if (songTimeMs >= note.timeMs && songTimeMs <= note.endTimeMs) {
          note.hits++;
          this.counts.drumrollHits++;
          const gogoMult = note.gogo ? SCORING.GOGO_MULTIPLIER : 1;
          const pts = Math.round(SCORING.DRUMROLL_HIT * gogoMult);
          this.score += pts;
          return {
            matched: true,
            kind: 'drumroll',
            note,
            points: pts,
            inputType,
            deltaMs: 0,
          };
        }
      } else if (note.type === NOTE_TYPES.BALLOON) {
        if (songTimeMs >= note.timeMs && songTimeMs <= note.endTimeMs && !note.popped) {
          // Balloons only accept DON hits in classic Taiko
          if (inputType !== INPUT_TYPES.DON) {
            return { matched: false, kind: 'wrong_balloon_input', inputType };
          }
          note.hits++;
          this.counts.balloonHits++;
          const gogoMult = note.gogo ? SCORING.GOGO_MULTIPLIER : 1;
          let pts = Math.round(SCORING.BALLOON_HIT * gogoMult);
          let popped = false;
          if (note.hits >= note.requiredHits) {
            note.popped = true;
            note.judged = true;
            popped = true;
            this.counts.balloonsPopped++;
            pts += Math.round(SCORING.BALLOON_POP_BONUS * gogoMult);
          }
          this.score += pts;
          return {
            matched: true,
            kind: popped ? 'balloon_pop' : 'balloon_hit',
            note,
            points: pts,
            remaining: Math.max(0, note.requiredHits - note.hits),
            inputType,
            deltaMs: 0,
          };
        }
      }
    }

    // 2. Find earliest unjudged standard note within the MISS window
    let targetNote = null;
    for (let i = this.cursor; i < this.notes.length; i++) {
      const note = this.notes[i];
      if (note.judged) continue;
      if (!isHittableStandardNote(note.type)) continue;

      const delta = songTimeMs - note.timeMs; // negative = early, positive = late
      if (delta < -TIMING_WINDOWS_MS.MISS) {
        break; // Notes are sorted; no earlier candidate
      }
      if (Math.abs(delta) <= TIMING_WINDOWS_MS.MISS) {
        targetNote = note;
        break;
      }
    }

    if (!targetNote) {
      return { matched: false, kind: 'empty', inputType };
    }

    const correctColor =
      (inputType === INPUT_TYPES.DON && isDonNote(targetNote.type)) ||
      (inputType === INPUT_TYPES.KA && isKaNote(targetNote.type));

    const deltaMs = Math.round((songTimeMs - targetNote.timeMs) * 100) / 100;
    const absDelta = Math.abs(deltaMs);

    if (!correctColor) {
      // Wrong drum surface inside timing window -> ignore if too far, or penalize as miss if inside GOOD window
      if (absDelta <= TIMING_WINDOWS_MS.GOOD) {
        return this._applyJudgement(targetNote, JUDGEMENTS.MISS, deltaMs, 'wrong_color');
      }
      return { matched: false, kind: 'wrong_color_ignored', inputType };
    }

    let judgement;
    if (absDelta <= TIMING_WINDOWS_MS.GREAT) {
      judgement = JUDGEMENTS.GREAT;
    } else if (absDelta <= TIMING_WINDOWS_MS.GOOD) {
      judgement = JUDGEMENTS.GOOD;
    } else {
      judgement = JUDGEMENTS.MISS;
    }

    return this._applyJudgement(targetNote, judgement, deltaMs, 'hit');
  }

  /**
   * Sweep past notes whose miss window has elapsed and mark them as missed.
   * Also closes expired drumrolls/balloons.
   * @param {number} songTimeMs
   * @returns {Array} List of auto-missed note events
   */
  update(songTimeMs) {
    const missedEvents = [];

    while (this.cursor < this.notes.length) {
      const note = this.notes[this.cursor];
      if (note.judged) {
        this.cursor++;
        continue;
      }

      if (isHittableStandardNote(note.type)) {
        if (songTimeMs - note.timeMs > TIMING_WINDOWS_MS.MISS) {
          const ev = this._applyJudgement(note, JUDGEMENTS.MISS, TIMING_WINDOWS_MS.MISS + 1, 'timeout');
          missedEvents.push(ev);
          this.cursor++;
          continue;
        }
        break;
      } else {
        // Drumroll or balloon ends after endTimeMs
        if (songTimeMs > note.endTimeMs) {
          note.judged = true;
          this.cursor++;
          continue;
        }
        break;
      }
    }

    return missedEvents;
  }

  /**
   * Helper for Auto-Play mode: returns inputs that should fire at songTimeMs.
   */
  getAutoPlayInputs(songTimeMs, lastDrumrollTickMs = 0) {
    const actions = [];
    for (let i = this.cursor; i < this.notes.length; i++) {
      const note = this.notes[i];
      if (note.judged) continue;
      if (note.timeMs > songTimeMs + 5) break;

      if (isHittableStandardNote(note.type) && songTimeMs >= note.timeMs) {
        const inputType = isDonNote(note.type) ? INPUT_TYPES.DON : INPUT_TYPES.KA;
        actions.push({ inputType, note, timeMs: note.timeMs });
      } else if (
        (note.type === NOTE_TYPES.DRUMROLL || (note.type === NOTE_TYPES.BALLOON && !note.popped)) &&
        songTimeMs >= note.timeMs &&
        songTimeMs <= note.endTimeMs &&
        songTimeMs - lastDrumrollTickMs >= 75
      ) {
        actions.push({ inputType: INPUT_TYPES.DON, note, timeMs: songTimeMs, isRoll: true });
      }
    }
    return actions;
  }

  _applyJudgement(note, judgement, deltaMs, reason) {
    note.judged = true;
    note.judgement = judgement;

    let points = 0;

    if (judgement === JUDGEMENTS.GREAT) {
      this.counts.great++;
      this.combo++;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
      this.timingDeltas.push(deltaMs);

      const tier = Math.min(SCORING.COMBO_MAX_TIER, Math.floor(this.combo / SCORING.COMBO_STEP));
      const base = SCORING.GREAT_BASE + tier * SCORING.COMBO_TIER_BONUS;
      const bigMult = isBigNote(note.type) ? SCORING.BIG_MULTIPLIER : 1;
      const gogoMult = note.gogo ? SCORING.GOGO_MULTIPLIER : 1;
      points = Math.round(base * bigMult * gogoMult);
      this.score += points;

      this.soul = Math.min(100, this.soul + this.soulUnit);
    } else if (judgement === JUDGEMENTS.GOOD) {
      this.counts.good++;
      this.combo++;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
      this.timingDeltas.push(deltaMs);

      const tier = Math.min(SCORING.COMBO_MAX_TIER, Math.floor(this.combo / SCORING.COMBO_STEP));
      const base = SCORING.GOOD_BASE + Math.floor((tier * SCORING.COMBO_TIER_BONUS) / 2);
      const bigMult = isBigNote(note.type) ? SCORING.BIG_MULTIPLIER : 1;
      const gogoMult = note.gogo ? SCORING.GOGO_MULTIPLIER : 1;
      points = Math.round(base * bigMult * gogoMult);
      this.score += points;

      this.soul = Math.min(100, this.soul + this.soulUnit * this.difficultyConfig.goodRatio);
    } else {
      this.counts.miss++;
      this.combo = 0;
      this.soul = Math.max(0, this.soul - this.soulUnit * this.difficultyConfig.missPenalty);
    }

    return {
      matched: true,
      kind: 'judgement',
      judgement,
      note,
      points,
      deltaMs,
      reason,
      combo: this.combo,
      soul: this.soul,
    };
  }

  getAccuracy() {
    const judged = this.counts.great + this.counts.good + this.counts.miss;
    if (judged === 0) return 100;
    const weighted = this.counts.great + this.counts.good * 0.5;
    return Math.round((weighted / judged) * 10000) / 100;
  }

  isCleared() {
    return this.soul >= this.difficultyConfig.clearThreshold;
  }

  isFullCombo() {
    return this.standardTotal > 0 && this.counts.miss === 0 && (this.counts.great + this.counts.good) === this.standardTotal;
  }

  getRank() {
    const acc = this.getAccuracy();
    const fc = this.isFullCombo();
    for (const r of RANK_THRESHOLDS) {
      if (acc >= r.minAccuracy && (!r.requireFullCombo || fc)) {
        return r.rank;
      }
    }
    return 'D';
  }

  getMeanOffsetMs() {
    if (this.timingDeltas.length === 0) return 0;
    const sum = this.timingDeltas.reduce((a, b) => a + b, 0);
    return Math.round((sum / this.timingDeltas.length) * 10) / 10;
  }

  getSummary() {
    return {
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      soul: Math.round(this.soul * 10) / 10,
      cleared: this.isCleared(),
      clearThreshold: this.difficultyConfig.clearThreshold,
      fullCombo: this.isFullCombo(),
      accuracy: this.getAccuracy(),
      rank: this.getRank(),
      meanOffsetMs: this.getMeanOffsetMs(),
      counts: { ...this.counts },
      standardTotal: this.standardTotal,
      timingDeltas: [...this.timingDeltas],
    };
  }
}
