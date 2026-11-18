import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAGE,
  buildCageMap,
  regenerateCage,
  cageReachable,
  cageWaterAt,
  cageFogAt,
} from '../src/cage.js';
import { findPath } from '../src/pathfind.js';

const T = 32;

test('the cage is a 25x25 arena with a floor, a cat and three pieces of loot', () => {
  const L = buildCageMap(12345);
  assert.equal(L.w, CAGE.W);
  assert.equal(L.h, CAGE.H);
  assert.equal(L.size.w, CAGE.W * T);
  assert.equal(L.loot.length, 3);
  assert.equal(L.grid[L.spawnTile.y * L.w + L.spawnTile.x], 0);
  assert.ok(L.cage.cat);
  assert.ok(L.cage.water.length === CAGE.W * CAGE.H);
  assert.ok(L.cage.fog.length === CAGE.W * CAGE.H);
});

test('the cat starts about eight tiles away, on a reachable floor', () => {
  const L = buildCageMap(7);
  const d = Math.hypot(L.cage.cat.x - L.spawn.x, L.cage.cat.y - L.spawn.y);
  assert.ok(d > T * 5 && d < T * 10, `cat distance ${d}`);
  const reach = cageReachable(L.grid, L.w, L.h, L.spawnTile.x, L.spawnTile.y);
  assert.equal(reach[L.cage.cat.ty * L.w + L.cage.cat.tx], 1);
  assert.ok(findPath(L.grid, L.w, L.h, L.spawnTile.x, L.spawnTile.y, L.cage.cat.tx, L.cage.cat.ty));
});

test('walls and floors stay near 1:1', () => {
  for (const seed of [1, 2, 3, 99, 20261109]) {
    const L = buildCageMap(seed);
    let wall = 0;
    let floor = 0;
    for (let y = 1; y < CAGE.H - 1; y++) {
      for (let x = 1; x < CAGE.W - 1; x++) {
        if (L.grid[y * CAGE.W + x] === 0) floor++;
        else wall++;
      }
    }
    const ratio = wall / (wall + floor);
    assert.ok(ratio > 0.38 && ratio < 0.6, `seed ${seed} ratio ${ratio}`);
  }
});

test('everything the ping touched is kept, everything else may change', () => {
  const L = buildCageMap(555);
  const scanned = new Uint8Array(CAGE.W * CAGE.H);
  // A vertical slice of the room, including the player's tile.
  const sx = L.spawnTile.x;
  for (let y = 0; y < CAGE.H; y++) scanned[y * CAGE.W + sx] = 1;
  for (let y = 0; y < CAGE.H; y++) {
    if (y % 3 === 0) L.grid[y * CAGE.W + sx] = 1;
    else L.grid[y * CAGE.W + sx] = 0;
  }
  L.grid[L.spawnTile.y * CAGE.W + sx] = 0;
  const before = [];
  const wetBefore = [];
  const fogBefore = [];
  for (let y = 0; y < CAGE.H; y++) {
    before.push(L.grid[y * CAGE.W + sx]);
    wetBefore.push(L.cage.water[y * CAGE.W + sx]);
    fogBefore.push(L.cage.fog[y * CAGE.W + sx]);
  }
  // Scanned water and poison are remembered too.
  for (let y = 1; y < CAGE.H - 1; y++) {
    const i = y * CAGE.W + sx;
    if (y === L.spawnTile.y) continue;
    if (before[y] !== 0) continue;
    if (y % 4 === 0) L.cage.water[i] = 1;
    if (y % 4 === 1) L.cage.fog[i] = 1;
    wetBefore[y] = L.cage.water[i];
    fogBefore[y] = L.cage.fog[i];
  }

  regenerateCage(L, {
    scanned,
    playerTile: L.spawnTile,
    catDistance: 256,
  });
  for (let y = 0; y < CAGE.H; y++) {
    if (y === 0 || y === CAGE.H - 1) continue;
    assert.equal(L.grid[y * CAGE.W + sx], before[y], `scanned row ${y} changed`);
    assert.equal(L.cage.water[y * CAGE.W + sx], wetBefore[y], `scanned water row ${y} changed`);
    assert.equal(L.cage.fog[y * CAGE.W + sx], fogBefore[y], `scanned fog row ${y} changed`);
  }
});

test('the breaker arrives outside the scan and touches a reachable floor', () => {
  for (const seed of [11, 22, 33, 44]) {
    const L = buildCageMap(seed);
    const scanned = new Uint8Array(CAGE.W * CAGE.H);
    for (let y = 0; y < CAGE.H; y++) {
      for (let x = 0; x < CAGE.W; x++) {
        if (Math.hypot(x - L.spawnTile.x, y - L.spawnTile.y) < 7) scanned[y * CAGE.W + x] = 1;
      }
    }
    regenerateCage(L, { scanned, playerTile: L.spawnTile, catDistance: 288 });
    const d = L.cage.device;
    assert.ok(d, `seed ${seed} has a breaker`);
    assert.equal(scanned[d.ty * CAGE.W + d.tx], 0, `seed ${seed} breaker inside scan`);
    assert.notEqual(L.grid[d.ty * CAGE.W + d.tx], 0);
    const reach = cageReachable(L.grid, L.w, L.h, L.spawnTile.x, L.spawnTile.y);
    let linked = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = d.tx + dx;
      const ny = d.ty + dy;
      if (L.grid[ny * CAGE.W + nx] === 0 && reach[ny * CAGE.W + nx]) linked = true;
    }
    assert.ok(linked, `seed ${seed} breaker is walled off`);
    assert.equal(reach[L.cage.cat.ty * CAGE.W + L.cage.cat.tx], 1, `seed ${seed} cat was sealed off`);
  }
});

test('the cat reappears on the ring of its remembered distance', () => {
  for (const seed of [3, 8, 13]) {
    const L = buildCageMap(seed);
    for (const want of [128, 192, 256, 320]) {
      regenerateCage(L, { playerTile: L.spawnTile, catDistance: want });
      const d = Math.hypot(L.cage.cat.x - L.spawn.x, L.cage.cat.y - L.spawn.y);
      assert.ok(Math.abs(d - want) <= 64, `seed ${seed} want ${want} got ${d}`);
    }
  }
});

test('a real scan remembers the distance a killed cat must return at', () => {
  const L = buildCageMap(81);
  // The opening placement is not a scan, so a death before the first ping
  // falls back to the current distance instead of the opening ring.
  assert.equal(L.cage.lastScanDist, 0);
  regenerateCage(L, { playerTile: L.spawnTile, catDistance: 224 });
  assert.equal(L.cage.lastScanDist, 224);
  regenerateCage(L, { playerTile: L.spawnTile, catDistance: 320 });
  assert.equal(L.cage.lastScanDist, 320);
});

test('the same seed produces the same room, water and fog', () => {
  const a = buildCageMap(4321);
  const b = buildCageMap(4321);
  assert.deepEqual([...a.grid], [...b.grid]);
  assert.deepEqual([...a.cage.water], [...b.cage.water]);
  assert.deepEqual([...a.cage.fog], [...b.cage.fog]);
  assert.equal(a.cage.cat.x, b.cage.cat.x);
  assert.equal(a.cage.cat.y, b.cage.cat.y);
});

test('water and poison answer by pixel position', () => {
  const L = buildCageMap(77);
  let water = null;
  let fog = null;
  for (let y = 1; y < CAGE.H - 1 && (!water || !fog); y++) {
    for (let x = 1; x < CAGE.W - 1 && (!water || !fog); x++) {
      if (!water && L.cage.water[y * CAGE.W + x]) water = { x, y };
      if (!fog && L.cage.fog[y * CAGE.W + x]) fog = { x, y };
    }
  }
  if (water) assert.equal(cageWaterAt(L, (water.x + 0.5) * T, (water.y + 0.5) * T), true);
  if (fog) assert.equal(cageFogAt(L, (fog.x + 0.5) * T, (fog.y + 0.5) * T), true);
});
