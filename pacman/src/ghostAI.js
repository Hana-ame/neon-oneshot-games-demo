/**
 * 经典 4 幽灵个性化 AI 与有限状态机寻路算法
 * - Blinky: 直接追踪玩家当前格
 * - Pinky: 预判玩家前方 4 格（伏击）
 * - Inky: 以玩家前方 2 格为支点，将 Blinky 向量翻倍（包抄）
 * - Clyde: 距离 > 8 格时追踪玩家，<= 8 格时撤回左下角散开点
 */

import {
  CARDINAL_DIRS,
  GHOST_HOUSE_EXIT,
  GHOST_MODE,
  OPPOSITE_DIR,
} from './constants.js';

export function squaredDistance(colA, rowA, colB, rowB) {
  const dx = colA - colB;
  const dy = rowA - rowB;
  return dx * dx + dy * dy;
}

/**
 * 计算单个幽灵在当前模式下的目标瓦片坐标
 */
export function computeGhostTargetTile(ghost, pacman, blinky) {
  if (ghost.mode === GHOST_MODE.EATEN) {
    return { col: Math.floor(GHOST_HOUSE_EXIT.col), row: GHOST_HOUSE_EXIT.row };
  }
  if (ghost.mode === GHOST_MODE.SCATTER) {
    return { ...ghost.scatterTarget };
  }

  const pCol = Math.round(pacman.col);
  const pRow = Math.round(pacman.row);
  const pDir = pacman.dir;

  switch (ghost.id) {
    case 'blinky':
      return { col: pCol, row: pRow };

    case 'pinky':
      return {
        col: pCol + pDir.x * 4,
        row: pRow + pDir.y * 4,
      };

    case 'inky': {
      const pivotCol = pCol + pDir.x * 2;
      const pivotRow = pRow + pDir.y * 2;
      const bCol = blinky ? Math.round(blinky.col) : pCol;
      const bRow = blinky ? Math.round(blinky.row) : pRow;
      return {
        col: pivotCol + (pivotCol - bCol),
        row: pivotRow + (pivotRow - bRow),
      };
    }

    case 'clyde': {
      const distSq = squaredDistance(ghost.col, ghost.row, pacman.col, pacman.row);
      if (distSq > 64) {
        return { col: pCol, row: pRow };
      }
      return { ...ghost.scatterTarget };
    }

    default:
      return { col: pCol, row: pRow };
  }
}

/**
 * 在路口选择下一步方向：
 * 1. 禁止 180 度原地掉头（除非被逼入死胡同）
 * 2. 恐惧模式下使用确定性可注入随机源在可行方向中随机选取
 * 3. 其他模式选择到目标瓦片欧氏距离最小的方向，距离相等时按 UP > LEFT > DOWN > RIGHT 优先级决胜
 */
export function chooseGhostDirection(ghost, maze, targetTile, rng = Math.random) {
  const tileCol = Math.round(ghost.col);
  const tileRow = Math.round(ghost.row);
  const opposite = OPPOSITE_DIR[ghost.dir.name] || null;
  const canPassGate = ghost.mode === GHOST_MODE.EATEN;

  const validDirs = [];
  for (const dir of CARDINAL_DIRS) {
    if (opposite && dir.name === opposite.name) continue;
    const nextCol = tileCol + dir.x;
    const nextRow = tileRow + dir.y;
    if (maze.isWalkable(nextCol, nextRow, canPassGate)) {
      validDirs.push(dir);
    }
  }

  // 若无非掉头方向可行，允许掉头兜底
  if (validDirs.length === 0) {
    if (opposite && maze.isWalkable(tileCol + opposite.x, tileRow + opposite.y, canPassGate)) {
      return opposite;
    }
    return ghost.dir;
  }

  if (ghost.mode === GHOST_MODE.FRIGHTENED) {
    const idx = Math.floor(rng() * validDirs.length) % validDirs.length;
    return validDirs[idx];
  }

  let bestDir = validDirs[0];
  let bestDist = Infinity;
  for (const dir of validDirs) {
    const nextCol = tileCol + dir.x;
    const nextRow = tileRow + dir.y;
    const d = squaredDistance(nextCol, nextRow, targetTile.col, targetTile.row);
    if (d < bestDist) {
      bestDist = d;
      bestDir = dir;
    }
  }
  return bestDir;
}

/**
 * 根据关卡波次时间表计算当前全局模式 (SCATTER / CHASE)
 */
export function getScheduledGlobalMode(waveTimer, waveSchedule) {
  let elapsed = 0;
  for (const phase of waveSchedule) {
    elapsed += phase.duration;
    if (waveTimer < elapsed) {
      return phase.mode;
    }
  }
  return GHOST_MODE.CHASE;
}
