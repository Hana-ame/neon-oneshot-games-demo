import { TILE, TEX_SIZE } from './constants.js';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function seededNoise(x, y, seed = 1) {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Generates procedural 64x64 pixel-art wall textures and sprite sheets
 * entirely in memory without external image dependencies.
 */
export function createTextureAtlas() {
  const walls = {};

  // 1: TECH_WALL (brushed steel panels with rivets & warning stripe)
  walls[TILE.TECH_WALL] = buildTexture((ctx) => {
    ctx.fillStyle = '#475569';
    ctx.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const v = Math.floor((seededNoise(x, y, 1) - 0.5) * 18);
        ctx.fillStyle = `rgb(${74 + v},${85 + v},${104 + v})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, 60, 60);
    ctx.strokeRect(6, 6, 52, 24);
    ctx.strokeRect(6, 34, 52, 24);
    // Rivets
    ctx.fillStyle = '#94a3b8';
    for (const rx of [9, 53]) {
      for (const ry of [9, 27, 37, 55]) {
        ctx.fillRect(rx, ry, 2, 2);
      }
    }
    // Hazard stripe at bottom
    ctx.fillStyle = '#ca8a04';
    ctx.fillRect(2, 57, 60, 5);
    ctx.fillStyle = '#111827';
    for (let i = 0; i < 64; i += 10) {
      ctx.fillRect(i, 57, 5, 5);
    }
  });

  // 2: BRICK_WALL (weathered industrial stone bricks)
  walls[TILE.BRICK_WALL] = buildTexture((ctx) => {
    ctx.fillStyle = '#292524';
    ctx.fillRect(0, 0, 64, 64);
    const brickH = 16;
    const brickW = 32;
    for (let row = 0; row < 4; row++) {
      const offset = (row % 2) * 16;
      for (let col = -1; col < 3; col++) {
        const bx = col * brickW + offset;
        const by = row * brickH;
        const shade = Math.floor(seededNoise(col + 5, row + 3, 2) * 24);
        ctx.fillStyle = `rgb(${115 + shade},${62 + Math.floor(shade * 0.5)},${52 + Math.floor(shade * 0.4)})`;
        ctx.fillRect(bx + 1, by + 1, brickW - 2, brickH - 2);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(bx + 1, by + 1, brickW - 2, 2);
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(bx + 1, by + brickH - 3, brickW - 2, 2);
      }
    }
  });

  // 3: COMPUTER_WALL (UAC sci-fi server console with glowing CRT & LEDs)
  walls[TILE.COMPUTER_WALL] = buildTexture((ctx) => {
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, 60, 60);
    // CRT Screen
    ctx.fillStyle = '#052e16';
    ctx.fillRect(8, 8, 48, 26);
    ctx.strokeStyle = '#64748b';
    ctx.strokeRect(8, 8, 48, 26);
    // Waveform lines
    ctx.fillStyle = '#22c55e';
    for (let x = 11; x < 53; x += 2) {
      const h = Math.floor(Math.sin(x * 0.4) * 6 + 18);
      ctx.fillRect(x, h, 2, 2);
    }
    ctx.fillStyle = '#4ade80';
    ctx.fillRect(12, 12, 18, 2);
    ctx.fillRect(12, 28, 28, 2);
    // Control panel & blinking LEDs
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(8, 40, 48, 16);
    const leds = ['#ef4444', '#eab308', '#22c55e', '#38bdf8', '#ef4444', '#22c55e'];
    leds.forEach((c, idx) => {
      ctx.fillStyle = c;
      ctx.fillRect(12 + idx * 7, 44, 4, 4);
    });
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(12, 51, 40, 2);
  });

  // 4: HELL_STONE (crimson infernal basalt with glowing lava veins)
  walls[TILE.HELL_STONE] = buildTexture((ctx) => {
    ctx.fillStyle = '#3b0a0a';
    ctx.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 2) {
      for (let x = 0; x < 64; x += 2) {
        const n = seededNoise(x, y, 4);
        ctx.fillStyle = n > 0.72 ? '#7f1d1d' : n > 0.35 ? '#450a0a' : '#260606';
        ctx.fillRect(x, y, 2, 2);
      }
    }
    // Glowing lava cracks
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(18, 22);
    ctx.lineTo(12, 44);
    ctx.lineTo(24, 64);
    ctx.moveTo(46, 0);
    ctx.lineTo(38, 28);
    ctx.lineTo(52, 50);
    ctx.lineTo(44, 64);
    ctx.stroke();
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  // 5/6/7: DOORS (blast door with optional blue/red keycard trim)
  const buildDoor = (accent) =>
    buildTexture((ctx) => {
      ctx.fillStyle = '#52525b';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#27272a';
      ctx.fillRect(0, 0, 6, 64);
      ctx.fillRect(58, 0, 6, 64);
      // Center seam
      ctx.fillStyle = '#18181b';
      ctx.fillRect(30, 0, 4, 64);
      // Recessed panels
      ctx.fillStyle = '#3f3f46';
      ctx.fillRect(10, 8, 16, 48);
      ctx.fillRect(38, 8, 16, 48);
      // Key trim
      ctx.fillStyle = accent;
      ctx.fillRect(6, 4, 52, 5);
      ctx.fillRect(6, 55, 52, 5);
      ctx.fillRect(26, 26, 12, 12);
      ctx.fillStyle = '#09090b';
      ctx.fillRect(29, 29, 6, 6);
    });

  walls[TILE.DOOR] = buildDoor('#eab308');
  walls[TILE.DOOR_BLUE] = buildDoor('#3b82f6');
  walls[TILE.DOOR_RED] = buildDoor('#ef4444');

  // 8: EXIT_SWITCH (UAC Exit elevator panel)
  walls[TILE.EXIT_SWITCH] = buildTexture((ctx) => {
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(6, 6, 52, 52);
    // EXIT sign
    ctx.fillStyle = '#991b1b';
    ctx.fillRect(12, 10, 40, 14);
    ctx.fillStyle = '#fef08a';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('EXIT', 32, 21);
    // Big glowing switch button
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(20, 30, 24, 24);
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(24, 34, 16, 16);
    ctx.fillStyle = '#bbf7d0';
    ctx.fillRect(26, 36, 6, 6);
  });

  // 9: PILLAR_WALL (fluted dark steel support column)
  walls[TILE.PILLAR_WALL] = buildTexture((ctx) => {
    ctx.fillStyle = '#27272a';
    ctx.fillRect(0, 0, 64, 64);
    for (let x = 4; x < 64; x += 8) {
      ctx.fillStyle = '#52525b';
      ctx.fillRect(x, 0, 4, 64);
      ctx.fillStyle = '#71717a';
      ctx.fillRect(x, 0, 1, 64);
    }
    ctx.fillStyle = '#18181b';
    ctx.fillRect(0, 0, 64, 6);
    ctx.fillRect(0, 58, 64, 6);
  });

  const sprites = {
    enemies: {
      TROOPER: buildEnemySprites('#64748b', '#94a3b8', '#ef4444', 'trooper'),
      IMP: buildEnemySprites('#92400e', '#b45309', '#f97316', 'imp'),
      DEMON: buildEnemySprites('#be123c', '#fb7185', '#fef08a', 'demon'),
      BARON: buildEnemySprites('#991b1b', '#dc2626', '#4ade80', 'baron'),
    },
    pickups: buildPickupSprites(),
  };

  return { walls, sprites };
}

function buildTexture(drawFn) {
  const c = makeCanvas(TEX_SIZE, TEX_SIZE);
  const ctx = c.getContext('2d');
  drawFn(ctx);
  return c;
}

function buildEnemySprites(primary, secondary, accent, kind) {
  const makeFrame = (mode) => {
    const c = makeCanvas(64, 64);
    const ctx = c.getContext('2d');

    if (mode === 'dead') {
      ctx.fillStyle = '#7f1d1d';
      ctx.beginPath();
      ctx.ellipse(32, 54, 22, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = primary;
      ctx.fillRect(14, 46, 36, 10);
      ctx.fillStyle = secondary;
      ctx.fillRect(20, 44, 14, 8);
      return c;
    }

    const bodyColor = mode === 'pain' ? '#ffffff' : primary;
    const trimColor = mode === 'pain' ? '#fca5a5' : secondary;
    const eyeColor = mode === 'attack' ? '#fef08a' : accent;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(32, 60, 18, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs
    const legShift = mode === 'walk2' ? 3 : 0;
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(20, 44 + legShift, 9, 16 - legShift);
    ctx.fillRect(35, 44 + (3 - legShift), 9, 16 - (3 - legShift));

    // Torso
    ctx.fillStyle = bodyColor;
    ctx.fillRect(16, 20, 32, 26);
    ctx.fillStyle = trimColor;
    ctx.fillRect(20, 24, 24, 16);

    // Horns for Imp / Baron
    if (kind === 'imp' || kind === 'baron') {
      ctx.fillStyle = '#fef3c7';
      ctx.fillRect(18, 4, 4, 10);
      ctx.fillRect(42, 4, 4, 10);
    }

    // Head
    ctx.fillStyle = kind === 'trooper' ? '#475569' : bodyColor;
    ctx.fillRect(22, 8, 20, 14);
    // Eyes
    ctx.fillStyle = eyeColor;
    ctx.fillRect(25, 13, 4, 3);
    ctx.fillRect(35, 13, 4, 3);

    // Arms & Attack glow
    ctx.fillStyle = trimColor;
    if (mode === 'attack') {
      ctx.fillRect(8, 18, 8, 18);
      ctx.fillRect(48, 18, 8, 18);
      ctx.fillStyle = eyeColor;
      ctx.beginPath();
      ctx.arc(32, 28, 8, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(10, 22, 6, 18);
      ctx.fillRect(48, 22, 6, 18);
    }

    return c;
  };

  return {
    walk1: makeFrame('walk1'),
    walk2: makeFrame('walk2'),
    attack: makeFrame('attack'),
    pain: makeFrame('pain'),
    dead: makeFrame('dead'),
  };
}

function buildPickupSprites() {
  const sprites = {};

  const makeSprite = (drawFn) => {
    const c = makeCanvas(48, 48);
    const ctx = c.getContext('2d');
    drawFn(ctx);
    return c;
  };

  sprites.MEDKIT = makeSprite((ctx) => {
    ctx.fillStyle = '#e5e7eb';
    ctx.fillRect(10, 18, 28, 22);
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 18, 28, 22);
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(21, 22, 6, 14);
    ctx.fillRect(17, 26, 14, 6);
  });

  sprites.STIMPACK = makeSprite((ctx) => {
    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(16, 22, 16, 18);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(22, 25, 4, 12);
    ctx.fillRect(18, 29, 12, 4);
  });

  sprites.ARMOR = makeSprite((ctx) => {
    ctx.fillStyle = '#15803d';
    ctx.fillRect(12, 14, 24, 26);
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(16, 18, 16, 18);
    ctx.fillStyle = '#86efac';
    ctx.fillRect(20, 22, 8, 6);
  });

  sprites.AMMO_BULLETS = makeSprite((ctx) => {
    ctx.fillStyle = '#713f12';
    ctx.fillRect(14, 20, 20, 20);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(17, 16, 4, 8);
    ctx.fillRect(22, 16, 4, 8);
    ctx.fillRect(27, 16, 4, 8);
  });

  sprites.AMMO_SHELLS = makeSprite((ctx) => {
    ctx.fillStyle = '#991b1b';
    ctx.fillRect(12, 22, 24, 18);
    ctx.fillStyle = '#f97316';
    for (let x = 14; x <= 30; x += 6) {
      ctx.fillRect(x, 24, 4, 12);
    }
    ctx.fillStyle = '#fde047';
    for (let x = 14; x <= 30; x += 6) {
      ctx.fillRect(x, 34, 4, 3);
    }
  });

  sprites.AMMO_CELLS = makeSprite((ctx) => {
    ctx.fillStyle = '#0369a1';
    ctx.fillRect(14, 18, 20, 22);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(18, 22, 12, 14);
    ctx.fillStyle = '#e0f2fe';
    ctx.fillRect(21, 25, 6, 8);
  });

  sprites.WEAPON_SHOTGUN = makeSprite((ctx) => {
    ctx.fillStyle = '#78350f';
    ctx.fillRect(6, 26, 14, 8);
    ctx.fillStyle = '#52525b';
    ctx.fillRect(18, 24, 24, 5);
    ctx.fillStyle = '#a1a1aa';
    ctx.fillRect(20, 29, 14, 4);
  });

  sprites.WEAPON_PLASMA = makeSprite((ctx) => {
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(8, 22, 32, 12);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(14, 25, 22, 6);
    ctx.fillStyle = '#e0f2fe';
    ctx.fillRect(34, 26, 6, 4);
  });

  const makeKey = (color, glow) =>
    makeSprite((ctx) => {
      ctx.fillStyle = glow;
      ctx.fillRect(14, 16, 20, 24);
      ctx.fillStyle = color;
      ctx.fillRect(16, 18, 16, 20);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(19, 22, 10, 4);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(19, 30, 10, 3);
    });

  sprites.KEY_BLUE = makeKey('#2563eb', '#93c5fd');
  sprites.KEY_RED = makeKey('#dc2626', '#fca5a5');

  return sprites;
}
