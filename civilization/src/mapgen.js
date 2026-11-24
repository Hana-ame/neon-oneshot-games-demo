/**
 * Deterministic Procedural Hex World Generator
 * 基于 Mulberry32 PRNG 与多倍频分形值噪声的可复现世界地图生成器
 */

import { TERRAIN, RESOURCES } from './constants.js';
import { offsetToAxial, hexKey, hexNeighbors, hexDistance } from './hex.js';

export function createRng(seed) {
  let a = (seed >>> 0) || 123456789;
  return function next() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2D(ix, iy, seed) {
  let h = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise2D(x, y, seed) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smoothstep(x - ix);
  const fy = smoothstep(y - iy);
  const v00 = hash2D(ix, iy, seed);
  const v10 = hash2D(ix + 1, iy, seed);
  const v01 = hash2D(ix, iy + 1, seed);
  const v11 = hash2D(ix + 1, iy + 1, seed);
  const nx0 = v00 + (v10 - v00) * fx;
  const nx1 = v01 + (v11 - v01) * fx;
  return nx0 + (nx1 - nx0) * fy;
}

function fbm(x, y, seed, octaves = 3) {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    value += amp * valueNoise2D(x * freq, y * freq, seed + i * 1013);
    norm += amp;
    amp *= 0.5;
    freq *= 2.02;
  }
  return value / norm;
}

/**
 * Generate a hex world map with guaranteed habitable land & civilization start positions
 */
export function generateMap({ width = 22, height = 14, seed = 42, civCount = 4 } = {}) {
  const rng = createRng(seed);
  const tiles = new Map();
  const tileList = [];

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const { q, r } = offsetToAxial(col, row);
      const nx = col / width;
      const ny = row / height;

      // Edge falloff to form continent/archipelago surrounded by ocean
      const dx = (nx - 0.5) * 2;
      const dy = (ny - 0.5) * 2;
      const edgeDist = Math.max(Math.abs(dx), Math.abs(dy));
      const falloff = Math.max(0, (edgeDist - 0.72) / 0.28);

      const elev = fbm(nx * 4.2, ny * 3.4, seed, 4) - falloff * 0.52;
      const moist = fbm(nx * 3.8 + 19.3, ny * 3.8 + 7.1, seed + 555, 3);
      const lat = Math.abs(ny - 0.5) * 2; // 0 at equator, 1 at poles

      let terrain = 'ocean';
      if (elev > 0.34) {
        if (elev > 0.72) {
          terrain = 'mountain';
        } else if (elev > 0.60) {
          terrain = 'hills';
        } else if (lat > 0.78) {
          terrain = 'tundra';
        } else if (moist > 0.58) {
          terrain = 'forest';
        } else if (moist < 0.34 && lat < 0.55) {
          terrain = 'desert';
        } else if (moist >= 0.44) {
          terrain = 'grassland';
        } else {
          terrain = 'plains';
        }
      }

      const tile = {
        q,
        r,
        col,
        row,
        key: hexKey(q, r),
        terrain,
        resource: null,
        improvement: null,
        ownerId: null,
        cityId: null,
      };
      tiles.set(tile.key, tile);
      tileList.push(tile);
    }
  }

  // Convert ocean tiles adjacent to land into coast
  for (const tile of tileList) {
    if (tile.terrain !== 'ocean') continue;
    const hasLandNeighbor = hexNeighbors(tile.q, tile.r).some(n => {
      const nt = tiles.get(hexKey(n.q, n.r));
      return nt && nt.terrain !== 'ocean' && nt.terrain !== 'coast';
    });
    if (hasLandNeighbor) {
      tile.terrain = 'coast';
    }
  }

  // Scatter resources
  const resourceKeys = Object.keys(RESOURCES);
  for (const tile of tileList) {
    if (tile.terrain === 'ocean' || tile.terrain === 'mountain') continue;
    if (rng() < 0.14) {
      const candidates = resourceKeys.filter(k => RESOURCES[k].terrains.includes(tile.terrain));
      if (candidates.length > 0) {
        tile.resource = candidates[Math.floor(rng() * candidates.length)];
      }
    }
  }

  // Pick well-spaced habitable starting positions
  const startPositions = pickStartPositions(tiles, tileList, civCount, rng);

  return { width, height, seed, tiles, tileList, startPositions };
}

function pickStartPositions(tiles, tileList, civCount, rng) {
  const scoreTile = (t) => {
    if (!TERRAIN[t.terrain].passable) return -999;
    if (t.terrain === 'desert' || t.terrain === 'tundra') return -50;
    let score = t.terrain === 'grassland' ? 6 : t.terrain === 'plains' ? 5 : 2;
    let landNeighbors = 0;
    for (const n of hexNeighbors(t.q, t.r)) {
      const nt = tiles.get(hexKey(n.q, n.r));
      if (!nt) continue;
      if (TERRAIN[nt.terrain].passable) {
        landNeighbors++;
        score += TERRAIN[nt.terrain].food + TERRAIN[nt.terrain].prod;
      }
      if (nt.resource) score += 4;
    }
    if (landNeighbors < 3) return -100;
    return score + rng() * 2;
  };

  const candidates = tileList
    .map(t => ({ tile: t, score: scoreTile(t) }))
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score);

  const chosen = [];
  for (let minDist = 7; minDist >= 3 && chosen.length < civCount; minDist--) {
    for (const c of candidates) {
      if (chosen.length >= civCount) break;
      if (chosen.every(p => hexDistance(p, c.tile) >= minDist)) {
        chosen.push({ q: c.tile.q, r: c.tile.r });
      }
    }
  }

  // Fallback if map was unusually watery: terraform interior hexes
  while (chosen.length < civCount) {
    const fallback = tileList[Math.floor(tileList.length * (0.25 + 0.15 * chosen.length))] || tileList[0];
    fallback.terrain = 'grassland';
    for (const n of hexNeighbors(fallback.q, fallback.r)) {
      const nt = tiles.get(hexKey(n.q, n.r));
      if (nt && !TERRAIN[nt.terrain].passable) nt.terrain = 'plains';
    }
    chosen.push({ q: fallback.q, r: fallback.r });
  }

  return chosen;
}
