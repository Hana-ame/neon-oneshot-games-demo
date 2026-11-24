/**
 * Colonist utility/priority job scheduler, FSM executor, and Raider combat AI.
 */

import {
  BUILDING_INFO,
  NATURAL_INFO,
  JOB_TYPES,
  TERRAIN_INFO,
  TECH_TREE,
} from './constants.js';
import { findPath, isTileWalkable } from './pathfinding.js';
import { getColonistMoveSpeed, getColonistWorkSpeed } from './colonists.js';

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

function tileKey(x, y) {
  return `${x},${y}`;
}

function getReservedTiles(world, excludeColonistId) {
  const reserved = new Set();
  for (const c of world.colonists) {
    if (!c.alive || c.id === excludeColonistId || !c.job) continue;
    if (c.job.tx != null && c.job.ty != null) {
      reserved.add(tileKey(c.job.tx, c.job.ty));
    }
  }
  return reserved;
}

function findNearestTile(world, cx, cy, predicate, reserved = null) {
  let best = null;
  let bestDist = Infinity;
  const { tiles } = world.map;
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    if (reserved && reserved.has(tileKey(t.x, t.y))) continue;
    if (!predicate(t)) continue;
    const d = dist(cx, cy, t.x, t.y);
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return best;
}

function assignPathJob(colonist, world, job, allowAdjacent = false) {
  const path = findPath(
    world.map,
    colonist.x,
    colonist.y,
    job.tx,
    job.ty,
    allowAdjacent
  );
  if (path === null) return false;
  colonist.job = job;
  colonist.path = path;
  return true;
}

export function assignJob(colonist, world) {
  if (!colonist.alive) return;

  // Drafted colonists only follow manual move orders or engage nearby hostiles
  if (colonist.drafted) {
    if (colonist.job && colonist.job.type === JOB_TYPES.MOVE_DRAFTED) return;
    const nearestRaider = findNearestLiving(colonist.x, colonist.y, world.raiders, 8.5);
    if (nearestRaider) {
      colonist.job = { type: JOB_TYPES.FIGHT, targetId: nearestRaider.id, tx: nearestRaider.x, ty: nearestRaider.y };
      colonist.path = [];
      colonist.statusText = '射击防御';
    } else {
      colonist.job = null;
      colonist.statusText = '征召待命';
    }
    return;
  }

  // 1. Self-defense when raider is close
  const threat = findNearestLiving(colonist.x, colonist.y, world.raiders, 6.5);
  if (threat) {
    colonist.job = { type: JOB_TYPES.FIGHT, targetId: threat.id, tx: threat.x, ty: threat.y };
    colonist.path = [];
    colonist.statusText = '迎击掠夺者';
    return;
  }

  const reserved = getReservedTiles(world, colonist.id);

  // 2. Urgent survival needs
  if (colonist.needs.hunger < 28 && (world.resources.meals > 0 || world.resources.rawFood > 0)) {
    const stockpile = findNearestTile(world, colonist.x, colonist.y, (t) => t.zone === 'stockpile');
    const tx = stockpile ? stockpile.x : Math.round(colonist.x);
    const ty = stockpile ? stockpile.y : Math.round(colonist.y);
    if (assignPathJob(colonist, world, { type: JOB_TYPES.EAT, tx, ty, progress: 0, workRequired: 18 }, false)) {
      colonist.statusText = '前去进食';
      return;
    }
  }

  const isNight = world.timeOfDay >= 22 || world.timeOfDay < 5.5;
  if (colonist.needs.rest < 24 || (isNight && colonist.needs.rest < 58)) {
    const bed = findNearestTile(
      world,
      colonist.x,
      colonist.y,
      (t) => t.building && t.building.built && t.building.type === 'bed',
      reserved
    );
    const tx = bed ? bed.x : Math.round(colonist.x);
    const ty = bed ? bed.y : Math.round(colonist.y);
    if (assignPathJob(colonist, world, { type: JOB_TYPES.SLEEP, tx, ty, inBed: Boolean(bed) }, false)) {
      colonist.statusText = bed ? '回床休息' : '就地休整';
      return;
    }
  }

  if (colonist.needs.joy < 22) {
    const fire = findNearestTile(
      world,
      colonist.x,
      colonist.y,
      (t) => t.building && t.building.built && (t.building.type === 'campfire' || t.building.type === 'torch')
    );
    const tx = fire ? fire.x : world.map.spawnPoint.x;
    const ty = fire ? fire.y : world.map.spawnPoint.y;
    if (assignPathJob(colonist, world, { type: JOB_TYPES.RELAX, tx, ty }, true)) {
      colonist.statusText = '放松娱乐';
      return;
    }
  }

  // 3. Work priority queue (1..4, lower number = higher priority; 0 = disabled)
  const categories = Object.entries(colonist.workPriorities)
    .filter(([, prio]) => prio > 0)
    .sort((a, b) => a[1] - b[1]);

  for (const [cat] of categories) {
    if (cat === 'medical' && world.resources.medicine > 0) {
      const patient = world.colonists.find((c) => c.alive && c.id !== colonist.id && c.hp < 75);
      if (patient) {
        if (
          assignPathJob(
            colonist,
            world,
            { type: JOB_TYPES.TEND, targetId: patient.id, tx: Math.round(patient.x), ty: Math.round(patient.y), progress: 0, workRequired: 28 },
            true
          )
        ) {
          colonist.statusText = `治疗 ${patient.name}`;
          return;
        }
      }
    }

    if (cat === 'cook' && world.resources.rawFood >= 5 && world.resources.meals < 20) {
      const stove = findNearestTile(
        world,
        colonist.x,
        colonist.y,
        (t) => t.building && t.building.built && t.building.type === 'campfire',
        reserved
      );
      if (stove) {
        if (
          assignPathJob(
            colonist,
            world,
            { type: JOB_TYPES.COOK, tx: stove.x, ty: stove.y, progress: 0, workRequired: 35 },
            true
          )
        ) {
          colonist.statusText = '烹饪餐食';
          return;
        }
      }
    }

    if (cat === 'build') {
      const blueprint = findNearestTile(
        world,
        colonist.x,
        colonist.y,
        (t) => t.building && !t.building.built,
        reserved
      );
      if (blueprint) {
        const bInfo = BUILDING_INFO[blueprint.building.type];
        if (
          assignPathJob(
            colonist,
            world,
            {
              type: JOB_TYPES.BUILD,
              tx: blueprint.x,
              ty: blueprint.y,
              workRequired: bInfo.work,
            },
            true
          )
        ) {
          colonist.statusText = `建造 ${bInfo.name}`;
          return;
        }
      }
    }

    if (cat === 'plant') {
      // Designated chop/harvest first
      const orderTile = findNearestTile(
        world,
        colonist.x,
        colonist.y,
        (t) => (t.order === 'chop' && t.natural === 'tree') || (t.order === 'harvest' && t.natural === 'berry_bush'),
        reserved
      );
      if (orderTile) {
        const nInfo = NATURAL_INFO[orderTile.natural];
        const jType = orderTile.order === 'chop' ? JOB_TYPES.CHOP : JOB_TYPES.HARVEST;
        if (
          assignPathJob(
            colonist,
            world,
            { type: jType, tx: orderTile.x, ty: orderTile.y, progress: 0, workRequired: nInfo.work },
            true
          )
        ) {
          colonist.statusText = jType === JOB_TYPES.CHOP ? '砍伐树木' : '采摘浆果';
          return;
        }
      }

      // Ripe crops in growing zone
      const ripe = findNearestTile(
        world,
        colonist.x,
        colonist.y,
        (t) => t.zone === 'growing' && t.crop && t.crop.progress >= 100,
        reserved
      );
      if (ripe) {
        if (
          assignPathJob(
            colonist,
            world,
            { type: JOB_TYPES.HARVEST, tx: ripe.x, ty: ripe.y, progress: 0, workRequired: 24, isCrop: true },
            false
          )
        ) {
          colonist.statusText = '收割作物';
          return;
        }
      }

      // Empty growing zone tile to sow
      const emptyPlot = findNearestTile(
        world,
        colonist.x,
        colonist.y,
        (t) =>
          t.zone === 'growing' &&
          !t.crop &&
          !t.natural &&
          !t.building &&
          TERRAIN_INFO[t.terrain].fertile > 0,
        reserved
      );
      if (emptyPlot) {
        if (
          assignPathJob(
            colonist,
            world,
            { type: JOB_TYPES.SOW, tx: emptyPlot.x, ty: emptyPlot.y, progress: 0, workRequired: 22 },
            false
          )
        ) {
          colonist.statusText = '播种农田';
          return;
        }
      }
    }

    if (cat === 'mine') {
      const mineTile = findNearestTile(
        world,
        colonist.x,
        colonist.y,
        (t) =>
          t.order === 'mine' &&
          t.natural &&
          NATURAL_INFO[t.natural] &&
          NATURAL_INFO[t.natural].order === 'mine',
        reserved
      );
      if (mineTile) {
        const nInfo = NATURAL_INFO[mineTile.natural];
        if (
          assignPathJob(
            colonist,
            world,
            { type: JOB_TYPES.MINE, tx: mineTile.x, ty: mineTile.y, progress: 0, workRequired: nInfo.work },
            true
          )
        ) {
          colonist.statusText = `开采 ${nInfo.name}`;
          return;
        }
      }
    }

    if (cat === 'research' && world.activeTechId && !world.researchedTechs.has(world.activeTechId)) {
      const bench = findNearestTile(
        world,
        colonist.x,
        colonist.y,
        (t) => t.building && t.building.built && t.building.type === 'research_bench',
        reserved
      );
      if (bench) {
        if (
          assignPathJob(
            colonist,
            world,
            { type: JOB_TYPES.RESEARCH, tx: bench.x, ty: bench.y },
            true
          )
        ) {
          const tech = TECH_TREE.find((t) => t.id === world.activeTechId);
          colonist.statusText = `研究 ${tech ? tech.name : '科技'}`;
          return;
        }
      }
    }
  }

  // Idle fallback: gentle patrol near colony center
  colonist.job = { type: JOB_TYPES.IDLE, timer: 2.5 + world.rng() * 3 };
  colonist.statusText = '空闲巡视';
  const rx = Math.max(1, Math.min(world.map.width - 2, world.map.spawnPoint.x + Math.floor((world.rng() - 0.5) * 10)));
  const ry = Math.max(1, Math.min(world.map.height - 2, world.map.spawnPoint.y + Math.floor((world.rng() - 0.5) * 8)));
  if (isTileWalkable(world.getTile(rx, ry))) {
    const p = findPath(world.map, colonist.x, colonist.y, rx, ry, false, 400);
    if (p) colonist.path = p;
  }
}

function moveAlongPath(entity, dt, speed) {
  if (!entity.path || entity.path.length === 0) return true;
  let remaining = speed * dt;
  while (remaining > 0 && entity.path.length > 0) {
    const next = entity.path[0];
    const dx = next.x - entity.x;
    const dy = next.y - entity.y;
    const d = Math.hypot(dx, dy);
    if (d <= remaining) {
      entity.x = next.x;
      entity.y = next.y;
      entity.path.shift();
      remaining -= d;
    } else {
      entity.x += (dx / d) * remaining;
      entity.y += (dy / d) * remaining;
      remaining = 0;
    }
  }
  return entity.path.length === 0;
}

export function findNearestLiving(x, y, entities, maxRange = Infinity) {
  let best = null;
  let bestD = maxRange;
  for (const e of entities) {
    if (!e.alive) continue;
    const d = dist(x, y, e.x, e.y);
    if (d <= bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

export function stepColonistAI(colonist, dt, world) {
  if (!colonist.alive) return;
  if (colonist.attackCooldown > 0) colonist.attackCooldown = Math.max(0, colonist.attackCooldown - dt);

  if (!colonist.job) {
    assignJob(colonist, world);
    if (!colonist.job) return;
  }

  const job = colonist.job;
  const speed = getColonistMoveSpeed(colonist, world.weather.moveMult);

  if (job.type === JOB_TYPES.IDLE) {
    moveAlongPath(colonist, dt, speed * 0.65);
    job.timer -= dt;
    if (job.timer <= 0) {
      colonist.job = null;
    }
    return;
  }

  if (job.type === JOB_TYPES.MOVE_DRAFTED) {
    const arrived = moveAlongPath(colonist, dt, speed * 1.1);
    if (arrived) {
      colonist.job = null;
      colonist.statusText = '征召待命';
    }
    return;
  }

  if (job.type === JOB_TYPES.FIGHT) {
    const target = world.raiders.find((r) => r.id === job.targetId && r.alive);
    if (!target) {
      colonist.job = null;
      return;
    }
    const d = dist(colonist.x, colonist.y, target.x, target.y);
    const shootRange = 6.5;
    if (d > shootRange) {
      if (colonist.drafted) {
        colonist.job = null;
        return;
      }
      const p = findPath(world.map, colonist.x, colonist.y, Math.round(target.x), Math.round(target.y), true, 400);
      if (p && p.length > 0) {
        colonist.path = p.slice(0, 3);
        moveAlongPath(colonist, dt, speed);
      } else {
        colonist.job = null;
      }
      return;
    }

    if (colonist.attackCooldown <= 0) {
      const dmg = Math.round((10 + colonist.skills.shooting * 1.6) * (colonist.trait?.combatBonus || 1.0));
      target.hp = Math.max(0, target.hp - dmg);
      colonist.attackCooldown = 0.95;
      world.spawnProjectile(colonist.x, colonist.y, target.x, target.y, '#ffe066', 'shot');
      world.spawnFloatingText(target.x, target.y - 0.5, `-${dmg}`, '#ff7b7b');
      if (target.hp <= 0) {
        target.alive = false;
        target.statusText = '已击倒';
        world.stats.raidersDefeated++;
        world.addLog(`${colonist.name} 击退了 ${target.name}！`, 'good');
        colonist.job = null;
      }
    }
    return;
  }

  // Move to job tile
  const arrived = moveAlongPath(colonist, dt, speed);
  if (!arrived) return;

  const tile = world.getTile(job.tx, job.ty);

  if (job.type === JOB_TYPES.EAT) {
    job.progress += dt * 15;
    colonist.statusText = '进食中';
    if (job.progress >= job.workRequired) {
      if (world.resources.meals > 0) {
        world.resources.meals -= 1;
        colonist.needs.hunger = Math.min(100, colonist.needs.hunger + 68);
        colonist.needs.joy = Math.min(100, colonist.needs.joy + 8);
        world.spawnFloatingText(colonist.x, colonist.y - 0.5, '+餐食', '#e6b84c');
      } else if (world.resources.rawFood > 0) {
        world.resources.rawFood -= 2;
        world.resources.rawFood = Math.max(0, world.resources.rawFood);
        colonist.needs.hunger = Math.min(100, colonist.needs.hunger + 38);
      }
      colonist.job = null;
    }
    return;
  }

  if (job.type === JOB_TYPES.SLEEP) {
    const rate = job.inBed ? 8.5 : 5.0;
    colonist.needs.rest = Math.min(100, colonist.needs.rest + dt * rate);
    colonist.statusText = job.inBed ? '熟睡中' : '露宿中';
    if (colonist.needs.rest >= 96) {
      colonist.job = null;
    }
    return;
  }

  if (job.type === JOB_TYPES.RELAX) {
    colonist.needs.joy = Math.min(100, colonist.needs.joy + dt * 9.0);
    colonist.statusText = '休闲中';
    if (colonist.needs.joy >= 88) {
      colonist.job = null;
    }
    return;
  }

  if (job.type === JOB_TYPES.TEND) {
    const patient = world.colonists.find((c) => c.id === job.targetId && c.alive);
    if (!patient || patient.hp >= 95 || world.resources.medicine <= 0) {
      colonist.job = null;
      return;
    }
    const medBoost = world.researchedTechs.has('medicine_adv') ? 2.0 : 1.0;
    job.progress += dt * 16 * getColonistWorkSpeed(colonist, 'medical') * medBoost;
    colonist.statusText = `救治 ${patient.name}`;
    if (job.progress >= job.workRequired) {
      world.resources.medicine = Math.max(0, world.resources.medicine - 1);
      const heal = Math.round(30 + colonist.skills.medical * 3 * medBoost);
      patient.hp = Math.min(patient.maxHp, patient.hp + heal);
      world.spawnFloatingText(patient.x, patient.y - 0.5, `+${heal} HP`, '#58b368');
      colonist.job = null;
    }
    return;
  }

  if (job.type === JOB_TYPES.COOK) {
    if (!tile?.building?.built || world.resources.rawFood < 5) {
      colonist.job = null;
      return;
    }
    job.progress += dt * 18 * getColonistWorkSpeed(colonist, 'cook');
    colonist.statusText = '烹饪中';
    if (job.progress >= job.workRequired) {
      world.resources.rawFood -= 5;
      world.resources.meals += 2;
      world.stats.mealsCooked += 2;
      world.spawnFloatingText(tile.x, tile.y - 0.5, '+2 餐食', '#e6b84c');
      world.emitSound('build');
      colonist.job = null;
    }
    return;
  }

  if (job.type === JOB_TYPES.BUILD) {
    if (!tile || !tile.building || tile.building.built) {
      colonist.job = null;
      return;
    }
    const techBoost = world.researchedTechs.has('fortification') ? 1.3 : 1.0;
    tile.building.progress += dt * 22 * getColonistWorkSpeed(colonist, 'build') * techBoost;
    colonist.statusText = `建造 ${BUILDING_INFO[tile.building.type].name}`;
    if (tile.building.progress >= tile.building.workRequired) {
      tile.building.built = true;
      tile.building.progress = tile.building.workRequired;
      tile.building.hp = tile.building.maxHp;
      world.stats.buildingsBuilt++;
      if (tile.building.type === 'bed') world.stats.bedsBuilt++;
      world.spawnFloatingText(tile.x, tile.y - 0.5, `${BUILDING_INFO[tile.building.type].name}完工`, '#7bdff2');
      world.emitSound('build');
      colonist.job = null;
    }
    return;
  }

  if (job.type === JOB_TYPES.CHOP || job.type === JOB_TYPES.MINE) {
    if (!tile || !tile.natural || tile.order !== job.type) {
      colonist.job = null;
      return;
    }
    const skill = job.type === JOB_TYPES.CHOP ? 'plant' : 'mine';
    job.progress += dt * 22 * getColonistWorkSpeed(colonist, skill);
    if (job.progress >= job.workRequired) {
      const nInfo = NATURAL_INFO[tile.natural];
      for (const [res, amt] of Object.entries(nInfo.yield)) {
        world.resources[res] = (world.resources[res] || 0) + amt;
        world.spawnFloatingText(tile.x, tile.y - 0.5, `+${amt}`, '#d9f99d');
      }
      tile.natural = null;
      tile.order = null;
      world.emitSound(job.type === JOB_TYPES.CHOP ? 'chop' : 'mine');
      colonist.job = null;
    }
    return;
  }

  if (job.type === JOB_TYPES.HARVEST) {
    if (job.isCrop) {
      if (!tile || !tile.crop || tile.crop.progress < 100) {
        colonist.job = null;
        return;
      }
      job.progress += dt * 20 * getColonistWorkSpeed(colonist, 'plant');
      if (job.progress >= job.workRequired) {
        const yieldAmt = world.researchedTechs.has('agriculture') ? 15 : 12;
        world.resources.rawFood += yieldAmt;
        tile.crop = null;
        world.spawnFloatingText(tile.x, tile.y - 0.5, `+${yieldAmt} 生食`, '#a3e635');
        world.emitSound('chop');
        colonist.job = null;
      }
    } else {
      if (!tile || tile.natural !== 'berry_bush') {
        colonist.job = null;
        return;
      }
      job.progress += dt * 20 * getColonistWorkSpeed(colonist, 'plant');
      if (job.progress >= job.workRequired) {
        world.resources.rawFood += 14;
        tile.natural = null;
        tile.order = null;
        world.spawnFloatingText(tile.x, tile.y - 0.5, '+14 生食', '#a3e635');
        world.emitSound('chop');
        colonist.job = null;
      }
    }
    return;
  }

  if (job.type === JOB_TYPES.SOW) {
    if (!tile || tile.zone !== 'growing' || tile.crop || tile.natural || tile.building) {
      colonist.job = null;
      return;
    }
    job.progress += dt * 22 * getColonistWorkSpeed(colonist, 'plant');
    if (job.progress >= job.workRequired) {
      tile.crop = { type: 'rice', progress: 1 };
      colonist.job = null;
    }
    return;
  }

  if (job.type === JOB_TYPES.RESEARCH) {
    if (!tile?.building?.built || !world.activeTechId || world.researchedTechs.has(world.activeTechId)) {
      colonist.job = null;
      return;
    }
    const tech = TECH_TREE.find((t) => t.id === world.activeTechId);
    if (!tech) {
      colonist.job = null;
      return;
    }
    const gain = dt * 6.5 * getColonistWorkSpeed(colonist, 'research');
    world.techProgress[tech.id] = (world.techProgress[tech.id] || 0) + gain;
    if (world.techProgress[tech.id] >= tech.cost) {
      world.researchedTechs.add(tech.id);
      world.addAlert('科技完成', `已解锁「${tech.name}」：${tech.desc}`, 'good');
      world.addLog(`科技解锁：${tech.name}`, 'good');
      // Pick next unresearched tech automatically
      const next = TECH_TREE.find((t) => !world.researchedTechs.has(t.id));
      world.activeTechId = next ? next.id : null;
      colonist.job = null;
    }
  }
}

export function stepRaiderAI(raider, dt, world) {
  if (!raider.alive) return;
  if (raider.attackCooldown > 0) raider.attackCooldown = Math.max(0, raider.attackCooldown - dt);

  const targetCol = findNearestLiving(raider.x, raider.y, world.colonists, Infinity);
  if (!targetCol) {
    raider.statusText = '劫掠营地';
    return;
  }

  const d = dist(raider.x, raider.y, targetCol.x, targetCol.y);
  if (d <= raider.range) {
    raider.path = [];
    raider.statusText = `攻击 ${targetCol.name}`;
    if (raider.attackCooldown <= 0) {
      targetCol.hp = Math.max(0, targetCol.hp - raider.damage);
      raider.attackCooldown = 1.25;
      world.spawnProjectile(raider.x, raider.y, targetCol.x, targetCol.y, '#ff595e', 'shot');
      world.spawnFloatingText(targetCol.x, targetCol.y - 0.5, `-${raider.damage}`, '#ff595e');
      if (targetCol.hp <= 0) {
        targetCol.alive = false;
        targetCol.statusText = '阵亡';
        world.addAlert('殖民者阵亡', `${targetCol.name} 在战斗中倒下了！`, 'danger');
        world.addLog(`${targetCol.name} 阵亡。`, 'danger');
      }
    }
    return;
  }

  if (!raider.path || raider.path.length === 0) {
    const p = findPath(
      world.map,
      raider.x,
      raider.y,
      Math.round(targetCol.x),
      Math.round(targetCol.y),
      true,
      600
    );
    if (p && p.length > 0) {
      raider.path = p.slice(0, 6);
    } else {
      // Attack blocking player wall/building if path is sealed
      const wall = findNearestTile(
        world,
        raider.x,
        raider.y,
        (t) => t.building && t.building.built
      );
      if (wall && dist(raider.x, raider.y, wall.x, wall.y) <= 2.2) {
        if (raider.attackCooldown <= 0) {
          wall.building.hp -= raider.damage;
          raider.attackCooldown = 1.2;
          world.spawnFloatingText(wall.x, wall.y - 0.4, `-${raider.damage}`, '#ff9f1c');
          if (wall.building.hp <= 0) {
            wall.building = null;
          }
        }
      }
    }
  }

  moveAlongPath(raider, dt, raider.speed);
}
