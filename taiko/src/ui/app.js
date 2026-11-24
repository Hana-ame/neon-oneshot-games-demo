import { DEFAULT_SETTINGS, DIFFICULTIES, INPUT_TYPES, isBigNote } from '../engine/constants.js';
import { parseRawTJAText } from '../engine/chart.js';
import { TaikoGameEngine } from '../engine/judge.js';
import { TaikoAudioEngine } from '../engine/audio.js';
import { TaikoCanvasRenderer } from '../engine/renderer.js';
import { SONG_CATALOG, compileSongChart } from '../data/songs.js';

const STORAGE_SETTINGS_KEY = 'web_taiko_settings_v1';
const STORAGE_SCORES_KEY = 'web_taiko_scores_v1';

const SAMPLE_CUSTOM_TJA = `TITLE: 祭典入门练习曲
BPM: 128
OFFSET: 1400
BALLOON: 6

// 0=空 1=咚 2=咔 3=大咚 4=大咔 5..8=连打 7..8=气球
10102010,
10201000,
11201120,
30004000,
#GOGOSTART
12102120,
50000008,
70000008,
30102010,
#GOGOEND`;

export class TaikoApp {
  constructor() {
    this.audio = new TaikoAudioEngine();
    this.settings = this._loadSettings();
    this.highScores = this._loadScores();

    this.selectedSongId = SONG_CATALOG[0].id;
    this.selectedDifficulty = 'normal';
    this.activeView = 'select'; // 'select' | 'play' | 'result' | 'editor'
    this.customChart = null;

    // Active play session state
    this.engine = null;
    this.renderer = null;
    this.currentChartData = null;
    this.rafId = null;
    this.lastFrameTs = 0;
    this.isPaused = false;
    this.lastAutoRollMs = 0;
    this.lastMilestoneCombo = 0;

    // Key remapping & calibration state
    this.listeningForKey = null;
    this.calibrationTimer = null;
    this.calibrationBeatMs = 500; // 120 BPM
    this.calibrationStartTs = 0;
    this.calibrationSamples = [];

    this._bindDOM();
    this._applySettingsToAudio();
    this._renderSongList();
    this._renderEditorPreview();
    this._bindEvents();
  }

  _loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          keyBindings: { ...DEFAULT_SETTINGS.keyBindings, ...(parsed.keyBindings || {}) },
        };
      }
    } catch (_) {}
    return {
      ...DEFAULT_SETTINGS,
      keyBindings: { ...DEFAULT_SETTINGS.keyBindings },
    };
  }

  _saveSettings() {
    try {
      localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(this.settings));
    } catch (_) {}
  }

  _loadScores() {
    try {
      const raw = localStorage.getItem(STORAGE_SCORES_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return {};
  }

  _saveScore(key, summary) {
    const prev = this.highScores[key];
    if (!prev || summary.score > prev.score) {
      this.highScores[key] = {
        score: summary.score,
        rank: summary.rank,
        accuracy: summary.accuracy,
        cleared: summary.cleared,
        fullCombo: summary.fullCombo,
      };
      try {
        localStorage.setItem(STORAGE_SCORES_KEY, JSON.stringify(this.highScores));
      } catch (_) {}
    }
  }

  _bindDOM() {
    this.dom = {
      views: {
        select: document.getElementById('view-select'),
        play: document.getElementById('view-play'),
        result: document.getElementById('view-result'),
        editor: document.getElementById('view-editor'),
      },
      navTabs: document.querySelectorAll('[data-nav]'),
      songList: document.getElementById('song-list'),
      diffBtns: document.querySelectorAll('[data-diff]'),
      selectedTitle: document.getElementById('selected-song-title'),
      selectedMeta: document.getElementById('selected-song-meta'),
      startBtn: document.getElementById('btn-start-game'),
      autoToggleBtn: document.getElementById('btn-toggle-auto'),
      muteBtn: document.getElementById('btn-mute'),
      settingsBtn: document.getElementById('btn-open-settings'),

      // Play HUD
      canvas: document.getElementById('taiko-canvas'),
      hudSongTitle: document.getElementById('hud-song-title'),
      hudScore: document.getElementById('hud-score'),
      hudCombo: document.getElementById('hud-combo'),
      hudAccuracy: document.getElementById('hud-accuracy'),
      hudProgressFill: document.getElementById('hud-progress-fill'),
      hudAutoBadge: document.getElementById('hud-auto-badge'),
      pauseBtn: document.getElementById('btn-pause'),
      restartBtn: document.getElementById('btn-restart'),
      exitPlayBtn: document.getElementById('btn-exit-play'),
      pauseOverlay: document.getElementById('pause-overlay'),
      resumeBtn: document.getElementById('btn-resume'),
      drumPads: document.querySelectorAll('[data-pad]'),

      // Result view
      resTitle: document.getElementById('res-song-title'),
      resRank: document.getElementById('res-rank'),
      resStamp: document.getElementById('res-stamp'),
      resScore: document.getElementById('res-score'),
      resAccuracy: document.getElementById('res-accuracy'),
      resMaxCombo: document.getElementById('res-max-combo'),
      resSoul: document.getElementById('res-soul'),
      resGreat: document.getElementById('res-great'),
      resGood: document.getElementById('res-good'),
      resMiss: document.getElementById('res-miss'),
      resMeanOffset: document.getElementById('res-mean-offset'),
      resHistogram: document.getElementById('res-histogram'),
      resRetryBtn: document.getElementById('btn-res-retry'),
      resBackBtn: document.getElementById('btn-res-back'),

      // Settings modal
      settingsModal: document.getElementById('settings-modal'),
      closeSettingsBtn: document.getElementById('btn-close-settings'),
      offsetSlider: document.getElementById('setting-offset'),
      offsetValue: document.getElementById('setting-offset-val'),
      speedSlider: document.getElementById('setting-speed'),
      speedValue: document.getElementById('setting-speed-val'),
      bgmSlider: document.getElementById('setting-bgm'),
      bgmValue: document.getElementById('setting-bgm-val'),
      sfxSlider: document.getElementById('setting-sfx'),
      sfxValue: document.getElementById('setting-sfx-val'),
      keyBindBtns: document.querySelectorAll('[data-keybind]'),
      resetSettingsBtn: document.getElementById('btn-reset-settings'),
      calibrateBtn: document.getElementById('btn-calibrate'),
      calibrateStatus: document.getElementById('calibrate-status'),

      // Editor view
      editorTextarea: document.getElementById('tja-editor-input'),
      editorStats: document.getElementById('tja-editor-stats'),
      editorError: document.getElementById('tja-editor-error'),
      editorPlayBtn: document.getElementById('btn-editor-play'),
      editorSampleBtn: document.getElementById('btn-editor-sample'),

      toast: document.getElementById('toast'),
    };

    if (this.dom.editorTextarea) {
      this.dom.editorTextarea.value = SAMPLE_CUSTOM_TJA;
    }
  }

  _bindEvents() {
    // Top navigation
    this.dom.navTabs.forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-nav');
        if (this.activeView === 'play') this._stopSession();
        this._switchView(target);
      });
    });

    // Difficulty selector
    this.dom.diffBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedDifficulty = btn.getAttribute('data-diff');
        this._updateDiffButtons();
        this._renderSongList();
      });
    });

    this.dom.startBtn.addEventListener('click', () => this.startSelectedSong());

    this.dom.autoToggleBtn.addEventListener('click', () => {
      this.settings.autoPlay = !this.settings.autoPlay;
      this._saveSettings();
      this._syncToolbarUI();
      this._showToast(this.settings.autoPlay ? '已开启自动演奏模式 (Auto-Play)' : '已关闭自动演奏模式');
    });

    this.dom.muteBtn.addEventListener('click', () => {
      this.settings.muted = !this.settings.muted;
      this._applySettingsToAudio();
      this._saveSettings();
      this._syncToolbarUI();
    });

    this.dom.settingsBtn.addEventListener('click', () => this._openSettings());
    this.dom.closeSettingsBtn.addEventListener('click', () => this._closeSettings());
    this.dom.settingsModal.addEventListener('click', (e) => {
      if (e.target === this.dom.settingsModal) this._closeSettings();
    });

    // Settings sliders
    this.dom.offsetSlider.addEventListener('input', (e) => {
      this.settings.audioOffsetMs = Number(e.target.value);
      this.dom.offsetValue.textContent = `${this.settings.audioOffsetMs >= 0 ? '+' : ''}${this.settings.audioOffsetMs} ms`;
      this._saveSettings();
    });
    this.dom.speedSlider.addEventListener('input', (e) => {
      this.settings.scrollSpeed = Number(e.target.value);
      this.dom.speedValue.textContent = `${this.settings.scrollSpeed.toFixed(1)}x`;
      this._saveSettings();
    });
    this.dom.bgmSlider.addEventListener('input', (e) => {
      this.settings.bgmVolume = Number(e.target.value) / 100;
      this.dom.bgmValue.textContent = `${e.target.value}%`;
      this._applySettingsToAudio();
      this._saveSettings();
    });
    this.dom.sfxSlider.addEventListener('input', (e) => {
      this.settings.sfxVolume = Number(e.target.value) / 100;
      this.dom.sfxValue.textContent = `${e.target.value}%`;
      this._applySettingsToAudio();
      this._saveSettings();
    });

    // Keybinding buttons
    this.dom.keyBindBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.listeningForKey = btn.getAttribute('data-keybind');
        this._syncSettingsUI();
      });
    });

    this.dom.resetSettingsBtn.addEventListener('click', () => {
      this.settings = {
        ...DEFAULT_SETTINGS,
        keyBindings: { ...DEFAULT_SETTINGS.keyBindings },
      };
      this._applySettingsToAudio();
      this._saveSettings();
      this._syncSettingsUI();
      this._syncToolbarUI();
      this._showToast('已恢复默认按键与音频设置');
    });

    this.dom.calibrateBtn.addEventListener('click', () => this._toggleCalibration());

    // Play HUD controls
    this.dom.pauseBtn.addEventListener('click', () => this.togglePause());
    this.dom.resumeBtn.addEventListener('click', () => this.togglePause());
    this.dom.restartBtn.addEventListener('click', () => this._restartCurrentSession());
    this.dom.exitPlayBtn.addEventListener('click', () => {
      this._stopSession();
      this._switchView('select');
    });

    // Result buttons
    this.dom.resRetryBtn.addEventListener('click', () => this._restartCurrentSession());
    this.dom.resBackBtn.addEventListener('click', () => {
      this._renderSongList();
      this._switchView('select');
    });

    // On-screen touch/mouse drum pads
    this.dom.drumPads.forEach((pad) => {
      const zone = pad.getAttribute('data-pad');
      const handleHit = (e) => {
        e.preventDefault();
        const inputType = zone === 'leftDon' || zone === 'rightDon' ? INPUT_TYPES.DON : INPUT_TYPES.KA;
        this._handlePlayerInput(inputType, zone);
        pad.classList.add('active');
        setTimeout(() => pad.classList.remove('active'), 95);
      };
      pad.addEventListener('pointerdown', handleHit);
    });

    // Global keyboard handler
    window.addEventListener('keydown', (e) => this._onKeyDown(e));
    window.addEventListener('resize', () => {
      if (this.renderer) this.renderer.resize();
    });

    // Editor events
    this.dom.editorTextarea.addEventListener('input', () => this._renderEditorPreview());
    this.dom.editorSampleBtn.addEventListener('click', () => {
      this.dom.editorTextarea.value = SAMPLE_CUSTOM_TJA;
      this._renderEditorPreview();
    });
    this.dom.editorPlayBtn.addEventListener('click', () => this._playCustomChart());

    this._updateDiffButtons();
    this._syncToolbarUI();
  }

  _onKeyDown(e) {
    if (e.repeat) return;

    // 1. Keybinding capture inside Settings modal
    if (this.listeningForKey) {
      e.preventDefault();
      this.settings.keyBindings[this.listeningForKey] = e.code;
      this.listeningForKey = null;
      this._saveSettings();
      this._syncSettingsUI();
      this._syncDrumPadLabels();
      return;
    }

    // 2. Audio offset tap calibration
    if (this.calibrationTimer && (e.code === 'Space' || e.code === 'KeyF' || e.code === 'KeyJ')) {
      e.preventDefault();
      this._recordCalibrationTap();
      return;
    }

    if (this.activeView !== 'play') return;

    if (e.code === 'Escape') {
      e.preventDefault();
      this.togglePause();
      return;
    }

    if (this.isPaused) return;

    const kb = this.settings.keyBindings;
    if (e.code === kb.leftKa) {
      e.preventDefault();
      this._handlePlayerInput(INPUT_TYPES.KA, 'leftKa');
    } else if (e.code === kb.leftDon) {
      e.preventDefault();
      this._handlePlayerInput(INPUT_TYPES.DON, 'leftDon');
    } else if (e.code === kb.rightDon) {
      e.preventDefault();
      this._handlePlayerInput(INPUT_TYPES.DON, 'rightDon');
    } else if (e.code === kb.rightKa) {
      e.preventDefault();
      this._handlePlayerInput(INPUT_TYPES.KA, 'rightKa');
    }
  }

  _handlePlayerInput(inputType, zone) {
    if (this.activeView !== 'play' || this.isPaused || !this.engine) return;
    if (this.settings.autoPlay) return;

    if (inputType === INPUT_TYPES.DON) {
      this.audio.playDon(false);
    } else {
      this.audio.playKa(false);
    }

    if (this.renderer) {
      this.renderer.triggerDrumFlash(zone);
    }

    const songTimeMs = this.audio.getSongTimeMs() - this.settings.audioOffsetMs;
    const ev = this.engine.processInput(inputType, songTimeMs);
    this._onEngineEvent(ev);
  }

  _onEngineEvent(ev) {
    if (!ev || !ev.matched) return;
    if (this.renderer) {
      this.renderer.triggerHitEffect(ev);
    }
    if (ev.kind === 'balloon_pop') {
      this.audio.playBalloonPop();
    }
    if (ev.kind === 'judgement' && ev.combo > 0 && ev.combo % 50 === 0 && ev.combo !== this.lastMilestoneCombo) {
      this.lastMilestoneCombo = ev.combo;
      this.audio.playComboChime();
    }
  }

  _switchView(viewName) {
    this.activeView = viewName;
    Object.entries(this.dom.views).forEach(([key, el]) => {
      if (el) el.classList.toggle('hidden', key !== viewName);
    });
    this.dom.navTabs.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-nav') === viewName);
    });
  }

  _updateDiffButtons() {
    this.dom.diffBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-diff') === this.selectedDifficulty);
    });
  }

  _syncToolbarUI() {
    this.dom.autoToggleBtn.classList.toggle('active', this.settings.autoPlay);
    this.dom.autoToggleBtn.textContent = this.settings.autoPlay ? '自动演奏: 开' : '自动演奏: 关';
    this.dom.muteBtn.textContent = this.settings.muted ? '🔇 静音' : '🔊 音效';
    this._syncDrumPadLabels();
  }

  _syncDrumPadLabels() {
    const kb = this.settings.keyBindings;
    const formatKey = (code) => code.replace(/^Key/, '').replace(/^Digit/, '');
    const map = {
      leftKa: `${formatKey(kb.leftKa)} · 咔`,
      leftDon: `${formatKey(kb.leftDon)} · 咚`,
      rightDon: `${formatKey(kb.rightDon)} · 咚`,
      rightKa: `${formatKey(kb.rightKa)} · 咔`,
    };
    this.dom.drumPads.forEach((pad) => {
      const z = pad.getAttribute('data-pad');
      const span = pad.querySelector('.pad-key');
      if (span && map[z]) span.textContent = map[z];
    });
  }

  _applySettingsToAudio() {
    this.audio.setVolumes({
      bgmVolume: this.settings.bgmVolume,
      sfxVolume: this.settings.sfxVolume,
      muted: this.settings.muted,
    });
  }

  _renderSongList() {
    const diffInfo = DIFFICULTIES[this.selectedDifficulty.toUpperCase()] || DIFFICULTIES.NORMAL;
    this.dom.songList.innerHTML = '';

    SONG_CATALOG.forEach((song) => {
      const compiled = compileSongChart(song.id, this.selectedDifficulty);
      const scoreKey = `${song.id}_${this.selectedDifficulty}`;
      const best = this.highScores[scoreKey];

      const card = document.createElement('button');
      card.type = 'button';
      card.className = `song-card ${song.id === this.selectedSongId ? 'selected' : ''}`;
      card.style.setProperty('--song-accent', song.accent);

      const starsStr = '★'.repeat(compiled.stars) + '☆'.repeat(Math.max(0, 10 - compiled.stars));
      const bestHtml = best
        ? `<span class="best-badge rank-${best.rank}">${best.rank} · ${best.score.toLocaleString()}</span>`
        : '<span class="best-badge empty">未挑战</span>';

      card.innerHTML = `
        <div class="song-card-top">
          <div>
            <div class="song-title">${song.title}</div>
            <div class="song-sub">${song.subtitle}</div>
          </div>
          ${bestHtml}
        </div>
        <div class="song-card-meta">
          <span class="tag">${song.genre}</span>
          <span class="tag">BPM ${song.bpm}</span>
          <span class="tag">${compiled.stats.standardCount} 音符</span>
        </div>
        <div class="song-stars" style="color:${diffInfo.color}">${diffInfo.label} ${starsStr}</div>
      `;

      card.addEventListener('click', () => {
        this.selectedSongId = song.id;
        this._renderSongList();
      });

      this.dom.songList.appendChild(card);
    });

    const active = compileSongChart(this.selectedSongId, this.selectedDifficulty);
    this.dom.selectedTitle.textContent = `${active.song.title} (${diffInfo.label} ★${active.stars})`;
    this.dom.selectedMeta.textContent = `BPM ${active.song.bpm} · 音符 ${active.stats.standardCount} · 连打 ${active.stats.drumrollCount} · 气球 ${active.stats.balloonCount} · 过关线 ${diffInfo.clearThreshold}%`;
  }

  startSelectedSong() {
    const compiled = compileSongChart(this.selectedSongId, this.selectedDifficulty);
    this._startSession(compiled, `${compiled.song.id}_${this.selectedDifficulty}`);
  }

  _playCustomChart() {
    try {
      const parsed = parseRawTJAText(this.dom.editorTextarea.value);
      const customSong = {
        id: 'custom-chart',
        title: parsed.title,
        subtitle: 'Custom TJA-Lite Chart',
        genre: '自定义谱面',
        bpm: parsed.bpm,
        offsetMs: parsed.offsetMs,
        accent: '#a855f7',
        bgm: SONG_CATALOG[0].bgm,
      };
      this._startSession(
        {
          song: customSong,
          difficulty: 'normal',
          stars: 5,
          ...parsed,
        },
        null
      );
    } catch (err) {
      this._showToast(err.message);
    }
  }

  _startSession(chartData, scoreKey) {
    this._stopSession();
    this.currentChartData = { ...chartData, scoreKey };
    this.engine = new TaikoGameEngine({
      notes: chartData.notes,
      difficulty: chartData.difficulty,
      gogoRanges: chartData.gogoRanges,
    });
    this.isPaused = false;
    this.lastAutoRollMs = 0;
    this.lastMilestoneCombo = 0;

    this._switchView('play');
    this.dom.pauseOverlay.classList.add('hidden');
    this.dom.hudSongTitle.textContent = `${chartData.song.title} · ${(DIFFICULTIES[chartData.difficulty.toUpperCase()] || DIFFICULTIES.NORMAL).label}`;
    this.dom.hudAutoBadge.classList.toggle('hidden', !this.settings.autoPlay);

    if (!this.renderer) {
      this.renderer = new TaikoCanvasRenderer(this.dom.canvas);
    } else {
      this.renderer.resize();
    }

    this.audio.startSong(chartData.song, chartData.durationMs);
    this.lastFrameTs = performance.now();
    this.rafId = requestAnimationFrame((ts) => this._gameLoop(ts));
  }

  _restartCurrentSession() {
    if (!this.currentChartData) return;
    this._startSession(this.currentChartData, this.currentChartData.scoreKey);
  }

  _stopSession() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.audio.stopSong();
    this.isPaused = false;
  }

  togglePause() {
    if (this.activeView !== 'play' || !this.engine) return;
    this.isPaused = !this.isPaused;
    this.dom.pauseOverlay.classList.toggle('hidden', !this.isPaused);
    if (this.isPaused) {
      this.audio.pauseSong();
    } else {
      this.audio.resumeSong();
      this.lastFrameTs = performance.now();
    }
  }

  _gameLoop(ts) {
    const dtSec = Math.min(0.05, Math.max(0.001, (ts - this.lastFrameTs) / 1000));
    this.lastFrameTs = ts;

    if (this.activeView !== 'play' || !this.engine || !this.currentChartData) return;

    const rawTimeMs = this.audio.getSongTimeMs();
    const songTimeMs = rawTimeMs - this.settings.audioOffsetMs;

    if (!this.isPaused) {
      // Auto-Play mode
      if (this.settings.autoPlay) {
        const autoInputs = this.engine.getAutoPlayInputs(songTimeMs, this.lastAutoRollMs);
        for (const act of autoInputs) {
          if (act.isRoll) this.lastAutoRollMs = songTimeMs;
          const big = isBigNote(act.note.type);
          if (act.inputType === INPUT_TYPES.DON) {
            this.audio.playDon(big);
            this.renderer.triggerDrumFlash(Math.random() < 0.5 ? 'leftDon' : 'rightDon');
          } else {
            this.audio.playKa(big);
            this.renderer.triggerDrumFlash(Math.random() < 0.5 ? 'leftKa' : 'rightKa');
          }
          const ev = this.engine.processInput(act.inputType, act.timeMs);
          this._onEngineEvent(ev);
        }
      }

      // Sweep missed notes
      const missed = this.engine.update(songTimeMs);
      for (const m of missed) {
        this.renderer.triggerHitEffect(m);
      }

      // Update HUD
      this.dom.hudScore.textContent = this.engine.score.toLocaleString();
      this.dom.hudCombo.textContent = String(this.engine.combo);
      this.dom.hudAccuracy.textContent = `${this.engine.getAccuracy().toFixed(1)}%`;
      const pct = Math.min(100, Math.max(0, (rawTimeMs / this.currentChartData.durationMs) * 100));
      this.dom.hudProgressFill.style.width = `${pct}%`;

      // Check song completion
      if (rawTimeMs >= this.currentChartData.durationMs) {
        this._finishSession();
        return;
      }
    }

    // Render frame
    this.renderer.render(
      {
        notes: this.engine.notes,
        songTimeMs,
        bpm: this.currentChartData.song.bpm,
        offsetMs: this.currentChartData.song.offsetMs,
        scrollSpeed: this.settings.scrollSpeed,
        soul: this.engine.soul,
        clearThreshold: this.engine.difficultyConfig.clearThreshold,
        combo: this.engine.combo,
        isGogo: this.engine.isGogoTime(songTimeMs),
      },
      dtSec
    );

    this.rafId = requestAnimationFrame((nextTs) => this._gameLoop(nextTs));
  }

  _finishSession() {
    this._stopSession();
    const summary = this.engine.getSummary();

    if (this.currentChartData.scoreKey && !this.settings.autoPlay) {
      this._saveScore(this.currentChartData.scoreKey, summary);
    }

    this.dom.resTitle.textContent = `${this.currentChartData.song.title}${this.settings.autoPlay ? ' (Auto-Play)' : ''}`;
    this.dom.resRank.textContent = summary.rank;
    this.dom.resRank.className = `result-rank rank-${summary.rank}`;
    this.dom.resStamp.textContent = summary.fullCombo
      ? 'FULL COMBO · 全连通关!'
      : summary.cleared
      ? 'CLEAR · 演奏成功'
      : 'FAILED · 未达过关线';
    this.dom.resStamp.className = `result-stamp ${summary.cleared ? 'cleared' : 'failed'}`;

    this.dom.resScore.textContent = summary.score.toLocaleString();
    this.dom.resAccuracy.textContent = `${summary.accuracy.toFixed(2)}%`;
    this.dom.resMaxCombo.textContent = `${summary.maxCombo} / ${summary.standardTotal}`;
    this.dom.resSoul.textContent = `${summary.soul}% (过关线 ${summary.clearThreshold}%)`;
    this.dom.resGreat.textContent = String(summary.counts.great);
    this.dom.resGood.textContent = String(summary.counts.good);
    this.dom.resMiss.textContent = String(summary.counts.miss);
    this.dom.resMeanOffset.textContent = `${summary.meanOffsetMs >= 0 ? '+' : ''}${summary.meanOffsetMs} ms`;

    this._renderTimingHistogram(summary.timingDeltas);
    this._switchView('result');
  }

  _renderTimingHistogram(deltas) {
    const bins = [-75, -50, -25, 0, 25, 50, 75];
    const counts = new Array(bins.length).fill(0);
    for (const d of deltas) {
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < bins.length; i++) {
        const dist = Math.abs(d - bins[i]);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }
      counts[bestIdx]++;
    }
    const maxCount = Math.max(1, ...counts);
    this.dom.resHistogram.innerHTML = bins
      .map((b, i) => {
        const h = Math.round((counts[i] / maxCount) * 100);
        const isCenter = b === 0;
        const label = b === 0 ? '0' : `${b > 0 ? '+' : ''}${b}`;
        return `
          <div class="hist-col">
            <div class="hist-bar-wrap">
              <div class="hist-bar ${isCenter ? 'center' : ''}" style="height:${Math.max(4, h)}%" title="${label}ms: ${counts[i]}"></div>
            </div>
            <div class="hist-label">${label}</div>
          </div>
        `;
      })
      .join('');
  }

  _openSettings() {
    this.listeningForKey = null;
    this._syncSettingsUI();
    this.dom.settingsModal.classList.remove('hidden');
  }

  _closeSettings() {
    this._stopCalibration();
    this.listeningForKey = null;
    this.dom.settingsModal.classList.add('hidden');
  }

  _syncSettingsUI() {
    this.dom.offsetSlider.value = String(this.settings.audioOffsetMs);
    this.dom.offsetValue.textContent = `${this.settings.audioOffsetMs >= 0 ? '+' : ''}${this.settings.audioOffsetMs} ms`;
    this.dom.speedSlider.value = String(this.settings.scrollSpeed);
    this.dom.speedValue.textContent = `${this.settings.scrollSpeed.toFixed(1)}x`;
    this.dom.bgmSlider.value = String(Math.round(this.settings.bgmVolume * 100));
    this.dom.bgmValue.textContent = `${Math.round(this.settings.bgmVolume * 100)}%`;
    this.dom.sfxSlider.value = String(Math.round(this.settings.sfxVolume * 100));
    this.dom.sfxValue.textContent = `${Math.round(this.settings.sfxVolume * 100)}%`;

    this.dom.keyBindBtns.forEach((btn) => {
      const slot = btn.getAttribute('data-keybind');
      if (this.listeningForKey === slot) {
        btn.textContent = '请按键...';
        btn.classList.add('listening');
      } else {
        btn.textContent = this.settings.keyBindings[slot].replace(/^Key/, '');
        btn.classList.remove('listening');
      }
    });
  }

  _toggleCalibration() {
    if (this.calibrationTimer) {
      this._stopCalibration();
      return;
    }
    this.audio.ensureContext();
    this.calibrationSamples = [];
    this.calibrationStartTs = performance.now();
    let beatCount = 0;
    this.dom.calibrateBtn.textContent = '停止校准';
    this.dom.calibrateStatus.textContent = '跟随节拍按 Space / F / J 敲击 8 次...';

    const tick = () => {
      this.audio.playMetronomeTick(beatCount % 4 === 0);
      beatCount++;
    };
    tick();
    this.calibrationTimer = setInterval(tick, this.calibrationBeatMs);
  }

  _recordCalibrationTap() {
    const elapsed = performance.now() - this.calibrationStartTs;
    const remainder = elapsed % this.calibrationBeatMs;
    const offset = remainder > this.calibrationBeatMs / 2 ? remainder - this.calibrationBeatMs : remainder;
    this.calibrationSamples.push(offset);
    this.audio.playDon(false);

    if (this.calibrationSamples.length >= 8) {
      const avg = Math.round(
        this.calibrationSamples.reduce((a, b) => a + b, 0) / this.calibrationSamples.length
      );
      const clamped = Math.max(-150, Math.min(150, avg));
      this.settings.audioOffsetMs = clamped;
      this._saveSettings();
      this._syncSettingsUI();
      this._stopCalibration();
      this.dom.calibrateStatus.textContent = `校准完成！已应用延迟补偿: ${clamped >= 0 ? '+' : ''}${clamped} ms`;
    } else {
      this.dom.calibrateStatus.textContent = `已采集 ${this.calibrationSamples.length} / 8 次敲击...`;
    }
  }

  _stopCalibration() {
    if (this.calibrationTimer) {
      clearInterval(this.calibrationTimer);
      this.calibrationTimer = null;
    }
    if (this.dom.calibrateBtn) {
      this.dom.calibrateBtn.textContent = '开始节拍校准';
    }
  }

  _renderEditorPreview() {
    try {
      const parsed = parseRawTJAText(this.dom.editorTextarea.value);
      this.dom.editorError.classList.add('hidden');
      this.dom.editorPlayBtn.disabled = false;
      this.dom.editorStats.textContent = `解析成功 · 曲名「${parsed.title}」· BPM ${parsed.bpm} · 标准音符 ${parsed.stats.standardCount} · 连打 ${parsed.stats.drumrollCount} · 气球 ${parsed.stats.balloonCount} · 时长 ${(parsed.durationMs / 1000).toFixed(1)}s`;
    } catch (err) {
      this.dom.editorError.textContent = `语法提示: ${err.message}`;
      this.dom.editorError.classList.remove('hidden');
      this.dom.editorPlayBtn.disabled = true;
      this.dom.editorStats.textContent = '请修正谱面语法后试玩';
    }
  }

  _showToast(msg) {
    if (!this.dom.toast) return;
    this.dom.toast.textContent = msg;
    this.dom.toast.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this.dom.toast.classList.add('hidden');
    }, 2400);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.__taikoApp = new TaikoApp();
});
