import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMovingMap,
  MOVING,
  blockAt,
  movingDoors,
  writeMovingBlock,
  pickMovingFlips,
  flipMoving,
  flipMovingBlock,
  coreHitAt,
  nearestOpenInBlock,
  solveMoving,
  clearMoving,
  collapseB2,
  mapConnected,
} from '../src/worldgen.js';

const SEED = 20261107;
const local = (g, x, y) => g[y * MOVING.BLOCK + x];

function blockOf(level, i) {
  return level.blocks[i];
}

test('moving map: nine 25-tile blocks in one 73x73 grid', () => {
  const L = buildMovingMap(SEED);
  assert.equal(L.mapId, 'moving');
  assert.equal(L.w, 73);
  assert.equal(L.h, 73);
  assert.equal(L.blocks.length, 9);
  assert.equal(L.tile, 32);
  assert.equal(L.key, null);
  assert.equal(L.exit, null);
  assert.deepEqual(L.exits, []);
  assert.equal(L.moving.period, 20);
  assert.equal(L.moving.nextFlip, 4);
  assert.equal(L.moving.targetLayer, 1);
  for (const b of L.blocks) {
    assert.equal(b.variants.length, 2);
    assert.equal(b.variants[0].length, 625);
    assert.equal(b.z, 0);
  }
});

test('moving map: spawn corner and opposite target', () => {
  const L = buildMovingMap(SEED);
  const s = L.moving.spawn;
  assert.ok([0, 2, 6, 8].includes(s));
  const sr = Math.floor(s / 3);
  const sc = s % 3;
  assert.equal(L.moving.target, (2 - sr) * 3 + (2 - sc));
  assert.equal(L.spawnTile.x, blockOf(L, s).ox + 12);
  assert.equal(L.spawnTile.y, blockOf(L, s).oy + 13);
  assert.equal(L.blocks[L.moving.target].decor[1], 'button');
  assert.equal(L.blocks[L.moving.target].decor[0], 'none');
});

test('moving map: deterministic for one seed', () => {
  const a = buildMovingMap(SEED);
  const b = buildMovingMap(SEED);
  assert.deepEqual([...a.grid], [...b.grid]);
  assert.deepEqual(a.blocks.map((x) => x.z), b.blocks.map((x) => x.z));
  assert.deepEqual(a.blocks.map((x) => x.decor), b.blocks.map((x) => x.decor));
  assert.deepEqual(a.monsters, b.monsters);
  assert.deepEqual(a.loot, b.loot);
  assert.equal(a.moving.target, b.moving.target);
  assert.equal(a.moving.spawn, b.moving.spawn);
});

test('moving map: doors only face neighbours, and the ring is one tile wide', () => {
  const L = buildMovingMap(SEED);
  for (const b of L.blocks) {
    const sides = b.sides;
    for (const v of b.variants) {
      for (let k = 0; k < MOVING.BLOCK; k++) {
        for (const [side, x, y] of [
          ['up', k, 0],
          ['down', k, 24],
          ['left', 0, k],
          ['right', 24, k],
        ]) {
          const open = local(v, x, y) === 0;
          const door = sides[side] && (k === 5 || k === 17);
          assert.equal(open, door, `block ${b.i} ${side} border ${x},${y}`);
        }
      }
      for (let i = 1; i <= 23; i++) {
        assert.equal(local(v, 1, i), 0, `block ${b.i} left ring ${i}`);
        assert.equal(local(v, 23, i), 0, `block ${b.i} right ring ${i}`);
        assert.equal(local(v, i, 1), 0, `block ${b.i} top ring ${i}`);
        assert.equal(local(v, i, 23), 0, `block ${b.i} bottom ring ${i}`);
      }
    }
  }
  for (let i = 0; i < 73; i++) {
    assert.equal(L.grid[i], 1, `outer top ${i}`);
    assert.equal(L.grid[72 * 73 + i], 1, `outer bottom ${i}`);
    assert.equal(L.grid[i * 73], 1, `outer left ${i}`);
    assert.equal(L.grid[i * 73 + 72], 1, `outer right ${i}`);
  }
});

test('moving map: exits are 4 at corners, 6 at edges, 8 in the centre', () => {
  const L = buildMovingMap(SEED);
  for (const b of L.blocks) {
    const active = Object.values(b.sides).filter(Boolean).length;
    assert.equal(active, b.i === 4 ? 4 : b.i % 2 === 0 ? 2 : 3);
    assert.equal(movingDoors(b).length, active * 2);
  }
  // Shared doorways must line up with the neighbour's doorway.
  for (const b of L.blocks) {
    if (b.c < 2) {
      const right = movingDoors(b).filter((d) => d.x === b.ox + 24).map((d) => d.y).sort();
      const n = L.blocks[b.i + 1];
      const left = movingDoors(n).filter((d) => d.x === n.ox).map((d) => d.y).sort();
      assert.deepEqual(right, left, `horizontal doorway ${b.i}/${n.i}`);
    }
    if (b.r < 2) {
      const down = movingDoors(b).filter((d) => d.y === b.oy + 24).map((d) => d.x).sort();
      const n = L.blocks[b.i + 3];
      const up = movingDoors(n).filter((d) => d.y === n.oy).map((d) => d.x).sort();
      assert.deepEqual(down, up, `vertical doorway ${b.i}/${n.i}`);
    }
  }
});

test('moving map: the two floors are different mazes with the same exits', () => {
  const L = buildMovingMap(SEED);
  for (const b of L.blocks) {
    const [a, z] = b.variants;
    let diff = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== z[i]) diff++;
    assert.ok(diff > 40, `block ${b.i} variants only differ by ${diff} tiles`);
    // Doors and the centre room stay put; only the maze between them changes.
    for (const { x, y } of movingDoors(b)) {
      const lx = x - b.ox;
      const ly = y - b.oy;
      assert.equal(local(a, lx, ly), 0);
      assert.equal(local(z, lx, ly), 0);
    }
    for (let y = 11; y <= 13; y++) {
      for (let x = 11; x <= 13; x++) {
        if (x === 12 && y === 12) continue;
        assert.equal(local(a, x, y), 0);
        assert.equal(local(z, x, y), 0);
      }
    }
    assert.equal(local(a, 12, 12), b.decor[0] === 'none' ? 0 : 1);
    assert.equal(local(z, 12, 12), b.decor[1] === 'none' ? 0 : 1);
  }
});

test('moving map: corridors are mostly one tile wide', () => {
  const L = buildMovingMap(SEED);
  for (const b of L.blocks) {
    for (const v of b.variants) {
      let wide = 0;
      for (let y = 1; y < 23; y++) {
        for (let x = 1; x < 23; x++) {
          if (x >= 10 && x <= 13 && y >= 10 && y <= 13) continue; // centre room
          if (local(v, x, y) === 0 && local(v, x + 1, y) === 0 &&
              local(v, x, y + 1) === 0 && local(v, x + 1, y + 1) === 0) wide++;
        }
      }
      assert.equal(wide, 0, `block ${b.i} has ${wide} 2x2 open squares outside the centre`);
    }
  }
});

test('moving map: every floor layout stays connected after 200 flips', () => {
  const L = buildMovingMap(SEED);
  assert.equal(mapConnected(L).ok, true);
  for (let i = 0; i < 200; i++) {
    const moved = flipMoving(L, pickMovingFlips(L));
    assert.ok(moved.length > 0);
    assert.equal(mapConnected(L).ok, true, `disconnected after flip ${i}`);
  }
  assert.equal(L.moving.flips, 200 * 5);
});

test('moving map: each command flips exactly five unbroken rooms', () => {
  const L = buildMovingMap(SEED);
  for (let i = 0; i < 60; i++) {
    const picked = pickMovingFlips(L);
    assert.equal(picked.length, 5);
    assert.equal(new Set(picked).size, 5);
    for (const id of picked) assert.equal(blockOf(L, id).core.broken, false);
    flipMoving(L, picked);
  }
  // Breaking cores removes them from the pool; the rest still moves.
  for (const id of [0, 3, 6, 7]) blockOf(L, id).core.broken = true;
  const picked = pickMovingFlips(L);
  assert.equal(picked.length, 5);
  assert.ok(picked.every((id) => ![0, 3, 6, 7].includes(id)));
  const avoided = pickMovingFlips(L, 4);
  assert.equal(avoided.length, 4);
  assert.equal(avoided.includes(4), false);
  for (const id of [1, 2]) blockOf(L, id).core.broken = true;
  const rest = pickMovingFlips(L);
  assert.deepEqual(rest.sort(), [4, 5, 8]);
  const moved = flipMoving(L, rest);
  assert.equal(moved.length, 3);
});

test('moving map: a flip writes the variant into the same grid, in place', () => {
  const L = buildMovingMap(SEED);
  const grid = L.grid;
  const b = L.blocks[2];
  flipMovingBlock(L, b);
  assert.equal(L.grid, grid);
  assert.equal(b.z, 1);
  for (let y = 0; y < 25; y++) {
    for (let x = 0; x < 25; x++) {
      assert.equal(L.grid[(b.oy + y) * L.w + b.ox + x], local(b.variants[1], x, y));
    }
  }
  flipMovingBlock(L, b);
  assert.equal(b.z, 0);
});

test('moving map: 18 lurkers, one for each block face', () => {
  const L = buildMovingMap(SEED);
  assert.equal(L.monsters.length, 18);
  for (const b of L.blocks) {
    const mine = L.monsters.filter((m) => m.block === b.i);
    assert.equal(mine.length, 2);
    assert.deepEqual(mine.map((m) => m.layer).sort(), [0, 1]);
  }
  const seen = new Set();
  for (const m of L.monsters) {
    assert.equal(m.type, 'lurker');
    const b = blockOf(L, m.block);
    // A guard must stand on an open tile of its own face, not of whichever
    // face happens to be written into the shared grid right now.
    const lx = m.x - b.ox;
    const ly = m.y - b.oy;
    assert.equal(b.variants[m.layer][ly * 25 + lx], 0);
    assert.ok(lx >= 1 && lx <= 23);
    assert.ok(ly >= 1 && ly <= 23);
    assert.ok(!(lx >= 9 && lx <= 15 && ly >= 9 && ly <= 15));
    const key = `${m.x},${m.y}`;
    assert.equal(seen.has(key), false);
    seen.add(key);
  }
});

test('moving map: six loot spots on ring tiles', () => {
  const L = buildMovingMap(SEED);
  assert.equal(L.loot.length, 6);
  for (const l of L.loot) {
    const b = blockAt(L, l.x, l.y);
    assert.ok(b);
    const lx = l.x - b.ox;
    const ly = l.y - b.oy;
    assert.ok(lx <= 2 || lx >= 22 || ly <= 2 || ly >= 22, `loot ${l.x},${l.y} not on a ring`);
    assert.equal(L.grid[l.y * L.w + l.x], 0);
  }
});

test('moving map: the button only exists on the second floor', () => {
  const L = buildMovingMap(SEED);
  const target = blockOf(L, L.moving.target);
  assert.equal(solveMoving(L), null);
  assert.equal(coreHitAt(L, (target.ox + 12.5) * L.tile, (target.oy + 12.5) * L.tile), null);
  flipMovingBlock(L, target);
  assert.equal(target.z, 1);
  const path = solveMoving(L);
  assert.ok(path && path.length > 1);
  assert.deepEqual(path[path.length - 1], { x: target.ox + 12, y: target.oy + 13 });
  const core = coreHitAt(L, (target.ox + 12.5) * L.tile, (target.oy + 12.5) * L.tile);
  assert.equal(core, target);
  target.core.broken = true;
  assert.equal(solveMoving(L), null);
  assert.equal(coreHitAt(L, (target.ox + 12.5) * L.tile, (target.oy + 12.5) * L.tile), null);
});

test('moving map: nearestOpenInBlock finds a standable tile inside the room', () => {
  const L = buildMovingMap(SEED);
  const b = blockOf(L, 4);
  const solid = { x: (b.ox + 12.5) * L.tile, y: (b.oy + 11.5) * L.tile };
  const spot = nearestOpenInBlock(L, b, solid.x, solid.y);
  assert.ok(spot);
  assert.equal(L.grid[Math.floor(spot.y / L.tile) * L.w + Math.floor(spot.x / L.tile)], 0);
  assert.equal(nearestOpenInBlock(L, b, -999, -999), null);
});

test('moving map: the button seals the centre and opens eight ways out', () => {
  const L = buildMovingMap(SEED);
  clearMoving(L);
  assert.equal(L.moving.state, 'cleared');
  assert.ok(L.blocks.every((b) => b.core.broken));
  assert.equal(L.exits.length, 8);
  for (const e of L.exits) {
    assert.equal(e.to, 'mech');
    assert.equal(e.color, '200, 160, 255');
  }
  const b2 = blockOf(L, 4);
  assert.equal(b2.gone, true, 'b2 disappears on clear');
  assert.ok(L.blocks.filter((b) => b.i !== 4).every((b) => !b.gone));
  for (let y = 1; y <= 23; y++) {
    for (let x = 1; x <= 23; x++) assert.equal(local(b2.variants[0], x, y), 1);
  }
  for (const d of movingDoors(b2)) assert.equal(L.grid[d.y * L.w + d.x], 0);
  assert.equal(L.grid[(b2.oy + 12) * L.w + b2.ox + 12], 1, 'b2 centre is sealed');
});

test('moving map: b2 collapse leaves only b2 standing, with lab exits', () => {
  const L = buildMovingMap(SEED);
  collapseB2(L);
  assert.equal(L.moving.state, 'collapsed');
  assert.ok(L.blocks.every((b) => b.core.broken));
  assert.equal(L.exits.length, 8);
  for (const e of L.exits) {
    assert.equal(e.to, 'lab');
    assert.equal(e.color, '255, 200, 90');
  }
  for (const b of L.blocks) {
    if (b.i === 4) continue;
    for (let y = 1; y <= 23; y++) {
      for (let x = 1; x <= 23; x++) assert.equal(local(b.variants[0], x, y), 1, `block ${b.i} ${x},${y}`);
    }
  }
  const b2 = blockOf(L, 4);
  assert.equal(b2.gone, false, 'b2 is the only room left');
  assert.ok(L.blocks.filter((b) => b.i !== 4).every((b) => b.gone));
  for (let y = 1; y <= 23; y++) {
    for (let x = 1; x <= 23; x++) assert.equal(local(b2.variants[0], x, y), 0);
  }
});

test('moving map: blockAt clamps the nine rooms and coreHitAt respects broken cores', () => {
  const L = buildMovingMap(SEED);
  assert.equal(blockAt(L, 0, 0).i, 0);
  assert.equal(blockAt(L, 24, 24).i, 4);
  assert.equal(blockAt(L, 48, 48).i, 8);
  assert.equal(blockAt(L, -10, -10), null);
  assert.equal(blockAt(L, 999, 999), null);
  const b = blockOf(L, 0);
  const cx = (b.ox + 12.5) * L.tile;
  const cy = (b.oy + 12.5) * L.tile;
  assert.equal(coreHitAt(L, cx, cy), b);
  b.core.broken = true;
  assert.equal(coreHitAt(L, cx, cy), null);
});
