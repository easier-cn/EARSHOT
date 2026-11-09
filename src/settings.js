// Player preferences: volume, sonar brightness, control device and bindings.
// Everything the settings panel edits lives here, so game.js and input.js
// never care about a physical key or a gamepad button — only an action name.

const STORAGE_KEY = 'hush.settings.v1';

export const ACTIONS = [
  { id: 'up', name: '向上', keys: ['KeyW', 'ArrowUp'], pad: 12 },
  { id: 'down', name: '向下', keys: ['KeyS', 'ArrowDown'], pad: 13 },
  { id: 'left', name: '向左', keys: ['KeyA', 'ArrowLeft'], pad: 14 },
  { id: 'right', name: '向右', keys: ['KeyD', 'ArrowRight'], pad: 15 },
  { id: 'sneak', name: '潜行（按住）', keys: ['ShiftLeft', 'ShiftRight'], pad: 4 },
  { id: 'ping', name: '声呐', keys: ['Space', 'KeyJ'], pad: 0 },
  { id: 'interact', name: '互动', keys: ['KeyF'], pad: 2 },
  { id: 'inventory', name: '背包', keys: ['Tab'], pad: 3 },
  { id: 'hot1', name: '快捷键 1', keys: ['Digit1'], pad: 5 },
  { id: 'hot2', name: '快捷键 2', keys: ['Digit2'], pad: 6 },
  { id: 'hot3', name: '快捷键 3', keys: ['Digit3'], pad: 7 },
  { id: 'hot4', name: '快捷键 4', keys: ['Digit4'], pad: 10 },
  { id: 'pause', name: '暂停', keys: ['Escape'], pad: 9 },
  { id: 'restart', name: '重新开始', keys: ['KeyR'], pad: 8 },
  { id: 'mute', name: '静音', keys: ['KeyM'], pad: 11 },
];

const NAMED_KEYS = {
  Space: '空格键',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift',
  ControlLeft: 'Ctrl',
  ControlRight: 'Ctrl',
  AltLeft: 'Alt',
  AltRight: 'Alt',
  Tab: 'Tab',
  Enter: 'Enter',
  Escape: 'Esc',
  Backspace: '退格',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', '返回', '开始', 'L3', 'R3', '↑', '↓', '←', '→'];

export function keyLabel(code) {
  if (!code) return '—';
  if (NAMED_KEYS[code]) return NAMED_KEYS[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `小键盘 ${code.slice(6)}`;
  return code;
}

export function padLabel(index) {
  return PAD_NAMES[index] || `键 ${index}`;
}

export function defaultSettings() {
  const bindings = {};
  for (const a of ACTIONS) bindings[a.id] = { keys: [...a.keys], pad: [a.pad] };
  return { version: 1, volume: 0.85, brightness: 1, device: 'keyboard', bindings };
}

/** Fill in anything a stored profile is missing, so new actions keep working. */
export function normalizeSettings(raw) {
  const base = defaultSettings();
  if (!raw || typeof raw !== 'object') return base;
  const out = { ...base };
  if (Number.isFinite(raw.volume)) out.volume = Math.min(1, Math.max(0, raw.volume));
  if (Number.isFinite(raw.brightness)) out.brightness = Math.min(1.8, Math.max(0.3, raw.brightness));
  if (raw.device === 'gamepad' || raw.device === 'keyboard') out.device = raw.device;
  for (const a of ACTIONS) {
    const b = raw.bindings && raw.bindings[a.id];
    if (!b) continue;
    if (Array.isArray(b.keys) && b.keys.length) out.bindings[a.id].keys = b.keys.filter((k) => typeof k === 'string');
    if (Array.isArray(b.pad) && b.pad.length) out.bindings[a.id].pad = b.pad.filter((n) => Number.isInteger(n) && n >= 0);
  }
  return out;
}

export function loadSettings(storage = globalThis.localStorage) {
  try {
    const raw = storage && storage.getItem(STORAGE_KEY);
    return normalizeSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(settings, storage = globalThis.localStorage) {
  try {
    storage && storage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* private mode: the session still works, it just will not remember */
  }
  return settings;
}

/** Drop the stored profile (used by tests and by a manual reset). */
export function clearStoredSettings(storage = globalThis.localStorage) {
  try {
    storage && storage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Bind one keyboard code to an action. If the code already belongs to another
 * action, the two swap their first key so nothing ends up unbound.
 */
export function bindKey(settings, actionId, code) {
  const bindings = settings.bindings;
  const own = bindings[actionId];
  if (!own) return false;
  const old = own.keys[0] || null;
  for (const [id, b] of Object.entries(bindings)) {
    if (id === actionId) continue;
    if (!b.keys.includes(code)) continue;
    b.keys = b.keys.filter((k) => k !== code);
    if (!b.keys.length && old) b.keys = [old];
  }
  own.keys = [code];
  saveSettings(settings);
  return true;
}

/** Same contract for a gamepad button index. */
export function bindPad(settings, actionId, index) {
  const bindings = settings.bindings;
  const own = bindings[actionId];
  if (!own) return false;
  const old = own.pad[0] ?? null;
  for (const [id, b] of Object.entries(bindings)) {
    if (id === actionId) continue;
    if (!b.pad.includes(index)) continue;
    b.pad = b.pad.filter((n) => n !== index);
    if (!b.pad.length && old != null) b.pad = [old];
  }
  own.pad = [index];
  saveSettings(settings);
  return true;
}

export function resetSettings(settings) {
  const base = defaultSettings();
  Object.assign(settings, base);
  saveSettings(settings);
  return settings;
}
