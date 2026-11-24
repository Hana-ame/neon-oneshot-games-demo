import { mat4Perspective, mat4FirstPersonView, mat4Multiply, lerp } from '../core/math.js';
import { buildChunkMesh } from '../world/mesher.js';

const VOXEL_VS = `
attribute vec3 aPos;
attribute vec2 aUV;
attribute float aLight;

uniform mat4 uMVP;
uniform vec3 uCamPos;

varying vec2 vUV;
varying float vLight;
varying float vDist;

void main() {
  gl_Position = uMVP * vec4(aPos, 1.0);
  vUV = aUV;
  vLight = aLight;
  vDist = length(aPos - uCamPos);
}
`;

const VOXEL_FS = `
precision mediump float;

uniform sampler2D uAtlas;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uDayLight;

varying vec2 vUV;
varying float vLight;
varying float vDist;

void main() {
  vec4 tex = texture2D(uAtlas, vUV);
  if (tex.a < 0.1) discard;
  float ambient = mix(0.24, 1.0, uDayLight);
  float lit = vLight > 1.05 ? vLight : vLight * ambient;
  vec3 color = tex.rgb * min(1.25, lit);
  float fogFactor = clamp((vDist - uFogNear) / max(1.0, (uFogFar - uFogNear)), 0.0, 1.0);
  vec3 finalColor = mix(color, uFogColor, fogFactor);
  gl_FragColor = vec4(finalColor, tex.a);
}
`;

const LINE_VS = `
attribute vec3 aPos;
uniform mat4 uMVP;
void main() {
  gl_Position = uMVP * vec4(aPos, 1.0);
}
`;

const LINE_FS = `
precision mediump float;
uniform vec4 uColor;
void main() {
  gl_FragColor = uColor;
}
`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const msg = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${msg}`);
  }
  return shader;
}

function createProgram(gl, vsSrc, fsSrc) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const msg = gl.getProgramInfoLog(prog);
    throw new Error(`Program link error: ${msg}`);
  }
  return prog;
}

function createSelectionCubeVertices() {
  const e = 0.004;
  const min = -e;
  const max = 1 + e;
  const p = [
    [min, min, min], [max, min, min], [max, max, min], [min, max, min],
    [min, min, max], [max, min, max], [max, max, max], [min, max, max],
  ];
  const edges = [
    0, 1, 1, 2, 2, 3, 3, 0,
    4, 5, 5, 6, 6, 7, 7, 4,
    0, 4, 1, 5, 2, 6, 3, 7,
  ];
  const verts = new Float32Array(edges.length * 3);
  for (let i = 0; i < edges.length; i++) {
    const pt = p[edges[i]];
    verts[i * 3] = pt[0];
    verts[i * 3 + 1] = pt[1];
    verts[i * 3 + 2] = pt[2];
  }
  return verts;
}

export class VoxelRenderer {
  constructor(canvas, atlasCanvas) {
    this.canvas = canvas;
    const gl =
      canvas.getContext('webgl', { antialias: false, alpha: false }) ||
      canvas.getContext('experimental-webgl');
    if (!gl) {
      throw new Error('WebGL is not supported in this browser.');
    }
    this.gl = gl;
    this.chunkBuffers = new Map();
    this.stats = { drawCalls: 0, triangles: 0, chunksRendered: 0 };

    this.voxelProg = createProgram(gl, VOXEL_VS, VOXEL_FS);
    this.voxelLoc = {
      aPos: gl.getAttribLocation(this.voxelProg, 'aPos'),
      aUV: gl.getAttribLocation(this.voxelProg, 'aUV'),
      aLight: gl.getAttribLocation(this.voxelProg, 'aLight'),
      uMVP: gl.getUniformLocation(this.voxelProg, 'uMVP'),
      uCamPos: gl.getUniformLocation(this.voxelProg, 'uCamPos'),
      uAtlas: gl.getUniformLocation(this.voxelProg, 'uAtlas'),
      uFogColor: gl.getUniformLocation(this.voxelProg, 'uFogColor'),
      uFogNear: gl.getUniformLocation(this.voxelProg, 'uFogNear'),
      uFogFar: gl.getUniformLocation(this.voxelProg, 'uFogFar'),
      uDayLight: gl.getUniformLocation(this.voxelProg, 'uDayLight'),
    };

    this.lineProg = createProgram(gl, LINE_VS, LINE_FS);
    this.lineLoc = {
      aPos: gl.getAttribLocation(this.lineProg, 'aPos'),
      uMVP: gl.getUniformLocation(this.lineProg, 'uMVP'),
      uColor: gl.getUniformLocation(this.lineProg, 'uColor'),
    };

    this.atlasTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.selBaseVerts = createSelectionCubeVertices();
    this.selBuffer = gl.createBuffer();

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  clearChunkBuffers() {
    const gl = this.gl;
    for (const buf of this.chunkBuffers.values()) {
      if (buf.opaqueBuf) gl.deleteBuffer(buf.opaqueBuf);
      if (buf.transBuf) gl.deleteBuffer(buf.transBuf);
    }
    this.chunkBuffers.clear();
  }

  uploadChunkMesh(chunk, world) {
    const gl = this.gl;
    const mesh = buildChunkMesh(chunk, (wx, wy, wz) => world.getBlock(wx, wy, wz));
    let entry = this.chunkBuffers.get(chunk.key);
    if (!entry) {
      entry = {
        opaqueBuf: gl.createBuffer(),
        transBuf: gl.createBuffer(),
        opaqueCount: 0,
        transCount: 0,
      };
      this.chunkBuffers.set(chunk.key, entry);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, entry.opaqueBuf);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.opaque, gl.STATIC_DRAW);
    entry.opaqueCount = mesh.opaqueVertices;

    gl.bindBuffer(gl.ARRAY_BUFFER, entry.transBuf);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.transparent, gl.STATIC_DRAW);
    entry.transCount = mesh.transparentVertices;

    chunk.dirty = false;
  }

  getSkyEnvironment(timeOfDay) {
    // timeOfDay: 0=midnight, 0.25=sunrise, 0.5=noon, 0.75=sunset
    const angle = timeOfDay * Math.PI * 2 - Math.PI / 2;
    const sunElev = Math.sin(angle); // -1..1
    const dayFactor = Math.max(0, Math.min(1, (sunElev + 0.25) / 0.85));
    const dusk = Math.max(0, 1 - Math.abs(sunElev) * 4.5);

    const nightSky = [0.05, 0.08, 0.16];
    const daySky = [0.49, 0.74, 0.98];
    const duskSky = [0.86, 0.48, 0.32];

    let r = lerp(nightSky[0], daySky[0], dayFactor);
    let g = lerp(nightSky[1], daySky[1], dayFactor);
    let b = lerp(nightSky[2], daySky[2], dayFactor);

    r = lerp(r, duskSky[0], dusk * 0.45);
    g = lerp(g, duskSky[1], dusk * 0.45);
    b = lerp(b, duskSky[2], dusk * 0.45);

    return { skyColor: [r, g, b], dayLight: dayFactor };
  }

  render(world, player, targetHit, options = {}) {
    const gl = this.gl;
    const renderRadius = options.renderRadius || 3;
    const timeOfDay = typeof options.timeOfDay === 'number' ? options.timeOfDay : 0.45;
    const fovDeg = options.fov || 70;

    // Rebuild up to 4 dirty chunks per frame to maintain smooth frame rate
    let rebuilt = 0;
    const [pcx, pcz] = world.worldToChunkCoords(player.x, player.z);

    for (let dz = -renderRadius; dz <= renderRadius; dz++) {
      for (let dx = -renderRadius; dx <= renderRadius; dx++) {
        const chunk = world.getChunk(pcx + dx, pcz + dz, true);
        if (chunk.dirty && rebuilt < 6) {
          this.uploadChunkMesh(chunk, world);
          rebuilt++;
        }
      }
    }

    const { skyColor, dayLight } = this.getSkyEnvironment(timeOfDay);
    gl.clearColor(skyColor[0], skyColor[1], skyColor[2], 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const aspect = this.canvas.width / Math.max(1, this.canvas.height);
    const proj = mat4Perspective((fovDeg * Math.PI) / 180, aspect, 0.08, 220);
    const eye = player.getEyePosition();
    const view = mat4FirstPersonView(eye[0], eye[1], eye[2], player.yaw, player.pitch);
    const mvp = mat4Multiply(proj, view);

    const fogFar = Math.max(36, renderRadius * 16 + 10);
    const fogNear = fogFar * 0.52;

    gl.useProgram(this.voxelProg);
    gl.uniformMatrix4fv(this.voxelLoc.uMVP, false, mvp);
    gl.uniform3f(this.voxelLoc.uCamPos, eye[0], eye[1], eye[2]);
    gl.uniform3f(this.voxelLoc.uFogColor, skyColor[0], skyColor[1], skyColor[2]);
    gl.uniform1f(this.voxelLoc.uFogNear, fogNear);
    gl.uniform1f(this.voxelLoc.uFogFar, fogFar);
    gl.uniform1f(this.voxelLoc.uDayLight, dayLight);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.uniform1i(this.voxelLoc.uAtlas, 0);

    gl.enableVertexAttribArray(this.voxelLoc.aPos);
    gl.enableVertexAttribArray(this.voxelLoc.aUV);
    gl.enableVertexAttribArray(this.voxelLoc.aLight);

    const stride = 6 * 4;
    let drawCalls = 0;
    let triangles = 0;
    let chunksRendered = 0;

    const visibleEntries = [];
    for (let dz = -renderRadius; dz <= renderRadius; dz++) {
      for (let dx = -renderRadius; dx <= renderRadius; dx++) {
        const key = `${pcx + dx},${pcz + dz}`;
        const entry = this.chunkBuffers.get(key);
        if (entry) visibleEntries.push(entry);
      }
    }

    // Pass 1: Opaque geometry
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    for (const entry of visibleEntries) {
      if (entry.opaqueCount === 0) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, entry.opaqueBuf);
      gl.vertexAttribPointer(this.voxelLoc.aPos, 3, gl.FLOAT, false, stride, 0);
      gl.vertexAttribPointer(this.voxelLoc.aUV, 2, gl.FLOAT, false, stride, 12);
      gl.vertexAttribPointer(this.voxelLoc.aLight, 1, gl.FLOAT, false, stride, 20);
      gl.drawArrays(gl.TRIANGLES, 0, entry.opaqueCount);
      drawCalls++;
      triangles += entry.opaqueCount / 3;
      chunksRendered++;
    }

    // Pass 2: Transparent geometry (water & glass)
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    for (const entry of visibleEntries) {
      if (entry.transCount === 0) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, entry.transBuf);
      gl.vertexAttribPointer(this.voxelLoc.aPos, 3, gl.FLOAT, false, stride, 0);
      gl.vertexAttribPointer(this.voxelLoc.aUV, 2, gl.FLOAT, false, stride, 12);
      gl.vertexAttribPointer(this.voxelLoc.aLight, 1, gl.FLOAT, false, stride, 20);
      gl.drawArrays(gl.TRIANGLES, 0, entry.transCount);
      drawCalls++;
      triangles += entry.transCount / 3;
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);

    // Pass 3: Selected block wireframe
    if (targetHit) {
      const verts = new Float32Array(this.selBaseVerts.length);
      for (let i = 0; i < verts.length; i += 3) {
        verts[i] = this.selBaseVerts[i] + targetHit.x;
        verts[i + 1] = this.selBaseVerts[i + 1] + targetHit.y;
        verts[i + 2] = this.selBaseVerts[i + 2] + targetHit.z;
      }
      gl.useProgram(this.lineProg);
      gl.uniformMatrix4fv(this.lineLoc.uMVP, false, mvp);
      gl.uniform4f(this.lineLoc.uColor, 0.08, 0.08, 0.08, 0.92);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.selBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.lineLoc.aPos);
      gl.vertexAttribPointer(this.lineLoc.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.LINES, 0, verts.length / 3);
      drawCalls++;
    }

    this.stats = { drawCalls, triangles: Math.round(triangles), chunksRendered };
  }
}
