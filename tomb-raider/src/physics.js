/**
 * 物理与碰撞检测模块
 * 负责 AABB 碰撞、瓦片网格查询、单向平台、闭合石门碰撞及边缘抓崖判定
 */

import { TILE, TILE_SIZE, PHYSICS } from './constants.js';

export function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

export function circleRectOverlap(cx, cy, r, rect) {
  const closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy <= r * r;
}

export function getTileAt(level, col, row) {
  if (row < 0 || row >= level.rows || col < 0 || col >= level.cols) {
    return TILE.SOLID;
  }
  const t = level.grid[row][col];
  if (t === TILE.CRUMBLE) {
    const block = level.crumbleBlocks.find((b) => b.col === col && b.row === row);
    if (block && block.state === 'gone') {
      return TILE.EMPTY;
    }
  }
  return t;
}

export function isSolidTile(tileType) {
  return (
    tileType === TILE.SOLID ||
    tileType === TILE.MOSS_SOLID ||
    tileType === TILE.CRUMBLE
  );
}

/**
 * 获取当前世界中所有实心障碍矩形（瓦片 + 未完全开启的石门 + 可选箱子）
 */
export function getSolidRectsNear(level, box, includeCrates = true, excludeCrateId = null) {
  const solids = [];
  const minCol = Math.floor(box.x / TILE_SIZE) - 1;
  const maxCol = Math.floor((box.x + box.w) / TILE_SIZE) + 1;
  const minRow = Math.floor(box.y / TILE_SIZE) - 1;
  const maxRow = Math.floor((box.y + box.h) / TILE_SIZE) + 1;

  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      const t = getTileAt(level, c, r);
      if (isSolidTile(t)) {
        solids.push({
          x: c * TILE_SIZE,
          y: r * TILE_SIZE,
          w: TILE_SIZE,
          h: TILE_SIZE,
          tileType: t,
          col: c,
          row: r
        });
      }
    }
  }

  for (const door of level.doors) {
    if (!door.isOpen && door.openProgress < 0.85) {
      const currentH = door.h * (1 - door.openProgress);
      solids.push({
        x: door.x,
        y: door.y,
        w: door.w,
        h: currentH,
        isDoor: true
      });
    }
  }

  if (includeCrates) {
    for (const crate of level.crates) {
      if (crate.id !== excludeCrateId) {
        solids.push({
          x: crate.x,
          y: crate.y,
          w: crate.w,
          h: crate.h,
          isCrate: true,
          crateRef: crate
        });
      }
    }
  }

  return solids;
}

/**
 * 分离轴移动并解决 X/Y 碰撞，返回碰撞状态与踩到的碎裂块列表
 */
export function moveAndCollide(entity, level, dt, options = {}) {
  const {
    includeCrates = true,
    excludeCrateId = null,
    allowOneWayPlatforms = true,
    dropThrough = false
  } = options;

  const result = {
    hitLeft: false,
    hitRight: false,
    hitCeiling: false,
    onGround: false,
    pushedCrate: null,
    steppedCrumbles: []
  };

  const prevBottom = entity.y + entity.h;

  // 1. 水平位移与碰撞（保留原始速度方向，确保高速跨格时也能正确推出所有重叠实心块）
  const moveVx = entity.vx;
  entity.x += moveVx * dt;
  let solids = getSolidRectsNear(level, entity, includeCrates, excludeCrateId);
  for (const s of solids) {
    if (rectsOverlap(entity, s)) {
      if (moveVx > 0) {
        entity.x = Math.min(entity.x, s.x - entity.w);
        result.hitRight = true;
        if (s.isCrate) result.pushedCrate = { crate: s.crateRef, dir: 1 };
        entity.vx = 0;
      } else if (moveVx < 0) {
        entity.x = Math.max(entity.x, s.x + s.w);
        result.hitLeft = true;
        if (s.isCrate) result.pushedCrate = { crate: s.crateRef, dir: -1 };
        entity.vx = 0;
      }
    }
  }

  // 2. 垂直位移与碰撞
  const moveVy = entity.vy;
  entity.y += moveVy * dt;
  solids = getSolidRectsNear(level, entity, includeCrates, excludeCrateId);
  for (const s of solids) {
    if (rectsOverlap(entity, s)) {
      if (moveVy > 0) {
        entity.y = Math.min(entity.y, s.y - entity.h);
        entity.vy = 0;
        result.onGround = true;
        if (s.tileType === TILE.CRUMBLE) {
          result.steppedCrumbles.push({ col: s.col, row: s.row });
        }
      } else if (moveVy < 0) {
        entity.y = Math.max(entity.y, s.y + s.h);
        entity.vy = 0;
        result.hitCeiling = true;
      }
    }
  }

  // 3. 单向石台检测
  if (allowOneWayPlatforms && !dropThrough && entity.vy >= 0) {
    const minCol = Math.floor(entity.x / TILE_SIZE);
    const maxCol = Math.floor((entity.x + entity.w - 1) / TILE_SIZE);
    const footRow = Math.floor((entity.y + entity.h) / TILE_SIZE);
    for (let c = minCol; c <= maxCol; c++) {
      if (getTileAt(level, c, footRow) === TILE.PLATFORM) {
        const platTop = footRow * TILE_SIZE;
        if (prevBottom <= platTop + 6 && entity.y + entity.h >= platTop) {
          entity.y = platTop - entity.h;
          entity.vy = 0;
          result.onGround = true;
        }
      }
    }
  }

  return result;
}

/**
 * 判断实体是否位于藤蔓上
 */
export function isOnVine(entity, level) {
  const cx = Math.floor((entity.x + entity.w * 0.5) / TILE_SIZE);
  const topRow = Math.floor((entity.y + 4) / TILE_SIZE);
  const midRow = Math.floor((entity.y + entity.h * 0.65) / TILE_SIZE);
  return (
    getTileAt(level, cx, topRow) === TILE.VINE ||
    getTileAt(level, cx, midRow) === TILE.VINE
  );
}

/**
 * 经典古墓丽影边缘抓崖判定（Ledge Grab）：
 * 当劳拉在空中下落或上升末期，面向前方实心瓦片顶部边缘且上方留空时，触发抓崖
 */
export function detectLedgeGrab(player, level) {
  if (player.onGround || player.onVine || player.vy < -40) return null;

  const dir = player.facing;
  const probeX = dir > 0 ? player.x + player.w + 3 : player.x - 3;
  const col = Math.floor(probeX / TILE_SIZE);
  const handRow = Math.floor((player.y + 6) / TILE_SIZE);

  const wallTile = getTileAt(level, col, handRow);
  const aboveTile = getTileAt(level, col, handRow - 1);

  if (isSolidTile(wallTile) && !isSolidTile(aboveTile)) {
    const ledgeY = handRow * TILE_SIZE;
    const diff = player.y - ledgeY;
    if (diff >= -8 && diff <= PHYSICS.LEDGE_GRAB_TOLERANCE) {
      return {
        x: dir > 0 ? col * TILE_SIZE - player.w - 1 : (col + 1) * TILE_SIZE + 1,
        y: ledgeY + 2,
        pullUpX: dir > 0 ? col * TILE_SIZE + 4 : col * TILE_SIZE + TILE_SIZE - player.w - 4,
        pullUpY: ledgeY - player.h
      };
    }
  }
  return null;
}
