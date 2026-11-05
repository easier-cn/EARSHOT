// Build mode: draw the dark yourself.
// Everything here is a shape too — the palette is colour and form, not labels.

const EDGE_W = 44;
const EDGE_H = 30;
const CELL = 20;

export class Editor {
  constructor(game) {
    this.game = game;
    this.data = this.load();
    this.tool = 'wall';
    this.root = null;
    this.canvas = null;
    this.painting = false;
    this.erase = false;
  }

  empty() {
    const w = EDGE_W;
    const h = EDGE_H;
    const cells = new Uint8Array(w * h);
    for (let x = 0; x < w; x++) {
      cells[x] = 1;
      cells[(h - 1) * w + x] = 1;
    }
    for (let y = 0; y < h; y++) {
      cells[y * w] = 1;
      cells[y * w + w - 1] = 1;
    }
    return { w, h, cells: [...cells], spawn: { x: 2, y: 2 }, exit: { x: w - 4, y: h - 4 },
      shards: [], hunters: [], skitters: [] };
  }

  load() {
    try {
      const raw = localStorage.getItem('hush.map.v1');
      if (raw) {
        const d = JSON.parse(raw);
        if (d && d.w === EDGE_W && d.h === EDGE_H && Array.isArray(d.cells)) return d;
      }
    } catch (e) { /* a broken map is just an empty map */ }
    return this.empty();
  }

  save() {
    try { localStorage.setItem('hush.map.v1', JSON.stringify(this.data)); } catch (e) { /* private mode */ }
  }

  open() {
    if (!this.root) this.build();
    this.root.classList.remove('hidden');
    this.render();
  }

  close() {
    if (this.root) this.root.classList.add('hidden');
  }

  build() {
    const root = document.createElement('div');
    root.className = 'editor hidden';
    root.innerHTML = `
      <div class="editor-bar">
        <div class="tool" data-tool="wall" title="wall">${this.swatch('wall')}</div>
        <div class="tool" data-tool="erase" title="erase">${this.swatch('erase')}</div>
        <div class="sep"></div>
        <div class="tool" data-tool="shard" title="shard">${this.swatch('shard')}</div>
        <div class="tool" data-tool="exit" title="exit">${this.swatch('exit')}</div>
        <div class="tool" data-tool="hunter" title="hunter">${this.swatch('hunter')}</div>
        <div class="tool" data-tool="skitter" title="skitter">${this.swatch('skitter')}</div>
        <div class="tool" data-tool="spawn" title="spawn">${this.swatch('spawn')}</div>
        <div class="sep"></div>
        <button class="tool act" id="ed-play" title="play">${this.iconPlay()}</button>
        <button class="tool act" id="ed-close" title="close">${this.iconClose()}</button>
      </div>
      <canvas class="editor-canvas"></canvas>
      <div class="editor-foot"><span class="ed-legend"></span></div>
    `;
    this.game.ui.root.appendChild(root);
    this.root = root;
    this.canvas = root.querySelector('.editor-canvas');
    this.canvas.width = this.data.w * CELL;
    this.canvas.height = this.data.h * CELL;
    root.querySelectorAll('.tool[data-tool]').forEach((el) => {
      el.addEventListener('click', () => {
        this.tool = el.dataset.tool;
        this.syncTools();
      });
    });
    root.querySelector('#ed-play').addEventListener('click', () => this.play());
    root.querySelector('#ed-close').addEventListener('click', () => this.game.closeEditor());
    this.syncTools();
    this.bindCanvas();
  }

  swatch(kind) {
    if (kind === 'wall') return '<i class="sw wall"></i>';
    if (kind === 'erase') return '<i class="sw erase"></i>';
    if (kind === 'shard') return '<i class="sw shard"></i>';
    if (kind === 'exit') return '<i class="sw exit"></i>';
    if (kind === 'hunter') return '<i class="sw hunter"></i>';
    if (kind === 'skitter') return '<i class="sw skitter"></i>';
    return '<i class="sw spawn"></i>';
  }

  iconPlay() {
    return '<svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg>';
  }

  iconClose() {
    return '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
  }

  syncTools() {
    this.root.querySelectorAll('.tool[data-tool]').forEach((el) => {
      el.classList.toggle('on', el.dataset.tool === this.tool);
    });
  }

  bindCanvas() {
    const c = this.canvas;
    const pos = (e) => {
      const r = c.getBoundingClientRect();
      const x = Math.floor((e.clientX - r.left) / (r.width / this.data.w));
      const y = Math.floor((e.clientY - r.top) / (r.height / this.data.h));
      return { x: Math.max(0, Math.min(this.data.w - 1, x)), y: Math.max(0, Math.min(this.data.h - 1, y)) };
    };
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      this.painting = true;
      this.erase = e.button === 2;
      this.paint(pos(e));
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      if (this.painting) this.paint(pos(e));
    });
    c.addEventListener('pointerup', (e) => {
      this.painting = false;
      try { c.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
      this.save();
      this.render();
    });
  }

  paint({ x, y }) {
    const d = this.data;
    const idx = y * d.w + x;
    const erase = this.erase;
    if (this.tool === 'wall' || this.tool === 'erase') {
      const solid = this.tool === 'wall' ? !erase : erase;
      d.cells[idx] = solid ? 1 : 0;
      if (solid) {
        d.shards = d.shards.filter((s) => !(s.x === x && s.y === y));
      }
      this.render();
      return;
    }
    if (d.cells[idx]) return;
    const drop = () => {
      d.shards = d.shards.filter((s) => !(s.x === x && s.y === y));
      d.hunters = d.hunters.filter((s) => !(s.x === x && s.y === y));
      d.skitters = d.skitters.filter((s) => !(s.x === x && s.y === y));
    };
    if (erase) {
      drop();
      this.render();
      return;
    }
    if (this.tool === 'shard') {
      drop();
      d.shards.push({ x, y });
    } else if (this.tool === 'hunter') {
      drop();
      d.hunters.push({ x, y });
    } else if (this.tool === 'skitter') {
      drop();
      d.skitters.push({ x, y });
    } else if (this.tool === 'exit') {
      d.exit = { x, y };
    } else if (this.tool === 'spawn') {
      d.spawn = { x, y };
    }
    this.render();
  }

  render() {
    if (!this.canvas) return;
    const ctx = this.canvas.getContext('2d');
    const d = this.data;
    const S = CELL;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05080b';
    ctx.fillRect(0, 0, d.w * S, d.h * S);
    ctx.strokeStyle = 'rgba(127,227,212,0.05)';
    ctx.lineWidth = 1;
    for (let x = 1; x < d.w; x++) {
      ctx.beginPath(); ctx.moveTo(x * S, 0); ctx.lineTo(x * S, d.h * S); ctx.stroke();
    }
    for (let y = 1; y < d.h; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * S); ctx.lineTo(d.w * S, y * S); ctx.stroke();
    }
    for (let y = 0; y < d.h; y++) {
      for (let x = 0; x < d.w; x++) {
        if (!d.cells[y * d.w + x]) continue;
        ctx.fillStyle = 'rgba(127,227,212,0.16)';
        ctx.fillRect(x * S + 0.5, y * S + 0.5, S - 1, S - 1);
        ctx.strokeStyle = 'rgba(127,227,212,0.45)';
        ctx.strokeRect(x * S + 0.5, y * S + 0.5, S - 1, S - 1);
      }
    }
    const dot = (p, color, r = 3.2) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x * S + S / 2, p.y * S + S / 2, r, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const s of d.shards) dot(s, 'rgba(255,205,110,0.95)');
    for (const h of d.hunters) dot(h, 'rgba(255,86,86,0.95)');
    for (const k of d.skitters) dot(k, 'rgba(255,120,120,0.9)', 2.4);
    const ex = d.exit;
    ctx.strokeStyle = 'rgba(140,240,170,0.95)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(ex.x * S + S / 2, ex.y * S + S / 2, 5.4, Math.PI, 0, true);
    ctx.moveTo(ex.x * S + S / 2 - 5.4, ex.y * S + S / 2);
    ctx.lineTo(ex.x * S + S / 2 - 5.4, ex.y * S + S * 0.85);
    ctx.moveTo(ex.x * S + S / 2 + 5.4, ex.y * S + S / 2);
    ctx.lineTo(ex.x * S + S / 2 + 5.4, ex.y * S + S * 0.85);
    ctx.stroke();
    const sp = d.spawn;
    ctx.strokeStyle = 'rgba(235,255,250,0.9)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(sp.x * S + S / 2, sp.y * S + S / 2, 5, 0, Math.PI * 2);
    ctx.moveTo(sp.x * S + S / 2 - 7, sp.y * S + S / 2);
    ctx.lineTo(sp.x * S + S / 2 + 7, sp.y * S + S / 2);
    ctx.stroke();
  }

  play() {
    this.save();
    this.close();
    this.game.startCustom(this.data);
  }
}
