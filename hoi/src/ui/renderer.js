/**
 * HTML5 Canvas 战略地图渲染器
 * 使用半平面裁剪 (Sutherland-Hodgman) 从省份质心实时生成无接缝 Voronoi 省界多边形，
 * 支持政治/地形/补给三大地图模式、国界线高亮、海路航线、NATO 部队徽标、行军箭头与战斗气泡。
 */

import { LAND_MASKS, TERRAIN_TYPES } from '../data/mapData.js';
import { DIVISION_TEMPLATES } from '../data/nations.js';
import { areAtWar } from '../engine/diplomacy.js';

const LOGICAL_W = 1000;
const LOGICAL_H = 640;

/**
 * 使用半平面裁剪计算多边形 P 与垂直平分线 (a -> b) 靠近 a 一侧的交集
 */
function clipPolygonByBisector(poly, ax, ay, bx, by) {
  if (poly.length === 0) return [];
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const nx = bx - ax;
  const ny = by - ay;

  const isInside = (p) => (p[0] - mx) * nx + (p[1] - my) * ny <= 0;

  const output = [];
  for (let i = 0; i < poly.length; i++) {
    const curr = poly[i];
    const prev = poly[(i + poly.length - 1) % poly.length];
    const currIn = isInside(curr);
    const prevIn = isInside(prev);

    if (currIn !== prevIn) {
      const dx = curr[0] - prev[0];
      const dy = curr[1] - prev[1];
      const denom = dx * nx + dy * ny;
      if (Math.abs(denom) > 1e-9) {
        const t = ((mx - prev[0]) * nx + (my - prev[1]) * ny) / denom;
        output.push([prev[0] + t * dx, prev[1] + t * dy]);
      }
    }
    if (currIn) output.push(curr);
  }
  return output;
}

/**
 * 判断点是否在多边形内（射线法）
 */
function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export class MapRenderer {
  constructor(canvas, engine) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.engine = engine;
    this.mapMode = 'political'; // 'political' | 'terrain' | 'supply'
    this.selectedProvinceId = null;
    this.selectedDivisionIds = new Set();
    this.hoverProvinceId = null;
    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.animPhase = 0;

    this.polygons = this.buildProvincePolygons();
  }

  buildProvincePolygons() {
    const result = {};
    const byRegion = { britain: [], mainland: [] };
    for (const p of Object.values(this.engine.provinces)) {
      byRegion[p.region || 'mainland'].push(p);
    }

    for (const [region, list] of Object.entries(byRegion)) {
      const mask = LAND_MASKS[region];
      for (const p of list) {
        let poly = mask.map((pt) => [pt[0], pt[1]]);
        for (const other of list) {
          if (other.id === p.id) continue;
          poly = clipPolygonByBisector(poly, p.x, p.y, other.x, other.y);
        }
        result[p.id] = poly;
      }
    }
    return result;
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(300, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(260, Math.floor(rect.height * dpr));
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.dpr = dpr;
    this.viewW = rect.width;
    this.viewH = rect.height;
  }

  getTransform() {
    const baseScale = Math.min(this.viewW / LOGICAL_W, this.viewH / LOGICAL_H);
    const scale = baseScale * this.zoom;
    const offsetX = (this.viewW - LOGICAL_W * scale) / 2 + this.panX;
    const offsetY = (this.viewH - LOGICAL_H * scale) / 2 + this.panY;
    return { scale, offsetX, offsetY };
  }

  screenToLogical(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const { scale, offsetX, offsetY } = this.getTransform();
    return {
      x: (sx - offsetX) / scale,
      y: (sy - offsetY) / scale,
    };
  }

  hitTestProvince(lx, ly) {
    for (const [id, poly] of Object.entries(this.polygons)) {
      if (poly.length >= 3 && pointInPolygon(lx, ly, poly)) {
        return id;
      }
    }
    return null;
  }

  render() {
    const ctx = this.ctx;
    if (!this.viewW || !this.viewH) this.resize();
    this.animPhase = (this.animPhase + 0.04) % (Math.PI * 2);

    ctx.save();
    ctx.scale(this.dpr || 1, this.dpr || 1);

    // 1. 海洋背景与经纬网格
    const grad = ctx.createLinearGradient(0, 0, 0, this.viewH);
    grad.addColorStop(0, '#122230');
    grad.addColorStop(1, '#0b1620');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    const { scale, offsetX, offsetY } = this.getTransform();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    this.drawGraticule(ctx);
    this.drawSeaLanes(ctx);
    this.drawProvinces(ctx);
    this.drawNationalHighlights(ctx);
    this.drawSupplyHubsAndNames(ctx);
    this.drawMovementArrows(ctx);
    this.drawDivisions(ctx);
    this.drawBattles(ctx);

    ctx.restore();
  }

  drawGraticule(ctx) {
    ctx.strokeStyle = 'rgba(130, 175, 210, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= LOGICAL_W; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, LOGICAL_H);
      ctx.stroke();
    }
    for (let y = 0; y <= LOGICAL_H; y += 80) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(LOGICAL_W, y);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(155, 195, 225, 0.25)';
    ctx.font = 'italic 600 13px Inter, sans-serif';
    ctx.fillText('北 海 / NORTH SEA', 250, 125);
    ctx.fillText('英吉利海峡', 140, 282);
    ctx.fillText('地中海 / MEDITERRANEAN', 240, 560);
  }

  drawSeaLanes(ctx) {
    ctx.save();
    ctx.strokeStyle = 'rgba(125, 200, 255, 0.55)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    for (const p of Object.values(this.engine.provinces)) {
      for (const sn of p.seaNeighbors || []) {
        if (p.id < sn) {
          const target = this.engine.provinces[sn];
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(target.x, target.y);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  getProvinceFillColor(prov) {
    if (this.mapMode === 'terrain') {
      return (TERRAIN_TYPES[prov.terrain] || TERRAIN_TYPES.plains).color;
    }
    if (this.mapMode === 'supply') {
      const ratio = prov.supplyCapacity > 0 ? prov.supplyUsed / prov.supplyCapacity : 0;
      if (ratio <= 0.5) return '#2f6e49';
      if (ratio <= 0.85) return '#8d8033';
      return '#9a3434';
    }
    const nation = this.engine.nations[prov.owner];
    return nation ? nation.color : '#555';
  }

  drawProvinces(ctx) {
    for (const prov of Object.values(this.engine.provinces)) {
      const poly = this.polygons[prov.id];
      if (!poly || poly.length < 3) continue;

      ctx.beginPath();
      ctx.moveTo(poly[0][0], poly[0][1]);
      for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
      ctx.closePath();

      ctx.fillStyle = this.getProvinceFillColor(prov);
      ctx.fill();

      // 悬停或选中高亮
      if (prov.id === this.selectedProvinceId) {
        ctx.fillStyle = 'rgba(255, 224, 130, 0.24)';
        ctx.fill();
      } else if (prov.id === this.hoverProvinceId) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.fill();
      }

      // 省份边界线
      ctx.strokeStyle = prov.id === this.selectedProvinceId ? '#facc15' : 'rgba(15, 22, 28, 0.65)';
      ctx.lineWidth = prov.id === this.selectedProvinceId ? 2.4 : 1.2;
      ctx.stroke();
    }
  }

  drawNationalHighlights(ctx) {
    // 绘制海岸线外轮廓阴影，增强陆海层次感
    ctx.save();
    ctx.strokeStyle = 'rgba(220, 200, 150, 0.45)';
    ctx.lineWidth = 2;
    for (const mask of Object.values(LAND_MASKS)) {
      ctx.beginPath();
      ctx.moveTo(mask[0][0], mask[0][1]);
      for (let i = 1; i < mask.length; i++) ctx.lineTo(mask[i][0], mask[i][1]);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }

  drawSupplyHubsAndNames(ctx) {
    for (const prov of Object.values(this.engine.provinces)) {
      // 首都五角星或城市胜利点
      if (prov.isCapital) {
        ctx.fillStyle = '#facc15';
        ctx.strokeStyle = '#1f2937';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(prov.x, prov.y - 16, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (prov.vp >= 12) {
        ctx.fillStyle = '#e2e8f0';
        ctx.beginPath();
        ctx.arc(prov.x, prov.y - 15, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // 补给枢纽图标（补给模式或要塞标记）
      if (this.mapMode === 'supply' && prov.supplyHub) {
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(prov.x - 18, prov.y - 22, 8, 8);
      }
      if (prov.fortLevel > 0) {
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '700 9px Inter, sans-serif';
        ctx.fillText(`🛡${prov.fortLevel}`, prov.x + 12, prov.y - 12);
      }

      // 省份名
      ctx.font = prov.isCapital ? '700 12px Inter, sans-serif' : '600 10.5px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(10, 14, 18, 0.85)';
      ctx.fillText(prov.name, prov.x + 1, prov.y + 24);
      ctx.fillStyle = prov.isCapital ? '#fef08a' : '#f1f5f9';
      ctx.fillText(prov.name, prov.x, prov.y + 23);
    }
  }

  drawMovementArrows(ctx) {
    for (const div of Object.values(this.engine.divisions)) {
      if (!div.movingTo) continue;
      const from = this.engine.provinces[div.provinceId];
      const to = this.engine.provinces[div.movingTo];
      if (!from || !to) continue;

      const isAttack = areAtWar(div.owner, to.owner, this.engine);
      ctx.save();
      ctx.strokeStyle = isAttack ? '#ef4444' : '#38bdf8';
      ctx.lineWidth = 3;
      ctx.setLineDash([7, 4]);
      ctx.lineDashOffset = -this.animPhase * 12;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();

      // 箭头头部
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const ax = from.x + (to.x - from.x) * 0.68;
      const ay = from.y + (to.y - from.y) * 0.68;
      ctx.setLineDash([]);
      ctx.fillStyle = isAttack ? '#ef4444' : '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax - 10 * Math.cos(angle - 0.45), ay - 10 * Math.sin(angle - 0.45));
      ctx.lineTo(ax - 10 * Math.cos(angle + 0.45), ay - 10 * Math.sin(angle + 0.45));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  drawDivisions(ctx) {
    // 按省份与所属国家聚合显示 NATO 徽标
    const grouped = {};
    for (const div of Object.values(this.engine.divisions)) {
      const key = `${div.provinceId}__${div.owner}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(div);
    }

    for (const list of Object.values(grouped)) {
      const first = list[0];
      const prov = this.engine.provinces[first.provinceId];
      const nation = this.engine.nations[first.owner];
      if (!prov || !nation) continue;

      const anySelected = list.some((d) => this.selectedDivisionIds.has(d.id));
      const anyEncircled = list.some((d) => d.encircled);
      const avgOrg =
        list.reduce((s, d) => s + d.org / (DIVISION_TEMPLATES[d.template]?.maxOrg || 60), 0) /
        list.length;
      const avgHp =
        list.reduce((s, d) => s + d.hp / (DIVISION_TEMPLATES[d.template]?.maxHp || 100), 0) /
        list.length;

      const cx = prov.x;
      const cy = prov.y;
      const w = 36;
      const h = 22;

      ctx.save();
      // 阴影与主体卡片
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fillRect(cx - w / 2 + 2, cy - h / 2 + 2, w, h);

      ctx.fillStyle = nation.color;
      ctx.fillRect(cx - w / 2, cy - h / 2, w, h);

      ctx.strokeStyle = anySelected ? '#facc15' : '#e2e8f0';
      ctx.lineWidth = anySelected ? 2.4 : 1.2;
      ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);

      // NATO 符号与数量
      const hasArmor = list.some((d) => d.template === 'armor');
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${hasArmor ? '⬭' : '✕'} ${list.length}`, cx, cy + 2);

      // 组织度条（绿）与兵力条（橙）
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(cx - w / 2 + 2, cy + h / 2 - 5, w - 4, 2);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(cx - w / 2 + 2, cy + h / 2 - 5, (w - 4) * Math.min(1, avgOrg), 2);

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(cx - w / 2 + 2, cy + h / 2 - 2.5, w - 4, 2);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(cx - w / 2 + 2, cy + h / 2 - 2.5, (w - 4) * Math.min(1, avgHp), 2);

      if (anyEncircled) {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(cx + w / 2, cy - h / 2, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '700 8px Inter, sans-serif';
        ctx.fillText('!', cx + w / 2, cy - h / 2 + 3);
      }
      ctx.restore();
    }
  }

  drawBattles(ctx) {
    for (const battle of this.engine.battles) {
      const prov = this.engine.provinces[battle.provinceId];
      if (!prov) continue;
      const bx = prov.x + 22;
      const by = prov.y - 16;
      const pulse = 1 + Math.sin(this.animPhase * 2) * 0.08;

      ctx.save();
      ctx.translate(bx, by);
      ctx.scale(pulse, pulse);

      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();

      // 战斗进度环
      const color = battle.progress >= 55 ? '#22c55e' : battle.progress <= 45 ? '#ef4444' : '#facc15';
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 12, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * battle.progress) / 100);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = '700 9px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${battle.progress}`, 0, 3);
      ctx.restore();
    }
  }
}
