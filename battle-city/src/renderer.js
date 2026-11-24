import {
  GRID_SIZE,
  TILE_SIZE,
  FIELD_SIZE,
  HUD_WIDTH,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  DIR,
  TILE,
  GAME_STATE,
  ENEMY_TYPE,
  ENEMY_SPECS,
  POWERUP_TYPE,
} from './constants.js';

export class BattleCityRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.canvas.width = CANVAS_WIDTH;
    this.canvas.height = CANVAS_HEIGHT;
    this.ctx.imageSmoothingEnabled = false;
  }

  render(engine) {
    const ctx = this.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // Clear full canvas
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    if (engine.state === GAME_STATE.MENU) {
      this._drawMenu(engine);
      ctx.restore();
      return;
    }

    if (engine.state === GAME_STATE.STAGE_INTRO) {
      this._drawStageIntro(engine);
      ctx.restore();
      return;
    }

    // Draw battlefield background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, FIELD_SIZE, FIELD_SIZE);

    // 1. Ground & solid terrain (excluding FOREST canopy)
    this._drawTerrain(engine, false);

    // 2. Spawn animations
    for (const sp of engine.spawnEffects) {
      this._drawSpawnEffect(sp);
    }

    // 3. Tanks (players + enemies)
    for (const p of engine.players) {
      if (p && p.alive) this._drawTank(p, engine.time);
    }
    for (const e of engine.enemies) {
      if (e && e.alive) this._drawTank(e, engine.time);
    }

    // 4. Bullets
    for (const b of engine.bullets) {
      if (b.alive) this._drawBullet(b);
    }

    // 5. Forest canopy (above tanks & bullets, classic FC stealth mechanic)
    this._drawTerrain(engine, true);

    // 6. Power-ups
    for (const pwr of engine.powerUps) {
      if (pwr.alive) this._drawPowerUp(pwr, engine.time);
    }

    // 7. Explosions & floating score popups
    for (const exp of engine.explosions) {
      this._drawExplosion(exp);
    }
    for (const txt of engine.floatingTexts) {
      this._drawFloatingText(txt);
    }

    // 8. Right classic FC HUD sidebar
    this._drawHUD(engine);

    // 9. Overlays (Pause / Stage Clear / Game Over)
    if (engine.state === GAME_STATE.PAUSED) {
      this._drawPauseOverlay();
    } else if (engine.state === GAME_STATE.STAGE_CLEAR) {
      this._drawStageClearOverlay(engine);
    } else if (engine.state === GAME_STATE.GAME_OVER) {
      this._drawGameOverOverlay(engine);
    }

    ctx.restore();
  }

  _drawMenu(engine) {
    const ctx = this.ctx;
    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Top score bar
    ctx.fillStyle = '#e4e4e7';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`HI-SCORE  ${String(engine.highScore).padStart(6, '0')}`, CANVAS_WIDTH / 2, 36);

    // Retro pixel brick title banner
    ctx.fillStyle = '#c2410c';
    ctx.font = 'bold 46px monospace';
    ctx.fillText('BATTLE', CANVAS_WIDTH / 2, 108);
    ctx.fillText('CITY', CANVAS_WIDTH / 2, 154);

    // Highlight bevel lines across title
    ctx.fillStyle = '#fb923c';
    ctx.font = 'bold 46px monospace';
    ctx.fillText('BATTLE', CANVAS_WIDTH / 2 - 2, 106);
    ctx.fillText('CITY', CANVAS_WIDTH / 2 - 2, 152);

    ctx.fillStyle = '#a1a1aa';
    ctx.font = 'bold 13px monospace';
    ctx.fillText('FC 经典坦克大战 · HTML5 重制版', CANVAS_WIDTH / 2, 184);

    // Mode selection preview
    const y1 = 236;
    const y2 = 270;
    const y3 = 304;

    ctx.textAlign = 'left';
    ctx.font = 'bold 16px monospace';
    ctx.fillStyle = engine.playerCount === 1 ? '#facc15' : '#e4e4e7';
    ctx.fillText('1 PLAYER  单人模式', 174, y1);
    ctx.fillStyle = engine.playerCount === 2 ? '#4ade80' : '#e4e4e7';
    ctx.fillText('2 PLAYERS 双人合作', 174, y2);
    ctx.fillStyle = '#93c5fd';
    ctx.fillText(`STAGE ${engine.selectedStage}   (${engine.stageName})`, 174, y3);

    // Draw mini cursor tank next to active mode
    const cursorY = engine.playerCount === 1 ? y1 - 15 : y2 - 15;
    this._drawMiniTankIcon(136, cursorY, '#facc15', DIR.RIGHT);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#71717a';
    ctx.font = '12px monospace';
    ctx.fillText('按 ENTER / 点击上方「开始 / 重开」启动', CANVAS_WIDTH / 2, 362);
    ctx.fillText('1P: WASD/方向键 + 空格/J  |  2P: 方向键 + Enter/K', CANVAS_WIDTH / 2, 386);
  }

  _drawStageIntro(engine) {
    const ctx = this.ctx;
    ctx.fillStyle = '#71717a';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = '#18181b';
    ctx.font = 'bold 26px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`STAGE  ${engine.stageNumber}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 8);
    ctx.font = 'bold 15px monospace';
    ctx.fillText(engine.stageName, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 22);
  }

  _drawTerrain(engine, forestOnly) {
    const ctx = this.ctx;
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        const t = engine.grid[r][c];
        if (forestOnly) {
          if (t === TILE.FOREST) {
            this._drawForestTile(c * TILE_SIZE, r * TILE_SIZE);
          }
          continue;
        }
        if (t === TILE.EMPTY || t === TILE.FOREST) continue;
        const x = c * TILE_SIZE;
        const y = r * TILE_SIZE;
        switch (t) {
          case TILE.BRICK:
            this._drawBrickTile(x, y);
            break;
          case TILE.STEEL:
            this._drawSteelTile(x, y);
            break;
          case TILE.WATER:
            this._drawWaterTile(x, y, engine.time);
            break;
          case TILE.ICE:
            this._drawIceTile(x, y);
            break;
          default:
            break;
        }
      }
    }

    if (!forestOnly) {
      // Draw 32x32 Eagle Base once at (12*16, 24*16)
      this._drawBase(12 * TILE_SIZE, 24 * TILE_SIZE, engine.baseAlive);
    }
  }

  _drawBrickTile(x, y) {
    const ctx = this.ctx;
    ctx.fillStyle = '#9a3412';
    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle = '#c2410c';
    ctx.fillRect(x + 1, y + 1, 6, 6);
    ctx.fillRect(x + 9, y + 1, 6, 6);
    ctx.fillRect(x + 1, y + 9, 3, 6);
    ctx.fillRect(x + 6, y + 9, 9, 6);
    // Mortar lines
    ctx.fillStyle = '#52525b';
    ctx.fillRect(x, y + 7, TILE_SIZE, 1);
    ctx.fillRect(x, y + 15, TILE_SIZE, 1);
    ctx.fillRect(x + 7, y, 1, 8);
    ctx.fillRect(x + 4, y + 8, 1, 8);
  }

  _drawSteelTile(x, y) {
    const ctx = this.ctx;
    ctx.fillStyle = '#71717a';
    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle = '#d4d4d8';
    ctx.fillRect(x + 1, y + 1, TILE_SIZE - 2, 2);
    ctx.fillRect(x + 1, y + 1, 2, TILE_SIZE - 2);
    ctx.fillStyle = '#e4e4e7';
    ctx.fillRect(x + 4, y + 4, 8, 8);
    ctx.fillStyle = '#3f3f46';
    ctx.fillRect(x + 1, y + TILE_SIZE - 2, TILE_SIZE - 1, 2);
    ctx.fillRect(x + TILE_SIZE - 2, y + 1, 2, TILE_SIZE - 1);
  }

  _drawForestTile(x, y) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(22, 101, 52, 0.88)';
    ctx.fillRect(x + 1, y + 1, 14, 14);
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(x + 2, y + 2, 4, 4);
    ctx.fillRect(x + 9, y + 3, 4, 4);
    ctx.fillRect(x + 4, y + 9, 4, 4);
    ctx.fillRect(x + 10, y + 10, 4, 4);
  }

  _drawWaterTile(x, y, time) {
    const ctx = this.ctx;
    ctx.fillStyle = '#1d4ed8';
    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
    const waveOffset = Math.floor(time * 4) % 2 === 0 ? 0 : 4;
    ctx.fillStyle = '#60a5fa';
    ctx.fillRect(x + ((2 + waveOffset) % 12), y + 4, 5, 2);
    ctx.fillRect(x + ((8 - waveOffset + 12) % 12), y + 11, 5, 2);
  }

  _drawIceTile(x, y) {
    const ctx = this.ctx;
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(x + 2, y + 2, 4, 2);
    ctx.fillRect(x + 8, y + 7, 5, 2);
    ctx.fillRect(x + 3, y + 12, 4, 2);
  }

  _drawBase(x, y, alive) {
    const ctx = this.ctx;
    ctx.fillStyle = '#18181b';
    ctx.fillRect(x, y, 32, 32);
    if (alive) {
      // Classic golden/steel eagle emblem
      ctx.fillStyle = '#eab308';
      ctx.fillRect(x + 13, y + 4, 6, 6);   // Head
      ctx.fillStyle = '#d4d4d8';
      ctx.fillRect(x + 4, y + 10, 24, 5);  // Upper wings
      ctx.fillRect(x + 6, y + 15, 20, 5);  // Lower wings
      ctx.fillStyle = '#a1a1aa';
      ctx.fillRect(x + 11, y + 10, 10, 14);// Body
      ctx.fillStyle = '#facc15';
      ctx.fillRect(x + 9, y + 24, 14, 4);  // Tail pedestal
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(x + 14, y + 14, 4, 4);  // Core gem
    } else {
      // Destroyed white flag / rubble
      ctx.fillStyle = '#52525b';
      ctx.fillRect(x + 4, y + 20, 24, 10);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(x + 8, y + 14, 6, 6);
      ctx.fillRect(x + 18, y + 16, 6, 6);
      ctx.fillStyle = '#e4e4e7';
      ctx.fillRect(x + 14, y + 6, 2, 18);  // Flag pole
      ctx.fillRect(x + 16, y + 6, 9, 6);   // Surrender flag
    }
  }

  _drawTank(tank, time) {
    const ctx = this.ctx;
    let bodyColor = '#facc15';
    let accentColor = '#ca8a04';

    if (tank.isPlayer) {
      if (tank.playerIndex === 0) {
        bodyColor = '#facc15';
        accentColor = '#a16207';
      } else {
        bodyColor = '#4ade80';
        accentColor = '#15803d';
      }
    } else {
      if (tank.isBonus && Math.floor(time * 10) % 2 === 0) {
        bodyColor = '#ef4444';
        accentColor = '#991b1b';
      } else if (tank.enemyType === ENEMY_TYPE.ARMOR) {
        if (tank.hp >= 4) {
          bodyColor = '#4ade80';
          accentColor = '#166534';
        } else if (tank.hp === 3) {
          bodyColor = '#facc15';
          accentColor = '#854d0e';
        } else if (tank.hp === 2) {
          bodyColor = '#e4e4e7';
          accentColor = '#52525b';
        } else {
          bodyColor = '#fb923c';
          accentColor = '#9a3412';
        }
      } else {
        bodyColor = ENEMY_SPECS[tank.enemyType].color;
        accentColor = '#52525b';
      }
      if (tank.hitFlashTimer > 0) {
        bodyColor = '#ffffff';
      }
    }

    ctx.save();
    const cx = tank.x + tank.width / 2;
    const cy = tank.y + tank.height / 2;
    ctx.translate(cx, cy);
    ctx.rotate((tank.dir * Math.PI) / 2);

    const w = tank.width;
    const h = tank.height;
    const halfW = w / 2;
    const halfH = h / 2;

    // Left & right treads
    ctx.fillStyle = '#3f3f46';
    ctx.fillRect(-halfW, -halfH, 6, h);
    ctx.fillRect(halfW - 6, -halfH, 6, h);

    // Animated tread cleats
    const treadPhase = Math.floor(tank.trackAnim) % 2 === 0 ? 0 : 3;
    ctx.fillStyle = '#a1a1aa';
    for (let y = -halfH + treadPhase; y < halfH - 1; y += 6) {
      ctx.fillRect(-halfW, y, 6, 2);
      ctx.fillRect(halfW - 6, y, 6, 2);
    }

    // Main hull
    ctx.fillStyle = bodyColor;
    ctx.fillRect(-halfW + 5, -halfH + 3, w - 10, h - 6);

    // Turret
    ctx.fillStyle = accentColor;
    ctx.fillRect(-6, -5, 12, 11);
    ctx.fillStyle = bodyColor;
    ctx.fillRect(-4, -3, 8, 7);

    // Barrel (upgrades visually thicker for Lv2/Lv3 player)
    const barrelWidth = tank.isPlayer && tank.level >= 2 ? 6 : 4;
    ctx.fillStyle = '#f4f4f5';
    ctx.fillRect(-barrelWidth / 2, -halfH - 2, barrelWidth, halfH - 1);

    // Star badge for upgraded player
    if (tank.isPlayer && tank.level > 0) {
      ctx.fillStyle = tank.level >= 3 ? '#ef4444' : '#ffffff';
      ctx.fillRect(-2, 4, 4, 3);
    }

    ctx.restore();

    // Invincibility shield ring
    if (tank.shieldTimer > 0) {
      const pulse = Math.floor(time * 16) % 2 === 0;
      ctx.strokeStyle = pulse ? '#ffffff' : '#38bdf8';
      ctx.lineWidth = 2;
      ctx.strokeRect(tank.x - 2, tank.y - 2, tank.width + 4, tank.height + 4);
    }
  }

  _drawMiniTankIcon(x, y, color, dir) {
    this._drawTank(
      {
        x,
        y,
        width: 22,
        height: 22,
        dir,
        isPlayer: true,
        playerIndex: 0,
        level: 0,
        trackAnim: 0,
        shieldTimer: 0,
        hitFlashTimer: 0,
      },
      0
    );
  }

  _drawBullet(b) {
    const ctx = this.ctx;
    ctx.fillStyle = b.canBreakSteel ? '#f97316' : '#f8fafc';
    ctx.fillRect(b.x, b.y, b.width, b.height);
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(b.x + 1, b.y + 1, b.width - 2, b.height - 2);
  }

  _drawSpawnEffect(sp) {
    const ctx = this.ctx;
    const phase = Math.floor(sp.elapsed * 12) % 4;
    const r = [6, 10, 14, 10][phase];
    const cx = sp.x + 14;
    const cy = sp.y + 14;
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - r, cy);
    ctx.lineTo(cx + r, cy);
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx, cy + r);
    ctx.moveTo(cx - r * 0.65, cy - r * 0.65);
    ctx.lineTo(cx + r * 0.65, cy + r * 0.65);
    ctx.moveTo(cx + r * 0.65, cy - r * 0.65);
    ctx.lineTo(cx - r * 0.65, cy + r * 0.65);
    ctx.stroke();
  }

  _drawPowerUp(pwr, time) {
    if (pwr.timer < 3 && Math.floor(time * 12) % 2 === 0) return;
    const ctx = this.ctx;
    const flash = Math.floor(time * 6) % 2 === 0;
    ctx.fillStyle = flash ? '#1e293b' : '#334155';
    ctx.fillRect(pwr.x, pwr.y, pwr.width, pwr.height);
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 2;
    ctx.strokeRect(pwr.x + 1, pwr.y + 1, pwr.width - 2, pwr.height - 2);

    const iconMap = {
      [POWERUP_TYPE.HELMET]: { ch: '盾', color: '#38bdf8' },
      [POWERUP_TYPE.CLOCK]: { ch: '时', color: '#c084fc' },
      [POWERUP_TYPE.SHOVEL]: { ch: '铁', color: '#94a3b8' },
      [POWERUP_TYPE.STAR]: { ch: '★', color: '#facc15' },
      [POWERUP_TYPE.GRENADE]: { ch: '雷', color: '#f87171' },
      [POWERUP_TYPE.TANK]: { ch: '+1', color: '#4ade80' },
    };
    const meta = iconMap[pwr.type] || { ch: '?', color: '#ffffff' };
    ctx.fillStyle = meta.color;
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(meta.ch, pwr.x + pwr.width / 2, pwr.y + pwr.height / 2 + 1);
    ctx.textBaseline = 'alphabetic';
  }

  _drawExplosion(exp) {
    const ctx = this.ctx;
    const progress = Math.min(1, exp.elapsed / exp.duration);
    const maxR = exp.big ? 24 : 10;
    const r = maxR * Math.sin(progress * Math.PI);
    ctx.fillStyle = progress < 0.45 ? '#fef08a' : '#f97316';
    ctx.beginPath();
    ctx.arc(exp.x, exp.y, Math.max(2, r), 0, Math.PI * 2);
    ctx.fill();
    if (exp.big && progress < 0.7) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(exp.x, exp.y, Math.max(1, r * 0.45), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawFloatingText(txt) {
    const ctx = this.ctx;
    ctx.fillStyle = txt.color;
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(txt.text, txt.x, txt.y);
  }

  _drawHUD(engine) {
    const ctx = this.ctx;
    const sx = FIELD_SIZE;
    ctx.fillStyle = '#71717a';
    ctx.fillRect(sx, 0, HUD_WIDTH, CANVAS_HEIGHT);

    // Remaining enemies matrix (2 columns x 10 rows)
    const remaining = engine.getRemainingEnemiesCount();
    const startX = sx + 20;
    const startY = 18;
    for (let i = 0; i < remaining; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const ex = startX + col * 24;
      const ey = startY + row * 16;
      ctx.fillStyle = '#18181b';
      ctx.fillRect(ex + 2, ey + 2, 10, 10);
      ctx.fillStyle = '#e4e4e7';
      ctx.fillRect(ex + 5, ey, 4, 4);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(ex + 4, ey + 5, 6, 5);
    }

    // Player 1 & Player 2 status
    ctx.textAlign = 'left';
    ctx.fillStyle = '#18181b';
    ctx.font = 'bold 13px monospace';
    ctx.fillText('1P', sx + 14, 218);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(sx + 14, 224, 12, 12);
    ctx.fillStyle = '#18181b';
    ctx.fillText(`x${Math.max(0, engine.playerMeta[0]?.lives ?? 0)}`, sx + 32, 235);
    ctx.font = 'bold 11px monospace';
    ctx.fillText(`LV.${engine.playerMeta[0]?.level ?? 0}`, sx + 14, 250);

    if (engine.playerCount === 2) {
      ctx.font = 'bold 13px monospace';
      ctx.fillText('2P', sx + 14, 276);
      ctx.fillStyle = '#4ade80';
      ctx.fillRect(sx + 14, 282, 12, 12);
      ctx.fillStyle = '#18181b';
      ctx.fillText(`x${Math.max(0, engine.playerMeta[1]?.lives ?? 0)}`, sx + 32, 293);
      ctx.font = 'bold 11px monospace';
      ctx.fillText(`LV.${engine.playerMeta[1]?.level ?? 0}`, sx + 14, 308);
    }

    // Active buffs indicator
    let buffY = 328;
    ctx.font = 'bold 10px monospace';
    if (engine.enemyFreezeTimer > 0) {
      ctx.fillStyle = '#3b0764';
      ctx.fillText(`定身 ${Math.ceil(engine.enemyFreezeTimer)}s`, sx + 12, buffY);
      buffY += 14;
    }
    if (engine.shovelTimer > 0) {
      ctx.fillStyle = '#1e293b';
      ctx.fillText(`钢甲 ${Math.ceil(engine.shovelTimer)}s`, sx + 12, buffY);
    }

    // Stage Flag at bottom
    const fx = sx + 22;
    const fy = 362;
    ctx.fillStyle = '#18181b';
    ctx.fillRect(fx, fy, 3, 26);
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(fx + 3, fy, 18, 12);
    ctx.fillStyle = '#18181b';
    ctx.font = 'bold 16px monospace';
    ctx.fillText(String(engine.stageNumber), fx + 28, fy + 22);
  }

  _drawPauseOverlay() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, FIELD_SIZE, FIELD_SIZE);
    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', FIELD_SIZE / 2, FIELD_SIZE / 2);
    ctx.fillStyle = '#e4e4e7';
    ctx.font = '13px monospace';
    ctx.fillText('按 P 或点击继续按钮恢复战斗', FIELD_SIZE / 2, FIELD_SIZE / 2 + 28);
  }

  _drawStageClearOverlay(engine) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(9, 9, 11, 0.88)';
    ctx.fillRect(0, 0, FIELD_SIZE, FIELD_SIZE);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 22px monospace';
    ctx.fillText(`STAGE ${engine.stageNumber} CLEAR!`, FIELD_SIZE / 2, 72);

    const types = [ENEMY_TYPE.BASIC, ENEMY_TYPE.FAST, ENEMY_TYPE.POWER, ENEMY_TYPE.ARMOR];
    ctx.font = 'bold 13px monospace';
    let y = 132;
    let totalKills = 0;
    for (const type of types) {
      const count = engine.playerMeta.reduce((acc, m) => acc + (m.kills[type] || 0), 0);
      totalKills += count;
      const pts = count * ENEMY_SPECS[type].score;
      ctx.fillStyle = ENEMY_SPECS[type].color;
      ctx.textAlign = 'left';
      ctx.fillText(`${ENEMY_SPECS[type].label}`, 64, y);
      ctx.fillStyle = '#e4e4e7';
      ctx.textAlign = 'right';
      ctx.fillText(`${count} 辆  =  ${pts} PTS`, FIELD_SIZE - 64, y);
      y += 38;
    }

    ctx.fillStyle = '#71717a';
    ctx.fillRect(64, y - 12, FIELD_SIZE - 128, 2);
    ctx.fillStyle = '#4ade80';
    ctx.textAlign = 'center';
    ctx.font = 'bold 15px monospace';
    ctx.fillText(`总计击毁: ${totalKills}  |  当前总分: ${engine.getTotalScore()}`, FIELD_SIZE / 2, y + 18);
    ctx.fillStyle = '#a1a1aa';
    ctx.font = '12px monospace';
    ctx.fillText('即将进入下一关...', FIELD_SIZE / 2, y + 52);
  }

  _drawGameOverOverlay(engine) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(0, 0, FIELD_SIZE, FIELD_SIZE);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#dc2626';
    ctx.font = 'bold 42px monospace';
    ctx.fillText('GAME', FIELD_SIZE / 2, engine.gameOverBannerY);
    ctx.fillText('OVER', FIELD_SIZE / 2, engine.gameOverBannerY + 42);

    if (engine.gameOverBannerY <= FIELD_SIZE / 2 - 18) {
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 14px monospace';
      ctx.fillText(`FINAL SCORE: ${engine.getTotalScore()}`, FIELD_SIZE / 2, engine.gameOverBannerY + 86);
      ctx.fillStyle = '#a1a1aa';
      ctx.font = '12px monospace';
      ctx.fillText('按 ENTER 或点击「重新开始」再战一局', FIELD_SIZE / 2, engine.gameOverBannerY + 112);
    }
  }
}
