// Room-graph floor generator.
//
// 1. Walk a snake of 5..8 "nodes" across the floor, carving a 3-wide corridor.
// 2. Stamp a room over each node (varied sizes, structures inside).
// 3. The last room holds the key; a branch leaves one of the middle rooms and
//    ends in the exit room; two more branches end in loot rooms.
//
// Because the corridor is carved first and every room is stamped on top of it,
// the whole floor is connected by construction.

import { mulberry32 } from './util.js';

export const TILE = 32;
export const FLOOR_W = 78;
export const FLOOR_H = 96;
const M = 3;

const ROOM_DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const ri = (rnd, a, b) => a + Math.floor(rnd() * (b - a + 1));

function fillRect(grid, x, y, w, h, v) {
  for (let ty = y; ty < y + h; ty++) {
    for (let tx = x; tx < x + w; tx++) {
      if (tx < 1 || ty < 1 || tx >= FLOOR_W - 1 || ty >= FLOOR_H - 1) continue;
      grid[ty * FLOOR_W + tx] = v;
    }
  }
}

function carveH(grid, x0, x1, y) {
  const a = Math.min(x0, x1);
  const b = Math.max(x0, x1);
  fillRect(grid, a - 1, y - 1, b - a + 3, 3, 0);
}

function carveV(grid, y0, y1, x) {
  const a = Math.min(y0, y1);
  const b = Math.max(y0, y1);
  fillRect(grid, x - 1, a - 1, 3, b - a + 3, 0);
}

function roomSize(rnd, kind) {
  if (kind === 'small') return { w: ri(rnd, 7, 10), h: ri(rnd, 6, 8) };
  if (kind === 'large') return { w: ri(rnd, 14, 19), h: ri(rnd, 11, 15) };
  return { w: ri(rnd, 9, 13), h: ri(rnd, 7, 10) };
}

// Pillars / islands, always checked so the room stays one connected piece.
function decorate(grid, room, rnd) {
  if (room.w < 8 || room.h < 8) return;
  const { x, y, w, h } = room;
  const style = ri(rnd, 0, 3);
  const put = (tx, ty) => {
    if (tx <= x + 1 || ty <= y + 1 || tx >= x + w - 2 || ty >= y + h - 2) return;
    grid[ty * FLOOR_W + tx] = 1;
  };
  if (style === 0) {
    for (let ty = y + 3; ty < y + h - 2; ty += 4) {
      for (let tx = x + 3; tx < x + w - 2; tx += 4) put(tx, ty);
    }
  } else if (style === 1) {
    const cx = x + (w >> 1);
    const cy = y + (h >> 1);
    for (let ty = cy - 1; ty <= cy + 1; ty++) {
      for (let tx = cx - 2; tx <= cx + 2; tx++) put(tx, ty);
    }
  } else if (style === 2) {
    const cy = y + (h >> 1);
    for (let tx = x + 2; tx < x + w - 2; tx++) {
      if (Math.abs(tx - (x + (w >> 1))) > 1) put(tx, cy);
    }
  } else {
    const n = Math.floor((w * h) / 30);
    for (let k = 0; k < n; k++) put(ri(rnd, x + 2, x + w - 3), ri(rnd, y + 2, y + h - 3));
  }

  // Validate: everything inside must still be reachable from the centre.
  const cx = x + (w >> 1);
  const cy = y + (h >> 1);
  const seen = new Uint8Array(w * h);
  const q = [[cx, cy]];
  seen[0] = 1;
  while (q.length) {
    const [px, py] = q.pop();
    for (const [dx, dy] of ROOM_DIRS) {
      const nx = px + dx;
      const ny = py + dy;
      if (nx < x || ny < y || nx >= x + w || ny >= y + h) continue;
      if (grid[ny * FLOOR_W + nx]) continue;
      const k = (ny - y) * w + (nx - x);
      if (seen[k]) continue;
      seen[k] = 1;
      q.push([nx, ny]);
    }
  }
  let broken = false;
  for (let ty = y; ty < y + h && !broken; ty++) {
    for (let tx = x; tx < x + w; tx++) {
      if (!grid[ty * FLOOR_W + tx] && !seen[(ty - y) * w + (tx - x)]) {
        broken = true;
        break;
      }
    }
  }
  if (broken) fillRect(grid, x, y, w, h, 0);
}

function stampRoom(grid, room) {
  fillRect(grid, room.x, room.y, room.w, room.h, 0);
}

function openTileIn(grid, room) {
  const cx = room.x + (room.w >> 1);
  const cy = room.y + (room.h >> 1);
  for (let rad = 0; rad < Math.max(room.w, room.h); rad++) {
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        const tx = cx + dx;
        const ty = cy + dy;
        if (tx < room.x || ty < room.y || tx >= room.x + room.w || ty >= room.y + room.h) continue;
        if (!grid[ty * FLOOR_W + tx]) return { x: tx, y: ty };
      }
    }
  }
  return { x: cx, y: cy };
}

export function generateFloor(seed, depth = 0) {
  // A floor that breaks its own rules is worse than a new floor: retry a few
  // sub-seeds until the layout is legal.
  let best = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const f = buildFloor(seed + attempt * 104729, depth);
    const clean = !hasOverlap(f) && f.mainCount >= 5 && f.mainCount <= 8 && floorReachable(f).ok;
    if (clean) return f;
    if (!best) best = f;
  }
  return best;
}

function hasOverlap(f) {
  for (let i = 0; i < f.rooms.length; i++) {
    for (let j = i + 1; j < f.rooms.length; j++) {
      const a = f.rooms[i];
      const b = f.rooms[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) return true;
    }
  }
  return false;
}

function buildFloor(seed, depth) {
  const rnd = mulberry32(seed);
  const grid = new Uint8Array(FLOOR_W * FLOOR_H).fill(1);
  const rooms = [];
  const count = ri(rnd, 5, 8);

  const hits = (r) => rooms.some((q) => r.x < q.x + q.w + 1 && q.x < r.x + r.w + 1 && r.y < q.y + q.h + 1 && q.y < r.y + r.h + 1);

  // ---- snake of nodes ----------------------------------------------------
  let cx = ri(rnd, 8, 12);
  let cy = ri(rnd, 10, 14);
  let dir = 1;
  for (let i = 0; i < count; i++) {
    const kind = i === 0 ? 'start' : i === count - 1 ? 'key' : rnd() < 0.3 ? 'small' : rnd() < 0.7 ? 'mid' : 'large';
    const size = roomSize(rnd, kind);
    if (dir > 0 && cx + size.w > FLOOR_W - M - 2) {
      cy += 24 + ri(rnd, 0, 6);
      dir = -1;
      cx = FLOOR_W - M - size.w - ri(rnd, 2, 6);
    } else if (dir < 0 && cx - size.w < M) {
      cy += 24 + ri(rnd, 0, 6);
      dir = 1;
      cx = M + ri(rnd, 2, 6);
    }
    const x = Math.max(M, Math.min(FLOOR_W - M - size.w, dir > 0 ? cx : cx - size.w));
    let y = Math.max(M, Math.min(FLOOR_H - M - size.h, cy));
    // Keep the snake clear of what is already stamped.
    while (hits({ x, y, w: size.w, h: size.h }) && y + 2 + size.h < FLOOR_H - M) {
      y += 2;
    }
    rooms.push({ i, kind, x, y, w: size.w, h: size.h, links: [] });
    cx = dir > 0 ? x + size.w + ri(rnd, 7, 12) : x - ri(rnd, 7, 12);
    cy = y + ri(rnd, -1, 2);
  }

  // ---- corridor first, rooms on top --------------------------------------
  const spine = [];
  const carveSpine = () => {
    for (const seg of spine) {
      carveH(grid, seg.ax, seg.bx, seg.ay);
      carveV(grid, seg.ay, seg.by, seg.bx);
    }
  };
  for (let i = 0; i < rooms.length - 1; i++) {
    const a = rooms[i];
    const b = rooms[i + 1];
    spine.push({
      ax: a.x + (a.w >> 1),
      ay: a.y + (a.h >> 1),
      bx: b.x + (b.w >> 1),
      by: b.y + (b.h >> 1),
    });
  }
  carveSpine();
  for (const room of rooms) stampRoom(grid, room);
  for (const room of rooms) decorate(grid, room, rnd);
  // Decorations must never close a corridor: carve the spine once more.
  carveSpine();

  const center = (r) => {
    const t = openTileIn(grid, r);
    return { x: t.x * TILE + TILE / 2, y: t.y * TILE + TILE / 2, tile: t };
  };

  // ---- branches: exit off a middle room, plus two dead ends --------------
  const midLo = 2;
  const midHi = Math.max(midLo, rooms.length - 3);
  const mother = rooms[ri(rnd, midLo, midHi)];
  const branches = [];
  const specs = [
    { kind: 'exit', from: mother, size: { w: ri(rnd, 9, 12), h: ri(rnd, 8, 10) } },
    { kind: 'branch', from: rooms[ri(rnd, 1, rooms.length - 2)], size: { w: ri(rnd, 7, 9), h: ri(rnd, 7, 9) } },
    { kind: 'branch', from: rooms[ri(rnd, 1, rooms.length - 2)], size: { w: ri(rnd, 7, 10), h: ri(rnd, 7, 9) } },
  ];
  for (const spec of specs) {
    const from = spec.from;
    const options = [
      { x: from.x + (from.w >> 1) - (spec.size.w >> 1), y: from.y + from.h + 8 },
      { x: from.x + (from.w >> 1) - (spec.size.w >> 1), y: from.y - 8 - spec.size.h },
      { x: from.x + from.w + 8, y: from.y + (from.h >> 1) - (spec.size.h >> 1) },
      { x: from.x - 8 - spec.size.w, y: from.y + (from.h >> 1) - (spec.size.h >> 1) },
    ];
    let spot = null;
    for (const o of options) {
      if (o.x < M || o.y < M || o.x + spec.size.w > FLOOR_W - M || o.y + spec.size.h > FLOOR_H - M) continue;
      if (hits({ x: o.x, y: o.y, w: spec.size.w, h: spec.size.h })) continue;
      spot = o;
      break;
    }
    // Nothing clean next door: search a ring around the mother room.
    if (!spot) {
      const fx = from.x + (from.w >> 1);
      const fy = from.y + (from.h >> 1);
      for (let ring = 10; ring < 40 && !spot; ring += 5) {
        for (const dir of [1, -1]) {
          const cands = [
            { x: fx - (spec.size.w >> 1), y: fy + dir * (ring + (from.h >> 1)) },
            { x: fx + dir * (ring + (from.w >> 1)), y: fy - (spec.size.h >> 1) },
          ];
          for (const o of cands) {
            if (o.x < M || o.y < M || o.x + spec.size.w > FLOOR_W - M || o.y + spec.size.h > FLOOR_H - M) continue;
            if (hits({ x: o.x, y: o.y, w: spec.size.w, h: spec.size.h })) continue;
            spot = o;
            break;
          }
          if (spot) break;
        }
      }
    }
    if (!spot) continue;
    const room = {
      i: rooms.length,
      kind: spec.kind,
      x: spot.x,
      y: spot.y,
      w: spec.size.w,
      h: spec.size.h,
      links: [from.i],
    };
    const fx = from.x + (from.w >> 1);
    const fy = from.y + (from.h >> 1);
    const tx = room.x + (room.w >> 1);
    const ty = room.y + (room.h >> 1);
    carveH(grid, fx, tx, fy);
    carveV(grid, fy, ty, tx);
    stampRoom(grid, room);
    decorate(grid, room, rnd);
    carveH(grid, fx, tx, fy);
    carveV(grid, fy, ty, tx);
    from.links.push(room.i);
    rooms.push(room);
    branches.push(room);
  }

  const startRoom = rooms[0];
  const keyRoom = rooms.find((r) => r.kind === 'key') || rooms[1];
  const exitRoom = rooms.find((r) => r.kind === 'exit') || branches[0] || keyRoom;
  const spawn = center(startRoom);
  const key = center(keyRoom);
  const exit = center(exitRoom);

  // Loot: every branch end, the room the exit leaves from, and the room just
  // before the key.
  const loot = [];
  const spots = [];
  for (const r of rooms) if (r.kind === 'branch' || r.kind === 'exit') spots.push(center(r));
  const mainRooms = rooms.filter((r) => r.kind !== 'branch' && r.kind !== 'exit');
  const beforeKey = mainRooms[mainRooms.length - 2];
  const exitMother = rooms.find((r) => r.i === exitRoom.links?.[0]);
  if (beforeKey) spots.push(center(beforeKey));
  if (exitMother) spots.push(center(exitMother));
  for (let i = 0; i < spots.length; i++) {
    // Identity is rolled only when the player comes close (Game.revealLoot).
    loot.push({ x: spots[i].x, y: spots[i].y });
  }

  return {
    w: FLOOR_W,
    h: FLOOR_H,
    tile: TILE,
    size: { w: FLOOR_W * TILE, h: FLOOR_H * TILE },
    grid,
    rooms,
    loot,
    branches: branches.map((b) => b.i),
    spawn,
    spawnTile: spawn.tile,
    key,
    keyTile: key.tile,
    exit,
    exitTile: exit.tile,
    depth,
    seed,
    mainCount: rooms.filter((r) => r.kind !== 'branch' && r.kind !== 'exit').length,
  };
}

export function floorReachable(level) {
  const { grid, w, h, tile } = level;
  const seen = new Uint8Array(w * h);
  const sx = Math.floor(level.spawn.x / tile);
  const sy = Math.floor(level.spawn.y / tile);
  const q = [[sx, sy]];
  seen[sy * w + sx] = 1;
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of ROOM_DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const k = ny * w + nx;
      if (seen[k] || grid[k]) continue;
      seen[k] = 1;
      q.push([nx, ny]);
    }
  }
  const at = (p) => seen[Math.floor(p.y / tile) * w + Math.floor(p.x / tile)] === 1;
  const bad = [];
  if (!at(level.key)) bad.push('key');
  if (!at(level.exit)) bad.push('exit');
  for (const r of level.rooms) {
    const t = { x: (r.x + (r.w >> 1) + 0.5) * tile, y: (r.y + (r.h >> 1) + 0.5) * tile };
    if (!at(t)) bad.push(`room${r.i}`);
  }
  return { ok: bad.length === 0, bad, seen };
}
