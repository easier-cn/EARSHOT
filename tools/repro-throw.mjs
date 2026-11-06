// Repro: does pressing a throw-item hotkey consume it, and does a left click throw it?
import { spawn } from 'node:child_process';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9336;
const BASE = process.env.HUSH_BASE || 'http://127.0.0.1:8080/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${process.env.TEMP}\\hush-repro-${Date.now()}`,
  '--window-size=1400,800',
  `${BASE}?static=1&map=room&seed=5`,
], { stdio: 'ignore' });

let ws, nextId = 0;
const pending = new Map();
const send = (method, params = {}) => {
  const id = ++nextId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
};
const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return r.result?.value;
};

for (let i = 0; i < 80; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    const page = list.find((p) => p.type === 'page' && p.webSocketDebuggerUrl);
    if (page) {
      ws = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((r) => (ws.onopen = r));
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.id && pending.has(m.id)) {
          const p = pending.get(m.id);
          pending.delete(m.id);
          m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
        }
      };
      break;
    }
  } catch {}
  await sleep(200);
}

await sleep(1200);

const state = () => evalJs(`(() => {
  const g = window.__hush;
  return JSON.stringify({
    state: g.state,
    active: g.activeItem,
    spray: g.inv.count('bugspray'),
    throws: g.throws.length,
    hot: g.inv.hot.map((h) => h && h.id),
  });
})()`);

const setup = await evalJs(`(() => {
  const g = window.__hush;
  if (g.state !== 'playing') g.startMap('room', 5);
  g.inv.addItem('bugspray', 3);
  const i = g.inv.pack.findIndex((s) => s && s.id === 'bugspray');
  g.inv.bindHot(0, i);
  g.ui.showGame();
  return 'ok';
})()`);

const before = await state();
await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Digit1', key: '1', windowsVirtualKeyCode: 49, nativeVirtualKeyCode: 49 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Digit1', key: '1', windowsVirtualKeyCode: 49, nativeVirtualKeyCode: 49 });
await sleep(200);
const afterKey = await state();

await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 980, y: 420 });
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 980, y: 420, button: 'left', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 980, y: 420, button: 'left', clickCount: 1 });
await sleep(80);
const t80 = await state();
await sleep(400);
const t480 = await state();
await sleep(900);
const t1380 = await state();

console.log(JSON.stringify({ setup, before, afterKey, t80, t480, t1380 }, null, 2));
ws.close();
process.exit(0);
