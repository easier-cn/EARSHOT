import test from 'node:test';
import assert from 'node:assert/strict';

import { Game } from '../src/game.js';
import { Inventory } from '../src/loot.js';

// All interactions share one rule: stand close, read the prompt, press F.
// Nothing may happen just by walking over it.

function fakeGame(extra = {}) {
  const g = Object.create(Game.prototype);
  g.player = { x: 0, y: 0 };
  g.loot = [];
  g.mapMode = false;
  g.mapKey = null;
  g.hasKey = false;
  g.castleKey = false;
  g.mapExits = [];
  g.level = { size: { w: 1000, h: 800 }, exit: null };
  g.renderer = { cw: 1200, ch: 700, scale: 1.4 };
  g.camX = 0;
  g.camY = 0;
  g.exitOpen = false;
  g.shards = [];
  g.inv = new Inventory();
  g.seenLoot = true;
  g.tips = [];
  g.feeds = [];
  g.toasts = [];
  g.denied = 0;
  g.ui = {
    showTip: (title, body) => g.tips.push({ title, body }),
    hideTip: () => {},
    feed: (t) => g.feeds.push(t),
    toast: (t) => g.toasts.push(t),
    guide: () => {},
  };
  g.audio = { shard() {}, deny() { g.denied++; }, gateOpen() {} };
  g.stepEcho = () => {};
  g.refreshStones = () => {};
  g.maybeGuide = () => {};
  Object.assign(g, extra);
  return g;
}

test('F prompt picks the nearest thing and the key disappears once taken', () => {
  const loot = [{ kind: 'item', id: 'pebbles', x: 10, y: 0 }];
  const g = fakeGame({ loot, mapMode: true, mapKey: { x: 15, y: 0 } });
  const near = g.interactAt();
  assert.equal(near.kind, 'loot', 'loot at 10px beats the key at 15px');

  g.hasKey = true;
  g.loot = [];
  assert.equal(g.interactAt(), null, 'a taken key is no longer a target');

  g.hasKey = false;
  assert.equal(g.interactAt().kind, 'key');
  g.mapKey = { x: 300, y: 0 };
  assert.equal(g.interactAt(), null, 'outside the reach there is no prompt');
});

test('the portal prompt names the destination and its lock', () => {
  const exit = { to: 'maze', x: 20, y: 0, require: 'key', built: true };
  const g = fakeGame({ mapMode: true, mapExits: [exit] });
  g.hasKey = false;
  g.showInteractTip(g.interactAt());
  assert.match(g.tips[0].title, /迷宫/);
  assert.match(g.tips[0].body, /地图钥匙/);

  g.hasKey = true;
  g.showInteractTip(g.interactAt());
  assert.match(g.tips[1].body, /\[ F \] 前往/);

  // Unbuilt destinations say so instead of pretending the door works.
  g.mapExits = [{ to: 'meadow', x: 20, y: 0, built: false }];
  g.showInteractTip(g.interactAt());
  assert.match(g.tips[2].body, /尚未开通/);
});

test('pressing F takes the key and only F enters the portal', () => {
  const exit = { to: 'maze', x: 20, y: 0, built: true };
  const g = fakeGame({ mapMode: true, mapExits: [exit], mapKey: { x: 10, y: 0 } });
  let entered = null;
  g.enterMapExit = (e) => { entered = e; return true; };

  g.doInteract(g.interactAt());
  assert.equal(g.hasKey, true);
  assert.equal(entered, null, 'walking close must not travel');
  assert.match(g.feeds.at(-1), /钥匙/);

  g.doInteract(g.interactAt());
  assert.equal(entered, exit);
});

test('the stair also waits for F, and refuses while shards remain', () => {
  const g = fakeGame({ level: { size: { w: 1000, h: 800 }, exit: { x: 12, y: 0 } } });
  assert.equal(g.interactAt().kind, 'stair');
  g.showInteractTip(g.interactAt());
  assert.match(g.tips[0].body, /碎片/);

  let completed = 0;
  g.complete = () => { completed++; };
  g.doInteract(g.interactAt());
  assert.equal(completed, 0);
  assert.equal(g.denied, 1);

  g.exitOpen = true;
  g.doInteract(g.interactAt());
  assert.equal(completed, 1);
});