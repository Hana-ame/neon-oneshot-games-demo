/**
 * Core 4X Turn-Based Strategy Game Engine
 * 核心引擎：地图视野、城市建造/产出/增长、科技树、单位移动/战斗/改良、外交与胜负判定、存档序列化
 */

import {
  TERRAIN, RESOURCES, IMPROVEMENTS, CIVILIZATIONS,
  UNITS, BUILDINGS, TECHNOLOGIES, MAX_TURNS, MAP_PRESETS
} from './constants.js';
import {
  hexKey, hexDistance, hexNeighbors, hexesInRange, getReachableHexes
} from './hex.js';
import { generateMap } from './mapgen.js';

export class GameEngine {
  constructor(options = {}) {
    this.initNewGame(options);
  }

  initNewGame({
    preset = 'standard',
    playerCivId = 'huaxia',
    seed = Math.floor(Math.random() * 1000000),
  } = {}) {
    const cfg = MAP_PRESETS[preset] || MAP_PRESETS.standard;
    this.preset = cfg.id;
    this.seed = seed;
    this.turn = 1;
    this.maxTurns = MAX_TURNS;
    this.nextEntityId = 1;
    this.winner = null; // { civId, type, reason }
    this.logs = [];

    const allCivIds = Object.keys(CIVILIZATIONS);
    const chosenCivs = [playerCivId, ...allCivIds.filter(id => id !== playerCivId).slice(0, cfg.aiCount)];

    const mapData = generateMap({
      width: cfg.width,
      height: cfg.height,
      seed,
      civCount: chosenCivs.length,
    });

    this.width = mapData.width;
    this.height = mapData.height;
    this.tiles = mapData.tiles;
    this.tileList = mapData.tileList;

    this.civs = new Map();
    this.cities = new Map();
    this.units = new Map();
    this.playerCivId = playerCivId;

    // Initialize civilizations
    chosenCivs.forEach((civId, idx) => {
      const def = CIVILIZATIONS[civId];
      const civ = {
        id: civId,
        name: def.name,
        leader: def.leader,
        color: def.color,
        lightColor: def.lightColor,
        emblem: def.emblem,
        isHuman: civId === playerCivId,
        alive: true,
        gold: 50,
        scienceBank: 0,
        currentTech: 'pottery',
        techs: new Set(['agriculture']),
        explored: new Set(),
        visible: new Set(),
        cityNameIndex: 0,
        wars: new Set(),
      };
      this.civs.set(civId, civ);

      // Spawn starting Settler + Warrior
      const start = mapData.startPositions[idx];
      this.spawnUnit(civId, 'settler', start.q, start.r);
      const warriorPos = this.findAdjacentPassable(start.q, start.r, civId) || start;
      this.spawnUnit(civId, 'warrior', warriorPos.q, warriorPos.r);
      this.recomputeVision(civId);
    });

    this.addLog(`纪元开启！您统领「${CIVILIZATIONS[playerCivId].name}」，请指挥开拓者建立首都。`, 'info');
  }

  getYear() {
    if (this.turn <= 40) return `公元前 ${4000 - (this.turn - 1) * 100} 年`;
    return `公元 ${(this.turn - 40) * 35} 年`;
  }

  addLog(text, type = 'info') {
    this.logs.unshift({ turn: this.turn, text, type });
    if (this.logs.length > 60) this.logs.pop();
  }

  getTile(q, r) {
    return this.tiles.get(hexKey(q, r)) || null;
  }

  getCiv(civId) {
    return this.civs.get(civId) || null;
  }

  getUnitAt(q, r, roleFilter = null) {
    for (const u of this.units.values()) {
      if (u.q === q && u.r === r) {
        if (!roleFilter || UNITS[u.type].role === roleFilter) return u;
      }
    }
    return null;
  }

  getUnitsAt(q, r) {
    const res = [];
    for (const u of this.units.values()) {
      if (u.q === q && u.r === r) res.push(u);
    }
    return res;
  }

  getCityAt(q, r) {
    const tile = this.getTile(q, r);
    return tile && tile.cityId ? this.cities.get(tile.cityId) || null : null;
  }

  findAdjacentPassable(q, r, civId, role = 'combat') {
    for (const n of hexNeighbors(q, r)) {
      const tile = this.getTile(n.q, n.r);
      if (!tile || !TERRAIN[tile.terrain].passable) continue;
      if (this.getUnitAt(n.q, n.r, role)) continue;
      const city = this.getCityAt(n.q, n.r);
      if (city && city.ownerId !== civId) continue;
      return { q: n.q, r: n.r };
    }
    return null;
  }

  spawnUnit(civId, type, q, r, extraStrength = 0) {
    const def = UNITS[type];
    if (!def) throw new Error(`Unknown unit type: ${type}`);
    const id = `u_${this.nextEntityId++}`;
    const unit = {
      id,
      type,
      ownerId: civId,
      q,
      r,
      hp: 100,
      maxHp: 100,
      moves: def.moves,
      maxMoves: def.moves,
      attacked: false,
      fortified: false,
      charges: def.charges || 0,
      bonusStrength: extraStrength,
    };
    this.units.set(id, unit);
    this.recomputeVision(civId);
    return unit;
  }

  recomputeVision(civId) {
    const civ = this.getCiv(civId);
    if (!civ) return;
    civ.visible.clear();

    for (const u of this.units.values()) {
      if (u.ownerId !== civId) continue;
      const sight = UNITS[u.type].sight + (this.getTile(u.q, u.r)?.terrain === 'hills' ? 1 : 0);
      for (const h of hexesInRange({ q: u.q, r: u.r }, sight)) {
        const k = hexKey(h.q, h.r);
        if (this.tiles.has(k)) {
          civ.visible.add(k);
          civ.explored.add(k);
        }
      }
    }

    for (const c of this.cities.values()) {
      if (c.ownerId !== civId) continue;
      for (const h of hexesInRange({ q: c.q, r: c.r }, 2)) {
        const k = hexKey(h.q, h.r);
        if (this.tiles.has(k)) {
          civ.visible.add(k);
          civ.explored.add(k);
        }
      }
    }
  }

  areAtWar(civA, civB) {
    if (civA === civB) return false;
    const a = this.getCiv(civA);
    return a ? a.wars.has(civB) : false;
  }

  declareWar(civA, civB) {
    if (civA === civB) return false;
    const a = this.getCiv(civA);
    const b = this.getCiv(civB);
    if (!a || !b || !a.alive || !b.alive || a.wars.has(civB)) return false;
    a.wars.add(civB);
    b.wars.add(civA);
    this.addLog(`${a.name} 向 ${b.name} 正式宣战！`, 'war');
    return true;
  }

  makePeace(civA, civB) {
    const a = this.getCiv(civA);
    const b = this.getCiv(civB);
    if (!a || !b || !a.wars.has(civB)) return false;
    a.wars.delete(civB);
    b.wars.delete(civA);
    this.addLog(`${a.name} 与 ${b.name} 缔结和平条约。`, 'diplomacy');
    return true;
  }

  canFoundCity(unit) {
    if (!unit || unit.type !== 'settler') return { ok: false, reason: '只有开拓者可以建城' };
    const tile = this.getTile(unit.q, unit.r);
    if (!tile || !TERRAIN[tile.terrain].passable) return { ok: false, reason: '该地块无法建城' };
    if (tile.cityId) return { ok: false, reason: '此处已有城市' };
    for (const c of this.cities.values()) {
      if (hexDistance({ q: unit.q, r: unit.r }, { q: c.q, r: c.r }) < 3) {
        return { ok: false, reason: '距离已有城市过近（至少间隔3格）' };
      }
    }
    return { ok: true };
  }

  foundCity(unitId) {
    const unit = this.units.get(unitId);
    const check = this.canFoundCity(unit);
    if (!check.ok) return { ok: false, reason: check.reason };

    const civ = this.getCiv(unit.ownerId);
    const def = CIVILIZATIONS[civ.id];
    const cityName = def.cities[civ.cityNameIndex] || `${def.name}第${civ.cityNameIndex + 1}城`;
    civ.cityNameIndex++;

    const isCapital = !Array.from(this.cities.values()).some(c => c.ownerId === civ.id);
    const cityId = `c_${this.nextEntityId++}`;
    const city = {
      id: cityId,
      name: cityName,
      ownerId: civ.id,
      q: unit.q,
      r: unit.r,
      isCapital,
      population: 1,
      foodStock: 0,
      hp: 100,
      maxHp: 100,
      buildings: [],
      production: { kind: 'unit', id: 'warrior', progress: 0 },
    };

    this.cities.set(cityId, city);
    const centerTile = this.getTile(unit.q, unit.r);
    centerTile.cityId = cityId;
    centerTile.ownerId = civ.id;

    // Claim immediate ring of 6 hexes if unowned
    for (const n of hexNeighbors(unit.q, unit.r)) {
      const nt = this.getTile(n.q, n.r);
      if (nt && !nt.ownerId) {
        nt.ownerId = civ.id;
      }
    }

    this.units.delete(unitId);
    this.recomputeVision(civ.id);
    this.addLog(`${civ.name} 建立了${isCapital ? '首都' : '新城市'}「${cityName}」！`, 'city');
    return { ok: true, city };
  }

  getTileYield(tile) {
    const t = TERRAIN[tile.terrain];
    let food = t.food;
    let prod = t.prod;
    let gold = t.gold;
    let science = 0;

    if (tile.resource && RESOURCES[tile.resource]) {
      const r = RESOURCES[tile.resource];
      food += r.food;
      prod += r.prod;
      gold += r.gold;
      science += r.science;
    }
    if (tile.improvement && IMPROVEMENTS[tile.improvement]) {
      const imp = IMPROVEMENTS[tile.improvement];
      food += imp.food;
      prod += imp.prod;
      gold += imp.gold;
    }
    if (tile.cityId) {
      food = Math.max(food, 2);
      prod = Math.max(prod, 2);
      gold += 1;
    }
    return { food, prod, gold, science };
  }

  getCityYields(city) {
    const civ = this.getCiv(city.ownerId);
    const civDef = CIVILIZATIONS[city.ownerId];
    let food = 0;
    let prod = 1; // base city center
    let gold = 1;
    let science = 2 + city.population * 1.2;

    const center = this.getTile(city.q, city.r);
    const cy = this.getTileYield(center);
    food += cy.food;
    prod += cy.prod;
    gold += cy.gold;
    science += cy.science;

    // Gather best owned tiles around city up to population count
    const surrounding = hexesInRange({ q: city.q, r: city.r }, 2)
      .filter(h => !(h.q === city.q && h.r === city.r))
      .map(h => this.getTile(h.q, h.r))
      .filter(t => t && t.ownerId === city.ownerId && !t.cityId)
      .map(t => ({ tile: t, y: this.getTileYield(t) }))
      .sort((a, b) => (b.y.food + b.y.prod + b.y.gold + b.y.science) - (a.y.food + a.y.prod + a.y.gold + a.y.science));

    const worked = surrounding.slice(0, city.population);
    for (const w of worked) {
      food += w.y.food;
      prod += w.y.prod;
      gold += w.y.gold;
      science += w.y.science;
    }

    for (const bId of city.buildings) {
      const b = BUILDINGS[bId];
      if (!b) continue;
      food += b.food;
      prod += b.prod;
      gold += b.gold;
      science += b.science;
    }

    // Net food after citizen consumption (1.5 food per pop)
    const foodConsumption = Math.floor(city.population * 1.5);
    const netFood = food - foodConsumption;

    prod = Math.max(1, Math.round(prod * civDef.prodMult));
    gold = Math.round(gold * civDef.goldMult);
    science = Math.round(science * civDef.scienceMult);

    return { food, netFood, prod, gold, science, foodNeeded: 15 + city.population * 12 };
  }

  getCityDefense(city) {
    let def = 15 + city.population * 2;
    for (const bId of city.buildings) {
      def += BUILDINGS[bId]?.defense || 0;
    }
    const garrison = this.getUnitAt(city.q, city.r, 'combat');
    if (garrison && garrison.ownerId === city.ownerId) {
      def += Math.round(UNITS[garrison.type].strength * 0.35);
    }
    return def;
  }

  getCivTotals(civId) {
    let goldPerTurn = 0;
    let sciencePerTurn = 0;
    let cityCount = 0;
    let totalPop = 0;
    let unitCount = 0;
    for (const c of this.cities.values()) {
      if (c.ownerId !== civId) continue;
      cityCount++;
      totalPop += c.population;
      const y = this.getCityYields(c);
      goldPerTurn += y.gold;
      sciencePerTurn += y.science;
    }
    for (const u of this.units.values()) {
      if (u.ownerId === civId) unitCount++;
    }
    // Base palace science if no cities yet
    if (cityCount === 0) {
      sciencePerTurn = 2;
      goldPerTurn = 2;
    }
    // Unit maintenance
    const maintenance = Math.max(0, unitCount - 2);
    goldPerTurn -= maintenance;
    return { goldPerTurn, sciencePerTurn, cityCount, totalPop, unitCount };
  }

  getCivScore(civId) {
    const civ = this.getCiv(civId);
    if (!civ || !civ.alive) return 0;
    const totals = this.getCivTotals(civId);
    let ownedTiles = 0;
    for (const t of this.tileList) {
      if (t.ownerId === civId) ownedTiles++;
    }
    let wonderBonus = 0;
    for (const c of this.cities.values()) {
      if (c.ownerId === civId && c.buildings.includes('grand_observatory')) wonderBonus += 150;
    }
    return (
      totals.cityCount * 25 +
      totals.totalPop * 10 +
      civ.techs.size * 18 +
      ownedTiles * 2 +
      totals.unitCount * 5 +
      wonderBonus
    );
  }

  canResearchTech(civId, techId) {
    const civ = this.getCiv(civId);
    const tech = TECHNOLOGIES[techId];
    if (!civ || !tech) return false;
    if (civ.techs.has(techId)) return false;
    return tech.prereqs.every(p => civ.techs.has(p));
  }

  setResearch(civId, techId) {
    if (!this.canResearchTech(civId, techId)) return false;
    const civ = this.getCiv(civId);
    civ.currentTech = techId;
    return true;
  }

  getAvailableProductions(city) {
    const civ = this.getCiv(city.ownerId);
    const items = [];
    for (const u of Object.values(UNITS)) {
      if (u.tech && !civ.techs.has(u.tech)) continue;
      if (u.prereqTech2 && !civ.techs.has(u.prereqTech2)) continue;
      items.push({ kind: 'unit', id: u.id, name: u.name, icon: u.icon, cost: u.cost, goldCost: u.goldCost, desc: u.desc });
    }
    for (const b of Object.values(BUILDINGS)) {
      if (city.buildings.includes(b.id)) continue;
      if (b.tech && !civ.techs.has(b.tech)) continue;
      items.push({ kind: 'building', id: b.id, name: b.name, icon: b.icon, cost: b.cost, goldCost: b.goldCost, desc: b.desc });
    }
    return items;
  }

  setCityProduction(cityId, kind, id) {
    const city = this.cities.get(cityId);
    if (!city) return false;
    const avail = this.getAvailableProductions(city);
    if (!avail.some(i => i.kind === kind && i.id === id)) return false;
    if (city.production && city.production.kind === kind && city.production.id === id) return true;
    city.production = { kind, id, progress: 0 };
    return true;
  }

  buyInCity(cityId, kind, id) {
    const city = this.cities.get(cityId);
    if (!city) return { ok: false, reason: '城市不存在' };
    const civ = this.getCiv(city.ownerId);
    const avail = this.getAvailableProductions(city);
    const item = avail.find(i => i.kind === kind && i.id === id);
    if (!item) return { ok: false, reason: '暂不可购买该项目' };
    if (item.goldCost >= 9999) return { ok: false, reason: '奇观无法用金币直接购买' };
    if (civ.gold < item.goldCost) return { ok: false, reason: `金币不足（需要 ${item.goldCost}）` };

    if (kind === 'unit') {
      const role = UNITS[id].role;
      let spawnPos = !this.getUnitAt(city.q, city.r, role)
        ? { q: city.q, r: city.r }
        : this.findAdjacentPassable(city.q, city.r, civ.id, role);
      if (!spawnPos) return { ok: false, reason: '城市周边没有空闲地块部署单位' };
      civ.gold -= item.goldCost;
      const bonus = (role === 'combat' && city.buildings.includes('barracks')) ? 3 : 0;
      const unit = this.spawnUnit(civ.id, id, spawnPos.q, spawnPos.r, bonus);
      this.addLog(`「${city.name}」花费 ${item.goldCost} 金币招募了 ${item.name}。`, 'city');
      return { ok: true, unit };
    } else {
      civ.gold -= item.goldCost;
      this.completeBuilding(city, id);
      this.addLog(`「${city.name}」花费 ${item.goldCost} 金币建成了 ${item.name}。`, 'city');
      return { ok: true };
    }
  }

  completeBuilding(city, buildingId) {
    if (!city.buildings.includes(buildingId)) {
      city.buildings.push(buildingId);
      if (buildingId === 'walls') {
        city.maxHp += 50;
        city.hp = Math.min(city.maxHp, city.hp + 50);
      }
      if (buildingId === 'grand_observatory') {
        const civ = this.getCiv(city.ownerId);
        this.winner = {
          civId: civ.id,
          type: 'science',
          reason: `${civ.name} 在「${city.name}」建成了世界奇观「大天文台」，率先步入星辰大海，达成科技胜利！`,
        };
        this.addLog(this.winner.reason, 'victory');
      }
    }
  }

  getMoveCostForUnit(unit, toTile) {
    if (!toTile || !TERRAIN[toTile.terrain].passable) return Infinity;
    const role = UNITS[unit.type].role;
    const existingSameRole = this.getUnitAt(toTile.q, toTile.r, role);
    if (existingSameRole && existingSameRole.id !== unit.id) return Infinity;
    const enemyUnits = this.getUnitsAt(toTile.q, toTile.r).filter(u => u.ownerId !== unit.ownerId);
    if (enemyUnits.length > 0) return Infinity;
    const city = this.getCityAt(toTile.q, toTile.r);
    if (city && city.ownerId !== unit.ownerId) return Infinity;
    return TERRAIN[toTile.terrain].moveCost;
  }

  getReachableForUnit(unitId) {
    const unit = this.units.get(unitId);
    if (!unit || unit.moves <= 0) return new Map();
    const { costSoFar } = getReachableHexes(
      { q: unit.q, r: unit.r },
      unit.moves,
      (q, r) => this.getTile(q, r),
      (_from, toTile) => this.getMoveCostForUnit(unit, toTile)
    );
    return costSoFar;
  }

  moveUnit(unitId, targetQ, targetR) {
    const unit = this.units.get(unitId);
    if (!unit || unit.moves <= 0) return { ok: false, reason: '单位没有剩余移动力' };
    const reachable = this.getReachableForUnit(unitId);
    const key = hexKey(targetQ, targetR);
    if (!reachable.has(key)) return { ok: false, reason: '目标地块不可到达' };

    const cost = reachable.get(key);
    unit.q = targetQ;
    unit.r = targetR;
    unit.moves = Math.max(0, unit.moves - cost);
    unit.fortified = false;
    this.recomputeVision(unit.ownerId);
    return { ok: true, unit };
  }

  canBuildImprovement(unit, impId) {
    if (!unit || unit.type !== 'worker' || unit.charges <= 0 || unit.moves <= 0) {
      return { ok: false, reason: '建造者不可行动或次数已耗尽' };
    }
    const imp = IMPROVEMENTS[impId];
    if (!imp) return { ok: false, reason: '无效改良类型' };
    const civ = this.getCiv(unit.ownerId);
    if (imp.tech && !civ.techs.has(imp.tech)) {
      return { ok: false, reason: `需要科技：${TECHNOLOGIES[imp.tech].name}` };
    }
    const tile = this.getTile(unit.q, unit.r);
    if (!tile || tile.cityId) return { ok: false, reason: '城市中心不可修建改良' };
    if (tile.ownerId !== unit.ownerId) return { ok: false, reason: '只能在本国领土修建改良设施' };
    if (!imp.terrains.includes(tile.terrain)) return { ok: false, reason: `${imp.name}不能建在${TERRAIN[tile.terrain].name}` };
    if (tile.improvement === impId) return { ok: false, reason: '该地块已有相同设施' };
    return { ok: true };
  }

  buildImprovement(unitId, impId) {
    const unit = this.units.get(unitId);
    const check = this.canBuildImprovement(unit, impId);
    if (!check.ok) return check;
    const tile = this.getTile(unit.q, unit.r);
    tile.improvement = impId;
    unit.charges -= 1;
    unit.moves = 0;
    const civ = this.getCiv(unit.ownerId);
    this.addLog(`${civ.name} 在 (${tile.col},${tile.row}) 修建了${IMPROVEMENTS[impId].name}。`, 'info');
    if (unit.charges <= 0) {
      this.units.delete(unit.id);
    }
    return { ok: true };
  }

  fortifyUnit(unitId) {
    const unit = this.units.get(unitId);
    if (!unit || unit.moves <= 0) return false;
    unit.fortified = true;
    unit.moves = 0;
    return true;
  }

  getAttackableTargets(unitId) {
    const unit = this.units.get(unitId);
    if (!unit || unit.attacked || unit.moves <= 0) return [];
    const def = UNITS[unit.type];
    if (def.role !== 'combat') return [];
    const range = def.range || 1;
    const targets = [];

    for (const h of hexesInRange({ q: unit.q, r: unit.r }, range)) {
      if (h.q === unit.q && h.r === unit.r) continue;
      const city = this.getCityAt(h.q, h.r);
      const enemyUnit = this.getUnitsAt(h.q, h.r).find(u => u.ownerId !== unit.ownerId);
      if (enemyUnit) {
        targets.push({ q: h.q, r: h.r, kind: 'unit', targetId: enemyUnit.id, ownerId: enemyUnit.ownerId });
      } else if (city && city.ownerId !== unit.ownerId) {
        targets.push({ q: h.q, r: h.r, kind: 'city', targetId: city.id, ownerId: city.ownerId });
      }
    }
    return targets;
  }

  attackTarget(attackerId, targetQ, targetR) {
    const attacker = this.units.get(attackerId);
    if (!attacker || attacker.attacked || attacker.moves <= 0) {
      return { ok: false, reason: '该单位本回合无法攻击' };
    }
    const aDef = UNITS[attacker.type];
    if (aDef.role !== 'combat') return { ok: false, reason: '非战斗单位无法攻击' };
    const dist = hexDistance(attacker, { q: targetQ, r: targetR });
    if (dist > (aDef.range || 1)) return { ok: false, reason: '目标超出射程' };

    const enemyCity = this.getCityAt(targetQ, targetR);
    const enemyUnit = this.getUnitsAt(targetQ, targetR).find(u => u.ownerId !== attacker.ownerId);
    if (!enemyUnit && (!enemyCity || enemyCity.ownerId === attacker.ownerId)) {
      return { ok: false, reason: '目标位置没有敌方单位或城市' };
    }

    const defenderOwnerId = enemyUnit ? enemyUnit.ownerId : enemyCity.ownerId;
    if (!this.areAtWar(attacker.ownerId, defenderOwnerId)) {
      this.declareWar(attacker.ownerId, defenderOwnerId);
    }

    const aCivDef = CIVILIZATIONS[attacker.ownerId];
    const isRanged = aDef.ranged > 0 && dist >= 1;
    const baseAtk = (isRanged ? aDef.ranged : aDef.strength) + (attacker.bonusStrength || 0);
    const atkStrength = baseAtk * (1 + aCivDef.combatBonus) * (0.5 + 0.5 * (attacker.hp / attacker.maxHp));

    attacker.attacked = true;
    attacker.moves = 0;
    attacker.fortified = false;

    // Attacking an enemy unit
    if (enemyUnit) {
      const dDef = UNITS[enemyUnit.type];
      // Instant capture/destroy civilian
      if (dDef.role === 'civilian') {
        this.units.delete(enemyUnit.id);
        if (!isRanged && dist === 1) {
          attacker.q = targetQ;
          attacker.r = targetR;
          this.recomputeVision(attacker.ownerId);
        }
        this.recomputeVision(defenderOwnerId);
        this.addLog(`${this.getCiv(attacker.ownerId).name}的${aDef.name}俘获了敌方${dDef.name}！`, 'combat');
        this.checkElimination(defenderOwnerId);
        return { ok: true, damageDealt: 100, damageTaken: 0, defenderDestroyed: true };
      }

      const dTile = this.getTile(targetQ, targetR);
      const dCivDef = CIVILIZATIONS[enemyUnit.ownerId];
      const terrainBonus = TERRAIN[dTile.terrain].defense + (enemyUnit.fortified ? 4 : 0);
      const defStrength = (dDef.strength + (enemyUnit.bonusStrength || 0) + terrainBonus) *
        (1 + dCivDef.combatBonus) * (0.5 + 0.5 * (enemyUnit.hp / enemyUnit.maxHp));

      const ratio = atkStrength / Math.max(1, defStrength);
      const damageDealt = Math.max(8, Math.min(100, Math.round(30 * Math.pow(ratio, 0.85))));
      const damageTaken = isRanged ? 0 : Math.max(5, Math.min(90, Math.round(24 * Math.pow(1 / ratio, 0.85))));

      enemyUnit.hp -= damageDealt;
      attacker.hp -= damageTaken;

      let defenderDestroyed = false;
      let attackerDestroyed = false;

      if (enemyUnit.hp <= 0) {
        defenderDestroyed = true;
        this.units.delete(enemyUnit.id);
        this.addLog(`${this.getCiv(attacker.ownerId).name}的${aDef.name}消灭了${this.getCiv(defenderOwnerId).name}的${dDef.name}！`, 'combat');
      }
      if (attacker.hp <= 0) {
        attackerDestroyed = true;
        this.units.delete(attacker.id);
        this.addLog(`${this.getCiv(attacker.ownerId).name}的${aDef.name}在交战中阵亡！`, 'combat');
      } else if (defenderDestroyed && !isRanged && dist === 1 && (!enemyCity || enemyCity.ownerId === attacker.ownerId)) {
        attacker.q = targetQ;
        attacker.r = targetR;
      }

      this.recomputeVision(attacker.ownerId);
      this.recomputeVision(defenderOwnerId);
      this.checkElimination(defenderOwnerId);
      this.checkElimination(attacker.ownerId);
      return { ok: true, damageDealt, damageTaken, defenderDestroyed, attackerDestroyed };
    }

    // Attacking an enemy city
    const cityDef = this.getCityDefense(enemyCity);
    const siegeMult = aDef.siegeBonus || 1.0;
    const ratio = (atkStrength * siegeMult) / Math.max(1, cityDef);
    const damageDealt = Math.max(8, Math.min(100, Math.round(28 * Math.pow(ratio, 0.85))));
    const damageTaken = isRanged ? 0 : Math.max(8, Math.min(80, Math.round(26 * Math.pow(1 / ratio, 0.85))));

    enemyCity.hp -= damageDealt;
    attacker.hp -= damageTaken;

    let cityCaptured = false;
    if (enemyCity.hp <= 0) {
      if (!isRanged) {
        cityCaptured = true;
        this.captureCity(enemyCity, attacker.ownerId);
        if (attacker.hp > 0) {
          attacker.q = targetQ;
          attacker.r = targetR;
        }
      } else {
        enemyCity.hp = 1; // Ranged units reduce city to 1 HP; melee required to capture
      }
    }
    if (attacker.hp <= 0) {
      this.units.delete(attacker.id);
    }

    this.recomputeVision(attacker.ownerId);
    this.recomputeVision(defenderOwnerId);
    this.checkElimination(defenderOwnerId);
    return { ok: true, damageDealt, damageTaken, cityCaptured };
  }

  captureCity(city, newOwnerId) {
    const oldOwnerId = city.ownerId;
    city.ownerId = newOwnerId;
    city.hp = Math.round(city.maxHp * 0.5);
    city.population = Math.max(1, city.population - 1);
    city.isCapital = false;
    const centerTile = this.getTile(city.q, city.r);
    centerTile.ownerId = newOwnerId;
    for (const n of hexNeighbors(city.q, city.r)) {
      const nt = this.getTile(n.q, n.r);
      if (nt && nt.ownerId === oldOwnerId && !nt.cityId) {
        nt.ownerId = newOwnerId;
      }
    }
    this.addLog(`${this.getCiv(newOwnerId).name} 攻陷了「${city.name}」！`, 'war');
    this.checkElimination(oldOwnerId);
  }

  checkElimination(civId) {
    const civ = this.getCiv(civId);
    if (!civ || !civ.alive) return;
    const hasCity = Array.from(this.cities.values()).some(c => c.ownerId === civId);
    const hasSettler = Array.from(this.units.values()).some(u => u.ownerId === civId && u.type === 'settler');
    if (!hasCity && !hasSettler) {
      civ.alive = false;
      // Remove remaining units of eliminated civ
      for (const [uid, u] of Array.from(this.units.entries())) {
        if (u.ownerId === civId) this.units.delete(uid);
      }
      this.addLog(`${civ.name} 已在历史长河中覆灭！`, 'war');
      this.checkVictory();
    }
  }

  checkVictory() {
    if (this.winner) return this.winner;
    const aliveCivs = Array.from(this.civs.values()).filter(c => c.alive);
    if (aliveCivs.length === 1) {
      const champ = aliveCivs[0];
      this.winner = {
        civId: champ.id,
        type: 'domination',
        reason: `${champ.name} 统一了整个世界，达成征服胜利！`,
      };
      this.addLog(this.winner.reason, 'victory');
      return this.winner;
    }
    if (this.turn > this.maxTurns) {
      const ranked = aliveCivs
        .map(c => ({ civ: c, score: this.getCivScore(c.id) }))
        .sort((a, b) => b.score - a.score);
      const top = ranked[0];
      if (top) {
        this.winner = {
          civId: top.civ.id,
          type: 'score',
          reason: `100 回合纪元终结，${top.civ.name} 以 ${top.score} 总分荣登霸主，达成积分胜利！`,
        };
        this.addLog(this.winner.reason, 'victory');
      }
    }
    return this.winner;
  }

  /**
   * Process end-of-turn yields, growth, production, research, and healing for one civilization
   */
  processCivTurn(civId) {
    const civ = this.getCiv(civId);
    if (!civ || !civ.alive) return;

    const totals = this.getCivTotals(civId);
    civ.gold = Math.max(0, civ.gold + totals.goldPerTurn);

    // Science & Tech completion
    if (civ.currentTech && TECHNOLOGIES[civ.currentTech]) {
      civ.scienceBank += totals.sciencePerTurn;
      const tech = TECHNOLOGIES[civ.currentTech];
      if (civ.scienceBank >= tech.cost) {
        civ.scienceBank -= tech.cost;
        civ.techs.add(tech.id);
        if (civ.isHuman) {
          this.addLog(`科研突破！解锁新科技「${tech.name}」(${tech.unlocks.join('、')})。`, 'tech');
        }
        // Auto-select next available tech
        const nextTech = Object.keys(TECHNOLOGIES).find(id => this.canResearchTech(civId, id));
        civ.currentTech = nextTech || null;
      }
    }

    // Cities: growth, border expansion, production, healing
    for (const city of this.cities.values()) {
      if (city.ownerId !== civId) continue;
      const y = this.getCityYields(city);

      // Heal city
      if (city.hp < city.maxHp) {
        city.hp = Math.min(city.maxHp, city.hp + 10);
      }

      // Growth
      city.foodStock += y.netFood;
      if (city.foodStock >= y.foodNeeded) {
        city.foodStock -= y.foodNeeded;
        city.population += 1;
        this.expandCityBorder(city);
        if (civ.isHuman) {
          this.addLog(`「${city.name}」人口增长至 ${city.population}，疆域随之扩张。`, 'city');
        }
      } else if (city.foodStock < 0) {
        city.foodStock = 0;
      }

      // Production
      if (city.production) {
        city.production.progress += y.prod;
        const def = city.production.kind === 'unit'
          ? UNITS[city.production.id]
          : BUILDINGS[city.production.id];
        if (def && city.production.progress >= def.cost) {
          const overflow = city.production.progress - def.cost;
          if (city.production.kind === 'unit') {
            const role = def.role;
            const spawnPos = !this.getUnitAt(city.q, city.r, role)
              ? { q: city.q, r: city.r }
              : this.findAdjacentPassable(city.q, city.r, civId, role);
            if (spawnPos) {
              const bonus = (role === 'combat' && city.buildings.includes('barracks')) ? 3 : 0;
              this.spawnUnit(civId, def.id, spawnPos.q, spawnPos.r, bonus);
              if (civ.isHuman) {
                this.addLog(`「${city.name}」完成了单位训练：${def.name}。`, 'city');
              }
              city.production = { kind: 'unit', id: 'warrior', progress: Math.min(overflow, 10) };
            }
          } else {
            this.completeBuilding(city, def.id);
            if (civ.isHuman) {
              this.addLog(`「${city.name}」建成了建筑：${def.name}！`, 'city');
            }
            city.production = { kind: 'unit', id: 'warrior', progress: Math.min(overflow, 10) };
          }
        }
      }
    }

    // Refresh units & heal fortified/idle units in friendly territory
    for (const u of this.units.values()) {
      if (u.ownerId !== civId) continue;
      if (u.hp < u.maxHp && (u.fortified || u.moves === u.maxMoves)) {
        const tile = this.getTile(u.q, u.r);
        const heal = (tile && tile.ownerId === civId) ? 15 : 8;
        u.hp = Math.min(u.maxHp, u.hp + heal);
      }
      u.moves = u.maxMoves;
      u.attacked = false;
    }

    this.recomputeVision(civId);
  }

  expandCityBorder(city) {
    const candidates = hexesInRange({ q: city.q, r: city.r }, 2)
      .map(h => this.getTile(h.q, h.r))
      .filter(t => t && !t.ownerId && t.terrain !== 'ocean');
    if (candidates.length === 0) return;
    candidates.sort((a, b) => {
      const ya = this.getTileYield(a);
      const yb = this.getTileYield(b);
      return (yb.food + yb.prod + yb.gold + yb.science) - (ya.food + ya.prod + ya.gold + ya.science);
    });
    candidates[0].ownerId = city.ownerId;
  }

  /**
   * Advance full game turn (human -> AI turns -> turn counter increment)
   */
  endTurn(aiRunner = null) {
    if (this.winner) return this.winner;

    this.processCivTurn(this.playerCivId);
    if (this.winner) return this.winner;

    for (const civ of this.civs.values()) {
      if (civ.isHuman || !civ.alive) continue;
      if (aiRunner) aiRunner(this, civ.id);
      this.processCivTurn(civ.id);
      if (this.winner) return this.winner;
    }

    this.turn += 1;
    this.checkVictory();
    return this.winner;
  }

  /**
   * Serialize complete game state for save/load
   */
  serialize() {
    return JSON.stringify({
      version: 1,
      preset: this.preset,
      seed: this.seed,
      turn: this.turn,
      maxTurns: this.maxTurns,
      nextEntityId: this.nextEntityId,
      playerCivId: this.playerCivId,
      winner: this.winner,
      width: this.width,
      height: this.height,
      logs: this.logs,
      tiles: this.tileList,
      civs: Array.from(this.civs.values()).map(c => ({
        ...c,
        techs: Array.from(c.techs),
        explored: Array.from(c.explored),
        visible: Array.from(c.visible),
        wars: Array.from(c.wars),
      })),
      cities: Array.from(this.cities.values()),
      units: Array.from(this.units.values()),
    });
  }

  static deserialize(jsonStr) {
    const data = JSON.parse(jsonStr);
    const engine = Object.create(GameEngine.prototype);
    engine.preset = data.preset;
    engine.seed = data.seed;
    engine.turn = data.turn;
    engine.maxTurns = data.maxTurns;
    engine.nextEntityId = data.nextEntityId;
    engine.playerCivId = data.playerCivId;
    engine.winner = data.winner;
    engine.width = data.width;
    engine.height = data.height;
    engine.logs = data.logs || [];

    engine.tiles = new Map();
    engine.tileList = data.tiles;
    for (const t of data.tiles) engine.tiles.set(t.key, t);

    engine.civs = new Map();
    for (const c of data.civs) {
      engine.civs.set(c.id, {
        ...c,
        techs: new Set(c.techs),
        explored: new Set(c.explored),
        visible: new Set(c.visible),
        wars: new Set(c.wars),
      });
    }
    engine.cities = new Map();
    for (const c of data.cities) engine.cities.set(c.id, c);
    engine.units = new Map();
    for (const u of data.units) engine.units.set(u.id, u);
    return engine;
  }
}
