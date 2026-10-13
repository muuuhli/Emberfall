import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { ENEMY_TYPES, REGIONS } from '../src/content.js';

// A 20-pixel grid models the 24-pixel-wide player and the authored paths.
// Only cardinal edges whose midpoint is also collision-free may be traversed.
// This avoids claiming access through a diagonal corner or a thin obstacle.
let navigationCache;
function navigation() {
  if (navigationCache) return navigationCache;
  const game = new Game({ storage: { getItem: () => null, setItem: () => {} }, random: () => 0.5 });
  game.start();
  const step = 20;
  const offsetY = 10;
  const columns = Math.floor(game.world.width / step) + 1;
  const rows = Math.ceil(game.world.height / step);
  const passable = new Uint8Array(columns * rows);
  const reached = new Uint8Array(columns * rows);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      if (!game.collides(column * step, row * step + offsetY)) passable[row * columns + column] = 1;
    }
  }
  const startColumn = Math.round(game.player.x / step);
  const startRow = Math.round((game.player.y - offsetY) / step);
  const start = startRow * columns + startColumn;
  assert.equal(passable[start], 1, 'Player spawn must be collision-free');
  const queue = [start];
  reached[start] = 1;
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head];
    const column = index % columns;
    const row = Math.floor(index / columns);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nextColumn = column + dx;
      const nextRow = row + dy;
      if (nextColumn < 0 || nextColumn >= columns || nextRow < 0 || nextRow >= rows) continue;
      const next = nextRow * columns + nextColumn;
      if (!passable[next] || reached[next]) continue;
      if (game.collides((column + dx * 0.5) * step, (row + dy * 0.5) * step + offsetY)) continue;
      reached[next] = 1;
      queue.push(next);
    }
  }
  function approachable(object, radius, kind = null) {
    const column = Math.round(object.x / step);
    const row = Math.round((object.y - offsetY) / step);
    const padding = Math.ceil(radius / step);
    for (let y = Math.max(0, row - padding); y <= Math.min(rows - 1, row + padding); y++) {
      for (let x = Math.max(0, column - padding); x <= Math.min(columns - 1, column + padding); x++) {
        if (!reached[y * columns + x]) continue;
        const px = x * step;
        const py = y * step + offsetY;
        if (Math.hypot(px - object.x, py - object.y) >= radius) continue;
        if (!kind) return true;
        game.player.x = px;
        game.player.y = py;
        const nearby = game.nearby();
        if (nearby?.kind === kind && nearby.object.id === object.id) return true;
      }
    }
    return false;
  }
  navigationCache = { game, approachable, reachedCount: queue.length };
  return navigationCache;
}

test('every NPC, resource, crop, shrine and chest can be reached and selected from the village', () => {
  const { game, approachable, reachedCount } = navigation();
  assert.ok(reachedCount > 1000, 'The village must connect to the open world');
  const targets = [
    ...game.npcs.map(object => ({ kind: 'npc', object, radius: 85 })),
    ...game.world.nodes.map(object => ({ kind: 'node', object, radius: 65 })),
    ...game.world.plots.map(object => ({ kind: 'plot', object, radius: 48 })),
    ...game.world.chests.map(object => ({ kind: 'chest', object, radius: 60 })),
    ...game.world.shrines.map(object => ({ kind: 'shrine', object, radius: 80 })),
  ];
  const inaccessible = targets.filter(({ object, radius, kind }) => !approachable(object, radius, kind));
  assert.deepEqual(inaccessible.map(({ kind, object }) => `${kind}:${object.id} @ ${object.x},${object.y}`), []);
});

test('every authored enemy and boss has a collision-free melee approach', () => {
  const { game, approachable } = navigation();
  const inaccessible = game.world.enemies.filter(enemy => !approachable(enemy, 75));
  assert.deepEqual(inaccessible.map(enemy => `${enemy.type}:${enemy.id} @ ${enemy.x},${enemy.y}`), []);
  const bosses = game.world.enemies.filter(enemy => ENEMY_TYPES[enemy.type].boss);
  assert.equal(bosses.length, 3);
});

test('NPCs stand outside the opaque footprint of village buildings', () => {
  const { game } = navigation();
  const obscured = [];
  for (const npc of game.npcs) {
    const building = game.world.structures.find(structure => structure.blocking !== false && npc.x >= structure.x && npc.x <= structure.x + structure.w && npc.y >= structure.y && npc.y <= structure.y + structure.h);
    if (building) obscured.push(`${npc.name} inside ${building.name}`);
  }
  assert.deepEqual(obscured, []);
});

test('world drawing and gameplay use the same biome boundaries', () => {
  const { game } = navigation();
  for (const region of REGIONS) {
    const drawn = game.world.regions.find(candidate => candidate.id === region.id);
    assert.ok(drawn, `World includes ${region.id}`);
    assert.deepEqual(
      { x: drawn.x, y: drawn.y, w: drawn.w, h: drawn.h },
      { x: region.x, y: region.y, w: region.w, h: region.h },
      `${region.name} must be discovered where it is drawn`,
    );
  }
});
