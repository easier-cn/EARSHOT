import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateFloor, floorReachable, TILE } from '../src/rooms.js';

const seeds = [12345, 777, 4242, 90210, 1];

test('every floor is fully connected and holds a key and an exit', () => {
  for (const seed of seeds) {
    for (let depth = 1; depth <= 5; depth++) {
      const floor = generateFloor(seed + depth * 7919, depth - 1);
      const reach = floorReachable(floor);
      assert.equal(reach.ok, true, `seed ${seed} depth ${depth} broken: ${reach.bad}`);
      assert.ok(floor.rooms.length >= 8, 'main path plus branches');
      assert.ok(floor.mainCount >= 5 && floor.mainCount <= 8, 'main path is 5..8 rooms');
      assert.notEqual(floor.keyTile.x, floor.exitTile.x);
      assert.ok(floor.grid[floor.keyTile.y * floor.w + floor.keyTile.x] === 0, 'key stands on floor');
      assert.ok(floor.grid[floor.exitTile.y * floor.w + floor.exitTile.x] === 0, 'exit stands on floor');
    }
  }
});

test('rooms never overlap', () => {
  for (const seed of seeds) {
    const floor = generateFloor(seed, 2);
    for (let i = 0; i < floor.rooms.length; i++) {
      for (let j = i + 1; j < floor.rooms.length; j++) {
        const a = floor.rooms[i];
        const b = floor.rooms[j];
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        assert.equal(overlap, false, `rooms ${a.i}/${b.i} overlap`);
      }
    }
  }
});

test('the exit sits behind a branch, not on the main path', () => {
  for (const seed of seeds) {
    const floor = generateFloor(seed, 0);
    const exit = floor.rooms.find((r) => r.kind === 'exit');
    assert.ok(exit, 'an exit room exists');
    assert.ok(exit.i >= 5, 'exit is appended after the main chain');
  }
});

test('floor geometry is deterministic for a seed', () => {
  const a = generateFloor(555, 3);
  const b = generateFloor(555, 3);
  assert.deepEqual(Array.from(a.grid), Array.from(b.grid));
  assert.deepEqual(a.keyTile, b.keyTile);
});

test('tiles match the renderer tile size', () => {
  const floor = generateFloor(9, 0);
  assert.equal(floor.tile, TILE);
  assert.equal(floor.size.w, floor.w * TILE);
  assert.equal(floor.size.h, floor.h * TILE);
});
