import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoomMap, buildMazeMap, buildLabMap } from '../src/worldgen.js';

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

test('maze map: moving-maze portal sits beside the diagonal exit', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const level = buildMazeMap(seed);
    const portal = level.exits.find((e) => e.to === 'moving');
    assert.ok(portal, `seed ${seed} has no moving portal`);
    assert.equal(
      Math.abs(portal.x - level.exitTile.x) + Math.abs(portal.y - level.exitTile.y),
      1,
      `seed ${seed} portal is not beside the exit`,
    );
    assert.equal(level.grid[portal.y * level.w + portal.x], 0, `seed ${seed} portal tile is solid`);
    // Portals are one-way: nothing may lead back to the room it came from.
    assert.equal(level.exits.some((e) => e.to === 'room'), false, `seed ${seed} has a way back`);
  }
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


test('lab map: three zones, cards, gates, fog and dishes', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const level = buildLabMap(seed);
    const lab = level.lab;
    assert.equal(lab.zones.length, 3, `seed ${seed} zones`);
    assert.equal(level.size.w, level.w * level.tile, `seed ${seed} size w`);
    assert.equal(level.size.h, level.h * level.tile, `seed ${seed} size h`);
    assert.equal(lab.cards.length, 3, `seed ${seed} cards`);
    assert.equal(lab.gates.length, 3, `seed ${seed} gates`);
    assert.ok(level.rooms.length >= 20, `seed ${seed} rooms`);
    assert.ok(lab.dishes.length >= 2, `seed ${seed} dishes`);
    assert.ok(lab.dishes.every((d) => d.cells.length === 3 && d.cells.every((i) => level.grid[i] === 4)));
    assert.equal(lab.fog.some((v) => v === 1), true, `seed ${seed} no fog`);
    assert.ok(Math.max(...level.rooms.map((r) => r.w)) >= 13, `seed ${seed} rooms too uniform`);
    let innerWalls = 0;
    for (const r of level.rooms) {
      for (let y = r.y + 3; y <= r.y + r.h - 4; y++) {
        for (let x = r.x + 3; x <= r.x + r.w - 4; x++) {
          if (level.grid[y * level.w + x] === 1) innerWalls++;
        }
      }
    }
    assert.ok(innerWalls > 0, `seed ${seed} no interior walls`);
    assert.equal(level.monsters.length, 3, `seed ${seed} type i count`);
    assert.equal(level.labEnemies.length, 12, `seed ${seed} lab enemies`);
    assert.equal(level.grid[level.spawnTile.y * level.w + level.spawnTile.x], 0);
    for (const c of lab.cards) assert.equal(level.grid[c.ty * level.w + c.tx], 0);
    const f = lab.finalExit;
    assert.equal(level.grid[f.ty * level.w + f.tx], 0);
    assert.equal(lab.deconRooms.length, 2, `seed ${seed} airlocks`);
    for (const r of lab.deconRooms) {
      assert.equal(r.kind, 'start', `seed ${seed} airlock kind`);
      assert.equal(r.w, 7, `seed ${seed} airlock width`);
      assert.equal(r.h, 7, `seed ${seed} airlock height`);
      // The frame is 7x7 so the walkable inside is the specified 5x5.
      for (let y = r.y + 1; y < r.y + r.h - 1; y++) {
        for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
          const i = y * level.w + x;
          assert.equal(level.grid[i], 0, `seed ${seed} airlock interior is not floor`);
          assert.notEqual(level.grid[i], 4, `seed ${seed} airlock has a dish`);
          assert.equal(lab.fog[i], 0, `seed ${seed} airlock has fog`);
        }
      }
    }
  }
});

test('lab map: gate cells are the only thing between spawn and the end', () => {
  for (const seed of [1, 2, 3, 7, 42, 99, 123]) {
    const level = buildLabMap(seed);
    const grid = Uint8Array.from(level.grid);
    for (const g of level.lab.gates) for (const i of g.cells) grid[i] = 0;
    const seen = new Uint8Array(level.w * level.h);
    const start = level.spawnTile.y * level.w + level.spawnTile.x;
    const q = [start];
    seen[start] = 1;
    while (q.length) {
      const i = q.pop();
      const x = i % level.w;
      const y = (i / level.w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= level.w || ny >= level.h) continue;
        const j = ny * level.w + nx;
        if (grid[j] || seen[j]) continue;
        seen[j] = 1;
        q.push(j);
      }
    }
    const fx = level.lab.finalExit.ty * level.w + level.lab.finalExit.tx;
    assert.ok(seen[fx], `seed ${seed} cannot reach final exit`);
  }
});

test('lab map: deterministic for one seed', () => {
  const a = buildLabMap(4242);
  const b = buildLabMap(4242);
  assert.deepEqual(Array.from(a.grid), Array.from(b.grid));
  assert.equal(a.lab.gates.length, b.lab.gates.length);
});
