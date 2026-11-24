import { MAP_ZONES, TEAMS } from './constants.js';

function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class BotController {
  constructor(combatant, difficulty = 'normal') {
    this.bot = combatant;
    this.difficulty = difficulty;
    this.path = [];
    this.repathTimer = 0;
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.strafeTimer = 1.0 + Math.random();
    this.reactionTimer = 0;
    this.targetId = null;
    this.assignedSite = Math.random() < 0.5 ? 'SITE_A' : 'SITE_B';
  }

  getDifficultyStats() {
    if (this.difficulty === 'hard') {
      return { reaction: 0.16, aimError: 0.035, turnSpeed: 5.5, fireRateMult: 1.0 };
    }
    if (this.difficulty === 'easy') {
      return { reaction: 0.45, aimError: 0.11, turnSpeed: 3.0, fireRateMult: 0.65 };
    }
    return { reaction: 0.28, aimError: 0.065, turnSpeed: 4.2, fireRateMult: 0.82 };
  }

  resetForRound() {
    this.path = [];
    this.repathTimer = 0;
    this.reactionTimer = 0;
    this.targetId = null;
    this.assignedSite = Math.random() < 0.5 ? 'SITE_A' : 'SITE_B';
  }

  chooseGoal(game) {
    const bomb = game.bomb;
    if (this.bot.team === TEAMS.T) {
      if (bomb.state === 'PLANTED') {
        // Guard the planted bomb
        return { x: bomb.x, y: bomb.y };
      }
      if (this.bot.hasBomb) {
        const site = MAP_ZONES[this.assignedSite];
        return { x: site.cx, y: site.cy };
      }
      const site = MAP_ZONES[this.assignedSite];
      return { x: site.cx, y: site.cy };
    } else {
      // CT logic
      if (bomb.state === 'PLANTED') {
        return { x: bomb.x, y: bomb.y };
      }
      // Hold assigned bombsite or patrol mid
      const site = MAP_ZONES[this.assignedSite];
      return { x: site.cx, y: site.cy };
    }
  }

  findVisibleEnemy(game) {
    let best = null;
    let bestDist = Infinity;
    for (const other of game.combatants) {
      if (!other.alive || other.team === this.bot.team) continue;
      const dist = Math.hypot(other.x - this.bot.x, other.y - this.bot.y);
      if (dist < 18 && dist < bestDist) {
        if (game.map.hasLineOfSight(this.bot.x, this.bot.y, other.x, other.y)) {
          best = other;
          bestDist = dist;
        }
      }
    }
    return best;
  }

  update(dt, game) {
    const bot = this.bot;
    if (!bot.alive || game.phase === 'BUY' || game.phase === 'MENU' || game.phase === 'MATCH_OVER') {
      return;
    }

    const stats = this.getDifficultyStats();
    const w = bot.getActiveWeapon();
    if (w && w.ammo === 0 && w.reserve > 0 && !w.reloading) {
      bot.startReload();
    }

    // 1. Check objective: T planting bomb or CT defusing bomb
    if (bot.team === TEAMS.T && bot.hasBomb && game.bomb.state !== 'PLANTED') {
      const site = game.map.getBombsiteAt(bot.x, bot.y);
      if (site) {
        const enemy = this.findVisibleEnemy(game);
        if (!enemy) {
          game.handlePlantAction(bot, dt);
          return;
        } else {
          game.bomb.cancelPlant(bot.id);
        }
      }
    }

    if (bot.team === TEAMS.CT && game.bomb.state === 'PLANTED') {
      const distToBomb = Math.hypot(bot.x - game.bomb.x, bot.y - game.bomb.y);
      const enemy = this.findVisibleEnemy(game);
      if (distToBomb <= 1.35 && !enemy) {
        game.handleDefuseAction(bot, dt);
        return;
      } else {
        game.bomb.cancelDefuse(bot.id);
      }
    }

    // 2. Combat engagement if an enemy is visible
    const enemy = this.findVisibleEnemy(game);
    if (enemy) {
      const dx = enemy.x - bot.x;
      const dy = enemy.y - bot.y;
      const dist = Math.hypot(dx, dy);
      const desiredAngle = Math.atan2(dy, dx);
      const diff = normalizeAngle(desiredAngle - bot.angle);
      const maxTurn = stats.turnSpeed * dt;
      bot.angle = normalizeAngle(bot.angle + Math.max(-maxTurn, Math.min(maxTurn, diff)));

      if (this.targetId !== enemy.id) {
        this.targetId = enemy.id;
        this.reactionTimer = stats.reaction;
      } else {
        this.reactionTimer = Math.max(0, this.reactionTimer - dt);
      }

      // Tactical strafing during firefight
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) {
        this.strafeDir = -this.strafeDir;
        this.strafeTimer = 0.6 + Math.random() * 0.9;
      }
      const forward = dist > 7.5 ? 0.55 : dist < 3.0 ? -0.4 : 0;
      bot.move(forward, this.strafeDir * 0.55, dt, game.map);

      // Fire when aimed closely enough and reaction time elapsed
      if (this.reactionTimer <= 0 && Math.abs(diff) < 0.22) {
        const jitter = (Math.random() - 0.5) * stats.aimError * 2;
        const pitchJitter = (Math.random() - 0.5) * 0.14;
        game.fireWeapon(bot, bot.angle + jitter, pitchJitter);
      }
      return;
    }

    this.targetId = null;

    // 3. Pathfinding navigation toward tactical objective
    this.repathTimer -= dt;
    if (this.repathTimer <= 0 || this.path.length === 0) {
      const goal = this.chooseGoal(game);
      this.path = game.map.findPath(bot.x, bot.y, goal.x, goal.y);
      this.repathTimer = 1.2 + Math.random() * 0.6;
    }

    if (this.path.length > 0) {
      const wp = this.path[0];
      const dx = wp.x - bot.x;
      const dy = wp.y - bot.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.45) {
        this.path.shift();
      } else {
        const desiredAngle = Math.atan2(dy, dx);
        const diff = normalizeAngle(desiredAngle - bot.angle);
        const maxTurn = stats.turnSpeed * dt;
        bot.angle = normalizeAngle(bot.angle + Math.max(-maxTurn, Math.min(maxTurn, diff)));
        bot.move(0.92, 0, dt, game.map);
      }
    }
  }
}
