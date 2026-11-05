// Run one expression inside the live game and print the result.
// Usage: node tools/probe.mjs "window.__hush.hunters.length"
import { spawn } from 'node:child_process';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9335;
const BASE = process.env.HUSH_BASE || 'http://127.0.0.1:8080/';
const expr = process.argv[2];
if (!expr) {
  console.error('usage: node tools/probe.mjs "<expression>"');
  process.exit(2);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const child = spawn(
  EDGE,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--mute-audio',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${process.env.TEMP}\\hush-probe-${Date.now()}`,
    '--window-size=1400,800',
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
    const timer = setTimeout(() => resolve({ error: { message: 'timeout' } }), 20000);
    pending.set(id, (msg) => {
      clearTimeout(timer);
      resolve(msg);
    });
  });
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

const r = await send('Runtime.evaluate', {
  expression: `(async () => {
    for (let i = 0; i < 100 && !window.__hush; i++) await new Promise(r => setTimeout(r, 50));
    return (${expr});
  })()`,
  returnByValue: true,
  awaitPromise: true,
});
if (r.result?.exceptionDetails) {
  console.error('exception:', r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  process.exitCode = 1;
} else {
  console.log(JSON.stringify(r.result?.result?.value, null, 2));
}
child.kill();
