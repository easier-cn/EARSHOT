const MOVE_KEYS = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

export class Input {
  constructor(target = window, canvas = null) {
    this.keys = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.mouseDown = false;
    this.anyKey = false;
    this.pointer = { x: 0, y: 0 };

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

  down(code) {
    return this.keys.has(code);
  }

  consume(code) {
    const has = this.pressed.has(code);
    if (has) this.pressed.delete(code);
    return has;
  }

  consumeAny() {
    if (!this.pressed.size) return false;
    this.pressed.clear();
    return true;
  }

  moveVector() {
    let x = 0;
    let y = 0;
    for (const code of this.keys) {
      const dir = MOVE_KEYS[code];
      if (dir === 'up') y -= 1;
      else if (dir === 'down') y += 1;
      else if (dir === 'left') x -= 1;
      else if (dir === 'right') x += 1;
    }
    if (x && y) {
      x *= Math.SQRT1_2;
      y *= Math.SQRT1_2;
    }
    return { x, y };
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.anyKey = false;
  }
}
