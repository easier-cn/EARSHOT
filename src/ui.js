// The interface never speaks. Every message is a shape, a pulse, or a change
// in colour — because in this game words would do the listening for you.

const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg>',
  resume: '<svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg>',
  retry: '<svg viewBox="0 0 24 24"><path d="M12 4a8 8 0 1 1-7.4 5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 3v6h6" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  home: '<svg viewBox="0 0 24 24"><path d="M5 11l7-6 7 6v8H5z" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  sound: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 8a5 5 0 0 1 0 8" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  muted: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  pencil: '<svg viewBox="0 0 24 24"><path d="M4 20l4-1 11-11-3-3L5 16z" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  bars: '<svg viewBox="0 0 24 24"><rect x="7" y="5" width="3" height="14"/><rect x="14" y="5" width="3" height="14"/></svg>',
};

function icon(name, cls = '') {
  return `<span class="ico ${cls}" aria-hidden="true">${ICON[name]}</span>`;
}

export class UI {
  constructor(root, game) {
    this.root = root;
    this.game = game;
    this.introTimer = 0;
    this.toastTimer = 0;
    this.build();
  }

  build() {
    this.root.innerHTML = `
      <div class="vignette"></div>
      <div class="grain"></div>

      <section class="screen title-screen" id="scr-title">
        <div class="title-inner">
          <svg class="emblem" viewBox="0 0 160 160" aria-hidden="true">
            <circle cx="80" cy="80" r="3.2" class="dot"/>
            <path class="arc a1" d="M80 26a54 54 0 0 1 0 108"/>
            <path class="arc a2" d="M80 12a68 68 0 0 1 0 136"/>
            <path class="arc a3" d="M80 44a36 36 0 0 1 0 72"/>
          </svg>
          <div class="start-row">
            <button class="btn primary" id="btn-start" aria-label="进入">${icon('play')}</button>
            <button class="btn build" id="btn-edit" aria-label="造图">${icon('pencil')}</button>
          </div>
          <div class="nest-glyph" id="nest-glyph"></div>
          <div class="chamber-grid" id="chamber-grid"></div>
        </div>
        <div class="title-foot" id="title-foot"></div>
      </section>

      <section class="screen pause-screen hidden" id="scr-pause">
        <div class="panel">
          <div class="panel-glyph">${ICON.bars}</div>
          <div class="icon-row">
            <button class="btn icon" id="btn-resume" aria-label="继续">${icon('resume')}</button>
            <button class="btn icon" id="btn-restart" aria-label="重来">${icon('retry')}</button>
            <button class="btn icon" id="btn-mute" aria-label="静音">${icon('sound')}</button>
            <button class="btn icon" id="btn-title" aria-label="标题">${icon('home')}</button>
          </div>
        </div>
      </section>

      <section class="screen dead-screen hidden" id="scr-dead">
        <div class="panel">
          <svg class="panel-glyph broken" viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="34" class="ring-broken"/>
            <circle cx="50" cy="50" r="5" class="dot-red"/>
          </svg>
          <div class="deep-glyph" id="dead-deep"></div>
          <div class="icon-row">
            <button class="btn icon" id="btn-retry" aria-label="再试">${icon('retry')}</button>
            <button class="btn icon" id="btn-dead-title" aria-label="标题">${icon('home')}</button>
          </div>
        </div>
      </section>

      <section class="screen clear-screen hidden" id="scr-clear">
        <div class="panel">
          <svg class="panel-glyph" viewBox="0 0 100 100" aria-hidden="true">
            <path class="burst" d="M50 8l7 26 20-18-8 27 27-6-22 19 26 8-27 6 18 21-26-9 2 27-17-22-17 22 2-27-26 9 18-21-27-6 26-8-22-19 27 6-8-27 20 18z"/>
          </svg>
          <div class="stats-glyphs" id="clear-stats"></div>
          <div class="icon-row">
            <button class="btn icon" id="btn-next" aria-label="下一间">${icon('next')}</button>
            <button class="btn icon" id="btn-clear-title" aria-label="标题">${icon('home')}</button>
          </div>
        </div>
      </section>

      <section class="screen victory-screen hidden" id="scr-victory">
        <div class="panel">
          <svg class="panel-glyph" viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="8" class="dot"/>
            <circle cx="50" cy="50" r="20" class="ring-dim"/>
            <circle cx="50" cy="50" r="32" class="ring-dim d2"/>
            <circle cx="50" cy="50" r="43" class="ring-dim d3"/>
          </svg>
          <div class="stats-glyphs" id="victory-stats"></div>
          <button class="btn icon" id="btn-victory-home" aria-label="标题">${icon('home')}</button>
        </div>
      </section>

      <div class="hud hidden" id="hud">
        <div class="hud-left">
          <span class="hud-num" id="hud-num" data-sector="I"></span>
          <span class="hud-sector" id="hud-sector"></span>
        </div>
        <div class="hud-right">
          <span class="diamond"></span>
          <span class="shard-bar" id="hud-shards"></span>
        </div>
        <div class="hud-charges" id="hud-charges"></div>
        <div class="hud-listen" id="hud-listen">
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <path d="M14 20a6 6 0 0 1 12 0" class="l1"/>
            <path d="M9 20a11 11 0 0 1 22 0" class="l2"/>
          </svg>
        </div>
      </div>
    `;

    const $ = (id) => this.root.querySelector('#' + id);
    this.scr = {
      title: $('scr-title'),
      pause: $('scr-pause'),
      dead: $('scr-dead'),
      clear: $('scr-clear'),
      victory: $('scr-victory'),
    };
    this.hud = $('hud');
    this.grid = $('chamber-grid');
    this.nestGlyph = $('nest-glyph');
    this.foot = $('title-foot');
    this.hudNum = $('hud-num');
    this.hudSector = $('hud-sector');
    this.hudShards = $('hud-shards');
    this.hudCharges = $('hud-charges');
    this.hudListen = $('hud-listen');
    this.clearStats = $('clear-stats');
    this.victoryStats = $('victory-stats');
    this.deadDeep = $('dead-deep');

    // Buttons blur themselves so Space never triggers twice.
    const bind = (id, fn) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener('click', (e) => {
        e.preventDefault();
        el.blur();
        fn();
      });
    };
    const g = this.game;
    bind('btn-start', () => g.startBest());
    bind('btn-edit', () => g.openEditor());
    bind('btn-resume', () => g.resume());
    bind('btn-restart', () => g.restart());
    bind('btn-mute', () => g.toggleMute());
    bind('btn-title', () => g.quitToTitle());
    bind('btn-retry', () => g.restart());
    bind('btn-dead-title', () => g.quitToTitle());
    bind('btn-next', () => g.next());
    bind('btn-clear-title', () => g.quitToTitle());
    bind('btn-victory-home', () => g.quitToTitle());
    this.muteBtn = $('btn-mute');
  }

  hideScreens() {
    for (const s of Object.values(this.scr)) s.classList.add('hidden');
  }

  showScreen(name) {
    this.hideScreens();
    this.scr[name].classList.remove('hidden');
  }

  showTitle(progress = {}) {
    this.showScreen('title');
    this.hideHUD();
    this.grid.innerHTML = '';
    const unlocked = progress.unlocked || 1;
    const cleared = new Set(progress.cleared || []);
    for (let i = 0; i < 8; i++) {
      const cell = document.createElement('button');
      cell.className = 'cell' + (i < unlocked ? '' : ' locked') + (cleared.has(i) ? ' cleared' : '');
      // The chamber's number is drawn as bars, not written.
      let bars = '<span class="cell-bars">';
      for (let b = 0; b <= i; b++) bars += '<i></i>';
      bars += '</span>';
      cell.innerHTML = bars + (i < unlocked ? '' : '<span class="cell-slash"></span>');
      cell.disabled = i >= unlocked;
      cell.addEventListener('click', () => {
        cell.blur();
        this.game.startChamber(i);
      });
      this.grid.appendChild(cell);
    }
    this.nestGlyph.innerHTML = '';
    for (let i = 0; i < 16; i++) {
      const p = document.createElement('i');
      if (progress.worldCleared) p.className = 'done';
      this.nestGlyph.appendChild(p);
    }
    this.foot.innerHTML = progress.worldCleared ? `<span class="foot-rings">${icon('sound')}</span>` : '';
  }

  showGame() {
    this.hideScreens();
    this.hud.classList.remove('hidden');
  }

  hideHUD() {
    this.hud.classList.add('hidden');
  }

  showPause() {
    this.showScreen('pause');
    this.syncMute();
  }

  showDead({ deepest = null } = {}) {
    this.showScreen('dead');
    this.hideHUD();
    this.deadDeep.innerHTML = '';
    if (deepest != null) {
      const n = Math.min(8, deepest + 1);
      for (let i = 0; i < 8; i++) {
        const t = document.createElement('i');
        if (i < n) t.className = 'lit';
        this.deadDeep.appendChild(t);
      }
    }
  }

  showClear({ time = 0, pings = 0, isRecord = false } = {}) {
    this.showScreen('clear');
    this.hideHUD();
    this.clearStats.innerHTML = this._statRow(time, pings, isRecord);
  }

  showVictory() {
    this.showScreen('victory');
    this.hideHUD();
    this.victoryStats.innerHTML = this._statRow(0, 0, false);
  }

  showWorldVictory({ time = 0, pings = 0, isRecord = false } = {}) {
    this.showScreen('victory');
    this.hideHUD();
    this.victoryStats.innerHTML = this._statRow(time, pings, isRecord);
  }

  _statRow(time, pings, isRecord) {
    // Time and pings as bars; the record as a small bright ring.
    const tBars = Math.min(10, Math.max(1, Math.round(time / 30)));
    const pBars = Math.min(10, Math.max(0, Math.round(pings / 4)));
    let t = '<span class="stat"><span class="stat-bars">';
    for (let i = 0; i < 10; i++) t += `<i class="${i < tBars ? 'on' : ''}"></i>`;
    t += '</span></span>';
    let p = '<span class="stat"><span class="stat-bars amber">';
    for (let i = 0; i < 10; i++) p += `<i class="${i < pBars ? 'on' : ''}"></i>`;
    p += '</span></span>';
    const rec = isRecord ? '<span class="record-ring"></span>' : '';
    return `<div class="stat-row">${t}${p}${rec}</div>`;
  }

  setSector(num) {
    this.hudNum.dataset.sector = num;
    this.hudNum.innerHTML = '';
    const idx = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'].indexOf(num);
    const n = idx < 0 ? 1 : idx + 1;
    for (let i = 0; i < 8; i++) {
      const d = document.createElement('i');
      d.className = 'sector-dot';
      if (i < n) d.classList.add('lit');
      this.hudNum.appendChild(d);
    }
    this.hudNum.classList.remove('pulse');
    void this.hudNum.offsetWidth;
    this.hudNum.classList.add('pulse');
  }

  updateHUD({ shards = 0, total = 1, charges = 0, listen = false, danger = 0 } = {}) {
    const collected = Math.max(0, total - shards);
    const filled = total ? Math.round((collected / total) * 12) : 0;
    let bar = '';
    for (let i = 0; i < 12; i++) bar += `<i class="${i < filled ? 'on' : ''}"></i>`;
    this.hudShards.innerHTML = bar;
    let ch = '';
    for (let i = 0; i < 3; i++) ch += `<i class="${i < charges ? 'on' : ''}"></i>`;
    this.hudCharges.innerHTML = ch;
    this.hudListen.classList.toggle('on', !!listen);
    this.hud.classList.toggle('sneaking', !!this.game.sneak);
    this.root.style.setProperty('--danger', String(danger || 0));
    this.syncMute();
  }

  syncMute() {
    if (!this.muteBtn) return;
    const muted = this.game.audio && this.game.audio.muted;
    this.muteBtn.innerHTML = icon(muted ? 'muted' : 'sound');
  }

  /** A shape where a sentence used to be: one soft ring. */
  intro() {
    this.root.classList.add('intro-ring');
    clearTimeout(this.introTimer);
    this.introTimer = setTimeout(() => this.root.classList.remove('intro-ring'), 1400);
  }

  /** Feedback without language: amber for a shard, red for a refusal. */
  toast(kind = 'shard') {
    const cls = kind === 'deny' ? 'flash-red' : 'flash-amber';
    this.root.classList.add(cls);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.root.classList.remove(cls), 420);
  }

  dismiss() {
    clearTimeout(this.introTimer);
    clearTimeout(this.toastTimer);
    this.root.classList.remove('intro-ring', 'flash-red', 'flash-amber');
  }

  tick() {}
}
