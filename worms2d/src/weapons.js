// Weapon firing, projectile factory, and cluster/airstrike spawning

import { PHYSICS, WEAPON_MAP } from './constants.js';
import { castRay } from './physics.js';

let nextProjId = 1;

export function createProjectile(config) {
  return {
    id: nextProjId++,
    weaponId: config.weaponId,
    type: config.type || 'projectile',
    ownerId: config.ownerId,
    x: config.x,
    y: config.y,
    vx: config.vx,
    vy: config.vy,
    radius: config.radius ?? 4,
    windFactor: config.windFactor ?? 1.0,
    gravityFactor: config.gravityFactor ?? 1.0,
    bounces: Boolean(config.bounces),
    restitution: config.restitution ?? PHYSICS.RESTITUTION_GRENADE,
    fuse: config.fuse ?? 0,
    fuseRemaining: config.fuse ?? 0,
    blastRadius: config.blastRadius ?? 40,
    maxDamage: config.maxDamage ?? 40,
    knockback: config.knockback ?? 280,
    subCount: config.subCount ?? 0,
    subRadius: config.subRadius ?? 26,
    subDamage: config.subDamage ?? 22,
    subKnockback: config.subKnockback ?? 180,
    age: 0,
    active: true,
    bounced: false,
    trail: [],
  };
}

// Compute actual world firing angle from worm facing and aimAngle (-PI/2 .. PI/2)
export function getWorldAimAngle(worm) {
  return worm.facing === 1 ? worm.aimAngle : Math.PI - worm.aimAngle;
}

// Fire weapon from active worm; returns spawned projectiles or hitscan result
export function fireWeapon(weaponId, worm, powerRatio, terrain, worms, targetPos = null) {
  const weapon = WEAPON_MAP[weaponId];
  if (!weapon) return { projectiles: [], hitscan: null };

  const angle = getWorldAimAngle(worm);
  const muzzleX = worm.x + Math.cos(angle) * (PHYSICS.WORM_RADIUS + 6);
  const muzzleY = worm.y - 3 + Math.sin(angle) * (PHYSICS.WORM_RADIUS + 6);

  if (weapon.type === 'hitscan') {
    const hit = castRay(terrain, worms, worm.id, muzzleX, muzzleY, angle, weapon.range);
    return {
      projectiles: [],
      hitscan: {
        startX: muzzleX,
        startY: muzzleY,
        endX: hit.x,
        endY: hit.y,
        hit: hit.hit,
        hitType: hit.type,
        blastRadius: weapon.blastRadius,
        maxDamage: weapon.maxDamage,
        knockback: weapon.knockback,
      },
    };
  }

  if (weapon.type === 'drop') {
    const p = createProjectile({
      weaponId: weapon.id,
      type: 'drop',
      ownerId: worm.id,
      x: worm.x + worm.facing * 8,
      y: worm.y - 2,
      vx: worm.facing * 24,
      vy: -25,
      radius: 5,
      windFactor: 0,
      gravityFactor: 1.0,
      bounces: false,
      fuse: weapon.fuse,
      blastRadius: weapon.blastRadius,
      maxDamage: weapon.maxDamage,
      knockback: weapon.knockback,
    });
    return { projectiles: [p], hitscan: null };
  }

  if (weapon.type === 'airstrike') {
    const tx = targetPos ? targetPos.x : worm.x + worm.facing * 280;
    const count = weapon.missileCount || 5;
    const spacing = 34;
    const startX = tx - ((count - 1) * spacing) / 2;
    const projectiles = [];
    for (let i = 0; i < count; i++) {
      projectiles.push(
        createProjectile({
          weaponId: weapon.id,
          type: 'airstrike_missile',
          ownerId: worm.id,
          x: startX + i * spacing - 90,
          y: -40 - i * 28,
          vx: 115,
          vy: 165,
          radius: 4,
          windFactor: weapon.windFactor,
          gravityFactor: weapon.gravityFactor,
          bounces: false,
          fuse: 0,
          blastRadius: weapon.blastRadius,
          maxDamage: weapon.maxDamage,
          knockback: weapon.knockback,
        })
      );
    }
    return { projectiles, hitscan: null };
  }

  // Standard projectile (bazooka, grenade, cluster)
  const clampedPower = Math.max(0.15, Math.min(1, powerRatio));
  const speed = weapon.minSpeed + (weapon.maxSpeed - weapon.minSpeed) * clampedPower;

  const proj = createProjectile({
    weaponId: weapon.id,
    type: weapon.type,
    ownerId: worm.id,
    x: muzzleX,
    y: muzzleY,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    radius: weapon.bounces ? 5 : 4,
    windFactor: weapon.windFactor,
    gravityFactor: weapon.gravityFactor,
    bounces: weapon.bounces,
    fuse: weapon.fuse,
    blastRadius: weapon.blastRadius,
    maxDamage: weapon.maxDamage,
    knockback: weapon.knockback,
    subCount: weapon.subCount || 0,
    subRadius: weapon.subRadius || 26,
    subDamage: weapon.subDamage || 22,
    subKnockback: weapon.subKnockback || 180,
  });

  return { projectiles: [proj], hitscan: null };
}

// Spawn cluster bomblets when a cluster bomb detonates
export function spawnClusterBomblets(parentProj) {
  const count = parentProj.subCount || 5;
  const bomblets = [];
  for (let i = 0; i < count; i++) {
    const spread = -0.85 + (i / Math.max(1, count - 1)) * 1.7;
    const angle = -Math.PI / 2 + spread * 0.65;
    const speed = 185 + (i % 2) * 55;
    bomblets.push(
      createProjectile({
        weaponId: 'cluster_sub',
        type: 'bomblet',
        ownerId: parentProj.ownerId,
        x: parentProj.x,
        y: parentProj.y - 6,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 3.5,
        windFactor: 0.2,
        gravityFactor: 1.0,
        bounces: false,
        fuse: 0,
        blastRadius: parentProj.subRadius,
        maxDamage: parentProj.subDamage,
        knockback: parentProj.subKnockback,
      })
    );
  }
  return bomblets;
}
