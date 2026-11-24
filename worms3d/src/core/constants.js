/**
 * 百战天虫 3D (Worms 3D Web) - 核心常量与武器配置
 */

export const WORLD_CONFIG = {
  GRID_SIZE: 96,          // 高度场网格分辨率 (96x96 顶点，弹坑边缘更锐利)
  WORLD_SIZE: 80,         // 世界物理尺寸 (-40 ~ +40)
  WATER_LEVEL: 0.0,       // 初始海平面高度
  MAX_HEIGHT: 18.0,       // 最高山峰参考高度
  GRAVITY: 22.0,          // 重力加速度 (m/s^2)
  WIND_MAX: 9.0,          // 最大风速加速度
  TURN_DURATION: 30,      // 每回合行动时间 (秒)
  RETREAT_DURATION: 3.0,  // 开火后撤离时间 (秒)
  SUDDEN_DEATH_ROUND: 8,  // 第8轮后触发海平面上升
  WATER_RISE_STEP: 0.9,   // 突然死亡每轮海平面上升高度
  WORM_RADIUS: 0.95,      // 虫子碰撞半径
  WORM_HEIGHT: 2.0,       // 虫子高度
  WORM_MAX_HP: 100,       // 初始生命值
  WORM_MOVE_SPEED: 6.2,   // 行走速度
  WORM_JUMP_VY: 9.5,      // 跳跃垂直初速度
  WORM_JUMP_VH: 5.5,      // 跳跃水平初速度
  MAX_SLOPE: 1.35,        // 最大可攀爬坡度 (dy/dx)
  FALL_DAMAGE_THRESHOLD: 11.5, // 触发摔落伤害的下落速度阈值
  FALL_DAMAGE_SCALE: 2.2, // 摔落伤害系数
};

export const MAP_THEMES = {
  tropical: {
    id: 'tropical',
    name: '热带火山岛',
    skyTop: 0x38bdf8,
    skyBottom: 0xe0f2fe,
    fogColor: 0xbae6fd,
    waterColor: 0x0284c7,
    waterOpacity: 0.82,
    sandColor: [0.92, 0.84, 0.58],
    grassColor: [0.24, 0.68, 0.28],
    rockColor: [0.46, 0.44, 0.42],
    peakColor: [0.68, 0.72, 0.62],
    scorchColor: [0.11, 0.09, 0.08],
    seedOffset: 101,
  },
  arctic: {
    id: 'arctic',
    name: '冰川要塞',
    skyTop: 0x1e3a8a,
    skyBottom: 0xcffafe,
    fogColor: 0xdbeafe,
    waterColor: 0x0369a1,
    waterOpacity: 0.86,
    sandColor: [0.68, 0.82, 0.92],
    grassColor: [0.88, 0.94, 0.99],
    rockColor: [0.38, 0.48, 0.58],
    peakColor: [0.97, 0.99, 1.0],
    scorchColor: [0.14, 0.18, 0.24],
    seedOffset: 202,
  },
  volcano: {
    id: 'volcano',
    name: '熔岩峡谷',
    skyTop: 0x450a0a,
    skyBottom: 0xfb923c,
    fogColor: 0x7c2d12,
    waterColor: 0xea580c,
    waterOpacity: 0.92,
    sandColor: [0.35, 0.22, 0.18],
    grassColor: [0.28, 0.25, 0.26],
    rockColor: [0.18, 0.16, 0.17],
    peakColor: [0.58, 0.24, 0.16],
    scorchColor: [0.05, 0.04, 0.04],
    seedOffset: 303,
  },
};

export const WEAPONS = {
  bazooka: {
    id: 'bazooka',
    key: '1',
    name: '火箭筒',
    icon: '🚀',
    type: 'projectile',
    ammo: Infinity,
    minSpeed: 10,
    maxSpeed: 38,
    chargeable: true,
    windFactor: 1.0,
    bounces: 0,
    fuseTime: 0,
    blastRadius: 6.2,
    craterDepth: 5.4,
    maxDamage: 45,
    knockback: 18,
    projectileRadius: 0.35,
    color: 0xf97316,
    description: '经典抛物线火箭，受风力影响，蓄力控制射程。',
  },
  grenade: {
    id: 'grenade',
    key: '2',
    name: '手榴弹',
    icon: '💣',
    type: 'projectile',
    ammo: Infinity,
    minSpeed: 8,
    maxSpeed: 30,
    chargeable: true,
    windFactor: 0.0,
    bounces: 5,
    restitution: 0.52,
    fuseTime: 3.0,
    blastRadius: 5.8,
    craterDepth: 5.0,
    maxDamage: 48,
    knockback: 17,
    projectileRadius: 0.32,
    color: 0x22c55e,
    description: '不受风力影响，落地反弹，3秒引信后引爆。',
  },
  cluster: {
    id: 'cluster',
    key: '3',
    name: '集束炸弹',
    icon: '💥',
    type: 'cluster',
    ammo: 3,
    minSpeed: 8,
    maxSpeed: 28,
    chargeable: true,
    windFactor: 0.0,
    bounces: 4,
    restitution: 0.48,
    fuseTime: 2.8,
    blastRadius: 4.8,
    craterDepth: 4.0,
    maxDamage: 30,
    knockback: 13,
    clusterCount: 5,
    subBlastRadius: 3.8,
    subCraterDepth: 3.2,
    subMaxDamage: 24,
    projectileRadius: 0.35,
    color: 0xeab308,
    description: '引爆后分裂出5枚子炸弹，覆盖大片区域。',
  },
  shotgun: {
    id: 'shotgun',
    key: '4',
    name: '霰弹枪',
    icon: '🔫',
    type: 'hitscan',
    ammo: 4,
    range: 42,
    chargeable: false,
    windFactor: 0.0,
    blastRadius: 2.8,
    craterDepth: 2.2,
    maxDamage: 34,
    knockback: 16,
    color: 0x94a3b8,
    description: '瞬发精准直线射击，不受风力影响，击退强。',
  },
  airstrike: {
    id: 'airstrike',
    key: '5',
    name: '空中打击',
    icon: '✈️',
    type: 'airstrike',
    ammo: 2,
    chargeable: true,
    minRange: 10,
    maxRange: 38,
    missileCount: 5,
    missileSpread: 3.2,
    windFactor: 0.45,
    blastRadius: 5.0,
    craterDepth: 4.4,
    maxDamage: 32,
    knockback: 14,
    color: 0xef4444,
    description: '呼叫5枚高空导弹沿瞄准方向地毯式轰炸。',
  },
  bat: {
    id: 'bat',
    key: '6',
    name: '棒球棍',
    icon: '🏏',
    type: 'melee',
    ammo: Infinity,
    chargeable: false,
    meleeRange: 4.2,
    maxDamage: 25,
    knockback: 26,
    color: 0xd97706,
    description: '近战全垒打！将附近敌虫直接击飞落海。',
  },
};

export const WEAPON_LIST = Object.values(WEAPONS);

export const TEAM_PRESETS = [
  {
    id: 0,
    name: '红队先锋',
    colorHex: '#ef4444',
    colorNum: 0xef4444,
    names: ['赤焰虫', '爆破手', '炮兵长', '钢铁虫'],
  },
  {
    id: 1,
    name: '蓝队特攻',
    colorHex: '#3b82f6',
    colorNum: 0x3b82f6,
    names: ['蓝鲨虫', '狙击手', '风暴虫', '极光虫'],
  },
];

export const TURN_PHASE = {
  AIM: 'AIM',
  CHARGING: 'CHARGING',
  PROJECTILE: 'PROJECTILE',
  SETTLE: 'SETTLE',
  RETREAT: 'RETREAT',
  GAME_OVER: 'GAME_OVER',
};
