// Deterministic PRNG (Mulberry32) and 2D Math / Geometry Utilities

export function createRng(seed = Date.now()) {
  let state = (seed >>> 0) || 1;
  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(min, max) {
      return Math.floor(this.next() * (max - min + 1)) + min;
    },
    pick(arr) {
      return arr[Math.floor(this.next() * arr.length)];
    },
    shuffle(arr) {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(this.next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    }
  };
}

export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

export function distSq(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

export function dist(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

export function normalize(x, y) {
  const len = Math.hypot(x, y);
  if (len < 1e-8) return { x: 0, y: 0 };
  return { x: x / len, y: y / len };
}

export function angleBetween(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

export function circleIntersectsCircle(ax, ay, ar, bx, by, br) {
  const r = ar + br;
  return distSq(ax, ay, bx, by) <= r * r;
}

export function circleIntersectsRect(cx, cy, cr, rx, ry, rw, rh) {
  const closestX = clamp(cx, rx, rx + rw);
  const closestY = clamp(cy, ry, ry + rh);
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy < cr * cr;
}

export function resolveCircleRect(cx, cy, cr, rx, ry, rw, rh) {
  const closestX = clamp(cx, rx, rx + rw);
  const closestY = clamp(cy, ry, ry + rh);
  const dx = cx - closestX;
  const dy = cy - closestY;
  const d2 = dx * dx + dy * dy;
  if (d2 >= cr * cr) return { x: cx, y: cy, hit: false };

  if (d2 > 1e-6) {
    const d = Math.sqrt(d2);
    const overlap = cr - d;
    return {
      x: cx + (dx / d) * overlap,
      y: cy + (dy / d) * overlap,
      hit: true
    };
  }
  // Center is inside rect; push out via shortest axis
  const left = cx - rx;
  const right = rx + rw - cx;
  const top = cy - ry;
  const bottom = ry + rh - cy;
  const minPen = Math.min(left, right, top, bottom);
  if (minPen === left) return { x: rx - cr, y: cy, hit: true };
  if (minPen === right) return { x: rx + rw + cr, y: cy, hit: true };
  if (minPen === top) return { x: cx, y: ry - cr, hit: true };
  return { x: cx, y: ry + rh + cr, hit: true };
}
