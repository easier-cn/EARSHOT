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
