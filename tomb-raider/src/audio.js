/**
 * 程序化 Web Audio API 音效合成器
 * 零外部音频资源依赖，在首次用户交互后安全解锁 AudioContext
 */

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      this.ctx = new AudioCtx();
    }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  play(name) {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    switch (name) {
      case 'shoot':
        this.playNoise(now, 0.07, 1800, 0.18);
        this.playTone(now, 'triangle', 260, 75, 0.08, 0.16);
        break;
      case 'jump':
        this.playTone(now, 'sine', 210, 440, 0.11, 0.12);
        break;
      case 'roll':
        this.playNoise(now, 0.14, 600, 0.12);
        break;
      case 'ledge':
        this.playTone(now, 'square', 160, 260, 0.07, 0.09);
        break;
      case 'lever':
        this.playTone(now, 'square', 320, 520, 0.09, 0.12);
        this.playTone(now + 0.08, 'triangle', 520, 680, 0.1, 0.12);
        break;
      case 'door':
        this.playTone(now, 'sawtooth', 95, 55, 0.42, 0.14);
        break;
      case 'crumble':
        this.playNoise(now, 0.25, 420, 0.14);
        break;
      case 'hit':
        this.playTone(now, 'square', 190, 90, 0.06, 0.11);
        break;
      case 'enemy_die':
        this.playTone(now, 'sawtooth', 260, 70, 0.22, 0.14);
        break;
      case 'boss_attack':
        this.playTone(now, 'sawtooth', 120, 48, 0.3, 0.18);
        break;
      case 'boss_die':
        this.playTone(now, 'sawtooth', 180, 40, 0.65, 0.22);
        this.playNoise(now, 0.5, 500, 0.18);
        break;
      case 'hurt':
        this.playTone(now, 'sawtooth', 180, 85, 0.18, 0.18);
        break;
      case 'heal':
        this.playTone(now, 'sine', 440, 660, 0.16, 0.12);
        this.playTone(now + 0.12, 'sine', 660, 880, 0.18, 0.12);
        break;
      case 'relic':
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
          this.playTone(now + idx * 0.065, 'sine', freq, freq, 0.16, 0.11);
        });
        break;
      case 'victory':
        [392, 523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
          this.playTone(now + idx * 0.09, 'triangle', freq, freq, 0.26, 0.14);
        });
        break;
      case 'gameover':
        [311, 277, 233, 174].forEach((freq, idx) => {
          this.playTone(now + idx * 0.13, 'sawtooth', freq, freq * 0.92, 0.22, 0.12);
        });
        break;
      default:
        break;
    }
  }

  playTone(start, type, freqStart, freqEnd, duration, volume) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), start + duration);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  playNoise(start, duration, filterFreq, volume) {
    const sampleCount = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, sampleCount, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFreq, start);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    src.start(start);
  }
}
