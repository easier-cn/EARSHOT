import { buildRoomMap } from '../src/worldgen.js';

const seed = Number(process.argv[2] || 1234);
const L = buildRoomMap(seed);
const mark = new Map();
const put = (x, y, c) => { mark.set(`${x},${y}`, c); };
put(L.spawnTile.x, L.spawnTile.y, 'S');
put(L.keyTile.x, L.keyTile.y, 'K');
for (const e of L.exits) put(e.x, e.y, e.to === 'maze' ? 'M' : e.to === 'castle' ? 'C' : 'G');
for (const l of L.loot) put(l.x, l.y, l.kind === 'charm' ? 'c' : 'i');
for (const m of L.monsters) put(m.x, m.y, 'x');

let out = '';
for (let y = 0; y < L.h; y++) {
  let row = '';
  for (let x = 0; x < L.w; x++) {
    const k = mark.get(`${x},${y}`);
    row += k || (L.grid[y * L.w + x] ? '#' : '.');
  }
  out += row + '\n';
}
console.log(out);
console.log(`rooms=${L.rooms.length} loot=${L.loot.length} monsters=${L.monsters.length}`);
