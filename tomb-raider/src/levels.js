/**
 * 关卡定义与解析模块
 * 包含 3 个手工设计的古墓关卡：
 *   1. 丛林外殿（基础探索、攀爬、推箱压板解谜）
 *   2. 机关地宫（碎裂石桥、毒箭机关、拉杆吊桥、滚石追逐）
 *   3. 太阳圣殿（双机关密室、垂直攀爬、黑曜石守卫 Boss 战）
 */

import { TILE, TILE_SIZE } from './constants.js';

const CHAR_TO_TILE = {
  '.': TILE.EMPTY,
  '#': TILE.SOLID,
  'M': TILE.MOSS_SOLID,
  'V': TILE.VINE,
  '^': TILE.SPIKES,
  'C': TILE.CRUMBLE,
  '~': TILE.WATER,
  'T': TILE.TORCH,
  '-': TILE.PLATFORM
};

export const RAW_LEVELS = [
  {
    id: 1,
    name: '第一关：丛林外殿',
    subtitle: 'Temple Entrance · 攀爬、推箱与压板机关',
    ambientDarkness: 0.32,
    hint: 'AD/方向键移动，空格跳跃（靠近高台边缘可自动抓崖攀爬），W/S攀爬藤蔓，将石箱推上金色压板开启石门！',
    map: [
      'MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM',
      'M......................................M',
      'M..T........T........T.........T.......M',
      'M......................................M',
      'M............................----......M',
      'M......................................M',
      'M...................MMM.......T........M',
      'M............V.........................M',
      'M......--....V..MMM......MMMMM.........M',
      'M............V...........M.............M',
      'M..T.........V......T....M.....T.......M',
      'M............V...........M.............M',
      'MMMMM....MMMMM..^^^..MMMMMMMM....MMMMMMM',
      'M......................................M',
      'MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM'
    ],
    spawn: { col: 2, row: 11 },
    exit: { col: 37, row: 10 },
    relics: [
      { id: 'r1_1', col: 7, row: 7, name: '翡翠神像' },
      { id: 'r1_2', col: 20, row: 5, name: '黄金圣甲虫' },
      { id: 'r1_3', col: 30, row: 3, name: '太阳徽章' }
    ],
    medipacks: [
      { id: 'm1_1', col: 17, row: 7 }
    ],
    checkpoints: [
      { id: 'cp1_1', col: 22, row: 11 }
    ],
    crates: [
      { id: 'crate1', col: 26, row: 7 }
    ],
    plates: [
      { id: 'plate1', col: 28, row: 11.75, targetDoorId: 'door1' }
    ],
    levers: [],
    doors: [
      { id: 'door1', col: 34, row: 9, heightTiles: 3, requiredIds: ['plate1'] }
    ],
    dartTraps: [],
    boulders: [],
    enemies: [
      { id: 'e1_1', type: 'bat', col: 15, row: 5, patrolRange: 120 },
      { id: 'e1_2', type: 'guardian', col: 25, row: 11, patrolMinCol: 22, patrolMaxCol: 32 }
    ],
    boss: null
  },
  {
    id: 2,
    name: '第二关：机关地宫',
    subtitle: 'Hall of Traps · 碎裂石桥、毒箭机关与滚石追逐',
    ambientDarkness: 0.44,
    hint: '按 E 启动古墓拉杆开启石门，按 Shift 翻滚躲避毒箭与滚石，碎裂石桥踩踏后会迅速崩塌！',
    map: [
      '########################################',
      '#......................................#',
      '#..T......T........T........T......T...#',
      '#......................................#',
      '#.................................V....#',
      '#................######...........V....#',
      '#........T........................V....#',
      '#....#####...CCCC.....####...CCCC.V....#',
      '#.................................V....#',
      '#..T............T.................V....#',
      '#.................................V....#',
      '#......................................#',
      '#####..^^^..#####..~~~~..###############',
      '#......................................#',
      '########################################'
    ],
    spawn: { col: 2, row: 11 },
    exit: { col: 37, row: 10 },
    relics: [
      { id: 'r2_1', col: 6, row: 6, name: '青铜权杖' },
      { id: 'r2_2', col: 18, row: 4, name: '星象罗盘' },
      { id: 'r2_3', col: 34, row: 3, name: '血玉匕首' }
    ],
    medipacks: [
      { id: 'm2_1', col: 23, row: 6 },
      { id: 'm2_2', col: 30, row: 11 }
    ],
    checkpoints: [
      { id: 'cp2_1', col: 22, row: 6 }
    ],
    crates: [],
    plates: [],
    levers: [
      { id: 'lever2_1', col: 19, row: 4, targetDoorId: 'door2' }
    ],
    doors: [
      { id: 'door2', col: 35, row: 9, heightTiles: 3, requiredIds: ['lever2_1'] }
    ],
    dartTraps: [
      { id: 'dart2_1', col: 38, row: 11, dir: -1, interval: 2.3 },
      { id: 'dart2_2', col: 1, row: 6, dir: 1, interval: 2.8 }
    ],
    boulders: [
      { id: 'boulder2_1', col: 27, row: 10.6, triggerCol: 29, dir: 1, speed: 205 }
    ],
    enemies: [
      { id: 'e2_1', type: 'bat', col: 13, row: 4, patrolRange: 130 },
      { id: 'e2_2', type: 'guardian', col: 13, row: 11, patrolMinCol: 12, patrolMaxCol: 16 },
      { id: 'e2_3', type: 'bat', col: 29, row: 5, patrolRange: 110 }
    ],
    boss: null
  },
  {
    id: 3,
    name: '第三关：太阳圣殿',
    subtitle: 'Sanctum of the Sun · 双重封印与黑曜石守卫',
    ambientDarkness: 0.48,
    hint: '启动左右两座圣殿拉杆解除宝库封印，击败黑曜石守卫即可夺取「太阳圣器」通关！',
    map: [
      '########################################',
      '#......................................#',
      '#..T.........T..........T..........T...#',
      '#......................................#',
      '#....----...................----.......#',
      '#......................................#',
      '#..V.............................V.....#',
      '#..V......----.........----......V.....#',
      '#..V.............................V.....#',
      '#..V..T........T.....T........T..V.....#',
      '#..V.............................V.....#',
      '#..V.............................V.....#',
      '########################################',
      '#......................................#',
      '########################################'
    ],
    spawn: { col: 5, row: 11 },
    exit: { col: 36, row: 10 },
    relics: [
      { id: 'r3_1', col: 6, row: 3, name: '日蚀圣杯' },
      { id: 'r3_2', col: 19, row: 5, name: '黄金面具' },
      { id: 'r3_3', col: 30, row: 3, name: '太阳圣器碎片' }
    ],
    medipacks: [
      { id: 'm3_1', col: 12, row: 6 },
      { id: 'm3_2', col: 25, row: 6 }
    ],
    checkpoints: [
      { id: 'cp3_1', col: 19, row: 11 }
    ],
    crates: [],
    plates: [],
    levers: [
      { id: 'lever3_1', col: 5, row: 3, targetDoorId: 'door3' },
      { id: 'lever3_2', col: 29, row: 3, targetDoorId: 'door3' }
    ],
    doors: [
      { id: 'door3', col: 34, row: 9, heightTiles: 3, requiredIds: ['lever3_1', 'lever3_2', 'boss3'] }
    ],
    dartTraps: [
      { id: 'dart3_1', col: 1, row: 11, dir: 1, interval: 3.1 }
    ],
    boulders: [],
    enemies: [
      { id: 'e3_1', type: 'bat', col: 15, row: 4, patrolRange: 140 },
      { id: 'e3_2', type: 'bat', col: 24, row: 4, patrolRange: 140 }
    ],
    boss: {
      id: 'boss3',
      name: '黑曜石守卫 · Obsidian Golem',
      col: 24,
      row: 10.2,
      minCol: 10,
      maxCol: 31,
      maxHp: 260
    }
  }
];

/**
 * 将字符地图解析为二维数字网格及派生元数据
 */
export function parseLevel(levelIndex) {
  const raw = RAW_LEVELS[levelIndex];
  if (!raw) {
    throw new Error(`Invalid level index: ${levelIndex}`);
  }

  const rows = raw.map.length;
  const cols = raw.map[0].length;
  const grid = [];
  const torches = [];
  const crumbleBlocks = [];

  for (let r = 0; r < rows; r++) {
    const line = raw.map[r];
    if (line.length !== cols) {
      throw new Error(`Level ${raw.id} row ${r} length mismatch: expected ${cols}, got ${line.length}`);
    }
    const rowArr = [];
    for (let c = 0; c < cols; c++) {
      const ch = line[c];
      const tileType = CHAR_TO_TILE[ch] ?? TILE.EMPTY;
      rowArr.push(tileType);

      if (tileType === TILE.TORCH) {
        torches.push({
          x: (c + 0.5) * TILE_SIZE,
          y: (r + 0.5) * TILE_SIZE,
          phase: (c * 1.7 + r * 0.9) % (Math.PI * 2)
        });
      }
      if (tileType === TILE.CRUMBLE) {
        crumbleBlocks.push({
          col: c,
          row: r,
          x: c * TILE_SIZE,
          y: r * TILE_SIZE,
          state: 'solid', // solid | shaking | gone
          timer: 0
        });
      }
    }
    grid.push(rowArr);
  }

  return {
    id: raw.id,
    name: raw.name,
    subtitle: raw.subtitle,
    hint: raw.hint,
    ambientDarkness: raw.ambientDarkness,
    rows,
    cols,
    width: cols * TILE_SIZE,
    height: rows * TILE_SIZE,
    grid,
    torches,
    crumbleBlocks,
    spawn: { x: raw.spawn.col * TILE_SIZE + 8, y: raw.spawn.row * TILE_SIZE },
    exit: {
      x: raw.exit.col * TILE_SIZE,
      y: raw.exit.row * TILE_SIZE,
      w: TILE_SIZE * 1.3,
      h: TILE_SIZE * 2
    },
    relics: raw.relics.map((item) => ({
      ...item,
      x: item.col * TILE_SIZE + TILE_SIZE * 0.5,
      y: item.row * TILE_SIZE + TILE_SIZE * 0.5,
      collected: false
    })),
    medipacks: raw.medipacks.map((item) => ({
      ...item,
      x: item.col * TILE_SIZE + TILE_SIZE * 0.5,
      y: item.row * TILE_SIZE + TILE_SIZE * 0.5,
      collected: false
    })),
    checkpoints: raw.checkpoints.map((cp) => ({
      ...cp,
      x: cp.col * TILE_SIZE + TILE_SIZE * 0.5,
      y: cp.row * TILE_SIZE + TILE_SIZE,
      activated: false
    })),
    crates: raw.crates.map((cr) => ({
      id: cr.id,
      x: cr.col * TILE_SIZE + 3,
      y: cr.row * TILE_SIZE + 4,
      w: TILE_SIZE - 6,
      h: TILE_SIZE - 4,
      vx: 0,
      vy: 0,
      onGround: false
    })),
    plates: raw.plates.map((pl) => ({
      id: pl.id,
      x: pl.col * TILE_SIZE,
      y: pl.row * TILE_SIZE,
      w: TILE_SIZE,
      h: 10,
      targetDoorId: pl.targetDoorId,
      pressed: false
    })),
    levers: raw.levers.map((lv) => ({
      id: lv.id,
      x: lv.col * TILE_SIZE + 6,
      y: lv.row * TILE_SIZE + 6,
      w: 28,
      h: 34,
      targetDoorId: lv.targetDoorId,
      activated: false
    })),
    doors: raw.doors.map((dr) => ({
      id: dr.id,
      x: dr.col * TILE_SIZE + 4,
      y: dr.row * TILE_SIZE,
      w: TILE_SIZE - 8,
      h: dr.heightTiles * TILE_SIZE,
      requiredIds: [...dr.requiredIds],
      openProgress: 0,
      isOpen: false
    })),
    dartTraps: raw.dartTraps.map((dt) => ({
      ...dt,
      x: dt.col * TILE_SIZE + (dt.dir > 0 ? TILE_SIZE : 0),
      y: dt.row * TILE_SIZE + TILE_SIZE * 0.5,
      timer: dt.interval * 0.5
    })),
    boulders: raw.boulders.map((b) => ({
      id: b.id,
      x: b.col * TILE_SIZE,
      y: b.row * TILE_SIZE,
      radius: 24,
      triggerX: b.triggerCol * TILE_SIZE,
      dir: b.dir,
      speed: b.speed,
      active: false,
      angle: 0,
      destroyed: false
    })),
    enemies: raw.enemies.map((e) => ({
      ...e,
      x: e.col * TILE_SIZE,
      y: e.row * TILE_SIZE,
      startX: e.col * TILE_SIZE,
      startY: e.row * TILE_SIZE,
      w: e.type === 'bat' ? 28 : 28,
      h: e.type === 'bat' ? 20 : 38,
      vx: e.type === 'guardian' ? 75 : 95,
      vy: 0,
      hp: e.type === 'bat' ? 36 : 72,
      maxHp: e.type === 'bat' ? 36 : 72,
      patrolMinX: e.patrolMinCol ? e.patrolMinCol * TILE_SIZE : e.col * TILE_SIZE - (e.patrolRange || 100),
      patrolMaxX: e.patrolMaxCol ? e.patrolMaxCol * TILE_SIZE : e.col * TILE_SIZE + (e.patrolRange || 100),
      phase: 0,
      hitFlash: 0,
      alive: true
    })),
    boss: raw.boss
      ? {
          id: raw.boss.id,
          name: raw.boss.name,
          x: raw.boss.col * TILE_SIZE,
          y: raw.boss.row * TILE_SIZE,
          w: 58,
          h: 72,
          minX: raw.boss.minCol * TILE_SIZE,
          maxX: raw.boss.maxCol * TILE_SIZE,
          vx: -95,
          vy: 0,
          hp: raw.boss.maxHp,
          maxHp: raw.boss.maxHp,
          attackTimer: 2.2,
          hitFlash: 0,
          alive: true
        }
      : null
  };
}
