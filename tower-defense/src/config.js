/**
 * 游戏核心静态配置：地图、防御塔、敌人属性、波次生成器
 */

export const COLS = 16;
export const ROWS = 10;
export const TILE = 60;
export const LOGICAL_W = COLS * TILE; // 960
export const LOGICAL_H = ROWS * TILE; // 600
export const MAX_STANDARD_WAVES = 15;

export const MAPS = {
  canyon: {
    name: '蜿蜒峡谷',
    startGold: 160,
    paths: [
      [
        { c: 0, r: 2 }, { c: 4, r: 2 }, { c: 4, r: 7 }, { c: 8, r: 7 },
        { c: 8, r: 1 }, { c: 12, r: 1 }, { c: 12, r: 7 }, { c: 15, r: 7 }
      ]
    ]
  },
  crossroad: {
    name: '十字要塞',
    startGold: 170,
    paths: [
      [
        { c: 0, r: 4 }, { c: 10, r: 4 }, { c: 10, r: 1 }, { c: 5, r: 1 },
        { c: 5, r: 8 }, { c: 13, r: 8 }, { c: 13, r: 4 }, { c: 15, r: 4 }
      ]
    ]
  },
  twin: {
    name: '双线突围',
    startGold: 190,
    paths: [
      [
        { c: 0, r: 1 }, { c: 6, r: 1 }, { c: 6, r: 4 }, { c: 11, r: 4 },
        { c: 11, r: 5 }, { c: 15, r: 5 }
      ],
      [
        { c: 0, r: 8 }, { c: 6, r: 8 }, { c: 6, r: 5 }, { c: 11, r: 5 },
        { c: 15, r: 5 }
      ]
    ]
  }
};

export const TOWER_TYPES = [
  {
    id: 'gatling',
    key: '1',
    name: '机枪塔',
    short: '高射速 · 单体',
    desc: '超高射速的动能机枪，性价比极高，适合清理轻型目标。',
    color: '#38bdf8',
    accent: '#bae6fd',
    cost: 50,
    levels: [
      { damage: 15, range: 135, fireRate: 3.1, upgradeCost: 45 },
      { damage: 25, range: 155, fireRate: 3.8, upgradeCost: 85 },
      { damage: 42, range: 175, fireRate: 4.8, upgradeCost: 0 }
    ]
  },
  {
    id: 'frost',
    key: '2',
    name: '冰霜塔',
    short: '减速 · 控场',
    desc: '发射低温结晶使敌人大幅减速，为其他炮塔争取输出时间。',
    color: '#22d3ee',
    accent: '#a5f3fc',
    cost: 75,
    levels: [
      { damage: 10, range: 130, fireRate: 1.4, slowFactor: 0.62, slowDur: 2.0, splash: 42, upgradeCost: 60 },
      { damage: 18, range: 148, fireRate: 1.7, slowFactor: 0.50, slowDur: 2.5, splash: 55, upgradeCost: 105 },
      { damage: 30, range: 168, fireRate: 2.1, slowFactor: 0.38, slowDur: 3.0, splash: 70, upgradeCost: 0 }
    ]
  },
  {
    id: 'cannon',
    key: '3',
    name: '加农炮',
    short: '范围爆炸 · AOE',
    desc: '重型榴弹炮，造成大范围溅射伤害，专克密集敌群。',
    color: '#f97316',
    accent: '#fed7aa',
    cost: 100,
    levels: [
      { damage: 42, range: 145, fireRate: 0.85, splash: 68, upgradeCost: 80 },
      { damage: 76, range: 162, fireRate: 0.98, splash: 82, upgradeCost: 140 },
      { damage: 135, range: 182, fireRate: 1.15, splash: 98, upgradeCost: 0 }
    ]
  },
  {
    id: 'tesla',
    key: '4',
    name: '电磁塔',
    short: '连锁闪电 · 破甲',
    desc: '释放跳跃电弧同时打击多名敌人，无视重甲减伤。',
    color: '#a855f7',
    accent: '#e9d5ff',
    cost: 120,
    levels: [
      { damage: 28, range: 135, fireRate: 1.35, chains: 3, chainRange: 105, upgradeCost: 95 },
      { damage: 50, range: 152, fireRate: 1.6, chains: 4, chainRange: 120, upgradeCost: 160 },
      { damage: 88, range: 170, fireRate: 1.9, chains: 5, chainRange: 135, upgradeCost: 0 }
    ]
  },
  {
    id: 'laser',
    key: '5',
    name: '棱镜激光',
    short: '远程 · 破甲/Boss',
    desc: '锁定目标持续聚焦射线，射程极远且无视护甲，专克重甲与 Boss。',
    color: '#f43f5e',
    accent: '#fecdd3',
    cost: 135,
    levels: [
      { damage: 65, range: 195, fireRate: 1.0, armorPierce: true, upgradeCost: 110 },
      { damage: 125, range: 220, fireRate: 1.0, armorPierce: true, upgradeCost: 185 },
      { damage: 220, range: 248, fireRate: 1.0, armorPierce: true, upgradeCost: 0 }
    ]
  }
];

export const TOWER_MAP = Object.fromEntries(TOWER_TYPES.map((t) => [t.id, t]));

export const ENEMY_TYPES = {
  scout:    { name: '侦察兵', hp: 46,   speed: 86,  reward: 8,   armor: 0,    radius: 11, color: '#facc15', damage: 1 },
  soldier:  { name: '步兵',   hp: 95,   speed: 60,  reward: 11,  armor: 0,    radius: 13, color: '#fb7185', damage: 1 },
  sprinter: { name: '疾行者', hp: 65,   speed: 112, reward: 12,  armor: 0,    radius: 10, color: '#34d399', damage: 1 },
  tank:     { name: '重甲兵', hp: 280,  speed: 38,  reward: 22,  armor: 0.35, radius: 16, color: '#94a3b8', damage: 2 },
  splitter: { name: '分裂体', hp: 165,  speed: 54,  reward: 18,  armor: 0.1,  radius: 14, color: '#c084fc', damage: 1, splits: true },
  mini:     { name: '子体',   hp: 45,   speed: 88,  reward: 4,   armor: 0,    radius: 8,  color: '#e879f9', damage: 1 },
  healer:   { name: '治疗师', hp: 155,  speed: 52,  reward: 20,  armor: 0,    radius: 13, color: '#4ade80', damage: 1, heals: true },
  boss:     { name: '毁灭者', hp: 1450, speed: 30,  reward: 110, armor: 0.3,  radius: 22, color: '#ef4444', damage: 5, isBoss: true }
};

export function buildWaveConfig(waveNum) {
  const presets = [
    [{ type: 'scout', count: 10, interval: 0.85 }],
    [{ type: 'soldier', count: 10, interval: 0.9 }, { type: 'scout', count: 5, interval: 0.65 }],
    [{ type: 'sprinter', count: 12, interval: 0.65 }, { type: 'soldier', count: 6, interval: 0.85 }],
    [{ type: 'tank', count: 5, interval: 1.5 }, { type: 'scout', count: 10, interval: 0.6 }],
    [{ type: 'soldier', count: 8, interval: 0.8 }, { type: 'boss', count: 1, interval: 2.0 }],
    [{ type: 'splitter', count: 8, interval: 1.0 }, { type: 'sprinter', count: 10, interval: 0.55 }],
    [{ type: 'tank', count: 7, interval: 1.3 }, { type: 'healer', count: 4, interval: 1.6 }],
    [{ type: 'sprinter', count: 22, interval: 0.4 }],
    [{ type: 'splitter', count: 10, interval: 0.85 }, { type: 'tank', count: 6, interval: 1.25 }],
    [{ type: 'healer', count: 4, interval: 1.2 }, { type: 'tank', count: 6, interval: 1.1 }, { type: 'boss', count: 1, interval: 2.2 }],
    [{ type: 'scout', count: 20, interval: 0.35 }, { type: 'splitter', count: 10, interval: 0.75 }],
    [{ type: 'tank', count: 10, interval: 1.0 }, { type: 'healer', count: 6, interval: 1.2 }],
    [{ type: 'sprinter', count: 25, interval: 0.32 }, { type: 'splitter', count: 12, interval: 0.65 }],
    [{ type: 'tank', count: 12, interval: 0.85 }, { type: 'healer', count: 6, interval: 1.0 }, { type: 'boss', count: 1, interval: 2.0 }],
    [{ type: 'tank', count: 8, interval: 0.9 }, { type: 'healer', count: 5, interval: 1.0 }, { type: 'boss', count: 2, interval: 3.2 }]
  ];

  const hpScale = waveNum <= 15
    ? 1 + (waveNum - 1) * 0.18
    : (1 + 14 * 0.18) * Math.pow(1.22, waveNum - 15);

  let groups;
  if (waveNum <= presets.length) {
    groups = presets[waveNum - 1];
  } else {
    const extra = waveNum - 15;
    groups = [
      { type: 'sprinter', count: 14 + extra * 2, interval: 0.35 },
      { type: 'splitter', count: 8 + extra, interval: 0.65 },
      { type: 'tank', count: 6 + extra, interval: 0.85 },
      { type: 'healer', count: 4 + Math.floor(extra / 2), interval: 1.1 }
    ];
    if (waveNum % 5 === 0) {
      groups.push({ type: 'boss', count: 1 + Math.floor(extra / 5), interval: 2.8 });
    }
  }
  return { groups, hpScale };
}

export function describeWave(waveNum) {
  const cfg = buildWaveConfig(waveNum);
  const counts = {};
  cfg.groups.forEach((g) => {
    counts[g.type] = (counts[g.type] || 0) + g.count;
  });
  return Object.entries(counts)
    .map(([type, cnt]) => `${ENEMY_TYPES[type].name} ×${cnt}`)
    .join(' · ');
}
