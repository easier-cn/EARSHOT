// Startup self-check: proves the build the browser actually loaded is intact.
// This exists because a stale module cache once made bug fixes look absent
// until Ctrl+F5 — so the boot screen now shows what loaded and what works.
import { Inventory, ITEMS } from './loot.js';
import { ITEM_TEXT } from './desc.js';

export const VERSION = '0.7.22';

const SCRIPT_VERSION = () => {
  const s = [...document.scripts].map((el) => el.src).find((src) => src.includes('main.js'));
  if (!s) return null;
  const m = s.match(/[?&]v=([\w.]+)/);
  return m ? m[1] : null;
};

/** The engine synthesises everything, so "loaded" means every voice exists. */
const AUDIO_VOICES = [
  'tone', 'noise', 'setSector', 'ping', 'echo', 'skitterTick', 'gateHum',
  'deny', 'alert', 'footstep', 'hunterStep', 'shard', 'shardEcho', 'gateOpen',
  'heartbeat', 'death', 'clear', 'click', 'update', 'setMuted',
];

export function collectChecks(game) {
  const rows = [];
  const add = (name, ok, detail = '', warn = false) => rows.push({ name, ok, detail, warn });

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

  // Consumables are the most bug-prone part of the inventory: every one must
  // consume exactly one unit and have a name/line to show in the tooltip.
  try {
    const inv = new Inventory();
    let thrown = 0;
    let used = 0;
    for (const [id, def] of Object.entries(ITEMS)) {
      if (!ITEM_TEXT[id]) throw new Error(`${id} 缺少描述`);
      inv.addItem(id, 2);
      const before = inv.count(id);
      if (before !== 2) throw new Error(`${id} 未能入包`);
      if (!inv.consume(id) || inv.count(id) !== 1) throw new Error(`${id} 消耗异常`);
      if (def.kind === 'throw') thrown++;
      else used++;
    }
    add('消耗品', true, `${thrown} 投掷 · ${used} 使用`);
  } catch (e) {
    add('消耗品', false, String(e.message || e));
  }

  const a = game?.audio;
  const missing = AUDIO_VOICES.filter((m) => typeof a?.[m] !== 'function');
  const audioState = a && a.ctx ? a.ctx.state : '未初始化';
  if (missing.length) {
    add('音效', false, `缺少 ${missing.length} 个音色`);
  } else if (audioState === 'running') {
    add('音效', true, `已就绪 · ${AUDIO_VOICES.length} 音色`);
  } else {
    // A suspended context is not a failure: browsers require a gesture first.
    add('音效', false, audioState === '未初始化' ? '等待启动' : '点击画面启用', true);
  }

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
      <div class="boot-head"><span class="boot-stage">载入声呐</span><span class="boot-pct">0%</span></div>
      <div class="boot-bar"><i></i></div>
      <ul class="boot-rows"></ul>
      <div class="boot-actions"></div>
    </div>`;
  document.body.appendChild(wrap);

  const bar = wrap.querySelector('.boot-bar i');
  const pct = wrap.querySelector('.boot-pct');
  const stage = wrap.querySelector('.boot-stage');
  const list = wrap.querySelector('.boot-rows');
  const actions = wrap.querySelector('.boot-actions');

  const all = collectChecks(game);
  const rows = [];
  const paint = () => {
    list.innerHTML = rows
      .map(
        (r) =>
          `<li class="${r.warn ? 'warn' : r.ok ? 'ok' : 'bad'}"><b>${r.warn ? '·' : r.ok ? '✓' : '×'}</b><span>${r.name}</span><em>${r.detail || ''}</em></li>`
      )
      .join('');
  };

  // One row per stage, with a cumulative weight: the bar only ever moves
  // forward, the way a loading bar is supposed to.
  const steps = [
    ['脚本', '载入模块', 0.14],
    ['关卡', '构筑关卡', 0.3],
    ['背包与快捷键', '校验背包', 0.52],
    ['消耗品', '检查消耗品', 0.72],
    ['音效', '载入音效', 0.9],
    ['版本', '核对版本', 1],
  ];

  let i = 0;
  const tick = () => {
    if (i < steps.length) {
      const [name, label, at] = steps[i];
      const row = all.find((r) => r.name === name);
      if (row) rows.push(row);
      stage.textContent = label;
      const p = Math.round(at * 100);
      bar.style.width = `${p}%`;
      pct.textContent = `${p}%`;
      paint();
      i++;
      setTimeout(tick, 150);
      return;
    }

    rows.length = 0;
    rows.push(...all);
    paint();
    stage.textContent = '完成';
    const bad = all.filter((r) => !r.ok && !r.warn);
    const warn = all.filter((r) => r.warn);

    if (bad.length) {
      actions.innerHTML = '<button class="boot-retry">重新载入（跳过缓存）</button>';
      actions.querySelector('.boot-retry').onclick = () => {
        location.replace(`${location.pathname}?fresh=${Date.now()}`);
      };
      wrap.classList.add('has-errors');
    } else {
      actions.innerHTML = `<span class="boot-hint">${warn.length ? '点击画面启用音效' : '按任意键开始'}</span>`;
      setTimeout(() => {
        wrap.classList.add('done');
        setTimeout(() => wrap.remove(), 420);
      }, 460);
    }
    onDone?.(rows);
  };

  tick();
  return wrap;
}