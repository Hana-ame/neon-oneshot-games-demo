import { MATCH_CONFIG, PLAYER_CONFIG, WEAPONS } from './constants.js';

export class EconomySystem {
  constructor() {
    this.lossStreak = { CT: 0, T: 0 };
  }

  reset() {
    this.lossStreak = { CT: 0, T: 0 };
  }

  addMoney(combatant, amount) {
    combatant.money = Math.min(MATCH_CONFIG.MAX_MONEY, Math.max(0, combatant.money + amount));
  }

  awardKill(killer, weaponId) {
    const spec = WEAPONS[weaponId];
    const reward = spec ? spec.killReward : 300;
    this.addMoney(killer, reward);
    return reward;
  }

  awardRoundEnd(combatants, winnerTeam, reason) {
    const loserTeam = winnerTeam === 'CT' ? 'T' : 'CT';
    this.lossStreak[winnerTeam] = Math.max(0, this.lossStreak[winnerTeam] - 1);
    this.lossStreak[loserTeam] = Math.min(MATCH_CONFIG.MAX_LOSS_STREAK, this.lossStreak[loserTeam] + 1);

    const winReward = (reason === 'BOMB_EXPLODED' || reason === 'BOMB_DEFUSED')
      ? MATCH_CONFIG.WIN_REWARD_BOMB
      : MATCH_CONFIG.WIN_REWARD_ELIM;
    const lossReward = MATCH_CONFIG.LOSS_BASE_REWARD + (this.lossStreak[loserTeam] - 1) * MATCH_CONFIG.LOSS_STREAK_STEP;

    for (const c of combatants) {
      if (c.team === winnerTeam) {
        this.addMoney(c, winReward);
      } else {
        this.addMoney(c, lossReward);
      }
    }
    return { winReward, lossReward };
  }

  buyItem(combatant, itemId, inBuyPhase = true, inBuyZone = true) {
    if (!combatant.alive) return { ok: false, reason: 'DEAD' };
    if (!inBuyPhase) return { ok: false, reason: 'BUY_TIME_EXPIRED' };
    if (!inBuyZone) return { ok: false, reason: 'NOT_IN_BUY_ZONE' };

    if (itemId === 'kevlar') {
      if (combatant.armor >= PLAYER_CONFIG.MAX_ARMOR) return { ok: false, reason: 'ALREADY_OWNED' };
      if (combatant.money < PLAYER_CONFIG.KEVLAR_COST) return { ok: false, reason: 'INSUFFICIENT_FUNDS' };
      combatant.money -= PLAYER_CONFIG.KEVLAR_COST;
      combatant.armor = PLAYER_CONFIG.MAX_ARMOR;
      return { ok: true, item: 'Kevlar Vest' };
    }

    if (itemId === 'helmet') {
      if (combatant.armor >= PLAYER_CONFIG.MAX_ARMOR && combatant.hasHelmet) {
        return { ok: false, reason: 'ALREADY_OWNED' };
      }
      const cost = combatant.armor >= 100 ? 350 : PLAYER_CONFIG.HELMET_COST;
      if (combatant.money < cost) return { ok: false, reason: 'INSUFFICIENT_FUNDS' };
      combatant.money -= cost;
      combatant.armor = PLAYER_CONFIG.MAX_ARMOR;
      combatant.hasHelmet = true;
      return { ok: true, item: 'Kevlar + Helmet' };
    }

    if (itemId === 'defuse_kit') {
      if (combatant.team !== 'CT') return { ok: false, reason: 'WRONG_TEAM' };
      if (combatant.hasDefuseKit) return { ok: false, reason: 'ALREADY_OWNED' };
      if (combatant.money < PLAYER_CONFIG.DEFUSE_KIT_COST) return { ok: false, reason: 'INSUFFICIENT_FUNDS' };
      combatant.money -= PLAYER_CONFIG.DEFUSE_KIT_COST;
      combatant.hasDefuseKit = true;
      return { ok: true, item: 'Defuse Kit' };
    }

    const spec = WEAPONS[itemId];
    if (!spec) return { ok: false, reason: 'UNKNOWN_ITEM' };
    if (spec.team !== 'BOTH' && spec.team !== combatant.team) {
      return { ok: false, reason: 'WRONG_TEAM' };
    }
    if (combatant.money < spec.cost) return { ok: false, reason: 'INSUFFICIENT_FUNDS' };

    combatant.money -= spec.cost;
    combatant.giveWeapon(spec.id);
    return { ok: true, item: spec.name };
  }

  autoBuyForBot(bot) {
    if (!bot.alive) return;
    // Buy armor first if rich enough
    if (bot.money >= 3700 && (!bot.hasHelmet || bot.armor < 100)) {
      this.buyItem(bot, 'helmet', true, true);
    } else if (bot.money >= 2200 && bot.armor < 100) {
      this.buyItem(bot, 'kevlar', true, true);
    }
    // Buy primary weapon if missing
    if (!bot.inventory[1]) {
      if (bot.money >= 4750 && Math.random() < 0.25) {
        this.buyItem(bot, 'awp', true, true);
      } else if (bot.team === 'T' && bot.money >= 2700) {
        this.buyItem(bot, 'ak47', true, true);
      } else if (bot.team === 'CT' && bot.money >= 2900) {
        this.buyItem(bot, 'm4a1', true, true);
      } else if (bot.money >= 1500) {
        this.buyItem(bot, 'mp5', true, true);
      } else if (bot.money >= 700 && bot.inventory[2]?.id !== 'deagle') {
        this.buyItem(bot, 'deagle', true, true);
      }
    }
    // CT defuse kit
    if (bot.team === 'CT' && !bot.hasDefuseKit && bot.money >= 400) {
      this.buyItem(bot, 'defuse_kit', true, true);
    }
  }
}
