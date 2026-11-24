/**
 * 无头塔防核心仿真引擎（与 DOM / Canvas 完全解耦，可直接由 Node.js 自动化测试驱动）
 */

import {
  COLS,
  ROWS,
  TILE,
  LOGICAL_W,
  MAPS,
  TOWER_MAP,
  ENEMY_TYPES,
  MAX_STANDARD_WAVES,
  buildWaveConfig
} from './config.js';

export class GameEngine {
  constructor(options = {}) {
    this.onEvent = typeof options.onEvent === 'function' ? options.onEvent : () => {};
    this.currentMapKey = 'canyon';
    this.pathTiles = new Set();
    this.pixelPaths = [];
    this.gridTowers = {};
    this.nextEnemyId = 1;
    this.nextTowerId = 1;
    this.state = this._createInitialState('canyon');
    this.reset('canyon');
  }

  _createInitialState(mapKey) {
    return {
      lives: 20,
      gold: MAPS[mapKey].startGold,
      score: 0,
      wave: 0,
      kills: 0,
      speed: 1,
      paused: false,
      autoWave: false,
      endless: false,
      gameOver: false,
      victoryShown: false,
      selectedBuildId: 'gatling',
      selectedTower: null,
      hoverCell: null,
      waveInProgress: false,
      spawnQueue: [],
      spawnTimer: 0,
      autoWaveDelay: 0,
      shakeTime: 0,
      time: 0,
      towers: [],
      enemies: [],
      projectiles: [],
      particles: [],
      beams: [],
      floatingTexts: []
    };
  }

  _emit(type, payload = {}) {
    this.onEvent(type, payload);
  }

  buildMapGeometry(mapKey) {
    const map = MAPS[mapKey];
    this.pathTiles = new Set();
    this.pixelPaths = [];

    map.paths.forEach((waypoints) => {
      const pts = waypoints.map((wp) => ({
        x: wp.c * TILE + TILE / 2,
        y: wp.r * TILE + TILE / 2
      }));
      this.pixelPaths.push(pts);

      for (let i = 0; i < waypoints.length - 1; i++) {
        const a = waypoints[i];
        const b = waypoints[i + 1];
        const dc = Math.sign(b.c - a.c);
        const dr = Math.sign(b.r - a.r);
        let c = a.c;
        let r = a.r;
        this.pathTiles.add(`${c},${r}`);
        while (c !== b.c || r !== b.r) {
          c += dc;
          r += dr;
          this.pathTiles.add(`${c},${r}`);
        }
      }
    });
  }

  reset(mapKey = this.currentMapKey) {
    this.currentMapKey = MAPS[mapKey] ? mapKey : 'canyon';
    this.buildMapGeometry(this.currentMapKey);
    this.gridTowers = {};
    this.nextEnemyId = 1;
    this.nextTowerId = 1;
    this.state = this._createInitialState(this.currentMapKey);
    this._emit('reset', { mapKey: this.currentMapKey });
  }

  isCellBuildable(c, r) {
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return false;
    const key = `${c},${r}`;
    if (this.pathTiles.has(key)) return false;
    if (this.gridTowers[key]) return false;
    return true;
  }

  placeTower(c, r, typeId) {
    if (this.state.gameOver) return { ok: false, reason: 'game_over' };
    if (!this.isCellBuildable(c, r)) return { ok: false, reason: 'blocked' };
    const def = TOWER_MAP[typeId];
    if (!def) return { ok: false, reason: 'invalid_type' };
    if (this.state.gold < def.cost) {
      this._emit('toast', { message: '金币不足，无法建造' });
      return { ok: false, reason: 'insufficient_gold' };
    }

    this.state.gold -= def.cost;
    const tower = {
      id: this.nextTowerId++,
      type: typeId,
      c,
      r,
      x: c * TILE + TILE / 2,
      y: r * TILE + TILE / 2,
      level: 0,
      invested: def.cost,
      angle: 0,
      cooldown: 0,
      kills: 0,
      targetMode: 'first',
      recoil: 0,
      laserTargetId: null,
      laserLockTime: 0
    };
    this.state.towers.push(tower);
    this.gridTowers[`${c},${r}`] = tower;
    this.state.selectedTower = tower;
    this.spawnParticles(tower.x, tower.y, def.color, 12, 70);
    this._emit('sfx', { name: 'build' });
    this._emit('stateChanged');
    return { ok: true, tower };
  }

  upgradeTower(tower = this.state.selectedTower) {
    if (!tower || this.state.gameOver) return { ok: false, reason: 'invalid_state' };
    const def = TOWER_MAP[tower.type];
    const lvlData = def.levels[tower.level];
    if (!lvlData.upgradeCost) return { ok: false, reason: 'max_level' };
    if (this.state.gold < lvlData.upgradeCost) return { ok: false, reason: 'insufficient_gold' };

    this.state.gold -= lvlData.upgradeCost;
    tower.invested += lvlData.upgradeCost;
    tower.level += 1;
    this.spawnParticles(tower.x, tower.y, '#fde047', 16, 90);
    this.addFloatingText(tower.x, tower.y - 22, `Lv.${tower.level + 1}!`, '#fde047', 13);
    this._emit('sfx', { name: 'upgrade' });
    this._emit('stateChanged');
    return { ok: true, level: tower.level };
  }

  sellTower(tower = this.state.selectedTower) {
    if (!tower || this.state.gameOver) return { ok: false, reason: 'invalid_state' };
    const refund = Math.floor(tower.invested * 0.7);
    this.state.gold += refund;
    delete this.gridTowers[`${tower.c},${tower.r}`];
    this.state.towers = this.state.towers.filter((item) => item.id !== tower.id);
    if (this.state.selectedTower === tower) {
      this.state.selectedTower = null;
    }
    this.spawnParticles(tower.x, tower.y, '#94a3b8', 10, 60);
    this.addFloatingText(tower.x, tower.y - 12, `+${refund} 金币`, '#fcd34d', 12);
    this._emit('sfx', { name: 'sell' });
    this._emit('stateChanged');
    return { ok: true, refund };
  }

  startNextWave(isEarlyBonus = false) {
    if (this.state.gameOver) return false;
    if (this.state.waveInProgress && this.state.spawnQueue.length > 0) return false;
    if (this.state.paused) this.state.paused = false;

    if (isEarlyBonus && this.state.waveInProgress) {
      this.state.gold += 15;
      this.addFloatingText(LOGICAL_W / 2, 46, '+15 提前出兵奖励', '#fcd34d', 14);
    }

    this.state.wave += 1;
    this.state.waveInProgress = true;
    this.state.autoWaveDelay = 0;
    const cfg = buildWaveConfig(this.state.wave);
    let pathToggle = 0;

    cfg.groups.forEach((group) => {
      for (let i = 0; i < group.count; i++) {
        this.state.spawnQueue.push({
          type: group.type,
          hpScale: cfg.hpScale,
          delay: group.interval,
          pathIdx: pathToggle % this.pixelPaths.length
        });
        pathToggle++;
      }
    });
    this.state.spawnTimer = 0.05;
    this._emit('sfx', { name: 'wave' });
    this._emit('toast', { message: `第 ${this.state.wave} 波来袭！` });
    this._emit('stateChanged');
    return true;
  }

  enterEndlessMode() {
    this.state.endless = true;
    this.state.paused = false;
    this._emit('toast', { message: '已进入无尽模式！敌人强度将持续提升' });
    this._emit('stateChanged');
  }

  spawnEnemy(typeKey, hpScale = 1, pathIdx = 0, startSegment = 0, startPos = null) {
    const def = ENEMY_TYPES[typeKey];
    const path = this.pixelPaths[pathIdx];
    const maxHp = Math.round(def.hp * hpScale);
    const pos = startPos ? { x: startPos.x, y: startPos.y } : { x: path[0].x, y: path[0].y };
    const enemy = {
      id: this.nextEnemyId++,
      type: typeKey,
      x: pos.x,
      y: pos.y,
      pathIdx,
      segIdx: startSegment,
      distTraveled: startSegment * TILE,
      hp: maxHp,
      maxHp,
      speed: def.speed,
      armor: def.armor,
      reward: def.reward,
      radius: def.radius,
      color: def.color,
      damage: def.damage,
      splits: !!def.splits,
      heals: !!def.heals,
      isBoss: !!def.isBoss,
      hpScale,
      slowFactor: 1,
      slowTimer: 0,
      hitFlash: 0,
      healCooldown: 2.2
    };
    this.state.enemies.push(enemy);
    return enemy;
  }

  selectTarget(tower, range) {
    let best = null;
    for (let i = 0; i < this.state.enemies.length; i++) {
      const e = this.state.enemies[i];
      if (e.hp <= 0) continue;
      const dist = Math.hypot(e.x - tower.x, e.y - tower.y);
      if (dist > range) continue;
      if (!best) {
        best = e;
        continue;
      }

      if (tower.targetMode === 'first') {
        if (e.distTraveled > best.distTraveled) best = e;
      } else if (tower.targetMode === 'strong') {
        if (e.hp > best.hp) best = e;
      } else if (tower.targetMode === 'weak') {
        if (e.hp < best.hp) best = e;
      } else if (tower.targetMode === 'close') {
        const dBest = Math.hypot(best.x - tower.x, best.y - tower.y);
        if (dist < dBest) best = e;
      }
    }
    return best;
  }

  damageEnemy(enemy, rawDmg, armorPierce, sourceTower) {
    if (!enemy || enemy.hp <= 0) return 0;
    const effArmor = armorPierce ? 0 : enemy.armor;
    const dmg = Math.max(1, rawDmg * (1 - effArmor));
    enemy.hp -= dmg;
    enemy.hitFlash = 0.09;

    if (enemy.hp <= 0) {
      enemy.hp = 0;
      this.state.gold += enemy.reward;
      this.state.score += enemy.reward * 10;
      this.state.kills += 1;
      if (sourceTower) sourceTower.kills += 1;
      this.spawnParticles(enemy.x, enemy.y, enemy.color, enemy.isBoss ? 28 : 10, enemy.isBoss ? 140 : 85);
      this.addFloatingText(enemy.x, enemy.y - 10, `+${enemy.reward}`, '#fcd34d', 11);

      if (enemy.splits) {
        for (let k = -1; k <= 1; k += 2) {
          this.spawnEnemy('mini', enemy.hpScale, enemy.pathIdx, enemy.segIdx, {
            x: enemy.x + k * 8,
            y: enemy.y + k * 6
          });
        }
      }
      if (this.state.selectedTower === sourceTower) {
        this._emit('inspectorRefresh');
      }
    }
    return dmg;
  }

  spawnParticles(x, y, color, count, speedMax) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 25 + Math.random() * speedMax;
      this.state.particles.push({
        x,
        y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd,
        life: 0.25 + Math.random() * 0.35,
        maxLife: 0.6,
        size: 2 + Math.random() * 2.5,
        color
      });
    }
  }

  addFloatingText(x, y, text, color, size = 12) {
    this.state.floatingTexts.push({ x, y, text, color, size, life: 0.85, maxLife: 0.85 });
  }

  step(dt) {
    if (this.state.paused || this.state.gameOver) return;
    const s = this.state;
    s.time += dt;
    if (s.shakeTime > 0) s.shakeTime = Math.max(0, s.shakeTime - dt);

    // 1. Enemy spawning
    if (s.spawnQueue.length > 0) {
      s.spawnTimer -= dt;
      if (s.spawnTimer <= 0) {
        const next = s.spawnQueue.shift();
        this.spawnEnemy(next.type, next.hpScale, next.pathIdx);
        s.spawnTimer = s.spawnQueue.length > 0 ? s.spawnQueue[0].delay : 0;
      }
    }

    // 2. Enemy movement, healer aura, and base leak
    for (let i = s.enemies.length - 1; i >= 0; i--) {
      const e = s.enemies[i];
      if (e.hp <= 0) {
        s.enemies.splice(i, 1);
        continue;
      }

      if (e.hitFlash > 0) e.hitFlash -= dt;
      if (e.slowTimer > 0) {
        e.slowTimer -= dt;
        if (e.slowTimer <= 0) e.slowFactor = 1;
      }

      if (e.heals) {
        e.healCooldown -= dt;
        if (e.healCooldown <= 0) {
          e.healCooldown = 2.6;
          s.enemies.forEach((ally) => {
            if (ally.hp > 0 && ally.hp < ally.maxHp && Math.hypot(ally.x - e.x, ally.y - e.y) <= 85) {
              ally.hp = Math.min(ally.maxHp, ally.hp + ally.maxHp * 0.14);
            }
          });
          s.beams.push({ type: 'ring', x: e.x, y: e.y, r: 85, color: '#4ade80', life: 0.35, maxLife: 0.35 });
        }
      }

      const path = this.pixelPaths[e.pathIdx];
      const targetPt = path[e.segIdx + 1];
      if (!targetPt) {
        s.lives -= e.damage;
        s.shakeTime = 0.25;
        this._emit('sfx', { name: 'hitBase' });
        this.addFloatingText(e.x - 16, e.y - 12, `-${e.damage}❤`, '#fb7185', 14);
        s.enemies.splice(i, 1);
        if (s.lives <= 0) {
          s.lives = 0;
          s.gameOver = true;
          this._emit('sfx', { name: 'defeat' });
          this._emit('end', { victory: false, wave: s.wave, kills: s.kills, score: s.score });
          return;
        }
        continue;
      }

      const dx = targetPt.x - e.x;
      const dy = targetPt.y - e.y;
      const dist = Math.hypot(dx, dy);
      const stepDist = e.speed * e.slowFactor * dt;

      if (dist <= stepDist) {
        e.x = targetPt.x;
        e.y = targetPt.y;
        e.segIdx += 1;
        e.distTraveled += dist;
      } else {
        e.x += (dx / dist) * stepDist;
        e.y += (dy / dist) * stepDist;
        e.distTraveled += stepDist;
      }
    }

    // 3. Towers targeting & firing
    s.towers.forEach((t) => {
      const def = TOWER_MAP[t.type];
      const lvl = def.levels[t.level];
      if (t.recoil > 0) t.recoil = Math.max(0, t.recoil - dt * 5);

      if (t.type === 'laser') {
        const target = this.selectTarget(t, lvl.range);
        if (target) {
          t.angle = Math.atan2(target.y - t.y, target.x - t.x);
          if (t.laserTargetId === target.id) {
            t.laserLockTime = Math.min(3.0, t.laserLockTime + dt);
          } else {
            t.laserTargetId = target.id;
            t.laserLockTime = 0;
          }
          const ramp = 1 + (t.laserLockTime / 3.0) * 0.5;
          this.damageEnemy(target, lvl.damage * ramp * dt, true, t);
          s.beams.push({
            type: 'laser',
            x1: t.x + Math.cos(t.angle) * 14,
            y1: t.y + Math.sin(t.angle) * 14,
            x2: target.x,
            y2: target.y,
            color: def.color,
            width: 2 + t.level * 1.1 + (ramp - 1) * 3,
            life: 0.05,
            maxLife: 0.05
          });
          if (Math.random() < 0.25) this._emit('sfx', { name: 'laser' });
        } else {
          t.laserTargetId = null;
          t.laserLockTime = 0;
        }
        return;
      }

      t.cooldown -= dt;
      if (t.cooldown > 0) return;

      const target = this.selectTarget(t, lvl.range);
      if (!target) return;

      t.angle = Math.atan2(target.y - t.y, target.x - t.x);
      t.cooldown = 1 / lvl.fireRate;
      t.recoil = 1;

      if (t.type === 'tesla') {
        this._emit('sfx', { name: 'tesla' });
        const hitIds = new Set([target.id]);
        const points = [{ x: t.x, y: t.y }, { x: target.x, y: target.y }];
        this.damageEnemy(target, lvl.damage, true, t);
        let curr = target;

        for (let c = 1; c < lvl.chains; c++) {
          let nextE = null;
          let bestD = lvl.chainRange;
          for (let j = 0; j < s.enemies.length; j++) {
            const cand = s.enemies[j];
            if (cand.hp <= 0 || hitIds.has(cand.id)) continue;
            const d = Math.hypot(cand.x - curr.x, cand.y - curr.y);
            if (d <= bestD) {
              bestD = d;
              nextE = cand;
            }
          }
          if (!nextE) break;
          hitIds.add(nextE.id);
          points.push({ x: nextE.x, y: nextE.y });
          this.damageEnemy(nextE, lvl.damage * Math.pow(0.85, c), true, t);
          curr = nextE;
        }
        s.beams.push({ type: 'lightning', points, color: '#c084fc', life: 0.16, maxLife: 0.16 });
      } else {
        this._emit('sfx', { name: t.type });
        const speedMap = { gatling: 540, frost: 390, cannon: 330 };
        s.projectiles.push({
          type: t.type,
          x: t.x + Math.cos(t.angle) * 16,
          y: t.y + Math.sin(t.angle) * 16,
          tx: target.x,
          ty: target.y,
          targetId: target.id,
          speed: speedMap[t.type],
          damage: lvl.damage,
          splash: lvl.splash || 0,
          slowFactor: lvl.slowFactor || 1,
          slowDur: lvl.slowDur || 0,
          color: def.color,
          sourceTower: t
        });
      }
    });

    // 4. Projectiles movement & impact
    for (let i = s.projectiles.length - 1; i >= 0; i--) {
      const p = s.projectiles[i];
      const liveTarget = s.enemies.find((e) => e.id === p.targetId && e.hp > 0);
      if (liveTarget) {
        p.tx = liveTarget.x;
        p.ty = liveTarget.y;
      }
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const dist = Math.hypot(dx, dy);
      const moveStep = p.speed * dt;

      if (dist <= moveStep + 6) {
        if (p.splash > 0) {
          s.enemies.forEach((e) => {
            if (e.hp > 0 && Math.hypot(e.x - p.tx, e.y - p.ty) <= p.splash) {
              this.damageEnemy(e, p.damage, false, p.sourceTower);
              if (p.slowFactor < 1) {
                e.slowFactor = Math.min(e.slowFactor, p.slowFactor);
                e.slowTimer = Math.max(e.slowTimer, p.slowDur);
              }
            }
          });
          s.beams.push({
            type: 'ring',
            x: p.tx,
            y: p.ty,
            r: p.splash,
            color: p.type === 'frost' ? '#22d3ee' : '#fb923c',
            life: 0.24,
            maxLife: 0.24
          });
          this.spawnParticles(p.tx, p.ty, p.color, p.type === 'cannon' ? 14 : 8, 95);
        } else if (liveTarget) {
          this.damageEnemy(liveTarget, p.damage, false, p.sourceTower);
          this.spawnParticles(p.tx, p.ty, p.color, 4, 55);
        }
        s.projectiles.splice(i, 1);
      } else {
        p.x += (dx / dist) * moveStep;
        p.y += (dy / dist) * moveStep;
      }
    }

    // 5. Visual transient lifetimes
    for (let i = s.beams.length - 1; i >= 0; i--) {
      s.beams[i].life -= dt;
      if (s.beams[i].life <= 0) s.beams.splice(i, 1);
    }
    for (let i = s.particles.length - 1; i >= 0; i--) {
      const pt = s.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.94;
      pt.vy *= 0.94;
      pt.life -= dt;
      if (pt.life <= 0) s.particles.splice(i, 1);
    }
    for (let i = s.floatingTexts.length - 1; i >= 0; i--) {
      const ft = s.floatingTexts[i];
      ft.y -= 24 * dt;
      ft.life -= dt;
      if (ft.life <= 0) s.floatingTexts.splice(i, 1);
    }

    // 6. Wave completion & victory / auto-wave
    if (s.waveInProgress && s.spawnQueue.length === 0 && s.enemies.length === 0) {
      s.waveInProgress = false;
      const clearBonus = 20 + s.wave * 3;
      s.gold += clearBonus;
      s.score += s.wave * 100;
      this.addFloatingText(LOGICAL_W / 2, 54, `第 ${s.wave} 波清空！+${clearBonus} 金币`, '#34d399', 15);
      this._emit('waveCleared', { wave: s.wave, bonus: clearBonus });

      if (!s.endless && !s.victoryShown && s.wave >= MAX_STANDARD_WAVES) {
        s.victoryShown = true;
        s.paused = true;
        this._emit('sfx', { name: 'victory' });
        this._emit('end', { victory: true, wave: s.wave, kills: s.kills, score: s.score });
        return;
      }
      if (s.autoWave) {
        s.autoWaveDelay = 1.6;
      }
      this._emit('stateChanged');
    } else if (!s.waveInProgress && s.autoWave && s.wave > 0 && !s.gameOver) {
      s.autoWaveDelay -= dt;
      if (s.autoWaveDelay <= 0) {
        this.startNextWave(false);
      }
    }
  }
}
