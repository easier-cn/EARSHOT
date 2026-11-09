import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIONS,
  defaultSettings,
  normalizeSettings,
  bindKey,
  bindPad,
  keyLabel,
  padLabel,
  loadSettings,
  saveSettings,
  clearStoredSettings,
} from '../src/settings.js';

const fakeStorage = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
};

test('settings: defaults cover every action', () => {
  const s = defaultSettings();
  assert.equal(s.volume, 0.85);
  assert.equal(s.brightness, 1);
  assert.equal(s.device, 'keyboard');
  for (const a of ACTIONS) {
    assert.ok(s.bindings[a.id], `missing ${a.id}`);
    assert.ok(s.bindings[a.id].keys.length >= 1);
    assert.equal(typeof s.bindings[a.id].pad[0], 'number');
  }
  assert.deepEqual(s.bindings.ping.keys, ['Space', 'KeyJ']);
});

test('settings: normalize clamps numbers and fills missing actions', () => {
  const raw = {
    volume: 3,
    brightness: 0,
    device: 'nonsense',
    bindings: { ping: { keys: ['KeyQ'], pad: [1] } },
  };
  const s = normalizeSettings(raw);
  assert.equal(s.volume, 1);
  assert.equal(s.brightness, 0.3);
  assert.equal(s.device, 'keyboard');
  assert.deepEqual(s.bindings.ping.keys, ['KeyQ']);
  assert.deepEqual(s.bindings.ping.pad, [1]);
  // Missing rows come back at their defaults instead of disappearing.
  assert.deepEqual(s.bindings.interact.keys, ['KeyF']);
  assert.equal(normalizeSettings(null).volume, 0.85);
});

test('settings: binding a used key swaps the two actions', () => {
  const s = defaultSettings();
  bindKey(s, 'ping', 'KeyW');
  assert.deepEqual(s.bindings.ping.keys, ['KeyW']);
  assert.deepEqual(s.bindings.up.keys, ['Space', 'KeyJ']);
});

test('settings: binding a used pad button swaps the two actions', () => {
  const s = defaultSettings();
  bindPad(s, 'ping', 13);
  assert.deepEqual(s.bindings.ping.pad, [13]);
  assert.deepEqual(s.bindings.down.pad, [0]);
});

test('settings: labels read like the panel', () => {
  assert.equal(keyLabel('Space'), '空格键');
  assert.equal(keyLabel('KeyA'), 'A');
  assert.equal(keyLabel('Digit3'), '3');
  assert.equal(keyLabel('ArrowUp'), '↑');
  assert.equal(keyLabel('ShiftLeft'), 'Shift');
  assert.equal(padLabel(0), 'A');
  assert.equal(padLabel(9), '开始');
});

test('settings: stored profiles round-trip and malformed data falls back', () => {
  const storage = fakeStorage();
  const s = defaultSettings();
  s.volume = 0.4;
  s.device = 'gamepad';
  s.bindings.inventory.keys = ['KeyB'];
  saveSettings(s, storage);
  const back = loadSettings(storage);
  assert.equal(back.volume, 0.4);
  assert.equal(back.device, 'gamepad');
  assert.deepEqual(back.bindings.inventory.keys, ['KeyB']);

  storage.setItem('hush.settings.v1', '{nope');
  assert.equal(loadSettings(storage).volume, 0.85);
  clearStoredSettings(storage);
  assert.equal(storage.getItem('hush.settings.v1'), null);
});
