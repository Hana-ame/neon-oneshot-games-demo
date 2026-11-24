/**
 * 核心常量与配置模块
 * 定义物理参数、瓦片类型、实体尺寸及游戏状态枚举
 */

export const TILE_SIZE = 40;

export const PHYSICS = Object.freeze({
  GRAVITY: 1480,
  MAX_FALL_SPEED: 760,
  MOVE_SPEED: 255,
  CLIMB_SPEED: 165,
  JUMP_VELOCITY: -565,
  ROLL_SPEED: 380,
  ROLL_DURATION: 0.34,
  ROLL_COOLDOWN: 0.55,
  COYOTE_TIME: 0.11,
  JUMP_BUFFER: 0.12,
  LEDGE_GRAB_TOLERANCE: 14,
  PUSH_SPEED: 110,
  BULLET_SPEED: 680,
  FIRE_COOLDOWN: 0.19,
  FIXED_DT: 1 / 60,
  MAX_DT: 0.05
});

export const PLAYER_CONFIG = Object.freeze({
  WIDTH: 24,
  HEIGHT: 36,
  CROUCH_HEIGHT: 24,
  MAX_HP: 100,
  INVULN_TIME: 0.9,
  BULLET_DAMAGE: 18
});

export const TILE = Object.freeze({
  EMPTY: 0,
  SOLID: 1,        // 古庙石砖
  MOSS_SOLID: 2,   // 苔藓巨石
  VINE: 3,         // 可攀爬藤蔓/石梯
  SPIKES: 4,       // 地刺陷阱
  CRUMBLE: 5,      // 碎裂石桥
  WATER: 6,        // 地下毒水/深潭
  TORCH: 7,        // 壁挂火把（光源装饰）
  PLATFORM: 8      // 单向石台
});

export const GAME_STATE = Object.freeze({
  TITLE: 'TITLE',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  LEVEL_CLEAR: 'LEVEL_CLEAR',
  GAME_OVER: 'GAME_OVER',
  VICTORY: 'VICTORY'
});

export const PALETTE = Object.freeze({
  bgTop: '#0d1117',
  bgBottom: '#1c1814',
  stoneDark: '#2b2520',
  stoneMid: '#433930',
  stoneLight: '#5e5043',
  moss: '#3d6b47',
  mossLight: '#588c5e',
  gold: '#f5b82e',
  goldGlow: 'rgba(245, 184, 46, 0.45)',
  torchCore: '#fff3c4',
  torchGlow: 'rgba(255, 148, 42, 0.38)',
  laraShirt: '#22a699',
  laraShorts: '#5c4033',
  laraSkin: '#f1c29b',
  laraHair: '#3b2314',
  danger: '#e5484d',
  runeBlue: '#38bdf8'
});
