// 8-bit Web Audio API retro sound synthesizer (zero external audio files)

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.unlocked = false;
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
    this.unlocked = true;
  }

  setMuted(flag) {
    this.muted = Boolean(flag);
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  _canPlay() {
    return !this.muted && this.ctx && this.ctx.state === 'running';
  }

  _playTone({ type = 'square', freq = 440, endFreq = null, duration = 0.1, gain = 0.12, delay = 0 }) {
    if (!this._canPlay()) return;
    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    }
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.01);
  }

  _playNoise({ duration = 0.2, gain = 0.16, filterFreq = 800, delay = 0 }) {
    if (!this._canPlay()) return;
    const now = this.ctx.currentTime + delay;
    const sampleRate = this.ctx.sampleRate;
    const length = Math.max(1, Math.floor(sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFreq, now);
    filter.frequency.exponentialRampToValueAtTime(120, now + duration);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);

    src.connect(filter);
    filter.connect(g);
    g.connect(this.ctx.destination);
    src.start(now);
    src.stop(now + duration + 0.01);
  }

  play(event) {
    if (!this._canPlay()) return;
    switch (event) {
      case 'shoot':
        this._playTone({ type: 'square', freq: 620, endFreq: 180, duration: 0.08, gain: 0.09 });
        break;
      case 'hit_brick':
        this._playNoise({ duration: 0.07, gain: 0.1, filterFreq: 1200 });
        break;
      case 'hit_steel':
        this._playTone({ type: 'triangle', freq: 980, endFreq: 720, duration: 0.07, gain: 0.1 });
        break;
      case 'hit_armor':
        this._playTone({ type: 'square', freq: 420, endFreq: 560, duration: 0.06, gain: 0.09 });
        break;
      case 'explode_enemy':
        this._playNoise({ duration: 0.24, gain: 0.16, filterFreq: 900 });
        this._playTone({ type: 'sawtooth', freq: 160, endFreq: 45, duration: 0.22, gain: 0.1 });
        break;
      case 'explode_player':
      case 'explode_base':
        this._playNoise({ duration: 0.55, gain: 0.22, filterFreq: 650 });
        this._playTone({ type: 'sawtooth', freq: 140, endFreq: 32, duration: 0.5, gain: 0.14 });
        break;
      case 'powerup_spawn':
        this._playTone({ type: 'square', freq: 523, duration: 0.06, gain: 0.08, delay: 0 });
        this._playTone({ type: 'square', freq: 659, duration: 0.06, gain: 0.08, delay: 0.07 });
        this._playTone({ type: 'square', freq: 784, duration: 0.09, gain: 0.08, delay: 0.14 });
        break;
      case 'powerup_pickup': {
        const notes = [523, 659, 784, 1046];
        notes.forEach((f, idx) => {
          this._playTone({ type: 'square', freq: f, duration: 0.07, gain: 0.09, delay: idx * 0.06 });
        });
        break;
      }
      case 'extra_life': {
        const notes = [659, 784, 1318, 1046, 1174, 1567];
        notes.forEach((f, idx) => {
          this._playTone({ type: 'square', freq: f, duration: 0.08, gain: 0.09, delay: idx * 0.07 });
        });
        break;
      }
      case 'stage_start': {
        // Classic Battle City inspired 8-bit opening fanfare
        const melody = [
          [262, 0.10], [330, 0.10], [392, 0.10], [523, 0.18],
          [392, 0.10], [523, 0.26],
        ];
        let t = 0;
        for (const [f, d] of melody) {
          this._playTone({ type: 'square', freq: f, duration: d, gain: 0.09, delay: t });
          t += d + 0.03;
        }
        break;
      }
      case 'pause':
        this._playTone({ type: 'square', freq: 880, duration: 0.06, gain: 0.08, delay: 0 });
        this._playTone({ type: 'square', freq: 660, duration: 0.06, gain: 0.08, delay: 0.07 });
        break;
      case 'game_over': {
        const melody = [392, 349, 330, 294, 262];
        melody.forEach((f, idx) => {
          this._playTone({ type: 'triangle', freq: f, duration: 0.16, gain: 0.12, delay: idx * 0.17 });
        });
        break;
      }
      default:
        break;
    }
  }
}
