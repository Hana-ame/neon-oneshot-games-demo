import { FIXED_DT, GAME_STATE, MAX_FRAME_DT, PHYSICS } from './constants.js';
import { LEVELS, parseLevel } from './levels.js';
import { createPlayer, stepPlayer, stepWorld } from './physics.js';
import { SoundEngine } from './audio.js';
import { renderGame } from './renderer.js';

const STORAGE_KEY = 'smb_web_progress_v1';

/**
 * Pure grade calculator: A+ when clearTime <= parTime.
 */
export function computeLevelGrade(clearTime, parTime) {
  if (clearTime <= parTime) return 'A+';
  if (clearTime <= parTime * 1.45) return 'A';
  if (clearTime <= parTime * 2.0) return 'B';
  return 'C';
}

export class SuperMeatBoyGame {
  constructor(options = {}) {
    this.canvas = options.canvas || null;
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.onHUDUpdate = options.onHUDUpdate || (() => {});
    this.onStateChange = options.onStateChange || (() => {});
    this.sound = options.sound || new SoundEngine();

    this.levelIndex = 0;
    this.state = GAME_STATE.MENU;
    this.world = parseLevel(LEVELS[0]);
    this.player = createPlayer(this.world.spawn);

    this.time = 0;
    this.attemptTime = 0;
    this.totalDeaths = 0;
    this.levelDeaths = 0;
    this.respawnTimer = 0;
    this.shakeTime = 0;

    this.particles = [];
    this.decals = [];
    this.maxDecals = 260;

    // Multi-attempt replay storage
    this.recordedRuns = [];
    this.currentRun = [];
    this.replay = { runs: [], frame: 0, maxFrames: 0 };

    // Input state
    this.input = {
      left: false,
      right: false,
      jump: false,
      jumpPressed: false,
      sprint: false,
    };

    // Saved progress per level id
    this.progress = this.loadProgress();

    // RAF loop management
    this.rafId = null;
    this.lastTimestamp = 0;
    this.accumulator = 0;
  }

  loadProgress() {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
      }
    } catch (_) {
      // Ignore sandbox storage restrictions
    }
    return {};
  }

  saveProgress() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.progress));
      }
    } catch (_) {
      // Ignore sandbox storage restrictions
    }
  }

  setState(nextState) {
    this.state = nextState;
    this.onStateChange(nextState, this.getSnapshot());
  }

  loadLevel(index, keepDecals = false) {
    this.levelIndex = Math.max(0, Math.min(LEVELS.length - 1, index));
    this.world = parseLevel(LEVELS[this.levelIndex]);
    this.player = createPlayer(this.world.spawn);
    this.attemptTime = 0;
    this.respawnTimer = 0;
    this.particles = [];
    if (!keepDecals) {
      this.decals = [];
      this.levelDeaths = 0;
      this.recordedRuns = [];
    }
    this.currentRun = [];
    this.setState(GAME_STATE.PLAYING);
    this.emitHUD();
  }

  respawnInLevel() {
    const prevBandage = false; // Must survive after grabbing bandage
    this.world = parseLevel(LEVELS[this.levelIndex]);
    if (this.world.bandage) this.world.bandage.collected = prevBandage;
    this.player = createPlayer(this.world.spawn);
    this.attemptTime = 0;
    this.currentRun = [];
    this.setState(GAME_STATE.PLAYING);
    this.emitHUD();
  }

  togglePause() {
    if (this.state === GAME_STATE.PLAYING) {
      this.setState(GAME_STATE.PAUSED);
    } else if (this.state === GAME_STATE.PAUSED) {
      this.setState(GAME_STATE.PLAYING);
      this.lastTimestamp = performance.now();
    }
  }

  skipReplay() {
    if (this.state === GAME_STATE.REPLAY) {
      this.finishReplayToSummary();
    }
  }

  finishReplayToSummary() {
    const isLast = this.levelIndex >= LEVELS.length - 1;
    this.setState(isLast ? GAME_STATE.VICTORY : GAME_STATE.LEVEL_CLEAR);
  }

  nextLevel() {
    if (this.levelIndex < LEVELS.length - 1) {
      this.loadLevel(this.levelIndex + 1, false);
    } else {
      this.loadLevel(0, false);
    }
  }

  addDecal(x, y, normalX, normalY) {
    if (this.decals.length >= this.maxDecals) {
      this.decals.shift();
    }
    const horizontal = Math.abs(normalY) > 0;
    this.decals.push({
      x: x + (Math.random() - 0.5) * 4,
      y: y + (Math.random() - 0.5) * 4,
      rx: horizontal ? 4 + Math.random() * 5 : 2 + Math.random() * 2,
      ry: horizontal ? 2 + Math.random() * 2 : 4 + Math.random() * 5,
      color: Math.random() > 0.35 ? 'rgba(220, 38, 38, 0.85)' : 'rgba(153, 27, 27, 0.9)',
    });
  }

  spawnBloodBurst(x, y, count = 28) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 90 + Math.random() * 340;
      const life = 0.45 + Math.random() * 0.45;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 90,
        size: 3 + Math.random() * 4.5,
        life,
        maxLife: life,
        color: Math.random() > 0.3 ? '#ef4444' : '#991b1b',
      });
    }
  }

  spawnSparkBurst(x, y, color, count = 14) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 190;
      const life = 0.25 + Math.random() * 0.3;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        size: 3 + Math.random() * 3,
        life,
        maxLife: life,
        color,
      });
    }
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += 900 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  /**
   * Advance simulation by one fixed timestep (1/60s).
   */
  fixedUpdate(dt = FIXED_DT) {
    this.time += dt;
    if (this.shakeTime > 0) this.shakeTime = Math.max(0, this.shakeTime - dt);
    this.updateParticles(dt);

    if (this.state === GAME_STATE.PLAYING) {
      this.attemptTime += dt;
      stepWorld(this.world, dt);
      const events = stepPlayer(this.player, this.world, this.input, dt);
      this.input.jumpPressed = false;

      // Record frame for post-level multi-attempt replay (cap at 3600 frames / 60s)
      if (this.currentRun.length < 3600) {
        this.currentRun.push({
          x: Math.round(this.player.x * 10) / 10,
          y: Math.round(this.player.y * 10) / 10,
          f: this.player.facing,
        });
      }

      for (const ev of events) {
        this.handleEvent(ev);
      }
      this.emitHUD();
    } else if (this.state === GAME_STATE.DYING) {
      stepWorld(this.world, dt);
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.respawnInLevel();
      }
    } else if (this.state === GAME_STATE.REPLAY) {
      stepWorld(this.world, dt);
      this.replay.frame += 1.25;
      if (this.replay.frame >= this.replay.maxFrames + 35) {
        this.finishReplayToSummary();
      }
    }
  }

  handleEvent(ev) {
    switch (ev.type) {
      case 'jump':
        this.sound.playJump(false);
        this.spawnSparkBurst(ev.x, ev.y, '#fca5a5', 5);
        break;
      case 'wallJump':
        this.sound.playJump(true);
        this.addDecal(ev.x, ev.y, -ev.wallDir, 0);
        this.spawnSparkBurst(ev.x, ev.y, '#f87171', 7);
        break;
      case 'land':
        this.sound.playLand();
        break;
      case 'bounce':
        this.sound.playBounce();
        this.spawnSparkBurst(ev.x, ev.y, '#fde047', 10);
        break;
      case 'splat':
        this.addDecal(ev.x, ev.y, ev.normalX, ev.normalY);
        break;
      case 'bandage':
        this.sound.playBandage();
        this.spawnSparkBurst(ev.x, ev.y, '#f472b6', 16);
        break;
      case 'death':
        this.sound.playDeath();
        this.totalDeaths += 1;
        this.levelDeaths += 1;
        this.shakeTime = 0.22;
        this.spawnBloodBurst(ev.x, ev.y, 30);
        for (let i = 0; i < 8; i++) {
          this.addDecal(
            ev.x + (Math.random() - 0.5) * 28,
            ev.y + (Math.random() - 0.5) * 28,
            Math.random() > 0.5 ? 1 : 0,
            Math.random() > 0.5 ? 1 : 0
          );
        }
        if (this.currentRun.length > 0) {
          this.recordedRuns.push(this.currentRun);
          if (this.recordedRuns.length > 18) this.recordedRuns.shift();
        }
        this.respawnTimer = PHYSICS.RESPAWN_DELAY;
        this.setState(GAME_STATE.DYING);
        break;
      case 'goal': {
        this.sound.playGoal();
        this.spawnSparkBurst(ev.x, ev.y, '#f472b6', 24);
        this.recordedRuns.push(this.currentRun);

        const lvl = LEVELS[this.levelIndex];
        const grade = computeLevelGrade(this.attemptTime, lvl.parTime);
        const gotBandage = Boolean(this.world.bandage && this.world.bandage.collected);
        const prev = this.progress[lvl.id] || {};
        this.progress[lvl.id] = {
          cleared: true,
          bestTime: prev.bestTime ? Math.min(prev.bestTime, this.attemptTime) : this.attemptTime,
          grade: prev.grade === 'A+' ? 'A+' : grade,
          bandage: Boolean(prev.bandage || gotBandage),
        };
        this.saveProgress();

        const maxFrames = Math.max(...this.recordedRuns.map((r) => r.length), 1);
        this.replay = {
          runs: this.recordedRuns.slice(),
          frame: 0,
          maxFrames,
        };
        // Reset dynamic world so replay matches starting positions
        this.world = parseLevel(lvl);
        this.setState(GAME_STATE.REPLAY);
        break;
      }
      default:
        break;
    }
  }

  getSnapshot() {
    const lvl = LEVELS[this.levelIndex];
    const saved = this.progress[lvl.id] || {};
    return {
      levelIndex: this.levelIndex,
      levelCount: LEVELS.length,
      levelId: lvl.id,
      levelName: lvl.name,
      levelSubtitle: lvl.subtitle,
      hint: lvl.hint,
      parTime: lvl.parTime,
      attemptTime: this.attemptTime,
      levelDeaths: this.levelDeaths,
      totalDeaths: this.totalDeaths,
      bandageCollected: Boolean(this.world.bandage && this.world.bandage.collected),
      grade: computeLevelGrade(this.attemptTime, lvl.parTime),
      saved,
      progress: this.progress,
      state: this.state,
      muted: this.sound.muted,
    };
  }

  emitHUD() {
    this.onHUDUpdate(this.getSnapshot());
  }

  startLoop() {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.lastTimestamp = performance.now();
    const tick = (now) => {
      const rawDt = Math.min(MAX_FRAME_DT, (now - this.lastTimestamp) / 1000);
      this.lastTimestamp = now;
      if (this.state !== GAME_STATE.PAUSED && this.state !== GAME_STATE.MENU) {
        this.accumulator += rawDt;
        while (this.accumulator >= FIXED_DT) {
          this.fixedUpdate(FIXED_DT);
          this.accumulator -= FIXED_DT;
        }
      }
      if (this.ctx) {
        renderGame(this.ctx, this);
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stopLoop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}
