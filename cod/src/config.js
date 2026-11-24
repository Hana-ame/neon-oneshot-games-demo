/**
 * Web COD — Operation Ironline
 * Core game configuration: weapons, maps, enemy archetypes, and killstreaks.
 */
(function (root) {
  'use strict';

  const WEAPONS = {
    m4a1: {
      id: 'm4a1',
      name: 'M4A1 突击步枪',
      shortName: 'M4A1',
      category: 'ASSAULT',
      damage: 28,
      headshotMultiplier: 2.0,
      fireRateMs: 105,
      magSize: 30,
      reserveAmmo: 150,
      reloadTimeMs: 1650,
      range: 22,
      falloffStart: 10,
      minDamageRatio: 0.6,
      pellets: 1,
      spreadHip: 0.032,
      spreadAds: 0.006,
      recoilKick: 0.022,
      adsFovFactor: 0.72,
      auto: true,
      moveSpeedFactor: 1.0,
      color: '#4b5563',
      accent: '#f59e0b'
    },
    mp5: {
      id: 'mp5',
      name: 'MP5 冲锋枪',
      shortName: 'MP5',
      category: 'SMG',
      damage: 21,
      headshotMultiplier: 1.8,
      fireRateMs: 72,
      magSize: 35,
      reserveAmmo: 175,
      reloadTimeMs: 1350,
      range: 16,
      falloffStart: 7,
      minDamageRatio: 0.45,
      pellets: 1,
      spreadHip: 0.042,
      spreadAds: 0.012,
      recoilKick: 0.016,
      adsFovFactor: 0.8,
      auto: true,
      moveSpeedFactor: 1.12,
      color: '#374151',
      accent: '#38bdf8'
    },
    m870: {
      id: 'm870',
      name: 'M870 战术霰弹枪',
      shortName: 'M870',
      category: 'SHOTGUN',
      damage: 16,
      headshotMultiplier: 1.5,
      fireRateMs: 680,
      magSize: 8,
      reserveAmmo: 40,
      reloadTimeMs: 2100,
      range: 11,
      falloffStart: 4.5,
      minDamageRatio: 0.25,
      pellets: 7,
      spreadHip: 0.11,
      spreadAds: 0.07,
      recoilKick: 0.065,
      adsFovFactor: 0.86,
      auto: false,
      moveSpeedFactor: 0.96,
      color: '#292524',
      accent: '#ef4444'
    },
    awp: {
      id: 'awp',
      name: 'AWP 狙击步枪',
      shortName: 'AWP',
      category: 'SNIPER',
      damage: 95,
      headshotMultiplier: 2.5,
      fireRateMs: 1150,
      magSize: 5,
      reserveAmmo: 25,
      reloadTimeMs: 2350,
      range: 32,
      falloffStart: 22,
      minDamageRatio: 0.85,
      pellets: 1,
      spreadHip: 0.085,
      spreadAds: 0.001,
      recoilKick: 0.085,
      adsFovFactor: 0.36,
      auto: false,
      scoped: true,
      moveSpeedFactor: 0.88,
      color: '#3f6212',
      accent: '#a3e635'
    }
  };

  const WEAPON_ORDER = ['m4a1', 'mp5', 'm870', 'awp'];

  const ENEMY_TYPES = {
    trooper: {
      id: 'trooper',
      name: '突击兵',
      maxHp: 100,
      speed: 2.05,
      fireRateMs: 780,
      damage: 11,
      accuracy: 0.58,
      sightRange: 14,
      attackRange: 9.5,
      score: 100,
      radius: 0.32,
      bodyColor: '#475569',
      armorColor: '#1e293b',
      visorColor: '#f97316'
    },
    heavy: {
      id: 'heavy',
      name: '重装兵',
      maxHp: 190,
      speed: 1.4,
      fireRateMs: 520,
      damage: 14,
      accuracy: 0.5,
      sightRange: 13,
      attackRange: 8.0,
      score: 200,
      radius: 0.38,
      bodyColor: '#334155',
      armorColor: '#0f172a',
      visorColor: '#ef4444'
    },
    sniper: {
      id: 'sniper',
      name: '狙击手',
      maxHp: 80,
      speed: 1.75,
      fireRateMs: 1650,
      damage: 26,
      accuracy: 0.78,
      sightRange: 19,
      attackRange: 16.0,
      score: 150,
      radius: 0.3,
      bodyColor: '#365314',
      armorColor: '#1a2e05',
      visorColor: '#22d3ee'
    }
  };

  const KILLSTREAKS = {
    uav: {
      id: 'uav',
      name: 'UAV 战术侦察机',
      requiredKills: 3,
      durationMs: 15000
    },
    airstrike: {
      id: 'airstrike',
      name: '精确空袭',
      requiredKills: 5,
      radius: 4.5,
      damage: 220
    }
  };

  // Wall tile legend:
  // 0 = empty, 1 = concrete bunker, 2 = shipping container (rust),
  // 3 = tactical hazard barrier, 4 = dark reinforced steel
  const MAPS = {
    killhouse: {
      id: 'killhouse',
      name: 'KILLHOUSE 杀戮屋',
      description: '经典近中距离CQB训练场，双侧包抄通道与中央集装箱掩体',
      playerSpawn: { x: 2.5, y: 2.5, angle: 0.6 },
      enemySpawns: [
        { x: 13.5, y: 2.5 },
        { x: 13.5, y: 13.5 },
        { x: 2.5, y: 13.5 },
        { x: 8.5, y: 13.5 },
        { x: 13.5, y: 8.5 },
        { x: 8.5, y: 2.5 }
      ],
      grid: [
        [4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4],
        [4,0,0,0,0,1,0,0,0,0,1,0,0,0,0,4],
        [4,0,0,0,0,1,0,0,0,0,1,0,0,0,0,4],
        [4,0,0,3,0,0,0,2,2,0,0,0,3,0,0,4],
        [4,0,0,3,0,0,0,0,0,0,0,0,3,0,0,4],
        [4,1,0,0,0,0,0,0,0,0,0,0,0,0,1,4],
        [4,0,0,0,2,0,0,3,3,0,0,2,0,0,0,4],
        [4,0,0,0,2,0,0,0,0,0,0,2,0,0,0,4],
        [4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4],
        [4,0,0,0,2,0,0,3,3,0,0,2,0,0,0,4],
        [4,1,0,0,0,0,0,0,0,0,0,0,0,0,1,4],
        [4,0,0,3,0,0,0,0,0,0,0,0,3,0,0,4],
        [4,0,0,3,0,0,0,2,2,0,0,0,3,0,0,4],
        [4,0,0,0,0,1,0,0,0,0,1,0,0,0,0,4],
        [4,0,0,0,0,1,0,0,0,0,1,0,0,0,0,4],
        [4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4]
      ]
    },
    cargoyard: {
      id: 'cargoyard',
      name: 'CARGO YARD 集装箱码头',
      description: '开阔中远距离港口阵地，适合步枪推进与狙击卡点',
      playerSpawn: { x: 2.5, y: 8.0, angle: 0.0 },
      enemySpawns: [
        { x: 13.5, y: 2.5 },
        { x: 13.5, y: 8.0 },
        { x: 13.5, y: 13.5 },
        { x: 9.5, y: 2.5 },
        { x: 9.5, y: 13.5 },
        { x: 6.5, y: 2.5 }
      ],
      grid: [
        [4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4],
        [4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4],
        [4,0,2,2,0,0,0,1,1,0,0,0,2,2,0,4],
        [4,0,2,0,0,0,0,0,0,0,0,0,0,2,0,4],
        [4,0,0,0,0,3,0,0,0,0,3,0,0,0,0,4],
        [4,0,0,0,0,3,0,2,2,0,3,0,0,0,0,4],
        [4,0,1,0,0,0,0,0,0,0,0,0,0,1,0,4],
        [4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4],
        [4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4],
        [4,0,1,0,0,0,0,0,0,0,0,0,0,1,0,4],
        [4,0,0,0,0,3,0,2,2,0,3,0,0,0,0,4],
        [4,0,0,0,0,3,0,0,0,0,3,0,0,0,0,4],
        [4,0,2,0,0,0,0,0,0,0,0,0,0,2,0,4],
        [4,0,2,2,0,0,0,1,1,0,0,0,2,2,0,4],
        [4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4],
        [4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4]
      ]
    }
  };

  const PLAYER_DEFAULTS = {
    maxHp: 100,
    maxArmor: 50,
    baseSpeed: 3.4,
    sprintMultiplier: 1.48,
    crouchMultiplier: 0.62,
    adsSpeedMultiplier: 0.65,
    radius: 0.28,
    regenDelayMs: 4000,
    regenRatePerSec: 18,
    baseFov: Math.PI / 3
  };

  const Config = {
    WEAPONS,
    WEAPON_ORDER,
    ENEMY_TYPES,
    KILLSTREAKS,
    MAPS,
    PLAYER_DEFAULTS
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Config;
  } else {
    root.WebCOD = root.WebCOD || {};
    root.WebCOD.Config = Config;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
