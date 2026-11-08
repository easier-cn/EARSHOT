import test from 'node:test';
import assert from 'node:assert/strict';

import { Game } from '../src/game.js';
import { Inventory } from '../src/loot.js';

// The first run teaches by doing: one line per new situation, never repeated.

function fakeGame(extra = {}) {
  const g = Object.create(Game.prototype);
  g.state = 'playing';
  g.guides = {};
  g.guideTimers = new Map();
  g.throwBound = false;
  g.tutorialStarted = false;
  g.loot = [];
  g.inv = new Inventory();
  g.player = { x: 0, y: 0 };
  g.activeItem = null;
  g.shown = [];
  g.feeds = [];
  g.tips = [];
  g.toasts = [];
  g.ui = {
    guide: (t) => g.shown.push(t),
    hideTip: () => {},
    feed: (t) => g.feeds.push(t),
    toast: (t) => g.toasts.push(t),
  };
  g.audio = { shard() {}, deny() {}, click() {}, alert() {} };
  g.flash = 0;
  g.stepEcho = () => {};
  g.refreshStones = () => {};
  g.alertCd = 0;
  return Object.assign(g, extra);
}

test('loot tutorial names charms and usable items once', () => {
  const g = fakeGame();
  const charm = { kind: 'charm', id: 'sleep' };
  g.loot = [charm];
  g.takeLoot(charm);
  assert.equal(g.shown.at(-1), '你捡到了一个护符，摁下tab以装配');

  const charm2 = { kind: 'charm', id: 'counter' };
  g.loot = [charm2];
  g.takeLoot(charm2);
  assert.equal(g.shown.length, 1, 'a second charm is not another lesson');

  const vitamin = { kind: 'item', id: 'vitamin' };
  g.loot = [vitamin];
  g.takeLoot(vitamin);
  assert.equal(g.shown.at(-1), '你捡到了一个道具，摁下tab以将其绑定在快捷键上');

  const pebbles = { kind: 'item', id: 'pebbles' };
  g.loot = [pebbles];
  g.takeLoot(pebbles);
  assert.equal(g.shown.length, 2, 'throwables are taught when they are bound');
});

test('the first scare explains sneaking, then that hunters listen', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const g = fakeGame();
  const hunter = { state: 'idle', x: 100, y: 0, hear() { this.state = 'investigate'; } };

  g.alertHunter(hunter, 100, 0, 0);
  assert.equal(g.shown.at(-1), '你惊扰了一只猎手，按下shift以潜行');
  assert.ok(g.guideTimers.has('hunterSound'), 'the second line waits its turn');

  t.mock.timers.tick(3600);
  assert.equal(g.shown.at(-1), '猎手可以听到你发出来的声音');

  const again = g.shown.length;
  g.alertHunter(hunter, 100, 0, 0);
  assert.equal(g.shown.length, again, 'only the first scare is explained');
});

test('binding a throwable talks about hotkeys once the bag closes', () => {
  const g = fakeGame();
  g.onHotkeyBound({ kind: 'item', id: 'pebbles', n: 3 });
  g.onInventoryClosed();
  assert.equal(g.shown.at(-1), '摁下对应快捷键可以选中投掷物');

  g.onHotkeyBound({ kind: 'item', id: 'pebbles', n: 3 });
  g.onInventoryClosed();
  assert.equal(g.shown.length, 1, 'the hotkey lesson is said once');

  g.onHotkeyBound({ kind: 'item', id: 'vitamin', n: 1 });
  assert.equal(g.throwBound, false, 'a usable is not a throwable');
});

test('selecting a throwable teaches click-to-throw then how to cancel', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const g = fakeGame();
  const stack = { kind: 'item', id: 'pebbles', n: 2 };
  g.inv.pack[0] = stack;
  g.inv.hot[0] = stack;

  g.useHotkey(0);
  assert.equal(g.activeItem, 'pebbles');
  assert.equal(g.shown.at(-1), '摁下鼠标左键可以投掷出投掷物');
  assert.ok(g.guideTimers.has('throwCancel'));

  t.mock.timers.tick(3600);
  assert.equal(g.shown.at(-1), '再次摁下对应快捷键以取消选中');
});

test('cancelling before the follow-up keeps the cancel line unsaid', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const g = fakeGame();
  const stack = { kind: 'item', id: 'pebbles', n: 2 };
  g.inv.pack[0] = stack;
  g.inv.hot[0] = stack;

  g.useHotkey(0);
  g.useHotkey(0);
  assert.equal(g.activeItem, null);
  assert.equal(g.guideTimers.has('throwCancel'), false);

  t.mock.timers.tick(3600);
  assert.equal(g.shown.at(-1), '摁下鼠标左键可以投掷出投掷物');
});
