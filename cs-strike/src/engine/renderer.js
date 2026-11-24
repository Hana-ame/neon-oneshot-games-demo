import { MAP_ZONES, TEAMS } from './constants.js';
import { computeShotSpread } from './weapons.js';

export class FPSRenderer {
  constructor(canvas, radarCanvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.radarCanvas = radarCanvas;
    this.radarCtx = radarCanvas ? radarCanvas.getContext('2d') : null;
    this.textures = this.generateProceduralTextures();
    this.zBuffer = [];
  }

  generateProceduralTextures() {
    const size = 64;
    const makeTex = (drawFn) => {
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const g = c.getContext('2d');
      drawFn(g, size);
      return c;
    };

    const tex = {};

    // 1: Dust2 Sandstone Brick
    tex[1] = makeTex((g, s) => {
      g.fillStyle = '#c8ab7c';
      g.fillRect(0, 0, s, s);
      for (let row = 0; row < 4; row++) {
        const y = row * 16;
        const offset = (row % 2) * 16;
        g.fillStyle = '#a78a5d';
        g.fillRect(0, y, s, 2);
        for (let col = -1; col < 3; col++) {
          const x = col * 32 + offset;
          g.fillStyle = (row + col) % 2 === 0 ? '#ceb282' : '#c0a272';
          g.fillRect(x + 2, y + 2, 29, 13);
          g.fillStyle = '#997c52';
          g.fillRect(x, y, 2, 16);
        }
      }
      // Sand grain noise
      g.fillStyle = 'rgba(70, 50, 25, 0.08)';
      for (let i = 0; i < 90; i++) {
        g.fillRect((i * 17) % s, (i * 29) % s, 2, 2);
      }
    });

    // 2: Wooden Tactical Crate
    tex[2] = makeTex((g, s) => {
      g.fillStyle = '#8b6239';
      g.fillRect(0, 0, s, s);
      g.strokeStyle = '#5c3c1e';
      g.lineWidth = 4;
      g.strokeRect(2, 2, s - 4, s - 4);
      g.beginPath();
      g.moveTo(4, 4); g.lineTo(s - 4, s - 4);
      g.moveTo(s - 4, 4); g.lineTo(4, s - 4);
      g.stroke();
      g.fillStyle = '#9e7346';
      for (let y = 10; y < s - 10; y += 11) {
        g.fillRect(6, y, s - 12, 2);
      }
    });

    // 3: Metal Double Door
    tex[3] = makeTex((g, s) => {
      g.fillStyle = '#4e5d6b';
      g.fillRect(0, 0, s, s);
      g.fillStyle = '#3b4854';
      g.fillRect(0, 0, s, 4);
      g.fillRect(0, s - 4, s, 4);
      g.fillRect(s / 2 - 2, 0, 4, s);
      g.strokeStyle = '#6c7e8f';
      g.lineWidth = 2;
      g.strokeRect(6, 8, s / 2 - 12, s - 16);
      g.strokeRect(s / 2 + 6, 8, s / 2 - 12, s - 16);
    });

    // 4: Bombsite A Wall (Red Spray 'A')
    tex[4] = makeTex((g, s) => {
      g.drawImage(tex[1], 0, 0);
      g.fillStyle = 'rgba(185, 35, 35, 0.85)';
      g.font = 'bold 42px monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('A', s / 2, s / 2 + 2);
    });

    // 5: Bombsite B Wall (Red Spray 'B')
    tex[5] = makeTex((g, s) => {
      g.drawImage(tex[1], 0, 0);
      g.fillStyle = 'rgba(185, 35, 35, 0.85)';
      g.font = 'bold 42px monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('B', s / 2, s / 2 + 2);
    });

    // 6: Dark Tunnel Brick
    tex[6] = makeTex((g, s) => {
      g.fillStyle = '#5e564d';
      g.fillRect(0, 0, s, s);
      for (let row = 0; row < 4; row++) {
        const y = row * 16;
        g.fillStyle = '#3d3730';
        g.fillRect(0, y, s, 2);
        const offset = (row % 2) * 16;
        for (let col = -1; col < 3; col++) {
          g.fillStyle = (row + col) % 2 === 0 ? '#696056' : '#564e46';
          g.fillRect(col * 32 + offset + 2, y + 2, 29, 13);
        }
      }
    });

    return tex;
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const w = Math.max(320, Math.floor(rect.width));
    const h = Math.max(220, Math.floor(rect.height));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  render(game) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const player = game.player;
    if (!player) return;

    // Spectate an alive teammate if player is dead
    let cam = player;
    if (!player.alive) {
      const aliveAlly = game.combatants.find((c) => c.alive && c.team === player.team);
      if (aliveAlly) cam = aliveAlly;
    }

    const fov = cam.scoped ? 0.42 : 1.08;
    const halfH = h / 2;
    const pitchPx = Math.floor(cam.pitch * h * 0.55) - (cam.crouching ? Math.floor(h * 0.06) : 0);
    const horizon = halfH + pitchPx;

    // 1. Sky & Desert Floor gradients
    const skyGrad = ctx.createLinearGradient(0, 0, 0, Math.max(1, horizon));
    skyGrad.addColorStop(0, '#5a87b8');
    skyGrad.addColorStop(0.7, '#9ec2e0');
    skyGrad.addColorStop(1, '#e8d8b7');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, Math.max(0, horizon));

    const floorGrad = ctx.createLinearGradient(0, horizon, 0, h);
    floorGrad.addColorStop(0, '#8d795c');
    floorGrad.addColorStop(0.35, '#a89270');
    floorGrad.addColorStop(1, '#bfa985');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, horizon, w, h - horizon);

    // 2. Raycast 3D Walls (column step = 2px for crisp 60fps performance)
    const stripW = 2;
    const numRays = Math.ceil(w / stripW);
    if (this.zBuffer.length !== numRays) this.zBuffer = new Array(numRays);

    const projDist = (w / 2) / Math.tan(fov / 2);

    for (let i = 0; i < numRays; i++) {
      const screenX = i * stripW;
      const cameraX = (2 * (screenX + stripW * 0.5)) / w - 1;
      const rayAngle = cam.angle + Math.atan(cameraX * Math.tan(fov / 2));
      const ray = game.map.castRay(cam.x, cam.y, rayAngle, 48);

      // Fix fisheye distortion
      const correctedDist = Math.max(0.05, ray.distance * Math.cos(rayAngle - cam.angle));
      this.zBuffer[i] = correctedDist;

      if (ray.hit) {
        const wallH = (projDist / correctedDist) * 1.05;
        const drawTop = horizon - wallH / 2;
        const tex = this.textures[ray.tile] || this.textures[1];
        const texX = Math.min(63, Math.max(0, Math.floor(ray.wallX * 64)));

        ctx.drawImage(tex, texX, 0, 1, 64, screenX, drawTop, stripW, wallH);

        // Directional & distance fog shading
        const shade = Math.min(0.68, (ray.side === 1 ? 0.16 : 0) + correctedDist * 0.024);
        if (shade > 0.01) {
          ctx.fillStyle = `rgba(28, 22, 16, ${shade.toFixed(3)})`;
          ctx.fillRect(screenX, drawTop, stripW, wallH);
        }
      }
    }

    // 3. Z-Buffered Sprites (Combatants + Planted C4)
    const sprites = [];
    for (const c of game.combatants) {
      if (c.id === cam.id || !c.alive) continue;
      const dx = c.x - cam.x;
      const dy = c.y - cam.y;
      const dist = Math.hypot(dx, dy);
      sprites.push({ type: 'combatant', entity: c, dx, dy, dist });
    }
    if (game.bomb.state === 'PLANTED') {
      const dx = game.bomb.x - cam.x;
      const dy = game.bomb.y - cam.y;
      sprites.push({ type: 'bomb', dx, dy, dist: Math.hypot(dx, dy) });
    }

    sprites.sort((a, b) => b.dist - a.dist);

    for (const sp of sprites) {
      let relAngle = Math.atan2(sp.dy, sp.dx) - cam.angle;
      while (relAngle > Math.PI) relAngle -= Math.PI * 2;
      while (relAngle < -Math.PI) relAngle += Math.PI * 2;
      if (Math.abs(relAngle) > fov * 0.72) continue;

      const perpDist = Math.max(0.2, sp.dist * Math.cos(relAngle));
      const screenX = w / 2 + Math.tan(relAngle) * projDist;
      const sprH = (projDist / perpDist) * (sp.type === 'bomb' ? 0.35 : (sp.entity.crouching ? 0.78 : 1.0));
      const sprW = sprH * (sp.type === 'bomb' ? 1.1 : 0.48);

      // Occlusion check at center ray
      const centerRayIdx = Math.floor(screenX / stripW);
      if (centerRayIdx < 0 || centerRayIdx >= numRays) continue;
      if (perpDist > this.zBuffer[centerRayIdx] + 0.15) continue;

      if (sp.type === 'bomb') {
        const bx = screenX - sprW / 2;
        const by = horizon + (projDist / perpDist) * 0.52 - sprH;
        ctx.fillStyle = '#3b4238';
        ctx.fillRect(bx, by, sprW, sprH);
        const blink = Math.floor(game.bomb.timer * 4) % 2 === 0;
        ctx.fillStyle = blink ? '#ff2a2a' : '#550000';
        ctx.beginPath();
        ctx.arc(screenX, by + sprH * 0.35, Math.max(3, sprW * 0.16), 0, Math.PI * 2);
        ctx.fill();
      } else {
        this.drawCombatantSprite(ctx, sp.entity, screenX, horizon, sprW, sprH, perpDist, cam.team);
      }
    }

    // 4. First-person weapon viewmodel or AWP Scope
    if (cam.scoped && cam.getActiveWeapon().id === 'awp') {
      this.drawScopeOverlay(ctx, w, h);
    } else if (cam.alive) {
      this.drawWeaponViewmodel(ctx, w, h, cam);
      this.drawCrosshair(ctx, w, h, cam, game.hitmarker);
    }

    // 5. Hurt vignette
    if (player.hurtFlashTimer > 0) {
      const alpha = (player.hurtFlashTimer / 0.25) * 0.45;
      ctx.fillStyle = `rgba(210, 20, 20, ${alpha.toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
    }

    // 6. Tactical Radar
    this.renderRadar(game, cam);
  }

  drawCombatantSprite(ctx, c, cx, horizon, sw, sh, dist, viewerTeam) {
    const top = horizon - sh * 0.46;
    const isCT = c.team === TEAMS.CT;
    const bodyColor = isCT ? '#2c4c73' : '#7a5234';
    const vestColor = isCT ? '#1c2f47' : '#3d3126';
    const headColor = isCT ? '#22364d' : '#c79b73';
    const visorColor = isCT ? '#6ec4ff' : '#2a1d15';

    // Legs
    ctx.fillStyle = isCT ? '#1d2938' : '#38322a';
    ctx.fillRect(cx - sw * 0.34, top + sh * 0.62, sw * 0.28, sh * 0.38);
    ctx.fillRect(cx + sw * 0.06, top + sh * 0.62, sw * 0.28, sh * 0.38);

    // Torso & tactical vest
    ctx.fillStyle = bodyColor;
    ctx.fillRect(cx - sw * 0.42, top + sh * 0.24, sw * 0.84, sh * 0.40);
    ctx.fillStyle = vestColor;
    ctx.fillRect(cx - sw * 0.30, top + sh * 0.28, sw * 0.60, sh * 0.32);

    // Head
    const headR = sw * 0.26;
    ctx.fillStyle = headColor;
    ctx.beginPath();
    ctx.arc(cx, top + sh * 0.13, headR, 0, Math.PI * 2);
    ctx.fill();

    // Goggles / Bandana
    ctx.fillStyle = visorColor;
    ctx.fillRect(cx - headR * 0.72, top + sh * 0.10, headR * 1.44, headR * 0.38);

    // Muzzle flash when bot shoots
    if (c.muzzleFlashTimer > 0) {
      ctx.fillStyle = '#ffd659';
      ctx.beginPath();
      ctx.arc(cx + sw * 0.35, top + sh * 0.38, sw * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ally indicator chevron & HP bar
    if (c.team === viewerTeam) {
      ctx.fillStyle = '#4ade80';
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(c.name, cx, top - 6);
    } else if (dist < 14) {
      // Subtle enemy health bar when close
      const barW = Math.max(22, sw * 0.9);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(cx - barW / 2, top - 10, barW, 4);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(cx - barW / 2, top - 10, barW * (c.hp / 100), 4);
    }
  }

  drawWeaponViewmodel(ctx, w, h, cam) {
    const weapon = cam.getActiveWeapon();
    if (!weapon) return;
    const bobX = Math.sin(cam.bobPhase) * 8;
    const bobY = Math.abs(Math.cos(cam.bobPhase)) * 7;
    const kick = cam.recoil * 26;
    const reloadDip = weapon.reloading ? Math.sin(weapon.reloadTimer * 5) * 28 + 38 : 0;

    const baseX = w * 0.66 + bobX;
    const baseY = h * 0.78 + bobY + kick + reloadDip;

    ctx.save();
    ctx.translate(baseX, baseY);

    // Muzzle flash
    if (cam.muzzleFlashTimer > 0 && weapon.id !== 'knife') {
      ctx.fillStyle = 'rgba(255, 224, 110, 0.92)';
      ctx.beginPath();
      ctx.arc(-52, -78, 26 + Math.random() * 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.beginPath();
      ctx.arc(-52, -78, 12, 0, Math.PI * 2);
      ctx.fill();
    }

    if (weapon.id === 'knife') {
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.moveTo(-20, -10);
      ctx.lineTo(-70, -95);
      ctx.lineTo(-42, -90);
      ctx.lineTo(8, -12);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(-10, -12, 24, 65);
    } else if (weapon.id === 'awp') {
      // Olive green sniper body + scope
      ctx.fillStyle = '#3f5a36';
      ctx.fillRect(-26, -32, 84, 34);
      ctx.fillStyle = '#1e242b';
      ctx.fillRect(-72, -52, 62, 12); // barrel
      ctx.fillRect(-28, -56, 48, 16); // scope
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(10, 0, 26, 68);
    } else if (weapon.id === 'ak47') {
      // Wood stock & receiver
      ctx.fillStyle = '#27272a';
      ctx.fillRect(-68, -56, 62, 10); // barrel
      ctx.fillRect(-34, -42, 92, 28); // receiver
      ctx.fillStyle = '#8b5a2b';
      ctx.fillRect(-44, -40, 32, 20); // wood handguard
      ctx.fillRect(36, -32, 48, 30);  // stock
      ctx.fillStyle = '#3f3f46';
      ctx.fillRect(-10, -14, 18, 48); // curved mag
    } else if (weapon.id === 'm4a1' || weapon.id === 'mp5') {
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(-74, -54, 68, 11); // silencer/barrel
      ctx.fillRect(-32, -44, 94, 30);
      ctx.fillStyle = '#374151';
      ctx.fillRect(-16, -54, 42, 10); // carry rail
      ctx.fillRect(-4, -14, 18, 46);  // mag
    } else {
      // Pistols (USP-S, Glock, Deagle)
      const slideColor = weapon.id === 'deagle' ? '#cbd5e1' : '#334155';
      ctx.fillStyle = slideColor;
      ctx.fillRect(-48, -54, 68, 20);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(-10, -34, 28, 62);
    }

    // Tactical gloved hand
    ctx.fillStyle = cam.team === TEAMS.CT ? '#1e3a5f' : '#4a3525';
    ctx.fillRect(-16, 18, 56, 75);
    ctx.restore();
  }

  drawScopeOverlay(ctx, w, h) {
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(w, h) * 0.44;
    ctx.save();
    ctx.fillStyle = '#05070a';
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.arc(cx, cy, r, 0, Math.PI * 2, true);
    ctx.fill();

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
    ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r);
    ctx.stroke();

    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawCrosshair(ctx, w, h, cam, hitmarker) {
    const cx = w / 2;
    const cy = h / 2;
    const spec = cam.getActiveWeaponSpec();
    const isMoving = Math.hypot(cam.vx, cam.vy) > 0.35;
    const spread = computeShotSpread(spec, isMoving, cam.crouching, cam.scoped, cam.recoil);
    const gap = Math.min(34, 5 + spread * 165);
    const len = 8;

    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - gap - len, cy); ctx.lineTo(cx - gap, cy);
    ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + gap + len, cy);
    ctx.moveTo(cx, cy - gap - len); ctx.lineTo(cx, cy - gap);
    ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + gap + len);
    ctx.stroke();

    if (hitmarker.timer > 0) {
      ctx.strokeStyle = hitmarker.headshot ? '#ff2a2a' : '#ffffff';
      ctx.lineWidth = hitmarker.headshot ? 2.6 : 2;
      const d1 = 5;
      const d2 = 13;
      ctx.beginPath();
      ctx.moveTo(cx - d2, cy - d2); ctx.lineTo(cx - d1, cy - d1);
      ctx.moveTo(cx + d2, cy - d2); ctx.lineTo(cx + d1, cy - d1);
      ctx.moveTo(cx - d2, cy + d2); ctx.lineTo(cx - d1, cy + d1);
      ctx.moveTo(cx + d2, cy + d2); ctx.lineTo(cx + d1, cy + d1);
      ctx.stroke();
    }
  }

  renderRadar(game, cam) {
    const ctx = this.radarCtx;
    if (!ctx) return;
    const rw = this.radarCanvas.width;
    const rh = this.radarCanvas.height;
    const map = game.map;
    const cellW = rw / map.width;
    const cellH = rh / map.height;

    ctx.fillStyle = 'rgba(12, 18, 26, 0.88)';
    ctx.fillRect(0, 0, rw, rh);

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const t = map.grid[y][x];
        if (t !== 0) {
          ctx.fillStyle = t === 2 ? '#8b6239' : (t === 4 || t === 5) ? '#991b1b' : '#475569';
          ctx.fillRect(x * cellW, y * cellH, cellW + 0.5, cellH + 0.5);
        }
      }
    }

    // Bombsite labels A / B
    ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('A', MAP_ZONES.SITE_A.cx * cellW, MAP_ZONES.SITE_A.cy * cellH + 4);
    ctx.fillText('B', MAP_ZONES.SITE_B.cx * cellW, MAP_ZONES.SITE_B.cy * cellH + 4);

    // Planted Bomb blip
    if (game.bomb.state === 'PLANTED') {
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.arc(game.bomb.x * cellW, game.bomb.y * cellH, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Combatants
    for (const c of game.combatants) {
      if (!c.alive) continue;
      const isAlly = c.team === cam.team;
      if (!isAlly && !map.hasLineOfSight(cam.x, cam.y, c.x, c.y) && c.muzzleFlashTimer <= 0) {
        continue; // Fog of war for enemies unless visible or firing
      }
      ctx.fillStyle = c.id === cam.id ? '#facc15' : isAlly ? '#38bdf8' : '#ef4444';
      ctx.beginPath();
      ctx.arc(c.x * cellW, c.y * cellH, c.id === cam.id ? 4 : 3.2, 0, Math.PI * 2);
      ctx.fill();

      if (c.id === cam.id) {
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(c.x * cellW, c.y * cellH);
        ctx.lineTo((c.x + Math.cos(c.angle) * 1.8) * cellW, (c.y + Math.sin(c.angle) * 1.8) * cellH);
        ctx.stroke();
      }
    }
  }
}
