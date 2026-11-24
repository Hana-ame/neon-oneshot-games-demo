// KOF Web Arcade - Multi-Difficulty Reactive Fighting AI
import { DIFFICULTY, FIGHTER_STATES, POWER_PER_STOCK } from './constants.js';

const AI_PROFILES = {
  [DIFFICULTY.EASY]: {
    reactionRate: 0.04,
    blockChance: 0.25,
    specialChance: 0.14,
    superChance: 0.18,
    antiAirChance: 0.15,
    aggression: 0.35
  },
  [DIFFICULTY.NORMAL]: {
    reactionRate: 0.085,
    blockChance: 0.55,
    specialChance: 0.30,
    superChance: 0.42,
    antiAirChance: 0.42,
    aggression: 0.58
  },
  [DIFFICULTY.HARD]: {
    reactionRate: 0.15,
    blockChance: 0.80,
    specialChance: 0.48,
    superChance: 0.68,
    antiAirChance: 0.72,
    aggression: 0.78
  }
};

export function createEmptyInput() {
  return {
    left: false,
    right: false,
    up: false,
    down: false,
    LP: false,
    HP: false,
    LK: false,
    HK: false,
    SP: false,
    SUPER: false,
    ROLL: false
  };
}

export class FighterAI {
  constructor(difficulty = DIFFICULTY.NORMAL, rng = Math.random) {
    this.difficulty = difficulty;
    this.rng = rng;
    this.intent = 'NEUTRAL';
    this.intentTimer = 0;
  }

  setDifficulty(difficulty) {
    if (AI_PROFILES[difficulty]) {
      this.difficulty = difficulty;
    }
  }

  computeInput(self, opponent, projectiles = []) {
    const profile = AI_PROFILES[this.difficulty] || AI_PROFILES[DIFFICULTY.NORMAL];
    const input = createEmptyInput();

    if (
      self.state === FIGHTER_STATES.KO ||
      self.state === FIGHTER_STATES.VICTORY ||
      self.state === FIGHTER_STATES.KNOCKDOWN
    ) {
      return input;
    }

    const dx = opponent.x - self.x;
    const dist = Math.abs(dx);
    const towardKey = dx >= 0 ? 'right' : 'left';
    const awayKey = dx >= 0 ? 'left' : 'right';

    // Check incoming enemy projectiles
    const threatProj = projectiles.find(
      (p) => p.ownerId !== self.playerId && Math.abs(p.x - self.x) < 165
    );
    if (threatProj) {
      if (this.rng() < profile.blockChance * 0.65) {
        input[awayKey] = true;
        return input;
      }
      if (this.rng() < 0.18) {
        input[towardKey] = true;
        input.ROLL = true;
        return input;
      }
      if (this.rng() < 0.14) {
        input.up = true;
        input[towardKey] = true;
        return input;
      }
    }

    // Defensive reaction if opponent is attacking nearby
    if (opponent.state === FIGHTER_STATES.ATTACK && dist < 175) {
      if (this.rng() < profile.blockChance) {
        input[awayKey] = true;
        if (opponent.currentMove?.crouch || opponent.currentMove?.level === 'LOW') {
          input.down = true;
        }
        return input;
      }
    }

    // Anti-air reaction if opponent jumps in close
    if (opponent.state === FIGHTER_STATES.JUMP && dist < 130 && self.isGrounded()) {
      if (this.rng() < profile.antiAirChance * 0.25) {
        input.SP = true;
        input.up = true;
        return input;
      }
    }

    // Combo cancel follow-up when self just landed a cancelable normal
    if (
      self.state === FIGHTER_STATES.ATTACK &&
      self.hitConnected &&
      self.currentMove?.cancelable
    ) {
      if (self.power >= POWER_PER_STOCK && this.rng() < profile.superChance) {
        input.SUPER = true;
        return input;
      }
      if (this.rng() < profile.specialChance) {
        input.SP = true;
        return input;
      }
    }

    this.intentTimer--;
    if (this.intentTimer <= 0) {
      const r = this.rng();
      if (dist > 250) {
        this.intent = r < profile.aggression ? 'APPROACH' : 'ZONE';
      } else if (dist > 110) {
        if (r < profile.aggression * 0.65) this.intent = 'PRESSURE';
        else if (r < 0.82) this.intent = 'FOOTSIES';
        else this.intent = 'RETREAT';
      } else {
        if (r < profile.aggression * 0.8) this.intent = 'CLOSE_MIX';
        else this.intent = 'RETREAT';
      }
      this.intentTimer = 14 + Math.floor(this.rng() * 20);
    }

    // Execute intent
    if (this.intent === 'APPROACH') {
      input[towardKey] = true;
      if (dist > 220 && this.rng() < 0.025) {
        input.up = true;
      }
    } else if (this.intent === 'ZONE') {
      if (this.rng() < profile.reactionRate * 0.7) {
        input.SP = true;
      } else if (dist < 280) {
        input[awayKey] = true;
      }
    } else if (this.intent === 'FOOTSIES') {
      if (dist > 135) input[towardKey] = true;
      if (this.rng() < profile.reactionRate) {
        const roll = this.rng();
        if (roll < 0.35) input.HK = true;
        else if (roll < 0.65) input.HP = true;
        else if (roll < 0.85) {
          input.down = true;
          input.HK = true;
        } else {
          input.SP = true;
        }
      }
    } else if (this.intent === 'PRESSURE') {
      input[towardKey] = true;
      if (dist < 145 && this.rng() < profile.reactionRate * 1.4) {
        const roll = this.rng();
        if (self.power >= POWER_PER_STOCK && roll < profile.superChance * 0.35) {
          input.SUPER = true;
        } else if (roll < 0.32) {
          input.LP = true;
        } else if (roll < 0.56) {
          input.down = true;
          input.LK = true;
        } else if (roll < 0.8) {
          input.HP = true;
        } else {
          input.SP = true;
        }
      }
    } else if (this.intent === 'CLOSE_MIX') {
      if (this.rng() < profile.reactionRate * 1.7) {
        const roll = this.rng();
        if (self.power >= POWER_PER_STOCK && roll < profile.superChance * 0.4) {
          input.SUPER = true;
        } else if (roll < 0.28) {
          input.LP = true;
        } else if (roll < 0.52) {
          input.down = true;
          input.LK = true;
        } else if (roll < 0.74) {
          input.down = true;
          input.HK = true;
        } else if (roll < 0.9) {
          input.SP = true;
        } else {
          input[towardKey] = true;
          input.ROLL = true;
        }
      }
    } else if (this.intent === 'RETREAT') {
      input[awayKey] = true;
    }

    // Air attack if currently airborne and near opponent
    if (!self.isGrounded() && dist < 130 && self.vy > -3 && this.rng() < 0.25) {
      input.JK = false;
      if (this.rng() < 0.5) input.HP = true;
      else input.HK = true;
    }

    return input;
  }
}
