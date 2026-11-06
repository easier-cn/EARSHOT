// Map generators for the redesigned world.
//
//   room  — the starting map: one big rectangle split by walls into rooms with
//           doorways, no corridors. Key in the middle, three far corners hold
//           the maze exit, the castle door sits on the middle of one side and
//           the meadow exit is a sound-absorbing wall.
//   maze  — narrow one-tile corridors with the occasional 3x3 / 4x4 pocket.
//
// Everything works on whole tiles; the game converts to pixels with TILE.

import { mulberry32 } from './util.js';

export const TILE = 32;

const ri = (rnd, a, b) => a + Math.floor(rnd() * (b - a + 1));
const at = (w, x, y) => y * w + x;

function solid(grid, w, h, x, y) {
  if (x < 0 || y < 0 || x >= w || y >= h) return true;
  return grid[y * w + x] === 1;
}

function fill(grid, w, x0, y0, x1, y1, v) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) grid[y * w + x] = v;
  }
}

function reachable(grid, w, h, sx, sy) {
  const seen = new Uint8Array(w * h);
  const q = [sx, sy];
  seen[at(w, sx, sy)] = 1;
  while (q.length) {
    const y = q.pop();
    const x = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const i = at(w, nx, ny);
      if (seen[i] || grid[i] === 1) continue;
      seen[i] = 1;
      q.push(nx, ny);
    }
  }
  return seen;
}

function floorCount(grid, w, h) {
  let n = 0;
  for (let i = 0; i < w * h; i++) if (grid[i] === 0) n++;
  return n;
}

function centerOf(r) {
  return { x: r.x + (r.w >> 1), y: r.y + (r.h >> 1) };
}

// ---------------------------------------------------------------- room map --

function splitRooms(rnd, box, depth, rooms) {
  const minW = 9;
  const minH = 7;
  const canV = box.w >= minW * 2 + 1;
  const canH = box.h >= minH * 2 + 1;
  if (depth <= 0 || (!canV && !canH)) {
    rooms.push(box);
    return;
  }
  const vertical = canV && (!canH || box.w > box.h || (box.w === box.h && rnd() < 0.5));
  if (vertical) {
    const cut = ri(rnd, minW, box.w - minW - 1);
    const wall = box.x + cut;
    rooms.push({ ...box, wallX: wall, split: 'v' });
    // the two halves are recorded by the caller through this marker
    splitRooms(rnd, { x: box.x, y: box.y, w: cut, h: box.h }, depth - 1, rooms);
    splitRooms(rnd, { x: wall + 1, y: box.y, w: box.w - cut - 1, h: box.h }, depth - 1, rooms);
  } else {
    const cut = ri(rnd, minH, box.h - minH - 1);
    const wall = box.y + cut;
    rooms.push({ ...box, wallY: wall, split: 'h' });
    splitRooms(rnd, { x: box.x, y: box.y, w: box.w, h: cut }, depth - 1, rooms);
    splitRooms(rnd, { x: box.x, y: wall + 1, w: box.w, h: box.h - cut - 1 }, depth - 1, rooms);
  }
}

/**
 * The starting map. Rooms touch each other, separated by one-tile walls with
 * two-tile doorways, so the whole rectangle is one connected space.
 */
export function buildRoomMap(seed) {
  const rnd = mulberry32(seed);
  const w = 76;
  const h = 52;
  const grid = new Uint8Array(w * h);
  fill(grid, w, 0, 0, w - 1, h - 1, 1);
  fill(grid, w, 1, 1, w - 2, h - 2, 0);

  // --- 1. walls first: recursively split the big rectangle -----------------
  const boxes = [];
  const walls = [];
  const walk = (x, y, ww, hh, depth) => {
    const canV = ww >= 15;
    const canH = hh >= 13;
    if (depth <= 0 || (!canV && !canH)) {
      boxes.push({ x, y, w: ww, h: hh });
      return;
    }
    const vertical = canV && (!canH || ww > hh * 1.08 || (Math.abs(ww - hh) <= 2 && rnd() < 0.5));
    if (vertical) {
      const lo = Math.max(8, Math.round(ww * 0.34));
      const hi = Math.max(lo, Math.min(ww - 9, Math.round(ww * 0.66)));
      const cut = ri(rnd, lo, hi);
      walls.push({ x: x + cut, y, len: hh, axis: 'v' });
      for (let dy = 0; dy < hh; dy++) grid[at(w, x + cut, y + dy)] = 1;
      walk(x, y, cut, hh, depth - 1);
      walk(x + cut + 1, y, ww - cut - 1, hh, depth - 1);
    } else {
      const lo = Math.max(7, Math.round(hh * 0.34));
      const hi = Math.max(lo, Math.min(hh - 8, Math.round(hh * 0.66)));
      const cut = ri(rnd, lo, hi);
      walls.push({ x, y: y + cut, len: ww, axis: 'h' });
      for (let dx = 0; dx < ww; dx++) grid[at(w, x + dx, y + cut)] = 1;
      walk(x, y, ww, cut, depth - 1);
      walk(x, y + cut + 1, ww, hh - cut - 1, depth - 1);
    }
  };
  walk(1, 1, w - 2, h - 2, 6);

  // --- 2. then punch doorways so the wall network is one open space ---------
  for (const wl of walls) {
    if (wl.axis === 'v') {
      const y0 = wl.y + 2;
      const y1 = wl.y + wl.len - 3;
      if (y1 <= y0) continue;
      const atY = ri(rnd, y0, y1);
      const wide = rnd() < 0.25 ? 3 : 2;
      for (let dy = 0; dy < wide && atY + dy <= y1; dy++) {
        fill(grid, w, wl.x, atY + dy, wl.x, atY + dy, 0);
      }
    } else {
      const x0 = wl.x + 2;
      const x1 = wl.x + wl.len - 3;
      if (x1 <= x0) continue;
      const atX = ri(rnd, x0, x1);
      const wide = rnd() < 0.25 ? 3 : 2;
      for (let dx = 0; dx < wide && atX + dx <= x1; dx++) {
        fill(grid, w, atX + dx, wl.y, atX + dx, wl.y, 0);
      }
    }
  }

  const isFloor = (x, y) => x > 0 && y > 0 && x < w - 1 && y < h - 1 && grid[at(w, x, y)] === 0;

  // --- 3. furnishing: internal wall stubs, never allowed to seal a room -----
  const connected = () => {
    let first = -1;
    for (let i = 0; i < w * h; i++) if (grid[i] === 0) { first = i; break; }
    if (first < 0) return false;
    const seen = new Uint8Array(w * h);
    const q = [first];
    seen[first] = 1;
    let n = 0;
    while (q.length) {
      const i = q.pop();
      n++;
      const x = i % w;
      const y = (i / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) continue;
        const j = ny * w + nx;
        if (seen[j] || grid[j] !== 0) continue;
        seen[j] = 1;
        q.push(j);
      }
    }
    let total = 0;
    for (let i = 0; i < w * h; i++) if (grid[i] === 0) total++;
    return n === total;
  };

  const decor = (box) => {
    const tiles = [];
    const kind = ri(rnd, 0, 3);
    const innerX0 = box.x + 2;
    const innerX1 = box.x + box.w - 3;
    const innerY0 = box.y + 2;
    const innerY1 = box.y + box.h - 3;
    if (innerX1 - innerX0 < 2 || innerY1 - innerY0 < 2) return tiles;
    if (kind === 0 && box.w >= 11 && box.h >= 9) {
      // a stub hanging off one wall, leaving room on both sides
      const fromTop = rnd() < 0.5;
      const len = ri(rnd, 3, Math.max(3, Math.min(6, (box.h >> 1) - 1)));
      const x = ri(rnd, innerX0 + 1, innerX1 - 1);
      for (let i = 0; i < len; i++) tiles.push([x, fromTop ? box.y + 1 + i : box.y + box.h - 2 - i]);
    } else if (kind === 1 && box.w >= 12) {
      // a free-standing partition with a gap at both ends
      const y = ri(rnd, innerY0, innerY1);
      const len = ri(rnd, 4, Math.max(4, Math.min(9, box.w - 7)));
      const x0 = ri(rnd, innerX0, innerX1 - len);
      for (let i = 0; i < len; i++) tiles.push([x0 + i, y]);
    } else if (kind === 2) {
      // short pillars
      for (let i = 0, n = ri(rnd, 2, 4); i < n; i++) {
        tiles.push([ri(rnd, innerX0, innerX1), ri(rnd, innerY0, innerY1)]);
      }
    } else {
      // an L corner inside the room
      const x = ri(rnd, innerX0 + 1, innerX1 - 3);
      const y = ri(rnd, innerY0 + 1, innerY1 - 3);
      for (let i = 0; i < 3; i++) { tiles.push([x + i, y]); tiles.push([x, y + i]); }
    }
    return tiles;
  };

  const snapshot = new Uint8Array(w * h);
  for (const box of boxes) {
    const passes = rnd() < 0.35 ? 2 : rnd() < 0.85 ? 1 : 0;
    for (let pass = 0; pass < passes; pass++) {
      snapshot.set(grid);
      const tiles = decor(box);
      let touched = false;
      for (const [x, y] of tiles) {
        if (!isFloor(x, y)) continue;
        grid[at(w, x, y)] = 1;
        touched = true;
      }
      if (!touched || !connected()) grid.set(snapshot);
    }
  }

  const spawnBox = boxes.reduce((a, b) => (a.x + a.y <= b.x + b.y ? a : b));
  const spawnC = centerOf(spawnBox);
  const mid = { x: w >> 1, y: h >> 1 };
  const keyBox = boxes.reduce((a, b) => {
    const da = Math.hypot(a.x + a.w / 2 - mid.x, a.y + a.h / 2 - mid.y);
    const db = Math.hypot(b.x + b.w / 2 - mid.x, b.y + b.h / 2 - mid.y);
    return da <= db ? a : b;
  });
  const keyC = centerOf(keyBox);

  // keep the important tiles clean, whatever the furnishing did
  const clearAround = (c, r) => {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = c.x + dx;
        const y = c.y + dy;
        if (x > 0 && y > 0 && x < w - 1 && y < h - 1) grid[at(w, x, y)] = 0;
      }
    }
  };
  clearAround(spawnC, 1);
  clearAround(keyC, 1);

  // Three far corners: the maze exit goes into one of them at random.
  const corners = [
    { x: 2, y: h - 3 },
    { x: w - 3, y: 2 },
    { x: w - 3, y: h - 3 },
  ];
  const pickCorner = corners[ri(rnd, 0, 2)];
  const mazeTile = { x: pickCorner.x, y: pickCorner.y };
  const mazeDoor = { x: 1, y: mazeTile.y };
  fill(grid, w, mazeDoor.x, mazeDoor.y, mazeDoor.x, mazeDoor.y, 0);
  clearAround(mazeTile, 1);

  const castleDoor = { x: w - 2, y: h >> 1 };
  const meadowDoor = { x: w >> 1, y: h - 2 };
  fill(grid, w, castleDoor.x, castleDoor.y, castleDoor.x, castleDoor.y, 0);
  fill(grid, w, meadowDoor.x, meadowDoor.y, meadowDoor.x, meadowDoor.y, 0);
  clearAround({ x: castleDoor.x - 1, y: castleDoor.y }, 1);
  clearAround({ x: meadowDoor.x, y: meadowDoor.y - 1 }, 1);

  const absorb = [];
  for (let dx = -1; dx <= 1; dx++) {
    const x = meadowDoor.x + dx;
    if (x >= 0 && x < w) absorb.push(at(w, x, h - 1));
  }

  const rooms = boxes.map((b) => {
    const c = centerOf(b);
    return { x: b.x, y: b.y, w: b.w, h: b.h, cx: c.x, cy: c.y, kind: 'room' };
  });

  // --- 4. props and enemies -------------------------------------------------
  const CHARM_IDS = ['sleep', 'stress', 'survive', 'stone', 'counter', 'sneakSonar', 'swift', 'home', 'rewind', 'hunt'];
  const ITEM_IDS = ['pebbles', 'sharpStone', 'vitamin', 'totem', 'star', 'corpse', 'bugspray', 'scanner'];
  const loot = [];
  const taken = new Set();
  const spotIn = (box) => {
    for (let i = 0; i < 24; i++) {
      const x = ri(rnd, box.x + 1, box.x + box.w - 2);
      const y = ri(rnd, box.y + 1, box.y + box.h - 2);
      const k = y * w + x;
      if (!isFloor(x, y) || taken.has(k)) continue;
      taken.add(k);
      return { x, y };
    }
    return null;
  };
  for (const b of boxes) {
    if (rnd() > 0.42) continue;
    const p = spotIn(b);
    if (!p) continue;
    const charm = rnd() < 0.55;
    loot.push(charm
      ? { kind: 'charm', id: CHARM_IDS[ri(rnd, 0, CHARM_IDS.length - 1)], x: p.x, y: p.y }
      : { kind: 'item', id: ITEM_IDS[ri(rnd, 0, ITEM_IDS.length - 1)], x: p.x, y: p.y });
  }

  const monsters = [];
  const far = boxes
    .filter((b) => Math.hypot(centerOf(b).x - spawnC.x, centerOf(b).y - spawnC.y) > 12)
    .sort(() => rnd() - 0.5);
  for (const b of far) {
    if (monsters.length >= 5) break;
    const c = centerOf(b);
    if (monsters.some((m) => Math.hypot(m.x - c.x, m.y - c.y) < 10)) continue;
    if (!isFloor(c.x, c.y)) {
      const p = spotIn(b);
      if (!p) continue;
      monsters.push({ x: p.x, y: p.y, type: 'lurker' });
    } else {
      monsters.push({ x: c.x, y: c.y, type: 'lurker' });
    }
  }

  const standing = (t) => grid[at(w, t.x, t.y)] === 0;
  return {
    mapId: 'room',
    w,
    h,
    tile: TILE,
    size: { w: w * TILE, h: h * TILE },
    grid,
    rooms,
    spawn: { x: spawnC.x * TILE + TILE / 2, y: spawnC.y * TILE + TILE / 2 },
    spawnTile: spawnC,
    key: { x: keyC.x * TILE + TILE / 2, y: keyC.y * TILE + TILE / 2 },
    keyTile: keyC,
    exit: { x: mazeTile.x * TILE + TILE / 2, y: mazeTile.y * TILE + TILE / 2 },
    exitTile: mazeTile,
    exits: [
      { to: 'maze', x: mazeDoor.x, y: mazeDoor.y, require: 'key', color: '127,227,212' },
      { to: 'meadow', x: meadowDoor.x, y: meadowDoor.y, require: null, color: '140,240,170', absorb: true },
      { to: 'castle', x: castleDoor.x, y: castleDoor.y, require: 'castle', color: '255,150,90' },
    ],
    absorb,
    monsters,
    loot,
    seed,
    valid: standing(spawnC) && standing(keyC) && standing(mazeTile),
  };
}

// ---------------------------------------------------------------- maze map --

/**
 * Narrow maze: one-tile corridors, occasional 3x3 / 4x4 pockets so it never
 * dead-ends into a single blocked tile. Exit sits diagonally opposite spawn.
 */
export function buildMazeMap(seed) {
  const rnd = mulberry32(seed);
  const cw = 39;
  const ch = 25;
  const w = cw * 2 + 1;
  const h = ch * 2 + 1;
  const grid = new Uint8Array(w * h);
  fill(grid, w, 0, 0, w - 1, h - 1, 1);

  const seenCell = new Uint8Array(cw * ch);
  const stack = [[0, 0]];
  seenCell[0] = 1;
  fill(grid, w, 1, 1, 1, 1, 0);
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].sort(() => rnd() - 0.5);
    let moved = false;
    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
      if (seenCell[ny * cw + nx]) continue;
      seenCell[ny * cw + nx] = 1;
      fill(grid, w, cx * 2 + 1 + dx, cy * 2 + 1 + dy, cx * 2 + 1 + dx, cy * 2 + 1 + dy, 0);
      fill(grid, w, nx * 2 + 1, ny * 2 + 1, nx * 2 + 1, ny * 2 + 1, 0);
      stack.push([nx, ny]);
      moved = true;
      break;
    }
    if (!moved) stack.pop();
  }

  // pockets: widen a handful of cells into 3x3 / 4x4 open squares
  const pockets = [];
  for (let i = 0; i < 26; i++) {
    const cx = ri(rnd, 2, cw - 3);
    const cy = ri(rnd, 2, ch - 3);
    const size = rnd() < 0.65 ? 3 : 4;
    const tx = cx * 2;
    const ty = cy * 2;
    fill(grid, w, tx - 1, ty - 1, tx + size - 2, ty + size - 2, 0);
    pockets.push({ x: tx - 1, y: ty - 1, w: size, h: size });
  }

  const spawnTile = { x: 1, y: 1 };
  const exitTile = { x: w - 2, y: h - 2 };

  const monsters = [];
  for (let i = 0; i < 5; i++) {
    let tx = 0;
    let ty = 0;
    for (let tries = 0; tries < 200; tries++) {
      tx = ri(rnd, 3, w - 4);
      ty = ri(rnd, 3, h - 4);
      if (grid[at(w, tx, ty)] === 0 && Math.hypot(tx - spawnTile.x, ty - spawnTile.y) > 18) break;
    }
    if (grid[at(w, tx, ty)] === 0) monsters.push({ x: tx, y: ty, type: 'lurker' });
  }

  return {
    mapId: 'maze',
    w,
    h,
    tile: TILE,
    size: { w: w * TILE, h: h * TILE },
    grid,
    rooms: pockets,
    spawn: { x: spawnTile.x * TILE + TILE / 2, y: spawnTile.y * TILE + TILE / 2 },
    spawnTile,
    key: null,
    exit: { x: exitTile.x * TILE + TILE / 2, y: exitTile.y * TILE + TILE / 2 },
    exitTile,
    exits: [{ to: 'room', x: 0, y: 0, require: null, color: '127,227,212', silent: true }],
    absorb: [],
    monsters,
    loot: [],
    seed,
  };
}

/** Connectivity audit used by tests + the generator retry loop. */
export function mapConnected(level) {
  const { grid, w, h, spawnTile } = level;
  const seen = reachable(grid, w, h, spawnTile.x, spawnTile.y);
  let open = 0;
  let ok = 0;
  for (let i = 0; i < w * h; i++) {
    if (grid[i] !== 0) continue;
    open++;
    if (seen[i]) ok++;
  }
  return { ok: open === ok, open, reached: ok };
}
