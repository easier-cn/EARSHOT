// Frame-time probe: run the heaviest chamber with sonar pings spamming and
// report rAF pacing. Headless uses software canvas, so treat the numbers as a
// pessimistic upper bound rather than what a player's GPU sees.
import { spawn } from 'node:child_process';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9334;
const BASE = process.env.HUSH_BASE || 'http://127.0.0.1:8080/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const child = spawn(
  EDGE,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--mute-audio',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${process.env.TEMP}\\hush-perf-${Date.now()}`,
    '--window-size=1600,900',
    `${BASE}?static=1`,
  ],
  { stdio: 'ignore' },
);

let ws;
let nextId = 0;
const pending = new Map();
const send = (method, params = {}) => {
  const id = ++nextId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ error: { message: 'timeout' } }), 30000);
    pending.set(id, (msg) => {
      clearTimeout(timer);
      resolve(msg);
    });
  });
};
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.text);
  return r.result?.result?.value;
};

async function connect() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const page = (await res.json()).find(
        (t) => t.type === 'page' && t.url !== 'about:blank' && !t.url.startsWith('devtools://'),
      );
      if (page) return page;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error('devtools target never appeared');
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
await send('Runtime.enable');

await evaluate(`(async () => { for (let i = 0; i < 100 && !window.__hush; i++) await new Promise(r => setTimeout(r, 50)); })()`);
const chamber = Number(process.env.CHAMBER || 7);
await evaluate(`window.__hush.startChamber(${chamber})`);
await sleep(800);

const raw = await evaluate(`(async () => {
  const h = window.__hush;
  const timings = [];
  let last = performance.now();
  let n = 0;
  const spam = setInterval(() => h.debugPing(), 120);
  await new Promise((resolve) => {
    function tick(now) {
      timings.push(now - last);
      last = now;
      n++;
      if (n < 720) requestAnimationFrame(tick);
      else resolve();
    }
    requestAnimationFrame(tick);
  });
  clearInterval(spam);
  return {
    timings,
    state: h.state,
    hunters: h.hunters.length,
    pings: h.pings.length,
    segments: h.level.segments.length,
    shards: h.shards.length,
  };
})()`);

const sorted = [...raw.timings].sort((a, b) => a - b);
const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
const over = (ms) => raw.timings.filter((t) => t > ms).length;

console.log({
  chamber,
  state: raw.state,
  hunters: raw.hunters,
  segments: raw.segments,
  shards: raw.shards,
  frames: raw.timings.length,
  avgMs: +avg.toFixed(2),
  p50: +pct(0.5).toFixed(2),
  p95: +pct(0.95).toFixed(2),
  p99: +pct(0.99).toFixed(2),
  maxMs: +sorted[sorted.length - 1].toFixed(2),
  over16ms: over(16.7),
  over33ms: over(33.4),
  approxFps: +(1000 / avg).toFixed(1),
});

child.kill();
process.exit(0);
