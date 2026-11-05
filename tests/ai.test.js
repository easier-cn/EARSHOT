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

test('hunters never enter walls while patrolling', () => {
  for (const cfg of CHAMBERS.slice(0, 4)) {
    const level = generateLevel(cfg.seed, {
      shards: cfg.shards,
      hunters: cfg.hunters,
      style: cfg.style,
    });
    level.tile = TILE;
    const player = { x: level.spawn.x, y: level.spawn.y };
    const game = makeGame(level, player);
    for (const spot of level.hunters) {
      const hunter = new Hunter(spot.x, spot.y);
      stepFor(game, hunter, 20, () => {
        assert.equal(solidAt(level, hunter.x, hunter.y), false, 'hunter is inside a wall');
        assert.equal(Number.isFinite(hunter.x) && Number.isFinite(hunter.y), true);
      });
    }
  }
});

test('a hunter investigating a sound eventually reaches it', () => {
  const cfg = CHAMBERS[1];
  const level = generateLevel(cfg.seed, {
    shards: cfg.shards,
    hunters: cfg.hunters,
    style: cfg.style,
  });
  level.tile = TILE;
  const player = { x: level.spawn.x, y: level.spawn.y };
  const game = makeGame(level, player);
  const spot = level.hunters[0];
  const hunter = new Hunter(spot.x, spot.y);

  // pick an open tile far away and make the player "step" there
  const target = level.shards[0];
  hunter.hear(target.x, target.y, 0.1);

  let closest = Infinity;
  stepFor(game, hunter, 60, () => {
    closest = Math.min(closest, Math.hypot(hunter.x - target.x, hunter.y - target.y));
  });

  assert.equal(closest < TILE * 1.5, true, `hunter got within ${Math.round(closest)}px of the sound`);
  assert.equal(solidAt(level, target.x, target.y), false);
});

test('hunters stay inside the level bounds', () => {
  const cfg = CHAMBERS[3];
  const level = generateLevel(cfg.seed, {
    shards: cfg.shards,
    hunters: cfg.hunters,
    style: cfg.style,
  });
  level.tile = TILE;
  const player = { x: level.spawn.x, y: level.spawn.y };
  const game = makeGame(level, player);
  const hunter = new Hunter(level.hunters[0].x, level.hunters[0].y);
  stepFor(game, hunter, 30, () => {
    assert.equal(hunter.x > 0 && hunter.x < level.size.w, true, 'x in bounds');
    assert.equal(hunter.y > 0 && hunter.y < level.size.h, true, 'y in bounds');
  });
});
