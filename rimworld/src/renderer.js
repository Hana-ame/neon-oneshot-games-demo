/**
 * HTML5 Canvas 2D renderer for Web RimWorld: camera pan/zoom, terrain, structures,
 * colonists, raiders, day/night lighting, weather particles, and drag-selection.
 */

import { TILE_SIZE, TERRAIN_INFO, BUILDING_INFO, NATURAL_OBJECTS } from './constants.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camera = { x: 0, y: 0, zoom: 1.0 };
    this.rainDrops = Array.from({ length: 70 }, () => ({
      x: Math.random(),
      y: Math.random(),
      speed: 0.45 + Math.random() * 0.4,
    }));
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(300, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(200, Math.floor(rect.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.viewW = rect.width;
    this.viewH = rect.height;
  }

  centerOn(tileX, tileY) {
    this.camera.x = (tileX + 0.5) * TILE_SIZE;
    this.camera.y = (tileY + 0.5) * TILE_SIZE;
  }

  screenToTile(sx, sy) {
    const wx = (sx - this.viewW / 2) / this.camera.zoom + this.camera.x;
    const wy = (sy - this.viewH / 2) / this.camera.zoom + this.camera.y;
    return {
      x: Math.floor(wx / TILE_SIZE),
      y: Math.floor(wy / TILE_SIZE),
      wx: wx / TILE_SIZE,
      wy: wy / TILE_SIZE,
    };
  }

  render(world, uiState, timeSec) {
    const ctx = this.ctx;
    const w = this.viewW || this.canvas.width;
    const h = this.viewH || this.canvas.height;

    ctx.fillStyle = '#14191f';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(this.camera.zoom, this.camera.zoom);
    ctx.translate(-this.camera.x, -this.camera.y);

    // Visible tile bounds (frustum culling)
    const halfW = w / (2 * this.camera.zoom);
    const halfH = h / (2 * this.camera.zoom);
    const minX = Math.max(0, Math.floor((this.camera.x - halfW) / TILE_SIZE) - 1);
    const maxX = Math.min(world.map.width - 1, Math.ceil((this.camera.x + halfW) / TILE_SIZE) + 1);
    const minY = Math.max(0, Math.floor((this.camera.y - halfH) / TILE_SIZE) - 1);
    const maxY = Math.min(world.map.height - 1, Math.ceil((this.camera.y + halfH) / TILE_SIZE) + 1);

    // 1. Terrain & Zones & Crops
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const tile = world.getTile(x, y);
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;
        const tInfo = TERRAIN_INFO[tile.terrain];

        ctx.fillStyle = tile.variant ? tInfo.color : tInfo.altColor;
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

        // Subtle grid line
        ctx.strokeStyle = 'rgba(0,0,0,0.08)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);

        // Zones
        if (tile.zone === 'stockpile') {
          ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
          ctx.fillRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.48)';
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 1.5, py + 1.5, TILE_SIZE - 3, TILE_SIZE - 3);
        } else if (tile.zone === 'growing') {
          ctx.fillStyle = 'rgba(132, 204, 22, 0.15)';
          ctx.fillRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          ctx.strokeStyle = 'rgba(163, 230, 53, 0.45)';
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 1.5, py + 1.5, TILE_SIZE - 3, TILE_SIZE - 3);
        }

        // Crops
        if (tile.crop) {
          const pct = tile.crop.progress / 100;
          const r = 3 + pct * 7;
          ctx.fillStyle = pct >= 1 ? '#eab308' : '#84cc16';
          for (const [ox, oy] of [[9, 10], [22, 11], [11, 22], [22, 22]]) {
            ctx.beginPath();
            ctx.arc(px + ox, py + oy, r * 0.45, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }

    // 2. Natural Objects & Buildings & Orders
    const lights = [];
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const tile = world.getTile(x, y);
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;

        if (tile.natural) {
          this._drawNatural(ctx, tile.natural, px, py);
        }

        if (tile.building) {
          this._drawBuilding(ctx, tile.building, px, py, timeSec, world.power.net >= 0 && world.power.produced > 0);
          const bInfo = BUILDING_INFO[tile.building.type];
          if (tile.building.built && bInfo.lightRadius) {
            lights.push({ x: px + TILE_SIZE / 2, y: py + TILE_SIZE / 2, r: bInfo.lightRadius * TILE_SIZE });
          }
        }

        if (tile.order) {
          this._drawOrderMarker(ctx, tile.order, px, py);
        }
      }
    }

    // 3. Selected turret range indicator
    if (uiState.selectedTile) {
      const st = world.getTile(uiState.selectedTile.x, uiState.selectedTile.y);
      if (st?.building?.built && st.building.type === 'turret') {
        ctx.save();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
        ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(
          (st.x + 0.5) * TILE_SIZE,
          (st.y + 0.5) * TILE_SIZE,
          BUILDING_INFO.turret.range * TILE_SIZE,
          0,
          Math.PI * 2
        );
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }

    // 4. Colonists
    for (const c of world.colonists) {
      if (!c.alive) continue;
      this._drawPawn(ctx, c, uiState.selectedColonistId === c.id, false, timeSec);
    }

    // 5. Raiders
    for (const r of world.raiders) {
      if (!r.alive) continue;
      this._drawPawn(ctx, r, false, true, timeSec);
    }

    // 6. Projectiles
    for (const p of world.projectiles) {
      ctx.save();
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo((p.x1 + 0.5) * TILE_SIZE, (p.y1 + 0.5) * TILE_SIZE);
      ctx.lineTo((p.x2 + 0.5) * TILE_SIZE, (p.y2 + 0.5) * TILE_SIZE);
      ctx.stroke();
      ctx.restore();
    }

    // 7. Hover & Drag preview
    if (uiState.hoverTile) {
      const { x, y } = uiState.hoverTile;
      if (uiState.dragStart && uiState.activeTool && uiState.activeTool.mode !== 'select') {
        const x1 = Math.min(uiState.dragStart.x, x);
        const x2 = Math.max(uiState.dragStart.x, x);
        const y1 = Math.min(uiState.dragStart.y, y);
        const y2 = Math.max(uiState.dragStart.y, y);
        ctx.fillStyle = 'rgba(250, 204, 21, 0.22)';
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 1.5;
        ctx.fillRect(x1 * TILE_SIZE, y1 * TILE_SIZE, (x2 - x1 + 1) * TILE_SIZE, (y2 - y1 + 1) * TILE_SIZE);
        ctx.strokeRect(x1 * TILE_SIZE, y1 * TILE_SIZE, (x2 - x1 + 1) * TILE_SIZE, (y2 - y1 + 1) * TILE_SIZE);
      } else {
        ctx.strokeStyle = uiState.activeTool?.mode === 'build' ? '#38bdf8' : 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x * TILE_SIZE + 1, y * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2);
      }
    }

    // 8. Floating feedback texts
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    for (const f of world.floatingTexts) {
      ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
      ctx.fillStyle = '#000000';
      ctx.fillText(f.text, (f.x + 0.5) * TILE_SIZE + 1, (f.y + 0.3) * TILE_SIZE + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, (f.x + 0.5) * TILE_SIZE, (f.y + 0.3) * TILE_SIZE);
    }
    ctx.globalAlpha = 1;

    // 9. Day/Night ambient darkness & warm glow cutouts
    const light = world.getAmbientLight();
    if (light < 0.98) {
      const darkness = (1 - light) * 0.72;
      ctx.fillStyle = `rgba(10, 18, 34, ${darkness.toFixed(3)})`;
      ctx.fillRect(
        this.camera.x - halfW - TILE_SIZE,
        this.camera.y - halfH - TILE_SIZE,
        halfW * 2 + TILE_SIZE * 2,
        halfH * 2 + TILE_SIZE * 2
      );

      // Warm torch/campfire glow
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const l of lights) {
        const grad = ctx.createRadialGradient(l.x, l.y, 4, l.x, l.y, l.r);
        grad.addColorStop(0, 'rgba(255, 190, 92, 0.38)');
        grad.addColorStop(1, 'rgba(255, 140, 40, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(l.x, l.y, l.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.restore();

    // 10. Weather screen-space overlay (rain/heat/cold)
    if (world.weather.id === 'rain') {
      ctx.save();
      ctx.strokeStyle = 'rgba(147, 197, 253, 0.35)';
      ctx.lineWidth = 1;
      for (const drop of this.rainDrops) {
        drop.y = (drop.y + drop.speed * 0.025) % 1;
        drop.x = (drop.x + 0.004) % 1;
        const dx = drop.x * w;
        const dy = drop.y * h;
        ctx.beginPath();
        ctx.moveTo(dx, dy);
        ctx.lineTo(dx + 4, dy + 12);
        ctx.stroke();
      }
      ctx.restore();
    } else if (world.weather.id === 'heatwave') {
      ctx.fillStyle = 'rgba(249, 115, 22, 0.06)';
      ctx.fillRect(0, 0, w, h);
    } else if (world.weather.id === 'coldsnap') {
      ctx.fillStyle = 'rgba(125, 211, 252, 0.08)';
      ctx.fillRect(0, 0, w, h);
    }
  }

  _drawNatural(ctx, type, px, py) {
    if (type === NATURAL_OBJECTS.TREE) {
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(px + 18, py + 24, 10, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      // Trunk
      ctx.fillStyle = '#5c4028';
      ctx.fillRect(px + 14, py + 16, 4, 10);
      // Canopy
      ctx.fillStyle = '#2c5e2e';
      ctx.beginPath();
      ctx.arc(px + 16, py + 13, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3d7a3f';
      ctx.beginPath();
      ctx.arc(px + 13, py + 11, 6, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === NATURAL_OBJECTS.BERRY_BUSH) {
      ctx.fillStyle = '#2d6a3e';
      ctx.beginPath();
      ctx.arc(px + 16, py + 17, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e63946';
      for (const [bx, by] of [[12, 15], [19, 14], [15, 20], [20, 19]]) {
        ctx.beginPath();
        ctx.arc(px + bx, py + by, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (type === NATURAL_OBJECTS.ROCK_WALL) {
      ctx.fillStyle = '#4a4e54';
      ctx.fillRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
      ctx.fillStyle = '#636870';
      ctx.fillRect(px + 3, py + 3, TILE_SIZE - 6, TILE_SIZE - 10);
    } else if (type === NATURAL_OBJECTS.STEEL_ORE) {
      ctx.fillStyle = '#4a4e54';
      ctx.fillRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(px + 6, py + 6, 8, 6);
      ctx.fillRect(px + 17, py + 15, 9, 7);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(px + 8, py + 8, 4, 2);
    } else if (type === NATURAL_OBJECTS.GOLD_ORE) {
      ctx.fillStyle = '#4a4e54';
      ctx.fillRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
      ctx.fillStyle = '#eab308';
      ctx.fillRect(px + 6, py + 8, 7, 6);
      ctx.fillRect(px + 17, py + 14, 8, 7);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(px + 8, py + 9, 3, 2);
    }
  }

  _drawBuilding(ctx, b, px, py, timeSec, hasPower) {
    const info = BUILDING_INFO[b.type];
    if (!b.built) {
      ctx.save();
      ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.fillRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      ctx.strokeRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      ctx.setLineDash([]);
      const pct = Math.min(1, b.progress / b.workRequired);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(px + 4, py + TILE_SIZE - 7, TILE_SIZE - 8, 4);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(px + 4, py + TILE_SIZE - 7, (TILE_SIZE - 8) * pct, 4);
      ctx.restore();
      return;
    }

    if (b.type === 'wood_wall' || b.type === 'stone_wall') {
      ctx.fillStyle = b.type === 'wood_wall' ? '#6d4c2c' : '#585d66';
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      ctx.fillStyle = info.color;
      ctx.fillRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 7);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.strokeRect(px + 0.5, py + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
    } else if (b.type === 'door') {
      ctx.fillStyle = '#5c3f24';
      ctx.fillRect(px + 2, py + 10, TILE_SIZE - 4, 12);
      ctx.fillStyle = '#c4905a';
      ctx.fillRect(px + 5, py + 12, TILE_SIZE - 10, 8);
    } else if (b.type === 'bed') {
      ctx.fillStyle = '#6d4c2c';
      ctx.fillRect(px + 4, py + 3, TILE_SIZE - 8, TILE_SIZE - 6);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(px + 7, py + 6, TILE_SIZE - 14, 6);
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(px + 6, py + 13, TILE_SIZE - 12, TILE_SIZE - 18);
    } else if (b.type === 'campfire') {
      ctx.fillStyle = '#5c4028';
      ctx.beginPath();
      ctx.arc(px + 16, py + 17, 9, 0, Math.PI * 2);
      ctx.fill();
      const flicker = Math.sin(timeSec * 12) * 1.5;
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(px + 16, py + 15, 6 + flicker * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(px + 16, py + 16, 3.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (b.type === 'torch') {
      ctx.fillStyle = '#6d4c2c';
      ctx.fillRect(px + 14, py + 14, 4, 11);
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(px + 16, py + 12, 4.5 + Math.sin(timeSec * 10) * 0.8, 0, Math.PI * 2);
      ctx.fill();
    } else if (b.type === 'solar') {
      ctx.fillStyle = '#1e3a5f';
      ctx.fillRect(px + 2, py + 3, TILE_SIZE - 4, TILE_SIZE - 6);
      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 3, py + 4, TILE_SIZE - 6, TILE_SIZE - 8);
      ctx.beginPath();
      ctx.moveTo(px + 16, py + 4);
      ctx.lineTo(px + 16, py + TILE_SIZE - 4);
      ctx.moveTo(px + 3, py + 16);
      ctx.lineTo(px + TILE_SIZE - 3, py + 16);
      ctx.stroke();
    } else if (b.type === 'turret') {
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.arc(px + 16, py + 16, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = hasPower ? '#38bdf8' : '#ef4444';
      ctx.beginPath();
      ctx.arc(px + 16, py + 16, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(px + 16, py + 16);
      ctx.lineTo(px + 26, py + 12);
      ctx.stroke();
    } else if (b.type === 'sandbag') {
      ctx.fillStyle = '#bfa67a';
      ctx.beginPath();
      ctx.roundRect(px + 3, py + 10, TILE_SIZE - 6, 12, 5);
      ctx.fill();
      ctx.strokeStyle = '#786646';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else if (b.type === 'research_bench') {
      ctx.fillStyle = '#4c3f6e';
      ctx.fillRect(px + 3, py + 6, TILE_SIZE - 6, TILE_SIZE - 12);
      ctx.fillStyle = '#a78bfa';
      ctx.fillRect(px + 6, py + 9, 8, 6);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(px + 17, py + 10, 9, 5);
    }

    // Damage bar if injured
    if (b.hp < b.maxHp) {
      ctx.fillStyle = '#111827';
      ctx.fillRect(px + 3, py + 2, TILE_SIZE - 6, 3);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(px + 3, py + 2, (TILE_SIZE - 6) * (b.hp / b.maxHp), 3);
    }
  }

  _drawOrderMarker(ctx, order, px, py) {
    ctx.save();
    ctx.strokeStyle = order === 'mine' ? '#f59e0b' : order === 'chop' ? '#84cc16' : '#ec4899';
    ctx.lineWidth = 1.6;
    ctx.strokeRect(px + 3, py + 3, TILE_SIZE - 6, TILE_SIZE - 6);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.textAlign = 'center';
    const glyph = order === 'mine' ? '⛏' : order === 'chop' ? '🪓' : '✂';
    ctx.fillText(glyph, px + 16, py + 19);
    ctx.restore();
  }

  _drawPawn(ctx, pawn, isSelected, isHostile, timeSec) {
    const cx = (pawn.x + 0.5) * TILE_SIZE;
    const cy = (pawn.y + 0.5) * TILE_SIZE;
    const bob = pawn.path && pawn.path.length > 0 ? Math.sin(timeSec * 14) * 1.5 : 0;

    // Selection or drafted ring
    if (isSelected || pawn.drafted) {
      ctx.strokeStyle = pawn.drafted ? '#f59e0b' : '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy + 2, 13, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 10, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body (RimWorld bean silhouette)
    ctx.fillStyle = isHostile ? '#b91c1c' : pawn.shirtColor;
    ctx.beginPath();
    ctx.roundRect(cx - 7, cy - 2 + bob, 14, 12, 5);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Head
    ctx.fillStyle = isHostile ? '#fca5a5' : '#f1c27d';
    ctx.beginPath();
    ctx.arc(cx, cy - 6 + bob, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Hair / Helmet
    ctx.fillStyle = isHostile ? '#3f1d2e' : pawn.hairColor;
    ctx.beginPath();
    ctx.arc(cx, cy - 8 + bob, 6, Math.PI, Math.PI * 2);
    ctx.fill();

    // HP bar
    if (pawn.hp < pawn.maxHp) {
      ctx.fillStyle = '#111827';
      ctx.fillRect(cx - 10, cy - 17, 20, 3);
      ctx.fillStyle = isHostile ? '#ef4444' : '#22c55e';
      ctx.fillRect(cx - 10, cy - 17, 20 * (pawn.hp / pawn.maxHp), 3);
    }

    // Name tag
    ctx.font = '600 10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
    const label = pawn.drafted ? `⚔ ${pawn.name}` : pawn.name;
    const tw = ctx.measureText(label).width + 6;
    ctx.fillRect(cx - tw / 2, cy + 12, tw, 13);
    ctx.fillStyle = isHostile ? '#fca5a5' : '#f8fafc';
    ctx.fillText(label, cx, cy + 21.5);
  }
}
