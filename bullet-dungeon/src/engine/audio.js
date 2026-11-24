// Web Audio API Synthesized Sound Engine (zero external audio files)

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.unlocked = false;
  }

  unlock() {
    if (this.unlocked && this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.unlocked = true;
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    } catch (_) {
      // Ignore audio errors in restricted environments
    }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  play(type) {
    if (this.muted || !this.ctx) return;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    const now = this.ctx.currentTime;
    switch (type) {
      case 'pistol':
        this._tone(now, 'square', 460, 140, 0.08, 0.12);
        this._noise(now, 0.05, 0.08, 1800);
        break;
      case 'shotgun':
        this._tone(now, 'sawtooth', 180, 55, 0.15, 0.18);
        this._noise(now, 0.14, 0.18, 900);
        break;
      case 'smg':
        this._tone(now, 'triangle', 580, 220, 0.05, 0.09);
        this._noise(now, 0.03, 0.06, 2600);
        break;
      case 'railgun':
        this._tone(now, 'sawtooth', 920, 160, 0.22, 0.16);
        this._tone(now + 0.02, 'sine', 1200, 320, 0.18, 0.12);
        break;
      case 'reload':
        this._tone(now, 'triangle', 320, 480, 0.07, 0.08);
        this._tone(now + 0.09, 'triangle', 480, 680, 0.07, 0.09);
        break;
      case 'roll':
        this._noise(now, 0.16, 0.11, 700);
        this._tone(now, 'sine', 240, 110, 0.14, 0.08);
        break;
      case 'blank':
        this._tone(now, 'sine', 300, 42, 0.42, 0.28);
        this._noise(now, 0.32, 0.22, 1200);
        break;
      case 'hit':
        this._tone(now, 'square', 210, 90, 0.06, 0.08);
        break;
      case 'enemyDie':
        this._tone(now, 'sawtooth', 260, 60, 0.16, 0.12);
        this._noise(now, 0.1, 0.1, 1100);
        break;
      case 'playerHit':
        this._tone(now, 'sawtooth', 160, 50, 0.22, 0.22);
        this._noise(now, 0.18, 0.15, 600);
        break;
      case 'pickup':
        this._tone(now, 'sine', 520, 780, 0.08, 0.11);
        this._tone(now + 0.07, 'sine', 780, 1040, 0.1, 0.11);
        break;
      case 'roomClear':
        this._tone(now, 'triangle', 440, 440, 0.1, 0.1);
        this._tone(now + 0.1, 'triangle', 554, 554, 0.1, 0.1);
        this._tone(now + 0.2, 'triangle', 659, 659, 0.18, 0.12);
        break;
      case 'bossSpawn':
        this._tone(now, 'sawtooth', 120, 55, 0.5, 0.2);
        this._tone(now + 0.15, 'square', 90, 45, 0.45, 0.16);
        break;
      default:
        break;
    }
  }

  _tone(start, oscType, freqStart, freqEnd, duration, gainPeak) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = oscType;
    osc.frequency.setValueAtTime(freqStart, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), start + duration);
    gain.gain.setValueAtTime(gainPeak, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.01);
  }

  _noise(start, duration, gainPeak, cutoff) {
    const sampleRate = this.ctx.sampleRate;
    const frameCount = Math.max(1, Math.floor(sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, frameCount, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, start);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(gainPeak, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    src.start(start);
    src.stop(start + duration + 0.01);
  }
}
