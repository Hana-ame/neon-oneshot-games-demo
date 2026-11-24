/**
 * Hexagonal Grid Mathematics (Pointy-Top, Odd-R Offset <-> Axial/Cube)
 * 六边形网格数学库：坐标转换、距离、邻居、视野圈、A* 寻路
 */

export const HEX_DIRS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function hexKey(q, r) {
  return `${q},${r}`;
}

export function offsetToAxial(col, row) {
  const q = col - Math.floor((row - (row & 1)) / 2);
  const r = row;
  return { q, r };
}

export function axialToOffset(q, r) {
  const col = q + Math.floor((r - (r & 1)) / 2);
  const row = r;
  return { col, row };
}

export function hexDistance(a, b) {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  const ds = (-a.q - a.r) - (-b.q - b.r);
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds));
}

export function hexNeighbors(q, r) {
  return HEX_DIRS.map(d => ({ q: q + d.q, r: r + d.r }));
}

export function hexesInRange(center, radius) {
  const results = [];
  for (let dq = -radius; dq <= radius; dq++) {
    const rMin = Math.max(-radius, -dq - radius);
    const rMax = Math.min(radius, -dq + radius);
    for (let dr = rMin; dr <= rMax; dr++) {
      results.push({ q: center.q + dq, r: center.r + dr });
    }
  }
  return results;
}

/**
 * Pointy-top axial to pixel coordinates
 */
export function axialToPixel(q, r, size) {
  const x = size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
  const y = size * (1.5 * r);
  return { x, y };
}

/**
 * Pixel to fractional axial, rounded to nearest hex
 */
export function pixelToAxial(x, y, size) {
  const q = ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / size;
  const r = ((2 / 3) * y) / size;
  return axialRound(q, r);
}

export function axialRound(q, r) {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  let rs = Math.round(s);
  const qDiff = Math.abs(rq - q);
  const rDiff = Math.abs(rr - r);
  const sDiff = Math.abs(rs - s);
  if (qDiff > rDiff && qDiff > sDiff) {
    rq = -rr - rs;
  } else if (rDiff > sDiff) {
    rr = -rq - rs;
  }
  return { q: rq === 0 ? 0 : rq, r: rr === 0 ? 0 : rr };
}

/**
 * Compute all reachable hexes within movement budget using Dijkstra
 * getCost(fromTile, toTile) => number | Infinity
 */
export function getReachableHexes(start, maxMoves, getTile, getCost) {
  const startKey = hexKey(start.q, start.r);
  const costSoFar = new Map([[startKey, 0]]);
  const cameFrom = new Map();
  const frontier = [{ q: start.q, r: start.r, cost: 0 }];

  while (frontier.length > 0) {
    frontier.sort((a, b) => a.cost - b.cost);
    const current = frontier.shift();
    const curKey = hexKey(current.q, current.r);
    if (current.cost > costSoFar.get(curKey)) continue;

    for (const next of hexNeighbors(current.q, current.r)) {
      const tile = getTile(next.q, next.r);
      if (!tile) continue;
      const stepCost = getCost(current, tile);
      if (!Number.isFinite(stepCost)) continue;
      // Civilization rule: if unit has >= 1 move left on current tile and next tile is passable, allow entering even if stepCost > remaining when at full move or cost <= maxMoves
      const newCost = current.cost + stepCost;
      const clampedCost = (current.cost === 0 && stepCost > maxMoves && stepCost < 99) ? maxMoves : newCost;
      if (clampedCost > maxMoves) continue;
      const nextKey = hexKey(next.q, next.r);
      if (!costSoFar.has(nextKey) || clampedCost < costSoFar.get(nextKey)) {
        costSoFar.set(nextKey, clampedCost);
        cameFrom.set(nextKey, curKey);
        frontier.push({ q: next.q, r: next.r, cost: clampedCost });
      }
    }
  }

  costSoFar.delete(startKey);
  return { costSoFar, cameFrom };
}

/**
 * A* pathfinding between start and goal
 */
export function findPath(start, goal, getTile, getCost, maxNodes = 400) {
  const startKey = hexKey(start.q, start.r);
  const goalKey = hexKey(goal.q, goal.r);
  if (startKey === goalKey) return [];

  const open = [{ q: start.q, r: start.r, g: 0, f: hexDistance(start, goal) }];
  const gScore = new Map([[startKey, 0]]);
  const cameFrom = new Map();
  let expanded = 0;

  while (open.length > 0 && expanded < maxNodes) {
    open.sort((a, b) => a.f - b.f);
    const current = open.shift();
    const curKey = hexKey(current.q, current.r);
    if (curKey === goalKey) {
      const path = [];
      let k = goalKey;
      while (k && k !== startKey) {
        const [q, r] = k.split(',').map(Number);
        path.unshift({ q, r });
        k = cameFrom.get(k);
      }
      return path;
    }
    expanded++;

    for (const next of hexNeighbors(current.q, current.r)) {
      const tile = getTile(next.q, next.r);
      if (!tile) continue;
      const stepCost = getCost(current, tile);
      if (!Number.isFinite(stepCost)) continue;
      const tentativeG = current.g + stepCost;
      const nextKey = hexKey(next.q, next.r);
      if (!gScore.has(nextKey) || tentativeG < gScore.get(nextKey)) {
        gScore.set(nextKey, tentativeG);
        cameFrom.set(nextKey, curKey);
        open.push({
          q: next.q,
          r: next.r,
          g: tentativeG,
          f: tentativeG + hexDistance(next, goal),
        });
      }
    }
  }
  return null;
}
