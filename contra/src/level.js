// 多关卡数据定义：第一关（丛林基地与爆破大桥）& 第二关（异形要塞与红隼核心）

export function createStages() {
  return [
    {
      id: 1,
      name: 'STAGE 1 · 丛林基地',
      theme: 'jungle',
      length: 2560,
      waterY: 238,
      platforms: [
        // 起始高地
        { x: 0, y: 176, w: 360, h: 14, oneWay: true, type: 'grass' },
        { x: 0, y: 238, w: 260, h: 32, oneWay: false, type: 'ground' },
        // 第一水潭上方的双层跳台
        { x: 290, y: 210, w: 90, h: 12, oneWay: true, type: 'grass' },
        { x: 390, y: 144, w: 170, h: 14, oneWay: true, type: 'grass' },
        { x: 430, y: 196, w: 120, h: 12, oneWay: true, type: 'grass' },
        // 第一爆破大桥前的陆地
        { x: 560, y: 176, w: 140, h: 14, oneWay: true, type: 'grass' },
        { x: 560, y: 238, w: 140, h: 32, oneWay: false, type: 'ground' },
        // 第一爆破大桥之后的岛屿（大桥占 x: 700..892）
        { x: 892, y: 176, w: 220, h: 14, oneWay: true, type: 'grass' },
        { x: 892, y: 238, w: 220, h: 32, oneWay: false, type: 'ground' },
        { x: 960, y: 128, w: 110, h: 12, oneWay: true, type: 'grass' },
        // 第二爆破大桥之后的山谷（大桥占 x: 1112..1304）
        { x: 1304, y: 176, w: 260, h: 14, oneWay: true, type: 'grass' },
        { x: 1304, y: 238, w: 180, h: 32, oneWay: false, type: 'ground' },
        { x: 1440, y: 132, w: 130, h: 12, oneWay: true, type: 'grass' },
        // 阶梯高台段
        { x: 1590, y: 204, w: 120, h: 12, oneWay: true, type: 'grass' },
        { x: 1680, y: 156, w: 150, h: 14, oneWay: true, type: 'grass' },
        { x: 1750, y: 238, w: 810, h: 32, oneWay: false, type: 'ground' },
        { x: 1860, y: 192, w: 160, h: 14, oneWay: true, type: 'grass' },
        { x: 1960, y: 140, w: 140, h: 12, oneWay: true, type: 'grass' },
        // Boss 战区平台
        { x: 2140, y: 192, w: 120, h: 12, oneWay: true, type: 'metal' },
        { x: 2220, y: 146, w: 100, h: 12, oneWay: true, type: 'metal' }
      ],
      waterZones: [
        { x: 260, w: 300 },
        { x: 700, w: 192 },
        { x: 1112, w: 192 },
        { x: 1484, w: 266 }
      ],
      bridges: [
        { x: 700, y: 176, segments: 6, segW: 32 },
        { x: 1112, y: 176, segments: 6, segW: 32 }
      ],
      enemySpawns: [
        { x: 320, y: 146, type: 'runner' },
        { x: 470, y: 114, type: 'sniper' },
        { x: 520, y: 166, type: 'runner' },
        { x: 630, y: 146, type: 'sniper' },
        { x: 660, y: 214, type: 'turret' },
        { x: 940, y: 146, type: 'runner' },
        { x: 1010, y: 98, type: 'sniper' },
        { x: 1060, y: 214, type: 'turret' },
        { x: 1360, y: 146, type: 'runner' },
        { x: 1490, y: 102, type: 'sniper' },
        { x: 1520, y: 146, type: 'runner' },
        { x: 1650, y: 174, type: 'sniper' },
        { x: 1730, y: 126, type: 'sniper' },
        { x: 1830, y: 214, type: 'turret' },
        { x: 1920, y: 162, type: 'runner' },
        { x: 2020, y: 110, type: 'sniper' },
        { x: 2080, y: 214, type: 'turret' }
      ],
      capsules: [
        { triggerX: 220, y: 74, weapon: 'M' },
        { triggerX: 740, y: 68, weapon: 'S' },
        { triggerX: 1320, y: 72, weapon: 'L' },
        { triggerX: 1840, y: 66, weapon: 'F' }
      ],
      boss: {
        kind: 'wall',
        name: '红隼防御墙',
        x: 2430,
        y: 88,
        w: 92,
        h: 150,
        coreX: 2438,
        coreY: 174,
        coreW: 26,
        coreH: 34,
        coreHp: 28,
        turrets: [
          { x: 2432, y: 122, hp: 10 },
          { x: 2462, y: 122, hp: 10 }
        ]
      }
    },
    {
      id: 2,
      name: 'STAGE 2 · 异形要塞',
      theme: 'fortress',
      length: 2600,
      waterY: 260,
      platforms: [
        { x: 0, y: 232, w: 520, h: 38, oneWay: false, type: 'metal' },
        { x: 160, y: 176, w: 140, h: 12, oneWay: true, type: 'metal' },
        { x: 350, y: 142, w: 150, h: 12, oneWay: true, type: 'metal' },
        // 悬空钢架区
        { x: 560, y: 192, w: 130, h: 12, oneWay: true, type: 'metal' },
        { x: 720, y: 152, w: 150, h: 12, oneWay: true, type: 'metal' },
        { x: 740, y: 232, w: 320, h: 38, oneWay: false, type: 'metal' },
        { x: 920, y: 184, w: 120, h: 12, oneWay: true, type: 'metal' },
        // 能量桥段（桥在 x: 1060..1252）
        { x: 1252, y: 184, w: 220, h: 12, oneWay: true, type: 'metal' },
        { x: 1252, y: 232, w: 560, h: 38, oneWay: false, type: 'metal' },
        { x: 1340, y: 132, w: 140, h: 12, oneWay: true, type: 'metal' },
        { x: 1550, y: 168, w: 160, h: 12, oneWay: true, type: 'metal' },
        // 双层炮阵
        { x: 1860, y: 232, w: 740, h: 38, oneWay: false, type: 'metal' },
        { x: 1880, y: 174, w: 160, h: 12, oneWay: true, type: 'metal' },
        { x: 2040, y: 128, w: 140, h: 12, oneWay: true, type: 'metal' },
        // 最终 Boss 战区平台
        { x: 2210, y: 186, w: 110, h: 12, oneWay: true, type: 'metal' },
        { x: 2290, y: 140, w: 90, h: 12, oneWay: true, type: 'metal' }
      ],
      waterZones: [
        { x: 520, w: 220 },
        { x: 1060, w: 192 },
        { x: 1812, w: 48 }
      ],
      bridges: [
        { x: 1060, y: 184, segments: 6, segW: 32 }
      ],
      enemySpawns: [
        { x: 240, y: 146, type: 'sniper' },
        { x: 340, y: 202, type: 'runner' },
        { x: 420, y: 112, type: 'sniper' },
        { x: 470, y: 208, type: 'turret' },
        { x: 620, y: 162, type: 'sniper' },
        { x: 790, y: 122, type: 'sniper' },
        { x: 840, y: 208, type: 'turret' },
        { x: 960, y: 154, type: 'runner' },
        { x: 1320, y: 154, type: 'runner' },
        { x: 1410, y: 102, type: 'sniper' },
        { x: 1480, y: 208, type: 'turret' },
        { x: 1620, y: 138, type: 'sniper' },
        { x: 1700, y: 202, type: 'runner' },
        { x: 1940, y: 144, type: 'sniper' },
        { x: 1980, y: 208, type: 'turret' },
        { x: 2100, y: 98, type: 'sniper' },
        { x: 2150, y: 208, type: 'turret' }
      ],
      capsules: [
        { triggerX: 200, y: 68, weapon: 'S' },
        { triggerX: 880, y: 64, weapon: 'L' },
        { triggerX: 1500, y: 68, weapon: 'S' },
        { triggerX: 1960, y: 62, weapon: 'F' }
      ],
      boss: {
        kind: 'alien_core',
        name: '红隼异形核心',
        x: 2450,
        y: 78,
        w: 96,
        h: 154,
        coreX: 2458,
        coreY: 134,
        coreW: 34,
        coreH: 44,
        coreHp: 42,
        turrets: [
          { x: 2454, y: 94, hp: 14 },
          { x: 2454, y: 194, hp: 14 }
        ]
      }
    }
  ];
}
