/**
 * Web COD — Operation Ironline
 * 2.5D/3D Textured Raycasting Renderer, Z-Buffered Tactical Entities,
 * Procedural First-Person Weapon Models, Sniper Scope, and Tactical HUD.
 */
(function (root) {
  'use strict';

  const Config =
    typeof module !== 'undefined' && module.exports
      ? require('./config')
      : root.WebCOD.Config;

  class TacticalRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.textures = this.generateTextures();
      this.zBuffer = [];
      this.airstrikeFlash = 0;
    }

    generateTextures() {
      const size = 64;
      const makeTex = (drawFn) => {
        const c = document.createElement('canvas');
        c.width = size;
        c.height = size;
        const g = c.getContext('2d');
        drawFn(g, size);
        return c;
      };

      return {
        // 1: Concrete bunker wall
        1: makeTex((g, s) => {
          g.fillStyle = '#575c63';
          g.fillRect(0, 0, s, s);
          for (let y = 0; y < s; y += 16) {
            g.fillStyle = '#3f444a';
            g.fillRect(0, y, s, 2);
            const offset = (y / 16) % 2 === 0 ? 0 : 16;
            for (let x = offset; x < s; x += 32) {
              g.fillRect(x, y, 2, 16);
            }
          }
          // Grit speckles
          for (let i = 0; i < 120; i++) {
            const x = (i * 37) % s;
            const y = (i * 53) % s;
            g.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.12)';
            g.fillRect(x, y, 2, 2);
          }
        }),
        // 2: Corrugated shipping container
        2: makeTex((g, s) => {
          g.fillStyle = '#7c3a25';
          g.fillRect(0, 0, s, s);
          for (let x = 0; x < s; x += 8) {
            g.fillStyle = '#5c2818';
            g.fillRect(x, 0, 3, s);
            g.fillStyle = '#994c33';
            g.fillRect(x + 3, 0, 2, s);
          }
          g.fillStyle = '#3b190f';
          g.fillRect(0, 0, s, 4);
          g.fillRect(0, s - 4, s, 4);
        }),
        // 3: Tactical hazard barricade
        3: makeTex((g, s) => {
          g.fillStyle = '#333840';
          g.fillRect(0, 0, s, s);
          g.fillStyle = '#d97706';
          g.fillRect(0, 22, s, 18);
          g.fillStyle = '#18181b';
          for (let i = -s; i < s * 2; i += 16) {
            g.beginPath();
            g.moveTo(i, 22);
            g.lineTo(i + 8, 22);
            g.lineTo(i - 4, 40);
            g.lineTo(i - 12, 40);
            g.closePath();
            g.fill();
          }
          g.strokeStyle = '#525866';
          g.lineWidth = 2;
          g.strokeRect(2, 2, s - 4, s - 4);
        }),
        // 4: Reinforced dark steel perimeter
        4: makeTex((g, s) => {
          g.fillStyle = '#272d36';
          g.fillRect(0, 0, s, s);
          g.strokeStyle = '#3b4452';
          g.lineWidth = 2;
          g.strokeRect(3, 3, s - 6, s - 6);
          g.fillStyle = '#1a1f26';
          g.fillRect(0, s / 2 - 1, s, 2);
          // Corner rivets
          g.fillStyle = '#64748b';
          [8, s - 10].forEach((rx) => {
            [8, s - 10].forEach((ry) => {
              g.fillRect(rx, ry, 3, 3);
            });
          });
        })
      };
    }

    notifyAirstrike() {
      this.airstrikeFlash = 0.7;
    }

    render(engine, dtSec = 0.016) {
      const ctx = this.ctx;
      const w = this.canvas.width;
      const h = this.canvas.height;
      if (w <= 0 || h <= 0) return;

      this.airstrikeFlash = Math.max(0, this.airstrikeFlash - dtSec * 1.4);

      const player = engine.player;
      const weaponSpec = engine.weapons.getCurrentSpec();
      const ads = engine.weapons.adsProgress;

      const baseFov = Config.PLAYER_DEFAULTS.baseFov;
      const fov = baseFov * (1 - ads * (1 - weaponSpec.adsFovFactor));

      const shakeX = (Math.random() - 0.5) * engine.screenShake * 10;
      const shakeY = (Math.random() - 0.5) * engine.screenShake * 10;
      const crouchOffset = player.isCrouching ? -h * 0.055 : 0;
      const bobY = Math.sin(player.bobPhase) * 5 * player.moveIntensity;
      const horizonY = Math.round(h * 0.5 + player.pitch * h * 0.45 + crouchOffset + bobY + shakeY);

      ctx.save();
      ctx.translate(shakeX, 0);

      // 1. Sky & Ground
      const skyGrad = ctx.createLinearGradient(0, 0, 0, Math.max(1, horizonY));
      skyGrad.addColorStop(0, '#0f172a');
      skyGrad.addColorStop(0.65, '#1e293b');
      skyGrad.addColorStop(1, '#334155');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(-16, 0, w + 32, Math.max(0, horizonY));

      const floorGrad = ctx.createLinearGradient(0, Math.max(0, horizonY), 0, h);
      floorGrad.addColorStop(0, '#1e2228');
      floorGrad.addColorStop(0.4, '#2a2f36');
      floorGrad.addColorStop(1, '#14171c');
      ctx.fillStyle = floorGrad;
      ctx.fillRect(-16, Math.max(0, horizonY), w + 32, h - Math.max(0, horizonY));

      // 2. Raycast Textured Walls
      const rayCount = Math.min(w, Math.max(180, Math.floor(w / 2)));
      const stripWidth = w / rayCount;
      this.zBuffer.length = rayCount;

      for (let i = 0; i < rayCount; i++) {
        const cameraX = (i / rayCount) - 0.5;
        const rayAngle = player.angle + cameraX * fov;
        const hit = engine.map.castRay(player.x, player.y, rayAngle, 34);
        const correctedDist = Math.max(0.08, hit.dist * Math.cos(rayAngle - player.angle));
        this.zBuffer[i] = correctedDist;

        if (!hit.hit) continue;

        const wallHeight = (h * 0.92) / correctedDist;
        const drawTop = horizonY - wallHeight * 0.5;
        const tex = this.textures[hit.tile] || this.textures[1];
        const texX = Math.floor(hit.wallX * 64) & 63;

        ctx.drawImage(
          tex,
          texX,
          0,
          1,
          64,
          i * stripWidth,
          drawTop,
          stripWidth + 0.8,
          wallHeight
        );

        // Directional shading + atmospheric fog
        const fog = Math.min(0.82, correctedDist / 22);
        const sideDark = hit.side === 1 ? 0.22 : 0.0;
        const shadeAlpha = Math.min(0.88, fog + sideDark);
        if (shadeAlpha > 0.02) {
          ctx.fillStyle = `rgba(10, 14, 20, ${shadeAlpha.toFixed(3)})`;
          ctx.fillRect(i * stripWidth, drawTop, stripWidth + 0.8, wallHeight);
        }
      }

      // 3. Z-Buffered Sprites (Enemies + Tactical Pickups)
      const sprites = [];
      for (const enemy of engine.enemies) {
        if (!enemy.alive) continue;
        const dx = enemy.x - player.x;
        const dy = enemy.y - player.y;
        sprites.push({
          kind: 'enemy',
          ref: enemy,
          dist: Math.hypot(dx, dy),
          angle: Math.atan2(dy, dx)
        });
      }
      for (const p of engine.pickups) {
        const dx = p.x - player.x;
        const dy = p.y - player.y;
        sprites.push({
          kind: 'pickup',
          ref: p,
          dist: Math.hypot(dx, dy),
          angle: Math.atan2(dy, dx)
        });
      }
      sprites.sort((a, b) => b.dist - a.dist);

      for (const sp of sprites) {
        let relAngle = sp.angle - player.angle;
        while (relAngle < -Math.PI) relAngle += Math.PI * 2;
        while (relAngle > Math.PI) relAngle -= Math.PI * 2;
        if (Math.abs(relAngle) > fov * 0.72 || sp.dist < 0.25) continue;

        const screenX = (0.5 + relAngle / fov) * w;
        const perpDist = sp.dist * Math.cos(relAngle);
        if (perpDist <= 0.15) continue;

        const rayIdx = Math.floor((screenX / w) * rayCount);
        if (rayIdx >= 0 && rayIdx < rayCount && perpDist > this.zBuffer[rayIdx] + 0.15) {
          continue; // Occluded by wall
        }

        if (sp.kind === 'enemy') {
          this.drawEnemySprite(ctx, sp.ref, screenX, horizonY, h, perpDist);
        } else {
          this.drawPickupSprite(ctx, sp.ref, screenX, horizonY, h, perpDist, engine.nowMs);
        }
      }

      ctx.restore();

      // 4. First-Person Weapon or Sniper Scope
      if (weaponSpec.scoped && ads > 0.65) {
        this.drawSniperScope(ctx, w, h, engine);
      } else {
        this.drawFirstPersonWeapon(ctx, w, h, engine);
        this.drawCrosshair(ctx, w, h, engine);
      }

      // 5. Hitmarker & Damage Indicators
      this.drawHitmarker(ctx, w, h, engine.hitmarker);
      this.drawDamageEffects(ctx, w, h, player);

      if (this.airstrikeFlash > 0) {
        ctx.fillStyle = `rgba(255, 210, 120, ${(this.airstrikeFlash * 0.45).toFixed(2)})`;
        ctx.fillRect(0, 0, w, h);
      }

      // 6. Tactical Minimap Radar
      this.drawMinimap(ctx, engine);
    }

    drawEnemySprite(ctx, enemy, screenX, horizonY, h, perpDist) {
      const spriteH = (h * 0.84) / perpDist;
      const spriteW = spriteH * 0.56;
      const top = horizonY - spriteH * 0.48;
      const left = screenX - spriteW * 0.5;

      const flash = enemy.hitFlash > 0;
      const fogFactor = Math.max(0.25, 1 - perpDist / 24);

      ctx.save();
      ctx.globalAlpha = Math.min(1, fogFactor + 0.2);

      // Shadow under boots
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.ellipse(screenX, top + spriteH * 0.96, spriteW * 0.4, spriteH * 0.045, 0, 0, Math.PI * 2);
      ctx.fill();

      // Legs
      ctx.fillStyle = flash ? '#ffffff' : '#1e293b';
      ctx.fillRect(left + spriteW * 0.24, top + spriteH * 0.62, spriteW * 0.2, spriteH * 0.34);
      ctx.fillRect(left + spriteW * 0.56, top + spriteH * 0.62, spriteW * 0.2, spriteH * 0.34);

      // Torso / Ballistic Vest
      ctx.fillStyle = flash ? '#fca5a5' : enemy.bodyColor;
      ctx.fillRect(left + spriteW * 0.16, top + spriteH * 0.26, spriteW * 0.68, spriteH * 0.38);
      ctx.fillStyle = flash ? '#ffffff' : enemy.armorColor;
      ctx.fillRect(left + spriteW * 0.24, top + spriteH * 0.3, spriteW * 0.52, spriteH * 0.28);

      // Tactical Helmet & Visor
      ctx.fillStyle = flash ? '#ffffff' : '#0f172a';
      ctx.beginPath();
      ctx.arc(screenX, top + spriteH * 0.16, spriteW * 0.24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = enemy.visorColor;
      ctx.fillRect(screenX - spriteW * 0.14, top + spriteH * 0.13, spriteW * 0.28, spriteH * 0.05);

      // Rifle silhouette
      ctx.fillStyle = '#111827';
      ctx.fillRect(left + spriteW * 0.62, top + spriteH * 0.38, spriteW * 0.36, spriteH * 0.065);

      // Enemy muzzle flash
      if (enemy.muzzleFlash > 0) {
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.arc(left + spriteW * 0.98, top + spriteH * 0.41, spriteW * 0.14, 0, Math.PI * 2);
        ctx.fill();
      }

      // Floating HP bar when damaged
      if (enemy.hp < enemy.maxHp) {
        const barW = Math.max(26, spriteW * 0.85);
        const barH = 4;
        const bx = screenX - barW / 2;
        const by = top - 10;
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(bx, by, barW, barH);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(bx, by, barW * (enemy.hp / enemy.maxHp), barH);
      }

      ctx.restore();
    }

    drawPickupSprite(ctx, pickup, screenX, horizonY, h, perpDist, nowMs) {
      const size = (h * 0.26) / perpDist;
      const bob = Math.sin(nowMs * 0.005) * (size * 0.12);
      const y = horizonY + (h * 0.25) / perpDist + bob;
      const isMed = pickup.type === 'medkit';

      ctx.save();
      ctx.fillStyle = isMed ? '#16a34a' : '#d97706';
      ctx.fillRect(screenX - size * 0.5, y - size * 0.5, size, size * 0.75);
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = Math.max(1, size * 0.06);
      ctx.strokeRect(screenX - size * 0.5, y - size * 0.5, size, size * 0.75);

      ctx.fillStyle = '#ffffff';
      if (isMed) {
        ctx.fillRect(screenX - size * 0.08, y - size * 0.34, size * 0.16, size * 0.42);
        ctx.fillRect(screenX - size * 0.22, y - size * 0.2, size * 0.44, size * 0.14);
      } else {
        ctx.fillRect(screenX - size * 0.22, y - size * 0.26, size * 0.44, size * 0.1);
        ctx.fillRect(screenX - size * 0.22, y - size * 0.08, size * 0.44, size * 0.1);
      }
      ctx.restore();
    }

    drawFirstPersonWeapon(ctx, w, h, engine) {
      const spec = engine.weapons.getCurrentSpec();
      const ads = engine.weapons.adsProgress;
      const recoil = engine.weapons.recoilOffset;
      const reloadDrop = engine.weapons.reloading ? h * 0.16 : 0;

      const bobX = Math.cos(engine.player.bobPhase * 0.5) * 10 * engine.player.moveIntensity * (1 - ads * 0.75);
      const bobY = Math.abs(Math.sin(engine.player.bobPhase * 0.5)) * 8 * engine.player.moveIntensity * (1 - ads * 0.75);

      const baseX = w * (0.66 - ads * 0.16) + bobX;
      const baseY = h * (0.82 - ads * 0.06) + bobY + recoil * h * 0.6 + reloadDrop;

      ctx.save();
      ctx.translate(baseX, baseY);

      // Muzzle flash
      if (engine.weapons.muzzleFlashTimer > 0) {
        const grad = ctx.createRadialGradient(-20, -95, 4, -20, -95, 58);
        grad.addColorStop(0, 'rgba(255, 250, 205, 0.95)');
        grad.addColorStop(0.45, 'rgba(251, 146, 60, 0.75)');
        grad.addColorStop(1, 'rgba(251, 146, 60, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(-20, -95, 58, 0, Math.PI * 2);
        ctx.fill();
      }

      // Receiver / barrel body
      ctx.fillStyle = '#18181b';
      ctx.fillRect(-34, -108, 22, 85); // barrel shroud
      ctx.fillStyle = spec.color;
      ctx.fillRect(-46, -42, 68, 92); // upper receiver
      ctx.fillStyle = '#09090b';
      ctx.fillRect(-32, -58, 34, 18); // rail mount

      // Tactical red-dot optic
      ctx.strokeStyle = '#3f3f46';
      ctx.lineWidth = 4;
      ctx.strokeRect(-28, -84, 26, 24);
      ctx.fillStyle = spec.accent;
      ctx.beginPath();
      ctx.arc(-15, -72, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Side tactical stripe
      ctx.fillStyle = spec.accent;
      ctx.fillRect(-42, -14, 58, 5);

      ctx.restore();
    }

    drawSniperScope(ctx, w, h, engine) {
      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) * 0.39;

      ctx.save();
      ctx.fillStyle = 'rgba(4, 7, 12, 0.95)';
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.arc(cx, cy, radius, 0, Math.PI * 2, true);
      ctx.fill();

      // Crosshair mil-dots
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - radius, cy);
      ctx.lineTo(cx + radius, cy);
      ctx.moveTo(cx, cy - radius);
      ctx.lineTo(cx, cy + radius);
      ctx.stroke();

      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    drawCrosshair(ctx, w, h, engine) {
      const cx = w / 2;
      const cy = h / 2;
      const ads = engine.weapons.adsProgress;
      const gap = Math.max(4, (14 - ads * 9) + engine.weapons.recoilOffset * 140 + engine.player.moveIntensity * 6);
      const len = ads > 0.5 ? 7 : 10;

      ctx.save();
      ctx.strokeStyle = 'rgba(248, 250, 252, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - gap - len, cy);
      ctx.lineTo(cx - gap, cy);
      ctx.moveTo(cx + gap, cy);
      ctx.lineTo(cx + gap + len, cy);
      ctx.moveTo(cx, cy - gap - len);
      ctx.lineTo(cx, cy - gap);
      ctx.moveTo(cx, cy + gap);
      ctx.lineTo(cx, cy + gap + len);
      ctx.stroke();

      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(cx - 1, cy - 1, 2, 2);
      ctx.restore();
    }

    drawHitmarker(ctx, w, h, hitmarker) {
      if (hitmarker.timer <= 0) return;
      const cx = w / 2;
      const cy = h / 2;
      const alpha = Math.min(1, hitmarker.timer / 0.16);
      const color =
        hitmarker.type === 'kill'
          ? `rgba(250, 204, 21, ${alpha})`
          : hitmarker.type === 'headshot'
          ? `rgba(239, 68, 68, ${alpha})`
          : `rgba(255, 255, 255, ${alpha})`;

      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      const a = 6;
      const b = 15;
      ctx.beginPath();
      ctx.moveTo(cx - b, cy - b); ctx.lineTo(cx - a, cy - a);
      ctx.moveTo(cx + b, cy - b); ctx.lineTo(cx + a, cy - a);
      ctx.moveTo(cx - b, cy + b); ctx.lineTo(cx - a, cy + a);
      ctx.moveTo(cx + b, cy + b); ctx.lineTo(cx + a, cy + a);
      ctx.stroke();
      ctx.restore();
    }

    drawDamageEffects(ctx, w, h, player) {
      const lowHpRatio = Math.max(0, (55 - player.hp) / 55);
      const flashAlpha = Math.max(player.damageFlash * 0.38, lowHpRatio * 0.45);
      if (flashAlpha > 0.01) {
        const grad = ctx.createRadialGradient(
          w / 2, h / 2, Math.min(w, h) * 0.28,
          w / 2, h / 2, Math.max(w, h) * 0.65
        );
        grad.addColorStop(0, 'rgba(185, 28, 28, 0)');
        grad.addColorStop(1, `rgba(185, 28, 28, ${flashAlpha.toFixed(2)})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }

      // Directional hit indicator arc
      if (player.damageFlash > 0.05 && player.lastHitAngle !== null) {
        const rel = player.lastHitAngle - player.angle;
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.rotate(rel - Math.PI / 2);
        ctx.strokeStyle = `rgba(239, 68, 68, ${player.damageFlash.toFixed(2)})`;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(0, 0, 68, -0.35, 0.35);
        ctx.stroke();
        ctx.restore();
      }
    }

    drawMinimap(ctx, engine) {
      const map = engine.map;
      const pad = 14;
      const size = Math.min(136, Math.floor(this.canvas.width * 0.22));
      if (size < 72) return;
      const cell = size / map.width;

      ctx.save();
      ctx.translate(pad, pad);

      ctx.fillStyle = 'rgba(9, 13, 20, 0.78)';
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = engine.player.isUavActive(engine.nowMs)
        ? '#22d3ee'
        : 'rgba(148, 163, 184, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(0, 0, size, size);

      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          if (map.grid[y][x] > 0) {
            ctx.fillStyle = 'rgba(100, 116, 139, 0.75)';
            ctx.fillRect(x * cell, y * cell, cell, cell);
          }
        }
      }

      // Pickups
      for (const p of engine.pickups) {
        ctx.fillStyle = p.type === 'medkit' ? '#22c55e' : '#f59e0b';
        ctx.fillRect(p.x * cell - 2, p.y * cell - 2, 4, 4);
      }

      // Enemies (visible when UAV active or within close radar range / recently fired)
      const uavOn = engine.player.isUavActive(engine.nowMs);
      for (const e of engine.enemies) {
        if (!e.alive) continue;
        const dist = Math.hypot(e.x - engine.player.x, e.y - engine.player.y);
        if (uavOn || dist < 6.5 || e.muzzleFlash > 0) {
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(e.x * cell, e.y * cell, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Player position + FOV cone
      const px = engine.player.x * cell;
      const py = engine.player.y * cell;
      ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.arc(px, py, cell * 3.2, engine.player.angle - 0.5, engine.player.angle + 0.5);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(px, py, 3.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TacticalRenderer };
  } else {
    root.WebCOD = root.WebCOD || {};
    root.WebCOD.TacticalRenderer = TacticalRenderer;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
