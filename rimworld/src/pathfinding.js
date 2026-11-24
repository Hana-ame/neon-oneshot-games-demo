/**
 * A* pathfinding with binary min-heap and terrain/building movement costs.
 */

import { TERRAIN_INFO, NATURAL_INFO, BUILDING_INFO } from './constants.js';

class MinHeap {
  constructor() {
    this.data = [];
  }
  get size() {
    return this.data.length;
  }
  push(node) {
    this.data.push(node);
    this._bubbleUp(this.data.length - 1);
  }
  pop() {
    if (this.data.length === 0) return null;
    const top = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0) {
      this.data[0] = last;
      this._sinkDown(0);
    }
    return top;
  }
  _bubbleUp(idx) {
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      if (this.data[idx].f >= this.data[parent].f) break;
      [this.data[idx], this.data[parent]] = [this.data[parent], this.data[idx]];
      idx = parent;
    }
  }
  _sinkDown(idx) {
    const len = this.data.length;
    while (true) {
      let smallest = idx;
      const left = idx * 2 + 1;
      const right = idx * 2 + 2;
      if (left < len && this.data[left].f < this.data[smallest].f) smallest = left;
      if (right < len && this.data[right].f < this.data[smallest].f) smallest = right;
      if (smallest === idx) break;
      [this.data[idx], this.data[smallest]] = [this.data[smallest], this.data[idx]];
      idx = smallest;
    }
  }
}

export function isTileWalkable(tile) {
  if (!tile) return false;
  const tInfo = TERRAIN_INFO[tile.terrain];
  if (!tInfo || !tInfo.walkable) return false;
  if (tile.natural && !NATURAL_INFO[tile.natural].walkable) return false;
  if (tile.building && tile.building.built) {
    const bInfo = BUILDING_INFO[tile.building.type];
    if (bInfo && !bInfo.walkable) return false;
  }
  return true;
}

export function getTileMoveCost(tile) {
  if (!isTileWalkable(tile)) return Infinity;
  let cost = TERRAIN_INFO[tile.terrain].moveCost;
  if (tile.natural && NATURAL_INFO[tile.natural].moveCost) {
    cost *= NATURAL_INFO[tile.natural].moveCost;
  }
  if (tile.building && tile.building.built && BUILDING_INFO[tile.building.type].moveCost) {
    cost *= BUILDING_INFO[tile.building.type].moveCost;
  }
  return cost;
}

const DIRS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, 1.414],
  [1, -1, 1.414],
  [-1, 1, 1.414],
  [-1, -1, 1.414],
];

/**
 * Finds shortest path from (sx, sy) to (gx, gy).
 * If allowAdjacent is true, stops when within 1 tile of (gx, gy) (useful for mining/building impassable walls).
 */
export function findPath(map, sx, sy, gx, gy, allowAdjacent = false, maxExpansions = 1600) {
  const { width, height, tiles } = map;
  const startX = Math.max(0, Math.min(width - 1, Math.round(sx)));
  const startY = Math.max(0, Math.min(height - 1, Math.round(sy)));
  const goalX = Math.max(0, Math.min(width - 1, Math.round(gx)));
  const goalY = Math.max(0, Math.min(height - 1, Math.round(gy)));

  if (startX === goalX && startY === goalY) return [];
  if (!allowAdjacent && !isTileWalkable(tiles[goalY * width + goalX])) return null;
  if (allowAdjacent && Math.abs(startX - goalX) <= 1 && Math.abs(startY - goalY) <= 1) return [];

  const total = width * height;
  const gScore = new Float32Array(total).fill(Infinity);
  const cameFrom = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);

  const startIdx = startY * width + startX;
  const goalIdx = goalY * width + goalX;
  gScore[startIdx] = 0;

  const open = new MinHeap();
  const h = (x, y) => Math.hypot(goalX - x, goalY - y);
  open.push({ idx: startIdx, x: startX, y: startY, f: h(startX, startY) });

  let expansions = 0;
  let reachedIdx = -1;

  while (open.size > 0 && expansions < maxExpansions) {
    const cur = open.pop();
    if (closed[cur.idx]) continue;
    closed[cur.idx] = 1;
    expansions++;

    if (cur.idx === goalIdx) {
      reachedIdx = cur.idx;
      break;
    }
    if (allowAdjacent && Math.abs(cur.x - goalX) <= 1 && Math.abs(cur.y - goalY) <= 1) {
      reachedIdx = cur.idx;
      break;
    }

    for (let i = 0; i < DIRS.length; i++) {
      const [dx, dy, baseStep] = DIRS[i];
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

      const nIdx = ny * width + nx;
      if (closed[nIdx]) continue;

      const nTile = tiles[nIdx];
      if (!isTileWalkable(nTile)) continue;

      // Prevent diagonal corner cutting through impassable walls
      if (dx !== 0 && dy !== 0) {
        if (
          !isTileWalkable(tiles[cur.y * width + nx]) ||
          !isTileWalkable(tiles[ny * width + cur.x])
        ) {
          continue;
        }
      }

      const moveCost = getTileMoveCost(nTile);
      const tentativeG = gScore[cur.idx] + baseStep * moveCost;

      if (tentativeG < gScore[nIdx]) {
        cameFrom[nIdx] = cur.idx;
        gScore[nIdx] = tentativeG;
        open.push({ idx: nIdx, x: nx, y: ny, f: tentativeG + h(nx, ny) });
      }
    }
  }

  if (reachedIdx === -1) return null;

  const path = [];
  let trace = reachedIdx;
  while (trace !== startIdx && trace !== -1) {
    path.push({ x: trace % width, y: Math.floor(trace / width) });
    trace = cameFrom[trace];
  }
  path.reverse();
  return path;
}
