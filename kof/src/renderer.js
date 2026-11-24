// KOF Web Arcade - HTML5 Canvas 2D Arcade Renderer
import {
  STAGE_WIDTH,
  STAGE_HEIGHT,
  GROUND_Y,
  MAX_GUARD,
  POWER_PER_STOCK,
  FIGHTER_STATES,
  MATCH_PHASES,
  STAGES,
  GAME_MODES
} from './constants.js';
import { FIGHTERS } from './fighters.js';
import { getHurtbox, getActiveHitbox, getPushbox, getProjectileBox } from './physics.js';

export class ArcadeRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.showHitboxes = false;
  }

  render(engine) {
    const ctx = this.ctx;
    ctx.save();

    // Screen shake offset
    if (engine.screenShake > 0.2) {
      const sx = (Math.random() - 0.5) * engine.screenShake * 1.4;
      const sy = (Math.random() - 0.5) * engine.screenShake * 1.1;
      ctx.translate(sx, sy);
    }

    // 1. Background stage
    this._drawStage(ctx, engine);

    // 2. Super Flash dramatic dark vignette & speedlines
    if (engine.superFlashFrames > 0) {
      ctx.fillStyle = 'rgba(5, 5, 18, 0.72)';
      ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
      const owner = engine.superFlashOwner === 1 ? engine.p1 : engine.p2;
      this._drawSpeedlines(ctx, owner.x, owner.y - 80, owner.def.colors.flame);
    }

    // 3. Ground shadows
    this._drawShadow(ctx, engine.p1);
    this._drawShadow(ctx, engine.p2);

    // 4. Fighters (attacker drawn on top)
    const p1Attacking = engine.p1.state === FIGHTER_STATES.ATTACK;
    if (p1Attacking) {
      this._drawFighter(ctx, engine.p2, engine.frameCount);
      this._drawFighter(ctx, engine.p1, engine.frameCount);
    } else {
      this._drawFighter(ctx, engine.p1, engine.frameCount);
      this._drawFighter(ctx, engine.p2, engine.frameCount);
    }

    // 5. Projectiles
    for (const p of engine.projectiles) {
      this._drawProjectile(ctx, p, engine.frameCount);
    }

    // 6. Hit / Guard / Super VFX
    for (const fx of engine.effects) {
      this._drawEffect(ctx, fx);
    }

    // 7. Debug Hitboxes / Hurtboxes / Pushboxes
    if (this.showHitboxes) {
      this._drawDebugBoxes(ctx, engine);
    }

    // 8. Floating Combat Text
    for (const ft of engine.floatingTexts) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, ft.life / 12);
      ctx.font = '900 22px "Inter", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#09090b';
      ctx.strokeText(ft.text, ft.x, ft.y);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }

    ctx.restore();

    // 9. Arcade HUD (unaffected by screen shake)
    this._drawHUD(ctx, engine);

    // 10. Center round/KO announcement banner
    if (engine.announcement) {
      this._drawAnnouncement(ctx, engine.announcement, engine.phase);
    }
  }

  _drawStage(ctx, engine) {
    const stage = STAGES[engine.stageIndex % STAGES.length];
    const t = engine.frameCount;

    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    sky.addColorStop(0, stage.skyTop);
    sky.addColorStop(1, stage.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, STAGE_WIDTH, GROUND_Y);

    if (stage.id === 'tokyo_street') {
      // Distant skyline buildings
      ctx.fillStyle = '#15122b';
      const buildings = [
        [20, 140, 90, 260], [125, 100, 110, 300], [255, 165, 85, 235],
        [360, 115, 120, 285], [500, 150, 100, 250], [620, 95, 130, 305],
        [770, 130, 95, 270], [875, 160, 80, 240]
      ];
      for (const [bx, by, bw, bh] of buildings) {
        ctx.fillRect(bx, by, bw, bh);
        // Lit windows
        ctx.fillStyle = 'rgba(255, 210, 120, 0.22)';
        for (let wy = by + 16; wy < GROUND_Y - 50; wy += 24) {
          for (let wx = bx + 12; wx < bx + bw - 14; wx += 20) {
            if ((wx + wy) % 3 !== 0) ctx.fillRect(wx, wy, 10, 12);
          }
        }
        ctx.fillStyle = '#15122b';
      }
      // Animated neon billboards
      const pulse = 0.75 + 0.25 * Math.sin(t * 0.08);
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = '#ff2e63';
      ctx.lineWidth = 3;
      ctx.strokeRect(140, 175, 140, 44);
      ctx.fillStyle = '#ff2e63';
      ctx.font = 'bold 20px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('拳皇 98', 210, 205);

      ctx.strokeStyle = '#00e5ff';
      ctx.strokeRect(665, 160, 155, 44);
      ctx.fillStyle = '#00e5ff';
      ctx.fillText('ARCADE KOF', 742, 189);
      ctx.restore();
    } else if (stage.id === 'osaka_dojo') {
      // Sunset sun disc
      const sunGrad = ctx.createRadialGradient(480, 240, 20, 480, 240, 160);
      sunGrad.addColorStop(0, '#fde047');
      sunGrad.addColorStop(0.55, '#f97316');
      sunGrad.addColorStop(1, 'rgba(249, 115, 22, 0)');
      ctx.fillStyle = sunGrad;
      ctx.beginPath();
      ctx.arc(480, 240, 160, 0, Math.PI * 2);
      ctx.fill();

      // Dojo shoji pillars
      ctx.fillStyle = '#3b1f14';
      for (let x = 60; x < STAGE_WIDTH; x += 180) {
        ctx.fillRect(x, 80, 18, GROUND_Y - 80);
      }
      ctx.fillRect(0, 80, STAGE_WIDTH, 22);
      // Hanging lantern
      const sway = Math.sin(t * 0.04) * 5;
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.ellipse(480 + sway, 138, 22, 30, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fef08a';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('武', 480 + sway, 145);
    } else {
      // Night harbor moon & ocean
      ctx.fillStyle = '#e0f2fe';
      ctx.beginPath();
      ctx.arc(760, 125, 36, 0, Math.PI * 2);
      ctx.fill();
      // Water horizon
      ctx.fillStyle = '#0c243d';
      ctx.fillRect(0, 320, STAGE_WIDTH, GROUND_Y - 320);
      ctx.fillStyle = 'rgba(125, 211, 252, 0.25)';
      for (let i = 0; i < 12; i++) {
        const rx = 700 + Math.sin(t * 0.05 + i) * 18;
        ctx.fillRect(rx, 330 + i * 11, 110 - i * 4, 3);
      }
      // Cargo cranes
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(140, 320);
      ctx.lineTo(175, 160);
      ctx.lineTo(310, 180);
      ctx.stroke();
    }

    // Floor with perspective grid lines
    const floorGrad = ctx.createLinearGradient(0, GROUND_Y - 12, 0, STAGE_HEIGHT);
    floorGrad.addColorStop(0, stage.floorTop);
    floorGrad.addColorStop(1, stage.floorBottom);
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, GROUND_Y - 12, STAGE_WIDTH, STAGE_HEIGHT - GROUND_Y + 12);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y - 12);
    ctx.lineTo(STAGE_WIDTH, GROUND_Y - 12);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    for (let i = -5; i <= 5; i++) {
      ctx.beginPath();
      ctx.moveTo(STAGE_WIDTH / 2 + i * 75, GROUND_Y - 12);
      ctx.lineTo(STAGE_WIDTH / 2 + i * 135, STAGE_HEIGHT);
      ctx.stroke();
    }
  }

  _drawSpeedlines(ctx, cx, cy, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 24; i++) {
      const ang = (Math.PI * 2 * i) / 24;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * 55, cy + Math.sin(ang) * 55);
      ctx.lineTo(cx + Math.cos(ang) * 600, cy + Math.sin(ang) * 600);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawShadow(ctx, fighter) {
    const heightRatio = Math.max(0.35, 1 - (GROUND_Y - fighter.y) / 280);
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(fighter.x, GROUND_Y + 2, 34 * heightRatio, 9 * heightRatio, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawFighter(ctx, f, frameCount) {
    const c = f.def.colors;
    const isHit = f.state === FIGHTER_STATES.HITSTUN || f.state === FIGHTER_STATES.GUARD_CRUSH;
    const isCrouch =
      f.state === FIGHTER_STATES.CROUCH ||
      (f.state === FIGHTER_STATES.ATTACK && f.currentMove?.crouch);
    const isRoll = f.state === FIGHTER_STATES.ROLL_F || f.state === FIGHTER_STATES.ROLL_B;
    const isDown = f.state === FIGHTER_STATES.KNOCKDOWN || f.state === FIGHTER_STATES.KO;

    // Roll afterimage trails
    if (isRoll) {
      ctx.save();
      ctx.globalAlpha = 0.25;
      this._drawBody(ctx, f, f.x - f.vx * 2.2, f.y, frameCount, c, isCrouch, isRoll, isDown, isHit);
      ctx.restore();
    }

    ctx.save();
    // Invincibility blink
    if (f.invincibleFrames > 0 && frameCount % 4 < 2 && !isRoll) {
      ctx.globalAlpha = 0.72;
    }
    this._drawBody(ctx, f, f.x, f.y, frameCount, c, isCrouch, isRoll, isDown, isHit);
    ctx.restore();

    // Move name callout above fighter
    if (f.lastMoveLabelTimer > 0 && f.lastMoveLabel) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, f.lastMoveLabelTimer / 15);
      ctx.font = '800 15px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#09090b';
      ctx.fillText(f.lastMoveLabel, f.x + 1, f.y - 163);
      ctx.fillStyle = c.flameCore || '#fde047';
      ctx.fillText(f.lastMoveLabel, f.x, f.y - 164);
      ctx.restore();
    }
  }

  _drawBody(ctx, f, drawX, drawY, frameCount, c, isCrouch, isRoll, isDown, isHit) {
    ctx.save();
    ctx.translate(drawX, drawY);
    ctx.scale(f.facing, 1);

    if (isDown) {
      ctx.translate(0, -18);
      ctx.rotate(-Math.PI / 2);
    } else if (isRoll) {
      ctx.translate(0, -45);
      ctx.rotate((f.stateFrame * 0.42) * (f.state === FIGHTER_STATES.ROLL_F ? 1 : -1));
      ctx.translate(0, 45);
    }

    const bob =
      f.state === FIGHTER_STATES.IDLE
        ? Math.sin(frameCount * 0.14) * 3.5
        : f.state === FIGHTER_STATES.WALK_F || f.state === FIGHTER_STATES.WALK_B
        ? Math.abs(Math.sin(frameCount * 0.24)) * 5
        : 0;

    const crouchOffset = isCrouch ? 34 : 0;
    const stride =
      f.state === FIGHTER_STATES.WALK_F || f.state === FIGHTER_STATES.WALK_B
        ? Math.sin(frameCount * 0.25) * 18
        : 0;

    const isAtk = f.state === FIGHTER_STATES.ATTACK && f.currentMove;
    const isKick =
      isAtk && ['LK', 'HK', 'CLK', 'CHK', 'JK', 'SP3'].includes(f.currentMove.id);
    const isPunch = isAtk && !isKick;
    const atkExtend = isAtk
      ? f.stateFrame >= f.currentMove.startup &&
        f.stateFrame < f.currentMove.startup + f.currentMove.active
        ? 1
        : 0.45
      : 0;

    const hipY = -58 + crouchOffset - bob;
    const shoulderY = -108 + crouchOffset - bob;
    const headY = -128 + crouchOffset - bob;

    // Back leg
    ctx.strokeStyle = c.primary;
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-8, hipY);
    ctx.lineTo(-16 - stride * 0.6, -24 + crouchOffset * 0.4);
    ctx.lineTo(-18 - stride, -4);
    ctx.stroke();

    // Front leg (extends during kicks!)
    ctx.strokeStyle = f.fighterId === 'terry' ? c.accent : c.primary;
    ctx.beginPath();
    ctx.moveTo(8, hipY);
    if (isKick) {
      const kickY = f.currentMove.crouch ? -14 : -78;
      ctx.lineTo(24 + atkExtend * 32, (hipY + kickY) / 2);
      ctx.lineTo(28 + atkExtend * 58, kickY);
    } else {
      ctx.lineTo(14 + stride * 0.6, -24 + crouchOffset * 0.4);
      ctx.lineTo(18 + stride, -4);
    }
    ctx.stroke();

    // Torso jacket / outfit
    ctx.fillStyle = isHit && frameCount % 4 < 2 ? '#ffffff' : c.primary;
    ctx.beginPath();
    ctx.roundRect(-20, shoulderY, 40, 56 - crouchOffset * 0.2, 8);
    ctx.fill();

    // Inner shirt / accent stripe
    ctx.fillStyle = c.secondary;
    ctx.fillRect(-7, shoulderY + 4, 14, 42 - crouchOffset * 0.2);

    // Belt / waist sash
    ctx.fillStyle = c.accent;
    ctx.fillRect(-20, hipY - 6, 40, 9);

    // Back arm
    ctx.strokeStyle = c.skin;
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(-14, shoulderY + 10);
    if (f.state === FIGHTER_STATES.BLOCKSTUN) {
      ctx.lineTo(12, shoulderY + 6);
    } else {
      ctx.lineTo(-22, shoulderY + 28);
      ctx.lineTo(-6, shoulderY + 22);
    }
    ctx.stroke();

    // Head
    ctx.fillStyle = c.skin;
    ctx.beginPath();
    ctx.arc(2, headY, 15, 0, Math.PI * 2);
    ctx.fill();

    // Hair / Hat per character
    ctx.fillStyle = c.hair;
    if (f.fighterId === 'terry') {
      // Blond hair + iconic red cap
      ctx.beginPath();
      ctx.arc(-6, headY + 2, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = c.band;
      ctx.beginPath();
      ctx.arc(2, headY - 5, 16, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(0, headY - 8, 25, 5); // Cap visor
    } else if (f.fighterId === 'iori') {
      // Spiky red bangs
      ctx.beginPath();
      ctx.moveTo(-14, headY - 4);
      ctx.lineTo(0, headY - 22);
      ctx.lineTo(18, headY - 8);
      ctx.lineTo(16, headY + 4);
      ctx.lineTo(4, headY - 6);
      ctx.closePath();
      ctx.fill();
    } else if (f.fighterId === 'mai') {
      // Dark hair + flowing ponytail
      ctx.beginPath();
      ctx.arc(0, headY - 4, 16, Math.PI * 0.85, Math.PI * 2.1);
      ctx.fill();
      ctx.strokeStyle = c.hair;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(-12, headY - 8);
      ctx.quadraticCurveTo(-32, headY - 2 + Math.sin(frameCount * 0.2) * 6, -38, headY + 24);
      ctx.stroke();
    } else {
      // Kyo spiky hair + white headband with fluttering tails
      ctx.beginPath();
      ctx.arc(1, headY - 5, 16, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = c.band;
      ctx.fillRect(-14, headY - 10, 31, 6);
      ctx.strokeStyle = c.band;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-14, headY - 7);
      ctx.lineTo(-30, headY - 2 + Math.sin(frameCount * 0.25) * 6);
      ctx.stroke();
    }

    // Eye
    ctx.fillStyle = '#09090b';
    ctx.fillRect(9, headY - 3, 4, 3);

    // Front attacking arm
    ctx.strokeStyle = c.skin;
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(12, shoulderY + 10);
    if (f.state === FIGHTER_STATES.BLOCKSTUN) {
      ctx.lineTo(22, shoulderY + 2);
      ctx.lineTo(18, shoulderY - 14);
    } else if (isPunch) {
      const punchY =
        f.currentMove.id === 'SP2' ? shoulderY - 48 * atkExtend : shoulderY + 10;
      const punchX = 24 + atkExtend * (f.currentMove.superMove ? 66 : 48);
      ctx.lineTo(punchX, punchY);
    } else if (f.state === FIGHTER_STATES.VICTORY) {
      ctx.lineTo(22, shoulderY - 34);
    } else {
      ctx.lineTo(24, shoulderY + 24);
      ctx.lineTo(30, shoulderY + 12);
    }
    ctx.stroke();

    // Flame aura on Special / Super attacks!
    if (isAtk && f.currentMove.flameFx && atkExtend > 0.5) {
      const fxX = isKick ? 74 : 68;
      const fxY =
        f.currentMove.id === 'SP2'
          ? shoulderY - 42
          : f.currentMove.superMove
          ? shoulderY - 10
          : shoulderY + 8;
      const r = f.currentMove.superMove ? 56 : 30;
      const grad = ctx.createRadialGradient(fxX, fxY, 4, fxX, fxY, r);
      grad.addColorStop(0, c.flameCore || '#ffffff');
      grad.addColorStop(0.5, c.flame);
      grad.addColorStop(1, 'rgba(255, 100, 0, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(fxX, fxY, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  _drawProjectile(ctx, p, frameCount) {
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.fanSpin) {
      ctx.rotate(frameCount * 0.45);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 22, -0.7, 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = p.core;
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const grad = ctx.createRadialGradient(0, 0, 4, 0, 0, p.w * 0.75);
      grad.addColorStop(0, p.core);
      grad.addColorStop(0.5, p.color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.w * 0.68, p.h * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawEffect(ctx, fx) {
    const progress = 1 - fx.life / fx.maxLife;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - progress);
    const r = fx.radius * (0.45 + progress * 0.9);
    if (fx.type === 'block') {
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const grad = ctx.createRadialGradient(fx.x, fx.y, 2, fx.x, fx.y, r);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.45, fx.color);
      grad.addColorStop(1, 'rgba(255, 80, 0, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawDebugBoxes(ctx, engine) {
    const drawBox = (box, color) => {
      if (!box) return;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color.replace('1)', '0.18)');
      ctx.lineWidth = 2;
      ctx.fillRect(box.x, box.y, box.w, box.h);
      ctx.strokeRect(box.x, box.y, box.w, box.h);
      ctx.restore();
    };
    for (const f of [engine.p1, engine.p2]) {
      drawBox(getPushbox(f), 'rgba(56, 189, 248, 1)');
      drawBox(getHurtbox(f), 'rgba(34, 197, 94, 1)');
      drawBox(getActiveHitbox(f), 'rgba(239, 68, 68, 1)');
    }
    for (const p of engine.projectiles) {
      drawBox(getProjectileBox(p), 'rgba(249, 115, 22, 1)');
    }
  }

  _drawHUD(ctx, engine) {
    const barW = 365;
    const barH = 22;
    const topY = 26;

    // P1 HP Bar (fills right-to-left from center)
    const p1X = 48;
    ctx.fillStyle = '#18181b';
    ctx.fillRect(p1X - 2, topY - 2, barW + 4, barH + 4);
    const p1DispW = (engine.p1.displayHp / engine.p1.maxHp) * barW;
    const p1HpW = (engine.p1.hp / engine.p1.maxHp) * barW;
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(p1X + (barW - p1DispW), topY, p1DispW, barH);
    const p1Grad = ctx.createLinearGradient(p1X, topY, p1X, topY + barH);
    p1Grad.addColorStop(0, '#fde047');
    p1Grad.addColorStop(1, '#22c55e');
    ctx.fillStyle = p1Grad;
    ctx.fillRect(p1X + (barW - p1HpW), topY, p1HpW, barH);

    // P2 HP Bar (fills left-to-right from center)
    const p2X = STAGE_WIDTH - 48 - barW;
    ctx.fillStyle = '#18181b';
    ctx.fillRect(p2X - 2, topY - 2, barW + 4, barH + 4);
    const p2DispW = (engine.p2.displayHp / engine.p2.maxHp) * barW;
    const p2HpW = (engine.p2.hp / engine.p2.maxHp) * barW;
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(p2X, topY, p2DispW, barH);
    const p2Grad = ctx.createLinearGradient(p2X, topY, p2X, topY + barH);
    p2Grad.addColorStop(0, '#fde047');
    p2Grad.addColorStop(1, '#22c55e');
    ctx.fillStyle = p2Grad;
    ctx.fillRect(p2X, topY, p2HpW, barH);

    // Guard gauges
    const guardW = 140;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(p1X + barW - guardW, topY + barH + 5, guardW, 6);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(
      p1X + barW - (engine.p1.guard / MAX_GUARD) * guardW,
      topY + barH + 5,
      (engine.p1.guard / MAX_GUARD) * guardW,
      6
    );

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(p2X, topY + barH + 5, guardW, 6);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(p2X, topY + barH + 5, (engine.p2.guard / MAX_GUARD) * guardW, 6);

    // Fighter names
    ctx.font = '900 16px "Inter", sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'left';
    ctx.fillText(engine.p1.def.name, p1X, topY + barH + 22);
    ctx.textAlign = 'right';
    ctx.fillText(engine.p2.def.name, p2X + barW, topY + barH + 22);

    // Team / Win indicators
    if (engine.mode === GAME_MODES.TEAM_3V3) {
      for (let i = 0; i < engine.p1Team.length; i++) {
        ctx.fillStyle =
          i < engine.p1TeamIdx
            ? '#3f3f46'
            : i === engine.p1TeamIdx
            ? '#facc15'
            : '#22c55e';
        ctx.beginPath();
        ctx.arc(p1X + 12 + i * 20, topY - 11, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = 0; i < engine.p2Team.length; i++) {
        ctx.fillStyle =
          i < engine.p2TeamIdx
            ? '#3f3f46'
            : i === engine.p2TeamIdx
            ? '#facc15'
            : '#22c55e';
        ctx.beginPath();
        ctx.arc(p2X + barW - 12 - i * 20, topY - 11, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (engine.mode !== GAME_MODES.TRAINING) {
      for (let i = 0; i < 2; i++) {
        ctx.fillStyle = i < engine.p1Wins ? '#facc15' : '#3f3f46';
        ctx.beginPath();
        ctx.arc(p1X + 12 + i * 20, topY - 11, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = i < engine.p2Wins ? '#facc15' : '#3f3f46';
        ctx.beginPath();
        ctx.arc(p2X + barW - 12 - i * 20, topY - 11, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Center Arcade Timer
    ctx.fillStyle = '#09090b';
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(STAGE_WIDTH / 2 - 34, 14, 68, 46, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fde047';
    ctx.font = '900 28px "Inter", monospace';
    ctx.textAlign = 'center';
    const timeStr =
      engine.mode === GAME_MODES.TRAINING
        ? '∞'
        : String(Math.max(0, engine.getTimeLeft())).padStart(2, '0');
    ctx.fillText(timeStr, STAGE_WIDTH / 2, 47);

    // Bottom Power Gauges (KOF MAX Stocks)
    this._drawPowerGauge(ctx, 48, STAGE_HEIGHT - 34, engine.p1, true);
    this._drawPowerGauge(ctx, STAGE_WIDTH - 48 - 220, STAGE_HEIGHT - 34, engine.p2, false);
  }

  _drawPowerGauge(ctx, x, y, fighter, isP1) {
    const w = 220;
    const h = 14;
    const stocks = Math.floor(fighter.power / POWER_PER_STOCK);
    const partial = (fighter.power % POWER_PER_STOCK) / POWER_PER_STOCK;

    ctx.fillStyle = 'rgba(9, 9, 11, 0.85)';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);

    const fillW = stocks >= 3 ? w : partial * w;
    const grad = ctx.createLinearGradient(x, y, x + w, y);
    grad.addColorStop(0, '#06b6d4');
    grad.addColorStop(1, '#a855f7');
    ctx.fillStyle = grad;
    if (isP1) {
      ctx.fillRect(x, y, fillW, h);
    } else {
      ctx.fillRect(x + (w - fillW), y, fillW, h);
    }

    // Stock badge
    ctx.font = '900 13px "Inter", sans-serif';
    ctx.fillStyle = stocks > 0 ? '#fde047' : '#94a3b8';
    ctx.textAlign = isP1 ? 'left' : 'right';
    ctx.fillText(`MAX ×${stocks}`, isP1 ? x : x + w, y - 6);
  }

  _drawAnnouncement(ctx, text, phase) {
    ctx.save();
    ctx.fillStyle = 'rgba(9, 9, 11, 0.52)';
    ctx.fillRect(0, STAGE_HEIGHT / 2 - 52, STAGE_WIDTH, 104);

    ctx.font = '900 54px "Inter", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#09090b';
    ctx.strokeText(text, STAGE_WIDTH / 2, STAGE_HEIGHT / 2 + 18);

    const grad = ctx.createLinearGradient(0, STAGE_HEIGHT / 2 - 30, 0, STAGE_HEIGHT / 2 + 25);
    grad.addColorStop(0, '#fef08a');
    grad.addColorStop(1, phase === MATCH_PHASES.KO_SLOWMO ? '#ef4444' : '#f97316');
    ctx.fillStyle = grad;
    ctx.fillText(text, STAGE_WIDTH / 2, STAGE_HEIGHT / 2 + 18);
    ctx.restore();
  }
}
