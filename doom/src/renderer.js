import {
  INTERNAL_WIDTH,
  INTERNAL_HEIGHT,
  HUD_HEIGHT,
  VIEW_HEIGHT,
  FOV,
  TEX_SIZE,
  WEAPONS,
  WEAPON_IDS,
  TILE,
  DOOR_TILES,
} from './constants.js';
import { angleDiff, clamp } from './math.js';
import { createTextureAtlas } from './textures.js';

export class DoomRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.canvas.width = INTERNAL_WIDTH;
    this.canvas.height = INTERNAL_HEIGHT;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.ctx.imageSmoothingEnabled = false;
    this.atlas = createTextureAtlas();
    this.showMinimap = true;
    this.fps = 60;
  }

  render(engine) {
    const ctx = this.ctx;
    const level = engine.currentLevel;

    // 1. Ceiling & Floor gradients
    const skyGrad = ctx.createLinearGradient(0, 0, 0, VIEW_HEIGHT / 2);
    skyGrad.addColorStop(0, level.skyTop);
    skyGrad.addColorStop(1, level.skyBottom);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, INTERNAL_WIDTH, VIEW_HEIGHT / 2);

    const floorGrad = ctx.createLinearGradient(0, VIEW_HEIGHT / 2, 0, VIEW_HEIGHT);
    floorGrad.addColorStop(0, level.floorFar);
    floorGrad.addColorStop(1, level.floorNear);
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, VIEW_HEIGHT / 2, INTERNAL_WIDTH, VIEW_HEIGHT / 2);

    // 2. Raycast walls & fill 1D Z-Buffer
    const rays = engine.castFrameRays(INTERNAL_WIDTH);
    const zBuffer = new Float32Array(INTERNAL_WIDTH);

    for (let x = 0; x < INTERNAL_WIDTH; x++) {
      const ray = rays[x];
      zBuffer[x] = ray.perpDist;
      if (!ray.hit) continue;

      const wallHeight = Math.floor(VIEW_HEIGHT / ray.perpDist);
      const drawTop = Math.floor((VIEW_HEIGHT - wallHeight) / 2);
      const tex = this.atlas.walls[ray.tile] || this.atlas.walls[TILE.TECH_WALL];
      const texCol = clamp(Math.floor(ray.texX * TEX_SIZE), 0, TEX_SIZE - 1);

      ctx.drawImage(tex, texCol, 0, 1, TEX_SIZE, x, drawTop, 1, wallHeight);

      // Directional + distance fog shading
      const sideDark = ray.side === 1 ? 0.22 : 0.0;
      const distDark = clamp((ray.perpDist - 2.0) / 14.0, 0, 0.72);
      const shade = clamp(sideDark + distDark, 0, 0.84);
      if (shade > 0.02) {
        ctx.fillStyle = `rgba(0,0,0,${shade.toFixed(3)})`;
        ctx.fillRect(x, drawTop, 1, wallHeight);
      }
    }

    // 3. Render depth-sorted sprites (enemies, pickups, projectiles)
    this._renderSprites(engine, zBuffer);

    // 4. First-person weapon viewmodel + crosshair
    this._renderWeapon(engine);
    this._renderCrosshair(engine);

    // 5. Screen flashes (damage / pickup / muzzle)
    if (engine.damageFlash > 0.01) {
      ctx.fillStyle = `rgba(220, 20, 20, ${(engine.damageFlash * 0.45).toFixed(3)})`;
      ctx.fillRect(0, 0, INTERNAL_WIDTH, VIEW_HEIGHT);
    }
    if (engine.pickupFlash > 0.01) {
      ctx.fillStyle = `rgba(250, 220, 90, ${(engine.pickupFlash * 0.28).toFixed(3)})`;
      ctx.fillRect(0, 0, INTERNAL_WIDTH, VIEW_HEIGHT);
    }

    // 6. Top-left message feed & FPS
    this._renderMessages(engine);

    // 7. Automap overlay
    if (this.showMinimap) {
      this._renderMinimap(engine);
    }

    // 8. Classic DOOM Status Bar HUD
    this._renderHUD(engine);
  }

  _renderSprites(engine, zBuffer) {
    const ctx = this.ctx;
    const p = engine.player;
    const renderList = [];

    for (const e of engine.enemies) {
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      renderList.push({
        kind: 'enemy',
        ref: e,
        dist: Math.hypot(dx, dy),
        angle: Math.atan2(dy, dx),
      });
    }

    for (const item of engine.pickups) {
      if (item.collected) continue;
      const dx = item.x - p.x;
      const dy = item.y - p.y;
      renderList.push({
        kind: 'pickup',
        ref: item,
        dist: Math.hypot(dx, dy),
        angle: Math.atan2(dy, dx),
      });
    }

    for (const proj of engine.projectiles) {
      if (!proj.alive) continue;
      const dx = proj.x - p.x;
      const dy = proj.y - p.y;
      renderList.push({
        kind: 'projectile',
        ref: proj,
        dist: Math.hypot(dx, dy),
        angle: Math.atan2(dy, dx),
      });
    }

    // Painter's algorithm: far to near
    renderList.sort((a, b) => b.dist - a.dist);

    const halfFov = FOV / 2;
    const projPlane = (INTERNAL_WIDTH / 2) / Math.tan(halfFov);

    for (const entry of renderList) {
      if (entry.dist < 0.2) continue;
      const relAngle = angleDiff(p.angle, entry.angle);
      if (Math.abs(relAngle) > halfFov + 0.45) continue;

      const perpDist = entry.dist * Math.cos(relAngle);
      if (perpDist <= 0.15) continue;

      const screenX = Math.floor(INTERNAL_WIDTH / 2 + Math.tan(relAngle) * projPlane);

      if (entry.kind === 'projectile') {
        const size = clamp(Math.floor((VIEW_HEIGHT / perpDist) * 0.24), 4, 48);
        const colIdx = clamp(screenX, 0, INTERNAL_WIDTH - 1);
        if (perpDist < zBuffer[colIdx]) {
          const cy = Math.floor(VIEW_HEIGHT / 2);
          ctx.fillStyle = entry.ref.color;
          ctx.beginPath();
          ctx.arc(screenX, cy, size / 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(screenX, cy, Math.max(1.5, size / 4), 0, Math.PI * 2);
          ctx.fill();
        }
        continue;
      }

      let img = null;
      let scale = 1.0;
      let yOffset = 0;

      if (entry.kind === 'enemy') {
        const e = entry.ref;
        const set = this.atlas.sprites.enemies[e.type];
        if (!e.alive) {
          img = set.dead;
        } else if (e.state === 'pain') {
          img = set.pain;
        } else if (e.state === 'attack') {
          img = set.attack;
        } else {
          img = Math.floor(e.animTime * 4) % 2 === 0 ? set.walk1 : set.walk2;
        }
        scale = e.spriteScale;
      } else if (entry.kind === 'pickup') {
        img = this.atlas.sprites.pickups[entry.ref.type];
        scale = 0.56;
        yOffset = Math.sin(engine.time * 4 + entry.ref.id) * 0.04;
      }

      if (!img) continue;

      const spriteH = Math.floor((VIEW_HEIGHT / perpDist) * scale);
      const spriteW = spriteH;
      const drawStartX = Math.floor(screenX - spriteW / 2);
      const drawEndX = Math.floor(screenX + spriteW / 2);
      const drawTop = Math.floor(
        VIEW_HEIGHT / 2 - spriteH / 2 + (1 - scale) * (VIEW_HEIGHT / perpDist) * 0.42 + yOffset * spriteH
      );

      // Clip horizontal slices against 1D Z-Buffer (step=2px for crisp speed)
      const startX = Math.max(0, drawStartX);
      const endX = Math.min(INTERNAL_WIDTH - 1, drawEndX);
      const srcW = img.width;
      const srcH = img.height;

      for (let sx = startX; sx <= endX; sx += 2) {
        if (perpDist >= zBuffer[sx]) continue;
        const u = (sx - drawStartX) / Math.max(1, spriteW);
        const texX = clamp(Math.floor(u * srcW), 0, srcW - 1);
        const stripW = sx + 1 <= endX && perpDist < zBuffer[sx + 1] ? 2 : 1;
        ctx.drawImage(img, texX, 0, 1, srcH, sx, drawTop, stripW, spriteH);
      }
    }
  }

  _renderWeapon(engine) {
    const ctx = this.ctx;
    const p = engine.player;
    const bobX = Math.cos(p.bobPhase) * 8 * p.bobAmount;
    const bobY = Math.abs(Math.sin(p.bobPhase)) * 7 * p.bobAmount;
    const recoilY = p.weaponRecoil * 16;

    const cx = Math.floor(INTERNAL_WIDTH / 2 + bobX);
    const baseY = Math.floor(VIEW_HEIGHT + 8 + bobY + recoilY);

    ctx.save();
    if (engine.muzzleFlash > 0.15) {
      const flashColor =
        p.currentWeapon === WEAPON_IDS.PLASMA ? 'rgba(56,189,248,0.8)' : 'rgba(253,224,71,0.85)';
      ctx.fillStyle = flashColor;
      ctx.beginPath();
      ctx.arc(cx, baseY - 68, 22 * engine.muzzleFlash, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx, baseY - 68, 10 * engine.muzzleFlash, 0, Math.PI * 2);
      ctx.fill();
    }

    if (p.currentWeapon === WEAPON_IDS.FIST) {
      const punchY = -p.weaponRecoil * 26;
      ctx.fillStyle = '#d4a373';
      ctx.fillRect(cx - 26, baseY - 50 + punchY, 52, 42);
      ctx.fillStyle = '#b08968';
      ctx.fillRect(cx - 26, baseY - 34 + punchY, 52, 10);
      ctx.fillStyle = '#facc15'; // brass knuckles
      ctx.fillRect(cx - 24, baseY - 46 + punchY, 48, 8);
    } else if (p.currentWeapon === WEAPON_IDS.PISTOL) {
      ctx.fillStyle = '#334155';
      ctx.fillRect(cx - 10, baseY - 64, 20, 42);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(cx - 7, baseY - 62, 14, 24);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(cx - 3, baseY - 64, 6, 8);
      ctx.fillStyle = '#78350f';
      ctx.fillRect(cx - 12, baseY - 26, 24, 28);
    } else if (p.currentWeapon === WEAPON_IDS.SHOTGUN) {
      // Twin barrels + pump
      ctx.fillStyle = '#27272a';
      ctx.fillRect(cx - 14, baseY - 76, 28, 52);
      ctx.fillStyle = '#52525b';
      ctx.fillRect(cx - 10, baseY - 76, 8, 48);
      ctx.fillRect(cx + 2, baseY - 76, 8, 48);
      ctx.fillStyle = '#92400e';
      ctx.fillRect(cx - 16, baseY - 34, 32, 34);
      ctx.fillStyle = '#d97706';
      ctx.fillRect(cx - 12, baseY - 30, 24, 8);
    } else if (p.currentWeapon === WEAPON_IDS.PLASMA) {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(cx - 22, baseY - 72, 44, 66);
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(cx - 16, baseY - 66, 32, 30);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(cx - 12, baseY - 62, 24, 10);
      ctx.fillStyle = '#e0f2fe';
      ctx.fillRect(cx - 6, baseY - 60, 12, 6);
    }
    ctx.restore();
  }

  _renderCrosshair(engine) {
    if (engine.state !== 'playing') return;
    const ctx = this.ctx;
    const cx = INTERNAL_WIDTH / 2;
    const cy = VIEW_HEIGHT / 2;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
    ctx.fillRect(cx - 5, cy - 1, 3, 2);
    ctx.fillRect(cx + 2, cy - 1, 3, 2);
    ctx.fillRect(cx - 1, cy - 5, 2, 3);
    ctx.fillRect(cx - 1, cy + 2, 2, 3);
  }

  _renderMessages(engine) {
    const ctx = this.ctx;
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    for (let i = 0; i < engine.messages.length; i++) {
      const msg = engine.messages[i];
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(6, 6 + i * 14, Math.min(270, msg.text.length * 6.5 + 10), 12);
      ctx.fillStyle = '#fde047';
      ctx.fillText(msg.text, 10, 15 + i * 14);
    }

    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(`${this.fps} FPS`, INTERNAL_WIDTH - 8, 14);
  }

  _renderMinimap(engine) {
    const ctx = this.ctx;
    const grid = engine.grid;
    const scale = 5;
    const mapW = grid[0].length * scale;
    const mapH = grid.length * scale;
    const ox = INTERNAL_WIDTH - mapW - 8;
    const oy = 20;

    ctx.fillStyle = 'rgba(9, 11, 16, 0.78)';
    ctx.fillRect(ox - 3, oy - 3, mapW + 6, mapH + 6);
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1;
    ctx.strokeRect(ox - 3, oy - 3, mapW + 6, mapH + 6);

    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        if (!engine.visited[y][x]) continue;
        const tile = grid[y][x];
        if (tile === TILE.EMPTY) {
          ctx.fillStyle = '#1e293b';
        } else if (tile === TILE.EXIT_SWITCH) {
          ctx.fillStyle = '#22c55e';
        } else if (tile === TILE.DOOR_BLUE) {
          ctx.fillStyle = '#3b82f6';
        } else if (tile === TILE.DOOR_RED) {
          ctx.fillStyle = '#ef4444';
        } else if (DOOR_TILES.has(tile)) {
          ctx.fillStyle = '#eab308';
        } else {
          ctx.fillStyle = '#94a3b8';
        }
        ctx.fillRect(ox + x * scale, oy + y * scale, scale - 0.5, scale - 0.5);
      }
    }

    // Pickups & Enemies on discovered tiles
    for (const item of engine.pickups) {
      if (item.collected) continue;
      if (!engine.visited[Math.floor(item.y)]?.[Math.floor(item.x)]) continue;
      ctx.fillStyle = item.color;
      ctx.fillRect(ox + item.x * scale - 1, oy + item.y * scale - 1, 2.5, 2.5);
    }

    for (const e of engine.enemies) {
      if (!e.alive) continue;
      if (!engine.visited[Math.floor(e.y)]?.[Math.floor(e.x)]) continue;
      ctx.fillStyle = '#f43f5e';
      ctx.fillRect(ox + e.x * scale - 1.5, oy + e.y * scale - 1.5, 3, 3);
    }

    // Player marker & direction vector
    const px = ox + engine.player.x * scale;
    const py = oy + engine.player.y * scale;
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(px - 2, py - 2, 4, 4);
    ctx.strokeStyle = '#fef08a';
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(engine.player.angle) * 7, py + Math.sin(engine.player.angle) * 7);
    ctx.stroke();
  }

  _renderHUD(engine) {
    const ctx = this.ctx;
    const y0 = VIEW_HEIGHT;
    const p = engine.player;
    const w = WEAPONS[p.currentWeapon];

    // Metallic classic status bar background
    ctx.fillStyle = '#27272a';
    ctx.fillRect(0, y0, INTERNAL_WIDTH, HUD_HEIGHT);
    ctx.fillStyle = '#52525b';
    ctx.fillRect(0, y0, INTERNAL_WIDTH, 2);
    ctx.fillStyle = '#18181b';
    ctx.fillRect(0, y0 + 2, INTERNAL_WIDTH, 2);

    const drawBox = (x, width, label, value, color = '#ef4444') => {
      ctx.fillStyle = '#18181b';
      ctx.fillRect(x, y0 + 6, width, HUD_HEIGHT - 12);
      ctx.strokeStyle = '#3f3f46';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y0 + 6, width, HUD_HEIGHT - 12);
      ctx.fillStyle = color;
      ctx.font = 'bold 17px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(String(value), x + width / 2, y0 + 28);
      ctx.fillStyle = '#a1a1aa';
      ctx.font = 'bold 8px monospace';
      ctx.fillText(label, x + width / 2, y0 + 42);
    };

    const ammoDisplay = w.ammoType ? p.ammo[w.ammoType] : 'INF';
    drawBox(8, 68, 'AMMO', ammoDisplay, '#facc15');
    drawBox(82, 74, 'HEALTH', `${p.health}%`, p.health <= 25 ? '#f87171' : '#ef4444');

    // Weapons slots panel
    ctx.fillStyle = '#18181b';
    ctx.fillRect(162, y0 + 6, 56, HUD_HEIGHT - 12);
    ctx.strokeStyle = '#3f3f46';
    ctx.strokeRect(162, y0 + 6, 56, HUD_HEIGHT - 12);
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    const slots = [
      { id: WEAPON_IDS.FIST, num: '1', x: 176, y: y0 + 21 },
      { id: WEAPON_IDS.PISTOL, num: '2', x: 204, y: y0 + 21 },
      { id: WEAPON_IDS.SHOTGUN, num: '3', x: 176, y: y0 + 36 },
      { id: WEAPON_IDS.PLASMA, num: '4', x: 204, y: y0 + 36 },
    ];
    for (const s of slots) {
      const owned = p.ownedWeapons[s.id];
      const active = p.currentWeapon === s.id;
      ctx.fillStyle = active ? '#fde047' : owned ? '#94a3b8' : '#3f3f46';
      ctx.fillText(s.num, s.x, s.y);
    }
    ctx.fillStyle = '#a1a1aa';
    ctx.font = 'bold 7px monospace';
    ctx.fillText('ARMS', 190, y0 + 45);

    // Doomguy Face Portrait
    this._renderMarineFace(224, y0 + 6, 44, HUD_HEIGHT - 12, engine);

    drawBox(274, 68, 'ARMOR', `${p.armor}%`, '#22c55e');

    // Keys box
    ctx.fillStyle = '#18181b';
    ctx.fillRect(348, y0 + 6, 36, HUD_HEIGHT - 12);
    ctx.strokeStyle = '#3f3f46';
    ctx.strokeRect(348, y0 + 6, 36, HUD_HEIGHT - 12);
    ctx.fillStyle = p.keys.blue ? '#3b82f6' : '#27272a';
    ctx.fillRect(356, y0 + 13, 20, 9);
    ctx.fillStyle = p.keys.red ? '#ef4444' : '#27272a';
    ctx.fillRect(356, y0 + 26, 20, 9);
    ctx.fillStyle = '#a1a1aa';
    ctx.font = 'bold 7px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('KEYS', 366, y0 + 45);

    // Sector / Kills / Score box
    ctx.fillStyle = '#18181b';
    ctx.fillRect(390, y0 + 6, 82, HUD_HEIGHT - 12);
    ctx.strokeStyle = '#3f3f46';
    ctx.strokeRect(390, y0 + 6, 82, HUD_HEIGHT - 12);
    ctx.textAlign = 'left';
    ctx.font = 'bold 8px monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(engine.currentLevel.id, 396, y0 + 18);
    ctx.fillStyle = '#f87171';
    ctx.fillText(`KILLS ${engine.levelKills}/${engine.levelTotalEnemies}`, 396, y0 + 30);
    ctx.fillStyle = '#fde047';
    ctx.fillText(`SCR ${engine.score}`, 396, y0 + 42);
  }

  _renderMarineFace(x, y, w, h, engine) {
    const ctx = this.ctx;
    ctx.fillStyle = '#18181b';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#3f3f46';
    ctx.strokeRect(x, y, w, h);

    const cx = x + w / 2;
    const cy = y + h / 2 + 1;
    const hp = engine.player.health;

    // Head
    ctx.fillStyle = hp <= 0 ? '#7f1d1d' : '#eab676';
    ctx.fillRect(cx - 11, cy - 12, 22, 24);
    // Hair / Helmet
    ctx.fillStyle = '#451a03';
    ctx.fillRect(cx - 11, cy - 14, 22, 6);
    // Eyes
    const look = Math.round(Math.sin(engine.time * 1.5));
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 7, cy - 4, 5, 4);
    ctx.fillRect(cx + 2, cy - 4, 5, 4);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(cx - 5 + look, cy - 3, 2, 2);
    ctx.fillRect(cx + 4 + look, cy - 3, 2, 2);
    // Mouth
    ctx.fillStyle = engine.damageFlash > 0.2 ? '#dc2626' : '#451a03';
    if (engine.damageFlash > 0.2 || hp <= 25) {
      ctx.fillRect(cx - 5, cy + 4, 10, 5);
    } else {
      ctx.fillRect(cx - 5, cy + 5, 10, 2);
    }
    // Bloodied scratches when low HP
    if (hp < 50) {
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(cx - 9, cy - 1, 3, 6);
      ctx.fillRect(cx + 6, cy + 2, 3, 5);
    }
  }
}
