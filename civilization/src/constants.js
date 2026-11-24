/**
 * Web Civilization - Game Constants & Data Tables
 * 地形、资源、文明阵营、单位、科技树与建筑配置
 */

export const TERRAIN = {
  ocean:     { id: 'ocean',     name: '深海', food: 1, prod: 0, gold: 1, moveCost: 99, defense: 0, passable: false, color: '#1b3a5c', border: '#142d48' },
  coast:     { id: 'coast',     name: '浅海', food: 1, prod: 0, gold: 2, moveCost: 99, defense: 0, passable: false, color: '#2b5b84', border: '#21486a' },
  grassland: { id: 'grassland', name: '草原', food: 2, prod: 1, gold: 0, moveCost: 1,  defense: 0, passable: true,  color: '#6ca352', border: '#578a40' },
  plains:    { id: 'plains',    name: '平原', food: 1, prod: 2, gold: 0, moveCost: 1,  defense: 0, passable: true,  color: '#a9b35b', border: '#8f9948' },
  desert:    { id: 'desert',    name: '沙漠', food: 0, prod: 1, gold: 1, moveCost: 1,  defense: 0, passable: true,  color: '#d8be7a', border: '#bfa460' },
  tundra:    { id: 'tundra',    name: '冻土', food: 1, prod: 1, gold: 0, moveCost: 1,  defense: 0, passable: true,  color: '#8fa3a0', border: '#758a87' },
  forest:    { id: 'forest',    name: '森林', food: 1, prod: 2, gold: 0, moveCost: 2,  defense: 3, passable: true,  color: '#3c6e47', border: '#2d5736' },
  hills:     { id: 'hills',     name: '丘陵', food: 1, prod: 3, gold: 0, moveCost: 2,  defense: 4, passable: true,  color: '#8d7b5b', border: '#726246' },
  mountain:  { id: 'mountain',  name: '高山', food: 0, prod: 0, gold: 0, moveCost: 99, defense: 0, passable: false, color: '#6b6f78', border: '#52565e' },
};

export const RESOURCES = {
  wheat:    { id: 'wheat',    name: '小麦', icon: '🌾', food: 2, prod: 0, gold: 0, science: 0, terrains: ['grassland', 'plains'] },
  iron:     { id: 'iron',     name: '铁矿', icon: '⛏', food: 0, prod: 2, gold: 0, science: 0, terrains: ['hills', 'plains'] },
  gold_ore: { id: 'gold_ore', name: '金矿', icon: '✦', food: 0, prod: 0, gold: 3, science: 0, terrains: ['hills', 'desert'] },
  horses:   { id: 'horses',   name: '马匹', icon: '♞', food: 1, prod: 1, gold: 0, science: 0, terrains: ['grassland', 'plains'] },
  gems:     { id: 'gems',     name: '宝石', icon: '◆', food: 0, prod: 0, gold: 2, science: 1, terrains: ['forest', 'hills', 'tundra'] },
  fish:     { id: 'fish',     name: '鱼群', icon: '🐟', food: 2, prod: 0, gold: 1, science: 0, terrains: ['coast'] },
};

export const IMPROVEMENTS = {
  farm:  { id: 'farm',  name: '农田', icon: '🌱', food: 2, prod: 0, gold: 0, tech: 'agriculture', terrains: ['grassland', 'plains'] },
  mine:  { id: 'mine',  name: '矿山', icon: '⚒', food: 0, prod: 2, gold: 1, tech: 'mining',      terrains: ['hills', 'forest', 'desert'] },
  trade: { id: 'trade', name: '商站', icon: '⚖', food: 0, prod: 0, gold: 3, tech: 'pottery',     terrains: ['grassland', 'plains', 'desert', 'tundra'] },
};

export const CIVILIZATIONS = {
  huaxia: {
    id: 'huaxia',
    name: '华夏帝国',
    leader: '始皇帝',
    color: '#c83e37',
    lightColor: '#f5b8b4',
    emblem: '龍',
    bonusDesc: '所有城市科研产出 +15%',
    scienceMult: 1.15,
    prodMult: 1.0,
    goldMult: 1.0,
    combatBonus: 0,
    cities: ['长安', '洛阳', '咸阳', '金陵', '姑苏', '成都', '临安', '太原'],
  },
  rome: {
    id: 'rome',
    name: '罗马帝国',
    leader: '凯撒',
    color: '#7c3aed',
    lightColor: '#d8b4fe',
    emblem: '🦅',
    bonusDesc: '所有战斗单位战力 +15%',
    scienceMult: 1.0,
    prodMult: 1.0,
    goldMult: 1.0,
    combatBonus: 0.15,
    cities: ['罗马', '米兰', '庞贝', '拉文纳', '那不勒斯', '佛罗伦萨', '维罗纳', '热那亚'],
  },
  egypt: {
    id: 'egypt',
    name: '古埃及',
    leader: '克娄巴特拉',
    color: '#d97706',
    lightColor: '#fde68a',
    emblem: '☥',
    bonusDesc: '所有城市产能 +15%',
    scienceMult: 1.0,
    prodMult: 1.15,
    goldMult: 1.0,
    combatBonus: 0,
    cities: ['底比斯', '孟菲斯', '亚历山大', '赫利奥波利斯', '阿拜多斯', '卢克索', '吉萨', '阿斯旺'],
  },
  greece: {
    id: 'greece',
    name: '雅典城邦',
    leader: '伯里克利',
    color: '#0284c7',
    lightColor: '#bae6fd',
    emblem: '🏛',
    bonusDesc: '所有城市金币产出 +20%',
    scienceMult: 1.0,
    prodMult: 1.0,
    goldMult: 1.2,
    combatBonus: 0,
    cities: ['雅典', '斯巴达', '科林斯', '底比斯城', '罗德岛', '德尔斐', '米利都', '叙拉古'],
  },
};

export const UNITS = {
  settler:   { id: 'settler',   name: '开拓者', icon: '⚑', cost: 40, goldCost: 140, moves: 2, strength: 0,  ranged: 0,  range: 0, sight: 2, tech: null,          role: 'civilian', desc: '在合适地块建立新城市（消耗自身）' },
  worker:    { id: 'worker',    name: '建造者', icon: '🔨', cost: 30, goldCost: 100, moves: 2, strength: 0,  ranged: 0,  range: 0, sight: 2, tech: null,          role: 'civilian', charges: 3, desc: '修建农田、矿山或商站（可用3次）' },
  scout:     { id: 'scout',     name: '侦察兵', icon: '🧭', cost: 20, goldCost: 70,  moves: 3, strength: 10, ranged: 0,  range: 1, sight: 3, tech: null,          role: 'combat',   desc: '高机动与3格宽广视野，适合探索' },
  warrior:   { id: 'warrior',   name: '勇士',   icon: '⚔', cost: 28, goldCost: 95,  moves: 2, strength: 20, ranged: 0,  range: 1, sight: 2, tech: null,          role: 'combat',   desc: '远古主力近战单位' },
  archer:    { id: 'archer',    name: '弓箭手', icon: '🏹', cost: 36, goldCost: 120, moves: 2, strength: 12, ranged: 22, range: 2, sight: 2, tech: 'archery',     role: 'combat',   desc: '2格远程齐射，避免近战反击' },
  swordsman: { id: 'swordsman', name: '剑士',   icon: '🗡', cost: 50, goldCost: 170, moves: 2, strength: 32, ranged: 0,  range: 1, sight: 2, tech: 'iron_working',role: 'combat',   desc: '重装铁器近战步兵' },
  knight:    { id: 'knight',    name: '骑士',   icon: '🐴', cost: 65, goldCost: 220, moves: 3, strength: 42, ranged: 0,  range: 1, sight: 2, tech: 'iron_working',prereqTech2: 'horseback', role: 'combat', desc: '3格高机动重骑兵，擅长突击' },
  catapult:  { id: 'catapult',  name: '投石机', icon: '☄', cost: 70, goldCost: 240, moves: 2, strength: 14, ranged: 38, range: 2, sight: 2, tech: 'engineering', role: 'combat',   siegeBonus: 1.5, desc: '攻城利器，对城市造成150%伤害' },
};

export const BUILDINGS = {
  granary:           { id: 'granary',           name: '粮仓',     icon: '🏠', cost: 35, goldCost: 120, tech: 'pottery',        food: 2, prod: 0, gold: 0, science: 0, defense: 0,  desc: '+2 食物，加速人口增长' },
  library:           { id: 'library',           name: '图书馆',   icon: '📜', cost: 45, goldCost: 150, tech: 'writing',        food: 0, prod: 0, gold: 0, science: 3, defense: 0,  desc: '+3 科研，推进科技研发' },
  barracks:          { id: 'barracks',          name: '兵营',     icon: '🛡', cost: 45, goldCost: 150, tech: 'bronze_working', food: 0, prod: 2, gold: 0, science: 0, defense: 3,  desc: '+2 产能，新训练战斗单位 +3 战力' },
  market:            { id: 'market',            name: '市场',     icon: '🪙', cost: 50, goldCost: 165, tech: 'writing',        food: 0, prod: 0, gold: 4, science: 0, defense: 0,  desc: '+4 金币，充盈帝国国库' },
  walls:             { id: 'walls',             name: '城墙',     icon: '🏰', cost: 60, goldCost: 200, tech: 'engineering',    food: 0, prod: 0, gold: 0, science: 0, defense: 15, desc: '+15 城防并提升城防生命上限' },
  grand_observatory: { id: 'grand_observatory', name: '大天文台', icon: '🔭', cost: 140,goldCost: 9999,tech: 'astronomy',      food: 0, prod: 0, gold: 0, science: 12,defense: 5,  wonder: true, desc: '世界奇观：建成后立即获得科技胜利！' },
};

export const TECHNOLOGIES = {
  agriculture:    { id: 'agriculture',    name: '农耕',   era: '远古', cost: 0,   prereqs: [],                         col: 0, row: 1, unlocks: ['农田改良'] },
  pottery:        { id: 'pottery',        name: '制陶',   era: '远古', cost: 25,  prereqs: ['agriculture'],            col: 1, row: 0, unlocks: ['粮仓', '商站改良'] },
  mining:         { id: 'mining',         name: '采矿',   era: '远古', cost: 25,  prereqs: ['agriculture'],            col: 1, row: 1, unlocks: ['矿山改良'] },
  archery:        { id: 'archery',        name: '箭术',   era: '远古', cost: 35,  prereqs: ['agriculture'],            col: 1, row: 2, unlocks: ['弓箭手'] },
  writing:        { id: 'writing',        name: '文字',   era: '古典', cost: 45,  prereqs: ['pottery'],                col: 2, row: 0, unlocks: ['图书馆', '市场'] },
  bronze_working: { id: 'bronze_working', name: '青铜器', era: '古典', cost: 45,  prereqs: ['mining'],                 col: 2, row: 1, unlocks: ['兵营'] },
  horseback:      { id: 'horseback',      name: '骑术',   era: '古典', cost: 60,  prereqs: ['archery'],                col: 2, row: 2, unlocks: ['骑士前置'] },
  iron_working:   { id: 'iron_working',   name: '铁器',   era: '古典', cost: 70,  prereqs: ['bronze_working'],         col: 3, row: 1, unlocks: ['剑士', '骑士(需骑术)'] },
  engineering:    { id: 'engineering',    name: '工程学', era: '中世纪', cost: 90, prereqs: ['writing', 'iron_working'], col: 4, row: 0, unlocks: ['城墙', '投石机'] },
  astronomy:      { id: 'astronomy',      name: '天文学', era: '中世纪', cost: 120,prereqs: ['engineering'],            col: 5, row: 0, unlocks: ['大天文台(科技胜利)'] },
};

export const MAX_TURNS = 100;

export const MAP_PRESETS = {
  small:    { id: 'small',    name: '小型 (18×12)', width: 18, height: 12, aiCount: 2 },
  standard: { id: 'standard', name: '标准 (22×14)', width: 22, height: 14, aiCount: 3 },
  large:    { id: 'large',    name: '大型 (26×16)', width: 26, height: 16, aiCount: 3 },
};
