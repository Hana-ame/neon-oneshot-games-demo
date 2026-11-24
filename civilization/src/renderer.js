/**
 * High-DPI HTML5 Canvas 2D Hexagonal Map & Minimap Renderer
 * 高清六边形世界渲染器：地形、资源、改良、领土边界、城市、单位、迷雾与小地图
 */

import { TERRAIN, RESOURCES, IMPROVEMENTS, UNITS } from './constants.js';
import { axialToPixel, pixelToAxial, hexKey, hexNeighbors } from './hex.js';

export class MapRenderer {
  constructor(canvas, minimapCanvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.minimap = minimapCanvas;
    this.miniCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;

    this.hexSize = 38;
    this.zoom = 1.0;
    this.camX = 0;
    this.camY = 0;
    this.dpr = 1;
    this.width = 800;
    this.height = 600;
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(200, Math.floor(rect.width));
    this.height = Math.max(200, Math.floor(rect.height));
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
  }

  centerOn(q, r) {
    const pos = axialToPixel(q, r, this.hexSize);
    this.camX = pos.x;
    this.camY = pos.y;
  }

  screenToWorld(sx, sy) {
    return {
      x: (sx - this.width / 2) / this.zoom + this.camX,
      y: (sy - this.height / 2) / this.zoom + this.camY,
    };
  }

  screenToHex(sx, sy) {
    const w = this.screenToWorld(sx, sy);
    return pixelToAxial(w.x, w.y, this.hexSize);
  }

  drawHexPath(ctx, cx, cy, size) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      const vx = cx + size * Math.cos(angle);
      const vy = cy + size * Math.sin(angle);
      if (i === 0) ctx.moveTo(vx, vy);
      else ctx.lineTo(vx, vy);
    }
    ctx.closePath();
  }

  render(engine, uiState) {
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    // Background deep ocean backdrop
    ctx.fillStyle = '#0d1b2a';
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.translate(this.width / 2, this.height / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.camX, -this.camY);

    const playerCiv = engine.getCiv(engine.playerCivId);
    const size = this.hexSize;
    const margin = size * 2.5;
    const minX = this.camX - (this.width / 2) / this.zoom - margin;
    const maxX = this.camX + (this.width / 2) / this.zoom + margin;
    const minY = this.camY - (this.height / 2) / this.zoom - margin;
    const maxY = this.camY + (this.height / 2) / this.zoom + margin;

    // 1. Draw Terrain Hexes
    for (const tile of engine.tileList) {
      const { x, y } = axialToPixel(tile.q, tile.r, size);
      if (x < minX || x > maxX || y < minY || y > maxY) continue;

      const isExplored = playerCiv.explored.has(tile.key);
      const isVisible = playerCiv.visible.has(tile.key);

      this.drawHexPath(ctx, x, y, size - 0.5);
      if (!isExplored) {
        ctx.fillStyle = '#131d2b';
        ctx.fill();
        ctx.strokeStyle = '#1c2a3d';
        ctx.lineWidth = 1;
        ctx.stroke();
        continue;
      }

      const tDef = TERRAIN[tile.terrain];
      ctx.fillStyle = tDef.color;
      ctx.fill();
      ctx.strokeStyle = tDef.border;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Subtle terrain details
      this.drawTerrainDetail(ctx, tile, x, y, size);

      // Territory tint
      if (tile.ownerId) {
        const owner = engine.getCiv(tile.ownerId);
        if (owner) {
          this.drawHexPath(ctx, x, y, size - 1.5);
          ctx.fillStyle = `${owner.color}28`;
          ctx.fill();
        }
      }

      // Fog of war overlay for explored but not currently visible
      if (!isVisible) {
        this.drawHexPath(ctx, x, y, size - 0.4);
        ctx.fillStyle = 'rgba(10, 18, 30, 0.45)';
        ctx.fill();
      }
    }

    // 2. Draw Territory Borders (crisp edges between different owners)
    for (const tile of engine.tileList) {
      if (!tile.ownerId || !playerCiv.explored.has(tile.key)) continue;
      const { x, y } = axialToPixel(tile.q, tile.r, size);
      if (x < minX || x > maxX || y < minY || y > maxY) continue;
      const owner = engine.getCiv(tile.ownerId);
      if (!owner) continue;

      const neighbors = hexNeighbors(tile.q, tile.r);
      // Edge mapping for HEX_DIRS order
      const edgeIndices = [0, 5, 4, 3, 2, 1];
      ctx.strokeStyle = owner.color;
      ctx.lineWidth = 3;
      for (let i = 0; i < 6; i++) {
        const nt = engine.getTile(neighbors[i].q, neighbors[i].r);
        if (!nt || nt.ownerId !== tile.ownerId) {
          const eIdx = edgeIndices[i];
          const a1 = (Math.PI / 180) * (60 * eIdx - 30);
          const a2 = (Math.PI / 180) * (60 * (eIdx + 1) - 30);
          ctx.beginPath();
          ctx.moveTo(x + (size - 2) * Math.cos(a1), y + (size - 2) * Math.sin(a1));
          ctx.lineTo(x + (size - 2) * Math.cos(a2), y + (size - 2) * Math.sin(a2));
          ctx.stroke();
        }
      }
    }

    // 3. Draw Reachable & Attackable Highlights
    if (uiState.reachable && uiState.reachable.size > 0) {
      for (const key of uiState.reachable.keys()) {
        const [q, r] = key.split(',').map(Number);
        const { x, y } = axialToPixel(q, r, size);
        this.drawHexPath(ctx, x, y, size - 3);
        ctx.fillStyle = 'rgba(56, 189, 248, 0.28)';
        ctx.fill();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    if (uiState.attackTargets && uiState.attackTargets.length > 0) {
      for (const t of uiState.attackTargets) {
        const { x, y } = axialToPixel(t.q, t.r, size);
        this.drawHexPath(ctx, x, y, size - 3);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.34)';
        ctx.fill();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.6;
        ctx.stroke();
      }
    }

    // 4. Draw Resources & Improvements
    for (const tile of engine.tileList) {
      if (!playerCiv.explored.has(tile.key)) continue;
      const { x, y } = axialToPixel(tile.q, tile.r, size);
      if (x < minX || x > maxX || y < minY || y > maxY) continue;

      if (tile.resource && RESOURCES[tile.resource]) {
        ctx.save();
        ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
        ctx.beginPath();
        ctx.arc(x + size * 0.42, y - size * 0.36, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fef3c7';
        ctx.fillText(RESOURCES[tile.resource].icon, x + size * 0.42, y - size * 0.35);
        ctx.restore();
      }
      if (tile.improvement && IMPROVEMENTS[tile.improvement] && !tile.cityId) {
        ctx.save();
        ctx.fillStyle = 'rgba(217, 119, 6, 0.85)';
        ctx.beginPath();
        ctx.arc(x - size * 0.42, y + size * 0.34, 8.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.fillText(IMPROVEMENTS[tile.improvement].icon, x - size * 0.42, y + size * 0.35);
        ctx.restore();
      }
    }

    // 5. Draw Cities
    for (const city of engine.cities.values()) {
      const key = hexKey(city.q, city.r);
      if (!playerCiv.explored.has(key)) continue;
      const { x, y } = axialToPixel(city.q, city.r, size);
      if (x < minX || x > maxX || y < minY || y > maxY) continue;
      const owner = engine.getCiv(city.ownerId);

      // City fortress icon
      ctx.save();
      ctx.fillStyle = owner.color;
      ctx.strokeStyle = '#fef3c7';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y - 4, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.font = '15px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText(city.isCapital ? '★' : '🏛', x, y - 3);

      // City banner plaque
      const label = `${city.name} (${city.population})`;
      ctx.font = 'bold 11px sans-serif';
      const tw = ctx.measureText(label).width + 14;
      const bx = x - tw / 2;
      const by = y + 14;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.strokeStyle = owner.color;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.roundRect(bx, by, tw, 18, 5);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#f8fafc';
      ctx.fillText(label, x, by + 9.5);

      // City HP bar if damaged
      if (city.hp < city.maxHp) {
        const bw = 34;
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(x - bw / 2, y - 24, bw, 4.5);
        ctx.fillStyle = city.hp / city.maxHp > 0.5 ? '#22c55e' : '#ef4444';
        ctx.fillRect(x - bw / 2, y - 24, bw * (city.hp / city.maxHp), 4.5);
      }
      ctx.restore();
    }

    // 6. Draw Units (visible only for enemies)
    for (const unit of engine.units.values()) {
      const key = hexKey(unit.q, unit.r);
      if (unit.ownerId !== engine.playerCivId && !playerCiv.visible.has(key)) continue;
      const { x, y } = axialToPixel(unit.q, unit.r, size);
      if (x < minX || x > maxX || y < minY || y > maxY) continue;

      const owner = engine.getCiv(unit.ownerId);
      const uDef = UNITS[unit.type];
      const isSelected = uiState.selectedUnitId === unit.id;
      const hasCity = !!engine.getCityAt(unit.q, unit.r);
      const uy = hasCity ? y - 16 : y;

      ctx.save();
      // Selection glow
      if (isSelected) {
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(x, uy, 17, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Unit shield badge
      ctx.fillStyle = owner.color;
      ctx.strokeStyle = unit.moves > 0 && unit.ownerId === engine.playerCivId ? '#fef08a' : '#cbd5e1';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (uDef.role === 'civilian') {
        ctx.moveTo(x, uy - 14);
        ctx.lineTo(x + 14, uy);
        ctx.lineTo(x, uy + 14);
        ctx.lineTo(x - 14, uy);
        ctx.closePath();
      } else {
        ctx.arc(x, uy, 13.5, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.stroke();

      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(uDef.icon, x, uy + 0.5);

      // HP bar
      if (unit.hp < unit.maxHp) {
        const bw = 26;
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(x - bw / 2, uy - 19, bw, 4);
        ctx.fillStyle = unit.hp > 50 ? '#22c55e' : unit.hp > 25 ? '#eab308' : '#ef4444';
        ctx.fillRect(x - bw / 2, uy - 19, bw * (unit.hp / unit.maxHp), 4);
      }

      // Action indicator dot
      if (unit.ownerId === engine.playerCivId && unit.moves > 0) {
        ctx.fillStyle = '#4ade80';
        ctx.beginPath();
        ctx.arc(x + 11, uy - 10, 3.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 7. Hover & Selected Hex Outline
    if (uiState.hoveredHex) {
      const hTile = engine.getTile(uiState.hoveredHex.q, uiState.hoveredHex.r);
      if (hTile) {
        const { x, y } = axialToPixel(hTile.q, hTile.r, size);
        this.drawHexPath(ctx, x, y, size - 1.5);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    if (uiState.selectedHex) {
      const { x, y } = axialToPixel(uiState.selectedHex.q, uiState.selectedHex.r, size);
      this.drawHexPath(ctx, x, y, size - 1.5);
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2.6;
      ctx.stroke();
    }

    ctx.restore();

    // 8. Render Minimap
    this.renderMinimap(engine);
  }

  drawTerrainDetail(ctx, tile, x, y, size) {
    ctx.save();
    if (tile.terrain === 'mountain') {
      ctx.fillStyle = '#4b5059';
      ctx.beginPath();
      ctx.moveTo(x - 14, y + 10);
      ctx.lineTo(x, y - 14);
      ctx.lineTo(x + 14, y + 10);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.moveTo(x - 5, y - 5);
      ctx.lineTo(x, y - 14);
      ctx.lineTo(x + 5, y - 5);
      ctx.closePath();
      ctx.fill();
    } else if (tile.terrain === 'hills') {
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x - 6, y + 6, 8, Math.PI, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + 6, y + 8, 7, Math.PI, 0);
      ctx.stroke();
    } else if (tile.terrain === 'forest') {
      ctx.fillStyle = '#244d2e';
      for (const [ox, oy] of [[-9, 3], [0, -5], [9, 4]]) {
        ctx.beginPath();
        ctx.moveTo(x + ox - 5, y + oy + 6);
        ctx.lineTo(x + ox, y + oy - 6);
        ctx.lineTo(x + ox + 5, y + oy + 6);
        ctx.closePath();
        ctx.fill();
      }
    } else if (tile.terrain === 'ocean' || tile.terrain === 'coast') {
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.14)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x - 10, y);
      ctx.quadraticCurveTo(x - 5, y - 3, x, y);
      ctx.quadraticCurveTo(x + 5, y + 3, x + 10, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  renderMinimap(engine) {
    if (!this.miniCtx || !this.minimap) return;
    const mctx = this.miniCtx;
    const mw = this.minimap.width;
    const mh = this.minimap.height;
    mctx.fillStyle = '#09111c';
    mctx.fillRect(0, 0, mw, mh);

    const playerCiv = engine.getCiv(engine.playerCivId);
    const cellW = mw / engine.width;
    const cellH = mh / engine.height;

    for (const tile of engine.tileList) {
      const mx = tile.col * cellW;
      const my = tile.row * cellH;
      if (!playerCiv.explored.has(tile.key)) {
        mctx.fillStyle = '#111827';
      } else if (tile.ownerId) {
        mctx.fillStyle = engine.getCiv(tile.ownerId).color;
      } else {
        mctx.fillStyle = TERRAIN[tile.terrain].color;
      }
      mctx.fillRect(mx, my, Math.ceil(cellW), Math.ceil(cellH));
    }

    // City dots on minimap
    for (const city of engine.cities.values()) {
      if (!playerCiv.explored.has(hexKey(city.q, city.r))) continue;
      const tile = engine.getTile(city.q, city.r);
      mctx.fillStyle = '#ffffff';
      mctx.fillRect(tile.col * cellW, tile.row * cellH, Math.max(3, cellW), Math.max(3, cellH));
    }
  }
}
