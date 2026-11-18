// 「薛定谔的猫笼」— the laboratory's boss room.
//
// The arena is 25x25 tiles and is rebuilt every time the player pings. Only
// what the outgoing sonar actually touched is carried over; the player's own
// tile is always floor. The cat is a single-tile body that is never drawn: it
// answers with one red ring, then walks toward the place the last ping came
// from. Five purple breakers end the observation and open the exit.

import { mulberry32 } from './util.js';
import { findPath } from './pathfind.js';
import { CHARMS, ITEMS } from './loot.js';

export const CAGE = { W: 25, H: 25 };
const TILE = 32;
const WALL_CHANCE = 0.56;
const RATIO_MIN = 0.45;
const RATIO_MAX = 0.55;
const CHARM_IDS = Object.keys(CHARMS);
const ITEM_IDS = Object.keys(ITEMS);

const at = (x, y) => y * CAGE.W + x;
const inside = (x, y) => x > 0 && y > 0 && x < CAGE.W - 1 && y < CAGE.H - 1;
const centerX = (x) => (x + 0.5) * TILE;
const centerY = (y) => (y + 0.5) * TILE;

export function cageReachable(grid, w, h, sx, sy) {
  const seen = new Uint8Array(w * h);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h || grid[sy * w + sx] !== 0) return seen;
  const q = [sx, sy];
  seen[sy * w + sx] = 1;
  while (q.length) {
    const y = q.pop();
    const x = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const i = ny * w + nx;
      if (seen[i] || grid[i] !== 0) continue;
      seen[i] = 1;
      q.push(nx, ny);
    }
  }
  return seen;
}

function countRatio(grid) {
  let wall = 0;
  let floor = 0;
  for (let y = 1; y < CAGE.H - 1; y++) {
    for (let x = 1; x < CAGE.W - 1; x++) {
      if (grid[at(x, y)] === 0) floor++;
      else wall++;
    }
  }
  return { wall, floor, ratio: wall / Math.max(1, wall + floor) };
}

function carveCorridor(grid, water, fog, from, to, rnd, scanned) {
  let x = from.x;
  let y = from.y;
  let guard = 0;
  const kept = (tx, ty) => !!(scanned && scanned[at(tx, ty)] && grid[at(tx, ty)] !== 0);
  while ((x !== to.x || y !== to.y) && guard++ < 200) {
    const dx = Math.sign(to.x - x);
    const dy = Math.sign(to.y - y);
    // Mostly a right-angle route, with a little wobble so the boss room never
    // reads as a perfect grid.
    const horizontal = dx !== 0 && (dy === 0 || rnd() < 0.52);
    let nx = x;
    let ny = y;
    if (horizontal) nx += dx;
    else if (dy !== 0) ny += dy;
    else nx += dx;
    if (!inside(nx, ny) || kept(nx, ny)) {
      // A remembered wall is not ours to cut. Try the other axis, and if that
      // is also kept, stop: the preserved fragment wins over the corridor.
      if (horizontal && dy !== 0) {
        nx = x;
        ny = y + dy;
        if (!inside(nx, ny) || kept(nx, ny)) break;
      } else if (!horizontal && dx !== 0) {
        nx = x + dx;
        ny = y;
        if (!inside(nx, ny) || kept(nx, ny)) break;
      } else {
        break;
      }
    }
    x = nx;
    y = ny;
    const i = at(x, y);
    grid[i] = 0;
    water[i] = 0;
    fog[i] = 0;
  }
}

function placeCat(grid, reach, player, want, rnd) {
  const px = player.x;
  const py = player.y;
  const floors = [];
  for (let y = 1; y < CAGE.H - 1; y++) {
    for (let x = 1; x < CAGE.W - 1; x++) {
      const i = at(x, y);
      if (grid[i] !== 0 || !reach[i]) continue;
      floors.push({ x, y, d: Math.hypot(centerX(x) - px, centerY(y) - py) });
    }
  }
  if (!floors.length) return null;
  const rings = [26, 56, 96];
  for (const tol of rings) {
    const near = floors.filter((f) => Math.abs(f.d - want) <= tol);
    if (near.length) return near[(rnd() * near.length) | 0];
  }
  // No tile at the remembered radius survived: take the closest ring tile.
  floors.sort((a, b) => Math.abs(a.d - want) - Math.abs(b.d - want));
  return floors[0];
}

function placeDevice(grid, reach, scanned, player, rnd, catTile = null) {
  const px = player.x;
  const py = player.y;
  const cands = [];
  for (let y = 1; y < CAGE.H - 1; y++) {
    for (let x = 1; x < CAGE.W - 1; x++) {
      const i = at(x, y);
      if (grid[i] === 0) continue;
      if (scanned && scanned[i]) continue;
      if (catTile && catTile.x === x && catTile.y === y) continue;
      let linked = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= CAGE.W || ny >= CAGE.H) continue;
        const ni = at(nx, ny);
        if (grid[ni] === 0 && reach[ni]) { linked = true; break; }
      }
      if (!linked) continue;
      const d = Math.hypot(centerX(x) - px, centerY(y) - py);
      if (d < TILE * 2.5 || d > TILE * 11) continue;
      cands.push({ x, y, d });
    }
  }
  if (cands.length) return cands[(rnd() * cands.length) | 0];
  // Walled-in arena: turn one reachable, untouched floor tile into the breaker.
  for (let y = 1; y < CAGE.H - 1; y++) {
    for (let x = 1; x < CAGE.W - 1; x++) {
      const i = at(x, y);
      if (grid[i] !== 0 || !reach[i] || (scanned && scanned[i])) continue;
      if (catTile && catTile.x === x && catTile.y === y) continue;
      const d = Math.hypot(centerX(x) - px, centerY(y) - py);
      if (d < TILE * 3) continue;
      grid[i] = 1;
      return { x, y, d };
    }
  }
  return null;
}

function paintBlob(grid, mask, reach, player, rnd, count, avoid, scanned = null) {
  for (let tries = 0; tries < 40; tries++) {
    const x = 1 + ((rnd() * (CAGE.W - 2)) | 0);
    const y = 1 + ((rnd() * (CAGE.H - 2)) | 0);
    const i = at(x, y);
    if (grid[i] !== 0 || !reach[i]) continue;
    if (scanned && scanned[i]) continue;
    if (Math.hypot(centerX(x) - player.x, centerY(y) - player.y) < TILE * 2.2) continue;
    if (mask[i]) continue;
    let ok = true;
    for (const a of avoid) {
      if (Math.hypot(centerX(x) - a.x, centerY(y) - a.y) < TILE * 1.4) { ok = false; break; }
    }
    if (!ok) continue;
    const cells = [{ x, y }];
    for (let k = 0; k < count; k++) {
      const last = cells[(rnd() * cells.length) | 0];
      const dir = [[1, 0], [-1, 0], [0, 1], [0, -1]][(rnd() * 4) | 0];
      const nx = last.x + dir[0];
      const ny = last.y + dir[1];
      if (!inside(nx, ny)) continue;
      if (scanned && scanned[at(nx, ny)]) continue;
      if (grid[at(nx, ny)] !== 0) continue;
      cells.push({ x: nx, y: ny });
    }
    for (const c of cells) mask[at(c.x, c.y)] = 1;
    return true;
  }
  return false;
}

/**
 * Rebuild the arena around the player. `scanned` is the set of tiles the last
 * outgoing ping actually touched; those keep their exact contents.
 */
export function regenerateCage(level, {
  scanned = null,
  playerTile = null,
  catDistance = null,
  withDevice = true,
  first = false,
} = {}) {
  const c = level.cage;
  const grid = level.grid;
  const water = level.cage.water;
  const fog = level.cage.fog;
  c.gen = (c.gen || 0) + 1;
  const rnd = mulberry32((level.seed ^ Math.imul(c.gen, 0x9e3779b1)) >>> 0);
  const player = playerTile || level.spawnTile;
  const pi = at(player.x, player.y);

  // 1. Random terrain, keeping every scanned tile as it was.
  for (let y = 0; y < CAGE.H; y++) {
    for (let x = 0; x < CAGE.W; x++) {
      const i = at(x, y);
      if (x === 0 || y === 0 || x === CAGE.W - 1 || y === CAGE.H - 1) {
        grid[i] = 1;
        water[i] = 0;
        fog[i] = 0;
        continue;
      }
      if (scanned && scanned[i]) {
        if (grid[i] !== 0) { water[i] = 0; fog[i] = 0; }
        continue;
      }
      grid[i] = rnd() < WALL_CHANCE ? 1 : 0;
      water[i] = 0;
      fog[i] = 0;
    }
  }
  // The player's own tile is the one guarantee.
  grid[pi] = 0;
  water[pi] = 0;
  fog[pi] = 0;


  // 2. Nudge the wall/floor ratio back toward 1:1 before carving routes.
  let guard = 0;
  let ratio = countRatio(grid);
  while (ratio.ratio > RATIO_MAX && guard++ < 220) {
    const x = 1 + ((rnd() * (CAGE.W - 2)) | 0);
    const y = 1 + ((rnd() * (CAGE.H - 2)) | 0);
    const i = at(x, y);
    if (grid[i] === 1 && !(scanned && scanned[i])) grid[i] = 0;
    ratio = countRatio(grid);
  }
  guard = 0;
  while (ratio.ratio < RATIO_MIN && guard++ < 220) {
    const x = 1 + ((rnd() * (CAGE.W - 2)) | 0);
    const y = 1 + ((rnd() * (CAGE.H - 2)) | 0);
    const i = at(x, y);
    if (grid[i] === 0 && i !== pi && !(scanned && scanned[i])) grid[i] = 1;
    ratio = countRatio(grid);
  }

  // 3. At least a few far rooms must be reachable, scanned walls or not.
  const far = [
    { x: CAGE.W - 3, y: 3 },
    { x: 3, y: CAGE.H - 3 },
    { x: CAGE.W - 3, y: CAGE.H - 3 },
    { x: 3, y: 3 },
    { x: (CAGE.W - 1) >> 1, y: 2 },
  ];
  let reach = cageReachable(grid, CAGE.W, CAGE.H, player.x, player.y);
  for (const t of far) {
    if (!inside(t.x, t.y)) continue;
    if (reach[at(t.x, t.y)] && grid[at(t.x, t.y)] === 0) continue;
    const route = findPath(grid, CAGE.W, CAGE.H, player.x, player.y, t.x, t.y);
    if (!route) carveCorridor(grid, water, fog, player, t, rnd, scanned);
    reach = cageReachable(grid, CAGE.W, CAGE.H, player.x, player.y);
  }

  // 4. The cat arrives somewhere on the ring the player last heard it at.
  const want = Math.max(TILE * 3, Math.min(TILE * 11, catDistance ?? TILE * 8));
  if (!first) c.lastScanDist = want;
  let catTile = placeCat(grid, reach, { x: centerX(player.x), y: centerY(player.y) }, want, rnd);
  if (!catTile) {
    carveCorridor(grid, water, fog, player, far[0], rnd, scanned);
    reach = cageReachable(grid, CAGE.W, CAGE.H, player.x, player.y);
    catTile = placeCat(grid, reach, { x: centerX(player.x), y: centerY(player.y) }, want, rnd);
  }
  if (catTile) {
    grid[at(catTile.x, catTile.y)] = 0;
  } else {
    catTile = { x: player.x, y: player.y };
  }
  c.cat = {
    x: centerX(catTile.x),
    y: centerY(catTile.y),
    tx: catTile.x,
    ty: catTile.y,
    r: 10,
    dead: false,
    target: c.cat && c.cat.target ? c.cat.target : null,
    path: [],
    repath: 0,
    face: 0,
  };
  if (first) c.cat.target = null;

  // 5. Water and poison are floors, invisible, and remembered if scanned.
  const avoid = [{ x: c.cat.x, y: c.cat.y }];
  for (let k = 0; k < 4; k++) paintBlob(grid, water, reach, { x: centerX(player.x), y: centerY(player.y) }, rnd, 5 + ((rnd() * 7) | 0), avoid, scanned);
  for (let k = 0; k < 3; k++) paintBlob(grid, fog, reach, { x: centerX(player.x), y: centerY(player.y) }, rnd, 3 + ((rnd() * 5) | 0), avoid, scanned);

  // 6. One breaker, always outside what this ping could see.
  if (withDevice && (c.activations || 0) < 5) {
    const d = placeDevice(
      grid, reach, scanned,
      { x: centerX(player.x), y: centerY(player.y) }, rnd,
      c.cat ? { x: c.cat.tx, y: c.cat.ty } : null,
    );
    if (d && c.cat) {
      // The fallback breaker is carved out of a floor. Never let it cut the
      // only route between the player and the cat.
      const after = cageReachable(grid, CAGE.W, CAGE.H, player.x, player.y);
      if (!after[at(c.cat.tx, c.cat.ty)]) {
        grid[at(d.x, d.y)] = 0;
        d.disabled = true;
      }
    }
    c.device = d && !d.disabled
      ? { tx: d.x, ty: d.y, x: centerX(d.x), y: centerY(d.y), alive: true, hitT: 0 }
      : null;
  } else {
    c.device = null;
  }

  // 7. Exactly three pieces of loot, and everything left on the floor is gone.
  const loot = [];
  const used = new Set();
  let bad = 0;
  while (loot.length < 3 && bad++ < 200) {
    const x = 1 + ((rnd() * (CAGE.W - 2)) | 0);
    const y = 1 + ((rnd() * (CAGE.H - 2)) | 0);
    const i = at(x, y);
    if (grid[i] !== 0 || !reach[i] || used.has(i)) continue;
    if (Math.hypot(centerX(x) - centerX(player.x), centerY(y) - centerY(player.y)) < TILE * 2) continue;
    if (c.cat && Math.hypot(centerX(x) - c.cat.x, centerY(y) - c.cat.y) < TILE * 1.5) continue;
    used.add(i);
    const charm = rnd() < 0.5;
    loot.push({
      x,
      y,
      kind: charm ? 'charm' : 'item',
      id: charm
        ? CHARM_IDS[(rnd() * CHARM_IDS.length) | 0]
        : ITEM_IDS[(rnd() * ITEM_IDS.length) | 0],
    });
  }
  level.loot = loot;
  return { cat: c.cat, device: c.device, loot };
}

export function buildCageMap(seed) {
  const w = CAGE.W;
  const h = CAGE.H;
  const grid = new Uint8Array(w * h).fill(1);
  const level = {
    mapId: 'cage',
    w,
    h,
    tile: TILE,
    size: { w: w * TILE, h: h * TILE },
    grid,
    spawnTile: { x: 12, y: 12 },
    spawn: { x: 12.5 * TILE, y: 12.5 * TILE },
    key: null,
    exit: null,
    exits: [],
    absorb: [],
    monsters: [],
    labEnemies: [],
    loot: [],
    seed,
    cage: {
      fog: new Uint8Array(w * h),
      water: new Uint8Array(w * h),
      gen: 0,
      activations: 0,
      finished: false,
      end: null,
      rings: [],
      scan: null,
      pending: null,
      introT: 0,
      device: null,
      cat: null,
      lastScanDist: 0,
      reviveDist: null,
    },
  };
  const rnd = mulberry32(seed);
  const sx = 12 + ((rnd() * 5) | 0) - 2;
  const sy = 12 + ((rnd() * 5) | 0) - 2;
  level.spawnTile = { x: sx, y: sy };
  level.spawn = { x: centerX(sx), y: centerY(sy) };
  regenerateCage(level, { first: true, catDistance: TILE * 8, withDevice: false });
  return level;
}

export function cageWaterAt(level, x, y) {
  if (!level || !level.cage) return false;
  const tx = Math.floor(x / level.tile);
  const ty = Math.floor(y / level.tile);
  if (tx < 0 || ty < 0 || tx >= level.w || ty >= level.h) return false;
  return level.cage.water[ty * level.w + tx] === 1;
}

export function cageFogAt(level, x, y) {
  if (!level || !level.cage) return false;
  const tx = Math.floor(x / level.tile);
  const ty = Math.floor(y / level.tile);
  if (tx < 0 || ty < 0 || tx >= level.w || ty >= level.h) return false;
  return level.cage.fog[ty * level.w + tx] === 1;
}

export function cageMarkScan(level, x, y) {
  if (!level || !level.cage || !level.cage.scan) return;
  const tx = Math.floor(x / level.tile);
  const ty = Math.floor(y / level.tile);
  if (tx < 0 || ty < 0 || tx >= level.w || ty >= level.h) return;
  level.cage.scan[ty * level.w + tx] = 1;
}

export function cageLootPixels(level) {
  return (level.loot || []).map((l) => ({
    x: l.x * level.tile + level.tile / 2,
    y: l.y * level.tile + level.tile / 2,
    kind: l.kind,
    id: l.id,
    seenAt: -9,
  }));
}
