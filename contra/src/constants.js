// 游戏全局常量与配置参数

export const GAME_WIDTH = 480;
export const GAME_HEIGHT = 270;
export const FIXED_DT = 1 / 60;

export const GRAVITY = 820;
export const MAX_FALL_SPEED = 420;

export const PLAYER_CONFIG = {
  WIDTH: 16,
  HEIGHT: 30,
  PRONE_WIDTH: 26,
  PRONE_HEIGHT: 12,
  SWIM_HEIGHT: 16,
  SPEED: 118,
  JUMP_VELOCITY: -315,
  INVINCIBLE_DURATION: 2.2,
  DEFAULT_LIVES: 3,
  KONAMI_LIVES: 30,
  EXTRA_LIFE_SCORE: 20000
};

export const GAME_STATES = {
  TITLE: 'TITLE',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  STAGE_CLEAR: 'STAGE_CLEAR',
  GAME_OVER: 'GAME_OVER',
  VICTORY: 'VICTORY'
};

export const WEAPONS = {
  R: {
    id: 'R',
    name: '步枪',
    shortName: 'R',
    cooldown: 0.17,
    speed: 320,
    damage: 1,
    color: '#fef08a',
    radius: 2.5,
    maxBullets: 6,
    pierce: false
  },
  M: {
    id: 'M',
    name: '机枪',
    shortName: 'M',
    cooldown: 0.095,
    speed: 370,
    damage: 1.2,
    color: '#fb923c',
    radius: 3.2,
    maxBullets: 10,
    pierce: false
  },
  S: {
    id: 'S',
    name: '散弹枪',
    shortName: 'S',
    cooldown: 0.24,
    speed: 300,
    damage: 1,
    color: '#f43f5e',
    radius: 3.5,
    maxBullets: 15,
    spreadAngles: [-0.42, -0.21, 0, 0.21, 0.42],
    pierce: false
  },
  L: {
    id: 'L',
    name: '激光枪',
    shortName: 'L',
    cooldown: 0.28,
    speed: 440,
    damage: 2.5,
    color: '#38bdf8',
    radius: 4,
    maxBullets: 6,
    pierce: true
  },
  F: {
    id: 'F',
    name: '火球枪',
    shortName: 'F',
    cooldown: 0.22,
    speed: 250,
    damage: 2,
    color: '#f97316',
    radius: 4.5,
    maxBullets: 6,
    spiral: true,
    pierce: false
  }
};

export const SCORE_VALUES = {
  RUNNER: 100,
  SNIPER: 200,
  TURRET: 500,
  CAPSULE: 500,
  POWERUP: 1000,
  BOSS_TURRET: 1500,
  BOSS_CORE: 5000,
  STAGE_CLEAR: 3000
};

export const KONAMI_SEQUENCE = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'KeyB',
  'KeyA'
];
