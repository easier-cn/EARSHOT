// Reproduce "hotkey 1 does nothing" with real (trusted) key events.
import { spawn } from 'node:child_process';
import path from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9334;
const BASE = process.env.HUSH_BASE || 'http://127.0.0.1:8080/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

spawn(
  EDGE,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--mute-audio',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${process.env.TEMP}\\hush-key-${Date.now()}`,
    '--window-size=1400,800',
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
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function connect() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((p) => p.type === 'page' && p.webSocketDebuggerUrl);
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((r) => (ws.onopen = r));
        ws.onmessage = (ev) => {
          const msg = JSON.parse(ev.data);
          if (msg.id && pending.has(msg.id)) {
            const p = pending.get(msg.id);
            pending.delete(msg.id);
            if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
            else p.resolve(msg.result);
          }
        };
        return;
      }
    } catch {}
    await sleep(200);
  }
  throw new Error('no CDP target');
}

const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true });
  return r.result?.value;
};

const key = async (type, code, keyName, vk) => {
  await send('Input.dispatchKeyEvent', {
    type,
    code,
    key: keyName,
    windowsVirtualKeyCode: vk,
    nativeVirtualKeyCode: vk,
  });
};

await connect();
await sleep(1200);

const setup = await evalJs(`(() => {
  const g = window.__hush;
  g.startMap('room', 4242);
  g.inv.addItem('vitamin', 2);
  const i = g.inv.pack.findIndex((s) => s && s.id === 'vitamin');
  g.inv.bindHot(0, i);
  return JSON.stringify({ ready: true, hot: g.inv.hot[0], speedT: g.speedT });
})()`);
console.log('setup', setup);

await sleep(200);
await key('keyDown', 'Digit1', '1', 49);
await key('keyUp', 'Digit1', '1', 49);
await sleep(300);

console.log(
  'after key 1',
  await evalJs(`(() => {
    const g = window.__hush;
    return JSON.stringify({ speedT: +g.speedT.toFixed(2), left: g.inv.count('vitamin'), pressed: [...g.input.pressed] });
  })()`),
);

await key('keyDown', 'Digit1', '1', 49);
await key('keyUp', 'Digit1', '1', 49);
await sleep(200);

// Also check the canvas click -> ping path still works.
console.log('state', await evalJs(`window.__hush.state`));
process.exit(0);
