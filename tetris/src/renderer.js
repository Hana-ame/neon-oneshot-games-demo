/**
 * HTML5 Canvas 2D 高清渲染模块
 * 支持设备像素比缩放（HiDPI）、立体斜角方块、幽灵落点投影、消行闪光与预览画布
 */

import {
  BOARD_COLS,
  VISIBLE_ROWS,
  HIDDEN_ROWS,
  PIECE_COLORS,
  SHAPES,
} from './constants.js';

export class TetrisRenderer {
  constructor(boardCanvas, holdCanvas, nextCanvas) {
    this.boardCanvas = boardCanvas;
    this.boardCtx = boardCanvas.getContext('2d');
    this.holdCanvas = holdCanvas;
    this.holdCtx = holdCanvas.getContext('2d');
    this.nextCanvas = nextCanvas;
    this.nextCtx = nextCanvas.getContext('2d');
    this.showGhost = true;
    this.cellSize = 30;
    this.resize();
  }

  resize() {
    const parent = this.boardCanvas.parentElement;
    const maxW = parent ? Math.max(200, parent.clientWidth - 8) : 300;
    const maxH = Math.max(360, Math.min(620, window.innerHeight - 210));
    const cellFromW = Math.floor(maxW / BOARD_COLS);
    const cellFromH = Math.floor(maxH / VISIBLE_ROWS);
    this.cellSize = Math.max(18, Math.min(34, cellFromW, cellFromH));

    const logicalW = this.cellSize * BOARD_COLS;
    const logicalH = this.cellSize * VISIBLE_ROWS;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.boardCanvas.width = Math.round(logicalW * dpr);
    this.boardCanvas.height = Math.round(logicalH * dpr);
    this.boardCanvas.style.width = `${logicalW}px`;
    this.boardCanvas.style.height = `${logicalH}px`;
    this.boardCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 侧边 HOLD 与 NEXT 画布
    this._setupMiniCanvas(this.holdCanvas, this.holdCtx, 112, 76, dpr);
    this._setupMiniCanvas(this.nextCanvas, this.nextCtx, 112, 224, dpr);
  }

  _setupMiniCanvas(canvas, ctx, w, h, dpr) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  _drawCell(ctx, px, py, size, type, alpha = 1) {
    const palette = PIECE_COLORS[type];
    if (!palette) return;
    const pad = 1;
    const x = px + pad;
    const y = py + pad;
    const s = size - pad * 2;
    const bevel = Math.max(2, Math.round(s * 0.14));

    ctx.save();
    ctx.globalAlpha = alpha;

    // 主体填充
    ctx.fillStyle = palette.fill;
    ctx.fillRect(x, y, s, s);

    // 顶部与左侧高光斜边
    ctx.fillStyle = palette.light;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + s, y);
    ctx.lineTo(x + s - bevel, y + bevel);
    ctx.lineTo(x + bevel, y + bevel);
    ctx.lineTo(x + bevel, y + s - bevel);
    ctx.lineTo(x, y + s);
    ctx.closePath();
    ctx.fill();

    // 底部与右侧阴影斜边
    ctx.fillStyle = palette.dark;
    ctx.beginPath();
    ctx.moveTo(x + s, y);
    ctx.lineTo(x + s, y + s);
    ctx.lineTo(x, y + s);
    ctx.lineTo(x + bevel, y + s - bevel);
    ctx.lineTo(x + s - bevel, y + s - bevel);
    ctx.lineTo(x + s - bevel, y + bevel);
    ctx.closePath();
    ctx.fill();

    // 内部柔和光泽块
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.fillRect(x + bevel + 1, y + bevel + 1, s - bevel * 2 - 2, Math.max(2, (s - bevel * 2) * 0.35));

    ctx.restore();
  }

  _drawGhostCell(ctx, px, py, size, type) {
    const palette = PIECE_COLORS[type];
    if (!palette) return;
    const pad = 2;
    const x = px + pad;
    const y = py + pad;
    const s = size - pad * 2;

    ctx.save();
    ctx.fillStyle = palette.glow;
    ctx.globalAlpha = 0.22;
    ctx.fillRect(x, y, s, s);

    ctx.globalAlpha = 0.78;
    ctx.strokeStyle = palette.fill;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([4, 2]);
    ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
    ctx.restore();
  }

  render(engine) {
    this._renderBoard(engine);
    this._renderHold(engine.holdPiece, engine.holdUsed);
    this._renderNext(engine.nextQueue);
  }

  _renderBoard(engine) {
    const ctx = this.boardCtx;
    const s = this.cellSize;
    const w = BOARD_COLS * s;
    const h = VISIBLE_ROWS * s;

    // 棋盘底色
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#0b1120');
    grad.addColorStop(1, '#0f172a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // 细网格线
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 1; c < BOARD_COLS; c++) {
      ctx.moveTo(c * s + 0.5, 0);
      ctx.lineTo(c * s + 0.5, h);
    }
    for (let r = 1; r < VISIBLE_ROWS; r++) {
      ctx.moveTo(0, r * s + 0.5);
      ctx.lineTo(w, r * s + 0.5);
    }
    ctx.stroke();

    // 已锁定方块
    for (let r = HIDDEN_ROWS; r < engine.rows; r++) {
      const visRow = r - HIDDEN_ROWS;
      for (let c = 0; c < BOARD_COLS; c++) {
        const type = engine.board[r][c];
        if (type) {
          this._drawCell(ctx, c * s, visRow * s, s, type, 1);
        }
      }
    }

    // 幽灵落点投影
    if (this.showGhost && engine.activePiece && engine.status !== 'idle') {
      const ghostCells = engine.getGhostCells();
      for (const [cx, cy] of ghostCells) {
        const visRow = cy - HIDDEN_ROWS;
        if (visRow >= 0 && visRow < VISIBLE_ROWS) {
          this._drawGhostCell(ctx, cx * s, visRow * s, s, engine.activePiece.type);
        }
      }
    }

    // 当前活动方块
    if (engine.activePiece && engine.status !== 'idle') {
      const cells = engine.getPieceCells();
      const lockProgress = engine.isOnGround() ? Math.min(1, engine.lockTimer / 500) : 0;
      const alpha = 1 - lockProgress * 0.25;
      for (const [cx, cy] of cells) {
        const visRow = cy - HIDDEN_ROWS;
        if (visRow >= 0 && visRow < VISIBLE_ROWS) {
          this._drawCell(ctx, cx * s, visRow * s, s, engine.activePiece.type, alpha);
        }
      }
    }

    // 消行闪光反馈
    if (engine.clearFlashTimer > 0 && engine.lastClearRows.length > 0) {
      const ratio = engine.clearFlashTimer / 220;
      ctx.save();
      ctx.fillStyle = `rgba(248, 250, 252, ${ratio * 0.55})`;
      for (const row of engine.lastClearRows) {
        const visRow = row - HIDDEN_ROWS;
        if (visRow >= 0 && visRow < VISIBLE_ROWS) {
          ctx.fillRect(0, visRow * s, w, s);
        }
      }
      ctx.restore();
    }

    // 浮动连击/特技提示
    if (engine.actionTextTimer > 0 && engine.lastActionText) {
      const alpha = Math.min(1, engine.actionTextTimer / 350);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = '700 14px Inter, system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const yPos = h * 0.36 - (1 - alpha) * 14;
      const metrics = ctx.measureText(engine.lastActionText);
      const pillW = Math.min(w - 16, metrics.width + 24);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
      this._roundRect(ctx, (w - pillW) / 2, yPos - 15, pillW, 30, 15);
      ctx.fill();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(engine.lastActionText, w / 2, yPos);
      ctx.restore();
    }
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  _drawCenteredPiece(ctx, type, boxX, boxY, boxW, boxH, cellSize, alpha = 1) {
    if (!type) return;
    const shape = SHAPES[type][0];
    let minX = 4;
    let maxX = 0;
    let minY = 4;
    let maxY = 0;
    for (const [x, y] of shape) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const pw = (maxX - minX + 1) * cellSize;
    const ph = (maxY - minY + 1) * cellSize;
    const offsetX = boxX + (boxW - pw) / 2 - minX * cellSize;
    const offsetY = boxY + (boxH - ph) / 2 - minY * cellSize;

    for (const [x, y] of shape) {
      this._drawCell(ctx, offsetX + x * cellSize, offsetY + y * cellSize, cellSize, type, alpha);
    }
  }

  _renderHold(holdPiece, holdUsed) {
    const ctx = this.holdCtx;
    ctx.clearRect(0, 0, 112, 76);
    if (!holdPiece) {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
      ctx.font = '500 12px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('空槽位 (C)', 56, 38);
      return;
    }
    this._drawCenteredPiece(ctx, holdPiece, 0, 0, 112, 76, 20, holdUsed ? 0.42 : 1);
  }

  _renderNext(nextQueue) {
    const ctx = this.nextCtx;
    ctx.clearRect(0, 0, 112, 224);
    const slotH = 72;
    for (let i = 0; i < Math.min(3, nextQueue.length); i++) {
      const y0 = i * slotH + 4;
      if (i > 0) {
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
        ctx.beginPath();
        ctx.moveTo(12, y0 - 2);
        ctx.lineTo(100, y0 - 2);
        ctx.stroke();
      }
      this._drawCenteredPiece(ctx, nextQueue[i], 0, y0, 112, slotH - 6, 19, i === 0 ? 1 : 0.86);
    }
  }
}
