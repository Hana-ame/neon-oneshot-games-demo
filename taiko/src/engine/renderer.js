import { JUDGEMENTS, NOTE_TYPES, isBigNote, isDonNote } from './constants.js';

/**
 * High-DPI HTML5 Canvas renderer for Web Taiko Master.
 * Renders the Japanese Matsuri stage, animated mascot, soul gauge,
 * scrolling note track, drum hit feedback, judgement bursts, and Go-Go fever effects.
 */
export class TaikoCanvasRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = 960;
    this.height = 360;
    this.dpr = 1;

    // Transient visual effects
    this.drumFlash = { leftKa: 0, leftDon: 0, rightDon: 0, rightKa: 0 };
    this.judgementPopups = [];
    this.hitRings = [];
    this.flyingNotes = [];
    this.confetti = [];
    this.mascotBounce = 0;

    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(320, Math.floor(rect.width || 960));
    const h = Math.max(240, Math.floor(rect.height || 360));
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = w;
    this.height = h;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  triggerDrumFlash(zone) {
    if (zone in this.drumFlash) {
      this.drumFlash[zone] = 1.0;
    }
  }

  triggerHitEffect(event) {
    const hitX = this._getHitZoneX();
    const laneY = this._getLaneCenterY();

    if (event.kind === 'judgement') {
      const label =
        event.judgement === JUDGEMENTS.GREAT
          ? '良'
          : event.judgement === JUDGEMENTS.GOOD
          ? '可'
          : '不可';
      const color =
        event.judgement === JUDGEMENTS.GREAT
          ? '#fde047'
          : event.judgement === JUDGEMENTS.GOOD
          ? '#f8fafc'
          : '#94a3b8';

      this.judgementPopups.push({
        label,
        color,
        x: hitX,
        y: laneY - 42,
        alpha: 1,
        scale: 1.35,
        age: 0,
      });

      if (event.judgement !== JUDGEMENTS.MISS) {
        this.hitRings.push({
          x: hitX,
          y: laneY,
          radius: 26,
          maxRadius: event.judgement === JUDGEMENTS.GREAT ? 76 : 56,
          color: event.judgement === JUDGEMENTS.GREAT ? '#facc15' : '#e2e8f0',
          alpha: 1,
        });
        this.flyingNotes.push({
          startX: hitX,
          startY: laneY,
          targetX: this.width - 70,
          targetY: 46,
          progress: 0,
          isDon: isDonNote(event.note.type),
          isBig: isBigNote(event.note.type),
        });
        this.mascotBounce = 1.0;
      }
    } else if (event.kind === 'drumroll' || event.kind === 'balloon_hit' || event.kind === 'balloon_pop') {
      this.hitRings.push({
        x: hitX,
        y: laneY,
        radius: 22,
        maxRadius: event.kind === 'balloon_pop' ? 92 : 54,
        color: event.kind === 'balloon_pop' ? '#fb923c' : '#fde047',
        alpha: 1,
      });
      if (event.kind === 'balloon_pop') {
        this.judgementPopups.push({
          label: '割れた! +3000',
          color: '#fb923c',
          x: hitX + 18,
          y: laneY - 50,
          alpha: 1,
          scale: 1.4,
          age: 0,
        });
      }
      this.mascotBounce = 0.8;
    }
  }

  _getHitZoneX() {
    return Math.max(115, Math.min(180, this.width * 0.2));
  }

  _getLaneCenterY() {
    return this.height * 0.62;
  }

  _getLaneHeight() {
    return Math.max(92, Math.min(126, this.height * 0.34));
  }

  render(state, dtSec = 0.016) {
    const ctx = this.ctx;
    const W = this.width;
    const H = this.height;
    const hitX = this._getHitZoneX();
    const laneY = this._getLaneCenterY();
    const laneH = this._getLaneHeight();

    // Update effect animations
    for (const key of Object.keys(this.drumFlash)) {
      this.drumFlash[key] = Math.max(0, this.drumFlash[key] - dtSec * 6.5);
    }
    this.mascotBounce = Math.max(0, this.mascotBounce - dtSec * 4.5);

    const isGogo = Boolean(state.isGogo);
    const isFever = state.soul >= state.clearThreshold;

    // 1. Background stage (Matsuri night sky -> fiery red/gold during Go-Go Time)
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    if (isGogo) {
      bgGrad.addColorStop(0, '#450a0a');
      bgGrad.addColorStop(0.55, '#7c2d12');
      bgGrad.addColorStop(1, '#1c1917');
    } else {
      bgGrad.addColorStop(0, '#1e1b4b');
      bgGrad.addColorStop(0.55, '#312e81');
      bgGrad.addColorStop(1, '#18181b');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Subtle decorative Matsuri lanterns along top banner
    this._drawLanterns(ctx, W, state.songTimeMs, isGogo);

    // 2. Animated Taiko mascot (top-left stage area)
    this._drawMascot(ctx, 64, Math.max(66, laneY - laneH * 0.78), state.bpm || 130, state.songTimeMs, isGogo, isFever);

    // 3. Soul Gauge (top-right stage area)
    this._drawSoulGauge(ctx, W, state.soul, state.clearThreshold, state.songTimeMs);

    // 4. Note Track / Lane
    const laneTop = laneY - laneH / 2;
    const laneGrad = ctx.createLinearGradient(0, laneTop, 0, laneTop + laneH);
    laneGrad.addColorStop(0, isGogo ? '#431407' : '#1f2937');
    laneGrad.addColorStop(0.5, isGogo ? '#5c1d0c' : '#111827');
    laneGrad.addColorStop(1, isGogo ? '#2c0b04' : '#0f172a');
    ctx.fillStyle = laneGrad;
    ctx.fillRect(0, laneTop, W, laneH);

    // Wooden gold borders
    ctx.fillStyle = isGogo ? '#f59e0b' : '#b45309';
    ctx.fillRect(0, laneTop - 5, W, 5);
    ctx.fillRect(0, laneTop + laneH, W, 5);

    // Measure beat guide lines
    this._drawBeatLines(ctx, state, hitX, laneTop, laneH);

    // Hit zone target circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(hitX, laneY, 32, 0, Math.PI * 2);
    ctx.fillStyle = isGogo ? 'rgba(250, 204, 21, 0.22)' : 'rgba(255, 255, 255, 0.1)';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = isGogo ? '#fde047' : 'rgba(255, 255, 255, 0.55)';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(hitX, laneY, 21, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.stroke();
    ctx.restore();

    // 5. Scrolling Notes (draw right-to-left so earlier notes render on top)
    this._drawNotes(ctx, state, hitX, laneY);

    // 6. Left-side interactive mini Taiko drum indicator + Combo counter
    this._drawMiniDrum(ctx, Math.min(58, hitX * 0.45), laneY, Math.min(44, laneH * 0.42), state.combo);

    // 7. Hit rings, flying soul notes, judgement popups & Go-Go confetti
    this._drawEffects(ctx, dtSec, isGogo, W, H);
  }

  _drawLanterns(ctx, W, songTimeMs, isGogo) {
    const count = Math.max(4, Math.floor(W / 140));
    const sway = Math.sin(songTimeMs / 450) * 4;
    ctx.save();
    // Rope
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 14);
    ctx.quadraticCurveTo(W / 2, 26, W, 14);
    ctx.stroke();

    for (let i = 1; i < count; i++) {
      const lx = (W / count) * i + sway * (i % 2 === 0 ? 1 : -1);
      const ly = 24;
      ctx.fillStyle = isGogo ? '#fb923c' : i % 2 === 0 ? '#dc2626' : '#f59e0b';
      ctx.beginPath();
      ctx.ellipse(lx, ly, 11, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(lx - 5, ly - 15, 10, 3);
      ctx.fillRect(lx - 5, ly + 12, 10, 3);
    }
    ctx.restore();
  }

  _drawMascot(ctx, x, y, bpm, songTimeMs, isGogo, isFever) {
    const beatPhase = ((songTimeMs / 60000) * bpm) % 1;
    const bob = Math.abs(Math.sin(beatPhase * Math.PI)) * -7 - this.mascotBounce * 6;
    const cy = y + bob;

    ctx.save();
    // Outer drum body (cyan rim)
    ctx.beginPath();
    ctx.arc(x, cy, 28, 0, Math.PI * 2);
    ctx.fillStyle = isGogo ? '#f59e0b' : '#38bdf8';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // Inner face (vermilion)
    ctx.beginPath();
    ctx.arc(x, cy, 21, 0, Math.PI * 2);
    ctx.fillStyle = '#ef4444';
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#111827';
    if (isFever || isGogo) {
      // Happy > < eyes
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x - 10, cy - 5);
      ctx.lineTo(x - 6, cy - 2);
      ctx.lineTo(x - 10, cy + 1);
      ctx.moveTo(x + 10, cy - 5);
      ctx.lineTo(x + 6, cy - 2);
      ctx.lineTo(x + 10, cy + 1);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(x - 7, cy - 3, 3, 0, Math.PI * 2);
      ctx.arc(x + 7, cy - 3, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Smile
    ctx.beginPath();
    ctx.arc(x, cy + 3, 6, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // Go-Go crown / aura
    if (isGogo) {
      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('GO-GO!', x, cy - 34);
    }
    ctx.restore();
  }

  _drawSoulGauge(ctx, W, soul, clearThreshold, songTimeMs) {
    const barW = Math.min(340, Math.max(170, W * 0.36));
    const barH = 22;
    const x = W - barW - 58;
    const y = 34;

    ctx.save();
    // Background frame
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(x - 3, y - 3, barW + 6, barH + 6);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 3, y - 3, barW + 6, barH + 6);

    // Fill
    const fillW = (Math.max(0, Math.min(100, soul)) / 100) * barW;
    const cleared = soul >= clearThreshold;
    const grad = ctx.createLinearGradient(x, y, x + barW, y);
    if (cleared) {
      const pulse = 0.5 + 0.5 * Math.sin(songTimeMs / 120);
      grad.addColorStop(0, '#facc15');
      grad.addColorStop(0.5, pulse > 0.5 ? '#fb923c' : '#fde047');
      grad.addColorStop(1, '#ef4444');
    } else {
      grad.addColorStop(0, '#f59e0b');
      grad.addColorStop(1, '#ef4444');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, fillW, barH);

    // Clear threshold marker
    const threshX = x + (clearThreshold / 100) * barW;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(threshX, y - 4);
    ctx.lineTo(threshX, y + barH + 4);
    ctx.stroke();

    // Label
    ctx.fillStyle = '#fef3c7';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`魂槽 ${Math.round(soul)}%`, x, y - 8);
    ctx.textAlign = 'right';
    ctx.fillText(`过关线 ${clearThreshold}%`, x + barW, y - 8);

    // Tamashii (魂) emblem circle
    const orbX = x + barW + 26;
    const orbY = y + barH / 2;
    ctx.beginPath();
    ctx.arc(orbX, orbY, 17, 0, Math.PI * 2);
    ctx.fillStyle = cleared ? '#ef4444' : '#334155';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = cleared ? '#fde047' : '#64748b';
    ctx.stroke();
    ctx.fillStyle = cleared ? '#fef08a' : '#94a3b8';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('魂', orbX, orbY + 1);
    ctx.restore();
  }

  _drawBeatLines(ctx, state, hitX, laneTop, laneH) {
    const bpm = state.bpm || 130;
    const pxPerMs = this._getPixelsPerMs(bpm, state.scrollSpeed || 1);
    const beatMs = 60000 / bpm;
    const measureMs = beatMs * 4;
    const offsetMs = state.offsetMs || 0;
    const visibleMs = (this.width - hitX) / pxPerMs + 400;

    const firstMeasure = Math.max(0, Math.floor((state.songTimeMs - offsetMs - 300) / measureMs));
    const lastMeasure = Math.ceil((state.songTimeMs - offsetMs + visibleMs) / measureMs);

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 2;
    for (let m = firstMeasure; m <= lastMeasure; m++) {
      const mTime = offsetMs + m * measureMs;
      const x = hitX + (mTime - state.songTimeMs) * pxPerMs;
      if (x < hitX - 40 || x > this.width + 20) continue;
      ctx.beginPath();
      ctx.moveTo(x, laneTop);
      ctx.lineTo(x, laneTop + laneH);
      ctx.stroke();
    }
    ctx.restore();
  }

  _getPixelsPerMs(bpm, scrollSpeed) {
    // Base speed scales naturally with BPM & viewport width
    const trackLen = Math.max(300, this.width - this._getHitZoneX());
    const beatsVisible = 3.2 / Math.max(0.5, Math.min(2.0, scrollSpeed));
    const visibleMs = (60000 / Math.max(60, bpm)) * beatsVisible;
    return trackLen / visibleMs;
  }

  _drawNotes(ctx, state, hitX, laneY) {
    const notes = state.notes || [];
    const songTimeMs = state.songTimeMs || 0;
    const scrollSpeed = state.scrollSpeed || 1;
    const baseBpm = state.bpm || 130;

    // Collect visible notes and draw in reverse so earlier notes stay on top
    const visible = [];
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      if (n.judged && n.type !== NOTE_TYPES.DRUMROLL) continue;
      if (n.type === NOTE_TYPES.DRUMROLL && songTimeMs > n.endTimeMs + 120) continue;

      const pxPerMs = this._getPixelsPerMs(n.bpm || baseBpm, scrollSpeed * (n.scroll || 1));
      const x = hitX + (n.timeMs - songTimeMs) * pxPerMs;
      const endX = hitX + ((n.endTimeMs ?? n.timeMs) - songTimeMs) * pxPerMs;

      if (endX < -70) continue;
      if (x > this.width + 70) continue;
      visible.push({ n, x, endX });
    }

    for (let i = visible.length - 1; i >= 0; i--) {
      const { n, x, endX } = visible[i];
      if (n.type === NOTE_TYPES.DRUMROLL) {
        this._drawDrumroll(ctx, x, endX, laneY);
      } else if (n.type === NOTE_TYPES.BALLOON) {
        this._drawBalloon(ctx, x, endX, laneY, n, hitX);
      } else {
        this._drawStandardNote(ctx, x, laneY, n.type);
      }
    }
  }

  _drawStandardNote(ctx, x, y, type) {
    const big = isBigNote(type);
    const don = isDonNote(type);
    const r = big ? 30 : 21;

    ctx.save();
    // Outer white ring
    ctx.beginPath();
    ctx.arc(x, y, r + 3.5, 0, Math.PI * 2);
    ctx.fillStyle = big ? '#fde047' : '#ffffff';
    ctx.fill();

    // Inner dark stroke
    ctx.beginPath();
    ctx.arc(x, y, r + 1, 0, Math.PI * 2);
    ctx.fillStyle = '#111827';
    ctx.fill();

    // Colored face
    ctx.beginPath();
    ctx.arc(x, y, r - 1.5, 0, Math.PI * 2);
    ctx.fillStyle = don ? '#ef4444' : '#0ea5e9';
    ctx.fill();

    // Gloss highlight
    ctx.beginPath();
    ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fill();

    // Cute note label ("咚"/"咔")
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${big ? 16 : 12}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(don ? '咚' : '咔', x, y + 1);
    ctx.restore();
  }

  _drawDrumroll(ctx, x, endX, y) {
    const r = 20;
    const width = Math.max(20, endX - x);
    ctx.save();
    // Capsule body
    ctx.fillStyle = '#facc15';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(x, y - r, width, r * 2, r);
    ctx.fill();
    ctx.stroke();

    // Head circle
    ctx.beginPath();
    ctx.arc(x, y, r + 2, 0, Math.PI * 2);
    ctx.fillStyle = '#eab308';
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#422006';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('连打', x + Math.min(width / 2, 34), y + 1);
    ctx.restore();
  }

  _drawBalloon(ctx, x, endX, y, note, hitX) {
    const drawX = Math.max(hitX, Math.min(x, endX));
    const remaining = Math.max(0, note.requiredHits - note.hits);
    ctx.save();
    // Tail line
    if (endX > drawX + 20) {
      ctx.strokeStyle = 'rgba(251, 146, 60, 0.7)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(drawX + 22, y);
      ctx.lineTo(endX, y);
      ctx.stroke();
    }
    // Balloon bulb
    const scale = 1 + (note.hits / Math.max(1, note.requiredHits)) * 0.25;
    ctx.beginPath();
    ctx.ellipse(drawX, y, 26 * scale, 22 * scale, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#f97316';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${remaining}`, drawX, y + 1);
    ctx.restore();
  }

  _drawMiniDrum(ctx, cx, cy, r, combo) {
    ctx.save();
    // Rim base
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#334155';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#f8fafc';
    ctx.stroke();

    // Left Ka flash
    if (this.drumFlash.leftKa > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, r - 2, Math.PI * 0.5, Math.PI * 1.5);
      ctx.fillStyle = `rgba(14, 165, 233, ${this.drumFlash.leftKa})`;
      ctx.fill();
    }
    // Right Ka flash
    if (this.drumFlash.rightKa > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, r - 2, -Math.PI * 0.5, Math.PI * 0.5);
      ctx.fillStyle = `rgba(14, 165, 233, ${this.drumFlash.rightKa})`;
      ctx.fill();
    }

    // Inner drumhead
    const ir = r * 0.72;
    ctx.beginPath();
    ctx.arc(cx, cy, ir, 0, Math.PI * 2);
    ctx.fillStyle = '#fef3c7';
    ctx.fill();

    // Left Don flash
    if (this.drumFlash.leftDon > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, ir, Math.PI * 0.5, Math.PI * 1.5);
      ctx.fillStyle = `rgba(239, 68, 68, ${this.drumFlash.leftDon})`;
      ctx.fill();
    }
    // Right Don flash
    if (this.drumFlash.rightDon > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, ir, -Math.PI * 0.5, Math.PI * 0.5);
      ctx.fillStyle = `rgba(239, 68, 68, ${this.drumFlash.rightDon})`;
      ctx.fill();
    }

    // Combo text inside mini drum
    if (combo >= 2) {
      ctx.fillStyle = combo >= 50 ? '#dc2626' : '#1e293b';
      ctx.font = `900 ${combo >= 100 ? 18 : 22}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(combo), cx, cy - 3);
      ctx.font = 'bold 9px sans-serif';
      ctx.fillStyle = '#64748b';
      ctx.fillText('COMBO', cx, cy + 14);
    }
    ctx.restore();
  }

  _drawEffects(ctx, dtSec, isGogo, W, H) {
    // Hit shockwave rings
    for (let i = this.hitRings.length - 1; i >= 0; i--) {
      const ring = this.hitRings[i];
      ring.radius += dtSec * 220;
      ring.alpha -= dtSec * 3.8;
      if (ring.alpha <= 0 || ring.radius >= ring.maxRadius) {
        this.hitRings.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
      ctx.strokeStyle = ring.color;
      ctx.globalAlpha = Math.max(0, ring.alpha);
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();
    }

    // Flying notes curving up to Soul Gauge
    for (let i = this.flyingNotes.length - 1; i >= 0; i--) {
      const fn = this.flyingNotes[i];
      fn.progress += dtSec * 2.6;
      if (fn.progress >= 1) {
        this.flyingNotes.splice(i, 1);
        continue;
      }
      const t = fn.progress;
      const x = fn.startX + (fn.targetX - fn.startX) * t;
      const arc = Math.sin(t * Math.PI) * -95;
      const y = fn.startY + (fn.targetY - fn.startY) * t + arc;
      ctx.save();
      ctx.globalAlpha = 1 - t * 0.6;
      ctx.beginPath();
      ctx.arc(x, y, fn.isBig ? 14 : 10, 0, Math.PI * 2);
      ctx.fillStyle = fn.isDon ? '#ef4444' : '#0ea5e9';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.restore();
    }

    // Judgement text popups
    for (let i = this.judgementPopups.length - 1; i >= 0; i--) {
      const p = this.judgementPopups[i];
      p.age += dtSec;
      p.y -= dtSec * 38;
      p.scale = Math.max(1, p.scale - dtSec * 2.5);
      p.alpha = Math.max(0, 1 - p.age / 0.55);
      if (p.alpha <= 0) {
        this.judgementPopups.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.translate(p.x, p.y);
      ctx.scale(p.scale, p.scale);
      ctx.font = '900 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#0f172a';
      ctx.strokeText(p.label, 0, 0);
      ctx.fillStyle = p.color;
      ctx.fillText(p.label, 0, 0);
      ctx.restore();
    }

    // Go-Go Time festive sparkles
    if (isGogo && this.confetti.length < 24 && Math.random() < 0.35) {
      this.confetti.push({
        x: Math.random() * W,
        y: -8,
        vx: (Math.random() - 0.5) * 40,
        vy: 50 + Math.random() * 70,
        color: ['#fde047', '#fb923c', '#f43f5e', '#38bdf8'][Math.floor(Math.random() * 4)],
        size: 4 + Math.random() * 4,
      });
    }
    for (let i = this.confetti.length - 1; i >= 0; i--) {
      const c = this.confetti[i];
      c.x += c.vx * dtSec;
      c.y += c.vy * dtSec;
      if (c.y > H + 12) {
        this.confetti.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.fillStyle = c.color;
      ctx.fillRect(c.x, c.y, c.size, c.size);
      ctx.restore();
    }
  }
}
