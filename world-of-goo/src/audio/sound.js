(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GooSound = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  class SoundEngine {
    constructor() {
      this.ctx = null;
      this.muted = false;
    }

    unlock() {
      if (this.ctx || typeof window === 'undefined') return;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      try {
        this.ctx = new AudioCtx();
      } catch (e) {
        this.ctx = null;
      }
    }

    toggleMute() {
      this.muted = !this.muted;
      return this.muted;
    }

    _tone(freqStart, freqEnd, duration, type = 'sine', gainPeak = 0.12) {
      if (this.muted) return;
      this.unlock();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freqStart, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(gainPeak, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    }

    playPickup() {
      this._tone(240, 420, 0.09, 'sine', 0.11);
    }

    playAttach() {
      this._tone(180, 340, 0.11, 'triangle', 0.14);
      setTimeout(() => this._tone(360, 520, 0.08, 'sine', 0.08), 30);
    }

    playBreak() {
      this._tone(280, 85, 0.18, 'sawtooth', 0.1);
    }

    playSuction() {
      this._tone(320, 680, 0.16, 'sine', 0.09);
    }

    playCollect() {
      this._tone(523.25, 783.99, 0.16, 'triangle', 0.13);
    }

    playUndo() {
      this._tone(440, 260, 0.12, 'sine', 0.1);
    }

    playWin() {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, i) => {
        setTimeout(() => this._tone(f, f * 1.01, 0.28, 'triangle', 0.14), i * 95);
      });
    }
  }

  return { SoundEngine };
});
