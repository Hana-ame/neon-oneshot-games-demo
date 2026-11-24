// KOF Web Arcade - Core 60FPS Deterministic Fighting Game Engine
import {
  FIXED_FPS,
  GROUND_Y,
  GRAVITY,
  JUMP_VEL_Y,
  SHORT_HOP_VEL_Y,
  ROUND_TIME_SECONDS,
  MAX_GUARD,
  MAX_POWER,
  POWER_PER_STOCK,
  TEAM_WIN_HEAL,
  GAME_MODES,
  FIGHTER_STATES,
  HIT_LEVELS,
  MOTION_TYPES,
  MATCH_PHASES,
  STAGE_LEFT,
  STAGE_RIGHT
} from './constants.js';
import { FIGHTERS } from './fighters.js';
import { InputBuffer, getNumpadDirection } from './inputBuffer.js';
import {
  rectsOverlap,
  getHurtbox,
  getActiveHitbox,
  getProjectileBox,
  clampToStage,
  resolvePushboxes,
  updateAutoFacing
} from './physics.js';
import { createEmptyInput } from './ai.js';

export function getComboDamageScale(comboCount) {
  if (comboCount <= 1) return 1.0;
  if (comboCount === 2) return 0.85;
  if (comboCount === 3) return 0.72;
  if (comboCount === 4) return 0.62;
  return 0.5;
}

export class FighterInstance {
  constructor(playerId, fighterId, startX, facing) {
    this.playerId = playerId;
    this.loadCharacter(fighterId, startX, facing);
  }

  loadCharacter(fighterId, startX, facing, keepPower = false, carryHp = null) {
    const def = FIGHTERS[fighterId] || FIGHTERS.kyo;
    this.fighterId = def.id;
    this.def = def;
    this.maxHp = def.maxHp;
    this.hp = carryHp !== null ? Math.min(this.maxHp, Math.max(1, carryHp)) : this.maxHp;
    this.displayHp = this.hp;
    this.guard = MAX_GUARD;
    this.power = keepPower ? this.power : 0;

    this.x = startX;
    this.y = GROUND_Y;
    this.vx = 0;
    this.vy = 0;
    this.facing = facing;

    this.state = FIGHTER_STATES.IDLE;
    this.stateFrame = 0;
    this.stunFrames = 0;
    this.invincibleFrames = 0;

    this.currentMove = null;
    this.hitConnected = false;
    this.projectileSpawned = false;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.lastMoveLabel = '';
    this.lastMoveLabelTimer = 0;

    this.inputBuffer = new InputBuffer(24);
    this.prevButtons = {
      LP: false,
      HP: false,
      LK: false,
      HK: false,
      SP: false,
      SUPER: false,
      ROLL: false
    };
  }

  isGrounded() {
    return this.y >= GROUND_Y - 0.5;
  }

  canAct() {
    return (
      this.state === FIGHTER_STATES.IDLE ||
      this.state === FIGHTER_STATES.WALK_F ||
      this.state === FIGHTER_STATES.WALK_B ||
      this.state === FIGHTER_STATES.CROUCH
    );
  }

  isInvincible() {
    if (this.invincibleFrames > 0) return true;
    if (this.state === FIGHTER_STATES.WAKEUP) return true;
    if (
      (this.state === FIGHTER_STATES.ROLL_F || this.state === FIGHTER_STATES.ROLL_B) &&
      this.stateFrame < 18
    ) {
      return true;
    }
    return false;
  }

  addPower(amount) {
    this.power = Math.max(0, Math.min(MAX_POWER, this.power + amount));
  }

  setState(nextState) {
    this.state = nextState;
    this.stateFrame = 0;
    if (nextState !== FIGHTER_STATES.ATTACK) {
      this.currentMove = null;
      this.hitConnected = false;
      this.projectileSpawned = false;
    }
  }
}

export class MatchEngine {
  constructor(options = {}) {
    this.mode = options.mode || GAME_MODES.TEAM_3V3;
    this.stageIndex = options.stageIndex || 0;
    this.audio = options.audio || null;
    this.p1Team = options.p1Team || ['kyo', 'iori', 'terry'];
    this.p2Team = options.p2Team || ['iori', 'mai', 'kyo'];
    this.p1TeamIdx = 0;
    this.p2TeamIdx = 0;

    this.p1Wins = 0;
    this.p2Wins = 0;
    this.roundNumber = 1;

    this.frameCount = 0;
    this.timerFrames = ROUND_TIME_SECONDS * FIXED_FPS;
    this.phase = MATCH_PHASES.INTRO;
    this.phaseTimer = 75;
    this.hitstopFrames = 0;
    this.superFlashFrames = 0;
    this.superFlashOwner = null;
    this.screenShake = 0;
    this.announcement = 'ROUND 1';
    this.winnerId = null;

    this.projectiles = [];
    this.effects = [];
    this.floatingTexts = [];

    this.trainingInfiniteHp = this.mode === GAME_MODES.TRAINING;
    this.trainingInfinitePower = this.mode === GAME_MODES.TRAINING;

    this.p1 = new FighterInstance(1, this.p1Team[0], 260, 1);
    this.p2 = new FighterInstance(2, this.p2Team[0], 700, -1);
  }

  getTimeLeft() {
    return Math.ceil(this.timerFrames / FIXED_FPS);
  }

  resetRound(carryWinner = null) {
    this.projectiles = [];
    this.effects = [];
    this.floatingTexts = [];
    this.timerFrames = ROUND_TIME_SECONDS * FIXED_FPS;
    this.phase = MATCH_PHASES.INTRO;
    this.phaseTimer = 75;
    this.hitstopFrames = 0;
    this.superFlashFrames = 0;
    this.screenShake = 0;

    const p1CarryHp =
      this.mode === GAME_MODES.TEAM_3V3 && carryWinner === 1
        ? Math.min(this.p1.maxHp, this.p1.hp + TEAM_WIN_HEAL)
        : null;
    const p2CarryHp =
      this.mode === GAME_MODES.TEAM_3V3 && carryWinner === 2
        ? Math.min(this.p2.maxHp, this.p2.hp + TEAM_WIN_HEAL)
        : null;

    this.p1.loadCharacter(this.p1Team[this.p1TeamIdx], 260, 1, true, p1CarryHp);
    this.p2.loadCharacter(this.p2Team[this.p2TeamIdx], 700, -1, true, p2CarryHp);

    this.announcement =
      this.mode === GAME_MODES.TRAINING ? 'TRAINING' : `ROUND ${this.roundNumber}`;
    if (this.audio) this.audio.playRoundStart();
  }

  _justPressed(fighter, input, key) {
    return !!input[key] && !fighter.prevButtons[key];
  }

  _syncPrevButtons(fighter, input) {
    for (const k of Object.keys(fighter.prevButtons)) {
      fighter.prevButtons[k] = !!input[k];
    }
  }

  _spawnEffect(type, x, y, color = '#ffbe3b', extra = {}) {
    this.effects.push({
      type,
      x,
      y,
      color,
      life: extra.life || 16,
      maxLife: extra.life || 16,
      radius: extra.radius || 28,
      ...extra
    });
  }

  _spawnText(text, x, y, color = '#fff') {
    this.floatingTexts.push({
      text,
      x,
      y,
      color,
      life: 40,
      maxLife: 40
    });
  }

  _tryStartMove(fighter, move) {
    if (!move) return false;
    if (move.meterCost && fighter.power < move.meterCost) return false;
    if (move.meterCost) {
      fighter.power -= move.meterCost;
    }

    fighter.setState(FIGHTER_STATES.ATTACK);
    fighter.currentMove = move;
    fighter.hitConnected = false;
    fighter.projectileSpawned = false;
    fighter.invincibleFrames = move.invincibleFrames || 0;

    if (move.velX) {
      fighter.vx = move.velX * fighter.facing;
    } else if (fighter.isGrounded()) {
      fighter.vx = 0;
    }
    if (move.velY) {
      fighter.vy = move.velY;
    }

    if (move.superMove) {
      this.superFlashFrames = 24;
      this.superFlashOwner = fighter.playerId;
      fighter.lastMoveLabel = move.name;
      fighter.lastMoveLabelTimer = 70;
      this._spawnEffect('super_burst', fighter.x, fighter.y - 84, fighter.def.colors.flame, {
        life: 24,
        radius: 90
      });
      if (this.audio) this.audio.playSuperFlash();
    } else if (move.special) {
      fighter.lastMoveLabel = move.name;
      fighter.lastMoveLabelTimer = 50;
      if (this.audio) this.audio.playSpecial();
    } else {
      if (this.audio) this.audio.playWhiff();
    }
    return true;
  }

  _selectMoveFromInput(fighter, input) {
    const moves = fighter.def.moves;
    const jpLP = this._justPressed(fighter, input, 'LP');
    const jpHP = this._justPressed(fighter, input, 'HP');
    const jpLK = this._justPressed(fighter, input, 'LK');
    const jpHK = this._justPressed(fighter, input, 'HK');
    const jpSP = this._justPressed(fighter, input, 'SP');
    const jpSUPER = this._justPressed(fighter, input, 'SUPER');

    const anyPunch = jpLP || jpHP;
    const anyKick = jpLK || jpHK;

    // 1. Direct Super shortcut button (for web/mobile accessibility)
    if (jpSUPER && fighter.isGrounded() && fighter.power >= POWER_PER_STOCK) {
      return moves.SUPER;
    }

    // 2. Classic KOF command motion recognition from input buffer
    if (fighter.isGrounded() && (anyPunch || anyKick)) {
      const motion = fighter.inputBuffer.detectMotion(this.frameCount);
      if (motion === MOTION_TYPES.SUPER_QCF2 && fighter.power >= POWER_PER_STOCK) {
        return moves.SUPER;
      }
      if (motion) {
        for (const key of ['SP2', 'SP1', 'SP3']) {
          const sp = moves[key];
          if (!sp || sp.motion !== motion) continue;
          const btnMatch =
            (jpLP && sp.buttons.includes('LP')) ||
            (jpHP && sp.buttons.includes('HP')) ||
            (jpLK && sp.buttons.includes('LK')) ||
            (jpHK && sp.buttons.includes('HK'));
          if (btnMatch) return sp;
        }
      }
    }

    // 3. Special shortcut button (direction chooses SP1 / SP2 / SP3)
    if (jpSP && fighter.isGrounded()) {
      const dir = getNumpadDirection(input, fighter.facing);
      if (dir === 8 || dir === 9 || dir === 7) return moves.SP2;
      if (dir === 4 || dir === 1) return moves.SP3;
      return moves.SP1;
    }

    // 4. Air normals
    if (!fighter.isGrounded()) {
      if (anyPunch) return moves.JP;
      if (anyKick) return moves.JK;
      return null;
    }

    // 5. Crouching normals
    if (input.down) {
      if (jpLP || jpHP) return moves.CLP;
      if (jpHK) return moves.CHK;
      if (jpLK) return moves.CLK;
      return null;
    }

    // 6. Standing normals
    if (jpHP) return moves.HP;
    if (jpLP) return moves.LP;
    if (jpHK) return moves.HK;
    if (jpLK) return moves.LK;

    return null;
  }

  _updateFighter(fighter, opponent, input) {
    // Record directional input into numpad ring buffer
    const dir = getNumpadDirection(input, fighter.facing);
    fighter.inputBuffer.push(dir, this.frameCount);

    // Smooth delayed red damage bar
    if (fighter.displayHp > fighter.hp) {
      fighter.displayHp = Math.max(fighter.hp, fighter.displayHp - 5.5);
    } else {
      fighter.displayHp = fighter.hp;
    }

    // Passive guard regeneration when not blocking/crushed
    if (
      fighter.state !== FIGHTER_STATES.BLOCKSTUN &&
      fighter.state !== FIGHTER_STATES.GUARD_CRUSH &&
      fighter.guard < MAX_GUARD
    ) {
      fighter.guard = Math.min(MAX_GUARD, fighter.guard + 0.14);
    }

    if (fighter.invincibleFrames > 0) fighter.invincibleFrames--;
    if (fighter.lastMoveLabelTimer > 0) fighter.lastMoveLabelTimer--;
    if (fighter.comboTimer > 0) {
      fighter.comboTimer--;
      if (fighter.comboTimer === 0) fighter.comboCount = 0;
    }

    fighter.stateFrame++;

    // Handle KO / Victory
    if (fighter.state === FIGHTER_STATES.KO || fighter.state === FIGHTER_STATES.VICTORY) {
      fighter.vx *= 0.85;
      fighter.x += fighter.vx;
      if (!fighter.isGrounded() || fighter.vy < 0) {
        fighter.vy += GRAVITY;
        fighter.y += fighter.vy;
      }
      clampToStage(fighter);
      this._syncPrevButtons(fighter, input);
      return;
    }

    // Handle Hitstun / Blockstun / Guard Crush
    if (
      fighter.state === FIGHTER_STATES.HITSTUN ||
      fighter.state === FIGHTER_STATES.BLOCKSTUN ||
      fighter.state === FIGHTER_STATES.GUARD_CRUSH
    ) {
      fighter.stunFrames--;
      fighter.vx *= 0.82;
      fighter.x += fighter.vx;
      if (!fighter.isGrounded() || fighter.vy < 0) {
        fighter.vy += GRAVITY;
        fighter.y += fighter.vy;
      }
      clampToStage(fighter);
      if (fighter.stunFrames <= 0) {
        fighter.setState(fighter.isGrounded() ? FIGHTER_STATES.IDLE : FIGHTER_STATES.JUMP);
      }
      this._syncPrevButtons(fighter, input);
      return;
    }

    // Handle Knockdown & Wakeup
    if (fighter.state === FIGHTER_STATES.KNOCKDOWN) {
      fighter.vx *= 0.88;
      fighter.x += fighter.vx;
      if (!fighter.isGrounded() || fighter.vy < 0) {
        fighter.vy += GRAVITY;
        fighter.y += fighter.vy;
      }
      clampToStage(fighter);
      if (fighter.isGrounded() && fighter.stateFrame >= 36) {
        fighter.setState(FIGHTER_STATES.WAKEUP);
        fighter.invincibleFrames = 14;
      }
      this._syncPrevButtons(fighter, input);
      return;
    }

    if (fighter.state === FIGHTER_STATES.WAKEUP) {
      fighter.vx = 0;
      if (fighter.stateFrame >= 12) {
        fighter.setState(FIGHTER_STATES.IDLE);
      }
      this._syncPrevButtons(fighter, input);
      return;
    }

    // Handle Emergency Evasion Roll (KOF signature mechanic)
    if (
      fighter.state === FIGHTER_STATES.ROLL_F ||
      fighter.state === FIGHTER_STATES.ROLL_B
    ) {
      const rollDir = fighter.state === FIGHTER_STATES.ROLL_F ? fighter.facing : -fighter.facing;
      fighter.vx = fighter.stateFrame < 19 ? rollDir * 8.4 : 0;
      fighter.x += fighter.vx;
      clampToStage(fighter);
      if (fighter.stateFrame >= 24) {
        fighter.setState(FIGHTER_STATES.IDLE);
      }
      this._syncPrevButtons(fighter, input);
      return;
    }

    // Handle active Attack state (including Special/Super Cancel window!)
    if (fighter.state === FIGHTER_STATES.ATTACK && fighter.currentMove) {
      const m = fighter.currentMove;

      // Special / Super Cancel on hit
      if (fighter.hitConnected && m.cancelable && fighter.isGrounded()) {
        const cancelMove = this._selectMoveFromInput(fighter, input);
        if (cancelMove && (cancelMove.special || cancelMove.superMove)) {
          this._tryStartMove(fighter, cancelMove);
          this._syncPrevButtons(fighter, input);
          return;
        }
      }

      // Spawn projectile on first active frame
      if (m.projectile && !fighter.projectileSpawned && fighter.stateFrame >= m.startup) {
        fighter.projectileSpawned = true;
        this.projectiles.push({
          ownerId: fighter.playerId,
          x: fighter.x + fighter.facing * 56,
          y: fighter.y + m.projectile.offsetY,
          vx: m.projectile.speed * fighter.facing,
          w: m.projectile.w,
          h: m.projectile.h,
          move: m,
          color: m.projectile.color,
          core: m.projectile.core,
          groundWave: !!m.projectile.groundWave,
          fanSpin: !!m.projectile.fanSpin,
          life: 110
        });
      }

      // Apply attack physics
      fighter.x += fighter.vx;
      if (fighter.isGrounded()) {
        fighter.vx *= 0.86;
      }
      if (!fighter.isGrounded() || fighter.vy < 0) {
        fighter.vy += GRAVITY;
        fighter.y += fighter.vy;
      }
      clampToStage(fighter);

      // Landing cancels air normal
      if (m.air && fighter.isGrounded() && fighter.stateFrame > 2) {
        fighter.setState(FIGHTER_STATES.IDLE);
        fighter.vx = 0;
        this._syncPrevButtons(fighter, input);
        return;
      }

      const totalFrames = m.startup + m.active + m.recovery;
      if (fighter.stateFrame >= totalFrames) {
        fighter.setState(fighter.isGrounded() ? FIGHTER_STATES.IDLE : FIGHTER_STATES.JUMP);
        fighter.vx = 0;
      }
      this._syncPrevButtons(fighter, input);
      return;
    }

    // Airborne neutral state
    if (fighter.state === FIGHTER_STATES.JUMP) {
      const airMove = this._selectMoveFromInput(fighter, input);
      if (airMove) {
        this._tryStartMove(fighter, airMove);
        this._syncPrevButtons(fighter, input);
        return;
      }

      fighter.x += fighter.vx;
      fighter.vy += GRAVITY;
      fighter.y += fighter.vy;
      clampToStage(fighter);

      if (fighter.isGrounded()) {
        fighter.setState(FIGHTER_STATES.IDLE);
        fighter.vx = 0;
      }
      this._syncPrevButtons(fighter, input);
      return;
    }

    // Grounded actionable states (IDLE, WALK_F, WALK_B, CROUCH)
    if (this.phase === MATCH_PHASES.FIGHT && fighter.canAct()) {
      // 1. Check Roll (Shift / ROLL button or LP+LK simultaneously)
      const jpRoll =
        this._justPressed(fighter, input, 'ROLL') ||
        (this._justPressed(fighter, input, 'LP') && input.LK) ||
        (this._justPressed(fighter, input, 'LK') && input.LP);
      if (jpRoll) {
        const backward = fighter.facing === 1 ? input.left : input.right;
        fighter.setState(backward ? FIGHTER_STATES.ROLL_B : FIGHTER_STATES.ROLL_F);
        fighter.invincibleFrames = 18;
        this._syncPrevButtons(fighter, input);
        return;
      }

      // 2. Check Attacks (Super > Special > Normals)
      const move = this._selectMoveFromInput(fighter, input);
      if (move) {
        this._tryStartMove(fighter, move);
        this._syncPrevButtons(fighter, input);
        return;
      }

      // 3. Check Jump / Short Hop
      if (input.up) {
        fighter.setState(FIGHTER_STATES.JUMP);
        fighter.vy = input.down ? SHORT_HOP_VEL_Y : JUMP_VEL_Y;
        const forward = fighter.facing === 1 ? input.right : input.left;
        const backward = fighter.facing === 1 ? input.left : input.right;
        fighter.vx = forward
          ? fighter.def.jumpSpeedX * fighter.facing
          : backward
          ? -fighter.def.jumpSpeedX * 0.85 * fighter.facing
          : 0;
        this._syncPrevButtons(fighter, input);
        return;
      }

      // 4. Crouch / Walk / Idle
      if (input.down) {
        fighter.state = FIGHTER_STATES.CROUCH;
        fighter.vx = 0;
      } else {
        const forward = fighter.facing === 1 ? input.right : input.left;
        const backward = fighter.facing === 1 ? input.left : input.right;
        if (forward && !backward) {
          fighter.state = FIGHTER_STATES.WALK_F;
          fighter.vx = fighter.def.walkSpeed * fighter.facing;
        } else if (backward && !forward) {
          fighter.state = FIGHTER_STATES.WALK_B;
          fighter.vx = -fighter.def.backSpeed * fighter.facing;
        } else {
          fighter.state = FIGHTER_STATES.IDLE;
          fighter.vx = 0;
        }
      }

      fighter.x += fighter.vx;
      clampToStage(fighter);
    }

    this._syncPrevButtons(fighter, input);
  }

  _canBlock(defender, defenderInput, move) {
    if (!defender.isGrounded()) return false;
    if (
      !defender.canAct() &&
      defender.state !== FIGHTER_STATES.BLOCKSTUN
    ) {
      return false;
    }
    const holdingBack =
      defender.facing === 1 ? !!defenderInput.left : !!defenderInput.right;
    if (!holdingBack) return false;

    const crouching = !!defenderInput.down;
    if (move.level === HIT_LEVELS.LOW && !crouching) return false;
    if (move.level === HIT_LEVELS.MID && crouching) return false;
    return true;
  }

  _applyHit(attacker, defender, defenderInput, move, impactX, impactY) {
    if (defender.isInvincible()) return false;

    const blocked = this._canBlock(defender, defenderInput, move);

    if (blocked) {
      const chipDmg = move.chip || 0;
      if (chipDmg > 0) {
        defender.hp = Math.max(0, defender.hp - chipDmg);
      }
      defender.guard = Math.max(0, defender.guard - (move.guardDamage || 10));
      attacker.addPower(Math.ceil((move.meterGain || 6) * 0.5));
      defender.addPower(5);

      this.hitstopFrames = Math.max(this.hitstopFrames, Math.max(3, (move.hitstop || 6) - 2));
      defender.vx = (move.pushback || 8) * 0.7 * attacker.facing;

      if (defender.guard <= 0) {
        // KOF Guard Crush!
        defender.guard = MAX_GUARD;
        defender.setState(FIGHTER_STATES.GUARD_CRUSH);
        defender.stunFrames = 38;
        this.screenShake = 10;
        this._spawnEffect('guard_crush', impactX, impactY, '#ef4444', { life: 22, radius: 52 });
        this._spawnText('GUARD CRUSH!', defender.x, defender.y - 155, '#f87171');
        if (this.audio) this.audio.playGuardCrush();
      } else {
        defender.setState(FIGHTER_STATES.BLOCKSTUN);
        defender.stunFrames = move.blockstun || 11;
        this._spawnEffect('block', impactX, impactY, '#38bdf8', { life: 12, radius: 26 });
        if (this.audio) this.audio.playBlock();
      }
      return true;
    }

    // Clean Hit!
    attacker.comboCount++;
    attacker.comboTimer = 55;
    const scale = getComboDamageScale(attacker.comboCount);
    const finalDamage = Math.max(1, Math.round((move.damage || 50) * scale));

    defender.hp = Math.max(0, defender.hp - finalDamage);
    attacker.addPower(move.meterGain || 10);
    defender.addPower(Math.ceil((move.meterGain || 10) * 0.65));

    this.hitstopFrames = Math.max(this.hitstopFrames, move.hitstop || 7);
    this.screenShake = move.superMove ? 14 : move.special ? 8 : move.damage >= 90 ? 5 : 2;

    if (defender.hp <= 0) {
      defender.setState(FIGHTER_STATES.KO);
      defender.vx = 9.5 * attacker.facing;
      defender.vy = -10.5;
      this._triggerKO(attacker.playerId);
    } else if (move.knockdown || !defender.isGrounded()) {
      defender.setState(FIGHTER_STATES.KNOCKDOWN);
      defender.vx = (move.pushback || 10) * 0.72 * attacker.facing;
      defender.vy = -9.5;
    } else {
      defender.setState(FIGHTER_STATES.HITSTUN);
      defender.stunFrames = move.hitstun || 16;
      defender.vx = (move.pushback || 8) * attacker.facing;
    }

    const heavy = move.superMove || move.special || move.damage >= 90;
    this._spawnEffect(
      move.flameFx ? 'flame_hit' : 'hit',
      impactX,
      impactY,
      move.flameFx ? attacker.def.colors.flame : '#fbbf24',
      { life: heavy ? 18 : 12, radius: heavy ? 44 : 26 }
    );
    if (attacker.comboCount >= 2) {
      this._spawnText(`${attacker.comboCount} HITS!`, defender.x, defender.y - 160, '#fde047');
    }
    if (this.audio) this.audio.playHit(heavy);
    return true;
  }

  _checkCombatCollisions(input1, input2) {
    // 1. Melee hitbox checks
    const pairs = [
      [this.p1, this.p2, input2],
      [this.p2, this.p1, input1]
    ];
    for (const [atk, def, defInput] of pairs) {
      if (atk.hitConnected || !atk.currentMove) continue;
      // Projectile moves deal damage via projectile unless opponent is point-blank
      const hb = getActiveHitbox(atk);
      const hurt = getHurtbox(def);
      if (hb && rectsOverlap(hb, hurt)) {
        atk.hitConnected = true;
        const ix = (Math.max(hb.x, hurt.x) + Math.min(hb.x + hb.w, hurt.x + hurt.w)) / 2;
        const iy = (Math.max(hb.y, hurt.y) + Math.min(hb.y + hb.h, hurt.y + hurt.h)) / 2;
        this._applyHit(atk, def, defInput, atk.currentMove, ix, iy);
      }
    }

    // 2. Projectile updates & clash/hit detection
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.x += p.vx;
      p.life--;
      if (p.life <= 0 || p.x < STAGE_LEFT - 80 || p.x > STAGE_RIGHT + 80) {
        this.projectiles.splice(i, 1);
        continue;
      }

      // Projectile vs Projectile clash
      let clashed = false;
      for (let j = i - 1; j >= 0; j--) {
        const other = this.projectiles[j];
        if (other.ownerId === p.ownerId) continue;
        if (rectsOverlap(getProjectileBox(p), getProjectileBox(other))) {
          this._spawnEffect('block', (p.x + other.x) / 2, (p.y + other.y) / 2, '#f8fafc', {
            life: 16,
            radius: 36
          });
          this.projectiles.splice(i, 1);
          this.projectiles.splice(j, 1);
          i--;
          clashed = true;
          break;
        }
      }
      if (clashed) continue;

      // Projectile vs Opponent hurtbox
      const atk = p.ownerId === 1 ? this.p1 : this.p2;
      const def = p.ownerId === 1 ? this.p2 : this.p1;
      const defInput = p.ownerId === 1 ? input2 : input1;
      if (rectsOverlap(getProjectileBox(p), getHurtbox(def))) {
        const connected = this._applyHit(atk, def, defInput, p.move, p.x, p.y);
        if (connected) {
          this.projectiles.splice(i, 1);
        }
      }
    }
  }

  _triggerKO(winnerPlayerId) {
    if (this.phase !== MATCH_PHASES.FIGHT) return;
    if (this.mode === GAME_MODES.TRAINING) {
      this.p1.hp = this.p1.maxHp;
      this.p2.hp = this.p2.maxHp;
      this.p1.setState(FIGHTER_STATES.IDLE);
      this.p2.setState(FIGHTER_STATES.IDLE);
      return;
    }
    this.phase = MATCH_PHASES.KO_SLOWMO;
    this.phaseTimer = 64;
    this.announcement = 'K.O.!';
    this.winnerId = winnerPlayerId;
    if (this.audio) this.audio.playKO();
  }

  _resolveRoundEnd() {
    const winner = this.winnerId;
    if (winner === 1) this.p1Wins++;
    else if (winner === 2) this.p2Wins++;

    if (this.mode === GAME_MODES.TEAM_3V3) {
      if (winner === 1) {
        this.p2TeamIdx++;
        if (this.p2TeamIdx >= this.p2Team.length) {
          this.phase = MATCH_PHASES.MATCH_OVER;
          this.announcement = 'PLAYER 1 TEAM WINS!';
          return;
        }
      } else if (winner === 2) {
        this.p1TeamIdx++;
        if (this.p1TeamIdx >= this.p1Team.length) {
          this.phase = MATCH_PHASES.MATCH_OVER;
          this.announcement = 'PLAYER 2 TEAM WINS!';
          return;
        }
      } else {
        // Double KO / Draw
        this.p1TeamIdx++;
        this.p2TeamIdx++;
        if (this.p1TeamIdx >= this.p1Team.length || this.p2TeamIdx >= this.p2Team.length) {
          this.phase = MATCH_PHASES.MATCH_OVER;
          this.announcement = 'DRAW GAME';
          return;
        }
      }
      this.roundNumber++;
      this.resetRound(winner);
      return;
    }

    // 1v1 Best of 3 (first to 2 wins)
    if (this.p1Wins >= 2) {
      this.phase = MATCH_PHASES.MATCH_OVER;
      this.announcement = `${this.p1.def.name} WINS!`;
      return;
    }
    if (this.p2Wins >= 2) {
      this.phase = MATCH_PHASES.MATCH_OVER;
      this.announcement = `${this.p2.def.name} WINS!`;
      return;
    }
    this.roundNumber++;
    this.resetRound(null);
  }

  step(input1 = createEmptyInput(), input2 = createEmptyInput()) {
    this.frameCount++;

    // Decay screen shake & visual effects
    if (this.screenShake > 0) this.screenShake = Math.max(0, this.screenShake - 0.8);
    for (let i = this.effects.length - 1; i >= 0; i--) {
      this.effects[i].life--;
      if (this.effects[i].life <= 0) this.effects.splice(i, 1);
    }
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      this.floatingTexts[i].life--;
      this.floatingTexts[i].y -= 0.7;
      if (this.floatingTexts[i].life <= 0) this.floatingTexts.splice(i, 1);
    }

    // Super flash freeze
    if (this.superFlashFrames > 0) {
      this.superFlashFrames--;
      return;
    }

    // Hitstop impact freeze
    if (this.hitstopFrames > 0) {
      this.hitstopFrames--;
      return;
    }

    // Phase state machine
    if (this.phase === MATCH_PHASES.INTRO) {
      this.phaseTimer--;
      if (this.phaseTimer === 28) {
        this.announcement = this.mode === GAME_MODES.TRAINING ? 'PRACTICE' : 'GO!';
      }
      if (this.phaseTimer <= 0) {
        this.phase = MATCH_PHASES.FIGHT;
        this.announcement = '';
      }
      return;
    }

    if (this.phase === MATCH_PHASES.KO_SLOWMO) {
      this.phaseTimer--;
      // Slow-motion update every 3rd frame
      if (this.phaseTimer % 3 === 0) {
        this._updateFighter(this.p1, this.p2, createEmptyInput());
        this._updateFighter(this.p2, this.p1, createEmptyInput());
      }
      if (this.phaseTimer <= 0) {
        this.phase = MATCH_PHASES.ROUND_END;
        this.phaseTimer = 70;
        if (this.winnerId === 1) {
          this.p1.setState(FIGHTER_STATES.VICTORY);
          this.announcement = `${this.p1.def.name} WIN`;
        } else if (this.winnerId === 2) {
          this.p2.setState(FIGHTER_STATES.VICTORY);
          this.announcement = `${this.p2.def.name} WIN`;
        } else {
          this.announcement = 'DRAW';
        }
      }
      return;
    }

    if (this.phase === MATCH_PHASES.ROUND_END) {
      this.phaseTimer--;
      if (this.phaseTimer <= 0) {
        this._resolveRoundEnd();
      }
      return;
    }

    if (this.phase === MATCH_PHASES.MATCH_OVER) {
      return;
    }

    // Active FIGHT phase
    if (this.mode !== GAME_MODES.TRAINING) {
      if (this.timerFrames > 0) {
        this.timerFrames--;
        if (this.timerFrames === 0) {
          // Timeout resolution
          const r1 = this.p1.hp / this.p1.maxHp;
          const r2 = this.p2.hp / this.p2.maxHp;
          this.winnerId = r1 > r2 ? 1 : r2 > r1 ? 2 : 0;
          this.phase = MATCH_PHASES.ROUND_END;
          this.phaseTimer = 80;
          this.announcement = 'TIME OVER';
          return;
        }
      }
    } else {
      // Training mode auto-refill
      if (this.trainingInfiniteHp && this.p2.state === FIGHTER_STATES.IDLE && this.p2.hp < this.p2.maxHp) {
        this.p2.hp = Math.min(this.p2.maxHp, this.p2.hp + 12);
      }
      if (this.trainingInfiniteHp && this.p1.state === FIGHTER_STATES.IDLE && this.p1.hp < this.p1.maxHp) {
        this.p1.hp = Math.min(this.p1.maxHp, this.p1.hp + 12);
      }
      if (this.trainingInfinitePower) {
        this.p1.power = MAX_POWER;
        this.p2.power = MAX_POWER;
      }
    }

    // Update fighters, pushboxes, auto-facing, and combat collisions
    this._updateFighter(this.p1, this.p2, input1);
    this._updateFighter(this.p2, this.p1, input2);
    resolvePushboxes(this.p1, this.p2);
    updateAutoFacing(this.p1, this.p2);
    this._checkCombatCollisions(input1, input2);
  }
}
