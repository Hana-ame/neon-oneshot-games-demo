/**
 * Procedural Web Audio API Sound Effects
 * 零外部音频文件的 Web Audio 合成音效引擎
 */

export class SoundManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  ensureContext() {
    if (this.muted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        try {
          this.ctx = new AudioCtx();
        } catch (_e) {
          return null;
        }
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  playTone(freq, duration = 0.1, type = 'triangle', volume = 0.12, slideTo = null) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (slideTo) {
        osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
      }
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration);
    } catch (_e) {
      // Ignore audio errors in restricted environments
    }
  }

  playClick() {
    this.playTone(520, 0.06, 'sine', 0.08, 620);
  }

  playMove() {
    this.playTone(220, 0.11, 'triangle', 0.1, 310);
  }

  playAttack() {
    this.playTone(150, 0.18, 'sawtooth', 0.14, 65);
    setTimeout(() => this.playTone(95, 0.15, 'square', 0.1, 45), 70);
  }

  playFoundCity() {
    this.playTone(392, 0.16, 'triangle', 0.12);
    setTimeout(() => this.playTone(523.25, 0.18, 'triangle', 0.12), 120);
    setTimeout(() => this.playTone(659.25, 0.28, 'triangle', 0.14), 240);
  }

  playTurn() {
    this.playTone(330, 0.12, 'sine', 0.09);
    setTimeout(() => this.playTone(440, 0.16, 'sine', 0.1), 90);
  }

  playTech() {
    [440, 554.37, 659.25, 880].forEach((f, i) => {
      setTimeout(() => this.playTone(f, 0.2, 'triangle', 0.11), i * 85);
    });
  }
}
