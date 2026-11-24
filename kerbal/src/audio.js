(function (root) {
  'use strict';

  class SoundEngine {
    constructor() {
      this.ctx = null;
      this.muted = false;
      this.engineGain = null;
      this.engineFilter = null;
      this.initialized = false;
    }

    init() {
      if (this.initialized) {
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
        return;
      }
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        this.ctx = new AudioCtx();

        // Continuous white noise buffer for rocket engine roar
        const bufferSize = this.ctx.sampleRate * 2;
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        noise.loop = true;

        this.engineFilter = this.ctx.createBiquadFilter();
        this.engineFilter.type = 'lowpass';
        this.engineFilter.frequency.value = 180;
        this.engineFilter.Q.value = 1.2;

        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.value = 0;

        noise.connect(this.engineFilter);
        this.engineFilter.connect(this.engineGain);
        this.engineGain.connect(this.ctx.destination);
        noise.start();

        this.initialized = true;
      } catch (e) {
        // Audio not supported or blocked
      }
    }

    setMuted(muted) {
      this.muted = !!muted;
      if (this.muted && this.engineGain && this.ctx) {
        this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      }
    }

    updateEngine(thrustRatio, atmPressure) {
      if (!this.initialized || !this.engineGain || !this.ctx) return;
      if (this.muted || thrustRatio <= 0.01) {
        this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.06);
        return;
      }
      // Subtle vacuum dampening while keeping cockpit vibration audible
      const atmFactor = 0.35 + 0.65 * Math.max(0, Math.min(1, atmPressure));
      const targetGain = Math.min(0.28, thrustRatio * 0.24 * atmFactor);
      const targetFreq = 120 + thrustRatio * 420 * atmFactor;
      this.engineGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.06);
      this.engineFilter.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.08);
    }

    playStage() {
      if (this.muted) return;
      this.init();
      if (!this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(42, now + 0.18);
        gain.gain.setValueAtTime(0.32, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.24);
      } catch (e) {}
    }

    playParachute() {
      if (this.muted) return;
      this.init();
      if (!this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(280, now);
        osc.frequency.exponentialRampToValueAtTime(120, now + 0.3);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.34);
      } catch (e) {}
    }

    playExplosion() {
      if (this.muted) return;
      this.init();
      if (!this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(95, now);
        osc.frequency.exponentialRampToValueAtTime(20, now + 0.7);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.8);
      } catch (e) {}
    }

    playMilestone() {
      if (this.muted) return;
      this.init();
      if (!this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        [523.25, 659.25, 783.99].forEach((freq, idx) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.08);
          gain.gain.setValueAtTime(0.12, now + idx * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.25);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now + idx * 0.08);
          osc.stop(now + idx * 0.08 + 0.26);
        });
      } catch (e) {}
    }
  }

  const KSPAudio = { SoundEngine };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = KSPAudio;
  } else {
    root.KSP = root.KSP || {};
    root.KSP.Audio = KSPAudio;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
