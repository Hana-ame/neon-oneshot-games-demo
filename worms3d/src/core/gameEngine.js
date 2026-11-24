/**
 * 百战天虫 3D - 回合制核心游戏状态机 (GameEngine)
 * 与渲染层完全解耦，可在浏览器与 Node.js 测试环境中直接运行。
 */

import { WORLD_CONFIG, WEAPONS, TEAM_PRESETS, TURN_PHASE } from './constants.js';
import { Terrain3D, createRNG } from './terrain.js';
import {
  aimToDirection,
  stepProjectile,
  castHitscanRay,
  applyExplosionToWorms,
  stepWormPhysics,
} from './physics.js';

export class GameEngine {
  constructor(options = {}) {
    this.listeners = new Map();
    this.nextProjId = 1;
    this.nextCrateId = 1;
    this.initMatch(options);
  }

  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(handler);
    return () => this.listeners.get(event)?.delete(handler);
  }

  emit(event, payload) {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of set) fn(payload);
  }

  /** 初始化或重置一场新比赛 */
  initMatch(options = {}) {
    this.mode = options.mode || 'ai'; // 'ai' (单人对战AI) | 'hotseat' (本地双人热座)
    this.wormsPerTeam = Math.max(1, Math.min(4, options.wormsPerTeam || 3));
    this.themeId = options.themeId || 'tropical';
    this.seed = options.seed !== undefined ? options.seed : Math.floor(Math.random() * 100000);
    this.rng = createRNG(this.seed + 2026);

    this.terrain = new Terrain3D({
      seed: this.seed,
      themeId: this.themeId,
    });

    this.waterLevel = WORLD_CONFIG.WATER_LEVEL;
    this.round = 1;
    this.turnNumber = 1;
    this.phase = TURN_PHASE.AIM;
    this.turnTimer = WORLD_CONFIG.TURN_DURATION;
    this.retreatTimer = 0;
    this.settleTimer = 0;
    this.chargePower = 0;
    this.chargeDir = 1;
    this.winnerTeamId = null; // null = 进行中, -1 = 平局, 0/1 = 获胜队伍

    this.projectiles = [];
    this.crates = [];
    this.killFeed = [];
    this.wind = { x: 0, z: 0 };

    // 初始化两支队伍与弹药库
    this.teams = TEAM_PRESETS.map((preset) => {
      const ammo = {};
      for (const [wid, w] of Object.entries(WEAPONS)) {
        ammo[wid] = w.ammo;
      }
      return {
        id: preset.id,
        name: preset.name,
        colorHex: preset.colorHex,
        colorNum: preset.colorNum,
        isAI: this.mode === 'ai' && preset.id === 1,
        ammo,
        wormCursor: 0,
      };
    });

    // 生成虫子并分配出生点
    const spawnPoints = this.terrain.findSpawnPoints(this.wormsPerTeam * 2, this.waterLevel, this.seed + 55);
    this.worms = [];
    let spIdx = 0;
    for (let t = 0; t < 2; t++) {
      for (let i = 0; i < this.wormsPerTeam; i++) {
        const sp = spawnPoints[spIdx++];
        // 初始朝向岛屿中心
        const yawToCenter = Math.atan2(-sp.x, -sp.z);
        this.worms.push({
          id: `t${t}_w${i}`,
          teamId: t,
          name: TEAM_PRESETS[t].names[i % TEAM_PRESETS[t].names.length],
          x: sp.x,
          y: sp.y,
          z: sp.z,
          vx: 0,
          vy: 0,
          vz: 0,
          yaw: yawToCenter,
          pitch: 0.35,
          hp: WORLD_CONFIG.WORM_MAX_HP,
          maxHp: WORLD_CONFIG.WORM_MAX_HP,
          alive: true,
          grounded: true,
          walkCycle: 0,
        });
      }
    }

    this.activeTeamId = 0;
    this.activeWormId = this.worms[0].id;
    this.selectedWeaponId = 'bazooka';
    this.rollWind();

    this.emit('match_reset', {
      themeId: this.themeId,
      mode: this.mode,
      seed: this.seed,
    });
    this.emit('turn_change', this.getTurnSnapshot());
  }

  getActiveWorm() {
    return this.worms.find((w) => w.id === this.activeWormId) || null;
  }

  getActiveTeam() {
    return this.teams[this.activeTeamId];
  }

  getTeamWorms(teamId, onlyAlive = false) {
    return this.worms.filter((w) => w.teamId === teamId && (!onlyAlive || w.alive));
  }

  getTeamTotalHp(teamId) {
    return this.worms
      .filter((w) => w.teamId === teamId && w.alive)
      .reduce((sum, w) => sum + w.hp, 0);
  }

  getTurnSnapshot() {
    const worm = this.getActiveWorm();
    const team = this.getActiveTeam();
    return {
      round: this.round,
      turnNumber: this.turnNumber,
      teamId: this.activeTeamId,
      teamName: team.name,
      isAI: team.isAI,
      wormId: worm ? worm.id : null,
      wormName: worm ? worm.name : '',
      wind: { ...this.wind },
      waterLevel: this.waterLevel,
    };
  }

  rollWind() {
    const angle = this.rng() * Math.PI * 2;
    const mag = this.rng() * WORLD_CONFIG.WIND_MAX;
    this.wind = {
      x: Math.cos(angle) * mag,
      z: Math.sin(angle) * mag,
    };
  }

  selectWeapon(weaponId) {
    if (this.phase !== TURN_PHASE.AIM) return false;
    const weapon = WEAPONS[weaponId];
    if (!weapon) return false;
    const team = this.getActiveTeam();
    if (team.ammo[weaponId] <= 0) return false;
    this.selectedWeaponId = weaponId;
    this.emit('weapon_change', { weaponId });
    return true;
  }

  /** 控制当前虫子移动与转向 */
  moveActiveWorm(forwardInput, turnInput, pitchInput, dt) {
    if (this.phase !== TURN_PHASE.AIM && this.phase !== TURN_PHASE.RETREAT) return;
    const worm = this.getActiveWorm();
    if (!worm || !worm.alive) return;

    if (turnInput !== 0) {
      worm.yaw += turnInput * 2.1 * dt;
    }
    if (pitchInput !== 0) {
      worm.pitch = Math.max(-0.55, Math.min(1.25, worm.pitch + pitchInput * 1.45 * dt));
    }

    if (forwardInput !== 0 && worm.grounded) {
      const stepDist = forwardInput * WORLD_CONFIG.WORM_MOVE_SPEED * dt;
      const nx = worm.x + Math.sin(worm.yaw) * stepDist;
      const nz = worm.z + Math.cos(worm.yaw) * stepDist;

      if (this.terrain.isInsideWorld(nx, nz)) {
        const curH = this.terrain.getHeightAt(worm.x, worm.z);
        const nextH = this.terrain.getHeightAt(nx, nz);
        const slope = (nextH - curH) / Math.max(0.05, Math.abs(stepDist));

        if (slope <= WORLD_CONFIG.MAX_SLOPE && nextH > this.waterLevel + 0.05) {
          worm.x = nx;
          worm.z = nz;
          worm.y = nextH;
          worm.walkCycle += Math.abs(stepDist) * 3.5;
          this.checkCratePickup(worm);
        }
      }
    }
  }

  /** 当前虫子向前跳跃 */
  jumpActiveWorm() {
    if (this.phase !== TURN_PHASE.AIM && this.phase !== TURN_PHASE.RETREAT) return false;
    const worm = this.getActiveWorm();
    if (!worm || !worm.alive || !worm.grounded) return false;

    worm.vy = WORLD_CONFIG.WORM_JUMP_VY;
    worm.vx = Math.sin(worm.yaw) * WORLD_CONFIG.WORM_JUMP_VH;
    worm.vz = Math.cos(worm.yaw) * WORLD_CONFIG.WORM_JUMP_VH;
    worm.grounded = false;
    this.emit('jump', { wormId: worm.id, x: worm.x, y: worm.y, z: worm.z });
    return true;
  }

  /** 开始蓄力或立即开火（非蓄力武器） */
  startCharge() {
    if (this.phase !== TURN_PHASE.AIM) return false;
    const weapon = WEAPONS[this.selectedWeaponId];
    const team = this.getActiveTeam();
    if (!weapon || team.ammo[weapon.id] <= 0) return false;

    if (!weapon.chargeable) {
      return this.fireWeapon(1.0);
    }

    this.phase = TURN_PHASE.CHARGING;
    this.chargePower = 0.05;
    this.chargeDir = 1;
    return true;
  }

  /** 松开蓄力并发射 */
  releaseCharge() {
    if (this.phase !== TURN_PHASE.CHARGING) return false;
    const power = Math.max(0.08, Math.min(1.0, this.chargePower));
    this.chargePower = 0;
    return this.fireWeapon(power);
  }

  /** 使用指定力度 (0~1) 发射当前选中武器 */
  fireWeapon(power = 0.7) {
    if (this.phase !== TURN_PHASE.AIM && this.phase !== TURN_PHASE.CHARGING) return false;
    const worm = this.getActiveWorm();
    const team = this.getActiveTeam();
    const weapon = WEAPONS[this.selectedWeaponId];
    if (!worm || !worm.alive || !weapon) return false;
    if (team.ammo[weapon.id] <= 0) return false;

    // 消耗弹药
    if (Number.isFinite(team.ammo[weapon.id])) {
      team.ammo[weapon.id] = Math.max(0, team.ammo[weapon.id] - 1);
    }

    const dir = aimToDirection(worm.yaw, worm.pitch);
    const muzzle = {
      x: worm.x + dir.x * 1.15,
      y: worm.y + WORLD_CONFIG.WORM_HEIGHT * 0.68 + dir.y * 0.8,
      z: worm.z + dir.z * 1.15,
    };

    this.emit('fire', {
      weaponId: weapon.id,
      wormId: worm.id,
      origin: muzzle,
      dir,
      power,
    });

    if (weapon.type === 'projectile' || weapon.type === 'cluster') {
      const speed = weapon.minSpeed + (weapon.maxSpeed - weapon.minSpeed) * power;
      this.projectiles.push({
        id: this.nextProjId++,
        weaponId: weapon.id,
        ownerId: worm.id,
        x: muzzle.x,
        y: muzzle.y,
        z: muzzle.z,
        vx: dir.x * speed,
        vy: dir.y * speed,
        vz: dir.z * speed,
        radius: weapon.projectileRadius,
        windFactor: weapon.windFactor,
        bounces: weapon.bounces,
        restitution: weapon.restitution || 0.5,
        bounceCount: 0,
        fuseTime: weapon.fuseTime,
        age: 0,
        blastRadius: weapon.blastRadius,
        craterDepth: weapon.craterDepth,
        maxDamage: weapon.maxDamage,
        knockback: weapon.knockback,
        isCluster: weapon.type === 'cluster',
        color: weapon.color,
        alive: true,
      });
      this.phase = TURN_PHASE.PROJECTILE;
    } else if (weapon.type === 'hitscan') {
      const hit = castHitscanRay(muzzle, dir, weapon.range, this.terrain, this.worms, worm.id);
      this.emit('shotgun_tracer', { from: muzzle, to: { x: hit.x, y: hit.y, z: hit.z }, hit: hit.hit });
      if (hit.hit) {
        this.detonateAt(hit.x, hit.y, hit.z, weapon.blastRadius, weapon.craterDepth, weapon.maxDamage, weapon.knockback, weapon.id);
      }
      this.phase = TURN_PHASE.SETTLE;
      this.settleTimer = 1.2;
    } else if (weapon.type === 'airstrike') {
      // 沿虫子水平瞄准方向投下 5 枚高空导弹
      const targetDist = weapon.minRange + (weapon.maxRange - weapon.minRange) * power;
      const fwdX = Math.sin(worm.yaw);
      const fwdZ = Math.cos(worm.yaw);
      const cx = worm.x + fwdX * targetDist;
      const cz = worm.z + fwdZ * targetDist;

      for (let i = 0; i < weapon.missileCount; i++) {
        const offset = (i - (weapon.missileCount - 1) / 2) * weapon.missileSpread;
        this.projectiles.push({
          id: this.nextProjId++,
          weaponId: weapon.id,
          ownerId: worm.id,
          x: cx + fwdX * offset - fwdX * 8,
          y: 34 + i * 3.5,
          z: cz + fwdZ * offset - fwdZ * 8,
          vx: fwdX * 6.5,
          vy: -14.0,
          vz: fwdZ * 6.5,
          radius: 0.35,
          windFactor: weapon.windFactor,
          bounces: 0,
          bounceCount: 0,
          fuseTime: 0,
          age: 0,
          blastRadius: weapon.blastRadius,
          craterDepth: weapon.craterDepth,
          maxDamage: weapon.maxDamage,
          knockback: weapon.knockback,
          isCluster: false,
          color: weapon.color,
          alive: true,
        });
      }
      this.phase = TURN_PHASE.PROJECTILE;
    } else if (weapon.type === 'melee') {
      const hitWorms = [];
      for (const target of this.worms) {
        if (!target.alive || target.id === worm.id) continue;
        const dist = Math.hypot(target.x - worm.x, target.y - worm.y, target.z - worm.z);
        if (dist <= weapon.meleeRange) {
          const knockX = Math.sin(worm.yaw);
          const knockZ = Math.cos(worm.yaw);
          target.vx += knockX * weapon.knockback;
          target.vz += knockZ * weapon.knockback;
          target.vy += 12.5;
          target.grounded = false;
          target.hp = Math.max(0, target.hp - weapon.maxDamage);
          if (target.hp <= 0) target.alive = false;
          hitWorms.push({ wormId: target.id, damage: weapon.maxDamage, killed: !target.alive });
        }
      }
      this.emit('melee_hit', { wormId: worm.id, hits: hitWorms, x: muzzle.x, y: muzzle.y, z: muzzle.z });
      this.phase = TURN_PHASE.SETTLE;
      this.settleTimer = 1.6;
    }

    // 若当前武器弹药耗尽，自动切回无限火箭筒
    if (team.ammo[weapon.id] <= 0) {
      this.selectedWeaponId = 'bazooka';
    }
    return true;
  }

  /** 执行三维爆炸：地形挖掘 + 虫子伤害与击退 + 集束分裂 */
  detonateAt(x, y, z, blastRadius, craterDepth, maxDamage, knockback, weaponId = 'bazooka', isCluster = false, ownerId = null) {
    const modified = this.terrain.carveCrater(x, y, z, blastRadius, craterDepth);
    // 地形被炸毁后，检查所有虫子脚下是否悬空，使其自然跌入弹坑或落海
    for (const w of this.worms) {
      if (w.alive && w.y > this.terrain.getHeightAt(w.x, w.z) + 0.05) {
        w.grounded = false;
      }
    }
    const impacts = applyExplosionToWorms(x, y, z, blastRadius, maxDamage, knockback, this.worms);

    for (const imp of impacts) {
      if (imp.killed) {
        const dead = this.worms.find((w) => w.id === imp.wormId);
        if (dead) this.pushKillFeed(`${dead.name} 被炸飞淘汰！`);
      }
    }

    this.emit('explosion', {
      x,
      y,
      z,
      radius: blastRadius,
      weaponId,
      modifiedVertices: modified,
      impacts,
    });

    // 集束炸弹分裂出子炸弹
    if (isCluster) {
      const cw = WEAPONS.cluster;
      for (let i = 0; i < cw.clusterCount; i++) {
        const ang = (i / cw.clusterCount) * Math.PI * 2 + this.rng() * 0.5;
        const spd = 6.5 + this.rng() * 4.5;
        this.projectiles.push({
          id: this.nextProjId++,
          weaponId: 'cluster_sub',
          ownerId,
          x,
          y: y + 0.8,
          z,
          vx: Math.cos(ang) * spd,
          vy: 9.5 + this.rng() * 4.5,
          vz: Math.sin(ang) * spd,
          radius: 0.24,
          windFactor: 0.2,
          bounces: 0,
          bounceCount: 0,
          fuseTime: 0,
          age: 0,
          blastRadius: cw.subBlastRadius,
          craterDepth: cw.subCraterDepth,
          maxDamage: cw.subMaxDamage,
          knockback: 11,
          isCluster: false,
          color: 0xfacc15,
          alive: true,
        });
      }
    }

    return impacts;
  }

  /** 定期空投补给箱 */
  spawnSupplyCrate() {
    if (this.crates.length >= 3) return null;
    const pts = this.terrain.findSpawnPoints(1, this.waterLevel + 1.0, Math.floor(this.rng() * 100000));
    const p = pts[0];
    const kind = this.rng() < 0.55 ? 'health' : 'weapon';
    const crate = {
      id: this.nextCrateId++,
      kind, // 'health' (+25 HP) | 'weapon' (+1 集束炸弹 & 空袭)
      x: p.x,
      y: p.y + 18,
      z: p.z,
      grounded: false,
      collected: false,
    };
    this.crates.push(crate);
    this.emit('crate_spawn', crate);
    return crate;
  }

  checkCratePickup(worm) {
    if (!worm || !worm.alive) return;
    for (const crate of this.crates) {
      if (crate.collected) continue;
      const dist = Math.hypot(worm.x - crate.x, worm.y - crate.y, worm.z - crate.z);
      if (dist <= 2.2) {
        crate.collected = true;
        const team = this.teams[worm.teamId];
        let msg = '';
        if (crate.kind === 'health') {
          worm.hp = Math.min(worm.maxHp, worm.hp + 25);
          msg = `${worm.name} 拾取医疗箱 (+25 HP)`;
        } else {
          team.ammo.cluster += 1;
          team.ammo.airstrike += 1;
          msg = `${worm.name} 拾取军火箱 (+1 集束炸弹 / +1 空袭)`;
        }
        this.pushKillFeed(msg);
        this.emit('crate_pickup', { crate, wormId: worm.id, message: msg });
      }
    }
    this.crates = this.crates.filter((c) => !c.collected);
  }

  pushKillFeed(message) {
    this.killFeed.unshift({ time: Date.now(), message });
    if (this.killFeed.length > 6) this.killFeed.pop();
    this.emit('feed', { message });
  }

  /** 检查胜负条件 */
  checkVictory() {
    const alive0 = this.getTeamWorms(0, true).length;
    const alive1 = this.getTeamWorms(1, true).length;
    if (alive0 === 0 && alive1 === 0) {
      this.winnerTeamId = -1;
      this.phase = TURN_PHASE.GAME_OVER;
      this.emit('game_over', { winnerTeamId: -1, label: '平局！全员阵亡' });
      return true;
    }
    if (alive0 === 0) {
      this.winnerTeamId = 1;
      this.phase = TURN_PHASE.GAME_OVER;
      this.emit('game_over', { winnerTeamId: 1, label: `${this.teams[1].name} 获胜！` });
      return true;
    }
    if (alive1 === 0) {
      this.winnerTeamId = 0;
      this.phase = TURN_PHASE.GAME_OVER;
      this.emit('game_over', { winnerTeamId: 0, label: `${this.teams[0].name} 获胜！` });
      return true;
    }
    return false;
  }

  /** 切换至下一回合 */
  nextTurn() {
    if (this.checkVictory()) return;

    this.turnNumber++;
    this.activeTeamId = 1 - this.activeTeamId;

    // 每完成双人各一回合，轮次 +1
    if (this.activeTeamId === 0) {
      this.round++;
      // 突然死亡：第 8 轮后每轮海平面上升
      if (this.round >= WORLD_CONFIG.SUDDEN_DEATH_ROUND) {
        this.waterLevel += WORLD_CONFIG.WATER_RISE_STEP;
        this.pushKillFeed(`⚠️ 突然死亡！海平面上升至 ${this.waterLevel.toFixed(1)}m`);
        this.emit('sudden_death', { round: this.round, waterLevel: this.waterLevel });
      }
      // 每 2 轮空投一个补给箱
      if (this.round % 2 === 0) {
        this.spawnSupplyCrate();
      }
    }

    // 轮换当前队伍中下一条存活虫子
    const team = this.getActiveTeam();
    const aliveWorms = this.getTeamWorms(this.activeTeamId, true);
    if (aliveWorms.length === 0) {
      this.checkVictory();
      return;
    }

    team.wormCursor = (team.wormCursor + 1) % aliveWorms.length;
    this.activeWormId = aliveWorms[team.wormCursor].id;
    this.selectedWeaponId = 'bazooka';
    this.phase = TURN_PHASE.AIM;
    this.turnTimer = WORLD_CONFIG.TURN_DURATION;
    this.chargePower = 0;
    this.rollWind();

    this.emit('turn_change', this.getTurnSnapshot());
  }

  /** 主固定步长更新循环 (dt 单位: 秒) */
  update(dt) {
    if (this.phase === TURN_PHASE.GAME_OVER) return;
    const clampedDt = Math.min(0.05, Math.max(0.001, dt));

    // 1. 更新所有虫子物理（重力、跌落伤害、落水淹死）
    let anyWormMoving = false;
    for (const worm of this.worms) {
      if (!worm.alive) continue;
      const events = stepWormPhysics(worm, clampedDt, this.terrain, this.waterLevel);
      if (events && events.length > 0) {
        for (const ev of events) {
          if (ev.type === 'drown') {
            this.pushKillFeed(`🌊 ${worm.name} 掉入深海淹死了！`);
            this.emit('drown', ev);
          } else if (ev.type === 'fall_damage') {
            this.pushKillFeed(`💥 ${worm.name} 摔落受伤 -${ev.damage} HP`);
            this.emit('damage', ev);
          }
        }
      }
      if (!worm.grounded || Math.hypot(worm.vx, worm.vy, worm.vz) > 0.35) {
        anyWormMoving = true;
      }
      this.checkCratePickup(worm);
    }

    // 2. 更新空投补给箱下落
    for (const crate of this.crates) {
      if (crate.collected) continue;
      const gy = this.terrain.getHeightAt(crate.x, crate.z);
      if (crate.y > gy + 0.5) {
        crate.y = Math.max(gy + 0.5, crate.y - 4.2 * clampedDt);
      } else {
        crate.y = gy + 0.5;
        crate.grounded = true;
      }
      if (crate.y <= this.waterLevel) {
        crate.collected = true;
      }
    }
    this.crates = this.crates.filter((c) => !c.collected);

    // 3. 更新所有飞行弹丸
    if (this.projectiles.length > 0) {
      const toSpawn = [];
      for (const proj of this.projectiles) {
        if (!proj.alive) continue;
        const ev = stepProjectile(proj, clampedDt, this.terrain, this.worms, this.wind, this.waterLevel);
        if (!ev) continue;
        if (ev.type === 'explode') {
          toSpawn.push({ proj, ev });
        } else if (ev.type === 'splash') {
          this.emit('splash', ev);
        } else if (ev.type === 'bounce') {
          this.emit('bounce', ev);
        }
      }

      for (const { proj, ev } of toSpawn) {
        this.detonateAt(
          ev.x,
          ev.y,
          ev.z,
          proj.blastRadius,
          proj.craterDepth,
          proj.maxDamage,
          proj.knockback,
          proj.weaponId,
          proj.isCluster,
          proj.ownerId
        );
      }

      this.projectiles = this.projectiles.filter((p) => p.alive);
    }

    // 4. 回合状态机推进
    if (this.phase === TURN_PHASE.AIM) {
      const activeWorm = this.getActiveWorm();
      if (!activeWorm || !activeWorm.alive) {
        this.phase = TURN_PHASE.SETTLE;
        this.settleTimer = 1.0;
      } else {
        this.turnTimer -= clampedDt;
        if (this.turnTimer <= 0) {
          this.turnTimer = 0;
          this.pushKillFeed(`⏱️ ${activeWorm.name} 回合超时！`);
          this.nextTurn();
        }
      }
    } else if (this.phase === TURN_PHASE.CHARGING) {
      this.chargePower += this.chargeDir * 0.92 * clampedDt;
      if (this.chargePower >= 1.0) {
        this.chargePower = 1.0;
        this.releaseCharge();
      }
    } else if (this.phase === TURN_PHASE.PROJECTILE) {
      if (this.projectiles.length === 0) {
        this.phase = TURN_PHASE.SETTLE;
        this.settleTimer = 1.4;
      }
    } else if (this.phase === TURN_PHASE.SETTLE) {
      if (!anyWormMoving) {
        this.settleTimer -= clampedDt;
      } else {
        this.settleTimer = Math.max(this.settleTimer, 0.6);
      }

      if (this.settleTimer <= 0) {
        if (this.checkVictory()) return;
        const activeWorm = this.getActiveWorm();
        // 开火后若己方虫子仍存活且为人类操作，给予 3 秒撤离时间
        if (activeWorm && activeWorm.alive && !this.getActiveTeam().isAI) {
          this.phase = TURN_PHASE.RETREAT;
          this.retreatTimer = WORLD_CONFIG.RETREAT_DURATION;
        } else {
          this.nextTurn();
        }
      }
    } else if (this.phase === TURN_PHASE.RETREAT) {
      this.retreatTimer -= clampedDt;
      if (this.retreatTimer <= 0) {
        this.nextTurn();
      }
    }
  }
}
