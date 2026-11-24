/**
 * Web COD — Operation Ironline
 * Tactical map representation, AABB/circle collision resolution,
 * DDA raycasting, and line-of-sight checks.
 */
(function (root) {
  'use strict';

  class TacticalMap {
    constructor(mapDef) {
      if (!mapDef || !Array.isArray(mapDef.grid) || mapDef.grid.length === 0) {
        throw new Error('Invalid map definition');
      }
      this.id = mapDef.id;
      this.name = mapDef.name;
      this.description = mapDef.description || '';
      this.grid = mapDef.grid.map((row) => row.slice());
      this.height = this.grid.length;
      this.width = this.grid[0].length;
      this.playerSpawn = { ...mapDef.playerSpawn };
      this.enemySpawns = (mapDef.enemySpawns || []).map((s) => ({ ...s }));
    }

    getTile(x, y) {
      const gx = Math.floor(x);
      const gy = Math.floor(y);
      if (gx < 0 || gy < 0 || gx >= this.width || gy >= this.height) {
        return 4; // Solid outer boundary
      }
      return this.grid[gy][gx];
    }

    isWall(x, y) {
      return this.getTile(x, y) > 0;
    }

    /**
     * Checks whether a circle of given radius at (x, y) overlaps any solid tile.
     */
    collidesCircle(x, y, radius) {
      const minX = Math.floor(x - radius);
      const maxX = Math.floor(x + radius);
      const minY = Math.floor(y - radius);
      const maxY = Math.floor(y + radius);

      for (let gy = minY; gy <= maxY; gy++) {
        for (let gx = minX; gx <= maxX; gx++) {
          if (this.getTile(gx, gy) > 0) {
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

    /**
     * Moves an entity from (x, y) by (dx, dy) with axis-separated wall sliding.
     */
    moveWithSlide(x, y, dx, dy, radius) {
      let nextX = x + dx;
      let nextY = y;
      if (this.collidesCircle(nextX, nextY, radius)) {
        nextX = x;
      }
      nextY = y + dy;
      if (this.collidesCircle(nextX, nextY, radius)) {
        nextY = y;
      }
      return { x: nextX, y: nextY };
    }

    /**
     * Digital Differential Analyzer (DDA) raycast from (originX, originY) along angle.
     * Returns hit distance, hit coordinates, wall tile ID, side (0=NS, 1=EW), and texture U coordinate.
     */
    castRay(originX, originY, angle, maxDist = 40) {
      const rayDirX = Math.cos(angle);
      const rayDirY = Math.sin(angle);

      let mapX = Math.floor(originX);
      let mapY = Math.floor(originY);

      const deltaDistX = rayDirX === 0 ? 1e30 : Math.abs(1 / rayDirX);
      const deltaDistY = rayDirY === 0 ? 1e30 : Math.abs(1 / rayDirY);

      let stepX, stepY, sideDistX, sideDistY;

      if (rayDirX < 0) {
        stepX = -1;
        sideDistX = (originX - mapX) * deltaDistX;
      } else {
        stepX = 1;
        sideDistX = (mapX + 1.0 - originX) * deltaDistX;
      }

      if (rayDirY < 0) {
        stepY = -1;
        sideDistY = (originY - mapY) * deltaDistY;
      } else {
        stepY = 1;
        sideDistY = (mapY + 1.0 - originY) * deltaDistY;
      }

      let side = 0;
      let tile = 0;
      let dist = 0;
      let steps = 0;
      const maxSteps = Math.ceil(maxDist * 2.5);

      while (steps < maxSteps) {
        steps++;
        if (sideDistX < sideDistY) {
          sideDistX += deltaDistX;
          mapX += stepX;
          side = 0;
          dist = (mapX - originX + (1 - stepX) / 2) / (rayDirX || 1e-9);
        } else {
          sideDistY += deltaDistY;
          mapY += stepY;
          side = 1;
          dist = (mapY - originY + (1 - stepY) / 2) / (rayDirY || 1e-9);
        }

        if (dist > maxDist) {
          return {
            hit: false,
            dist: maxDist,
            tile: 0,
            side,
            wallX: 0,
            hitX: originX + rayDirX * maxDist,
            hitY: originY + rayDirY * maxDist
          };
        }

        tile = this.getTile(mapX, mapY);
        if (tile > 0) {
          const safeDist = Math.max(0.001, dist);
          let wallX = side === 0 ? originY + safeDist * rayDirY : originX + safeDist * rayDirX;
          wallX -= Math.floor(wallX);
          return {
            hit: true,
            dist: safeDist,
            tile,
            side,
            wallX,
            hitX: originX + rayDirX * safeDist,
            hitY: originY + rayDirY * safeDist
          };
        }
      }

      return {
        hit: false,
        dist: maxDist,
        tile: 0,
        side: 0,
        wallX: 0,
        hitX: originX + rayDirX * maxDist,
        hitY: originY + rayDirY * maxDist
      };
    }

    /**
     * Checks unobstructed line of sight between two points.
     */
    hasLineOfSight(x1, y1, x2, y2) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.001) return true;
      const angle = Math.atan2(dy, dx);
      const ray = this.castRay(x1, y1, angle, dist);
      return !ray.hit || ray.dist >= dist - 0.05;
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TacticalMap };
  } else {
    root.WebCOD = root.WebCOD || {};
    root.WebCOD.TacticalMap = TacticalMap;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
