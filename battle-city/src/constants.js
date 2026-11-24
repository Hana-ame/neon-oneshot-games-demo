// Core constants for FC Battle City Web

export const GRID_SIZE = 26;          // 26x26 sub-tiles (matches classic 13x13 blocks of 2x2 sub-tiles)
export const TILE_SIZE = 16;          // 16x16 logical px per sub-tile
export const FIELD_SIZE = GRID_SIZE * TILE_SIZE; // 416x416 logical battlefield
export const HUD_WIDTH = 96;          // Right classic FC gray sidebar width
export const CANVAS_WIDTH = FIELD_SIZE + HUD_WIDTH; // 512px logical width
export const CANVAS_HEIGHT = FIELD_SIZE;            // 416px logical height

export const TANK_SIZE = 28;          // Slightly smaller than 32px (2x2 sub-tiles) for smooth corridor turning
export const BULLET_SIZE = 6;

export const DIR = Object.freeze({
  UP: 0,
  RIGHT: 1,
  DOWN: 2,
  LEFT: 3,
});

export const DIR_VECTORS = Object.freeze({
  [DIR.UP]: { dx: 0, dy: -1 },
  [DIR.RIGHT]: { dx: 1, dy: 0 },
  [DIR.DOWN]: { dx: 0, dy: 1 },
  [DIR.LEFT]: { dx: -1, dy: 0 },
});

export const TILE = Object.freeze({
  EMPTY: 0,
  BRICK: 1,
  STEEL: 2,
  FOREST: 3,
  WATER: 4,
  ICE: 5,
  BASE: 6,
  BASE_DESTROYED: 7,
});

export const GAME_STATE = Object.freeze({
  MENU: 'MENU',
  STAGE_INTRO: 'STAGE_INTRO',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  STAGE_CLEAR: 'STAGE_CLEAR',
  GAME_OVER: 'GAME_OVER',
});

export const ENEMY_TYPE = Object.freeze({
  BASIC: 'BASIC',
  FAST: 'FAST',
  POWER: 'POWER',
  ARMOR: 'ARMOR',
});

export const ENEMY_SPECS = Object.freeze({
  [ENEMY_TYPE.BASIC]: {
    hp: 1,
    speed: 78,
    bulletSpeed: 210,
    score: 100,
    fireInterval: 1.5,
    color: '#d4d4d8',
    label: '普通坦克',
  },
  [ENEMY_TYPE.FAST]: {
    hp: 1,
    speed: 128,
    bulletSpeed: 230,
    score: 200,
    fireInterval: 1.25,
    color: '#93c5fd',
    label: '高速坦克',
  },
  [ENEMY_TYPE.POWER]: {
    hp: 1,
    speed: 92,
    bulletSpeed: 320,
    score: 300,
    fireInterval: 0.95,
    color: '#fca5a5',
    label: '速射坦克',
  },
  [ENEMY_TYPE.ARMOR]: {
    hp: 4,
    speed: 74,
    bulletSpeed: 240,
    score: 400,
    fireInterval: 1.2,
    color: '#86efac',
    label: '重装坦克',
  },
});

export const PLAYER_LEVEL_SPECS = Object.freeze([
  { level: 0, speed: 108, bulletSpeed: 245, maxBullets: 1, canBreakSteel: false, fireCooldown: 0.34 },
  { level: 1, speed: 114, bulletSpeed: 320, maxBullets: 1, canBreakSteel: false, fireCooldown: 0.28 },
  { level: 2, speed: 118, bulletSpeed: 335, maxBullets: 2, canBreakSteel: false, fireCooldown: 0.22 },
  { level: 3, speed: 122, bulletSpeed: 355, maxBullets: 2, canBreakSteel: true,  fireCooldown: 0.20 },
]);

export const POWERUP_TYPE = Object.freeze({
  HELMET: 'HELMET',   // Temporary invincibility shield
  CLOCK: 'CLOCK',     // Freeze all enemies
  SHOVEL: 'SHOVEL',   // Fortify base perimeter with steel
  STAR: 'STAR',       // Upgrade player firepower level
  GRENADE: 'GRENADE', // Destroy all active enemies on field
  TANK: 'TANK',       // Extra life (+1UP)
});

export const POWERUP_LIST = Object.freeze(Object.values(POWERUP_TYPE));
export const POWERUP_SCORE = 500;
export const EXTRA_LIFE_SCORE = 20000;

export const TIMINGS = Object.freeze({
  SPAWN_ANIM_DURATION: 0.9,
  PLAYER_RESPAWN_SHIELD: 3.0,
  HELMET_DURATION: 10.0,
  CLOCK_DURATION: 10.0,
  SHOVEL_DURATION: 15.0,
  SHOVEL_WARN_DURATION: 3.0,
  POWERUP_LIFETIME: 12.0,
  ENEMY_SPAWN_INTERVAL: 2.6,
  STAGE_INTRO_DURATION: 1.8,
  STAGE_CLEAR_DELAY: 2.0,
  BASE_GAMEOVER_DELAY: 2.2,
});

export const MAX_ACTIVE_ENEMIES_1P = 4;
export const MAX_ACTIVE_ENEMIES_2P = 6;

// Base coordinates in sub-tile grid (rows 24-25, cols 12-13)
export const BASE_TILES = Object.freeze([
  { r: 24, c: 12 },
  { r: 24, c: 13 },
  { r: 25, c: 12 },
  { r: 25, c: 13 },
]);

// Base protective wall ring (8 sub-tiles around the eagle)
export const BASE_WALL_TILES = Object.freeze([
  { r: 23, c: 11 },
  { r: 23, c: 12 },
  { r: 23, c: 13 },
  { r: 23, c: 14 },
  { r: 24, c: 11 },
  { r: 24, c: 14 },
  { r: 25, c: 11 },
  { r: 25, c: 14 },
]);

// Classic spawn sub-tile top-left origins (each tank occupies ~2x2 sub-tiles)
export const ENEMY_SPAWN_POINTS = Object.freeze([
  { x: 2, y: 2 },
  { x: 12 * TILE_SIZE + 2, y: 2 },
  { x: 24 * TILE_SIZE + 2, y: 2 },
]);

export const PLAYER_SPAWN_POINTS = Object.freeze([
  { x: 8 * TILE_SIZE + 2, y: 24 * TILE_SIZE + 2 },   // P1: left of base
  { x: 16 * TILE_SIZE + 2, y: 24 * TILE_SIZE + 2 },  // P2: right of base
]);

// Indices (0-based out of 20 enemies) that spawn as red flashing bonus carriers
export const BONUS_ENEMY_INDICES = Object.freeze([3, 10, 17]);
