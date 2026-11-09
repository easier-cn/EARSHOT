// Raw devices in, named actions out. Keyboard, mouse and gamepad all feed the
// same pressed/held sets, so the rest of the game never asks for a key code.

export class Input {
  constructor(target = window, canvas = null) {
    this.keys = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.mouseDown = false;
    this.anyKey = false;
    this.pointer = { x: 0, y: 0 };
    this.settings = null;
    this.pad = null;
    this.padConnected = false;
    this.padPrev = [];

    target.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      this.anyKey = true;
      if (this.onAnyKey) this.onAnyKey(e);
    });
    target.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.released.add(e.code);
      if (this.onAnyKey) this.onAnyKey(e);
    });
    target.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });

    if (canvas) {
      canvas.addEventListener('pointerdown', (e) => {
        if (e.button === 0) {
          this.mouseDown = true;
          this.pressed.add('Mouse0');
        }
        this.pointer.x = e.clientX;
        this.pointer.y = e.clientY;
      });
      canvas.addEventListener('pointerup', (e) => {
        if (e.button === 0) this.mouseDown = false;
      });
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    window.addEventListener('pointerdown', (e) => {
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
    });
  }

  /** Called once per frame, before the game reads input. */
  poll() {
    const gp = typeof navigator !== 'undefined' && navigator.getGamepads
      ? Array.from(navigator.getGamepads()).find(Boolean)
      : null;
    this.pad = gp || null;
    this.padConnected = !!gp;
    if (!gp) return;
    const buttons = gp.buttons || [];
    for (let i = 0; i < buttons.length; i++) {
      const on = !!buttons[i] && (buttons[i].pressed || buttons[i].value > 0.5);
      if (on && !this.padPrev[i]) this.pressed.add(`Pad${i}`);
      this.padPrev[i] = on;
    }
  }

  padJustPressed() {
    for (const code of this.pressed) if (code.startsWith('Pad')) return true;
    return false;
  }

  codes(action) {
    const b = this.settings && this.settings.bindings && this.settings.bindings[action];
    return b ? b.keys : [];
  }

  padIndex(action) {
    const b = this.settings && this.settings.bindings && this.settings.bindings[action];
    return b && b.pad && b.pad.length ? b.pad[0] : null;
  }

  padDown(index) {
    if (!this.pad || index == null) return false;
    const b = this.pad.buttons && this.pad.buttons[index];
    return !!b && (b.pressed || b.value > 0.5);
  }

  /** Held this frame (keyboard or gamepad). */
  down(action) {
    if (this.codes(action).some((c) => this.keys.has(c))) return true;
    return this.padDown(this.padIndex(action));
  }

  /** Pressed once this frame; consumes the press. */
  consume(action) {
    let hit = false;
    for (const c of this.codes(action)) {
      if (this.pressed.delete(c)) hit = true;
    }
    const p = this.padIndex(action);
    if (p != null && this.pressed.delete(`Pad${p}`)) hit = true;
    return hit;
  }

  /** Escape hatch for debug keys that intentionally bypass the bindings. */
  consumeCode(code) {
    const has = this.pressed.has(code);
    if (has) this.pressed.delete(code);
    return has;
  }

  /** Forget queued presses of an action (used when a tutorial starts). */
  clearAction(action) {
    for (const c of this.codes(action)) this.pressed.delete(c);
    const p = this.padIndex(action);
    if (p != null) this.pressed.delete(`Pad${p}`);
  }

  consumeAny() {
    if (!this.pressed.size) return false;
    this.pressed.clear();
    return true;
  }

  moveVector() {
    let x = 0;
    let y = 0;
    if (this.down('up')) y -= 1;
    if (this.down('down')) y += 1;
    if (this.down('left')) x -= 1;
    if (this.down('right')) x += 1;
    // Left stick is analogue; the dpad above is already digital.
    if (this.pad) {
      const ax = this.pad.axes[0] || 0;
      const ay = this.pad.axes[1] || 0;
      if (Math.hypot(ax, ay) > 0.28) {
        x += ax;
        y += ay;
      }
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.anyKey = false;
  }
}
