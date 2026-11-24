/**
 * 5 个精心设计的《传送门》测试舱关卡 (24x14 网格)
 * 符号说明：
 *   '#' = 白色可传送面板 (PORTAL_WALL)
 *   'M' = 深灰金属不可传送墙 (METAL_WALL)
 *   '~' = 腐蚀液池 (HAZARD)
 *   '|' = 物质解离栅栏 (FIZZLER)
 *   '.' = 空气 (EMPTY)
 */

import { TILE, TILE_SIZE, GRID_COLS, GRID_ROWS } from './constants.js';

const CHAR_MAP = {
  '.': TILE.EMPTY,
  '#': TILE.PORTAL_WALL,
  'M': TILE.METAL_WALL,
  '~': TILE.HAZARD,
  '|': TILE.FIZZLER
};

export function parseGrid(rows) {
  if (rows.length !== GRID_ROWS) {
    throw new Error(`Invalid grid height: expected ${GRID_ROWS}, got ${rows.length}`);
  }
  return rows.map((rowStr, rIdx) => {
    if (rowStr.length !== GRID_COLS) {
      throw new Error(`Invalid grid width at row ${rIdx}: expected ${GRID_COLS}, got ${rowStr.length}`);
    }
    return [...rowStr].map((ch) => {
      if (!(ch in CHAR_MAP)) throw new Error(`Unknown tile char '${ch}'`);
      return CHAR_MAP[ch];
    });
  });
}

export const RAW_LEVELS = [
  {
    id: 1,
    code: 'CHAMBER 01',
    title: '空间跃迁入门',
    subtitle: '左键发射蓝门，右键 / Q 发射橙门，跨越腐蚀液池抵达出口。',
    hint: '在左侧白色墙面开启蓝门，在对岸右侧白色墙面开启橙门，穿过蓝门即可安全到达对岸。',
    spawn: { col: 2.5, row: 10 },
    exit: { col: 21, row: 11 },
    cubes: [],
    buttons: [],
    doorRequiresButtons: false,
    map: [
      'MMMMMMMMMMMMMMMMMMMMMMMM',
      'M......................M',
      'M......................M',
      'M......................M',
      'M......................M',
      'M......................M',
      'M......................M',
      '#......................#',
      '#......................#',
      '#......................#',
      '#......................#',
      '#......................#',
      'MMMMMMM~~~~~~~~~~MMMMMMM',
      'MMMMMMMMMMMMMMMMMMMMMMMM'
    ]
  },
  {
    id: 2,
    code: 'CHAMBER 02',
    title: '动量守恒弹射',
    subtitle: '“高速进去，高速出来。”利用高处落差积累动能，从左侧高墙弹射飞跃深渊。',
    hint: '在下方深坑的白色地板开蓝门，在左上高墙白色面板开橙门，从平台跳入蓝门即可借动量飞跃毒池！',
    spawn: { col: 2.5, row: 3 },
    exit: { col: 20.5, row: 6 },
    cubes: [],
    buttons: [],
    doorRequiresButtons: false,
    map: [
      'MMMMMMMMMMMMMMMMMMMMMMMM',
      '#......................M',
      '#......................M',
      '#......................M',
      '#......................M',
      'MMMMM..................M',
      'M......................M',
      'M..............MMMMMMMMM',
      'M..............M.......M',
      'M..............M.......M',
      'M..............M.......M',
      'M..............M.......M',
      'MMMMM#####~~~~~~MMMMMMMM',
      'MMMMMMMMMMMMMMMMMMMMMMMM'
    ]
  },
  {
    id: 3,
    code: 'CHAMBER 03',
    title: '同伴方块与重压开关',
    subtitle: '按 E 拾取 / 放下同伴方块，将其压在红色压力开关上以解锁出口大门。',
    hint: '利用上下白色面板建立传送通道，登上高台按 E 搬运同伴方块并放到红色压力板上。',
    spawn: { col: 2.5, row: 10 },
    exit: { col: 21, row: 11 },
    cubes: [{ col: 3.5, row: 4 }],
    buttons: [{ id: 'btn-1', col: 13, row: 12 }],
    doorRequiresButtons: true,
    map: [
      'MMMMMMMMMMMMMMMMMMMMMMMM',
      'M......................M',
      'M......................M',
      '#......................M',
      '#......................M',
      '#......................M',
      'MMMMMMM................M',
      'M......................M',
      'M......................M',
      '#......................#',
      '#......................#',
      '#......................#',
      'MMMMMMMMMMMMM#MMMMMMMMMM',
      'MMMMMMMMMMMMMMMMMMMMMMMM'
    ]
  },
  {
    id: 4,
    code: 'CHAMBER 04',
    title: '物质解离栅栏',
    subtitle: '蓝色解离栅栏会清除已开启的传送门并阻挡射线，穿过栅栏后再规划空间跃迁。',
    hint: '先向右侧穿过解离栅栏，再用右墙上下两处白色面板传送到高台取回同伴方块，压住下方压力板。',
    spawn: { col: 2.5, row: 10 },
    exit: { col: 21, row: 11 },
    cubes: [{ col: 18, row: 3 }],
    buttons: [{ id: 'btn-1', col: 14, row: 12 }],
    doorRequiresButtons: true,
    map: [
      'MMMMMMMMMMMMMMMMMMMMMMMM',
      'M......................M',
      'M......................#',
      'M......................#',
      'M......................#',
      'M.............MMMMMMMMMM',
      'M......................M',
      'M......|...............M',
      'M......|...............M',
      'M......|...............#',
      'M......|...............#',
      'M......|...............#',
      'MMMMMMMMMMMM###MMMMMMMMM',
      'MMMMMMMMMMMMMMMMMMMMMMMM'
    ]
  },
  {
    id: 5,
    code: 'CHAMBER 05',
    title: '光圈终极综合测试',
    subtitle: '综合运用方块搬运、压力开关与高空传送跃迁，完成最终实验舱挑战。',
    hint: '先通过左墙上下白色面板取得同伴方块并放置在中层压力板，再向右上白色面板开启出口通道。',
    spawn: { col: 2.5, row: 10 },
    exit: { col: 21, row: 4 },
    cubes: [{ col: 3.5, row: 3 }],
    buttons: [{ id: 'btn-1', col: 10, row: 9 }],
    doorRequiresButtons: true,
    map: [
      'MMMMMMMMMMMMMMMMMMMMMMMM',
      'M......................M',
      '#......................#',
      '#......................#',
      '#......................#',
      'MMMMMM............MMMMMM',
      'M......................M',
      'M.......#..............M',
      'M.......#..............M',
      'M.......MMMMM..........M',
      '#......................#',
      '#......................#',
      'MMMMMMM~~~~~~#####MMMMMM',
      'MMMMMMMMMMMMMMMMMMMMMMMM'
    ]
  }
];

export function buildLevel(index) {
  const raw = RAW_LEVELS[index];
  if (!raw) throw new Error(`Level index out of bounds: ${index}`);
  return {
    ...raw,
    grid: parseGrid(raw.map),
    spawnPos: {
      x: raw.spawn.col * TILE_SIZE,
      y: raw.spawn.row * TILE_SIZE
    },
    exitRect: {
      x: raw.exit.col * TILE_SIZE,
      y: (raw.exit.row - 1) * TILE_SIZE,
      w: TILE_SIZE * 1.15,
      h: TILE_SIZE * 2
    },
    initialCubes: raw.cubes.map((c, idx) => ({
      id: `cube-${idx}`,
      x: c.col * TILE_SIZE,
      y: c.row * TILE_SIZE
    })),
    buttonRects: raw.buttons.map((b) => ({
      id: b.id,
      x: b.col * TILE_SIZE + 4,
      y: b.row * TILE_SIZE - 8,
      w: TILE_SIZE - 8,
      h: 8,
      pressed: false
    }))
  };
}
