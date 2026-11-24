/**
 * 百战天虫 3D - HUD 与交互界面控制器
 * 负责队伍血条、回合倒计时、风向罗盘、武器栏、蓄力槽、3D头顶虫子血条、战报、设置弹窗与触控按钮。
 */

import { WEAPON_LIST, WEAPONS, TURN_PHASE } from '../core/constants.js';

export class HUDController {
  constructor(engine, renderer, sound) {
    this.engine = engine;
    this.renderer = renderer;
    this.sound = sound;
    this.labelElements = new Map();

    this.el = {
      team0HpBar: document.getElementById('team0-hp-bar'),
      team1HpBar: document.getElementById('team1-hp-bar'),
      team0HpText: document.getElementById('team0-hp-text'),
      team1HpText: document.getElementById('team1-hp-text'),
      turnBadge: document.getElementById('turn-badge'),
      turnTimer: document.getElementById('turn-timer'),
      roundBadge: document.getElementById('round-badge'),
      windArrow: document.getElementById('wind-arrow'),
      windValue: document.getElementById('wind-value'),
      weaponBar: document.getElementById('weapon-bar'),
      weaponDesc: document.getElementById('weapon-desc'),
      powerWrap: document.getElementById('power-wrap'),
      powerFill: document.getElementById('power-fill'),
      killFeed: document.getElementById('kill-feed'),
      labelsLayer: document.getElementById('worm-labels-layer'),
      banner: document.getElementById('event-banner'),
      gameOverModal: document.getElementById('gameover-modal'),
      gameOverTitle: document.getElementById('gameover-title'),
      gameOverSub: document.getElementById('gameover-sub'),
      camBtn: document.getElementById('btn-camera'),
      muteBtn: document.getElementById('btn-mute'),
    };

    this.bannerTimer = 0;
    this.buildWeaponBar();
    this.rebuildWormLabels();
    this.bindEvents();
  }

  buildWeaponBar() {
    if (!this.el.weaponBar) return;
    this.el.weaponBar.innerHTML = '';
    for (const w of WEAPON_LIST) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.weaponId = w.id;
      btn.className =
        'weapon-btn flex flex-col items-center justify-center px-2.5 py-1.5 rounded-lg border border-slate-600/70 bg-slate-900/80 text-white hover:bg-slate-800 transition select-none min-w-[60px]';
      btn.innerHTML = `
        <div class="flex items-center gap-1">
          <span class="text-base leading-none">${w.icon}</span>
          <span class="text-[10px] font-mono text-slate-400">[${w.key}]</span>
        </div>
        <span class="text-[11px] font-medium mt-0.5 whitespace-nowrap">${w.name}</span>
        <span class="weapon-ammo text-[10px] font-mono text-amber-300">∞</span>
      `;
      btn.addEventListener('click', () => {
        this.sound.unlock();
        if (!this.engine.getActiveTeam().isAI) {
          this.engine.selectWeapon(w.id);
          this.updateWeaponBar();
        }
      });
      this.el.weaponBar.appendChild(btn);
    }
  }

  rebuildWormLabels() {
    if (!this.el.labelsLayer) return;
    this.el.labelsLayer.innerHTML = '';
    this.labelElements.clear();

    for (const worm of this.engine.worms) {
      const team = this.engine.teams[worm.teamId];
      const div = document.createElement('div');
      div.className =
        'absolute -translate-x-1/2 -translate-y-full pointer-events-none px-1.5 py-0.5 rounded bg-slate-950/75 border text-center shadow';
      div.style.borderColor = team.colorHex;
      div.innerHTML = `
        <div class="text-[10px] font-bold leading-tight whitespace-nowrap" style="color:${team.colorHex}">${worm.name}</div>
        <div class="w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden mt-0.5">
          <div class="worm-hp-fill h-full transition-all" style="width:100%;background:${team.colorHex}"></div>
        </div>
        <div class="worm-hp-num text-[9px] font-mono text-slate-200 leading-none mt-0.5">100</div>
      `;
      this.el.labelsLayer.appendChild(div);
      this.labelElements.set(worm.id, div);
    }
  }

  showBanner(text, duration = 2.2) {
    if (!this.el.banner) return;
    this.el.banner.textContent = text;
    this.el.banner.classList.remove('opacity-0', 'scale-95');
    this.el.banner.classList.add('opacity-100', 'scale-100');
    this.bannerTimer = duration;
  }

  bindEvents() {
    this.engine.on('match_reset', () => {
      this.rebuildWormLabels();
      if (this.el.gameOverModal) this.el.gameOverModal.classList.add('hidden');
      this.updateWeaponBar();
      this.updateKillFeed();
    });

    this.engine.on('turn_change', (snap) => {
      this.updateWeaponBar();
      const tag = snap.isAI ? '🤖 AI 思考中' : '🎯 轮到你行动';
      this.showBanner(`第 ${snap.round} 轮 · ${snap.teamName} (${snap.wormName}) — ${tag}`, 2.1);
    });

    this.engine.on('weapon_change', () => this.updateWeaponBar());
    this.engine.on('feed', () => this.updateKillFeed());
    this.engine.on('sudden_death', (ev) => {
      this.showBanner(`⚠️ 突然死亡！海平面上升至 ${ev.waterLevel.toFixed(1)}m`, 2.8);
    });

    this.engine.on('game_over', (ev) => {
      this.sound.playVictory();
      if (this.el.gameOverModal) {
        this.el.gameOverTitle.textContent = ev.label;
        this.el.gameOverSub.textContent = `总回合数：${this.engine.turnNumber} · 共经历 ${this.engine.round} 轮激战`;
        this.el.gameOverModal.classList.remove('hidden');
      }
    });
  }

  updateWeaponBar() {
    if (!this.el.weaponBar) return;
    const team = this.engine.getActiveTeam();
    const buttons = this.el.weaponBar.querySelectorAll('.weapon-btn');
    for (const btn of buttons) {
      const wid = btn.dataset.weaponId;
      const ammo = team.ammo[wid];
      const ammoEl = btn.querySelector('.weapon-ammo');
      if (ammoEl) ammoEl.textContent = Number.isFinite(ammo) ? `x${ammo}` : '∞';

      const selected = wid === this.engine.selectedWeaponId;
      btn.classList.toggle('ring-2', selected);
      btn.classList.toggle('ring-amber-400', selected);
      btn.classList.toggle('bg-amber-500/20', selected);
      btn.classList.toggle('opacity-40', ammo <= 0);
      btn.disabled = ammo <= 0;
    }

    const w = WEAPONS[this.engine.selectedWeaponId];
    if (this.el.weaponDesc && w) {
      this.el.weaponDesc.textContent = `${w.icon} ${w.name}：${w.description}`;
    }
  }

  updateKillFeed() {
    if (!this.el.killFeed) return;
    this.el.killFeed.innerHTML = this.engine.killFeed
      .slice(0, 4)
      .map(
        (item) =>
          `<div class="px-2.5 py-1 rounded bg-slate-950/75 border border-slate-700/60 text-xs text-slate-100 shadow">${item.message}</div>`
      )
      .join('');
  }

  update(dt) {
    // 1. 顶部队伍总血量条
    const maxTeamHp = this.engine.wormsPerTeam * 100;
    const hp0 = this.engine.getTeamTotalHp(0);
    const hp1 = this.engine.getTeamTotalHp(1);
    if (this.el.team0HpBar) this.el.team0HpBar.style.width = `${(hp0 / maxTeamHp) * 100}%`;
    if (this.el.team1HpBar) this.el.team1HpBar.style.width = `${(hp1 / maxTeamHp) * 100}%`;
    if (this.el.team0HpText) this.el.team0HpText.textContent = `${hp0}`;
    if (this.el.team1HpText) this.el.team1HpText.textContent = `${hp1}`;

    // 2. 回合倒计时与阶段提示
    const activeTeam = this.engine.getActiveTeam();
    const activeWorm = this.engine.getActiveWorm();
    if (this.el.roundBadge) {
      this.el.roundBadge.textContent = `R${this.engine.round}`;
    }
    if (this.el.turnBadge && activeTeam) {
      this.el.turnBadge.textContent = `${activeTeam.name} · ${activeWorm ? activeWorm.name : ''}`;
      this.el.turnBadge.style.color = activeTeam.colorHex;
    }
    if (this.el.turnTimer) {
      if (this.engine.phase === TURN_PHASE.RETREAT) {
        this.el.turnTimer.textContent = `撤离 ${Math.ceil(this.engine.retreatTimer)}s`;
        this.el.turnTimer.className = 'text-lg font-black font-mono text-emerald-400';
      } else {
        const t = Math.ceil(this.engine.turnTimer);
        this.el.turnTimer.textContent = `${t}s`;
        this.el.turnTimer.className = `text-lg font-black font-mono ${t <= 6 ? 'text-rose-400 animate-pulse' : 'text-amber-300'}`;
      }
    }

    // 3. 风向与风速显示
    const windSpeed = Math.hypot(this.engine.wind.x, this.engine.wind.z);
    const windAngleDeg = (Math.atan2(this.engine.wind.x, this.engine.wind.z) * 180) / Math.PI;
    if (this.el.windArrow) {
      this.el.windArrow.style.transform = `rotate(${windAngleDeg.toFixed(1)}deg)`;
    }
    if (this.el.windValue) {
      this.el.windValue.textContent = `${windSpeed.toFixed(1)} m/s`;
    }

    // 4. 蓄力槽显示
    if (this.el.powerWrap && this.el.powerFill) {
      const charging = this.engine.phase === TURN_PHASE.CHARGING;
      this.el.powerWrap.classList.toggle('opacity-0', !charging);
      this.el.powerFill.style.width = `${Math.round(this.engine.chargePower * 100)}%`;
    }

    // 5. 3D 投影虫子头顶血条
    for (const worm of this.engine.worms) {
      const el = this.labelElements.get(worm.id);
      if (!el) continue;
      if (!worm.alive) {
        el.style.display = 'none';
        continue;
      }
      const pos = this.renderer.projectToScreen(worm.x, worm.y + 2.45, worm.z);
      if (!pos.visible) {
        el.style.display = 'none';
        continue;
      }
      el.style.display = 'block';
      el.style.left = `${pos.x}px`;
      el.style.top = `${pos.y}px`;
      const fill = el.querySelector('.worm-hp-fill');
      const num = el.querySelector('.worm-hp-num');
      if (fill) fill.style.width = `${Math.max(0, (worm.hp / worm.maxHp) * 100)}%`;
      if (num) num.textContent = `${worm.hp}`;
    }

    // 6. 横幅淡出
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0 && this.el.banner) {
        this.el.banner.classList.add('opacity-0', 'scale-95');
        this.el.banner.classList.remove('opacity-100', 'scale-100');
      }
    }
  }
}
