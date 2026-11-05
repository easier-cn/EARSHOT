// Pressure test: how survivable is the shortest sane route?
//
// A scripted "ghost" walks the greedy nearest-shard route at walking speed,
// never pings and never stops. Hunters are simulated for real (wander, hearing,
// A* pursuit, contact). Across many runs this gives a lower bound on how much
// the hunters matter: a ghost that dies constantly means the room is hostile
// even to perfect routing; a ghost that never dies means hunters are decoration.
import { CHAMBERS } from '../src/chambers.js';
import { generateLevel, TILE } from '../src/levelgen.js';
import { findPath } from '../src/pathfind.js';
import { moveCircle, Hunter } from '../src/entities.js';

const WALK = 92;
const RUN = 152;
const CREEP = 52;
const DT = 1 / 60;
const TRIALS = 12;
const audio = { hunterStep() {}, footstep() {}, shard() {}, gateOpen() {} };
const rand = Math.random;

function buildRoute(level) {
  const { w, h, grid } = level;
  const point = (t) => ({ x: (t.x + 0.5) * TILE, y: (t.y + 0.5) * TILE });

  const legs = [];
  let at = level.spawnTile;
  const left = new Set(level.shards.map((s) => s.tile));
  while (left.size) {
    let best = null;
    for (const t of left) {
      const p = findPath(grid, w, h, at.x, at.y, t.x, t.y);
      if (!p) continue;
      if (!best || p.length < best.p.length) best = { t, p };
    }
    if (!best) return null;
    left.delete(best.t);
    legs.push(...best.p.map(point));
    at = best.t;
  }
  const tail = findPath(grid, w, h, at.x, at.y, level.exitTile.x, level.exitTile.y);
  if (!tail) return null;
  legs.push(...tail.map(point));
  return legs;
}

function trial(level, route, mode) {
  const player = { x: level.spawn.x, y: level.spawn.y, r: 9, speed: 0, moving: false, stepPhase: 0 };
  const hunters = level.hunters.map((h) => new Hunter(h.x, h.y));
  const game = { level, now: 0, player, audio };

  let i = 0;
  let closest = Infinity;
  let t = 0;
  let shardNoiseCooldown = 0;

  while (t < 120) {
    t += DT;
    game.now = t;

    // --- ghost movement
    let near = Infinity;
    let nearHunter = null;
    for (const h of hunters) {
      const d = Math.hypot(h.x - player.x, h.y - player.y);
      if (d < near) {
        near = d;
        nearHunter = h;
      }
    }
    if (near < closest) closest = near;

    // A competent player stops when footsteps get close, and runs when they
    // are nearly on top of them. "walk" mode ignores all of that on purpose.
    let act = 'walk';
    if (mode === 'creep') act = 'creep';
    if (mode === 'cautious') {
      if (near < 140) act = 'flee';
      else if (near < 300) act = 'freeze';
    }

    let reached = false;
    const baseSpeed = act === 'creep' ? CREEP : WALK;
    if (act === 'freeze') {
      // stand still: no footsteps, no sound
    } else if (act === 'flee') {
      const dx = player.x - nearHunter.x;
      const dy = player.y - nearHunter.y;
      const dl = Math.hypot(dx, dy) || 1;
      const step = RUN * DT;
      const res = moveCircle(level.grid, level.w, level.h, TILE, player.x, player.y, player.r, (dx / dl) * step, (dy / dl) * step);
      player.x = res.x;
      player.y = res.y;
      reached = true;
    } else {
      while (i < route.length) {
        const wp = route[i];
        const d = Math.hypot(wp.x - player.x, wp.y - player.y);
        if (d < 5) {
          i++;
          continue;
        }
        reached = true;
        const step = Math.min(baseSpeed * DT, d);
        const res = moveCircle(level.grid, level.w, level.h, TILE, player.x, player.y, player.r, ((wp.x - player.x) / d) * step, ((wp.y - player.y) / d) * step);
        player.x = res.x;
        player.y = res.y;
        break;
      }
    }

    player.moving = act !== 'freeze';
    player.speed = act === 'flee' ? RUN : reached ? baseSpeed : 0;
    if (player.speed > 0) {
      player.stepPhase += player.speed * DT;
      const stepLimit = act === 'flee' ? 44 : act === 'creep' ? 70 : 58;
      if (player.stepPhase > stepLimit) {
        player.stepPhase = 0;
        const noiseRadius = act === 'flee' ? 340 : act === 'creep' ? 90 : 215;
        for (const h of hunters) {
          if (Math.hypot(h.x - player.x, h.y - player.y) < noiseRadius) h.hear(player.x, player.y, 0.18);
        }
      }
    }

    // shard pickups make noise, same as the real game
    shardNoiseCooldown -= DT;
    for (const sh of level.shards) {
      if (sh.taken) continue;
      if (Math.hypot(sh.x - player.x, sh.y - player.y) < 22) {
        sh.taken = true;
        if (shardNoiseCooldown <= 0) {
          for (const h of hunters) if (Math.hypot(h.x - sh.x, h.y - sh.y) < 330) h.hear(sh.x, sh.y, 0.2);
          shardNoiseCooldown = 0.5;
        }
      }
    }
    if (level.shards.every((s) => s.taken) && Math.hypot(player.x - level.exit.x, player.y - level.exit.y) < 30) {
      return { outcome: 'escaped', t, closest };
    }


    // --- hunters
    for (const h of hunters) {
      h.update(DT, game);
      const d = Math.hypot(h.x - player.x, h.y - player.y);
      if (d < closest) closest = d;
      if (d < player.r + h.r - 1) return { outcome: 'died', t, closest };
    }
  }
  return { outcome: 'timeout', t, closest };
}

const MODE = ['walk', 'cautious', 'creep'].includes(process.env.MODE) ? process.env.MODE : 'walk';
console.log(`mode: ${MODE}`);
const rows = [];
for (const cfg of CHAMBERS) {
  const level = generateLevel(cfg.seed, cfg);
  level.tile = TILE;
  const base = generateLevel(cfg.seed, cfg);
  const route = buildRoute(base);
  if (!route) {
    rows.push({ chamber: cfg.num, title: cfg.title, error: 'no route' });
    continue;
  }

  const routeSec = (route.length * TILE) / (MODE === 'creep' ? CREEP : WALK);
  const results = [];
  for (let k = 0; k < TRIALS; k++) {
    const fresh = generateLevel(cfg.seed, cfg);
    fresh.tile = TILE;
    results.push(trial(fresh, route, MODE));
  }
  const deaths = results.filter((r) => r.outcome === 'died').length;
  const escapes = results.filter((r) => r.outcome === 'escaped').length;
  const diedIn = results.filter((r) => r.outcome === 'died').map((r) => r.t);
  const avgDeath = diedIn.length ? diedIn.reduce((a, b) => a + b, 0) / diedIn.length : 0;
  const closest = Math.min(...results.map((r) => r.closest));

  rows.push({
    chamber: cfg.num,
    title: cfg.title,
    hunters: cfg.hunters,
    routeSec: Math.round(routeSec),
    died: `${deaths}/${TRIALS}`,
    escaped: `${escapes}/${TRIALS}`,
    deathAt: avgDeath ? `${avgDeath.toFixed(0)}s` : '—',
    closest: Math.round(closest),
  });
}

console.table(rows);
console.log(
  '\nghost = perfect routing, walking speed, no pings, never stops.\n' +
    'died = hunters caught it. closest = nearest a hunter ever got (px, min over runs).',
);
