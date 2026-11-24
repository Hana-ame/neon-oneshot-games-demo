/**
 * Zero-asset Web Audio API engine for Web Taiko Master.
 * Synthesizes realistic Taiko drum SFX (Don, Ka, Big Don/Ka, Balloon pop, Combo chime)
 * and schedules beat-accurate procedural BGM using AudioContext.currentTime lookahead.
 */

export class TaikoAudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.bgmGain = null;
    this.sfxGain = null;
    this.noiseBuffer = null;

    this.muted = false;
    this.bgmVolume = 0.75;
    this.sfxVolume = 0.9;

    // Lookahead BGM scheduler state
    this.isPlaying = false;
    this.song = null;
    this.songStartAudioTime = 0;
    this.nextStepIndex = 0;
    this.schedulerTimer = null;
    this.pausedElapsedMs = 0;
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.bgmGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();

      this.bgmGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      this._createNoiseBuffer();
      this._applyVolumes();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  _createNoiseBuffer() {
    if (!this.ctx) return;
    const length = Math.floor(this.ctx.sampleRate * 0.25);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (length * 0.25));
    }
    this.noiseBuffer = buffer;
  }

  setVolumes({ bgmVolume, sfxVolume, muted }) {
    if (typeof bgmVolume === 'number') this.bgmVolume = Math.max(0, Math.min(1, bgmVolume));
    if (typeof sfxVolume === 'number') this.sfxVolume = Math.max(0, Math.min(1, sfxVolume));
    if (typeof muted === 'boolean') this.muted = muted;
    this._applyVolumes();
  }

  _applyVolumes() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 1, now, 0.01);
    this.bgmGain.gain.setTargetAtTime(this.bgmVolume * 0.42, now, 0.01);
    this.sfxGain.gain.setTargetAtTime(this.sfxVolume * 0.95, now, 0.01);
  }

  /**
   * Synthesize Taiko DON (center drumhead hit: deep resonant pitch-drop + skin transient).
   */
  playDon(big = false) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    // Low membrane body
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(big ? 165 : 190, t);
    osc.frequency.exponentialRampToValueAtTime(big ? 58 : 72, t + (big ? 0.22 : 0.16));

    gain.gain.setValueAtTime(big ? 1.15 : 0.9, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + (big ? 0.28 : 0.2));

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + (big ? 0.3 : 0.22));

    // Punchy attack harmonic
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(big ? 280 : 320, t);
    osc2.frequency.exponentialRampToValueAtTime(110, t + 0.06);
    gain2.gain.setValueAtTime(0.45, t);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.07);

    osc2.connect(gain2);
    gain2.connect(this.sfxGain);
    osc2.start(t);
    osc2.stop(t + 0.08);
  }

  /**
   * Synthesize Taiko KA (wooden rim hit: crisp bandpass click + high woody body).
   */
  playKa(big = false) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    // Crisp rim click via filtered noise
    if (this.noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(big ? 2100 : 2500, t);
      filter.Q.setValueAtTime(2.6, t);

      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(big ? 0.95 : 0.78, t);
      nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.075);

      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.sfxGain);
      noise.start(t);
      noise.stop(t + 0.085);
    }

    // Wooden rim resonance tone
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(big ? 860 : 1040, t);
    osc.frequency.exponentialRampToValueAtTime(big ? 520 : 640, t + 0.055);
    gain.gain.setValueAtTime(big ? 0.55 : 0.42, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  playBalloonPop() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(1400, t + 0.09);
    gain.gain.setValueAtTime(0.7, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  playComboChime() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    [880, 1174.66, 1318.51].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + idx * 0.045);
      gain.gain.setValueAtTime(0.28, t + idx * 0.045);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.045 + 0.22);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t + idx * 0.045);
      osc.stop(t + idx * 0.045 + 0.24);
    });
  }

  playMetronomeTick(accent = false) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(accent ? 1200 : 840, t);
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.05);
  }

  /**
   * Start beat-synchronized procedural BGM playback.
   */
  startSong(song, durationMs) {
    const ctx = this.ensureContext();
    if (!ctx) return 0;
    this.stopSong();

    this.song = song;
    this.songDurationMs = durationMs;
    this.isPlaying = true;
    this.pausedElapsedMs = 0;
    this.songStartAudioTime = ctx.currentTime + 0.05;
    this.nextStepIndex = 0;

    this._startScheduler();
    return this.songStartAudioTime;
  }

  pauseSong() {
    if (!this.isPlaying || !this.ctx) return;
    this.pausedElapsedMs = this.getSongTimeMs();
    this.isPlaying = false;
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  resumeSong() {
    if (this.isPlaying || !this.ctx || !this.song) return;
    this.songStartAudioTime = this.ctx.currentTime - this.pausedElapsedMs / 1000;
    this.isPlaying = true;
    const stepMs = (60000 / this.song.bpm) / (this.song.bgm?.stepDivision || 2);
    const offsetMs = this.song.offsetMs || 0;
    this.nextStepIndex = Math.max(0, Math.ceil((this.pausedElapsedMs - offsetMs) / stepMs));
    this._startScheduler();
  }

  stopSong() {
    this.isPlaying = false;
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  getSongTimeMs() {
    if (!this.ctx) return this.pausedElapsedMs;
    if (!this.isPlaying) return this.pausedElapsedMs;
    return (this.ctx.currentTime - this.songStartAudioTime) * 1000;
  }

  _startScheduler() {
    if (this.schedulerTimer) clearInterval(this.schedulerTimer);
    this.schedulerTimer = setInterval(() => this._scheduleAhead(), 25);
    this._scheduleAhead();
  }

  _scheduleAhead() {
    if (!this.isPlaying || !this.ctx || !this.song) return;
    const bgm = this.song.bgm;
    if (!bgm) return;

    const lookaheadSec = 0.14;
    const stepDurationSec = (60 / this.song.bpm) / (bgm.stepDivision || 2);
    const offsetSec = (this.song.offsetMs || 0) / 1000;
    const maxSec = (this.songDurationMs || 60000) / 1000;

    while (true) {
      const stepTimeSec = this.songStartAudioTime + offsetSec + this.nextStepIndex * stepDurationSec;
      const songPosSec = offsetSec + this.nextStepIndex * stepDurationSec;
      if (songPosSec > maxSec - 0.8) break;
      if (stepTimeSec > this.ctx.currentTime + lookaheadSec) break;

      if (stepTimeSec >= this.ctx.currentTime - 0.05) {
        this._scheduleBgmStep(this.nextStepIndex, stepTimeSec, stepDurationSec, bgm);
      }
      this.nextStepIndex++;
    }
  }

  _scheduleBgmStep(stepIdx, time, stepDur, bgm) {
    const leadFreq = bgm.lead[stepIdx % bgm.lead.length];
    const bassFreq = bgm.bass[stepIdx % bgm.bass.length];

    // Shamisen / festival synth lead
    if (leadFreq > 0) {
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      osc.type = bgm.wave || 'triangle';
      osc.frequency.setValueAtTime(leadFreq, time);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2800, time);
      filter.frequency.exponentialRampToValueAtTime(900, time + stepDur * 0.85);

      gain.gain.setValueAtTime(0.001, time);
      gain.gain.linearRampToValueAtTime(0.32, time + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, time + stepDur * 0.92);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.bgmGain);
      osc.start(time);
      osc.stop(time + stepDur);
    }

    // Bass groove
    if (bassFreq > 0) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(bassFreq, time);
      gain.gain.setValueAtTime(0.4, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + stepDur * 0.9);
      osc.connect(gain);
      gain.connect(this.bgmGain);
      osc.start(time);
      osc.stop(time + stepDur);
    }

    // Subtle backing hi-hat / festival clap on off-beats
    if (stepIdx % 2 === 1 && this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(5200, time);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.09, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
      noise.connect(hp);
      hp.connect(gain);
      gain.connect(this.bgmGain);
      noise.start(time);
      noise.stop(time + 0.05);
    }
  }
}
