import { BLOCK_DEFS } from '../core/constants.js';
import { ATLAS_COLS, ATLAS_ROWS } from '../world/mesher.js';

const TILE_SIZE = 16;

function pixelHash(x, y, salt) {
  let n = Math.imul(x + 17, 374761393) + Math.imul(y + 31, 668265263) + Math.imul(salt, 1442695041);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function rgb(r, g, b, a = 1) {
  const cr = Math.max(0, Math.min(255, Math.round(r)));
  const cg = Math.max(0, Math.min(255, Math.round(g)));
  const cb = Math.max(0, Math.min(255, Math.round(b)));
  return a >= 1 ? `rgb(${cr},${cg},${cb})` : `rgba(${cr},${cg},${cb},${a})`;
}

function drawTile(ctx, tileIdx, drawPixel) {
  const col = tileIdx % ATLAS_COLS;
  const row = Math.floor(tileIdx / ATLAS_COLS);
  const ox = col * TILE_SIZE;
  const oy = row * TILE_SIZE;
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      ctx.fillStyle = drawPixel(x, y);
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  }
}

/**
 * Generates a crisp 128x64 procedural pixel-art texture atlas on an offscreen Canvas.
 */
export function createTextureAtlasCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * TILE_SIZE;
  canvas.height = ATLAS_ROWS * TILE_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 0: Grass Top
  drawTile(ctx, 0, (x, y) => {
    const n = (pixelHash(x, y, 1) - 0.5) * 34;
    return rgb(92 + n, 168 + n * 1.1, 56 + n * 0.6);
  });

  // 1: Grass Side
  drawTile(ctx, 1, (x, y) => {
    const overhang = 3 + Math.floor(pixelHash(x, 0, 2) * 3);
    const n = (pixelHash(x, y, 3) - 0.5) * 28;
    if (y < overhang) {
      return rgb(90 + n, 165 + n, 54 + n * 0.6);
    }
    return rgb(134 + n, 92 + n * 0.8, 56 + n * 0.6);
  });

  // 2: Dirt
  drawTile(ctx, 2, (x, y) => {
    const n = (pixelHash(x, y, 4) - 0.5) * 32;
    const pebble = pixelHash(x, y, 5) > 0.9 ? -22 : 0;
    return rgb(136 + n + pebble, 94 + n * 0.8 + pebble, 58 + n * 0.6 + pebble);
  });

  // 3: Stone
  drawTile(ctx, 3, (x, y) => {
    const n = (pixelHash(x, y, 6) - 0.5) * 26;
    const streak = pixelHash(x >> 1, y, 7) > 0.78 ? -14 : 0;
    const v = 132 + n + streak;
    return rgb(v, v + 2, v + 5);
  });

  // 4: Cobblestone
  drawTile(ctx, 4, (x, y) => {
    const mortar = y % 4 === 0 || (x + Math.floor(y / 4) * 3) % 5 === 0;
    const n = (pixelHash(x, y, 8) - 0.5) * 26;
    const v = mortar ? 74 + n * 0.5 : 124 + n;
    return rgb(v, v + 2, v + 4);
  });

  // 5: Oak Log Side
  drawTile(ctx, 5, (x, y) => {
    const ridge = (x % 3 === 0 ? -18 : 6) + (pixelHash(x, y, 9) - 0.5) * 22;
    return rgb(106 + ridge, 74 + ridge * 0.8, 44 + ridge * 0.6);
  });

  // 6: Oak Log Top
  drawTile(ctx, 6, (x, y) => {
    const d = Math.hypot(x - 7.5, y - 7.5);
    if (d > 6.4) {
      const n = (pixelHash(x, y, 10) - 0.5) * 18;
      return rgb(92 + n, 64 + n * 0.8, 38 + n * 0.6);
    }
    const ring = Math.floor(d) % 2 === 0 ? 12 : -10;
    const n = (pixelHash(x, y, 11) - 0.5) * 14;
    return rgb(168 + ring + n, 132 + ring * 0.8 + n, 82 + ring * 0.6 + n);
  });

  // 7: Oak Leaves
  drawTile(ctx, 7, (x, y) => {
    const r = pixelHash(x, y, 12);
    if (r < 0.22) return rgb(34, 82, 26);
    const n = (r - 0.5) * 38;
    return rgb(58 + n * 0.7, 134 + n, 40 + n * 0.6);
  });

  // 8: Sand
  drawTile(ctx, 8, (x, y) => {
    const n = (pixelHash(x, y, 13) - 0.5) * 22;
    return rgb(224 + n, 208 + n * 0.9, 148 + n * 0.8);
  });

  // 9: Water (semi-transparent)
  drawTile(ctx, 9, (x, y) => {
    const wave = Math.sin((x + y * 0.5) * 0.9) * 12;
    const n = (pixelHash(x, y, 14) - 0.5) * 16;
    return rgb(42 + wave + n, 118 + wave + n, 214 + n * 0.5, 0.74);
  });

  // 10: Oak Planks
  drawTile(ctx, 10, (x, y) => {
    const seam = y % 4 === 0 || (x === 0 && (y >> 2) % 2 === 0) || (x === 8 && (y >> 2) % 2 === 1);
    const n = (pixelHash(x, y, 15) - 0.5) * 16;
    if (seam) return rgb(118 + n, 84 + n * 0.8, 46 + n * 0.6);
    return rgb(184 + n, 142 + n * 0.85, 86 + n * 0.65);
  });

  // 11: Bricks
  drawTile(ctx, 11, (x, y) => {
    const row = Math.floor(y / 4);
    const offset = (row % 2) * 4;
    const mortar = y % 4 === 0 || (x + offset) % 8 === 0;
    const n = (pixelHash(x, y, 16) - 0.5) * 22;
    if (mortar) return rgb(196 + n * 0.4, 190 + n * 0.4, 180 + n * 0.4);
    return rgb(164 + n, 72 + n * 0.6, 56 + n * 0.5);
  });

  // 12: Glass (translucent center + crisp frame)
  drawTile(ctx, 12, (x, y) => {
    const border = x === 0 || x === 15 || y === 0 || y === 15;
    const glint = (x === 3 && y === 3) || (x === 4 && y === 2) || (x === 11 && y === 12);
    if (border) return rgb(198, 232, 245, 0.95);
    if (glint) return rgb(255, 255, 255, 0.85);
    return rgb(175, 224, 245, 0.28);
  });

  // 13: Snow
  drawTile(ctx, 13, (x, y) => {
    const n = (pixelHash(x, y, 17) - 0.5) * 14;
    return rgb(238 + n, 245 + n, 252 + n);
  });

  // 14: Bedrock
  drawTile(ctx, 14, (x, y) => {
    const r = pixelHash(x, y, 18);
    const v = r > 0.65 ? 92 : r < 0.3 ? 30 : 58;
    return rgb(v, v, v + 2);
  });

  // 15: Coal Ore
  drawTile(ctx, 15, (x, y) => {
    const speck = pixelHash(x >> 1, y >> 1, 19) > 0.76 && pixelHash(x, y, 20) > 0.35;
    if (speck) return rgb(34, 36, 40);
    const n = (pixelHash(x, y, 21) - 0.5) * 24;
    return rgb(130 + n, 132 + n, 136 + n);
  });

  // 16: Gold Ore
  drawTile(ctx, 16, (x, y) => {
    const speck = pixelHash(x >> 1, y >> 1, 22) > 0.78 && pixelHash(x, y, 23) > 0.35;
    if (speck) return rgb(242, 202, 58);
    const n = (pixelHash(x, y, 24) - 0.5) * 24;
    return rgb(130 + n, 132 + n, 136 + n);
  });

  // 17: Glowstone
  drawTile(ctx, 17, (x, y) => {
    const r = pixelHash(x, y, 25);
    if (r < 0.2) return rgb(158, 114, 46);
    if (r > 0.72) return rgb(255, 244, 178);
    return rgb(242, 204, 98);
  });

  return canvas;
}

/**
 * Extracts a crisp 32x32 data URL icon for a given blockId from the texture atlas.
 */
export function buildBlockIcons(atlasCanvas) {
  const icons = {};
  const tmp = document.createElement('canvas');
  tmp.width = 32;
  tmp.height = 32;
  const tctx = tmp.getContext('2d');
  tctx.imageSmoothingEnabled = false;

  for (const key of Object.keys(BLOCK_DEFS)) {
    const def = BLOCK_DEFS[key];
    if (!def || def.id === 0) continue;
    const tileIdx = def.tiles[2]; // side view is most iconic
    const col = tileIdx % ATLAS_COLS;
    const row = Math.floor(tileIdx / ATLAS_COLS);
    tctx.clearRect(0, 0, 32, 32);
    tctx.drawImage(
      atlasCanvas,
      col * TILE_SIZE,
      row * TILE_SIZE,
      TILE_SIZE,
      TILE_SIZE,
      0,
      0,
      32,
      32
    );
    icons[def.id] = tmp.toDataURL();
  }
  return icons;
}
