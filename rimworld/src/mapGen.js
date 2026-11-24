/**
 * Deterministic seeded PRNG and procedural terrain/resource map generator.
 */

import { MAP_WIDTH, MAP_HEIGHT, TERRAIN, NATURAL_OBJECTS } from './constants.js';

export function createRng(seed = 1337) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Simple 2D value noise with smoothstep interpolation for organic biomes.
 */
function createNoise2D(rng, gridSize = 16) {
  const table = new Float32Array(gridSize * gridSize);
  for (let i = 0; i < table.length; i++) table[i] = rng();

  const sample = (gx, gy) => {
    const x = ((gx % gridSize) + gridSize) % gridSize;
    const y = ((gy % gridSize) + gridSize) % gridSize;
    return table[y * gridSize + x];
  };

  return (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);

    const a = sample(x0, y0);
    const b = sample(x0 + 1, y0);
    const c = sample(x0, y0 + 1);
    const d = sample(x0 + 1, y0 + 1);

    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
}

export function generateMap(width = MAP_WIDTH, height = MAP_HEIGHT, seed = 2026) {
  const rng = createRng(seed);
  const elevNoise = createNoise2D(rng, 16);
  const moistNoise = createNoise2D(rng, 16);
  const detailNoise = createNoise2D(rng, 24);

  const tiles = new Array(width * height);
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const distCenter = Math.hypot(x - cx, y - cy);

      let elev =
        elevNoise(x * 0.09, y * 0.09) * 0.65 +
        detailNoise(x * 0.22, y * 0.22) * 0.35;
      const moist = moistNoise(x * 0.1, y * 0.1);

      // Keep landing zone near center flat and fertile/walkable
      if (distCenter < 7.5) {
        elev = 0.48 + (elev - 0.5) * 0.2;
      }

      let terrain = TERRAIN.GRASS;
      let natural = null;

      if (elev < 0.22) {
        terrain = TERRAIN.WATER_DEEP;
      } else if (elev < 0.29) {
        terrain = TERRAIN.WATER_SHALLOW;
      } else if (elev < 0.34) {
        terrain = TERRAIN.SAND;
      } else if (elev > 0.72) {
        terrain = TERRAIN.ROCK_FLOOR;
        const oreRoll = rng();
        if (oreRoll < 0.16) {
          natural = NATURAL_OBJECTS.STEEL_ORE;
        } else if (oreRoll < 0.19) {
          natural = NATURAL_OBJECTS.GOLD_ORE;
        } else if (elev > 0.75) {
          natural = NATURAL_OBJECTS.ROCK_WALL;
        }
      } else if (moist > 0.62) {
        terrain = TERRAIN.FERTILE;
      } else if (moist < 0.33) {
        terrain = TERRAIN.DIRT;
      } else {
        terrain = TERRAIN.GRASS;
      }

      // Scatter trees and berry bushes outside the immediate crash clearing
      if (!natural && distCenter > 4.2) {
        if (terrain === TERRAIN.GRASS || terrain === TERRAIN.FERTILE) {
          const flora = rng();
          if (flora < 0.14) {
            natural = NATURAL_OBJECTS.TREE;
          } else if (flora < 0.175) {
            natural = NATURAL_OBJECTS.BERRY_BUSH;
          }
        } else if (terrain === TERRAIN.DIRT && rng() < 0.04) {
          natural = NATURAL_OBJECTS.TREE;
        }
      }

      tiles[idx] = {
        x,
        y,
        terrain,
        natural,
        building: null,      // { type, hp, maxHp, built, progress, workRequired, cooldown }
        zone: null,          // 'stockpile' | 'growing' | null
        crop: null,          // { progress: 0..100, type: 'rice' }
        order: null,         // 'chop' | 'mine' | 'harvest' | null
        variant: rng() > 0.5 ? 1 : 0,
      };
    }
  }

  // Guarantee accessible steel and berry resources near starting zone for smooth gameplay
  const ensurePatch = (ox, oy, naturalType, terrainType) => {
    const tx = Math.max(2, Math.min(width - 3, cx + ox));
    const ty = Math.max(2, Math.min(height - 3, cy + oy));
    const t = tiles[ty * width + tx];
    t.terrain = terrainType;
    t.natural = naturalType;
  };

  ensurePatch(-8, -5, NATURAL_OBJECTS.STEEL_ORE, TERRAIN.ROCK_FLOOR);
  ensurePatch(-8, -4, NATURAL_OBJECTS.STEEL_ORE, TERRAIN.ROCK_FLOOR);
  ensurePatch(-7, -5, NATURAL_OBJECTS.ROCK_WALL, TERRAIN.ROCK_FLOOR);
  ensurePatch(7, 4, NATURAL_OBJECTS.BERRY_BUSH, TERRAIN.FERTILE);
  ensurePatch(8, 4, NATURAL_OBJECTS.BERRY_BUSH, TERRAIN.FERTILE);
  ensurePatch(7, 5, NATURAL_OBJECTS.TREE, TERRAIN.GRASS);
  ensurePatch(-6, 6, NATURAL_OBJECTS.TREE, TERRAIN.GRASS);
  ensurePatch(-5, 6, NATURAL_OBJECTS.TREE, TERRAIN.GRASS);

  // Place default initial stockpile zone near center
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -2; dx <= 0; dx++) {
      const t = tiles[(cy + dy) * width + (cx + dx)];
      t.natural = null;
      t.zone = 'stockpile';
    }
  }

  return {
    width,
    height,
    seed,
    tiles,
    spawnPoint: { x: cx, y: cy },
  };
}
