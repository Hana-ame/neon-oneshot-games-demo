// Procedural Dungeon Room-Graph Generator with Guaranteed Connectivity

import { createRng } from '../engine/math.js';
import { ROOM_W, ROOM_H, WALL_T, SHOP_ITEMS } from './constants.js';

const DIRS = [
  { key: 'N', dx: 0, dy: -1, opp: 'S' },
  { key: 'S', dx: 0, dy: 1, opp: 'N' },
  { key: 'W', dx: -1, dy: 0, opp: 'E' },
  { key: 'E', dx: 1, dy: 0, opp: 'W' }
];

function coordKey(gx, gy) {
  return `${gx},${gy}`;
}

function generateRoomObstacles(type, rng) {
  if (type === 'start' || type === 'treasure' || type === 'shop') {
    return [];
  }
  if (type === 'boss') {
    // 4 symmetric cover pillars leaving wide center and door lanes
    const pw = 56;
    const ph = 56;
    return [
      { x: 180, y: 145, w: pw, h: ph, destructible: false },
      { x: ROOM_W - 180 - pw, y: 145, w: pw, h: ph, destructible: false },
      { x: 180, y: ROOM_H - 145 - ph, w: pw, h: ph, destructible: false },
      { x: ROOM_W - 180 - pw, y: ROOM_H - 145 - ph, w: pw, h: ph, destructible: false }
    ];
  }

  // Combat room obstacle templates (all keep door corridors clear)
  const layout = rng.int(0, 3);
  if (layout === 0) {
    return [
      { x: 200, y: 150, w: 62, h: 62, destructible: false },
      { x: ROOM_W - 262, y: 150, w: 62, h: 62, destructible: false },
      { x: 200, y: ROOM_H - 212, w: 62, h: 62, destructible: false },
      { x: ROOM_W - 262, y: ROOM_H - 212, w: 62, h: 62, destructible: false }
    ];
  }
  if (layout === 1) {
    return [
      { x: ROOM_W / 2 - 42, y: ROOM_H / 2 - 42, w: 84, h: 84, destructible: false },
      { x: 170, y: ROOM_H / 2 - 24, w: 48, h: 48, destructible: true, hp: 30 },
      { x: ROOM_W - 218, y: ROOM_H / 2 - 24, w: 48, h: 48, destructible: true, hp: 30 }
    ];
  }
  if (layout === 2) {
    return [
      { x: 230, y: 170, w: 120, h: 36, destructible: false },
      { x: ROOM_W - 350, y: ROOM_H - 206, w: 120, h: 36, destructible: false },
      { x: ROOM_W / 2 - 22, y: 160, w: 44, h: 44, destructible: true, hp: 30 },
      { x: ROOM_W / 2 - 22, y: ROOM_H - 204, w: 44, h: 44, destructible: true, hp: 30 }
    ];
  }
  return [
    { x: 220, y: ROOM_H / 2 - 70, w: 44, h: 140, destructible: false },
    { x: ROOM_W - 264, y: ROOM_H / 2 - 70, w: 44, h: 140, destructible: false }
  ];
}

function generateEnemySpawns(floor, rng, obstacles) {
  const pool =
    floor === 1
      ? ['bullet_kin', 'bullet_kin', 'shotgun_kin', 'spiral_turret']
      : floor === 2
      ? ['bullet_kin', 'shotgun_kin', 'spiral_turret', 'sniper_ghost', 'dasher_imp']
      : ['shotgun_kin', 'spiral_turret', 'sniper_ghost', 'dasher_imp', 'dasher_imp'];

  const count = Math.min(7, 3 + floor + rng.int(0, 2));
  const spawns = [];
  const marginX = WALL_T + 90;
  const marginY = WALL_T + 80;

  for (let i = 0; i < count; i++) {
    let sx = ROOM_W / 2;
    let sy = ROOM_H / 2;
    for (let attempt = 0; attempt < 25; attempt++) {
      const cx = rng.int(marginX, ROOM_W - marginX);
      const cy = rng.int(marginY, ROOM_H - marginY);
      const blocked = obstacles.some(
        (o) => cx > o.x - 28 && cx < o.x + o.w + 28 && cy > o.y - 28 && cy < o.y + o.h + 28
      );
      if (!blocked) {
        sx = cx;
        sy = cy;
        break;
      }
    }
    spawns.push({
      type: rng.pick(pool),
      x: sx,
      y: sy
    });
  }
  return spawns;
}

export function generateDungeon(floor = 1, seed = 1001) {
  const rng = createRng(seed + floor * 7919);
  const targetRoomCount = Math.min(11, 6 + floor * 2);

  const roomsMap = new Map();
  const startRoom = {
    id: coordKey(0, 0),
    gx: 0,
    gy: 0,
    type: 'start',
    doors: {},
    visited: true,
    cleared: true,
    obstacles: [],
    enemySpawns: [],
    chest: null,
    shopItems: [],
    portalOpen: false
  };
  roomsMap.set(startRoom.id, startRoom);

  const frontier = [startRoom];
  let guard = 0;

  while (roomsMap.size < targetRoomCount && guard < 400) {
    guard++;
    const base = rng.pick(frontier);
    const dir = rng.pick(DIRS);
    const nx = base.gx + dir.dx;
    const ny = base.gy + dir.dy;
    const nKey = coordKey(nx, ny);

    if (roomsMap.has(nKey)) continue;

    // Limit crowded 2x2 clusters so the dungeon feels like branching halls
    let neighborCount = 0;
    for (const d of DIRS) {
      if (roomsMap.has(coordKey(nx + d.dx, ny + d.dy))) neighborCount++;
    }
    if (neighborCount > 2 && rng.next() < 0.75) continue;

    const newRoom = {
      id: nKey,
      gx: nx,
      gy: ny,
      type: 'combat',
      doors: {},
      visited: false,
      cleared: false,
      obstacles: [],
      enemySpawns: [],
      chest: null,
      shopItems: [],
      portalOpen: false
    };

    roomsMap.set(nKey, newRoom);
    frontier.push(newRoom);
  }

  // Link adjacent rooms with doors (all orthogonal neighbors connected for crisp navigation,
  // except we keep boss room to 1 door if possible)
  const rooms = Array.from(roomsMap.values());

  // Compute BFS distance from start (using adjacency)
  const adjacency = new Map();
  for (const r of rooms) {
    const adj = [];
    for (const d of DIRS) {
      const nb = roomsMap.get(coordKey(r.gx + d.dx, r.gy + d.dy));
      if (nb) adj.push({ dir: d, room: nb });
    }
    adjacency.set(r.id, adj);
  }

  const distMap = new Map([[startRoom.id, 0]]);
  const queue = [startRoom];
  while (queue.length > 0) {
    const cur = queue.shift();
    const cd = distMap.get(cur.id);
    for (const { room: nb } of adjacency.get(cur.id)) {
      if (!distMap.has(nb.id)) {
        distMap.set(nb.id, cd + 1);
        queue.push(nb);
      }
    }
  }

  // Pick Boss room: furthest room from start (prefer dead-end if tied)
  const nonStart = rooms.filter((r) => r.id !== startRoom.id);
  nonStart.sort((a, b) => {
    const da = distMap.get(a.id) || 0;
    const db = distMap.get(b.id) || 0;
    if (db !== da) return db - da;
    return adjacency.get(a.id).length - adjacency.get(b.id).length;
  });
  const bossRoom = nonStart[0];
  bossRoom.type = 'boss';

  // Pick Treasure room (second furthest or leaf, distinct from boss)
  const remaining = nonStart.filter((r) => r.id !== bossRoom.id);
  const treasureRoom = remaining.find((r) => adjacency.get(r.id).length === 1) || remaining[0];
  if (treasureRoom) {
    treasureRoom.type = 'treasure';
    treasureRoom.cleared = true;
    treasureRoom.chest = {
      x: ROOM_W / 2,
      y: ROOM_H / 2,
      opened: false,
      rewardWeaponIndex: Math.min(3, floor) // Unlocks Shotgun on F1, SMG on F2, Railgun on F3
    };
  }

  // Pick Shop room if enough rooms
  const remainingForShop = remaining.filter((r) => r !== treasureRoom);
  if (remainingForShop.length >= 2) {
    const shopRoom = remainingForShop[remainingForShop.length - 1];
    shopRoom.type = 'shop';
    shopRoom.cleared = true;
    shopRoom.shopItems = SHOP_ITEMS.slice(0, 3).map((item, idx) => ({
      ...item,
      x: ROOM_W / 2 - 150 + idx * 150,
      y: ROOM_H / 2,
      purchased: false
    }));
  }

  // Wire up doors between adjacent rooms
  for (const r of rooms) {
    for (const { dir, room: nb } of adjacency.get(r.id)) {
      r.doors[dir.key] = nb.id;
    }
  }

  // Populate obstacles & enemy spawns
  for (const r of rooms) {
    r.obstacles = generateRoomObstacles(r.type, rng);
    if (r.type === 'combat') {
      r.enemySpawns = generateEnemySpawns(floor, rng, r.obstacles);
    }
  }

  return {
    floor,
    seed,
    startRoomId: startRoom.id,
    bossRoomId: bossRoom.id,
    rooms: roomsMap
  };
}
