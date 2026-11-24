/**
 * 经典街机《吃豆人》核心常量与关卡配置
 */

export const TILE_SIZE = 20;
export const MAZE_COLS = 28;
export const MAZE_ROWS = 31;
export const CANVAS_WIDTH = MAZE_COLS * TILE_SIZE;   // 560
export const CANVAS_HEIGHT = MAZE_ROWS * TILE_SIZE;  // 620

export const TILE = Object.freeze({
  EMPTY: 0,
  WALL: 1,
  PELLET: 2,
  POWER: 3,
  GHOST_GATE: 4,
  GHOST_HOUSE: 5,
  TUNNEL: 6,
});

export const DIR = Object.freeze({
  NONE: { name: 'NONE', x: 0, y: 0 },
  UP: { name: 'UP', x: 0, y: -1 },
  DOWN: { name: 'DOWN', x: 0, y: 1 },
  LEFT: { name: 'LEFT', x: -1, y: 0 },
  RIGHT: { name: 'RIGHT', x: 1, y: 0 },
});

export const CARDINAL_DIRS = Object.freeze([DIR.UP, DIR.LEFT, DIR.DOWN, DIR.RIGHT]);

export const OPPOSITE_DIR = Object.freeze({
  UP: DIR.DOWN,
  DOWN: DIR.UP,
  LEFT: DIR.RIGHT,
  RIGHT: DIR.LEFT,
  NONE: DIR.NONE,
});

export const GAME_STATE = Object.freeze({
  TITLE: 'TITLE',
  READY: 'READY',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  DYING: 'DYING',
  LEVEL_CLEAR: 'LEVEL_CLEAR',
  GAME_OVER: 'GAME_OVER',
});

export const GHOST_MODE = Object.freeze({
  SCATTER: 'SCATTER',
  CHASE: 'CHASE',
  FRIGHTENED: 'FRIGHTENED',
  EATEN: 'EATEN',
  HOUSE: 'HOUSE',
});

export const SCORE = Object.freeze({
  PELLET: 10,
  POWER_PELLET: 50,
  GHOST_BASE: 200,
  EXTRA_LIFE_THRESHOLD: 10000,
});

export const FRUIT_TABLE = Object.freeze([
  { name: 'Cherry', label: '樱桃', color: '#ff2e63', points: 100 },
  { name: 'Strawberry', label: '草莓', color: '#ff4d6d', points: 300 },
  { name: 'Orange', label: '橙子', color: '#ff9f1c', points: 500 },
  { name: 'Apple', label: '苹果', color: '#ff3b30', points: 700 },
  { name: 'Melon', label: '甜瓜', color: '#2ec4b6', points: 1000 },
  { name: 'Galaxian', label: '旗舰', color: '#ffd166', points: 2000 },
  { name: 'Bell', label: '金钟', color: '#ffe66d', points: 3000 },
  { name: 'Key', label: '钥匙', color: '#4cc9f0', points: 5000 },
]);

export const GHOST_CONFIGS = Object.freeze([
  {
    id: 'blinky',
    name: 'BLINKY',
    cnName: '追击红影',
    color: '#ff2a54',
    startTile: { col: 13.5, row: 11 },
    scatterTarget: { col: 25, row: -2 },
    releaseDelay: 0,
    startInHouse: false,
  },
  {
    id: 'pinky',
    name: 'PINKY',
    cnName: '伏击粉影',
    color: '#ff85d0',
    startTile: { col: 13.5, row: 14 },
    scatterTarget: { col: 2, row: -2 },
    releaseDelay: 1.5,
    startInHouse: true,
  },
  {
    id: 'inky',
    name: 'INKY',
    cnName: '包抄青影',
    color: '#00f5d4',
    startTile: { col: 11.5, row: 14 },
    scatterTarget: { col: 27, row: 32 },
    releaseDelay: 4.5,
    startInHouse: true,
  },
  {
    id: 'clyde',
    name: 'CLYDE',
    cnName: '游走橙影',
    color: '#ff9e00',
    startTile: { col: 15.5, row: 14 },
    scatterTarget: { col: 0, row: 32 },
    releaseDelay: 8.0,
    startInHouse: true,
  },
]);

export const PACMAN_START = Object.freeze({ col: 13.5, row: 23 });
export const GHOST_HOUSE_EXIT = Object.freeze({ col: 13.5, row: 11 });
export const GHOST_HOUSE_CENTER = Object.freeze({ col: 13.5, row: 14 });
export const FRUIT_SPAWN = Object.freeze({ col: 13.5, row: 17 });
export const TUNNEL_ROW = 14;

/**
 * 根据关卡号返回速度与恐惧时长参数（单位：格/秒、秒）
 */
export function getLevelConfig(level) {
  const lv = Math.max(1, Math.floor(level));
  const fruit = FRUIT_TABLE[Math.min(lv - 1, FRUIT_TABLE.length - 1)];
  return {
    level: lv,
    pacmanSpeed: Math.min(8.2, 6.2 + (lv - 1) * 0.25),
    ghostSpeed: Math.min(7.9, 5.6 + (lv - 1) * 0.28),
    frightenedSpeed: Math.min(4.8, 3.4 + (lv - 1) * 0.15),
    tunnelSpeed: 3.1,
    eatenSpeed: 11.5,
    frightenedDuration: Math.max(2.0, 7.0 - (lv - 1) * 0.7),
    waveSchedule: lv === 1
      ? [
          { mode: GHOST_MODE.SCATTER, duration: 7 },
          { mode: GHOST_MODE.CHASE, duration: 20 },
          { mode: GHOST_MODE.SCATTER, duration: 7 },
          { mode: GHOST_MODE.CHASE, duration: 20 },
          { mode: GHOST_MODE.SCATTER, duration: 5 },
          { mode: GHOST_MODE.CHASE, duration: Infinity },
        ]
      : [
          { mode: GHOST_MODE.SCATTER, duration: 5 },
          { mode: GHOST_MODE.CHASE, duration: 20 },
          { mode: GHOST_MODE.SCATTER, duration: 5 },
          { mode: GHOST_MODE.CHASE, duration: 20 },
          { mode: GHOST_MODE.SCATTER, duration: 4 },
          { mode: GHOST_MODE.CHASE, duration: Infinity },
        ],
    fruit,
  };
}
