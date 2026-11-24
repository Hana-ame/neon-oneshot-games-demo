(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GTAConfig = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TILE_SIZE = 64;
  const BLOCK_TILES = 4; // 4x4 building block
  const ROAD_TILES = 2;  // 2-tile wide two-way road
  const STRIDE_TILES = BLOCK_TILES + ROAD_TILES; // 6 tiles per city cell
  const GRID_CELLS = 7;  // 7x7 city blocks => 44x44 tiles => 2816x2816 px world
  const MAP_TILES = GRID_CELLS * STRIDE_TILES + ROAD_TILES;
  const WORLD_SIZE = MAP_TILES * TILE_SIZE;

  const DISTRICTS = [
    { name: '霓虹市中心', en: 'Neon Downtown', minX: 0, maxX: 0.5, minY: 0, maxY: 0.5, accent: '#00f0ff' },
    { name: '日落大道', en: 'Sunset Strip', minX: 0.5, maxX: 1.0, minY: 0, maxY: 0.5, accent: '#ff2e93' },
    { name: '工业港区', en: 'Harbor Docks', minX: 0, maxX: 0.5, minY: 0.5, maxY: 1.0, accent: '#ffaa00' },
    { name: '棕榈湾畔', en: 'Palm Bay', minX: 0.5, maxX: 1.0, minY: 0.5, maxY: 1.0, accent: '#39ff14' }
  ];

  const VEHICLE_TYPES = {
    sports: {
      id: 'sports',
      name: '幻影 GT 跑车',
      width: 24,
      length: 46,
      maxSpeed: 540,
      reverseSpeed: 170,
      accel: 460,
      brake: 560,
      turnRate: 3.1,
      driftGrip: 0.88,
      normalGrip: 0.72,
      mass: 1.1,
      maxHp: 130,
      colors: ['#ff2e63', '#00f0ff', '#ffe600', '#b829ff', '#ff6b00']
    },
    muscle: {
      id: 'muscle',
      name: '狂怒 V8 肌肉车',
      width: 26,
      length: 48,
      maxSpeed: 470,
      reverseSpeed: 160,
      accel: 410,
      brake: 480,
      turnRate: 2.75,
      driftGrip: 0.91,
      normalGrip: 0.76,
      mass: 1.45,
      maxHp: 170,
      colors: ['#ff5500', '#cc1133', '#22cc88', '#3366ff']
    },
    taxi: {
      id: 'taxi',
      name: '都市出租车',
      width: 24,
      length: 44,
      maxSpeed: 390,
      reverseSpeed: 145,
      accel: 330,
      brake: 440,
      turnRate: 2.85,
      driftGrip: 0.85,
      normalGrip: 0.70,
      mass: 1.2,
      maxHp: 140,
      colors: ['#f5c400']
    },
    van: {
      id: 'van',
      name: '重型厢式货车',
      width: 28,
      length: 54,
      maxSpeed: 320,
      reverseSpeed: 120,
      accel: 250,
      brake: 380,
      turnRate: 2.2,
      driftGrip: 0.82,
      normalGrip: 0.68,
      mass: 2.1,
      maxHp: 240,
      colors: ['#d8e2ec', '#4a607a', '#3d5a45']
    },
    police: {
      id: 'police',
      name: '特警截击巡逻车',
      width: 25,
      length: 47,
      maxSpeed: 525,
      reverseSpeed: 175,
      accel: 450,
      brake: 540,
      turnRate: 3.05,
      driftGrip: 0.87,
      normalGrip: 0.71,
      mass: 1.5,
      maxHp: 185,
      colors: ['#161d2b']
    }
  };

  const WEAPONS = [
    {
      id: 'fist',
      name: '徒手格斗',
      key: '1',
      damage: 20,
      fireRate: 0.35,
      range: 42,
      speed: 0,
      pellets: 1,
      spread: 0,
      ammoCost: 0,
      color: '#ffffff',
      melee: true
    },
    {
      id: 'pistol',
      name: '9mm 战术手枪',
      key: '2',
      damage: 28,
      fireRate: 0.28,
      range: 420,
      speed: 980,
      pellets: 1,
      spread: 0.04,
      ammoCost: 1,
      color: '#ffe066',
      melee: false
    },
    {
      id: 'smg',
      name: '微型冲锋枪',
      key: '3',
      damage: 16,
      fireRate: 0.095,
      range: 360,
      speed: 1050,
      pellets: 1,
      spread: 0.11,
      ammoCost: 1,
      color: '#00f0ff',
      melee: false
    },
    {
      id: 'shotgun',
      name: '战术霰弹枪',
      key: '4',
      damage: 18,
      fireRate: 0.68,
      range: 250,
      speed: 880,
      pellets: 6,
      spread: 0.28,
      ammoCost: 1,
      color: '#ff6b35',
      melee: false
    }
  ];

  const RADIO_STATIONS = [
    { id: 0, name: 'VICE FM 98.3', genre: '合成器浪潮 Synthwave', bpm: 112 },
    { id: 1, name: 'NEON PULSE 104.7', genre: '赛博电音 Outrun', bpm: 128 },
    { id: 2, name: 'HARBOR FUNK 89.1', genre: '复古放克 Electro Funk', bpm: 102 },
    { id: 3, name: 'OFF', genre: '关闭电台', bpm: 0 }
  ];

  return {
    TILE_SIZE,
    BLOCK_TILES,
    ROAD_TILES,
    STRIDE_TILES,
    GRID_CELLS,
    MAP_TILES,
    WORLD_SIZE,
    DISTRICTS,
    VEHICLE_TYPES,
    WEAPONS,
    RADIO_STATIONS,
    PLAYER_SPEED: 165,
    PLAYER_SPRINT_SPEED: 235,
    PLAYER_RADIUS: 11,
    NPC_RADIUS: 10,
    ENTER_VEHICLE_RADIUS: 58,
    WANTED_MAX_STARS: 5,
    WANTED_DECAY_DELAY: 12.0,
    WANTED_DECAY_RATE: 14.0
  };
});
