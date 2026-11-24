import {
  DIR_LIST,
  FLOOR_THEMES,
  GRID_COLS,
  GRID_ROWS,
  ROOM_TYPES,
  TILE_TYPES
} from './constants.js';
import { pickItemFromPool } from './items.js';

export const MAP_SIZE = 9;
export const CENTER_COORD = 4;

export function coordKey(gx, gy) {
  return `${gx},${gy}`;
}

/**
 * 房间障碍物模板库 (15x9 网格)
 * 保证四门入口区域 (col 6..8, row 0/8) 与 (row 3..5, col 0/14) 永远畅通无阻。
 */
const ROOM_TEMPLATES = [
  // 0: 空旷竞技场 + 四角石块
  (grid) => {
    const coords = [
      [2, 2], [3, 2], [2, 3],
      [12, 2], [11, 2], [12, 3],
      [2, 6], [3, 6], [2, 5],
      [12, 6], [11, 6], [12, 5]
    ];
    for (const [c, r] of coords) grid[r][c] = TILE_TYPES.ROCK;
  },
  // 1: 中央十字掩体 + 地刺
  (grid) => {
    const rocks = [[6, 4], [7, 4], [8, 4], [7, 3], [7, 5]];
    for (const [c, r] of rocks) grid[r][c] = TILE_TYPES.ROCK;
    grid[2][4] = TILE_TYPES.SPIKES;
    grid[2][10] = TILE_TYPES.SPIKES;
    grid[6][4] = TILE_TYPES.SPIKES;
    grid[6][10] = TILE_TYPES.SPIKES;
  },
  // 2: 双排石柱 + 粪便
  (grid) => {
    for (const c of [4, 10]) {
      grid[2][c] = TILE_TYPES.ROCK;
      grid[3][c] = TILE_TYPES.ROCK;
      grid[5][c] = TILE_TYPES.ROCK;
      grid[6][c] = TILE_TYPES.ROCK;
    }
    grid[4][7] = TILE_TYPES.POOP;
  },
  // 3: 对角石阵
  (grid) => {
    const rocks = [
      [3, 2], [4, 2], [3, 3],
      [11, 6], [10, 6], [11, 5],
      [5, 5], [9, 3]
    ];
    for (const [c, r] of rocks) grid[r][c] = TILE_TYPES.ROCK;
    grid[2][11] = TILE_TYPES.POOP;
    grid[6][3] = TILE_TYPES.POOP;
  },
  // 4: 中央环状地刺 + 四周掩体
  (grid) => {
    grid[3][6] = TILE_TYPES.ROCK;
    grid[3][8] = TILE_TYPES.ROCK;
    grid[5][6] = TILE_TYPES.ROCK;
    grid[5][8] = TILE_TYPES.ROCK;
    grid[4][7] = TILE_TYPES.SPIKES;
  }
];

function createEmptyGrid() {
  return Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(TILE_TYPES.EMPTY));
}

function generateEnemyWave(roomType, floorLevel, rng) {
  if (roomType === ROOM_TYPES.START || roomType === ROOM_TYPES.TREASURE || roomType === ROOM_TYPES.SHOP) {
    return [];
  }
  if (roomType === ROOM_TYPES.BOSS) {
    const theme = FLOOR_THEMES[Math.min(floorLevel - 1, FLOOR_THEMES.length - 1)];
    return [{ type: theme.bossType, col: 7, row: 4 }];
  }

  const wavesByFloor = [
    // Floor 1
    [
      ['FLY', 'FLY', 'FLY'],
      ['GAPER', 'GAPER', 'FLY'],
      ['SPIDER', 'SPIDER', 'FLY'],
      ['SHOOTER', 'FLY', 'FLY'],
      ['GAPER', 'SHOOTER'],
      ['CHARGER', 'FLY', 'FLY']
    ],
    // Floor 2
    [
      ['GAPER', 'GAPER', 'SHOOTER'],
      ['SPIDER', 'SPIDER', 'SPIDER', 'FLY'],
      ['CHARGER', 'CHARGER', 'FLY'],
      ['SHOOTER', 'SHOOTER', 'GAPER'],
      ['CHARGER', 'SPIDER', 'SHOOTER']
    ],
    // Floor 3
    [
      ['CHARGER', 'CHARGER', 'SHOOTER', 'FLY'],
      ['GAPER', 'GAPER', 'SHOOTER', 'SHOOTER'],
      ['SPIDER', 'SPIDER', 'CHARGER', 'SHOOTER'],
      ['SHOOTER', 'SHOOTER', 'FLY', 'FLY', 'GAPER']
    ]
  ];

  const pool = wavesByFloor[Math.min(floorLevel - 1, wavesByFloor.length - 1)];
  const chosen = rng.pick(pool);
  return chosen.map((type, idx) => ({
    type,
    // Spawn away from doorways
    col: 3 + ((idx * 3 + rng.int(0, 2)) % 9),
    row: 2 + ((idx * 2 + rng.int(0, 2)) % 5)
  }));
}

/**
 * 类以撒 BFS 随机地牢生成器
 * 规则：
 * 1. 从中心 (4,4) 出发通过类似原版以撒的约束队列扩展（避免 2x2 团块，鼓励死胡同）。
 * 2. 识别所有死胡同（度为 1 的房间），最远的设为 BOSS 房，其余死胡同优先分配 TREASURE 和 SHOP 房。
 * 3. 若死胡同不足 3 个，自动附加合法叶子节点，确保每层必定包含 START、TREASURE、SHOP、BOSS。
 */
export function generateFloor(floorLevel, rng, ownedItemIds = new Set()) {
  const targetRoomCount = Math.min(14, 7 + floorLevel * 2); // F1: 9, F2: 11, F3: 13
  const rooms = new Map();

  const makeRoom = (gx, gy, type = ROOM_TYPES.NORMAL) => ({
    gx,
    gy,
    key: coordKey(gx, gy),
    type,
    doors: {}, // { NORTH: { toKey, locked, type } }
    grid: createEmptyGrid(),
    enemySpawns: [],
    enemies: [],
    pickups: [],
    pedestals: [],
    shopItems: [],
    bloodStains: [],
    visited: false,
    cleared: type !== ROOM_TYPES.NORMAL && type !== ROOM_TYPES.BOSS,
    trapdoor: null,
    victoryChest: null
  });

  const countNeighbors = (gx, gy) => {
    let count = 0;
    for (const d of DIR_LIST) {
      if (rooms.has(coordKey(gx + d.dx, gy + d.dy))) count++;
    }
    return count;
  };

  const inBounds = (gx, gy) => gx >= 0 && gx < MAP_SIZE && gy >= 0 && gy < MAP_SIZE;

  const startKey = coordKey(CENTER_COORD, CENTER_COORD);
  rooms.set(startKey, makeRoom(CENTER_COORD, CENTER_COORD, ROOM_TYPES.START));

  const queue = [{ gx: CENTER_COORD, gy: CENTER_COORD }];
  let guard = 0;

  while (rooms.size < targetRoomCount && guard < 400) {
    guard++;
    if (queue.length === 0) {
      // Restart expansion from a random existing room
      const existing = Array.from(rooms.values());
      const seedRoom = rng.pick(existing);
      queue.push({ gx: seedRoom.gx, gy: seedRoom.gy });
    }
    const curr = queue.shift();
    const dirs = rng.shuffle(DIR_LIST);
    for (const d of dirs) {
      if (rooms.size >= targetRoomCount) break;
      const nx = curr.gx + d.dx;
      const ny = curr.gy + d.dy;
      const nKey = coordKey(nx, ny);
      if (!inBounds(nx, ny) || rooms.has(nKey)) continue;
      // Classic Isaac rule: avoid creating 2x2 loops by requiring at most 1 existing neighbor
      if (countNeighbors(nx, ny) > 1) continue;
      if (rng.chance(0.55)) {
        rooms.set(nKey, makeRoom(nx, ny, ROOM_TYPES.NORMAL));
        queue.push({ gx: nx, gy: ny });
      }
    }
  }

  // BFS distances from START
  const distances = new Map();
  const bfsQueue = [startKey];
  distances.set(startKey, 0);
  while (bfsQueue.length > 0) {
    const k = bfsQueue.shift();
    const r = rooms.get(k);
    const dist = distances.get(k);
    for (const d of DIR_LIST) {
      const nk = coordKey(r.gx + d.dx, r.gy + d.dy);
      if (rooms.has(nk) && !distances.has(nk)) {
        distances.set(nk, dist + 1);
        bfsQueue.push(nk);
      }
    }
  }

  // Find dead ends (degree === 1, excluding START)
  const getDeadEnds = () =>
    Array.from(rooms.values()).filter(
      (r) => r.key !== startKey && countNeighbors(r.gx, r.gy) === 1
    );

  // Guarantee at least 3 dead ends for BOSS, TREASURE, SHOP
  let extraGuard = 0;
  while (getDeadEnds().length < 3 && extraGuard < 100) {
    extraGuard++;
    const allRooms = rng.shuffle(Array.from(rooms.values()));
    let added = false;
    for (const r of allRooms) {
      for (const d of rng.shuffle(DIR_LIST)) {
        const nx = r.gx + d.dx;
        const ny = r.gy + d.dy;
        const nk = coordKey(nx, ny);
        if (inBounds(nx, ny) && !rooms.has(nk) && countNeighbors(nx, ny) === 1) {
          rooms.set(nk, makeRoom(nx, ny, ROOM_TYPES.NORMAL));
          distances.set(nk, (distances.get(r.key) ?? 0) + 1);
          added = true;
          break;
        }
      }
      if (added) break;
    }
  }

  const deadEnds = getDeadEnds().sort(
    (a, b) => (distances.get(b.key) ?? 0) - (distances.get(a.key) ?? 0)
  );

  // Assign BOSS to farthest dead-end
  const bossRoom = deadEnds[0];
  bossRoom.type = ROOM_TYPES.BOSS;
  bossRoom.cleared = false;

  // Assign TREASURE and SHOP to remaining dead-ends
  const treasureRoom = deadEnds[1];
  treasureRoom.type = ROOM_TYPES.TREASURE;
  treasureRoom.cleared = true;

  const shopRoom = deadEnds[2];
  shopRoom.type = ROOM_TYPES.SHOP;
  shopRoom.cleared = true;

  // Link doors between adjacent rooms
  for (const room of rooms.values()) {
    for (const d of DIR_LIST) {
      const nk = coordKey(room.gx + d.dx, room.gy + d.dy);
      if (rooms.has(nk)) {
        const neighbor = rooms.get(nk);
        let doorType = ROOM_TYPES.NORMAL;
        if (room.type === ROOM_TYPES.BOSS || neighbor.type === ROOM_TYPES.BOSS) {
          doorType = ROOM_TYPES.BOSS;
        } else if (room.type === ROOM_TYPES.TREASURE || neighbor.type === ROOM_TYPES.TREASURE) {
          doorType = ROOM_TYPES.TREASURE;
        } else if (room.type === ROOM_TYPES.SHOP || neighbor.type === ROOM_TYPES.SHOP) {
          doorType = ROOM_TYPES.SHOP;
        }
        // Floor 2+ treasure rooms and all shop rooms can be locked (unlocked with 1 key)
        // Floor 1 treasure room is free just like classic Isaac!
        const needsKey =
          (neighbor.type === ROOM_TYPES.TREASURE && floorLevel >= 2) ||
          (neighbor.type === ROOM_TYPES.SHOP && floorLevel >= 2);
        room.doors[d.key] = {
          direction: d.key,
          toKey: nk,
          doorType,
          locked: needsKey
        };
      }
    }
  }

  // Populate room contents (obstacles, enemies, pedestals, shop items)
  const usedInFloor = new Set(ownedItemIds);

  for (const room of rooms.values()) {
    if (room.type === ROOM_TYPES.NORMAL) {
      const tpl = rng.pick(ROOM_TEMPLATES);
      tpl(room.grid);
      // 35% chance to turn one rock into a Tinted Rock (blueish X rock hiding a Soul Heart!)
      if (rng.chance(0.35)) {
        const rockCells = [];
        for (let r = 0; r < GRID_ROWS; r++) {
          for (let c = 0; c < GRID_COLS; c++) {
            if (room.grid[r][c] === TILE_TYPES.ROCK) rockCells.push([c, r]);
          }
        }
        if (rockCells.length > 0) {
          const [tc, tr] = rng.pick(rockCells);
          room.grid[tr][tc] = TILE_TYPES.TINTED_ROCK;
        }
      }
      room.enemySpawns = generateEnemyWave(room.type, floorLevel, rng);
    } else if (room.type === ROOM_TYPES.BOSS) {
      room.enemySpawns = generateEnemyWave(room.type, floorLevel, rng);
    } else if (room.type === ROOM_TYPES.TREASURE) {
      const item = pickItemFromPool(rng, 'treasure', usedInFloor);
      usedInFloor.add(item.id);
      room.pedestals.push({
        col: 7,
        row: 4,
        item,
        taken: false
      });
    } else if (room.type === ROOM_TYPES.SHOP) {
      const shopPassive = pickItemFromPool(rng, 'shop', usedInFloor);
      usedInFloor.add(shopPassive.id);
      room.shopItems = [
        { col: 5, row: 4, kind: 'pickup', pickupType: 'soul_heart', label: '魂心', price: 5, bought: false },
        { col: 7, row: 4, kind: 'item', item: shopPassive, label: shopPassive.name, price: 15, bought: false },
        { col: 9, row: 4, kind: 'pickup', pickupType: 'bomb', label: '炸弹', price: 5, bought: false }
      ];
    }
  }

  const startRoom = rooms.get(startKey);
  startRoom.visited = true;

  return {
    level: floorLevel,
    theme: FLOOR_THEMES[Math.min(floorLevel - 1, FLOOR_THEMES.length - 1)],
    rooms,
    startKey,
    bossKey: bossRoom.key,
    treasureKey: treasureRoom.key,
    shopKey: shopRoom.key
  };
}
