import { generateLevel, TILE } from './levelgen.js';
import { Player, Hunter, moveCircle } from './entities.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { UI } from './ui.js';
import { CHAMBERS } from './chambers.js';
import { clamp, dist } from './util.js';

const SAVE_KEY = 'hush.save.v1';
const PING_MAX = 3;
const PING_REGEN = 2.4;
const PING_SPEED = 720;
const PING_LIFE = 0.9;
const WAVE_LISTEN = 760;
const START_CHARGES = 3;

function makeDust(level, count = 130) {
  const dust = [];
  const rng = Math.random;
  for (let i = 0; i < count * 4 && dust.length < count; i++) {
    const x = 24 + rng() * (level.size.w - 48);
    const y = 24 + rng() * (level.size.h - 48);
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (level.grid[ty * level.w + tx] !== 0) continue;
    dust.push({
      x,
      y,
      vx: (rng() * 2 - 1) * 5,
      vy: (rng() * 2 - 1) * 5,
      phase: rng() * Math.PI * 2,
    });
  }
  return dust;
}

export class Game {
  constructor(canvas, uiRoot) {
    this.canvas = canvas;
    this.audio = new AudioEngine();
    this.input = new Input(window, canvas);
    this.renderer = new Renderer(canvas);
    this.ui = new UI(uiRoot, this);
    this.state = 'title';
    this.now = 0;
    this.last = 0;
    this.timeScale = 1;
    this.progress = this.loadProgress();

    this.level = null;
    this.player = null;
    this.hunters = [];
    this.shards = [];
    this.particles = [];
    this.pings = [];
    this.charges = START_CHARGES;
    this.chargeTimer = 0;
    this.pingsUsed = 0;
    this.levelTime = 0;
    this.collected = 0;
    this.exitOpen = false;
    this.danger = 0;
    this.shake = 0;
    this.flash = 0;
    this.deathT = 0;
    this.camX = 0;
    this.camY = 0;
    this.chamberIndex = 0;
    this.denyCooldown = 0;
    this.titlePingTimer = 0;

    this.ui.build();
    this.ui.showTitle(this.progress);
    this.loadDemo();

    this.input.onAnyKey = () => {
      if (this.state === 'title') {
        this.audio.unlock();
        this.startBest();
      }
    };
    window.addEventListener('resize', () => this.renderer.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });

    requestAnimationFrame(this.frame);
  }

  // ---------------------------------------------------------------- progress
  loadProgress() {
    const fallback = { unlocked: 1, cleared: [], last: 0 };
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return fallback;
      const data = JSON.parse(raw);
      if (typeof data.unlocked !== 'number') return fallback;
      return {
        unlocked: clamp(data.unlocked, 1, CHAMBERS.length),
        cleared: Array.isArray(data.cleared) ? data.cleared : [],
        last: typeof data.last === 'number' ? data.last : 0,
      };
    } catch {
      return fallback;
    }
  }

  saveProgress() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.progress));
    } catch {
      /* storage can fail in private mode — progress is a nicety */
    }
  }

  // ------------------------------------------------------------------- setup
  loadDemo() {
    const cfg = CHAMBERS[CHAMBERS.length - 1];
    this.level = generateLevel(777, { shards: 5, hunters: 5 });
    this.player = null;
    this.hunters = [];
    this.shards = this.level.shards.map((s) => ({ ...s }));
    this.pings = [];
    this.particles = makeDust(this.level);
    this.camX = this.level.size.w / 2;
    this.camY = this.level.size.h / 2;
    this.titlePingTimer = 0.2;
    this.exitOpen = false;
    this.state = 'title';
  }

  startBest() {
    const idx = clamp((this.progress.unlocked || 1) - 1, 0, CHAMBERS.length - 1);
    this.startChamber(idx);
  }

  startChamber(index) {
    this.audio.unlock();
    this.chamberIndex = clamp(index, 0, CHAMBERS.length - 1);
    const cfg = CHAMBERS[this.chamberIndex];
    this.level = generateLevel(cfg.seed, { shards: cfg.shards, hunters: cfg.hunters });
    this.player = new Player(this.level.spawn.x, this.level.spawn.y);
    this.hunters = this.level.hunters.map((h) => new Hunter(h.x, h.y));
    this.shards = this.level.shards.map((s) => ({ ...s }));
    this.pings = [];
    this.particles = makeDust(this.level);
    this.camX = this.player.x;
    this.camY = this.player.y;
    this.charges = START_CHARGES;
    this.chargeTimer = 0;
    this.pingsUsed = 0;
    this.levelTime = 0;
    this.collected = 0;
    this.exitOpen = false;
    this.danger = 0;
    this.shake = 0;
    this.flash = 0;
    this.deathT = 0;
    this.denyCooldown = 0;
    this.state = 'playing';
    this.progress.last = this.chamberIndex;
    this.saveProgress();
    this.ui.showGame(this.chamberIndex, cfg);
  }

  restart() {
    if (this.state === 'playing' || this.state === 'dead' || this.state === 'paused') {
      this.startChamber(this.chamberIndex);
    }
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.ui.showPause();
    if (this.audio.ctx) this.audio.ctx.suspend();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.ui.hideScreens();
    if (this.audio.ctx) this.audio.ctx.resume();
  }

  quitToTitle() {
    this.ui.hideScreens();
    this.loadDemo();
    this.ui.showTitle(this.progress);
  }

  next() {
    if (this.chamberIndex + 1 < CHAMBERS.length) {
      this.startChamber(this.chamberIndex + 1);
    } else {
      this.victory();
    }
  }

  victory() {
    this.state = 'victory';
    this.ui.showVictory();
  }

  // ------------------------------------------------------------------- loop
  frame = (ts) => {
    requestAnimationFrame(this.frame);
    if (!this.last) this.last = ts;
    let dt = (ts - this.last) / 1000;
    this.last = ts;
    if (!Number.isFinite(dt)) dt = 0;
    dt = Math.min(dt, 0.05);

    if (!this.frozen) {
      if (this.state !== 'paused') this.now += dt;
      this.handleGlobalKeys();

      if (this.state === 'playing') this.update(dt);
      else if (this.state === 'title') this.updateTitle(dt);
      else if (this.state === 'dead') this.updateDead(dt);
      else if (this.state === 'complete' || this.state === 'victory') this.updateIdle(dt);
      else if (this.state === 'paused') this.updateIdle(0);
    }

    this.render();
    this.ui.tick(dt);
    this.input.endFrame();
  };

  handleGlobalKeys() {
    if (this.input.consume('KeyM')) {
      const muted = this.audio.toggleMute();
      this.ui.toast(muted ? '静音' : '声音开启');
    }
    if (this.state === 'playing' && this.input.consume('Escape')) this.pause();
    else if (this.state === 'paused' && this.input.consume('Escape')) this.resume();
    else if (this.state === 'dead' && this.input.consume('KeyR')) this.restart();
    else if (this.state === 'playing' && this.input.consume('KeyR')) this.restart();
    else if (this.state === 'complete' && (this.input.consume('Enter') || this.input.consume('Space'))) {
      this.next();
    }
  }

  updateTitle(dt) {
    this.titlePingTimer -= dt;
    if (this.titlePingTimer <= 0) {
      this.titlePingTimer = 2.4 + Math.random() * 1.6;
      const rooms = this.level.rooms;
      const r = rooms[Math.floor(Math.random() * rooms.length)];
      this.pings.push({
        x: (r.x + r.w / 2) * TILE,
        y: (r.y + r.h / 2) * TILE,
        t0: this.now,
        speed: PING_SPEED,
        life: PING_LIFE,
        heard: new Set(),
      });
    }
    this.pings = this.pings.filter((p) => this.now - p.t0 < p.life + 0.15);
    this.updateParticles(dt);
    this.shake = Math.max(0, this.shake - dt * 20);
    this.danger = 0;
  }

  updateDead(dt) {
    this.deathT += dt;
    this.shake = Math.max(0, this.shake - dt * 26);
    this.updateParticles(dt);
    this.pings = this.pings.filter((p) => this.now - p.t0 < p.life + 0.2);
    if (this.deathT > 0.75) this.ui.showDead();
  }

  updateIdle(dt) {
    this.updateParticles(dt);
    this.shake = Math.max(0, this.shake - dt * 30);
  }

  update(dt) {
    const p = this.player;
    const L = this.level;
    this.levelTime += dt;

    const listen = this.input.down('Space') || this.debugListen === true;
    const run = (this.input.down('ShiftLeft') || this.input.down('ShiftRight')) && !listen;
    const move = this.input.moveVector();

    const motion = p.update(dt, move, { run, listen });
    const resolved = this.resolve(p, motion.x, motion.y);
    p.x = resolved.x;
    p.y = resolved.y;
    const k = Math.min(1, dt * 7);
    this.camX += (p.x - this.camX) * k;
    this.camY += (p.y - this.camY) * k;

    // footsteps
    if (p.moving) {
      const threshold = run ? 44 : listen ? 70 : 58;
      if (p.stepPhase > threshold) {
        p.stepPhase = 0;
        this.audio.footstep(0, run ? 1.4 : 1);
        const noiseRadius = listen ? 90 : run ? 340 : 215;
        for (const h of this.hunters) {
          if (dist(p.x, p.y, h.x, h.y) < noiseRadius) h.hear(p.x, p.y, 0.18);
        }
      }
    }

    // pinging
    if ((this.input.consume('Mouse0') || this.input.consume('KeyJ')) && !listen) {
      this.firePing();
    }

    // charge regen
    if (this.charges < PING_MAX) {
      this.chargeTimer -= dt;
      if (this.chargeTimer <= 0) {
        this.charges++;
        this.chargeTimer = this.charges < PING_MAX ? PING_REGEN : 0;
        this.audio.tone({ freq: 1200, type: 'sine', dur: 0.1, gain: 0.02, send: 0.2 });
      }
    }

    // pings: expand, alert hunters as the shell reaches them
    for (const ping of this.pings) {
      const age = this.now - ping.t0;
      if (age < 0 || age > ping.life) continue;
      const R = age * ping.speed;
      for (const h of this.hunters) {
        if (ping.heard.has(h.id)) continue;
        const d = dist(ping.x, ping.y, h.x, h.y);
        if (Math.abs(d - R) < 44) {
          ping.heard.add(h.id);
          h.hear(ping.x, ping.y, 0.08);
        }
      }
    }
    this.pings = this.pings.filter((ping) => this.now - ping.t0 < ping.life + 0.2);

    // shards
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const sh = this.shards[i];
      if (dist(p.x, p.y, sh.x, sh.y) < 22) {
        this.shards.splice(i, 1);
        this.collected++;
        this.audio.shard();
        this.flash = 1;
        this.shake = Math.max(this.shake, 2.5);
        for (const h of this.hunters) {
          if (dist(sh.x, sh.y, h.x, h.y) < 330) h.hear(sh.x, sh.y, 0.2);
        }
        if (this.shards.length === 0) {
          this.exitOpen = true;
          this.audio.gateOpen();
          this.shake = Math.max(this.shake, 6);
          this.ui.toast('出口已开启');
        }
      }
    }

    // exit
    if (this.exitOpen && dist(p.x, p.y, L.exit.x, L.exit.y) < 30) {
      this.complete();
      return;
    } else if (!this.exitOpen && dist(p.x, p.y, L.exit.x, L.exit.y) < 34) {
      if (this.denyCooldown <= 0) {
        this.audio.deny();
        this.ui.toast(`还差 ${this.shards.length} 块碎片`);
        this.denyCooldown = 2.2;
      }
    }
    this.denyCooldown -= dt;

    // hunters
    let nearest = Infinity;
    for (const h of this.hunters) {
      h.update(dt, this);
      const d = dist(p.x, p.y, h.x, h.y);
      if (d < nearest) nearest = d;
      if (d < p.r + h.r - 1) {
        this.die();
        return;
      }
    }

    this.danger = this.hunters.length
      ? clamp(1 - (nearest - 55) / 300, 0, 1)
      : 0;
    if (this.danger > 0.4) this.danger = Math.min(1, this.danger + 0.1);

    this.audio.update(dt, { danger: this.danger });
    this.updateParticles(dt);
    this.shake = Math.max(0, this.shake - dt * 24);
    this.flash = Math.max(0, this.flash - dt * 3.4);
    this.ui.updateHUD({
      chamber: this.chamberIndex,
      shards: this.shards.length,
      total: CHAMBERS[this.chamberIndex].shards,
      charges: this.charges,
      listen,
      muted: this.audio.muted,
      danger: this.danger,
    });
  }

  resolve(entity, dx, dy) {
    const L = this.level;
    return moveCircle(L.grid, L.w, L.h, L.tile, entity.x, entity.y, entity.r, dx, dy);
  }

  firePing() {
    if (this.charges < 1) {
      this.audio.deny();
      return;
    }
    this.charges--;
    if (this.chargeTimer <= 0) this.chargeTimer = PING_REGEN;
    const p = this.player;
    this.pings.push({
      x: p.x,
      y: p.y,
      t0: this.now,
      speed: PING_SPEED,
      life: PING_LIFE,
      heard: new Set(),
    });
    this.pingsUsed++;
    this.audio.ping();
    this.shake = Math.max(this.shake, 2.4);
    this.flash = 0.85;
    // immediate ripple on the hunters' "attention" for feedback
    for (const h of this.hunters) {
      if (dist(p.x, p.y, h.x, h.y) < WAVE_LISTEN * 0.15) h.hear(p.x, p.y, 0.3);
    }
  }

  die() {
    if (this.state !== 'playing') return;
    if (this.debugInvincible) return;
    this.state = 'dead';
    this.deathT = 0;
    this.shake = 18;
    this.flash = 0;
    this.pings = [];
    this.audio.death();
    this.ui.hideHUD();
  }

  complete() {
    if (this.state !== 'playing') return;
    this.state = 'complete';
    this.audio.clear();
    const cleared = new Set(this.progress.cleared);
    cleared.add(this.chamberIndex);
    this.progress.cleared = [...cleared];
    this.progress.unlocked = Math.max(this.progress.unlocked, this.chamberIndex + 2);
    this.progress.last = this.chamberIndex;
    this.saveProgress();
    this.ui.showClear({
      chamber: this.chamberIndex,
      time: this.levelTime,
      pings: this.pingsUsed,
      last: this.chamberIndex === CHAMBERS.length - 1,
    });
  }

  updateParticles(dt) {
    if (!this.level) return;
    const W = this.level.size.w;
    const H = this.level.size.h;
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x < 0) p.x += W;
      if (p.x > W) p.x -= W;
      if (p.y < 0) p.y += H;
      if (p.y > H) p.y -= H;
    }
  }

  render() {
    this.renderer.draw(this);
  }

  // Debug hooks used by the headless screenshot script.
  debugPing() {
    if (this.state === 'playing') this.firePing();
  }

  // Deterministic capture: step the world forward without relying on rAF,
  // then leave one ping mid-flight so the sonar shell is visible.
  debugSimulate(seconds, opts = {}) {
    const dt = 1 / 60;
    const steps = Math.max(1, Math.round(seconds / dt));
    let next = opts.every || 0;
    for (let i = 0; i < steps; i++) {
      if (next && this.now >= next) {
        next += opts.every;
        this.pings.push({
          x: this.player.x,
          y: this.player.y,
          t0: this.now,
          speed: PING_SPEED,
          life: PING_LIFE,
          heard: new Set(),
        });
      }
      this.now += dt;
      this.update(dt);
    }
    if (opts.ping && this.player) {
      const wave = opts.wave ?? 0.45;
      this.pings.push({
        x: this.player.x,
        y: this.player.y,
        t0: this.now - wave,
        speed: PING_SPEED,
        life: PING_LIFE,
        heard: new Set(),
      });
    }
    this.frozen = true;
  }
}
