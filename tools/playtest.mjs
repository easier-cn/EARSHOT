// Headless playtest through the Chrome DevTools Protocol.
// Verifies the title -> chamber transition, keyboard movement and mouse sonar
// with real (trusted) input events, then saves a screenshot.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9333;
const BASE = process.env.HUSH_BASE || 'http://127.0.0.1:8080/';
const SHOTS = path.resolve('shots');
fs.mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const child = spawn(
  EDGE,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--mute-audio',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${process.env.TEMP}\\hush-cdp-${Date.now()}`,
    '--window-size=1400,800',
    `${BASE}?static=1`,
  ],
  { stdio: 'ignore' },
);

let ws;
let nextId = 0;
const pending = new Map();

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find(
        (t) => t.type === 'page' && t.url !== 'about:blank' && !t.url.startsWith('devtools://'),
      );
      if (page) return page;
    } catch {
      /* browser not up yet */
    }
    await sleep(250);
  }
  throw new Error('devtools target never appeared');
}

function send(method, params = {}) {
  const id = ++nextId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ error: { message: 'timeout' } }), 10000);
    pending.set(id, (msg) => {
      clearTimeout(timer);
      resolve(msg);
    });
  });
}

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
}

const key = (type, code, keyName, vk) =>
  send('Input.dispatchKeyEvent', {
    type,
    code,
    key: keyName,
    windowsVirtualKeyCode: vk,
    nativeVirtualKeyCode: vk,
  });

const exceptions = [];

async function main() {
  const page = await connect();
  ws = new WebSocket(page.webSocketDebuggerUrl);
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params?.exceptionDetails;
      exceptions.push(d?.exception?.description || d?.text || 'unknown exception');
    }
  };
  await new Promise((r) => (ws.onopen = r));
  await send('Runtime.enable');
  await send('Page.enable');

  const ready = await evaluate(
    `(async () => {
       for (let i = 0; i < 100 && !window.__hush; i++) await new Promise(r => setTimeout(r, 50));
       return !!window.__hush;
     })()`,
  );
  const report = { ready };

  report.state0 = await evaluate('window.__hush.state');
  report.titleVisible = await evaluate(
    `!document.getElementById('scr-title').classList.contains('hidden')`,
  );

  // Any key starts the run.
  await key('keyDown', 'Enter', 'Enter', 13);
  await key('keyUp', 'Enter', 'Enter', 13);
  await sleep(300);
  report.state1 = await evaluate('window.__hush.state');
  report.chamber = await evaluate('window.__hush.chamberIndex');

  // Hold D for a moment.
  const x0 = await evaluate('window.__hush.player.x');
  await key('keyDown', 'KeyD', 'd', 68);
  await sleep(900);
  await key('keyUp', 'KeyD', 'd', 68);
  await sleep(100);
  const x1 = await evaluate('window.__hush.player.x');
  report.moved = +(x1 - x0).toFixed(1);

  // Listening needs stillness: still + Space senses, walking + Space does not.
  await key('keyDown', 'Space', ' ', 32);
  await sleep(550);
  report.listenStill = await evaluate('window.__hush.listen');
  await key('keyDown', 'KeyD', 'd', 68);
  await sleep(400);
  report.listenMoving = await evaluate('window.__hush.listen');
  report.creepSlow = await evaluate('window.__hush.player.speed <= 60');
  await key('keyUp', 'KeyD', 'd', 68);
  await key('keyUp', 'Space', ' ', 32);
  await sleep(150);

  // Click to ping.
  const before = await evaluate('window.__hush.charges');
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 700, y: 400, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 700, y: 400, button: 'left', clickCount: 1 });
  await sleep(120);
  report.chargesBefore = before;
  report.chargesAfter = await evaluate('window.__hush.charges');
  report.pings = await evaluate('window.__hush.pings.length');
  report.audio = await evaluate(
    `(() => { const a = window.__hush.audio; return {
       ready: a.ready,
       state: a.ctx ? a.ctx.state : null,
       master: a.master ? +a.master.gain.value.toFixed(2) : null,
     }; })()`,
  );

  await sleep(700);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  if (shot.result?.data) {
    fs.writeFileSync(path.join(SHOTS, 'cdp-play.png'), Buffer.from(shot.result.data, 'base64'));
    report.screenshot = 'shots/cdp-play.png';
  }

  // Physics regression checks: walls must stop the player, hunters must move.
  report.wallBlocks = await evaluate(`(() => {
    const h = window.__hush, L = h.level, p = h.player;
    let wall = null;
    for (let ty = 0; ty < L.h && !wall; ty++) {
      for (let tx = 0; tx < L.w; tx++) if (L.grid[ty * L.w + tx]) { wall = { tx, ty }; break; }
    }
    for (let i = 0; i < 80; i++) {
      const r = h.resolve(p, (wall.tx + 0.5) * L.tile - p.x, (wall.ty + 0.5) * L.tile - p.y);
      p.x = r.x; p.y = r.y;
    }
    const fx = Math.floor(p.x / L.tile), fy = Math.floor(p.y / L.tile);
    return !L.grid[fy * L.w + fx];
  })()`);
  report.huntersMove = await evaluate(`(async () => {
    const h = window.__hush;
    if (!h.hunters.length) return true;
    const before = h.hunters.map((x) => [x.x, x.y]);
    await new Promise((r) => setTimeout(r, 1800));
    return h.hunters.some((x, i) => Math.hypot(x.x - before[i][0], x.y - before[i][1]) > 20);
  })()`);

  // Escape pauses.
  await key('keyDown', 'Escape', 'Escape', 27);
  await key('keyUp', 'Escape', 'Escape', 27);
  await sleep(200);
  report.state2 = await evaluate('window.__hush.state');
  report.pauseVisible = await evaluate(
    `!document.getElementById('scr-pause').classList.contains('hidden')`,
  );

  // Resume, then teleport through every shard and the exit to exercise the
  // completion flow end to end.
  await key('keyDown', 'Escape', 'Escape', 27);
  await key('keyUp', 'Escape', 'Escape', 27);
  await sleep(150);
  const complete = await evaluate(`(async () => {
    const g = window.__hush;
    const step = () => new Promise(r => setTimeout(r, 90));
    for (let guard = 0; guard < 20 && g.shards.length; guard++) {
      g.player.x = g.shards[0].x;
      g.player.y = g.shards[0].y;
      await step();
    }
    const left = g.shards.length;
    g.player.x = g.level.exit.x;
    g.player.y = g.level.exit.y;
    await step();
    await step();
    return { state: g.state, left, shards: g.collected, exitOpen: g.exitOpen,
             panel: !document.getElementById('scr-clear').classList.contains('hidden') };
  })()`);
  report.complete = complete;
  await sleep(400);
  const clearShot = await send('Page.captureScreenshot', { format: 'png' });
  if (clearShot.result?.data) {
    fs.writeFileSync(path.join(SHOTS, 'cdp-clear.png'), Buffer.from(clearShot.result.data, 'base64'));
    report.clearShot = 'shots/cdp-clear.png';
  }

  // Knowledge lock: an echo-gated door must stay shut until a mimic answers
  // a sound next to it, and must open on its own once it hears that answer.
  await send('Page.navigate', { url: BASE + '?c=5&static=1' });
  await sleep(1200);
  report.gate = await evaluate(`(async () => {
    const g = window.__hush;
    const step = (ms) => new Promise((r) => setTimeout(r, ms || 80));
    if (g.state !== 'playing') return { error: 'not playing: ' + g.state };
    const required = g.echoRequired;
    for (let guard = 0; guard < 20 && g.shards.length; guard++) {
      g.player.x = g.shards[0].x;
      g.player.y = g.shards[0].y;
      await step(60);
    }
    const before = { shardsLeft: g.shards.length, open: g.exitOpen, echo: g.heard };
    const m = g.skitters[0];
    g.player.x = m.x + 130;
    g.player.y = m.y;
    g.charges = 3;
    g.firePing();
    await step(2400);
    return {
      required,
      before,
      after: { open: g.exitOpen, echoHeard: g.echoHeard, echoes: g.echoRings.length },
    };
  })()`);
  // The continuous world: sectors rename themselves as you cross them, all
  // shards still gate the exit, and the echo door still needs an answer.
  await send('Page.navigate', { url: BASE + '?world=1&static=1' });
  await sleep(1500);
  report.world = await evaluate(`(async () => {
    const g = window.__hush;
    const step = (ms) => new Promise((r) => setTimeout(r, ms || 60));
    if (!g.worldMode) return { error: 'world mode did not start: ' + g.state };
    const total = g.totalShards;
    const startSector = g.sector;
    const ch = g.level.size.h / 4;
    const cw = g.level.size.w / 2;
    g.player.x = cw * 0.5;
    g.player.y = ch * 3.5;
    await step(150);
    const crossed = { sector: g.sector, num: document.getElementById('hud-num').textContent };
    for (let guard = 0; guard < 40 && g.shards.length; guard++) {
      g.player.x = g.shards[0].x;
      g.player.y = g.shards[0].y;
      await step(50);
    }
    const before = { left: g.shards.length, open: g.exitOpen };
    const m = g.skitters.reduce((best, s) => {
      const d = Math.hypot(s.x - g.level.exit.x, s.y - g.level.exit.y);
      return !best || d < best.d ? { s, d } : best;
    }, null);
    g.player.x = m.s.x + 110;
    g.player.y = m.s.y;
    g.charges = 3;
    g.firePing();
    await step(2600);
    const open = g.exitOpen;
    g.player.x = g.level.exit.x;
    g.player.y = g.level.exit.y;
    await step(300);
    return {
      total, startSector, crossed, before, open,
      state: g.state,
      panel: !document.getElementById('scr-victory').classList.contains('hidden'),
      cleared: !!g.progress.worldCleared,
    };
  })()`);
  report.errors = exceptions;
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((e) => {
    console.error('playtest failed:', e);
    process.exitCode = 1;
  })
  .finally(() => {
    try {
      ws?.close();
    } catch {}
    child.kill();
  });
