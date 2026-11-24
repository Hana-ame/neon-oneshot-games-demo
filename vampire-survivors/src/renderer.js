/**
 * Crimson Night - HTML5 Canvas 2D 暗黑哥特风渲染器
 * 纯程序化绘制：无限平铺哥特石砖、动态光晕、角色/怪物造型、武器特效、Boss 血条与指示器
 */

import { WEAPONS } from './config.js';

export class GameRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = 1280;
    this.height = 720;
    this.dpr = 1;
  }

  resize() {
    const rect = this.canvas.parentElement
      ? this.canvas.parentElement.getBoundingClientRect()
      : { width: window.innerWidth, height: window.innerHeight };
    this.width = Math.max(320, Math.floor(rect.width));
    this.height = Math.max(240, Math.floor(rect.height));
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    return { width: this.width, height: this.height };
  }

  render(engine, joystickState = null) {
    const ctx = this.ctx;
    const p = engine.player;

    ctx.save();
    // 背景底色
    ctx.fillStyle = '#0c0a14';
    ctx.fillRect(0, 0, this.width, this.height);

    // 摄像机偏移与微震
    const shakeX = engine.screenShake > 0 ? (Math.random() - 0.5) * engine.screenShake : 0;
    const shakeY = engine.screenShake > 0 ? (Math.random() - 0.5) * engine.screenShake : 0;
    const camX = p.x - this.width / 2 + shakeX;
    const camY = p.y - this.height / 2 + shakeY;

    this._drawGothicFloor(ctx, camX, camY);

    ctx.save();
    ctx.translate(-camX, -camY);

    this._drawAuraWeapons(ctx, engine);
    this._drawTorches(ctx, engine);
    this._drawGems(ctx, engine);
    this._drawPickups(ctx, engine);
    this._drawEnemies(ctx, engine);
    this._drawPlayer(ctx, engine);
    this._drawOrbitWeapons(ctx, engine);
    this._drawSlashes(ctx, engine);
    this._drawProjectiles(ctx, engine);
    this._drawLightnings(ctx, engine);
    this._drawParticles(ctx, engine);
    this._drawFloatingTexts(ctx, engine);

    ctx.restore();

    // 暗黑哥特暗角氛围光罩
    this._drawVignette(ctx, p.hurtFlash);
    // 精英/Boss 屏幕边缘方位箭头与血条
    this._drawBossOverlays(ctx, engine, camX, camY);
    // 移动端虚拟摇杆
    if (joystickState && joystickState.active) {
      this._drawJoystick(ctx, joystickState);
    }

    ctx.restore();
  }

  _drawGothicFloor(ctx, camX, camY) {
    const tile = 64;
    const startX = Math.floor(camX / tile) * tile;
    const startY = Math.floor(camY / tile) * tile;

    for (let wx = startX; wx < camX + this.width + tile; wx += tile) {
      for (let wy = startY; wy < camY + this.height + tile; wy += tile) {
        const sx = wx - camX;
        const sy = wy - camY;
        const hash = Math.abs(((wx * 73856093) ^ (wy * 19349663)) % 17);

        ctx.fillStyle = hash % 3 === 0 ? '#141122' : hash % 3 === 1 ? '#171326' : '#120f1e';
        ctx.fillRect(sx, sy, tile, tile);

        ctx.strokeStyle = 'rgba(148, 163, 184, 0.055)';
        ctx.lineWidth = 1;
        ctx.strokeRect(sx + 0.5, sy + 0.5, tile - 1, tile - 1);

        // 偶尔点缀地面符文裂纹或墓地苔藓点
        if (hash === 5) {
          ctx.fillStyle = 'rgba(225, 29, 72, 0.07)';
          ctx.beginPath();
          ctx.arc(sx + 32, sy + 32, 4, 0, Math.PI * 2);
          ctx.fill();
        } else if (hash === 11) {
          ctx.strokeStyle = 'rgba(100, 116, 139, 0.12)';
          ctx.beginPath();
          ctx.moveTo(sx + 14, sy + 20);
          ctx.lineTo(sx + 28, sy + 32);
          ctx.lineTo(sx + 22, sy + 44);
          ctx.stroke();
        }
      }
    }
  }

  _drawAuraWeapons(ctx, engine) {
    const p = engine.player;
    for (const w of p.weapons) {
      const def = WEAPONS[w.id];
      if (!def || def.type !== 'aura') continue;
      const lvData = def.levels[Math.min(w.level - 1, def.levels.length - 1)];
      const r = lvData.radius * p.computed.area * (lvData.area || 1);
      const pulse = 1 + Math.sin(engine.time * 6) * 0.04;

      const grad = ctx.createRadialGradient(p.x, p.y, r * 0.2, p.x, p.y, r * pulse);
      if (def.evolved) {
        grad.addColorStop(0, 'rgba(192, 38, 211, 0.08)');
        grad.addColorStop(0.75, 'rgba(192, 38, 211, 0.22)');
        grad.addColorStop(1, 'rgba(232, 121, 249, 0.45)');
      } else {
        grad.addColorStop(0, 'rgba(74, 222, 128, 0.04)');
        grad.addColorStop(0.8, 'rgba(74, 222, 128, 0.16)');
        grad.addColorStop(1, 'rgba(134, 239, 172, 0.36)');
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * pulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = def.evolved ? 'rgba(232, 121, 249, 0.55)' : 'rgba(74, 222, 128, 0.42)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * pulse, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  _drawTorches(ctx, engine) {
    for (const t of engine.torches) {
      const flicker = Math.sin(engine.time * 14 + t.id) * 2;
      // 暖色火光
      const g = ctx.createRadialGradient(t.x, t.y - 8, 2, t.x, t.y - 8, 42 + flicker);
      g.addColorStop(0, 'rgba(251, 146, 60, 0.35)');
      g.addColorStop(1, 'rgba(251, 146, 60, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(t.x, t.y - 8, 42 + flicker, 0, Math.PI * 2);
      ctx.fill();

      // 烛台底座
      ctx.fillStyle = '#475569';
      ctx.fillRect(t.x - 4, t.y - 4, 8, 14);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(t.x - 7, t.y - 6, 14, 3);

      // 火焰
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(t.x, t.y - 11, 6 + flicker * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(t.x, t.y - 10, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawGems(ctx, engine) {
    for (const g of engine.gems) {
      const color = g.tier === 3 ? '#f43f5e' : g.tier === 2 ? '#22c55e' : '#38bdf8';
      const glow = g.tier === 3 ? '#fda4af' : g.tier === 2 ? '#86efac' : '#bae6fd';
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, -g.radius);
      ctx.lineTo(g.radius * 0.78, 0);
      ctx.lineTo(0, g.radius);
      ctx.lineTo(-g.radius * 0.78, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = glow;
      ctx.fillRect(-1.5, -g.radius * 0.45, 3, 3);
      ctx.restore();
    }
  }

  _drawPickups(ctx, engine) {
    for (const item of engine.pickups) {
      const y = item.y + Math.sin(item.bob) * 4;
      ctx.save();
      ctx.translate(item.x, y);

      if (item.kind === 'chest') {
        // 黄金进化宝箱光晕
        const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 32);
        glow.addColorStop(0, 'rgba(251, 191, 36, 0.55)');
        glow.addColorStop(1, 'rgba(251, 191, 36, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, 32, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#92400e';
        ctx.fillRect(-13, -9, 26, 18);
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(-13, -9, 26, 18);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(-3, -2, 6, 6);
      } else {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = item.kind === 'chicken' ? '#fb923c' : item.kind === 'magnet' ? '#38bdf8' : '#fbbf24';
        ctx.lineWidth = 1.8;
        ctx.stroke();

        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const icon =
          item.kind === 'chicken' ? '🍗' : item.kind === 'magnet' ? '🧲' : item.kind === 'rosary' ? '✝️' : '💰';
        ctx.fillText(icon, 0, 1);
      }
      ctx.restore();
    }
  }

  _drawEnemies(ctx, engine) {
    for (const e of engine.enemies) {
      ctx.save();
      ctx.translate(e.x, e.y);

      // 阴影
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.beginPath();
      ctx.ellipse(0, e.radius * 0.85, e.radius * 0.85, e.radius * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();

      const fill = e.hitFlash > 0 ? '#ffffff' : e.color;
      const accent = e.hitFlash > 0 ? '#ffffff' : e.accent;

      if (e.shape === 'bat') {
        const flap = Math.sin(engine.time * 18 + e.id) * 5;
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.moveTo(0, -4);
        ctx.lineTo(-e.radius * 1.35, -4 + flap);
        ctx.lineTo(-4, 6);
        ctx.lineTo(0, 2);
        ctx.lineTo(4, 6);
        ctx.lineTo(e.radius * 1.35, -4 + flap);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#f43f5e';
        ctx.fillRect(-3, -2, 2, 2);
        ctx.fillRect(1, -2, 2, 2);
      } else if (e.shape === 'ghost') {
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(0, -3, e.radius * 0.85, Math.PI, 0);
        ctx.lineTo(e.radius * 0.85, e.radius * 0.7);
        ctx.lineTo(0, e.radius * 0.4);
        ctx.lineTo(-e.radius * 0.85, e.radius * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(-5, -5, 3, 4);
        ctx.fillRect(2, -5, 3, 4);
      } else if (e.shape === 'boss') {
        // 精英/Boss 猩红气场
        ctx.strokeStyle = e.isBoss ? 'rgba(251, 191, 36, 0.7)' : 'rgba(244, 63, 94, 0.65)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius + 5 + Math.sin(engine.time * 8) * 2, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
        ctx.fill();

        // 皇冠/尖角装饰
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.moveTo(-10, -e.radius + 3);
        ctx.lineTo(-6, -e.radius - 10);
        ctx.lineTo(0, -e.radius - 2);
        ctx.lineTo(6, -e.radius - 10);
        ctx.lineTo(10, -e.radius + 3);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#fef08a';
        ctx.fillRect(-8, -4, 5, 4);
        ctx.fillRect(3, -4, 5, 4);
      } else {
        // 骷髅/狼人/血骑士通用人形体
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = e.shape === 'skeleton' ? '#0f172a' : '#ef4444';
        ctx.fillRect(-5, -4, 3, 3);
        ctx.fillRect(2, -4, 3, 3);
      }

      // 精英或受伤较重怪物头顶小血条
      if (e.isElite || e.isBoss) {
        const bw = e.radius * 2.2;
        const ratio = Math.max(0, e.hp / e.maxHp);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(-bw / 2, -e.radius - 16, bw, 5);
        ctx.fillStyle = e.isBoss ? '#fbbf24' : '#f43f5e';
        ctx.fillRect(-bw / 2, -e.radius - 16, bw * ratio, 5);
      }

      ctx.restore();
    }
  }

  _drawPlayer(ctx, engine) {
    const p = engine.player;
    const bob = Math.sin(p.walkCycle) * 2.5;
    const flip = p.facingX >= 0 ? 1 : -1;

    ctx.save();
    ctx.translate(p.x, p.y);

    // 脚底阴影
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, p.radius + 2, p.radius, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // 斗篷身体
    ctx.fillStyle = p.hurtFlash > 0 ? '#ffffff' : engine.character.cloakColor;
    ctx.beginPath();
    ctx.moveTo(-11, 13 + bob * 0.4);
    ctx.lineTo(-9, -6 + bob);
    ctx.lineTo(9, -6 + bob);
    ctx.lineTo(11, 13 + bob * 0.4);
    ctx.closePath();
    ctx.fill();

    // 护甲核心与披风高光
    ctx.fillStyle = p.hurtFlash > 0 ? '#fda4af' : engine.character.color;
    ctx.beginPath();
    ctx.arc(0, -6 + bob, 9.5, 0, Math.PI * 2);
    ctx.fill();

    // 眼睛（随朝向偏移）
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(flip * 2 - 2, -8 + bob, 3, 3);
    ctx.fillRect(flip * 5 - 1, -8 + bob, 3, 3);

    // 角色头顶微缩血条
    const hpW = 36;
    const hpRatio = Math.max(0, p.hp / p.maxHp);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(-hpW / 2, 18, hpW, 5);
    ctx.fillStyle = hpRatio > 0.35 ? '#e11d48' : '#f97316';
    ctx.fillRect(-hpW / 2, 18, hpW * hpRatio, 5);

    ctx.restore();
  }

  _drawOrbitWeapons(ctx, engine) {
    const p = engine.player;
    for (const w of p.weapons) {
      const def = WEAPONS[w.id];
      if (!def || def.type !== 'orbit' || !w.orbitActive) continue;
      const lvData = def.levels[Math.min(w.level - 1, def.levels.length - 1)];
      const areaMul = p.computed.area * (lvData.area || 1);
      const count = lvData.count + p.computed.amount;
      const orbitR = lvData.radius * areaMul;

      for (let i = 0; i < count; i++) {
        const ang = w.orbitAngle + (Math.PI * 2 * i) / count;
        const bx = p.x + Math.cos(ang) * orbitR;
        const by = p.y + Math.sin(ang) * orbitR;
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(ang + Math.PI / 2);
        ctx.fillStyle = def.evolved ? '#dc2626' : '#d97706';
        ctx.fillRect(-8, -11, 16, 22);
        ctx.strokeStyle = '#fef3c7';
        ctx.lineWidth = 2;
        ctx.strokeRect(-8, -11, 16, 22);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(-2, -6, 4, 12);
        ctx.restore();
      }
    }
  }

  _drawSlashes(ctx, engine) {
    for (const s of engine.slashes) {
      const alpha = s.timer / s.maxTimer;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.scale(s.dirX, 1);
      ctx.globalAlpha = alpha;
      const grad = ctx.createLinearGradient(-s.rx, 0, s.rx, 0);
      grad.addColorStop(0, 'rgba(251, 113, 133, 0)');
      grad.addColorStop(0.55, s.color);
      grad.addColorStop(1, '#ffffff');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(0, 0, s.rx, s.ry * (0.55 + 0.45 * alpha), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  _drawProjectiles(ctx, engine) {
    for (const pr of engine.projectiles) {
      ctx.save();
      ctx.translate(pr.x, pr.y);
      if (pr.kind === 'knife') {
        ctx.rotate(pr.angle || 0);
        ctx.fillStyle = pr.color;
        ctx.beginPath();
        ctx.moveTo(11, 0);
        ctx.lineTo(-7, -3.5);
        ctx.lineTo(-4, 0);
        ctx.lineTo(-7, 3.5);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = pr.color;
        ctx.beginPath();
        ctx.arc(0, 0, pr.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, pr.radius * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  _drawLightnings(ctx, engine) {
    for (const l of engine.lightnings) {
      const alpha = l.timer / l.maxTimer;
      ctx.save();
      ctx.globalAlpha = alpha;

      // 落雷光环
      ctx.fillStyle = l.color;
      ctx.beginPath();
      ctx.arc(l.x, l.y, l.radius * (1.1 - alpha * 0.25), 0, Math.PI * 2);
      ctx.fill();

      // 锯齿闪电主干
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(l.x + 12, l.y - 260);
      ctx.lineTo(l.x - 14, l.y - 170);
      ctx.lineTo(l.x + 16, l.y - 95);
      ctx.lineTo(l.x, l.y);
      ctx.stroke();

      ctx.restore();
    }
  }

  _drawParticles(ctx, engine) {
    for (const pt of engine.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;
  }

  _drawFloatingTexts(ctx, engine) {
    ctx.textAlign = 'center';
    for (const ft of engine.floatingTexts) {
      ctx.globalAlpha = Math.max(0, ft.life / ft.maxLife);
      ctx.font = ft.isCrit ? 'bold 17px Inter, sans-serif' : 'bold 13px Inter, sans-serif';
      ctx.fillStyle = '#09090b';
      ctx.fillText(ft.text, ft.x + 1, ft.y + 1);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
    }
    ctx.globalAlpha = 1;
  }

  _drawVignette(ctx, hurtFlash) {
    const grad = ctx.createRadialGradient(
      this.width / 2,
      this.height / 2,
      Math.min(this.width, this.height) * 0.34,
      this.width / 2,
      this.height / 2,
      Math.max(this.width, this.height) * 0.72
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, hurtFlash > 0 ? 'rgba(190, 18, 60, 0.55)' : 'rgba(5, 4, 10, 0.58)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  _drawBossOverlays(ctx, engine, camX, camY) {
    const boss = engine.enemies.find((e) => e.isBoss && !e.dead);
    if (boss) {
      const barW = Math.min(420, this.width - 64);
      const bx = (this.width - barW) / 2;
      const by = 64;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(bx, by, barW, 14);
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(bx + 2, by + 2, (barW - 4) * Math.max(0, boss.hp / boss.maxHp), 10);
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bx, by, barW, 14);

      ctx.fillStyle = '#fef3c7';
      ctx.font = 'bold 12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${boss.name}  ${Math.ceil(boss.hp)} / ${boss.maxHp}`, this.width / 2, by - 6);
    }

    // 宝箱方位指示箭头
    for (const item of engine.pickups) {
      if (item.kind !== 'chest') continue;
      const sx = item.x - camX;
      const sy = item.y - camY;
      if (sx >= 20 && sx <= this.width - 20 && sy >= 20 && sy <= this.height - 20) continue;
      const ang = Math.atan2(sy - this.height / 2, sx - this.width / 2);
      const px = Math.max(28, Math.min(this.width - 28, this.width / 2 + Math.cos(ang) * (this.width * 0.44)));
      const py = Math.max(76, Math.min(this.height - 28, this.height / 2 + Math.sin(ang) * (this.height * 0.42)));
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(ang);
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(-7, -6);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-7, 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  _drawJoystick(ctx, j) {
    ctx.save();
    ctx.strokeStyle = 'rgba(248, 250, 252, 0.35)';
    ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(j.originX, j.originY, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(244, 63, 94, 0.78)';
    ctx.beginPath();
    ctx.arc(j.knobX, j.knobY, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
