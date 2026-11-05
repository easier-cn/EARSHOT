import test from 'node:test';
import assert from 'node:assert/strict';
import { Inventory, CHARMS, ITEMS } from '../src/loot.js';
import { CHARM_TEXT, ITEM_TEXT, charmText, CHARM_GLYPH, ITEM_GLYPH } from '../src/desc.js';

test('workbench turns two identical level-1 charms into one level-2', () => {
  const inv = new Inventory();
  inv.addCharm('sleep');
  inv.addCharm('sleep');
  assert.equal(inv.charms.length, 2, 'duplicates stay separate in the pack');
  assert.equal(inv.toWork(0), true);
  assert.equal(inv.toWork(0), true);
  assert.deepEqual(inv.craftable(), { id: 'sleep', lvl: 2 });
  const out = inv.craft();
  assert.deepEqual(out, { id: 'sleep', lvl: 2 });
  assert.equal(inv.charms.length, 1);
  assert.equal(inv.level('sleep'), 2);
});

test('workbench refuses mismatched or max-level charms', () => {
  const inv = new Inventory();
  inv.work[0] = { id: 'sleep', lvl: 1 };
  inv.work[1] = { id: 'swift', lvl: 1 };
  assert.equal(inv.craftable(), null);
  inv.work[1] = { id: 'sleep', lvl: 3 };
  inv.work[0] = { id: 'sleep', lvl: 3 };
  assert.equal(inv.craftable(), null);
});

test('thrown items are spent; stones from the charm are free', () => {
  const inv = new Inventory();
  inv.addItem('sharpStone', 3);
  inv.bindHot(0, 0);
  assert.equal(inv.consume('sharpStone'), true);
  assert.equal(inv.pack[0].n, 2);
  assert.equal(inv.consume('pebbles'), false);
});

test('every charm and item has words and a glyph; longer words per level', () => {
  for (const id of Object.keys(CHARMS)) {
    assert.ok(CHARM_TEXT[id], `${id} needs text`);
    assert.ok(CHARM_GLYPH[id], `${id} needs a glyph`);
    const a = charmText(id, 1).length;
    const b = charmText(id, Math.min(2, CHARMS[id].max)).length;
    const c = charmText(id, Math.min(3, CHARMS[id].max)).length;
    assert.ok(b >= a && c >= b, `${id} text should grow`);
  }
  for (const id of Object.keys(ITEMS)) {
    assert.ok(ITEM_TEXT[id], `${id} needs text`);
    assert.ok(ITEM_GLYPH[id], `${id} needs a glyph`);
  }
});

test('glyphs are all distinct within their family', () => {
  const charms = new Set(Object.values(CHARM_GLYPH));
  const items = new Set(Object.values(ITEM_GLYPH));
  assert.equal(charms.size, Object.keys(CHARM_GLYPH).length);
  assert.equal(items.size, Object.keys(ITEM_GLYPH).length);
});
