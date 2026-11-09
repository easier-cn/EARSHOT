// Real-time screenshot: no virtual time, so requestAnimationFrame actually runs.
// Usage: node tools/live.mjs "<setup expression>" out.png [waitMs]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9334;
const BASE = process.env.HUSH_BASE || 'http://127.0.0.1:8080/';
const setup = process.argv[2] || 'window.__hush.startChamber(1)';
const out = path.resolve(process.argv[3] || 'shots/live.png');
const wait = Number(process.argv[4] || 900);
const size = process.env.HUSH_SIZE || '';
const [winW, winH] = (size || '1600x900').split('x').map(Number);
fs.mkdirSync(path.dirname(out), { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const child = spawn(
  EDGE,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--mute-audio',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${process.env.TEMP}\\hush-live-${Date.now()}`,
    `--window-size=${winW},${winH}`,
    `${BASE}?static=1`,
  ],
  { stdio: 'ignore' },
);

let ws;
let nextId = 0;
const pending = new Map();

function send(method, params = {}) {
  const id = ++nextId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ error: { message: 'timeout' } }), 15000);
    pending.set(id, (msg) => {
      clearTimeout(timer);
      resolve(msg);
    });
  });
}

const evaluate = async (expression) =>
  (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result
    ?.result?.value;

async function connect() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find(
        (t) => t.type === 'page' && t.url !== 'about:blank' && !t.url.startsWith('devtools://'),
      );
      if (page) return page;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error('no devtools target');
}

const page = await connect();
ws = new WebSocket(page.webSocketDebuggerUrl);
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
};
await new Promise((r) => (ws.onopen = r));
await send('Page.enable');
await send('Runtime.enable');
if (size) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: winW,
    height: winH,
    deviceScaleFactor: 1,
    mobile: false,
  });
}

await evaluate(`(async () => {
  for (let i = 0; i < 100 && !window.__hush; i++) await new Promise(r => setTimeout(r, 50));
  return !!window.__hush;
})()`);

await evaluate(setup);
await sleep(wait);

const info = await evaluate(
  `JSON.stringify({ state: window.__hush.state, rays: window.__hush.rays.length,
     red: window.__hush.rays.filter(r => r.tint === '255, 70, 70').length,
     redPts: window.__hush.rays.filter(r => r.tint === '255, 70, 70').map(r => r.pts.length).slice(0, 6),
     tints: window.__hush.rays.reduce((a, r) => (a[String(r.tint)] = (a[String(r.tint)] || 0) + 1, a), {}) })`,
);

const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log(info);
child.kill();
process.exit(0);
