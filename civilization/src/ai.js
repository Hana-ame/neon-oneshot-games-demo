/**
 * AI Civilization Controller
 * AI 决策系统：拓荒选址、城市生产调度、科技树规划、地块改良与战术作战
 */

import { UNITS, BUILDINGS, TECHNOLOGIES, TERRAIN, IMPROVEMENTS } from './constants.js';
import { hexDistance, hexKey } from './hex.js';

export function runAiTurn(engine, civId) {
  const civ = engine.getCiv(civId);
  if (!civ || !civ.alive) return;

  // 1. Tech selection
  if (!civ.currentTech) {
    const priority = ['pottery', 'mining', 'archery', 'writing', 'bronze_working', 'iron_working', 'horseback', 'engineering', 'astronomy'];
    const pick = priority.find(t => engine.canResearchTech(civId, t))
      || Object.keys(TECHNOLOGIES).find(t => engine.canResearchTech(civId, t));
    if (pick) engine.setResearch(civId, pick);
  }

  // 2. City production & occasional gold rush
  const myCities = Array.from(engine.cities.values()).filter(c => c.ownerId === civId);
  const myUnits = Array.from(engine.units.values()).filter(u => u.ownerId === civId);
  const combatUnits = myUnits.filter(u => UNITS[u.type].role === 'combat');
  const settlers = myUnits.filter(u => u.type === 'settler');
  const workers = myUnits.filter(u => u.type === 'worker');

  for (const city of myCities) {
    const avail = engine.getAvailableProductions(city);
    // If astronomy unlocked, rush Grand Observatory
    if (avail.some(i => i.kind === 'building' && i.id === 'grand_observatory')) {
      engine.setCityProduction(city.id, 'building', 'grand_observatory');
      continue;
    }
    // Balance economy, expansion, and army
    if (combatUnits.length < myCities.length * 2 + 1) {
      const bestMilitary = ['knight', 'swordsman', 'catapult', 'archer', 'warrior']
        .find(id => avail.some(i => i.kind === 'unit' && i.id === id));
      if (bestMilitary) {
        engine.setCityProduction(city.id, 'unit', bestMilitary);
        if (civ.gold >= UNITS[bestMilitary].goldCost + 40) {
          engine.buyInCity(city.id, 'unit', bestMilitary);
        }
        continue;
      }
    }
    if (myCities.length < 3 && settlers.length === 0 && city.population >= 2) {
      engine.setCityProduction(city.id, 'unit', 'settler');
      continue;
    }
    if (workers.length < myCities.length && avail.some(i => i.kind === 'unit' && i.id === 'worker')) {
      engine.setCityProduction(city.id, 'unit', 'worker');
      continue;
    }
    const desiredBld = ['library', 'granary', 'barracks', 'market', 'walls']
      .find(id => avail.some(i => i.kind === 'building' && i.id === id));
    if (desiredBld) {
      engine.setCityProduction(city.id, 'building', desiredBld);
    }
  }

  // 3. Unit actions
  const currentUnits = Array.from(engine.units.values()).filter(u => u.ownerId === civId);
  for (const unit of currentUnits) {
    if (!engine.units.has(unit.id)) continue;

    if (unit.type === 'settler') {
      handleSettler(engine, unit);
    } else if (unit.type === 'worker') {
      handleWorker(engine, unit);
    } else {
      handleCombatUnit(engine, unit, myCities);
    }
  }
}

function handleSettler(engine, unit) {
  const check = engine.canFoundCity(unit);
  if (check.ok) {
    engine.foundCity(unit.id);
    return;
  }
  const reachable = engine.getReachableForUnit(unit.id);
  let best = null;
  let bestScore = -999;
  for (const key of reachable.keys()) {
    const [q, r] = key.split(',').map(Number);
    const tile = engine.getTile(q, r);
    if (!tile) continue;
    const minCityDist = Array.from(engine.cities.values()).reduce(
      (min, c) => Math.min(min, hexDistance({ q, r }, c)),
      99
    );
    const y = engine.getTileYield(tile);
    const score = minCityDist * 3 + y.food * 2 + y.prod * 2;
    if (score > bestScore) {
      bestScore = score;
      best = { q, r };
    }
  }
  if (best) {
    engine.moveUnit(unit.id, best.q, best.r);
    if (engine.canFoundCity(unit).ok) {
      engine.foundCity(unit.id);
    }
  }
}

function handleWorker(engine, unit) {
  for (const impId of ['farm', 'mine', 'trade']) {
    if (engine.canBuildImprovement(unit, impId).ok) {
      engine.buildImprovement(unit.id, impId);
      return;
    }
  }
  const reachable = engine.getReachableForUnit(unit.id);
  for (const key of reachable.keys()) {
    const [q, r] = key.split(',').map(Number);
    const tile = engine.getTile(q, r);
    if (tile && tile.ownerId === unit.ownerId && !tile.improvement && !tile.cityId) {
      engine.moveUnit(unit.id, q, r);
      return;
    }
  }
}

function handleCombatUnit(engine, unit, myCities) {
  // Low HP -> fortify & heal
  if (unit.hp < 35) {
    engine.fortifyUnit(unit.id);
    return;
  }

  // Attack if enemy in range (at war, or opportunistic after turn 15)
  const targets = engine.getAttackableTargets(unit.id);
  const validTargets = targets.filter(t => engine.areAtWar(unit.ownerId, t.ownerId) || engine.turn >= 18);
  if (validTargets.length > 0) {
    const target = validTargets[0];
    engine.attackTarget(unit.id, target.q, target.r);
    return;
  }

  // Move toward nearest war enemy or explore unexplored tiles
  const reachable = engine.getReachableForUnit(unit.id);
  if (reachable.size === 0) return;

  const civ = engine.getCiv(unit.ownerId);
  let goal = null;

  // Find nearest enemy unit/city at war
  let bestEnemyDist = 999;
  for (const c of engine.cities.values()) {
    if (c.ownerId !== unit.ownerId && engine.areAtWar(unit.ownerId, c.ownerId)) {
      const d = hexDistance(unit, c);
      if (d < bestEnemyDist) {
        bestEnemyDist = d;
        goal = { q: c.q, r: c.r };
      }
    }
  }

  // Otherwise explore or patrol near empire
  let bestMove = null;
  let bestScore = -9999;
  for (const key of reachable.keys()) {
    const [q, r] = key.split(',').map(Number);
    const tile = engine.getTile(q, r);
    if (!tile) continue;
    let score = TERRAIN[tile.terrain].defense;
    if (goal) {
      score += (20 - hexDistance({ q, r }, goal)) * 5;
    } else {
      // Favor moving toward unexplored border or patrolling around capital
      if (!civ.explored.has(hexKey(q + 1, r)) || !civ.explored.has(hexKey(q - 1, r))) {
        score += 6;
      }
      if (myCities[0]) {
        const dHome = hexDistance({ q, r }, myCities[0]);
        score -= Math.abs(dHome - 4);
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMove = { q, r };
    }
  }

  if (bestMove) {
    engine.moveUnit(unit.id, bestMove.q, bestMove.r);
    // Attack after moving if range allows and moves left
    const afterTargets = engine.getAttackableTargets(unit.id)
      .filter(t => engine.areAtWar(unit.ownerId, t.ownerId));
    if (afterTargets.length > 0) {
      engine.attackTarget(unit.id, afterTargets[0].q, afterTargets[0].r);
    }
  }
}
