(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./config'));
  } else {
    root.GTARenderer = factory(root.GTAConfig);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Config) {
  'use strict';

  class GameRenderer {
    constructor(canvas, minimapCanvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.minimapCanvas = minimapCanvas;
      this.mctx = minimapCanvas ? minimapCanvas.getContext('2d') : null;
      this.camX = 0;
      this.camY = 0;
      this.camZoom = 1.0;
    }

    resize() {
      const parent = this.canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(320, Math.floor(rect.width));
      const h = Math.max(240, Math.floor(rect.height));
      this.canvas.width = Math.floor(w * dpr);
      this.canvas.height = Math.floor(h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.viewW = w;
      this.viewH = h;
    }

    render(engine) {
      const ctx = this.ctx;
      const w = this.viewW || this.canvas.width;
      const h = this.viewH || this.canvas.height;
      const target = engine.getPlayerPosition();

      // Smooth camera follow + speed-based dynamic zoom out
      const speed = engine.player.vehicle ? engine.player.vehicle.speed : 0;
      const targetZoom = engine.player.vehicle ? Math.max(0.76, 0.96 - (speed / 550) * 0.2) : 1.05;
      this.camZoom += (targetZoom - this.camZoom) * 0.08;

      const leadX = engine.player.vehicle ? engine.player.vehicle.vx * 0.22 : 0;
      const leadY = engine.player.vehicle ? engine.player.vehicle.vy * 0.22 : 0;
      if (this.camX === 0 && this.camY === 0) {
        this.camX = target.x;
        this.camY = target.y;
      } else {
        this.camX += (target.x + leadX - this.camX) * 0.14;
        this.camY += (target.y + leadY - this.camY) * 0.14;
      }

      // Clear background
      ctx.fillStyle = '#0b0e17';
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(this.camZoom, this.camZoom);
      ctx.translate(-this.camX, -this.camY);

      const halfW = (w / 2) / this.camZoom + 120;
      const halfH = (h / 2) / this.camZoom + 120;
      const minX = this.camX - halfW;
      const maxX = this.camX + halfW;
      const minY = this.camY - halfH;
      const maxY = this.camY + halfH;

      this._drawGroundAndRoads(ctx, engine.world, minX, maxX, minY, maxY);
      this._drawParks(ctx, engine.world, minX, maxX, minY, maxY);
      this._drawSkidMarks(ctx, engine.skidMarks);
      this._drawPickups(ctx, engine.world.pickups, engine.time);
      this._drawMissionMarker(ctx, engine);
      this._drawPedestrians(ctx, engine.pedestrians, minX, maxX, minY, maxY);
      this._drawVehicles(ctx, engine.vehicles, engine.time, minX, maxX, minY, maxY);
      if (!engine.player.vehicle && engine.player.state === 'alive') {
        this._drawPlayerOnFoot(ctx, engine.player);
      }
      this._drawProjectiles(ctx, engine.projectiles);
      this._drawParticles(ctx, engine.particles);
      // Draw 2.5D extruded buildings on top so depth feels authentic
      this._drawBuildings(ctx, engine.world.buildings, minX, maxX, minY, maxY, engine.time);
      this._drawFloatingTexts(ctx, engine.floatingTexts);

      ctx.restore();

      if (this.mctx) {
        this._drawMinimap(engine);
      }
    }

    _drawGroundAndRoads(ctx, world, minX, maxX, minY, maxY) {
      const ts = world.tileSize;
      const startTx = Math.max(0, Math.floor(minX / ts));
      const endTx = Math.min(world.mapTiles - 1, Math.ceil(maxX / ts));
      const startTy = Math.max(0, Math.floor(minY / ts));
      const endTy = Math.min(world.mapTiles - 1, Math.ceil(maxY / ts));

      // Sidewalk base
      ctx.fillStyle = '#232938';
      ctx.fillRect(startTx * ts, startTy * ts, (endTx - startTx + 1) * ts, (endTy - startTy + 1) * ts);

      // Asphalt roads
      ctx.fillStyle = '#141822';
      for (let ty = startTy; ty <= endTy; ty++) {
        for (let tx = startTx; tx <= endTx; tx++) {
          if (world.tiles[ty * world.mapTiles + tx] === 0) {
            ctx.fillRect(tx * ts, ty * ts, ts + 0.5, ts + 0.5);
          }
        }
      }

      // Dashed yellow road centerlines
      ctx.strokeStyle = 'rgba(255, 206, 68, 0.36)';
      ctx.lineWidth = 2;
      ctx.setLineDash([14, 14]);
      for (const rc of world.roadCenters) {
        if (rc >= minX - ts && rc <= maxX + ts) {
          ctx.beginPath();
          ctx.moveTo(rc, Math.max(0, minY));
          ctx.lineTo(rc, Math.min(world.size, maxY));
          ctx.stroke();
        }
        if (rc >= minY - ts && rc <= maxY + ts) {
          ctx.beginPath();
          ctx.moveTo(Math.max(0, minX), rc);
          ctx.lineTo(Math.min(world.size, maxX), rc);
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);

      // World border neon barrier
      ctx.strokeStyle = '#ff2e93';
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, world.size - 6, world.size - 6);
    }

    _drawParks(ctx, world, minX, maxX, minY, maxY) {
      for (const p of world.parks) {
        if (p.x + p.w < minX || p.x > maxX || p.y + p.h < minY || p.y > maxY) continue;
        ctx.fillStyle = '#163529';
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.strokeStyle = '#265944';
        ctx.lineWidth = 3;
        ctx.strokeRect(p.x + 6, p.y + 6, p.w - 12, p.h - 12);

        // Central fountain
        ctx.fillStyle = '#0e4c63';
        ctx.beginPath();
        ctx.arc(p.x + p.w / 2, p.y + p.h / 2, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 2;
        ctx.stroke();

        for (const t of p.trees) {
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.beginPath();
          ctx.arc(t.x + 4, t.y + 5, t.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#1f6e43';
          ctx.beginPath();
          ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#2fa362';
          ctx.beginPath();
          ctx.arc(t.x - 3, t.y - 3, t.r * 0.65, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    _drawSkidMarks(ctx, skids) {
      ctx.fillStyle = 'rgba(8, 10, 14, 0.55)';
      for (let i = 0; i < skids.length; i++) {
        const s = skids[i];
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.angle);
        ctx.fillRect(-10, -8, 6, 3);
        ctx.fillRect(-10, 5, 6, 3);
        ctx.restore();
      }
    }

    _drawPickups(ctx, pickups, time) {
      const pulse = 1 + Math.sin(time * 5) * 0.16;
      const styles = {
        health: { color: '#39ff14', label: '+' },
        armor: { color: '#00f0ff', label: 'A' },
        ammo: { color: '#ffe600', label: '•' },
        cash: { color: '#ff2e93', label: '$' }
      };
      for (const pk of pickups) {
        if (!pk.active) continue;
        const st = styles[pk.type] || styles.cash;
        ctx.save();
        ctx.translate(pk.x, pk.y);
        ctx.fillStyle = st.color + '28';
        ctx.beginPath();
        ctx.arc(0, 0, 15 * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = st.color;
        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0b0e17';
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(st.label, 0, 0.5);
        ctx.restore();
      }
    }

    _drawMissionMarker(ctx, engine) {
      const wp = engine.missions.getCurrentWaypoint();
      if (!wp) return;
      const pulse = 26 + Math.sin(engine.time * 6) * 8;
      ctx.save();
      ctx.strokeStyle = '#ffe600';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(wp.x, wp.y, pulse, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 230, 0, 0.18)';
      ctx.beginPath();
      ctx.arc(wp.x, wp.y, 20, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffe600';
      ctx.font = 'bold 12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(wp.label, wp.x, wp.y - 34);
      ctx.restore();
    }

    _drawPedestrians(ctx, peds, minX, maxX, minY, maxY) {
      for (const p of peds) {
        if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) continue;
        ctx.save();
        ctx.translate(p.x, p.y);
        if (!p.alive) {
          ctx.fillStyle = 'rgba(200, 30, 50, 0.45)';
          ctx.beginPath();
          ctx.arc(0, 0, 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          continue;
        }
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffd5b8';
        ctx.beginPath();
        ctx.arc(3, 0, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    _drawPlayerOnFoot(ctx, player) {
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.rotate(player.angle);
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.arc(2, 3, 11, 0, Math.PI * 2);
      ctx.fill();
      // Jacket
      ctx.fillStyle = '#00f0ff';
      ctx.beginPath();
      ctx.arc(0, 0, 9.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Head
      ctx.fillStyle = '#ffe0c2';
      ctx.beginPath();
      ctx.arc(3, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      // Weapon barrel if armed
      if (player.weaponIndex > 0) {
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(6, 2, 11, 3);
      }
      ctx.restore();
    }

    _drawVehicles(ctx, vehicles, time, minX, maxX, minY, maxY) {
      for (const v of vehicles) {
        if (v.x < minX - 80 || v.x > maxX + 80 || v.y < minY - 80 || v.y > maxY + 80) continue;
        const halfL = v.spec.length / 2;
        const halfW = v.spec.width / 2;

        ctx.save();
        ctx.translate(v.x, v.y);
        ctx.rotate(v.angle);

        // Headlight beams when active
        if (!v.destroyed && v.driver) {
          const grad = ctx.createLinearGradient(halfL, 0, halfL + 95, 0);
          grad.addColorStop(0, 'rgba(255, 250, 210, 0.28)');
          grad.addColorStop(1, 'rgba(255, 250, 210, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.moveTo(halfL, -halfW + 3);
          ctx.lineTo(halfL + 95, -halfW - 22);
          ctx.lineTo(halfL + 95, halfW + 22);
          ctx.lineTo(halfL, halfW - 3);
          ctx.closePath();
          ctx.fill();
        }

        // Drop shadow
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(-halfL + 4, -halfW + 5, v.spec.length, v.spec.width);

        // Car body
        ctx.fillStyle = v.destroyed ? '#222222' : v.color;
        ctx.beginPath();
        ctx.roundRect(-halfL, -halfW, v.spec.length, v.spec.width, 6);
        ctx.fill();

        // Police white doors / stripes
        if (v.type === 'police' && !v.destroyed) {
          ctx.fillStyle = '#f1f5f9';
          ctx.fillRect(-halfL * 0.35, -halfW + 1, v.spec.length * 0.42, v.spec.width - 2);
        }

        // Windshield & cabin roof
        ctx.fillStyle = v.destroyed ? '#111111' : '#0f172a';
        ctx.fillRect(-halfL * 0.35, -halfW + 4, v.spec.length * 0.56, v.spec.width - 8);
        ctx.fillStyle = v.destroyed ? '#1b1b1b' : 'rgba(255,255,255,0.16)';
        ctx.fillRect(-halfL * 0.25, -halfW + 5, v.spec.length * 0.32, v.spec.width - 10);

        // Headlights & Taillights
        if (!v.destroyed) {
          ctx.fillStyle = '#fff9c4';
          ctx.fillRect(halfL - 3, -halfW + 3, 3, 5);
          ctx.fillRect(halfL - 3, halfW - 8, 3, 5);
          ctx.fillStyle = '#ff1744';
          ctx.fillRect(-halfL, -halfW + 3, 3, 5);
          ctx.fillRect(-halfL, halfW - 8, 3, 5);
        }

        // Police red/blue flashing lightbar
        if (v.type === 'police' && !v.destroyed) {
          const flash = Math.floor(time * 10) % 2 === 0;
          ctx.fillStyle = flash ? '#ff1e56' : '#00b4ff';
          ctx.fillRect(-3, -halfW + 5, 6, (v.spec.width - 10) / 2);
          ctx.fillStyle = flash ? '#00b4ff' : '#ff1e56';
          ctx.fillRect(-3, 0, 6, (v.spec.width - 10) / 2);
          if (v.siren) {
            ctx.fillStyle = flash ? 'rgba(255, 30, 86, 0.25)' : 'rgba(0, 180, 255, 0.25)';
            ctx.beginPath();
            ctx.arc(0, 0, 34, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Player highlight outline
        if (v.driver === 'player') {
          ctx.strokeStyle = 'rgba(0, 240, 255, 0.85)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(-halfL - 2, -halfW - 2, v.spec.length + 4, v.spec.width + 4, 7);
          ctx.stroke();
        }

        ctx.restore();
      }
    }

    _drawProjectiles(ctx, projectiles) {
      ctx.lineWidth = 2.5;
      for (const p of projectiles) {
        ctx.strokeStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.022, p.y - p.vy * 0.022);
        ctx.stroke();
      }
    }

    _drawParticles(ctx, particles) {
      for (const pt of particles) {
        const alpha = Math.max(0, pt.life / pt.maxLife);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    _drawBuildings(ctx, buildings, minX, maxX, minY, maxY, time) {
      for (let i = 0; i < buildings.length; i++) {
        const b = buildings[i];
        if (b.x + b.w < minX - 60 || b.x > maxX + 60 || b.y + b.h < minY - 60 || b.y > maxY + 60) {
          continue;
        }

        // 2.5D top-down parallax roof offset relative to camera center
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        const factor = (b.height / 360) * 0.42;
        const rx = b.x + (cx - this.camX) * factor;
        const ry = b.y + (cy - this.camY) * factor;

        // Footprint wall base
        ctx.fillStyle = b.baseColor;
        ctx.fillRect(b.x, b.y, b.w, b.h);

        // Extruded side faces
        ctx.fillStyle = '#151b28';
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(rx, ry);
        ctx.lineTo(rx + b.w, ry);
        ctx.lineTo(b.x + b.w, b.y);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(b.x, b.y + b.h);
        ctx.lineTo(rx, ry + b.h);
        ctx.lineTo(rx + b.w, ry + b.h);
        ctx.lineTo(b.x + b.w, b.y + b.h);
        ctx.closePath();
        ctx.fill();

        // Roof surface
        ctx.fillStyle = b.roofColor;
        ctx.fillRect(rx, ry, b.w, b.h);

        // Neon trim border
        ctx.strokeStyle = b.trimColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(rx + 2, ry + 2, b.w - 4, b.h - 4);

        // Rooftop AC units or helipad
        if (b.hasHelipad) {
          ctx.strokeStyle = 'rgba(255,255,255,0.45)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(rx + b.w / 2, ry + b.h / 2, 26, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          ctx.font = 'bold 20px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('H', rx + b.w / 2, ry + b.h / 2);
        } else if (b.neon) {
          const glow = 0.72 + Math.sin(time * 3 + b.id) * 0.25;
          ctx.globalAlpha = glow;
          ctx.fillStyle = b.trimColor;
          ctx.font = 'bold 12px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(b.neon, rx + b.w / 2, ry + b.h / 2);
          ctx.globalAlpha = 1;
        }
      }
    }

    _drawFloatingTexts(ctx, texts) {
      ctx.font = 'bold 14px Inter, sans-serif';
      ctx.textAlign = 'center';
      for (const ft of texts) {
        ctx.globalAlpha = Math.min(1, ft.timer);
        ctx.fillStyle = ft.color;
        ctx.fillText(ft.text, ft.x, ft.y);
      }
      ctx.globalAlpha = 1;
    }

    _drawMinimap(engine) {
      const mctx = this.mctx;
      const mw = this.minimapCanvas.width;
      const mh = this.minimapCanvas.height;
      const scale = mw / engine.world.size;

      mctx.fillStyle = '#090d16';
      mctx.fillRect(0, 0, mw, mh);

      // Roads
      mctx.fillStyle = '#1f293d';
      const ts = engine.world.tileSize * scale;
      for (let ty = 0; ty < engine.world.mapTiles; ty++) {
        for (let tx = 0; tx < engine.world.mapTiles; tx++) {
          const t = engine.world.tiles[ty * engine.world.mapTiles + tx];
          if (t === 0) {
            mctx.fillRect(tx * ts, ty * ts, ts + 0.5, ts + 0.5);
          } else if (t === 3) {
            mctx.fillStyle = '#1b4332';
            mctx.fillRect(tx * ts, ty * ts, ts + 0.5, ts + 0.5);
            mctx.fillStyle = '#1f293d';
          }
        }
      }

      // Police blips
      for (const v of engine.vehicles) {
        if (v.type === 'police' && !v.destroyed) {
          mctx.fillStyle = Math.floor(engine.time * 8) % 2 === 0 ? '#ff1e56' : '#00b4ff';
          mctx.beginPath();
          mctx.arc(v.x * scale, v.y * scale, 3, 0, Math.PI * 2);
          mctx.fill();
        }
      }

      // Mission waypoint
      const wp = engine.missions.getCurrentWaypoint();
      if (wp) {
        mctx.fillStyle = '#ffe600';
        mctx.beginPath();
        mctx.arc(wp.x * scale, wp.y * scale, 4.2, 0, Math.PI * 2);
        mctx.fill();
      }

      // Player blip
      const pos = engine.getPlayerPosition();
      mctx.fillStyle = '#00f0ff';
      mctx.beginPath();
      mctx.arc(pos.x * scale, pos.y * scale, 3.8, 0, Math.PI * 2);
      mctx.fill();
      mctx.strokeStyle = '#ffffff';
      mctx.lineWidth = 1.2;
      mctx.stroke();
    }
  }

  return { GameRenderer };
});
