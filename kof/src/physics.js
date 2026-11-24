// KOF Web Arcade - AABB Collision, Pushbox & Stage Physics
import {
  GROUND_Y,
  STAGE_LEFT,
  STAGE_RIGHT,
  FIGHTER_STATES
} from './constants.js';

export function rectsOverlap(a, b) {
  if (!a || !b) return false;
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

export function getHurtbox(fighter) {
  const crouching =
    fighter.state === FIGHTER_STATES.CROUCH ||
    (fighter.state === FIGHTER_STATES.ATTACK && fighter.currentMove?.crouch);
  const w = 54;
  const h = crouching ? 92 : 138;
  return {
    x: fighter.x - w / 2,
    y: fighter.y - h,
    w,
    h
  };
}

export function getPushbox(fighter) {
  const w = 48;
  const h = 112;
  return {
    x: fighter.x - w / 2,
    y: fighter.y - h,
    w,
    h
  };
}

export function getActiveHitbox(fighter) {
  if (fighter.state !== FIGHTER_STATES.ATTACK || !fighter.currentMove) {
    return null;
  }
  const m = fighter.currentMove;
  const f = fighter.stateFrame;
  if (f < m.startup || f >= m.startup + m.active) {
    return null;
  }
  const hb = m.hitbox;
  if (!hb) return null;
  const x =
    fighter.facing === 1
      ? fighter.x + hb.x - hb.w * 0.25
      : fighter.x - hb.x - hb.w * 0.75;
  return {
    x,
    y: fighter.y + hb.y,
    w: hb.w,
    h: hb.h
  };
}

export function getProjectileBox(proj) {
  return {
    x: proj.x - proj.w / 2,
    y: proj.y - proj.h / 2,
    w: proj.w,
    h: proj.h
  };
}

export function clampToStage(fighter) {
  if (fighter.x < STAGE_LEFT) fighter.x = STAGE_LEFT;
  if (fighter.x > STAGE_RIGHT) fighter.x = STAGE_RIGHT;
  if (fighter.y > GROUND_Y) {
    fighter.y = GROUND_Y;
    fighter.vy = 0;
  }
}

export function resolvePushboxes(f1, f2) {
  // Rolls pass through opponents cleanly (classic KOF emergency evasion)
  const rolling1 =
    f1.state === FIGHTER_STATES.ROLL_F || f1.state === FIGHTER_STATES.ROLL_B;
  const rolling2 =
    f2.state === FIGHTER_STATES.ROLL_F || f2.state === FIGHTER_STATES.ROLL_B;
  if (rolling1 || rolling2) return;

  const b1 = getPushbox(f1);
  const b2 = getPushbox(f2);
  if (!rectsOverlap(b1, b2)) return;

  const center1 = b1.x + b1.w / 2;
  const center2 = b2.x + b2.w / 2;
  const overlapX = (b1.w + b2.w) / 2 - Math.abs(center1 - center2);
  if (overlapX <= 0) return;

  const push = overlapX / 2 + 0.5;
  if (center1 <= center2) {
    f1.x -= push;
    f2.x += push;
  } else {
    f1.x += push;
    f2.x -= push;
  }
  clampToStage(f1);
  clampToStage(f2);
}

export function updateAutoFacing(f1, f2) {
  const canTurn = (f) =>
    f.state === FIGHTER_STATES.IDLE ||
    f.state === FIGHTER_STATES.WALK_F ||
    f.state === FIGHTER_STATES.WALK_B ||
    f.state === FIGHTER_STATES.CROUCH;

  if (Math.abs(f1.x - f2.x) < 2) return;
  if (canTurn(f1)) f1.facing = f1.x < f2.x ? 1 : -1;
  if (canTurn(f2)) f2.facing = f2.x < f1.x ? 1 : -1;
}
