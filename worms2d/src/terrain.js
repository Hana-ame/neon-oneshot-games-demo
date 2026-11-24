// Destructible 2D pixel-mask terrain engine (DOM-independent for Node tests + optional Canvas cache)

import { WORLD, THEMES } from './constants.js';

export const CELL_EMPTY = 0;
export const CELL_DIRT = 1;
export const CELL_GRASS = 2;
export const CELL_SCORCH = 3;

// Deterministic PRNG (Mulberry32) so maps are reproducible in tests and replays
export function createRng(seed = 1337) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Terrain {
  constructor(width = WORLD.WIDTH, height = WORLD.HEIGHT, themeId = 'emerald', seed = Date.now()) {
    this.width = width;
    this.height = height;
    this.themeId = themeId;
    this.theme = THEMES[themeId] || THEMES.emerald;
    this.seed = seed >>> 0;
    this.mask = new Uint8Array(width * height);
    this.canvas = null;
    this.ctx = null;
    this.dirty = true;
    this.generate(this.seed);
  }

  generate(seed = this.seed) {
    this.seed = seed >>> 0;
    const rng = createRng(this.seed);
    this.mask.fill(CELL_EMPTY);

    // Multi-octave harmonic island profile with cliffs and valleys
    const phases = Array.from({ length: 6 }, () => rng() * Math.PI * 2);
    const baseHeight = this.height * 0.56;
    const marginLeft = 90;
    const marginRight = this.width - 90;

    for (let x = 0; x < this.width; x++) {
      // Smooth island envelope so left/right edges drop into the sea
      const nx = x / this.width;
      const edgeFade = Math.sin(Math.min(1, Math.max(0, (x - marginLeft) / (marginRight - marginLeft))) * Math.PI);
      const envelope = Math.pow(Math.max(0, edgeFade), 0.42);

      if (envelope <= 0.04) continue;

      const wave =
        Math.sin(nx * Math.PI * 3 + phases[0]) * 78 +
        Math.sin(nx * Math.PI * 7 + phases[1]) * 42 +
        Math.sin(nx * Math.PI * 13 + phases[2]) * 20 +
        Math.cos(nx * Math.PI * 23 + phases[3]) * 9;

      // Occasional dramatic central chasm or plateau
      const plateau = Math.sin(nx * Math.PI * 2 + phases[4]) * 38;
      const rawSurface = baseHeight - (wave + plateau) * envelope;
      const surfaceY = Math.max(175, Math.min(this.height - 68, Math.floor(rawSurface)));

      // Carve a few dramatic cliffs/islands near the middle
      const seaDrop = this.height - 20;
      for (let y = surfaceY; y < seaDrop; y++) {
        const depth = y - surfaceY;
        const idx = y * this.width + x;
        this.mask[idx] = depth < 9 ? CELL_GRASS : CELL_DIRT;
      }
    }

    // Carve 2-3 decorative tunnels/caves inside deeper hills for classic Worms feel
    const caveCount = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < caveCount; i++) {
      const cx = Math.floor(280 + rng() * (this.width - 560));
      const sy = this.getSurfaceY(cx);
      if (sy > 0 && sy < this.height - 210) {
        const cy = sy + 95 + Math.floor(rng() * 55);
        const rx = 44 + Math.floor(rng() * 34);
        const ry = 26 + Math.floor(rng() * 16);
        this.carveEllipse(cx, cy, rx, ry, false);
      }
    }

    this.dirty = true;
    this.rebuildCanvas();
  }

  carveEllipse(cx, cy, rx, ry, scorch = false) {
    const minX = Math.max(0, Math.floor(cx - rx - 4));
    const maxX = Math.min(this.width - 1, Math.ceil(cx + rx + 4));
    const minY = Math.max(0, Math.floor(cy - ry - 4));
    const maxY = Math.min(this.height - 1, Math.ceil(cy + ry + 4));

    for (let y = minY; y <= maxY; y++) {
      const dy = (y - cy) / ry;
      for (let x = minX; x <= maxX; x++) {
        const dx = (x - cx) / rx;
        const d2 = dx * dx + dy * dy;
        const idx = y * this.width + x;
        if (d2 <= 1.0) {
          this.mask[idx] = CELL_EMPTY;
        } else if (scorch && d2 <= 1.25 && this.mask[idx] !== CELL_EMPTY) {
          this.mask[idx] = CELL_SCORCH;
        }
      }
    }
  }

  isSolid(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || ix >= this.width || iy < 0 || iy >= this.height) {
      return false;
    }
    return this.mask[iy * this.width + ix] !== CELL_EMPTY;
  }

  // Returns the highest solid Y at column x, or -1 if none
  getSurfaceY(x, startY = 0) {
    const ix = Math.floor(x);
    if (ix < 0 || ix >= this.width) return -1;
    const sy = Math.max(0, Math.floor(startY));
    for (let y = sy; y < this.height; y++) {
      if (this.mask[y * this.width + ix] !== CELL_EMPTY) {
        return y;
      }
    }
    return -1;
  }

  // Carve a circular crater and scorch its rim; returns count of destroyed pixels
  carveCrater(cx, cy, radius) {
    const r = Math.max(1, radius);
    const scorchR = r + 5;
    const r2 = r * r;
    const scorchR2 = scorchR * scorchR;

    const minX = Math.max(0, Math.floor(cx - scorchR));
    const maxX = Math.min(this.width - 1, Math.ceil(cx + scorchR));
    const minY = Math.max(0, Math.floor(cy - scorchR));
    const maxY = Math.min(this.height - 1, Math.ceil(cy + scorchR));

    let destroyed = 0;

    for (let y = minY; y <= maxY; y++) {
      const dy = y - cy;
      const dy2 = dy * dy;
      const rowOffset = y * this.width;
      for (let x = minX; x <= maxX; x++) {
        const dx = x - cx;
        const d2 = dx * dx + dy2;
        const idx = rowOffset + x;
        if (d2 <= r2) {
          if (this.mask[idx] !== CELL_EMPTY) {
            this.mask[idx] = CELL_EMPTY;
            destroyed++;
          }
        } else if (d2 <= scorchR2 && this.mask[idx] !== CELL_EMPTY) {
          this.mask[idx] = CELL_SCORCH;
        }
      }
    }

    if (this.ctx) {
      this.patchCanvasRegion(minX, minY, maxX, maxY);
    } else {
      this.dirty = true;
    }

    return destroyed;
  }

  // Compute approximate surface normal around (x, y) for bouncing projectiles
  getNormal(x, y, sampleRadius = 5) {
    let nx = 0;
    let ny = 0;
    for (let dy = -sampleRadius; dy <= sampleRadius; dy++) {
      for (let dx = -sampleRadius; dx <= sampleRadius; dx++) {
        if (dx === 0 && dy === 0) continue;
        if (this.isSolid(x + dx, y + dy)) {
          nx -= dx;
          ny -= dy;
        }
      }
    }
    const len = Math.hypot(nx, ny);
    if (len < 0.001) return { x: 0, y: -1 };
    return { x: nx / len, y: ny / len };
  }

  // Find valid spawn points well-spaced across the island
  findSpawnPositions(count, waterLevel = WORLD.INITIAL_WATER_LEVEL) {
    const candidates = [];
    const step = 28;
    for (let x = 150; x < this.width - 150; x += step) {
      const sy = this.getSurfaceY(x, 40);
      if (sy > 90 && sy < waterLevel - 45) {
        // Check local flatness so worms don't spawn on 1px spikes
        const sl = this.getSurfaceY(x - 10, 40);
        const sr = this.getSurfaceY(x + 10, 40);
        if (sl > 0 && sr > 0 && Math.abs(sl - sy) < 18 && Math.abs(sr - sy) < 18) {
          candidates.push({ x, y: sy - 14 });
        }
      }
    }

    if (candidates.length <= count) {
      return candidates;
    }

    // Evenly pick across the width for balanced team distribution
    const chosen = [];
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(((i + 0.5) / count) * candidates.length);
      chosen.push(candidates[Math.min(candidates.length - 1, idx)]);
    }
    return chosen;
  }

  // Build offscreen canvas cache in browser environments
  rebuildCanvas() {
    if (typeof document === 'undefined') return;
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.width;
      this.canvas.height = this.height;
      this.ctx = this.canvas.getContext('2d');
    }
    this.patchCanvasRegion(0, 0, this.width - 1, this.height - 1);
    this.dirty = false;
  }

  patchCanvasRegion(minX, minY, maxX, maxY) {
    if (!this.ctx) return;
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    if (w <= 0 || h <= 0) return;

    const img = this.ctx.createImageData(w, h);
    const data = img.data;
    const grassTop = hexToRgb(this.theme.grassTop);
    const grassMid = hexToRgb(this.theme.grassMid);
    const dirtLight = hexToRgb(this.theme.dirtLight);
    const dirtDark = hexToRgb(this.theme.dirtDark);
    const rock = hexToRgb(this.theme.rockColor);
    const scorch = hexToRgb(this.theme.scorchColor);

    for (let y = minY; y <= maxY; y++) {
      const rowOffset = y * this.width;
      const localY = (y - minY) * w;
      for (let x = minX; x <= maxX; x++) {
        const cell = this.mask[rowOffset + x];
        const p = (localY + (x - minX)) * 4;
        if (cell === CELL_EMPTY) {
          data[p + 3] = 0;
          continue;
        }

        // Procedural strata & grain texture
        const grain = ((x * 374761393 + y * 668265263) ^ (x * y)) & 31;
        const strata = Math.sin((y + Math.sin(x * 0.025) * 14) * 0.14);

        let c = dirtLight;
        if (cell === CELL_GRASS) {
          c = grain > 18 ? grassTop : grassMid;
        } else if (cell === CELL_SCORCH) {
          c = scorch;
        } else {
          if (strata > 0.35) c = dirtLight;
          else if (strata < -0.45) c = rock;
          else c = dirtDark;
        }

        const shade = (grain - 16) * 0.65;
        data[p] = clampByte(c.r + shade);
        data[p + 1] = clampByte(c.g + shade);
        data[p + 2] = clampByte(c.b + shade);
        data[p + 3] = 255;
      }
    }

    this.ctx.putImageData(img, minX, minY);
  }
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const n = parseInt(clean, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function clampByte(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}
