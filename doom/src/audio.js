export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.noiseBuffer = null;
  }

  unlock() {
    if (typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this._createNoiseBuffer();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  _createNoiseBuffer() {
    const sampleRate = this.ctx.sampleRate;
    const length = sampleRate * 1.0;
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
  }

  _playNoise(duration, filterFreq, gainVal, filterType = 'lowpass') {
    if (this.muted || !this.ctx || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, filterFreq * 0.25), now + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(gainVal, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    src.start(now);
    src.stop(now + duration);
  }

  _playTone(freqStart, freqEnd, duration, type = 'sawtooth', gainVal = 0.16) {
    if (this.muted || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(gainVal, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  handleEvent(event, payload = {}) {
    if (this.muted || !this.ctx) return;
    switch (event) {
      case 'weapon_fire':
        if (payload.weaponId === 'fist') {
          this._playNoise(0.11, 520, 0.22, 'bandpass');
        } else if (payload.weaponId === 'pistol') {
          this._playNoise(0.16, 1800, 0.26, 'bandpass');
          this._playTone(210, 65, 0.12, 'square', 0.16);
        } else if (payload.weaponId === 'shotgun') {
          this._playNoise(0.36, 1200, 0.42, 'lowpass');
          this._playTone(130, 36, 0.26, 'sawtooth', 0.24);
        } else if (payload.weaponId === 'plasma') {
          this._playTone(980, 260, 0.13, 'sawtooth', 0.15);
          this._playTone(1420, 420, 0.11, 'triangle', 0.1);
        }
        break;
      case 'enemy_hurt':
        this._playTone(180, 95, 0.14, 'sawtooth', 0.14);
        break;
      case 'enemy_death':
        this._playTone(240, 45, 0.36, 'sawtooth', 0.2);
        this._playNoise(0.28, 600, 0.2, 'lowpass');
        break;
      case 'enemy_alert':
        this._playTone(150, 290, 0.22, 'sawtooth', 0.12);
        break;
      case 'enemy_attack':
        this._playTone(420, 140, 0.18, 'square', 0.12);
        break;
      case 'player_hurt':
        this._playTone(140, 60, 0.22, 'sawtooth', 0.26);
        this._playNoise(0.16, 700, 0.18, 'lowpass');
        break;
      case 'player_death':
        this._playTone(180, 35, 0.85, 'sawtooth', 0.3);
        break;
      case 'pickup':
        this._playTone(520, 880, 0.14, 'triangle', 0.16);
        break;
      case 'door_open':
      case 'door_close':
        this._playNoise(0.32, 340, 0.16, 'bandpass');
        this._playTone(95, 70, 0.3, 'triangle', 0.1);
        break;
      case 'door_locked':
        this._playTone(140, 110, 0.16, 'square', 0.16);
        break;
      case 'level_complete':
      case 'victory':
        this._playTone(440, 880, 0.35, 'triangle', 0.2);
        break;
      default:
        break;
    }
  }
}
