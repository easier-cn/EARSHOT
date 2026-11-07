// Startup self-check: proves the build the browser actually loaded is intact.
// This exists because a stale module cache once made bug fixes look absent
// until Ctrl+F5 — so the boot screen now shows what loaded and what works.
import { Inventory } from './loot.js';

export const VERSION = '0.7.20';

const SCRIPT_VERSION = () => {
  const s = [...document.scripts].map((el) => el.src).find((src) => src.includes('main.js'));
  if (!s) return null;
  const m = s.match(/[?&]v=([\w.]+)/);
  return m ? m[1] : null;
};

export function collectChecks(game) {
  const rows = [];
  const add = (name, ok, detail = '') => rows.push({ name, ok, detail });

  add('脚本', typeof window.__hush !== 'undefined' && typeof game?.update === 'function', `v${VERSION}`);

  let rooms = 0;
  try {
    const L = game.level;
    rooms = L?.rooms?.length ?? 0;
    add('关卡', !!(L && L.grid && L.spawn && L.size), `${L.w}×${L.h}${rooms ? ` · ${rooms} 间` : ''}`);
  } catch (e) {
    add('关卡', false, String(e.message || e));
  }

  try {
    const inv = new Inventory();
    inv.addItem('pebbles', 3);
    const idx = inv.pack.findIndex((s) => s && s.id === 'pebbles');
    const bound = inv.bindHot(0, idx);
    const kept = inv.count('pebbles') === 3;
    const spent = inv.consume('pebbles') && inv.count('pebbles') === 2;
    const ref = !!(inv.hot[0] && inv.hot[0].n === 2);
    add('背包与快捷键', bound && kept && spent && ref, kept && ref ? '堆叠留在背包' : '快捷键抢走了整堆');
  } catch (e) {
    add('背包与快捷键', false, String(e.message || e));
  }

  const a = game.audio;
  const audioState = a && a.ctx ? a.ctx.state : '未初始化';
  // A suspended context is not a failure: browsers require a gesture first.
  const audioRow = { name: '音效', ok: audioState === 'running', detail: audioState === 'running' ? '已就绪' : '点击画面启用' };
  if (audioState !== 'running') audioRow.warn = true;
  rows.push(audioRow);

  const sv = SCRIPT_VERSION();
  add('版本', sv === VERSION, sv ? `脚本 ${sv}` : '无版本号');
  return rows;
}

export function runSelfCheck(game, { onDone } = {}) {
  const wrap = document.createElement('div');
  wrap.id = 'boot';
  wrap.innerHTML = `
    <div class="boot-panel">
      <div class="boot-mark"></div>
      <div class="boot-bar"><i></i></div>
      <ul class="boot-rows"></ul>
      <div class="boot-actions"></div>
    </div>`;
  document.body.appendChild(wrap);

  const bar = wrap.querySelector('.boot-bar i');
  const list = wrap.querySelector('.boot-rows');
  const actions = wrap.querySelector('.boot-actions');

  const rows = [];
  const paint = () => {
    list.innerHTML = rows
      .map(
        (r) =>
          `<li class="${r.warn ? 'warn' : r.ok ? 'ok' : 'bad'}"><b>${r.warn ? '·' : r.ok ? '✓' : '×'}</b><span>${r.name}</span><em>${r.detail || ''}</em></li>`
      )
      .join('');
  };

  const steps = [
    ['脚本', 0.25],
    ['关卡', 0.2],
    ['背包与快捷键', 0.25],
    ['音效', 0.15],
    ['版本', 0.15],
  ];

  let p = 0;
  let i = 0;
  const tick = () => {
    if (i < steps.length) {
      const [name] = steps[i];
      const all = collectChecks(game);
      const row = all.find((r) => r.name === name);
      if (row) rows.push(row);
      p += steps[i][1];
      bar.style.width = `${Math.round(p * 100)}%`;
      paint();
      i++;
      setTimeout(tick, 130);
      return;
    }

    // Final verdict on the complete set, so nothing is judged out of order.
    rows.length = 0;
    rows.push(...collectChecks(game));
    paint();
    const bad = rows.filter((r) => !r.ok && r.name !== '音效');

    if (bad.length) {
      actions.innerHTML = '<button class="boot-retry">重新载入（跳过缓存）</button>';
      actions.querySelector('.boot-retry').onclick = () => {
        location.replace(`${location.pathname}?fresh=${Date.now()}`);
      };
      wrap.classList.add('has-errors');
    } else {
      actions.innerHTML = '<span class="boot-hint">点击画面启用音效</span>';
      setTimeout(() => {
        wrap.classList.add('done');
        setTimeout(() => wrap.remove(), 420);
      }, 420);
    }
    onDone?.(rows);
  };

  tick();
  return wrap;
}
