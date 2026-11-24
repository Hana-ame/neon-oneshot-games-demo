/**
 * Zero-dependency Web Audio API procedural sound synthesizer.
 */

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  unlock() {
    if (this.muted) return;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  playTone(freqStart, freqEnd, duration, type = 'triangle', gainPeak = 0.12) {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration);

    gain.gain.setValueAtTime(gainPeak, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  playBreak() {
    this.playTone(190, 68, 0.11, 'square', 0.11);
    this.playTone(120, 48, 0.09, 'sawtooth', 0.08);
  }

  playPlace() {
    this.playTone(150, 260, 0.08, 'triangle', 0.14);
  }

  playStep() {
    const jitter = 0.9 + Math.random() * 0.2;
    this.playTone(95 * jitter, 52, 0.055, 'sine', 0.055);
  }

  playJump() {
    this.playTone(180, 320, 0.09, 'sine', 0.07);
  }

  playClick() {
    this.playTone(520, 420, 0.04, 'triangle', 0.06);
  }
}
