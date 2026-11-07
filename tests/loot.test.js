import test from 'node:test';
import assert from 'node:assert/strict';
import { Inventory, CHARMS, ITEMS } from '../src/loot.js';
import { CHARM_TEXT, ITEM_TEXT, charmText, CHARM_GLYPH, ITEM_GLYPH } from '../src/desc.js';

test('charms sit in the six-slot pack and only work once socketed', () => {
  const inv = new Inventory();
  assert.equal(inv.pack.length, 6);
  inv.addCharm('sleep');
  assert.equal(inv.level('sleep'), 0, 'a charm in the pack does nothing');
  assert.equal(inv.move('pack', 0, 'charm', 0), true);
  assert.equal(inv.level('sleep'), 1);
  assert.equal(inv.pack[0], null);
  assert.equal(inv.move('charm', 0, 'pack', 0), true);
  assert.equal(inv.level('sleep'), 0);
});

test('pack is small enough that charms and items compete', () => {
  const inv = new Inventory();
  for (let i = 0; i < 6; i++) assert.equal(inv.addCharm('hunt'), 'added');
  assert.equal(inv.addCharm('hunt'), 'full');
  assert.equal(inv.addItem('pebbles'), false);
});

test('workbench fuses two equal charms and hands back the next level', () => {
  const inv = new Inventory();
  inv.addCharm('hunt');
  inv.addCharm('hunt');
  inv.move('pack', 0, 'work', 0);
  inv.move('pack', 1, 'work', 1);
  assert.deepEqual(inv.craftable(), { kind: 'charm', id: 'hunt', lvl: 2 });
  const out = inv.craft();
  assert.equal(inv.work[0], null);
  assert.equal(out.lvl, 2);
  inv.place('pack', 0, out);
  assert.equal(inv.pack[0].lvl, 2);
});

test('workbench refuses mismatched charms and max levels', () => {
  const inv = new Inventory();
  inv.work[0] = { kind: 'charm', id: 'hunt', lvl: 1 };
  inv.work[1] = { kind: 'charm', id: 'sleep', lvl: 1 };
  assert.equal(inv.craftable(), null);
  inv.work[0] = { kind: 'charm', id: 'survive', lvl: 3 };
  inv.work[1] = { kind: 'charm', id: 'survive', lvl: 3 };
  assert.equal(inv.craftable(), null);
});

test('items stack, spend, and unbind their hotkey when exhausted', () => {
  const inv = new Inventory();
  inv.addItem('sharpStone', 3);
  inv.bindHot(0, 0);
  assert.equal(inv.consume('sharpStone'), true);
  assert.equal(inv.pack[0].n, 2);
  inv.consume('sharpStone');
  inv.consume('sharpStone');
  assert.equal(inv.hot[0], null);
  assert.equal(inv.consume('sharpStone'), false);
});

test('every charm and item has words and a glyph; words grow with level', () => {
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

test('a hotkey points into the pack instead of taking the stack away', () => {
  const inv = new Inventory();
  inv.addItem('pebbles', 3);
  const idx = inv.pack.findIndex((s) => s && s.id === 'pebbles');
  assert.equal(inv.bindHot(0, idx), true);
  assert.equal(inv.count('pebbles'), 3, 'binding must not move the stack out of the pack');
  assert.equal(inv.consume('pebbles'), true);
  assert.equal(inv.count('pebbles'), 2);
  assert.equal(inv.hot[0].n, 2, 'the hotkey sees the same stack');
  // A stack that is not in the pack must not be adopted, or the first press deletes it.
  assert.equal(inv.place('hot', 1, { kind: 'item', id: 'vitamin', n: 2 }), false);
});
