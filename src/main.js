import { Game } from './game.js';

// Surface any runtime error instead of failing to a black screen.
window.addEventListener('error', (e) => {
  document.title = `ERR ${e.message}`;
  const pre = document.createElement('pre');
  pre.id = 'err';
  pre.style.cssText =
    'position:fixed;z-index:99;inset:0 0 auto 0;margin:0;padding:12px;color:#ff8a8a;' +
    'background:#120404;font:12px/1.5 monospace;white-space:pre-wrap';
  pre.textContent = `${e.message}\n${e.filename}:${e.lineno}:${e.colno}`;
  document.body.appendChild(pre);
});

const params = new URLSearchParams(location.search);
if (params.has('static')) document.documentElement.classList.add('no-anim');

const canvas = document.getElementById('game');
const game = new Game(canvas, document.getElementById('ui'));
window.__hush = game;
if (params.has('edit')) setTimeout(() => game.openEditor(), 60);
if (params.has('hunt')) {
  setTimeout(() => {
    game.startChamber(1);
    const L = game.level;
    const T = L.tile;
    const px = Math.floor(game.player.x / T);
    const py = Math.floor(game.player.y / T);
    let spot = null;
    for (let r = 6; r <= 7 && !spot; r++) {
      for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) {
        const x = px + dx;
        const y = py + dy;
        if (x > 1 && y > 1 && x < L.w - 1 && y < L.h - 1 && !L.grid[y * L.w + x]) {
          spot = { x: (x + 0.5) * T, y: (y + 0.5) * T };
          break;
        }
      }
    }
    const h = game.hunters[0];
    if (spot) { h.x = spot.x; h.y = spot.y; }
    h.hear(game.player.x, game.player.y, 0.05);
    game.debugSimulate(0.75, {});
    game.stepEcho(h.x, h.y, '255, 70, 70');
    game.debugSimulate(0.16, {});
  }, 700);
}
if (params.has('red')) {
  setTimeout(() => {
    game.startChamber(1);
    game.stepEcho(game.player.x + 40, game.player.y + 2, '255, 70, 70');
    game.debugSimulate(0.2, {});
  }, 700);
}
if (params.has('debug')) {
  setTimeout(() => {
    game.debugMode = true;
  }, 600);
}
if (params.has('blue')) {
  setTimeout(() => {
    game.startChamber(0);
    game.stepEcho(game.player.x + 70, game.player.y, '110, 180, 255');
    game.debugSimulate(0.24, {});
  }, 900);
}

// Debug / screenshot helpers. None of this is reachable from the UI.
const chamber = params.get('c');
if (chamber !== null) {
  const idx = Number(chamber);
  if (Number.isFinite(idx)) {
    // Let the first frame settle, then jump straight into a chamber.
    setTimeout(() => game.startChamber(Math.max(0, Math.min(7, idx))), 60);
  }
}
const sim = params.get('sim');
if (sim !== null) {
  setTimeout(() => {
    game.debugInvincible = true;
    game.debugSimulate(Number(sim) || 2, {
      wave: Number(params.get('wave') ?? 0.45),
      every: Number(params.get('every') || 0),
      ping: params.has('ping'),
      move: params.has('move') ? { x: 1, y: 0 } : null,
    });
  }, 500);
} else if (params.has('ping')) {
  setInterval(() => game.debugPing(), 700);
}
if (params.has('listen')) {
  game.debugListen = true;
}
const freeze = params.get('freeze');
if (freeze !== null) {
  setTimeout(
    () => {
      game.frozen = true;
    },
    Math.max(0, Number(freeze) || 0),
  );
}

// Experimental: walk the single continuous map.
if (params.has('world')) {
  setTimeout(() => {
    game.startWorld(Number(params.get('world')) || 424242);
  }, 250);
}

// Force one of the end screens for visual checks.
const doc = params.get('doc');
if (doc) {
  setTimeout(() => {
    if (doc === 'dead') {
      game.die();
      game.ui.showDead();
    } else if (doc === 'clear') {
      game.complete();
    } else if (doc === 'victory') {
      game.chamberIndex = 7;
      game.victory();
    } else if (doc === 'pause') {
      game.pause();
    } else if (doc === 'worldwin') {
      game.startWorld();
      game.shards = [];
      game.collected = game.totalShards;
      game.echoHeard = true;
      game.exitOpen = true;
      game.levelTime = 421;
      game.pingsUsed = 37;
      game.complete();
    } else if (doc === 'echo') {
      game.startChamber(5);
      const m = game.skitters[0];
      if (m) {
        game.player.x = m.x + 120;
        game.player.y = m.y;
        game.charges = 3;
        if (m._plan) m._plan(game);
        game.firePing();
        game.debugSimulate(1.35, {});
      }
    }
  }, 900);
}
