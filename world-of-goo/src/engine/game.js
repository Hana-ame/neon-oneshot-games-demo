(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./math.js'),
      require('./physics.js'),
      require('../levels/levels.js')
    );
  } else {
    root.GooGame = factory(root.GooMath, root.GooPhysics, root.GooLevels);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (GooMath, GooPhysics, GooLevels) {
  'use strict';

  const { BALL_SPECS, PhysicsWorld } = GooPhysics;

  const ATTACH_MIN_DIST = 28;
  const ATTACH_MAX_DIST = 158;
  const PICK_RADIUS = 30;
  const MAX_UNDO_HISTORY = 25;

  class GooGameEngine {
    constructor(options = {}) {
      this.sound = options.sound || null;
      this.onStateChange = options.onStateChange || null;

      this.currentLevelId = 1;
      this.level = null;
      this.world = null;

      this.status = 'playing'; // 'playing' | 'paused' | 'won'
      this.collectedCount = 0;
      this.movesCount = 0;
      this.elapsedTime = 0;
      this.pipeActive = false;
      this.pipePulse = 0;

      // Dragging state
      this.draggingNode = null;
      this.dragWasStructural = false;
      this.pointer = { x: 0, y: 0, down: false };
      this.previewTargets = [];

      // Visual particles & floating texts
      this.particles = [];
      this.undoStack = [];
      this.completedLevels = {};

      this.loadLevel(options.levelId || 1);
    }

    loadLevel(levelId) {
      const def = GooLevels.getLevelById(levelId);
      this.currentLevelId = def.id;
      this.level = def;
      this.status = 'playing';
      this.collectedCount = 0;
      this.movesCount = 0;
      this.elapsedTime = 0;
      this.pipeActive = false;
      this.draggingNode = null;
      this.previewTargets = [];
      this.particles = [];
      this.undoStack = [];

      this.world = new PhysicsWorld({
        width: def.width,
        height: def.height,
        gravity: def.gravity,
        wind: def.wind || 0,
        windGust: def.windGust || 0,
        onStrandBreak: (s) => {
          if (this.sound) this.sound.playBreak();
          const a = this.world.getNodeById(s.a);
          const b = this.world.getNodeById(s.b);
          if (a && b) {
            this.spawnParticles((a.x + b.x) * 0.5, (a.y + b.y) * 0.5, '#ff7b54', 7);
          }
        },
        onNodeHazard: (n) => {
          if (this.sound) this.sound.playBreak();
          this.spawnParticles(n.x, n.y, '#ff4d6d', 12);
        }
      });

      for (const p of def.platforms) {
        this.world.addPlatform(p);
      }

      for (const n of def.initialNodes) {
        this.world.addNode({ ...n });
      }

      for (const pair of def.initialStrands) {
        this.world.addStrand(pair[0], pair[1]);
      }

      // Spawn free walker goo balls onto existing strands
      const strandList = this.world.strands;
      let idx = 0;
      for (const group of def.walkers) {
        for (let i = 0; i < group.count; i++) {
          const s = strandList[idx % strandList.length];
          const a = this.world.getNodeById(s.a);
          const b = this.world.getNodeById(s.b);
          const t = ((idx * 0.37) % 0.8) + 0.1;
          this.world.addNode({
            x: GooMath.lerp(a.x, b.x, t),
            y: GooMath.lerp(a.y, b.y, t),
            type: group.type,
            state: 'walker',
            walkStrandId: s.id,
            walkT: t,
            walkDir: idx % 2 === 0 ? 1 : -1,
            walkSpeed: 58 + (idx % 5) * 9
          });
          idx++;
        }
      }

      this._notifyState();
    }

    restartLevel() {
      this.loadLevel(this.currentLevelId);
    }

    togglePause() {
      if (this.status === 'won') return;
      this.status = this.status === 'paused' ? 'playing' : 'paused';
      this._notifyState();
    }

    saveUndoSnapshot() {
      const snap = {
        world: this.world.serialize(),
        collectedCount: this.collectedCount,
        movesCount: this.movesCount
      };
      this.undoStack.push(snap);
      if (this.undoStack.length > MAX_UNDO_HISTORY) {
        this.undoStack.shift();
      }
    }

    undo() {
      if (this.undoStack.length === 0 || this.status === 'won') return false;
      const snap = this.undoStack.pop();
      this.world.restore(snap.world);
      this.collectedCount = snap.collectedCount;
      this.movesCount = snap.movesCount;
      this.draggingNode = null;
      this.previewTargets = [];
      if (this.sound) this.sound.playUndo();
      this._notifyState();
      return true;
    }

    getRemainingWalkersCount() {
      let count = 0;
      for (const n of this.world.nodes) {
        if (n.state === 'walker' || n.state === 'dragging' || n.state === 'sucked') {
          count++;
        }
      }
      return count;
    }

    /**
     * Find best valid structural nodes to connect to from position (x, y).
     */
    findAttachmentCandidates(x, y, ballType, excludeNodeId = null) {
      const spec = BALL_SPECS[ballType] || BALL_SPECS.black;
      const candidates = [];

      for (const n of this.world.nodes) {
        if (n.state !== 'structural' || n.id === excludeNodeId) continue;
        // Balloons cannot be structural anchor bases for other balls
        if (n.type === 'balloon') continue;

        const d = GooMath.dist(x, y, n.x, n.y);
        if (d < ATTACH_MIN_DIST || d > ATTACH_MAX_DIST) continue;

        // Check that strand does not cut through solid terrain
        let blocked = false;
        for (const p of this.world.platforms) {
          if (p.type === 'hazard') continue;
          // Shrink rect slightly so nodes sitting on ground can still link
          const inner = { x: p.x + 4, y: p.y + 4, w: Math.max(0, p.w - 8), h: Math.max(0, p.h - 8) };
          if (GooMath.segmentIntersectsRect(x, y, n.x, n.y, inner)) {
            blocked = true;
            break;
          }
        }
        if (blocked) continue;

        candidates.push({ node: n, dist: d });
      }

      candidates.sort((a, b) => a.dist - b.dist);
      const selected = candidates.slice(0, spec.maxLinks).map(c => c.node);
      if (selected.length < spec.minLinks) return [];
      return selected;
    }

    /**
     * Pointer down: grab nearest walker ball or detachable structural ball (green / balloon).
     */
    pointerDown(x, y) {
      this.pointer.x = x;
      this.pointer.y = y;
      this.pointer.down = true;
      if (this.status !== 'playing') return null;

      let best = null;
      let bestDist = PICK_RADIUS;

      // Priority 1: grab free walkers first
      for (const n of this.world.nodes) {
        if (n.state !== 'walker') continue;
        const d = GooMath.dist(x, y, n.x, n.y);
        if (d < bestDist) {
          bestDist = d;
          best = n;
        }
      }

      // Priority 2: grab detachable structural balls (green / balloon)
      if (!best) {
        for (const n of this.world.nodes) {
          if (n.state !== 'structural' || n.pinned) continue;
          const spec = BALL_SPECS[n.type] || BALL_SPECS.black;
          if (!spec.detachable) continue;
          const d = GooMath.dist(x, y, n.x, n.y);
          if (d < bestDist) {
            bestDist = d;
            best = n;
          }
        }
      }

      if (!best) return null;

      this.saveUndoSnapshot();
      this.dragWasStructural = best.state === 'structural';
      if (this.dragWasStructural) {
        this.world.removeStrandsOfNode(best.id);
      }

      best.state = 'dragging';
      best.x = x;
      best.y = y;
      best.oldX = x;
      best.oldY = y;
      best.scaleX = 1.25;
      best.scaleY = 0.8;
      this.draggingNode = best;
      this.previewTargets = this.findAttachmentCandidates(x, y, best.type, best.id);

      if (this.sound) this.sound.playPickup();
      return best;
    }

    pointerMove(x, y) {
      this.pointer.x = x;
      this.pointer.y = y;
      if (!this.draggingNode || this.status !== 'playing') return;

      const n = this.draggingNode;
      n.x = GooMath.clamp(x, n.radius, this.world.width - n.radius);
      n.y = GooMath.clamp(y, n.radius, this.world.height - n.radius);
      n.oldX = n.x;
      n.oldY = n.y;
      this.previewTargets = this.findAttachmentCandidates(n.x, n.y, n.type, n.id);
    }

    pointerUp(x, y) {
      this.pointer.x = x;
      this.pointer.y = y;
      this.pointer.down = false;

      if (!this.draggingNode) return false;
      const n = this.draggingNode;
      this.draggingNode = null;

      const targets = this.findAttachmentCandidates(n.x, n.y, n.type, n.id);
      this.previewTargets = [];

      // Prevent dropping directly inside a solid platform
      let insidePlatform = false;
      for (const p of this.world.platforms) {
        if (p.type !== 'hazard' && GooMath.circleRectCollision(n.x, n.y, n.radius * 0.7, p)) {
          insidePlatform = true;
          break;
        }
      }

      if (targets.length > 0 && !insidePlatform) {
        n.state = 'structural';
        n.oldX = n.x;
        n.oldY = n.y;
        n.scaleX = 0.78;
        n.scaleY = 1.28;

        for (const t of targets) {
          this.world.addStrand(n.id, t.id);
        }

        this.movesCount++;
        this.spawnParticles(n.x, n.y, this._getBallColor(n.type), 8);
        if (this.sound) this.sound.playAttach();
        this._notifyState();
        return true;
      }

      // Failed placement: return ball to walker on nearest strand
      this._attachWalkerToNearestStrand(n);
      // Pop unused undo snapshot if nothing actually changed
      if (!this.dragWasStructural && this.undoStack.length > 0) {
        this.undoStack.pop();
      }
      this._notifyState();
      return false;
    }

    _getBallColor(type) {
      if (type === 'green') return '#52b788';
      if (type === 'balloon') return '#ff70a6';
      return '#a8dadc';
    }

    _attachWalkerToNearestStrand(node) {
      node.state = 'walker';
      let bestStrand = null;
      let bestT = 0.5;
      let bestDist = Infinity;

      for (const s of this.world.strands) {
        if (s.broken || s.isBalloonLink) continue;
        const a = this.world.getNodeById(s.a);
        const b = this.world.getNodeById(s.b);
        if (!a || !b) continue;
        const proj = GooMath.closestPointOnSegment(node.x, node.y, a.x, a.y, b.x, b.y);
        if (proj.dist < bestDist) {
          bestDist = proj.dist;
          bestStrand = s;
          bestT = proj.t;
        }
      }

      if (bestStrand) {
        node.walkStrandId = bestStrand.id;
        node.walkT = bestT;
        const a = this.world.getNodeById(bestStrand.a);
        const b = this.world.getNodeById(bestStrand.b);
        node.x = GooMath.lerp(a.x, b.x, bestT);
        node.y = GooMath.lerp(a.y, b.y, bestT);
        node.oldX = node.x;
        node.oldY = node.y;
      }
    }

    spawnParticles(x, y, color, count = 8) {
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
        const speed = 55 + Math.random() * 110;
        this.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 35,
          life: 0.45 + Math.random() * 0.35,
          maxLife: 0.8,
          size: 2.5 + Math.random() * 3.5,
          color
        });
      }
    }

    /**
     * Advance game simulation by dt seconds.
     */
    update(dt) {
      if (this.status !== 'playing') return;
      const clampedDt = Math.min(dt, 1 / 30);
      this.elapsedTime += clampedDt;
      this.pipePulse += clampedDt * 3.2;

      // 1. Physics substeps for crisp truss rigidity
      const substeps = 2;
      for (let s = 0; s < substeps; s++) {
        this.world.step(clampedDt / substeps);
      }

      // 2. Check pipe activation (any structural node within suctionRadius)
      const pipe = this.level.pipe;
      let structureNearPipe = false;
      for (const n of this.world.nodes) {
        if (n.state !== 'structural') continue;
        if (GooMath.dist(n.x, n.y, pipe.x, pipe.y) <= pipe.suctionRadius) {
          structureNearPipe = true;
          break;
        }
      }
      this.pipeActive = structureNearPipe;

      // 3. Update walker goo balls crawling along strands
      this._updateWalkers(clampedDt);

      // 4. Update sucked goo balls flying into pipe mouth
      this._updateSuckedBalls(clampedDt);

      // 5. Update node squash/stretch & blink timers
      for (const n of this.world.nodes) {
        n.scaleX = GooMath.lerp(n.scaleX, 1, clampedDt * 12);
        n.scaleY = GooMath.lerp(n.scaleY, 1, clampedDt * 12);
        n.blinkTimer -= clampedDt;
        if (n.blinkTimer <= -0.14) {
          n.blinkTimer = 2.2 + ((n.id * 1.37) % 3.4);
        }
      }

      // 6. Update particles
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.x += p.vx * clampedDt;
        p.y += p.vy * clampedDt;
        p.vy += 280 * clampedDt;
        p.life -= clampedDt;
        if (p.life <= 0) {
          this.particles.splice(i, 1);
        }
      }

      // 7. Check victory condition
      if (this.collectedCount >= this.level.targetCount && this.status === 'playing') {
        this.status = 'won';
        const prev = this.completedLevels[this.currentLevelId] || { collected: 0, ocd: false };
        this.completedLevels[this.currentLevelId] = {
          collected: Math.max(prev.collected, this.collectedCount),
          ocd: prev.ocd || this.collectedCount >= this.level.ocdTarget
        };
        if (this.sound) this.sound.playWin();
        this.spawnParticles(pipe.x, pipe.y, this.level.theme.accent, 28);
        this._notifyState();
      }
    }

    _updateWalkers(dt) {
      const pipe = this.level.pipe;
      const strandMap = new Map();
      for (const s of this.world.strands) {
        if (!s.broken && !s.isBalloonLink) {
          strandMap.set(s.id, s);
        }
      }

      for (const n of this.world.nodes) {
        if (n.state !== 'walker') continue;

        let strand = strandMap.get(n.walkStrandId);
        if (!strand) {
          this._attachWalkerToNearestStrand(n);
          strand = strandMap.get(n.walkStrandId);
          if (!strand) continue;
        }

        const a = this.world.getNodeById(strand.a);
        const b = this.world.getNodeById(strand.b);
        if (!a || !b) continue;

        const len = Math.max(10, GooMath.dist(a.x, a.y, b.x, b.y));
        const stepT = (n.walkSpeed * dt) / len;
        n.walkT += stepT * n.walkDir;

        // If reached either end of strand, pick next connected strand (biased toward pipe)
        if (n.walkT >= 1 || n.walkT <= 0) {
          const arrivedNodeId = n.walkT >= 1 ? strand.b : strand.a;
          const nextCandidates = this.world.strands.filter(
            s => !s.broken && !s.isBalloonLink && (s.a === arrivedNodeId || s.b === arrivedNodeId)
          );

          if (nextCandidates.length > 0) {
            let chosen = nextCandidates[0];
            if (nextCandidates.length > 1) {
              // Bias toward the strand whose other endpoint is closer to the pipe
              let bestScore = Infinity;
              for (const cand of nextCandidates) {
                const otherId = cand.a === arrivedNodeId ? cand.b : cand.a;
                const other = this.world.getNodeById(otherId);
                if (!other) continue;
                const dPipe = GooMath.dist(other.x, other.y, pipe.x, pipe.y);
                const samePenalty = cand.id === strand.id ? 95 : 0;
                const jitter = ((n.id * 31 + Math.floor(this.elapsedTime * 2) * 17) % 60);
                const score = dPipe + samePenalty + jitter;
                if (score < bestScore) {
                  bestScore = score;
                  chosen = cand;
                }
              }
            }
            n.walkStrandId = chosen.id;
            if (chosen.a === arrivedNodeId) {
              n.walkT = 0.02;
              n.walkDir = 1;
            } else {
              n.walkT = 0.98;
              n.walkDir = -1;
            }
            strand = chosen;
          } else {
            n.walkT = GooMath.clamp(n.walkT, 0, 1);
            n.walkDir *= -1;
          }
        }

        const na = this.world.getNodeById(strand.a);
        const nb = this.world.getNodeById(strand.b);
        if (na && nb) {
          n.x = GooMath.lerp(na.x, nb.x, n.walkT);
          n.y = GooMath.lerp(na.y, nb.y, n.walkT);
          n.oldX = n.x;
          n.oldY = n.y;
        }

        // Pipe suction capture!
        const distToPipe = GooMath.dist(n.x, n.y, pipe.x, pipe.y);
        if (distToPipe <= pipe.suctionRadius && n.type !== 'balloon') {
          n.state = 'sucked';
          this.pipeActive = true;
          if (this.sound) this.sound.playSuction();
        }
      }
    }

    _updateSuckedBalls(dt) {
      const pipe = this.level.pipe;
      for (const n of this.world.nodes) {
        if (n.state !== 'sucked') continue;
        const dx = pipe.x - n.x;
        const dy = pipe.y - n.y;
        const d = Math.hypot(dx, dy);
        if (d < pipe.mouthRadius * 0.7) {
          n.state = 'collected';
          this.collectedCount++;
          this.spawnParticles(pipe.x, pipe.y, this.level.theme.accent, 10);
          if (this.sound) this.sound.playCollect();
          this._notifyState();
        } else {
          const pullSpeed = 290 + (1 - Math.min(1, d / pipe.suctionRadius)) * 220;
          n.x += (dx / d) * pullSpeed * dt;
          n.y += (dy / d) * pullSpeed * dt;
          n.scaleX = 1.25;
          n.scaleY = 0.75;
        }
      }
    }

    _notifyState() {
      if (this.onStateChange) {
        this.onStateChange(this.getHUDState());
      }
    }

    getHUDState() {
      return {
        levelId: this.currentLevelId,
        levelName: this.level.name,
        subtitle: this.level.subtitle,
        hint: this.level.hint,
        status: this.status,
        collectedCount: this.collectedCount,
        targetCount: this.level.targetCount,
        ocdTarget: this.level.ocdTarget,
        remainingWalkers: this.getRemainingWalkersCount(),
        movesCount: this.movesCount,
        canUndo: this.undoStack.length > 0 && this.status !== 'won',
        pipeActive: this.pipeActive,
        completedLevels: { ...this.completedLevels },
        totalLevels: GooLevels.LEVELS.length
      };
    }
  }

  return {
    ATTACH_MIN_DIST,
    ATTACH_MAX_DIST,
    PICK_RADIUS,
    GooGameEngine
  };
});
