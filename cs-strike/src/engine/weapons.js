import { WEAPONS } from './constants.js';

export function createWeaponState(weaponId) {
  const spec = WEAPONS[weaponId];
  if (!spec) throw new Error(`Unknown weapon: ${weaponId}`);
  return {
    id: spec.id,
    ammo: spec.magSize,
    reserve: spec.reserveMax,
    reloading: false,
    reloadTimer: 0,
    fireCooldown: 0,
  };
}

export function getWeaponSpec(weaponId) {
  return WEAPONS[weaponId];
}

export function computeShotSpread(spec, isMoving, isCrouching, isScoped, recoilLevel) {
  let base = (spec.id === 'awp' && isScoped) ? spec.scopedSpread : spec.baseSpread;
  if (isMoving) base += spec.moveSpread;
  if (isCrouching) base *= 0.65;
  return base + recoilLevel * 0.25;
}

export function calculateDamage(spec, hitZone, targetArmor, hasHelmet, distance) {
  // Distance falloff (sniper has minimal falloff)
  const falloffRate = spec.category === 'sniper' ? 0.002 : spec.category === 'rifle' ? 0.006 : 0.015;
  const distMult = Math.max(0.45, 1 - distance * falloffRate);

  let zoneMult = 1.0;
  if (hitZone === 'head') zoneMult = spec.headMultiplier;
  else if (hitZone === 'leg') zoneMult = 0.75;

  let rawDmg = spec.damage * zoneMult * distMult;
  let hpDamage = rawDmg;
  let armorDamage = 0;

  const armoredHit =
    (hitZone === 'body' && targetArmor > 0) ||
    (hitZone === 'head' && targetArmor > 0 && hasHelmet);

  if (armoredHit) {
    hpDamage = rawDmg * spec.armorPen;
    armorDamage = Math.min(targetArmor, (rawDmg - hpDamage) * 0.55);
  }

  return {
    hpDamage: Math.max(1, Math.round(hpDamage)),
    armorDamage: Math.round(armorDamage),
    isHeadshot: hitZone === 'head',
  };
}

// Ray vs target cylinder hit detection with head/body/leg pitch zone
export function checkHitscanAgainstEntity(origin, rayAngle, pitchOffset, maxDist, target) {
  if (!target.alive) return null;
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const dist = Math.hypot(dx, dy);
  if (dist > maxDist || dist < 0.1) return null;

  const dirX = Math.cos(rayAngle);
  const dirY = Math.sin(rayAngle);
  const proj = dx * dirX + dy * dirY;
  if (proj <= 0 || proj > maxDist) return null;

  const perpDist = Math.abs(dx * dirY - dy * dirX);
  const hitRadius = target.crouching ? 0.34 : 0.32;
  if (perpDist > hitRadius) return null;

  // Determine vertical hit zone based on pitchOffset (-0.5..+0.5) and distance
  // Target head is slightly above center when standing, lower when crouching
  const headCenterPitch = target.crouching ? -0.04 : 0.095;
  const headHalfBand = Math.max(0.032, 0.20 / Math.max(1.2, dist));
  const bodyMinPitch = -Math.max(0.18, 0.65 / Math.max(1.2, dist));
  const bodyMaxPitch = headCenterPitch + headHalfBand;

  if (Math.abs(pitchOffset - headCenterPitch) <= headHalfBand && perpDist <= hitRadius * 0.72) {
    return { target, distance: proj, hitZone: 'head' };
  }
  if (pitchOffset >= bodyMinPitch && pitchOffset <= bodyMaxPitch) {
    const zone = pitchOffset < -0.10 ? 'leg' : 'body';
    return { target, distance: proj, hitZone: zone };
  }
  // Generous close-range body fallback
  if (dist < 4.0 && Math.abs(pitchOffset) < 0.25) {
    return { target, distance: proj, hitZone: 'body' };
  }
  return null;
}
