(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GooLevels = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const LEVELS = [
    {
      id: 1,
      name: '初遇管道',
      subtitle: 'Chapter 1 · 向上搭建三角形高塔',
      hint: '拖拽爬行的黑色黏黏球，靠近已有结构会出现虚线连接，松手即可搭建。把塔搭到上方发光管道附近，自由黏黏球就会被吸入！',
      width: 1100,
      height: 660,
      gravity: 520,
      wind: 0,
      windGust: 0,
      targetCount: 4,
      ocdTarget: 7,
      theme: {
        skyTop: '#0d1b2a',
        skyBottom: '#1b3b4b',
        hillFar: '#132a38',
        hillNear: '#0e202b',
        groundFill: '#1a242c',
        groundTop: '#3a5a40',
        accent: '#7bf1a8'
      },
      pipe: { x: 550, y: 185, suctionRadius: 105, mouthRadius: 28 },
      platforms: [
        { x: 0, y: 540, w: 1100, h: 120, type: 'ground' }
      ],
      initialNodes: [
        { id: 1, x: 460, y: 526, type: 'black', pinned: true, state: 'structural' },
        { id: 2, x: 550, y: 526, type: 'black', pinned: true, state: 'structural' },
        { id: 3, x: 640, y: 526, type: 'black', pinned: true, state: 'structural' },
        { id: 4, x: 505, y: 452, type: 'black', pinned: false, state: 'structural' },
        { id: 5, x: 595, y: 452, type: 'black', pinned: false, state: 'structural' }
      ],
      initialStrands: [
        [1, 2], [2, 3], [1, 4], [2, 4], [2, 5], [3, 5], [4, 5]
      ],
      walkers: [
        { type: 'black', count: 14 }
      ]
    },
    {
      id: 2,
      name: '跨越深渊',
      subtitle: 'Chapter 2 · 建造悬臂与拱桥跨越峡谷',
      hint: '利用三角形桁架向右延伸跨越峡谷，注意底部配重和拱形支撑，避免桥梁因重力折断！',
      width: 1100,
      height: 660,
      gravity: 520,
      wind: 0,
      windGust: 0,
      targetCount: 5,
      ocdTarget: 8,
      theme: {
        skyTop: '#161b33',
        skyBottom: '#3a3052',
        hillFar: '#26213d',
        hillNear: '#1b182e',
        groundFill: '#1f1c2c',
        groundTop: '#5e548e',
        accent: '#f4a261'
      },
      pipe: { x: 875, y: 405, suctionRadius: 110, mouthRadius: 28 },
      platforms: [
        { x: 0, y: 495, w: 360, h: 165, type: 'ground' },
        { x: 740, y: 495, w: 360, h: 165, type: 'ground' }
      ],
      initialNodes: [
        { id: 1, x: 170, y: 481, type: 'black', pinned: true, state: 'structural' },
        { id: 2, x: 255, y: 481, type: 'black', pinned: true, state: 'structural' },
        { id: 3, x: 340, y: 481, type: 'black', pinned: true, state: 'structural' },
        { id: 4, x: 212, y: 406, type: 'black', pinned: false, state: 'structural' },
        { id: 5, x: 298, y: 406, type: 'black', pinned: false, state: 'structural' }
      ],
      initialStrands: [
        [1, 2], [2, 3], [1, 4], [2, 4], [2, 5], [3, 5], [4, 5]
      ],
      walkers: [
        { type: 'black', count: 22 }
      ]
    },
    {
      id: 3,
      name: '绿球循环桥',
      subtitle: 'Chapter 3 · 可拆解的常春藤绿球',
      hint: '绿色黏黏球即使已经接入结构，也可以再次拖拽拆下来重复利用！用它们灵活调整重心并接通对岸管道。',
      width: 1100,
      height: 660,
      gravity: 510,
      wind: 0,
      windGust: 0,
      targetCount: 5,
      ocdTarget: 8,
      theme: {
        skyTop: '#0b2520',
        skyBottom: '#1f5146',
        hillFar: '#143831',
        hillNear: '#0e2923',
        groundFill: '#172824',
        groundTop: '#52b788',
        accent: '#95d5b2'
      },
      pipe: { x: 890, y: 315, suctionRadius: 110, mouthRadius: 28 },
      platforms: [
        { x: 0, y: 500, w: 340, h: 160, type: 'ground' },
        { x: 510, y: 540, w: 120, h: 120, type: 'ground' },
        { x: 770, y: 420, w: 330, h: 240, type: 'ground' }
      ],
      initialNodes: [
        { id: 1, x: 165, y: 486, type: 'black', pinned: true, state: 'structural' },
        { id: 2, x: 248, y: 486, type: 'black', pinned: true, state: 'structural' },
        { id: 3, x: 325, y: 486, type: 'black', pinned: true, state: 'structural' },
        { id: 4, x: 206, y: 412, type: 'green', pinned: false, state: 'structural' },
        { id: 5, x: 288, y: 412, type: 'green', pinned: false, state: 'structural' }
      ],
      initialStrands: [
        [1, 2], [2, 3], [1, 4], [2, 4], [2, 5], [3, 5], [4, 5]
      ],
      walkers: [
        { type: 'green', count: 16 },
        { type: 'black', count: 8 }
      ]
    },
    {
      id: 4,
      name: '逆风高塔',
      subtitle: 'Chapter 4 · 阵风环境下的抗弯桁架',
      hint: '山谷中持续吹着向右的阵风！请先把底座加宽做稳，再逐层向上搭建高塔直达高空管道。',
      width: 1100,
      height: 660,
      gravity: 520,
      wind: 32,
      windGust: 24,
      targetCount: 5,
      ocdTarget: 8,
      theme: {
        skyTop: '#1b263b',
        skyBottom: '#415a77',
        hillFar: '#273852',
        hillNear: '#1d2b40',
        groundFill: '#1e242b',
        groundTop: '#778da9',
        accent: '#e0fbfc'
      },
      pipe: { x: 585, y: 150, suctionRadius: 108, mouthRadius: 28 },
      platforms: [
        { x: 240, y: 545, w: 620, h: 115, type: 'ground' }
      ],
      initialNodes: [
        { id: 1, x: 430, y: 531, type: 'black', pinned: true, state: 'structural' },
        { id: 2, x: 520, y: 531, type: 'black', pinned: true, state: 'structural' },
        { id: 3, x: 610, y: 531, type: 'black', pinned: true, state: 'structural' },
        { id: 4, x: 700, y: 531, type: 'black', pinned: true, state: 'structural' },
        { id: 5, x: 475, y: 458, type: 'black', pinned: false, state: 'structural' },
        { id: 6, x: 565, y: 458, type: 'black', pinned: false, state: 'structural' },
        { id: 7, x: 655, y: 458, type: 'black', pinned: false, state: 'structural' }
      ],
      initialStrands: [
        [1, 2], [2, 3], [3, 4],
        [1, 5], [2, 5], [2, 6], [3, 6], [3, 7], [4, 7],
        [5, 6], [6, 7]
      ],
      walkers: [
        { type: 'black', count: 16 },
        { type: 'green', count: 6 }
      ]
    },
    {
      id: 5,
      name: '气球悬桥',
      subtitle: 'Chapter 5 · 浮力气球与尖刺深渊',
      hint: '下方红色区域是尖刺陷阱！把粉色气球挂在桥梁节点上提供向上浮力，托起桥梁直抵右上方管道。',
      width: 1100,
      height: 660,
      gravity: 520,
      wind: 0,
      windGust: 0,
      targetCount: 5,
      ocdTarget: 8,
      theme: {
        skyTop: '#231942',
        skyBottom: '#5e548e',
        hillFar: '#382a63',
        hillNear: '#271d47',
        groundFill: '#241e33',
        groundTop: '#be95c4',
        accent: '#ff70a6'
      },
      pipe: { x: 880, y: 270, suctionRadius: 112, mouthRadius: 28 },
      platforms: [
        { x: 0, y: 470, w: 320, h: 190, type: 'ground' },
        { x: 320, y: 615, w: 460, h: 45, type: 'hazard' },
        { x: 780, y: 430, w: 320, h: 230, type: 'ground' }
      ],
      initialNodes: [
        { id: 1, x: 145, y: 456, type: 'black', pinned: true, state: 'structural' },
        { id: 2, x: 225, y: 456, type: 'black', pinned: true, state: 'structural' },
        { id: 3, x: 300, y: 456, type: 'black', pinned: true, state: 'structural' },
        { id: 4, x: 185, y: 382, type: 'black', pinned: false, state: 'structural' },
        { id: 5, x: 262, y: 382, type: 'black', pinned: false, state: 'structural' }
      ],
      initialStrands: [
        [1, 2], [2, 3], [1, 4], [2, 4], [2, 5], [3, 5], [4, 5]
      ],
      walkers: [
        { type: 'black', count: 16 },
        { type: 'balloon', count: 5 },
        { type: 'green', count: 5 }
      ]
    }
  ];

  return {
    LEVELS,
    getLevelById(id) {
      return LEVELS.find(l => l.id === id) || LEVELS[0];
    }
  };
});
