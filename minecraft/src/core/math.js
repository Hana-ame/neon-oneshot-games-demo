/**
 * Lightweight 3D math utilities (column-major Float32Array matrices for WebGL).
 */

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function mod(n, m) {
  return ((n % m) + m) % m;
}

export function vec3Length(x, y, z) {
  return Math.hypot(x, y, z);
}

export function vec3Normalize(x, y, z) {
  const len = Math.hypot(x, y, z);
  if (len === 0) return [0, 0, 0];
  return [x / len, y / len, z / len];
}

export function mat4Identity() {
  const out = new Float32Array(16);
  out[0] = 1;
  out[5] = 1;
  out[10] = 1;
  out[15] = 1;
  return out;
}

export function mat4Perspective(fovRad, aspect, near, far) {
  const out = new Float32Array(16);
  const f = 1.0 / Math.tan(fovRad / 2);
  const nf = 1 / (near - far);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = 2 * far * near * nf;
  return out;
}

export function mat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    const b0 = b[col * 4];
    const b1 = b[col * 4 + 1];
    const b2 = b[col * 4 + 2];
    const b3 = b[col * 4 + 3];
    out[col * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[col * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[col * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[col * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return out;
}

/**
 * First-person camera view matrix from position (x,y,z), yaw (around Y), pitch (around X).
 * Forward direction at yaw=0, pitch=0 is (0, 0, -1).
 */
export function mat4FirstPersonView(x, y, z, yaw, pitch) {
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);

  // Camera basis vectors
  const fx = -sy * cp;
  const fy = sp;
  const fz = -cy * cp;

  const rx = cy;
  const ry = 0;
  const rz = -sy;

  const ux = ry * fz - rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy - ry * fx;

  const out = new Float32Array(16);
  out[0] = rx;
  out[1] = ux;
  out[2] = -fx;
  out[3] = 0;

  out[4] = ry;
  out[5] = uy;
  out[6] = -fy;
  out[7] = 0;

  out[8] = rz;
  out[9] = uz;
  out[10] = -fz;
  out[11] = 0;

  out[12] = -(rx * x + ry * y + rz * z);
  out[13] = -(ux * x + uy * y + uz * z);
  out[14] = fx * x + fy * y + fz * z;
  out[15] = 1;
  return out;
}

export function getLookDirection(yaw, pitch) {
  const cp = Math.cos(pitch);
  return [
    -Math.sin(yaw) * cp,
    Math.sin(pitch),
    -Math.cos(yaw) * cp,
  ];
}

export function aabbIntersects(aMin, aMax, bMin, bMax) {
  return (
    aMin[0] < bMax[0] &&
    aMax[0] > bMin[0] &&
    aMin[1] < bMax[1] &&
    aMax[1] > bMin[1] &&
    aMin[2] < bMax[2] &&
    aMax[2] > bMin[2]
  );
}
