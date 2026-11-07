import test from 'node:test';
import assert from 'node:assert/strict';

import { Game } from '../src/game.js';
import { viewCenter } from '../src/util.js';

// The aiming bug: the throw used the raw camera as "screen centre", but the
// camera stops at the level edges, so near an edge the player is not at the
// screen centre and the throw left along "screen centre -> cursor" instead of
// "player -> cursor". aimPoint() and Renderer.draw() must agree on the centre.

const DEG = 180 / Math.PI;

/** A game object with just the fields aimPoint() reads. */
function fakeGame({ size, player, cam, mouse, cw, ch, scale }) {
  const g = Object.create(Game.prototype);
  g.renderer = { cw, ch, scale };
  g.level = { size };
  g.player = { x: player.x, y: player.y, face: player.face ?? 0 };
  g.camX = cam.x;
  g.camY = cam.y;
  g.msx = mouse.x;
  g.msy = mouse.y;
  return g;
}

const ROOM = { w: 2432, h: 1664 };
const VIEW = { cw: 1370, ch: 705, scale: 1.5222 };

test('viewCenter clamps the camera to the level edges', () => {
  const vw = VIEW.cw / VIEW.scale;
  const vh = VIEW.ch / VIEW.scale;
  // Bottom-right corner: the centre stops a half-viewport short of the wall.
  const c = viewCenter(ROOM.w, ROOM.h, 2352, 1584, vw, vh);
  assert.equal(c.x, ROOM.w - vw / 2);
  assert.equal(c.y, ROOM.h - vh / 2);
  // Already valid cameras pass through untouched.
  const mid = viewCenter(ROOM.w, ROOM.h, 1200, 800, vw, vh);
  assert.equal(mid.x, 1200);
  assert.equal(mid.y, 800);
});

test('viewCenter centres a level smaller than the viewport', () => {
  const c = viewCenter(800, 600, 799, 599, 1370, 705);
  assert.deepEqual(c, { x: 400, y: 300 });
});

test('aiming near an edge follows player -> cursor, not screen centre -> cursor', () => {
  const player = { x: 2352, y: 1584 };
  const g = fakeGame({
    size: ROOM,
    player,
    cam: player,
    mouse: { x: VIEW.cw / 2, y: VIEW.ch / 2 },
    ...VIEW,
  });
  const aim = g.aimPoint();

  // Cursor sits at the screen centre, so it points at the clamped centre...
  const vw = VIEW.cw / VIEW.scale;
  const vh = VIEW.ch / VIEW.scale;
  assert.ok(Math.abs(aim.x - (ROOM.w - vw / 2)) < 1e-6);
  assert.ok(Math.abs(aim.y - (ROOM.h - vh / 2)) < 1e-6);

  // ...which is up and to the left of the player, not east (the old bug).
  const deg = Math.atan2(aim.y - player.y, aim.x - player.x) * DEG;
  assert.ok(deg < -150 && deg > -165, `expected ~-157.7deg, got ${deg.toFixed(2)}`);
  assert.ok(aim.x < player.x && aim.y < player.y);
});

test('aiming is exact when the camera is unclamped', () => {
  const player = { x: 1200, y: 800 };
  const g = fakeGame({
    size: ROOM,
    player,
    cam: player,
    mouse: { x: VIEW.cw / 2 + 300, y: VIEW.ch / 2 - 150 },
    ...VIEW,
  });
  const aim = g.aimPoint();
  // Player at the screen centre: aim is the cursor's world offset.
  assert.ok(Math.abs(aim.x - (player.x + 300 / VIEW.scale)) < 1e-6);
  assert.ok(Math.abs(aim.y - (player.y - 150 / VIEW.scale)) < 1e-6);
});

test('aim point does not depend on where the player stands', () => {
  const opts = {
    size: ROOM,
    cam: { x: 1200, y: 800 },
    mouse: { x: 900, y: 300 },
    ...VIEW,
  };
  const a = fakeGame({ ...opts, player: { x: 1000, y: 900 } }).aimPoint();
  const b = fakeGame({ ...opts, player: { x: 1400, y: 700 } }).aimPoint();
  assert.ok(Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9);
});

test('no mouse falls back to the facing direction', () => {
  const g = fakeGame({
    size: ROOM,
    player: { x: 500, y: 500, face: Math.PI / 2 },
    cam: { x: 500, y: 500 },
    mouse: { x: 0, y: 0 },
    ...VIEW,
  });
  g.msx = null;
  g.msy = null;
  const aim = g.aimPoint();
  assert.ok(Math.abs(aim.x - 500) < 1e-9);
  assert.ok(Math.abs(aim.y - 660) < 1e-9);
});
