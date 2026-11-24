/**
 * Headless colony simulation engine (World): fixed-timestep tick, power grid,
 * crop growth, turrets, day/night cycle, weather, AI storyteller, and save/load.
 */

import {
  MAP_WIDTH,
  MAP_HEIGHT,
  BUILDING_INFO,
  NATURAL_INFO,
  TERRAIN_INFO,
  WEATHER_TYPES,
  DAY_LENGTH_SECONDS,
  JOB_TYPES,
  TECH_TREE,
} from './constants.js';
import { createRng, generateMap } from './mapGen.js';
import { isTileWalkable, findPath } from './pathfinding.js';
import { createColonist, createRaider, updateColonistNeeds } from './colonists.js';
import { stepColonistAI, stepRaiderAI, findNearestLiving } from './ai.js';

export class World {
  constructor(options = {}) {
    this.seed = options.seed ?? 2026;
    this.rng = createRng(this.seed);
    this.map = generateMap(options.width ?? MAP_WIDTH, options.height ?? MAP_HEIGHT, this.seed);

    this.resources = {
      wood: 220,
      steel: 140,
      stone: 60,
      rawFood: 45,
      meals: 18,
      medicine: 10,
      silver: 150,
    };

    this.day = 1;
    this.timeOfDay = 8.0; // Start at 08:00 AM
    this.totalTime = 0;
    this.paused = false;
    this.speed = 1;

    this.weather = WEATHER_TYPES.CLEAR;
    this.weatherTimer = 65;

    this.power = { produced: 0, consumed: 0, net: 0 };
    this.researchedTechs = new Set();
    this.activeTechId = TECH_TREE[0].id;
    this.techProgress = {};

    this.colonists = [];
    this.raiders = [];
    this.projectiles = [];
    this.floatingTexts = [];
    this.alerts = [];
    this.logs = [];

    this.nextColonistId = 0;
    this.nextRaiderId = 1;
    this.raidWave = 0;
    this.storytellerTimer = 38;
    this.onSound = null;

    this.stats = {
      buildingsBuilt: 0,
      bedsBuilt: 0,
      mealsCooked: 0,
      raidersDefeated: 0,
    };

    const { x: cx, y: cy } = this.map.spawnPoint;
    const offsets = [
      [1, 0],
      [2, 0],
      [1, 1],
      [2, 1],
    ];
    for (let i = 0; i < 4; i++) {
      const [ox, oy] = offsets[i];
      this.colonists.push(createColonist(this.nextColonistId++, cx + ox, cy + oy, this.rng));
    }

    // Place a starter campfire so colonists can cook right away
    const fireTile = this.getTile(cx + 1, cy - 1);
    if (fireTile) {
      fireTile.natural = null;
      fireTile.building = {
        type: 'campfire',
        hp: BUILDING_INFO.campfire.maxHp,
        maxHp: BUILDING_INFO.campfire.maxHp,
        built: true,
        progress: BUILDING_INFO.campfire.work,
        workRequired: BUILDING_INFO.campfire.work,
        cooldown: 0,
      };
    }

    this.addLog('空投舱安全着陆！4 名殖民者已抵达边缘星球。', 'info');
    this.addAlert('迫降成功', '建立掩体、开垦农田并准备迎接边缘世界的考验。', 'info');
  }

  getTile(x, y) {
    if (x < 0 || x >= this.map.width || y < 0 || y >= this.map.height) return null;
    return this.map.tiles[y * this.map.width + x];
  }

  emitSound(name) {
    if (typeof this.onSound === 'function') this.onSound(name);
  }

  addLog(text, level = 'info') {
    const hh = String(Math.floor(this.timeOfDay)).padStart(2, '0');
    const mm = String(Math.floor((this.timeOfDay % 1) * 60)).padStart(2, '0');
    this.logs.unshift({ day: this.day, time: `${hh}:${mm}`, text, level });
    if (this.logs.length > 40) this.logs.pop();
  }

  addAlert(title, message, level = 'info') {
    const id = `${Date.now()}_${Math.floor(this.rng() * 10000)}`;
    this.alerts.unshift({ id, title, message, level, ttl: 14 });
    if (this.alerts.length > 5) this.alerts.pop();
  }

  dismissAlert(id) {
    this.alerts = this.alerts.filter((a) => a.id !== id);
  }

  spawnProjectile(x1, y1, x2, y2, color, kind = 'shot') {
    this.projectiles.push({ x1, y1, x2, y2, color, kind, life: 0.18, maxLife: 0.18 });
    this.emitSound(kind);
  }

  spawnFloatingText(x, y, text, color = '#ffffff') {
    this.floatingTexts.push({ x, y, text, color, life: 1.2, maxLife: 1.2 });
  }

  canAfford(cost) {
    for (const [res, amt] of Object.entries(cost)) {
      if ((this.resources[res] || 0) < amt) return false;
    }
    return true;
  }

  payCost(cost) {
    for (const [res, amt] of Object.entries(cost)) {
      this.resources[res] -= amt;
    }
  }

  placeBlueprint(x, y, buildingType) {
    const tile = this.getTile(x, y);
    const info = BUILDING_INFO[buildingType];
    if (!tile || !info) return { ok: false, reason: '无效位置' };
    if (!TERRAIN_INFO[tile.terrain].walkable) return { ok: false, reason: '深水区无法建造' };
    if (tile.building) return { ok: false, reason: '此处已有建筑' };
    if (tile.natural && !NATURAL_INFO[tile.natural].walkable) return { ok: false, reason: '需先开采山体' };
    if (!this.canAfford(info.cost)) return { ok: false, reason: '资源不足' };

    this.payCost(info.cost);
    tile.natural = null;
    tile.order = null;
    tile.crop = null;
    tile.building = {
      type: buildingType,
      hp: info.maxHp,
      maxHp: info.maxHp,
      built: false,
      progress: 0,
      workRequired: info.work,
      cooldown: 0,
    };
    this.emitSound('click');
    return { ok: true };
  }

  designateOrder(x1, y1, x2, y2, orderType) {
    const minX = Math.max(0, Math.min(x1, x2));
    const maxX = Math.min(this.map.width - 1, Math.max(x1, x2));
    const minY = Math.max(0, Math.min(y1, y2));
    const maxY = Math.min(this.map.height - 1, Math.max(y1, y2));
    let count = 0;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const tile = this.getTile(x, y);
        if (!tile) continue;

        if (orderType === 'cancel') {
          if (tile.order) {
            tile.order = null;
            count++;
          }
          if (tile.building && !tile.building.built) {
            const info = BUILDING_INFO[tile.building.type];
            for (const [res, amt] of Object.entries(info.cost)) {
              this.resources[res] += Math.floor(amt * 0.8);
            }
            tile.building = null;
            count++;
          }
          continue;
        }

        if (tile.natural && NATURAL_INFO[tile.natural]?.order === orderType) {
          tile.order = orderType;
          count++;
        }
      }
    }
    if (count > 0) this.emitSound('click');
    return count;
  }

  designateZone(x1, y1, x2, y2, zoneType) {
    const minX = Math.max(0, Math.min(x1, x2));
    const maxX = Math.min(this.map.width - 1, Math.max(x1, x2));
    const minY = Math.max(0, Math.min(y1, y2));
    const maxY = Math.min(this.map.height - 1, Math.max(y1, y2));
    let count = 0;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const tile = this.getTile(x, y);
        if (!tile) continue;
        if (zoneType === 'clear') {
          if (tile.zone) {
            tile.zone = null;
            count++;
          }
          continue;
        }
        if (!TERRAIN_INFO[tile.terrain].walkable) continue;
        if (zoneType === 'growing' && TERRAIN_INFO[tile.terrain].fertile <= 0) continue;
        tile.zone = zoneType;
        count++;
      }
    }
    if (count > 0) this.emitSound('click');
    return count;
  }

  draftColonist(colonistId, drafted) {
    const col = this.colonists.find((c) => c.id === colonistId && c.alive);
    if (!col) return false;
    col.drafted = drafted;
    col.job = null;
    col.path = [];
    col.statusText = drafted ? '征召待命' : '空闲';
    this.emitSound('click');
    return true;
  }

  commandDraftedMove(colonistId, tx, ty) {
    const col = this.colonists.find((c) => c.id === colonistId && c.alive && c.drafted);
    if (!col) return false;
    const tile = this.getTile(tx, ty);
    if (!tile || !isTileWalkable(tile)) return false;
    const path = findPath(this.map, col.x, col.y, tx, ty, false, 1600);
    if (!path) return false;
    col.job = { type: JOB_TYPES.MOVE_DRAFTED, tx, ty };
    col.path = path;
    col.statusText = '战术移动';
    this.emitSound('click');
    return true;
  }

  getAmbientLight() {
    // Smooth day/night brightness factor: 0.25 (midnight) .. 1.0 (daytime)
    const h = this.timeOfDay;
    if (h >= 7 && h <= 17) return 1.0;
    if (h > 17 && h < 21) return 1.0 - ((h - 17) / 4) * 0.72;
    if (h >= 21 || h <= 4) return 0.28;
    return 0.28 + ((h - 4) / 3) * 0.72;
  }

  getTemperature() {
    const base = 18 + Math.sin(((this.timeOfDay - 8) / 24) * Math.PI * 2) * 6;
    return Math.round(base + this.weather.tempOffset);
  }

  triggerStorytellerEvent(forcedType = null) {
    const roll = this.rng();
    const type =
      forcedType ||
      (roll < 0.34
        ? 'raid'
        : roll < 0.56
        ? 'cargo_pods'
        : roll < 0.74
        ? 'weather'
        : roll < 0.9
        ? 'caravan'
        : 'wanderer');

    if (type === 'cargo_pods') {
      const wood = 45 + Math.floor(this.rng() * 35);
      const steel = 25 + Math.floor(this.rng() * 25);
      const meals = 6 + Math.floor(this.rng() * 6);
      this.resources.wood += wood;
      this.resources.steel += steel;
      this.resources.meals += meals;
      this.addAlert('空投补给舱', `回收物资：+${wood} 木材、+${steel} 钢铁、+${meals} 餐食。`, 'good');
      this.addLog(`空投补给舱坠落，获得木材 ${wood}、钢铁 ${steel}、餐食 ${meals}。`, 'good');
      this.emitSound('alert');
      return 'cargo_pods';
    }

    if (type === 'caravan') {
      const silver = 70 + Math.floor(this.rng() * 60);
      const med = 4;
      this.resources.silver += silver;
      this.resources.medicine += med;
      this.addAlert('轨道商队路过', `友好商队赠送了 ${silver} 白银与 ${med} 草药。`, 'good');
      this.addLog(`友好商队造访，获得 ${silver} 白银与 ${med} 草药。`, 'good');
      this.emitSound('alert');
      return 'caravan';
    }

    if (type === 'wanderer') {
      if (this.colonists.filter((c) => c.alive).length < 8) {
        const edge = this._findWalkableEdgeTile();
        const col = createColonist(this.nextColonistId++, edge.x, edge.y, this.rng);
        this.colonists.push(col);
        this.addAlert('流浪者加入', `${col.name}（${col.trait.name}）请求加入你的殖民地！`, 'good');
        this.addLog(`新殖民者 ${col.name} 加入了队伍。`, 'good');
        this.emitSound('alert');
        return 'wanderer';
      }
      return this.triggerStorytellerEvent('cargo_pods');
    }

    if (type === 'weather') {
      const pool = Object.values(WEATHER_TYPES);
      const next = pool[Math.floor(this.rng() * pool.length)];
      this.weather = next;
      this.weatherTimer = 50 + this.rng() * 40;
      this.addAlert('天气变化', `当前天气转为：${next.name}。`, 'info');
      this.addLog(`天气转变为 ${next.name}。`, 'info');
      return 'weather';
    }

    if (type === 'raid') {
      this.raidWave++;
      const count = Math.min(5, 1 + Math.floor((this.raidWave + 1) / 2));
      const edge = this._findWalkableEdgeTile();
      for (let i = 0; i < count; i++) {
        const rx = Math.max(1, Math.min(this.map.width - 2, edge.x + (i % 2)));
        const ry = Math.max(1, Math.min(this.map.height - 2, edge.y + Math.floor(i / 2)));
        this.raiders.push(createRaider(this.nextRaiderId++, rx, ry, this.raidWave));
      }
      this.addAlert('敌方袭击！', `${count} 名海盗掠夺者从边缘逼近！请征召殖民者或启动炮塔。`, 'danger');
      this.addLog(`警报：第 ${this.raidWave} 波袭击（${count} 名掠夺者）！`, 'danger');
      this.emitSound('raid');
      return 'raid';
    }

    return type;
  }

  _findWalkableEdgeTile() {
    const { width, height } = this.map;
    for (let attempt = 0; attempt < 40; attempt++) {
      const side = Math.floor(this.rng() * 4);
      let x = 1;
      let y = 1;
      if (side === 0) {
        x = Math.floor(2 + this.rng() * (width - 4));
        y = 1;
      } else if (side === 1) {
        x = Math.floor(2 + this.rng() * (width - 4));
        y = height - 2;
      } else if (side === 2) {
        x = 1;
        y = Math.floor(2 + this.rng() * (height - 4));
      } else {
        x = width - 2;
        y = Math.floor(2 + this.rng() * (height - 4));
      }
      if (isTileWalkable(this.getTile(x, y))) return { x, y };
    }
    return { x: 2, y: 2 };
  }

  _updatePowerAndTurrets(dt) {
    const light = this.getAmbientLight();
    const hasSolarTech = this.researchedTechs.has('solar_grid');
    const solarFactor = Math.max(hasSolarTech ? 0.35 : 0.05, (light - 0.25) / 0.75) * this.weather.solarMult * (hasSolarTech ? 1.4 : 1.0);

    let produced = 0;
    let consumed = 0;
    const turrets = [];

    for (let i = 0; i < this.map.tiles.length; i++) {
      const t = this.map.tiles[i];
      if (!t.building || !t.building.built) continue;
      const info = BUILDING_INFO[t.building.type];
      if (info.power > 0) produced += Math.round(info.power * solarFactor);
      if (info.power < 0) consumed += Math.abs(info.power);
      if (t.building.type === 'turret') turrets.push(t);
    }

    this.power = { produced, consumed, net: produced - consumed };
    const turretsPowered = produced >= consumed && produced > 0;
    const dmgBoost = this.researchedTechs.has('fortification') ? 1.25 : 1.0;

    for (const tile of turrets) {
      const b = tile.building;
      if (b.cooldown > 0) b.cooldown = Math.max(0, b.cooldown - dt);
      if (!turretsPowered || b.cooldown > 0) continue;

      const info = BUILDING_INFO.turret;
      const target = findNearestLiving(tile.x, tile.y, this.raiders, info.range);
      if (target) {
        const dmg = Math.round(info.damage * dmgBoost);
        target.hp = Math.max(0, target.hp - dmg);
        b.cooldown = info.cooldown;
        this.spawnProjectile(tile.x, tile.y, target.x, target.y, '#38bdf8', 'shot');
        this.spawnFloatingText(target.x, target.y - 0.5, `-${dmg}`, '#38bdf8');
        if (target.hp <= 0) {
          target.alive = false;
          target.statusText = '已击倒';
          this.stats.raidersDefeated++;
          this.addLog(`自动机枪塔击毁了 ${target.name}！`, 'good');
        }
      }
    }
  }

  _updateCrops(dt) {
    const light = this.getAmbientLight();
    if (light < 0.4) return;
    const techMult = this.researchedTechs.has('agriculture') ? 1.35 : 1.0;

    for (let i = 0; i < this.map.tiles.length; i++) {
      const t = this.map.tiles[i];
      if (t.crop && t.crop.progress < 100) {
        const fert = TERRAIN_INFO[t.terrain].fertile || 0.5;
        t.crop.progress = Math.min(100, t.crop.progress + dt * 2.1 * fert * techMult);
      }
    }
  }

  tick(rawDt) {
    if (this.paused) return;
    const dt = Math.min(0.1, rawDt) * this.speed;
    this.totalTime += dt;

    // Day/night clock
    this.timeOfDay += (dt / DAY_LENGTH_SECONDS) * 24;
    if (this.timeOfDay >= 24) {
      this.timeOfDay -= 24;
      this.day += 1;
      this.addLog(`第 ${this.day} 天开始了。`, 'info');
    }

    // Weather countdown
    this.weatherTimer -= dt;
    if (this.weatherTimer <= 0) {
      this.weather = WEATHER_TYPES.CLEAR;
      this.weatherTimer = 60;
    }

    // Storyteller events
    this.storytellerTimer -= dt;
    if (this.storytellerTimer <= 0) {
      this.triggerStorytellerEvent();
      this.storytellerTimer = 42 + this.rng() * 28;
    }

    this._updatePowerAndTurrets(dt);
    this._updateCrops(dt);

    for (const c of this.colonists) {
      updateColonistNeeds(c, dt, this);
      stepColonistAI(c, dt, this);
    }

    for (const r of this.raiders) {
      stepRaiderAI(r, dt, this);
    }
    this.raiders = this.raiders.filter((r) => r.alive);

    // Visual effects decay
    for (const p of this.projectiles) p.life -= rawDt;
    this.projectiles = this.projectiles.filter((p) => p.life > 0);

    for (const f of this.floatingTexts) {
      f.y -= rawDt * 0.7;
      f.life -= rawDt;
    }
    this.floatingTexts = this.floatingTexts.filter((f) => f.life > 0);

    for (const a of this.alerts) a.ttl -= rawDt;
    this.alerts = this.alerts.filter((a) => a.ttl > 0);
  }

  serialize() {
    return JSON.stringify({
      version: 1,
      seed: this.seed,
      day: this.day,
      timeOfDay: this.timeOfDay,
      totalTime: this.totalTime,
      resources: this.resources,
      weatherId: this.weather.id,
      researchedTechs: Array.from(this.researchedTechs),
      activeTechId: this.activeTechId,
      techProgress: this.techProgress,
      colonists: this.colonists,
      raiders: this.raiders,
      raidWave: this.raidWave,
      nextColonistId: this.nextColonistId,
      nextRaiderId: this.nextRaiderId,
      stats: this.stats,
      map: this.map,
    });
  }

  static deserialize(jsonStr) {
    const data = JSON.parse(jsonStr);
    const w = new World({ seed: data.seed, width: data.map.width, height: data.map.height });
    w.day = data.day;
    w.timeOfDay = data.timeOfDay;
    w.totalTime = data.totalTime;
    w.resources = { ...data.resources };
    w.weather = Object.values(WEATHER_TYPES).find((wt) => wt.id === data.weatherId) || WEATHER_TYPES.CLEAR;
    w.researchedTechs = new Set(data.researchedTechs || []);
    w.activeTechId = data.activeTechId ?? null;
    w.techProgress = { ...(data.techProgress || {}) };
    w.colonists = data.colonists || [];
    w.raiders = data.raiders || [];
    w.raidWave = data.raidWave || 0;
    w.nextColonistId = data.nextColonistId ?? w.colonists.length;
    w.nextRaiderId = data.nextRaiderId ?? 1;
    w.stats = { ...w.stats, ...(data.stats || {}) };
    w.map = data.map;
    return w;
  }
}
