import { TILE } from './constants.js';

/**
 * Legend for ASCII level maps:
 * '#' = TECH_WALL (1)
 * 'B' = BRICK_WALL (2)
 * 'C' = COMPUTER_WALL (3)
 * 'H' = HELL_STONE (4)
 * 'D' = DOOR (5)
 * 'b' = DOOR_BLUE (6)
 * 'r' = DOOR_RED (7)
 * 'E' = EXIT_SWITCH (8)
 * 'P' = PILLAR_WALL (9)
 * '.' = EMPTY (0)
 */
const CHAR_TO_TILE = {
  '.': TILE.EMPTY,
  ' ': TILE.EMPTY,
  '#': TILE.TECH_WALL,
  'B': TILE.BRICK_WALL,
  'C': TILE.COMPUTER_WALL,
  'H': TILE.HELL_STONE,
  'D': TILE.DOOR,
  'b': TILE.DOOR_BLUE,
  'r': TILE.DOOR_RED,
  'E': TILE.EXIT_SWITCH,
  'P': TILE.PILLAR_WALL,
};

export function parseMap(rows) {
  return rows.map((row) =>
    row.split('').map((ch) => (ch in CHAR_TO_TILE ? CHAR_TO_TILE[ch] : TILE.TECH_WALL))
  );
}

export const LEVELS = [
  {
    id: 'E1M1',
    name: 'E1M1: PHOBOS HANGAR',
    subtitle: 'Find the Blue Keycard and reach the Exit Switch.',
    skyTop: '#1e1b2e',
    skyBottom: '#3b242c',
    floorNear: '#3b3d42',
    floorFar: '#16171a',
    playerStart: { x: 2.5, y: 2.5, angle: 0 },
    mapRows: [
      '################',
      '#....C....#....#',
      '#.........D....#',
      '#..P...P..#....#',
      '#.........#....#',
      '####D######.##.#',
      '#.........#....#',
      '#..B...B..D....#',
      '#.........#....#',
      '#..C....C.#....#',
      '#######b########',
      '#..............#',
      '#..P........P..#',
      '#......E.......#',
      '#..............#',
      '################',
    ],
    enemies: [
      { type: 'TROOPER', x: 7.5, y: 2.5 },
      { type: 'TROOPER', x: 12.5, y: 3.5 },
      { type: 'IMP', x: 5.5, y: 7.5 },
      { type: 'IMP', x: 13.5, y: 7.5 },
      { type: 'TROOPER', x: 8.5, y: 8.5 },
      { type: 'DEMON', x: 7.5, y: 12.5 },
      { type: 'IMP', x: 11.5, y: 12.5 },
    ],
    pickups: [
      { type: 'AMMO_BULLETS', x: 4.5, y: 1.5 },
      { type: 'WEAPON_SHOTGUN', x: 13.5, y: 1.5 },
      { type: 'AMMO_SHELLS', x: 12.5, y: 4.5 },
      { type: 'STIMPACK', x: 2.5, y: 7.5 },
      { type: 'ARMOR', x: 1.5, y: 9.5 },
      { type: 'KEY_BLUE', x: 13.5, y: 9.5 },
      { type: 'MEDKIT', x: 4.5, y: 12.5 },
      { type: 'AMMO_SHELLS', x: 10.5, y: 12.5 },
    ],
  },
  {
    id: 'E1M2',
    name: 'E1M2: TOXIN REFINERY',
    subtitle: 'Secure the Blue & Red Keycards to unlock the Reactor Exit.',
    skyTop: '#0f2027',
    skyBottom: '#203a43',
    floorNear: '#2d3a32',
    floorFar: '#101713',
    playerStart: { x: 2.5, y: 2.5, angle: 0 },
    mapRows: [
      '##################',
      '#.....#..........#',
      '#.....D....P.....#',
      '#.C...#..........#',
      '###D##########D###',
      '#.....#....#.....#',
      '#..P..#....#..B..#',
      '#.....D....D.....#',
      '#.....#....#.....#',
      '###b#####r########',
      '#.......#........#',
      '#..B....#....P...#',
      '#.......#........#',
      '#.......#....E...#',
      '##################',
    ],
    enemies: [
      { type: 'TROOPER', x: 9.5, y: 2.5 },
      { type: 'IMP', x: 14.5, y: 2.5 },
      { type: 'DEMON', x: 4.5, y: 7.5 },
      { type: 'IMP', x: 8.5, y: 6.5 },
      { type: 'TROOPER', x: 14.5, y: 7.5 },
      { type: 'DEMON', x: 4.5, y: 11.5 },
      { type: 'IMP', x: 11.5, y: 11.5 },
      { type: 'DEMON', x: 14.5, y: 12.5 },
    ],
    pickups: [
      { type: 'AMMO_SHELLS', x: 4.5, y: 1.5 },
      { type: 'KEY_BLUE', x: 15.5, y: 1.5 },
      { type: 'MEDKIT', x: 8.5, y: 8.5 },
      { type: 'ARMOR', x: 15.5, y: 5.5 },
      { type: 'WEAPON_PLASMA', x: 2.5, y: 12.5 },
      { type: 'AMMO_CELLS', x: 5.5, y: 12.5 },
      { type: 'KEY_RED', x: 6.5, y: 10.5 },
      { type: 'MEDKIT', x: 10.5, y: 13.5 },
      { type: 'AMMO_CELLS', x: 15.5, y: 10.5 },
    ],
  },
  {
    id: 'E1M3',
    name: 'E1M3: HELL GATE',
    subtitle: 'Defeat the Baron of Hell and seal the portal.',
    skyTop: '#2b0a0a',
    skyBottom: '#6b1414',
    floorNear: '#3d2424',
    floorFar: '#140808',
    playerStart: { x: 2.5, y: 7.5, angle: 0 },
    mapRows: [
      '##################',
      '#HHHHHH#HHHHHHHHH#',
      '#H....H#H.......H#',
      '#H.P..H#H..P..P.H#',
      '#H....H#H.......H#',
      '###D####H.......H#',
      '#......#H.......H#',
      '#......r........E#',
      '#......#H.......H#',
      '###D####H.......H#',
      '#H....H#H.......H#',
      '#H.P..H#H..P..P.H#',
      '#H....H#H.......H#',
      '#HHHHHH#HHHHHHHHH#',
      '##################',
    ],
    enemies: [
      { type: 'IMP', x: 5.5, y: 2.5 },
      { type: 'DEMON', x: 5.5, y: 12.5 },
      { type: 'IMP', x: 12.5, y: 3.5 },
      { type: 'IMP', x: 12.5, y: 11.5 },
      { type: 'DEMON', x: 13.5, y: 6.5 },
      { type: 'BARON', x: 14.5, y: 7.5 },
    ],
    pickups: [
      { type: 'WEAPON_PLASMA', x: 4.5, y: 7.5 },
      { type: 'AMMO_CELLS', x: 4.5, y: 6.5 },
      { type: 'AMMO_SHELLS', x: 4.5, y: 8.5 },
      { type: 'KEY_RED', x: 3.5, y: 2.5 },
      { type: 'ARMOR', x: 3.5, y: 12.5 },
      { type: 'MEDKIT', x: 9.5, y: 2.5 },
      { type: 'MEDKIT', x: 9.5, y: 12.5 },
      { type: 'AMMO_CELLS', x: 12.5, y: 7.5 },
    ],
  },
];
