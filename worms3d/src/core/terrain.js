/**
 * 百战天虫 3D - 可破坏 3D 高度场地形引擎
 * 支持确定性程序化岛屿生成、双线性插值高度查询、表面法线计算与实时球形弹坑挖掘。
 */

import { WORLD_CONFIG, MAP_THEMES } from './constants.js';

/** 确定性伪随机数生成器 (Mulberry32) */
export function createRNG(seed = 42) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 2D 梯度/值噪声 */
function createValueNoise2D(seed) {
  const rng = createRNG(seed);
  const perm = new Uint8Array(512);
  const vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    vals[i] = rng();
    perm[i] = i;
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = perm[i];
    perm[i] = perm[j];
    perm[j] = tmp;
  }
  for (let i = 0; i < 256; i++) {
    perm[i + 256] = perm[i];
  }

  function fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  return function noise(x, y) {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);

    const aa = vals[perm[perm[xi] + yi]];
    const ab = vals[perm[perm[xi] + yi + 1]];
    const ba = vals[perm[perm[xi + 1] + yi]];
    const bb = vals[perm[perm[xi + 1] + yi + 1]];

    return lerp(lerp(aa, ba, u), lerp(ab, bb, u), v);
  };
}

export class Terrain3D {
  constructor(options = {}) {
    this.gridSize = options.gridSize || WORLD_CONFIG.GRID_SIZE;
    this.worldSize = options.worldSize || WORLD_CONFIG.WORLD_SIZE;
    this.halfSize = this.worldSize * 0.5;
    this.cellSize = this.worldSize / (this.gridSize - 1);
    this.themeId = options.themeId || 'tropical';
    this.theme = MAP_THEMES[this.themeId] || MAP_THEMES.tropical;
    this.seed = options.seed !== undefined ? options.seed : 1337;

    const total = this.gridSize * this.gridSize;
    this.heights = new Float32Array(total);
    this.scorch = new Float32Array(total); // 0 = 原生植被/岩石, 1 = 焦黑弹坑
    this.dirty = true;
    this.craters = [];

    this.generate(this.seed, this.themeId);
  }

  /** 生成多峰 3D 岛屿地形 */
  generate(seed = this.seed, themeId = this.themeId) {
    this.seed = seed;
    this.themeId = themeId;
    this.theme = MAP_THEMES[themeId] || MAP_THEMES.tropical;
    this.craters = [];
    this.scorch.fill(0);

    const noise = createValueNoise2D(seed + this.theme.seedOffset);
    const rng = createRNG(seed + 999);

    // 随机生成 4 个岛屿主山峰/高地，增强百战天虫 3D 的高低差战术性
    const peaks = [];
    const peakCount = 4;
    for (let i = 0; i < peakCount; i++) {
      const angle = (i / peakCount) * Math.PI * 2 + rng() * 0.8;
      const dist = 10 + rng() * 14;
      peaks.push({
        x: Math.cos(angle) * dist,
        z: Math.sin(angle) * dist,
        radius: 10 + rng() * 8,
        height: 7 + rng() * 8,
      });
    }

    for (let gz = 0; gz < this.gridSize; gz++) {
      for (let gx = 0; gx < this.gridSize; gx++) {
        const wx = this.gridToWorld(gx);
        const wz = this.gridToWorld(gz);
        const distNorm = Math.hypot(wx, wz) / (this.halfSize * 0.92);

        // 多八度 FBM 噪声
        const n1 = noise(wx * 0.055 + 10, wz * 0.055 + 10);
        const n2 = noise(wx * 0.12 + 30, wz * 0.12 + 30) * 0.45;
        const n3 = noise(wx * 0.25 + 60, wz * 0.25 + 60) * 0.18;
        const fbm = (n1 + n2 + n3) / 1.63;

        // 岛屿边缘平滑衰减到海底
        const falloff = Math.max(0, 1 - Math.pow(distNorm, 2.35));
        let h = -3.8 + falloff * (11.5 + fbm * 8.5);

        // 叠加战术高地山峰
        for (const p of peaks) {
          const d = Math.hypot(wx - p.x, wz - p.z);
          if (d < p.radius) {
            const t = Math.cos((d / p.radius) * Math.PI * 0.5);
            h += t * t * p.height * Math.min(1, falloff * 1.4);
          }
        }

        // 火山主题中央留出战斗盆地
        if (this.themeId === 'volcano') {
          const centerDist = Math.hypot(wx, wz);
          if (centerDist < 9) {
            h -= (1 - centerDist / 9) * 3.5;
          }
        }

        this.heights[gz * this.gridSize + gx] = Math.max(-5.5, Math.min(WORLD_CONFIG.MAX_HEIGHT, h));
      }
    }

    this.dirty = true;
  }

  gridToWorld(g) {
    return -this.halfSize + g * this.cellSize;
  }

  worldToGridFloat(w) {
    return (w + this.halfSize) / this.cellSize;
  }

  isInsideWorld(x, z) {
    return Math.abs(x) <= this.halfSize && Math.abs(z) <= this.halfSize;
  }

  /** 双线性插值获取任意 (x, z) 处的精确地形高度 */
  getHeightAt(x, z) {
    const fx = this.worldToGridFloat(x);
    const fz = this.worldToGridFloat(z);

    if (fx < 0 || fz < 0 || fx > this.gridSize - 1 || fz > this.gridSize - 1) {
      return -5.5;
    }

    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const x1 = Math.min(this.gridSize - 1, x0 + 1);
    const z1 = Math.min(this.gridSize - 1, z0 + 1);

    const tx = fx - x0;
    const tz = fz - z0;

    const h00 = this.heights[z0 * this.gridSize + x0];
    const h10 = this.heights[z0 * this.gridSize + x1];
    const h01 = this.heights[z1 * this.gridSize + x0];
    const h11 = this.heights[z1 * this.gridSize + x1];

    const h0 = h00 + (h10 - h00) * tx;
    const h1 = h01 + (h11 - h01) * tx;
    return h0 + (h1 - h0) * tz;
  }

  /** 使用中心差分计算 (x, z) 处的单位表面法向量 */
  getNormalAt(x, z) {
    const eps = this.cellSize * 0.5;
    const hL = this.getHeightAt(x - eps, z);
    const hR = this.getHeightAt(x + eps, z);
    const hD = this.getHeightAt(x, z - eps);
    const hU = this.getHeightAt(x, z + eps);

    const nx = hL - hR;
    const ny = 2.0 * eps;
    const nz = hD - hU;
    const len = Math.hypot(nx, ny, nz) || 1;
    return { x: nx / len, y: ny / len, z: nz / len };
  }

  /**
   * 在 (cx, cy, cz) 处挖掘真实三维球形弹坑并写入焦黑着色权重
   * 返回受影响的顶点数量
   */
  carveCrater(cx, cy, cz, radius, depth = radius * 0.85) {
    const scorchRadius = radius * 1.25;
    const minGx = Math.max(0, Math.floor(this.worldToGridFloat(cx - scorchRadius - 1.5)));
    const maxGx = Math.min(this.gridSize - 1, Math.ceil(this.worldToGridFloat(cx + scorchRadius + 1.5)));
    const minGz = Math.max(0, Math.floor(this.worldToGridFloat(cz - scorchRadius - 1.5)));
    const maxGz = Math.min(this.gridSize - 1, Math.ceil(this.worldToGridFloat(cz + scorchRadius + 1.5)));

    let modifiedVertices = 0;

    for (let gz = minGz; gz <= maxGz; gz++) {
      const wz = this.gridToWorld(gz);
      const dz = wz - cz;
      for (let gx = minGx; gx <= maxGx; gx++) {
        const wx = this.gridToWorld(gx);
        const dx = wx - cx;
        const dist2D = Math.hypot(dx, dz);

        if (dist2D <= scorchRadius) {
          const idx = gz * this.gridSize + gx;
          const curH = this.heights[idx];

          // 仅当爆炸球体在垂直方向上触及地表时才产生挖掘与焦黑
          if (cy - Math.max(radius, depth) * 1.15 <= curH) {
            const scorchStrength = Math.max(0, 1 - dist2D / scorchRadius);
            this.scorch[idx] = Math.min(1, this.scorch[idx] + Math.pow(scorchStrength, 0.7) * 0.95);

            if (dist2D < radius) {
              const norm = dist2D / radius;
              const profile = Math.sqrt(Math.max(0, 1 - norm * norm));
              const sphereBottom = cy - profile * depth;
              const surfaceCarve = curH - profile * depth * 0.85;
              const targetH = cy <= curH + radius * 0.65
                ? Math.min(sphereBottom, surfaceCarve)
                : sphereBottom;
              const newH = Math.max(-5.5, Math.min(curH, targetH));

              if (newH < curH - 1e-4) {
                this.heights[idx] = newH;
                modifiedVertices++;
              }
            }
          }
        }
      }
    }

    if (modifiedVertices > 0) {
      this.craters.push({ x: cx, y: cy, z: cz, radius, depth });
      this.dirty = true;
    }
    return modifiedVertices;
  }

  /** 根据高度、坡度与焦黑程度计算顶点 RGB 颜色 */
  getVertexColor(gx, gz) {
    const idx = gz * this.gridSize + gx;
    const h = this.heights[idx];
    const scorch = this.scorch[idx];
    const wx = this.gridToWorld(gx);
    const wz = this.gridToWorld(gz);
    const normal = this.getNormalAt(wx, wz);

    let r, g, b;
    const t = this.theme;

    if (h < 1.2) {
      [r, g, b] = t.sandColor;
    } else if (normal.y < 0.72) {
      [r, g, b] = t.rockColor;
    } else if (h > 11.5) {
      const k = Math.min(1, (h - 11.5) / 4.5);
      r = t.grassColor[0] + (t.peakColor[0] - t.grassColor[0]) * k;
      g = t.grassColor[1] + (t.peakColor[1] - t.grassColor[1]) * k;
      b = t.grassColor[2] + (t.peakColor[2] - t.grassColor[2]) * k;
    } else {
      [r, g, b] = t.grassColor;
    }

    // 混合爆炸焦黑效果（弹坑内部深焦黑，边缘略带泥土焦痕）
    if (scorch > 0) {
      const s = Math.min(1, scorch * 1.05);
      r = r * (1 - s) + t.scorchColor[0] * s;
      g = g * (1 - s) + t.scorchColor[1] * s;
      b = b * (1 - s) + t.scorchColor[2] * s;
    }

    return [r, g, b];
  }

  /** 寻找高于海平面且相对平坦的出生点 */
  findSpawnPoints(count, waterLevel = WORLD_CONFIG.WATER_LEVEL, seed = this.seed + 77) {
    const rng = createRNG(seed);
    const points = [];
    const minSeparation = 9.0;
    let attempts = 0;

    while (points.length < count && attempts < 800) {
      attempts++;
      const x = (rng() * 2 - 1) * (this.halfSize * 0.68);
      const z = (rng() * 2 - 1) * (this.halfSize * 0.68);
      const y = this.getHeightAt(x, z);
      const normal = this.getNormalAt(x, z);

      if (y > waterLevel + 1.8 && normal.y > 0.78) {
        const tooClose = points.some((p) => Math.hypot(p.x - x, p.z - z) < minSeparation);
        if (!tooClose) {
          points.push({ x, y, z });
        }
      }
    }

    // 保底策略：若地形极端陡峭，放宽间距与坡度限制
    while (points.length < count) {
      const angle = (points.length / count) * Math.PI * 2;
      const x = Math.cos(angle) * 8;
      const z = Math.sin(angle) * 8;
      const y = Math.max(waterLevel + 2.0, this.getHeightAt(x, z));
      points.push({ x, y, z });
    }

    return points;
  }
}
