/**
 * Core game definitions, terrain properties, buildings, jobs, traits, and balance constants.
 */

export const MAP_WIDTH = 56;
export const MAP_HEIGHT = 42;
export const TILE_SIZE = 32;

export const TERRAIN = {
  GRASS: 'grass',
  FERTILE: 'fertile',
  DIRT: 'dirt',
  SAND: 'sand',
  WATER_SHALLOW: 'water_shallow',
  WATER_DEEP: 'water_deep',
  ROCK_FLOOR: 'rock_floor',
};

export const TERRAIN_INFO = {
  [TERRAIN.GRASS]: { name: '草地', color: '#4d6b3c', altColor: '#486537', moveCost: 1.0, walkable: true, fertile: 1.0 },
  [TERRAIN.FERTILE]: { name: '肥沃土壤', color: '#3c562c', altColor: '#375028', moveCost: 1.05, walkable: true, fertile: 1.5 },
  [TERRAIN.DIRT]: { name: '泥土', color: '#6e5c45', altColor: '#675640', moveCost: 1.0, walkable: true, fertile: 0.7 },
  [TERRAIN.SAND]: { name: '沙地', color: '#9c8c62', altColor: '#94845b', moveCost: 1.25, walkable: true, fertile: 0.2 },
  [TERRAIN.WATER_SHALLOW]: { name: '浅水', color: '#396882', altColor: '#346078', moveCost: 2.2, walkable: true, fertile: 0 },
  [TERRAIN.WATER_DEEP]: { name: '深水', color: '#24475e', altColor: '#204056', moveCost: Infinity, walkable: false, fertile: 0 },
  [TERRAIN.ROCK_FLOOR]: { name: '岩石地面', color: '#5b5e63', altColor: '#54575c', moveCost: 0.9, walkable: true, fertile: 0 },
};

export const NATURAL_OBJECTS = {
  TREE: 'tree',
  BERRY_BUSH: 'berry_bush',
  ROCK_WALL: 'rock_wall',
  STEEL_ORE: 'steel_ore',
  GOLD_ORE: 'gold_ore',
};

export const NATURAL_INFO = {
  [NATURAL_OBJECTS.TREE]: { name: '橡树', walkable: true, moveCost: 1.2, work: 60, yield: { wood: 25 }, order: 'chop' },
  [NATURAL_OBJECTS.BERRY_BUSH]: { name: '浆果丛', walkable: true, moveCost: 1.1, work: 35, yield: { rawFood: 14 }, order: 'harvest' },
  [NATURAL_OBJECTS.ROCK_WALL]: { name: '花岗岩山体', walkable: false, moveCost: Infinity, work: 110, yield: { stone: 20 }, order: 'mine' },
  [NATURAL_OBJECTS.STEEL_ORE]: { name: '压实钢铁矿', walkable: false, moveCost: Infinity, work: 100, yield: { steel: 30 }, order: 'mine' },
  [NATURAL_OBJECTS.GOLD_ORE]: { name: '金矿脉', walkable: false, moveCost: Infinity, work: 130, yield: { silver: 55 }, order: 'mine' },
};

export const BUILDINGS = {
  WOOD_WALL: 'wood_wall',
  STONE_WALL: 'stone_wall',
  DOOR: 'door',
  BED: 'bed',
  CAMPFIRE: 'campfire',
  TORCH: 'torch',
  SOLAR: 'solar',
  TURRET: 'turret',
  SANDBAG: 'sandbag',
  RESEARCH_BENCH: 'research_bench',
};

export const BUILDING_INFO = {
  [BUILDINGS.WOOD_WALL]: {
    name: '木墙',
    category: 'structure',
    cost: { wood: 10 },
    work: 45,
    maxHp: 140,
    walkable: false,
    cover: 0.75,
    power: 0,
    color: '#8c6239',
    desc: '基础防御与隔断墙体，造价低廉。',
  },
  [BUILDINGS.STONE_WALL]: {
    name: '石墙',
    category: 'structure',
    cost: { stone: 12 },
    work: 75,
    maxHp: 320,
    walkable: false,
    cover: 0.85,
    power: 0,
    color: '#7f848c',
    desc: '坚固耐打的石质防线，适合抵御袭击。',
  },
  [BUILDINGS.DOOR]: {
    name: '木门',
    category: 'structure',
    cost: { wood: 15 },
    work: 50,
    maxHp: 120,
    walkable: true,
    moveCost: 1.15,
    power: 0,
    color: '#a87948',
    desc: '允许殖民者自由通行的出入口。',
  },
  [BUILDINGS.BED]: {
    name: '木床',
    category: 'furniture',
    cost: { wood: 25 },
    work: 70,
    maxHp: 100,
    walkable: true,
    moveCost: 1.3,
    power: 0,
    color: '#4e79a7',
    desc: '提升休息恢复速度并增加舒适心情。',
  },
  [BUILDINGS.CAMPFIRE]: {
    name: '篝火灶台',
    category: 'production',
    cost: { wood: 20 },
    work: 50,
    maxHp: 80,
    walkable: true,
    moveCost: 1.4,
    power: 0,
    lightRadius: 4.5,
    color: '#e07a38',
    desc: '将生食烹制成简单餐食，同时在夜间照明。',
  },
  [BUILDINGS.TORCH]: {
    name: '火把',
    category: 'furniture',
    cost: { wood: 10 },
    work: 25,
    maxHp: 60,
    walkable: true,
    moveCost: 1.0,
    power: 0,
    lightRadius: 5.5,
    color: '#f2b749',
    desc: '驱散黑暗，提升夜间作业效率与安全感。',
  },
  [BUILDINGS.SOLAR]: {
    name: '太阳能板',
    category: 'power',
    cost: { steel: 30 },
    work: 100,
    maxHp: 150,
    walkable: false,
    power: 1200,
    color: '#2c5c8f',
    desc: '白天产生 1200W 电力，为炮塔等设备供能。',
  },
  [BUILDINGS.TURRET]: {
    name: '自动机枪塔',
    category: 'defense',
    cost: { steel: 40 },
    work: 110,
    maxHp: 180,
    walkable: true,
    moveCost: 1.3,
    power: -400,
    range: 8.5,
    damage: 14,
    cooldown: 0.75,
    color: '#9aa5b1',
    desc: '需 400W 电力，自动瞄准并射击 8.5 格内敌人。',
  },
  [BUILDINGS.SANDBAG]: {
    name: '沙袋掩体',
    category: 'defense',
    cost: { steel: 5, wood: 5 },
    work: 35,
    maxHp: 160,
    walkable: true,
    moveCost: 1.6,
    cover: 0.55,
    power: 0,
    color: '#b8a074',
    desc: '减缓敌人移动并为守卫提供远程掩护。',
  },
  [BUILDINGS.RESEARCH_BENCH]: {
    name: '研究台',
    category: 'production',
    cost: { wood: 35, steel: 15 },
    work: 95,
    maxHp: 120,
    walkable: true,
    moveCost: 1.4,
    power: 0,
    color: '#6b5b95',
    desc: '殖民者在此推进科技研究，解锁全局增益。',
  },
};

export const RESOURCE_INFO = {
  wood: { name: '木材', color: '#c48b52', icon: '🪵' },
  steel: { name: '钢铁', color: '#9fb1c1', icon: '⚙️' },
  stone: { name: '石材', color: '#a8acb0', icon: '🪨' },
  rawFood: { name: '生食', color: '#d66853', icon: '🫐' },
  meals: { name: '餐食', color: '#e6b84c', icon: '🍲' },
  medicine: { name: '草药', color: '#58b368', icon: '🌿' },
  silver: { name: '白银', color: '#d9e2ec', icon: '🪙' },
};

export const ZONES = {
  STOCKPILE: 'stockpile',
  GROWING: 'growing',
};

export const JOB_TYPES = {
  IDLE: 'idle',
  CHOP: 'chop',
  MINE: 'mine',
  HARVEST: 'harvest',
  BUILD: 'build',
  SOW: 'sow',
  COOK: 'cook',
  RESEARCH: 'research',
  EAT: 'eat',
  SLEEP: 'sleep',
  RELAX: 'relax',
  FIGHT: 'fight',
  MOVE_DRAFTED: 'move_drafted',
  TEND: 'tend',
};

export const WORK_CATEGORIES = [
  { id: 'medical', label: '医疗' },
  { id: 'cook', label: '烹饪' },
  { id: 'build', label: '建造' },
  { id: 'plant', label: '种植' },
  { id: 'mine', label: '采矿' },
  { id: 'research', label: '研究' },
];

export const TRAITS = [
  { id: 'industrious', name: '勤奋', workSpeed: 1.25, moodMod: 0, desc: '全局工作速度 +25%' },
  { id: 'optimist', name: '乐观', workSpeed: 1.0, moodMod: 10, desc: '基础心情 +10' },
  { id: 'nimble', name: '敏捷', workSpeed: 1.0, moveSpeed: 1.2, moodMod: 0, desc: '移动速度 +20%' },
  { id: 'iron_stomach', name: '铁胃', workSpeed: 1.0, hungerRate: 0.78, moodMod: 0, desc: '饥饿消耗 -22%' },
  { id: 'sharpshooter', name: '神射手', workSpeed: 1.0, combatBonus: 1.3, moodMod: 2, desc: '战斗伤害 +30%' },
  { id: 'night_owl', name: '夜猫子', workSpeed: 1.1, moodMod: 4, desc: '工作效率 +10%，心情 +4' },
];

export const TECH_TREE = [
  { id: 'agriculture', name: '高效农耕', cost: 120, desc: '作物生长速度 +35%，收获量 +25%' },
  { id: 'fortification', name: '强化工事', cost: 160, desc: '所有建筑建造速度 +30%，炮塔伤害 +25%' },
  { id: 'medicine_adv', name: '野战急救', cost: 180, desc: '殖民者自然回血 +50%，治疗效率翻倍' },
  { id: 'solar_grid', name: '高能光伏', cost: 220, desc: '太阳能发电效率 +40%，夜间保留 35% 储能供电' },
];

export const WEATHER_TYPES = {
  CLEAR: { id: 'clear', name: '晴朗', moveMult: 1.0, solarMult: 1.0, tempOffset: 0 },
  RAIN: { id: 'rain', name: '小雨', moveMult: 0.92, solarMult: 0.65, tempOffset: -4 },
  HEATWAVE: { id: 'heatwave', name: '热浪', moveMult: 0.95, solarMult: 1.2, tempOffset: 12 },
  COLDSNAP: { id: 'coldsnap', name: '寒潮', moveMult: 0.9, solarMult: 0.85, tempOffset: -11 },
};

export const DAY_LENGTH_SECONDS = 90; // 90 real seconds = 1 in-game day at 1x speed
