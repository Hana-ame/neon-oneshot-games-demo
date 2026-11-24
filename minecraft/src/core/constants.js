/**
 * Core world, physics, and block registry constants.
 */

export const CHUNK_SIZE = 16;
export const CHUNK_HEIGHT = 64;
export const WATER_LEVEL = 22;
export const RENDER_RADIUS = 3; // 7x7 chunks around player by default

export const PHYSICS = {
  GRAVITY: 26.0,
  JUMP_VELOCITY: 8.8,
  WALK_SPEED: 4.8,
  SPRINT_SPEED: 7.4,
  FLY_SPEED: 11.5,
  SWIM_SPEED: 3.4,
  WATER_GRAVITY: 6.5,
  TERMINAL_VELOCITY: 42.0,
  PLAYER_WIDTH: 0.6,
  PLAYER_HEIGHT: 1.72,
  EYE_HEIGHT: 1.54,
  REACH_DISTANCE: 6.0,
};

export const BLOCK = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  COBBLESTONE: 4,
  WOOD_OAK: 5,
  LEAVES: 6,
  SAND: 7,
  WATER: 8,
  PLANKS: 9,
  BRICK: 10,
  GLASS: 11,
  SNOW: 12,
  BEDROCK: 13,
  COAL_ORE: 14,
  GOLD_ORE: 15,
  GLOWSTONE: 16,
};

/**
 * Tile indices in the 8x4 procedural texture atlas (each tile 16x16 px).
 * faces: [top, bottom, side]
 */
export const BLOCK_DEFS = {
  [BLOCK.AIR]: {
    id: BLOCK.AIR,
    name: '空气',
    enName: 'Air',
    solid: false,
    transparent: true,
    liquid: false,
    breakable: false,
    tiles: [0, 0, 0],
    color: '#000000',
  },
  [BLOCK.GRASS]: {
    id: BLOCK.GRASS,
    name: '草方块',
    enName: 'Grass',
    solid: true,
    transparent: false,
    liquid: false,
    breakable: true,
    tiles: [0, 2, 1], // grass_top, dirt, grass_side
    color: '#5ea832',
  },
  [BLOCK.DIRT]: {
    id: BLOCK.DIRT,
    name: '泥土',
    enName: 'Dirt',
    solid: true,
    transparent: false,
    liquid: false,
    breakable: true,
    tiles: [2, 2, 2],
    color: '#8a5a36',
  },
  [BLOCK.STONE]: {
    id: BLOCK.STONE,
    name: '石头',
    enName: 'Stone',
    solid: true,
    transparent: false,
    liquid: false,
    breakable: true,
    tiles: [3, 3, 3],
    color: '#7f848a',
  },
  [BLOCK.COBBLESTONE]: {
    id: BLOCK.COBBLESTONE,
    name: '圆石',
    enName: 'Cobblestone',
    solid: true,
    transparent: false,
    liquid: false,
    breakable: true,
    tiles: [4, 4, 4],
    color: '#6b7075',
  },
  [BLOCK.WOOD_OAK]: {
    id: BLOCK.WOOD_OAK,
    name: '橡木原木',
    enName: 'Oak Log',
    solid: true,
    transparent: false,
    liquid: false,
    breakable: true,
    tiles: [6, 6, 5], // log_top, log_top, log_side
    color: '#6e4d2d',
  },
  [BLOCK.LEAVES]: {
    id: BLOCK.LEAVES,
    name: '橡树叶',
    enName: 'Oak Leaves',
    solid: true,
    transparent: false,
    liquid: false,
    breakable: true,
    tiles: [7, 7, 7],
    color: '#3b8228',
  },
  [BLOCK.SAND]: {
    id: BLOCK.SAND,
    name: '沙子',
    enName: 'Sand',
    solid: true,
    transparent: false,
    liquid: false,
    breakable: true,
    tiles: [8, 8, 8],
    color: '#dfd095',
  },
  [BLOCK.WATER]: {
    id: BLOCK.WATER,
    name: '水',
    enName: 'Water',
    solid: false,
    transparent: true,
    liquid: true,
    breakable: false,
    tiles: [9, 9, 9],
    color: '#2e78d4',
  },
  [BLOCK.PLANKS]: {
    id: BLOCK.PLANKS,
    name: '橡木木板',
    enName: 'Oak Planks',
    solid: true,
    transparent: false,
    liquid: false,
    breakable: true,
    tiles: [10, 10, 10],
    color: '#b88b52',
  },
  [BLOCK.BRICK]: {
    id: BLOCK.BRICK,
    name: '红砖块',
    enName: 'Bricks',
    solid: true,
    transparent: false,
    liquid: false,
    breakable: true,
    tiles: [11, 11, 11],
    color: '#9e4736',
  },
  [BLOCK.GLASS]: {
    id: BLOCK.GLASS,
    name: '玻璃',
    enName: 'Glass',
    solid: true,
    transparent: true,
    liquid: false,
    breakable: true,
    tiles: [12, 12, 12],
    color: '#bfe8f5',
  },
  [BLOCK.SNOW]: {
    id: BLOCK.SNOW,
    name: '雪块',
    enName: 'Snow',
    solid: true,
    transparent: false,
    liquid: false,
    breakable: true,
    tiles: [13, 13, 13],
    color: '#f0f6fa',
  },
  [BLOCK.BEDROCK]: {
    id: BLOCK.BEDROCK,
    name: '基岩',
    enName: 'Bedrock',
    solid: true,
    transparent: false,
    liquid: false,
    breakable: false,
    tiles: [14, 14, 14],
    color: '#34363a',
  },
  [BLOCK.COAL_ORE]: {
    id: BLOCK.COAL_ORE,
    name: '煤矿石',
    enName: 'Coal Ore',
    solid: true,
    transparent: false,
    liquid: false,
    breakable: true,
    tiles: [15, 15, 15],
    color: '#4f5459',
  },
  [BLOCK.GOLD_ORE]: {
    id: BLOCK.GOLD_ORE,
    name: '金矿石',
    enName: 'Gold Ore',
    solid: true,
    transparent: false,
    liquid: false,
    breakable: true,
    tiles: [16, 16, 16],
    color: '#d9b53b',
  },
  [BLOCK.GLOWSTONE]: {
    id: BLOCK.GLOWSTONE,
    name: '荧石',
    enName: 'Glowstone',
    solid: true,
    transparent: false,
    liquid: false,
    breakable: true,
    emissive: true,
    tiles: [17, 17, 17],
    color: '#f2cf66',
  },
};

export const HOTBAR_DEFAULTS = [
  BLOCK.GRASS,
  BLOCK.DIRT,
  BLOCK.STONE,
  BLOCK.COBBLESTONE,
  BLOCK.PLANKS,
  BLOCK.WOOD_OAK,
  BLOCK.BRICK,
  BLOCK.GLASS,
  BLOCK.GLOWSTONE,
];

export const PLACEABLE_BLOCKS = [
  BLOCK.GRASS,
  BLOCK.DIRT,
  BLOCK.STONE,
  BLOCK.COBBLESTONE,
  BLOCK.PLANKS,
  BLOCK.WOOD_OAK,
  BLOCK.LEAVES,
  BLOCK.SAND,
  BLOCK.BRICK,
  BLOCK.GLASS,
  BLOCK.SNOW,
  BLOCK.COAL_ORE,
  BLOCK.GOLD_ORE,
  BLOCK.GLOWSTONE,
];

export function isSolidBlock(id) {
  const def = BLOCK_DEFS[id];
  return Boolean(def && def.solid);
}

export function isTransparentBlock(id) {
  const def = BLOCK_DEFS[id];
  return !def || Boolean(def.transparent);
}

export function isLiquidBlock(id) {
  const def = BLOCK_DEFS[id];
  return Boolean(def && def.liquid);
}
