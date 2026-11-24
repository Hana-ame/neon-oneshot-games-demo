/**
 * Web COD — Operation Ironline
 * Tactical Enemy AI Finite State Machine (PATROL, CHASE, ENGAGE, STRAFE, DEAD)
 * and Wave Spawner.
 */
(function (root) {
  'use strict';

  const Config =
    typeof module !== 'undefined' && module.exports
      ? require('./config')
      : root.WebCOD.Config;

  let nextEnemyId = 1;

  class Enemy {
    constructor(typeId, x, y, waveScale = 1.0) {
      const spec = Config.ENEMY_TYPES[typeId] || Config.ENEMY_TYPES.trooper;
      this.id = nextEnemyId++;
      this.typeId = spec.id;
      this.name = spec.name;
      this.x = x;
      this.y = y;
      this.radius = spec.radius;
      this.maxHp = Math.round(spec.maxHp * (1 + (waveScale - 1) * 0.12));
      this.hp = this.maxHp;
      this.speed = spec.speed * (1 + Math.min(0.35, (waveScale - 1) * 0.04));
      this.fireRateMs = Math.max(320, Math.round(spec.fireRateMs / (1 + (waveScale - 1) * 0.05)));
      this.damage = Math.round(spec.damage * (1 + (waveScale - 1) * 0.08));
      this.accuracy = Math.min(0.9, spec.accuracy + (waveScale - 1) * 0.02);
      this.sightRange = spec.sightRange;
      this.attackRange = spec.attackRange;
      this.score = spec.score;
      this.bodyColor = spec.bodyColor;
      this.armorColor = spec.armorColor;
      this.visorColor = spec.visorColor;

      this.state = 'PATROL';
      this.angle = 0;
      this.lastShotTime = -99999;
      this.hitFlash = 0;
      this.muzzleFlash = 0;
      this.strafeDir = Math.random() < 0.5 ? -1 : 1;
      this.stateTimer = 0;
      this.lastSeenPlayer = null;
      this.alive = true;
    }

    takeDamage(amount) {
      if (!this.alive) return { killed: false, damage: 0 };
      const applied = Math.max(0, amount);
      this.hp = Math.max(0, this.hp - applied);
      this.hitFlash = 0.16;
      if (this.hp <= 0) {
        this.alive = false;
        this.state = 'DEAD';
        return { killed: true, damage: applied };
      }
      if (this.state === 'PATROL') {
        this.state = 'CHASE';
      }
      return { killed: false, damage: applied };
    }

    /**
     * Updates enemy AI state, movement, and firing decision.
     * Returns a shot event if the enemy fires at the player this tick.
     */
    update(dtSec, nowMs, player, map, rng = Math.random) {
      this.hitFlash = Math.max(0, this.hitFlash - dtSec);
      this.muzzleFlash = Math.max(0, this.muzzleFlash - dtSec);

      if (!this.alive || !player.alive) return null;

      const dx = player.x - this.x;
      const dy = player.y - this.y;
      const dist = Math.hypot(dx, dy);
      const angleToPlayer = Math.atan2(dy, dx);
      const canSee =
        dist <= this.sightRange && map.hasLineOfSight(this.x, this.y, player.x, player.y);

      if (canSee) {
        this.lastSeenPlayer = { x: player.x, y: player.y };
        this.angle = angleToPlayer;
      }

      this.stateTimer -= dtSec;

      // State transitions
      if (canSee && dist <= this.attackRange) {
        this.state = dist < 3.5 ? 'STRAFE' : 'ENGAGE';
      } else if (canSee || this.lastSeenPlayer) {
        this.state = 'CHASE';
      } else {
        this.state = 'PATROL';
      }

      // Movement by state
      let moveX = 0;
      let moveY = 0;

      if (this.state === 'CHASE') {
        const target = canSee ? player : this.lastSeenPlayer;
        const tdx = target.x - this.x;
        const tdy = target.y - this.y;
        const tdist = Math.hypot(tdx, tdy);
        if (tdist > 0.35) {
          this.angle = Math.atan2(tdy, tdx);
          moveX = (tdx / tdist) * this.speed * dtSec;
          moveY = (tdy / tdist) * this.speed * dtSec;
        } else if (!canSee) {
          this.lastSeenPlayer = null;
          this.state = 'PATROL';
        }
      } else if (this.state === 'ENGAGE' || this.state === 'STRAFE') {
        if (this.stateTimer <= 0) {
          this.strafeDir = rng() < 0.5 ? -1 : 1;
          this.stateTimer = 1.0 + rng() * 1.4;
        }
        const perpX = -Math.sin(angleToPlayer) * this.strafeDir;
        const perpY = Math.cos(angleToPlayer) * this.strafeDir;
        const strafeSpeed = this.speed * (this.state === 'STRAFE' ? 0.85 : 0.45);
        moveX = perpX * strafeSpeed * dtSec;
        moveY = perpY * strafeSpeed * dtSec;
      } else if (this.state === 'PATROL') {
        if (this.stateTimer <= 0) {
          this.angle = rng() * Math.PI * 2;
          this.stateTimer = 1.8 + rng() * 2.0;
        }
        moveX = Math.cos(this.angle) * this.speed * 0.45 * dtSec;
        moveY = Math.sin(this.angle) * this.speed * 0.45 * dtSec;
      }

      if (moveX !== 0 || moveY !== 0) {
        const moved = map.moveWithSlide(this.x, this.y, moveX, moveY, this.radius);
        // If blocked while patrolling, flip heading
        if (
          this.state === 'PATROL' &&
          Math.hypot(moved.x - this.x, moved.y - this.y) < 0.001
        ) {
          this.angle = (this.angle + Math.PI * 0.75) % (Math.PI * 2);
        }
        this.x = moved.x;
        this.y = moved.y;
      }

      // Firing logic
      if (
        (this.state === 'ENGAGE' || this.state === 'STRAFE') &&
        canSee &&
        nowMs - this.lastShotTime >= this.fireRateMs
      ) {
        this.lastShotTime = nowMs;
        this.muzzleFlash = 0.09;
        const distancePenalty = Math.max(0.35, 1 - dist / (this.attackRange * 1.5));
        const crouchPenalty = player.isCrouching ? 0.85 : 1.0;
        const hitChance = this.accuracy * distancePenalty * crouchPenalty;
        const didHit = rng() < hitChance;
        return {
          enemyId: this.id,
          enemyName: this.name,
          didHit,
          damage: didHit ? this.damage : 0,
          sourceX: this.x,
          sourceY: this.y
        };
      }

      return null;
    }
  }

  function createWavePlan(waveNumber) {
    const total = Math.min(18, 4 + waveNumber * 2);
    const list = [];
    for (let i = 0; i < total; i++) {
      if (waveNumber >= 3 && i % 5 === 4) {
        list.push('heavy');
      } else if (waveNumber >= 2 && i % 4 === 3) {
        list.push('sniper');
      } else {
        list.push('trooper');
      }
    }
    return list;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Enemy, createWavePlan };
  } else {
    root.WebCOD = root.WebCOD || {};
    root.WebCOD.Enemy = Enemy;
    root.WebCOD.createWavePlan = createWavePlan;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
