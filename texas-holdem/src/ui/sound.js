/**
 * sound.js - 基于 Web Audio API 的零依赖合成音效模块
 * 首次用户交互时安全初始化 AudioContext，支持静音切换
 */

export class SoundManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  _ensureContext() {
    if (this.muted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        try {
          this.ctx = new AudioCtx();
        } catch {
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

  _playTone(freq, duration, type = 'sine', volume = 0.08, delay = 0) {
    const ctx = this._ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playDeal() {
    this._playTone(520, 0.06, 'triangle', 0.05);
  }

  playChip() {
    this._playTone(1480, 0.055, 'sine', 0.06, 0);
    this._playTone(1960, 0.06, 'sine', 0.05, 0.045);
  }

  playCheck() {
    this._playTone(260, 0.07, 'triangle', 0.07, 0);
    this._playTone(220, 0.06, 'triangle', 0.05, 0.07);
  }

  playFold() {
    this._playTone(240, 0.12, 'sawtooth', 0.04, 0);
    this._playTone(165, 0.14, 'sawtooth', 0.03, 0.06);
  }

  playAllIn() {
    this._playTone(392, 0.12, 'triangle', 0.08, 0);
    this._playTone(523.25, 0.14, 'triangle', 0.08, 0.09);
    this._playTone(659.25, 0.22, 'triangle', 0.09, 0.18);
  }

  playWin() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, idx) => {
      this._playTone(n, 0.2, 'triangle', 0.08, idx * 0.08);
    });
  }
}
