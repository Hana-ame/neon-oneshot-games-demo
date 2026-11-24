(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GTAAudio = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  class SoundSynth {
    constructor() {
      this.ctx = null;
      this.muted = false;
      this.engineOsc = null;
      this.engineGain = null;
    }

    unlock() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
        return;
      }
      const AudioCtx = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
      if (!AudioCtx) return;
      try {
        this.ctx = new AudioCtx();
        this._initEngineLoop();
      } catch (_) {
        this.ctx = null;
      }
    }

    _initEngineLoop() {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = 55;
      gain.gain.value = 0;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 260;

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      this.engineOsc = osc;
      this.engineGain = gain;
    }

    setMuted(flag) {
      this.muted = !!flag;
      if (this.engineGain && this.ctx) {
        this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      }
    }

    updateEngine(speed, active) {
      if (!this.ctx || !this.engineOsc || !this.engineGain) return;
      const now = this.ctx.currentTime;
      if (this.muted || !active) {
        this.engineGain.gain.setTargetAtTime(0, now, 0.08);
        return;
      }
      const pitch = 52 + Math.min(480, speed) * 0.24;
      const vol = 0.025 + Math.min(1, speed / 450) * 0.035;
      this.engineOsc.frequency.setTargetAtTime(pitch, now, 0.05);
      this.engineGain.gain.setTargetAtTime(vol, now, 0.06);
    }

    play(name, payload) {
      if (this.muted || !this.ctx) return;
      const now = this.ctx.currentTime;

      if (name === 'shoot') {
        const dur = payload === 'shotgun' ? 0.16 : payload === 'smg' ? 0.06 : 0.09;
        this._noiseBurst(now, dur, payload === 'shotgun' ? 0.22 : 0.12, payload === 'smg' ? 1400 : 800);
      } else if (name === 'explosion') {
        this._noiseBurst(now, 0.55, 0.3, 240);
        this._tone(now, 'sine', 95, 28, 0.5, 0.24);
      } else if (name === 'crash') {
        this._noiseBurst(now, 0.18, 0.16, 420);
      } else if (name === 'door' || name === 'click') {
        this._tone(now, 'triangle', 320, 140, 0.07, 0.09);
      } else if (name === 'pickup' || name === 'checkpoint') {
        this._tone(now, 'sine', 520, 880, 0.14, 0.11);
      } else if (name === 'missionStart') {
        this._tone(now, 'triangle', 330, 440, 0.14, 0.11);
        this._tone(now + 0.14, 'triangle', 440, 660, 0.2, 0.11);
      } else if (name === 'missionComplete') {
        this._tone(now, 'sine', 523, 523, 0.12, 0.12);
        this._tone(now + 0.12, 'sine', 659, 659, 0.12, 0.12);
        this._tone(now + 0.24, 'sine', 784, 1046, 0.26, 0.14);
      } else if (name === 'missionFail' || name === 'wasted' || name === 'busted') {
        this._tone(now, 'sawtooth', 240, 90, 0.45, 0.14);
      } else if (name === 'siren') {
        this._tone(now, 'sine', 640, 960, 0.22, 0.08);
        this._tone(now + 0.22, 'sine', 960, 640, 0.22, 0.08);
      } else if (name === 'melee') {
        this._noiseBurst(now, 0.08, 0.1, 600);
      } else if (name === 'radio') {
        this._tone(now, 'square', 420, 620, 0.08, 0.05);
      }
    }

    _tone(startTime, type, freqStart, freqEnd, duration, gainVal) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freqStart, startTime);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), startTime + duration);
      g.gain.setValueAtTime(gainVal, startTime);
      g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.connect(g);
      g.connect(this.ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration + 0.02);
    }

    _noiseBurst(startTime, duration, gainVal, cutoffHz) {
      const sampleRate = this.ctx.sampleRate;
      const frameCount = Math.floor(sampleRate * duration);
      const buffer = this.ctx.createBuffer(1, frameCount, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < frameCount; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (frameCount * 0.4));
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoffHz;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(gainVal, startTime);
      g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      src.connect(filter);
      filter.connect(g);
      g.connect(this.ctx.destination);
      src.start(startTime);
    }
  }

  return { SoundSynth };
});
