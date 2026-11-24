(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./math.js'));
  } else {
    root.GooPhysics = factory(root.GooMath);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (GooMath) {
  'use strict';

  const BALL_SPECS = {
    black: {
      radius: 13,
      mass: 1.0,
      buoyancy: 0,
      minLinks: 2,
      maxLinks: 3,
      detachable: false,
      stiffness: 0.92,
      maxStretch: 1.95
    },
    green: {
      radius: 13,
      mass: 0.92,
      buoyancy: 0,
      minLinks: 2,
      maxLinks: 3,
      detachable: true,
      stiffness: 0.9,
      maxStretch: 2.0
    },
    balloon: {
      radius: 17,
      mass: 0.45,
      buoyancy: 980,
      minLinks: 1,
      maxLinks: 1,
      detachable: true,
      stiffness: 0.72,
      maxStretch: 2.35
    }
  };

  class PhysicsWorld {
    constructor(options = {}) {
      this.width = options.width || 1100;
      this.height = options.height || 660;
      this.gravity = options.gravity !== undefined ? options.gravity : 540;
      this.damping = options.damping !== undefined ? options.damping : 0.992;
      this.iterations = options.iterations || 14;
      this.windBase = options.wind || 0;
      this.windGust = options.windGust || 0;
      this.time = 0;

      this.nodes = [];
      this.strands = [];
      this.platforms = [];
      this.nextNodeId = 1;
      this.nextStrandId = 1;

      this.onStrandBreak = options.onStrandBreak || null;
      this.onNodeHazard = options.onNodeHazard || null;
    }

    getCurrentWind() {
      if (!this.windBase && !this.windGust) return 0;
      return this.windBase + Math.sin(this.time * 1.15) * this.windGust;
    }

    addPlatform(p) {
      this.platforms.push({
        x: p.x,
        y: p.y,
        w: p.w,
        h: p.h,
        type: p.type || 'ground' // 'ground' | 'hazard' | 'sticky'
      });
    }

    addNode(cfg) {
      const type = cfg.type || 'black';
      const spec = BALL_SPECS[type] || BALL_SPECS.black;
      const node = {
        id: cfg.id || this.nextNodeId++,
        x: cfg.x,
        y: cfg.y,
        oldX: cfg.oldX !== undefined ? cfg.oldX : cfg.x,
        oldY: cfg.oldY !== undefined ? cfg.oldY : cfg.y,
        radius: cfg.radius || spec.radius,
        mass: cfg.mass !== undefined ? cfg.mass : spec.mass,
        buoyancy: cfg.buoyancy !== undefined ? cfg.buoyancy : spec.buoyancy,
        type,
        pinned: Boolean(cfg.pinned),
        state: cfg.state || 'structural', // 'structural' | 'walker' | 'dragging' | 'sucked' | 'collected' | 'dead'
        grounded: false,
        // Animation / walker fields
        walkStrandId: cfg.walkStrandId || null,
        walkT: cfg.walkT !== undefined ? cfg.walkT : 0.5,
        walkDir: cfg.walkDir || 1,
        walkSpeed: cfg.walkSpeed || 68,
        blinkTimer: (cfg.id || this.nextNodeId) * 0.7 % 4,
        scaleX: 1,
        scaleY: 1
      };
      if (node.id >= this.nextNodeId) {
        this.nextNodeId = node.id + 1;
      }
      this.nodes.push(node);
      return node;
    }

    getNodeById(id) {
      for (let i = 0; i < this.nodes.length; i++) {
        if (this.nodes[i].id === id) return this.nodes[i];
      }
      return null;
    }

    hasStrandBetween(idA, idB) {
      for (let i = 0; i < this.strands.length; i++) {
        const s = this.strands[i];
        if ((s.a === idA && s.b === idB) || (s.a === idB && s.b === idA)) {
          return true;
        }
      }
      return false;
    }

    addStrand(idA, idB, cfg = {}) {
      if (idA === idB || this.hasStrandBetween(idA, idB)) return null;
      const a = this.getNodeById(idA);
      const b = this.getNodeById(idB);
      if (!a || !b) return null;

      const d = GooMath.dist(a.x, a.y, b.x, b.y);
      const specA = BALL_SPECS[a.type] || BALL_SPECS.black;
      const specB = BALL_SPECS[b.type] || BALL_SPECS.black;
      const isBalloonLink = a.type === 'balloon' || b.type === 'balloon';

      const strand = {
        id: cfg.id || this.nextStrandId++,
        a: idA,
        b: idB,
        restLength: cfg.restLength !== undefined ? cfg.restLength : Math.max(24, d),
        stiffness: cfg.stiffness !== undefined ? cfg.stiffness : Math.min(specA.stiffness, specB.stiffness),
        maxStretch: cfg.maxStretch !== undefined ? cfg.maxStretch : Math.max(specA.maxStretch, specB.maxStretch),
        isBalloonLink,
        stress: 0,
        broken: false
      };
      if (strand.id >= this.nextStrandId) {
        this.nextStrandId = strand.id + 1;
      }
      this.strands.push(strand);
      return strand;
    }

    getConnectedStrands(nodeId) {
      return this.strands.filter(s => !s.broken && (s.a === nodeId || s.b === nodeId));
    }

    removeStrandsOfNode(nodeId) {
      this.strands = this.strands.filter(s => s.a !== nodeId && s.b !== nodeId);
    }

    /**
     * Step Verlet physics simulation by dt seconds.
     */
    step(dt) {
      const clampedDt = Math.min(dt, 1 / 30);
      const dtSq = clampedDt * clampedDt;
      this.time += clampedDt;

      const wind = this.getCurrentWind();

      // 1. Verlet integration for structural nodes
      for (let i = 0; i < this.nodes.length; i++) {
        const n = this.nodes[i];
        if (n.state !== 'structural' || n.pinned) continue;

        const vx = (n.x - n.oldX) * this.damping;
        const vy = (n.y - n.oldY) * this.damping;

        n.oldX = n.x;
        n.oldY = n.y;

        const ax = wind / Math.max(0.25, n.mass);
        const ay = this.gravity - (n.buoyancy / Math.max(0.25, n.mass));

        n.x += vx + ax * dtSq;
        n.y += vy + ay * dtSq;
        n.grounded = false;
      }

      // 2. Iterative distance constraint relaxation + platform collisions
      const nodeMap = new Map();
      for (let i = 0; i < this.nodes.length; i++) {
        nodeMap.set(this.nodes[i].id, this.nodes[i]);
      }

      for (let iter = 0; iter < this.iterations; iter++) {
        for (let i = 0; i < this.strands.length; i++) {
          const s = this.strands[i];
          if (s.broken) continue;
          const a = nodeMap.get(s.a);
          const b = nodeMap.get(s.b);
          if (!a || !b || a.state !== 'structural' || b.state !== 'structural') continue;

          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const curDist = Math.hypot(dx, dy);
          if (curDist < 1e-6) continue;

          // Balloon tethers only resist stretching (like a string), not compression
          if (s.isBalloonLink && curDist < s.restLength) {
            s.stress = 0;
            continue;
          }

          const diff = (curDist - s.restLength) / curDist;
          const invMassA = a.pinned ? 0 : 1 / a.mass;
          const invMassB = b.pinned ? 0 : 1 / b.mass;
          const invMassSum = invMassA + invMassB;
          if (invMassSum === 0) continue;

          const corr = diff * s.stiffness;
          const corrX = dx * corr;
          const corrY = dy * corr;

          if (!a.pinned) {
            a.x += corrX * (invMassA / invMassSum);
            a.y += corrY * (invMassA / invMassSum);
          }
          if (!b.pinned) {
            b.x -= corrX * (invMassB / invMassSum);
            b.y -= corrY * (invMassB / invMassSum);
          }
        }

        // Resolve platform collisions during constraint passes for solid contact
        this._resolveCollisions();
      }

      // 3. Evaluate strand stress & breaking threshold
      const brokenIds = [];
      for (let i = 0; i < this.strands.length; i++) {
        const s = this.strands[i];
        if (s.broken) continue;
        const a = nodeMap.get(s.a);
        const b = nodeMap.get(s.b);
        if (!a || !b || a.state !== 'structural' || b.state !== 'structural') {
          s.broken = true;
          continue;
        }
        const curDist = GooMath.dist(a.x, a.y, b.x, b.y);
        const ratio = curDist / s.restLength;
        if (s.isBalloonLink && ratio < 1) {
          s.stress = 0;
        } else {
          const deviation = Math.abs(ratio - 1);
          const maxDev = Math.max(0.15, s.maxStretch - 1);
          s.stress = GooMath.clamp(deviation / maxDev, 0, 1.5);
          if (ratio > s.maxStretch) {
            s.broken = true;
            brokenIds.push(s);
          }
        }
      }

      if (brokenIds.length > 0) {
        this.strands = this.strands.filter(s => !s.broken);
        if (this.onStrandBreak) {
          for (const s of brokenIds) this.onStrandBreak(s);
        }
      }

      // 4. Out-of-bounds death check (abyss)
      for (let i = 0; i < this.nodes.length; i++) {
        const n = this.nodes[i];
        if (n.state === 'structural' && !n.pinned && n.y > this.height + 120) {
          n.state = 'dead';
          this.removeStrandsOfNode(n.id);
        }
      }
    }

    _resolveCollisions() {
      for (let i = 0; i < this.nodes.length; i++) {
        const n = this.nodes[i];
        if (n.state !== 'structural' || n.pinned) continue;

        // Keep inside horizontal world bounds
        if (n.x < n.radius) {
          n.x = n.radius;
        } else if (n.x > this.width - n.radius) {
          n.x = this.width - n.radius;
        }
        if (n.y < n.radius) {
          n.y = n.radius;
        }

        for (let j = 0; j < this.platforms.length; j++) {
          const plat = this.platforms[j];
          const hit = GooMath.circleRectCollision(n.x, n.y, n.radius, plat);
          if (!hit) continue;

          if (plat.type === 'hazard') {
            n.state = 'dead';
            this.removeStrandsOfNode(n.id);
            if (this.onNodeHazard) this.onNodeHazard(n);
            break;
          }

          n.x = hit.cx;
          n.y = hit.cy;
          if (hit.ny < -0.5) {
            n.grounded = true;
          }
          // Apply ground friction to reduce sliding on terrain
          const friction = plat.type === 'sticky' ? 0.55 : 0.78;
          const vx = n.x - n.oldX;
          const vy = n.y - n.oldY;
          if (Math.abs(hit.ny) > 0.5) {
            n.oldX = n.x - vx * friction;
          }
          if (Math.abs(hit.nx) > 0.5) {
            n.oldY = n.y - vy * friction;
          }
        }
      }
    }

    /**
     * Measure total kinetic energy of structural nodes (useful for stability testing).
     */
    getTotalKineticEnergy() {
      let ke = 0;
      for (let i = 0; i < this.nodes.length; i++) {
        const n = this.nodes[i];
        if (n.state !== 'structural' || n.pinned) continue;
        const vx = n.x - n.oldX;
        const vy = n.y - n.oldY;
        ke += 0.5 * n.mass * (vx * vx + vy * vy);
      }
      return ke;
    }

    /**
     * Snapshot serializable physics state for Undo / Time Bug.
     */
    serialize() {
      return {
        nextNodeId: this.nextNodeId,
        nextStrandId: this.nextStrandId,
        nodes: this.nodes.map(n => ({ ...n })),
        strands: this.strands.map(s => ({ ...s }))
      };
    }

    restore(snap) {
      this.nextNodeId = snap.nextNodeId;
      this.nextStrandId = snap.nextStrandId;
      this.nodes = snap.nodes.map(n => ({ ...n }));
      this.strands = snap.strands.map(s => ({ ...s }));
    }
  }

  return {
    BALL_SPECS,
    PhysicsWorld
  };
});
