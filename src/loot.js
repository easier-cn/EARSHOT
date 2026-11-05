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
  work: [0, 1],
  pack: [8, 15],
  hot: [16, 19],
  charm: [20, 23],
};

export const HOTKEY_ORDER = [1, 2, 4, 3];

export class Inventory {
  constructor() {
    this.pack = new Array(8).fill(null); // { id, n }
    this.hot = [null, null, null, null];
    this.charms = []; // charm ids, max 4, one per category
    this.work = [null, null];
    this.active = null; // hotkey index bound to left click
    this.stones = 0; // 投石问路 charges, refreshed per floor
  }

  level(id) {
    return this.charms.filter((c) => c === id).length;
  }

  has(id) {
    return this.level(id) || 0;
  }

  charmAt(i) {
    return this.charms[i] || null;
  }

  /** Two of the same charm merge into the next level, as long as a slot is free. */
  addCharm(id) {
    const def = CHARMS[id];
    if (!def) return 'bad';
    const lvl = this.level(id);
    if (lvl >= def.max) return 'max';
    if (lvl > 0) {
      this.charms.splice(this.charms.indexOf(id), 1);
      this.charms.push(id);
      return 'upgraded';
    }
    if (this.charms.length >= 4) return 'full';
    this.charms.push(id);
    return 'added';
  }

  addItem(id, n = 1) {
    const def = ITEMS[id];
    if (!def) return false;
    for (const slot of this.pack) {
      if (slot && slot.id === id) {
        slot.n += n;
        return true;
      }
    }
    const i = this.pack.indexOf(null);
    if (i < 0) return false;
    this.pack[i] = { id, n };
    return true;
  }

  usePack(i) {
    const slot = this.pack[i];
    if (!slot) return false;
    const def = ITEMS[slot.id];
    if (!def) return false;
    if (def.kind === 'use') {
      slot.n -= 1;
      if (slot.n <= 0) this.pack[i] = null;
      return { id: slot.id };
    }
    return { id: slot.id, throwable: true };
  }

  bindHot(i, packIndex) {
    const slot = this.pack[packIndex];
    this.hot[i] = slot ? { id: slot.id, from: packIndex } : null;
    return !!slot;
  }
}
