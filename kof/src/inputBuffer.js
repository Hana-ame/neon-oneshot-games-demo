// KOF Web Arcade - Directional Input Buffer & Command Motion Recognizer
import { MOTION_TYPES } from './constants.js';

/**
 * Converts directional booleans + facing direction into classic numpad notation (1..9).
 * 7 8 9
 * 4 5 6   (6 = forward, 4 = backward, 2 = down, 8 = up)
 * 1 2 3
 */
export function getNumpadDirection(input, facing = 1) {
  const forward = facing === 1 ? !!input.right : !!input.left;
  const backward = facing === 1 ? !!input.left : !!input.right;
  const up = !!input.up;
  const down = !!input.down;

  let x = 0;
  if (forward && !backward) x = 1;
  else if (backward && !forward) x = -1;

  let y = 0;
  if (up && !down) y = 1;
  else if (down && !up) y = -1;

  if (y === -1) {
    if (x === -1) return 1;
    if (x === 1) return 3;
    return 2;
  }
  if (y === 1) {
    if (x === -1) return 7;
    if (x === 1) return 9;
    return 8;
  }
  if (x === -1) return 4;
  if (x === 1) return 6;
  return 5;
}

export class InputBuffer {
  constructor(maxFrames = 24) {
    this.maxFrames = maxFrames;
    this.history = []; // Array of { dir, frame }
  }

  reset() {
    this.history = [];
  }

  push(dir, frame) {
    this.history.push({ dir, frame });
    while (this.history.length > this.maxFrames) {
      this.history.shift();
    }
  }

  /**
   * Matches a required numpad sequence within a frame window (e.g. [2, 3, 6]).
   * Allows intermediate frames or repeated directions for forgiving arcade feel.
   */
  hasSequence(sequence, currentFrame, windowFrames = 18) {
    if (!sequence || sequence.length === 0) return false;
    const minFrame = currentFrame - windowFrames;
    let seqIdx = 0;
    for (let i = 0; i < this.history.length; i++) {
      const entry = this.history[i];
      if (entry.frame < minFrame) continue;
      if (entry.dir === sequence[seqIdx]) {
        seqIdx++;
        if (seqIdx === sequence.length) return true;
      }
    }
    return false;
  }

  /**
   * Detects highest-priority KOF motion currently in the buffer.
   * Priority: SUPER (236236) > DP (623) > QCF (236) > QCB (214).
   */
  detectMotion(currentFrame) {
    // Super: 2 -> 6 -> 2 -> 6 (lenient diagonal skip allowed, or exact 236236)
    if (
      this.hasSequence([2, 3, 6, 2, 3, 6], currentFrame, 24) ||
      this.hasSequence([2, 6, 2, 6], currentFrame, 22)
    ) {
      return MOTION_TYPES.SUPER_QCF2;
    }
    // Dragon Punch: 6 -> 2 -> 3 (or 6 -> 2 -> 6)
    if (
      this.hasSequence([6, 2, 3], currentFrame, 16) ||
      this.hasSequence([6, 3, 2, 3], currentFrame, 16)
    ) {
      return MOTION_TYPES.DP;
    }
    // Quarter Circle Forward: 2 -> 3 -> 6 (or fast 2 -> 6)
    if (
      this.hasSequence([2, 3, 6], currentFrame, 15) ||
      this.hasSequence([2, 6], currentFrame, 12)
    ) {
      return MOTION_TYPES.QCF;
    }
    // Quarter Circle Back: 2 -> 1 -> 4 (or fast 2 -> 4)
    if (
      this.hasSequence([2, 1, 4], currentFrame, 15) ||
      this.hasSequence([2, 4], currentFrame, 12)
    ) {
      return MOTION_TYPES.QCB;
    }
    return null;
  }
}
