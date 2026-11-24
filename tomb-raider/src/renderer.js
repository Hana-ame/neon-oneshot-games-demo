/**
 * Canvas 2D 渲染引擎
 * 包含多层视差古墓背景、程序化砖石纹理、劳拉角色动画、动态火把光影与粒子特效
 */

import { TILE, TILE_SIZE, PALETTE } from './constants.js';

export class TombRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.lightCanvas = document.createElement('canvas');
    this.lightCtx = this.lightCanvas.getContext('2d');
    this.viewW = 960;
    this.viewH = 540;
  }

  resize(width, height) {
    this.viewW = Math.max(320, Math.floor(width));
    this.viewH = Math.max(240, Math.floor(height));
    this.canvas.width = this.viewW;
    this.canvas.height = this.viewH;
    this.lightCanvas.width = this.viewW;
    this.lightCanvas.height = this.viewH;
  }

  render(engine) {
    const ctx = this.ctx;
    const lvl = engine.level;
    const p = engine.player;

    // 摄像机平滑跟随与边界钳制
    const targetCamX = p.x + p.w * 0.5 - this.viewW * 0.5;
    const targetCamY = p.y + p.h * 0.5 - this.viewH * 0.52;
    const maxCamX = Math.max(0, lvl.width - this.viewW);
    const maxCamY = Math.max(0, lvl.height - this.viewH);

    engine.camera.x += (Math.max(0, Math.min(maxCamX, targetCamX)) - engine.camera.x) * 0.14;
    engine.camera.y += (Math.max(0, Math.min(maxCamY, targetCamY)) - engine.camera.y) * 0.14;

    const shakeX = engine.shakeTimer > 0 ? (Math.random() - 0.5) * engine.shakeIntensity * 2 : 0;
    const shakeY = engine.shakeTimer > 0 ? (Math.random() - 0.5) * engine.shakeIntensity * 2 : 0;
    const camX = Math.floor(engine.camera.x + shakeX);
    const camY = Math.floor(engine.camera.y + shakeY);

    // 1. 视差背景
    this.drawParallaxBackground(ctx, camX, engine.time);

    ctx.save();
    ctx.translate(-camX, -camY);

    // 2. 地图瓦片
    this.drawTiles(ctx, lvl, camX, camY, engine.time);

    // 3. 存档点、出口圣门、压板、拉杆、石门
    this.drawCheckpoints(ctx, lvl, engine.time);
    this.drawExitPortal(ctx, lvl, engine.time);
    this.drawPlatesAndLevers(ctx, lvl);
    this.drawDoors(ctx, lvl);
    this.drawCrates(ctx, lvl);

    // 4. 收藏品
    this.drawRelicsAndMedipacks(ctx, lvl, engine.time);

    // 5. 滚石与敌人、Boss
    this.drawBoulders(ctx, lvl);
    this.drawEnemies(ctx, lvl, engine.time);
    this.drawBoss(ctx, lvl, engine.time);

    // 6. 劳拉角色
    this.drawLara(ctx, p, engine.time);

    // 7. 子弹、敌方投射物、粒子与飘字
    this.drawProjectiles(ctx, engine);
    this.drawParticles(ctx, engine);
    this.drawFloatingTexts(ctx, engine);

    ctx.restore();

    // 8. 动态火把与古墓暗场光影层
    this.drawDynamicLighting(ctx, engine, camX, camY);
  }

  drawParallaxBackground(ctx, camX, time) {
    const grad = ctx.createLinearGradient(0, 0, 0, this.viewH);
    grad.addColorStop(0, PALETTE.bgTop);
    grad.addColorStop(1, PALETTE.bgBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    // 远景石柱
    ctx.fillStyle = 'rgba(42, 35, 29, 0.55)';
    const pillarSpacing = 170;
    const offset = -(camX * 0.25) % pillarSpacing;
    for (let x = offset - pillarSpacing; x < this.viewW + pillarSpacing; x += pillarSpacing) {
      ctx.fillRect(x, 0, 38, this.viewH);
      ctx.fillStyle = 'rgba(65, 54, 44, 0.35)';
      ctx.fillRect(x + 8, 0, 8, this.viewH);
      ctx.fillStyle = 'rgba(42, 35, 29, 0.55)';
    }

    // 漂浮尘埃微粒
    ctx.fillStyle = 'rgba(245, 210, 140, 0.16)';
    for (let i = 0; i < 24; i++) {
      const px = ((i * 97 + time * 12 - camX * 0.15) % this.viewW + this.viewW) % this.viewW;
      const py = ((i * 53 + Math.sin(time + i) * 18) % this.viewH + this.viewH) % this.viewH;
      ctx.beginPath();
      ctx.arc(px, py, 1.5 + (i % 2), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawTiles(ctx, lvl, camX, camY, time) {
    const startCol = Math.max(0, Math.floor(camX / TILE_SIZE) - 1);
    const endCol = Math.min(lvl.cols - 1, Math.ceil((camX + this.viewW) / TILE_SIZE) + 1);
    const startRow = Math.max(0, Math.floor(camY / TILE_SIZE) - 1);
    const endRow = Math.min(lvl.rows - 1, Math.ceil((camY + this.viewH) / TILE_SIZE) + 1);

    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const t = lvl.grid[r][c];
        if (t === TILE.EMPTY) continue;
        const x = c * TILE_SIZE;
        const y = r * TILE_SIZE;

        if (t === TILE.SOLID || t === TILE.MOSS_SOLID) {
          ctx.fillStyle = PALETTE.stoneDark;
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          ctx.fillStyle = PALETTE.stoneMid;
          ctx.fillRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          // 砖石接缝
          ctx.strokeStyle = 'rgba(15, 12, 10, 0.45)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          ctx.beginPath();
          ctx.moveTo(x, y + TILE_SIZE * 0.5);
          ctx.lineTo(x + TILE_SIZE, y + TILE_SIZE * 0.5);
          ctx.stroke();

          if (t === TILE.MOSS_SOLID && (r === 0 || lvl.grid[r - 1][c] === TILE.EMPTY)) {
            ctx.fillStyle = PALETTE.moss;
            ctx.fillRect(x, y, TILE_SIZE, 8);
            ctx.fillStyle = PALETTE.mossLight;
            ctx.fillRect(x + 4, y + 2, TILE_SIZE - 10, 3);
          }
        } else if (t === TILE.PLATFORM) {
          ctx.fillStyle = '#6e5b47';
          ctx.fillRect(x, y, TILE_SIZE, 11);
          ctx.fillStyle = '#947c62';
          ctx.fillRect(x + 2, y + 2, TILE_SIZE - 4, 4);
        } else if (t === TILE.VINE) {
          ctx.strokeStyle = '#3b7a48';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(x + TILE_SIZE * 0.5, y);
          ctx.lineTo(x + TILE_SIZE * 0.5 + Math.sin(time * 2 + r) * 2, y + TILE_SIZE);
          ctx.stroke();
          ctx.fillStyle = '#5ca367';
          ctx.fillRect(x + TILE_SIZE * 0.5 - 8, y + 10, 7, 4);
          ctx.fillRect(x + TILE_SIZE * 0.5 + 2, y + 24, 7, 4);
        } else if (t === TILE.SPIKES) {
          ctx.fillStyle = '#9ca3af';
          for (let i = 0; i < 3; i++) {
            const sx = x + i * (TILE_SIZE / 3);
            ctx.beginPath();
            ctx.moveTo(sx + 1, y + TILE_SIZE);
            ctx.lineTo(sx + TILE_SIZE / 6, y + 12);
            ctx.lineTo(sx + TILE_SIZE / 3 - 1, y + TILE_SIZE);
            ctx.closePath();
            ctx.fill();
          }
        } else if (t === TILE.WATER) {
          ctx.fillStyle = 'rgba(20, 128, 120, 0.72)';
          ctx.fillRect(x, y + 6, TILE_SIZE, TILE_SIZE - 6);
          ctx.fillStyle = 'rgba(94, 234, 212, 0.45)';
          const wave = Math.sin(time * 4 + c) * 2;
          ctx.fillRect(x, y + 6 + wave, TILE_SIZE, 4);
        } else if (t === TILE.TORCH) {
          const tx = x + TILE_SIZE * 0.5;
          const ty = y + TILE_SIZE * 0.5;
          ctx.fillStyle = '#5c4033';
          ctx.fillRect(tx - 3, ty, 6, 16);
          const flicker = Math.sin(time * 14 + c) * 2.5;
          ctx.fillStyle = '#f97316';
          ctx.beginPath();
          ctx.arc(tx, ty - 2, 7 + flicker * 0.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = PALETTE.torchCore;
          ctx.beginPath();
          ctx.arc(tx, ty - 3, 3.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (t === TILE.CRUMBLE) {
          const cb = lvl.crumbleBlocks.find((b) => b.col === c && b.row === r);
          if (cb && cb.state !== 'gone') {
            const jx = cb.state === 'shaking' ? (Math.random() - 0.5) * 4 : 0;
            ctx.fillStyle = '#735c47';
            ctx.fillRect(x + jx, y, TILE_SIZE, TILE_SIZE * 0.65);
            ctx.strokeStyle = '#261e17';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x + 8 + jx, y + 2);
            ctx.lineTo(x + 18 + jx, y + 14);
            ctx.lineTo(x + 28 + jx, y + 22);
            ctx.stroke();
          }
        }
      }
    }
  }

  drawCheckpoints(ctx, lvl, time) {
    for (const cp of lvl.checkpoints) {
      ctx.fillStyle = '#57534e';
      ctx.fillRect(cp.x - 12, cp.y - 12, 24, 12);
      if (cp.activated) {
        const fl = Math.sin(time * 12) * 3;
        ctx.fillStyle = '#fb923c';
        ctx.beginPath();
        ctx.arc(cp.x, cp.y - 20, 10 + fl * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(cp.x, cp.y - 20, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawExitPortal(ctx, lvl, time) {
    const ex = lvl.exit;
    const pulse = Math.sin(time * 4) * 0.15 + 0.85;
    ctx.fillStyle = '#4a3d2f';
    ctx.fillRect(ex.x - 4, ex.y - 6, ex.w + 8, ex.h + 6);
    const grad = ctx.createRadialGradient(
      ex.x + ex.w / 2,
      ex.y + ex.h / 2,
      6,
      ex.x + ex.w / 2,
      ex.y + ex.h / 2,
      ex.h * 0.65
    );
    grad.addColorStop(0, `rgba(254, 240, 138, ${pulse})`);
    grad.addColorStop(0.6, 'rgba(245, 158, 11, 0.72)');
    grad.addColorStop(1, 'rgba(120, 53, 15, 0.3)');
    ctx.fillStyle = grad;
    ctx.fillRect(ex.x + 4, ex.y + 4, ex.w - 8, ex.h - 4);
  }

  drawPlatesAndLevers(ctx, lvl) {
    for (const pl of lvl.plates) {
      ctx.fillStyle = pl.pressed ? '#22c55e' : '#eab308';
      const offsetY = pl.pressed ? 4 : 0;
      ctx.fillRect(pl.x + 2, pl.y + offsetY, pl.w - 4, pl.h - offsetY);
    }

    for (const lv of lvl.levers) {
      ctx.fillStyle = '#475569';
      ctx.fillRect(lv.x + 4, lv.y + lv.h - 10, lv.w - 8, 10);
      ctx.strokeStyle = lv.activated ? '#38bdf8' : '#f59e0b';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(lv.x + lv.w / 2, lv.y + lv.h - 10);
      ctx.lineTo(lv.x + lv.w / 2 + (lv.activated ? 10 : -10), lv.y + 4);
      ctx.stroke();
      ctx.fillStyle = lv.activated ? '#38bdf8' : '#ef4444';
      ctx.beginPath();
      ctx.arc(lv.x + lv.w / 2 + (lv.activated ? 10 : -10), lv.y + 4, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawDoors(ctx, lvl) {
    for (const d of lvl.doors) {
      const h = d.h * (1 - d.openProgress);
      if (h <= 2) continue;
      ctx.fillStyle = '#334155';
      ctx.fillRect(d.x, d.y, d.w, h);
      ctx.strokeStyle = PALETTE.runeBlue;
      ctx.lineWidth = 2;
      ctx.strokeRect(d.x + 3, d.y + 3, d.w - 6, Math.max(0, h - 6));
    }
  }

  drawCrates(ctx, lvl) {
    for (const cr of lvl.crates) {
      ctx.fillStyle = '#7c5e3c';
      ctx.fillRect(cr.x, cr.y, cr.w, cr.h);
      ctx.strokeStyle = '#3f2e1c';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(cr.x + 1, cr.y + 1, cr.w - 2, cr.h - 2);
      ctx.beginPath();
      ctx.moveTo(cr.x + 4, cr.y + 4);
      ctx.lineTo(cr.x + cr.w - 4, cr.y + cr.h - 4);
      ctx.moveTo(cr.x + cr.w - 4, cr.y + 4);
      ctx.lineTo(cr.x + 4, cr.y + cr.h - 4);
      ctx.stroke();
    }
  }

  drawRelicsAndMedipacks(ctx, lvl, time) {
    for (const r of lvl.relics) {
      if (r.collected) continue;
      const bob = Math.sin(time * 4 + r.x) * 4;
      ctx.fillStyle = PALETTE.goldGlow;
      ctx.beginPath();
      ctx.arc(r.x, r.y + bob, 14, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = PALETTE.gold;
      ctx.beginPath();
      ctx.moveTo(r.x, r.y - 10 + bob);
      ctx.lineTo(r.x + 9, r.y + bob);
      ctx.lineTo(r.x, r.y + 10 + bob);
      ctx.lineTo(r.x - 9, r.y + bob);
      ctx.closePath();
      ctx.fill();
    }

    for (const m of lvl.medipacks) {
      if (m.collected) continue;
      const bob = Math.sin(time * 3 + m.x) * 3;
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(m.x - 9, m.y - 8 + bob, 18, 16);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(m.x - 2, m.y - 5 + bob, 4, 10);
      ctx.fillRect(m.x - 5, m.y - 2 + bob, 10, 4);
    }
  }

  drawBoulders(ctx, lvl) {
    for (const b of lvl.boulders) {
      if (b.destroyed) continue;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.angle);
      ctx.fillStyle = '#57534e';
      ctx.beginPath();
      ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#292524';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-12, -8);
      ctx.lineTo(10, 12);
      ctx.moveTo(8, -10);
      ctx.lineTo(-8, 10);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawEnemies(ctx, lvl, time) {
    for (const e of lvl.enemies) {
      if (!e.alive) continue;
      ctx.save();
      if (e.hitFlash > 0) ctx.filter = 'brightness(2.2)';

      if (e.type === 'bat') {
        const wing = Math.sin(time * 18) * 7;
        ctx.fillStyle = '#4c1d95';
        ctx.beginPath();
        ctx.moveTo(e.x + e.w / 2, e.y + 10);
        ctx.lineTo(e.x - 4, e.y + 4 + wing);
        ctx.lineTo(e.x + e.w / 2, e.y + 16);
        ctx.lineTo(e.x + e.w + 4, e.y + 4 + wing);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#f43f5e';
        ctx.fillRect(e.x + 10, e.y + 8, 3, 3);
        ctx.fillRect(e.x + 15, e.y + 8, 3, 3);
      } else {
        // 石像守卫
        ctx.fillStyle = '#64748b';
        ctx.fillRect(e.x + 2, e.y + 10, e.w - 4, e.h - 10);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(e.x + 5, e.y, e.w - 10, 12);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(e.x + 9, e.y + 4, 4, 3);
        ctx.fillRect(e.x + 15, e.y + 4, 4, 3);
      }
      ctx.restore();
    }
  }

  drawBoss(ctx, lvl, time) {
    const b = lvl.boss;
    if (!b || !b.alive) return;
    ctx.save();
    if (b.hitFlash > 0) ctx.filter = 'brightness(2.2)';

    // 黑曜石巨像躯体
    ctx.fillStyle = '#1e1b2e';
    ctx.fillRect(b.x, b.y + 14, b.w, b.h - 14);
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(b.x + 2, b.y + 16, b.w - 4, b.h - 18);

    // 发光核心
    const pulse = 8 + Math.sin(time * 8) * 2;
    ctx.fillStyle = b.hp < b.maxHp * 0.5 ? '#ef4444' : '#38bdf8';
    ctx.beginPath();
    ctx.arc(b.x + b.w / 2, b.y + 42, pulse, 0, Math.PI * 2);
    ctx.fill();

    // 头部与红眼
    ctx.fillStyle = '#312e81';
    ctx.fillRect(b.x + 14, b.y, b.w - 28, 18);
    ctx.fillStyle = '#f43f5e';
    ctx.fillRect(b.x + 20, b.y + 6, 6, 4);
    ctx.fillRect(b.x + b.w - 26, b.y + 6, 6, 4);

    ctx.restore();
  }

  drawLara(ctx, p, time) {
    if (p.invulnTimer > 0 && Math.floor(time * 20) % 2 === 0) return;

    // 物理马尾辫
    ctx.strokeStyle = PALETTE.laraHair;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p.braidPoints[0].x, p.braidPoints[0].y);
    ctx.lineTo(p.braidPoints[1].x, p.braidPoints[1].y);
    ctx.lineTo(p.braidPoints[2].x, p.braidPoints[2].y);
    ctx.stroke();

    const cx = p.x + p.w * 0.5;
    if (p.rollTimer > 0) {
      // 翻滚姿态
      ctx.save();
      ctx.translate(cx, p.y + p.h * 0.5);
      ctx.rotate(p.facing * time * 20);
      ctx.fillStyle = PALETTE.laraShirt;
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    const stride = p.onGround && Math.abs(p.vx) > 10 ? Math.sin(p.animTime * 16) * 5 : 0;

    // 腿部与靴子
    ctx.strokeStyle = PALETTE.laraSkin;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx - 3, p.y + 24);
    ctx.lineTo(cx - 3 - stride, p.y + p.h);
    ctx.moveTo(cx + 3, p.y + 24);
    ctx.lineTo(cx + 3 + stride, p.y + p.h);
    ctx.stroke();

    // 战术短裤
    ctx.fillStyle = PALETTE.laraShorts;
    ctx.fillRect(cx - 7, p.y + 20, 14, 7);

    // 标志性青绿色背心
    ctx.fillStyle = PALETTE.laraShirt;
    ctx.fillRect(cx - 6, p.y + 11, 12, 10);

    // 头部与头发
    ctx.fillStyle = PALETTE.laraSkin;
    ctx.beginPath();
    ctx.arc(cx, p.y + 6, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.laraHair;
    ctx.beginPath();
    ctx.arc(cx - p.facing * 1.5, p.y + 4.5, 5, Math.PI, Math.PI * 2);
    ctx.fill();

    // 持双枪手臂与枪口火焰
    const gunX = cx + p.facing * 11;
    const gunY = p.y + 14;
    ctx.strokeStyle = PALETTE.laraSkin;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, p.y + 14);
    ctx.lineTo(gunX, gunY);
    ctx.stroke();
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(p.facing > 0 ? gunX - 1 : gunX - 6, gunY - 2, 7, 3);

    if (p.muzzleFlash > 0) {
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(gunX + p.facing * 6, gunY - 1, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawProjectiles(ctx, engine) {
    ctx.fillStyle = '#fde047';
    for (const b of engine.bullets) {
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }

    for (const pr of engine.enemyProjectiles) {
      if (pr.type === 'shockwave') {
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(pr.x, pr.y, pr.w, pr.h);
        ctx.fillStyle = '#e0f2fe';
        ctx.fillRect(pr.x + 3, pr.y + 3, pr.w - 6, pr.h - 6);
      } else {
        ctx.fillStyle = '#a3e635';
        ctx.fillRect(pr.x, pr.y, pr.w, pr.h);
      }
    }
  }

  drawParticles(ctx, engine) {
    for (const pt of engine.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;
  }

  drawFloatingTexts(ctx, engine) {
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    for (const ft of engine.floatingTexts) {
      ctx.globalAlpha = Math.min(1, ft.life);
      ctx.fillStyle = '#000000';
      ctx.fillText(ft.text, ft.x + 1, ft.y + 1);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
    }
    ctx.globalAlpha = 1;
  }

  drawDynamicLighting(ctx, engine, camX, camY) {
    const lctx = this.lightCtx;
    const lvl = engine.level;
    const p = engine.player;

    lctx.globalCompositeOperation = 'source-over';
    lctx.clearRect(0, 0, this.viewW, this.viewH);
    lctx.fillStyle = `rgba(6, 8, 12, ${lvl.ambientDarkness})`;
    lctx.fillRect(0, 0, this.viewW, this.viewH);

    lctx.globalCompositeOperation = 'destination-out';

    const punchLight = (wx, wy, radius) => {
      const sx = wx - camX;
      const sy = wy - camY;
      if (sx < -radius || sx > this.viewW + radius || sy < -radius || sy > this.viewH + radius) return;
      const g = lctx.createRadialGradient(sx, sy, radius * 0.12, sx, sy, radius);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      lctx.fillStyle = g;
      lctx.beginPath();
      lctx.arc(sx, sy, radius, 0, Math.PI * 2);
      lctx.fill();
    };

    // 劳拉随身照明光晕
    punchLight(p.x + p.w * 0.5, p.y + p.h * 0.5, 165);

    // 壁挂火把动态光晕
    for (const t of lvl.torches) {
      const r = 125 + Math.sin(engine.time * 10 + t.phase) * 10;
      punchLight(t.x, t.y, r);
    }

    // 圣物微光
    for (const r of lvl.relics) {
      if (!r.collected) punchLight(r.x, r.y, 70);
    }

    // 终点传送门强光
    punchLight(lvl.exit.x + lvl.exit.w / 2, lvl.exit.y + lvl.exit.h / 2, 145);

    ctx.drawImage(this.lightCanvas, 0, 0);
  }
}
