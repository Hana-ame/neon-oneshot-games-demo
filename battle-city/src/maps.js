import { GRID_SIZE, TILE, ENEMY_TYPE, BASE_TILES, BASE_WALL_TILES } from './constants.js';

/**
 * Helper to create a 26x26 empty grid and paint block primitives (2x2 sub-tiles)
 * or individual sub-tiles cleanly.
 */
function createEmptyGrid() {
  return Array.from({ length: GRID_SIZE }, () => new Array(GRID_SIZE).fill(TILE.EMPTY));
}

function fillRect(grid, r1, c1, r2, c2, tileType) {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE) {
        grid[r][c] = tileType;
      }
    }
  }
}

function placeBase(grid) {
  // Clear spawn corridors around player and enemy spawns
  fillRect(grid, 0, 0, 1, 1, TILE.EMPTY);
  fillRect(grid, 0, 12, 1, 13, TILE.EMPTY);
  fillRect(grid, 0, 24, 1, 25, TILE.EMPTY);
  fillRect(grid, 24, 8, 25, 9, TILE.EMPTY);
  fillRect(grid, 24, 16, 25, 17, TILE.EMPTY);

  for (const { r, c } of BASE_WALL_TILES) {
    grid[r][c] = TILE.BRICK;
  }
  for (const { r, c } of BASE_TILES) {
    grid[r][c] = TILE.BASE;
  }
}

function buildStage1() {
  const g = createEmptyGrid();
  // Classic Stage 1 inspired symmetrical brick pillars
  fillRect(g, 2, 2, 10, 3, TILE.BRICK);
  fillRect(g, 2, 6, 10, 7, TILE.BRICK);
  fillRect(g, 2, 10, 8, 11, TILE.BRICK);
  fillRect(g, 2, 14, 8, 15, TILE.BRICK);
  fillRect(g, 2, 18, 10, 19, TILE.BRICK);
  fillRect(g, 2, 22, 10, 23, TILE.BRICK);

  // Center steel emblem
  fillRect(g, 6, 12, 7, 13, TILE.STEEL);

  // Midfield horizontal barriers & side steel blocks
  fillRect(g, 12, 0, 13, 1, TILE.STEEL);
  fillRect(g, 12, 24, 13, 25, TILE.STEEL);
  fillRect(g, 12, 4, 13, 7, TILE.BRICK);
  fillRect(g, 12, 18, 13, 21, TILE.BRICK);
  fillRect(g, 11, 10, 12, 15, TILE.BRICK);

  // Lower columns
  fillRect(g, 15, 2, 21, 3, TILE.BRICK);
  fillRect(g, 15, 6, 21, 7, TILE.BRICK);
  fillRect(g, 15, 10, 19, 11, TILE.BRICK);
  fillRect(g, 15, 14, 19, 15, TILE.BRICK);
  fillRect(g, 15, 18, 21, 19, TILE.BRICK);
  fillRect(g, 15, 22, 21, 23, TILE.BRICK);
  fillRect(g, 17, 12, 18, 13, TILE.BRICK);

  // Light forest accents on flanks
  fillRect(g, 14, 0, 15, 1, TILE.FOREST);
  fillRect(g, 14, 24, 15, 25, TILE.FOREST);

  placeBase(g);
  return g;
}

function buildStage2() {
  const g = createEmptyGrid();
  // Steel Bastion & Forest Ambush
  fillRect(g, 2, 4, 5, 5, TILE.STEEL);
  fillRect(g, 2, 20, 5, 21, TILE.STEEL);
  fillRect(g, 4, 10, 5, 15, TILE.BRICK);

  // Forest concealment zones
  fillRect(g, 6, 2, 9, 5, TILE.FOREST);
  fillRect(g, 6, 20, 9, 23, TILE.FOREST);
  fillRect(g, 8, 10, 11, 15, TILE.FOREST);

  // Mid steel & brick staggered bunkers
  fillRect(g, 10, 6, 11, 9, TILE.STEEL);
  fillRect(g, 10, 16, 11, 19, TILE.STEEL);
  fillRect(g, 13, 2, 14, 7, TILE.BRICK);
  fillRect(g, 13, 18, 14, 23, TILE.BRICK);
  fillRect(g, 14, 11, 15, 14, TILE.STEEL);

  // Lower defensive walls
  fillRect(g, 17, 4, 21, 5, TILE.BRICK);
  fillRect(g, 17, 20, 21, 21, TILE.BRICK);
  fillRect(g, 18, 8, 19, 17, TILE.BRICK);
  fillRect(g, 21, 0, 22, 3, TILE.STEEL);
  fillRect(g, 21, 22, 22, 25, TILE.STEEL);

  placeBase(g);
  return g;
}

function buildStage3() {
  const g = createEmptyGrid();
  // River Crossing with Ice Bridges
  fillRect(g, 8, 0, 9, 5, TILE.WATER);
  fillRect(g, 8, 8, 9, 17, TILE.WATER);
  fillRect(g, 8, 20, 9, 25, TILE.WATER);

  // Ice bridges across the river
  fillRect(g, 8, 6, 9, 7, TILE.ICE);
  fillRect(g, 8, 18, 9, 19, TILE.ICE);

  // Upper fortifications
  fillRect(g, 3, 2, 5, 5, TILE.BRICK);
  fillRect(g, 3, 10, 5, 15, TILE.STEEL);
  fillRect(g, 3, 20, 5, 23, TILE.BRICK);

  // Midfield ice & forest
  fillRect(g, 12, 8, 15, 17, TILE.ICE);
  fillRect(g, 12, 2, 15, 5, TILE.FOREST);
  fillRect(g, 12, 20, 15, 23, TILE.FOREST);

  // Lower brick choke points
  fillRect(g, 17, 4, 18, 11, TILE.BRICK);
  fillRect(g, 17, 14, 18, 21, TILE.BRICK);
  fillRect(g, 20, 6, 21, 7, TILE.STEEL);
  fillRect(g, 20, 18, 21, 19, TILE.STEEL);

  placeBase(g);
  return g;
}

function buildStage4() {
  const g = createEmptyGrid();
  // Maze Fortress
  fillRect(g, 2, 2, 3, 9, TILE.BRICK);
  fillRect(g, 2, 16, 3, 23, TILE.BRICK);
  fillRect(g, 5, 6, 10, 7, TILE.STEEL);
  fillRect(g, 5, 18, 10, 19, TILE.STEEL);
  fillRect(g, 6, 10, 7, 15, TILE.BRICK);

  // Central citadel
  fillRect(g, 10, 10, 15, 15, TILE.BRICK);
  fillRect(g, 11, 11, 14, 14, TILE.EMPTY);
  fillRect(g, 12, 12, 13, 13, TILE.STEEL);
  // Entrances to citadel
  fillRect(g, 10, 12, 10, 13, TILE.EMPTY);
  fillRect(g, 15, 12, 15, 13, TILE.EMPTY);

  // Side water & forest
  fillRect(g, 11, 2, 14, 3, TILE.WATER);
  fillRect(g, 11, 22, 14, 23, TILE.WATER);
  fillRect(g, 16, 2, 19, 5, TILE.FOREST);
  fillRect(g, 16, 20, 19, 23, TILE.FOREST);

  // Lower maze walls
  fillRect(g, 18, 8, 20, 9, TILE.BRICK);
  fillRect(g, 18, 16, 20, 17, TILE.BRICK);
  fillRect(g, 20, 11, 21, 14, TILE.BRICK);

  placeBase(g);
  return g;
}

function buildStage5() {
  const g = createEmptyGrid();
  // Final Citadel - Combined Arms Challenge
  fillRect(g, 2, 4, 3, 9, TILE.STEEL);
  fillRect(g, 2, 16, 3, 21, TILE.STEEL);
  fillRect(g, 4, 11, 5, 14, TILE.STEEL);

  fillRect(g, 6, 2, 7, 7, TILE.BRICK);
  fillRect(g, 6, 18, 7, 23, TILE.BRICK);
  fillRect(g, 7, 10, 10, 15, TILE.FOREST);

  // Flanking moats
  fillRect(g, 10, 0, 11, 3, TILE.WATER);
  fillRect(g, 10, 22, 11, 25, TILE.WATER);
  fillRect(g, 11, 6, 14, 7, TILE.STEEL);
  fillRect(g, 11, 18, 14, 19, TILE.STEEL);

  // Ice corridor in center
  fillRect(g, 13, 10, 16, 15, TILE.ICE);
  fillRect(g, 16, 2, 17, 7, TILE.BRICK);
  fillRect(g, 16, 18, 17, 23, TILE.BRICK);

  // Outer defense ring
  fillRect(g, 19, 4, 20, 9, TILE.BRICK);
  fillRect(g, 19, 16, 20, 21, TILE.BRICK);
  fillRect(g, 19, 11, 20, 14, TILE.STEEL);

  placeBase(g);
  return g;
}

const B = ENEMY_TYPE.BASIC;
const F = ENEMY_TYPE.FAST;
const P = ENEMY_TYPE.POWER;
const A = ENEMY_TYPE.ARMOR;

export const STAGES = [
  {
    id: 1,
    name: '经典阵地',
    buildGrid: buildStage1,
    enemies: [B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, F, F],
  },
  {
    id: 2,
    name: '钢铁防线',
    buildGrid: buildStage2,
    enemies: [B, B, B, F, B, B, P, B, F, B, A, B, B, F, P, B, B, F, A, P],
  },
  {
    id: 3,
    name: '渡河突击',
    buildGrid: buildStage3,
    enemies: [F, B, B, F, P, B, F, B, A, F, P, B, F, P, A, F, B, P, A, A],
  },
  {
    id: 4,
    name: '迷宫堡垒',
    buildGrid: buildStage4,
    enemies: [P, F, B, A, P, F, P, B, A, F, A, P, F, P, A, P, F, A, A, A],
  },
  {
    id: 5,
    name: '最终决战',
    buildGrid: buildStage5,
    enemies: [A, F, P, A, F, P, A, A, F, P, A, P, F, A, A, P, A, F, A, A],
  },
];

export function getStageConfig(stageNumber) {
  const idx = ((stageNumber - 1) % STAGES.length + STAGES.length) % STAGES.length;
  const stage = STAGES[idx];
  return {
    id: stageNumber,
    templateId: stage.id,
    name: stage.name,
    grid: stage.buildGrid(),
    enemies: [...stage.enemies],
  };
}
