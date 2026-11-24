import { ENEMY_TYPES, PICKUP_TYPES, DOOR_TILES, TILE } from './constants.js';

export function createEnemy(def, id) {
  const spec = ENEMY_TYPES[def.type];
  if (!spec) {
    throw new Error(`Unknown enemy type: ${def.type}`);
  }
  return {
    id,
    type: def.type,
    name: spec.name,
    x: def.x,
    y: def.y,
    hp: spec.maxHp,
    maxHp: spec.maxHp,
    speed: spec.speed,
    radius: spec.radius,
    sightRange: spec.sightRange,
    attackRange: spec.attackRange,
    attackCooldown: spec.attackCooldown,
    damage: spec.damage,
    ranged: spec.ranged,
    projectileSpeed: spec.projectileSpeed,
    projectileColor: spec.projectileColor,
    score: spec.score,
    spriteScale: spec.spriteScale,
    state: 'idle', // idle | chase | attack | pain | dead
    stateTimer: 0,
    attackTimer: 0.4,
    animTime: (id * 0.37) % 1,
    alive: true,
  };
}

export function createPickup(def, id) {
  const spec = PICKUP_TYPES[def.type];
  if (!spec) {
    throw new Error(`Unknown pickup type: ${def.type}`);
  }
  return {
    id,
    type: def.type,
    label: spec.label,
    color: spec.color,
    x: def.x,
    y: def.y,
    collected: false,
  };
}

export function createProjectile({ x, y, vx, vy, damage, fromPlayer, color, radius = 0.16 }) {
  return {
    x,
    y,
    vx,
    vy,
    damage,
    fromPlayer,
    color,
    radius,
    alive: true,
    age: 0,
  };
}

export function buildDoorMap(grid) {
  const doors = new Map();
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const tile = grid[y][x];
      if (DOOR_TILES.has(tile)) {
        const requiredKey =
          tile === TILE.DOOR_BLUE ? 'blue' : tile === TILE.DOOR_RED ? 'red' : null;
        doors.set(`${x},${y}`, {
          x,
          y,
          tile,
          requiredKey,
          state: 'closed', // closed | opening | open | closing
          openAmount: 0,
          holdTimer: 0,
        });
      }
    }
  }
  return doors;
}
