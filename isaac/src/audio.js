/**
 * Web Audio API 程序化复古音效合成器（零外部音频文件）
 */
export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
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

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  playTone(freq, endFreq, duration, type = 'triangle', volume = 0.14) {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    }
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  playNoise(duration, volume = 0.18) {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    noise.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start();
  }

  handleEvent(eventType) {
    if (this.muted) return;
    switch (eventType) {
      case 'tear_fire':
        this.playTone(460, 220, 0.08, 'sine', 0.11);
        break;
      case 'tear_splash':
        this.playTone(210, 90, 0.05, 'triangle', 0.06);
        break;
      case 'enemy_hit':
        this.playTone(170, 95, 0.07, 'square', 0.09);
        break;
      case 'enemy_die':
        this.playTone(240, 65, 0.16, 'sawtooth', 0.12);
        this.playNoise(0.11, 0.1);
        break;
      case 'player_hurt':
        this.playTone(300, 110, 0.22, 'sawtooth', 0.18);
        break;
      case 'door_open':
        this.playTone(330, 520, 0.18, 'triangle', 0.12);
        break;
      case 'door_unlock':
        this.playTone(520, 780, 0.16, 'square', 0.1);
        break;
      case 'item_pickup':
        this.playTone(440, 440, 0.1, 'triangle', 0.14);
        setTimeout(() => this.playTone(554, 554, 0.1, 'triangle', 0.14), 90);
        setTimeout(() => this.playTone(659, 880, 0.22, 'triangle', 0.16), 180);
        break;
      case 'pickup_coin':
        this.playTone(880, 1320, 0.1, 'sine', 0.12);
        break;
      case 'pickup_heart':
        this.playTone(520, 680, 0.14, 'sine', 0.13);
        break;
      case 'bomb_place':
        this.playTone(190, 140, 0.09, 'triangle', 0.1);
        break;
      case 'bomb_explode':
        this.playNoise(0.35, 0.26);
        this.playTone(110, 32, 0.34, 'sawtooth', 0.22);
        break;
      case 'boss_roar':
        this.playTone(140, 55, 0.42, 'sawtooth', 0.2);
        break;
      case 'victory':
        [523, 659, 784, 1046].forEach((f, idx) => {
          setTimeout(() => this.playTone(f, f, 0.2, 'triangle', 0.16), idx * 120);
        });
        break;
      default:
        break;
    }
  }
}
