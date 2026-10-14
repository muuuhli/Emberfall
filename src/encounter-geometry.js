// These shapes are shared by encounter damage and telegraph rendering.
// All dimensions are world units; angles are radians. A ring's gapWidth is
// its full safe angle, while a segment's width is its capsule radius. The
// optional gapAngles array names multiple safe gaps of that same full width.
const TAU = Math.PI * 2;
const ANGLE_EPSILON = Number.EPSILON * 16;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const nonnegative = value => finite(value) && value >= 0;

export function wrapAngle(angle) {
  if (!finite(angle)) return NaN;
  let wrapped = angle % TAU;
  if (wrapped >= Math.PI) wrapped -= TAU;
  if (wrapped < -Math.PI) wrapped += TAU;
  return wrapped;
}

/** Inclusive angular sector. The angle wraps across both ends of ±π. */
export function containsAngle(angle, center, halfAngle) {
  if (!finite(angle) || !finite(center) || !nonnegative(halfAngle)) return false;
  return halfAngle >= Math.PI || Math.abs(wrapAngle(angle - center)) <= halfAngle + ANGLE_EPSILON;
}

function validShape(shape) {
  if (!shape || typeof shape !== 'object') return false;
  if (shape.kind === 'segment') return [shape.x1, shape.y1, shape.x2, shape.y2].every(finite) && nonnegative(shape.width);
  if (!finite(shape.x) || !finite(shape.y)) return false;
  if (shape.kind === 'circle') return nonnegative(shape.radius);
  if (shape.kind === 'annulus') return nonnegative(shape.innerRadius) && nonnegative(shape.outerRadius)
    && shape.innerRadius <= shape.outerRadius && (shape.gapWidth === undefined || nonnegative(shape.gapWidth))
    && (shape.gapAngle === undefined || finite(shape.gapAngle))
    && (shape.gapAngles === undefined || Array.isArray(shape.gapAngles) && shape.gapAngles.length > 0 && shape.gapAngles.length <= 8 && shape.gapAngles.every(finite));
  if (shape.kind === 'cone') return finite(shape.angle) && nonnegative(shape.length) && nonnegative(shape.halfAngle);
  return false;
}

// Relative floating-point slack retains an authored edge after trig/projection
// rounding. A zero-radius shape still requires its exact center point.
function atMost(value, edge) {
  return value <= edge || edge > 0 && value - edge <= Number.EPSILON * 8 * Math.max(Math.abs(value), Math.abs(edge));
}

/** Test a center point against the real shape, including its damaging edges.
 * Annulus gap edges belong to the safe gap. Neither argument is modified.
 */
export function hitShape(shape, point) {
  if (!validShape(shape) || !point || !finite(point.x) || !finite(point.y)) return false;
  if (shape.kind === 'segment') {
    const dx = shape.x2 - shape.x1, dy = shape.y2 - shape.y1, lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - shape.x1) * dx + (point.y - shape.y1) * dy) / lengthSquared)) : 0;
    const distanceX = point.x - (shape.x1 + t * dx), distanceY = point.y - (shape.y1 + t * dy);
    return atMost(distanceX * distanceX + distanceY * distanceY, shape.width * shape.width);
  }
  const dx = point.x - shape.x, dy = point.y - shape.y, distanceSquared = dx * dx + dy * dy;
  if (shape.kind === 'circle') return atMost(distanceSquared, shape.radius * shape.radius);
  if (shape.kind === 'annulus') {
    if (!atMost(shape.innerRadius * shape.innerRadius, distanceSquared) || !atMost(distanceSquared, shape.outerRadius * shape.outerRadius)) return false;
    const gapWidth = shape.gapWidth || 0;
    if (!gapWidth) return true;
    if (distanceSquared === 0 || gapWidth >= TAU) return false;
    return !(shape.gapAngles ?? [shape.gapAngle ?? 0]).some(angle => containsAngle(Math.atan2(dy, dx), angle, gapWidth / 2));
  }
  return atMost(distanceSquared, shape.length * shape.length)
    && (distanceSquared === 0 || containsAngle(Math.atan2(dy, dx), shape.angle, shape.halfAngle));
}

/** The dangerous angular spans of an annulus, for the real Canvas path. Gaps
 * may wrap, overlap or cover the ring; no decorative bridge crosses a refuge.
 * Single-gap spans preserve their original start/end angles.
 */
export function annulusDangerArcs(shape) {
  if (shape?.kind !== 'annulus' || !validShape(shape)) return [];
  const gap = Math.min(shape.gapWidth || 0, TAU);
  if (!gap) return [[0, TAU]];
  if (gap >= TAU) return [];
  const angles = shape.gapAngles ?? [shape.gapAngle ?? 0];
  if (angles.length === 1) return [[angles[0] + gap / 2, angles[0] + TAU - gap / 2]];
  // Retain the authored single-gap origin. All other centers are made relative
  // to it, keeping large equivalent angles out of the union calculation.
  const first = wrapAngle(angles[0]), start = first + gap / 2, end = start + TAU;
  const gaps = [];
  for (const angle of angles) {
    const center = first + wrapAngle(wrapAngle(angle) - first);
    for (const turn of [-1, 0, 1, 2]) {
      const left = Math.max(start, center + turn * TAU - gap / 2), right = Math.min(end, center + turn * TAU + gap / 2);
      if (right > left) gaps.push([left, right]);
    }
  }
  gaps.sort((a, b) => a[0] - b[0]);
  const arcs = []; let cursor = start;
  for (const [left, right] of gaps) {
    if (left > cursor + ANGLE_EPSILON) arcs.push([cursor, left]);
    cursor = Math.max(cursor, right);
  }
  if (end > cursor + ANGLE_EPSILON) arcs.push([cursor, end]);
  return arcs;
}

/** Conservative world bounds for culling and placement. Invalid shapes return null. */
export function shapeBounds(shape) {
  if (!validShape(shape)) return null;
  if (shape.kind === 'segment') return {
    x: Math.min(shape.x1, shape.x2) - shape.width,
    y: Math.min(shape.y1, shape.y2) - shape.width,
    w: Math.abs(shape.x2 - shape.x1) + shape.width * 2,
    h: Math.abs(shape.y2 - shape.y1) + shape.width * 2,
  };
  const radius = shape.kind === 'circle' ? shape.radius : shape.kind === 'annulus' ? shape.outerRadius : shape.length;
  return { x: shape.x - radius, y: shape.y - radius, w: radius * 2, h: radius * 2 };
}
