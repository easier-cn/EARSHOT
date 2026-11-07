// Dump console + uncaught exceptions for a URL. Usage: node tools/console.mjs <url>
import { spawn } from 'node:child_process';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9339;
const url = process.argv[2] || 'http://127.0.0.1:8095/?static=1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--mute-audio',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${process.env.TEMP}\\hush-con-${Date.now()}`,
  '--window-size=1200,760', url,
], { stdio: 'ignore' });

let ws;
for (let i = 0; i < 60 && !ws; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    const page = list.find((p) => p.type === 'page' && p.webSocketDebuggerUrl);
    if (page) {
      ws = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((r) => (ws.onopen = r));
    }
  } catch {}
  await sleep(200);
}

ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    console.log('EXCEPTION:', d.text, d.exception?.description?.split('\n').slice(0, 4).join(' | '), `${d.url}:${d.lineNumber + 1}`);
  }
  if (m.method === 'Runtime.consoleAPICalled') {
    console.log('CONSOLE:', m.params.type, m.params.args.map((a) => a.value ?? a.description).join(' '));
  }
  if (m.method === 'Log.entryAdded') {
    console.log('LOG:', m.params.entry.level, m.params.entry.text, m.params.entry.url || '');
  }
};
ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
ws.send(JSON.stringify({ id: 2, method: 'Log.enable' }));
await sleep(2500);
const r = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
console.log('pages:', r.map((p) => p.url).join(' | '));
ws.close();
process.exit(0);
