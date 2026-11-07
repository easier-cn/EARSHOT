// Faithful repro: charm → socket → stones granted → drag stones to hotkey → press 1 → click.
import { spawn } from 'node:child_process';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9337;
const BASE = process.env.HUSH_BASE || 'http://127.0.0.1:8080/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${process.env.TEMP}\\hush-inv-${Date.now()}`,
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
const evalJs = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value;

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
    pack: g.inv.pack.map((s) => (s ? s.id + ':' + (s.n || s.lvl) : null)),
    hot: g.inv.hot.map((h) => (h ? h.id + ':' + (h.n || h.lvl) : null)),
    charms: g.inv.charms.map((c) => (c ? c.id + ':' + c.lvl : null)),
    pebbles: g.inv.count('pebbles'),
    active: g.activeItem,
    throws: g.throws.length,
    feed: [...document.querySelectorAll('.feed-line')].map((e) => e.textContent).slice(-3),
  });
})()`);

const center = async (selector) => evalJs(`(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})()`);

const mouse = async (type, p, extra = {}) => send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', clickCount: 1, ...extra });
const key = async (code, k, vk) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: k, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: k, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
};

const drag = async (fromSel, toSel) => {
  const a = await center(fromSel);
  const b = await center(toSel);
  if (!a || !b) return 'no-cell';
  await mouse('mousePressed', a);
  for (let i = 1; i <= 6; i++) {
    await mouse('mouseMoved', { x: a.x + ((b.x - a.x) * i) / 6, y: a.y + ((b.y - a.y) * i) / 6 }, { button: 'none' });
    await sleep(20);
  }
  await mouse('mouseReleased', b);
  await sleep(120);
  return 'ok';
};

// give the player the stone charm, then drag it into the first socket with real pointer events
await evalJs(`(() => { const g = window.__hush; g.inv.addCharm('stone'); g.inv.addItem('vitamin', 2); g.ui.toggleInventory(g); })()`);
await sleep(200);
const drag1 = await drag('[data-kind=pack][data-id=stone]', '[data-kind=charm][data-i="0"]');
const afterSocket = await state();

// stones should now exist and be draggable to hotkey 1
const packCells = await evalJs(`JSON.stringify([...document.querySelectorAll('[data-kind=pack]')].map((c) => c.textContent.trim()))`);
const drag2 = await drag('[data-kind=pack][data-id=pebbles]', '[data-kind=hot][data-i="0"]');
const afterBind = await state();

await evalJs(`window.__hush.ui.toggleInventory(window.__hush)`);
await key('Digit1', '1', 49);
await sleep(200);
const afterKey = await state();

await mouse('mousePressed', { x: 980, y: 420 });
await mouse('mouseReleased', { x: 980, y: 420 });
await sleep(300);
const afterClick = await state();

console.log(JSON.stringify({ drag1, afterSocket, packCells, drag2, afterBind, afterKey, afterClick }, null, 2));
ws.close();
process.exit(0);
