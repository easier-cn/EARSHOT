import { CHAMBERS } from './chambers.js';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

const fmtTime = (s) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

export class UI {
  constructor(root, game) {
    this.root = root;
    this.game = game;
    this.screens = {};
    this.toastTimer = 0;
    this.introTimer = 0;
    this.lastHud = '';
  }

  build() {
    this.root.innerHTML = `
      <div class="vignette"></div>
      <div class="grain"></div>

      <section class="screen title-screen" id="scr-title">
        <div class="title-inner">
          <div class="eyebrow">A SONAR STEALTH GAME</div>
          <h1 class="logo">HUSH</h1>
          <div class="rule"></div>
          <p class="tagline">你什么都看不见。<span>黑暗在听。</span></p>
          <button class="btn primary" id="btn-start">进入黑暗</button>
          <div class="grid-label">或回到一间旧密室</div>
          <div class="chamber-grid" id="chamber-grid"></div>
          <div class="hints">
            <span><b>WASD</b> 移动</span>
            <span><b>左键</b> 声呐</span>
            <span><b>空格</b> 聆听</span>
            <span><b>Shift</b> 奔跑</span>
          </div>
        </div>
        <div class="title-foot">v0.3.2 · 一个关于声音的实验</div>
      </section>

      <section class="screen pause-screen hidden" id="scr-pause">
        <div class="panel">
          <div class="panel-kicker">PAUSED</div>
          <h2>暂停</h2>
          <p class="panel-sub">黑暗在等你。</p>
          <div class="hints compact">
            <span><b>WASD</b> 移动</span>
            <span><b>左键</b> 声呐</span>
            <span><b>站定+空格</b> 聆听</span>
            <span><b>Shift</b> 奔跑</span>
          </div>
          <div class="panel-actions">
            <button class="btn primary" id="btn-resume">继续</button>
            <button class="btn" id="btn-restart">重来</button>
            <button class="btn" id="btn-pause-mute">静音</button>
            <button class="btn ghost" id="btn-title">返回标题</button>
          </div>
        </div>
      </section>

      <section class="screen dead-screen hidden" id="scr-dead">
        <div class="panel">
          <div class="panel-kicker danger">YOU WERE HEARD</div>
          <h2>你被听见了</h2>
          <p class="panel-sub">黑暗记住了你的位置。</p>
          <div class="panel-actions">
            <button class="btn primary" id="btn-retry">再试一次 <kbd>R</kbd></button>
            <button class="btn ghost" id="btn-dead-title">返回标题</button>
          </div>
        </div>
      </section>

      <section class="screen clear-screen hidden" id="scr-clear">
        <div class="panel">
          <div class="panel-kicker">CHAMBER SILENT</div>
          <h2>密室已静</h2>
          <div class="record" id="clear-record"></div>
          <div class="stats" id="clear-stats"></div>
          <div class="panel-actions">
            <button class="btn primary" id="btn-next">下一间</button>
            <button class="btn ghost" id="btn-clear-title">返回标题</button>
          </div>
        </div>
      </section>

      <section class="screen victory-screen hidden" id="scr-victory">
        <div class="panel wide">
          <div class="panel-kicker">ALL CHAMBERS SILENT</div>
          <h2 class="victory-title">HUSH</h2>
          <p class="panel-sub">所有密室都已安静。你学会了在黑暗里呼吸。</p>
          <div class="stats" id="victory-stats"></div>
          <div class="panel-actions">
            <button class="btn primary" id="btn-victory-title">回到开头</button>
          </div>
        </div>
      </section>

      <div class="hud hidden" id="hud">
        <div class="hud-top">
          <div class="hud-chamber">
            <span class="hud-label">密室</span>
            <span class="hud-num" id="hud-num">I</span>
            <span class="hud-title" id="hud-title">第一次呼吸</span>
          </div>
          <div class="hud-shards">
            <span class="gem"></span>
            <span id="hud-shard-count">0 / 1</span>
          </div>
        </div>
        <div class="hud-bottom">
          <div class="pips" id="hud-pips">
            <i class="pip on"></i><i class="pip on"></i><i class="pip on"></i>
          </div>
          <div class="hud-hint">左键 声呐 &nbsp;·&nbsp; 空格 聆听 &nbsp;·&nbsp; Shift 奔跑</div>
        </div>
      </div>

      <div class="listen-tag hidden" id="listen-tag">聆听中</div>
      <div class="toast" id="toast"></div>
      <div class="intro" id="intro"></div>
    `;

    const $ = (id) => document.getElementById(id);
    this.el = {
      title: $('scr-title'),
      pause: $('scr-pause'),
      dead: $('scr-dead'),
      clear: $('scr-clear'),
      victory: $('scr-victory'),
      clearPanel: $('scr-clear'),
      hud: $('hud'),
      hudNum: $('hud-num'),
      hudTitle: $('hud-title'),
      hudShard: $('hud-shard-count'),
      hudPips: $('hud-pips'),
      listenTag: $('listen-tag'),
      toast: $('toast'),
      intro: $('intro'),
      start: $('btn-start'),
      grid: $('chamber-grid'),
      stats: $('clear-stats'),
      record: $('clear-record'),
      victoryStats: $('victory-stats'),
    };
    this.screens = {
      title: this.el.title,
      pause: this.el.pause,
      dead: this.el.dead,
      clear: this.el.clear,
      victory: this.el.victory,
    };

    const g = this.game;
    const bind = (el, fn) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.blur();
        g.audio.unlock();
        g.audio.click();
        fn();
      });
    };
    bind(this.el.start, () => g.startBest());
    bind($('btn-resume'), () => g.resume());
    bind($('btn-restart'), () => g.restart());
    bind($('btn-pause-mute'), () => {
      const m = g.audio.toggleMute();
      $('btn-pause-mute').textContent = m ? '开启声音' : '静音';
    });
    bind($('btn-title'), () => g.quitToTitle());
    bind($('btn-retry'), () => g.restart());
    bind($('btn-dead-title'), () => g.quitToTitle());
    bind($('btn-next'), () => {
      if (g.chamberIndex + 1 >= CHAMBERS.length) g.victory();
      else g.next();
    });
    bind($('btn-clear-title'), () => g.quitToTitle());
    bind($('btn-victory-title'), () => g.quitToTitle());
  }

  // --------------------------------------------------------------- screens
  hideScreens() {
    for (const el of Object.values(this.screens)) el.classList.add('hidden');
  }

  showScreen(name) {
    this.hideScreens();
    const el = this.screens[name];
    if (el) el.classList.remove('hidden');
  }

  showTitle(progress) {
    this.hideScreens();
    this.showScreen('title');
    this.el.hud.classList.add('hidden');
    this.el.listenTag.classList.add('hidden');
    const startBtn = this.el.start;
    startBtn.textContent = progress.unlocked > 1 ? `继续 · 密室 ${ROMAN[progress.unlocked - 1]}` : '进入黑暗';
    this.el.grid.innerHTML = CHAMBERS.map((c, i) => {
      const unlocked = i < progress.unlocked;
      const cleared = progress.cleared.includes(i);
      const best = progress.best && progress.best[i];
      const label = !unlocked ? '未解锁' : best ? `最佳 ${fmtTime(best.time)}` : c.title;
      return `<button class="chamber ${unlocked ? 'open' : 'locked'} ${cleared ? 'cleared' : ''}"
        data-i="${i}" ${unlocked ? '' : 'disabled'} title="${label}">
        <span>${ROMAN[i]}</span>${cleared ? '<i></i>' : ''}
      </button>`;
    }).join('');
    this.el.grid.querySelectorAll('.chamber.open').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        btn.blur();
        this.game.audio.unlock();
        this.game.startChamber(Number(btn.dataset.i));
      });
    });
    setTimeout(() => startBtn.focus({ preventScroll: true }), 80);
  }

  showGame(index, cfg) {
    this.hideScreens();
    this.el.hud.classList.remove('hidden');
    this.el.hudNum.textContent = cfg.num;
    this.el.hudTitle.textContent = cfg.title;
    this.lastHud = '';
    this.intro(cfg.intro);
    this.el.listenTag.classList.add('hidden');
    this.updateHUD({
      chamber: index,
      shards: cfg.shards,
      total: cfg.shards,
      charges: 3,
      listen: false,
      muted: this.game.audio.muted,
      danger: 0,
    });
  }

  hideHUD() {
    this.el.hud.classList.add('hidden');
    this.el.listenTag.classList.add('hidden');
  }

  showPause() {
    this.showScreen('pause');
    document.getElementById('btn-pause-mute').textContent = this.game.audio.muted ? '开启声音' : '静音';
  }

  showDead() {
    if (!this.screens.dead.classList.contains('hidden')) return;
    this.hideHUD();
    this.showScreen('dead');
  }

  showClear({ chamber, time, pings, best, isRecord, last }) {
    this.el.hud.classList.add('hidden');
    this.showScreen('clear');
    this.el.stats.innerHTML = `
      <div><span>用时</span><b>${fmtTime(time)}</b></div>
      <div><span>声呐</span><b>${pings} 次</b></div>
      <div><span>碎片</span><b>${CHAMBERS[chamber].shards} / ${CHAMBERS[chamber].shards}</b></div>
    `;
    const bestTime = best ? fmtTime(best.time) : '—';
    this.el.record.innerHTML = `
      ${isRecord ? '<span class="record-badge">新纪录</span>' : ''}
      <span>最佳 ${bestTime}${best ? ` · ${best.pings} 次声呐` : ''}</span>
    `;
    this.el.record.classList.toggle('fresh', !!isRecord);
    document.getElementById('btn-next').textContent = last ? '完成旅程' : '下一间';
  }

  showVictory(progress = {}) {
    this.el.hud.classList.add('hidden');
    this.showScreen('victory');
    const best = progress.best || {};
    const keys = Object.keys(best);
    let total = 0;
    let pings = 0;
    for (const k of keys) {
      total += best[k].time;
      pings += best[k].pings;
    }
    this.el.victoryStats.innerHTML = `
      <div><span>密室</span><b>${keys.length} / ${CHAMBERS.length}</b></div>
      <div><span>最佳总用时</span><b>${keys.length ? fmtTime(total) : '—'}</b></div>
      <div><span>声呐</span><b>${pings} 次</b></div>
    `;
  }

  /** Crossing into a new neighbourhood of the same cave. No fanfare, just a
   *  name, the way a place tells you where you are. */
  setSector(num, title) {
    this.el.hudNum.textContent = num;
    this.el.hudTitle.textContent = title;
    this.el.hudTitle.classList.remove('pulse');
    void this.el.hudTitle.offsetWidth;
    this.el.hudTitle.classList.add('pulse');
  }

  showWorldVictory({ time, pings, best, isRecord, shards }) {
    this.el.hud.classList.add('hidden');
    this.showScreen('victory');
    const panel = this.el.victory.querySelector('.panel');
    panel.querySelector('.panel-kicker').textContent = 'THE NEST IS QUIET';
    panel.querySelector('.panel-sub').textContent =
      '整座巢都安静下来了。你走完了它，没有让它听见最后一次。';
    this.el.victoryStats.innerHTML = `
      <div><span>用时</span><b>${fmtTime(time)}</b></div>
      <div><span>声呐</span><b>${pings} 次</b></div>
      <div><span>碎片</span><b>${shards} 块</b></div>
      <div><span>最佳</span><b>${best ? fmtTime(best.time) : '—'}</b></div>
    `;
    const kicker = panel.querySelector('.panel-kicker');
    if (isRecord) kicker.innerHTML = 'THE NEST IS QUIET <span class="record-badge">新纪录</span>';
  }

  // ------------------------------------------------------------------- hud
  updateHUD(d) {
    const key = `${d.shards}|${d.charges}|${d.listen}|${d.muted}`;
    if (key !== this.lastHud) {
      this.lastHud = key;
      this.el.hudShard.textContent = `${d.total - d.shards} / ${d.total}`;
      const pips = this.el.hudPips.children;
      for (let i = 0; i < pips.length; i++) {
        pips[i].classList.toggle('on', i < d.charges);
      }
      this.el.listenTag.classList.toggle('hidden', !d.listen);
    }
    this.el.hud.style.setProperty('--danger', (d.danger || 0).toFixed(2));
  }

  intro(text) {
    this.el.intro.textContent = text;
    this.el.intro.classList.remove('show');
    void this.el.intro.offsetWidth;
    this.el.intro.classList.add('show');
    clearTimeout(this.introTimer);
    this.introTimer = setTimeout(() => this.el.intro.classList.remove('show'), 5200);
  }

  toast(text) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.el.toast.classList.remove('show'), 1700);
  }

  // Clear transient overlays so they never sit on top of an end screen.
  dismiss() {
    clearTimeout(this.introTimer);
    clearTimeout(this.toastTimer);
    this.el.intro.classList.remove('show');
    this.el.toast.classList.remove('show');
  }

  tick() {
    /* reserved for future HUD animation */
  }
}
