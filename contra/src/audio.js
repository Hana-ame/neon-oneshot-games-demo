// Web Audio API 复古 8-bit 音效与背景音乐合成引擎

export class RetroAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.bgmTimer = null;
    this.bgmStep = 0;
    this.bgmActive = false;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    if (typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    try {
      this.ctx = new AudioCtx();
    } catch {
      this.ctx = null;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.muted) {
      this.stopBgm();
    }
    return this.muted;
  }

  setMuted(value) {
    this.muted = Boolean(value);
    if (this.muted) {
      this.stopBgm();
    }
  }

  playTone(freq, duration, type = 'square', volume = 0.08, slideTo = null) {
    if (this.muted || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (slideTo !== null) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + duration);
      }
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + duration);
    } catch {
      // 忽略自动播放策略限制错误
    }
  }

  playNoise(duration = 0.18, volume = 0.12) {
    if (this.muted || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const sampleRate = this.ctx.sampleRate;
      const bufferSize = Math.max(1, Math.floor(sampleRate * duration));
      const buffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(950, now);
      filter.frequency.exponentialRampToValueAtTime(140, now + duration);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      noise.start(now);
      noise.stop(now + duration);
    } catch {
      // 忽略音频上下文异常
    }
  }

  playShoot(weaponId = 'R') {
    if (weaponId === 'L') {
      this.playTone(980, 0.11, 'sawtooth', 0.08, 220);
    } else if (weaponId === 'S') {
      this.playTone(540, 0.09, 'square', 0.09, 170);
      this.playNoise(0.05, 0.06);
    } else if (weaponId === 'F') {
      this.playTone(360, 0.12, 'triangle', 0.09, 140);
    } else if (weaponId === 'M') {
      this.playTone(680, 0.06, 'square', 0.07, 260);
    } else {
      this.playTone(620, 0.07, 'square', 0.07, 210);
    }
  }

  playJump() {
    this.playTone(210, 0.11, 'square', 0.06, 460);
  }

  playHit() {
    this.playTone(260, 0.05, 'triangle', 0.07, 110);
  }

  playExplosion(big = false) {
    this.playNoise(big ? 0.36 : 0.18, big ? 0.16 : 0.11);
    this.playTone(big ? 130 : 180, big ? 0.28 : 0.12, 'sawtooth', 0.08, 35);
  }

  playPowerup() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, idx) => {
      setTimeout(() => this.playTone(n, 0.08, 'square', 0.07), idx * 55);
    });
  }

  playPlayerDeath() {
    this.playNoise(0.28, 0.14);
    const notes = [330, 293.66, 246.94, 196, 146.83];
    notes.forEach((n, idx) => {
      setTimeout(() => this.playTone(n, 0.1, 'sawtooth', 0.08, n * 0.8), idx * 75);
    });
  }

  playKonami() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((n, idx) => {
      setTimeout(() => this.playTone(n, 0.1, 'square', 0.09), idx * 65);
    });
  }

  playStageClear() {
    const notes = [392, 523.25, 659.25, 783.99, 659.25, 1046.5];
    notes.forEach((n, idx) => {
      setTimeout(() => this.playTone(n, 0.14, 'square', 0.08), idx * 110);
    });
  }

  startBgm(stageIndex = 0) {
    if (this.muted || !this.ctx) return;
    this.stopBgm();
    this.bgmActive = true;
    this.bgmStep = 0;

    // 丛林快节奏进行曲与要塞紧张低音旋律
    const melodyStage1 = [
      330, 0, 330, 392, 440, 0, 392, 330,
      293.66, 0, 293.66, 330, 392, 0, 330, 0,
      261.63, 330, 392, 523.25, 493.88, 0, 440, 392,
      330, 0, 293.66, 261.63, 293.66, 0, 0, 0
    ];
    const melodyStage2 = [
      220, 0, 261.63, 220, 329.63, 0, 293.66, 261.63,
      246.94, 0, 293.66, 246.94, 349.23, 0, 329.63, 293.66,
      220, 261.63, 329.63, 440, 392, 0, 349.23, 329.63,
      293.66, 0, 246.94, 220, 196, 0, 0, 0
    ];
    const bassPattern = [110, 110, 130.81, 146.83, 110, 110, 98, 130.81];
    const melody = stageIndex === 0 ? melodyStage1 : melodyStage2;

    this.bgmTimer = setInterval(() => {
      if (this.muted || !this.bgmActive || !this.ctx) return;
      const note = melody[this.bgmStep % melody.length];
      const bass = bassPattern[this.bgmStep % bassPattern.length];
      if (note > 0) {
        this.playTone(note, 0.11, 'square', 0.028);
      }
      if (this.bgmStep % 2 === 0) {
        this.playTone(bass, 0.13, 'triangle', 0.036);
      }
      this.bgmStep += 1;
    }, 150);
  }

  stopBgm() {
    this.bgmActive = false;
    if (this.bgmTimer) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }
}
