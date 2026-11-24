// KOF Web Arcade - Procedural Web Audio Retro Arcade Synthesizer

export class ArcadeAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.bgmEnabled = true;
    this.bgmTimer = null;
    this.bgmStep = 0;
  }

  unlock() {
    if (typeof window === 'undefined') return;
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

  setMuted(muted) {
    this.muted = !!muted;
    if (this.muted) {
      this.stopBgm();
    } else if (this.bgmEnabled) {
      this.startBgm();
    }
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  _playTone(freq, endFreq, duration, type = 'square', gainVal = 0.12) {
    if (this.muted || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (endFreq !== freq) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
      }
      gain.gain.setValueAtTime(gainVal, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + duration);
    } catch (_) {
      // Ignore audio scheduling errors in restricted environments
    }
  }

  _playNoise(duration, gainVal = 0.14, highpass = 800) {
    if (this.muted || !this.ctx) return;
    try {
      const bufferSize = Math.floor(this.ctx.sampleRate * duration);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = highpass;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      noise.start();
    } catch (_) {}
  }

  playWhiff() {
    this._playNoise(0.06, 0.06, 1400);
  }

  playHit(heavy = false) {
    if (heavy) {
      this._playTone(170, 42, 0.16, 'sawtooth', 0.22);
      this._playNoise(0.14, 0.2, 420);
    } else {
      this._playTone(260, 85, 0.09, 'square', 0.14);
      this._playNoise(0.08, 0.12, 900);
    }
  }

  playBlock() {
    this._playTone(620, 320, 0.08, 'triangle', 0.16);
    this._playNoise(0.06, 0.1, 2200);
  }

  playGuardCrush() {
    this._playTone(440, 90, 0.32, 'sawtooth', 0.24);
    this._playNoise(0.28, 0.22, 600);
  }

  playSpecial() {
    this._playTone(240, 740, 0.18, 'sawtooth', 0.15);
    this._playNoise(0.16, 0.12, 1100);
  }

  playSuperFlash() {
    this._playTone(520, 1480, 0.28, 'sawtooth', 0.2);
    setTimeout(() => this._playTone(880, 1760, 0.24, 'square', 0.16), 80);
  }

  playKO() {
    this._playTone(220, 35, 0.55, 'sawtooth', 0.28);
    this._playNoise(0.45, 0.25, 250);
  }

  playRoundStart() {
    this._playTone(440, 440, 0.12, 'square', 0.14);
    setTimeout(() => this._playTone(660, 660, 0.16, 'square', 0.16), 140);
  }

  playSelect() {
    this._playTone(580, 860, 0.07, 'square', 0.11);
  }

  startBgm() {
    if (this.muted || !this.bgmEnabled || !this.ctx) return;
    if (this.bgmTimer) return;
    // Energetic KOF '97/'98-style driving rock-synth bassline & lead arpeggio
    const bassNotes = [110, 110, 130.8, 146.8, 110, 110, 164.8, 146.8];
    const leadNotes = [440, 0, 523.3, 587.3, 659.3, 587.3, 523.3, 392.0];
    this.bgmTimer = setInterval(() => {
      if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
      const idx = this.bgmStep % bassNotes.length;
      this._playTone(bassNotes[idx], bassNotes[idx] * 0.98, 0.14, 'sawtooth', 0.045);
      const lead = leadNotes[idx];
      if (lead > 0 && this.bgmStep % 2 === 0) {
        this._playTone(lead, lead, 0.11, 'square', 0.032);
      }
      this.bgmStep++;
    }, 175);
  }

  stopBgm() {
    if (this.bgmTimer) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }
}
