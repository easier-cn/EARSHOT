import test from 'node:test';
import assert from 'node:assert/strict';

import { generateLevel, TILE } from '../src/levelgen.js';
import { Hunter } from '../src/entities.js';
import { CHAMBERS } from '../src/chambers.js';

const SOLID = 1;

function makeGame(level, player) {
  return {
    level,
    now: 0,
    player,
    audio: { hunterStep() {} },
  };
}

function solidAt(level, x, y) {
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= level.w || ty >= level.h) return true;
  return level.grid[ty * level.w + tx] === SOLID;
}

function stepFor(game, hunter, seconds, onStep) {
  const dt = 1 / 60;
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    game.now += dt;
    hunter.update(dt, game);
    if (onStep) onStep(i * dt);
  }
}

function levelOf(cfg) {
  const level = generateLevel(cfg.seed, {
    shards: cfg.shards,
    hunters: cfg.hunters,
    style: cfg.style,
  });
  level.tile = TILE;
  return level;
}

// The whole contract of a hunter: silence means it does not exist.
test('a hunter that hears nothing never moves', () => {
  for (const cfg of CHAMBERS.slice(0, 4)) {
    const level = levelOf(cfg);
    const player = { x: level.spawn.x, y: level.spawn.y };
    const game = makeGame(level, player);
    for (const spot of level.hunters) {
      const hunter = new Hunter(spot.x, spot.y);
      const x0 = hunter.x;
      const y0 = hunter.y;
      stepFor(game, hunter, 20);
      const drift = Math.hypot(hunter.x - x0, hunter.y - y0);
      assert.equal(drift < 0.5, true, `hunter drifted ${drift.toFixed(1)}px with no sound`);
    }
  }
});

test('a hunter walks to the sound and then stops', () => {
  const level = levelOf(CHAMBERS[1]);
  const player = { x: level.spawn.x, y: level.spawn.y };
  const game = makeGame(level, player);
  const spot = level.hunters[0];
  const hunter = new Hunter(spot.x, spot.y);
  const target = level.shards[0];

  hunter.hear(target.x, target.y, 0.1);
  let closest = Infinity;
  stepFor(game, hunter, 60, () => {
    closest = Math.min(closest, Math.hypot(hunter.x - target.x, hunter.y - target.y));
  });
  assert.equal(closest < TILE * 1.5, true, `hunter got within ${Math.round(closest)}px`);

  const x1 = hunter.x;
  const y1 = hunter.y;
  stepFor(game, hunter, 5);
  const drift = Math.hypot(hunter.x - x1, hunter.y - y1);
  assert.equal(drift < 0.5, true, `hunter kept walking after arriving (${drift.toFixed(1)}px)`);
});

test('a second sound redirects a walking hunter', () => {
  const level = levelOf(CHAMBERS[1]);
  const player = { x: level.spawn.x, y: level.spawn.y };
  const game = makeGame(level, player);
  const hunter = new Hunter(level.hunters[0].x, level.hunters[0].y);
  const first = level.shards[0];
  const second = level.shards[1];

  hunter.hear(first.x, first.y, 0.05);
  stepFor(game, hunter, 1.2);
  hunter.hear(second.x, second.y, 0.05);

  let closest = Infinity;
  stepFor(game, hunter, 80, () => {
    closest = Math.min(closest, Math.hypot(hunter.x - second.x, hunter.y - second.y));
  });
  assert.equal(closest < TILE * 1.5, true, `hunter reached ${Math.round(closest)}px from the new sound`);
});

test('hunters never enter walls while walking to a sound', () => {
  for (const cfg of CHAMBERS.slice(0, 4)) {
    const level = levelOf(cfg);
    const player = { x: level.spawn.x, y: level.spawn.y };
    const game = makeGame(level, player);
    const target = level.shards[0];
    for (const spot of level.hunters) {
      const hunter = new Hunter(spot.x, spot.y);
      hunter.hear(target.x, target.y, 0.05);
      stepFor(game, hunter, 40, () => {
        assert.equal(solidAt(level, hunter.x, hunter.y), false, 'hunter is inside a wall');
        assert.equal(Number.isFinite(hunter.x) && Number.isFinite(hunter.y), true);
      });
    }
  }
});

test('hunters stay inside the level bounds', () => {
  const level = levelOf(CHAMBERS[3]);
  const player = { x: level.spawn.x, y: level.spawn.y };
  const game = makeGame(level, player);
  const hunter = new Hunter(level.hunters[0].x, level.hunters[0].y);
  hunter.hear(level.shards[0].x, level.shards[0].y, 0.05);
  stepFor(game, hunter, 30, () => {
    assert.equal(hunter.x > 0 && hunter.x < level.size.w, true, 'x in bounds');
    assert.equal(hunter.y > 0 && hunter.y < level.size.h, true, 'y in bounds');
  });
});
