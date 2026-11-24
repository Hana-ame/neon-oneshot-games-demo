/**
 * 网页《传送门》核心常量与配置定义
 */

export const TILE_SIZE = 40;
export const GRID_COLS = 24;
export const GRID_ROWS = 14;
export const WORLD_WIDTH = GRID_COLS * TILE_SIZE;   // 960
export const WORLD_HEIGHT = GRID_ROWS * TILE_SIZE;  // 560

export const FIXED_DT = 1 / 60;

export const PHYSICS = {
  GRAVITY: 1380,            // 重力加速度 (px/s^2)
  MOVE_ACCEL: 2400,         // 地面水平加速度 (px/s^2)
  AIR_ACCEL: 1350,          // 空中水平加速度 (px/s^2)
  MAX_RUN_SPEED: 265,       // 常规奔跑上限 (px/s)
  MAX_SPEED: 1180,          // 绝对速度上限（支持高能弹射）
  GROUND_FRICTION: 0.80,    // 地面水平阻尼（低速时）
  AIR_DRAG: 0.992,          // 空中微小阻力（保留弹射动量）
  JUMP_VELOCITY: -515,      // 跳跃初速度 (px/s)
  COYOTE_TIME: 0.10,        // 土狼时间 (s)
  JUMP_BUFFER: 0.12,        // 跳跃预输入缓冲 (s)
  PORTAL_MIN_EXIT: 260,     // 传送门最小出射速度 (px/s)
  PORTAL_COOLDOWN: 0.16,    // 实体传送冷却时间 (s)
  PORTAL_HALF_SPAN: 26,     // 传送门半宽/半高 (px)
  CUBE_SIZE: 28,            // 同伴方块边长 (px)
  PLAYER_WIDTH: 24,         // 玩家碰撞箱宽 (px)
  PLAYER_HEIGHT: 40,        // 玩家碰撞箱高 (px)
  PICKUP_RADIUS: 68,        // 拾取方块最大距离 (px)
  RAY_STEP: 2,              // 射线步进精度 (px)
  MAX_RAY_DIST: 1400        // 射线最大检测距离 (px)
};

export const TILE = {
  EMPTY: 0,
  PORTAL_WALL: 1,   // 白色光圈月岩混凝土面板（可开启传送门）
  METAL_WALL: 2,    // 深灰金属面板（不可开启传送门）
  HAZARD: 3,        // 腐蚀性测试液池（接触重置）
  FIZZLER: 4        // 物质解离栅栏（玩家可通过，清除传送门并阻挡射线/方块）
};

export const COLORS = {
  BLUE_PORTAL: '#00A8FF',
  BLUE_GLOW: 'rgba(0, 168, 255, 0.45)',
  ORANGE_PORTAL: '#FF7A00',
  ORANGE_GLOW: 'rgba(255, 122, 0, 0.45)',
  BG_DARK: '#11161D',
  CHAMBER_BG: '#E7EDF3',
  CHAMBER_GRID: '#D4DEE8',
  PORTAL_WALL_FILL: '#F8FAFC',
  PORTAL_WALL_STROKE: '#CBD5E1',
  METAL_WALL_FILL: '#2D3748',
  METAL_WALL_STROKE: '#1A202C',
  HAZARD_FILL: '#10B981',
  FIZZLER_FILL: 'rgba(56, 189, 248, 0.35)'
};
