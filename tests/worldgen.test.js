import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoomMap, buildMazeMap } from '../src/worldgen.js';

function reachableAll(level) {
  const W = level.w;
  const H = level.h;
  const start = level.spawnTile.y * W + level.spawnTile.x;
  const seen = new Uint8Array(W * H);
  const q = [start];
  seen[start] = 1;
  while (q.length) {
    const i = q.pop();
    const x = i % W;
    const y = (i / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (level.grid[j] || seen[j]) continue;
      seen[j] = 1;
      q.push(j);
    }
  }
  let floors = 0;
  let reached = 0;
  for (let i = 0; i < W * H; i++) {
    if (!level.grid[i]) floors++;
    if (seen[i]) reached++;
  }
  return { floors, reached };
}

test('room map: every floor tile is reachable and rooms are many', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const level = buildRoomMap(seed);
    const { floors, reached } = reachableAll(level);
    assert.equal(reached, floors, `seed ${seed} has isolated floor`);
    assert.ok(level.rooms.length >= 24, `seed ${seed} only ${level.rooms.length} rooms`);
    assert.ok(level.loot.length >= 4, `seed ${seed} has almost no loot`);
  }
});

test('room map: deterministic for one seed', () => {
  const a = buildRoomMap(4242);
  const b = buildRoomMap(4242);
  assert.deepEqual(Array.from(a.grid), Array.from(b.grid));
});

test('maze map: connected and has monsters', () => {
  const level = buildMazeMap(7);
  const { floors, reached } = reachableAll(level);
  assert.equal(reached, floors);
  assert.ok(level.monsters.length >= 3);
});

test('maze map: 8-10 loot spots, spread by depth, some mid-corridor', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const level = buildMazeMap(seed);
    const W = level.w;
    const H = level.h;

    // Walk depth from spawn: the spots must follow the route, not the rectangle.
    const dist = new Int32Array(W * H).fill(-1);
    dist[level.spawnTile.y * W + level.spawnTile.x] = 0;
    const q = [level.spawnTile.x, level.spawnTile.y];
    let deepest = 0;
    while (q.length) {
      const y = q.pop();
      const x = q.pop();
      const d = dist[y * W + x];
      if (d > deepest) deepest = d;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (level.grid[j] || dist[j] >= 0) continue;
        dist[j] = d + 1;
        q.push(nx, ny);
      }
    }

    const loot = level.loot;
    assert.ok(loot.length >= 8 && loot.length <= 10, `seed ${seed}: ${loot.length} spots`);
    const seen = new Set();
    let corridors = 0;
    let far = 0;
    for (const l of loot) {
      const i = l.y * W + l.x;
      assert.equal(level.grid[i], 0, `seed ${seed}: a spot sits in a wall`);
      assert.ok(!seen.has(i), `seed ${seed}: two spots on one tile`);
      seen.add(i);
      assert.ok(dist[i] >= 5, `seed ${seed}: a spot crowds the spawn`);
      let open = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!level.grid[(l.y + dy) * W + l.x + dx]) open++;
      }
      if (open <= 2) corridors++;
      if (dist[i] > deepest * 0.75) far++;
    }
    assert.ok(corridors >= 3, `seed ${seed}: only ${corridors} corridor spots`);
    assert.ok(far >= 1, `seed ${seed}: no spot in the far quarter`);
    for (let a = 0; a < loot.length; a++) {
      for (let b = a + 1; b < loot.length; b++) {
        const gap = Math.hypot(loot[a].x - loot[b].x, loot[a].y - loot[b].y);
        assert.ok(gap >= 3, `seed ${seed}: spots only ${gap.toFixed(1)} tiles apart`);
      }
    }
  }
});

test('maze map: loot is deterministic for one seed', () => {
  assert.deepEqual(buildMazeMap(31).loot, buildMazeMap(31).loot);
});
