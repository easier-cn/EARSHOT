import test from 'node:test';
import assert from 'node:assert/strict';

import { generateLevel, TILE } from '../src/levelgen.js';
import { findPath, lineOfSight } from '../src/pathfind.js';
import { moveCircle } from '../src/entities.js';
import { CHAMBERS } from '../src/chambers.js';

const walkable = (lvl, tx, ty) =>
  tx >= 0 && ty >= 0 && tx < lvl.w && ty < lvl.h && lvl.grid[ty * lvl.w + tx] === 0;

function reachableFrom(lvl, sx, sy) {
  const seen = new Uint8Array(lvl.w * lvl.h);
  const queue = [[sx, sy]];
  seen[sy * lvl.w + sx] = 1;
  let head = 0;
  while (head < queue.length) {
    const [x, y] = queue[head++];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (!walkable(lvl, nx, ny)) continue;
      const i = ny * lvl.w + nx;
      if (seen[i]) continue;
      seen[i] = 1;
      queue.push([nx, ny]);
    }
  }
  return seen;
}

for (const cfg of CHAMBERS) {
  test(`chamber ${cfg.num} (${cfg.en}) is a connected, valid level`, () => {
    const lvl = generateLevel(cfg.seed, {
      shards: cfg.shards,
      hunters: cfg.hunters,
      style: cfg.style,
    });
    assert.equal(lvl.segments.length > 40, true, 'has wall segments');
    assert.equal(lvl.rooms.length >= 5, true, 'has rooms');
    assert.equal(lvl.shards.length, cfg.shards, 'spawns the requested shards');
    assert.equal(lvl.hunters.length, cfg.hunters, 'spawns the requested hunters');

    assert.equal(walkable(lvl, lvl.spawnTile.x, lvl.spawnTile.y), true, 'spawn is open');
    assert.equal(walkable(lvl, lvl.exitTile.x, lvl.exitTile.y), true, 'exit is open');

    const seen = reachableFrom(lvl, lvl.spawnTile.x, lvl.spawnTile.y);
    for (const shard of lvl.shards) {
      const tx = Math.floor(shard.x / TILE);
      const ty = Math.floor(shard.y / TILE);
      assert.equal(walkable(lvl, tx, ty), true, 'shard is on open floor');
      assert.equal(seen[ty * lvl.w + tx], 1, `shard ${shard.id} is reachable`);
    }
    assert.equal(seen[lvl.exitTile.y * lvl.w + lvl.exitTile.x], 1, 'exit is reachable');
    for (const h of lvl.hunters) {
      const tx = Math.floor(h.x / TILE);
      const ty = Math.floor(h.y / TILE);
      assert.equal(walkable(lvl, tx, ty), true, 'hunter is on open floor');
    }
  });
}

test('every room style generates a connected level', () => {
  for (const style of ['halls', 'cavern', 'warren', 'gallery']) {
    for (const seed of [101, 202, 303]) {
      const lvl = generateLevel(seed, { shards: 3, hunters: 2, style });
      assert.equal(lvl.style === style || lvl.style === 'halls', true, `${style} seeds`);
      const seen = reachableFrom(lvl, lvl.spawnTile.x, lvl.spawnTile.y);
      assert.equal(seen[lvl.exitTile.y * lvl.w + lvl.exitTile.x], 1, `${style} exit reachable`);
      for (const shard of lvl.shards) {
        const tx = Math.floor(shard.x / TILE);
        const ty = Math.floor(shard.y / TILE);
        assert.equal(seen[ty * lvl.w + tx], 1, `${style} shard reachable`);
      }
    }
  }
});

test('level generation is deterministic per seed', () => {
  const a = generateLevel(4409, { shards: 3, hunters: 2 });
  const b = generateLevel(4409, { shards: 3, hunters: 2 });
  assert.deepEqual(Array.from(a.grid), Array.from(b.grid));
  assert.deepEqual(a.shards, b.shards);
  assert.deepEqual(a.exit, b.exit);

  const c = generateLevel(4410, { shards: 3, hunters: 2 });
  assert.notDeepEqual(Array.from(a.grid), Array.from(c.grid));
});

test('A* finds a walkable path between reachable tiles', () => {
  const lvl = generateLevel(3313, { shards: 2, hunters: 1 });
  const path = findPath(
    lvl.grid,
    lvl.w,
    lvl.h,
    lvl.spawnTile.x,
    lvl.spawnTile.y,
    lvl.exitTile.x,
    lvl.exitTile.y,
  );
  assert.equal(path.length > 0, true, 'path exists');
  // findPath excludes the start tile and includes the goal.
  assert.equal(Math.max(
    Math.abs(path[0].x - lvl.spawnTile.x),
    Math.abs(path[0].y - lvl.spawnTile.y),
  ), 1, 'path starts next to the spawn');
  assert.deepEqual(path[path.length - 1], { x: lvl.exitTile.x, y: lvl.exitTile.y });
  for (let i = 1; i < path.length; i++) {
    const dx = Math.abs(path[i].x - path[i - 1].x);
    const dy = Math.abs(path[i].y - path[i - 1].y);
    assert.equal(Math.max(dx, dy), 1, 'path steps are adjacent');
    assert.equal(walkable(lvl, path[i].x, path[i].y), true, 'path stays on open floor');
  }
});

test('lineOfSight is symmetric and blocked by walls', () => {
  const lvl = generateLevel(1201, { shards: 1, hunters: 0 });
  const point = (tx, ty) => ({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE });
  let blockedPair = null;
  for (let ty = 0; ty < lvl.h && !blockedPair; ty++) {
    for (let tx = 0; tx < lvl.w; tx++) {
      if (walkable(lvl, tx, ty)) continue;
      // find open tiles on both sides of a wall column
      let left = tx - 1;
      while (left >= 0 && !walkable(lvl, left, ty)) left--;
      let right = tx + 1;
      while (right < lvl.w && !walkable(lvl, right, ty)) right++;
      if (left >= 0 && right < lvl.w && right - left > 1) {
        blockedPair = [point(left, ty), point(right, ty)];
        break;
      }
    }
  }
  assert.ok(blockedPair, 'found a wall to test against');
  const [a, b] = blockedPair;
  assert.equal(lineOfSight(lvl.grid, lvl.w, lvl.h, a.x, a.y, a.x, a.y, TILE), true);
  assert.equal(lineOfSight(lvl.grid, lvl.w, lvl.h, a.x, a.y, b.x, b.y, TILE), false);
  assert.equal(lineOfSight(lvl.grid, lvl.w, lvl.h, b.x, b.y, a.x, a.y, TILE), false);
});

test('moveCircle cannot pass through a wall', () => {
  const lvl = generateLevel(2207, { shards: 1, hunters: 0 });
  let tested = 0;
  for (let ty = 1; ty < lvl.h - 1 && tested < 5; ty++) {
    for (let tx = 1; tx < lvl.w - 1 && tested < 5; tx++) {
      if (walkable(lvl, tx, ty) || !walkable(lvl, tx - 1, ty)) continue;
      const start = { x: (tx - 0.5) * TILE, y: (ty + 0.5) * TILE };
      const moved = moveCircle(lvl.grid, lvl.w, lvl.h, TILE, start.x, start.y, 9, TILE * 2, 0);
      assert.ok(moved.x <= tx * TILE - 9, `blocked at tile ${tx},${ty}`);
      tested++;
    }
  }
  assert.equal(tested, 5, 'exercised the collision test');
});
