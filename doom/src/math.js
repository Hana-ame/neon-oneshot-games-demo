import { SOLID_TILES, DOOR_TILES } from './constants.js';

export const TWO_PI = Math.PI * 2;

export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

export function normalizeAngle(angle) {
  let a = angle % TWO_PI;
  if (a < 0) a += TWO_PI;
  return a;
}

export function angleDiff(a, b) {
  let diff = (b - a + Math.PI) % TWO_PI;
  if (diff < 0) diff += TWO_PI;
  return diff - Math.PI;
}

export function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

/**
 * Checks whether a grid coordinate is currently blocking movement or rays.
 * Doors with openAmount > 0.78 are passable for movement, and partially open
 * doors are handled with exact offset testing in DDA raycasting.
 */
export function isTileBlockingMovement(grid, doors, gx, gy) {
  if (gy < 0 || gy >= grid.length || gx < 0 || gx >= grid[0].length) {
    return true;
  }
  const tile = grid[gy][gx];
  if (SOLID_TILES.has(tile)) return true;
  if (DOOR_TILES.has(tile)) {
    const key = `${gx},${gy}`;
    const door = doors.get(key);
    return !door || door.openAmount < 0.78;
  }
  return false;
}

/**
 * Casts a single ray from (ox, oy) at `angle` using the Digital Differential Analyzer (DDA) algorithm.
 * Supports recessed sliding doors with partial open offsets.
 */
export function castRay(grid, doors, ox, oy, angle, maxDist = 32) {
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);

  let mapX = Math.floor(ox);
  let mapY = Math.floor(oy);

  const deltaDistX = Math.abs(dirX) < 1e-9 ? 1e9 : Math.abs(1 / dirX);
  const deltaDistY = Math.abs(dirY) < 1e-9 ? 1e9 : Math.abs(1 / dirY);

  let stepX = 0;
  let stepY = 0;
  let sideDistX = 0;
  let sideDistY = 0;

  if (dirX < 0) {
    stepX = -1;
    sideDistX = (ox - mapX) * deltaDistX;
  } else {
    stepX = 1;
    sideDistX = (mapX + 1.0 - ox) * deltaDistX;
  }

  if (dirY < 0) {
    stepY = -1;
    sideDistY = (oy - mapY) * deltaDistY;
  } else {
    stepY = 1;
    sideDistY = (mapY + 1.0 - oy) * deltaDistY;
  }

  let side = 0;
  let steps = 0;
  const maxSteps = Math.ceil(maxDist * 2.5);

  while (steps < maxSteps) {
    steps++;
    if (sideDistX < sideDistY) {
      sideDistX += deltaDistX;
      mapX += stepX;
      side = 0;
    } else {
      sideDistY += deltaDistY;
      mapY += stepY;
      side = 1;
    }

    if (mapY < 0 || mapY >= grid.length || mapX < 0 || mapX >= grid[0].length) {
      return {
        hit: false,
        dist: maxDist,
        tile: 1,
        side,
        mapX,
        mapY,
        texX: 0,
        hitX: ox + dirX * maxDist,
        hitY: oy + dirY * maxDist,
      };
    }

    const tile = grid[mapY][mapX];
    if (tile === 0) continue;

    const rawDist = side === 0 ? sideDistX - deltaDistX : sideDistY - deltaDistY;
    if (rawDist > maxDist) {
      return {
        hit: false,
        dist: maxDist,
        tile: 0,
        side,
        mapX,
        mapY,
        texX: 0,
        hitX: ox + dirX * maxDist,
        hitY: oy + dirY * maxDist,
      };
    }

    if (DOOR_TILES.has(tile)) {
      const door = doors.get(`${mapX},${mapY}`);
      const openAmount = door ? door.openAmount : 0;
      if (openAmount >= 0.98) {
        continue;
      }
      // Compute intersection at the door face
      const hitX = ox + dirX * rawDist;
      const hitY = oy + dirY * rawDist;
      let wallX = side === 0 ? hitY - Math.floor(hitY) : hitX - Math.floor(hitX);
      if (wallX < openAmount) {
        // Ray passes through the opened gap of the sliding door
        continue;
      }
      const texX = clamp(wallX - openAmount, 0, 0.9999);
      return {
        hit: true,
        dist: Math.max(0.05, rawDist),
        tile,
        side,
        mapX,
        mapY,
        texX,
        hitX,
        hitY,
      };
    }

    if (SOLID_TILES.has(tile)) {
      const hitX = ox + dirX * rawDist;
      const hitY = oy + dirY * rawDist;
      let wallX = side === 0 ? hitY - Math.floor(hitY) : hitX - Math.floor(hitX);
      if ((side === 0 && dirX > 0) || (side === 1 && dirY < 0)) {
        wallX = 1 - wallX;
      }
      return {
        hit: true,
        dist: Math.max(0.05, rawDist),
        tile,
        side,
        mapX,
        mapY,
        texX: clamp(wallX, 0, 0.9999),
        hitX,
        hitY,
      };
    }
  }

  return {
    hit: false,
    dist: maxDist,
    tile: 0,
    side,
    mapX,
    mapY,
    texX: 0,
    hitX: ox + dirX * maxDist,
    hitY: oy + dirY * maxDist,
  };
}

/**
 * Checks if there is an unobstructed line of sight between (x1, y1) and (x2, y2).
 */
export function hasLineOfSight(grid, doors, x1, y1, x2, y2) {
  const dist = distance(x1, y1, x2, y2);
  if (dist < 0.05) return true;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const ray = castRay(grid, doors, x1, y1, angle, dist);
  return !ray.hit || ray.dist >= dist - 0.15;
}
