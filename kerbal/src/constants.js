(function (root) {
  'use strict';

  // Kerbin & Mun physical constants (authentic KSP scale)
  const PHYSICS = {
    G: 6.67430e-11,
    g0: 9.80665, // Standard gravity for Isp calculation (m/s^2)
    KERBIN: {
      name: 'Kerbin',
      radius: 600000,         // 600 km
      mu: 3.5316000e12,       // GM (m^3/s^2), surface g ≈ 9.81 m/s^2
      atmosphereHeight: 70000,// 70 km
      seaLevelDensity: 1.225, // kg/m^3
      scaleHeight: 5600,      // m
      rotationPeriod: 21549.425 // s
    },
    MUN: {
      name: 'Mun',
      radius: 200000,         // 200 km
      mu: 6.5138398e10,       // GM (m^3/s^2)
      orbitRadius: 12000000,  // 12,000 km from Kerbin center
      soiRadius: 2429559,     // ~2,430 km Sphere of Influence
      initialAngle: 0.95      // radians
    }
  };

  // Part Catalog for VAB Rocket Builder
  // Mass in kg, thrust in N, isp in seconds, height/width in visual px units (1 px ≈ 0.15 m)
  const PARTS = {
    mk1_pod: {
      id: 'mk1_pod',
      name: 'Mk1 指令舱',
      category: 'pod',
      dryMass: 840,
      fuelMass: 0,
      thrust: 0,
      ispVac: 0,
      ispAtm: 0,
      dragCoeff: 0.22,
      area: 1.2,
      width: 24,
      height: 26,
      color: '#cfd8dc',
      accent: '#37474f',
      isPod: true,
      description: '单人载人指令舱，内置基础陀螺仪（SAS）与防热盾。'
    },
    parachute_mk16: {
      id: 'parachute_mk16',
      name: 'Mk16 降落伞',
      category: 'aero',
      dryMass: 100,
      fuelMass: 0,
      thrust: 0,
      ispVac: 0,
      ispAtm: 0,
      dragCoeff: 0.15,
      chuteDragArea: 85,
      area: 0.6,
      width: 16,
      height: 12,
      color: '#ef5350',
      accent: '#eceff1',
      isParachute: true,
      description: '再入大气层后展开减速，确保指令舱安全着陆。'
    },
    nose_cone: {
      id: 'nose_cone',
      name: '气动整流罩',
      category: 'aero',
      dryMass: 80,
      fuelMass: 0,
      thrust: 0,
      ispVac: 0,
      ispAtm: 0,
      dragCoeff: 0.10,
      area: 0.8,
      width: 24,
      height: 20,
      color: '#eceff1',
      accent: '#ff7043',
      isNoseCone: true,
      description: '流线型头部整流罩，有效降低跨音速气动阻力。'
    },
    tank_t200: {
      id: 'tank_t200',
      name: 'FL-T200 燃料箱',
      category: 'fuel',
      dryMass: 125,
      fuelMass: 1000,
      thrust: 0,
      ispVac: 0,
      ispAtm: 0,
      dragCoeff: 0.20,
      area: 1.2,
      width: 26,
      height: 26,
      color: '#f5f5f5',
      accent: '#263238',
      isTank: true,
      description: '轻型液氧/煤油燃料箱，适合上面级轨道机动。'
    },
    tank_t400: {
      id: 'tank_t400',
      name: 'FL-T400 燃料箱',
      category: 'fuel',
      dryMass: 250,
      fuelMass: 2000,
      thrust: 0,
      ispVac: 0,
      ispAtm: 0,
      dragCoeff: 0.20,
      area: 1.2,
      width: 26,
      height: 44,
      color: '#eceff1',
      accent: '#37474f',
      isTank: true,
      description: '标准中型液体燃料箱，近地轨道主力储箱。'
    },
    tank_t800: {
      id: 'tank_t800',
      name: 'FL-T800 大型燃料箱',
      category: 'fuel',
      dryMass: 500,
      fuelMass: 4000,
      thrust: 0,
      ispVac: 0,
      ispAtm: 0,
      dragCoeff: 0.20,
      area: 1.4,
      width: 28,
      height: 68,
      color: '#e0e7ef',
      accent: '#ff8f00',
      isTank: true,
      description: '大容量液体燃料箱，为芯一级或奔月级提供充沛推进剂。'
    },
    engine_terrier: {
      id: 'engine_terrier',
      name: 'LV-909 “梗犬”发动机',
      category: 'engine',
      dryMass: 500,
      fuelMass: 0,
      thrust: 60000,   // 60 kN
      ispVac: 345,
      ispAtm: 85,
      dragCoeff: 0.25,
      area: 1.0,
      width: 22,
      height: 18,
      color: '#546e7a',
      accent: '#ff7043',
      isEngine: true,
      throttleable: true,
      description: '高真空比冲上面级发动机，适合轨道圆化与地月转移。'
    },
    engine_swivel: {
      id: 'engine_swivel',
      name: 'LV-T45 “转环”发动机',
      category: 'engine',
      dryMass: 1500,
      fuelMass: 0,
      thrust: 215000,  // 215 kN
      ispVac: 320,
      ispAtm: 250,
      dragCoeff: 0.28,
      area: 1.2,
      width: 26,
      height: 24,
      color: '#455a64',
      accent: '#ffa726',
      isEngine: true,
      throttleable: true,
      description: '带推力矢量控制的液体主发动机，大气与真空表现均衡。'
    },
    engine_reliant: {
      id: 'engine_reliant',
      name: 'LV-T30 “信赖”大推力机',
      category: 'engine',
      dryMass: 1250,
      fuelMass: 0,
      thrust: 240000,  // 240 kN
      ispVac: 310,
      ispAtm: 265,
      dragCoeff: 0.28,
      area: 1.2,
      width: 26,
      height: 24,
      color: '#37474f',
      accent: '#ef5350',
      isEngine: true,
      throttleable: true,
      description: '海平面高推重比一级液体发动机，起飞加速迅猛。'
    },
    srb_hammer: {
      id: 'srb_hammer',
      name: 'RT-10 “重锤”固推器',
      category: 'engine',
      dryMass: 750,
      fuelMass: 2810,
      thrust: 227000,  // 227 kN
      ispVac: 195,
      ispAtm: 170,
      dragCoeff: 0.30,
      area: 1.3,
      width: 26,
      height: 52,
      color: '#fafafa',
      accent: '#d32f2f',
      isEngine: true,
      isSolid: true,
      throttleable: false,
      description: '固体燃料助推器，点火后无法关机，提供廉价起飞大推力。'
    },
    decoupler_td12: {
      id: 'decoupler_td12',
      name: 'TD-12 级间分离器',
      category: 'aero',
      dryMass: 40,
      fuelMass: 0,
      thrust: 0,
      ispVac: 0,
      ispAtm: 0,
      dragCoeff: 0.18,
      area: 1.2,
      width: 26,
      height: 10,
      color: '#ffb300',
      accent: '#263238',
      isDecoupler: true,
      description: '按下空格分级时抛离下方已耗尽的助推级，大幅减轻干重。'
    }
  };

  // Preset Rockets (top-to-bottom stack order)
  const PRESETS = {
    hopper: {
      id: 'hopper',
      name: '亚轨道探空箭 Mk-I',
      subtitle: '入门练习 · 突破卡门线 (70km)',
      parts: [
        'parachute_mk16',
        'mk1_pod',
        'decoupler_td12',
        'tank_t400',
        'engine_swivel'
      ]
    },
    orbiter: {
      id: 'orbiter',
      name: '坎巴拉轨道器 Mk-II',
      subtitle: '两级构型 · 轻松进入 Kerbin 稳定轨道',
      parts: [
        'parachute_mk16',
        'mk1_pod',
        'decoupler_td12',
        'tank_t400',
        'engine_terrier',
        'decoupler_td12',
        'tank_t800',
        'tank_t400',
        'engine_reliant'
      ]
    },
    munar: {
      id: 'munar',
      name: '穆恩探月者 Mk-III',
      subtitle: '三级重型 · 具备高轨与飞掠穆恩能力',
      parts: [
        'parachute_mk16',
        'mk1_pod',
        'decoupler_td12',
        'tank_t400',
        'engine_terrier',
        'decoupler_td12',
        'tank_t800',
        'engine_swivel',
        'decoupler_td12',
        'tank_t800',
        'tank_t800',
        'engine_reliant'
      ]
    }
  };

  const CATEGORIES = [
    { id: 'pod', label: '指令舱' },
    { id: 'fuel', label: '燃料箱' },
    { id: 'engine', label: '发动机' },
    { id: 'aero', label: '分离与气动' }
  ];

  const KSPConstants = { PHYSICS, PARTS, PRESETS, CATEGORIES };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = KSPConstants;
  } else {
    root.KSP = root.KSP || {};
    root.KSP.Constants = KSPConstants;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
