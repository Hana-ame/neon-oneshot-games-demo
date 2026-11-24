/**
 * HTML5 Canvas 2D 渲染器
 * 光圈实验室工业风视觉呈现：白色月岩面板、深灰金属墙、动态椭圆传送门、瞄准射线、同伴方块与粒子
 */

import { TILE, TILE_SIZE, WORLD_WIDTH, WORLD_HEIGHT, COLORS } from './constants.js';

export class PortalRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.time = 0;
  }

  render(engine, dt = 1 / 60) {
    this.time += dt;
    const ctx = this.ctx;
    ctx.save();

    // 1. 实验室背景与精密网格
    this.drawChamberBackground(ctx);

    // 2. 地图瓦片（可传送面板、金属墙、腐蚀液池、解离栅栏）
    this.drawTiles(ctx, engine.level.grid);

    // 3. 按钮连线与出口大门
    this.drawIndicatorWires(ctx, engine);
    this.drawExitDoor(ctx, engine);
    this.drawButtons(ctx, engine.buttons);

    // 4. 瞄准激光与落点预览
    this.drawAimLaser(ctx, engine);

    // 5. 蓝/橙双色传送门
    if (engine.portals.blue) this.drawPortal(ctx, engine.portals.blue);
    if (engine.portals.orange) this.drawPortal(ctx, engine.portals.orange);

    // 6. 同伴方块与测试者角色
    this.drawCubes(ctx, engine.cubes, engine.player.carryingCubeId);
    this.drawPlayer(ctx, engine);

    // 7. 粒子特效
    this.drawParticles(ctx, engine.particles);

    ctx.restore();
  }

  drawChamberBackground(ctx) {
    ctx.fillStyle = COLORS.CHAMBER_BG;
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    // 细网格线
    ctx.strokeStyle = COLORS.CHAMBER_GRID;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= WORLD_WIDTH; x += TILE_SIZE) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, WORLD_HEIGHT);
    }
    for (let y = 0; y <= WORLD_HEIGHT; y += TILE_SIZE) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(WORLD_WIDTH, y + 0.5);
    }
    ctx.stroke();

    // 光圈实验室水印标识
    ctx.save();
    ctx.fillStyle = 'rgba(100, 116, 139, 0.08)';
    ctx.font = '700 44px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('APERTURE WEB LAB', WORLD_WIDTH / 2, WORLD_HEIGHT / 2 + 16);
    ctx.restore();
  }

  drawTiles(ctx, grid) {
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        const t = grid[r][c];
        const x = c * TILE_SIZE;
        const y = r * TILE_SIZE;

        if (t === TILE.PORTAL_WALL) {
          ctx.fillStyle = COLORS.PORTAL_WALL_FILL;
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          ctx.strokeStyle = COLORS.PORTAL_WALL_STROKE;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          // 四角微铆钉
          ctx.fillStyle = '#CBD5E1';
          ctx.fillRect(x + 4, y + 4, 2, 2);
          ctx.fillRect(x + TILE_SIZE - 6, y + 4, 2, 2);
          ctx.fillRect(x + 4, y + TILE_SIZE - 6, 2, 2);
          ctx.fillRect(x + TILE_SIZE - 6, y + TILE_SIZE - 6, 2, 2);
        } else if (t === TILE.METAL_WALL) {
          ctx.fillStyle = COLORS.METAL_WALL_FILL;
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          ctx.strokeStyle = COLORS.METAL_WALL_STROKE;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
          // 工业斜纹细节
          ctx.fillStyle = 'rgba(255,255,255,0.05)';
          ctx.fillRect(x + 4, y + 4, TILE_SIZE - 8, 4);
        } else if (t === TILE.HAZARD) {
          const wave = Math.sin(this.time * 4 + c * 0.9) * 3;
          ctx.fillStyle = '#065F46';
          ctx.fillRect(x, y + 6, TILE_SIZE, TILE_SIZE - 6);
          ctx.fillStyle = '#10B981';
          ctx.fillRect(x, y + 8 + wave * 0.5, TILE_SIZE, 8);
          ctx.fillStyle = 'rgba(167, 243, 208, 0.55)';
          ctx.fillRect(x + 4, y + 10 + wave * 0.5, TILE_SIZE - 8, 2);
        } else if (t === TILE.FIZZLER) {
          const pulse = 0.25 + 0.15 * Math.sin(this.time * 8 + r);
          ctx.fillStyle = `rgba(56, 189, 248, ${pulse.toFixed(2)})`;
          ctx.fillRect(x + 12, y, TILE_SIZE - 24, TILE_SIZE);
          ctx.strokeStyle = '#38BDF8';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x + TILE_SIZE / 2, y);
          ctx.lineTo(x + TILE_SIZE / 2, y + TILE_SIZE);
          ctx.stroke();
        }
      }
    }
  }

  drawIndicatorWires(ctx, engine) {
    if (!engine.buttons.length) return;
    const exitCx = engine.level.exitRect.x + engine.level.exitRect.w / 2;
    const exitCy = engine.level.exitRect.y + engine.level.exitRect.h;

    for (const btn of engine.buttons) {
      const bx = btn.x + btn.w / 2;
      const by = btn.y + btn.h;
      ctx.save();
      ctx.strokeStyle = btn.pressed ? '#00A8FF' : '#F97316';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(bx, by + 4);
      ctx.lineTo(exitCx, by + 4);
      ctx.lineTo(exitCx, exitCy);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawButtons(ctx, buttons) {
    for (const btn of buttons) {
      // 底座
      ctx.fillStyle = '#334155';
      ctx.fillRect(btn.x - 3, btn.y + 4, btn.w + 6, 5);
      // 红色/绿色压板
      const pressOffset = btn.pressed ? 3 : 0;
      ctx.fillStyle = btn.pressed ? '#22C55E' : '#EF4444';
      ctx.fillRect(btn.x, btn.y + pressOffset, btn.w, btn.h - pressOffset);
    }
  }

  drawExitDoor(ctx, engine) {
    const r = engine.level.exitRect;
    // 门框
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(r.x - 4, r.y - 6, r.w + 8, r.h + 6);

    if (engine.doorOpen) {
      // 开启状态：发光通道
      const grad = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
      grad.addColorStop(0, '#0EA5E9');
      grad.addColorStop(1, '#10B981');
      ctx.fillStyle = grad;
      ctx.fillRect(r.x + 2, r.y, r.w - 4, r.h);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '700 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('EXIT', r.x + r.w / 2, r.y + 20);
    } else {
      // 关闭状态：双重金属闸门
      ctx.fillStyle = '#475569';
      ctx.fillRect(r.x + 2, r.y, r.w - 4, r.h);
      ctx.strokeStyle = '#94A3B8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(r.x + r.w / 2, r.y);
      ctx.lineTo(r.x + r.w / 2, r.y + r.h);
      ctx.stroke();
    }

    // 顶部状态灯
    ctx.fillStyle = engine.doorOpen ? '#22C55E' : '#EF4444';
    ctx.beginPath();
    ctx.arc(r.x + r.w / 2, r.y - 12, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  drawAimLaser(ctx, engine) {
    if (engine.status !== 'playing' || !engine.aimPreview) return;
    const origin = engine.getPlayerGunOrigin();
    const hit = engine.aimPreview;

    ctx.save();
    ctx.strokeStyle = hit.portalable ? 'rgba(0, 168, 255, 0.38)' : 'rgba(239, 68, 68, 0.28)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(hit.x, hit.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // 落点准星
    ctx.fillStyle = hit.portalable ? '#00A8FF' : '#EF4444';
    ctx.beginPath();
    ctx.arc(hit.x, hit.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawPortal(ctx, portal) {
    const isBlue = portal.color === 'blue';
    const coreColor = isBlue ? COLORS.BLUE_PORTAL : COLORS.ORANGE_PORTAL;
    const glowColor = isBlue ? COLORS.BLUE_GLOW : COLORS.ORANGE_GLOW;
    const isVertical = Math.abs(portal.nx) === 1;
    const pulse = 1 + Math.sin(this.time * 9) * 0.06;

    ctx.save();
    ctx.translate(portal.x + portal.nx * 2, portal.y + portal.ny * 2);
    if (!isVertical) ctx.rotate(Math.PI / 2);

    // 外发光光晕
    ctx.shadowColor = coreColor;
    ctx.shadowBlur = 16;

    // 外环
    ctx.fillStyle = glowColor;
    ctx.beginPath();
    ctx.ellipse(0, 0, 11 * pulse, portal.halfSpan * pulse, 0, 0, Math.PI * 2);
    ctx.fill();

    // 核心漩涡边框
    ctx.strokeStyle = coreColor;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, portal.halfSpan - 2, 0, 0, Math.PI * 2);
    ctx.stroke();

    // 内部空间暗核
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.ellipse(0, 0, 4.5, portal.halfSpan - 6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  drawCubes(ctx, cubes, carryingId) {
    for (const c of cubes) {
      ctx.save();
      if (c.id === carryingId) {
        ctx.shadowColor = '#00A8FF';
        ctx.shadowBlur = 10;
      }
      // 主体外壳
      ctx.fillStyle = '#E2E8F0';
      ctx.fillRect(c.x, c.y, c.w, c.h);
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2;
      ctx.strokeRect(c.x + 1, c.y + 1, c.w - 2, c.h - 2);

      // 四角金属护角
      ctx.fillStyle = '#64748B';
      ctx.fillRect(c.x, c.y, 6, 6);
      ctx.fillRect(c.x + c.w - 6, c.y, 6, 6);
      ctx.fillRect(c.x, c.y + c.h - 6, 6, 6);
      ctx.fillRect(c.x + c.w - 6, c.y + c.h - 6, 6, 6);

      // 标志性粉色爱心徽章
      const cx = c.x + c.w / 2;
      const cy = c.y + c.h / 2;
      ctx.fillStyle = '#EC4899';
      ctx.beginPath();
      ctx.arc(cx - 3, cy - 1.5, 3.2, 0, Math.PI * 2);
      ctx.arc(cx + 3, cy - 1.5, 3.2, 0, Math.PI * 2);
      ctx.moveTo(cx - 6, cy);
      ctx.lineTo(cx, cy + 6.5);
      ctx.lineTo(cx + 6, cy);
      ctx.fill();
      ctx.restore();
    }
  }

  drawPlayer(ctx, engine) {
    const p = engine.player;
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;

    ctx.save();
    // 橙色光圈实验服主体
    ctx.fillStyle = '#F97316';
    ctx.beginPath();
    ctx.roundRect(p.x + 3, p.y + 12, p.w - 6, p.h - 14, 5);
    ctx.fill();
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 白色腿部减震靴
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(p.x + 4, p.y + p.h - 8, 6, 8);
    ctx.fillRect(p.x + p.w - 10, p.y + p.h - 8, 6, 8);

    // 头部
    ctx.fillStyle = '#1E293B';
    ctx.beginPath();
    ctx.arc(cx, p.y + 8, 7.5, 0, Math.PI * 2);
    ctx.fill();

    // 护目镜亮条
    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(cx + (p.facing > 0 ? 1 : -6), p.y + 6, 5, 3);

    // 传送门枪（指向瞄准方向）
    const gunOrigin = engine.getPlayerGunOrigin();
    const angle = Math.atan2(engine.input.aimY - gunOrigin.y, engine.input.aimX - gunOrigin.x);
    ctx.translate(gunOrigin.x, gunOrigin.y);
    ctx.rotate(angle);
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-2, -4, 18, 8, 3);
    ctx.fill();
    ctx.stroke();
    // 枪身指示灯
    ctx.fillStyle = '#00A8FF';
    ctx.fillRect(4, -2, 6, 4);
    ctx.restore();
  }

  drawParticles(ctx, particles) {
    for (const pt of particles) {
      const alpha = Math.max(0, pt.life / pt.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
