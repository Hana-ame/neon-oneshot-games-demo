/**
 * Crimson Night - Web Audio API 零素材程序化合成音效引擎
 * 在首次用户交互后解锁 AudioContext，支持静音切换与限流防爆音
 */

export class SoundSynthesizer {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.lastPlayed = new Map();
  }

  unlock() {
    if (typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  setMuted(flag) {
    this.muted = Boolean(flag);
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  _canPlay(key, minGapMs = 45) {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return false;
    const now = performance.now();
    const prev = this.lastPlayed.get(key) || 0;
    if (now - prev < minGapMs) return false;
    this.lastPlayed.set(key, now);
    return true;
  }

  _tone({ type = 'triangle', startFreq = 440, endFreq = 220, duration = 0.12, gain = 0.12, delay = 0 }) {
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, t0);
    if (endFreq !== startFreq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + duration);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  play(eventName) {
    switch (eventName) {
      case 'whip':
        if (!this._canPlay('whip', 90)) return;
        this._tone({ type: 'sawtooth', startFreq: 380, endFreq: 90, duration: 0.14, gain: 0.09 });
        break;
      case 'wand':
        if (!this._canPlay('wand', 70)) return;
        this._tone({ type: 'sine', startFreq: 760, endFreq: 420, duration: 0.09, gain: 0.07 });
        break;
      case 'knife':
        if (!this._canPlay('knife', 60)) return;
        this._tone({ type: 'triangle', startFreq: 1100, endFreq: 520, duration: 0.06, gain: 0.06 });
        break;
      case 'lightning':
        if (!this._canPlay('lightning', 100)) return;
        this._tone({ type: 'sawtooth', startFreq: 210, endFreq: 48, duration: 0.22, gain: 0.12 });
        this._tone({ type: 'square', startFreq: 980, endFreq: 160, duration: 0.12, gain: 0.06 });
        break;
      case 'hit':
        if (!this._canPlay('hit', 45)) return;
        this._tone({ type: 'square', startFreq: 190, endFreq: 95, duration: 0.05, gain: 0.045 });
        break;
      case 'gem':
        if (!this._canPlay('gem', 50)) return;
        this._tone({ type: 'sine', startFreq: 880, endFreq: 1320, duration: 0.07, gain: 0.055 });
        break;
      case 'player_hurt':
        if (!this._canPlay('player_hurt', 180)) return;
        this._tone({ type: 'sawtooth', startFreq: 145, endFreq: 55, duration: 0.18, gain: 0.14 });
        break;
      case 'levelup':
        if (!this._canPlay('levelup', 250)) return;
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
          this._tone({ type: 'triangle', startFreq: freq, endFreq: freq * 1.01, duration: 0.18, gain: 0.1, delay: i * 0.06 });
        });
        break;
      case 'chest':
        if (!this._canPlay('chest', 300)) return;
        [440, 554.37, 659.25, 880, 1108.73].forEach((freq, i) => {
          this._tone({ type: 'triangle', startFreq: freq, endFreq: freq, duration: 0.22, gain: 0.11, delay: i * 0.07 });
        });
        break;
      case 'boss':
        if (!this._canPlay('boss', 500)) return;
        this._tone({ type: 'sawtooth', startFreq: 110, endFreq: 55, duration: 0.55, gain: 0.16 });
        this._tone({ type: 'sawtooth', startFreq: 165, endFreq: 82, duration: 0.55, gain: 0.12, delay: 0.12 });
        break;
      case 'gameover':
        if (!this._canPlay('gameover', 500)) return;
        [330, 293.66, 261.63, 196].forEach((freq, i) => {
          this._tone({ type: 'sawtooth', startFreq: freq, endFreq: freq * 0.96, duration: 0.26, gain: 0.1, delay: i * 0.12 });
        });
        break;
      default:
        break;
    }
  }
}
