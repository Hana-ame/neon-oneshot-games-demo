import { CHUNK_SIZE, CHUNK_HEIGHT, BLOCK } from '../core/constants.js';

export function chunkKey(cx, cz) {
  return `${cx},${cz}`;
}

export class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.key = chunkKey(cx, cz);
    this.blocks = new Uint8Array(CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE);
    this.dirty = true;
    this.modified = false;
  }

  static index(lx, y, lz) {
    return (y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
  }

  inBounds(lx, y, lz) {
    return (
      lx >= 0 && lx < CHUNK_SIZE &&
      y >= 0 && y < CHUNK_HEIGHT &&
      lz >= 0 && lz < CHUNK_SIZE
    );
  }

  getBlock(lx, y, lz) {
    if (!this.inBounds(lx, y, lz)) return BLOCK.AIR;
    return this.blocks[Chunk.index(lx, y, lz)];
  }

  setBlock(lx, y, lz, blockId, markModified = false) {
    if (!this.inBounds(lx, y, lz)) return false;
    const idx = Chunk.index(lx, y, lz);
    if (this.blocks[idx] === blockId) return false;
    this.blocks[idx] = blockId;
    this.dirty = true;
    if (markModified) this.modified = true;
    return true;
  }

  getHighestSolidY(lx, lz) {
    if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return 0;
    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
      const b = this.blocks[Chunk.index(lx, y, lz)];
      if (b !== BLOCK.AIR && b !== BLOCK.WATER) return y;
    }
    return 0;
  }

  countNonAir() {
    let count = 0;
    for (let i = 0; i < this.blocks.length; i++) {
      if (this.blocks[i] !== BLOCK.AIR) count++;
    }
    return count;
  }
}
