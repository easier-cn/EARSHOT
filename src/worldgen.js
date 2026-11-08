// Map generators for the redesigned world.
//
//   room  — the starting map: one big rectangle split by walls into rooms with
//           doorways, no corridors. Key in the middle, three far corners hold
//           the maze exit, the castle door sits on the middle of one side and
//           the meadow exit is a sound-absorbing wall.
//   maze  — narrow one-tile corridors with the occasional 3x3 / 4x4 pocket.
//
// Everything works on whole tiles; the game converts to pixels with TILE.

import { mulberry32, shuffle } from './util.js';
import { findPath } from './pathfind.js';

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
  // What sits at a spot is rolled when the player first comes near it
  // (see Game.revealLoot), so no id is chosen here.
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
    // Identity is deferred to pickup range; a spot is just a place for now.
    loot.push({ x: p.x, y: p.y });
  }

  const monsters = [];
  const far = shuffle(
    boxes.filter((b) => Math.hypot(centerOf(b).x - spawnC.x, centerOf(b).y - spawnC.y) > 12),
    rnd,
  );
  for (const b of far) {
    if (monsters.length >= 9) break;
    const c = centerOf(b);
    if (monsters.some((m) => Math.hypot(m.x - c.x, m.y - c.y) < 10)) continue;
    if (!isFloor(c.x, c.y)) {
      const p = spotIn(b);
      if (!p) continue;
      monsters.push({ x: p.x, y: p.y, type: 'hunter' });
    } else {
      monsters.push({ x: c.x, y: c.y, type: 'hunter' });
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
 * Loot for the maze: 8-10 spots strung along the walk from spawn to exit
 * instead of dropped into a handful of pockets. A spot may stand in the
 * middle of a one-tile corridor — that is a normal place to notice something.
 * What actually sits there is rolled only when the player gets close
 * (Game.revealLoot), so this function only picks the places.
 */
function mazeLoot(rnd, grid, w, h, spawnTile, exitTile, monsters) {
  const open = (x, y) => x >= 0 && y >= 0 && x < w && y < h && grid[y * w + x] === 0;
  const seen = reachable(grid, w, h, spawnTile.x, spawnTile.y);

  // Walk depth from spawn. Bands of depth keep the spots following the route
  // rather than clustering in whichever pocket happens to be widest.
  const dist = new Int32Array(w * h).fill(-1);
  dist[spawnTile.y * w + spawnTile.x] = 0;
  const queue = [spawnTile.x, spawnTile.y];
  let depth = 0;
  while (queue.length) {
    const y = queue.pop();
    const x = queue.pop();
    const d = dist[y * w + x];
    if (d > depth) depth = d;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (!open(nx, ny)) continue;
      const i = ny * w + nx;
      if (dist[i] >= 0) continue;
      dist[i] = d + 1;
      queue.push(nx, ny);
    }
  }

  // A corridor tile has at most two open neighbours (a straight run or a
  // bend); a pocket centre has three or four.
  const corridor = (x, y) => {
    let n = 0;
    if (open(x + 1, y)) n++;
    if (open(x - 1, y)) n++;
    if (open(x, y + 1)) n++;
    if (open(x, y - 1)) n++;
    return n <= 2;
  };

  const blocked = new Set((monsters || []).map((m) => m.y * w + m.x));
  const usable = (i) => seen[i] && dist[i] >= 5 && !blocked.has(i);
  const farFrom = (p, q, r) => Math.hypot(p.x - q.x, p.y - q.y) >= r;
  const spots = [];
  const taken = new Set();

  const tryPlace = (i, minGap) => {
    if (!usable(i) || taken.has(i)) return null;
    const x = i % w;
    const y = (i / w) | 0;
    if (x === exitTile.x && y === exitTile.y) return null;
    const p = { x, y };
    if (!farFrom(p, spawnTile, 5) || !farFrom(p, exitTile, 4)) return null;
    if (spots.some((s) => !farFrom(p, s, minGap))) return null;
    taken.add(i);
    spots.push(p);
    return p;
  };

  const target = ri(rnd, 8, 10);
  const CORRIDOR_MIN = 3;
  let corridors = 0;

  // 1. One spot per depth band, preferring a corridor tile most of the time
  //    so "in the middle of the path" is the common case, not the exception.
  //    The first few bands insist on corridors until the minimum is met.
  for (let band = 0; band < target; band++) {
    const lo = Math.max(2, Math.floor((depth * band) / target));
    const hi = Math.max(lo, Math.floor((depth * (band + 1)) / target));
    const pool = [];
    for (let i = 0; i < w * h; i++) {
      if (usable(i) && dist[i] >= lo && dist[i] <= hi) pool.push(i);
    }
    for (let i = pool.length - 1; i > 0; i--) {
      const j = (rnd() * (i + 1)) | 0;
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const wantCorridor = corridors < CORRIDOR_MIN || rnd() < 0.6;
    // Stable sort keeps the shuffled order inside each group.
    pool.sort((a, b) => Number(corridor(a % w, (a / w) | 0) !== wantCorridor) - Number(corridor(b % w, (b / w) | 0) !== wantCorridor));
    for (const i of pool) {
      const p = tryPlace(i, 5);
      if (!p) continue;
      if (corridor(p.x, p.y)) corridors++;
      break;
    }
  }

  // 2. Bands are a guide, not a quota: widen the net until the promised
  //    8-10 spots stand. Spacing tightens a little to make room.
  if (spots.length < target) {
    const rest = [];
    for (let i = 0; i < w * h; i++) if (usable(i) && !taken.has(i)) rest.push(i);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = (rnd() * (i + 1)) | 0;
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    for (const i of rest) {
      if (spots.length >= target) break;
      tryPlace(i, 3);
    }
  }

  return spots;
}

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
    const dirs = shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]], rnd);
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
    loot: mazeLoot(rnd, grid, w, h, spawnTile, exitTile, monsters),
    seed,
  };
}

// -------------------------------------------------------------- moving map --
//
// Nine 25x25 rooms laid out on a 3x3 grid, each with two floor plans. Every
// twenty seconds five of the nine rooms swap plans and the maze re-forms under
// the player. The rooms share their one-tile borders, so a door on a shared
// border lines up no matter which plan either side is showing.

export const MOVING = {
  N: 3,
  PITCH: 24,
  BLOCK: 25,
  W: 73,
  H: 73,
  PERIOD: 20,
  FIRST: 4,
};

const M_BLOCK = MOVING.BLOCK;
const M_PITCH = MOVING.PITCH;

function blockIndex(r, c) {
  return r * 3 + c;
}

function blockAtTile(level, tx, ty) {
  if (!level || !level.blocks) return null;
  if (tx < 0 || ty < 0 || tx >= level.w || ty >= level.h) return null;
  const c = Math.min(2, Math.max(0, Math.floor(tx / M_PITCH)));
  const r = Math.min(2, Math.max(0, Math.floor(ty / M_PITCH)));
  return level.blocks[blockIndex(r, c)] || null;
}

/** The block that owns a tile. Shared borders belong to the lower/right block. */
export function blockAt(level, tx, ty) {
  return blockAtTile(level, tx, ty);
}

const localAt = (x, y) => y * M_BLOCK + x;

/** A one-tile-wide maze on a 10x10 cell grid, wrapped by a one-tile ring.
 *  `sides` says which sides have a neighbouring room; only those get doors. */
function makeBlockPlan(rnd, sides) {
  const g = new Uint8Array(M_BLOCK * M_BLOCK).fill(1);
  const set = (x, y, v) => {
    g[localAt(x, y)] = v;
  };

  // One-tile ring corridor inside the outer wall.
  for (let i = 1; i < M_BLOCK - 1; i++) {
    set(1, i, 0);
    set(M_BLOCK - 2, i, 0);
    set(i, 1, 0);
    set(i, M_BLOCK - 2, 0);
  }

  // Two doors per *interior* side, at odd coordinates so each one lines up
  // with a one-tile corridor. Outer sides stay solid.
  const doors = { up: [], down: [], left: [], right: [] };
  for (const d of [5, 17]) {
    if (sides.up) {
      doors.up.push(d);
      set(d, 0, 0);
      set(d, 2, 0);
    }
    if (sides.down) {
      doors.down.push(d);
      set(d, M_BLOCK - 1, 0);
      set(d, M_BLOCK - 3, 0);
    }
    if (sides.left) {
      doors.left.push(d);
      set(0, d, 0);
      set(2, d, 0);
    }
    if (sides.right) {
      doors.right.push(d);
      set(M_BLOCK - 1, d, 0);
      set(M_BLOCK - 3, d, 0);
    }
  }

  // 10x10 cells at odd local coordinates 3..21; walls at even coordinates.
  const N = 10;
  const cellX = (c) => 3 + c * 2;
  const cellY = (r) => 3 + r * 2;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) set(cellX(c), cellY(r), 0);
  }

  const key = (c, r) => r * N + c;
  const seen = new Uint8Array(N * N);
  const degree = new Uint8Array(N * N);
  const links = new Set();
  const neighbours = (c, r) => {
    const out = [];
    if (c > 0) out.push([c - 1, r]);
    if (c < N - 1) out.push([c + 1, r]);
    if (r > 0) out.push([c, r - 1]);
    if (r < N - 1) out.push([c, r + 1]);
    return out;
  };
  const connect = (c1, r1, c2, r2) => {
    if (c1 === c2) {
      const r = Math.min(r1, r2);
      set(cellX(c1), cellY(r) + 1, 0);
    } else {
      const c = Math.min(c1, c2);
      set(cellX(c) + 1, cellY(r1), 0);
    }
    links.add(`${key(c1, r1)}-${key(c2, r2)}`);
    links.add(`${key(c2, r2)}-${key(c1, r1)}`);
    degree[key(c1, r1)]++;
    degree[key(c2, r2)]++;
  };

  const start = [ri(rnd, 0, N - 1), ri(rnd, 0, N - 1)];
  seen[key(start[0], start[1])] = 1;
  const stack = [start];
  while (stack.length) {
    const [c, r] = stack[stack.length - 1];
    const options = neighbours(c, r).filter(([nc, nr]) => !seen[key(nc, nr)]);
    if (!options.length) {
      stack.pop();
      continue;
    }
    const [nc, nr] = options[Math.floor(rnd() * options.length)];
    connect(c, r, nc, nr);
    seen[key(nc, nr)] = 1;
    stack.push([nc, nr]);
  }

  // A few loops so the maze is not a pure tree.
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (degree[key(c, r)] > 1 || rnd() > 0.12) continue;
      const options = neighbours(c, r).filter(([nc, nr]) => !links.has(`${key(c, r)}-${key(nc, nr)}`));
      if (!options.length) continue;
      const [nc, nr] = options[Math.floor(rnd() * options.length)];
      connect(c, r, nc, nr);
    }
  }

  // Centre room: 3x3 open, one solid 口 in the middle, and one-tile entrances
  // on all four sides so the button is never sealed off.
  for (let y = 11; y <= 13; y++) {
    for (let x = 11; x <= 13; x++) set(x, y, 0);
  }
  for (const [x, y] of [[10, 11], [10, 13], [14, 11], [14, 13], [11, 10], [13, 10], [11, 14], [13, 14]]) {
    set(x, y, 0);
  }

  g.doors = doors;
  return g;
}

function applyCenter(g, decor) {
  g[localAt(12, 12)] = decor === 'none' ? 0 : 1;
}

function fillPlan(g, v) {
  g.fill(v);
}

function planDoors(b) {
  const out = [];
  const sides = (b && b.sides) || {};
  for (const d of [5, 17]) {
    if (sides.up) out.push([d, 0]);
    if (sides.down) out.push([d, M_BLOCK - 1]);
    if (sides.left) out.push([0, d]);
    if (sides.right) out.push([M_BLOCK - 1, d]);
  }
  return out;
}

/** World tile coordinates of the doors on a block's interior sides. */
export function movingDoors(b) {
  const out = [];
  for (const [lx, ly] of planDoors(b)) out.push({ x: b.ox + lx, y: b.oy + ly });
  return out;
}

export function writeMovingBlock(level, b) {
  const src = b.variants[b.z];
  for (let y = 0; y < M_BLOCK; y++) {
    const row = (b.oy + y) * level.w + b.ox;
    const srow = y * M_BLOCK;
    for (let x = 0; x < M_BLOCK; x++) level.grid[row + x] = src[srow + x];
  }
  // A shattered 口 stays open: the variant still has its centre wall, but the
  // glass is gone, so never let a later write close it again.
  if (b.core && b.core.broken) {
    level.grid[(b.oy + 12) * level.w + b.ox + 12] = 0;
  }
}

function composeMoving(level) {
  for (const b of level.blocks) writeMovingBlock(level, b);
}

export function buildMovingMap(seed = 1) {
  const rnd = mulberry32(seed);
  const W = MOVING.W;
  const H = MOVING.H;
  const grid = new Uint8Array(W * H).fill(1);
  const blocks = [];
  for (let i = 0; i < 9; i++) {
    const r = Math.floor(i / 3);
    const c = i % 3;
    const sides = { up: r > 0, down: r < 2, left: c > 0, right: c < 2 };
    // Two different one-tile mazes. Doors are identical on both faces, so a
    // room can be replaced without its exits moving.
    const variants = [makeBlockPlan(rnd, sides), makeBlockPlan(rnd, sides)];
    blocks.push({
      i,
      r,
      c,
      ox: c * M_PITCH,
      oy: r * M_PITCH,
      z: 0,
      gone: false,
      broken: false,
      sides,
      variants,
      decor: ['spark', 'spark'],
      core: null,
    });
  }

  // Spawn in a corner; the goal is the opposite corner. b2 is the centre room
  // and always the secret one.
  const corner = [0, 2, 6, 8][Math.floor(rnd() * 4)];
  const sr = Math.floor(corner / 3);
  const sc = corner % 3;
  const target = blockIndex(2 - sr, 2 - sc);
  for (const b of blocks) {
    if (b.i === target) b.decor = ['none', 'button'];
    if (b.i === 4) b.decor = ['spark', 'spark'];
    // The two variants may need different centres (the goal is absent on the
    // first floor and a button on the second).
    applyCenter(b.variants[0], b.decor[0]);
    applyCenter(b.variants[1], b.decor[1]);
    const color = b.i === 4 ? '255, 200, 90' : b.i === target ? '255, 210, 120' : ['127, 227, 212', '70, 150, 160'][b.z];
    b.core = {
      tx: b.ox + 12,
      ty: b.oy + 12,
      cell: { x: b.ox + 12, y: b.oy + 12 },
      broken: false,
      kind: b.i === 4 ? 'b2' : b.i === target ? 'button' : 'spark',
      color,
      decor: b.decor.slice(),
    };
  }

  const level = {
    mapId: 'moving',
    w: W,
    h: H,
    tile: TILE,
    size: { w: W * TILE, h: H * TILE },
    grid,
    rooms: [],
    blocks,
    spawnTile: { x: blocks[corner].ox + 12, y: blocks[corner].oy + 13 },
    spawn: {
      x: (blocks[corner].ox + 12) * TILE + TILE / 2,
      y: (blocks[corner].oy + 13) * TILE + TILE / 2,
    },
    key: null,
    exit: null,
    exits: [],
    absorb: [],
    monsters: [],
    loot: [],
    seed,
    moving: {
      state: 'running',
      clock: 0,
      nextFlip: MOVING.FIRST,
      period: MOVING.PERIOD,
      flips: 0,
      spawn: corner,
      target,
      targetLayer: 1,
      rng: mulberry32((seed ^ 0x9e3779b9) >>> 0),
    },
  };

  composeMoving(level);

  // Loot lives on the ring, six spots across the whole map.
  const ring = [];
  for (const b of blocks) {
    for (let y = 1; y < M_BLOCK - 1; y++) {
      for (let x = 1; x < M_BLOCK - 1; x++) {
        if (x >= 3 && x <= 21 && y >= 3 && y <= 21) continue;
        ring.push({ x: b.ox + x, y: b.oy + y });
      }
    }
  }
  shuffle(ring, rnd);
  for (const p of ring) {
    if (level.loot.length >= 6) break;
    if (level.grid[p.y * W + p.x] !== 0) continue;
    if (Math.hypot(p.x - level.spawnTile.x, p.y - level.spawnTile.y) < 10) continue;
    if (level.loot.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 7)) continue;
    level.loot.push({ x: p.x, y: p.y });
  }

  // Eighteen lurkers: one per block-layer, so each of the two faces of a room
  // has its own guard. Only the guard of the face currently written into the
  // physical grid is awake; the other one waits in its variant.
  for (const b of blocks) {
    for (let layer = 0; layer < 2; layer++) {
      const spots = [];
      const v = b.variants[layer];
      for (let y = 1; y < 24; y++) {
        for (let x = 1; x < 24; x++) {
          // Keep the 3x3 centre room quiet: the button side must stay safe.
          if (x >= 9 && x <= 15 && y >= 9 && y <= 15) continue;
          if (v[y * M_BLOCK + x] !== 0) continue;
          spots.push({ x: b.ox + x, y: b.oy + y });
        }
      }
      shuffle(spots, rnd);
      for (const p of spots) {
        if (Math.hypot(p.x - level.spawnTile.x, p.y - level.spawnTile.y) < 8) continue;
        if (level.monsters.some((m) => m.x === p.x && m.y === p.y)) continue;
        level.monsters.push({ x: p.x, y: p.y, type: 'lurker', block: b.i, layer });
        break;
      }
    }
  }

  return level;
}

/** Pick exactly five unbroken blocks to flip, never `avoid` (the player's room). */
export function pickMovingFlips(level, avoid = -1) {
  const pool = level.blocks.filter((b) => !b.core.broken && !b.gone && b.i !== avoid).map((b) => b.i);
  if (pool.length <= 5) return pool;
  return shuffle(pool, level.moving.rng).slice(0, 5);
}

export function flipMovingBlock(level, b) {
  b.z ^= 1;
  writeMovingBlock(level, b);
  level.moving.flips++;
}

/** Toggle the picked blocks. Returns the blocks that actually moved. */
export function flipMoving(level, picked = pickMovingFlips(level)) {
  const moved = [];
  for (const i of picked) {
    const b = level.blocks[i];
    if (!b.core.broken) moved.push(b);
  }
  for (const b of moved) flipMovingBlock(level, b);
  return moved;
}

/** The active core at a pixel position, if a thrown thing would hit it. */
export function coreHitAt(level, x, y, radius = 30) {
  const tx = Math.floor(x / level.tile);
  const ty = Math.floor(y / level.tile);
  const b = blockAtTile(level, tx, ty);
  if (!b || !b.core || b.core.broken || b.decor[b.z] === 'none') return null;
  const cx = (b.ox + 12 + 0.5) * level.tile;
  const cy = (b.oy + 12 + 0.5) * level.tile;
  return Math.hypot(x - cx, y - cy) <= radius ? b : null;
}

/** Move a body that the flip just buried back onto the nearest open tile. */
export function nearestOpenInBlock(level, b, px, py) {
  const sx = Math.floor(px / level.tile);
  const sy = Math.floor(py / level.tile);
  for (let r = 0; r <= 12; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) + Math.abs(dy) !== r) continue;
        const x = sx + dx;
        const y = sy + dy;
        if (x < b.ox || x > b.ox + M_BLOCK - 1 || y < b.oy || y > b.oy + M_BLOCK - 1) continue;
        if (level.grid[y * level.w + x] === 0) {
          return { x: (x + 0.5) * level.tile, y: (y + 0.5) * level.tile };
        }
      }
    }
  }
  return null;
}

/** The target button is only real on the second floor. */
export function solveMoving(level) {
  const m = level.moving;
  const target = level.blocks[m.target];
  if (!target || target.core.broken || target.z !== m.targetLayer) return null;
  const goal = { x: target.ox + 12, y: target.oy + 13 };
  return findPath(level.grid, level.w, level.h, level.spawnTile.x, level.spawnTile.y, goal.x, goal.y);
}

/** Normal clear: the maze stops, the centre room seals, eight doors open. */
export function clearMoving(level) {
  const m = level.moving;
  if (m.state === 'collapsed') return level.exits;
  m.state = 'cleared';
  for (const b of level.blocks) b.core.broken = true;
  const b2 = level.blocks[4];
  b2.gone = true;
  for (const v of b2.variants) fillPlan(v, 1);
  for (const [lx, ly] of planDoors(b2)) {
    b2.variants[0][localAt(lx, ly)] = 0;
    b2.variants[1][localAt(lx, ly)] = 0;
  }
  writeMovingBlock(level, b2);
  // The clear is terminal: b2 is gone, so its whole 3x3 centre is wall. The
  // broken-core rule in writeMovingBlock only applies while the maze still runs.
  level.grid[(b2.oy + 12) * level.w + b2.ox + 12] = 1;
  level.exits = movingDoors(b2).map((d) => ({
    to: 'mech',
    x: d.x,
    y: d.y,
    require: null,
    color: '200, 160, 255',
  }));
  return level.exits;
}

/** b2's egg: everything else turns to stone, b2 becomes the way out. */
export function collapseB2(level) {
  const m = level.moving;
  if (m.state === 'cleared') return level.exits;
  m.state = 'collapsed';
  for (const b of level.blocks) {
    b.core.broken = true;
    b.gone = b.i !== 4;
    for (const v of b.variants) fillPlan(v, b.i === 4 ? 0 : 1);
    writeMovingBlock(level, b);
  }
  level.exits = movingDoors(level.blocks[4]).map((d) => ({
    to: 'lab',
    x: d.x,
    y: d.y,
    require: null,
    color: '255, 200, 90',
  }));
  return level.exits;
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
