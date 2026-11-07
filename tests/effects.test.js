import test from 'node:test';
import assert from 'node:assert/strict';

import { Game } from '../src/game.js';
import { Hunter } from '../src/entities.js';
import { Inventory } from '../src/loot.js';

// The six effect bugs: corpse lure ownership, star contact kills, deferred
// loot identity, scanner routing, bugspray repulsion, and one purple line per
// hunter death. These exercise the rules, not the rendering.

function fakeGame(extra = {}) {
  const g = Object.create(Game.prototype);
  g.now = 10;
  g.player = { x: 0, y: 0 };
  g.guides = {};
  g.alertCd = 0;
  g.audio = { alert() {}, shard() {} };
  g.ui = { guide() {}, feed() {} };
  g.beeps = [];
  g.stepEcho = (x, y, tint) => g.beeps.push(tint);
  Object.assign(g, extra);
  return g;
}

test('the star kills on contact even while its own invulnerability is up', () => {
  const h = new Hunter(40, 0);
  const g = fakeGame({ state: 'playing', starT: 1, invulnT: 3, hunters: [h] });
  let killed = 0;
  g.killHunter = () => { killed++; };
  g.hurt(h);
  assert.equal(killed, 1, 'contact during the star must kill');

  const g2 = fakeGame({ state: 'playing', starT: 0, invulnT: 1, hunters: [h] });
  let killed2 = 0;
  g2.killHunter = () => { killed2++; };
  g2.hurt(h);
  assert.equal(killed2, 0, 'plain invulnerability still only blocks damage');
});

test('loot identity is rolled on approach, and survive needs its two parents', () => {
  const g = fakeGame({ inv: new Inventory() });
  const kinds = new Set();
  for (let i = 0; i < 300; i++) {
    const it = { x: 0, y: 0 };
    g.revealLoot(it);
    kinds.add(it.kind);
    assert.ok(it.id, 'a revealed spot always gets an id');
    assert.notEqual(it.id, 'survive', 'survive is gated while the parents are missing');
  }
  assert.deepEqual([...kinds].sort(), ['charm', 'item']);

  const g2 = fakeGame({ inv: new Inventory() });
  g2.inv.charms = [
    { kind: 'charm', id: 'stress', lvl: 1 },
    { kind: 'charm', id: 'counter', lvl: 1 },
  ];
  let sawSurvive = false;
  for (let i = 0; i < 400; i++) {
    const it = { x: 0, y: 0 };
    g2.revealLoot(it);
    if (it.id === 'survive') sawSurvive = true;
  }
  assert.ok(sawSurvive, 'survive becomes possible once both parents are owned');

  const spot = { x: 0, y: 0 };
  g.revealLoot(spot);
  const first = spot.id;
  g.revealLoot(spot);
  assert.equal(spot.id, first, 'a spot never re-rolls');
});

test('the scanner returns a real walking route to the key', () => {
  const tile = 32;
  const w = 9;
  const h = 9;
  const grid = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) grid[y * w + x] = 1;
    }
  }
  // A wall from the top down to row 5: the route must swing around its foot.
  for (let y = 1; y <= 5; y++) grid[y * w + 4] = 1;
  const level = {
    tile,
    w,
    h,
    grid,
    key: { x: 7.5 * tile, y: 6.5 * tile },
    exit: null,
  };
  const g = fakeGame({
    level,
    mapMode: false,
    mapKey: null,
    mapExits: [],
    player: { x: 1.5 * tile, y: 1.5 * tile },
  });
  g.refreshScan();
  assert.equal(g.scanRoutes.length, 1);
  const route = g.scanRoutes[0];
  assert.ok(route.pts.length > 5, 'route bends around the wall');
  const last = route.pts[route.pts.length - 1];
  assert.equal(last.x, 7.5 * tile);
  assert.equal(last.y, 6.5 * tile);
});

test('a corpse lure owns the hunter until it arrives; the player cannot override it', () => {
  const h = new Hunter(0, 0);
  const g = fakeGame({ hunters: [h] });
  g.onRayTouch(h, { x: 200, y: 50, t: 5, kind: 'lure' });
  assert.deepEqual(h.lureLock, { x: 200, y: 50 });
  assert.equal(h.pending.x, 200);

  // A later player ping touches the same body: it must not redirect it.
  g.onRayTouch(h, { x: 0, y: 0, t: 6 });
  assert.equal(h.pending.x, 200);
  assert.equal(h.pending.y, 50);

  // Once the body actually reaches the corpse the lock is released.
  h.path = [];
  h.x = 200;
  h.y = 50;
  h.update(0.016, fakeGame({ level: { tile: 32, w: 10, h: 10, grid: new Uint8Array(100) } }));
  assert.equal(h.lureLock, null);
});

test('a bugspray line repels for a second, and a newer line wins', () => {
  const h = new Hunter(0, 0);
  const g = fakeGame({ hunters: [h] });
  g.repelHunter(h, { x: 0, y: 0, t: 1 });
  assert.equal(h.repelT, 1);
  const first = { ...h.target };
  assert.ok(Math.hypot(first.x, first.y) > 250, 'flees away from the line');

  g.repelHunter(h, { x: 0, y: 0, t: 0.5 }); // older line: ignored
  assert.deepEqual(h.target, first);

  g.repelHunter(h, { x: 100, y: 0, t: 2 }); // newer line: takes over
  assert.equal(h.repelFrom.x, 100);

  h.hear(400, 400); // a player sound cannot pull it back mid-flight
  assert.equal(h.pending.x, h.target.x);
});

test('every hunter death answers with exactly one purple line', () => {
  const h = new Hunter(80, 80);
  const g = fakeGame({ hunters: [h], diamonds: 0, gold: 0, flash: 0, shake: 0, mapMode: false });
  g.charmLevel = () => 0;
  assert.equal(g.killHunter(h), true);
  assert.equal(g.hunters.length, 0);
  assert.equal(g.beeps.length, 1);
  assert.equal(g.beeps[0], '190, 130, 255');
});