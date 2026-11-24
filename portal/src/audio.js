/**
 * 纯 Web Audio API 程序化音效合成器（零外部音频资源依赖）
 */

export class SoundSynthesizer {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  ensureContext() {
    if (this.muted) return null;
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  playTone({ type = 'sine', startFreq = 440, endFreq = 220, duration = 0.14, gain = 0.12 }) {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);

    amp.gain.setValueAtTime(gain, now);
    amp.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  playPortalFire(color) {
    if (color === 'blue') {
      this.playTone({ type: 'triangle', startFreq: 760, endFreq: 260, duration: 0.16, gain: 0.14 });
    } else {
      this.playTone({ type: 'sawtooth', startFreq: 620, endFreq: 210, duration: 0.16, gain: 0.11 });
    }
  }

  playPortalFail() {
    this.playTone({ type: 'square', startFreq: 180, endFreq: 110, duration: 0.10, gain: 0.08 });
  }

  playTeleport() {
    this.playTone({ type: 'sine', startFreq: 240, endFreq: 880, duration: 0.18, gain: 0.14 });
  }

  playJump() {
    this.playTone({ type: 'sine', startFreq: 190, endFreq: 340, duration: 0.09, gain: 0.09 });
  }

  playButton(pressed) {
    this.playTone({
      type: 'triangle',
      startFreq: pressed ? 330 : 440,
      endFreq: pressed ? 520 : 280,
      duration: 0.12,
      gain: 0.12
    });
  }

  playFizzler() {
    this.playTone({ type: 'sawtooth', startFreq: 900, endFreq: 160, duration: 0.22, gain: 0.10 });
  }

  playHazard() {
    this.playTone({ type: 'sawtooth', startFreq: 240, endFreq: 70, duration: 0.28, gain: 0.13 });
  }

  playPickup(picked) {
    this.playTone({
      type: 'sine',
      startFreq: picked ? 380 : 460,
      endFreq: picked ? 580 : 300,
      duration: 0.09,
      gain: 0.10
    });
  }

  playLevelClear() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    const ctx = this.ensureContext();
    if (!ctx) return;
    notes.forEach((freq, i) => {
      const now = ctx.currentTime + i * 0.085;
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      amp.gain.setValueAtTime(0.12, now);
      amp.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(amp);
      amp.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.22);
    });
  }
}
