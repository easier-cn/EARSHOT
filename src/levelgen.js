import { mulberry32, shuffle } from './util.js';
import { nearestOpen } from './pathfind.js';

export const TILE = 32;
export const GRID_W = 42;
export const GRID_H = 26;

// Room-shape presets. Each chamber picks one, so the eight rooms feel like
// different places instead of eight shuffles of the same generator.
const STYLES = {
  halls: { rooms: 12, wMin: 5, wMax: 9, hMin: 4, hMax: 7, gap: 2, pillars: 0.75, loops: 3 },
  cavern: { rooms: 9, wMin: 8, wMax: 12, hMin: 6, hMax: 9, gap: 2, pillars: 0.35, loops: 2 },
  warren: { rooms: 16, wMin: 4, wMax: 6, hMin: 4, hMax: 5, gap: 1, pillars: 0.9, loops: 4 },
  gallery: { rooms: 12, wMin: 10, wMax: 16, hMin: 3, hMax: 4, gap: 2, pillars: 0.25, loops: 2 },
};

const DIRS4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function overlaps(a, b, gap) {
  return (
    a.x - gap < b.x + b.w &&
    a.x + a.w + gap > b.x &&
    a.y - gap < b.y + b.h &&
    a.y + a.h + gap > b.y
  );
}

function carveRect(grid, w, h, r) {
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      if (x > 0 && y > 0 && x < w - 1 && y < h - 1) grid[y * w + x] = 0;
    }
  }
}

function carveCorridor(grid, w, h, ax, ay, bx, by, rng) {
  const horizontalFirst = rng() < 0.5;
  const plot = (x, y) => {
    if (x > 0 && y > 0 && x < w - 1 && y < h - 1) grid[y * w + x] = 0;
  };
  if (horizontalFirst) {
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) plot(x, ay);
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) plot(bx, y);
  } else {
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) plot(ax, y);
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) plot(x, by);
  }
}

function bfs(grid, w, h, sx, sy) {
  const dist = new Int32Array(w * h).fill(-1);
  const queue = [sy * w + sx];
  dist[sy * w + sx] = 0;
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    const cx = cur % w;
    const cy = (cur - cx) / w;
    for (const [dx, dy] of DIRS4) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (grid[ni] !== 0 || dist[ni] !== -1) continue;
      dist[ni] = dist[cur] + 1;
      queue.push(ni);
    }
  }
  return dist;
}

function wallSegments(grid, w, h) {
  const segs = [];
  const isOpen = (x, y) => x >= 0 && y >= 0 && x < w && y < h && grid[y * w + x] === 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y * w + x] === 0) continue;
      const px = x * TILE;
      const py = y * TILE;
      if (isOpen(x + 1, y)) segs.push({ x1: px + TILE, y1: py, x2: px + TILE, y2: py + TILE });
      if (isOpen(x - 1, y)) segs.push({ x1: px, y1: py, x2: px, y2: py + TILE });
      if (isOpen(x, y + 1)) segs.push({ x1: px, y1: py + TILE, x2: px + TILE, y2: py + TILE });
      if (isOpen(x, y - 1)) segs.push({ x1: px, y1: py, x2: px, y2: py });
    }
  }
  return segs;
}

function tryGenerate(rng, cfg) {
  const w = GRID_W;
  const h = GRID_H;
  const style = STYLES[cfg.style] || STYLES.halls;
  const grid = new Uint8Array(w * h).fill(1);
  const rooms = [];

  for (let i = 0; i < 160 && rooms.length < style.rooms; i++) {
    const rw = style.wMin + Math.floor(rng() * (style.wMax - style.wMin + 1));
    const rh = style.hMin + Math.floor(rng() * (style.hMax - style.hMin + 1));
    if (rw > w - 8 || rh > h - 8) continue;
    const r = {
      x: 2 + Math.floor(rng() * (w - rw - 4)),
      y: 2 + Math.floor(rng() * (h - rh - 4)),
      w: rw,
      h: rh,
    };
    if (rooms.some((o) => overlaps(r, o, style.gap))) continue;
    rooms.push(r);
  }
  if (rooms.length < 5) return null;

  // carve rooms, then sprinkle pillars in the larger ones
  for (const r of rooms) {
    carveRect(grid, w, h, r);
    if (r.w >= 7 && r.h >= 6 && rng() < style.pillars) {
      const pillars = 1 + (rng() < 0.4 ? 1 : 0);
      for (let p = 0; p < pillars; p++) {
        const px = r.x + 1 + Math.floor(rng() * (r.w - 2));
        const py = r.y + 1 + Math.floor(rng() * (r.h - 2));
        grid[py * w + px] = 1;
      }
    }
  }

  // minimum spanning tree over room centers (Prim's)
  const centers = rooms.map((r) => ({
    x: r.x + (r.w >> 1),
    y: r.y + (r.h >> 1),
  }));
  const inTree = new Set([0]);
  const edges = [];
  while (inTree.size < rooms.length) {
    let best = null;
    for (const a of inTree) {
      for (let b = 0; b < rooms.length; b++) {
        if (inTree.has(b)) continue;
        const d = Math.abs(centers[a].x - centers[b].x) + Math.abs(centers[a].y - centers[b].y);
        if (!best || d < best.d) best = { a, b, d };
      }
    }
    inTree.add(best.b);
    edges.push(best);
  }
  // extra loops so the level is not a pure tree
  for (let extra = 0; extra < style.loops; extra++) {
    const a = Math.floor(rng() * rooms.length);
    let b = Math.floor(rng() * rooms.length);
    if (a === b) b = (b + 1) % rooms.length;
    const d = Math.abs(centers[a].x - centers[b].x) + Math.abs(centers[a].y - centers[b].y);
    if (d < 26 && !edges.some((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a))) {
      edges.push({ a, b });
    }
  }
  for (const e of edges) {
    carveCorridor(grid, w, h, centers[e.a].x, centers[e.a].y, centers[e.b].x, centers[e.b].y, rng);
  }

  // spawn in a random room, on open ground near its centre
  const spawnRoom = rooms[Math.floor(rng() * rooms.length)];
  const spawnTile = nearestOpen(grid, w, h, centers[rooms.indexOf(spawnRoom)].x, centers[rooms.indexOf(spawnRoom)].y);
  if (!spawnTile) return null;
  const dist = bfs(grid, w, h, spawnTile.x, spawnTile.y);
  const openCount = dist.reduce((n, d) => n + (d >= 0 ? 1 : 0), 0);
  if (openCount < 260) return null;

  // exit: the reachable tile that is farthest from the spawn
  let exitTile = null;
  let bestD = -1;
  for (const r of rooms) {
    const c = { x: r.x + (r.w >> 1), y: r.y + (r.h >> 1) };
    const t = nearestOpen(grid, w, h, c.x, c.y);
    if (!t) continue;
    const d = dist[t.y * w + t.x];
    if (d > bestD) {
      bestD = d;
      exitTile = t;
    }
  }
  if (!exitTile) return null;

  // shards: spread out, far from spawn
  const minShardDist = cfg.shardMinDist ?? 7;
  const candidates = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const d = dist[y * w + x];
      if (d >= 6 && grid[y * w + x] === 0) candidates.push({ x, y, d });
    }
  }
  shuffle(candidates, rng);
  candidates.sort((a, b) => b.d - a.d);
  const shardTiles = [];
  for (const c of candidates) {
    if (shardTiles.length >= cfg.shards) break;
    if (c.x === exitTile.x && c.y === exitTile.y) continue;
    if (shardTiles.some((s) => Math.hypot(s.x - c.x, s.y - c.y) < minShardDist)) continue;
    shardTiles.push(c);
  }
  if (shardTiles.length < cfg.shards) return null;

  // hunter spawns: far from the player, spread out, never on a shard
  const hunterCandidates = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const d = dist[y * w + x];
      if (d >= 9 && grid[y * w + x] === 0) hunterCandidates.push({ x, y });
    }
  }
  shuffle(hunterCandidates, rng);
  const hunterTiles = [];
  for (const c of hunterCandidates) {
    if (hunterTiles.length >= cfg.hunters) break;
    if (shardTiles.some((s) => Math.hypot(s.x - c.x, s.y - c.y) < 3)) continue;
    if (hunterTiles.some((s) => Math.hypot(s.x - c.x, s.y - c.y) < 4)) continue;
    hunterTiles.push(c);
  }
  if (hunterTiles.length < cfg.hunters) return null;

  // skitters: they never hunt, so "far from the player" matters less than
  // "somewhere you will have to pass". 6+ tiles out, away from shards.
  const skitterTiles = [];
  if (cfg.skitters) {
    const skCandidates = [];
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const d = dist[y * w + x];
        if (d >= 6 && grid[y * w + x] === 0) skCandidates.push({ x, y });
      }
    }
    shuffle(skCandidates, rng);
    for (const c of skCandidates) {
      if (skitterTiles.length >= cfg.skitters) break;
      if (shardTiles.some((s) => Math.hypot(s.x - c.x, s.y - c.y) < 3)) continue;
      if (hunterTiles.some((s) => Math.hypot(s.x - c.x, s.y - c.y) < 2)) continue;
      if (skitterTiles.some((s) => Math.hypot(s.x - c.x, s.y - c.y) < 6)) continue;
      skitterTiles.push(c);
    }
    if (skitterTiles.length < cfg.skitters) return null;
  }

  const toWorld = (t) => ({ x: (t.x + 0.5) * TILE, y: (t.y + 0.5) * TILE });

  return {
    w,
    h,
    tile: TILE,
    grid,
    rooms,
    spawn: toWorld(spawnTile),
    spawnTile,
    exit: toWorld(exitTile),
    exitTile,
    shards: shardTiles.map((t, i) => ({ ...toWorld(t), id: i, tile: t })),
    hunters: hunterTiles.map((t) => toWorld(t)),
    skitters: skitterTiles.map((t) => toWorld(t)),
    segments: wallSegments(grid, w, h),
    size: { w: w * TILE, h: h * TILE },
  };
}

const MAX_ATTEMPTS = 60;

export function generateLevel(seed, cfg) {
  const style = STYLES[cfg.style] ? cfg.style : 'halls';
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const level = tryGenerate(mulberry32((seed + attempt * 7919) >>> 0), { ...cfg, style });
    if (level) {
      level.seed = seed;
      level.style = style;
      return level;
    }
  }
  if (style !== 'halls') {
    // a tight preset can occasionally starve; fall back to the roomier default
    return generateLevel(seed, { ...cfg, style: 'halls' });
  }
  throw new Error('level generation failed for seed ' + seed);
}
