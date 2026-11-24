/**
 * Crimson Night - 核心无头游戏引擎 (GameEngine)
 * 完全独立于浏览器 DOM，支持在 Canvas 渲染循环与 Node.js 测试环境中无缝运行
 */

import {
  GAME_CONSTANTS,
  CHARACTERS,
  WEAPONS,
  PASSIVES,
  ENEMY_TYPES,
  WAVES,
  BASE_WEAPON_IDS,
  PASSIVE_IDS,
} from './config.js';
import { clamp, distSq, dist, normalize, circleIntersects, SpatialHashGrid, createRNG } from './math.js';

export class GameEngine {
  constructor(options = {}) {
    this.rng = options.rng || (options.seed !== undefined ? createRNG(options.seed) : Math.random);
    this.onAudio = options.onAudio || (() => {});
    this.onStateChange = options.onStateChange || (() => {});
    this.grid = new SpatialHashGrid(GAME_CONSTANTS.SPATIAL_CELL_SIZE);
    this._queryBuf = [];
    this.nextEntityId = 1;
    this.viewportWidth = options.viewportWidth || 1280;
    this.viewportHeight = options.viewportHeight || 720;

    this.reset(options.characterId || 'hunter');
  }

  setViewport(width, height) {
    this.viewportWidth = Math.max(320, width || 1280);
    this.viewportHeight = Math.max(240, height || 720);
  }

  reset(characterId = 'hunter') {
    const charDef = CHARACTERS.find((c) => c.id === characterId) || CHARACTERS[0];
    this.character = charDef;
    this.status = 'menu'; // 'menu' | 'playing' | 'paused' | 'levelup' | 'chest' | 'victory' | 'gameover'
    this.endlessMode = false;
    this.time = 0;
    this.kills = 0;
    this.gold = 0;
    this.totalDamageDealt = 0;
    this.screenShake = 0;
    this.bannerMessage = null;

    this.player = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      facingX: 1,
      facingY: 0,
      radius: GAME_CONSTANTS.PLAYER_BASE_RADIUS,
      hp: charDef.stats.maxHp,
      maxHp: charDef.stats.maxHp,
      level: 1,
      xp: 0,
      xpToNext: this.calcXpRequired(1),
      invulnTimer: 0,
      hurtFlash: 0,
      walkCycle: 0,
      weapons: [],
      passives: [],
      computed: { ...charDef.stats, moveSpeedPct: 1.0 },
    };

    this.enemies = [];
    this.projectiles = [];
    this.slashes = [];
    this.lightnings = [];
    this.gems = [];
    this.pickups = [];
    this.torches = [];
    this.particles = [];
    this.floatingTexts = [];
    this.levelUpChoices = [];
    this.pendingChestReward = null;

    this.spawnTimer = 0.25;
    this.torchTimer = 4;
    this.nextEliteTime = 95;
    this.bossSpawned = false;
    this.bossDefeated = false;

    this.addWeapon(charDef.startWeapon);
    this.recomputeStats();
    this.player.hp = this.player.maxHp;

    // 开局在周边生成少量火把
    for (let i = 0; i < 4; i++) {
      this._spawnTorchAroundPlayer(260 + i * 70);
    }

    this._emitState('reset');
  }

  start(characterId) {
    if (characterId) {
      this.reset(characterId);
    } else if (this.status !== 'menu') {
      this.reset(this.character.id);
    }
    this.status = 'playing';
    this._emitState('start');
  }

  togglePause() {
    if (this.status === 'playing') {
      this.status = 'paused';
      this._emitState('pause');
    } else if (this.status === 'paused') {
      this.status = 'playing';
      this._emitState('resume');
    }
  }

  continueEndless() {
    if (this.status === 'victory') {
      this.endlessMode = true;
      this.status = 'playing';
      this.bannerMessage = { text: '无尽血夜已开启！怪物强度持续提升', timer: 3.5 };
      this._emitState('endless');
    }
  }

  calcXpRequired(level) {
    return Math.floor(8 + level * 6 + Math.pow(level, 1.32) * 2.2);
  }

  getWeapon(id) {
    return this.player.weapons.find((w) => w.id === id) || null;
  }

  getPassive(id) {
    return this.player.passives.find((p) => p.id === id) || null;
  }

  addWeapon(id) {
    const def = WEAPONS[id];
    if (!def) return false;
    const existing = this.getWeapon(id);
    if (existing) {
      const maxLv = def.evolved ? 1 : def.levels.length;
      if (existing.level < maxLv) {
        existing.level += 1;
        return true;
      }
      return false;
    }
    if (this.player.weapons.length >= GAME_CONSTANTS.MAX_WEAPONS) return false;
    this.player.weapons.push({
      id,
      level: 1,
      cooldownTimer: 0.15,
      orbitTimer: 0,
      orbitAngle: 0,
      orbitActive: def.type === 'orbit',
      orbitHitMap: new Map(),
      totalDamage: 0,
    });
    return true;
  }

  addPassive(id) {
    const def = PASSIVES[id];
    if (!def) return false;
    const maxLv = def.maxLevel || GAME_CONSTANTS.MAX_PASSIVE_LEVEL;
    const existing = this.getPassive(id);
    if (existing) {
      if (existing.level < maxLv) {
        existing.level += 1;
        this.recomputeStats();
        return true;
      }
      return false;
    }
    if (this.player.passives.length >= GAME_CONSTANTS.MAX_PASSIVES) return false;
    this.player.passives.push({ id, level: 1 });
    this.recomputeStats();
    return true;
  }

  recomputeStats() {
    const base = this.character.stats;
    const s = {
      maxHp: base.maxHp,
      moveSpeed: base.moveSpeed,
      moveSpeedPct: 1.0,
      might: base.might,
      cooldown: base.cooldown,
      area: base.area,
      armor: base.armor,
      recovery: base.recovery,
      magnet: base.magnet,
      amount: base.amount,
    };

    for (const p of this.player.passives) {
      const def = PASSIVES[p.id];
      if (!def) continue;
      if (def.stat === 'maxHp') s.maxHp += def.perLevel * p.level;
      else if (def.stat === 'cooldown') s.cooldown += def.perLevel * p.level;
      else if (def.stat === 'might') s.might += def.perLevel * p.level;
      else if (def.stat === 'area') s.area += def.perLevel * p.level;
      else if (def.stat === 'amount') s.amount += def.perLevel * p.level;
      else if (def.stat === 'recovery') s.recovery += def.perLevel * p.level;
      else if (def.stat === 'moveSpeedPct') s.moveSpeedPct += def.perLevel * p.level;
      else if (def.stat === 'magnet') s.magnet += def.perLevel * p.level;
    }

    s.cooldown = clamp(s.cooldown, 0.35, 1.5);
    const hpDiff = s.maxHp - this.player.maxHp;
    this.player.maxHp = Math.round(s.maxHp);
    if (hpDiff > 0) {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + hpDiff);
    } else {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp);
    }
    this.player.computed = s;
  }

  /**
   * 检查是否存在可触发的超武进化
   */
  getEvolvableWeapon() {
    for (const w of this.player.weapons) {
      const def = WEAPONS[w.id];
      if (!def || def.evolved || !def.evolvedId || !def.evolveWith) continue;
      if (w.level >= def.levels.length && this.getPassive(def.evolveWith)) {
        return { weaponEntry: w, baseDef: def, evolvedDef: WEAPONS[def.evolvedId] };
      }
    }
    return null;
  }

  evolveWeapon(baseWeaponId) {
    const idx = this.player.weapons.findIndex((w) => w.id === baseWeaponId);
    if (idx === -1) return null;
    const baseEntry = this.player.weapons[idx];
    const baseDef = WEAPONS[baseWeaponId];
    if (!baseDef || !baseDef.evolvedId) return null;
    const evolvedDef = WEAPONS[baseDef.evolvedId];
    if (!evolvedDef) return null;

    this.player.weapons[idx] = {
      id: evolvedDef.id,
      level: 1,
      cooldownTimer: 0.05,
      orbitTimer: 0,
      orbitAngle: baseEntry.orbitAngle || 0,
      orbitActive: evolvedDef.type === 'orbit',
      orbitHitMap: new Map(),
      totalDamage: baseEntry.totalDamage,
    };
    return evolvedDef;
  }

  /**
   * 生成升级三选一候选列表
   */
  generateUpgradeChoices(count = 3) {
    const pool = [];

    // 武器选项
    for (const id of BASE_WEAPON_IDS) {
      const def = WEAPONS[id];
      const hasEvolved = this.getWeapon(def.evolvedId);
      if (hasEvolved) continue;
      const owned = this.getWeapon(id);
      if (owned) {
        if (owned.level < def.levels.length) {
          const nextLv = owned.level + 1;
          pool.push({
            kind: 'weapon',
            id,
            name: def.name,
            icon: def.icon,
            isNew: false,
            nextLevel: nextLv,
            desc: def.levels[nextLv - 1].desc,
            tag: `Lv.${owned.level} → Lv.${nextLv}`,
          });
        }
      } else if (this.player.weapons.length < GAME_CONSTANTS.MAX_WEAPONS) {
        pool.push({
          kind: 'weapon',
          id,
          name: def.name,
          icon: def.icon,
          isNew: true,
          nextLevel: 1,
          desc: def.desc,
          tag: '新武器',
        });
      }
    }

    // 被动选项
    for (const id of PASSIVE_IDS) {
      const def = PASSIVES[id];
      const maxLv = def.maxLevel || GAME_CONSTANTS.MAX_PASSIVE_LEVEL;
      const owned = this.getPassive(id);
      if (owned) {
        if (owned.level < maxLv) {
          pool.push({
            kind: 'passive',
            id,
            name: def.name,
            icon: def.icon,
            isNew: false,
            nextLevel: owned.level + 1,
            desc: def.desc,
            tag: `Lv.${owned.level} → Lv.${owned.level + 1}`,
          });
        }
      } else if (this.player.passives.length < GAME_CONSTANTS.MAX_PASSIVES) {
        pool.push({
          kind: 'passive',
          id,
          name: def.name,
          icon: def.icon,
          isNew: true,
          nextLevel: 1,
          desc: def.desc,
          tag: '新被动',
        });
      }
    }

    // 洗牌抽取
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    const chosen = pool.slice(0, count);
    if (chosen.length === 0) {
      chosen.push(
        {
          kind: 'bonus',
          id: 'heal_chicken',
          name: '炙烤血肉',
          icon: '🍗',
          isNew: false,
          nextLevel: 1,
          desc: '立即恢复 40 点生命值',
          tag: '补给',
        },
        {
          kind: 'bonus',
          id: 'gold_bag',
          name: '金币钱袋',
          icon: '💰',
          isNew: false,
          nextLevel: 1,
          desc: '获得 50 枚金币',
          tag: '财富',
        }
      );
    }
    return chosen;
  }

  selectUpgrade(index) {
    if (this.status !== 'levelup') return false;
    const choice = this.levelUpChoices[index];
    if (!choice) return false;

    if (choice.kind === 'weapon') {
      this.addWeapon(choice.id);
    } else if (choice.kind === 'passive') {
      this.addPassive(choice.id);
    } else if (choice.kind === 'bonus') {
      if (choice.id === 'heal_chicken') {
        this.healPlayer(40);
      } else if (choice.id === 'gold_bag') {
        this.gold += 50;
      }
    }

    this.levelUpChoices = [];
    this.status = 'playing';
    this._emitState('upgrade_selected');
    return true;
  }

  closeChestModal() {
    if (this.status !== 'chest') return;
    this.pendingChestReward = null;
    this.status = 'playing';
    this._emitState('chest_closed');
  }

  healPlayer(amount) {
    if (amount <= 0) return;
    const before = this.player.hp;
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + amount);
    const healed = Math.round(this.player.hp - before);
    if (healed > 0) {
      this._addFloatingText(this.player.x, this.player.y - 24, `+${healed}`, '#4ade80', false);
    }
  }

  /**
   * 单帧模拟步进 (dt 单位：秒)
   * input = { dx, dy } 归一化或原始方向输入
   */
  step(dt, input = { dx: 0, dy: 0 }) {
    if (this.status !== 'playing') return;
    const safeDt = clamp(dt, 0, 0.05);
    this.time += safeDt;
    if (this.screenShake > 0) this.screenShake = Math.max(0, this.screenShake - safeDt * 24);
    if (this.bannerMessage) {
      this.bannerMessage.timer -= safeDt;
      if (this.bannerMessage.timer <= 0) this.bannerMessage = null;
    }

    this._updatePlayer(safeDt, input);
    this._updateSpawning(safeDt);
    this._rebuildSpatialGrid();
    this._updateWeapons(safeDt);
    this._updateProjectiles(safeDt);
    this._updateVisualEffects(safeDt);
    this._updateEnemies(safeDt);
    this._updateGemsAndPickups(safeDt);
    this._checkVictoryCondition();
  }

  _updatePlayer(dt, input) {
    const p = this.player;
    const speed = p.computed.moveSpeed * p.computed.moveSpeedPct;
    const dir = normalize(input.dx || 0, input.dy || 0);
    p.vx = dir.x * speed;
    p.vy = dir.y * speed;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    if (Math.hypot(dir.x, dir.y) > 0.05) {
      p.facingX = dir.x;
      p.facingY = dir.y;
      p.walkCycle += dt * 11;
    }

    if (p.invulnTimer > 0) p.invulnTimer = Math.max(0, p.invulnTimer - dt);
    if (p.hurtFlash > 0) p.hurtFlash = Math.max(0, p.hurtFlash - dt);

    // 自然生命回复
    if (p.computed.recovery > 0 && p.hp < p.maxHp) {
      p.hp = Math.min(p.maxHp, p.hp + p.computed.recovery * dt);
    }
  }

  getCurrentWave() {
    for (const w of WAVES) {
      if (this.time >= w.start && this.time < w.end) return w;
    }
    return WAVES[WAVES.length - 1];
  }

  _updateSpawning(dt) {
    // 精英怪定时生成
    if (this.time >= this.nextEliteTime) {
      this.nextEliteTime += 105;
      this.spawnEnemy('elite_reaper', 1 + this.time / 300);
      this.bannerMessage = { text: '⚠ 暗影收割者降临！击败它可掉落进化宝箱', timer: 3.5 };
      this.onAudio('boss');
    }

    // 9 分钟 (540s) 召唤最终 Boss 猩红领主
    if (!this.bossSpawned && this.time >= 540) {
      this.bossSpawned = true;
      this.spawnEnemy('crimson_lord', 1.0);
      this.bannerMessage = { text: '🩸 猩红领主·德古拉苏醒！准备迎战最终 Boss', timer: 4.5 };
      this.onAudio('boss');
    }

    // 普通波次刷怪
    const wave = this.getCurrentWave();
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.enemies.length < GAME_CONSTANTS.MAX_ENEMIES) {
      this.spawnTimer = wave.interval;
      const endlessScale = this.endlessMode ? 1 + (this.time - GAME_CONSTANTS.TARGET_SURVIVAL_SECONDS) / 180 : 1;
      for (let i = 0; i < wave.batch; i++) {
        if (this.enemies.length >= GAME_CONSTANTS.MAX_ENEMIES) break;
        const typeId = wave.pool[Math.floor(this.rng() * wave.pool.length)];
        this.spawnEnemy(typeId, wave.hpScale * endlessScale);
      }
    }

    // 火把可破坏物定期生成
    this.torchTimer -= dt;
    if (this.torchTimer <= 0 && this.torches.length < 10) {
      this.torchTimer = GAME_CONSTANTS.TORCH_SPAWN_INTERVAL;
      this._spawnTorchAroundPlayer(Math.max(this.viewportWidth, this.viewportHeight) * 0.55);
    }
  }

  spawnEnemy(typeId, hpScale = 1.0, customPos = null) {
    const def = ENEMY_TYPES[typeId];
    if (!def) return null;

    let x, y;
    if (customPos) {
      x = customPos.x;
      y = customPos.y;
    } else {
      const angle = this.rng() * Math.PI * 2;
      const distOut = Math.hypot(this.viewportWidth * 0.52, this.viewportHeight * 0.52) + 60 + this.rng() * 80;
      x = this.player.x + Math.cos(angle) * distOut;
      y = this.player.y + Math.sin(angle) * distOut;
    }

    const maxHp = Math.round(def.hp * hpScale);
    const enemy = {
      id: this.nextEntityId++,
      typeId,
      name: def.name,
      x,
      y,
      vx: 0,
      vy: 0,
      knockX: 0,
      knockY: 0,
      hp: maxHp,
      maxHp,
      speed: def.speed,
      damage: def.damage,
      radius: def.radius,
      xp: def.xp,
      color: def.color,
      accent: def.accent,
      shape: def.shape,
      isElite: Boolean(def.isElite),
      isBoss: Boolean(def.isBoss),
      dropsChest: Boolean(def.dropsChest),
      hitFlash: 0,
      slowTimer: 0,
      slowFactor: 1,
      dead: false,
    };
    this.enemies.push(enemy);
    return enemy;
  }

  _spawnTorchAroundPlayer(radius) {
    const angle = this.rng() * Math.PI * 2;
    this.torches.push({
      id: this.nextEntityId++,
      x: this.player.x + Math.cos(angle) * radius,
      y: this.player.y + Math.sin(angle) * radius,
      radius: 14,
      hp: 15,
      dead: false,
    });
  }

  _rebuildSpatialGrid() {
    this.grid.clear();
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.dead) this.grid.insert(e);
    }
  }

  _updateWeapons(dt) {
    const p = this.player;
    for (const w of p.weapons) {
      const def = WEAPONS[w.id];
      if (!def) continue;
      const lvData = def.levels[Math.min(w.level - 1, def.levels.length - 1)];

      if (def.type === 'orbit') {
        this._updateOrbitWeapon(w, def, lvData, dt);
        continue;
      }

      w.cooldownTimer -= dt;
      if (w.cooldownTimer <= 0) {
        const effectiveCd = Math.max(0.1, lvData.cooldown * p.computed.cooldown);
        w.cooldownTimer = effectiveCd;
        this._fireWeapon(w, def, lvData);
      }
    }
  }

  _fireWeapon(w, def, lvData) {
    const p = this.player;
    const areaMul = p.computed.area * (lvData.area || 1);
    const mightMul = p.computed.might;
    const extraCount = p.computed.amount;

    if (def.type === 'slash') {
      const count = lvData.count + extraCount;
      const reachX = 108 * areaMul;
      const reachY = 34 * areaMul;
      const baseDir = p.facingX >= 0 ? 1 : -1;
      this.onAudio('whip');

      for (let i = 0; i < count; i++) {
        const dirX = i % 2 === 0 ? baseDir : -baseDir;
        const offsetY = i >= 2 ? -26 * Math.ceil((i - 1) / 2) : 0;
        const cx = p.x + dirX * (reachX * 0.52);
        const cy = p.y + offsetY;

        this.slashes.push({
          x: cx,
          y: cy,
          rx: reachX * 0.55,
          ry: reachY,
          dirX,
          color: def.color,
          evolved: Boolean(def.evolved),
          timer: 0.22,
          maxTimer: 0.22,
        });

        // 命中判定（矩形近似圆查询）
        const hits = this.grid.queryRadius(cx, cy, reachX * 0.62, this._queryBuf);
        let lifestealTriggered = false;
        for (let k = 0; k < hits.length; k++) {
          const e = hits[k];
          if (Math.abs(e.x - cx) <= reachX * 0.56 + e.radius && Math.abs(e.y - cy) <= reachY + e.radius) {
            const isCrit = lvData.critChance ? this.rng() < lvData.critChance : false;
            const dmg = Math.round(lvData.damage * mightMul * (isCrit ? 2 : 1));
            this.damageEnemy(e, dmg, {
              weapon: w,
              knockback: lvData.knockback || 120,
              fromX: p.x,
              fromY: p.y,
              isCrit,
            });
            if (lvData.lifesteal && !lifestealTriggered) {
              lifestealTriggered = true;
              this.healPlayer(lvData.lifesteal);
            }
          }
        }
        this._hitTorchesInArea(cx, cy, reachX * 0.55);
      }
    } else if (def.type === 'projectile_nearest') {
      const count = lvData.count + extraCount;
      const nearest = this.grid.findNearest(p.x, p.y, 580);
      let baseAngle = Math.atan2(p.facingY, p.facingX);
      if (nearest) {
        baseAngle = Math.atan2(nearest.y - p.y, nearest.x - p.x);
      }
      this.onAudio('wand');
      const spread = 0.14;
      for (let i = 0; i < count; i++) {
        const offset = (i - (count - 1) / 2) * spread;
        const ang = baseAngle + offset;
        this.projectiles.push({
          id: this.nextEntityId++,
          weapon: w,
          kind: 'orb',
          x: p.x,
          y: p.y,
          vx: Math.cos(ang) * lvData.speed,
          vy: Math.sin(ang) * lvData.speed,
          radius: 7 * areaMul,
          damage: Math.round(lvData.damage * mightMul),
          pierce: lvData.pierce,
          knockback: 75,
          life: 1.5,
          color: def.color,
          hitIds: new Set(),
        });
      }
    } else if (def.type === 'projectile_facing') {
      const count = lvData.count + extraCount;
      const baseAngle = Math.atan2(p.facingY, p.facingX);
      this.onAudio('knife');
      for (let i = 0; i < count; i++) {
        const spread = (i - (count - 1) / 2) * 0.085;
        const ang = baseAngle + spread;
        const perpX = -Math.sin(baseAngle) * (i - (count - 1) / 2) * 7;
        const perpY = Math.cos(baseAngle) * (i - (count - 1) / 2) * 7;
        this.projectiles.push({
          id: this.nextEntityId++,
          weapon: w,
          kind: 'knife',
          x: p.x + perpX,
          y: p.y + perpY,
          vx: Math.cos(ang) * lvData.speed,
          vy: Math.sin(ang) * lvData.speed,
          angle: ang,
          radius: 6 * areaMul,
          damage: Math.round(lvData.damage * mightMul),
          pierce: lvData.pierce,
          knockback: 45,
          life: 1.25,
          color: def.color,
          hitIds: new Set(),
        });
      }
    } else if (def.type === 'lightning') {
      const count = lvData.count + extraCount;
      const blastR = lvData.blastRadius * areaMul;
      const inView = this.grid.queryRadius(p.x, p.y, Math.max(this.viewportWidth, this.viewportHeight) * 0.48, []);
      if (inView.length === 0) return;
      this.onAudio('lightning');

      for (let i = 0; i < count; i++) {
        const target = inView[Math.floor(this.rng() * inView.length)];
        if (!target) continue;
        this._strikeLightningAt(target.x, target.y, blastR, Math.round(lvData.damage * mightMul), w, def.color);
        if (lvData.doubleStrike) {
          this._strikeLightningAt(
            target.x + (this.rng() - 0.5) * 32,
            target.y + (this.rng() - 0.5) * 32,
            blastR * 1.15,
            Math.round(lvData.damage * mightMul * 0.65),
            w,
            '#e879f9'
          );
        }
      }
    } else if (def.type === 'aura') {
      const radius = lvData.radius * areaMul;
      const hits = this.grid.queryRadius(p.x, p.y, radius, this._queryBuf);
      let hitCount = 0;
      for (let i = 0; i < hits.length; i++) {
        const e = hits[i];
        this.damageEnemy(e, Math.round(lvData.damage * mightMul), {
          weapon: w,
          knockback: lvData.knockback || 50,
          fromX: p.x,
          fromY: p.y,
        });
        if (lvData.slowFactor) {
          e.slowTimer = 0.8;
          e.slowFactor = lvData.slowFactor;
        }
        hitCount++;
      }
      if (lvData.lifesteal && hitCount > 0) {
        this.healPlayer(Math.min(4, lvData.lifesteal));
      }
      this._hitTorchesInArea(p.x, p.y, radius);
    }
  }

  _strikeLightningAt(x, y, radius, damage, weapon, color) {
    this.lightnings.push({ x, y, radius, color, timer: 0.24, maxTimer: 0.24 });
    const hits = this.grid.queryRadius(x, y, radius, this._queryBuf);
    for (let i = 0; i < hits.length; i++) {
      this.damageEnemy(hits[i], damage, { weapon, knockback: 60, fromX: x, fromY: y });
    }
    this._hitTorchesInArea(x, y, radius);
  }

  _updateOrbitWeapon(w, def, lvData, dt) {
    const p = this.player;
    const areaMul = p.computed.area * (lvData.area || 1);

    if (!lvData.permanent) {
      w.orbitTimer += dt;
      if (w.orbitActive) {
        const duration = lvData.duration * p.computed.area;
        if (w.orbitTimer >= duration) {
          w.orbitActive = false;
          w.orbitTimer = 0;
          w.orbitHitMap.clear();
        }
      } else {
        const cd = Math.max(0.4, (lvData.cooldown - lvData.duration) * p.computed.cooldown);
        if (w.orbitTimer >= cd) {
          w.orbitActive = true;
          w.orbitTimer = 0;
          w.orbitHitMap.clear();
        }
        return;
      }
    } else {
      w.orbitActive = true;
    }

    w.orbitAngle += lvData.angularSpeed * dt;
    // 递减单怪命中冷却
    for (const [eid, t] of w.orbitHitMap.entries()) {
      if (t - dt <= 0) w.orbitHitMap.delete(eid);
      else w.orbitHitMap.set(eid, t - dt);
    }

    const count = lvData.count + p.computed.amount;
    const orbitR = lvData.radius * areaMul;
    const bookR = 14 * areaMul;
    const dmg = Math.round(lvData.damage * p.computed.might);

    for (let i = 0; i < count; i++) {
      const ang = w.orbitAngle + (Math.PI * 2 * i) / count;
      const bx = p.x + Math.cos(ang) * orbitR;
      const by = p.y + Math.sin(ang) * orbitR;
      const hits = this.grid.queryRadius(bx, by, bookR + 4, this._queryBuf);
      for (let k = 0; k < hits.length; k++) {
        const e = hits[k];
        if (!w.orbitHitMap.has(e.id)) {
          w.orbitHitMap.set(e.id, 0.32);
          this.damageEnemy(e, dmg, { weapon: w, knockback: 145, fromX: p.x, fromY: p.y });
        }
      }
      this._hitTorchesInArea(bx, by, bookR + 4);
    }
  }

  _updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.life -= dt;
      if (pr.life <= 0) {
        this.projectiles.splice(i, 1);
        continue;
      }

      const hits = this.grid.queryRadius(pr.x, pr.y, pr.radius, this._queryBuf);
      for (let k = 0; k < hits.length; k++) {
        const e = hits[k];
        if (pr.hitIds.has(e.id)) continue;
        pr.hitIds.add(e.id);
        this.damageEnemy(e, pr.damage, {
          weapon: pr.weapon,
          knockback: pr.knockback,
          fromX: pr.x - pr.vx * 0.05,
          fromY: pr.y - pr.vy * 0.05,
        });
        pr.pierce -= 1;
        if (pr.pierce <= 0) {
          this.projectiles.splice(i, 1);
          break;
        }
      }
      this._hitTorchesInArea(pr.x, pr.y, pr.radius + 4);
    }
  }

  _hitTorchesInArea(x, y, radius) {
    for (let i = this.torches.length - 1; i >= 0; i--) {
      const t = this.torches[i];
      if (circleIntersects(x, y, radius, t.x, t.y, t.radius)) {
        t.dead = true;
        this.torches.splice(i, 1);
        this._spawnParticles(t.x, t.y, '#fb923c', 8);
        this._dropTorchLoot(t.x, t.y);
      }
    }
  }

  _dropTorchLoot(x, y) {
    const r = this.rng();
    let kind = 'gold';
    if (r < 0.36) kind = 'chicken';
    else if (r < 0.56) kind = 'magnet';
    else if (r < 0.66) kind = 'rosary';
    this.pickups.push({
      id: this.nextEntityId++,
      kind,
      x,
      y,
      radius: 14,
      bob: this.rng() * Math.PI * 2,
    });
  }

  damageEnemy(enemy, amount, meta = {}) {
    if (!enemy || enemy.dead) return;
    enemy.hp -= amount;
    enemy.hitFlash = 0.12;
    this.totalDamageDealt += amount;
    if (meta.weapon) meta.weapon.totalDamage += amount;

    // 击退（Boss 具有高抗性）
    const kb = (meta.knockback || 0) * (enemy.isBoss ? 0.12 : enemy.isElite ? 0.35 : 1.0);
    if (kb > 0 && meta.fromX !== undefined) {
      const dir = normalize(enemy.x - meta.fromX, enemy.y - meta.fromY);
      enemy.knockX += dir.x * kb;
      enemy.knockY += dir.y * kb;
    }

    this._addFloatingText(
      enemy.x + (this.rng() - 0.5) * 14,
      enemy.y - enemy.radius,
      `${amount}`,
      meta.isCrit ? '#fde047' : '#f8fafc',
      Boolean(meta.isCrit)
    );
    this.onAudio('hit');

    if (enemy.hp <= 0) {
      this._killEnemy(enemy);
    }
  }

  _killEnemy(enemy) {
    enemy.dead = true;
    this.kills += 1;
    this._spawnParticles(enemy.x, enemy.y, enemy.color, enemy.isBoss ? 24 : 7);

    // 掉落经验宝石
    this._spawnGem(enemy.x, enemy.y, enemy.xp);

    // 精英与 Boss 掉落进化宝箱
    if (enemy.dropsChest) {
      this.pickups.push({
        id: this.nextEntityId++,
        kind: 'chest',
        x: enemy.x,
        y: enemy.y,
        radius: 18,
        bob: 0,
      });
    }

    if (enemy.isBoss) {
      this.bossDefeated = true;
      this.gold += 300;
      this.screenShake = 12;
      this.bannerMessage = { text: '🏆 猩红领主已被讨伐！拾取宝箱并迎接黎明', timer: 4.5 };
    }
  }

  _spawnGem(x, y, value) {
    // 超过 160 颗宝石时合并到就近宝石，控制实体数
    if (this.gems.length > 160) {
      const target = this.gems[Math.floor(this.rng() * this.gems.length)];
      target.value += value;
      target.tier = target.value >= 25 ? 3 : target.value >= 8 ? 2 : 1;
      return;
    }
    const tier = value >= 25 ? 3 : value >= 8 ? 2 : 1;
    this.gems.push({
      id: this.nextEntityId++,
      x,
      y,
      value,
      tier,
      magnetized: false,
      radius: tier === 3 ? 8 : tier === 2 ? 7 : 6,
    });
  }

  _updateEnemies(dt) {
    const p = this.player;
    const maxDespawnDistSq = 1500 * 1500;

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.dead) {
        this.enemies.splice(i, 1);
        continue;
      }

      // 太远的普通怪物回收重刷，保持密度围绕玩家
      if (!e.isBoss && !e.isElite && distSq(e.x, e.y, p.x, p.y) > maxDespawnDistSq) {
        this.enemies.splice(i, 1);
        continue;
      }

      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
      if (e.slowTimer > 0) {
        e.slowTimer -= dt;
        if (e.slowTimer <= 0) e.slowFactor = 1;
      }

      const toPlayer = normalize(p.x - e.x, p.y - e.y);
      const effSpeed = e.speed * e.slowFactor;
      e.vx = toPlayer.x * effSpeed + e.knockX;
      e.vy = toPlayer.y * effSpeed + e.knockY;
      e.knockX *= Math.pow(0.05, dt);
      e.knockY *= Math.pow(0.05, dt);

      // 局部软分离，防止怪物完全重叠成一个像素点
      const neighbors = this.grid.queryRadius(e.x, e.y, e.radius * 1.45, this._queryBuf);
      let sepX = 0;
      let sepY = 0;
      for (let k = 0; k < neighbors.length; k++) {
        const other = neighbors[k];
        if (other.id === e.id) continue;
        const dx = e.x - other.x;
        const dy = e.y - other.y;
        const dSq = dx * dx + dy * dy;
        const minD = e.radius + other.radius;
        if (dSq > 0.01 && dSq < minD * minD) {
          const d = Math.sqrt(dSq);
          const push = (minD - d) / minD;
          sepX += (dx / d) * push * 65;
          sepY += (dy / d) * push * 65;
        }
      }

      e.x += (e.vx + sepX) * dt;
      e.y += (e.vy + sepY) * dt;

      // 玩家受击检测
      if (p.invulnTimer <= 0 && circleIntersects(p.x, p.y, p.radius, e.x, e.y, e.radius * 0.86)) {
        const rawDmg = Math.max(1, e.damage - p.computed.armor);
        p.hp -= rawDmg;
        p.invulnTimer = GAME_CONSTANTS.INVULN_DURATION;
        p.hurtFlash = 0.25;
        this.screenShake = 8;
        this._addFloatingText(p.x, p.y - 20, `-${rawDmg}`, '#fb7185', false);
        this.onAudio('player_hurt');

        if (p.hp <= 0) {
          p.hp = 0;
          this.status = 'gameover';
          this.onAudio('gameover');
          this._emitState('gameover');
          return;
        }
      }
    }
  }

  _updateGemsAndPickups(dt) {
    const p = this.player;
    const pickupR = GAME_CONSTANTS.BASE_PICKUP_RADIUS * p.computed.magnet;

    for (let i = this.gems.length - 1; i >= 0; i--) {
      const g = this.gems[i];
      const d = dist(p.x, p.y, g.x, g.y);
      if (d <= pickupR) {
        g.magnetized = true;
      }
      if (g.magnetized) {
        const dir = normalize(p.x - g.x, p.y - g.y);
        const speed = 460;
        g.x += dir.x * speed * dt;
        g.y += dir.y * speed * dt;
      }
      if (d <= p.radius + g.radius + 6) {
        this.gems.splice(i, 1);
        this.onAudio('gem');
        this.gainXp(g.value);
        if (this.status !== 'playing') return;
      }
    }

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const item = this.pickups[i];
      item.bob += dt * 4;
      if (circleIntersects(p.x, p.y, p.radius + 10, item.x, item.y, item.radius)) {
        this.pickups.splice(i, 1);
        this._consumePickup(item);
        if (this.status !== 'playing') return;
      }
    }
  }

  gainXp(amount) {
    const p = this.player;
    p.xp += amount;
    if (p.xp >= p.xpToNext) {
      p.xp -= p.xpToNext;
      p.level += 1;
      p.xpToNext = this.calcXpRequired(p.level);
      this.levelUpChoices = this.generateUpgradeChoices(3);
      this.status = 'levelup';
      this.onAudio('levelup');
      this._emitState('levelup');
    }
  }

  _consumePickup(item) {
    if (item.kind === 'chicken') {
      this.healPlayer(35);
      this.onAudio('gem');
    } else if (item.kind === 'gold') {
      this.gold += 25;
      this._addFloatingText(this.player.x, this.player.y - 26, '+25 金币', '#fbbf24', false);
      this.onAudio('gem');
    } else if (item.kind === 'magnet') {
      for (const g of this.gems) g.magnetized = true;
      this._addFloatingText(this.player.x, this.player.y - 26, '全图磁吸！', '#38bdf8', true);
      this.onAudio('levelup');
    } else if (item.kind === 'rosary') {
      // 圣念珠：清除屏幕内全部普通敌人
      const maxR = Math.max(this.viewportWidth, this.viewportHeight) * 0.65;
      for (const e of this.enemies) {
        if (!e.dead && !e.isBoss && dist(this.player.x, this.player.y, e.x, e.y) <= maxR) {
          this.damageEnemy(e, e.hp + 999, { knockback: 0 });
        }
      }
      this.screenShake = 10;
      this.bannerMessage = { text: '✝ 圣念珠发动！净化视野内一切邪祟', timer: 2.5 };
      this.onAudio('lightning');
    } else if (item.kind === 'chest') {
      this._openChest();
    }
  }

  _openChest() {
    this.onAudio('chest');
    const goldBonus = 40 + Math.floor(this.rng() * 45);
    this.gold += goldBonus;

    // 优先检查超武进化
    const evolvable = this.getEvolvableWeapon();
    if (evolvable && this.time >= GAME_CONSTANTS.CHEST_EVOLVE_MIN_TIME) {
      const evolvedDef = this.evolveWeapon(evolvable.weaponEntry.id);
      this.pendingChestReward = {
        evolved: true,
        title: `超武进化：${evolvedDef.name}`,
        icon: evolvedDef.icon,
        desc: evolvedDef.desc,
        gold: goldBonus,
      };
    } else {
      // 否则随机升级一件未满级武器，若均满级则回血并给双倍金币
      const upgradable = this.player.weapons.filter((w) => {
        const d = WEAPONS[w.id];
        return d && !d.evolved && w.level < d.levels.length;
      });
      if (upgradable.length > 0) {
        const pick = upgradable[Math.floor(this.rng() * upgradable.length)];
        pick.level += 1;
        const d = WEAPONS[pick.id];
        this.pendingChestReward = {
          evolved: false,
          title: `宝箱强化：${d.name} Lv.${pick.level}`,
          icon: d.icon,
          desc: d.levels[pick.level - 1].desc,
          gold: goldBonus,
        };
      } else {
        this.healPlayer(50);
        this.gold += 60;
        this.pendingChestReward = {
          evolved: false,
          title: '秘银宝库：生命恢复与金币',
          icon: '👑',
          desc: '所有武器已达巅峰，恢复 50 生命并获得丰厚赏金。',
          gold: goldBonus + 60,
        };
      }
    }

    this.status = 'chest';
    this._emitState('chest');
  }

  _updateVisualEffects(dt) {
    for (let i = this.slashes.length - 1; i >= 0; i--) {
      this.slashes[i].timer -= dt;
      if (this.slashes[i].timer <= 0) this.slashes.splice(i, 1);
    }
    for (let i = this.lightnings.length - 1; i >= 0; i--) {
      this.lightnings[i].timer -= dt;
      if (this.lightnings[i].timer <= 0) this.lightnings.splice(i, 1);
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
      if (pt.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y -= 36 * dt;
      ft.life -= dt;
      if (ft.life <= 0) this.floatingTexts.splice(i, 1);
    }
  }

  _checkVictoryCondition() {
    if (!this.endlessMode && this.time >= GAME_CONSTANTS.TARGET_SURVIVAL_SECONDS) {
      this.status = 'victory';
      this.onAudio('chest');
      this._emitState('victory');
    }
  }

  _spawnParticles(x, y, color, count) {
    if (this.particles.length > 220) return;
    for (let i = 0; i < count; i++) {
      const ang = this.rng() * Math.PI * 2;
      const spd = 40 + this.rng() * 110;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        size: 2.5 + this.rng() * 3,
        color,
        life: 0.25 + this.rng() * 0.25,
        maxLife: 0.5,
      });
    }
  }

  _addFloatingText(x, y, text, color, isCrit) {
    if (this.floatingTexts.length > 85) return;
    this.floatingTexts.push({ x, y, text, color, isCrit, life: 0.55, maxLife: 0.55 });
  }

  _emitState(reason) {
    this.onStateChange(reason, this);
  }

  getSummary() {
    return {
      status: this.status,
      time: this.time,
      level: this.player.level,
      kills: this.kills,
      gold: this.gold,
      totalDamageDealt: this.totalDamageDealt,
      characterName: this.character.name,
      weapons: this.player.weapons.map((w) => ({
        id: w.id,
        name: WEAPONS[w.id]?.name || w.id,
        icon: WEAPONS[w.id]?.icon || '',
        level: w.level,
        evolved: Boolean(WEAPONS[w.id]?.evolved),
        totalDamage: w.totalDamage,
      })),
    };
  }
}
