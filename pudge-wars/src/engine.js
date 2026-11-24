/**
 * Pudge Wars (钩肥大战) Pure Simulation Engine
 * Headless-compatible physics, hook ricochet, return-hook, cross-river melee, AI & balance constants.
 */
const BALANCE = {
  // Arena geometry (strictly symmetric around x = 640)
  WIDTH: 1280,
  HEIGHT: 760,
  WALL: 36,
  RIVER_LEFT: 565,
  RIVER_RIGHT: 715,

  // Pudge base stats
  PUDGE_RADIUS: 20,
  BASE_HP: 480,
  BASE_MOVE_SPEED: 215,
  BASE_HP_REGEN: 4.5,
  RESPAWN_TIME: 3.6,
  SPAWN_SHIELD_TIME: 1.3,

  // Melee Cleaver Auto-Attack (for cross-river brawls!)
  MELEE_RANGE: 60,
  MELEE_DAMAGE: 44,
  MELEE_CD: 0.88,
  RETURN_HOOK_DMG_MULT: 0.75,
  PORTAL_RADIUS: 28,
  PORTAL_CHANNEL_TIME: 1.0,
  PORTALS: {
    west: { x: 86, y: 380 },
    east: { x: 1194, y: 380 }
  },

  // Dash / Blink
  DASH_DIST: 105,
  DASH_CD: 9.0,
  BLINK_DIST: 205,
  BLINK_CD: 6.5,

  // Hook base & upgrades (Lv 1..8)
  MAX_LEVEL: 8,
  UPGRADE_COSTS: [55, 85, 120, 160, 205, 255, 310],
  HOOK_BASE_DAMAGE: 185,
  HOOK_STEP_DAMAGE: 34,
  HOOK_BASE_RANGE: 520,
  HOOK_STEP_RANGE: 74,
  HOOK_BASE_SPEED: 560,
  HOOK_STEP_SPEED: 75,
  HOOK_BASE_RADIUS: 18,
  HOOK_STEP_RADIUS: 3.8,
  HOOK_BASE_CD: 2.65,
  HOOK_RETRACT_MULT: 1.28,
  HOOK_MAX_BOUNCES: 1,
  RICOCHET_BONUS_MULT: 0.25,
  HEADSHOT_BONUS_DMG: 9999, // Classic instant kill on mid-drag double hook

  // Economy
  START_GOLD: 120,
  PASSIVE_GOLD_PER_SEC: 5.5,
  KILL_GOLD: 105,
  ASSIST_GOLD: 42,
  HEADSHOT_GOLD: 55,
  RICOCHET_KILL_GOLD: 35,
  RUNE_GOLD: 35,
  STREAK_BONUS_STEP: 25,

  // Runes
  RUNE_SPAWN_INTERVAL: 13.5,
  RUNE_MAX_ACTIVE: 2,
  RUNE_RADIUS: 17,
  RUNE_SPOTS: [
    { x: 640, y: 175 },
    { x: 640, y: 380 },
    { x: 640, y: 585 }
  ],

  // Classic Shop Items
  ITEMS: {
    boots: {
      id: 'boots', name: '动力鞋', icon: '👢', cost: 145,
      desc: '移动速度 +54，近战攻速 +15%，增强躲钩与过河肉搏能力。',
      speedBonus: 54
    },
    rupture: {
      id: 'rupture', name: '撕裂钩爪', icon: '🩸', cost: 245,
      desc: '钩中敌人拖拽时，每拉动 100 距离附加 18 点流血伤害。',
      dragDmgPer100: 18
    },
    ricochet: {
      id: 'ricochet', name: '折射棱镜', icon: '🪞', cost: 195,
      desc: '墙体反弹上限提升至 3 次，反弹钩额外伤害提升至 +50%。',
      extraBounces: 2, bonusMult: 0.25
    },
    chain: {
      id: 'chain', name: '迅捷链轮', icon: '⛓️', cost: 225,
      desc: '肉钩冷却时间 -20%，收回速度 +18%。',
      cdMult: 0.80, retractBonus: 0.18
    },
    heart: {
      id: 'heart', name: '泰坦之心', icon: '❤️', cost: 265,
      desc: '最大生命 +210，脱战 3 秒后每秒回复 24 点生命，过河抗揍神装。',
      hpBonus: 210, oocRegen: 24
    },
    blink: {
      id: 'blink', name: '闪烁匕首', icon: '💨', cost: 250,
      desc: '强化 [E/Space] 为长距离瞬移闪烁（205距离，冷却6.5秒）。'
    }
  }
};

const RUNE_TYPES = [
  { id: 'dd', name: '双倍伤害', color: '#4fc3f7', icon: '⚔️', duration: 10 },
  { id: 'haste', name: '极速神符', color: '#ff5252', icon: '⚡', duration: 8 },
  { id: 'regen', name: '恢复神符', color: '#4ce07a', icon: '💚', duration: 5 },
  { id: 'lightning', name: '雷霆爆裂', color: '#ffd54f', icon: '💥', duration: 12 },
  { id: 'bounty', name: '赏金神符', color: '#ffb74d', icon: '💰', duration: 0 }
];

const WEST_NAMES = ['屠夫老王', '血腥屠宰者', '钩神阿肥', '铁链狂魔', '地狱厨师'];
const EAST_NAMES = ['东岸帕吉', '腐肉领主', '深渊钩手', '暗影屠夫', '剧毒巨魔'];

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }
function randRange(a, b, rng = Math.random) { return a + rng() * (b - a); }

class PudgeWarsEngine {
  constructor(config = {}) {
    this.teamSize = config.teamSize || 3;
    this.killGoal = config.killGoal || 25;
    this.difficulty = config.difficulty || 'normal';
    this.spectate = !!config.spectate;
    this.rng = config.rng || Math.random;
    this.onEvent = config.onEvent || (() => {});
    this.aiBuildProfiles = config.aiBuildProfiles || null; // optional for balance testing
    this.reset();
  }

  reset() {
    this.time = 0;
    this.paused = false;
    this.winner = null; // 'west' | 'east' | null
    this.scores = { west: 0, east: 0 };
    this.firstBloodTaken = false;
    this.pudges = [];
    this.hooks = [];
    this.runes = [];
    this.particles = [];
    this.floatTexts = [];
    this.bloodStains = [];
    this.slashEffects = [];
    this.runeTimer = 5.0; // First rune spawns early for action
    this.goldAccum = 0;

    // Spawn West and East teams symmetrically
    for (let i = 0; i < this.teamSize; i++) {
      const yFrac = (i + 1) / (this.teamSize + 1);
      const sy = BALANCE.WALL + 60 + yFrac * (BALANCE.HEIGHT - (BALANCE.WALL + 60) * 2);
      const isPlayer = (i === 0 && !this.spectate);
      const westProfile = this.aiBuildProfiles ? this.aiBuildProfiles.west : null;
      const eastProfile = this.aiBuildProfiles ? this.aiBuildProfiles.east : null;

      this.pudges.push(this._createPudge({
        id: `west_${i}`,
        name: isPlayer ? '西岸屠夫 (你)' : WEST_NAMES[i % WEST_NAMES.length],
        team: 'west',
        isPlayer,
        spawnX: 160,
        spawnY: sy,
        buildProfile: westProfile || this._pickAiProfile(i)
      }));

      this.pudges.push(this._createPudge({
        id: `east_${i}`,
        name: EAST_NAMES[i % EAST_NAMES.length],
        team: 'east',
        isPlayer: false,
        spawnX: BALANCE.WIDTH - 160,
        spawnY: sy,
        buildProfile: eastProfile || this._pickAiProfile(i)
      }));
    }
  }

  _pickAiProfile(idx) {
    const profiles = ['balanced', 'burst', 'speed', 'shop'];
    return profiles[idx % profiles.length];
  }

  _createPudge({ id, name, team, isPlayer, spawnX, spawnY, buildProfile }) {
    return {
      id, name, team, isPlayer, buildProfile,
      spawnX, spawnY,
      x: spawnX, y: spawnY,
      vx: 0, vy: 0,
      angle: team === 'west' ? 0 : Math.PI,
      radius: BALANCE.PUDGE_RADIUS,
      hp: BALANCE.BASE_HP,
      maxHp: BALANCE.BASE_HP,
      alive: true,
      respawnTimer: 0,
      shieldTimer: BALANCE.SPAWN_SHIELD_TIME,
      gold: BALANCE.START_GOLD,
      upgrades: { damage: 1, range: 1, speed: 1, radius: 1 },
      items: {},
      hookCd: 0,
      blinkCd: 0,
      meleeCd: 0,
      portalTimer: 0,
      attackTargetId: null,
      activeHookId: null,
      grabbedByHookId: null,
      lastDamagedTime: -10,
      lastHitBy: null,
      assistList: [], // [{ id, time }]
      buffs: { dd: 0, haste: 0, regen: 0, lightning: 0 },
      // Stats
      kills: 0, deaths: 0, assists: 0,
      headshots: 0, ricochetKills: 0,
      hooksFired: 0, hooksHit: 0,
      streak: 0,
      // Movement target (for right-click / AI)
      moveTarget: null,
      aiState: {
        thinkTimer: randRange(0.1, 0.5, this.rng),
        strafeDir: this.rng() < 0.5 ? 1 : -1,
        waypoint: { x: spawnX + (team === 'west' ? 160 : -160), y: spawnY },
        shopTimer: randRange(1.0, 2.5, this.rng)
      }
    };
  }

  getPlayer() {
    return this.pudges.find(p => p.isPlayer) || this.pudges[0];
  }

  getHookStats(p) {
    const u = p.upgrades;
    const hasteMult = p.buffs.haste > 0 ? 1.28 : 1.0;
    const ddMult = p.buffs.dd > 0 ? 2.0 : 1.0;
    const cdMult = p.items.chain ? BALANCE.ITEMS.chain.cdMult : 1.0;
    const retractBonus = p.items.chain ? BALANCE.ITEMS.chain.retractBonus : 0;
    const maxBounces = BALANCE.HOOK_MAX_BOUNCES + (p.items.ricochet ? BALANCE.ITEMS.ricochet.extraBounces : 0);
    const ricochetBonus = BALANCE.RICOCHET_BONUS_MULT + (p.items.ricochet ? BALANCE.ITEMS.ricochet.bonusMult : 0);

    return {
      damage: (BALANCE.HOOK_BASE_DAMAGE + (u.damage - 1) * BALANCE.HOOK_STEP_DAMAGE + (u.radius - 1) * 13) * ddMult,
      range: BALANCE.HOOK_BASE_RANGE + (u.range - 1) * BALANCE.HOOK_STEP_RANGE,
      speed: (BALANCE.HOOK_BASE_SPEED + (u.speed - 1) * BALANCE.HOOK_STEP_SPEED) * hasteMult,
      radius: BALANCE.HOOK_BASE_RADIUS + (u.radius - 1) * BALANCE.HOOK_STEP_RADIUS,
      cd: BALANCE.HOOK_BASE_CD * cdMult * Math.pow(0.95, u.speed - 1),
      retractMult: BALANCE.HOOK_RETRACT_MULT + retractBonus,
      maxBounces,
      ricochetBonus
    };
  }

  getMoveSpeed(p) {
    let spd = BALANCE.BASE_MOVE_SPEED;
    if (p.items.boots) spd += BALANCE.ITEMS.boots.speedBonus;
    if (p.buffs.haste > 0) spd *= 1.38;
    return spd;
  }

  getUpgradeCost(p, stat) {
    const lv = p.upgrades[stat];
    if (lv >= BALANCE.MAX_LEVEL) return Infinity;
    return BALANCE.UPGRADE_COSTS[lv - 1];
  }

  buyUpgrade(p, stat) {
    if (!p || !['damage', 'range', 'speed', 'radius'].includes(stat)) return false;
    const cost = this.getUpgradeCost(p, stat);
    if (p.gold < cost || !isFinite(cost)) return false;
    p.gold -= cost;
    p.upgrades[stat] += 1;
    this.onEvent({ type: 'upgrade', pudge: p, stat, level: p.upgrades[stat] });
    return true;
  }

  buyItem(p, itemId) {
    const item = BALANCE.ITEMS[itemId];
    if (!p || !item || p.items[itemId] || p.gold < item.cost) return false;
    p.gold -= item.cost;
    p.items[itemId] = true;
    if (itemId === 'heart') {
      p.maxHp += item.hpBonus;
      p.hp = Math.min(p.maxHp, p.hp + item.hpBonus);
    }
    this.onEvent({ type: 'buy', pudge: p, itemId });
    return true;
  }

  triggerBlink(p, targetX, targetY) {
    if (!p || !p.alive || p.grabbedByHookId || p.blinkCd > 0) return false;
    const hasBlink = !!p.items.blink;
    const maxDist = hasBlink ? BALANCE.BLINK_DIST : BALANCE.DASH_DIST;
    const cd = hasBlink ? BALANCE.BLINK_CD : BALANCE.DASH_CD;
    let dx = targetX - p.x;
    let dy = targetY - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) {
      dx = Math.cos(p.angle);
      dy = Math.sin(p.angle);
    } else {
      dx /= d; dy /= d;
    }
    const moveD = Math.min(maxDist, d > 1 ? d : maxDist);
    const oldX = p.x, oldY = p.y;
    const clamped = this._clampToSide(this.getShore(p.x), p.x + dx * moveD, p.y + dy * moveD, p.radius);
    p.x = clamped.x;
    p.y = clamped.y;
    p.blinkCd = cd;
    p.moveTarget = null;
    this._spawnParticles(oldX, oldY, hasBlink ? '#4fc3f7' : '#e0d6c2', 10, 120);
    this._spawnParticles(p.x, p.y, hasBlink ? '#8fd3fe' : '#f5c542', 10, 140);
    this.onEvent({ type: 'blink', pudge: p, upgraded: hasBlink });
    return true;
  }

  fireHook(p, targetX, targetY) {
    if (!p || !p.alive || p.grabbedByHookId || p.hookCd > 0 || p.activeHookId) return null;
    const dx = targetX - p.x;
    const dy = targetY - p.y;
    const angle = Math.atan2(dy, dx);
    p.angle = angle;

    const stats = this.getHookStats(p);
    const hookId = `hook_${p.id}_${Math.floor(this.time * 1000)}_${Math.floor(this.rng() * 9999)}`;
    const hook = {
      id: hookId,
      ownerId: p.id,
      team: p.team,
      x: p.x + Math.cos(angle) * (p.radius + 6),
      y: p.y + Math.sin(angle) * (p.radius + 6),
      vx: Math.cos(angle) * stats.speed,
      vy: Math.sin(angle) * stats.speed,
      speed: stats.speed,
      retractSpeed: stats.speed * stats.retractMult,
      radius: stats.radius,
      damage: stats.damage,
      maxRange: stats.range,
      traveled: 0,
      bounces: 0,
      maxBounces: stats.maxBounces,
      ricochetBonus: stats.ricochetBonus,
      lightning: p.buffs.lightning > 0,
      state: 'extending', // 'extending' | 'retracting'
      grabbedPudgeId: null,
      grabbedRuneId: null,
      dragDistance: 0,
      // Path vertices for chain rendering (supports wall bounce bends!)
      vertices: [{ x: p.x, y: p.y }]
    };

    if (p.buffs.lightning > 0) p.buffs.lightning = 0; // consumed on shot

    p.activeHookId = hookId;
    p.hookCd = stats.cd;
    p.hooksFired += 1;
    this.hooks.push(hook);
    this.onEvent({ type: 'hook_fire', pudge: p, hook });
    return hook;
  }

  getShore(x) {
    return x < BALANCE.WIDTH / 2 ? 'west' : 'east';
  }

  _clampToSide(shore, x, y, r) {
    const minY = BALANCE.WALL + r;
    const maxY = BALANCE.HEIGHT - BALANCE.WALL - r;
    let minX, maxX;
    if (shore === 'west') {
      minX = BALANCE.WALL + r;
      maxX = BALANCE.RIVER_LEFT - r;
    } else {
      minX = BALANCE.RIVER_RIGHT + r;
      maxX = BALANCE.WIDTH - BALANCE.WALL - r;
    }
    return { x: clamp(x, minX, maxX), y: clamp(y, minY, maxY) };
  }

  step(dt, playerInput = null) {
    if (this.paused || this.winner) return;
    dt = Math.min(dt, 0.05);
    this.time += dt;

    // Passive gold
    this.goldAccum += BALANCE.PASSIVE_GOLD_PER_SEC * dt;
    if (this.goldAccum >= 1) {
      const whole = Math.floor(this.goldAccum);
      this.goldAccum -= whole;
      for (const p of this.pudges) p.gold += whole;
    }

    // Rune spawning
    this.runeTimer -= dt;
    if (this.runeTimer <= 0) {
      this.runeTimer = BALANCE.RUNE_SPAWN_INTERVAL;
      this._trySpawnRune();
    }

    // Update pudges
    for (const p of this.pudges) {
      if (p.hookCd > 0) p.hookCd = Math.max(0, p.hookCd - dt);
      if (p.blinkCd > 0) p.blinkCd = Math.max(0, p.blinkCd - dt);
      if (p.meleeCd > 0) p.meleeCd = Math.max(0, p.meleeCd - dt);
      if (p.shieldTimer > 0) p.shieldTimer = Math.max(0, p.shieldTimer - dt);

      // Buffs decay
      for (const k of ['dd', 'haste', 'regen', 'lightning']) {
        if (p.buffs[k] > 0) p.buffs[k] = Math.max(0, p.buffs[k] - dt);
      }

      if (!p.alive) {
        p.respawnTimer -= dt;
        if (p.respawnTimer <= 0) this._respawnPudge(p);
        continue;
      }

      // HP Regeneration
      let regen = BALANCE.BASE_HP_REGEN;
      if (p.buffs.regen > 0) regen += 95;
      if (p.items.heart && (this.time - p.lastDamagedTime) >= 3.0) {
        regen += BALANCE.ITEMS.heart.oocRegen;
      }
      if (p.hp < p.maxHp) {
        p.hp = Math.min(p.maxHp, p.hp + regen * dt);
      }

      // Clean old assists (> 8s)
      p.assistList = p.assistList.filter(a => (this.time - a.time) <= 8.0);

      // Movement
      if (p.grabbedByHookId) {
        p.vx = 0; p.vy = 0;
        continue;
      }

      if (p.isPlayer && playerInput) {
        this._updatePlayerMovement(p, playerInput, dt);
      } else {
        this._updateAI(p, dt);
      }
      this._tryMeleeAttack(p);
      this._updateReturnPortal(p, dt);
    }

    // Separate overlapping pudges on same side
    this._resolvePudgeSeparation();

    // Update hooks
    this._updateHooks(dt);

    // Update visual effects
    this._updateEffects(dt);
  }

  _updatePlayerMovement(p, input, dt) {
    const spd = this.getMoveSpeed(p);
    let mx = 0, my = 0;
    if (input.up) my -= 1;
    if (input.down) my += 1;
    if (input.left) mx -= 1;
    if (input.right) mx += 1;

    if (input.joyX || input.joyY) {
      mx = input.joyX; my = input.joyY;
    }

    const curShore = this.getShore(p.x);
    if (mx !== 0 || my !== 0) {
      const len = Math.hypot(mx, my);
      if (len > 1) { mx /= len; my /= len; }
      p.moveTarget = null;
      p.attackTargetId = null;
      p.vx = mx * spd;
      p.vy = my * spd;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    } else if (p.attackTargetId) {
      const tgt = this.pudges.find(t => t.id === p.attackTargetId && t.alive && this.getShore(t.x) === curShore);
      if (!tgt) {
        p.attackTargetId = null;
        p.vx = 0; p.vy = 0;
      } else {
        const dx = tgt.x - p.x, dy = tgt.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d > BALANCE.MELEE_RANGE - 8) {
          p.vx = (dx / d) * spd;
          p.vy = (dy / d) * spd;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        } else {
          p.vx = 0; p.vy = 0;
        }
      }
    } else if (p.moveTarget) {
      const dx = p.moveTarget.x - p.x;
      const dy = p.moveTarget.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 6) {
        p.moveTarget = null;
        p.vx = 0; p.vy = 0;
      } else {
        p.vx = (dx / d) * spd;
        p.vy = (dy / d) * spd;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    } else {
      p.vx = 0; p.vy = 0;
    }

    if (input.aimX !== undefined && input.aimY !== undefined) {
      p.angle = Math.atan2(input.aimY - p.y, input.aimX - p.x);
    }

    const c = this._clampToSide(curShore, p.x, p.y, p.radius);
    p.x = c.x; p.y = c.y;
  }

  _tryMeleeAttack(p) {
    if (!p.alive || p.grabbedByHookId || p.meleeCd > 0) return false;
    const myShore = this.getShore(p.x);
    let target = null;
    let bestD = BALANCE.MELEE_RANGE + 1;
    for (const e of this.pudges) {
      if (!e.alive || e.team === p.team) continue;
      if (this.getShore(e.x) !== myShore) continue;
      const d = dist(p.x, p.y, e.x, e.y);
      if (d <= BALANCE.MELEE_RANGE && d < bestD) {
        bestD = d;
        target = e;
      }
    }
    if (!target) return false;

    const hasteSpd = p.buffs.haste > 0 ? 0.72 : 1.0;
    const bootsSpd = p.items.boots ? 0.85 : 1.0;
    p.meleeCd = BALANCE.MELEE_CD * hasteSpd * bootsSpd;

    const ddMult = p.buffs.dd > 0 ? 2.0 : 1.0;
    let dmg = BALANCE.MELEE_DAMAGE * ddMult;
    if (target.shieldTimer > 0) dmg *= 0.45;

    const ang = Math.atan2(target.y - p.y, target.x - p.x);
    p.angle = ang;
    this.slashEffects.push({
      x: p.x + Math.cos(ang) * 18,
      y: p.y + Math.sin(ang) * 18,
      angle: ang,
      color: p.team === 'west' ? '#ff6b6b' : '#4fc3f7',
      life: 0.22, maxLife: 0.22
    });
    this._spawnParticles(target.x, target.y, '#c62828', 8, 120);
    this._addFloatText(target.x, target.y - 24, `🔪 -${Math.round(dmg)}`, '#ff8a65', 13);
    this.onEvent({ type: 'melee_hit', attacker: p, target, damage: dmg });
    this._applyDamage(target, p, dmg, { isMelee: true });
    return true;
  }

  _updateReturnPortal(p, dt) {
    const curShore = this.getShore(p.x);
    if (curShore === p.team) {
      p.portalTimer = 0;
      return;
    }
    const portal = BALANCE.PORTALS[curShore];
    if (dist(p.x, p.y, portal.x, portal.y) <= BALANCE.PORTAL_RADIUS + p.radius * 0.6) {
      p.portalTimer += dt;
      if (p.portalTimer >= BALANCE.PORTAL_CHANNEL_TIME) {
        p.portalTimer = 0;
        this._spawnParticles(p.x, p.y, '#4fc3f7', 16, 150);
        p.x = p.spawnX;
        p.y = p.spawnY;
        p.moveTarget = null;
        p.attackTargetId = null;
        this._spawnParticles(p.x, p.y, '#4ce07a', 16, 150);
        this._addFloatText(p.x, p.y - 28, '✨ 传送回岸!', '#4ce07a', 14);
        this.onEvent({ type: 'portal_return', pudge: p });
      }
    } else {
      p.portalTimer = Math.max(0, p.portalTimer - dt * 2);
    }
  }

  _updateAI(p, dt) {
    const ai = p.aiState;
    const diffCfg = {
      easy:   { leadAcc: 0.30, dodgeChance: 0.25, fireRate: 0.55, bounceChance: 0.08, aimJitter: 0.16 },
      normal: { leadAcc: 0.65, dodgeChance: 0.58, fireRate: 0.80, bounceChance: 0.22, aimJitter: 0.08 },
      hard:   { leadAcc: 0.92, dodgeChance: 0.85, fireRate: 0.96, bounceChance: 0.38, aimJitter: 0.03 }
    }[this.difficulty] || { leadAcc: 0.65, dodgeChance: 0.58, fireRate: 0.80, bounceChance: 0.22, aimJitter: 0.08 };

    // 1. Shopping / upgrading decision
    ai.shopTimer -= dt;
    if (ai.shopTimer <= 0) {
      ai.shopTimer = randRange(1.2, 2.6, this.rng);
      this._aiSpendGold(p);
    }

    // 2. Danger check: dodge incoming enemy hooks
    let dodgeVec = null;
    for (const h of this.hooks) {
      if (h.team === p.team || h.state !== 'extending') continue;
      const toX = p.x - h.x;
      const toY = p.y - h.y;
      const hSpd = Math.hypot(h.vx, h.vy) || 1;
      const ux = h.vx / hSpd, uy = h.vy / hSpd;
      const proj = toX * ux + toY * uy;
      if (proj > 0 && proj < 340) {
        const perp = Math.abs(toX * -uy + toY * ux);
        if (perp < (h.radius + p.radius + 30)) {
          if (this.rng() < diffCfg.dodgeChance) {
            const sign = (toX * -uy + toY * ux) >= 0 ? 1 : -1;
            dodgeVec = { x: -uy * sign, y: ux * sign };
            // Use blink if close and lethal
            if (proj < 145 && p.blinkCd <= 0 && (p.items.blink || p.hp < 240)) {
              this.triggerBlink(p, p.x + dodgeVec.x * 160, p.y + dodgeVec.y * 160);
              return;
            }
            break;
          }
        }
      }
    }

    // 3. Movement (with cross-river melee brawl & return portal logic)
    const curShore = this.getShore(p.x);
    const spd = this.getMoveSpeed(p);
    const sameShoreEnemies = this.pudges.filter(e => e.alive && e.team !== p.team && this.getShore(e.x) === curShore);
    const onEnemyShore = (curShore !== p.team);

    let brawlTarget = null;
    if (sameShoreEnemies.length > 0) {
      sameShoreEnemies.sort((a, b) => dist(p.x, p.y, a.x, a.y) - dist(p.x, p.y, b.x, b.y));
      const nearest = sameShoreEnemies[0];
      // Chase to melee if on home shore (gang up on hooked intruder!) or if healthy in close brawl
      if (!onEnemyShore || (p.hp >= nearest.hp * 0.75 && dist(p.x, p.y, nearest.x, nearest.y) < 180)) {
        brawlTarget = nearest;
      }
    }

    ai.thinkTimer -= dt;
    if (onEnemyShore && !brawlTarget) {
      // Head to return portal to get back to home shore
      const portal = BALANCE.PORTALS[curShore];
      ai.waypoint = { x: portal.x, y: portal.y };
    } else if (brawlTarget) {
      ai.waypoint = { x: brawlTarget.x, y: brawlTarget.y };
    } else if (ai.thinkTimer <= 0) {
      ai.thinkTimer = randRange(0.45, 1.15, this.rng);
      if (this.rng() < 0.45) ai.strafeDir *= -1;
      const isWest = curShore === 'west';
      const minX = isWest ? BALANCE.WALL + 60 : BALANCE.RIVER_RIGHT + 45;
      const maxX = isWest ? BALANCE.RIVER_LEFT - 45 : BALANCE.WIDTH - BALANCE.WALL - 60;
      const lowHp = p.hp < p.maxHp * 0.38;
      const prefX = lowHp
        ? (isWest ? minX + 55 : maxX - 55)
        : randRange(minX + 60, maxX - 30, this.rng);
      ai.waypoint = {
        x: clamp(prefX, minX, maxX),
        y: clamp(p.y + ai.strafeDir * randRange(90, 210, this.rng), BALANCE.WALL + 55, BALANCE.HEIGHT - BALANCE.WALL - 55)
      };
    }

    if (dodgeVec) {
      p.vx = dodgeVec.x * spd;
      p.vy = dodgeVec.y * spd;
    } else {
      const dx = ai.waypoint.x - p.x;
      const dy = ai.waypoint.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > (brawlTarget ? BALANCE.MELEE_RANGE - 10 : 10)) {
        p.vx = (dx / d) * spd;
        p.vy = (dy / d) * spd;
      } else {
        p.vx = 0; p.vy = 0;
      }
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const clamped = this._clampToSide(curShore, p.x, p.y, p.radius);
    p.x = clamped.x; p.y = clamped.y;

    // 4. Hook Firing Decision
    if (p.hookCd <= 0 && !p.activeHookId) {
      const stats = this.getHookStats(p);
      // Priority A: Grab valuable rune if in range
      if (this.runes.length > 0 && this.rng() < 0.45) {
        const rune = this.runes[Math.floor(this.rng() * this.runes.length)];
        if (dist(p.x, p.y, rune.x, rune.y) < stats.range * 0.92) {
          this.fireHook(p, rune.x, rune.y);
          return;
        }
      }

      // Priority B: Headshot opportunity (enemy currently being dragged!)
      const enemies = this.pudges.filter(e => e.team !== p.team && e.alive);
      let target = enemies.find(e => e.grabbedByHookId && dist(p.x, p.y, e.x, e.y) < stats.range * 0.95);
      if (!target && enemies.length > 0) {
        // Choose closest reachable enemy
        const reachable = enemies.filter(e => dist(p.x, p.y, e.x, e.y) < stats.range * 0.96);
        if (reachable.length > 0) {
          reachable.sort((a, b) => dist(p.x, p.y, a.x, a.y) - dist(p.x, p.y, b.x, b.y));
          target = reachable[0];
        }
      }

      if (target && this.rng() < diffCfg.fireRate * dt * 6.5) {
        const d = dist(p.x, p.y, target.x, target.y);
        const travelTime = d / stats.speed;
        let aimX = target.x + target.vx * travelTime * diffCfg.leadAcc;
        let aimY = target.y + target.vy * travelTime * diffCfg.leadAcc;

        // Occasional trick-shot wall bounce!
        if (this.rng() < diffCfg.bounceChance && d < stats.range * 0.8) {
          const wallY = target.y < BALANCE.HEIGHT / 2 ? BALANCE.WALL + 8 : BALANCE.HEIGHT - BALANCE.WALL - 8;
          aimY = 2 * wallY - aimY;
        }

        const baseAngle = Math.atan2(aimY - p.y, aimX - p.x);
        const jitter = (this.rng() - 0.5) * 2 * diffCfg.aimJitter;
        const finalAngle = baseAngle + jitter;
        this.fireHook(p, p.x + Math.cos(finalAngle) * 300, p.y + Math.sin(finalAngle) * 300);
      }
    }
  }

  _aiSpendGold(p) {
    // Different strategic profiles for variety & balance testing
    const prof = p.buildProfile;
    if (prof === 'shop') {
      const order = ['boots', 'rupture', 'chain', 'heart', 'blink', 'ricochet'];
      for (const id of order) {
        if (!p.items[id] && p.gold >= BALANCE.ITEMS[id].cost) {
          this.buyItem(p, id);
          return;
        }
      }
    } else if (prof === 'burst') {
      if (this.buyUpgrade(p, 'damage')) return;
      if (p.upgrades.damage >= 3 && !p.items.rupture && this.buyItem(p, 'rupture')) return;
      if (this.buyUpgrade(p, 'range')) return;
    } else if (prof === 'speed') {
      if (!p.items.boots && this.buyItem(p, 'boots')) return;
      if (this.buyUpgrade(p, 'speed')) return;
      if (this.buyUpgrade(p, 'radius')) return;
      if (!p.items.chain && this.buyItem(p, 'chain')) return;
    }

    // Balanced / fallback
    if (p.gold >= 240 && !p.items.boots && this.rng() < 0.45) {
      if (this.buyItem(p, 'boots')) return;
    }
    if (p.gold >= 250 && this.rng() < 0.35) {
      const itemIds = Object.keys(BALANCE.ITEMS).filter(id => !p.items[id]);
      if (itemIds.length > 0) {
        const pick = itemIds[Math.floor(this.rng() * itemIds.length)];
        if (this.buyItem(p, pick)) return;
      }
    }
    const stats = ['damage', 'range', 'speed', 'radius'];
    stats.sort((a, b) => p.upgrades[a] - p.upgrades[b]);
    this.buyUpgrade(p, stats[0]);
  }

  _resolvePudgeSeparation() {
    for (let i = 0; i < this.pudges.length; i++) {
      const a = this.pudges[i];
      if (!a.alive || a.grabbedByHookId) continue;
      for (let j = i + 1; j < this.pudges.length; j++) {
        const b = this.pudges[j];
        if (!b.alive || b.grabbedByHookId || this.getShore(a.x) !== this.getShore(b.x)) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const minD = a.radius + b.radius + 2;
        if (d > 0.01 && d < minD) {
          const push = (minD - d) * 0.5;
          const nx = dx / d, ny = dy / d;
          const sa = this.getShore(a.x);
          a.x -= nx * push; a.y -= ny * push;
          b.x += nx * push; b.y += ny * push;
          const ca = this._clampToSide(sa, a.x, a.y, a.radius);
          const cb = this._clampToSide(sa, b.x, b.y, b.radius);
          a.x = ca.x; a.y = ca.y;
          b.x = cb.x; b.y = cb.y;
        }
      }
    }
  }

  _updateHooks(dt) {
    const toRemove = new Set();

    // Check hook-vs-hook clash sparks
    for (let i = 0; i < this.hooks.length; i++) {
      for (let j = i + 1; j < this.hooks.length; j++) {
        const ha = this.hooks[i], hb = this.hooks[j];
        if (ha.team !== hb.team && ha.state === 'extending' && hb.state === 'extending') {
          if (dist(ha.x, ha.y, hb.x, hb.y) < ha.radius + hb.radius) {
            this._spawnParticles((ha.x + hb.x) / 2, (ha.y + hb.y) / 2, '#ffd54f', 10, 180);
          }
        }
      }
    }

    for (const h of this.hooks) {
      const owner = this.pudges.find(p => p.id === h.ownerId);
      if (!owner) { toRemove.add(h.id); continue; }

      // Keep anchor attached to owner
      h.vertices[0] = { x: owner.x, y: owner.y };

      if (h.state === 'extending') {
        const stepDist = Math.hypot(h.vx * dt, h.vy * dt);
        h.x += h.vx * dt;
        h.y += h.vy * dt;
        h.traveled += stepDist;

        // Wall Bounce (Top & Bottom walls bounce! Left/Right walls also bounce if bounces remain)
        const minY = BALANCE.WALL + 6;
        const maxY = BALANCE.HEIGHT - BALANCE.WALL - 6;
        const minX = BALANCE.WALL + 6;
        const maxX = BALANCE.WIDTH - BALANCE.WALL - 6;

        let bounced = false;
        if (h.y <= minY && h.vy < 0) {
          if (h.bounces < h.maxBounces) {
            h.y = minY; h.vy = -h.vy; bounced = true;
          } else { h.state = 'retracting'; }
        } else if (h.y >= maxY && h.vy > 0) {
          if (h.bounces < h.maxBounces) {
            h.y = maxY; h.vy = -h.vy; bounced = true;
          } else { h.state = 'retracting'; }
        } else if (h.x <= minX && h.vx < 0) {
          if (h.bounces < h.maxBounces) {
            h.x = minX; h.vx = -h.vx; bounced = true;
          } else { h.state = 'retracting'; }
        } else if (h.x >= maxX && h.vx > 0) {
          if (h.bounces < h.maxBounces) {
            h.x = maxX; h.vx = -h.vx; bounced = true;
          } else { h.state = 'retracting'; }
        }

        if (bounced) {
          h.bounces += 1;
          h.vertices.push({ x: h.x, y: h.y });
          this._spawnParticles(h.x, h.y, '#ffd54f', 12, 160);
          this.onEvent({ type: 'hook_bounce', hook: h, owner });
        }

        // Check rune hit
        for (const r of this.runes) {
          if (r.grabbedBy) continue;
          if (dist(h.x, h.y, r.x, r.y) <= h.radius + BALANCE.RUNE_RADIUS) {
            r.grabbedBy = h.id;
            h.grabbedRuneId = r.id;
            h.state = 'retracting';
            this._spawnParticles(r.x, r.y, r.color, 12, 130);
            break;
          }
        }

        // Check pudge hit
        if (h.state === 'extending') {
          for (const target of this.pudges) {
            if (!target.alive || target.id === owner.id) continue;
            if (dist(h.x, h.y, target.x, target.y) <= h.radius + target.radius) {
              this._onHookHitPudge(h, owner, target);
              break;
            }
          }
        }

        if (h.traveled >= h.maxRange) {
          h.state = 'retracting';
        }
      } else {
        // Retracting along reverse vertex path
        const prevVert = h.vertices[h.vertices.length - 1];
        const dx = prevVert.x - h.x;
        const dy = prevVert.y - h.y;
        const d = Math.hypot(dx, dy);
        const step = h.retractSpeed * dt;

        let moved = step;
        if (d <= step) {
          h.x = prevVert.x;
          h.y = prevVert.y;
          moved = d;
          if (h.vertices.length > 1) {
            h.vertices.pop();
          } else {
            // Reached owner!
            this._finishHook(h, owner);
            toRemove.add(h.id);
          }
        } else {
          h.x += (dx / d) * step;
          h.y += (dy / d) * step;
        }

        // Return Hook collision: empty retracting hook can STILL latch onto runes or pudges!
        if (!h.grabbedPudgeId && !h.grabbedRuneId && !toRemove.has(h.id)) {
          for (const r of this.runes) {
            if (r.grabbedBy) continue;
            if (dist(h.x, h.y, r.x, r.y) <= h.radius + BALANCE.RUNE_RADIUS) {
              r.grabbedBy = h.id;
              h.grabbedRuneId = r.id;
              this._spawnParticles(r.x, r.y, r.color, 12, 130);
              break;
            }
          }
          if (!h.grabbedRuneId) {
            for (const target of this.pudges) {
              if (!target.alive || target.id === owner.id) continue;
              if (dist(h.x, h.y, target.x, target.y) <= h.radius + target.radius) {
                this._onHookHitPudge(h, owner, target, true);
                break;
              }
            }
          }
        }

        // Move grabbed rune
        if (h.grabbedRuneId) {
          const rune = this.runes.find(r => r.id === h.grabbedRuneId);
          if (rune) { rune.x = h.x; rune.y = h.y; }
        }

        // Drag grabbed pudge
        if (h.grabbedPudgeId) {
          const victim = this.pudges.find(p => p.id === h.grabbedPudgeId);
          if (victim && victim.alive && victim.grabbedByHookId === h.id) {
            victim.x = h.x;
            victim.y = h.y;
            h.dragDistance += moved;

            // Rupture (Barbed Hook) bleed damage while dragging enemy!
            if (victim.team !== owner.team && owner.items.rupture && moved > 0) {
              const bleed = (moved / 100) * BALANCE.ITEMS.rupture.dragDmgPer100;
              this._applyDamage(victim, owner, bleed, { isRupture: true, bounces: h.bounces });
              if (this.rng() < 0.35) {
                this._spawnParticles(victim.x, victim.y, '#c62828', 2, 60);
              }
            }
          } else {
            h.grabbedPudgeId = null;
          }
        }
      }
    }

    if (toRemove.size > 0) {
      this.hooks = this.hooks.filter(h => !toRemove.has(h.id));
    }
  }

  _onHookHitPudge(h, owner, target, isReturnHook = false) {
    owner.hooksHit += 1;
    h.state = 'retracting';

    const isEnemy = target.team !== owner.team;
    if (!isEnemy) {
      // Friendly hook save! (No damage, frees from enemy hook if grabbed)
      if (target.grabbedByHookId) {
        const oldHook = this.hooks.find(oh => oh.id === target.grabbedByHookId);
        if (oldHook) oldHook.grabbedPudgeId = null;
        this._addFloatText(target.x, target.y - 26, '救援成功!', '#4ce07a', 15);
      }
      target.grabbedByHookId = h.id;
      h.grabbedPudgeId = target.id;
      this.onEvent({ type: 'hook_save', owner, target });
      return;
    }

    // Enemy hit! Check HEADSHOT (already grabbed by another hook!)
    const isHeadshot = !!target.grabbedByHookId;
    if (isHeadshot) {
      const oldHook = this.hooks.find(oh => oh.id === target.grabbedByHookId);
      if (oldHook) oldHook.grabbedPudgeId = null;
    }

    target.grabbedByHookId = h.id;
    h.grabbedPudgeId = target.id;

    // Calculate damage
    let dmg = h.damage * (isReturnHook ? BALANCE.RETURN_HOOK_DMG_MULT : 1.0);
    if (h.bounces > 0) {
      dmg *= (1 + h.ricochetBonus * h.bounces);
    }
    if (target.shieldTimer > 0) {
      dmg *= 0.45; // Spawn shield reduces damage
    }

    if (isHeadshot) {
      dmg = BALANCE.HEADSHOT_BONUS_DMG;
      owner.headshots += 1;
      owner.gold += BALANCE.HEADSHOT_GOLD;
      this._addFloatText(target.x, target.y - 34, '💀 HEADSHOT!', '#ffd54f', 20);
      this._spawnParticles(target.x, target.y, '#ff1744', 28, 260);
      this.onEvent({ type: 'headshot', owner, target });
    } else {
      const prefix = isReturnHook ? '回钩 ' : (h.bounces > 0 ? '反弹 ' : '');
      const label = `${prefix}-${Math.round(dmg)}${(isReturnHook || h.bounces > 0) ? '!' : ''}`;
      this._addFloatText(target.x, target.y - 26, label, h.bounces > 0 ? '#ffd54f' : '#ff6b6b', h.bounces > 0 ? 16 : 14);
      this._spawnParticles(target.x, target.y, '#d32f2f', 16, 170);
      this.onEvent({ type: 'hook_hit', owner, target, bounces: h.bounces, damage: dmg });
    }

    // Lightning rune AoE burst
    if (h.lightning) {
      this._spawnParticles(target.x, target.y, '#ffd54f', 24, 240);
      this._addFloatText(target.x, target.y - 46, '⚡ 雷霆爆裂!', '#ffd54f', 16);
      for (const other of this.pudges) {
        if (other.alive && other.team !== owner.team && dist(target.x, target.y, other.x, other.y) <= 135) {
          this._applyDamage(other, owner, 115, { isHeadshot: false, bounces: h.bounces });
        }
      }
    }

    this._applyDamage(target, owner, dmg, { isHeadshot, bounces: h.bounces });
  }

  _finishHook(h, owner) {
    if (owner.activeHookId === h.id) owner.activeHookId = null;

    if (h.grabbedRuneId) {
      const idx = this.runes.findIndex(r => r.id === h.grabbedRuneId);
      if (idx >= 0) {
        const rune = this.runes[idx];
        this.runes.splice(idx, 1);
        this._applyRune(owner, rune);
      }
    }

    if (h.grabbedPudgeId) {
      const target = this.pudges.find(p => p.id === h.grabbedPudgeId);
      if (target && target.grabbedByHookId === h.id) {
        target.grabbedByHookId = null;
        // Classic Pudge Wars: enemy is pulled ALL THE WAY across the river onto the hooker's shore for melee brawling!
        const landingShore = this.getShore(owner.x);
        const c = this._clampToSide(landingShore, target.x, target.y, target.radius);
        target.x = c.x;
        target.y = c.y;
        target.moveTarget = null;
      }
    }
  }

  _applyDamage(victim, attacker, amount, meta = {}) {
    if (!victim.alive) return;
    victim.hp -= amount;
    victim.lastDamagedTime = this.time;
    victim.lastHitBy = attacker.id;

    if (!victim.assistList.find(a => a.id === attacker.id)) {
      victim.assistList.push({ id: attacker.id, time: this.time });
    } else {
      victim.assistList.find(a => a.id === attacker.id).time = this.time;
    }

    if (victim.hp <= 0) {
      this._killPudge(victim, attacker, meta);
    }
  }

  _killPudge(victim, killer, meta = {}) {
    victim.alive = false;
    victim.hp = 0;
    victim.deaths += 1;
    victim.respawnTimer = BALANCE.RESPAWN_TIME;
    victim.grabbedByHookId = null;
    victim.moveTarget = null;

    // Release victim's active hook if any
    if (victim.activeHookId) {
      const vh = this.hooks.find(h => h.id === victim.activeHookId);
      if (vh) vh.state = 'retracting';
    }

    // Blood stain on ground
    this.bloodStains.push({ x: victim.x, y: victim.y, r: randRange(18, 30, this.rng), alpha: 0.65 });
    if (this.bloodStains.length > 35) this.bloodStains.shift();
    this._spawnParticles(victim.x, victim.y, '#b71c1c', 26, 220);

    // Rewards
    const endedStreak = victim.streak >= 3 ? victim.streak : 0;
    victim.streak = 0;

    killer.kills += 1;
    killer.streak += 1;
    let reward = BALANCE.KILL_GOLD + (endedStreak * BALANCE.STREAK_BONUS_STEP);
    if (meta.bounces > 0) {
      killer.ricochetKills += 1;
      reward += BALANCE.RICOCHET_KILL_GOLD;
    }
    killer.gold += reward;

    // Assists
    for (const a of victim.assistList) {
      if (a.id === killer.id) continue;
      const ally = this.pudges.find(p => p.id === a.id);
      if (ally) {
        ally.assists += 1;
        ally.gold += BALANCE.ASSIST_GOLD;
      }
    }
    victim.assistList = [];

    // Team score
    this.scores[killer.team] += 1;

    const isFirstBlood = !this.firstBloodTaken;
    if (isFirstBlood) {
      this.firstBloodTaken = true;
      killer.gold += 60;
    }

    this.onEvent({
      type: 'kill',
      killer, victim,
      isFirstBlood,
      isHeadshot: !!meta.isHeadshot,
      bounces: meta.bounces || 0,
      streak: killer.streak,
      reward
    });

    if (this.scores[killer.team] >= this.killGoal) {
      this.winner = killer.team;
      this.onEvent({ type: 'gameover', winner: this.winner });
    }
  }

  _respawnPudge(p) {
    p.alive = true;
    p.hp = p.maxHp;
    p.x = p.spawnX;
    p.y = p.spawnY;
    p.vx = 0; p.vy = 0;
    p.shieldTimer = BALANCE.SPAWN_SHIELD_TIME;
    p.grabbedByHookId = null;
    p.moveTarget = null;
    this._spawnParticles(p.x, p.y, '#4ce07a', 14, 130);
  }

  _trySpawnRune() {
    if (this.runes.length >= BALANCE.RUNE_MAX_ACTIVE) return;
    const occupied = new Set(this.runes.map(r => r.spotIdx));
    const freeSpots = [0, 1, 2].filter(idx => !occupied.has(idx));
    if (freeSpots.length === 0) return;
    const spotIdx = freeSpots[Math.floor(this.rng() * freeSpots.length)];
    const spot = BALANCE.RUNE_SPOTS[spotIdx];
    const tpl = RUNE_TYPES[Math.floor(this.rng() * RUNE_TYPES.length)];
    const rune = {
      id: `rune_${Math.floor(this.time * 1000)}_${spotIdx}`,
      spotIdx,
      type: tpl.id,
      name: tpl.name,
      color: tpl.color,
      icon: tpl.icon,
      duration: tpl.duration,
      x: spot.x,
      y: spot.y,
      grabbedBy: null,
      pulse: 0
    };
    this.runes.push(rune);
    this.onEvent({ type: 'rune_spawn', rune });
  }

  _applyRune(p, rune) {
    p.gold += BALANCE.RUNE_GOLD;
    if (rune.type === 'bounty') {
      p.gold += 110;
      this._addFloatText(p.x, p.y - 30, '+145 G 赏金!', '#ffd54f', 16);
    } else if (rune.type === 'regen') {
      p.buffs.regen = rune.duration;
      p.hp = Math.min(p.maxHp, p.hp + 180);
      this._addFloatText(p.x, p.y - 30, '💚 恢复神符!', '#4ce07a', 15);
    } else {
      p.buffs[rune.type] = rune.duration;
      this._addFloatText(p.x, p.y - 30, `${rune.icon} ${rune.name}!`, rune.color, 15);
    }
    this._spawnParticles(p.x, p.y, rune.color, 16, 150);
    this.onEvent({ type: 'rune_pickup', pudge: p, rune });
  }

  _spawnParticles(x, y, color, count, speed) {
    for (let i = 0; i < count; i++) {
      const a = this.rng() * Math.PI * 2;
      const s = (0.3 + this.rng() * 0.7) * speed;
      this.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        color, r: randRange(2, 4.5, this.rng), life: randRange(0.25, 0.55, this.rng), maxLife: 0.55
      });
    }
    if (this.particles.length > 260) {
      this.particles.splice(0, this.particles.length - 260);
    }
  }

  _addFloatText(x, y, text, color, size = 14) {
    this.floatTexts.push({ x, y, text, color, size, life: 1.0, maxLife: 1.0 });
  }

  _updateEffects(dt) {
    for (const r of this.runes) r.pulse += dt * 3.5;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.92; pt.vy *= 0.92;
      pt.life -= dt;
      if (pt.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.slashEffects.length - 1; i >= 0; i--) {
      this.slashEffects[i].life -= dt;
      if (this.slashEffects[i].life <= 0) this.slashEffects.splice(i, 1);
    }
    for (let i = this.floatTexts.length - 1; i >= 0; i--) {
      const ft = this.floatTexts[i];
      ft.y -= 34 * dt;
      ft.life -= dt;
      if (ft.life <= 0) this.floatTexts.splice(i, 1);
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BALANCE, RUNE_TYPES, PudgeWarsEngine, clamp, dist, randRange };
}
