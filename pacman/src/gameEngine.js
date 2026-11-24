/**
 * 确定性街机游戏核心引擎（无 DOM 依赖，支持在 Node.js 中直接单元测试与集成测试）
 */

import {
  DIR,
  FRUIT_SPAWN,
  GAME_STATE,
  GHOST_CONFIGS,
  GHOST_HOUSE_CENTER,
  GHOST_HOUSE_EXIT,
  GHOST_MODE,
  MAZE_COLS,
  OPPOSITE_DIR,
  PACMAN_START,
  SCORE,
  TILE,
  getLevelConfig,
} from './constants.js';
import { Maze } from './maze.js';
import {
  chooseGhostDirection,
  computeGhostTargetTile,
  getScheduledGlobalMode,
  squaredDistance,
} from './ghostAI.js';

export class PacmanGameEngine {
  constructor(options = {}) {
    this.rng = options.rng || Math.random;
    this.onEvent = options.onEvent || (() => {});
    this.maze = new Maze();
    this.highScore = options.highScore || 0;
    this.resetGame();
  }

  resetGame() {
    this.score = 0;
    this.lives = 3;
    this.level = 1;
    this.extraLifeAwarded = false;
    this.state = GAME_STATE.TITLE;
    this.stateTimer = 0;
    this.waveTimer = 0;
    this.globalGhostMode = GHOST_MODE.SCATTER;
    this.frightenedTimer = 0;
    this.ghostCombo = 0;
    this.fruit = null;
    this.fruitSpawnedStages = new Set();
    this.popups = [];
    this.maze.reset();
    this.levelConfig = getLevelConfig(this.level);
    this._resetEntities();
  }

  startGame() {
    this.resetGame();
    this.state = GAME_STATE.READY;
    this.stateTimer = 1.6;
    this._emit('GAME_START', { level: this.level });
  }

  togglePause() {
    if (this.state === GAME_STATE.PLAYING) {
      this.state = GAME_STATE.PAUSED;
      this._emit('PAUSE', { paused: true });
    } else if (this.state === GAME_STATE.PAUSED) {
      this.state = GAME_STATE.PLAYING;
      this._emit('PAUSE', { paused: false });
    }
  }

  setInputDirection(dir) {
    if (!dir || dir.name === 'NONE') return;
    this.pacman.nextDir = dir;
  }

  _emit(type, payload = {}) {
    this.onEvent({ type, ...payload });
  }

  _resetEntities() {
    this.pacman = {
      col: PACMAN_START.col,
      row: PACMAN_START.row,
      dir: DIR.LEFT,
      nextDir: DIR.LEFT,
      mouthPhase: 0,
      moving: false,
    };

    this.ghosts = GHOST_CONFIGS.map((cfg) => ({
      id: cfg.id,
      name: cfg.name,
      cnName: cfg.cnName,
      color: cfg.color,
      col: cfg.startTile.col,
      row: cfg.startTile.row,
      dir: cfg.startInHouse ? DIR.UP : DIR.LEFT,
      mode: cfg.startInHouse ? GHOST_MODE.HOUSE : GHOST_MODE.SCATTER,
      scatterTarget: { ...cfg.scatterTarget },
      releaseTimer: cfg.releaseDelay,
      lastDecisionKey: null,
    }));

    this.frightenedTimer = 0;
    this.ghostCombo = 0;
    this.waveTimer = 0;
    this.globalGhostMode = GHOST_MODE.SCATTER;
  }

  _addScore(points, popupCol = null, popupRow = null, popupColor = '#ffe66d') {
    this.score += points;
    if (this.score > this.highScore) {
      this.highScore = this.score;
    }
    if (!this.extraLifeAwarded && this.score >= SCORE.EXTRA_LIFE_THRESHOLD) {
      this.extraLifeAwarded = true;
      this.lives++;
      this._emit('EXTRA_LIFE', { lives: this.lives });
    }
    if (popupCol !== null && popupRow !== null) {
      this.popups.push({
        text: `+${points}`,
        col: popupCol,
        row: popupRow,
        color: popupColor,
        ttl: 1.0,
      });
    }
  }

  /**
   * 固定步长推进游戏状态
   * @param {number} dt 秒（推荐 1/60）
   */
  update(dt) {
    const step = Math.min(Math.max(dt, 0), 0.05);

    // 更新飘字特效
    for (let i = this.popups.length - 1; i >= 0; i--) {
      this.popups[i].ttl -= step;
      this.popups[i].row -= step * 0.8;
      if (this.popups[i].ttl <= 0) {
        this.popups.splice(i, 1);
      }
    }

    if (this.state === GAME_STATE.TITLE || this.state === GAME_STATE.PAUSED || this.state === GAME_STATE.GAME_OVER) {
      return;
    }

    if (this.state === GAME_STATE.READY) {
      this.stateTimer -= step;
      if (this.stateTimer <= 0) {
        this.state = GAME_STATE.PLAYING;
        this._emit('PLAY_BEGIN', { level: this.level });
      }
      return;
    }

    if (this.state === GAME_STATE.DYING) {
      this.stateTimer -= step;
      if (this.stateTimer <= 0) {
        if (this.lives <= 0) {
          this.state = GAME_STATE.GAME_OVER;
          this._emit('GAME_OVER', { score: this.score, highScore: this.highScore });
        } else {
          this._resetEntities();
          this.state = GAME_STATE.READY;
          this.stateTimer = 1.4;
        }
      }
      return;
    }

    if (this.state === GAME_STATE.LEVEL_CLEAR) {
      this.stateTimer -= step;
      if (this.stateTimer <= 0) {
        this.level++;
        this.levelConfig = getLevelConfig(this.level);
        this.maze.reset();
        this.fruit = null;
        this.fruitSpawnedStages.clear();
        this._resetEntities();
        this.state = GAME_STATE.READY;
        this.stateTimer = 1.6;
        this._emit('LEVEL_START', { level: this.level });
      }
      return;
    }

    // PLAYING 状态更新
    this._updateModeTimers(step);
    this._updatePacman(step);
    this._checkPelletAndFruit();
    this._updateGhosts(step);
    this._checkGhostCollisions();
  }

  _updateModeTimers(dt) {
    if (this.frightenedTimer > 0) {
      this.frightenedTimer = Math.max(0, this.frightenedTimer - dt);
      if (this.frightenedTimer === 0) {
        this.ghostCombo = 0;
        for (const ghost of this.ghosts) {
          if (ghost.mode === GHOST_MODE.FRIGHTENED) {
            ghost.mode = this.globalGhostMode;
          }
        }
      }
    } else {
      this.waveTimer += dt;
      const nextGlobal = getScheduledGlobalMode(this.waveTimer, this.levelConfig.waveSchedule);
      if (nextGlobal !== this.globalGhostMode) {
        this.globalGhostMode = nextGlobal;
        for (const ghost of this.ghosts) {
          if (ghost.mode === GHOST_MODE.SCATTER || ghost.mode === GHOST_MODE.CHASE) {
            ghost.mode = nextGlobal;
            ghost.dir = OPPOSITE_DIR[ghost.dir.name] || ghost.dir;
            ghost.lastDecisionKey = null;
          }
        }
      }
    }

    if (this.fruit) {
      this.fruit.ttl -= dt;
      if (this.fruit.ttl <= 0) {
        this.fruit = null;
      }
    }
  }

  _updatePacman(dt) {
    const p = this.pacman;
    const speed = this.levelConfig.pacmanSpeed;
    const moveDist = speed * dt;

    // 尝试立即反向
    if (p.nextDir.name === OPPOSITE_DIR[p.dir.name]?.name) {
      p.dir = p.nextDir;
    }

    const tileCol = Math.round(p.col);
    const tileRow = Math.round(p.row);
    const nearCenterX = Math.abs(p.col - tileCol) <= Math.max(0.14, moveDist * 1.1);
    const nearCenterY = Math.abs(p.row - tileRow) <= Math.max(0.14, moveDist * 1.1);

    // 预输入转弯缓冲
    if (p.nextDir.name !== p.dir.name && nearCenterX && nearCenterY) {
      if (this.maze.isWalkable(tileCol + p.nextDir.x, tileRow + p.nextDir.y, false)) {
        p.col = tileCol;
        p.row = tileRow;
        p.dir = p.nextDir;
      }
    }

    // 沿当前方向推进
    const targetCol = p.col + p.dir.x * moveDist;
    const targetRow = p.row + p.dir.y * moveDist;

    // 前方格碰撞检测
    const checkCol = p.dir.x > 0 ? Math.floor(targetCol + 0.49) : p.dir.x < 0 ? Math.ceil(targetCol - 0.49) : tileCol;
    const checkRow = p.dir.y > 0 ? Math.floor(targetRow + 0.49) : p.dir.y < 0 ? Math.ceil(targetRow - 0.49) : tileRow;

    if (this.maze.isWalkable(checkCol, checkRow, false)) {
      p.col = targetCol;
      p.row = targetRow;
      // 保持正交轴对齐，防止微小偏移卡墙
      if (p.dir.x !== 0) p.row = tileRow;
      if (p.dir.y !== 0) p.col = tileCol;
      p.moving = true;
      p.mouthPhase = (p.mouthPhase + dt * 11) % (Math.PI * 2);
    } else {
      // 贴齐当前格中心停下
      p.col = tileCol;
      p.row = tileRow;
      p.moving = false;
    }

    // 左右隧道穿越
    if (p.col < -0.5) p.col += MAZE_COLS;
    if (p.col >= MAZE_COLS - 0.5) p.col -= MAZE_COLS;
  }

  _checkPelletAndFruit() {
    const col = Math.round(this.pacman.col);
    const row = Math.round(this.pacman.row);
    const eaten = this.maze.consumePellet(col, row);

    if (eaten === TILE.PELLET) {
      this._addScore(SCORE.PELLET);
      this._emit('PELLET_EATEN', { col, row, score: this.score });
    } else if (eaten === TILE.POWER) {
      this._addScore(SCORE.POWER_PELLET);
      this.frightenedTimer = this.levelConfig.frightenedDuration;
      this.ghostCombo = 0;
      for (const ghost of this.ghosts) {
        if (ghost.mode === GHOST_MODE.SCATTER || ghost.mode === GHOST_MODE.CHASE || ghost.mode === GHOST_MODE.FRIGHTENED) {
          ghost.mode = GHOST_MODE.FRIGHTENED;
          ghost.dir = OPPOSITE_DIR[ghost.dir.name] || ghost.dir;
          ghost.lastDecisionKey = null;
        }
      }
      this._emit('POWER_PELLET', { col, row, duration: this.frightenedTimer });
    }

    // 奖励水果触发（吃满 70 颗与 170 颗豆子时出现）
    const consumed = this.maze.getConsumedCount();
    if ((consumed === 70 || consumed === 170) && !this.fruitSpawnedStages.has(consumed)) {
      this.fruitSpawnedStages.add(consumed);
      this.fruit = {
        ...this.levelConfig.fruit,
        col: FRUIT_SPAWN.col,
        row: FRUIT_SPAWN.row,
        ttl: 9.5,
      };
      this._emit('FRUIT_SPAWN', { fruit: this.fruit });
    }

    if (this.fruit) {
      if (squaredDistance(this.pacman.col, this.pacman.row, this.fruit.col, this.fruit.row) < 0.45) {
        const pts = this.fruit.points;
        this._addScore(pts, this.fruit.col, this.fruit.row, this.fruit.color);
        this._emit('FRUIT_EATEN', { fruit: this.fruit, points: pts });
        this.fruit = null;
      }
    }

    // 清空全部豆子通关
    if (this.maze.remainingPellets === 0) {
      this.state = GAME_STATE.LEVEL_CLEAR;
      this.stateTimer = 2.2;
      this._emit('LEVEL_CLEAR', { level: this.level, score: this.score });
    }
  }

  _updateGhosts(dt) {
    const blinky = this.ghosts[0];

    for (const ghost of this.ghosts) {
      if (ghost.mode === GHOST_MODE.HOUSE) {
        ghost.releaseTimer -= dt;
        if (ghost.releaseTimer <= 0) {
          // 沿中心上移出幽灵屋
          const dx = GHOST_HOUSE_EXIT.col - ghost.col;
          const step = 3.6 * dt;
          if (Math.abs(dx) > step) {
            ghost.col += Math.sign(dx) * step;
          } else {
            ghost.col = GHOST_HOUSE_EXIT.col;
            if (ghost.row > GHOST_HOUSE_EXIT.row) {
              ghost.row = Math.max(GHOST_HOUSE_EXIT.row, ghost.row - step);
            } else {
              ghost.row = GHOST_HOUSE_EXIT.row;
              ghost.mode = this.frightenedTimer > 0 ? GHOST_MODE.FRIGHTENED : this.globalGhostMode;
              ghost.dir = DIR.LEFT;
              ghost.lastDecisionKey = null;
            }
          }
        }
        continue;
      }

      // 计算当前速度
      let speed = this.levelConfig.ghostSpeed;
      if (ghost.mode === GHOST_MODE.EATEN) {
        speed = this.levelConfig.eatenSpeed;
      } else if (ghost.mode === GHOST_MODE.FRIGHTENED) {
        speed = this.levelConfig.frightenedSpeed;
      } else if (this.maze.isTunnel(Math.round(ghost.col), Math.round(ghost.row))) {
        speed = this.levelConfig.tunnelSpeed;
      }

      const moveDist = speed * dt;
      const tileCol = Math.round(ghost.col);
      const tileRow = Math.round(ghost.row);

      // 回到幽灵屋门口后重生
      if (
        ghost.mode === GHOST_MODE.EATEN &&
        squaredDistance(ghost.col, ghost.row, GHOST_HOUSE_EXIT.col, GHOST_HOUSE_EXIT.row) < 0.25
      ) {
        ghost.col = GHOST_HOUSE_CENTER.col;
        ghost.row = GHOST_HOUSE_CENTER.row;
        ghost.mode = GHOST_MODE.HOUSE;
        ghost.releaseTimer = 0.6;
        ghost.lastDecisionKey = null;
        continue;
      }

      const nearCenter =
        Math.abs(ghost.col - tileCol) <= Math.max(0.12, moveDist * 1.1) &&
        Math.abs(ghost.row - tileRow) <= Math.max(0.12, moveDist * 1.1);
      const decisionKey = `${tileCol},${tileRow}`;

      if (nearCenter && ghost.lastDecisionKey !== decisionKey) {
        ghost.col = tileCol;
        ghost.row = tileRow;
        const target = computeGhostTargetTile(ghost, this.pacman, blinky);
        ghost.dir = chooseGhostDirection(ghost, this.maze, target, this.rng);
        ghost.lastDecisionKey = decisionKey;
      }

      const nextCol = ghost.col + ghost.dir.x * moveDist;
      const nextRow = ghost.row + ghost.dir.y * moveDist;
      const canPassGate = ghost.mode === GHOST_MODE.EATEN;
      const checkCol = ghost.dir.x > 0 ? Math.floor(nextCol + 0.49) : ghost.dir.x < 0 ? Math.ceil(nextCol - 0.49) : tileCol;
      const checkRow = ghost.dir.y > 0 ? Math.floor(nextRow + 0.49) : ghost.dir.y < 0 ? Math.ceil(nextRow - 0.49) : tileRow;

      if (this.maze.isWalkable(checkCol, checkRow, canPassGate)) {
        ghost.col = nextCol;
        ghost.row = nextRow;
      } else {
        ghost.col = tileCol;
        ghost.row = tileRow;
        ghost.lastDecisionKey = null;
      }

      if (ghost.col < -0.5) ghost.col += MAZE_COLS;
      if (ghost.col >= MAZE_COLS - 0.5) ghost.col -= MAZE_COLS;
    }
  }

  _checkGhostCollisions() {
    for (const ghost of this.ghosts) {
      if (ghost.mode === GHOST_MODE.HOUSE || ghost.mode === GHOST_MODE.EATEN) continue;
      const distSq = squaredDistance(this.pacman.col, this.pacman.row, ghost.col, ghost.row);
      if (distSq < 0.42) {
        if (ghost.mode === GHOST_MODE.FRIGHTENED) {
          ghost.mode = GHOST_MODE.EATEN;
          ghost.lastDecisionKey = null;
          const pts = SCORE.GHOST_BASE * Math.pow(2, this.ghostCombo);
          this.ghostCombo = Math.min(3, this.ghostCombo + 1);
          this._addScore(pts, ghost.col, ghost.row, '#00f5d4');
          this._emit('GHOST_EATEN', { ghostId: ghost.id, points: pts, combo: this.ghostCombo });
        } else {
          this.lives--;
          this.state = GAME_STATE.DYING;
          this.stateTimer = 1.4;
          this._emit('PACMAN_DIED', { lives: this.lives, killer: ghost.id });
          return;
        }
      }
    }
  }
}
