/**
 * Colonist & Raider entity factories, needs decay, thoughts, and mood calculation.
 */

import { TRAITS, JOB_TYPES } from './constants.js';

const PRESET_NAMES = [
  '林岚', '陈默', '苏晴', '周毅', '沈舟', '许宁', '顾寒', '叶蓁', '陆离', '唐果',
];

const SHIRT_COLORS = ['#4f86c6', '#c65d4f', '#5ca66e', '#c6974f', '#8b68b8', '#4fa8a3'];
const HAIR_COLORS = ['#2a231e', '#5c3c24', '#8c5a32', '#1d1e22', '#7a3b2e', '#d6c29f'];

export function createColonist(id, x, y, rng = Math.random, customName = null) {
  const name = customName || PRESET_NAMES[id % PRESET_NAMES.length];
  const trait = TRAITS[Math.floor(rng() * TRAITS.length)];
  const skillVal = () => Math.floor(2 + rng() * 8);

  return {
    id: `col_${id}`,
    name,
    faction: 'player',
    x,
    y,
    hp: 100,
    maxHp: 100,
    alive: true,
    drafted: false,
    shirtColor: SHIRT_COLORS[id % SHIRT_COLORS.length],
    hairColor: HAIR_COLORS[id % HAIR_COLORS.length],
    trait,
    skills: {
      build: skillVal(),
      mine: skillVal(),
      plant: skillVal(),
      cook: skillVal(),
      shooting: skillVal(),
      medical: skillVal(),
      research: skillVal(),
    },
    workPriorities: {
      medical: 1,
      cook: 2,
      build: 2,
      plant: 2,
      mine: 3,
      research: 3,
    },
    needs: {
      hunger: 82 + rng() * 15, // 0 = starving, 100 = full
      rest: 80 + rng() * 18,   // 0 = exhausted, 100 = rested
      joy: 75 + rng() * 20,    // 0 = bored, 100 = happy
    },
    mood: 72,
    thoughts: [],
    job: null, // { type, tx, ty, progress, workRequired, targetId }
    path: [],
    attackCooldown: 0,
    statusText: '空闲',
  };
}

export function createRaider(id, x, y, wave = 1) {
  const hp = 70 + wave * 12;
  return {
    id: `raider_${id}`,
    name: `掠夺者 #${id}`,
    faction: 'hostile',
    x,
    y,
    hp,
    maxHp: hp,
    alive: true,
    damage: 9 + Math.min(12, wave * 2),
    range: 4.5,
    speed: 2.0 + Math.min(0.8, wave * 0.08),
    attackCooldown: 0,
    path: [],
    targetId: null,
    statusText: '进攻中',
  };
}

export function getColonistWorkSpeed(colonist, skillKey = null) {
  let speed = colonist.trait?.workSpeed || 1.0;
  if (skillKey && colonist.skills[skillKey] != null) {
    speed *= 0.75 + colonist.skills[skillKey] * 0.07;
  }
  if (colonist.needs.rest < 20) speed *= 0.75;
  if (colonist.hp < 50) speed *= 0.8;
  return speed;
}

export function getColonistMoveSpeed(colonist, weatherMoveMult = 1.0) {
  let speed = 2.7 * (colonist.trait?.moveSpeed || 1.0) * weatherMoveMult;
  if (colonist.hp < 50) speed *= 0.75;
  if (colonist.needs.hunger < 15) speed *= 0.82;
  return speed;
}

export function updateColonistNeeds(colonist, dt, world) {
  if (!colonist.alive) return;

  const hungerMult = colonist.trait?.hungerRate || 1.0;
  const isSleeping = colonist.job?.type === JOB_TYPES.SLEEP;
  const isRelaxing = colonist.job?.type === JOB_TYPES.RELAX;

  colonist.needs.hunger = Math.max(0, colonist.needs.hunger - dt * 0.42 * hungerMult);
  if (!isSleeping) {
    colonist.needs.rest = Math.max(0, colonist.needs.rest - dt * 0.34);
  }
  if (!isRelaxing) {
    colonist.needs.joy = Math.max(0, colonist.needs.joy - dt * 0.24);
  }

  // Starvation damage
  if (colonist.needs.hunger <= 0) {
    colonist.hp = Math.max(0, colonist.hp - dt * 1.4);
  } else if (colonist.hp < colonist.maxHp && colonist.needs.hunger > 40) {
    const medMult = world.researchedTechs.has('medicine_adv') ? 1.5 : 1.0;
    colonist.hp = Math.min(colonist.maxHp, colonist.hp + dt * 0.35 * medMult);
  }

  if (colonist.hp <= 0) {
    colonist.alive = false;
    colonist.statusText = '阵亡';
    return;
  }

  // Compute thoughts and target mood
  const thoughts = [];
  let targetMood = 55 + (colonist.trait?.moodMod || 0);

  if (colonist.needs.hunger > 75) {
    thoughts.push({ label: '吃饱喝足', delta: 8 });
    targetMood += 8;
  } else if (colonist.needs.hunger < 25) {
    thoughts.push({ label: '饥肠辘辘', delta: -16 });
    targetMood -= 16;
  }

  if (colonist.needs.rest > 75) {
    thoughts.push({ label: '精力充沛', delta: 6 });
    targetMood += 6;
  } else if (colonist.needs.rest < 20) {
    thoughts.push({ label: '极度疲惫', delta: -14 });
    targetMood -= 14;
  }

  if (colonist.needs.joy > 70) {
    thoughts.push({ label: '心情愉悦', delta: 6 });
    targetMood += 6;
  } else if (colonist.needs.joy < 25) {
    thoughts.push({ label: '枯燥乏味', delta: -8 });
    targetMood -= 8;
  }

  if (colonist.hp < 65) {
    thoughts.push({ label: '身体受伤', delta: -12 });
    targetMood -= 12;
  }

  if (world.weather.id === 'heatwave') {
    thoughts.push({ label: '酷暑难耐', delta: -6 });
    targetMood -= 6;
  } else if (world.weather.id === 'coldsnap') {
    thoughts.push({ label: '刺骨寒风', delta: -6 });
    targetMood -= 6;
  }

  if (world.stats.bedsBuilt > 0) {
    thoughts.push({ label: '温馨营地', delta: 5 });
    targetMood += 5;
  }

  colonist.thoughts = thoughts;
  const clamped = Math.max(0, Math.min(100, targetMood));
  colonist.mood += (clamped - colonist.mood) * Math.min(1, dt * 0.6);
}
