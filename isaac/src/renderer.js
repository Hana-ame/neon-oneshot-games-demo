import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  DIR_LIST,
  GRID_COLS,
  GRID_ROWS,
  ROOM_BOTTOM,
  ROOM_HEIGHT,
  ROOM_LEFT,
  ROOM_RIGHT,
  ROOM_TOP,
  ROOM_TYPES,
  ROOM_WIDTH,
  TILE_TYPES
} from './constants.js';
import { getDoorRect } from './engine.js';
import { getCellSize, tileToWorld } from './entities.js';

export class IsaacRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  render(engine) {
    const ctx = this.ctx;
    const room = engine.getCurrentRoom();
    const theme = engine.floor.theme;

    ctx.save();
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Screen shake transform
    if (engine.screenShake > 0.2) {
      const sx = (Math.random() - 0.5) * engine.screenShake;
      const sy = (Math.random() - 0.5) * engine.screenShake;
      ctx.translate(sx, sy);
    }

    this.drawRoomShell(ctx, theme, room);
    this.drawStartTutorials(ctx, room);
    this.drawBloodStains(ctx, room);
    this.drawTiles(ctx, room, theme);
    this.drawDoors(ctx, room);
    this.drawTrapdoorOrChest(ctx, room, engine.elapsedTime);
    this.drawPedestalsAndShop(ctx, room, engine.elapsedTime);
    this.drawPickups(ctx, room, engine.elapsedTime);
    this.drawBombs(ctx, engine.bombs, engine.elapsedTime);
    this.drawEnemies(ctx, room.enemies, engine.elapsedTime);
    this.drawPlayer(ctx, engine.player, engine.elapsedTime);
    this.drawTears(ctx, engine.tears);
    this.drawEnemyBullets(ctx, engine.enemyBullets);
    this.drawParticles(ctx, engine.particles);
    this.drawVignette(ctx);
    ctx.restore();

    // Screen-space HUD (no screen shake)
    this.drawTopHUD(ctx, engine);
    this.drawFoundHUDStats(ctx, engine);
    this.drawBossHealthBar(ctx, room);
    this.drawBanner(ctx, engine.banner);
  }

  drawRoomShell(ctx, theme, room) {
    // Outer wall fill
    ctx.fillStyle = theme.wallColor;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Wall brick bevel frame
    ctx.fillStyle = theme.wallTrim;
    ctx.fillRect(ROOM_LEFT - 14, ROOM_TOP - 14, ROOM_WIDTH + 28, ROOM_HEIGHT + 28);

    // Subtle stone brick lines on walls
    ctx.strokeStyle = 'rgba(0,0,0,0.32)';
    ctx.lineWidth = 2;
    for (let x = ROOM_LEFT - 14; x < ROOM_RIGHT + 14; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, ROOM_TOP - 14);
      ctx.lineTo(x, ROOM_TOP);
      ctx.moveTo(x + 32, ROOM_BOTTOM);
      ctx.lineTo(x + 32, ROOM_BOTTOM + 14);
      ctx.stroke();
    }

    // Floor base
    ctx.fillStyle = theme.floorColor;
    ctx.fillRect(ROOM_LEFT, ROOM_TOP, ROOM_WIDTH, ROOM_HEIGHT);

    // Subtle tiled floor pattern
    const { cw, ch } = getCellSize();
    ctx.fillStyle = theme.floorAlt;
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if ((r + c) % 2 === 0) {
          ctx.fillRect(ROOM_LEFT + c * cw, ROOM_TOP + r * ch, cw, ch);
        }
      }
    }

    // Special room floor emblem
    if (room.type === ROOM_TYPES.TREASURE) {
      ctx.strokeStyle = 'rgba(255, 212, 59, 0.16)';
      ctx.lineWidth = 4;
      ctx.strokeRect(ROOM_LEFT + 18, ROOM_TOP + 18, ROOM_WIDTH - 36, ROOM_HEIGHT - 36);
    } else if (room.type === ROOM_TYPES.BOSS) {
      ctx.strokeStyle = 'rgba(224, 49, 49, 0.22)';
      ctx.lineWidth = 4;
      ctx.strokeRect(ROOM_LEFT + 18, ROOM_TOP + 18, ROOM_WIDTH - 36, ROOM_HEIGHT - 36);
    }

    // Inner wall shadow
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 6;
    ctx.strokeRect(ROOM_LEFT + 2, ROOM_TOP + 2, ROOM_WIDTH - 4, ROOM_HEIGHT - 4);
  }

  drawStartTutorials(ctx, room) {
    if (room.type !== ROOM_TYPES.START) return;
    ctx.save();
    ctx.fillStyle = 'rgba(255, 240, 220, 0.16)';
    ctx.strokeStyle = 'rgba(255, 240, 220, 0.18)';
    ctx.font = 'bold 14px "Inter", sans-serif';
    ctx.textAlign = 'center';

    const cx = ROOM_LEFT + ROOM_WIDTH / 2;
    const cy = ROOM_TOP + ROOM_HEIGHT / 2;

    ctx.fillText('WASD 移动', cx - 220, cy - 12);
    ctx.fillText('↑ ↓ ← → 发射眼泪', cx + 220, cy - 12);
    ctx.fillText('E 放置炸弹', cx - 220, cy + 125);
    ctx.fillText('SPACE 主动道具  ·  R 重开', cx + 210, cy + 125);
    ctx.restore();
  }

  drawBloodStains(ctx, room) {
    for (const s of room.bloodStains) {
      ctx.fillStyle = 'rgba(138, 22, 22, 0.45)';
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, s.r, s.r * 0.65, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawTiles(ctx, room, theme) {
    const { cw, ch } = getCellSize();
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const tile = room.grid[r][c];
        if (tile === TILE_TYPES.EMPTY) continue;
        const x = ROOM_LEFT + c * cw;
        const y = ROOM_TOP + r * ch;

        if (tile === TILE_TYPES.ROCK || tile === TILE_TYPES.TINTED_ROCK) {
          const isTinted = tile === TILE_TYPES.TINTED_ROCK;
          // Shadow
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.beginPath();
          ctx.roundRect(x + 4, y + 8, cw - 6, ch - 6, 8);
          ctx.fill();
          // Rock body
          ctx.fillStyle = isTinted ? '#4d647a' : theme.rockColor;
          ctx.beginPath();
          ctx.roundRect(x + 3, y + 3, cw - 6, ch - 8, 8);
          ctx.fill();
          // Highlight
          ctx.fillStyle = isTinted ? 'rgba(180,225,255,0.22)' : 'rgba(255,255,255,0.12)';
          ctx.beginPath();
          ctx.roundRect(x + 7, y + 6, cw - 16, 10, 4);
          ctx.fill();
          // Tinted Rock secret X mark
          if (isTinted) {
            ctx.strokeStyle = 'rgba(20, 35, 50, 0.65)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x + cw * 0.6, y + ch * 0.5);
            ctx.lineTo(x + cw * 0.78, y + ch * 0.68);
            ctx.moveTo(x + cw * 0.78, y + ch * 0.5);
            ctx.lineTo(x + cw * 0.6, y + ch * 0.68);
            ctx.stroke();
          }
        } else if (tile === TILE_TYPES.SPIKES) {
          ctx.fillStyle = '#25282c';
          ctx.fillRect(x + 4, y + 4, cw - 8, ch - 8);
          ctx.fillStyle = '#ced4da';
          const pts = [
            [x + 12, y + 12], [x + cw - 12, y + 12],
            [x + 12, y + ch - 12], [x + cw - 12, y + ch - 12],
            [x + cw / 2, y + ch / 2]
          ];
          for (const [px, py] of pts) {
            ctx.beginPath();
            ctx.moveTo(px, py - 7);
            ctx.lineTo(px + 6, py + 5);
            ctx.lineTo(px - 6, py + 5);
            ctx.closePath();
            ctx.fill();
          }
        } else if (tile === TILE_TYPES.POOP) {
          ctx.fillStyle = '#6d4c41';
          ctx.beginPath();
          ctx.ellipse(x + cw / 2, y + ch * 0.62, cw * 0.34, ch * 0.24, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#795548';
          ctx.beginPath();
          ctx.ellipse(x + cw / 2, y + ch * 0.45, cw * 0.24, ch * 0.18, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#8d6e63';
          ctx.beginPath();
          ctx.arc(x + cw / 2, y + ch * 0.32, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  drawDoors(ctx, room) {
    for (const dir of DIR_LIST) {
      const door = room.doors[dir.key];
      if (!door) continue;
      const rect = getDoorRect(dir.key);

      let frameColor = '#795548';
      if (door.doorType === ROOM_TYPES.TREASURE) frameColor = '#f59f00';
      else if (door.doorType === ROOM_TYPES.BOSS) frameColor = '#c92a2a';
      else if (door.doorType === ROOM_TYPES.SHOP) frameColor = '#5c940d';

      ctx.save();
      ctx.fillStyle = frameColor;
      ctx.beginPath();
      ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 6);
      ctx.fill();

      // Inner opening
      const pad = 6;
      const isOpen = room.cleared && !door.locked;
      ctx.fillStyle = isOpen ? '#0d0908' : '#3d2b24';
      ctx.fillRect(rect.x + pad, rect.y + pad, rect.w - pad * 2, rect.h - pad * 2);

      // Bars when enemies alive
      if (!room.cleared) {
        ctx.strokeStyle = '#adb5bd';
        ctx.lineWidth = 3;
        if (dir.key === 'NORTH' || dir.key === 'SOUTH') {
          for (let bx = rect.x + 14; bx < rect.x + rect.w - 10; bx += 12) {
            ctx.beginPath();
            ctx.moveTo(bx, rect.y + pad);
            ctx.lineTo(bx, rect.y + rect.h - pad);
            ctx.stroke();
          }
        } else {
          for (let by = rect.y + 14; by < rect.y + rect.h - 10; by += 12) {
            ctx.beginPath();
            ctx.moveTo(rect.x + pad, by);
            ctx.lineTo(rect.x + rect.w - pad, by);
            ctx.stroke();
          }
        }
      } else if (door.locked) {
        // Golden keyhole icon
        ctx.fillStyle = '#ffd43b';
        ctx.beginPath();
        ctx.arc(rect.x + rect.w / 2, rect.y + rect.h / 2 - 2, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(rect.x + rect.w / 2 - 2, rect.y + rect.h / 2 + 1, 4, 7);
      }

      // Boss skull badge or Treasure crown dot
      if (door.doorType === ROOM_TYPES.BOSS) {
        ctx.fillStyle = '#f8f9fa';
        ctx.beginPath();
        ctx.arc(rect.x + rect.w / 2, rect.y + rect.h / 2, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  drawTrapdoorOrChest(ctx, room, time) {
    if (room.trapdoor) {
      const { x, y } = room.trapdoor;
      ctx.save();
      ctx.fillStyle = '#4a3525';
      ctx.fillRect(x - 24, y - 24, 48, 48);
      ctx.fillStyle = '#090707';
      ctx.fillRect(x - 18, y - 18, 36, 36);
      // Ladder rungs
      ctx.strokeStyle = '#8d6e63';
      ctx.lineWidth = 3;
      for (let ry = y - 10; ry <= y + 12; ry += 8) {
        ctx.beginPath();
        ctx.moveTo(x - 10, ry);
        ctx.lineTo(x + 10, ry);
        ctx.stroke();
      }
      ctx.fillStyle = '#ffd43b';
      ctx.font = 'bold 11px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('进入下一层', x, y - 30);
      ctx.restore();
    }

    if (room.victoryChest) {
      const { x, y } = room.victoryChest;
      const glow = 0.4 + Math.sin(time * 5) * 0.2;
      ctx.save();
      ctx.fillStyle = `rgba(255, 212, 59, ${glow})`;
      ctx.beginPath();
      ctx.arc(x, y, 36, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f59f00';
      ctx.strokeStyle = '#fff3bf';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(x - 22, y - 16, 44, 32, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fff9db';
      ctx.fillRect(x - 5, y - 4, 10, 10);
      ctx.font = 'bold 12px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('胜利宝箱', x, y - 24);
      ctx.restore();
    }
  }

  drawPedestalsAndShop(ctx, room, time) {
    for (const ped of room.pedestals) {
      const pos = tileToWorld(ped.col, ped.row);
      // Stone altar
      ctx.fillStyle = '#5c544e';
      ctx.fillRect(pos.x - 18, pos.y + 4, 36, 16);
      ctx.fillStyle = '#867b73';
      ctx.fillRect(pos.x - 20, pos.y, 40, 7);

      if (!ped.taken && ped.item) {
        const bob = Math.sin(time * 4) * 5;
        this.drawItemOrb(ctx, pos.x, pos.y - 16 + bob, ped.item);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = 'bold 11px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(ped.item.name, pos.x, pos.y + 34);
      }
    }

    for (const sItem of room.shopItems) {
      if (sItem.bought) continue;
      const pos = tileToWorld(sItem.col, sItem.row);
      const bob = Math.sin(time * 3.5 + sItem.col) * 4;
      if (sItem.kind === 'item') {
        this.drawItemOrb(ctx, pos.x, pos.y - 10 + bob, sItem.item);
      } else {
        this.drawSinglePickup(ctx, sItem.pickupType, pos.x, pos.y - 6 + bob);
      }
      ctx.fillStyle = '#ffd43b';
      ctx.font = 'bold 13px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${sItem.price}¢`, pos.x, pos.y + 24);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '11px "Inter", sans-serif';
      ctx.fillText(sItem.label, pos.x, pos.y + 38);
    }
  }

  drawItemOrb(ctx, x, y, item) {
    ctx.save();
    ctx.fillStyle = 'rgba(255, 224, 102, 0.25)';
    ctx.beginPath();
    ctx.arc(x, y, 20, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = item.color || '#ffd43b';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = item.accent || '#ffffff';
    ctx.beginPath();
    ctx.arc(x - 3, y - 3, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawPickups(ctx, room, time) {
    for (const pk of room.pickups) {
      const bob = Math.sin(time * 5 + pk.bobPhase) * 3;
      this.drawSinglePickup(ctx, pk.type, pk.x, pk.y + bob);
    }
  }

  drawSinglePickup(ctx, type, x, y) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(x, y + 10, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    if (type === 'red_heart' || type === 'half_heart' || type === 'soul_heart') {
      const col = type === 'soul_heart' ? '#4dabf7' : '#e03131';
      this.drawHeartShape(ctx, x, y - 4, 9, col, '#ffffff');
    } else if (type === 'coin') {
      ctx.fillStyle = '#fcc419';
      ctx.strokeStyle = '#e67700';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff3bf';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('¢', x, y + 3.5);
    } else if (type === 'bomb') {
      ctx.fillStyle = '#343a40';
      ctx.strokeStyle = '#ced4da';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y + 1, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#ffa94d';
      ctx.beginPath();
      ctx.moveTo(x + 3, y - 7);
      ctx.lineTo(x + 8, y - 12);
      ctx.stroke();
    } else if (type === 'key') {
      ctx.fillStyle = '#ffd43b';
      ctx.strokeStyle = '#e67700';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x - 4, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillRect(x, y - 2, 11, 4);
      ctx.fillRect(x + 7, y + 2, 3, 4);
    }
    ctx.restore();
  }

  drawHeartShape(ctx, cx, cy, size, fill, stroke) {
    ctx.save();
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(cx, cy + size * 0.9);
    ctx.bezierCurveTo(cx - size * 1.4, cy, cx - size * 1.1, cy - size * 0.9, cx, cy - size * 0.25);
    ctx.bezierCurveTo(cx + size * 1.1, cy - size * 0.9, cx + size * 1.4, cy, cx, cy + size * 0.9);
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.3;
      ctx.stroke();
    }
    ctx.restore();
  }

  drawBombs(ctx, bombs, time) {
    for (const b of bombs) {
      const flash = Math.sin(time * (b.fuse < 0.5 ? 45 : 18)) > 0;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.ellipse(b.x, b.y + 11, 13, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = flash ? '#ff6b6b' : '#2b2d42';
      ctx.strokeStyle = '#f8f9fa';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Sparking fuse
      ctx.strokeStyle = '#ffd43b';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(b.x + 5, b.y - 10);
      ctx.lineTo(b.x + 11, b.y - 17);
      ctx.stroke();
      ctx.fillStyle = '#ff922b';
      ctx.beginPath();
      ctx.arc(b.x + 12, b.y - 18, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  drawPlayer(ctx, p, time) {
    if (p.invulnTimer > 0 && Math.floor(time * 16) % 2 === 0) {
      ctx.globalAlpha = 0.45;
    }
    const moving = Math.hypot(p.vx, p.vy) > 15;
    const bob = moving ? Math.sin(time * 16) * 2.5 : 0;

    // Ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 16, 15, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Small body
    ctx.fillStyle = p.hurtFlash > 0 ? '#ff6b6b' : '#f1c2b0';
    ctx.strokeStyle = '#2b1d19';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(p.x - 9, p.y + 1 + bob, 18, 14, 6);
    ctx.fill();
    ctx.stroke();

    // Big iconic Isaac head
    ctx.fillStyle = p.hurtFlash > 0 ? '#ff8787' : '#f6cbb9';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - 10 + bob, 18, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Face direction offset
    const fx = Math.max(-4, Math.min(4, p.facing.x * 4));
    const fy = Math.max(-3, Math.min(3, p.facing.y * 3));

    // Tear streams
    const tearCol = p.stats.homing ? '#cc5de8' : p.stats.poison ? '#51cf66' : '#74c0fc';
    ctx.fillStyle = tearCol;
    ctx.fillRect(p.x - 9 + fx, p.y - 9 + fy + bob, 4, 9);
    ctx.fillRect(p.x + 5 + fx, p.y - 9 + fy + bob, 4, 9);

    // Eyes
    ctx.fillStyle = '#141214';
    const eyeH = p.blinkTimer > 0 ? 1.8 : 4.2;
    ctx.beginPath();
    ctx.ellipse(p.x - 7 + fx, p.y - 11 + fy + bob, 3.6, eyeH, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x + 7 + fx, p.y - 11 + fy + bob, 3.6, eyeH, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eye highlights
    if (p.blinkTimer <= 0) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x - 8 + fx, p.y - 12.5 + fy + bob, 1.3, 0, Math.PI * 2);
      ctx.arc(p.x + 6 + fx, p.y - 12.5 + fy + bob, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Sad quivering mouth
    ctx.strokeStyle = '#3a2320';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(p.x + fx, p.y - 2 + fy + bob, 4, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();

    ctx.globalAlpha = 1;
  }

  drawEnemies(ctx, enemies, time) {
    for (const e of enemies) {
      if (!e.alive) continue;
      ctx.save();

      // Ground shadow (scales down when jumping high)
      const shadowScale = Math.max(0.45, 1 - e.z / 260);
      ctx.fillStyle = 'rgba(0,0,0,0.42)';
      ctx.beginPath();
      ctx.ellipse(e.x, e.y + e.radius * 0.72, e.radius * 0.9 * shadowScale, e.radius * 0.36 * shadowScale, 0, 0, Math.PI * 2);
      ctx.fill();

      const drawY = e.y - e.z;
      const bodyColor = e.hitFlash > 0 ? '#ffffff' : e.poisonTimer > 0 ? '#69db7c' : e.color;

      if (e.type === 'FLY') {
        const wing = Math.sin(time * 36 + e.id) * 4;
        ctx.fillStyle = 'rgba(230,240,255,0.65)';
        ctx.beginPath();
        ctx.ellipse(e.x - 10, drawY - 6 + wing, 7, 4, -0.3, 0, Math.PI * 2);
        ctx.ellipse(e.x + 10, drawY - 6 - wing, 7, 4, 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.arc(e.x, drawY, e.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = e.accent;
        ctx.beginPath();
        ctx.arc(e.x - 4, drawY - 2, 3, 0, Math.PI * 2);
        ctx.arc(e.x + 4, drawY - 2, 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.type === 'SPIDER') {
        ctx.strokeStyle = '#18141a';
        ctx.lineWidth = 2;
        for (let side of [-1, 1]) {
          for (let leg = -1; leg <= 1; leg++) {
            ctx.beginPath();
            ctx.moveTo(e.x, drawY);
            ctx.lineTo(e.x + side * (e.radius + 7), drawY + leg * 7 + Math.sin(time * 22 + leg) * 2);
            ctx.stroke();
          }
        }
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.arc(e.x, drawY, e.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = e.accent;
        ctx.fillRect(e.x - 4, drawY - 3, 3, 3);
        ctx.fillRect(e.x + 1, drawY - 3, 3, 3);
      } else if (e.type === 'MONSTRO') {
        const squash = e.z > 5 ? 0.92 : 1 + Math.sin(time * 6) * 0.04;
        ctx.fillStyle = bodyColor;
        ctx.strokeStyle = '#3b1515';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(e.x, drawY, e.radius * squash, e.radius * (2 - squash) * 0.9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Gaping cleft mouth
        ctx.fillStyle = '#4a0d0d';
        ctx.beginPath();
        ctx.ellipse(e.x, drawY + 10, 22, 13, 0, 0, Math.PI * 2);
        ctx.fill();
        // Eyes
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(e.x - 14, drawY - 10, 5, 0, Math.PI * 2);
        ctx.arc(e.x + 14, drawY - 10, 5, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.type === 'HEART') {
        const pulse = 1 + Math.sin(time * 7) * 0.07;
        this.drawHeartShape(ctx, e.x, drawY - 8, e.radius * 0.85 * pulse, bodyColor, '#4a0d16');
      } else {
        // GAPER / SHOOTER / CHARGER / DUKE
        ctx.fillStyle = bodyColor;
        ctx.strokeStyle = '#241818';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(e.x, drawY, e.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Angry/hollow eyes
        ctx.fillStyle = e.type === 'CHARGER' && e.state === 'CHARGE' ? '#ff2a2a' : '#181010';
        ctx.beginPath();
        ctx.arc(e.x - e.radius * 0.34, drawY - e.radius * 0.16, Math.max(3, e.radius * 0.18), 0, Math.PI * 2);
        ctx.arc(e.x + e.radius * 0.34, drawY - e.radius * 0.16, Math.max(3, e.radius * 0.18), 0, Math.PI * 2);
        ctx.fill();

        // Mouth
        ctx.fillStyle = e.accent;
        ctx.beginPath();
        ctx.ellipse(e.x, drawY + e.radius * 0.28, e.radius * 0.36, e.radius * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Small HP bar for non-boss damaged enemies
      if (!e.isBoss && e.hp < e.maxHp) {
        const bw = 28;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(e.x - bw / 2, drawY - e.radius - 10, bw, 4);
        ctx.fillStyle = '#ff6b6b';
        ctx.fillRect(e.x - bw / 2, drawY - e.radius - 10, bw * Math.max(0, e.hp / e.maxHp), 4);
      }

      ctx.restore();
    }
  }

  drawTears(ctx, tears) {
    for (const t of tears) {
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(t.x, t.y + 10, t.radius * 0.8, t.radius * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();

      const drawY = t.y - t.z * 0.45;
      const fill = t.homing ? '#be4bdb' : t.poison ? '#51cf66' : t.bouncing ? '#ffd43b' : '#4dabf7';
      ctx.fillStyle = fill;
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(t.x, drawY, t.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.arc(t.x - t.radius * 0.3, drawY - t.radius * 0.3, t.radius * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawEnemyBullets(ctx, bullets) {
    for (const b of bullets) {
      ctx.fillStyle = b.color;
      ctx.strokeStyle = '#ffccd5';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  drawParticles(ctx, particles) {
    for (const pt of particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawVignette(ctx) {
    const grad = ctx.createRadialGradient(
      CANVAS_WIDTH / 2,
      CANVAS_HEIGHT / 2,
      260,
      CANVAS_WIDTH / 2,
      CANVAS_HEIGHT / 2,
      580
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }

  drawTopHUD(ctx, engine) {
    const p = engine.player;
    ctx.save();
    // Subtle dark HUD strip at very top
    ctx.fillStyle = 'rgba(14, 10, 9, 0.88)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, 76);
    ctx.strokeStyle = 'rgba(255, 224, 178, 0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 76);
    ctx.lineTo(CANVAS_WIDTH, 76);
    ctx.stroke();

    // 1. Active Item Box (Left)
    const active = p.activeItem;
    ctx.fillStyle = '#241b18';
    ctx.strokeStyle = active && active.charge >= active.maxCharge ? '#ffd43b' : '#5c4d47';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(14, 12, 46, 50, 8);
    ctx.fill();
    ctx.stroke();
    if (active) {
      this.drawHeartShape(ctx, 37, 34, 11, active.color, '#fff');
      // Charge bar
      const barH = 44;
      const frac = active.charge / active.maxCharge;
      ctx.fillStyle = '#1b1615';
      ctx.fillRect(64, 15, 8, barH);
      ctx.fillStyle = frac >= 1 ? '#69db7c' : '#94d82d';
      ctx.fillRect(64, 15 + barH * (1 - frac), 8, barH * frac);
    }

    // 2. Hearts Row
    const totalRedContainers = Math.ceil(p.stats.maxRedHearts / 2);
    let hx = 94;
    const hy = 26;
    for (let i = 0; i < totalRedContainers; i++) {
      const containerVal = Math.max(0, Math.min(2, p.stats.redHearts - i * 2));
      if (containerVal === 2) {
        this.drawHeartShape(ctx, hx, hy, 9, '#e03131', '#ffc9c9');
      } else if (containerVal === 1) {
        this.drawHeartShape(ctx, hx, hy, 9, '#3a2222', '#ff8787');
        ctx.save();
        ctx.beginPath();
        ctx.rect(hx - 14, hy - 14, 14, 28);
        ctx.clip();
        this.drawHeartShape(ctx, hx, hy, 9, '#e03131', null);
        ctx.restore();
      } else {
        this.drawHeartShape(ctx, hx, hy, 9, '#2b1d1c', '#868e96');
      }
      hx += 24;
    }
    // Soul Hearts
    const totalSoulContainers = Math.ceil(p.stats.soulHearts / 2);
    for (let i = 0; i < totalSoulContainers; i++) {
      this.drawHeartShape(ctx, hx, hy, 9, '#4dabf7', '#d0ebff');
      hx += 24;
    }

    // 3. Resources (Coins, Bombs, Keys, Score)
    ctx.font = 'bold 13px "Inter", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd43b';
    ctx.fillText(`¢ ${String(p.coins).padStart(2, '0')}`, 88, 60);
    ctx.fillStyle = '#ffa94d';
    ctx.fillText(`💣 ${String(p.bombs).padStart(2, '0')}`, 144, 60);
    ctx.fillStyle = '#ffe066';
    ctx.fillText(`🔑 ${String(p.keys).padStart(2, '0')}`, 206, 60);

    // 4. Center Floor & Seed Info
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f8f9fa';
    ctx.font = 'bold 15px "Inter", sans-serif';
    ctx.fillText(`${engine.floor.theme.name}  ·  得分 ${p.score}`, CANVAS_WIDTH / 2, 30);
    ctx.fillStyle = '#adb5bd';
    ctx.font = '12px monospace';
    ctx.fillText(`SEED: ${engine.seed}  |  已收集道具: ${p.ownedItems.length}`, CANVAS_WIDTH / 2, 54);

    // 5. Minimap (Top-Right)
    this.drawMinimap(ctx, engine);
    ctx.restore();
  }

  drawMinimap(ctx, engine) {
    const mapX = CANVAS_WIDTH - 148;
    const mapY = 8;
    const cellW = 14;
    const cellH = 10;

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(mapX, mapY, 136, 62, 6);
    ctx.fill();
    ctx.stroke();

    const cur = engine.getCurrentRoom();
    const centerDrawX = mapX + 68;
    const centerDrawY = mapY + 31;

    for (const room of engine.floor.rooms.values()) {
      // Show visited rooms + neighbors of visited rooms
      const isAdjacentToVisited = Object.values(room.doors).some((d) => {
        const nr = engine.floor.rooms.get(d.toKey);
        return nr && nr.visited;
      });
      if (!room.visited && !isAdjacentToVisited) continue;

      const rx = centerDrawX + (room.gx - cur.gx) * (cellW + 2) - cellW / 2;
      const ry = centerDrawY + (room.gy - cur.gy) * (cellH + 2) - cellH / 2;
      if (rx < mapX + 4 || rx + cellW > mapX + 132 || ry < mapY + 3 || ry + cellH > mapY + 59) continue;

      if (room.key === cur.key) {
        ctx.fillStyle = '#ffffff';
      } else if (room.type === ROOM_TYPES.BOSS) {
        ctx.fillStyle = '#e03131';
      } else if (room.type === ROOM_TYPES.TREASURE) {
        ctx.fillStyle = '#fcc419';
      } else if (room.type === ROOM_TYPES.SHOP) {
        ctx.fillStyle = '#74b816';
      } else if (room.visited) {
        ctx.fillStyle = '#868e96';
      } else {
        ctx.fillStyle = 'rgba(134, 142, 150, 0.35)';
      }

      ctx.fillRect(rx, ry, cellW, cellH);
    }
  }

  drawFoundHUDStats(ctx, engine) {
    const s = engine.player.stats;
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.52)';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    const x = 12;
    let y = 135;
    const effDmg = (s.damage * s.damageMultiplier).toFixed(1);
    const lines = [
      `DMG  ${effDmg}`,
      `TRS  ${s.tearRate.toFixed(1)}`,
      `SPD  ${(s.speed / 200).toFixed(2)}`,
      `RNG  ${Math.round(s.range)}`
    ];
    for (const line of lines) {
      ctx.fillText(line, x, y);
      y += 20;
    }

    // Active modifiers badges
    const mods = [];
    if (s.shotCount > 1) mods.push(`x${s.shotCount}`);
    if (s.homing) mods.push('追踪');
    if (s.piercing) mods.push('穿透');
    if (s.bouncing) mods.push('反弹');
    if (s.poison) mods.push('剧毒');
    if (mods.length > 0) {
      ctx.fillStyle = '#ffd43b';
      for (const m of mods) {
        ctx.fillText(m, x, y);
        y += 17;
      }
    }
    ctx.restore();
  }

  drawBossHealthBar(ctx, room) {
    const boss = room.enemies.find((e) => e.isBoss && e.alive);
    if (!boss) return;
    ctx.save();
    const bw = 420;
    const bh = 16;
    const bx = (CANVAS_WIDTH - bw) / 2;
    const by = CANVAS_HEIGHT - 36;

    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.beginPath();
    ctx.roundRect(bx - 4, by - 4, bw + 8, bh + 8, 8);
    ctx.fill();

    ctx.fillStyle = '#3a1414';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#e03131';
    ctx.fillRect(bx, by, bw * Math.max(0, boss.hp / boss.maxHp), bh);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(boss.name, CANVAS_WIDTH / 2, by - 9);
    ctx.restore();
  }

  drawBanner(ctx, banner) {
    if (!banner) return;
    const alpha = Math.min(1, banner.timer * 2, (banner.maxTimer - banner.timer) * 4 + 0.2);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.fillStyle = 'rgba(12, 8, 8, 0.78)';
    ctx.fillRect(0, 140, CANVAS_WIDTH, 76);

    ctx.fillStyle = '#ffd43b';
    ctx.font = 'bold 26px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(banner.title, CANVAS_WIDTH / 2, 174);

    if (banner.subtitle) {
      ctx.fillStyle = '#f1f3f5';
      ctx.font = '14px "Inter", sans-serif';
      ctx.fillText(banner.subtitle, CANVAS_WIDTH / 2, 200);
    }
    ctx.restore();
  }
}
