// High-craft Canvas 2D renderer for Worms 2D (sky, parallax clouds, destructible terrain, worms, FX, minimap)

import { WORLD, PHYSICS, TEAMS, WEAPON_MAP } from './constants.js';
import { getWorldAimAngle } from './weapons.js';
import { PHASE } from './game.js';

export class WormsRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.time = 0;
    this.clouds = Array.from({ length: 9 }, (_, i) => ({
      x: i * 210 + Math.random() * 90,
      y: 55 + (i % 4) * 44,
      scale: 0.7 + (i % 3) * 0.35,
      speed: 8 + (i % 3) * 5,
    }));
  }

  getCameraView() {
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    // Responsive zoom so the game looks crisp on narrow panels and wide desktops
    const zoom = Math.max(0.55, Math.min(1.15, Math.min(cw / 980, ch / 560)));
    const viewW = cw / zoom;
    const viewH = ch / zoom;
    return { cw, ch, zoom, viewW, viewH };
  }

  screenToWorld(game, screenX, screenY) {
    const { cw, ch, zoom, viewW, viewH } = this.getCameraView();
    const camX = Math.max(viewW / 2, Math.min(WORLD.WIDTH - viewW / 2, game.camera.x));
    const camY = Math.max(viewH / 2, Math.min(WORLD.HEIGHT - viewH / 2, game.camera.y));
    const offsetX = viewW >= WORLD.WIDTH ? (WORLD.WIDTH - viewW) / 2 : camX - viewW / 2;
    const offsetY = viewH >= WORLD.HEIGHT ? (WORLD.HEIGHT - viewH) / 2 : camY - viewH / 2;
    return {
      x: offsetX + (screenX / cw) * viewW,
      y: offsetY + (screenY / ch) * viewH,
    };
  }

  render(game, dt = 1 / 60) {
    this.time += dt;
    const ctx = this.ctx;
    const { cw, ch, zoom, viewW, viewH } = this.getCameraView();
    const theme = game.terrain.theme;

    // 1. Sky gradient background
    const skyGrad = ctx.createLinearGradient(0, 0, 0, ch);
    skyGrad.addColorStop(0, theme.skyTop);
    skyGrad.addColorStop(0.55, theme.skyMid);
    skyGrad.addColorStop(1, theme.skyBottom);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, cw, ch);

    // Sun / moon glow
    ctx.save();
    const sunX = cw * 0.82;
    const sunY = ch * 0.18;
    const sunGlow = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 90);
    sunGlow.addColorStop(0, theme.sunColor);
    sunGlow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sunGlow;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 90, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Camera transform with optional screen shake
    const camX = Math.max(viewW / 2, Math.min(WORLD.WIDTH - viewW / 2, game.camera.x));
    const camY = Math.max(viewH / 2, Math.min(WORLD.HEIGHT - viewH / 2, game.camera.y));
    let offsetX = viewW >= WORLD.WIDTH ? (WORLD.WIDTH - viewW) / 2 : camX - viewW / 2;
    let offsetY = viewH >= WORLD.HEIGHT ? (WORLD.HEIGHT - viewH) / 2 : camY - viewH / 2;

    if (game.shakeTime > 0) {
      offsetX += (Math.random() - 0.5) * game.shakeIntensity;
      offsetY += (Math.random() - 0.5) * game.shakeIntensity;
    }

    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(-offsetX, -offsetY);

    // 2. Parallax clouds drifted by current wind
    this._drawClouds(ctx, game.wind, theme.cloudColor, dt);

    // 3. Background ocean layer
    this._drawWater(ctx, game.waterLevel, theme, false);

    // 4. Destructible terrain bitmap
    if (game.terrain.dirty || !game.terrain.canvas) {
      game.terrain.rebuildCanvas();
    }
    if (game.terrain.canvas) {
      ctx.drawImage(game.terrain.canvas, 0, 0);
    }

    // 5. Supply crates
    for (const crate of game.crates) {
      this._drawCrate(ctx, crate);
    }

    // 6. Worms
    const activeWorm = game.getActiveWorm();
    for (const w of game.worms) {
      if (!w.alive) continue;
      this._drawWorm(ctx, w, activeWorm && w.id === activeWorm.id, game);
    }

    // 7. Hitscan shotgun beams
    for (const b of game.hitscanBeams) {
      ctx.save();
      ctx.globalAlpha = b.life / b.maxLife;
      ctx.strokeStyle = '#fff59d';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(b.startX, b.startY);
      ctx.lineTo(b.endX, b.endY);
      ctx.stroke();
      ctx.restore();
    }

    // 8. Projectiles & smoke trails
    for (const p of game.projectiles) {
      this._drawProjectile(ctx, p);
    }

    // 9. Explosion shockwaves & particles
    for (const ex of game.explosions) {
      const t = ex.age / ex.duration;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t);
      const r = ex.radius * (0.45 + t * 0.9);
      const grad = ctx.createRadialGradient(ex.x, ex.y, r * 0.1, ex.x, ex.y, r);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.4, '#ffd43b');
      grad.addColorStop(0.75, '#ff6b35');
      grad.addColorStop(1, 'rgba(255, 60, 0, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(ex.x, ex.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (const pt of game.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, pt.life / pt.maxLife));
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 10. Foreground translucent water surface
    this._drawWater(ctx, game.waterLevel, theme, true);

    // 11. Floating damage & status texts
    ctx.font = 'bold 15px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const ft of game.floatingTexts) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - ft.age / ft.duration);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(ft.text, ft.x, ft.y);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }

    ctx.restore();

    // 12. Minimap in top-right corner on wider canvases
    if (cw >= 520) {
      this._drawMinimap(ctx, game, cw, ch);
    }
  }

  _drawClouds(ctx, wind, color, dt) {
    ctx.save();
    ctx.fillStyle = color;
    for (const c of this.clouds) {
      c.x += (wind * 0.35 + c.speed * 0.3) * dt;
      if (c.x > WORLD.WIDTH + 140) c.x = -140;
      if (c.x < -140) c.x = WORLD.WIDTH + 140;

      ctx.beginPath();
      ctx.arc(c.x, c.y, 24 * c.scale, 0, Math.PI * 2);
      ctx.arc(c.x + 22 * c.scale, c.y - 8 * c.scale, 28 * c.scale, 0, Math.PI * 2);
      ctx.arc(c.x + 48 * c.scale, c.y, 22 * c.scale, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawWater(ctx, waterLevel, theme, foreground) {
    ctx.save();
    const grad = ctx.createLinearGradient(0, waterLevel, 0, WORLD.HEIGHT + 60);
    grad.addColorStop(0, foreground ? theme.waterTop : theme.waterDeep);
    grad.addColorStop(1, theme.waterDeep);
    ctx.fillStyle = grad;

    ctx.beginPath();
    ctx.moveTo(-200, WORLD.HEIGHT + 120);
    for (let x = -200; x <= WORLD.WIDTH + 200; x += 28) {
      const wave =
        Math.sin(x * 0.025 + this.time * (foreground ? 3.2 : 2.1)) * (foreground ? 4.5 : 3) +
        Math.cos(x * 0.015 - this.time * 1.6) * 2;
      ctx.lineTo(x, waterLevel + wave + (foreground ? 2 : -2));
    }
    ctx.lineTo(WORLD.WIDTH + 200, WORLD.HEIGHT + 120);
    ctx.closePath();
    ctx.fill();

    if (foreground) {
      ctx.strokeStyle = theme.waterFoam;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let x = -200; x <= WORLD.WIDTH + 200; x += 28) {
        const wave =
          Math.sin(x * 0.025 + this.time * 3.2) * 4.5 +
          Math.cos(x * 0.015 - this.time * 1.6) * 2;
        if (x === -200) ctx.moveTo(x, waterLevel + wave + 2);
        else ctx.lineTo(x, waterLevel + wave + 2);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawCrate(ctx, crate) {
    ctx.save();
    ctx.translate(crate.x, crate.y);

    // Parachute when falling
    if (!crate.grounded) {
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-12, -24);
      ctx.lineTo(-6, -8);
      ctx.moveTo(12, -24);
      ctx.lineTo(6, -8);
      ctx.stroke();

      ctx.fillStyle = crate.kind === 'medkit' ? '#ff4d4f' : '#38bdf8';
      ctx.beginPath();
      ctx.arc(0, -24, 14, Math.PI, 0);
      ctx.fill();
    }

    // Crate box
    ctx.fillStyle = crate.kind === 'medkit' ? '#f8fafc' : '#d97706';
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1.8;
    ctx.fillRect(-9, -9, 18, 18);
    ctx.strokeRect(-9, -9, 18, 18);

    // Symbol
    ctx.fillStyle = crate.kind === 'medkit' ? '#ef4444' : '#fef08a';
    if (crate.kind === 'medkit') {
      ctx.fillRect(-2, -6, 4, 12);
      ctx.fillRect(-6, -2, 12, 4);
    } else {
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('★', 0, 1);
    }
    ctx.restore();
  }

  _drawWorm(ctx, worm, isActive, game) {
    const team = TEAMS[worm.teamId];
    const bob = worm.grounded ? Math.sin(worm.walkPhase) * 1.4 : 0;

    ctx.save();
    ctx.translate(worm.x, worm.y + bob);

    // Active worm golden bounce arrow above head
    if (isActive && game.phase !== PHASE.GAME_OVER) {
      const arrowY = -44 + Math.sin(this.time * 6) * 4;
      ctx.fillStyle = '#fde047';
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, arrowY + 8);
      ctx.lineTo(-6, arrowY);
      ctx.lineTo(6, arrowY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Worm segmented pink body (classic Worms silhouette)
    ctx.save();
    ctx.scale(worm.facing, 1);

    // Tail segment
    ctx.fillStyle = '#f8b4b4';
    ctx.strokeStyle = '#7f1d1d';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(-6, 6, 7, 5, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Main torso
    ctx.fillStyle = '#fbcfe8';
    ctx.beginPath();
    ctx.ellipse(0, 1, 7.5, 10, -0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Team headband
    ctx.fillStyle = team.bandColor;
    ctx.fillRect(-7, -7, 14, 3.5);
    // Flowing headband tail
    ctx.beginPath();
    ctx.moveTo(-7, -5.5);
    ctx.lineTo(-13, -7 + Math.sin(this.time * 8 + worm.id) * 2);
    ctx.lineTo(-12, -3.5 + Math.sin(this.time * 8 + worm.id) * 2);
    ctx.closePath();
    ctx.fill();

    // Expressive eyes
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(2.5, -3, 2.7, 3.2, 0, 0, Math.PI * 2);
    ctx.ellipse(6.2, -3, 2.5, 3.0, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(3.3, -3, 1.2, 0, Math.PI * 2);
    ctx.arc(7.0, -3, 1.2, 0, Math.PI * 2);
    ctx.fill();

    // Held weapon indicator for active worm
    if (isActive && game.phase === PHASE.PLAYER_TURN) {
      const weapon = WEAPON_MAP[game.selectedWeaponId];
      ctx.save();
      ctx.translate(2, 0);
      ctx.rotate(worm.aimAngle);
      if (weapon.id === 'bazooka') {
        ctx.fillStyle = '#3f6212';
        ctx.fillRect(-6, -3, 19, 6);
        ctx.fillStyle = '#84cc16';
        ctx.fillRect(10, -4, 4, 8);
      } else if (weapon.id === 'shotgun') {
        ctx.fillStyle = '#334155';
        ctx.fillRect(0, -2, 16, 3.5);
        ctx.fillStyle = '#92400e';
        ctx.fillRect(-5, -1, 7, 4);
      } else if (weapon.id === 'grenade' || weapon.id === 'cluster') {
        ctx.fillStyle = weapon.id === 'cluster' ? '#dc2626' : '#15803d';
        ctx.beginPath();
        ctx.arc(9, 0, 4.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (weapon.id === 'dynamite') {
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(5, -5, 6, 10);
      }
      ctx.restore();
    }

    ctx.restore();

    // Aiming crosshair & power gauge for active worm
    if (isActive && game.phase === PHASE.PLAYER_TURN && !game.isAiTurn()) {
      const worldAngle = getWorldAimAngle(worm);
      const dist = 42;
      const cx = Math.cos(worldAngle) * dist;
      const cy = -3 + Math.sin(worldAngle) * dist;

      // Crosshair
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 7, 0, Math.PI * 2);
      ctx.moveTo(cx - 11, cy);
      ctx.lineTo(cx - 4, cy);
      ctx.moveTo(cx + 4, cy);
      ctx.lineTo(cx + 11, cy);
      ctx.moveTo(cx, cy - 11);
      ctx.lineTo(cx, cy - 4);
      ctx.moveTo(cx, cy + 4);
      ctx.lineTo(cx, cy + 11);
      ctx.stroke();

      // Power charge arc along firing vector
      if (game.charging) {
        const len = 18 + game.chargePower * 44;
        const grad = ctx.createLinearGradient(0, 0, Math.cos(worldAngle) * len, Math.sin(worldAngle) * len);
        grad.addColorStop(0, '#52c41a');
        grad.addColorStop(0.55, '#fadb14');
        grad.addColorStop(1, '#ff4d4f');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(Math.cos(worldAngle) * 14, -3 + Math.sin(worldAngle) * 14);
        ctx.lineTo(Math.cos(worldAngle) * len, -3 + Math.sin(worldAngle) * len);
        ctx.stroke();
      }
    }

    // Nameplate & HP badge above worm
    ctx.font = 'bold 11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    const label = `${worm.name} ${worm.hp}`;
    const tw = ctx.measureText(label).width + 10;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
    ctx.beginPath();
    ctx.roundRect(-tw / 2, -32, tw, 16, 4);
    ctx.fill();
    ctx.strokeStyle = team.color;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = team.accent;
    ctx.fillText(label, 0, -20.5);

    ctx.restore();
  }

  _drawProjectile(ctx, p) {
    // Smoke trail
    if (p.trail.length > 1) {
      ctx.save();
      for (let i = 0; i < p.trail.length; i++) {
        const pt = p.trail[i];
        const ratio = i / p.trail.length;
        ctx.globalAlpha = ratio * 0.45;
        ctx.fillStyle = p.weaponId === 'bazooka' || p.type === 'airstrike_missile' ? '#e2e8f0' : '#fef08a';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 1.5 + ratio * 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.save();
    ctx.translate(p.x, p.y);
    const angle = Math.atan2(p.vy, p.vx);

    if (p.weaponId === 'bazooka' || p.type === 'airstrike_missile') {
      ctx.rotate(angle);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(-7, -3, 12, 6);
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(5, -3.5);
      ctx.lineTo(10, 0);
      ctx.lineTo(5, 3.5);
      ctx.closePath();
      ctx.fill();
    } else if (p.weaponId === 'dynamite') {
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(-4, -7, 8, 14);
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(0, -9, 2.5 + Math.sin(this.time * 30) * 1.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = p.weaponId === 'cluster' || p.weaponId === 'cluster_sub' ? '#dc2626' : '#16a34a';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Countdown timer above fused weapons
    if (p.fuse > 0 && p.fuseRemaining > 0) {
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fef08a';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2.5;
      const secs = Math.ceil(p.fuseRemaining);
      ctx.strokeText(`${secs}`, 0, -12);
      ctx.fillText(`${secs}`, 0, -12);
    }

    ctx.restore();
  }

  _drawMinimap(ctx, game, cw, ch) {
    const mw = 160;
    const mh = 80;
    const mx = cw - mw - 14;
    const my = 62;

    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(mx, my, mw, mh, 8);
    ctx.fill();
    ctx.stroke();

    if (game.terrain.canvas) {
      ctx.drawImage(game.terrain.canvas, mx + 2, my + 2, mw - 4, mh - 4);
    }

    // Water line on minimap
    const wy = my + (game.waterLevel / WORLD.HEIGHT) * mh;
    ctx.fillStyle = 'rgba(56, 189, 248, 0.45)';
    ctx.fillRect(mx + 2, wy, mw - 4, my + mh - wy - 2);

    // Worms dots
    for (const w of game.worms) {
      if (!w.alive) continue;
      const wx = mx + (w.x / WORLD.WIDTH) * mw;
      const wyDot = my + (w.y / WORLD.HEIGHT) * mh;
      ctx.fillStyle = TEAMS[w.teamId].color;
      ctx.beginPath();
      ctx.arc(wx, wyDot, w.id === game.activeWormId ? 3.5 : 2.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
