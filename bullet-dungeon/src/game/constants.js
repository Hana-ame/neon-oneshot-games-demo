// Core Game Constants, Weapons, Enemy Archetypes, and Floor Themes

export const ROOM_W = 860;
export const ROOM_H = 540;
export const WALL_T = 44;
export const DOOR_W = 84;

export const PLAYER_CONFIG = {
  radius: 14,
  speed: 245,
  rollSpeed: 470,
  rollDuration: 0.42,
  rollIFrames: 0.30, // First 0.30s of dodge roll are invulnerable
  rollCooldown: 0.20,
  hitIFrames: 0.90,
  maxHp: 6, // 6 half-hearts = 3 full hearts
  startArmor: 1,
  startBlanks: 2,
  blankRadius: 520,
  blankPushForce: 320
};

export const WEAPONS = [
  {
    id: 'rusty_sidearm',
    name: '生锈左轮',
    shortName: '左轮',
    damage: 14,
    fireRate: 0.24,
    projectileSpeed: 640,
    projectileRadius: 5,
    spread: 0.05,
    pellets: 1,
    magSize: 8,
    maxAmmo: Infinity,
    reloadTime: 0.85,
    color: '#ffd166',
    sound: 'pistol',
    pierce: 0,
    knockback: 70
  },
  {
    id: 'scatter_gun',
    name: '地牢霰弹枪',
    shortName: '霰弹',
    damage: 10,
    fireRate: 0.62,
    projectileSpeed: 560,
    projectileRadius: 5,
    spread: 0.32,
    pellets: 6,
    magSize: 5,
    maxAmmo: 60,
    reloadTime: 1.15,
    color: '#ff7b54',
    sound: 'shotgun',
    pierce: 0,
    knockback: 110
  },
  {
    id: 'clockwork_smg',
    name: '发条冲锋枪',
    shortName: '冲锋',
    damage: 8,
    fireRate: 0.095,
    projectileSpeed: 700,
    projectileRadius: 4,
    spread: 0.14,
    pellets: 1,
    magSize: 28,
    maxAmmo: 280,
    reloadTime: 1.05,
    color: '#63e6be',
    sound: 'smg',
    pierce: 0,
    knockback: 35
  },
  {
    id: 'arcane_rail',
    name: '奥术脉冲炮',
    shortName: '脉冲',
    damage: 42,
    fireRate: 0.78,
    projectileSpeed: 960,
    projectileRadius: 6,
    spread: 0.01,
    pellets: 1,
    magSize: 4,
    maxAmmo: 36,
    reloadTime: 1.35,
    color: '#74c0fc',
    sound: 'railgun',
    pierce: 2,
    knockback: 160
  }
];

export const ENEMY_TYPES = {
  bullet_kin: {
    id: 'bullet_kin',
    name: '弹壳兵',
    hp: 36,
    radius: 14,
    speed: 96,
    color: '#e9c46a',
    accent: '#9c6644',
    score: 100,
    fireCooldown: 1.35,
    bulletSpeed: 230,
    pattern: 'aimed'
  },
  shotgun_kin: {
    id: 'shotgun_kin',
    name: '霰弹兵',
    hp: 58,
    radius: 16,
    speed: 78,
    color: '#e76f51',
    accent: '#b5179e',
    score: 160,
    fireCooldown: 2.0,
    bulletSpeed: 215,
    pattern: 'fan5'
  },
  spiral_turret: {
    id: 'spiral_turret',
    name: '回旋炮塔',
    hp: 64,
    radius: 17,
    speed: 0,
    color: '#8ecae6',
    accent: '#219ebc',
    score: 180,
    fireCooldown: 0.45,
    bulletSpeed: 195,
    pattern: 'spiral'
  },
  sniper_ghost: {
    id: 'sniper_ghost',
    name: '幽影狙手',
    hp: 42,
    radius: 13,
    speed: 112,
    color: '#c77dff',
    accent: '#5a189a',
    score: 170,
    fireCooldown: 2.2,
    bulletSpeed: 360,
    pattern: 'burst3'
  },
  dasher_imp: {
    id: 'dasher_imp',
    name: '冲锋魔偶',
    hp: 48,
    radius: 14,
    speed: 142,
    color: '#ff4d6d',
    accent: '#800f2f',
    score: 150,
    fireCooldown: 1.8,
    bulletSpeed: 200,
    pattern: 'ring8'
  }
};

export const FLOOR_THEMES = [
  {
    floor: 1,
    name: '第一层 · 铅弹地窖',
    bossName: '加特林领主',
    bossHp: 460,
    floorBg: '#1c1f2b',
    tileAlt: '#222636',
    wallColor: '#363b52',
    wallTop: '#4c5370',
    accent: '#ffb703'
  },
  {
    floor: 2,
    name: '第二层 · 硝烟铸造厂',
    bossName: '熔炉魔像',
    bossHp: 640,
    floorBg: '#241b1e',
    tileAlt: '#2d2125',
    wallColor: '#4c3438',
    wallTop: '#6b474d',
    accent: '#fb5607'
  },
  {
    floor: 3,
    name: '第三层 · 枪神圣殿',
    bossName: '弹幕执政官',
    bossHp: 820,
    floorBg: '#171c28',
    tileAlt: '#1e2536',
    wallColor: '#303b59',
    wallTop: '#485885',
    accent: '#4cc9f0'
  }
];

export const SHOP_ITEMS = [
  { id: 'heart', name: '回复红心 (+2 HP)', cost: 18, type: 'heart' },
  { id: 'armor', name: '护甲片 (+1 护甲)', cost: 24, type: 'armor' },
  { id: 'blank', name: '空白清弹 (+1 空白弹)', cost: 16, type: 'blank' },
  { id: 'ammo', name: '弹药补给箱 (全武器补满)', cost: 20, type: 'ammo' }
];
