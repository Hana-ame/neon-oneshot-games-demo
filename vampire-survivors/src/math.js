/**
 * Crimson Night - 数学工具与空间哈希网格 (Spatial Hash Grid)
 * 将碰撞检测与最近邻搜索的均摊时间复杂度从 O(N^2) 降至 O(N)
 */

export function clamp(val, min, max) {
  return val < min ? min : val > max ? max : val;
}

export function distSq(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

export function normalize(x, y) {
  const len = Math.hypot(x, y);
  if (len < 1e-6) return { x: 0, y: 0 };
  return { x: x / len, y: y / len };
}

export function circleIntersects(ax, ay, ar, bx, by, br) {
  const r = ar + br;
  return distSq(ax, ay, bx, by) <= r * r;
}

/**
 * 轻量级二维空间哈希网格
 */
export class SpatialHashGrid {
  constructor(cellSize = 96) {
    this.cellSize = cellSize;
    this.invCellSize = 1 / cellSize;
    this.cells = new Map();
  }

  clear() {
    this.cells.clear();
  }

  _key(cx, cy) {
    // 整数配对编码，避免字符串拼接产生高频 GC
    return ((cx + 32768) << 16) ^ (cy + 32768);
  }

  insert(entity) {
    const cx = Math.floor(entity.x * this.invCellSize);
    const cy = Math.floor(entity.y * this.invCellSize);
    const k = this._key(cx, cy);
    let bucket = this.cells.get(k);
    if (!bucket) {
      bucket = [];
      this.cells.set(k, bucket);
    }
    bucket.push(entity);
  }

  /**
   * 查询以 (x, y) 为中心、半径为 radius 的邻近实体
   */
  queryRadius(x, y, radius, out = []) {
    out.length = 0;
    const minCx = Math.floor((x - radius) * this.invCellSize);
    const maxCx = Math.floor((x + radius) * this.invCellSize);
    const minCy = Math.floor((y - radius) * this.invCellSize);
    const maxCy = Math.floor((y + radius) * this.invCellSize);
    const rSq = radius * radius;

    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const bucket = this.cells.get(this._key(cx, cy));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const e = bucket[i];
          if (!e.dead && distSq(x, y, e.x, e.y) <= (radius + (e.radius || 0)) ** 2) {
            out.push(e);
          }
        }
      }
    }
    // 兜底检查超大半径直接返回时确保精确度
    void rSq;
    return out;
  }

  /**
   * 查找距离 (x, y) 最近的存活实体（限定最大搜索半径）
   */
  findNearest(x, y, maxRadius = 600) {
    const candidates = this.queryRadius(x, y, maxRadius, []);
    let best = null;
    let bestD = Infinity;
    for (let i = 0; i < candidates.length; i++) {
      const e = candidates[i];
      const d = distSq(x, y, e.x, e.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }
}

/**
 * 可设种子的伪随机数生成器 (Mulberry32)
 * 用于自动化测试中的确定性模拟
 */
export function createRNG(seed = 1337) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
