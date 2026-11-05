// Rough pacing report: how long is the shortest sane route through each chamber?
// BFS over walkable tiles (4-neighbour, which is what a player hugging walls does),
// greedy nearest-shard order, then the exit. No hunters, no pings -- a lower bound.
import { CHAMBERS } from '../src/chambers.js';
import { generateLevel, TILE } from '../src/levelgen.js';

function bfs(grid, w, h, start) {
  const dist = new Int32Array(w * h).fill(-1);
  const q = [start];
  dist[start] = 0;
  for (let head = 0; head < q.length; head++) {
    const cur = q[head];
    const cx = cur % w;
    const cy = (cur / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (grid[ni] || dist[ni] !== -1) continue;
      dist[ni] = dist[cur] + 1;
      q.push(ni);
    }
  }
  return dist;
}

const WALK = 92; // px/s
const RUN = 152;
const rows = [];

for (const cfg of CHAMBERS) {
  const level = generateLevel(cfg.seed, cfg);
  const { w, h, grid } = level;
  const idx = (t) => t.y * w + t.x;
  const start = idx(level.spawnTile);
  const targets = level.shards.map((s) => idx(s.tile));
  const exit = idx(level.exitTile);

  let at = start;
  let dist = bfs(grid, w, h, at);
  let tiles = 0;
  const order = [];
  const left = new Set(targets);
  while (left.size) {
    let best = null;
    for (const t of left) {
      const d = dist[t];
      if (d < 0) continue;
      if (!best || d < best.d) best = { t, d };
    }
    if (!best) break;
    left.delete(best.t);
    order.push(best.d);
    tiles += best.d;
    at = best.t;
    dist = bfs(grid, w, h, at);
  }
  const toExit = dist[exit];
  tiles += Math.max(0, toExit);

  const walkSec = (tiles * TILE) / WALK;
  const runSec = (tiles * TILE) / RUN;
  rows.push({
    chamber: cfg.num,
    title: cfg.title,
    shards: level.shards.length,
    hunters: level.hunters.length,
    rooms: level.rooms.length,
    tiles: Math.round(tiles),
    walkSec: Math.round(walkSec),
    runSec: Math.round(runSec),
    legSecs: order.map((d) => +((d * TILE) / WALK).toFixed(0)),
    exitSec: +((Math.max(0, toExit) * TILE) / WALK).toFixed(0),
  });
}

console.table(rows);
const avg = rows.reduce((a, r) => a + r.walkSec, 0) / rows.length;
console.log(`\nmean walking route: ${avg.toFixed(0)}s  (running: ~${(avg * 0.6).toFixed(0)}s)`);
