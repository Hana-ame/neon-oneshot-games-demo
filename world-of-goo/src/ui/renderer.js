(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GooRenderer = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  class CanvasRenderer {
    constructor(canvas, game) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.game = game;

      // Viewport transform (world -> screen)
      this.scale = 1;
      this.offsetX = 0;
      this.offsetY = 0;

      // Ambient floating dust particles
      this.motes = [];
      for (let i = 0; i < 32; i++) {
        this.motes.push({
          x: Math.random() * 1100,
          y: Math.random() * 660,
          r: 1 + Math.random() * 2.2,
          speed: 8 + Math.random() * 16,
          alpha: 0.15 + Math.random() * 0.3
        });
      }
    }

    resize() {
      const rect = this.canvas.parentElement.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(320, Math.floor(rect.width));
      const h = Math.max(260, Math.floor(rect.height));

      this.canvas.width = w * dpr;
      this.canvas.height = h * dpr;
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';

      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.viewW = w;
      this.viewH = h;

      const worldW = this.game.level.width;
      const worldH = this.game.level.height;
      this.scale = Math.min(w / worldW, h / worldH);
      this.offsetX = (w - worldW * this.scale) * 0.5;
      this.offsetY = (h - worldH * this.scale) * 0.5;
    }

    screenToWorld(clientX, clientY) {
      const rect = this.canvas.getBoundingClientRect();
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;
      return {
        x: (sx - this.offsetX) / this.scale,
        y: (sy - this.offsetY) / this.scale
      };
    }

    render(dt = 1 / 60) {
      const ctx = this.ctx;
      const level = this.game.level;
      const theme = level.theme;

      // Fill letterbox background
      ctx.fillStyle = theme.skyTop;
      ctx.fillRect(0, 0, this.viewW, this.viewH);

      ctx.save();
      ctx.translate(this.offsetX, this.offsetY);
      ctx.scale(this.scale, this.scale);

      // Clip to world bounds
      ctx.beginPath();
      ctx.rect(0, 0, level.width, level.height);
      ctx.clip();

      this._drawBackground(ctx, level, theme, dt);
      this._drawPipe(ctx, level, theme);
      this._drawPlatforms(ctx, level, theme);
      this._drawPreviewStrands(ctx);
      this._drawStrands(ctx);
      this._drawNodes(ctx, level);
      this._drawParticles(ctx);

      ctx.restore();
    }

    _drawBackground(ctx, level, theme, dt) {
      const grad = ctx.createLinearGradient(0, 0, 0, level.height);
      grad.addColorStop(0, theme.skyTop);
      grad.addColorStop(1, theme.skyBottom);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, level.width, level.height);

      // Distant moon / ambient glow behind pipe
      const pipe = level.pipe;
      const glow = ctx.createRadialGradient(pipe.x, pipe.y, 12, pipe.x, pipe.y, 240);
      glow.addColorStop(0, theme.accent + '28');
      glow.addColorStop(1, theme.accent + '00');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, level.width, level.height);

      // Far silhouette hills
      ctx.fillStyle = theme.hillFar;
      ctx.beginPath();
      ctx.moveTo(0, level.height);
      ctx.lineTo(0, 440);
      ctx.quadraticCurveTo(220, 340, 460, 430);
      ctx.quadraticCurveTo(760, 520, 1100, 380);
      ctx.lineTo(level.width, level.height);
      ctx.closePath();
      ctx.fill();

      // Near silhouette hills
      ctx.fillStyle = theme.hillNear;
      ctx.beginPath();
      ctx.moveTo(0, level.height);
      ctx.lineTo(0, 505);
      ctx.quadraticCurveTo(310, 435, 620, 515);
      ctx.quadraticCurveTo(880, 560, 1100, 465);
      ctx.lineTo(level.width, level.height);
      ctx.closePath();
      ctx.fill();

      // Floating dust motes / wind streaks
      const wind = this.game.world.getCurrentWind();
      ctx.fillStyle = '#ffffff';
      for (const m of this.motes) {
        m.x += (wind * 1.4 + (wind ? 18 : 4)) * dt;
        m.y -= m.speed * dt * (wind ? 0.2 : 0.6);
        if (m.x > level.width + 10) m.x = -10;
        if (m.x < -10) m.x = level.width + 10;
        if (m.y < -10) m.y = level.height + 10;

        ctx.globalAlpha = m.alpha;
        if (Math.abs(wind) > 10) {
          ctx.fillRect(m.x, m.y, 16, 1.5);
        } else {
          ctx.beginPath();
          ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    _drawPipe(ctx, level, theme) {
      const pipe = level.pipe;
      const pulse = Math.sin(this.game.pipePulse) * 0.5 + 0.5;

      // Suction radius aura
      ctx.save();
      ctx.beginPath();
      ctx.arc(pipe.x, pipe.y, pipe.suctionRadius, 0, Math.PI * 2);
      ctx.strokeStyle = this.game.pipeActive ? theme.accent : '#ffffff';
      ctx.globalAlpha = this.game.pipeActive ? 0.35 + pulse * 0.25 : 0.14;
      ctx.lineWidth = this.game.pipeActive ? 2.5 : 1.5;
      ctx.setLineDash([7, 7]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Inner suction swirl ring when active
      if (this.game.pipeActive) {
        const rInner = pipe.mouthRadius + (1 - pulse) * (pipe.suctionRadius - pipe.mouthRadius);
        ctx.beginPath();
        ctx.arc(pipe.x, pipe.y, rInner, 0, Math.PI * 2);
        ctx.strokeStyle = theme.accent;
        ctx.globalAlpha = pulse * 0.45;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      ctx.restore();

      // Pipe shaft extending to top of screen
      const shaftW = 46;
      const pipeGrad = ctx.createLinearGradient(pipe.x - shaftW / 2, 0, pipe.x + shaftW / 2, 0);
      pipeGrad.addColorStop(0, '#1f2933');
      pipeGrad.addColorStop(0.35, '#52606d');
      pipeGrad.addColorStop(0.7, '#323f4b');
      pipeGrad.addColorStop(1, '#12181f');
      ctx.fillStyle = pipeGrad;
      ctx.fillRect(pipe.x - shaftW / 2, 0, shaftW, pipe.y - 8);

      // Pipe rim / bell mouth
      ctx.fillStyle = '#3e4c59';
      ctx.beginPath();
      ctx.roundRect(pipe.x - 34, pipe.y - 16, 68, 22, 6);
      ctx.fill();
      ctx.strokeStyle = '#7b8794';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Dark suction interior
      ctx.fillStyle = '#090d12';
      ctx.beginPath();
      ctx.ellipse(pipe.x, pipe.y + 4, 24, 9, 0, 0, Math.PI * 2);
      ctx.fill();

      // Target counter badge on pipe shaft
      ctx.fillStyle = 'rgba(10, 16, 24, 0.82)';
      ctx.beginPath();
      ctx.roundRect(pipe.x - 28, Math.max(18, pipe.y - 68), 56, 26, 8);
      ctx.fill();
      ctx.strokeStyle = this.game.pipeActive ? theme.accent : '#64748b';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 13px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        `${this.game.collectedCount}/${level.targetCount}`,
        pipe.x,
        Math.max(31, pipe.y - 55)
      );
    }

    _drawPlatforms(ctx, level, theme) {
      for (const p of this.game.world.platforms) {
        if (p.type === 'hazard') {
          // Glowing red hazard pit with spikes
          ctx.fillStyle = '#3a0d18';
          ctx.fillRect(p.x, p.y, p.w, p.h);

          const spikeW = 20;
          const count = Math.ceil(p.w / spikeW);
          ctx.fillStyle = '#ff4d6d';
          ctx.beginPath();
          for (let i = 0; i < count; i++) {
            const sx = p.x + i * spikeW;
            ctx.moveTo(sx, p.y + 14);
            ctx.lineTo(sx + spikeW * 0.5, p.y - 6);
            ctx.lineTo(sx + spikeW, p.y + 14);
          }
          ctx.closePath();
          ctx.fill();
        } else {
          // Ground body
          ctx.fillStyle = theme.groundFill;
          ctx.beginPath();
          ctx.roundRect(p.x, p.y, p.w, p.h, [8, 8, 0, 0]);
          ctx.fill();

          // Lush top grass/moss crust
          ctx.fillStyle = theme.groundTop;
          ctx.beginPath();
          ctx.roundRect(p.x, p.y, p.w, 12, [8, 8, 2, 2]);
          ctx.fill();

          // Subtle highlight line
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.fillRect(p.x + 6, p.y + 2, Math.max(0, p.w - 12), 2);
        }
      }
    }

    _drawPreviewStrands(ctx) {
      const drag = this.game.draggingNode;
      if (!drag) return;

      const targets = this.game.previewTargets;
      const valid = targets.length > 0;

      ctx.save();
      for (const t of targets) {
        ctx.beginPath();
        ctx.moveTo(drag.x, drag.y);
        ctx.lineTo(t.x, t.y);
        ctx.strokeStyle = drag.type === 'balloon' ? '#ff99c8' : '#7bf1a8';
        ctx.lineWidth = 3.5;
        ctx.setLineDash([7, 6]);
        ctx.stroke();

        // Highlight ring around anchor node
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.radius + 6, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(123, 241, 168, 0.75)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Outer snap aura around dragged ball
      ctx.beginPath();
      ctx.arc(drag.x, drag.y, drag.radius + 9, 0, Math.PI * 2);
      ctx.strokeStyle = valid ? 'rgba(123, 241, 168, 0.8)' : 'rgba(248, 113, 113, 0.65)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
    }

    _drawStrands(ctx) {
      const world = this.game.world;
      for (const s of world.strands) {
        if (s.broken) continue;
        const a = world.getNodeById(s.a);
        const b = world.getNodeById(s.b);
        if (!a || !b || a.state !== 'structural' || b.state !== 'structural') continue;

        ctx.save();
        if (s.isBalloonLink) {
          // Thin flexible balloon string
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = '#ffd6e7';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          // Organic goo truss strand: thins slightly and glows red-orange under high stress
          const stress = Math.min(1, s.stress);
          const thickness = Math.max(2.6, 6.2 - stress * 2.8);

          // Color blend from dark ink/green to warning crimson
          const isGreen = a.type === 'green' || b.type === 'green';
          let strokeColor = isGreen ? '#2d6a4f' : '#1b262c';
          if (stress > 0.45) {
            const t = (stress - 0.45) / 0.55;
            const r = Math.round(45 + t * 210);
            const g = Math.round(106 - t * 65);
            const bl = Math.round(79 - t * 50);
            strokeColor = `rgb(${r},${g},${bl})`;
          }

          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.lineCap = 'round';
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = thickness + 2;
          ctx.stroke();

          // Glossy inner core
          ctx.strokeStyle = isGreen ? '#52b788' : '#3d5a6c';
          ctx.lineWidth = Math.max(1.2, thickness * 0.42);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    _drawNodes(ctx, level) {
      const nodes = this.game.world.nodes;
      const lookTarget = this.game.draggingNode
        ? { x: this.game.draggingNode.x, y: this.game.draggingNode.y }
        : this.game.pipeActive
          ? level.pipe
          : this.game.pointer;

      // Draw structural first, then walkers, then dragging on top
      const order = { structural: 1, walker: 2, sucked: 3, dragging: 4 };
      const visible = nodes
        .filter(n => n.state !== 'collected' && n.state !== 'dead')
        .sort((a, b) => (order[a.state] || 0) - (order[b.state] || 0));

      for (const n of visible) {
        ctx.save();
        ctx.translate(n.x, n.y);
        ctx.scale(n.scaleX, n.scaleY);

        const r = n.state === 'walker' ? n.radius * 0.86 : n.radius;

        if (n.type === 'balloon') {
          this._drawBalloonBody(ctx, r);
        } else {
          this._drawGooBody(ctx, n, r, lookTarget);
        }

        // Pin indicator for terrain anchors
        if (n.pinned) {
          ctx.beginPath();
          ctx.arc(0, r * 0.65, 3.2, 0, Math.PI * 2);
          ctx.fillStyle = '#94a3b8';
          ctx.fill();
        }

        ctx.restore();
      }
    }

    _drawBalloonBody(ctx, r) {
      const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.35, 2, 0, 0, r * 1.1);
      grad.addColorStop(0, '#ffc8dd');
      grad.addColorStop(0.55, '#ff70a6');
      grad.addColorStop(1, '#c9184a');

      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.92, r * 1.08, 0, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = '#ff99c8';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Gloss highlight
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      ctx.ellipse(-r * 0.32, -r * 0.35, r * 0.22, r * 0.34, -0.5, 0, Math.PI * 2);
      ctx.fill();

      // Balloon knot
      ctx.fillStyle = '#c9184a';
      ctx.beginPath();
      ctx.moveTo(-4, r * 1.02);
      ctx.lineTo(4, r * 1.02);
      ctx.lineTo(0, r * 1.28);
      ctx.closePath();
      ctx.fill();
    }

    _drawGooBody(ctx, n, r, lookTarget) {
      const isGreen = n.type === 'green';
      const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.35, 1.5, 0, 0, r);
      if (isGreen) {
        grad.addColorStop(0, '#95d5b2');
        grad.addColorStop(0.55, '#40916c');
        grad.addColorStop(1, '#1b4332');
      } else {
        grad.addColorStop(0, '#4a5568');
        grad.addColorStop(0.55, '#1a202c');
        grad.addColorStop(1, '#090d12');
      }

      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Subtle rim for green detachable balls
      if (isGreen) {
        ctx.strokeStyle = 'rgba(149, 213, 178, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else if (n.state === 'walker') {
        ctx.strokeStyle = 'rgba(168, 218, 220, 0.45)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      // Expressive blinking eyes
      const blinking = n.blinkTimer < 0;
      const eyeOffsetX = r * 0.33;
      const eyeY = -r * 0.1;
      const eyeR = r * 0.3;

      if (blinking) {
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(-eyeOffsetX - eyeR * 0.7, eyeY);
        ctx.lineTo(-eyeOffsetX + eyeR * 0.7, eyeY);
        ctx.moveTo(eyeOffsetX - eyeR * 0.7, eyeY);
        ctx.lineTo(eyeOffsetX + eyeR * 0.7, eyeY);
        ctx.stroke();
      } else {
        const dx = lookTarget.x - n.x;
        const dy = lookTarget.y - n.y;
        const ang = Math.atan2(dy, dx);
        const pupilShift = eyeR * 0.36;
        const px = Math.cos(ang) * pupilShift;
        const py = Math.sin(ang) * pupilShift;

        for (const side of [-1, 1]) {
          const ex = side * eyeOffsetX;
          ctx.beginPath();
          ctx.arc(ex, eyeY, eyeR, 0, Math.PI * 2);
          ctx.fillStyle = '#f8fafc';
          ctx.fill();

          ctx.beginPath();
          ctx.arc(ex + px, eyeY + py, eyeR * 0.48, 0, Math.PI * 2);
          ctx.fillStyle = '#0f172a';
          ctx.fill();
        }
      }
    }

    _drawParticles(ctx) {
      for (const p of this.game.particles) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  return { CanvasRenderer };
});
