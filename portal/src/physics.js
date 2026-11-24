/**
 * 2D 物理引擎、精确 Grid DDA 射线检测与传送门动量守恒计算模块
 * 纯函数设计，无 DOM 依赖，便于单元测试与复现
 */

import { TILE, TILE_SIZE, PHYSICS } from './constants.js';

export const Vec2 = {
  create(x = 0, y = 0) {
    return { x, y };
  },
  add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y };
  },
  sub(a, b) {
    return { x: a.x - b.x, y: a.y - b.y };
  },
  mul(v, s) {
    return { x: v.x * s, y: v.y * s };
  },
  dot(a, b) {
    return a.x * b.x + a.y * b.y;
  },
  len(v) {
    return Math.hypot(v.x, v.y);
  },
  norm(v) {
    const l = Math.hypot(v.x, v.y);
    return l > 1e-8 ? { x: v.x / l, y: v.y / l } : { x: 0, y: 0 };
  },
  clampLen(v, maxLen) {
    const l = Math.hypot(v.x, v.y);
    if (l <= maxLen || l <= 1e-8) return { x: v.x, y: v.y };
    const s = maxLen / l;
    return { x: v.x * s, y: v.y * s };
  }
};

/**
 * 读取网格指定位置的瓦片类型，越界视为不可传送的金属墙
 */
export function getTileAt(grid, col, row) {
  if (row < 0 || row >= grid.length) return TILE.METAL_WALL;
  if (col < 0 || col >= grid[0].length) return TILE.METAL_WALL;
  return grid[row][col];
}

export function isSolidTile(tile) {
  return tile === TILE.PORTAL_WALL || tile === TILE.METAL_WALL;
}

/**
 * 判断射线是否被瓦片阻挡（实心墙或解离栅栏都会阻挡传送门射线）
 */
export function isRayBlockingTile(tile) {
  return tile === TILE.PORTAL_WALL || tile === TILE.METAL_WALL || tile === TILE.FIZZLER;
}

/**
 * 轴对齐包围盒 (AABB) 相交检测
 */
export function aabbIntersects(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

/**
 * 精确 Amanatides & Woo 2D 网格 DDA 射线检测
 * 逐网格边界推进，彻底消除固定步长穿角与内部法线误判问题
 * @param {number[][]} grid - 关卡瓦片网格
 * @param {{x:number, y:number}} origin - 发射起点
 * @param {{x:number, y:number}} dir - 方向向量
 * @param {number} maxDist - 最大检测距离
 * @returns {object|null} 命中信息 { x, y, nx, ny, col, row, tile, dist, portalable }
 */
export function castRay(grid, origin, dir, maxDist = PHYSICS.MAX_RAY_DIST) {
  const nDir = Vec2.norm(dir);
  if (nDir.x === 0 && nDir.y === 0) return null;

  let col = Math.floor(origin.x / TILE_SIZE);
  let row = Math.floor(origin.y / TILE_SIZE);

  const stepX = nDir.x >= 0 ? 1 : -1;
  const stepY = nDir.y >= 0 ? 1 : -1;

  const tDeltaX = Math.abs(nDir.x) > 1e-9 ? TILE_SIZE / Math.abs(nDir.x) : Infinity;
  const tDeltaY = Math.abs(nDir.y) > 1e-9 ? TILE_SIZE / Math.abs(nDir.y) : Infinity;

  const nextGridX = (stepX > 0 ? col + 1 : col) * TILE_SIZE;
  const nextGridY = (stepY > 0 ? row + 1 : row) * TILE_SIZE;

  let tMaxX = Math.abs(nDir.x) > 1e-9 ? (nextGridX - origin.x) / nDir.x : Infinity;
  let tMaxY = Math.abs(nDir.y) > 1e-9 ? (nextGridY - origin.y) / nDir.y : Infinity;

  let dist = 0;
  let nx = 0;
  let ny = 0;

  for (let iter = 0; iter < 128; iter++) {
    if (tMaxX < tMaxY) {
      dist = tMaxX;
      tMaxX += tDeltaX;
      col += stepX;
      nx = -stepX;
      ny = 0;
    } else {
      dist = tMaxY;
      tMaxY += tDeltaY;
      row += stepY;
      nx = 0;
      ny = -stepY;
    }

    if (dist > maxDist) return null;

    const tile = getTileAt(grid, col, row);
    if (isRayBlockingTile(tile)) {
      const hitX = origin.x + nDir.x * dist;
      const hitY = origin.y + nDir.y * dist;
      return {
        x: nx !== 0 ? (nx > 0 ? (col + 1) * TILE_SIZE : col * TILE_SIZE) : hitX,
        y: ny !== 0 ? (ny > 0 ? (row + 1) * TILE_SIZE : row * TILE_SIZE) : hitY,
        nx,
        ny,
        col,
        row,
        tile,
        dist,
        portalable: tile === TILE.PORTAL_WALL
      };
    }
  }

  return null;
}

/**
 * 校验并对齐传送门放置位置
 * 确保传送门完全贴合白色可传送面板，且前方留有出射空间、不与另一传送门重叠
 */
export function validatePortalPlacement(grid, hit, otherPortal = null) {
  if (!hit || !hit.portalable) return { valid: false, reason: 'surface_not_portalable' };

  const { nx, ny } = hit;
  const isVerticalSurface = Math.abs(nx) === 1;
  const px = hit.x;
  const py = hit.y;

  // 将传送门中心微调对齐到可行区间（最多尝试偏移 ±18px 以避免轻微越界失败）
  const offsets = [0, -10, 10, -18, 18];
  let snapped = null;

  for (const off of offsets) {
    const cx = isVerticalSurface ? px : px + off;
    const cy = isVerticalSurface ? py + off : py;
    if (checkPortalSpanValid(grid, cx, cy, nx, ny)) {
      snapped = { x: cx, y: cy };
      break;
    }
  }

  if (!snapped) {
    return { valid: false, reason: 'insufficient_surface_span' };
  }

  // 检查是否与另一色传送门重叠
  if (otherPortal) {
    const sameNormal = otherPortal.nx === nx && otherPortal.ny === ny;
    const dist = Math.hypot(otherPortal.x - snapped.x, otherPortal.y - snapped.y);
    if (sameNormal && dist < PHYSICS.PORTAL_HALF_SPAN * 1.75) {
      return { valid: false, reason: 'overlaps_other_portal' };
    }
  }

  return {
    valid: true,
    portal: {
      x: snapped.x,
      y: snapped.y,
      nx,
      ny,
      halfSpan: PHYSICS.PORTAL_HALF_SPAN
    }
  };
}

function checkPortalSpanValid(grid, cx, cy, nx, ny) {
  const half = PHYSICS.PORTAL_HALF_SPAN - 4;
  const isVertical = Math.abs(nx) === 1;
  const sampleOffsets = [-half, 0, half];

  for (const s of sampleOffsets) {
    // 墙体内部采样点（法线反方向深入 4px）
    const wallX = (isVertical ? cx : cx + s) - nx * 4;
    const wallY = (isVertical ? cy + s : cy) - ny * 4;
    const wallTile = getTileAt(grid, Math.floor(wallX / TILE_SIZE), Math.floor(wallY / TILE_SIZE));
    if (wallTile !== TILE.PORTAL_WALL) return false;

    // 墙体前方空间采样点（法线正方向伸出 8px，确保非实心墙）
    const frontX = (isVertical ? cx : cx + s) + nx * 8;
    const frontY = (isVertical ? cy + s : cy) + ny * 8;
    const frontTile = getTileAt(grid, Math.floor(frontX / TILE_SIZE), Math.floor(frontY / TILE_SIZE));
    if (isSolidTile(frontTile)) return false;
  }
  return true;
}

/**
 * 计算实体通过传送门后的出射位置与速度向量（动量守恒核心算法）
 */
export function computePortalExit(entity, inPortal, outPortal) {
  const nIn = { x: inPortal.nx, y: inPortal.ny };
  const nOut = { x: outPortal.nx, y: outPortal.ny };

  const tIn = { x: -nIn.y, y: nIn.x };
  const tOut = { x: -nOut.y, y: nOut.x };

  const vIn = { x: entity.vx, y: entity.vy };
  const entryNormalSpeed = -Vec2.dot(vIn, nIn);
  const entryTangentSpeed = Vec2.dot(vIn, tIn);

  const exitNormalSpeed = Math.max(entryNormalSpeed, PHYSICS.PORTAL_MIN_EXIT);

  let vx = nOut.x * exitNormalSpeed - tOut.x * entryTangentSpeed * 0.65;
  let vy = nOut.y * exitNormalSpeed - tOut.y * entryTangentSpeed * 0.65;

  // 若出口是水平方向（竖直墙面）且速度较高，赋予轻微向上防贴地补偿，提升弹射手感
  if (Math.abs(nOut.x) === 1 && exitNormalSpeed > 360) {
    vy = Math.min(vy, -Math.min(180, exitNormalSpeed * 0.24));
  }

  const clamped = Vec2.clampLen({ x: vx, y: vy }, PHYSICS.MAX_SPEED);

  const clearanceX = Math.abs(nOut.x) * (entity.w / 2 + 10);
  const clearanceY = Math.abs(nOut.y) * (entity.h / 2 + 10);
  const outCenterX = outPortal.x + nOut.x * clearanceX;
  const outCenterY = outPortal.y + nOut.y * clearanceY;

  return {
    x: outCenterX - entity.w / 2,
    y: outCenterY - entity.h / 2,
    vx: clamped.x,
    vy: clamped.y
  };
}

/**
 * 判断实体是否触发进入传送门
 */
export function checkPortalEntry(entity, portal) {
  if (!portal || entity.portalCooldown > 0) return false;

  const cx = entity.x + entity.w / 2;
  const cy = entity.y + entity.h / 2;
  const dx = cx - portal.x;
  const dy = cy - portal.y;

  const normalDist = dx * portal.nx + dy * portal.ny;
  const tangentDist = Math.abs(dx * -portal.ny + dy * portal.nx);

  const halfExtentNormal = Math.abs(portal.nx) * (entity.w / 2) + Math.abs(portal.ny) * (entity.h / 2);
  const withinNormal = normalDist >= -14 && normalDist <= halfExtentNormal + 8;
  const withinTangent = tangentDist <= portal.halfSpan + 4;

  const movingToward = entity.vx * portal.nx + entity.vy * portal.ny < 35;

  return withinNormal && withinTangent && movingToward;
}

/**
 * 轴分离 AABB 瓦片碰撞解析（含动态关闭门与解离栅栏检测）
 */
export function resolveEntityCollisions(entity, grid, dt, extraSolids = [], blockFizzler = false) {
  let onGround = false;
  let hitHazard = false;
  let hitFizzler = false;

  // X 轴移动与碰撞
  entity.x += entity.vx * dt;
  const xSolids = collectNearbySolidRects(grid, entity, extraSolids, blockFizzler);
  for (const rect of xSolids) {
    if (aabbIntersects(entity, rect)) {
      if (entity.vx > 0) {
        entity.x = rect.x - entity.w;
        entity.vx = 0;
      } else if (entity.vx < 0) {
        entity.x = rect.x + rect.w;
        entity.vx = 0;
      }
    }
  }

  // Y 轴移动与碰撞
  entity.y += entity.vy * dt;
  const ySolids = collectNearbySolidRects(grid, entity, extraSolids, blockFizzler);
  for (const rect of ySolids) {
    if (aabbIntersects(entity, rect)) {
      if (entity.vy > 0) {
        entity.y = rect.y - entity.h;
        entity.vy = 0;
        onGround = true;
      } else if (entity.vy < 0) {
        entity.y = rect.y + rect.h;
        entity.vy = 0;
      }
    }
  }

  // 特殊瓦片触发检测（腐蚀液池与解离栅栏）
  const minCol = Math.floor(entity.x / TILE_SIZE);
  const maxCol = Math.floor((entity.x + entity.w - 0.1) / TILE_SIZE);
  const minRow = Math.floor(entity.y / TILE_SIZE);
  const maxRow = Math.floor((entity.y + entity.h - 0.1) / TILE_SIZE);

  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      const t = getTileAt(grid, c, r);
      if (t === TILE.HAZARD) hitHazard = true;
      if (t === TILE.FIZZLER) hitFizzler = true;
    }
  }

  return { onGround, hitHazard, hitFizzler };
}

function collectNearbySolidRects(grid, entity, extraSolids, blockFizzler) {
  const rects = [];
  const minCol = Math.floor(entity.x / TILE_SIZE) - 1;
  const maxCol = Math.floor((entity.x + entity.w) / TILE_SIZE) + 1;
  const minRow = Math.floor(entity.y / TILE_SIZE) - 1;
  const maxRow = Math.floor((entity.y + entity.h) / TILE_SIZE) + 1;

  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      const t = getTileAt(grid, c, r);
      if (isSolidTile(t) || (blockFizzler && t === TILE.FIZZLER)) {
        rects.push({
          x: c * TILE_SIZE,
          y: r * TILE_SIZE,
          w: TILE_SIZE,
          h: TILE_SIZE
        });
      }
    }
  }

  for (const s of extraSolids) {
    rects.push(s);
  }
  return rects;
}
