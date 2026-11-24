// Core constants for Super Meat Boy Web

export const TILE_SIZE = 32;
export const FIXED_DT = 1 / 60;
export const MAX_FRAME_DT = 0.05;

export const PHYSICS = {
  // Horizontal movement (px/s and px/s^2)
  WALK_MAX_SPEED: 255,
  SPRINT_MAX_SPEED: 385,
  GROUND_ACCEL: 2900,
  GROUND_DECEL: 3400,
  AIR_ACCEL: 2100,
  AIR_DECEL: 950,

  // Gravity & Jumping
  GRAVITY: 1850,
  FALL_GRAVITY_MULTIPLIER: 1.25,
  MAX_FALL_SPEED: 740,
  JUMP_VELOCITY: -575,
  SPRINT_JUMP_BONUS: -42,
  JUMP_CUT_MULTIPLIER: 0.45,

  // Wall mechanics
  WALL_SLIDE_MAX_SPEED: 145,
  WALL_JUMP_VX: 345,
  WALL_JUMP_SPRINT_VX: 410,
  WALL_JUMP_VY: -545,
  WALL_JUMP_LOCK_TIME: 0.11,

  // Forgiveness timers (seconds)
  COYOTE_TIME: 0.095,
  JUMP_BUFFER_TIME: 0.105,
  WALL_COYOTE_TIME: 0.09,

  // Special tiles
  BOUNCE_VELOCITY: -760,
  CRUMBLE_DELAY: 0.36,
  CRUMBLE_RESPAWN: 2.2,

  // Player hitbox (smaller than TILE_SIZE for forgiving platforming)
  PLAYER_WIDTH: 22,
  PLAYER_HEIGHT: 22,

  // Death / Respawn
  RESPAWN_DELAY: 0.32,
};

export const TILE = {
  EMPTY: '.',
  SOLID: '#',
  SPIKE_UP: '^',
  SPIKE_DOWN: 'v',
  SPIKE_LEFT: '<',
  SPIKE_RIGHT: '>',
  CRUMBLE: 'C',
  BOUNCE: 'B',
  SPAWN: 'S',
  GOAL: 'G',
  BANDAGE: 'H',
};

export const GAME_STATE = {
  MENU: 'MENU',
  PLAYING: 'PLAYING',
  DYING: 'DYING',
  REPLAY: 'REPLAY',
  LEVEL_CLEAR: 'LEVEL_CLEAR',
  PAUSED: 'PAUSED',
  VICTORY: 'VICTORY',
};

export const CHAPTER_THEMES = {
  forest: {
    name: '第一章 · 森林',
    bgTop: '#16221c',
    bgBottom: '#0d1511',
    gridColor: 'rgba(116, 198, 157, 0.045)',
    tileFill: '#3b2d22',
    tileTop: '#4e8f44',
    tileStroke: '#241a13',
    accent: '#52b788',
  },
  factory: {
    name: '第二章 · 盐厂',
    bgTop: '#1d222b',
    bgBottom: '#11141a',
    gridColor: 'rgba(148, 163, 184, 0.05)',
    tileFill: '#3c4252',
    tileTop: '#717b91',
    tileStroke: '#1e222b',
    accent: '#94a3b8',
  },
  hell: {
    name: '第三章 · 炼狱',
    bgTop: '#2a1215',
    bgBottom: '#14080a',
    gridColor: 'rgba(248, 113, 113, 0.05)',
    tileFill: '#4a1d1f',
    tileTop: '#991b1b',
    tileStroke: '#260c0e',
    accent: '#f87171',
  },
};
