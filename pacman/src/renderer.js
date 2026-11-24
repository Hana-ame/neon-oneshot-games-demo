/**
 * HTML5 Canvas 2D 街机渲染引擎
 * 包含霓虹迷宫墙体、粒子系统、吃豆人/幽灵动画、飘字与状态覆盖层
 */

import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  GAME_STATE,
  GHOST_MODE,
  MAZE_COLS,
  MAZE_ROWS,
  TILE,
  TILE_SIZE,
} from './constants.js';

export class ArcadeRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.canvas.width = CANVAS_WIDTH;
    this.canvas.height = CANVAS_HEIGHT;
    this.particles = [];
    this.elapsed = 0;
  }

  spawnParticles(col, row, color, count = 12) {
    const cx = (col + 0.5) * TILE_SIZE;
    const cy = (row + 0.5) * TILE_SIZE;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const speed = 35 + Math.random() * 85;
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.45 + Math.random() * 0.25,
        maxLife: 0.7,
        size: 2 + Math.random() * 2.5,
        color,
      });
    }
  }

  render(engine, dt = 0.016) {
    this.elapsed += dt;
    const ctx = this.ctx;

    // 背景清空
    ctx.fillStyle = '#070913';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    this._drawMaze(engine);
    this._drawFruit(engine);
    this._drawPacman(engine);
    this._drawGhosts(engine);
    this._updateAndDrawParticles(dt);
    this._drawPopups(engine);
    this._drawStateOverlay(engine);
  }

  _drawMaze(engine) {
    const ctx = this.ctx;
    const { grid } = engine.maze;
    const isFlashClear = engine.state === GAME_STATE.LEVEL_CLEAR && Math.floor(this.elapsed * 8) % 2 === 0;
    const wallStroke = isFlashClear ? '#ffffff' : '#2563eb';
    const wallGlow = isFlashClear ? 'rgba(255,255,255,0.6)' : 'rgba(56, 189, 248, 0.55)';

    ctx.save();
    for (let r = 0; r < MAZE_ROWS; r++) {
      for (let c = 0; c < MAZE_COLS; c++) {
        const tile = grid[r][c];
        const x = c * TILE_SIZE;
        const y = r * TILE_SIZE;

        if (tile === TILE.WALL) {
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          ctx.strokeStyle = wallStroke;
          ctx.lineWidth = 1.6;
          ctx.shadowColor = wallGlow;
          ctx.shadowBlur = 4;
          ctx.strokeRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          ctx.shadowBlur = 0;
        } else if (tile === TILE.GHOST_GATE) {
          ctx.fillStyle = '#f472b6';
          ctx.fillRect(x, y + TILE_SIZE * 0.42, TILE_SIZE, 3);
        } else if (tile === TILE.PELLET) {
          ctx.fillStyle = '#fde68a';
          ctx.beginPath();
          ctx.arc(x + TILE_SIZE / 2, y + TILE_SIZE / 2, 2.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (tile === TILE.POWER) {
          const pulse = 5.2 + Math.sin(this.elapsed * 9) * 1.4;
          ctx.fillStyle = '#fef08a';
          ctx.shadowColor = '#facc15';
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(x + TILE_SIZE / 2, y + TILE_SIZE / 2, pulse, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
    }
    ctx.restore();
  }

  _drawFruit(engine) {
    if (!engine.fruit) return;
    const ctx = this.ctx;
    const cx = (engine.fruit.col + 0.5) * TILE_SIZE;
    const cy = (engine.fruit.row + 0.5) * TILE_SIZE;
    const bob = Math.sin(this.elapsed * 6) * 2;

    ctx.save();
    ctx.shadowColor = engine.fruit.color;
    ctx.shadowBlur = 10;
    ctx.fillStyle = engine.fruit.color;
    ctx.beginPath();
    ctx.arc(cx, cy + bob, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 6 + bob);
    ctx.quadraticCurveTo(cx + 4, cy - 12 + bob, cx + 7, cy - 9 + bob);
    ctx.stroke();
    ctx.restore();
  }

  _drawPacman(engine) {
    const ctx = this.ctx;
    const p = engine.pacman;
    const cx = (p.col + 0.5) * TILE_SIZE;
    const cy = (p.row + 0.5) * TILE_SIZE;
    const radius = TILE_SIZE * 0.45;

    ctx.save();
    ctx.translate(cx, cy);

    if (engine.state === GAME_STATE.DYING) {
      const progress = Math.min(1, Math.max(0, 1 - engine.stateTimer / 1.4));
      const openAngle = Math.PI * progress;
      if (progress < 0.96) {
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius, -Math.PI / 2 + openAngle, Math.PI * 1.5 - openAngle);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      return;
    }

    let angleOffset = 0;
    if (p.dir.name === 'LEFT') angleOffset = Math.PI;
    else if (p.dir.name === 'UP') angleOffset = -Math.PI / 2;
    else if (p.dir.name === 'DOWN') angleOffset = Math.PI / 2;

    ctx.rotate(angleOffset);
    const mouth = p.moving ? 0.08 + Math.abs(Math.sin(p.mouthPhase)) * 0.34 : 0.22;

    ctx.shadowColor = '#facc15';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, mouth * Math.PI, (2 - mouth) * Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  _drawGhosts(engine) {
    const ctx = this.ctx;
    const radius = TILE_SIZE * 0.44;
    const wave = Math.sin(this.elapsed * 14) * 1.6;

    for (const ghost of engine.ghosts) {
      const cx = (ghost.col + 0.5) * TILE_SIZE;
      const cy = (ghost.row + 0.5) * TILE_SIZE;
      ctx.save();
      ctx.translate(cx, cy);

      if (ghost.mode !== GHOST_MODE.EATEN) {
        let bodyColor = ghost.color;
        if (ghost.mode === GHOST_MODE.FRIGHTENED) {
          const flashing = engine.frightenedTimer < 2.0 && Math.floor(this.elapsed * 10) % 2 === 0;
          bodyColor = flashing ? '#e2e8f0' : '#2563eb';
        }

        ctx.shadowColor = bodyColor;
        ctx.shadowBlur = 8;
        ctx.fillStyle = bodyColor;

        // 圆顶 + 波浪裙边
        ctx.beginPath();
        ctx.arc(0, -1, radius, Math.PI, 0, false);
        ctx.lineTo(radius, radius);
        ctx.lineTo(radius * 0.5, radius - 3 + wave * 0.5);
        ctx.lineTo(0, radius);
        ctx.lineTo(-radius * 0.5, radius - 3 - wave * 0.5);
        ctx.lineTo(-radius, radius);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // 眼睛绘制
      if (ghost.mode === GHOST_MODE.FRIGHTENED) {
        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(-3.5, -2, 1.8, 0, Math.PI * 2);
        ctx.arc(3.5, -2, 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fef08a';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(-4.5, 3);
        ctx.lineTo(-2, 1.5);
        ctx.lineTo(0, 3);
        ctx.lineTo(2, 1.5);
        ctx.lineTo(4.5, 3);
        ctx.stroke();
      } else {
        const eyeOffsetX = ghost.dir.x * 1.8;
        const eyeOffsetY = ghost.dir.y * 1.8;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(-3.5, -2.5, 2.8, 3.4, 0, 0, Math.PI * 2);
        ctx.ellipse(3.5, -2.5, 2.8, 3.4, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(-3.5 + eyeOffsetX, -2.5 + eyeOffsetY, 1.5, 0, Math.PI * 2);
        ctx.arc(3.5 + eyeOffsetX, -2.5 + eyeOffsetY, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  _updateAndDrawParticles(dt) {
    const ctx = this.ctx;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.96;
      pt.vy *= 0.96;

      ctx.save();
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
      ctx.restore();
    }
  }

  _drawPopups(engine) {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = 'bold 13px "Courier New", monospace';
    ctx.textAlign = 'center';
    for (const pop of engine.popups) {
      ctx.globalAlpha = Math.min(1, pop.ttl * 1.4);
      ctx.fillStyle = pop.color;
      ctx.fillText(pop.text, (pop.col + 0.5) * TILE_SIZE, (pop.row + 0.5) * TILE_SIZE);
    }
    ctx.restore();
  }

  _drawStateOverlay(engine) {
    const ctx = this.ctx;
    if (engine.state === GAME_STATE.PLAYING || engine.state === GAME_STATE.DYING) return;

    ctx.save();
    if (engine.state === GAME_STATE.READY) {
      ctx.fillStyle = 'rgba(7, 9, 19, 0.55)';
      ctx.fillRect(CANVAS_WIDTH / 2 - 90, 17 * TILE_SIZE - 16, 180, 32);
      ctx.font = 'bold 18px "Courier New", monospace';
      ctx.fillStyle = '#facc15';
      ctx.textAlign = 'center';
      ctx.fillText('READY!', CANVAS_WIDTH / 2, 17 * TILE_SIZE + 6);
      ctx.restore();
      return;
    }

    ctx.fillStyle = 'rgba(7, 9, 19, 0.78)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.textAlign = 'center';

    if (engine.state === GAME_STATE.TITLE) {
      ctx.fillStyle = '#facc15';
      ctx.shadowColor = '#facc15';
      ctx.shadowBlur = 16;
      ctx.font = 'bold 34px "Courier New", monospace';
      ctx.fillText('NEON PAC-ARCADE', CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.36);
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 15px "Courier New", monospace';
      ctx.fillText('经典街机《吃豆人》网页复刻版', CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.43);

      const blink = Math.floor(this.elapsed * 2.5) % 2 === 0;
      if (blink) {
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 16px "Courier New", monospace';
        ctx.fillText('按 ENTER / 点击「投币开始」', CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.55);
      }

      ctx.fillStyle = '#94a3b8';
      ctx.font = '13px "Courier New", monospace';
      ctx.fillText('方向键 / WASD 移动 · P 暂停 · M 静音', CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.64);
    } else if (engine.state === GAME_STATE.PAUSED) {
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 30px "Courier New", monospace';
      ctx.fillText('PAUSED', CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.46);
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '14px "Courier New", monospace';
      ctx.fillText('按 P 或点击「继续」恢复游戏', CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.54);
    } else if (engine.state === GAME_STATE.LEVEL_CLEAR) {
      ctx.fillStyle = '#4ade80';
      ctx.font = 'bold 28px "Courier New", monospace';
      ctx.fillText(`STAGE ${engine.level} CLEAR!`, CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.47);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '14px "Courier New", monospace';
      ctx.fillText('正在载入下一关卡...', CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.55);
    } else if (engine.state === GAME_STATE.GAME_OVER) {
      ctx.fillStyle = '#ff2a54';
      ctx.shadowColor = '#ff2a54';
      ctx.shadowBlur = 14;
      ctx.font = 'bold 34px "Courier New", monospace';
      ctx.fillText('GAME OVER', CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.43);
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#facc15';
      ctx.font = 'bold 18px "Courier New", monospace';
      ctx.fillText(`FINAL SCORE: ${engine.score}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.52);

      ctx.fillStyle = '#cbd5e1';
      ctx.font = '14px "Courier New", monospace';
      ctx.fillText('按 ENTER / 点击「重新开始」再来一局', CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.60);
    }
    ctx.restore();
  }
}
