import { buildRoomMap } from '../src/worldgen.js';

let bad = 0;
let minRooms = 999;
let maxRooms = 0;
let minLoot = 999;
let maxLoot = 0;
let mon = 0;
for (let s = 1; s <= 150; s++) {
  const L = buildRoomMap(s);
  const W = L.w;
  const H = L.h;
  let floors = 0;
  for (let i = 0; i < W * H; i++) if (!L.grid[i]) floors++;
  const seen = new Uint8Array(W * H);
  const sx = L.spawnTile.x;
  const sy = L.spawnTile.y;
  const q = [sy * W + sx];
  seen[q[0]] = 1;
  while (q.length) {
    const i = q.pop();
    const x = i % W;
    const y = (i / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (L.grid[j] || seen[j]) continue;
      seen[j] = 1;
      q.push(j);
    }
  }
  let reach = 0;
  for (let i = 0; i < W * H; i++) if (seen[i]) reach++;
  if (reach !== floors) bad++;
  minRooms = Math.min(minRooms, L.rooms.length);
  maxRooms = Math.max(maxRooms, L.rooms.length);
  minLoot = Math.min(minLoot, L.loot.length);
  maxLoot = Math.max(maxLoot, L.loot.length);
  mon += L.monsters.length;
}
console.log(JSON.stringify({ bad, minRooms, maxRooms, minLoot, maxLoot, avgMon: mon / 150 }));
