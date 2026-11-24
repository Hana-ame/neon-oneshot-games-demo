import { CHUNK_SIZE, CHUNK_HEIGHT, BLOCK } from '../core/constants.js';
import { mod } from '../core/math.js';
import { Chunk, chunkKey } from './chunk.js';
import { TerrainGenerator } from './generator.js';

export class World {
  constructor(seed = 2026) {
    this.generator = new TerrainGenerator(seed);
    this.seed = this.generator.seed;
    this.chunks = new Map();
    this.edits = new Map(); // "wx,wy,wz" -> blockId (delta persistence)
  }

  worldToChunkCoords(wx, wz) {
    return [Math.floor(wx / CHUNK_SIZE), Math.floor(wz / CHUNK_SIZE)];
  }

  getChunk(cx, cz, createIfMissing = true) {
    const key = chunkKey(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk && createIfMissing) {
      chunk = new Chunk(cx, cz);
      this.generator.generateChunk(chunk);
      this.applyStoredEditsToChunk(chunk);
      this.chunks.set(key, chunk);
    }
    return chunk || null;
  }

  applyStoredEditsToChunk(chunk) {
    if (this.edits.size === 0) return;
    const minX = chunk.cx * CHUNK_SIZE;
    const maxX = minX + CHUNK_SIZE - 1;
    const minZ = chunk.cz * CHUNK_SIZE;
    const maxZ = minZ + CHUNK_SIZE - 1;

    for (const [k, blockId] of this.edits.entries()) {
      const parts = k.split(',');
      const wx = Number(parts[0]);
      const wy = Number(parts[1]);
      const wz = Number(parts[2]);
      if (wx >= minX && wx <= maxX && wz >= minZ && wz <= maxZ) {
        chunk.setBlock(wx - minX, wy, wz - minZ, blockId, true);
      }
    }
  }

  getBlock(wx, wy, wz) {
    const iy = Math.floor(wy);
    if (iy < 0 || iy >= CHUNK_HEIGHT) return BLOCK.AIR;
    const ix = Math.floor(wx);
    const iz = Math.floor(wz);
    const cx = Math.floor(ix / CHUNK_SIZE);
    const cz = Math.floor(iz / CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk) return BLOCK.AIR;
    return chunk.getBlock(mod(ix, CHUNK_SIZE), iy, mod(iz, CHUNK_SIZE));
  }

  setBlock(wx, wy, wz, blockId, recordEdit = true) {
    const iy = Math.floor(wy);
    if (iy < 0 || iy >= CHUNK_HEIGHT) return false;
    const ix = Math.floor(wx);
    const iz = Math.floor(wz);
    const cx = Math.floor(ix / CHUNK_SIZE);
    const cz = Math.floor(iz / CHUNK_SIZE);
    const lx = mod(ix, CHUNK_SIZE);
    const lz = mod(iz, CHUNK_SIZE);

    const chunk = this.getChunk(cx, cz, true);
    const changed = chunk.setBlock(lx, iy, lz, blockId, recordEdit);
    if (!changed) return false;

    if (recordEdit) {
      this.edits.set(`${ix},${iy},${iz}`, blockId);
    }

    // Mark adjacent chunks dirty if edit touches a chunk border
    if (lx === 0) this.markChunkDirty(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this.markChunkDirty(cx + 1, cz);
    if (lz === 0) this.markChunkDirty(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.markChunkDirty(cx, cz + 1);

    return true;
  }

  markChunkDirty(cx, cz) {
    const c = this.chunks.get(chunkKey(cx, cz));
    if (c) c.dirty = true;
  }

  ensureChunksAround(wx, wz, radius = 3) {
    const [pcx, pcz] = this.worldToChunkCoords(wx, wz);
    const created = [];
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const cx = pcx + dx;
        const cz = pcz + dz;
        const key = chunkKey(cx, cz);
        if (!this.chunks.has(key)) {
          const chunk = this.getChunk(cx, cz, true);
          created.push(chunk);
          // Neighboring chunks need re-meshing to cull boundary faces
          this.markChunkDirty(cx - 1, cz);
          this.markChunkDirty(cx + 1, cz);
          this.markChunkDirty(cx, cz - 1);
          this.markChunkDirty(cx, cz + 1);
        }
      }
    }
    return created;
  }

  getSpawnPoint() {
    this.ensureChunksAround(0, 0, 2);
    for (let r = 0; r <= 12; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          const cx = Math.floor(dx / CHUNK_SIZE);
          const cz = Math.floor(dz / CHUNK_SIZE);
          const chunk = this.getChunk(cx, cz, true);
          const y = chunk.getHighestSolidY(mod(dx, CHUNK_SIZE), mod(dz, CHUNK_SIZE));
          const topBlock = this.getBlock(dx, y, dz);
          if (y > 22 && topBlock !== BLOCK.WATER && topBlock !== BLOCK.LEAVES) {
            return { x: dx + 0.5, y: y + 1.05, z: dz + 0.5 };
          }
        }
      }
    }
    return { x: 0.5, y: 40, z: 0.5 };
  }

  serialize(playerState = null, timeOfDay = 0.25) {
    const editsArr = [];
    for (const [k, blockId] of this.edits.entries()) {
      editsArr.push([k, blockId]);
    }
    return JSON.stringify({
      version: 1,
      seed: this.seed,
      timeOfDay,
      player: playerState,
      edits: editsArr,
    });
  }

  static deserialize(jsonStr) {
    const data = JSON.parse(jsonStr);
    if (!data || typeof data.seed !== 'number') {
      throw new Error('Invalid world save format');
    }
    const world = new World(data.seed);
    if (Array.isArray(data.edits)) {
      for (const entry of data.edits) {
        if (Array.isArray(entry) && entry.length === 2) {
          world.edits.set(String(entry[0]), Number(entry[1]));
        }
      }
    }
    return {
      world,
      player: data.player || null,
      timeOfDay: typeof data.timeOfDay === 'number' ? data.timeOfDay : 0.25,
    };
  }
}
