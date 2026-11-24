export const ENGINE_VERSION = '1.0.0';

export const INTERNAL_WIDTH = 480;
export const INTERNAL_HEIGHT = 270;
export const HUD_HEIGHT = 54;
export const VIEW_HEIGHT = INTERNAL_HEIGHT - HUD_HEIGHT;
export const FOV = Math.PI / 3; // 60 degrees
export const TEX_SIZE = 64;

export const TILE = {
  EMPTY: 0,
  TECH_WALL: 1,
  BRICK_WALL: 2,
  COMPUTER_WALL: 3,
  HELL_STONE: 4,
  DOOR: 5,
  DOOR_BLUE: 6,
  DOOR_RED: 7,
  EXIT_SWITCH: 8,
  PILLAR_WALL: 9,
};

export const SOLID_TILES = new Set([
  TILE.TECH_WALL,
  TILE.BRICK_WALL,
  TILE.COMPUTER_WALL,
  TILE.HELL_STONE,
  TILE.EXIT_SWITCH,
  TILE.PILLAR_WALL,
]);

export const DOOR_TILES = new Set([
  TILE.DOOR,
  TILE.DOOR_BLUE,
  TILE.DOOR_RED,
]);

export const WEAPON_IDS = {
  FIST: 'fist',
  PISTOL: 'pistol',
  SHOTGUN: 'shotgun',
  PLASMA: 'plasma',
};

export const WEAPONS = {
  [WEAPON_IDS.FIST]: {
    id: WEAPON_IDS.FIST,
    slot: 1,
    name: 'FIST',
    ammoType: null,
    ammoPerShot: 0,
    damage: 22,
    pellets: 1,
    spread: 0.04,
    range: 1.5,
    cooldown: 0.35,
    projectile: false,
    color: '#d4a373',
  },
  [WEAPON_IDS.PISTOL]: {
    id: WEAPON_IDS.PISTOL,
    slot: 2,
    name: 'PISTOL',
    ammoType: 'bullets',
    ammoPerShot: 1,
    damage: 18,
    pellets: 1,
    spread: 0.025,
    range: 24,
    cooldown: 0.32,
    projectile: false,
    color: '#fbbf24',
  },
  [WEAPON_IDS.SHOTGUN]: {
    id: WEAPON_IDS.SHOTGUN,
    slot: 3,
    name: 'SHOTGUN',
    ammoType: 'shells',
    ammoPerShot: 1,
    damage: 14,
    pellets: 5,
    spread: 0.14,
    range: 18,
    cooldown: 0.72,
    projectile: false,
    color: '#f97316',
  },
  [WEAPON_IDS.PLASMA]: {
    id: WEAPON_IDS.PLASMA,
    slot: 4,
    name: 'PLASMA',
    ammoType: 'cells',
    ammoPerShot: 1,
    damage: 28,
    pellets: 1,
    spread: 0.015,
    range: 28,
    cooldown: 0.14,
    projectile: true,
    projectileSpeed: 12.5,
    color: '#38bdf8',
  },
};

export const ENEMY_TYPES = {
  TROOPER: {
    type: 'TROOPER',
    name: 'Zombieman',
    maxHp: 40,
    speed: 1.55,
    radius: 0.32,
    sightRange: 11,
    attackRange: 8.5,
    attackCooldown: 1.25,
    damage: 9,
    ranged: true,
    projectileSpeed: 7.5,
    projectileColor: '#fde047',
    score: 100,
    spriteScale: 0.9,
  },
  IMP: {
    type: 'IMP',
    name: 'Imp',
    maxHp: 65,
    speed: 1.85,
    radius: 0.34,
    sightRange: 12,
    attackRange: 9.5,
    attackCooldown: 1.4,
    damage: 14,
    ranged: true,
    projectileSpeed: 6.8,
    projectileColor: '#fb923c',
    score: 200,
    spriteScale: 0.95,
  },
  DEMON: {
    type: 'DEMON',
    name: 'Pinky Demon',
    maxHp: 110,
    speed: 2.55,
    radius: 0.38,
    sightRange: 11,
    attackRange: 1.25,
    attackCooldown: 0.85,
    damage: 18,
    ranged: false,
    projectileSpeed: 0,
    projectileColor: '#f43f5e',
    score: 300,
    spriteScale: 1.0,
  },
  BARON: {
    type: 'BARON',
    name: 'Baron of Hell',
    maxHp: 260,
    speed: 1.65,
    radius: 0.42,
    sightRange: 14,
    attackRange: 11.5,
    attackCooldown: 1.35,
    damage: 24,
    ranged: true,
    projectileSpeed: 7.8,
    projectileColor: '#4ade80',
    score: 1000,
    spriteScale: 1.18,
  },
};

export const PICKUP_TYPES = {
  MEDKIT: { type: 'MEDKIT', label: 'Medkit (+25 HP)', color: '#ef4444' },
  STIMPACK: { type: 'STIMPACK', label: 'Stimpack (+12 HP)', color: '#f87171' },
  ARMOR: { type: 'ARMOR', label: 'Combat Armor (+50)', color: '#22c55e' },
  AMMO_BULLETS: { type: 'AMMO_BULLETS', label: 'Ammo Clip (+15)', color: '#eab308' },
  AMMO_SHELLS: { type: 'AMMO_SHELLS', label: 'Shotgun Shells (+6)', color: '#f97316' },
  AMMO_CELLS: { type: 'AMMO_CELLS', label: 'Energy Cell (+25)', color: '#38bdf8' },
  WEAPON_SHOTGUN: { type: 'WEAPON_SHOTGUN', label: 'Shotgun', color: '#fb923c' },
  WEAPON_PLASMA: { type: 'WEAPON_PLASMA', label: 'Plasma Rifle', color: '#0ea5e9' },
  KEY_BLUE: { type: 'KEY_BLUE', label: 'Blue Keycard', color: '#3b82f6' },
  KEY_RED: { type: 'KEY_RED', label: 'Red Keycard', color: '#ef4444' },
};

export const PLAYER_DEFAULTS = {
  maxHealth: 100,
  maxArmor: 100,
  radius: 0.28,
  walkSpeed: 3.4,
  sprintSpeed: 5.0,
  turnSpeed: 2.4,
  interactRange: 1.85,
  maxAmmo: {
    bullets: 200,
    shells: 50,
    cells: 200,
  },
};
