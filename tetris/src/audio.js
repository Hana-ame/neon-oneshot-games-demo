/**
 * Web Audio API 零依赖合成音效模块
 * 在首次用户交互时自动唤醒 AudioContext，支持一键静音切换
 */

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  unlock() {
    if (this.muted) return;
    if (!this.ctx && typeof window !== 'undefined') {
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

  _tone(freq, duration, type = 'triangle', volume = 0.08, delay = 0) {
    if (this.muted || !this.ctx) return;
    try {
      const now = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(volume, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.01);
    } catch (_) {
      // 忽略浏览器音频上下文受限异常
    }
  }

  playMove() {
    this._tone(240, 0.04, 'sine', 0.04);
  }

  playRotate() {
    this._tone(420, 0.055, 'triangle', 0.06);
    this._tone(560, 0.04, 'sine', 0.04, 0.02);
  }

  playSoftDrop() {
    this._tone(180, 0.03, 'sine', 0.03);
  }

  playHardDrop() {
    this._tone(130, 0.09, 'sawtooth', 0.07);
    this._tone(85, 0.08, 'triangle', 0.08, 0.02);
  }

  playHold() {
    this._tone(330, 0.06, 'sine', 0.05);
    this._tone(440, 0.06, 'sine', 0.05, 0.04);
  }

  playLineClear(count = 1, isTSpin = false) {
    if (count >= 4 || isTSpin) {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((n, idx) => this._tone(n, 0.14, 'triangle', 0.09, idx * 0.055));
    } else {
      const base = 392 + count * 65;
      this._tone(base, 0.09, 'triangle', 0.07);
      this._tone(base * 1.25, 0.12, 'sine', 0.07, 0.05);
    }
  }

  playLevelUp() {
    [440, 554.37, 659.25, 880].forEach((n, idx) => {
      this._tone(n, 0.13, 'square', 0.05, idx * 0.06);
    });
  }

  playGameOver() {
    [349.23, 311.13, 277.18, 220].forEach((n, idx) => {
      this._tone(n, 0.18, 'sawtooth', 0.06, idx * 0.11);
    });
  }
}
