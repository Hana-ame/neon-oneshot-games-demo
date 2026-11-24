import { TILE, TILE_SIZE } from './constants.js';

/**
 * 6 handcrafted Super Meat Boy inspired levels.
 * Grid legend:
 *   # = Solid block
 *   . = Empty space
 *   ^ v < > = Spikes (up, down, left, right)
 *   C = Crumbling block (breaks after standing on it)
 *   B = Bounce pad
 *   S = Meat Boy spawn
 *   G = Bandage Girl goal
 *   H = Optional collectible Bandage
 */
export const LEVELS = [
  {
    id: '1-1',
    name: '森林初遇',
    subtitle: '奔跑、冲刺与精准跳跃',
    theme: 'forest',
    parTime: 6.5,
    hint: '方向键/WASD 移动，Space 跳跃，Shift 冲刺跳得更远！',
    grid: [
      '########################',
      '#......................#',
      '#......................#',
      '#......................#',
      '#.................H....#',
      '#................###...#',
      '#......................#',
      '#.............###....G.#',
      '#.........###.......####',
      '#.....###..............#',
      '#..S....^^^^^..........#',
      '########################',
    ],
    saws: [],
    platforms: [],
  },
  {
    id: '1-2',
    name: '血墙攀登',
    subtitle: '贴墙滑行与连续蹬墙跳',
    theme: 'forest',
    parTime: 9.0,
    hint: '紧贴墙壁可减速滑行，按跳跃键反向蹬墙！',
    grid: [
      '########################',
      '#..........#...........#',
      '#..G.......#......H....#',
      '######.....#.....###...#',
      '#..........#...........#',
      '#.....######...........#',
      '#..........#....####...#',
      '#..........#...........#',
      '#....###...#..###......#',
      '#..........#...........#',
      '#..S..^^^^^#......^^^^^#',
      '########################',
    ],
    saws: [
      { x: 11.5 * TILE_SIZE, y: 6.5 * TILE_SIZE, radius: 18, speed: 0, path: null },
    ],
    platforms: [],
  },
  {
    id: '1-3',
    name: '锯齿回廊',
    subtitle: '碎裂砖块与巡逻圆锯',
    theme: 'factory',
    parTime: 10.5,
    hint: '黄色裂纹砖踩上后会碎裂，按住 Shift 冲刺快速通过！',
    grid: [
      '########################',
      '#......................#',
      '#......................#',
      '#......................#',
      '#...........H..........#',
      '#..........###.........#',
      '#......................#',
      '#...................G..#',
      '#..S...CCC....CCC..#####',
      '#####.................##',
      '#####^^^^^^^^^^^^^^^^^##',
      '########################',
    ],
    saws: [
      {
        x: 8.5 * TILE_SIZE,
        y: 6.2 * TILE_SIZE,
        radius: 20,
        speed: 135,
        path: [
          { x: 6.5 * TILE_SIZE, y: 6.2 * TILE_SIZE },
          { x: 16.5 * TILE_SIZE, y: 6.2 * TILE_SIZE },
        ],
      },
      {
        x: 13.5 * TILE_SIZE,
        y: 9.0 * TILE_SIZE,
        radius: 18,
        speed: 110,
        path: [
          { x: 11.5 * TILE_SIZE, y: 9.0 * TILE_SIZE },
          { x: 15.5 * TILE_SIZE, y: 9.0 * TILE_SIZE },
        ],
      },
    ],
    platforms: [],
  },
  {
    id: '1-4',
    name: '盐厂升降',
    subtitle: '移动平台与高空绷带',
    theme: 'factory',
    parTime: 12.0,
    hint: '借助移动平台越过深渊，上方隐藏着一枚绷带。',
    grid: [
      '########################',
      '#......................#',
      '#...........H..........#',
      '#..........###.........#',
      '#......................#',
      '#......................#',
      '#....................G.#',
      '#..................#####',
      '#..S...................#',
      '######.................#',
      '######^^^^^^^^^^^^^^^^^#',
      '########################',
    ],
    saws: [
      {
        x: 11.5 * TILE_SIZE,
        y: 6.0 * TILE_SIZE,
        radius: 20,
        speed: 120,
        path: [
          { x: 11.5 * TILE_SIZE, y: 4.5 * TILE_SIZE },
          { x: 11.5 * TILE_SIZE, y: 8.5 * TILE_SIZE },
        ],
      },
    ],
    platforms: [
      {
        x: 7.0 * TILE_SIZE,
        y: 8.5 * TILE_SIZE,
        width: 3 * TILE_SIZE,
        height: 16,
        speed: 95,
        path: [
          { x: 6.5 * TILE_SIZE, y: 8.5 * TILE_SIZE },
          { x: 10.0 * TILE_SIZE, y: 6.5 * TILE_SIZE },
        ],
      },
      {
        x: 13.5 * TILE_SIZE,
        y: 7.2 * TILE_SIZE,
        width: 3 * TILE_SIZE,
        height: 16,
        speed: 105,
        path: [
          { x: 12.5 * TILE_SIZE, y: 7.5 * TILE_SIZE },
          { x: 16.0 * TILE_SIZE, y: 7.5 * TILE_SIZE },
        ],
      },
    ],
  },
  {
    id: '1-5',
    name: '炼狱弹跳',
    subtitle: '弹簧跳板与地刺通道',
    theme: 'hell',
    parTime: 11.5,
    hint: '踩上红色弹簧板可获得超高弹跳力，注意躲避头顶尖刺！',
    grid: [
      '########################',
      '#.....vvvvvv...........#',
      '#................H.....#',
      '#...............###....#',
      '#..........###.........#',
      '#......................#',
      '#.....###..........G...#',
      '#................#######',
      '#..S....CCC............#',
      '#####..........B.......#',
      '#####^^^^^^^^#####^^^^^#',
      '########################',
    ],
    saws: [
      {
        x: 11.5 * TILE_SIZE,
        y: 7.0 * TILE_SIZE,
        radius: 20,
        speed: 145,
        path: [
          { x: 9.5 * TILE_SIZE, y: 7.0 * TILE_SIZE },
          { x: 13.5 * TILE_SIZE, y: 7.0 * TILE_SIZE },
        ],
      },
    ],
    platforms: [],
  },
  {
    id: '1-6',
    name: '博士堡垒',
    subtitle: '终极试炼：冲刺、弹跳与蹬墙',
    theme: 'hell',
    parTime: 14.5,
    hint: '综合运用冲刺、碎裂砖、弹簧与蹬墙跳救出绷带女孩！',
    grid: [
      '########################',
      '#...........#..........#',
      '#....H......#.......G..#',
      '#...###.....#.....######',
      '#...........#..........#',
      '#...........#...###....#',
      '#......###..#..........#',
      '#...........#......###.#',
      '#..S..CC....B..........#',
      '#####......###.........#',
      '#####^^^^^^###^^^^^^^^^#',
      '########################',
    ],
    saws: [
      {
        x: 12.5 * TILE_SIZE,
        y: 6.5 * TILE_SIZE,
        radius: 19,
        speed: 130,
        path: [
          { x: 12.5 * TILE_SIZE, y: 3.0 * TILE_SIZE },
          { x: 12.5 * TILE_SIZE, y: 8.0 * TILE_SIZE },
        ],
      },
      {
        x: 18.5 * TILE_SIZE,
        y: 5.5 * TILE_SIZE,
        radius: 18,
        speed: 140,
        path: [
          { x: 15.0 * TILE_SIZE, y: 5.5 * TILE_SIZE },
          { x: 21.0 * TILE_SIZE, y: 5.5 * TILE_SIZE },
        ],
      },
    ],
    platforms: [
      {
        x: 14.5 * TILE_SIZE,
        y: 9.0 * TILE_SIZE,
        width: 2.5 * TILE_SIZE,
        height: 16,
        speed: 95,
        path: [
          { x: 14.2 * TILE_SIZE, y: 9.0 * TILE_SIZE },
          { x: 18.5 * TILE_SIZE, y: 8.5 * TILE_SIZE },
        ],
      },
    ],
  },
];

/**
 * Parse a level definition into runtime world state (tiles, spawn, goal, bandage, saws, platforms).
 */
export function parseLevel(levelDef) {
  const rows = levelDef.grid.length;
  const cols = levelDef.grid[0].length;
  const tiles = [];
  let spawn = { x: TILE_SIZE * 2, y: TILE_SIZE * 8 };
  let goal = { x: TILE_SIZE * 20, y: TILE_SIZE * 8, width: 22, height: 26 };
  let bandage = null;
  const crumbleBlocks = [];

  for (let r = 0; r < rows; r++) {
    const rowArr = [];
    for (let c = 0; c < cols; c++) {
      const ch = levelDef.grid[r][c];
      if (ch === TILE.SPAWN) {
        spawn = {
          x: c * TILE_SIZE + (TILE_SIZE - 22) / 2,
          y: (r + 1) * TILE_SIZE - 22,
        };
        rowArr.push(TILE.EMPTY);
      } else if (ch === TILE.GOAL) {
        goal = {
          x: c * TILE_SIZE + (TILE_SIZE - 22) / 2,
          y: (r + 1) * TILE_SIZE - 26,
          width: 22,
          height: 26,
        };
        rowArr.push(TILE.EMPTY);
      } else if (ch === TILE.BANDAGE) {
        bandage = {
          x: c * TILE_SIZE + TILE_SIZE / 2,
          y: r * TILE_SIZE + TILE_SIZE / 2,
          radius: 11,
          collected: false,
        };
        rowArr.push(TILE.EMPTY);
      } else if (ch === TILE.CRUMBLE) {
        crumbleBlocks.push({
          row: r,
          col: c,
          x: c * TILE_SIZE,
          y: r * TILE_SIZE,
          state: 'solid', // 'solid' | 'shaking' | 'gone'
          timer: 0,
        });
        rowArr.push(TILE.CRUMBLE);
      } else {
        rowArr.push(ch);
      }
    }
    tiles.push(rowArr);
  }

  const saws = (levelDef.saws || []).map((s) => ({
    x: s.x,
    y: s.y,
    startX: s.x,
    startY: s.y,
    radius: s.radius,
    speed: s.speed || 0,
    path: s.path ? s.path.map((p) => ({ ...p })) : null,
    pathIndex: 1,
    angle: 0,
  }));

  const platforms = (levelDef.platforms || []).map((p) => ({
    x: p.x,
    y: p.y,
    prevX: p.x,
    prevY: p.y,
    width: p.width,
    height: p.height,
    speed: p.speed || 0,
    path: p.path ? p.path.map((pt) => ({ ...pt })) : null,
    pathIndex: 1,
  }));

  return {
    id: levelDef.id,
    name: levelDef.name,
    subtitle: levelDef.subtitle,
    theme: levelDef.theme,
    parTime: levelDef.parTime,
    hint: levelDef.hint,
    rows,
    cols,
    width: cols * TILE_SIZE,
    height: rows * TILE_SIZE,
    tiles,
    spawn,
    goal,
    bandage,
    crumbleBlocks,
    saws,
    platforms,
  };
}
