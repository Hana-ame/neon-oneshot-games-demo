/**
 * 复古街机 Web Audio API 合成器（零外部音频依赖）
 */

export class ArcadeAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.wakaFlip = false;
  }

  unlock() {
    if (this.muted) return;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (!this.muted) this.unlock();
    return this.muted;
  }

  _tone(freqStart, freqEnd, duration, type = 'square', gainPeak = 0.08, delay = 0) {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainPeak, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playWaka() {
    this.wakaFlip = !this.wakaFlip;
    if (this.wakaFlip) {
      this._tone(240, 420, 0.075, 'triangle', 0.07);
    } else {
      this._tone(380, 210, 0.075, 'triangle', 0.07);
    }
  }

  playPowerPellet() {
    this._tone(220, 660, 0.16, 'sawtooth', 0.07, 0);
    this._tone(330, 880, 0.18, 'square', 0.06, 0.08);
  }

  playGhostEaten() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, i) => {
      this._tone(n, n * 1.08, 0.08, 'square', 0.08, i * 0.055);
    });
  }

  playFruit() {
    this._tone(587.33, 880, 0.09, 'triangle', 0.08, 0);
    this._tone(880, 1174.66, 0.12, 'triangle', 0.08, 0.09);
  }

  playStartJingle() {
    const melody = [
      [493.88, 0.1], [987.77, 0.1], [739.99, 0.1], [622.25, 0.1],
      [987.77, 0.08], [739.99, 0.14], [622.25, 0.18],
      [523.25, 0.1], [1046.5, 0.1], [783.99, 0.1], [659.25, 0.1],
      [1046.5, 0.08], [783.99, 0.14], [659.25, 0.2],
    ];
    let t = 0;
    for (const [freq, dur] of melody) {
      this._tone(freq, freq, dur * 0.9, 'square', 0.055, t);
      t += dur;
    }
  }

  playDeath() {
    const steps = 10;
    for (let i = 0; i < steps; i++) {
      const f = 620 - i * 48;
      this._tone(f, f * 0.85, 0.09, 'sawtooth', 0.075, i * 0.095);
    }
  }

  playLevelClear() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
    notes.forEach((n, i) => {
      this._tone(n, n, 0.13, 'square', 0.07, i * 0.12);
    });
  }

  playExtraLife() {
    const notes = [659.25, 783.99, 1318.5, 1046.5, 1174.66, 1567.98];
    notes.forEach((n, i) => {
      this._tone(n, n, 0.1, 'triangle', 0.09, i * 0.085);
    });
  }
}
