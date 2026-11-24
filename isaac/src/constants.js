export const CANVAS_WIDTH = 960;
export const CANVAS_HEIGHT = 640;

export const WALL_THICKNESS = 72;
export const TILE_SIZE = 48;
export const GRID_COLS = 15; // 15 * 48 = 720, plus margins
export const GRID_ROWS = 9;  // 9 * 48 = 432

export const ROOM_LEFT = WALL_THICKNESS;
export const ROOM_RIGHT = CANVAS_WIDTH - WALL_THICKNESS;
export const ROOM_TOP = WALL_THICKNESS + 24; // Extra space for top HUD bar
export const ROOM_BOTTOM = CANVAS_HEIGHT - WALL_THICKNESS + 16;
export const ROOM_WIDTH = ROOM_RIGHT - ROOM_LEFT;
export const ROOM_HEIGHT = ROOM_BOTTOM - ROOM_TOP;

export const DOOR_SIZE = 66;

export const DIRECTIONS = {
  NORTH: { key: 'NORTH', dx: 0, dy: -1, opposite: 'SOUTH' },
  SOUTH: { key: 'SOUTH', dx: 0, dy: 1, opposite: 'NORTH' },
  WEST:  { key: 'WEST',  dx: -1, dy: 0, opposite: 'EAST' },
  EAST:  { key: 'EAST',  dx: 1, dy: 0, opposite: 'WEST' }
};

export const DIR_LIST = [DIRECTIONS.NORTH, DIRECTIONS.SOUTH, DIRECTIONS.WEST, DIRECTIONS.EAST];

export const ROOM_TYPES = {
  START: 'START',
  NORMAL: 'NORMAL',
  TREASURE: 'TREASURE',
  SHOP: 'SHOP',
  BOSS: 'BOSS'
};

export const TILE_TYPES = {
  EMPTY: 0,
  ROCK: 1,
  TINTED_ROCK: 2,
  SPIKES: 3,
  PIT: 4,
  POOP: 5
};

export const FLOOR_THEMES = [
  {
    level: 1,
    name: '地下室 I',
    subtitle: 'Basement I',
    floorColor: '#3a2c24',
    floorAlt: '#342720',
    wallColor: '#241a15',
    wallTrim: '#4c382c',
    rockColor: '#695b52',
    bossType: 'MONSTRO'
  },
  {
    level: 2,
    name: '地下室 II',
    subtitle: 'Basement II',
    floorColor: '#352623',
    floorAlt: '#2e201e',
    wallColor: '#1f1514',
    wallTrim: '#4b312d',
    rockColor: '#60524e',
    bossType: 'DUKE'
  },
  {
    level: 3,
    name: '深邃洞穴 I',
    subtitle: 'Caves I',
    floorColor: '#262b30',
    floorAlt: '#21262b',
    wallColor: '#161a1e',
    wallTrim: '#39434d',
    rockColor: '#56606b',
    bossType: 'HEART'
  }
];

export const BASE_PLAYER_STATS = {
  maxRedHearts: 6,       // 6 half-hearts = 3 full red hearts
  redHearts: 6,
  soulHearts: 0,
  speed: 240,            // pixels / sec
  damage: 3.5,
  tearRate: 2.8,         // tears / sec
  tearSpeed: 420,        // pixels / sec
  range: 340,            // pixels before drop
  tearSize: 9,
  shotCount: 1,
  homing: false,
  piercing: false,
  bouncing: false,
  poison: false,
  damageMultiplier: 1.0
};

export const ENEMY_CONFIGS = {
  FLY: {
    id: 'FLY',
    name: '攻击苍蝇',
    hp: 6,
    speed: 105,
    radius: 13,
    flying: true,
    color: '#1e1b22',
    accent: '#e03e3e',
    score: 25
  },
  GAPER: {
    id: 'GAPER',
    name: '哭泣游走者',
    hp: 12,
    speed: 98,
    radius: 18,
    flying: false,
    color: '#d9a49c',
    accent: '#8a2b2b',
    score: 40
  },
  SPIDER: {
    id: 'SPIDER',
    name: '地牢蜘蛛',
    hp: 8,
    speed: 215,
    radius: 12,
    flying: false,
    color: '#221d24',
    accent: '#c43b3b',
    score: 35
  },
  SHOOTER: {
    id: 'SHOOTER',
    name: '吐血浮头',
    hp: 14,
    speed: 68,
    radius: 17,
    flying: true,
    color: '#c98882',
    accent: '#a81c1c',
    fireInterval: 1.8,
    score: 55
  },
  CHARGER: {
    id: 'CHARGER',
    name: '冲锋蛆虫',
    hp: 16,
    speed: 85,
    chargeSpeed: 280,
    radius: 17,
    flying: false,
    color: '#d6c29f',
    accent: '#b83227',
    score: 60
  },
  MONSTRO: {
    id: 'MONSTRO',
    name: '巨口畸形 · 蒙斯特罗',
    hp: 110,
    speed: 90,
    radius: 38,
    flying: false,
    isBoss: true,
    color: '#d48d88',
    accent: '#7a1c1c',
    score: 300
  },
  DUKE: {
    id: 'DUKE',
    name: '苍蝇公爵',
    hp: 135,
    speed: 95,
    radius: 40,
    flying: true,
    isBoss: true,
    color: '#8f9c7f',
    accent: '#4a593d',
    score: 400
  },
  HEART: {
    id: 'HEART',
    name: '深渊之心',
    hp: 180,
    speed: 55,
    radius: 44,
    flying: true,
    isBoss: true,
    color: '#a82332',
    accent: '#ff4d6d',
    score: 600
  }
};
