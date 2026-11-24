// HTML5 Canvas 2D Renderer for Bullet-Hell Dungeon

import { ROOM_W, ROOM_H, WALL_T, DOOR_W, PLAYER_CONFIG } from './constants.js';

export class DungeonRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  render(engine, mouseWorld = null) {
    const ctx = this.ctx;
    const theme = engine.getTheme();
    const room = engine.getCurrentRoom();

    ctx.save();

    // Screen shake transform
    if (engine.shakeTime > 0) {
      const sx = (Math.random() - 0.5) * 2 * engine.shakeIntensity;
      const sy = (Math.random() - 0.5) * 2 * engine.shakeIntensity;
      ctx.translate(sx, sy);
    }

    // 1. Floor tiles
    ctx.fillStyle = theme.floorBg;
    ctx.fillRect(0, 0, ROOM_W, ROOM_H);

    const tile = 44;
    ctx.fillStyle = theme.tileAlt;
    for (let y = WALL_T; y < ROOM_H - WALL_T; y += tile) {
      for (let x = WALL_T; x < ROOM_W - WALL_T; x += tile) {
        if (((x / tile + y / tile) | 0) % 2 === 0) {
          ctx.fillRect(x, y, tile - 1, tile - 1);
        }
      }
    }

    // Subtle floor room label watermark
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.font = '700 32px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const roomTag =
      room.type === 'start'
        ? 'START CHAMBER'
        : room.type === 'boss'
        ? 'BOSS ARENA'
        : room.type === 'treasure'
        ? 'ARMORY VAULT'
        : room.type === 'shop'
        ? 'BLACK MARKET'
        : `FLOOR ${engine.floor}`;
    ctx.fillText(roomTag, ROOM_W / 2, ROOM_H / 2);
    ctx.restore();

    // 2. Walls & Doors
    this._drawWallsAndDoors(ctx, room, theme, engine.roomLocked);

    // 3. Obstacles
    for (const obs of room.obstacles) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(obs.x + 4, obs.y + 6, obs.w, obs.h);
      ctx.fillStyle = obs.destructible ? '#8d5524' : theme.wallColor;
      ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
      ctx.fillStyle = obs.destructible ? '#c68642' : theme.wallTop;
      ctx.fillRect(obs.x + 3, obs.y + 3, obs.w - 6, Math.max(8, obs.h * 0.35));
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(obs.x + 0.5, obs.y + 0.5, obs.w - 1, obs.h - 1);
    }

    // 4. Special room props (Chest, Shop, Portal)
    if (room.chest) {
      this._drawChest(ctx, room.chest, engine.player);
    }
    if (room.shopItems && room.shopItems.length > 0) {
      this._drawShopItems(ctx, room.shopItems, engine.player);
    }
    if (room.portalOpen) {
      this._drawPortal(ctx, engine.elapsedTime);
    }

    // 5. Pickups
    for (const item of engine.pickups) {
      this._drawPickup(ctx, item, engine.elapsedTime);
    }

    // 6. Shockwaves
    for (const sw of engine.shockwaves) {
      const alpha = Math.max(0, sw.life / sw.maxLife);
      ctx.save();
      ctx.strokeStyle = sw.color;
      ctx.globalAlpha = alpha * 0.85;
      ctx.lineWidth = 5 * alpha + 1;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 7. Enemies
    for (const e of engine.enemies) {
      this._drawEnemy(ctx, e);
    }

    // 8. Player
    this._drawPlayer(ctx, engine);

    // 9. Bullets (glowing bullet-hell orbs)
    for (const b of engine.bullets) {
      ctx.save();
      ctx.fillStyle = b.color;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = b.fromPlayer ? 8 : 11;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 10. Particles
    for (const pt of engine.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, pt.life * 3));
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
      ctx.restore();
    }

    // 11. Floating Texts
    for (const ft of engine.floatingTexts) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, ft.life / 0.75);
      ctx.fillStyle = ft.color;
      ctx.font = '700 13px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }

    // 12. Boss HP Bar (in-canvas bottom overlay)
    const boss = engine.enemies.find((e) => e.isBoss);
    if (boss) {
      this._drawBossBar(ctx, boss);
    }

    // 13. Minimap (top-right inside canvas)
    this._drawMinimap(ctx, engine);

    // 14. Reticle
    if (mouseWorld && engine.state === 'playing') {
      this._drawCrosshair(ctx, mouseWorld.x, mouseWorld.y, engine.getActiveWeapon());
    }

    ctx.restore();
  }

  _drawWallsAndDoors(ctx, room, theme, locked) {
    ctx.fillStyle = theme.wallColor;
    // Top, Bottom, Left, Right walls
    ctx.fillRect(0, 0, ROOM_W, WALL_T);
    ctx.fillRect(0, ROOM_H - WALL_T, ROOM_W, WALL_T);
    ctx.fillRect(0, 0, WALL_T, ROOM_H);
    ctx.fillRect(ROOM_W - WALL_T, 0, WALL_T, ROOM_H);

    // Inner bevel
    ctx.strokeStyle = theme.wallTop;
    ctx.lineWidth = 3;
    ctx.strokeRect(WALL_T, WALL_T, ROOM_W - WALL_T * 2, ROOM_H - WALL_T * 2);

    const drawDoor = (x, y, w, h, targetId) => {
      const target = targetId;
      ctx.fillStyle = locked ? '#7f1d1d' : '#0f172a';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = locked ? '#ef4444' : theme.accent;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      if (locked) {
        // Laser lock bars
        ctx.strokeStyle = '#fca5a5';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + 6, y + 6);
        ctx.lineTo(x + w - 6, y + h - 6);
        ctx.moveTo(x + w - 6, y + 6);
        ctx.lineTo(x + 6, y + h - 6);
        ctx.stroke();
      } else if (target) {
        // Subtle open passage glow
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
      }
    };

    if (room.doors.N) drawDoor(ROOM_W / 2 - DOOR_W / 2, 0, DOOR_W, WALL_T, room.doors.N);
    if (room.doors.S) drawDoor(ROOM_W / 2 - DOOR_W / 2, ROOM_H - WALL_T, DOOR_W, WALL_T, room.doors.S);
    if (room.doors.W) drawDoor(0, ROOM_H / 2 - DOOR_W / 2, WALL_T, DOOR_W, room.doors.W);
    if (room.doors.E) drawDoor(ROOM_W - WALL_T, ROOM_H / 2 - DOOR_W / 2, WALL_T, DOOR_W, room.doors.E);
  }

  _drawChest(ctx, chest, player) {
    ctx.save();
    ctx.translate(chest.x, chest.y);
    ctx.fillStyle = chest.opened ? '#475569' : '#d97706';
    ctx.fillRect(-20, -14, 40, 28);
    ctx.strokeStyle = '#fde68a';
    ctx.lineWidth = 2;
    ctx.strokeRect(-20, -14, 40, 28);
    ctx.fillStyle = chest.opened ? '#1e293b' : '#fbbf24';
    ctx.fillRect(-5, -4, 10, 8);
    if (!chest.opened && Math.hypot(player.x - chest.x, player.y - chest.y) < 75) {
      ctx.fillStyle = '#fef08a';
      ctx.font = '700 12px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('按 E 开启宝箱', 0, -24);
    }
    ctx.restore();
  }

  _drawShopItems(ctx, items, player) {
    for (const item of items) {
      if (item.purchased) continue;
      ctx.save();
      ctx.translate(item.x, item.y);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(-22, -22, 44, 44, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle =
        item.type === 'heart'
          ? '#ff4d6d'
          : item.type === 'armor'
          ? '#a5b4fc'
          : item.type === 'blank'
          ? '#74c0fc'
          : '#63e6be';
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fde68a';
      ctx.font = '700 12px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${item.cost}G`, 0, 36);

      if (Math.hypot(player.x - item.x, player.y - item.y) < 68) {
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`按 E 购买 ${item.name}`, 0, -30);
      }
      ctx.restore();
    }
  }

  _drawPortal(ctx, time) {
    ctx.save();
    ctx.translate(ROOM_W / 2, ROOM_H / 2);
    const pulse = 1 + Math.sin(time * 5) * 0.08;
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(0, 0, 30 * pulse, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.beginPath();
    ctx.arc(0, 0, 24 * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#e0f2fe';
    ctx.font = '700 13px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('按 E 进入传送门', 0, -40);
    ctx.restore();
  }

  _drawPickup(ctx, item, time) {
    const bob = Math.sin(time * 5 + item.x) * 2.5;
    ctx.save();
    ctx.translate(item.x, item.y + bob);
    if (item.type === 'coin') {
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else if (item.type === 'heart') {
      ctx.fillStyle = '#ff4d6d';
      ctx.beginPath();
      ctx.arc(-4, -2, 5, 0, Math.PI * 2);
      ctx.arc(4, -2, 5, 0, Math.PI * 2);
      ctx.lineTo(0, 8);
      ctx.closePath();
      ctx.fill();
    } else if (item.type === 'blank') {
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.fillStyle = '#34d399';
      ctx.fillRect(-7, -6, 14, 12);
      ctx.strokeStyle = '#ecfdf5';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-7, -6, 14, 12);
    }
    ctx.restore();
  }

  _drawEnemy(ctx, e) {
    ctx.save();
    ctx.translate(e.x, e.y);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, e.radius * 0.8, e.radius * 0.85, e.radius * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : e.color;
    ctx.beginPath();
    ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = e.accent;
    ctx.lineWidth = e.isBoss ? 4 : 2.5;
    ctx.stroke();

    // Eyes
    ctx.fillStyle = '#0f172a';
    const eyeOff = e.isBoss ? 9 : 4.5;
    const eyeR = e.isBoss ? 4 : 2.2;
    ctx.beginPath();
    ctx.arc(-eyeOff, -3, eyeR, 0, Math.PI * 2);
    ctx.arc(eyeOff, -3, eyeR, 0, Math.PI * 2);
    ctx.fill();

    // Non-boss mini HP bar
    if (!e.isBoss && e.hp < e.maxHp) {
      const bw = 28;
      ctx.fillStyle = 'rgba(15,23,42,0.85)';
      ctx.fillRect(-bw / 2, -e.radius - 10, bw, 4);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(-bw / 2, -e.radius - 10, bw * Math.max(0, e.hp / e.maxHp), 4);
    }

    ctx.restore();
  }

  _drawPlayer(ctx, engine) {
    const p = engine.player;
    const invuln = engine.isPlayerInvulnerable();
    const rolling = p.rollTimer > 0;

    ctx.save();
    ctx.translate(p.x, p.y);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(0, p.radius * 0.85, p.radius * 0.85, p.radius * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();

    if (invuln) {
      ctx.globalAlpha = rolling ? 0.65 : Math.sin(engine.elapsedTime * 35) > 0 ? 0.95 : 0.35;
    }

    // Roll spin visual
    if (rolling) {
      const progress = 1 - p.rollTimer / PLAYER_CONFIG.rollDuration;
      ctx.rotate(progress * Math.PI * 2);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, p.radius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Character body (Gungeoneer style cloak + helmet)
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#e0f2fe';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Visor
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-6, -5, 12, 5);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(-4, -4, 3, 3);
    ctx.fillRect(1, -4, 3, 3);

    ctx.restore();

    // Weapon barrel aimed at cursor (hidden while rolling)
    if (!rolling) {
      const w = engine.getActiveWeapon();
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.aimAngle);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(6, -3.5, 16, 7);
      ctx.fillStyle = w.color;
      ctx.fillRect(18, -2.5, 5, 5);
      ctx.restore();

      // Reload bar above player
      if (w.reloadTimer > 0) {
        const bw = 34;
        const pct = 1 - w.reloadTimer / w.reloadTime;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(p.x - bw / 2, p.y - p.radius - 13, bw, 5);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(p.x - bw / 2, p.y - p.radius - 13, bw * pct, 5);
      }
    }
  }

  _drawBossBar(ctx, boss) {
    const bw = 420;
    const bh = 14;
    const x = ROOM_W / 2 - bw / 2;
    const y = ROOM_H - WALL_T - 28;
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.fillRect(x - 4, y - 20, bw + 8, bh + 26);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 12px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`BOSS · ${boss.name}`, ROOM_W / 2, y - 6);
    ctx.fillStyle = '#334155';
    ctx.fillRect(x, y, bw, bh);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(x, y, bw * Math.max(0, boss.hp / boss.maxHp), bh);
    ctx.strokeStyle = '#fca5a5';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, bw, bh);
    ctx.restore();
  }

  _drawMinimap(ctx, engine) {
    const rooms = Array.from(engine.dungeon.rooms.values());
    const cur = engine.getCurrentRoom();
    const cell = 15;
    const ox = ROOM_W - 96;
    const oy = 74;

    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(ROOM_W - 156, 14, 142, 118, 8);
    ctx.fill();
    ctx.stroke();

    for (const r of rooms) {
      // Show visited rooms and their immediate neighbors
      const isNeighbor = Object.values(cur.doors).includes(r.id);
      if (!r.visited && !isNeighbor) continue;

      const rx = ox + (r.gx - cur.gx) * (cell + 3);
      const ry = oy + (r.gy - cur.gy) * (cell + 3);
      if (rx < ROOM_W - 150 || rx > ROOM_W - 30 || ry < 20 || ry > 116) continue;

      let fill = '#475569';
      if (r.id === cur.id) fill = '#38bdf8';
      else if (r.type === 'boss') fill = '#ef4444';
      else if (r.type === 'treasure') fill = '#f59e0b';
      else if (r.type === 'shop') fill = '#10b981';
      else if (!r.visited) fill = '#334155';

      ctx.fillStyle = fill;
      ctx.fillRect(rx - cell / 2, ry - cell / 2, cell, cell);
      if (r.id === cur.id) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(rx - cell / 2, ry - cell / 2, cell, cell);
      }
    }
    ctx.restore();
  }

  _drawCrosshair(ctx, x, y, weapon) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = weapon ? weapon.color : '#ffd166';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.moveTo(-13, 0);
    ctx.lineTo(-5, 0);
    ctx.moveTo(5, 0);
    ctx.lineTo(13, 0);
    ctx.moveTo(0, -13);
    ctx.lineTo(0, -5);
    ctx.moveTo(0, 5);
    ctx.lineTo(0, 13);
    ctx.stroke();
    ctx.restore();
  }
}
