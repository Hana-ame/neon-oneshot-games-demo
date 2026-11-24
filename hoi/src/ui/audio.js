/**
 * Web Audio API 军事风格合成音效引擎（零外部音频文件依赖）
 */

export class SoundEffects {
  constructor() {
    this.muted = false;
    this.ctx = null;
  }

  ensureContext() {
    if (this.muted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  playTone(freq, duration = 0.08, type = 'triangle', gainVal = 0.08) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(gainVal, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  click() {
    this.playTone(520, 0.05, 'triangle', 0.05);
  }

  march() {
    this.playTone(220, 0.09, 'sawtooth', 0.06);
    setTimeout(() => this.playTone(280, 0.09, 'sawtooth', 0.05), 70);
  }

  warHorn() {
    this.playTone(146, 0.35, 'sawtooth', 0.09);
    setTimeout(() => this.playTone(110, 0.45, 'sawtooth', 0.09), 180);
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }
}
