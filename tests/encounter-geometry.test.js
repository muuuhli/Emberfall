import test from 'node:test';
import assert from 'node:assert/strict';
import { hitShape, shapeBounds, containsAngle, wrapAngle } from '../src/encounter-geometry.js';

const pointAt = (radius, angle, x = 0, y = 0) => ({ x: x + Math.cos(angle) * radius, y: y + Math.sin(angle) * radius });
const inBounds = (point, bounds) => point.x >= bounds.x - 1e-9 && point.x <= bounds.x + bounds.w + 1e-9
  && point.y >= bounds.y - 1e-9 && point.y <= bounds.y + bounds.h + 1e-9;

test('circle tests radial edges inclusively, rather than its enclosing square', () => {
  const shape = Object.freeze({ kind: 'circle', x: 40, y: -12, radius: 10 });
  assert.equal(hitShape(shape, { x: 40, y: -12 }), true);
  assert.equal(hitShape(shape, { x: 50, y: -12 }), true);
  assert.equal(hitShape(shape, { x: 50 + 1e-7, y: -12 }), false);
  assert.equal(hitShape(shape, { x: 49, y: -3 }), false);
  assert.deepEqual(shapeBounds(shape), { x: 30, y: -22, w: 20, h: 20 });
  for (let index = 0; index < 64; index++) assert.equal(hitShape(shape, pointAt(10, index * Math.PI / 32, 40, -12)), true);
  const zero = { kind: 'circle', x: 2, y: 3, radius: 0 };
  assert.equal(hitShape(zero, { x: 2, y: 3 }), true);
  assert.equal(hitShape(zero, { x: 2 + 1e-8, y: 3 }), false);
});

test('an annulus has an actual safe center and inclusive inner and outer damaging edges', () => {
  const shape = Object.freeze({ kind: 'annulus', x: 0, y: 0, innerRadius: 10, outerRadius: 20 });
  assert.equal(hitShape(shape, { x: 0, y: 0 }), false);
  assert.equal(hitShape(shape, { x: 9.999, y: 0 }), false);
  assert.equal(hitShape(shape, { x: 10, y: 0 }), true);
  assert.equal(hitShape(shape, { x: 20, y: 0 }), true);
  assert.equal(hitShape(shape, { x: 20.001, y: 0 }), false);
  assert.deepEqual(shapeBounds(shape), { x: -20, y: -20, w: 40, h: 40 });
  assert.equal(hitShape({ ...shape, gapAngle: Math.PI, gapWidth: 0 }, { x: -15, y: 0 }), true);
});

test('the full ring gap angle and both gap edges are safe, including wrapping through ±π', () => {
  const shape = Object.freeze({ kind: 'annulus', x: 0, y: 0, innerRadius: 10, outerRadius: 20, gapAngle: Math.PI - .1, gapWidth: .8 });
  const leftEdge = shape.gapAngle - shape.gapWidth / 2, rightEdge = shape.gapAngle + shape.gapWidth / 2;
  for (const angle of [shape.gapAngle, Math.PI, -Math.PI, leftEdge, rightEdge, rightEdge - Math.PI * 2]) {
    assert.equal(hitShape(shape, pointAt(15, angle)), false, `Safe angle ${angle}`);
  }
  assert.equal(hitShape(shape, pointAt(15, leftEdge - 1e-7)), true);
  assert.equal(hitShape(shape, pointAt(15, rightEdge + 1e-7)), true);
  assert.equal(hitShape(shape, pointAt(15, 0)), true);
  assert.equal(hitShape({ ...shape, gapAngle: -Math.PI + .1 }, pointAt(15, Math.PI - .1)), false);
  assert.equal(hitShape({ ...shape, gapWidth: Math.PI * 2 }, pointAt(15, 0)), false);
  assert.equal(hitShape({ ...shape, gapAngle: undefined }, pointAt(15, 0)), false);
  assert.equal(hitShape({ ...shape, innerRadius: 0 }, { x: 0, y: 0 }), false);
});

test('cones include their forward sides and tip while rejecting behind, distant and outside-angle points', () => {
  const shape = Object.freeze({ kind: 'cone', x: 0, y: 0, angle: 0, length: 20, halfAngle: Math.PI / 4 });
  assert.equal(hitShape(shape, { x: 0, y: 0 }), true);
  assert.equal(hitShape(shape, { x: 20, y: 0 }), true);
  assert.equal(hitShape(shape, pointAt(20, shape.halfAngle)), true);
  assert.equal(hitShape(shape, pointAt(20, -shape.halfAngle)), true);
  assert.equal(hitShape(shape, { x: -1, y: 0 }), false);
  assert.equal(hitShape(shape, { x: 20 + 1e-7, y: 0 }), false);
  assert.equal(hitShape(shape, pointAt(10, shape.halfAngle + 1e-7)), false);
  const wrapped = { ...shape, angle: Math.PI - .1, halfAngle: .3 };
  assert.equal(hitShape(wrapped, pointAt(10, -Math.PI + .1)), true);
  assert.equal(hitShape(wrapped, pointAt(10, 0)), false);
  assert.deepEqual(shapeBounds(shape), { x: -20, y: -20, w: 40, h: 40 });
  assert.equal(hitShape({ ...shape, halfAngle: Math.PI }, { x: -20, y: 0 }), true);
  assert.equal(hitShape({ ...shape, length: 0 }, { x: 0, y: 0 }), true);
});

test('segment width is its half-width and the real round endcaps exclude bounding-box corners', () => {
  const shape = Object.freeze({ kind: 'segment', x1: 0, y1: 0, x2: 10, y2: 0, width: 2 });
  for (const point of [{ x: 5, y: 2 }, { x: 5, y: -2 }, { x: -2, y: 0 }, { x: 12, y: 0 }]) assert.equal(hitShape(shape, point), true);
  for (const point of [{ x: 5, y: 2.001 }, { x: -2, y: 2 }, { x: 12, y: 2 }, { x: 12.001, y: 0 }]) assert.equal(hitShape(shape, point), false);
  assert.deepEqual(shapeBounds(shape), { x: -2, y: -2, w: 14, h: 4 });
  for (let index = 0; index < 32; index++) {
    assert.equal(hitShape(shape, pointAt(2, index * Math.PI / 16)), true);
    assert.equal(hitShape(shape, pointAt(2, index * Math.PI / 16, 10, 0)), true);
  }
});

test('diagonal and reversed capsules retain their radius around the projected line and both ends', () => {
  const shape = Object.freeze({ kind: 'segment', x1: -10, y1: -10, x2: 10, y2: 10, width: 3 });
  const reversed = { ...shape, x1: shape.x2, y1: shape.y2, x2: shape.x1, y2: shape.y1 };
  const normal = 3 / Math.sqrt(2);
  const cases = [
    [{ x: 0, y: 0 }, true], [{ x: normal, y: -normal }, true],
    [{ x: normal + .001, y: -normal - .001 }, false],
    [pointAt(3, -Math.PI * .75, -10, -10), true],
    [pointAt(3.001, -Math.PI * .75, -10, -10), false],
    [pointAt(3, Math.PI / 4, 10, 10), true], [{ x: -13, y: -13 }, false],
  ];
  for (const [point, expected] of cases) {
    assert.equal(hitShape(shape, point), expected);
    assert.equal(hitShape(reversed, point), expected);
  }
  assert.deepEqual(shapeBounds(shape), { x: -13, y: -13, w: 26, h: 26 });
  assert.deepEqual(shapeBounds(shape), shapeBounds(reversed));
});

test('a zero-length segment is a disk and a zero-width segment is a center line', () => {
  const disk = { kind: 'segment', x1: 5, y1: 7, x2: 5, y2: 7, width: 3 };
  assert.equal(hitShape(disk, { x: 5, y: 7 }), true);
  assert.equal(hitShape(disk, { x: 8, y: 7 }), true);
  assert.equal(hitShape(disk, { x: 8.001, y: 7 }), false);
  assert.deepEqual(shapeBounds(disk), { x: 2, y: 4, w: 6, h: 6 });
  const line = { kind: 'segment', x1: 0, y1: 0, x2: 10, y2: 10, width: 0 };
  assert.equal(hitShape(line, { x: 5, y: 5 }), true);
  assert.equal(hitShape(line, { x: 10, y: 10 }), true);
  assert.equal(hitShape(line, { x: 5, y: 5.000001 }), false);
  assert.equal(hitShape(line, { x: 11, y: 11 }), false);
  assert.deepEqual(shapeBounds(line), { x: 0, y: 0, w: 10, h: 10 });
});

test('every hit from a dense sample of all four translated shapes is inside conservative bounds', () => {
  const shapes = [
    { kind: 'circle', x: 18, y: -6, radius: 15 },
    { kind: 'annulus', x: 18, y: -6, innerRadius: 5, outerRadius: 15, gapAngle: -Math.PI + .2, gapWidth: 1.1 },
    { kind: 'cone', x: 18, y: -6, angle: 2.7, length: 15, halfAngle: .7 },
    { kind: 'segment', x1: 6, y1: -12, x2: 27, y2: 9, width: 4 },
  ].map(Object.freeze);
  for (const shape of shapes) {
    const before = JSON.stringify(shape), bounds = shapeBounds(shape); let hits = 0;
    for (let x = -10; x <= 50; x += .5) for (let y = -30; y <= 30; y += .5) {
      const point = Object.freeze({ x, y });
      if (hitShape(shape, point)) { hits++; assert.ok(inBounds(point, bounds), JSON.stringify({ shape, point, bounds })); }
    }
    assert.ok(hits > 50);
    assert.equal(JSON.stringify(shape), before);
  }
});

test('angle helpers wrap consistently and malformed shapes do not invent damage or bounds', () => {
  assert.equal(wrapAngle(Math.PI), -Math.PI);
  assert.equal(wrapAngle(-Math.PI), -Math.PI);
  assert.ok(Math.abs(wrapAngle(Math.PI * 6 + .2) - .2) < 1e-12);
  assert.equal(containsAngle(-Math.PI + .1, Math.PI - .1, .2), true);
  assert.equal(containsAngle(0, Math.PI, .2), false);
  for (const shape of [null, {}, { kind: 'imaginary', x: 0, y: 0 },
    { kind: 'circle', x: NaN, y: 0, radius: 3 }, { kind: 'circle', x: 0, y: 0, radius: -1 },
    { kind: 'annulus', x: 0, y: 0, innerRadius: 4, outerRadius: 3 },
    { kind: 'annulus', x: 0, y: 0, innerRadius: 1, outerRadius: 3, gapWidth: -1 },
    { kind: 'cone', x: 0, y: 0, angle: Infinity, halfAngle: .2, length: 3 },
    { kind: 'segment', x1: 0, y1: 0, x2: 3, y2: 3, width: -1 }]) {
    assert.equal(hitShape(shape, { x: 0, y: 0 }), false);
    assert.equal(shapeBounds(shape), null);
  }
  assert.equal(hitShape({ kind: 'circle', x: 0, y: 0, radius: 3 }, { x: Infinity, y: 0 }), false);
  assert.equal(containsAngle(0, 0, -1), false);
  assert.ok(Number.isNaN(wrapAngle(Infinity)));
});
