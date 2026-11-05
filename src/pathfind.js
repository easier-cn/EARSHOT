/**
 * Grid pathfinding + line of sight helpers.
 * The grid uses 1 = solid, 0 = open. Movement is 8-directional but corners
 * may not be cut (both orthogonal cells must be open for a diagonal step).
 */

class MinHeap {
  constructor() {
    this.items = [];
    this.keys = [];
  }
  get size() {
    return this.items.length;
  }
  push(item, key) {
    const items = this.items;
    const keys = this.keys;
    let i = items.length;
    items.push(item);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      items[i] = items[p];
      keys[i] = keys[p];
      i = p;
    }
    items[i] = item;
    keys[i] = key;
  }
  pop() {
    const items = this.items;
    const keys = this.keys;
    const top = items[0];
    const lastItem = items.pop();
    const lastKey = keys.pop();
    const n = items.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = i * 2 + 1;
        if (c >= n) break;
        if (c + 1 < n && keys[c + 1] < keys[c]) c++;
        if (keys[c] >= lastKey) break;
        items[i] = items[c];
        keys[i] = keys[c];
        i = c;
      }
      items[i] = lastItem;
      keys[i] = lastKey;
    }
    return top;
  }
}

const DIRS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/**
 * A* on the tile grid. Returns a list of {x,y} tiles from (excluding) the start
 * to (including) the goal, or null when unreachable.
 */
export function findPath(grid, w, h, sx, sy, tx, ty) {
  sx |= 0;
  sy |= 0;
  tx |= 0;
  ty |= 0;
  if (sx === tx && sy === ty) return [];
  const openAt = (x, y) => x >= 0 && y >= 0 && x < w && y < h && grid[y * w + x] === 0;
  if (!openAt(tx, ty) || !openAt(sx, sy)) return null;

  const total = w * h;
  const g = new Float32Array(total).fill(Infinity);
  const came = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);
  const start = sy * w + sx;
  const goal = ty * w + tx;
  const heap = new MinHeap();
  const hcost = (x, y) => {
    const dx = Math.abs(x - tx);
    const dy = Math.abs(y - ty);
    const m = Math.min(dx, dy);
    return dx + dy + (Math.SQRT2 - 2) * m;
  };
  g[start] = 0;
  heap.push(start, hcost(sx, sy));

  while (heap.size) {
    const cur = heap.pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % w;
    const cy = (cur - cx) / w;
    const gcur = g[cur];
    for (let i = 0; i < DIRS.length; i++) {
      const [dx, dy, cost] = DIRS[i];
      const nx = cx + dx;
      const ny = cy + dy;
      if (!openAt(nx, ny)) continue;
      if (dx !== 0 && dy !== 0) {
        if (!openAt(cx + dx, cy) || !openAt(cx, cy + dy)) continue;
      }
      const ni = ny * w + nx;
      if (closed[ni]) continue;
      const ng = gcur + cost;
      if (ng < g[ni]) {
        g[ni] = ng;
        came[ni] = cur;
        heap.push(ni, ng + hcost(nx, ny));
      }
    }
  }
  if (came[goal] === -1 && goal !== start) return null;

  const path = [];
  let cur = goal;
  let guard = 0;
  while (cur !== start && cur !== -1 && guard++ < total) {
    const x = cur % w;
    const y = (cur - x) / w;
    path.push({ x, y });
    cur = came[cur];
  }
  if (cur !== start) return null;
  path.reverse();
  return path;
}

/** True when a straight line between two world points crosses no solid tile. */
export function lineOfSight(grid, w, h, x1, y1, x2, y2, tileSize) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const steps = Math.max(2, Math.ceil(len / (tileSize * 0.25)));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = Math.floor((x1 + dx * t) / tileSize);
    const y = Math.floor((y1 + dy * t) / tileSize);
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    if (grid[y * w + x] !== 0) return false;
  }
  return true;
}

/** Finds the nearest open tile to (x,y), searching outward. */
export function nearestOpen(grid, w, h, x, y) {
  const solid = (cx, cy) =>
    cx < 0 || cy < 0 || cx >= w || cy >= h || grid[cy * w + cx] !== 0;
  if (!solid(x, y)) return { x, y };
  for (let r = 1; r < Math.max(w, h); r++) {
    for (let oy = -r; oy <= r; oy++) {
      for (let ox = -r; ox <= r; ox++) {
        if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
        const nx = x + ox;
        const ny = y + oy;
        if (!solid(nx, ny)) return { x: nx, y: ny };
      }
    }
  }
  return null;
}
