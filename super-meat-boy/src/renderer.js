import { CHAPTER_THEMES, TILE, TILE_SIZE } from './constants.js';

/**
 * Render the entire game scene onto a 2D canvas context.
 */
export function renderGame(ctx, game) {
  const { world, player, particles, decals, time, state, replay } = game;
  const theme = CHAPTER_THEMES[world.theme] || CHAPTER_THEMES.forest;

  ctx.save();
  // Camera shake on death
  if (game.shakeTime > 0) {
    const mag = game.shakeTime * 22;
    ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
  }

  // 1. Background gradient + subtle grid
  const bgGrad = ctx.createLinearGradient(0, 0, 0, world.height);
  bgGrad.addColorStop(0, theme.bgTop);
  bgGrad.addColorStop(1, theme.bgBottom);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, world.width, world.height);

  ctx.strokeStyle = theme.gridColor;
  ctx.lineWidth = 1;
  for (let x = 0; x <= world.width; x += TILE_SIZE) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, world.height);
    ctx.stroke();
  }
  for (let y = 0; y <= world.height; y += TILE_SIZE) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(world.width, y);
    ctx.stroke();
  }

  // 2. Static & dynamic tiles
  for (let r = 0; r < world.rows; r++) {
    for (let c = 0; c < world.cols; c++) {
      const ch = world.tiles[r][c];
      const x = c * TILE_SIZE;
      const y = r * TILE_SIZE;

      if (ch === TILE.SOLID) {
        drawSolidTile(ctx, world, r, c, x, y, theme);
      } else if (ch === TILE.BOUNCE) {
        drawBounceTile(ctx, x, y, time);
      } else if (ch === TILE.CRUMBLE) {
        const block = world.crumbleBlocks.find((b) => b.row === r && b.col === c);
        if (block && block.state !== 'gone') {
          const jitter = block.state === 'shaking' ? (Math.random() - 0.5) * 3.5 : 0;
          drawCrumbleTile(ctx, x + jitter, y + jitter, block.state === 'shaking');
        }
      } else if (
        ch === TILE.SPIKE_UP ||
        ch === TILE.SPIKE_DOWN ||
        ch === TILE.SPIKE_LEFT ||
        ch === TILE.SPIKE_RIGHT
      ) {
        drawSpikeTile(ctx, ch, x, y);
      }
    }
  }

  // 3. Moving platforms
  for (const plat of world.platforms) {
    ctx.fillStyle = '#475569';
    ctx.fillRect(plat.x, plat.y, plat.width, plat.height);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(plat.x, plat.y, plat.width, 4);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(plat.x, plat.y, plat.width, plat.height);
  }

  // 4. Persistent blood decals
  for (const d of decals) {
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.ellipse(d.x, d.y, d.rx, d.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 5. Sawblades
  for (const saw of world.saws) {
    drawSawblade(ctx, saw);
  }

  // 6. Optional Bandage collectible
  if (world.bandage && !world.bandage.collected) {
    drawBandage(ctx, world.bandage, time);
  }

  // 7. Bandage Girl (Goal)
  drawBandageGirl(ctx, world.goal, time);

  // 8. Player or Multi-Attempt Replay Ghosts
  if (state === 'REPLAY' && replay && replay.runs.length > 0) {
    const frameIdx = Math.floor(replay.frame);
    for (let i = 0; i < replay.runs.length; i++) {
      const run = replay.runs[i];
      const isWinner = i === replay.runs.length - 1;
      const sample = run[Math.min(frameIdx, run.length - 1)];
      if (sample && frameIdx < run.length) {
        ctx.save();
        ctx.globalAlpha = isWinner ? 1.0 : 0.42;
        drawMeatBoy(ctx, {
          x: sample.x,
          y: sample.y,
          width: player.width,
          height: player.height,
          facing: sample.f,
          scaleX: 1,
          scaleY: 1,
          onWall: 0,
        });
        ctx.restore();
      }
    }
  } else if (player.alive) {
    drawMeatBoy(ctx, player);
  }

  // 9. Blood & spark particles
  for (const p of particles) {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.maxLife));
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;

  // 10. Replay banner overlay on canvas
  if (state === 'REPLAY') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.52)';
    ctx.fillRect(0, 0, world.width, 34);
    ctx.fillStyle = '#f87171';
    ctx.font = 'bold 14px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      `● 同步回放所有 ${replay.runs.length} 次尝试 — 按 Space / 点击跳过`,
      world.width / 2,
      22
    );
  }

  ctx.restore();
}

function drawSolidTile(ctx, world, r, c, x, y, theme) {
  ctx.fillStyle = theme.tileFill;
  ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

  // Top surface highlight if tile above is open
  if (r > 0 && world.tiles[r - 1][c] !== TILE.SOLID) {
    ctx.fillStyle = theme.tileTop;
    ctx.fillRect(x, y, TILE_SIZE, 6);
  }
  ctx.strokeStyle = theme.tileStroke;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
}

function drawBounceTile(ctx, x, y, time) {
  ctx.fillStyle = '#334155';
  ctx.fillRect(x, y + 10, TILE_SIZE, TILE_SIZE - 10);
  const pulse = Math.sin(time * 8) * 1.5;
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(x + 2, y + 2 + pulse, TILE_SIZE - 4, 8);
  ctx.fillStyle = '#fecaca';
  ctx.fillRect(x + 6, y + 4 + pulse, TILE_SIZE - 12, 3);
}

function drawCrumbleTile(ctx, x, y, shaking) {
  ctx.fillStyle = shaking ? '#f59e0b' : '#b45309';
  ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);
  ctx.strokeStyle = '#451a03';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 5, y + 6);
  ctx.lineTo(x + 16, y + 16);
  ctx.lineTo(x + 26, y + 11);
  ctx.moveTo(x + 16, y + 16);
  ctx.lineTo(x + 12, y + 27);
  ctx.stroke();
}

function drawSpikeTile(ctx, ch, x, y) {
  ctx.fillStyle = '#cbd5e1';
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1.2;
  const count = 3;
  const step = TILE_SIZE / count;

  for (let i = 0; i < count; i++) {
    ctx.beginPath();
    if (ch === TILE.SPIKE_UP) {
      ctx.moveTo(x + i * step, y + TILE_SIZE);
      ctx.lineTo(x + (i + 0.5) * step, y + 11);
      ctx.lineTo(x + (i + 1) * step, y + TILE_SIZE);
    } else if (ch === TILE.SPIKE_DOWN) {
      ctx.moveTo(x + i * step, y);
      ctx.lineTo(x + (i + 0.5) * step, y + TILE_SIZE - 11);
      ctx.lineTo(x + (i + 1) * step, y);
    } else if (ch === TILE.SPIKE_LEFT) {
      ctx.moveTo(x + TILE_SIZE, y + i * step);
      ctx.lineTo(x + 11, y + (i + 0.5) * step);
      ctx.lineTo(x + TILE_SIZE, y + (i + 1) * step);
    } else if (ch === TILE.SPIKE_RIGHT) {
      ctx.moveTo(x, y + i * step);
      ctx.lineTo(x + TILE_SIZE - 11, y + (i + 0.5) * step);
      ctx.lineTo(x, y + (i + 1) * step);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function drawSawblade(ctx, saw) {
  ctx.save();
  ctx.translate(saw.x, saw.y);
  ctx.rotate(saw.angle);

  const teeth = 10;
  const outerR = saw.radius;
  const innerR = saw.radius * 0.72;

  ctx.fillStyle = '#e2e8f0';
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = (i * Math.PI) / teeth;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Bloodied tooth tips
  ctx.strokeStyle = 'rgba(220, 38, 38, 0.75)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, outerR * 0.86, 0, Math.PI * 2);
  ctx.stroke();

  // Hub
  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.arc(0, 0, saw.radius * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBandage(ctx, b, time) {
  const bob = Math.sin(time * 5) * 3;
  ctx.save();
  ctx.translate(b.x, b.y + bob);
  ctx.rotate(Math.sin(time * 3) * 0.15);

  ctx.fillStyle = '#f472b6';
  ctx.strokeStyle = '#9d174d';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-10, -6, 20, 12, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#fbcfe8';
  ctx.fillRect(-4, -5, 8, 10);
  ctx.restore();
}

function drawBandageGirl(ctx, goal, time) {
  const bob = Math.sin(time * 4) * 1.8;
  const cx = goal.x + goal.width / 2;
  const cy = goal.y + goal.height / 2 + bob;

  ctx.save();
  ctx.translate(cx, cy);

  // Floating heart above Bandage Girl
  const heartY = -20 + Math.sin(time * 6) * 2.5;
  ctx.fillStyle = '#f43f5e';
  ctx.beginPath();
  ctx.arc(-3, heartY, 3.2, 0, Math.PI * 2);
  ctx.arc(3, heartY, 3.2, 0, Math.PI * 2);
  ctx.moveTo(-6, heartY + 1);
  ctx.lineTo(0, heartY + 7);
  ctx.lineTo(6, heartY + 1);
  ctx.fill();

  // Body (pink wrapped square)
  ctx.fillStyle = '#f472b6';
  ctx.strokeStyle = '#831843';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-10, -11, 20, 22, 4);
  ctx.fill();
  ctx.stroke();

  // Bandage stripes
  ctx.strokeStyle = '#fbcfe8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-9, -2);
  ctx.lineTo(9, 2);
  ctx.moveTo(-9, 5);
  ctx.lineTo(9, 7);
  ctx.stroke();

  // Bow on top
  ctx.fillStyle = '#ec4899';
  ctx.beginPath();
  ctx.ellipse(-5, -13, 4.5, 3, -0.3, 0, Math.PI * 2);
  ctx.ellipse(5, -13, 4.5, 3, 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(-5, -6, 3, 4);
  ctx.fillRect(2, -6, 3, 4);
  ctx.restore();
}

function drawMeatBoy(ctx, p) {
  const cx = p.x + p.width / 2;
  const bottomY = p.y + p.height;

  ctx.save();
  ctx.translate(cx, bottomY);
  ctx.scale(p.scaleX, p.scaleY);

  // Main meat cube body
  ctx.fillStyle = '#dc2626';
  ctx.strokeStyle = '#7f1d1d';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-p.width / 2, -p.height, p.width, p.height, 4);
  ctx.fill();
  ctx.stroke();

  // Top specular shine
  ctx.fillStyle = 'rgba(254, 202, 202, 0.35)';
  ctx.fillRect(-p.width / 2 + 3, -p.height + 3, p.width - 6, 4);

  // Determined eyes shifted toward facing direction
  const look = p.facing * 2;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-6 + look, -p.height + 7, 4.5, 5.5);
  ctx.fillRect(2 + look, -p.height + 7, 4.5, 5.5);

  ctx.fillStyle = '#111827';
  ctx.fillRect(-4.5 + look * 1.2, -p.height + 8.5, 2.2, 3);
  ctx.fillRect(3.5 + look * 1.2, -p.height + 8.5, 2.2, 3);

  // Gritted smile
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-4 + look, -p.height + 15, 8, 3);
  ctx.fillStyle = '#7f1d1d';
  ctx.fillRect(-1 + look, -p.height + 15, 1.5, 3);
  ctx.fillRect(2 + look, -p.height + 15, 1.5, 3);

  ctx.restore();
}
