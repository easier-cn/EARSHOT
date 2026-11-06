// Charms and items.
//
// A charm is a small permanent (per-run) upgrade. Two identical charms merge
// into the next level on the workbench, so the table below only describes what
// a level *does*; the inventory code handles merging.

export const CHARMS = {
  sleep: {
    id: 'sleep',
    max: 3,
    name: { 1: '眠龙勿扰 I', 2: '眠龙勿扰 II', 3: '眠龙勿扰 III' },
    // chance a ping makes no tagged sound at all
    quiet: [0.25, 0.5, 0.75],
  },
  stress: {
    id: 'stress',
    max: 1,
    name: { 1: '应激反应' },
    // 8s of invulnerability + gold scouting rays + speed, on taking a hit
    invuln: 8,
    speed: 1.6,
  },
  survive: {
    id: 'survive',
    max: 3,
    name: { 1: '绝地求生 I', 2: '绝地求生 II', 3: '绝地求生 III' },
    extraLives: [1, 2, 3],
    needs: ['stress', 'counter'],
  },
  stone: {
    id: 'stone',
    max: 3,
    name: { 1: '投石问路 I', 2: '投石问路 II', 3: '投石问路 III' },
    stones: [3, 5, 7],
    noise: [1, 1.6, 2.2],
    sharp: 3,
  },
  counter: {
    id: 'counter',
    max: 1,
    name: { 1: '反击时刻' },
    // first body that touches you dies; then 3s where every body dies
    window: 3,
  },
  sneakSonar: {
    id: 'sneakSonar',
    max: 3,
    name: { 1: '潜行声呐 I', 2: '潜行声呐 II', 3: '潜行声呐 III' },
    directions: [4, 8, 12],
  },
  swift: {
    id: 'swift',
    max: 3,
    name: { 1: '迅捷潜行 I', 2: '迅捷潜行 II', 3: '迅捷潜行 III' },
    creep: [0.65, 0.75, 0.85],
  },
  home: {
    id: 'home',
    max: 3,
    name: { 1: '归家期盼 I', 2: '归家期盼 II', 3: '归家期盼 III' },
    range: [520, 760, 1000],
  },
  rewind: {
    id: 'rewind',
    max: 3,
    name: { 1: '时间逆流 I', 2: '时间逆流 II', 3: '时间逆流 III' },
    chance: [0.1, 0.2, 0.3],
  },
  hunt: {
    id: 'hunt',
    max: 3,
    name: { 1: '亡命猎屠 I', 2: '亡命猎屠 II', 3: '亡命猎屠 III' },
    mult: [2, 4, 8],
  },
};

export const ITEMS = {
  pebbles: { id: 'pebbles', kind: 'throw', name: '一小堆石子', count: 3, noise: 1, kills: false },
  sharpStone: { id: 'sharpStone', kind: 'throw', name: '一块锋利的石头', count: 1, noise: 1, kills: true },
  vitamin: { id: 'vitamin', kind: 'use', name: '维他命', speed: 2, dur: 5 },
  totem: { id: 'totem', kind: 'use', name: '不死图腾', stress: 1 },
  star: { id: 'star', kind: 'use', name: '无敌星', invuln: 3, kills: true },
  corpse: { id: 'corpse', kind: 'throw', name: '同类的尸骸', lure: 5 },
  bugspray: { id: 'bugspray', kind: 'throw', name: '老旧的驱虫器', repel: 1 },
  scanner: { id: 'scanner', kind: 'use', name: '扫描仪', scan: 1 },
};

/** Six rows of four: two workbench cells, eight pack slots, four hotkeys, four charms. */
export const SLOTS = {
  cols: 4,
  rows: 6,
};

/** Hotkey order on the number row: 1, 2, 4, 3. */
export const HOTKEY_ORDER = [1, 2, 4, 3];

/**
 * Inventory: four charm sockets (only these take effect), four hotkey cells,
 * a two-cell workbench, and a deliberately small six-cell pack. Charms ride in
 * the pack until dragged into a socket, so every pickup competes for space.
 */
export class Inventory {
  constructor() {
    this.pack = new Array(6).fill(null); // { kind:'item', id, n } | { kind:'charm', id, lvl }
    this.hot = new Array(4).fill(null); // references a pack entry
    this.charms = new Array(4).fill(null); // equipped, effective
    this.work = [null, null]; // charms moved out of pack/socket for fusing
    this.stones = 0;
  }

  /** Only equipped charms count. */
  level(id) {
    return this.charms.reduce((sum, c) => sum + (c && c.id === id ? c.lvl : 0), 0);
  }

  has(id) {
    return this.level(id) || 0;
  }

  charmAt(i) {
    return this.charms[i] || null;
  }

  count(id) {
    let n = 0;
    for (const s of this.pack) if (s && s.kind === 'item' && s.id === id) n += s.n;
    return n;
  }

  addItem(id, n = 1) {
    if (!ITEMS[id]) return false;
    for (const slot of this.pack) {
      if (slot && slot.kind === 'item' && slot.id === id) {
        slot.n += n;
        return true;
      }
    }
    const i = this.pack.indexOf(null);
    if (i < 0) return false;
    this.pack[i] = { kind: 'item', id, n };
    return true;
  }

  /** Charms drop into the pack; they must be dragged into a socket to work. */
  addCharm(id) {
    if (!CHARMS[id]) return 'bad';
    if (this.pack.indexOf(null) < 0) return 'full';
    this.pack[this.pack.indexOf(null)] = { kind: 'charm', id, lvl: 1 };
    return 'added';
  }

  /** Detach an entry from wherever it lives. */
  take(kind, i) {
    if (kind === 'pack') {
      const o = this.pack[i];
      if (!o) return null;
      this.pack[i] = null;
      for (let k = 0; k < this.hot.length; k++) if (this.hot[k] === o) this.hot[k] = null;
      return o;
    }
    if (kind === 'charm') {
      const o = this.charms[i];
      this.charms[i] = null;
      return o || null;
    }
    if (kind === 'work') {
      const o = this.work[i];
      this.work[i] = null;
      return o || null;
    }
    if (kind === 'hot') {
      const o = this.hot[i];
      this.hot[i] = null;
      return o ? { recycle: o } : null;
    }
    return null;
  }

  /** Place an object into a cell. */
  place(kind, i, o) {
    if (!o) return false;
    if (kind === 'pack') {
      if (this.pack[i]) return false;
      this.pack[i] = o;
      return true;
    }
    if (kind === 'charm') {
      if (this.charms[i] || !o || o.kind !== 'charm') return false;
      this.charms[i] = { kind: 'charm', id: o.id, lvl: o.lvl };
      return true;
    }
    if (kind === 'work') {
      if (this.work[i] || !o || o.kind !== 'charm') return false;
      this.work[i] = { kind: 'charm', id: o.id, lvl: o.lvl };
      return true;
    }
    if (kind === 'hot') {
      if (this.hot[i] || !o || o.kind !== 'item') return false;
      const def = ITEMS[o.id];
      if (!def) return false;
      this.hot[i] = o;
      return true;
    }
    return false;
  }

  /** Drag from one cell to another. Returns true when something changed. */
  move(fromKind, fromI, toKind, toI) {
    if (fromKind === toKind && fromI === toI) return false;
    if (fromKind === 'result') return false;
    const o = this.take(fromKind, fromI);
    if (!o) return false;
    if (o.recycle) return true;
    if (this.place(toKind, toI, o)) return true;
    if (fromKind === 'pack') this.pack[fromI] = o;
    else if (fromKind === 'charm') this.charms[fromI] = { kind: 'charm', id: o.id, lvl: o.lvl };
    else if (fromKind === 'work') this.work[fromI] = o;
    else if (fromKind === 'hot') this.hot[fromI] = o;
    return false;
  }

  craftable() {
    const [a, b] = this.work;
    if (!a || !b) return null;
    if (a.id !== b.id || a.lvl !== b.lvl) return null;
    if (a.lvl >= CHARMS[a.id].max) return null;
    return { kind: 'charm', id: a.id, lvl: a.lvl + 1 };
  }

  /** Consume both workbench charms and hand the result back (caller places it). */
  craft() {
    const out = this.craftable();
    if (!out) return null;
    this.work = [null, null];
    return out;
  }

  /** Spend one item from the pack; clears stale hotkey references. */
  consume(id) {
    const i = this.pack.findIndex((s) => s && s.kind === 'item' && s.id === id);
    if (i < 0) return false;
    const slot = this.pack[i];
    slot.n -= 1;
    if (slot.n <= 0) {
      this.pack[i] = null;
      for (let k = 0; k < this.hot.length; k++) if (this.hot[k] === slot) this.hot[k] = null;
    }
    return true;
  }

  bindHot(i, packIndex) {
    const slot = this.pack[packIndex];
    this.hot[i] = slot || null;
    return !!slot;
  }
}
