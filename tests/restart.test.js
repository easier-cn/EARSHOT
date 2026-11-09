import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';

const fake = () => {
  const g = Object.create(Game.prototype);
  g.state = 'playing';
  g.mapMode = false;
  g.floorMode = false;
  g.worldMode = false;
  g.customData = null;
  g.calls = [];
  g.resetRunState = () => g.calls.push(['reset']);
  g.startMap = (id, seed) => {
    g.calls.push(['map', id, seed]);
    g.state = 'playing';
    return true;
  };
  g.startRun = () => {
    g.calls.push(['run']);
    g.state = 'playing';
    return true;
  };
  g.startWorld = () => g.calls.push(['world']);
  g.startCustom = () => g.calls.push(['custom']);
  g.startChamber = () => g.calls.push(['chamber']);
  g.restoreEntry = () => g.calls.push(['rewind']);
  return g;
};

test('restart in a map starts the run over in the first room', () => {
  const g = fake();
  g.mapMode = true;
  g.mapId = 'maze';
  g.restart();
  assert.deepEqual(g.calls[0], ['reset']);
  assert.equal(g.calls[1][0], 'map');
  assert.equal(g.calls[1][1], 'room');
  assert.ok(Number.isInteger(g.calls[1][2]), 'a fresh seed is used');
  assert.equal(g.calls.length, 2, 'no rewind into the old snapshot');
  assert.equal(g.state, 'playing');
});

test('restart in floor mode starts a new run at floor one', () => {
  const g = fake();
  g.floorMode = true;
  g.restart();
  assert.deepEqual(g.calls, [['run']]);
});

test('restart keeps the same chamber and never rewinds', () => {
  const g = fake();
  g.chamberIndex = 4;
  g.restart();
  assert.deepEqual(g.calls, [['reset'], ['chamber']]);
});

test('restart ignores the title screen', () => {
  const g = fake();
  g.state = 'title';
  g.mapMode = true;
  g.restart();
  assert.deepEqual(g.calls, []);
});
