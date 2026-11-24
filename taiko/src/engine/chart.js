import { NOTE_TYPES, isHittableStandardNote } from './constants.js';

/**
 * Chart parser & compiler for Web Taiko Master.
 * Supports both structured JSON chart definitions and TJA-Lite text notation:
 *   0 = rest
 *   1 = don (咚)
 *   2 = ka (咔)
 *   3 = big_don (大咚)
 *   4 = big_ka (大咔)
 *   5 = drumroll start
 *   7 = balloon start
 *   8 = drumroll/balloon end
 * Directives supported in TJA-Lite:
 *   #BPMCHANGE <number>
 *   #SCROLL <number>
 *   #GOGOSTART
 *   #GOGOEND
 */

const CHAR_TO_NOTE = {
  '1': NOTE_TYPES.DON,
  '2': NOTE_TYPES.KA,
  '3': NOTE_TYPES.BIG_DON,
  '4': NOTE_TYPES.BIG_KA,
};

/**
 * Parse a TJA-Lite text chart into normalized timed note events.
 * @param {object} config
 * @param {string} config.title
 * @param {number} config.bpm - Initial BPM (> 0)
 * @param {number} [config.offsetMs=0] - Chart lead-in offset in ms
 * @param {number} [config.beatsPerMeasure=4] - Default beats per measure
 * @param {string[]} config.measures - Array of measure strings or directive lines
 * @param {number[]} [config.balloonCounts] - Hit targets for each balloon in order
 * @returns {{ notes: Array, durationMs: number, gogoRanges: Array, stats: object }}
 */
export function parseTJALiteChart(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('Chart config must be an object');
  }
  const initialBpm = Number(config.bpm);
  if (!Number.isFinite(initialBpm) || initialBpm <= 0 || initialBpm > 400) {
    throw new Error(`Invalid BPM: ${config.bpm}`);
  }
  const measures = Array.isArray(config.measures) ? config.measures : [];
  if (measures.length === 0) {
    throw new Error('Chart must contain at least one measure');
  }

  let currentBpm = initialBpm;
  let currentScroll = 1.0;
  let currentTimeMs = Number.isFinite(Number(config.offsetMs)) ? Number(config.offsetMs) : 0;
  const beatsPerMeasure = Number(config.beatsPerMeasure) > 0 ? Number(config.beatsPerMeasure) : 4;
  const balloonCounts = Array.isArray(config.balloonCounts) ? [...config.balloonCounts] : [];
  let balloonIdx = 0;

  let inGogo = false;
  let gogoStartMs = null;
  const gogoRanges = [];
  const notes = [];
  let activeSpecial = null; // { type: 'drumroll'|'balloon', startMs, scroll, gogo, requiredHits? }
  let noteId = 1;

  for (const rawLine of measures) {
    if (typeof rawLine !== 'string') continue;
    const line = rawLine.trim();
    if (!line || line.startsWith('//')) continue;

    if (line.startsWith('#')) {
      const upper = line.toUpperCase();
      if (upper.startsWith('#BPMCHANGE')) {
        const nextBpm = Number(line.split(/\s+/)[1]);
        if (Number.isFinite(nextBpm) && nextBpm > 0 && nextBpm <= 400) {
          currentBpm = nextBpm;
        }
      } else if (upper.startsWith('#SCROLL')) {
        const nextScroll = Number(line.split(/\s+/)[1]);
        if (Number.isFinite(nextScroll) && nextScroll > 0 && nextScroll <= 4) {
          currentScroll = nextScroll;
        }
      } else if (upper === '#GOGOSTART') {
        if (!inGogo) {
          inGogo = true;
          gogoStartMs = currentTimeMs;
        }
      } else if (upper === '#GOGOEND') {
        if (inGogo) {
          inGogo = false;
          gogoRanges.push({ startMs: gogoStartMs, endMs: currentTimeMs });
          gogoStartMs = null;
        }
      }
      continue;
    }

    // Strip trailing comma and whitespace inside measure string
    const cleaned = line.replace(/,$/g, '').replace(/\s+/g, '');
    const measureDurationMs = (60000 / currentBpm) * beatsPerMeasure;

    if (cleaned.length === 0) {
      currentTimeMs += measureDurationMs;
      continue;
    }

    const stepMs = measureDurationMs / cleaned.length;

    for (let i = 0; i < cleaned.length; i++) {
      const ch = cleaned[i];
      const timeMs = Math.round((currentTimeMs + i * stepMs) * 100) / 100;

      if (ch === '0') continue;

      if (CHAR_TO_NOTE[ch]) {
        notes.push({
          id: noteId++,
          type: CHAR_TO_NOTE[ch],
          timeMs,
          endTimeMs: timeMs,
          bpm: currentBpm,
          scroll: currentScroll,
          gogo: inGogo,
          judged: false,
          judgement: null,
        });
      } else if (ch === '5' && !activeSpecial) {
        activeSpecial = {
          id: noteId++,
          type: NOTE_TYPES.DRUMROLL,
          timeMs,
          bpm: currentBpm,
          scroll: currentScroll,
          gogo: inGogo,
          hits: 0,
        };
      } else if (ch === '7' && !activeSpecial) {
        const requiredHits = Math.max(1, Number(balloonCounts[balloonIdx++] ?? 5));
        activeSpecial = {
          id: noteId++,
          type: NOTE_TYPES.BALLOON,
          timeMs,
          bpm: currentBpm,
          scroll: currentScroll,
          gogo: inGogo,
          requiredHits,
          hits: 0,
          popped: false,
        };
      } else if (ch === '8' && activeSpecial) {
        activeSpecial.endTimeMs = Math.max(activeSpecial.timeMs + 100, timeMs);
        activeSpecial.judged = false;
        notes.push(activeSpecial);
        activeSpecial = null;
      }
    }

    currentTimeMs += measureDurationMs;
  }

  // Close any unclosed special note cleanly
  if (activeSpecial) {
    activeSpecial.endTimeMs = Math.max(activeSpecial.timeMs + 500, currentTimeMs);
    activeSpecial.judged = false;
    notes.push(activeSpecial);
  }
  if (inGogo && gogoStartMs !== null) {
    gogoRanges.push({ startMs: gogoStartMs, endMs: currentTimeMs });
  }

  notes.sort((a, b) => a.timeMs - b.timeMs || a.id - b.id);

  const stats = computeChartStats(notes);
  const lastEventMs = notes.length > 0
    ? Math.max(...notes.map((n) => n.endTimeMs ?? n.timeMs))
    : currentTimeMs;
  const durationMs = Math.max(currentTimeMs, lastEventMs + 1500);

  return {
    notes,
    durationMs: Math.round(durationMs),
    gogoRanges,
    stats,
  };
}

/**
 * Parse raw user-entered TJA-Lite text block (with optional header lines like TITLE:, BPM:, OFFSET:, BALLOON:).
 * @param {string} rawText
 */
export function parseRawTJAText(rawText) {
  if (typeof rawText !== 'string' || !rawText.trim()) {
    throw new Error('谱面文本不能为空');
  }
  let title = '自定义谱面';
  let bpm = 130;
  let offsetMs = 1500;
  let balloonCounts = [];
  const measures = [];

  const lines = rawText.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('//')) continue;

    if (/^TITLE\s*:/i.test(line)) {
      title = line.replace(/^TITLE\s*:/i, '').trim() || title;
    } else if (/^BPM\s*:/i.test(line)) {
      const val = Number(line.replace(/^BPM\s*:/i, '').trim());
      if (Number.isFinite(val) && val > 0) bpm = val;
    } else if (/^OFFSET\s*:/i.test(line)) {
      const val = Number(line.replace(/^OFFSET\s*:/i, '').trim());
      if (Number.isFinite(val)) offsetMs = Math.max(0, val);
    } else if (/^BALLOON\s*:/i.test(line)) {
      balloonCounts = line
        .replace(/^BALLOON\s*:/i, '')
        .split(',')
        .map((v) => Number(v.trim()))
        .filter((v) => Number.isFinite(v) && v > 0);
    } else if (line.startsWith('#') || /^[0-8,\s]+$/.test(line)) {
      measures.push(line);
    }
  }

  if (measures.length === 0) {
    throw new Error('未检测到有效小节数据（请使用数字 0-8 编写谱面）');
  }

  const compiled = parseTJALiteChart({
    title,
    bpm,
    offsetMs,
    measures,
    balloonCounts,
  });

  return {
    title,
    bpm,
    offsetMs,
    ...compiled,
  };
}

export function computeChartStats(notes) {
  let standardCount = 0;
  let donCount = 0;
  let kaCount = 0;
  let bigCount = 0;
  let drumrollCount = 0;
  let balloonCount = 0;

  for (const n of notes) {
    if (isHittableStandardNote(n.type)) {
      standardCount++;
      if (n.type === NOTE_TYPES.DON || n.type === NOTE_TYPES.BIG_DON) donCount++;
      if (n.type === NOTE_TYPES.KA || n.type === NOTE_TYPES.BIG_KA) kaCount++;
      if (n.type === NOTE_TYPES.BIG_DON || n.type === NOTE_TYPES.BIG_KA) bigCount++;
    } else if (n.type === NOTE_TYPES.DRUMROLL) {
      drumrollCount++;
    } else if (n.type === NOTE_TYPES.BALLOON) {
      balloonCount++;
    }
  }

  return {
    totalNotes: notes.length,
    standardCount,
    donCount,
    kaCount,
    bigCount,
    drumrollCount,
    balloonCount,
  };
}

/**
 * Deep-clone compiled notes for a fresh playthrough so source charts stay immutable.
 */
export function cloneNotes(notes) {
  return notes.map((n) => ({
    ...n,
    judged: false,
    judgement: null,
    hits: 0,
    popped: false,
  }));
}
