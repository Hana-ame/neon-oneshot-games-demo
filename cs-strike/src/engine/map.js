import { DUST2_GRID, MAP_ZONES } from './constants.js';

export class TacticalMap {
  constructor(grid = DUST2_GRID, zones = MAP_ZONES) {
    this.grid = grid;
    this.height = grid.length;
    this.width = grid[0].length;
    this.zones = zones;
  }

  getTile(gx, gy) {
    if (gx < 0 || gy < 0 || gx >= this.width || gy >= this.height) {
      return 1; // Treat out-of-bounds as solid sandstone wall
    }
    return this.grid[gy][gx];
  }

  isSolid(gx, gy) {
    return this.getTile(gx, gy) !== 0;
  }

  isPointBlocked(x, y, radius = 0.28) {
    const minX = Math.floor(x - radius);
    const maxX = Math.floor(x + radius);
    const minY = Math.floor(y - radius);
    const maxY = Math.floor(y + radius);
    for (let gy = minY; gy <= maxY; gy++) {
      for (let gx = minX; gx <= maxX; gx++) {
        if (this.isSolid(gx, gy)) {
          // Circle vs unit-square AABB intersection
          const closestX = Math.max(gx, Math.min(x, gx + 1));
          const closestY = Math.max(gy, Math.min(y, gy + 1));
          const dx = x - closestX;
          const dy = y - closestY;
          if (dx * dx + dy * dy < radius * radius) {
            return true;
          }
        }
      }
    }
    return false;
  }

  resolveMovement(x, y, dx, dy, radius = 0.28) {
    let nx = x + dx;
    let ny = y;
    if (this.isPointBlocked(nx, ny, radius)) {
      nx = x;
    }
    ny = y + dy;
    if (this.isPointBlocked(nx, ny, radius)) {
      ny = y;
    }
    return { x: nx, y: ny };
  }

  getBombsiteAt(x, y) {
    for (const key of ['SITE_A', 'SITE_B']) {
      const z = this.zones[key];
      if (x >= z.xMin && x <= z.xMax && y >= z.yMin && y <= z.yMax) {
        return z.id;
      }
    }
    return null;
  }

  isInBuyZone(team, x, y) {
    const z = team === 'CT' ? this.zones.CT_SPAWN : this.zones.T_SPAWN;
    return x >= z.xMin && x <= z.xMax && y >= z.yMin && y <= z.yMax;
  }

  // Digital Differential Analyzer (DDA) raycast against map grid
  castRay(ox, oy, angle, maxDist = 60) {
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    let mapX = Math.floor(ox);
    let mapY = Math.floor(oy);

    const deltaDistX = dirX === 0 ? 1e30 : Math.abs(1 / dirX);
    const deltaDistY = dirY === 0 ? 1e30 : Math.abs(1 / dirY);

    let stepX, stepY, sideDistX, sideDistY;
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

    let hit = 0;
    let side = 0;
    let dist = 0;
    let steps = 0;

    while (hit === 0 && dist < maxDist && steps < 128) {
      steps++;
      if (sideDistX < sideDistY) {
        sideDistX += deltaDistX;
        mapX += stepX;
        side = 0;
        dist = sideDistX - deltaDistX;
      } else {
        sideDistY += deltaDistY;
        mapY += stepY;
        side = 1;
        dist = sideDistY - deltaDistY;
      }
      const tile = this.getTile(mapX, mapY);
      if (tile !== 0) {
        hit = tile;
      }
    }

    if (hit === 0) {
      return {
        hit: false,
        tile: 0,
        distance: maxDist,
        side: 0,
        wallX: 0,
        hitX: ox + dirX * maxDist,
        hitY: oy + dirY * maxDist,
      };
    }

    const perpDist = Math.max(0.001, dist);
    const hitX = ox + dirX * perpDist;
    const hitY = oy + dirY * perpDist;
    let wallX = side === 0 ? hitY - Math.floor(hitY) : hitX - Math.floor(hitX);
    if (wallX < 0) wallX += 1;

    return {
      hit: true,
      tile: hit,
      distance: perpDist,
      side,
      wallX,
      hitX,
      hitY,
      mapX,
      mapY,
    };
  }

  hasLineOfSight(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const targetDist = Math.hypot(dx, dy);
    if (targetDist < 0.05) return true;
    const angle = Math.atan2(dy, dx);
    const ray = this.castRay(x1, y1, angle, targetDist + 0.1);
    return !ray.hit || ray.distance >= targetDist - 0.15;
  }

  // Grid BFS pathfinding returning array of tile centers [{x, y}]
  findPath(startX, startY, goalX, goalY) {
    const sx = Math.max(0, Math.min(this.width - 1, Math.floor(startX)));
    const sy = Math.max(0, Math.min(this.height - 1, Math.floor(startY)));
    const gx = Math.max(0, Math.min(this.width - 1, Math.floor(goalX)));
    const gy = Math.max(0, Math.min(this.height - 1, Math.floor(goalY)));

    if (sx === gx && sy === gy) {
      return [{ x: gx + 0.5, y: gy + 0.5 }];
    }

    const key = (x, y) => y * this.width + x;
    const visited = new Uint8Array(this.width * this.height);
    const parent = new Int32Array(this.width * this.height).fill(-1);
    const queue = [key(sx, sy)];
    visited[key(sx, sy)] = 1;

    const dirs = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
    ];

    let found = false;
    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      const cx = cur % this.width;
      const cy = Math.floor(cur / this.width);
      if (cx === gx && cy === gy) {
        found = true;
        break;
      }
      for (const [dx, dy] of dirs) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx >= 0 && ny >= 0 && nx < this.width && ny < this.height) {
          const nk = key(nx, ny);
          if (!visited[nk] && !this.isSolid(nx, ny)) {
            visited[nk] = 1;
            parent[nk] = cur;
            queue.push(nk);
          }
        }
      }
    }

    if (!found) return [];
    const path = [];
    let cur = key(gx, gy);
    while (cur !== -1 && cur !== key(sx, sy)) {
      const px = cur % this.width;
      const py = Math.floor(cur / this.width);
      path.push({ x: px + 0.5, y: py + 0.5 });
      cur = parent[cur];
    }
    path.reverse();
    return path;
  }
}
