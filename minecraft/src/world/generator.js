import { CHUNK_SIZE, CHUNK_HEIGHT, WATER_LEVEL, BLOCK } from '../core/constants.js';
import { SeededNoise } from '../core/noise.js';
import { clamp } from '../core/math.js';

export const BIOME = {
  PLAINS: 'plains',
  FOREST: 'forest',
  DESERT: 'desert',
  SNOW: 'snow',
};

export class TerrainGenerator {
  constructor(seed = 2026) {
    this.noise = new SeededNoise(seed);
    this.biomeNoise = new SeededNoise(this.noise.seed ^ 0x9e3779b9);
    this.caveNoise = new SeededNoise(this.noise.seed ^ 0x85ebca6b);
    this.seed = this.noise.seed;
  }

  getBiome(wx, wz) {
    const temp = this.biomeNoise.fbm2D(wx * 0.008, wz * 0.008, 3);
    const moist = this.biomeNoise.fbm2D((wx + 500) * 0.008, (wz - 500) * 0.008, 3);
    if (temp > 0.24 && moist < 0.05) return BIOME.DESERT;
    if (temp < -0.22) return BIOME.SNOW;
    if (moist > 0.08) return BIOME.FOREST;
    return BIOME.PLAINS;
  }

  getHeight(wx, wz, biome) {
    const continental = this.noise.fbm2D(wx * 0.012, wz * 0.012, 4, 2.0, 0.5);
    const detail = this.noise.fbm2D(wx * 0.045, wz * 0.045, 2, 2.0, 0.5);
    let base = 27 + continental * 16 + detail * 4;
    if (biome === BIOME.DESERT) {
      base = 25 + continental * 8 + detail * 2;
    } else if (biome === BIOME.SNOW) {
      base = 30 + continental * 18 + detail * 5;
    }
    return clamp(Math.floor(base), 6, CHUNK_HEIGHT - 12);
  }

  generateChunk(chunk) {
    const ox = chunk.cx * CHUNK_SIZE;
    const oz = chunk.cz * CHUNK_SIZE;

    const heights = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
    const biomes = new Array(CHUNK_SIZE * CHUNK_SIZE);

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = ox + lx;
        const wz = oz + lz;
        const idx2d = lz * CHUNK_SIZE + lx;
        const biome = this.getBiome(wx, wz);
        const h = this.getHeight(wx, wz, biome);
        biomes[idx2d] = biome;
        heights[idx2d] = h;

        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          let b = BLOCK.AIR;

          if (y === 0) {
            b = BLOCK.BEDROCK;
          } else if (y <= h) {
            // Simple underground caves
            const isCave =
              y > 4 &&
              y < h - 4 &&
              this.caveNoise.noise3D(wx * 0.08, y * 0.1, wz * 0.08) > 0.42;

            if (isCave) {
              b = y <= WATER_LEVEL - 10 ? BLOCK.WATER : BLOCK.AIR;
            } else if (y === h) {
              if (h <= WATER_LEVEL + 1) {
                b = BLOCK.SAND;
              } else if (biome === BIOME.DESERT) {
                b = BLOCK.SAND;
              } else if (biome === BIOME.SNOW || h > 41) {
                b = BLOCK.SNOW;
              } else {
                b = BLOCK.GRASS;
              }
            } else if (y >= h - 3) {
              b = biome === BIOME.DESERT || h <= WATER_LEVEL + 1 ? BLOCK.SAND : BLOCK.DIRT;
            } else {
              // Stone + ore veins
              const oreVal = this.caveNoise.noise3D(wx * 0.23, y * 0.23, wz * 0.23);
              if (y < 14 && oreVal > 0.56) {
                b = BLOCK.GOLD_ORE;
              } else if (y < 28 && oreVal < -0.48) {
                b = BLOCK.COAL_ORE;
              } else {
                b = BLOCK.STONE;
              }
            }
          } else if (y <= WATER_LEVEL) {
            b = BLOCK.WATER;
          }

          if (b !== BLOCK.AIR) {
            chunk.setBlock(lx, y, lz, b, false);
          }
        }
      }
    }

    // Place trees safely inside chunk interior [2..CHUNK_SIZE-3] so canopies stay within chunk bounds
    for (let lz = 2; lz < CHUNK_SIZE - 2; lz++) {
      for (let lx = 2; lx < CHUNK_SIZE - 2; lx++) {
        const idx2d = lz * CHUNK_SIZE + lx;
        const biome = biomes[idx2d];
        const h = heights[idx2d];
        if (h <= WATER_LEVEL + 1 || h >= CHUNK_HEIGHT - 8) continue;
        if (biome === BIOME.DESERT) continue;

        const wx = ox + lx;
        const wz = oz + lz;
        const treeChance = biome === BIOME.FOREST ? 0.055 : biome === BIOME.PLAINS ? 0.014 : 0.01;
        const r = this.noise.hash2D(wx, wz);
        if (r < treeChance) {
          this.placeTree(chunk, lx, h + 1, lz, r);
        }
      }
    }

    chunk.dirty = true;
    chunk.modified = false;
    return chunk;
  }

  placeTree(chunk, lx, baseY, lz, randVal) {
    const trunkHeight = 4 + (Math.floor(randVal * 1000) % 2);
    for (let dy = 0; dy < trunkHeight; dy++) {
      chunk.setBlock(lx, baseY + dy, lz, BLOCK.WOOD_OAK, false);
    }
    const crownStart = baseY + trunkHeight - 2;
    for (let dy = 0; dy <= 2; dy++) {
      const radius = dy === 2 ? 1 : 2;
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.abs(dx) === radius && Math.abs(dz) === radius && (dy === 2 || ((dx + dz) & 1) === 0)) {
            continue;
          }
          const ty = crownStart + dy;
          if (dx === 0 && dz === 0 && dy < 2) continue;
          if (chunk.getBlock(lx + dx, ty, lz + dz) === BLOCK.AIR) {
            chunk.setBlock(lx + dx, ty, lz + dz, BLOCK.LEAVES, false);
          }
        }
      }
    }
    chunk.setBlock(lx, crownStart + 3, lz, BLOCK.LEAVES, false);
  }
}
