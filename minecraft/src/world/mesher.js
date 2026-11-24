import {
  CHUNK_SIZE,
  CHUNK_HEIGHT,
  BLOCK,
  BLOCK_DEFS,
  isSolidBlock,
  isTransparentBlock,
} from '../core/constants.js';

export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 4;

/**
 * 6 faces in CCW outward-facing order.
 * Each face defines:
 *  - dir: outward normal
 *  - faceType: 0=top, 1=bottom, 2=side
 *  - shade: directional sunlight base factor
 *  - corners: 4 vertices [dx, dy, dz, u, v, aoSide1, aoSide2, aoCorner]
 */
const FACES = [
  {
    // +Y Top
    dir: [0, 1, 0],
    faceType: 0,
    shade: 1.0,
    corners: [
      { pos: [0, 1, 0], uv: [0, 0], s1: [-1, 1, 0], s2: [0, 1, -1], c: [-1, 1, -1] },
      { pos: [0, 1, 1], uv: [0, 1], s1: [-1, 1, 0], s2: [0, 1, 1], c: [-1, 1, 1] },
      { pos: [1, 1, 1], uv: [1, 1], s1: [1, 1, 0], s2: [0, 1, 1], c: [1, 1, 1] },
      { pos: [1, 1, 0], uv: [1, 0], s1: [1, 1, 0], s2: [0, 1, -1], c: [1, 1, -1] },
    ],
  },
  {
    // -Y Bottom
    dir: [0, -1, 0],
    faceType: 1,
    shade: 0.55,
    corners: [
      { pos: [0, 0, 1], uv: [0, 1], s1: [-1, -1, 0], s2: [0, -1, 1], c: [-1, -1, 1] },
      { pos: [0, 0, 0], uv: [0, 0], s1: [-1, -1, 0], s2: [0, -1, -1], c: [-1, -1, -1] },
      { pos: [1, 0, 0], uv: [1, 0], s1: [1, -1, 0], s2: [0, -1, -1], c: [1, -1, -1] },
      { pos: [1, 0, 1], uv: [1, 1], s1: [1, -1, 0], s2: [0, -1, 1], c: [1, -1, 1] },
    ],
  },
  {
    // +X East
    dir: [1, 0, 0],
    faceType: 2,
    shade: 0.82,
    corners: [
      { pos: [1, 0, 1], uv: [0, 1], s1: [1, -1, 0], s2: [1, 0, 1], c: [1, -1, 1] },
      { pos: [1, 0, 0], uv: [1, 1], s1: [1, -1, 0], s2: [1, 0, -1], c: [1, -1, -1] },
      { pos: [1, 1, 0], uv: [1, 0], s1: [1, 1, 0], s2: [1, 0, -1], c: [1, 1, -1] },
      { pos: [1, 1, 1], uv: [0, 0], s1: [1, 1, 0], s2: [1, 0, 1], c: [1, 1, 1] },
    ],
  },
  {
    // -X West
    dir: [-1, 0, 0],
    faceType: 2,
    shade: 0.72,
    corners: [
      { pos: [0, 0, 0], uv: [0, 1], s1: [-1, -1, 0], s2: [-1, 0, -1], c: [-1, -1, -1] },
      { pos: [0, 0, 1], uv: [1, 1], s1: [-1, -1, 0], s2: [-1, 0, 1], c: [-1, -1, 1] },
      { pos: [0, 1, 1], uv: [1, 0], s1: [-1, 1, 0], s2: [-1, 0, 1], c: [-1, 1, 1] },
      { pos: [0, 1, 0], uv: [0, 0], s1: [-1, 1, 0], s2: [-1, 0, -1], c: [-1, 1, -1] },
    ],
  },
  {
    // +Z South
    dir: [0, 0, 1],
    faceType: 2,
    shade: 0.88,
    corners: [
      { pos: [0, 0, 1], uv: [0, 1], s1: [-1, 0, 1], s2: [0, -1, 1], c: [-1, -1, 1] },
      { pos: [1, 0, 1], uv: [1, 1], s1: [1, 0, 1], s2: [0, -1, 1], c: [1, -1, 1] },
      { pos: [1, 1, 1], uv: [1, 0], s1: [1, 0, 1], s2: [0, 1, 1], c: [1, 1, 1] },
      { pos: [0, 1, 1], uv: [0, 0], s1: [-1, 0, 1], s2: [0, 1, 1], c: [-1, 1, 1] },
    ],
  },
  {
    // -Z North
    dir: [0, 0, -1],
    faceType: 2,
    shade: 0.76,
    corners: [
      { pos: [1, 0, 0], uv: [0, 1], s1: [1, 0, -1], s2: [0, -1, -1], c: [1, -1, -1] },
      { pos: [0, 0, 0], uv: [1, 1], s1: [-1, 0, -1], s2: [0, -1, -1], c: [-1, -1, -1] },
      { pos: [0, 1, 0], uv: [1, 0], s1: [-1, 0, -1], s2: [0, 1, -1], c: [-1, 1, -1] },
      { pos: [1, 1, 0], uv: [0, 0], s1: [1, 0, -1], s2: [0, 1, -1], c: [1, 1, -1] },
    ],
  },
];

const AO_CURVE = [1.0, 0.82, 0.66, 0.48];

function vertexAO(side1, side2, corner) {
  if (side1 && side2) return AO_CURVE[3];
  return AO_CURVE[(side1 ? 1 : 0) + (side2 ? 1 : 0) + (corner ? 1 : 0)];
}

/**
 * Builds face-culled, AO-lit vertex arrays for a chunk.
 * Vertex stride = 6 floats: [x, y, z, u, v, light]
 * Separates opaque geometry from transparent (water/glass) geometry.
 */
export function buildChunkMesh(chunk, getWorldBlock) {
  const opaque = [];
  const transparent = [];

  const ox = chunk.cx * CHUNK_SIZE;
  const oz = chunk.cz * CHUNK_SIZE;

  const tileU = 1 / ATLAS_COLS;
  const tileV = 1 / ATLAS_ROWS;
  const padU = tileU * 0.015;
  const padV = tileV * 0.015;

  const isOccluder = (wx, wy, wz) => {
    const id = getWorldBlock(wx, wy, wz);
    return isSolidBlock(id) && !isTransparentBlock(id);
  };

  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const blockId = chunk.getBlock(lx, y, lz);
        if (blockId === BLOCK.AIR) continue;

        const def = BLOCK_DEFS[blockId];
        if (!def) continue;

        const wx = ox + lx;
        const wz = oz + lz;
        const target = def.transparent ? transparent : opaque;
        const isWater = blockId === BLOCK.WATER;
        const emissiveBoost = def.emissive ? 1.25 : 1.0;

        for (let f = 0; f < 6; f++) {
          const face = FACES[f];
          const nx = wx + face.dir[0];
          const ny = y + face.dir[1];
          const nz = wz + face.dir[2];

          const neighbor = getWorldBlock(nx, ny, nz);

          // Face culling rules:
          // - Opaque blocks cull against opaque neighbors
          // - Transparent blocks cull against identical neighbors or opaque neighbors
          if (!def.transparent) {
            if (!isTransparentBlock(neighbor)) continue;
          } else {
            if (neighbor === blockId) continue;
            if (isWater && neighbor !== BLOCK.AIR && !isTransparentBlock(neighbor)) continue;
          }

          const tileIdx = def.tiles[face.faceType];
          const col = tileIdx % ATLAS_COLS;
          const row = Math.floor(tileIdx / ATLAS_COLS);
          const u0 = col * tileU + padU;
          const v0 = row * tileV + padV;
          const uSpan = tileU - padU * 2;
          const vSpan = tileV - padV * 2;

          const verts = new Array(4);
          const aos = new Array(4);

          for (let c = 0; c < 4; c++) {
            const corner = face.corners[c];
            let vx = wx + corner.pos[0];
            let vy = y + corner.pos[1];
            let vz = wz + corner.pos[2];

            // Lower water surface slightly when air is above
            if (isWater && corner.pos[1] === 1 && getWorldBlock(wx, y + 1, wz) !== BLOCK.WATER) {
              vy -= 0.14;
            }

            let ao = 1.0;
            if (!def.transparent && !def.emissive) {
              const s1 = isOccluder(wx + corner.s1[0], y + corner.s1[1], wz + corner.s1[2]);
              const s2 = isOccluder(wx + corner.s2[0], y + corner.s2[1], wz + corner.s2[2]);
              const cr = isOccluder(wx + corner.c[0], y + corner.c[1], wz + corner.c[2]);
              ao = vertexAO(s1, s2, cr);
            }
            aos[c] = ao;

            const light = Math.min(1.25, face.shade * ao * emissiveBoost);
            const u = u0 + corner.uv[0] * uSpan;
            const v = v0 + corner.uv[1] * vSpan;
            verts[c] = [vx, vy, vz, u, v, light];
          }

          // Flip quad diagonal to eliminate AO interpolation artifacts
          const indices =
            aos[0] + aos[2] > aos[1] + aos[3]
              ? [0, 1, 2, 0, 2, 3]
              : [1, 2, 3, 1, 3, 0];

          for (let i = 0; i < 6; i++) {
            const vert = verts[indices[i]];
            target.push(vert[0], vert[1], vert[2], vert[3], vert[4], vert[5]);
          }
        }
      }
    }
  }

  return {
    opaque: new Float32Array(opaque),
    transparent: new Float32Array(transparent),
    opaqueVertices: opaque.length / 6,
    transparentVertices: transparent.length / 6,
  };
}
