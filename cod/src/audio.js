/**
 * Web COD — Operation Ironline
 * Procedural Web Audio API sound synthesizer (zero external audio files).
 */
(function (root) {
  'use strict';

  class SoundEngine {
    constructor() {
      this.ctx = null;
      this.muted = false;
      this.noiseBuffer = null;
    }

    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
        return;
      }
      const AudioCtx =
        typeof window !== 'undefined' &&
        (window.AudioContext || window.webkitAudioContext);
      if (!AudioCtx) return;

      this.ctx = new AudioCtx();
      // Pre-generate 1 second of white noise for gunshots & explosions
      const sampleRate = this.ctx.sampleRate;
      const buffer = this.ctx.createBuffer(1, sampleRate, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < sampleRate; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buffer;
    }

    toggleMute() {
      this.muted = !this.muted;
      return this.muted;
    }

    playGunshot(weaponId) {
      if (this.muted || !this.ctx || !this.noiseBuffer) return;
      const now = this.ctx.currentTime;

      const profiles = {
        m4a1: { dur: 0.13, freq: 1400, punch: 150, gain: 0.28 },
        mp5: { dur: 0.085, freq: 2100, punch: 210, gain: 0.22 },
        m870: { dur: 0.26, freq: 850, punch: 95, gain: 0.38 },
        awp: { dur: 0.34, freq: 1100, punch: 75, gain: 0.42 }
      };
      const p = profiles[weaponId] || profiles.m4a1;

      // Noise crack
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(p.freq, now);
      filter.frequency.exponentialRampToValueAtTime(220, now + p.dur);

      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(p.gain, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + p.dur);

      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.ctx.destination);
      noise.start(now);
      noise.stop(now + p.dur);

      // Low-end mechanical thump
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(p.punch, now);
      osc.frequency.exponentialRampToValueAtTime(36, now + p.dur * 0.7);
      const oGain = this.ctx.createGain();
      oGain.gain.setValueAtTime(p.gain * 0.8, now);
      oGain.gain.exponentialRampToValueAtTime(0.001, now + p.dur * 0.7);
      osc.connect(oGain);
      oGain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + p.dur * 0.75);
    }

    playHitmarker(type = 'normal') {
      if (this.muted || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type === 'kill' ? 'sine' : 'triangle';
      const baseFreq = type === 'headshot' ? 1850 : type === 'kill' ? 1320 : 1150;
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.35, now + 0.055);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.08);
    }

    playReload() {
      if (this.muted || !this.ctx) return;
      const now = this.ctx.currentTime;
      [0, 0.14].forEach((offset, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(idx === 0 ? 420 : 680, now + offset);
        gain.gain.setValueAtTime(0.08, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.055);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.06);
      });
    }

    playPlayerHit() {
      if (this.muted || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.exponentialRampToValueAtTime(42, now + 0.16);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.19);
    }

    playUavPing() {
      if (this.muted || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(1320, now + 0.1);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.36);
    }

    playAirstrike() {
      if (this.muted || !this.ctx || !this.noiseBuffer) return;
      const now = this.ctx.currentTime;
      // Explosion rumble
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(420, now);
      filter.frequency.exponentialRampToValueAtTime(60, now + 0.85);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.45, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      noise.start(now);
      noise.stop(now + 0.92);
    }

    playPickup() {
      if (this.muted || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.setValueAtTime(780, now + 0.08);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.23);
    }

    handleEvents(events) {
      for (const ev of events) {
        switch (ev.type) {
          case 'weapon_fire':
            this.playGunshot(ev.payload.weaponId);
            break;
          case 'hitmarker':
            this.playHitmarker(ev.payload.type);
            break;
          case 'reload_start':
            this.playReload();
            break;
          case 'player_hit':
            this.playPlayerHit();
            break;
          case 'uav_activated':
            this.playUavPing();
            break;
          case 'airstrike':
            this.playAirstrike();
            break;
          case 'pickup':
            this.playPickup();
            break;
          default:
            break;
        }
      }
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SoundEngine };
  } else {
    root.WebCOD = root.WebCOD || {};
    root.WebCOD.SoundEngine = SoundEngine;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
