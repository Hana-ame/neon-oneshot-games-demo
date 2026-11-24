import {
  GRID_SIZE,
  TILE_SIZE,
  FIELD_SIZE,
  TANK_SIZE,
  DIR,
  DIR_VECTORS,
  TILE,
  GAME_STATE,
  ENEMY_TYPE,
  ENEMY_SPECS,
  POWERUP_TYPE,
  POWERUP_LIST,
  POWERUP_SCORE,
  EXTRA_LIFE_SCORE,
  TIMINGS,
  MAX_ACTIVE_ENEMIES_1P,
  MAX_ACTIVE_ENEMIES_2P,
  BASE_TILES,
  BASE_WALL_TILES,
  ENEMY_SPAWN_POINTS,
  PLAYER_SPAWN_POINTS,
  BONUS_ENEMY_INDICES,
} from './constants.js';
import { getStageConfig, STAGES } from './maps.js';
import {
  Tank,
  Bullet,
  PowerUp,
  Explosion,
  FloatingText,
  SpawnEffect,
  rectsOverlap,
  resetEntityIdCounter,
} from './entities.js';

export class BattleCityEngine {
  constructor({ onSound = () => {}, rng = Math.random, highScore = 20000 } = {}) {
    this.onSound = onSound;
    this.rng = rng;
    this.highScore = highScore;

    this.state = GAME_STATE.MENU;
    this.playerCount = 1;
    this.selectedStage = 1;
    this.stageNumber = 1;
    this.stageName = STAGES[0].name;

    this.grid = [];
    this.players = [];
    this.playerMeta = []; // { lives, score, nextExtraLife, level, kills: { BASIC, FAST, POWER, ARMOR } }
    this.enemies = [];
    this.enemyQueue = [];
    this.enemiesSpawnedCount = 0;
    this.bullets = [];
    this.powerUps = [];
    this.explosions = [];
    this.floatingTexts = [];
    this.spawnEffects = [];

    this.baseAlive = true;
    this.enemyFreezeTimer = 0;
    this.shovelTimer = 0;
    this.enemySpawnTimer = 0;
    this.spawnPointCursor = 0;
    this.stateTimer = 0;
    this.gameOverBannerY = FIELD_SIZE + 40;
    this.time = 0;

    // Input state per player: { up, down, left, right, fire }
    this.inputs = [
      { up: false, down: false, left: false, right: false, fire: false },
      { up: false, down: false, left: false, right: false, fire: false },
    ];
  }

  startNewGame({ playerCount = 1, startStage = 1 } = {}) {
    resetEntityIdCounter();
    this.playerCount = playerCount === 2 ? 2 : 1;
    this.selectedStage = Math.max(1, startStage);
    this.stageNumber = this.selectedStage;

    this.playerMeta = Array.from({ length: this.playerCount }, () => ({
      lives: 3,
      score: 0,
      nextExtraLife: EXTRA_LIFE_SCORE,
      level: 0,
      kills: {
        [ENEMY_TYPE.BASIC]: 0,
        [ENEMY_TYPE.FAST]: 0,
        [ENEMY_TYPE.POWER]: 0,
        [ENEMY_TYPE.ARMOR]: 0,
      },
    }));

    this.loadStage(this.stageNumber);
  }

  loadStage(stageNumber) {
    const cfg = getStageConfig(stageNumber);
    this.stageNumber = cfg.id;
    this.stageName = cfg.name;
    this.grid = cfg.grid;
    this.enemyQueue = cfg.enemies;
    this.enemiesSpawnedCount = 0;

    this.players = [];
    this.enemies = [];
    this.bullets = [];
    this.powerUps = [];
    this.explosions = [];
    this.floatingTexts = [];
    this.spawnEffects = [];

    this.baseAlive = true;
    this.enemyFreezeTimer = 0;
    this.shovelTimer = 0;
    this.enemySpawnTimer = 0.5;
    this.spawnPointCursor = 0;
    this.stateTimer = TIMINGS.STAGE_INTRO_DURATION;
    this.gameOverBannerY = FIELD_SIZE + 40;
    this.state = GAME_STATE.STAGE_INTRO;

    // Reset per-stage kill tally
    for (const meta of this.playerMeta) {
      meta.kills = {
        [ENEMY_TYPE.BASIC]: 0,
        [ENEMY_TYPE.FAST]: 0,
        [ENEMY_TYPE.POWER]: 0,
        [ENEMY_TYPE.ARMOR]: 0,
      };
    }

    // Spawn players who still have lives
    for (let i = 0; i < this.playerCount; i++) {
      if (this.playerMeta[i].lives > 0) {
        this._spawnPlayerImmediate(i);
      }
    }

    this.onSound('stage_start');
  }

  _spawnPlayerImmediate(playerIndex) {
    const pt = PLAYER_SPAWN_POINTS[playerIndex];
    const meta = this.playerMeta[playerIndex];
    const tank = new Tank({
      x: pt.x,
      y: pt.y,
      dir: DIR.UP,
      isPlayer: true,
      playerIndex,
      level: meta.level,
    });
    this.players[playerIndex] = tank;
  }

  setInput(playerIndex, action, pressed) {
    if (playerIndex < 0 || playerIndex >= this.inputs.length) return;
    if (action in this.inputs[playerIndex]) {
      this.inputs[playerIndex][action] = Boolean(pressed);
    }
  }

  clearInputs() {
    for (const inp of this.inputs) {
      inp.up = false;
      inp.down = false;
      inp.left = false;
      inp.right = false;
      inp.fire = false;
    }
  }

  togglePause() {
    if (this.state === GAME_STATE.PLAYING) {
      this.state = GAME_STATE.PAUSED;
      this.onSound('pause');
    } else if (this.state === GAME_STATE.PAUSED) {
      this.state = GAME_STATE.PLAYING;
      this.onSound('pause');
    }
  }

  returnToMenu() {
    this.clearInputs();
    this.state = GAME_STATE.MENU;
  }

  nextStage() {
    this.loadStage(this.stageNumber + 1);
  }

  getTotalScore() {
    return this.playerMeta.reduce((sum, m) => sum + m.score, 0);
  }

  getRemainingEnemiesCount() {
    const queued = this.enemyQueue.length;
    const spawning = this.spawnEffects.filter((s) => !s.isPlayer && !s.done).length;
    const active = this.enemies.filter((e) => e.alive).length;
    return queued + spawning + active;
  }

  addScore(playerIndex, points, popupX = null, popupY = null) {
    const meta = this.playerMeta[playerIndex];
    if (!meta) return;
    meta.score += points;
    if (meta.score > this.highScore) {
      this.highScore = meta.score;
    }
    while (meta.score >= meta.nextExtraLife) {
      meta.lives += 1;
      meta.nextExtraLife += EXTRA_LIFE_SCORE;
      this.onSound('extra_life');
      if (popupX !== null && popupY !== null) {
        this.floatingTexts.push(new FloatingText({ x: popupX, y: popupY - 12, text: '1UP', color: '#4ade80' }));
      }
    }
    if (popupX !== null && popupY !== null) {
      this.floatingTexts.push(new FloatingText({ x: popupX, y: popupY, text: `${points}`, color: '#fef08a' }));
    }
  }

  update(rawDt) {
    const dt = Math.min(Math.max(rawDt, 0), 0.05);
    this.time += dt;

    if (this.state === GAME_STATE.MENU || this.state === GAME_STATE.PAUSED) {
      return;
    }

    if (this.state === GAME_STATE.STAGE_INTRO) {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        this.state = GAME_STATE.PLAYING;
      }
      return;
    }

    if (this.state === GAME_STATE.STAGE_CLEAR) {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) {
        this.nextStage();
      }
      return;
    }

    if (this.state === GAME_STATE.GAME_OVER) {
      if (this.gameOverBannerY > FIELD_SIZE / 2 - 20) {
        this.gameOverBannerY = Math.max(FIELD_SIZE / 2 - 20, this.gameOverBannerY - 110 * dt);
      }
      this._updateEffects(dt);
      return;
    }

    // PLAYING state
    this._updateTimers(dt);
    this._updateSpawns(dt);
    this._updatePlayers(dt);
    this._updateEnemies(dt);
    this._updateBullets(dt);
    this._updatePowerUps(dt);
    this._updateEffects(dt);
    this._checkWinLoss(dt);
  }

  _updateTimers(dt) {
    if (this.enemyFreezeTimer > 0) {
      this.enemyFreezeTimer = Math.max(0, this.enemyFreezeTimer - dt);
    }

    if (this.shovelTimer > 0) {
      this.shovelTimer = Math.max(0, this.shovelTimer - dt);
      if (this.shovelTimer === 0) {
        this._setBaseWallTile(TILE.BRICK);
      } else if (this.shovelTimer <= TIMINGS.SHOVEL_WARN_DURATION) {
        // Blink between brick and steel in the last 3 seconds
        const blinkSteel = Math.floor(this.shovelTimer * 6) % 2 === 0;
        this._setBaseWallTile(blinkSteel ? TILE.STEEL : TILE.BRICK);
      }
    }
  }

  _setBaseWallTile(tileType) {
    for (const { r, c } of BASE_WALL_TILES) {
      this.grid[r][c] = tileType;
    }
  }

  _updateSpawns(dt) {
    // Advance active spawn animations
    for (const sp of this.spawnEffects) {
      sp.update(dt);
      if (sp.done) {
        if (sp.isPlayer) {
          this._spawnPlayerImmediate(sp.playerIndex);
        } else {
          const enemy = new Tank({
            x: sp.x,
            y: sp.y,
            dir: DIR.DOWN,
            isPlayer: false,
            enemyType: sp.enemyType,
            isBonus: sp.isBonus,
          });
          this.enemies.push(enemy);
        }
      }
    }
    this.spawnEffects = this.spawnEffects.filter((sp) => !sp.done);

    // Spawn new enemies from queue
    const maxActive = this.playerCount === 2 ? MAX_ACTIVE_ENEMIES_2P : MAX_ACTIVE_ENEMIES_1P;
    const activeOrSpawning =
      this.enemies.filter((e) => e.alive).length +
      this.spawnEffects.filter((s) => !s.isPlayer).length;

    if (this.enemyQueue.length > 0 && activeOrSpawning < maxActive) {
      this.enemySpawnTimer -= dt;
      if (this.enemySpawnTimer <= 0) {
        const pt = ENEMY_SPAWN_POINTS[this.spawnPointCursor % ENEMY_SPAWN_POINTS.length];
        const spawnRect = { x: pt.x, y: pt.y, width: TANK_SIZE, height: TANK_SIZE };
        const blocked = this._getAllAliveTanks().some((t) => rectsOverlap(spawnRect, t));
        if (!blocked) {
          const enemyType = this.enemyQueue.shift();
          const isBonus = BONUS_ENEMY_INDICES.includes(this.enemiesSpawnedCount);
          this.enemiesSpawnedCount += 1;
          this.spawnPointCursor += 1;
          this.spawnEffects.push(
            new SpawnEffect({
              x: pt.x,
              y: pt.y,
              isPlayer: false,
              enemyType,
              isBonus,
            })
          );
          this.enemySpawnTimer = TIMINGS.ENEMY_SPAWN_INTERVAL;
        } else {
          // Try next spawn point quickly
          this.spawnPointCursor += 1;
          this.enemySpawnTimer = 0.4;
        }
      }
    }
  }

  _updatePlayers(dt) {
    for (let i = 0; i < this.playerCount; i++) {
      const tank = this.players[i];
      if (!tank || !tank.alive) continue;

      if (tank.shieldTimer > 0) {
        tank.shieldTimer = Math.max(0, tank.shieldTimer - dt);
      }
      if (tank.fireCooldown > 0) {
        tank.fireCooldown = Math.max(0, tank.fireCooldown - dt);
      }

      const inp = this.inputs[i];
      let desiredDir = null;
      if (inp.up) desiredDir = DIR.UP;
      else if (inp.down) desiredDir = DIR.DOWN;
      else if (inp.left) desiredDir = DIR.LEFT;
      else if (inp.right) desiredDir = DIR.RIGHT;

      const onIce = this._isTankOnTile(tank, TILE.ICE);

      if (desiredDir !== null) {
        if (tank.dir !== desiredDir) {
          this._snapTankForTurn(tank, desiredDir);
          tank.dir = desiredDir;
        }
        tank.moving = true;
        tank.iceSlideTimer = onIce ? 0.35 : 0;
        this._moveTank(tank, dt);
      } else if (tank.iceSlideTimer > 0 && onIce) {
        tank.iceSlideTimer = Math.max(0, tank.iceSlideTimer - dt);
        tank.moving = true;
        this._moveTank(tank, dt * 0.75);
      } else {
        tank.moving = false;
      }

      if (inp.fire) {
        this.tryFire(tank);
      }
    }
  }

  _updateEnemies(dt) {
    const frozen = this.enemyFreezeTimer > 0;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      if (enemy.hitFlashTimer > 0) {
        enemy.hitFlashTimer = Math.max(0, enemy.hitFlashTimer - dt);
      }
      if (frozen) {
        enemy.moving = false;
        continue;
      }

      if (enemy.fireCooldown > 0) {
        enemy.fireCooldown = Math.max(0, enemy.fireCooldown - dt);
      }
      enemy.aiDecisionTimer -= dt;

      const moved = this._moveTank(enemy, dt);
      enemy.moving = moved;

      if (!moved || enemy.aiDecisionTimer <= 0) {
        enemy.dir = this._chooseEnemyDirection(enemy, !moved);
        enemy.aiDecisionTimer = 0.7 + this.rng() * 1.6;
      }

      if (enemy.fireCooldown <= 0) {
        this.tryFire(enemy);
        const spec = ENEMY_SPECS[enemy.enemyType];
        enemy.fireCooldown = spec.fireInterval * (0.75 + this.rng() * 0.6);
      }
    }
    this.enemies = this.enemies.filter((e) => e.alive);
  }

  _chooseEnemyDirection(enemy, wasBlocked) {
    const dirs = [DIR.UP, DIR.RIGHT, DIR.DOWN, DIR.LEFT];
    // Slight bias toward moving DOWN or toward the base X coordinate
    const baseCenterX = 13 * TILE_SIZE;
    const candidates = dirs.filter((d) => !(wasBlocked && d === enemy.dir));
    if (this.rng() < 0.42) {
      if (enemy.y < FIELD_SIZE - 80 && candidates.includes(DIR.DOWN)) {
        return DIR.DOWN;
      }
      const towardBase = enemy.x < baseCenterX ? DIR.RIGHT : DIR.LEFT;
      if (candidates.includes(towardBase)) {
        return towardBase;
      }
    }
    const idx = Math.floor(this.rng() * candidates.length);
    return candidates[idx] ?? DIR.DOWN;
  }

  /**
   * Classic Battle City turning assist: gently aligns perpendicular axis to nearest
   * half-tile (16px) corridor when within 8px so tanks never snag on brick corners.
   */
  _snapTankForTurn(tank, newDir) {
    const vertical = newDir === DIR.UP || newDir === DIR.DOWN;
    const oldVertical = tank.dir === DIR.UP || tank.dir === DIR.DOWN;
    if (vertical === oldVertical) return;

    if (vertical) {
      const snappedX = Math.round((tank.x - 2) / TILE_SIZE) * TILE_SIZE + 2;
      if (Math.abs(snappedX - tank.x) <= 8) {
        const testRect = { x: snappedX, y: tank.y, width: tank.width, height: tank.height };
        if (this._canOccupy(testRect, tank.id)) {
          tank.x = snappedX;
        }
      }
    } else {
      const snappedY = Math.round((tank.y - 2) / TILE_SIZE) * TILE_SIZE + 2;
      if (Math.abs(snappedY - tank.y) <= 8) {
        const testRect = { x: tank.x, y: snappedY, width: tank.width, height: tank.height };
        if (this._canOccupy(testRect, tank.id)) {
          tank.y = snappedY;
        }
      }
    }
  }

  _moveTank(tank, dt) {
    const v = DIR_VECTORS[tank.dir];
    const dist = tank.speed * dt;
    const nx = tank.x + v.dx * dist;
    const ny = tank.y + v.dy * dist;
    const testRect = { x: nx, y: ny, width: tank.width, height: tank.height };

    if (this._canOccupy(testRect, tank.id)) {
      tank.x = nx;
      tank.y = ny;
      tank.trackAnim += dist * 0.25;
      return true;
    }
    return false;
  }

  _canOccupy(rect, ignoreTankId) {
    // Field bounds check
    if (
      rect.x < 0 ||
      rect.y < 0 ||
      rect.x + rect.width > FIELD_SIZE ||
      rect.y + rect.height > FIELD_SIZE
    ) {
      return false;
    }

    // Tile collision check
    const minC = Math.floor(rect.x / TILE_SIZE);
    const maxC = Math.floor((rect.x + rect.width - 0.01) / TILE_SIZE);
    const minR = Math.floor(rect.y / TILE_SIZE);
    const maxR = Math.floor((rect.y + rect.height - 0.01) / TILE_SIZE);

    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return false;
        const t = this.grid[r][c];
        if (
          t === TILE.BRICK ||
          t === TILE.STEEL ||
          t === TILE.WATER ||
          t === TILE.BASE ||
          t === TILE.BASE_DESTROYED
        ) {
          return false;
        }
      }
    }

    // Tank-to-tank collision check
    for (const other of this._getAllAliveTanks()) {
      if (other.id === ignoreTankId) continue;
      if (rectsOverlap(rect, other)) {
        return false;
      }
    }

    return true;
  }

  _isTankOnTile(tank, tileType) {
    const cx = tank.x + tank.width / 2;
    const cy = tank.y + tank.height / 2;
    const c = Math.floor(cx / TILE_SIZE);
    const r = Math.floor(cy / TILE_SIZE);
    if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return false;
    return this.grid[r][c] === tileType;
  }

  _getAllAliveTanks() {
    const list = [];
    for (const p of this.players) {
      if (p && p.alive) list.push(p);
    }
    for (const e of this.enemies) {
      if (e && e.alive) list.push(e);
    }
    return list;
  }

  tryFire(tank) {
    if (!tank || !tank.alive || tank.fireCooldown > 0) return false;
    const activeOwned = this.bullets.filter((b) => b.alive && b.ownerId === tank.id).length;
    if (activeOwned >= tank.maxBullets) return false;

    const muzzle = tank.getMuzzlePosition();
    const bullet = new Bullet({
      ownerId: tank.id,
      isPlayer: tank.isPlayer,
      playerIndex: tank.playerIndex,
      x: muzzle.x,
      y: muzzle.y,
      dir: tank.dir,
      speed: tank.bulletSpeed,
      canBreakSteel: tank.canBreakSteel,
    });
    this.bullets.push(bullet);
    tank.fireCooldown = tank.fireCooldownDuration;
    if (tank.isPlayer) {
      this.onSound('shoot');
    }
    return true;
  }

  _updateBullets(dt) {
    for (const b of this.bullets) {
      if (!b.alive) continue;
      b.step(dt);

      // Arena wall check
      if (
        b.x < 0 ||
        b.y < 0 ||
        b.x + b.width > FIELD_SIZE ||
        b.y + b.height > FIELD_SIZE
      ) {
        b.alive = false;
        this.explosions.push(new Explosion({ x: b.x + b.width / 2, y: b.y + b.height / 2, big: false }));
        if (b.isPlayer) this.onSound('hit_steel');
        continue;
      }

      // Tile collision check (with classic splash width across perpendicular sub-tile pair)
      if (this._handleBulletTileCollision(b)) {
        continue;
      }

      // Tank collision check
      this._handleBulletTankCollision(b);
    }

    // Bullet vs Bullet cancellation (opposing teams)
    for (let i = 0; i < this.bullets.length; i++) {
      const a = this.bullets[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < this.bullets.length; j++) {
        const b = this.bullets[j];
        if (!b.alive) continue;
        if (a.isPlayer !== b.isPlayer && rectsOverlap(a, b)) {
          a.alive = false;
          b.alive = false;
          this.explosions.push(new Explosion({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, big: false }));
          break;
        }
      }
    }

    this.bullets = this.bullets.filter((b) => b.alive);
  }

  _handleBulletTileCollision(b) {
    // Expand perpendicular hitbox slightly (like classic FC Battle City) so a bullet centered on a 2-tile wall carves both halves cleanly
    const vertical = b.dir === DIR.UP || b.dir === DIR.DOWN;
    const hitRect = {
      x: vertical ? b.x - 5 : b.x,
      y: vertical ? b.y : b.y - 5,
      width: vertical ? b.width + 10 : b.width,
      height: vertical ? b.height : b.height + 10,
    };

    const minC = Math.max(0, Math.floor(hitRect.x / TILE_SIZE));
    const maxC = Math.min(GRID_SIZE - 1, Math.floor((hitRect.x + hitRect.width - 0.01) / TILE_SIZE));
    const minR = Math.max(0, Math.floor(hitRect.y / TILE_SIZE));
    const maxR = Math.min(GRID_SIZE - 1, Math.floor((hitRect.y + hitRect.height - 0.01) / TILE_SIZE));

    let collided = false;
    let brokeBrick = false;
    let hitSteel = false;
    let hitBase = false;

    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        const t = this.grid[r][c];
        if (t === TILE.BRICK) {
          this.grid[r][c] = TILE.EMPTY;
          collided = true;
          brokeBrick = true;
        } else if (t === TILE.STEEL) {
          collided = true;
          if (b.canBreakSteel) {
            this.grid[r][c] = TILE.EMPTY;
            brokeBrick = true;
          } else {
            hitSteel = true;
          }
        } else if (t === TILE.BASE) {
          collided = true;
          hitBase = true;
        }
      }
    }

    if (collided) {
      b.alive = false;
      this.explosions.push(new Explosion({ x: b.x + b.width / 2, y: b.y + b.height / 2, big: false }));
      if (hitBase) {
        this._destroyBase();
      } else if (brokeBrick && b.isPlayer) {
        this.onSound('hit_brick');
      } else if (hitSteel && b.isPlayer) {
        this.onSound('hit_steel');
      }
      return true;
    }
    return false;
  }

  _handleBulletTankCollision(b) {
    if (b.isPlayer) {
      for (const enemy of this.enemies) {
        if (!enemy.alive) continue;
        if (rectsOverlap(b, enemy)) {
          b.alive = false;
          if (enemy.isBonus) {
            enemy.isBonus = false;
            this._spawnPowerUp();
          }
          enemy.hp -= 1;
          if (enemy.hp <= 0) {
            this._destroyEnemy(enemy, b.playerIndex);
          } else {
            enemy.hitFlashTimer = 0.14;
            this.onSound('hit_armor');
          }
          return;
        }
      }
    } else {
      for (const player of this.players) {
        if (!player || !player.alive) continue;
        if (rectsOverlap(b, player)) {
          b.alive = false;
          if (player.shieldTimer > 0) {
            this.onSound('hit_steel');
            return;
          }
          this._destroyPlayer(player);
          return;
        }
      }
    }
  }

  _destroyEnemy(enemy, playerIndex) {
    enemy.alive = false;
    const center = enemy.getCenter();
    this.explosions.push(new Explosion({ x: center.x, y: center.y, big: true }));
    this.onSound('explode_enemy');

    const spec = ENEMY_SPECS[enemy.enemyType];
    const meta = this.playerMeta[playerIndex];
    if (meta) {
      meta.kills[enemy.enemyType] = (meta.kills[enemy.enemyType] || 0) + 1;
      this.addScore(playerIndex, spec.score, center.x, center.y);
    }
  }

  _destroyPlayer(player) {
    player.alive = false;
    const center = player.getCenter();
    this.explosions.push(new Explosion({ x: center.x, y: center.y, big: true }));
    this.onSound('explode_player');

    const meta = this.playerMeta[player.playerIndex];
    meta.lives -= 1;
    meta.level = 0; // Lose firepower upgrades on death, matching FC Battle City

    if (meta.lives > 0) {
      const pt = PLAYER_SPAWN_POINTS[player.playerIndex];
      this.spawnEffects.push(
        new SpawnEffect({
          x: pt.x,
          y: pt.y,
          isPlayer: true,
          playerIndex: player.playerIndex,
        })
      );
    }
  }

  _destroyBase() {
    if (!this.baseAlive) return;
    this.baseAlive = false;
    for (const { r, c } of BASE_TILES) {
      this.grid[r][c] = TILE.BASE_DESTROYED;
    }
    this.explosions.push(new Explosion({ x: 13 * TILE_SIZE, y: 25 * TILE_SIZE, big: true }));
    this.onSound('explode_base');
    this._triggerGameOver();
  }

  _triggerGameOver() {
    if (this.state === GAME_STATE.GAME_OVER) return;
    this.state = GAME_STATE.GAME_OVER;
    this.clearInputs();
    this.gameOverBannerY = FIELD_SIZE + 28;
    this.onSound('game_over');
  }

  _spawnPowerUp(forcedType = null) {
    const type = forcedType || POWERUP_LIST[Math.floor(this.rng() * POWERUP_LIST.length)];
    // Find a valid location not overlapping base or edges
    let x = 4 * TILE_SIZE;
    let y = 4 * TILE_SIZE;
    for (let tries = 0; tries < 40; tries++) {
      const c = 2 + Math.floor(this.rng() * (GRID_SIZE - 5));
      const r = 2 + Math.floor(this.rng() * (GRID_SIZE - 6));
      if (this.grid[r][c] === TILE.EMPTY || this.grid[r][c] === TILE.FOREST || this.grid[r][c] === TILE.ICE) {
        x = c * TILE_SIZE + 2;
        y = r * TILE_SIZE + 2;
        break;
      }
    }
    // Classic rule: only one power-up on field at a time
    this.powerUps = [new PowerUp({ type, x, y })];
    this.onSound('powerup_spawn');
  }

  _updatePowerUps(dt) {
    for (const pwr of this.powerUps) {
      if (!pwr.alive) continue;
      pwr.timer -= dt;
      if (pwr.timer <= 0) {
        pwr.alive = false;
        continue;
      }
      for (const player of this.players) {
        if (!player || !player.alive) continue;
        if (rectsOverlap(player, pwr)) {
          this.applyPowerUp(player, pwr);
          pwr.alive = false;
          break;
        }
      }
    }
    this.powerUps = this.powerUps.filter((p) => p.alive);
  }

  applyPowerUp(player, powerUp) {
    const center = { x: powerUp.x + powerUp.width / 2, y: powerUp.y + powerUp.height / 2 };
    this.addScore(player.playerIndex, POWERUP_SCORE, center.x, center.y);
    this.onSound('powerup_pickup');

    switch (powerUp.type) {
      case POWERUP_TYPE.HELMET:
        player.shieldTimer = TIMINGS.HELMET_DURATION;
        break;
      case POWERUP_TYPE.CLOCK:
        this.enemyFreezeTimer = TIMINGS.CLOCK_DURATION;
        break;
      case POWERUP_TYPE.SHOVEL:
        this.shovelTimer = TIMINGS.SHOVEL_DURATION;
        this._setBaseWallTile(TILE.STEEL);
        break;
      case POWERUP_TYPE.STAR:
        player.upgrade();
        this.playerMeta[player.playerIndex].level = player.level;
        break;
      case POWERUP_TYPE.GRENADE:
        for (const enemy of this.enemies) {
          if (enemy.alive) {
            this._destroyEnemy(enemy, player.playerIndex);
          }
        }
        break;
      case POWERUP_TYPE.TANK:
        this.playerMeta[player.playerIndex].lives += 1;
        this.onSound('extra_life');
        this.floatingTexts.push(new FloatingText({ x: center.x, y: center.y - 14, text: '1UP', color: '#4ade80' }));
        break;
      default:
        break;
    }
  }

  _updateEffects(dt) {
    for (const exp of this.explosions) exp.update(dt);
    this.explosions = this.explosions.filter((e) => e.alive);

    for (const txt of this.floatingTexts) txt.update(dt);
    this.floatingTexts = this.floatingTexts.filter((t) => t.alive);
  }

  _checkWinLoss(dt) {
    // Check if all players are out of lives and dead
    const anyPlayerRemaining = this.playerMeta.some((m, idx) => {
      const tank = this.players[idx];
      const spawning = this.spawnEffects.some((s) => s.isPlayer && s.playerIndex === idx);
      return m.lives > 0 || (tank && tank.alive) || spawning;
    });

    if (!anyPlayerRemaining) {
      this._triggerGameOver();
      return;
    }

    // Check stage clear: all 20 enemies defeated
    if (this.getRemainingEnemiesCount() === 0) {
      this.state = GAME_STATE.STAGE_CLEAR;
      this.stateTimer = TIMINGS.STAGE_CLEAR_DELAY;
      this.clearInputs();
    }
  }
}
