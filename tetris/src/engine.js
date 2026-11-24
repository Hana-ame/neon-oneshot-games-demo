/**
 * 网页俄罗斯方块纯逻辑引擎（与 DOM / Canvas 完全解耦，支持无头自动化测试）
 */

import {
  BOARD_COLS,
  TOTAL_ROWS,
  HIDDEN_ROWS,
  PIECE_TYPES,
  SHAPES,
  JLSTZ_KICKS,
  I_KICKS,
  LINE_SCORES,
  TSPIN_SCORES,
  LOCK_DELAY_MS,
  MAX_LOCK_RESETS,
  LINES_PER_LEVEL,
  MAX_LEVEL,
  getDropIntervalMs,
} from './constants.js';

/**
 * 7-Bag 公平随机生成器：每 7 个方块必包含全部 7 种类型，避免极端饥荒
 */
export class SevenBagRandomizer {
  constructor(rng = Math.random) {
    this.rng = rng;
    this.bag = [];
  }

  _refill() {
    const items = [...PIECE_TYPES];
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    this.bag.push(...items);
  }

  next() {
    if (this.bag.length === 0) {
      this._refill();
    }
    return this.bag.shift();
  }

  peek(count = 3) {
    while (this.bag.length < count) {
      this._refill();
    }
    return this.bag.slice(0, count);
  }

  reset() {
    this.bag = [];
  }
}

export class TetrisEngine {
  constructor(options = {}) {
    this.cols = BOARD_COLS;
    this.rows = TOTAL_ROWS;
    this.hiddenRows = HIDDEN_ROWS;
    this.rng = options.rng || Math.random;
    this.randomizer = new SevenBagRandomizer(this.rng);
    this.onEvent = options.onEvent || null;
    this.reset();
  }

  _emit(type, payload = {}) {
    if (typeof this.onEvent === 'function') {
      this.onEvent({ type, ...payload });
    }
  }

  _createEmptyBoard() {
    return Array.from({ length: this.rows }, () => Array(this.cols).fill(null));
  }

  reset() {
    this.board = this._createEmptyBoard();
    this.randomizer.reset();
    this.status = 'idle'; // 'idle' | 'playing' | 'paused' | 'gameover'
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.combo = -1;
    this.backToBack = false;
    this.piecesPlaced = 0;
    this.holdPiece = null;
    this.holdUsed = false;
    this.activePiece = null;
    this.dropAccumulator = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.lastActionWasRotate = false;
    this.lastKickIndex = 0;
    this.lastClearRows = [];
    this.clearFlashTimer = 0;
    this.lastActionText = '';
    this.actionTextTimer = 0;
    this.nextQueue = this.randomizer.peek(3);
  }

  start() {
    this.reset();
    this.status = 'playing';
    this._spawnNextPiece();
    this._emit('start');
    return true;
  }

  togglePause() {
    if (this.status === 'playing') {
      this.status = 'paused';
      this._emit('pause');
      return true;
    }
    if (this.status === 'paused') {
      this.status = 'playing';
      this._emit('resume');
      return true;
    }
    return false;
  }

  getDropInterval() {
    return getDropIntervalMs(this.level);
  }

  getPieceCells(piece = this.activePiece) {
    if (!piece) return [];
    const shape = SHAPES[piece.type][piece.rotation];
    return shape.map(([dx, dy]) => [piece.x + dx, piece.y + dy]);
  }

  isValidPosition(piece, dx = 0, dy = 0, rotation = piece.rotation) {
    const shape = SHAPES[piece.type][rotation];
    for (const [cx, cy] of shape) {
      const nx = piece.x + dx + cx;
      const ny = piece.y + dy + cy;
      if (nx < 0 || nx >= this.cols || ny < 0 || ny >= this.rows) {
        return false;
      }
      if (this.board[ny][nx] !== null) {
        return false;
      }
    }
    return true;
  }

  isOnGround(piece = this.activePiece) {
    if (!piece) return false;
    return !this.isValidPosition(piece, 0, 1, piece.rotation);
  }

  getGhostY(piece = this.activePiece) {
    if (!piece) return 0;
    let gy = piece.y;
    while (this.isValidPosition(piece, 0, gy - piece.y + 1, piece.rotation)) {
      gy++;
    }
    return gy;
  }

  getGhostCells() {
    if (!this.activePiece) return [];
    const gy = this.getGhostY(this.activePiece);
    const shape = SHAPES[this.activePiece.type][this.activePiece.rotation];
    return shape.map(([dx, dy]) => [this.activePiece.x + dx, gy + dy]);
  }

  _spawnPieceOfType(type) {
    const piece = {
      type,
      rotation: 0,
      x: 3, // 标准 10 列居中生成位置（I/O/T/S/Z/J/L 均对齐）
      y: 0, // 缓冲行顶部
    };
    // 如果顶部 1 行可安全下移 1 格进入标准生成高度则下移，避免立刻卡顶
    if (this.isValidPosition(piece, 0, 1, 0)) {
      piece.y = 1;
    }
    if (!this.isValidPosition(piece, 0, 0, 0)) {
      this.activePiece = piece;
      this.status = 'gameover';
      this._emit('gameover', { score: this.score, lines: this.lines, level: this.level });
      return false;
    }
    this.activePiece = piece;
    this.dropAccumulator = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.lastActionWasRotate = false;
    this.lastKickIndex = 0;
    this.nextQueue = this.randomizer.peek(3);
    return true;
  }

  _spawnNextPiece() {
    const nextType = this.randomizer.next();
    return this._spawnPieceOfType(nextType);
  }

  _tryResetLockDelay() {
    if (this.lockTimer > 0 && this.lockResets < MAX_LOCK_RESETS) {
      this.lockTimer = 0;
      this.lockResets++;
    }
  }

  move(dx) {
    if (this.status !== 'playing' || !this.activePiece) return false;
    if (this.isValidPosition(this.activePiece, dx, 0)) {
      this.activePiece.x += dx;
      this.lastActionWasRotate = false;
      this._tryResetLockDelay();
      this._emit('move', { dx });
      return true;
    }
    return false;
  }

  softDrop() {
    if (this.status !== 'playing' || !this.activePiece) return false;
    if (this.isValidPosition(this.activePiece, 0, 1)) {
      this.activePiece.y += 1;
      this.score += 1;
      this.dropAccumulator = 0;
      this.lastActionWasRotate = false;
      this._emit('softDrop');
      return true;
    }
    return false;
  }

  hardDrop() {
    if (this.status !== 'playing' || !this.activePiece) return 0;
    const targetY = this.getGhostY(this.activePiece);
    const distance = targetY - this.activePiece.y;
    this.activePiece.y = targetY;
    this.score += distance * 2;
    if (distance > 0) {
      this.lastActionWasRotate = false;
    }
    this._emit('hardDrop', { distance });
    this._lockActivePiece();
    return distance;
  }

  /**
   * SRS 旋转（direction: 1 为顺时针，-1 为逆时针）
   */
  rotate(direction = 1) {
    if (this.status !== 'playing' || !this.activePiece) return false;
    const piece = this.activePiece;
    const from = piece.rotation;
    const to = (from + (direction >= 0 ? 1 : 3)) % 4;

    if (piece.type === 'O') {
      // O 方块旋转外观不变，仅记录旋转状态
      piece.rotation = to;
      this.lastActionWasRotate = true;
      this.lastKickIndex = 0;
      this._emit('rotate', { type: piece.type, from, to, kickIndex: 0 });
      return true;
    }

    const key = `${from}>${to}`;
    const kicks = piece.type === 'I' ? I_KICKS[key] : JLSTZ_KICKS[key];

    for (let i = 0; i < kicks.length; i++) {
      const [kx, ky] = kicks[i];
      if (this.isValidPosition(piece, kx, ky, to)) {
        piece.x += kx;
        piece.y += ky;
        piece.rotation = to;
        this.lastActionWasRotate = true;
        this.lastKickIndex = i;
        this._tryResetLockDelay();
        this._emit('rotate', { type: piece.type, from, to, kickIndex: i });
        return true;
      }
    }
    return false;
  }

  hold() {
    if (this.status !== 'playing' || !this.activePiece || this.holdUsed) {
      return false;
    }
    const currentType = this.activePiece.type;
    this.holdUsed = true;
    if (this.holdPiece === null) {
      this.holdPiece = currentType;
      this._spawnNextPiece();
    } else {
      const swapType = this.holdPiece;
      this.holdPiece = currentType;
      this._spawnPieceOfType(swapType);
    }
    this._emit('hold', { holdPiece: this.holdPiece });
    return true;
  }

  /**
   * 检测 T-Spin（3 角判定法：最后动作为旋转且 T 中心四周 4 个对角格至少有 3 格被占用或越界）
   */
  _detectTSpin() {
    if (!this.activePiece || this.activePiece.type !== 'T' || !this.lastActionWasRotate) {
      return false;
    }
    const cx = this.activePiece.x + 1;
    const cy = this.activePiece.y + 1;
    const corners = [
      [cx - 1, cy - 1],
      [cx + 1, cy - 1],
      [cx - 1, cy + 1],
      [cx + 1, cy + 1],
    ];
    let occupied = 0;
    for (const [x, y] of corners) {
      if (x < 0 || x >= this.cols || y < 0 || y >= this.rows || this.board[y][x] !== null) {
        occupied++;
      }
    }
    return occupied >= 3;
  }

  _lockActivePiece() {
    const piece = this.activePiece;
    if (!piece) return;

    const isTSpin = this._detectTSpin();
    const cells = this.getPieceCells(piece);
    let allAboveVisible = true;

    for (const [x, y] of cells) {
      if (y >= this.hiddenRows) {
        allAboveVisible = false;
      }
      if (y >= 0 && y < this.rows && x >= 0 && x < this.cols) {
        this.board[y][x] = piece.type;
      }
    }

    this.piecesPlaced++;
    this.holdUsed = false;

    // 锁定溢出判定：若整个方块全部锁死在隐藏缓冲行内则直接结束
    if (allAboveVisible) {
      this.activePiece = null;
      this.status = 'gameover';
      this._emit('gameover', { score: this.score, lines: this.lines, level: this.level });
      return;
    }

    const clearedRows = this._clearFullLines();
    const clearedCount = clearedRows.length;
    this._applyScoring(clearedCount, isTSpin);

    if (clearedCount > 0) {
      this.lastClearRows = clearedRows;
      this.clearFlashTimer = 220;
    }

    this._emit('lock', { clearedCount, isTSpin, clearedRows });
    this._spawnNextPiece();
  }

  _clearFullLines() {
    const fullRows = [];
    for (let y = 0; y < this.rows; y++) {
      if (this.board[y].every((cell) => cell !== null)) {
        fullRows.push(y);
      }
    }
    if (fullRows.length > 0) {
      const remaining = this.board.filter((_, idx) => !fullRows.includes(idx));
      while (remaining.length < this.rows) {
        remaining.unshift(Array(this.cols).fill(null));
      }
      this.board = remaining;
    }
    return fullRows;
  }

  _applyScoring(clearedCount, isTSpin) {
    let basePoints = 0;
    let label = '';
    const isDifficult = clearedCount === 4 || (isTSpin && clearedCount > 0);

    if (isTSpin) {
      basePoints = TSPIN_SCORES[clearedCount] || 0;
      const names = ['T-SPIN', 'T-SPIN SINGLE', 'T-SPIN DOUBLE', 'T-SPIN TRIPLE'];
      label = names[clearedCount] || 'T-SPIN';
    } else if (clearedCount > 0) {
      basePoints = LINE_SCORES[clearedCount] || 0;
      const names = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS!'];
      label = names[clearedCount] || '';
    }

    if (clearedCount > 0) {
      this.combo++;
      let gained = basePoints * this.level;

      // Back-to-Back 1.5x 加成
      if (isDifficult && this.backToBack) {
        gained = Math.round(gained * 1.5);
        label = `B2B ${label}`;
      }
      this.backToBack = isDifficult;

      // 连击加成
      if (this.combo > 0) {
        gained += 50 * this.combo * this.level;
        label = `${label} · COMBO x${this.combo}`;
      }

      this.score += gained;
      this.lines += clearedCount;

      const newLevel = Math.min(MAX_LEVEL, Math.floor(this.lines / LINES_PER_LEVEL) + 1);
      const leveledUp = newLevel > this.level;
      this.level = newLevel;

      this.lastActionText = `${label} +${gained}`;
      this.actionTextTimer = 1400;

      this._emit('lineClear', {
        clearedCount,
        isTSpin,
        combo: this.combo,
        backToBack: this.backToBack,
        gained,
        leveledUp,
        level: this.level,
      });
    } else {
      this.combo = -1;
      if (isTSpin) {
        const gained = basePoints * this.level;
        this.score += gained;
        this.lastActionText = `${label} +${gained}`;
        this.actionTextTimer = 1100;
      }
    }
  }

  /**
   * 时间步进更新（deltaMs 毫秒）
   */
  update(deltaMs) {
    if (this.clearFlashTimer > 0) {
      this.clearFlashTimer = Math.max(0, this.clearFlashTimer - deltaMs);
      if (this.clearFlashTimer === 0) {
        this.lastClearRows = [];
      }
    }
    if (this.actionTextTimer > 0) {
      this.actionTextTimer = Math.max(0, this.actionTextTimer - deltaMs);
      if (this.actionTextTimer === 0) {
        this.lastActionText = '';
      }
    }

    if (this.status !== 'playing' || !this.activePiece) {
      return;
    }

    const interval = this.getDropInterval();
    this.dropAccumulator += deltaMs;

    while (this.dropAccumulator >= interval) {
      this.dropAccumulator -= interval;
      if (this.isValidPosition(this.activePiece, 0, 1)) {
        this.activePiece.y += 1;
        this.lastActionWasRotate = false;
      } else {
        this.dropAccumulator = 0;
        break;
      }
    }

    if (this.isOnGround(this.activePiece)) {
      this.lockTimer += deltaMs;
      if (this.lockTimer >= LOCK_DELAY_MS) {
        this._lockActivePiece();
      }
    } else {
      this.lockTimer = 0;
    }
  }

  getSnapshot() {
    return {
      status: this.status,
      score: this.score,
      lines: this.lines,
      level: this.level,
      combo: Math.max(0, this.combo),
      backToBack: this.backToBack,
      piecesPlaced: this.piecesPlaced,
      holdPiece: this.holdPiece,
      holdUsed: this.holdUsed,
      nextQueue: [...this.nextQueue],
      activePiece: this.activePiece ? { ...this.activePiece } : null,
      lastActionText: this.lastActionText,
    };
  }
}
