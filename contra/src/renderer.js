// Canvas 2D 像素风程序化渲染器（视差背景、像素精灵、特效、HUD 与 CRT 扫描线）

import { GAME_WIDTH, GAME_HEIGHT, GAME_STATES, WEAPONS } from './constants.js';

export class ContraRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.crtEnabled = true;
  }

  toggleCrt() {
    this.crtEnabled = !this.crtEnabled;
    return this.crtEnabled;
  }

  render(engine) {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;

    ctx.save();
    if (engine.shakeTimer > 0) {
      const mag = engine.shakeTimer * 14;
      ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
    }

    this.drawBackground(ctx, engine);
    this.drawWater(ctx, engine);
    this.drawPlatforms(ctx, engine);
    this.drawBridges(ctx, engine);
    this.drawBoss(ctx, engine);
    this.drawCapsulesAndPowerups(ctx, engine);
    this.drawEnemies(ctx, engine);
    this.drawPlayer(ctx, engine);
    this.drawBullets(ctx, engine);
    this.drawParticles(ctx, engine);

    ctx.restore();

    this.drawHud(ctx, engine);
    this.drawOverlay(ctx, engine);

    if (this.crtEnabled) {
      this.drawCrtScanlines(ctx);
    }
  }

  drawBackground(ctx, engine) {
    const cam = engine.cameraX;
    const isJungle = engine.stage && engine.stage.theme === 'jungle';

    // 天空渐变
    const sky = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
    if (isJungle) {
      sky.addColorStop(0, '#091529');
      sky.addColorStop(0.55, '#133252');
      sky.addColorStop(1, '#1e4d4f');
    } else {
      sky.addColorStop(0, '#090714');
      sky.addColorStop(0.6, '#1c1030');
      sky.addColorStop(1, '#2b132b');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // 远景山脉/金属穹顶（视差 0.2）
    ctx.fillStyle = isJungle ? '#0f293d' : '#18142b';
    const mountainOffset = -(cam * 0.2) % 160;
    for (let x = mountainOffset - 160; x < GAME_WIDTH + 160; x += 160) {
      ctx.beginPath();
      ctx.moveTo(x, GAME_HEIGHT);
      ctx.lineTo(x + 48, 92);
      ctx.lineTo(x + 98, 134);
      ctx.lineTo(x + 132, 78);
      ctx.lineTo(x + 160, GAME_HEIGHT);
      ctx.closePath();
      ctx.fill();
    }

    // 中景丛林树影或基地钢梁（视差 0.45）
    const midOffset = -(cam * 0.45) % 96;
    if (isJungle) {
      for (let x = midOffset - 96; x < GAME_WIDTH + 96; x += 96) {
        ctx.fillStyle = '#123d32';
        ctx.fillRect(x + 22, 118, 12, 152);
        ctx.fillStyle = '#18543f';
        ctx.beginPath();
        ctx.arc(x + 28, 112, 26, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0e3329';
        ctx.beginPath();
        ctx.arc(x + 62, 146, 22, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      for (let x = midOffset - 96; x < GAME_WIDTH + 96; x += 96) {
        ctx.fillStyle = '#251e40';
        ctx.fillRect(x + 10, 0, 14, GAME_HEIGHT);
        ctx.fillStyle = '#3b2d63';
        ctx.fillRect(x + 14, 0, 3, GAME_HEIGHT);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(x + 15, 42, 4, 4);
      }
    }
  }

  drawWater(ctx, engine) {
    if (!engine.stage) return;
    const cam = engine.cameraX;
    const waterY = engine.stage.waterY;
    const isJungle = engine.stage.theme === 'jungle';

    for (const z of engine.stage.waterZones) {
      const sx = z.x - cam;
      if (sx + z.w < 0 || sx > GAME_WIDTH) continue;
      ctx.fillStyle = isJungle ? '#0369a1' : '#3b0764';
      ctx.fillRect(sx, waterY, z.w, GAME_HEIGHT - waterY);
      // 水面波纹动画
      ctx.fillStyle = isJungle ? '#38bdf8' : '#a855f7';
      const waveShift = Math.floor(engine.time * 24) % 16;
      for (let wx = sx - waveShift; wx < sx + z.w; wx += 16) {
        ctx.fillRect(Math.max(sx, wx), waterY + 2, 8, 2);
      }
    }
  }

  drawPlatforms(ctx, engine) {
    const cam = engine.cameraX;
    for (const p of engine.platforms) {
      const sx = Math.floor(p.x - cam);
      if (sx + p.w < -10 || sx > GAME_WIDTH + 10) continue;

      if (p.type === 'grass') {
        ctx.fillStyle = '#78350f';
        ctx.fillRect(sx, p.y + 4, p.w, p.h - 4);
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(sx, p.y, p.w, 5);
        ctx.fillStyle = '#4ade80';
        for (let gx = sx; gx < sx + p.w; gx += 12) {
          ctx.fillRect(gx, p.y, 6, 2);
        }
      } else if (p.type === 'ground') {
        ctx.fillStyle = '#451a03';
        ctx.fillRect(sx, p.y, p.w, p.h);
        ctx.fillStyle = '#15803d';
        ctx.fillRect(sx, p.y, p.w, 6);
        ctx.fillStyle = '#713f12';
        for (let bx = sx + 4; bx < sx + p.w - 8; bx += 20) {
          ctx.fillRect(bx, p.y + 12, 10, 6);
        }
      } else {
        // 金属钢板
        ctx.fillStyle = '#334155';
        ctx.fillRect(sx, p.y, p.w, p.h);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(sx, p.y, p.w, 3);
        ctx.fillStyle = '#1e293b';
        for (let mx = sx + 6; mx < sx + p.w - 6; mx += 16) {
          ctx.fillRect(mx, p.y + 5, 4, 4);
        }
      }
    }
  }

  drawBridges(ctx, engine) {
    const cam = engine.cameraX;
    for (const b of engine.bridges) {
      for (const seg of b.segments) {
        if (!seg.intact) continue;
        const sx = Math.floor(seg.x - cam);
        if (sx + seg.w < 0 || sx > GAME_WIDTH) continue;
        ctx.fillStyle = '#92400e';
        ctx.fillRect(sx, seg.y, seg.w - 1, seg.h);
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(sx, seg.y, seg.w - 1, 3);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(sx + seg.w / 2 - 2, seg.y + 5, 4, 4);
      }
    }
  }

  drawBoss(ctx, engine) {
    const boss = engine.boss;
    if (!boss || boss.defeated) return;
    const cam = engine.cameraX;
    const sx = Math.floor(boss.x - cam);
    if (sx > GAME_WIDTH + 40) return;

    const flash = boss.flashTimer > 0;
    // 主堡垒墙体
    ctx.fillStyle = flash ? '#fca5a5' : boss.kind === 'alien_core' ? '#3b1d4a' : '#374151';
    ctx.fillRect(sx, boss.y, boss.w, boss.h);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx + 1, boss.y + 1, boss.w - 2, boss.h - 2);

    // 装甲铆钉纹理
    ctx.fillStyle = '#1f2937';
    for (let row = boss.y + 12; row < boss.y + boss.h - 10; row += 22) {
      ctx.fillRect(sx + 8, row, boss.w - 16, 4);
    }

    // 炮台
    for (const t of boss.turrets) {
      const tx = Math.floor(t.x - cam);
      if (t.alive) {
        ctx.fillStyle = '#64748b';
        ctx.fillRect(tx, t.y, t.w, t.h);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(tx - 8, t.y + 8, 10, 6);
        ctx.fillStyle = '#f43f5e';
        ctx.fillRect(tx + 7, t.y + 7, 8, 8);
      } else {
        ctx.fillStyle = '#111827';
        ctx.fillRect(tx, t.y, t.w, t.h);
      }
    }

    // 核心弱点（脉动红光）
    const c = boss.core;
    if (c.alive) {
      const cx = Math.floor(c.x - cam);
      const pulse = 0.5 + 0.5 * Math.sin(engine.time * 12);
      ctx.fillStyle = '#450a0a';
      ctx.fillRect(cx - 2, c.y - 2, c.w + 4, c.h + 4);
      ctx.fillStyle = flash ? '#ffffff' : pulse > 0.5 ? '#ef4444' : '#f97316';
      ctx.fillRect(cx, c.y, c.w, c.h);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(cx + 6, c.y + 8, c.w - 12, c.h - 16);
    }
  }

  drawCapsulesAndPowerups(ctx, engine) {
    const cam = engine.cameraX;
    for (const c of engine.capsules) {
      const sx = Math.floor(c.x - cam);
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.ellipse(sx + c.w / 2, c.y + c.h / 2, c.w / 2, c.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(sx + 6, c.y + 3, 12, 8);
      ctx.fillStyle = '#fde047';
      ctx.fillRect(sx + 9, c.y + 5, 6, 4);
    }

    for (const pw of engine.powerups) {
      const sx = Math.floor(pw.x - cam);
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(sx, pw.y, pw.w, pw.h);
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(sx + 0.5, pw.y + 0.5, pw.w - 1, pw.h - 1);
      ctx.fillStyle = '#fef08a';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pw.weapon, sx + pw.w / 2, pw.y + pw.h / 2 + 1);
    }
  }

  drawEnemies(ctx, engine) {
    const cam = engine.cameraX;
    for (const e of engine.enemies) {
      const sx = Math.floor(e.x - cam);
      if (sx + e.w < -10 || sx > GAME_WIDTH + 10) continue;

      if (e.type === 'turret') {
        ctx.fillStyle = '#475569';
        ctx.fillRect(sx, e.y, e.w, e.h);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(sx + 3, e.y + 3, e.w - 6, e.h - 6);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(sx + 8, e.y + 8, 6, 6);
      } else {
        const isSniper = e.type === 'sniper';
        const legSwing = e.type === 'runner' ? Math.sin(e.animTimer) * 4 : 0;
        // 头部与红头盔
        ctx.fillStyle = isSniper ? '#dc2626' : '#16a34a';
        ctx.fillRect(sx + 3, e.y, 10, 8);
        ctx.fillStyle = '#fdba74';
        ctx.fillRect(sx + 4, e.y + 4, 8, 5);
        // 身体
        ctx.fillStyle = isSniper ? '#991b1b' : '#15803d';
        ctx.fillRect(sx + 3, e.y + 9, 10, 11);
        // 双腿
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(sx + 3 + legSwing, e.y + 20, 4, 8);
        ctx.fillRect(sx + 9 - legSwing, e.y + 20, 4, 8);
        // 枪支
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(e.facing > 0 ? sx + 10 : sx - 5, e.y + 11, 11, 3);
      }
    }
  }

  drawPlayer(ctx, engine) {
    const p = engine.player;
    if (!p || !p.alive) return;
    // 无敌闪烁
    if (p.invincibleTimer > 0 && Math.floor(engine.time * 18) % 2 === 0) return;

    const sx = Math.floor(p.x - engine.cameraX);
    const sy = Math.floor(p.y);

    // 空中翻滚跳跃姿态
    if (!p.onGround && !p.inWater) {
      ctx.save();
      ctx.translate(sx + p.w / 2, sy + p.h / 2);
      ctx.rotate(p.spinAngle);
      ctx.fillStyle = '#2563eb';
      ctx.fillRect(-7, -7, 14, 14);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(-7, -7, 14, 4);
      ctx.fillStyle = '#fdba74';
      ctx.fillRect(-4, -3, 8, 6);
      ctx.restore();
      return;
    }

    // 匍匐姿态
    if (p.prone && p.onGround && !p.inWater) {
      const hb = p.getHitbox();
      const px = Math.floor(hb.x - engine.cameraX);
      const py = Math.floor(hb.y);
      ctx.fillStyle = '#2563eb';
      ctx.fillRect(px, py + 4, 14, 8);
      ctx.fillStyle = '#fdba74';
      ctx.fillRect(px + (p.facing > 0 ? 14 : 0), py + 2, 10, 8);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(px + (p.facing > 0 ? 14 : 2), py + 1, 9, 3);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(p.facing > 0 ? px + 22 : px - 8, py + 4, 12, 3);
      return;
    }

    // 涉水游泳姿态（只露上半身）
    if (p.inWater) {
      ctx.fillStyle = '#fdba74';
      ctx.fillRect(sx + 3, sy + 12, 10, 10);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(sx + 2, sy + 11, 12, 3);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(p.facing > 0 ? sx + 10 : sx - 6, sy + 18, 12, 3);
      return;
    }

    // 经典比尔·雷泽站立/奔跑像素造型
    const legShift = Math.abs(p.vx) > 5 ? Math.sin(p.animTimer) * 4 : 0;
    // 红色头带
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(sx + 2, sy, 12, 4);
    // 头部与面庞
    ctx.fillStyle = '#fdba74';
    ctx.fillRect(sx + 3, sy + 4, 10, 6);
    // 上身肌肉与背心
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(sx + 3, sy + 10, 10, 9);
    // 蓝色军裤双腿
    ctx.fillStyle = '#2563eb';
    ctx.fillRect(sx + 3 + legShift, sy + 19, 4, 11);
    ctx.fillRect(sx + 9 - legShift, sy + 19, 4, 11);

    // 8方向枪管
    const cx = sx + p.w / 2;
    const cy = sy + 12;
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + p.aimX * 13, cy + p.aimY * 13);
    ctx.stroke();
  }

  drawBullets(ctx, engine) {
    const cam = engine.cameraX;
    for (const b of engine.bullets) {
      const sx = b.x - cam;
      ctx.fillStyle = b.color;
      if (b.weaponId === 'L') {
        ctx.save();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(sx, b.y);
        ctx.lineTo(sx - b.vx * 0.03, b.y - b.vy * 0.03);
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(sx, b.y, b.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(sx, b.y, Math.max(1, b.radius * 0.45), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawParticles(ctx, engine) {
    const cam = engine.cameraX;
    for (const pt of engine.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - cam, pt.y, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;

    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    for (const ft of engine.floatingTexts) {
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x - cam, ft.y);
    }
  }

  drawHud(ctx, engine) {
    ctx.fillStyle = 'rgba(2, 6, 23, 0.72)';
    ctx.fillRect(0, 0, GAME_WIDTH, 24);

    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    // 分数与最高分
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(`SCORE ${String(engine.score).padStart(6, '0')}`, 8, 12);
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(`HI ${String(engine.highScore).padStart(6, '0')}`, 106, 12);

    // 关卡名
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.fillText(engine.stage ? engine.stage.name : '', GAME_WIDTH / 2 + 12, 12);

    // 当前武器与生命数
    const p = engine.player;
    if (p) {
      const wInfo = WEAPONS[p.weaponId] || WEAPONS.R;
      ctx.textAlign = 'right';
      ctx.fillStyle = wInfo.color;
      ctx.fillText(`[${wInfo.shortName}] ${wInfo.name}`, GAME_WIDTH - 68, 12);
      ctx.fillStyle = '#ef4444';
      ctx.fillText(`♥x${p.lives}`, GAME_WIDTH - 8, 12);
    }

    // Boss 血条
    if (engine.boss && !engine.boss.defeated && engine.bossActive) {
      const ratio = Math.max(0, engine.boss.getTotalHp() / engine.boss.getMaxTotalHp());
      const barW = 140;
      const bx = GAME_WIDTH - barW - 10;
      const by = 30;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(bx - 2, by - 2, barW + 4, 10);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(bx, by, barW * ratio, 6);
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(engine.boss.name, GAME_WIDTH - 10, by + 16);
    }
  }

  drawOverlay(ctx, engine) {
    if (engine.state === GAME_STATES.PLAYING) return;

    ctx.fillStyle = 'rgba(2, 6, 23, 0.72)';
    ctx.fillRect(0, 24, GAME_WIDTH, GAME_HEIGHT - 24);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (engine.state === GAME_STATES.TITLE) {
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 34px monospace';
      ctx.fillText('CONTRA', GAME_WIDTH / 2, 84);
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 14px monospace';
      ctx.fillText('网 页 魂 斗 罗 · WEB EDITION', GAME_WIDTH / 2, 114);

      if (engine.konamiEnabled) {
        ctx.fillStyle = '#4ade80';
        ctx.font = 'bold 11px monospace';
        ctx.fillText('★ 科乐美秘籍已激活：30 命模式 ★', GAME_WIDTH / 2, 140);
      } else {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px monospace';
        ctx.fillText('秘籍：↑↑↓↓←→←→BA 开启 30 命', GAME_WIDTH / 2, 140);
      }

      if (Math.floor(engine.time * 2.5) % 2 === 0) {
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 13px monospace';
        ctx.fillText('按 ENTER / 空格 或点击开始战斗', GAME_WIDTH / 2, 178);
      }
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '10px monospace';
      ctx.fillText('移动/瞄准: WASD或方向键 | 射击: J/Z | 跳跃: K/X | 暂停: P', GAME_WIDTH / 2, 214);
    } else if (engine.state === GAME_STATES.PAUSED) {
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 26px monospace';
      ctx.fillText('PAUSED · 已暂停', GAME_WIDTH / 2, 128);
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '12px monospace';
      ctx.fillText('按 P / ESC 或点击继续按钮恢复战斗', GAME_WIDTH / 2, 162);
    } else if (engine.state === GAME_STATES.STAGE_CLEAR) {
      ctx.fillStyle = '#4ade80';
      ctx.font = 'bold 26px monospace';
      ctx.fillText('STAGE CLEAR!', GAME_WIDTH / 2, 122);
      ctx.fillStyle = '#fef08a';
      ctx.font = '12px monospace';
      ctx.fillText('敌军核心已摧毁，正在进入下一战区...', GAME_WIDTH / 2, 156);
    } else if (engine.state === GAME_STATES.GAME_OVER) {
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 28px monospace';
      ctx.fillText('GAME OVER', GAME_WIDTH / 2, 112);
      ctx.fillStyle = '#f8fafc';
      ctx.font = '13px monospace';
      ctx.fillText(`最终得分: ${engine.score}`, GAME_WIDTH / 2, 148);
      ctx.fillStyle = '#fbbf24';
      ctx.font = '12px monospace';
      ctx.fillText('按 ENTER / 点击重新开始 再次挑战', GAME_WIDTH / 2, 182);
    } else if (engine.state === GAME_STATES.VICTORY) {
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 26px monospace';
      ctx.fillText('MISSION ACCOMPLISHED!', GAME_WIDTH / 2, 102);
      ctx.fillStyle = '#4ade80';
      ctx.font = '13px monospace';
      ctx.fillText('红隼异形要塞已被彻底摧毁！', GAME_WIDTH / 2, 136);
      ctx.fillStyle = '#f8fafc';
      ctx.font = '13px monospace';
      ctx.fillText(`总得分: ${engine.score}   最高分: ${engine.highScore}`, GAME_WIDTH / 2, 166);
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '11px monospace';
      ctx.fillText('按 ENTER 或点击重新开始再战一局', GAME_WIDTH / 2, 198);
    }
  }

  drawCrtScanlines(ctx) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
    for (let y = 0; y < GAME_HEIGHT; y += 3) {
      ctx.fillRect(0, y, GAME_WIDTH, 1);
    }
  }
}
