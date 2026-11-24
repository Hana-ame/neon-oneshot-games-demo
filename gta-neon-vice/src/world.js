(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./config'));
  } else {
    root.GTAWorld = factory(root.GTAConfig);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Config) {
  'use strict';

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class CityWorld {
    constructor(seed = 2026) {
      this.seed = seed;
      this.rng = mulberry32(seed);
      this.tileSize = Config.TILE_SIZE;
      this.mapTiles = Config.MAP_TILES;
      this.size = Config.WORLD_SIZE;
      this.tiles = new Uint8Array(this.mapTiles * this.mapTiles); // 0=road, 1=sidewalk, 2=building, 3=park
      this.buildings = [];
      this.parks = [];
      this.intersections = [];
      this.roadCenters = [];
      this.pickups = [];
      this._generate();
    }

    _generate() {
      const { STRIDE_TILES, ROAD_TILES, BLOCK_TILES, GRID_CELLS, TILE_SIZE, MAP_TILES } = Config;

      // Default everything to sidewalk, then carve roads and blocks
      this.tiles.fill(1);

      // Compute road center lines (each road spans 2 tiles: r and r+1)
      const roadStarts = [];
      for (let c = 0; c <= GRID_CELLS; c++) {
        roadStarts.push(c * STRIDE_TILES);
      }

      for (let ty = 0; ty < MAP_TILES; ty++) {
        for (let tx = 0; tx < MAP_TILES; tx++) {
          const onVertRoad = (tx % STRIDE_TILES) < ROAD_TILES;
          const onHorzRoad = (ty % STRIDE_TILES) < ROAD_TILES;
          if (onVertRoad || onHorzRoad) {
            this.tiles[ty * MAP_TILES + tx] = 0;
          }
        }
      }

      // Build intersection graph for traffic AI
      for (let iy = 0; iy < roadStarts.length; iy++) {
        for (let ix = 0; ix < roadStarts.length; ix++) {
          const cx = (roadStarts[ix] + ROAD_TILES * 0.5) * TILE_SIZE;
          const cy = (roadStarts[iy] + ROAD_TILES * 0.5) * TILE_SIZE;
          this.intersections.push({
            id: iy * roadStarts.length + ix,
            gx: ix,
            gy: iy,
            x: cx,
            y: cy
          });
        }
      }
      this.roadStarts = roadStarts;
      this.roadCenters = roadStarts.map(t => (t + ROAD_TILES * 0.5) * TILE_SIZE);

      // Populate city blocks with buildings or parks
      const roofPalettes = [
        { base: '#1e2738', roof: '#2a364d', trim: '#00f0ff' },
        { base: '#251e36', roof: '#342a4d', trim: '#ff2e93' },
        { base: '#1d2b2e', roof: '#293e42', trim: '#39ff14' },
        { base: '#2c241e', roof: '#3d3129', trim: '#ffaa00' },
        { base: '#202633', roof: '#2e374a', trim: '#7c5cff' }
      ];
      const neonTexts = ['CLUB', 'HOTEL', 'DINER', 'ARCADE', 'PAWN', 'CYBER', 'BAR', 'MOTEL', 'LOAN', 'TECH'];

      for (let by = 0; by < GRID_CELLS; by++) {
        for (let bx = 0; bx < GRID_CELLS; bx++) {
          const startTx = bx * STRIDE_TILES + ROAD_TILES;
          const startTy = by * STRIDE_TILES + ROAD_TILES;
          const blockX = startTx * TILE_SIZE;
          const blockY = startTy * TILE_SIZE;
          const blockW = BLOCK_TILES * TILE_SIZE;
          const blockH = BLOCK_TILES * TILE_SIZE;

          // Make center-ish block and a couple others parks for open visual variety
          const isPark = (bx === 3 && by === 3) || (bx === 5 && by === 5) || (bx === 1 && by === 4);
          if (isPark) {
            for (let ty = startTy; ty < startTy + BLOCK_TILES; ty++) {
              for (let tx = startTx; tx < startTx + BLOCK_TILES; tx++) {
                this.tiles[ty * MAP_TILES + tx] = 3;
              }
            }
            const trees = [];
            for (let i = 0; i < 6; i++) {
              trees.push({
                x: blockX + 34 + this.rng() * (blockW - 68),
                y: blockY + 34 + this.rng() * (blockH - 68),
                r: 14 + this.rng() * 10
              });
            }
            this.parks.push({ x: blockX + 12, y: blockY + 12, w: blockW - 24, h: blockH - 24, trees });
            continue;
          }

          // Mark interior tiles as building footprint (leave 14px sidewalk apron around block)
          for (let ty = startTy; ty < startTy + BLOCK_TILES; ty++) {
            for (let tx = startTx; tx < startTx + BLOCK_TILES; tx++) {
              this.tiles[ty * MAP_TILES + tx] = 2;
            }
          }

          const margin = 16;
          const splitMode = this.rng();
          const subRects = [];
          if (splitMode < 0.35) {
            // Single large skyscraper / landmark building
            subRects.push({
              x: blockX + margin,
              y: blockY + margin,
              w: blockW - margin * 2,
              h: blockH - margin * 2
            });
          } else if (splitMode < 0.7) {
            // Two buildings split horizontally with an alley
            const gap = 14;
            const halfW = (blockW - margin * 2 - gap) / 2;
            subRects.push({ x: blockX + margin, y: blockY + margin, w: halfW, h: blockH - margin * 2 });
            subRects.push({ x: blockX + margin + halfW + gap, y: blockY + margin, w: halfW, h: blockH - margin * 2 });
          } else {
            // Two buildings split vertically with an alley
            const gap = 14;
            const halfH = (blockH - margin * 2 - gap) / 2;
            subRects.push({ x: blockX + margin, y: blockY + margin, w: blockW - margin * 2, h: halfH });
            subRects.push({ x: blockX + margin, y: blockY + margin + halfH + gap, w: blockW - margin * 2, h: halfH });
          }

          for (const rect of subRects) {
            const palette = roofPalettes[Math.floor(this.rng() * roofPalettes.length)];
            const height = 28 + Math.floor(this.rng() * 56);
            const hasNeon = this.rng() > 0.45;
            this.buildings.push({
              id: this.buildings.length,
              x: rect.x,
              y: rect.y,
              w: rect.w,
              h: rect.h,
              height,
              baseColor: palette.base,
              roofColor: palette.roof,
              trimColor: palette.trim,
              neon: hasNeon ? neonTexts[Math.floor(this.rng() * neonTexts.length)] : null,
              hasHelipad: rect.w > 180 && rect.h > 180 && this.rng() > 0.5
            });
          }
        }
      }

      // Generate static pickups (health, armor, ammo, cash stashes)
      const pickupTypes = ['health', 'armor', 'ammo', 'cash'];
      for (let i = 0; i < 16; i++) {
        const pt = this.getRandomSidewalkPoint();
        this.pickups.push({
          id: i,
          type: pickupTypes[i % pickupTypes.length],
          x: pt.x,
          y: pt.y,
          active: true,
          respawnTimer: 0
        });
      }
    }

    getTileAt(x, y) {
      const tx = Math.floor(x / this.tileSize);
      const ty = Math.floor(y / this.tileSize);
      if (tx < 0 || ty < 0 || tx >= this.mapTiles || ty >= this.mapTiles) return 2;
      return this.tiles[ty * this.mapTiles + tx];
    }

    isOnRoad(x, y) {
      return this.getTileAt(x, y) === 0;
    }

    getDistrictAt(x, y) {
      const nx = Math.max(0, Math.min(0.999, x / this.size));
      const ny = Math.max(0, Math.min(0.999, y / this.size));
      for (const d of Config.DISTRICTS) {
        if (nx >= d.minX && nx < d.maxX && ny >= d.minY && ny < d.maxY) {
          return d;
        }
      }
      return Config.DISTRICTS[0];
    }

    pointInBuilding(x, y, padding = 0) {
      for (let i = 0; i < this.buildings.length; i++) {
        const b = this.buildings[i];
        if (
          x >= b.x - padding &&
          x <= b.x + b.w + padding &&
          y >= b.y - padding &&
          y <= b.y + b.h + padding
        ) {
          return b;
        }
      }
      return null;
    }

    getRandomRoadPoint() {
      const inter = this.intersections[Math.floor(this.rng() * this.intersections.length)];
      const laneOffset = (this.rng() > 0.5 ? 1 : -1) * (this.tileSize * 0.42);
      const horiz = this.rng() > 0.5;
      const x = Math.max(64, Math.min(this.size - 64, inter.x + (horiz ? (this.rng() - 0.5) * 180 : laneOffset)));
      const y = Math.max(64, Math.min(this.size - 64, inter.y + (horiz ? laneOffset : (this.rng() - 0.5) * 180)));
      return { x, y, angle: horiz ? (laneOffset > 0 ? 0 : Math.PI) : (laneOffset > 0 ? -Math.PI / 2 : Math.PI / 2) };
    }

    getRandomSidewalkPoint() {
      for (let tries = 0; tries < 50; tries++) {
        const inter = this.intersections[Math.floor(this.rng() * this.intersections.length)];
        const sx = (this.rng() > 0.5 ? 1 : -1) * (this.tileSize + 8);
        const sy = (this.rng() > 0.5 ? 1 : -1) * (this.tileSize + 8);
        const x = Math.max(40, Math.min(this.size - 40, inter.x + sx));
        const y = Math.max(40, Math.min(this.size - 40, inter.y + sy));
        if (!this.pointInBuilding(x, y, 14)) {
          return { x, y };
        }
      }
      return { x: this.roadCenters[1], y: this.roadCenters[1] };
    }

    getSafeSpawnPoint() {
      // Spawn near central intersection next to the central park
      const cx = this.roadCenters[3];
      const cy = this.roadCenters[3];
      return { x: cx + this.tileSize * 0.4, y: cy + this.tileSize * 0.4 };
    }
  }

  return { CityWorld, mulberry32 };
});
