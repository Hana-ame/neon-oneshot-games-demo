import { BLOCK, isLiquidBlock } from '../core/constants.js';

/**
 * 3D Amanatides-Woo DDA voxel raycaster.
 * Returns { x, y, z, normal: [nx, ny, nz], distance, blockId } or null.
 */
export function raycastVoxel(origin, direction, maxDistance, getBlock) {
  const len = Math.hypot(direction[0], direction[1], direction[2]);
  if (len === 0) return null;

  const dx = direction[0] / len;
  const dy = direction[1] / len;
  const dz = direction[2] / len;

  let x = Math.floor(origin[0]);
  let y = Math.floor(origin[1]);
  let z = Math.floor(origin[2]);

  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;

  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;

  let tMaxX =
    dx > 0
      ? (x + 1 - origin[0]) * tDeltaX
      : dx < 0
      ? (origin[0] - x) * tDeltaX
      : Infinity;
  let tMaxY =
    dy > 0
      ? (y + 1 - origin[1]) * tDeltaY
      : dy < 0
      ? (origin[1] - y) * tDeltaY
      : Infinity;
  let tMaxZ =
    dz > 0
      ? (z + 1 - origin[2]) * tDeltaZ
      : dz < 0
      ? (origin[2] - z) * tDeltaZ
      : Infinity;

  let nx = 0;
  let ny = 0;
  let nz = 0;
  let dist = 0;

  for (let steps = 0; steps < 256; steps++) {
    const b = getBlock(x, y, z);
    if (b !== BLOCK.AIR && !isLiquidBlock(b)) {
      return {
        x,
        y,
        z,
        normal: [nx, ny, nz],
        placePos: [x + nx, y + ny, z + nz],
        distance: dist,
        blockId: b,
      };
    }

    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      dist = tMaxX;
      if (dist > maxDistance) break;
      x += stepX;
      tMaxX += tDeltaX;
      nx = -stepX;
      ny = 0;
      nz = 0;
    } else if (tMaxY < tMaxZ) {
      dist = tMaxY;
      if (dist > maxDistance) break;
      y += stepY;
      tMaxY += tDeltaY;
      nx = 0;
      ny = -stepY;
      nz = 0;
    } else {
      dist = tMaxZ;
      if (dist > maxDistance) break;
      z += stepZ;
      tMaxZ += tDeltaZ;
      nx = 0;
      ny = 0;
      nz = -stepZ;
    }
  }

  return null;
}
