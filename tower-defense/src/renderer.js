/**
 * HTML5 Canvas 2D 战场渲染器
 */

import { COLS, ROWS, TILE, LOGICAL_W, LOGICAL_H, TOWER_MAP } from './config.js';

export class GameRenderer {
  constructor(canvas, container, engine) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.container = container;
    this.engine = engine;
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.ctx.setTransform(this.canvas.width / LOGICAL_W, 0, 0, this.canvas.height / LOGICAL_H, 0, 0);
    this.draw();
  }

  clientToCell(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const lx = ((clientX - rect.left) / rect.width) * LOGICAL_W;
    const ly = ((clientY - rect.top) / rect.height) * LOGICAL_H;
    const c = Math.floor(lx / TILE);
    const r = Math.floor(ly / TILE);
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
    return { c, r };
  }

  draw() {
    const ctx = this.ctx;
    const engine = this.engine;
    const state = engine.state;

    ctx.save();
    if (state.shakeTime > 0) {
      const mag = state.shakeTime * 18;
      ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
    }

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);

    // Grid tiles
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = c * TILE;
        const y = r * TILE;
        const isPath = engine.pathTiles.has(`${c},${r}`);
        if (isPath) {
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(x, y, TILE, TILE);
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
          ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
        } else {
          ctx.fillStyle = (c + r) % 2 === 0 ? '#111c33' : '#0e172a';
          ctx.fillRect(x, y, TILE, TILE);
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.07)';
          ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
        }
      }
    }

    // Paths & Spawn Portals
    engine.pixelPaths.forEach((pts) => {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
      ctx.lineWidth = 22;
      ctx.beginPath();
      pts.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 14]);
      ctx.lineDashOffset = -(state.time * 38);
      ctx.beginPath();
      pts.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
      ctx.restore();

      const start = pts[0];
      const pulse = 0.85 + Math.sin(state.time * 4) * 0.15;
      ctx.save();
      ctx.fillStyle = 'rgba(244, 63, 94, 0.22)';
      ctx.beginPath();
      ctx.arc(start.x, start.y, 22 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fb7185';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(start.x, start.y, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#fecdd3';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('入口', start.x, start.y);
      ctx.restore();
    });

    // Base core
    const endPt = engine.pixelPaths[0][engine.pixelPaths[0].length - 1];
    ctx.save();
    const corePulse = 0.9 + Math.sin(state.time * 3) * 0.1;
    ctx.fillStyle = 'rgba(14, 165, 233, 0.22)';
    ctx.beginPath();
    ctx.arc(endPt.x, endPt.y, 24 * corePulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0284c7';
    ctx.strokeStyle = '#7dd3fc';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(endPt.x, endPt.y, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('核心', endPt.x, endPt.y);
    ctx.restore();

    // Hover placement preview
    if (state.hoverCell && state.selectedBuildId && !state.gameOver) {
      const { c, r } = state.hoverCell;
      const valid = engine.isCellBuildable(c, r);
      const def = TOWER_MAP[state.selectedBuildId];
      const ok = valid && state.gold >= def.cost;
      const cx = c * TILE + TILE / 2;
      const cy = r * TILE + TILE / 2;

      ctx.save();
      ctx.fillStyle = ok ? 'rgba(56, 189, 248, 0.18)' : 'rgba(244, 63, 94, 0.22)';
      ctx.strokeStyle = ok ? '#38bdf8' : '#f43f5e';
      ctx.lineWidth = 2;
      ctx.fillRect(c * TILE + 2, r * TILE + 2, TILE - 4, TILE - 4);
      ctx.strokeRect(c * TILE + 2, r * TILE + 2, TILE - 4, TILE - 4);

      if (ok) {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.arc(cx, cy, def.levels[0].range, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    // Selected tower range
    if (state.selectedTower) {
      const t = state.selectedTower;
      const range = TOWER_MAP[t.type].levels[t.level].range;
      ctx.save();
      ctx.fillStyle = 'rgba(56, 189, 248, 0.09)';
      ctx.strokeStyle = 'rgba(125, 211, 252, 0.65)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(t.x, t.y, range, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    state.towers.forEach((t) => this._drawTower(t));
    state.enemies.forEach((e) => this._drawEnemy(e));
    this._drawBeams(state.beams);
    this._drawProjectiles(state.projectiles);
    this._drawParticles(state.particles);
    this._drawFloatingTexts(state.floatingTexts);

    ctx.restore();
  }

  _drawTower(t) {
    const ctx = this.ctx;
    const state = this.engine.state;
    const def = TOWER_MAP[t.type];
    const isSel = state.selectedTower && state.selectedTower.id === t.id;
    ctx.save();
    ctx.translate(t.x, t.y);

    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = isSel ? '#38bdf8' : '#475569';
    ctx.lineWidth = isSel ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.roundRect(-21, -21, 42, 42, 8);
    ctx.fill();
    ctx.stroke();

    ctx.save();
    if (t.type !== 'tesla') ctx.rotate(t.angle);
    const kick = -t.recoil * 3.5;

    if (t.type === 'gatling') {
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(4 + kick, -5, 16, 3.5);
      ctx.fillRect(4 + kick, 1.5, 16, 3.5);
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();
    } else if (t.type === 'frost') {
      ctx.fillStyle = def.color;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        const r = i % 2 === 0 ? 15 : 9;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ecfeff';
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fill();
    } else if (t.type === 'cannon') {
      ctx.fillStyle = '#475569';
      ctx.fillRect(2 + kick, -6.5, 19, 13);
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.arc(-1, 0, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffedd5';
      ctx.beginPath();
      ctx.arc(-1, 0, 5, 0, Math.PI * 2);
      ctx.fill();
    } else if (t.type === 'tesla') {
      ctx.strokeStyle = def.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#e9d5ff';
      ctx.beginPath();
      ctx.arc(0, 0, 6.5 + Math.sin(state.time * 8) * 1.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (t.type === 'laser') {
      ctx.fillStyle = '#334155';
      ctx.fillRect(4, -4, 17, 8);
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.moveTo(13, 0);
      ctx.lineTo(-10, -11);
      ctx.lineTo(-6, 0);
      ctx.lineTo(-10, 11);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    for (let i = 0; i <= t.level; i++) {
      const sx = -8 + i * 8;
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(sx, 16, 2.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawEnemy(e) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(e.x, e.y);

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, e.radius * 0.75, e.radius * 0.9, e.radius * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : e.color;
    ctx.strokeStyle = e.slowTimer > 0 ? '#22d3ee' : '#0f172a';
    ctx.lineWidth = e.slowTimer > 0 ? 2.5 : 1.5;

    if (e.isBoss || e.type === 'tank') {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const px = Math.cos(a) * e.radius;
        const py = Math.sin(a) * e.radius;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (e.type === 'sprinter') {
      ctx.beginPath();
      ctx.moveTo(0, -e.radius);
      ctx.lineTo(e.radius, 0);
      ctx.lineTo(0, e.radius);
      ctx.lineTo(-e.radius, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    if (e.heals) {
      ctx.fillStyle = '#052e16';
      ctx.fillRect(-2, -6, 4, 12);
      ctx.fillRect(-6, -2, 12, 4);
    }

    const bw = Math.max(24, e.radius * 2.1);
    const bh = e.isBoss ? 5 : 3.5;
    const bx = -bw / 2;
    const by = -e.radius - 9;
    const ratio = Math.max(0, e.hp / e.maxHp);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    ctx.fillStyle = ratio > 0.5 ? '#4ade80' : ratio > 0.25 ? '#facc15' : '#f43f5e';
    ctx.fillRect(bx, by, bw * ratio, bh);

    ctx.restore();
  }

  _drawBeams(beams) {
    const ctx = this.ctx;
    beams.forEach((b) => {
      const alpha = Math.max(0, b.life / b.maxLife);
      ctx.save();
      if (b.type === 'laser') {
        ctx.strokeStyle = b.color;
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = b.width;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(b.x1, b.y1);
        ctx.lineTo(b.x2, b.y2);
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1, b.width * 0.38);
        ctx.stroke();
      } else if (b.type === 'lightning') {
        ctx.strokeStyle = b.color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        for (let i = 0; i < b.points.length - 1; i++) {
          const p1 = b.points[i];
          const p2 = b.points[i + 1];
          const midX = (p1.x + p2.x) / 2 + (Math.random() - 0.5) * 14;
          const midY = (p1.y + p2.y) / 2 + (Math.random() - 0.5) * 14;
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(midX, midY);
          ctx.lineTo(p2.x, p2.y);
        }
        ctx.stroke();
      } else if (b.type === 'ring') {
        ctx.strokeStyle = b.color;
        ctx.globalAlpha = alpha * 0.7;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * (1.05 - alpha * 0.35), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    });
  }

  _drawProjectiles(projectiles) {
    const ctx = this.ctx;
    projectiles.forEach((p) => {
      ctx.save();
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      const rad = p.type === 'cannon' ? 5.5 : p.type === 'frost' ? 4.5 : 3.2;
      ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  _drawParticles(particles) {
    const ctx = this.ctx;
    particles.forEach((pt) => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  _drawFloatingTexts(texts) {
    const ctx = this.ctx;
    texts.forEach((ft) => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, ft.life / ft.maxLife);
      ctx.font = `bold ${ft.size}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#0f172a';
      ctx.fillText(ft.text, ft.x + 1, ft.y + 1);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    });
  }
}
