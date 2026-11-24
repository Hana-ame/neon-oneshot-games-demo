(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GooMath = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function clamp(val, min, max) {
    return val < min ? min : val > max ? max : val;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function distSq(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return dx * dx + dy * dy;
  }

  function dist(x1, y1, x2, y2) {
    return Math.hypot(x2 - x1, y2 - y1);
  }

  function normalize(x, y) {
    const len = Math.hypot(x, y);
    if (len < 1e-8) return { x: 0, y: 0, len: 0 };
    return { x: x / len, y: y / len, len };
  }

  /**
   * Project point P(px, py) onto segment AB(x1,y1)-(x2,y2).
   * Returns { x, y, t, dist }.
   */
  function closestPointOnSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    let t = 0;
    if (lenSq > 1e-8) {
      t = clamp(((px - x1) * dx + (py - y1) * dy) / lenSq, 0, 1);
    }
    const cx = x1 + t * dx;
    const cy = y1 + t * dy;
    return { x: cx, y: cy, t, dist: Math.hypot(px - cx, py - cy) };
  }

  /**
   * Check whether segment AB intersects an axis-aligned rectangle (AABB).
   */
  function segmentIntersectsRect(x1, y1, x2, y2, rect) {
    const minX = rect.x;
    const maxX = rect.x + rect.w;
    const minY = rect.y;
    const maxY = rect.y + rect.h;

    let t0 = 0;
    let t1 = 1;
    const dx = x2 - x1;
    const dy = y2 - y1;

    const p = [-dx, dx, -dy, dy];
    const q = [x1 - minX, maxX - x1, y1 - minY, maxY - y1];

    for (let i = 0; i < 4; i++) {
      if (Math.abs(p[i]) < 1e-9) {
        if (q[i] < 0) return false;
      } else {
        const r = q[i] / p[i];
        if (p[i] < 0) {
          if (r > t1) return false;
          if (r > t0) t0 = r;
        } else {
          if (r < t0) return false;
          if (r < t1) t1 = r;
        }
      }
    }
    return t0 <= t1;
  }

  /**
   * Resolve circle (cx, cy, r) against AABB rect {x, y, w, h}.
   * Returns null if no collision, or { nx, ny, penetration, cx, cy }.
   */
  function circleRectCollision(cx, cy, r, rect) {
    const nearestX = clamp(cx, rect.x, rect.x + rect.w);
    const nearestY = clamp(cy, rect.y, rect.y + rect.h);
    const dx = cx - nearestX;
    const dy = cy - nearestY;
    const dSq = dx * dx + dy * dy;

    if (dSq >= r * r) return null;

    if (dSq > 1e-8) {
      const d = Math.sqrt(dSq);
      const nx = dx / d;
      const ny = dy / d;
      const penetration = r - d;
      return { nx, ny, penetration, cx: cx + nx * penetration, cy: cy + ny * penetration };
    }

    // Center is inside the rectangle: push out along shallowest axis
    const left = cx - rect.x;
    const right = rect.x + rect.w - cx;
    const top = cy - rect.y;
    const bottom = rect.y + rect.h - cy;
    const minPen = Math.min(left, right, top, bottom);

    if (minPen === top) {
      return { nx: 0, ny: -1, penetration: top + r, cx, cy: rect.y - r };
    } else if (minPen === bottom) {
      return { nx: 0, ny: 1, penetration: bottom + r, cx, cy: rect.y + rect.h + r };
    } else if (minPen === left) {
      return { nx: -1, ny: 0, penetration: left + r, cx: rect.x - r, cy };
    }
    return { nx: 1, ny: 0, penetration: right + r, cx: rect.x + rect.w + r, cy };
  }

  return {
    clamp,
    lerp,
    distSq,
    dist,
    normalize,
    closestPointOnSegment,
    segmentIntersectsRect,
    circleRectCollision
  };
});
