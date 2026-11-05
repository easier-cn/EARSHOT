import { generateLevel, generateWorld, sectorOf, TILE } from './levelgen.js';
import { Player, Hunter, Skitter, moveCircle, isSolid } from './entities.js';
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
const RAY_COUNT = 96;
const RAY_SPEED = 560;
const RAY_LIFE = 0.95;
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
    this.skitters = [];
    this.shards = [];
    this.particles = [];
    this.pings = [];
    this.charges = START_CHARGES;
    this.chargeTimer = 0;
    this.listenT = 0;
    this.pingsUsed = 0;
    this.levelTime = 0;
    this.collected = 0;
    this.exitOpen = false;
    this.echoRequired = false;
    this.echoHeard = false;
    this.echoRings = [];
    this.humT = 2.6;
    this.danger = 0;
    this.shake = 0;
    this.flash = 0;
    this.deathT = 0;
    this.camX = 0;
    this.camY = 0;
    this.chamberIndex = 0;
    this.denyCooldown = 0;
    this.alertCd = 0;
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
    window.addEventListener('blur', () => {
      if (this.state === 'playing' && !this.frozen) this.pause();
    });

    requestAnimationFrame(this.frame);
  }

  // ---------------------------------------------------------------- progress
  loadProgress() {
    const fallback = { unlocked: 1, cleared: [], last: 0, best: {} };
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return fallback;
      const data = JSON.parse(raw);
      if (typeof data.unlocked !== 'number') return fallback;
      const best = {};
      if (data.best && typeof data.best === 'object') {
        for (const [k, v] of Object.entries(data.best)) {
          const i = Number(k);
          if (!Number.isInteger(i) || !v || typeof v.time !== 'number') continue;
          best[i] = { time: v.time, pings: Math.max(0, v.pings | 0) };
        }
      }
      return {
        unlocked: clamp(data.unlocked, 1, CHAMBERS.length),
        cleared: Array.isArray(data.cleared) ? data.cleared : [],
        last: typeof data.last === 'number' ? data.last : 0,
        best,
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
    this.level = generateLevel(777, { shards: 5, hunters: 5, style: cfg.style });
    this.player = null;
    this.hunters = [];
    this.shards = this.level.shards.map((s) => ({ ...s }));
    this.pings = [];
    this.rays = [];
    this.contacts = [];
    this.particles = makeDust(this.level);
    this.camX = this.level.size.w / 2;
    this.camY = this.level.size.h / 2;
    this.titlePingTimer = 0.2;
    this.exitOpen = false;
    this.state = 'title';
  }

  startBest() {
    if (this.state !== 'title') return;
    const idx = clamp((this.progress.unlocked || 1) - 1, 0, CHAMBERS.length - 1);
    this.startChamber(idx);
  }

  /** Dev/experimental: one continuous map, no chamber select. */
  startWorld(seed = 424242) {
    const level = generateWorld(seed);
    if (!level) return false;
    this.audio.unlock();
    this.worldMode = true;
    this.level = level;
    this.chamberIndex = 0;
    this.totalShards = level.shards.length;
    this.player = new Player(level.spawn.x, level.spawn.y);
    this.hunters = level.hunters.map((h) => new Hunter(h.x, h.y));
    this.skitters = (level.skitters || []).map((s) => new Skitter(s.x, s.y));
    this.shards = level.shards.map((s) => ({ ...s }));
    this.pings = [];
    this.rays = [];
    this.contacts = [];
    this.echoRings = [];
    this.particles = makeDust(level, 260);
    this.camX = this.player.x;
    this.camY = this.player.y;
    this.charges = START_CHARGES;
    this.chargeTimer = 0;
    this.listenT = 0;
    this.pingsUsed = 0;
    this.levelTime = 0;
    this.collected = 0;
    this.exitOpen = false;
    this.echoRequired = true;
    this.echoHeard = false;
    this.humT = 2.6;
    this.danger = 0;
    this.shake = 0;
    this.flash = 0;
    this.deathT = 0;
    this.denyCooldown = 0;
    this.state = 'playing';
    this.ui.showGame(0, { num: '◈', title: '低语之巢', shards: this.totalShards, intro: '' });
    return true;
  }

  startChamber(index) {
    this.audio.unlock();
    this.chamberIndex = clamp(index, 0, CHAMBERS.length - 1);
    const cfg = CHAMBERS[this.chamberIndex];
    this.level = generateLevel(cfg.seed, {
      shards: cfg.shards,
      hunters: cfg.hunters,
      skitters: cfg.skitters || 0,
      style: cfg.style,
    }) || generateLevel(cfg.seed, { shards: cfg.shards, hunters: cfg.hunters, style: 'halls' });
    this.player = new Player(this.level.spawn.x, this.level.spawn.y);
    this.hunters = this.level.hunters.map((h) => new Hunter(h.x, h.y));
    this.skitters = (this.level.skitters || []).map((s) => new Skitter(s.x, s.y));
    this.shards = this.level.shards.map((s) => ({ ...s }));
    this.pings = [];
    this.rays = [];
    this.contacts = [];
    this.particles = makeDust(this.level);
    this.camX = this.player.x;
    this.camY = this.player.y;
    this.charges = START_CHARGES;
    this.chargeTimer = 0;
    this.listenT = 0;
    this.pingsUsed = 0;
    this.levelTime = 0;
    this.collected = 0;
    this.exitOpen = false;
    this.echoRequired = false;
    this.echoHeard = false;
    this.echoRings = [];
    this.humT = 2.6;
    this.danger = 0;
    this.shake = 0;
    this.flash = 0;
    this.deathT = 0;
    this.denyCooldown = 0;
    this.echoRequired = !!cfg.echoGate;
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
    this.ui.dismiss();
    this.ui.showVictory(this.progress);
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
      this.spawnRays((r.x + r.w / 2) * TILE, (r.y + r.h / 2) * TILE);
    }
    this.pings = this.pings.filter((p) => this.now - p.t0 < p.life + 0.15);
    this.updateRays(dt);
    this.updateParticles(dt);
    this.shake = Math.max(0, this.shake - dt * 20);
    this.danger = 0;
  }

  updateDead(dt) {
    this.deathT += dt;
    this.shake = Math.max(0, this.shake - dt * 26);
    this.updateRays(dt);
    this.updateParticles(dt);
    this.pings = this.pings.filter((p) => this.now - p.t0 < p.life + 0.2);
    if (this.deathT > 0.75) this.ui.showDead();
  }

  updateIdle(dt) {
    this.updateRays(dt);
    this.updateParticles(dt);
    this.shake = Math.max(0, this.shake - dt * 30);
  }

  update(dt) {
    const p = this.player;
    const L = this.level;
    this.levelTime += dt;

    // Holding Space = creep silently. But the directional sense only comes
    // once you have actually stopped: sound is read in stillness.
    const creeping = this.input.down('Space');
    const run = (this.input.down('ShiftLeft') || this.input.down('ShiftRight')) && !creeping;
    const move = this.input.moveVector();

    const motion = p.update(dt, move, { run, listen: creeping });
    const resolved = this.resolve(p, motion.x, motion.y);
    p.x = resolved.x;
    p.y = resolved.y;
    const k = Math.min(1, dt * 7);
    this.camX += (p.x - this.camX) * k;
    this.camY += (p.y - this.camY) * k;

    if (p.moving) this.listenT = 0;
    else this.listenT = Math.min(1, this.listenT + dt);
    const listen = this.debugListen === true || (creeping && this.listenT > 0.26);
    this.listen = listen;

    // footsteps
    if (p.moving) {
      const threshold = run ? 44 : creeping ? 70 : 58;
      if (p.stepPhase > threshold) {
        p.stepPhase = 0;
        this.audio.footstep(0, run ? 1.4 : 1);
        const noiseRadius = creeping ? 90 : run ? 340 : 215;
        for (const h of this.hunters) {
          if (dist(p.x, p.y, h.x, h.y) < noiseRadius) this.alertHunter(h, p.x, p.y, 0.18);
        }
        for (const sk of this.skitters) {
          if (dist(p.x, p.y, sk.x, sk.y) < noiseRadius * 0.85) sk.hear(p.x, p.y, 'step', 1.25);
        }
      }
    }

    // pinging
    if ((this.input.consume('Mouse0') || this.input.consume('KeyJ')) && this.charges > 0) {
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
          this.alertHunter(h, ping.x, ping.y, 0.08);
        }
        for (const sk of this.skitters) {
          if (dist(ping.x, ping.y, sk.x, sk.y) < 600) sk.hear(ping.x, ping.y, 'ping', 1.05);
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
          if (dist(sh.x, sh.y, h.x, h.y) < 330) this.alertHunter(h, sh.x, sh.y, 0.2);
        }
        for (const sk of this.skitters) {
          if (dist(sh.x, sh.y, sk.x, sk.y) < 380) sk.hear(sh.x, sh.y, 'shard', 1.2);
        }
        if (this.shards.length === 0) this.tryOpenExit(true);
      }
    }

    // exit
    if (this.exitOpen && dist(p.x, p.y, L.exit.x, L.exit.y) < 30) {
      this.complete();
      return;
    } else if (!this.exitOpen && dist(p.x, p.y, L.exit.x, L.exit.y) < 34) {
      if (this.denyCooldown <= 0) {
        this.audio.deny();
        if (this.shards.length > 0) this.ui.toast(`还差 ${this.shards.length} 块碎片`);
        this.denyCooldown = 2.2;
      }
    }
    this.denyCooldown -= dt;
    this.alertCd -= dt;

    // skitters: deaf, fast, silent until they are close. No sound can warn
    // you early, so contact is the only rule that matters.
    for (const sk of this.skitters) {
      sk.update(dt, this);
      if (dist(p.x, p.y, sk.x, sk.y) < p.r + sk.r - 1) {
        this.die();
        return;
      }
    }

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

    for (let i = this.echoRings.length - 1; i >= 0; i--) {
      if (this.now - this.echoRings[i].t > 1.4) this.echoRings.splice(i, 1);
    }
    if (this.echoRequired && !this.echoHeard && this.shards.length === 0) {
      this.humT -= dt;
      if (this.humT <= 0) {
        this.humT = 3.6;
        this.audio.gateHum();
        for (const sk of this.skitters) {
          if (dist(L.exit.x, L.exit.y, sk.x, sk.y) < 700) sk.hear(L.exit.x, L.exit.y, 'hum', 0.95);
        }
      }
    }

    this.audio.update(dt, { danger: this.danger });
    this.updateRays(dt);
    this.updateParticles(dt);
    this.shake = Math.max(0, this.shake - dt * 24);
    this.flash = Math.max(0, this.flash - dt * 3.4);
    this.ui.updateHUD({
      chamber: this.chamberIndex,
      shards: this.shards.length,
      total: this.totalShards || CHAMBERS[this.chamberIndex].shards,
      charges: this.charges,
      listen,
      muted: this.audio.muted,
      danger: this.danger,
    });
  }

  // Every noise source goes through here, so the "it heard that" stinger stays
  // tied to the moment a hunter actually wakes up rather than to every step.
  /** A mimic repeated something. Hunters turn toward it, the room gets a
   *  visible ring, and a sealed door that hears an answer unlocks. */
  onEcho(m, kind, src) {
    m.echoCool = 2.0;
    m.revealT = 1.8;
    const pan = clamp((m.x - this.player.x) / 480, -1, 1) * 0.9;
    this.audio.echo(pan, kind);
    this.echoRings.push({ x: m.x, y: m.y, t: this.now, kind });
    for (const h of this.hunters) {
      if (dist(m.x, m.y, h.x, h.y) < 520) this.alertHunter(h, m.x, m.y, 0.15);
    }
    const byPlayer = kind === 'ping' || kind === 'step' || kind === 'shard';
    if (this.echoRequired && !this.echoHeard && byPlayer
      && dist(m.x, m.y, this.level.exit.x, this.level.exit.y) < 620) {
      this.echoHeard = true;
      this.tryOpenExit(false);
    }
  }

  /** The exit stays shut until the door has heard a doubled sound, not just
   *  the shards. No text explains this: the door hums, something answers. */
  tryOpenExit(withFanfare = false) {
    if (this.exitOpen) return false;
    if (this.shards.length > 0) return false;
    if (this.echoRequired && !this.echoHeard) return false;
    this.exitOpen = true;
    this.audio.gateOpen();
    this.shake = Math.max(this.shake, 6);
    if (withFanfare) this.ui.toast('出口已开启');
    return true;
  }

  alertHunter(h, x, y, delay) {
    const tracking = h.state === 'investigate';
    h.hear(x, y, delay);
    if (tracking || this.alertCd > 0) return;
    this.alertCd = 0.75;
    const pan = clamp((h.x - this.player.x) / 420, -1, 1) * 0.8;
    this.audio.alert(pan);
  }

  resolve(entity, dx, dy) {
    const L = this.level;
    return moveCircle(L.grid, L.w, L.h, L.tile, entity.x, entity.y, entity.r, dx, dy);
  }

  /** Spawn a fan of sonar rays that bounce off walls and leave light trails. */
  spawnRays(x, y) {
    for (let i = 0; i < RAY_COUNT; i++) {
      const a = (i / RAY_COUNT) * Math.PI * 2 + Math.random() * 0.035;
      this.rays.push({
        x,
        y,
        dx: Math.cos(a),
        dy: Math.sin(a),
        age: 0,
        life: RAY_LIFE * (0.85 + Math.random() * 0.25),
        bounce: 0,
        pts: [{ x, y }],
      });
    }
    while (this.rays.length > RAY_COUNT * 4) this.rays.shift();
  }

  /** Advance every ray, reflecting off walls and pruning dead trails. */
  updateRays(dt) {
    const L = this.level;
    if (!L) return;
    const alive = [];
    for (let i = 0; i < this.rays.length; i++) {
      const r = this.rays[i];
      r.age += dt;
      if (r.age > r.life + 1.5) continue;
      if (r.age <= r.life) {
        let move = RAY_SPEED * dt;
        while (move > 0.001) {
          const d = Math.min(6, move);
          move -= d;
          const nx = r.x + r.dx * d;
          const ny = r.y + r.dy * d;
          const hitX = isSolid(L.grid, L.w, L.h, Math.floor(nx / TILE), Math.floor(r.y / TILE));
          const hitY = isSolid(L.grid, L.w, L.h, Math.floor(r.x / TILE), Math.floor(ny / TILE));
          if (hitX) r.dx *= -1;
          if (hitY) r.dy *= -1;
          if (hitX || hitY) {
            r.bounce++;
            this.contacts.push({ x: r.x, y: r.y, t: this.now });
          }
          r.x = hitX ? r.x : nx;
          r.y = hitY ? r.y : ny;
          const last = r.pts[r.pts.length - 1];
          if (Math.abs(r.x - last.x) + Math.abs(r.y - last.y) >= 5) {
            r.pts.push({ x: r.x, y: r.y });
            if (r.pts.length > 14) r.pts.shift();
          }
          if (r.bounce >= 3) {
            r.age = Math.max(r.age, r.life);
            break;
          }
        }
      }
      alive.push(r);
    }
    this.rays = alive;
    if (this.contacts.length > 40) {
      let cut = 0;
      while (cut < this.contacts.length && this.now - this.contacts[cut].t > 1.9) cut++;
      if (cut) this.contacts.splice(0, cut);
      if (this.contacts.length > 600) this.contacts.splice(0, this.contacts.length - 600);
    }
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
    this.spawnRays(p.x, p.y);
    this.audio.ping();
    this.shake = Math.max(this.shake, 2.4);
    this.flash = 0.85;
    if (!this.pingHintShown) {
      this.pingHintShown = true;
      this.ui.toast('声呐也暴露了你');
    }
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
    this.rays = [];
    this.contacts = [];
    this.audio.death();
    this.ui.dismiss();
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
    const prev = this.progress.best[this.chamberIndex];
    const time = Math.max(0, this.levelTime);
    const isRecord =
      !prev || time < prev.time || (time === prev.time && this.pingsUsed < prev.pings);
    if (isRecord) {
      this.progress.best[this.chamberIndex] = { time, pings: this.pingsUsed };
    }
    this.saveProgress();
    this.ui.dismiss();
    this.ui.showClear({
      chamber: this.chamberIndex,
      time,
      pings: this.pingsUsed,
      best: this.progress.best[this.chamberIndex],
      isRecord,
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
        this.spawnRays(this.player.x, this.player.y);
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
      this.spawnRays(this.player.x, this.player.y);
      if (wave > 0) this.updateRays(wave);
    }
    this.frozen = true;
  }
}
