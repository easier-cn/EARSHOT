import { generateLevel, generateWorld, sectorOf, TILE } from './levelgen.js';
import { lineOfSight } from './pathfind.js';
import { clamp, dist, dist2, echoPan } from './util.js';
import { Player, Hunter, Skitter, moveCircle, isSolid } from './entities.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { UI } from './ui.js';
import { Editor } from './editor.js';
import { CHAMBERS } from './chambers.js';
import { generateFloor } from './rooms.js';
import { CHARMS, ITEMS, Inventory, HOTKEY_ORDER } from './loot.js';
import { CHARM_TEXT, ITEM_TEXT, charmText } from './desc.js';

const SAVE_KEY = 'hush.save.v1';
const FLOORS = 5;
const PING_MAX = 3;
const PING_REGEN = 2.4;
const PING_SPEED = 720;
const PING_LIFE = 0.9;
const WAVE_LISTEN = 620;
const THROUGH_WALL = 0.6;
const SHARD_ECHO_RANGE = 1150;
const SHARD_ECHO_SPEED = 1500;
const SOUND_SPEED = 560;
const STEP_RANGE = 215;
const SHARD_NOISE = 330;
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
    this.floorMode = false;
    this.depth = 1;
    this.runSeed = 0;
    this.hasKey = false;
    this.diamonds = 0;
    this.gold = 0;
    this.charms = [];
    this.inv = new Inventory();
    this.loot = [];
    this.guides = {};
    this.throws = [];
    this.activeItem = null;
    this.speedT = 0;
    this.speedMul = 1;
    this.invulnT = 0;
    this.stressCharges = 0;
    this.starKills = 0;
    this.counterReady = false;
    this.rewindUsed = false;
    this.denyCooldown = 0;
    this.alertCd = 0;
    this.titlePingTimer = 0;

    this.msx = 0;
    this.msy = 0;
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.msx = e.clientX - r.left;
      this.msy = e.clientY - r.top;
    });
    this.ui.build();
    this.editor = new Editor(this);
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
    this.sounds = [];
    this.flashes = [];
    this.sneak = false;
    this.debugMode = false;
    this.debugFreeze = false;
    this.blind = false;
    this.particles = makeDust(this.level);
    this.camX = this.level.size.w / 2;
    this.camY = this.level.size.h / 2;
    this.titlePingTimer = 0.2;
    this.exitOpen = false;
    this.state = 'title';
  }

  startBest() {
    if (this.state !== 'title') return;
    if (this.startRun()) return;
    if (this.startWorld()) return;
    const idx = clamp((this.progress.unlocked || 1) - 1, 0, CHAMBERS.length - 1);
    this.startChamber(idx);
  }

  /** Roguelike run: five floors, each one a room-graph floor. */
  startRun(seed = (Math.random() * 1e9) | 0) {
    this.guides = {};
    this.rewindUsed = false;
    this.runSeed = seed;
    this.diamonds = 0;
    this.gold = 0;
    this.charms = [];
    this.inv = new Inventory();
    const ok = this.startFloor(1);
    this.maybeGuide('start', '按下空格键以开启');
    return ok;
  }

  /** Killing a hunter pays 2 diamonds and 10 gold. 亡命猎屠 multiplies this. */
  killHunter(h) {
    const i = this.hunters.indexOf(h);
    if (i < 0) return false;
    this.hunters.splice(i, 1);
    const lvl = this.charmLevel ? this.charmLevel('hunt') : 0;
    const mult = lvl ? 2 ** lvl : 1;
    this.diamonds += 2 * mult;
    this.gold += 10 * mult;
    this.flash = 1;
    this.shake = Math.max(this.shake, 5);
    this.audio.shard();
    this.stepEcho(h.x, h.y, '255, 200, 120', { count: 40, speed: 420, life: 0.8 });
    return true;
  }

  startFloor(depth) {
    this.depth = clamp(depth, 1, FLOORS);
    const level = generateFloor(this.runSeed + this.depth * 7919, this.depth - 1);
    this.floorMode = true;
    this.worldMode = false;
    this.customData = null;
    this.audio.unlock();
    this.level = level;
    this.chamberIndex = 0;
    this.player = new Player(level.spawn.x, level.spawn.y);
    const centers = level.rooms
      .filter((r) => r.kind !== 'start')
      .map((r) => {
        const t = r.x + 2 + ((r.w - 4) >> 1);
        const u = r.y + 2 + ((r.h - 4) >> 1);
        return { x: (t + 0.5) * TILE, y: (u + 0.5) * TILE };
      });
    const at = (i) => centers[i % Math.max(1, centers.length)] || { x: level.spawn.x, y: level.spawn.y };
    const route = centers.slice(0, Math.min(4, centers.length));
    const mk = (i, type = 'hunter', home = null) => {
      const c = at(i);
      return new Hunter(c.x, c.y, type, home);
    };
    this.hunters = [];
    if (this.depth >= 5) {
      this.hunters.push(mk(0, 'butcher'), mk(1, 'patroller', { route }), mk(2, 'stalker'), mk(3));
    } else if (this.depth === 4) {
      this.hunters.push(mk(0), mk(1), mk(2, 'patroller', { route }), mk(3, 'stalker'));
    } else if (this.depth === 3) {
      this.hunters.push(mk(0), mk(1), mk(2, 'patroller', { route }));
    } else {
      for (let i = 0; i < this.depth; i++) this.hunters.push(mk(i));
    }
    this.skitters = [];
    this.shards = [{ x: level.key.x, y: level.key.y, key: true, id: 0 }];
    this.loot = (level.loot || []).map((l) => {
      // 绝地求生 only exists for builds that can already cheat death.
      if (l.id === 'survive' && !this.inv.level('stress') && !this.inv.level('counter')) {
        return { ...l, id: 'stone', seenAt: -9 };
      }
      return { ...l, seenAt: -9 };
    });
    this.totalShards = 1;
    this.pings = [];
    this.rays = [];
    this.contacts = [];
    this.echoRings = [];
    this.particles = makeDust(level, 220);
    this.camX = this.player.x;
    this.camY = this.player.y;
    this.charges = START_CHARGES;
    this.chargeTimer = 0;
    this.listenT = 0;
    this.pingsUsed = 0;
    this.levelTime = 0;
    this.collected = 0;
    this.exitOpen = false;
    this.hasKey = false;
    this.diamonds = this.diamonds || 0;
    this.gold = this.gold || 0;
    this.echoRequired = false;
    this.echoHeard = false;
    this.humT = 99;
    this.danger = 0;
    this.shake = 0;
    this.flash = 0;
    this.deathT = 0;
    this.denyCooldown = 0;
    this.sneak = false;
    this.state = 'playing';
    this.throws = [];
    this.activeItem = null;
    this.speedT = 0;
    this.speedMul = 1;
    this.invulnT = 0;
    this.lives = this.maxLives();
    this.starKills = 0;
    this.stressUsed = false;
    this.counterUsed = false;
    this.stoneGranted = false;
    this.stoneLevel = 0;
    this.inv.stones = 0;
    this.refreshStones();
    this.ui.showGame();
    return true;
  }

  /** 1..4 map to hotkeys left-to-right; throwables arm the left mouse button. */
  useHotkey(i) {
    const slot = this.inv.hot[i];
    if (!slot) {
      this.audio.deny();
      return;
    }
    const def = ITEMS[slot.id];
    if (!def) return;
    if (def.kind === 'throw') {
      const id = slot.id;
      this.activeItem = this.activeItem === id ? null : id;
      this.audio.click(0.4);
      return;
    }
    this.useItem(slot.id);
  }

  useItem(id) {
    const p = this.player;
    const take = (n = 1) => {
      const idx = this.inv.pack.findIndex((s) => s && s.id === id && s.n >= n);
      if (idx < 0) return false;
      this.inv.pack[idx].n -= n;
      if (this.inv.pack[idx].n <= 0) this.inv.pack[idx] = null;
      return true;
    };
    if (id === 'vitamin') {
      if (!take()) return this.audio.deny();
      this.speedT = ITEMS.vitamin.dur;
      this.flash = 1;
      this.audio.shard();
    } else if (id === 'star') {
      if (!take()) return this.audio.deny();
      this.invulnT = 3;
      this.starKills = 3;
      this.audio.gateOpen();
      this.flash = 1;
    } else if (id === 'totem') {
      if (!take()) return this.audio.deny();
      this.stressCharges += 1;
      this.audio.gateOpen();
    } else if (id === 'scanner') {
      if (!take()) return this.audio.deny();
      this.scanT = 6;
      this.audio.ping();
    }
  }

  throwStone() {
    const lvl = this.inv.level('stone');
    if (!lvl || this.inv.stones <= 0) return;
    this.inv.stones -= 1;
    this.throwItem(lvl >= CHARMS.stone.sharp ? 'sharpStone' : 'pebbles', { free: true, noise: CHARMS.stone.noise[lvl - 1] });
  }

  tryPing() {
    if (this.charges < 1) {
      this.audio.deny();
      return;
    }
    this.firePing();
  }

  throwItem(id, opts = {}) {
    const p = this.player;
    const r = this.renderer;
    const wx = this.camX + (this.msx - r.cw / 2) / r.scale;
    const wy = this.camY + (this.msy - r.ch / 2) / r.scale;
    const a = Math.atan2(wy - p.y, wx - p.x);
    const def = ITEMS[id];
    const speed = id === 'bugspray' ? 190 : 420;
    this.throws.push({
      x: p.x, y: p.y, trail: [],
      dx: Math.cos(a), dy: Math.sin(a),
      speed, life: 1.6, id,
      kills: !!def.kills, noise: def.noise || 1,
    });
    if (opts.noise) this.throws[this.throws.length - 1].noise = opts.noise;
    if (!opts.free) this.inv.consume(id);
    const still = this.inv.pack.some((sl) => sl && sl.kind === 'item' && sl.id === id);
    if (!still) this.activeItem = null;
  }

  updateThrows(dt) {
    for (let i = this.throws.length - 1; i >= 0; i--) {
      const t = this.throws[i];
      t.life -= dt;
      const step = t.speed * dt;
      let hitWall = false;
      for (let m = 0; m < step; m += 6) {
        const nx = t.x + t.dx * 6;
        const ny = t.y + t.dy * 6;
        const tx = Math.floor(nx / TILE);
        const ty = Math.floor(ny / TILE);
        if (tx < 0 || ty < 0 || tx >= this.level.w || ty >= this.level.h || this.level.grid[ty * this.level.w + tx]) {
          hitWall = true;
          break;
        }
        t.x = nx;
        t.y = ny;
        if (!t.trail || t.trail.length === 0 || dist2(t.trail[t.trail.length - 1].x, t.trail[t.trail.length - 1].y, nx, ny) > 9) {
          t.trail.push({ x: nx, y: ny });
          if (t.trail.length > 16) t.trail.shift();
        }
        for (const h of this.hunters) {
          if (dist(t.x, t.y, h.x, h.y) < 15) {
            if (t.kills) this.killHunter(h);
            hitWall = true;
            break;
          }
        }
        if (hitWall) break;
      }
      if (hitWall || t.life <= 0) {
        this.stepEcho(t.x, t.y, null, { count: 30, speed: 380, life: 0.7 * (t.noise || 1), tagged: false });
        for (const h of this.hunters) {
          if (dist(t.x, t.y, h.x, h.y) < 620) this.alertHunter(h, t.x, t.y, 0.1);
        }
        this.audio.noise({ dur: 0.22, gain: 0.06, type: 'bandpass', freq: 900, send: 0.5 });
        this.throws.splice(i, 1);
      }
    }
  }

  maxLives() {
    const lvl = this.inv.level('survive');
    return 1 + (lvl ? CHARMS.survive.extraLives[lvl - 1] : 0);
  }

  /** Everything that can hurt you comes through here: charms get a say first. */
  hurt(source) {
    if (this.state !== 'playing') return;
    if (this.debugInvincible || this.invulnT > 0) return;
    if (this.starKills > 0) {
      if (source && source.x != null) this.killHunter(source);
      this.invulnT = Math.max(this.invulnT, 0.6);
      return;
    }
    if (this.inv.level('stress') > 0 && !this.stressUsed) {
      this.stressUsed = true;
      this.enterStress();
      return;
    }
    if (this.inv.level('counter') > 0 && !this.counterUsed) {
      this.counterUsed = true;
      if (source && source.x != null) this.killHunter(source);
      this.invulnT = CHARMS.counter.window;
      this.flash = 1;
      this.audio.gateOpen();
      return;
    }
    this.lives -= 1;
    if (this.lives > 0) {
      this.invulnT = 1.4;
      this.flash = 1;
      this.shake = Math.max(this.shake, 9);
      this.audio.alert(0);
      // a new life re-arms the once-per-life charms, whatever is socketed now
      this.stressUsed = false;
      this.counterUsed = false;
      return;
    }
    // 时间逆流: the first lethal hit of a run is always forgiven.
    const rw = this.inv.level('rewind');
    if (rw) {
      const chance = CHARMS.rewind.chance[rw - 1];
      const forced = !this.rewindUsed;
      this.rewindUsed = true;
      if (forced || Math.random() < chance) {
        this.startFloor(this.depth);
        this.flash = 1;
        this.audio.gateOpen();
        return;
      }
    }
    this.die();
  }

  enterStress() {
    this.invulnT = CHARMS.stress.invuln;
    this.speedT = CHARMS.stress.invuln;
    this.flash = 1;
    this.shake = Math.max(this.shake, 8);
    this.audio.gateOpen();
    this.stepEcho(this.player.x, this.player.y, '255, 210, 120', { count: 48, speed: 520, life: 1.2, tagged: false });
  }

  /**
   * Stones are a per-floor pool. Equipping twice must not refill the quiver,
   * but a level-up hands over the difference (3 -> 5 -> 7 is +2 each time).
   */
  /** Every floor makes the same bodies a little faster. */
  hunterSpeed() {
    const depth = this.floorMode ? this.depth : 1;
    return 126 * (1 + 0.07 * (depth - 1));
  }

  /** The butcher's long sweep: a burst of long sound lines that reveal and share a target. */
  butcherSweep(x, y, owner) {
    owner.sweepHit = false;
    this.spawnRays(x, y, { count: 64, speed: 560, life: 1.05, tint: '255, 140, 80', tag: null, sweep: owner });
    this.audio.echo(clamp((x - this.player.x) / 480, -1, 1), 'ping');
    this.flash = Math.max(this.flash, 0.3);
  }

  /** A sweep line touching the player starts the pounce; touching a hunter shares the target. */
  sweepCheck(r, nx, ny) {
    const o = r.sweep;
    const p = this.player;
    if (!o || !p) return;
    if (!o.sweepHit && dist2(nx, ny, p.x, p.y) < 18 * 18) {
      o.sweepHit = true;
      o.target = { x: p.x, y: p.y };
      o.pounce = { x: p.x, y: p.y };
      o.dashT = 0.7;
      this.flash = Math.max(this.flash, 1);
      this.shake = Math.max(this.shake, 7);
      this.audio.alert(0);
    }
    if (!o.target) return;
    o.shared = o.shared || new Set();
    for (const h of this.hunters) {
      if (h === o || o.shared.has(h.id)) continue;
      if (dist2(nx, ny, h.x, h.y) < 14 * 14) {
        o.shared.add(h.id);
        h.pending = { x: o.target.x, y: o.target.y, t: 0.15 };
      }
    }
  }

  refreshStones() {
    const lvl = this.inv.level('stone');
    if (lvl < 1) return;
    const quota = CHARMS.stone.stones[lvl - 1];
    if (!this.stoneGranted) {
      this.stoneGranted = true;
      this.stoneLevel = lvl;
      this.inv.stones = quota;
      return;
    }
    if (lvl > this.stoneLevel) {
      const gain = quota - CHARMS.stone.stones[this.stoneLevel - 1];
      this.stoneLevel = lvl;
      this.inv.stones += gain;
    }
  }

  /** Dev/experimental: one continuous map, no chamber select. */
  startWorld(seed = 424242) {
    const level = generateWorld(seed);
    if (!level) return false;
    this.worldSeed = seed;
    this.customData = null;
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
    this.sector = sectorOf(this.player.x, this.player.y, level);
    this.state = 'playing';
    this.ui.showGame();
    return true;
  }

  /** Build mode: play the map the player drew. */
  startCustom(data) {
    this.customData = data;
    this.worldMode = false;
    const w = data.w;
    const h = data.h;
    const grid = Uint8Array.from(data.cells);
    const toWorld = (t) => ({ x: (t.x + 0.5) * TILE, y: (t.y + 0.5) * TILE });
    const level = {
      w, h, tile: TILE, grid,
      size: { w: w * TILE, h: h * TILE },
      rooms: [],
      spawn: toWorld(data.spawn),
      spawnTile: { ...data.spawn },
      exit: toWorld(data.exit),
      exitTile: { ...data.exit },
      shards: data.shards.map((t, i) => ({ ...toWorld(t), tile: { ...t }, id: i })),
      hunters: data.hunters.map((t) => toWorld(t)),
      skitters: data.skitters.map((t) => toWorld(t)),
      seed: 'custom',
    };
    if (!level.shards.length) {
      // A map with nothing to gather is a map with nothing to do.
      level.shards = [{ ...toWorld(data.exit), tile: { ...data.exit }, id: 0 }];
      level.shards[0].x = (data.exit.x + 0.5) * TILE - TILE * 2;
    }
    this.audio.unlock();
    this.worldMode = false;
    this.level = level;
    this.chamberIndex = 0;
    this.totalShards = level.shards.length;
    this.player = new Player(level.spawn.x, level.spawn.y);
    this.hunters = level.hunters.map((hh) => new Hunter(hh.x, hh.y));
    this.skitters = (level.skitters || []).map((s) => new Skitter(s.x, s.y));
    this.shards = level.shards.map((s) => ({ ...s }));
    this.pings = [];
    this.rays = [];
    this.contacts = [];
    this.sounds = [];
    this.echoRings = [];
    this.particles = makeDust(level, 200);
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
    this.sneak = false;
    this.blind = false;
    this.humT = 99;
    this.danger = 0;
    this.shake = 0;
    this.flash = 0;
    this.deathT = 0;
    this.denyCooldown = 0;
    this.sector = 0;
    this.state = 'playing';
    this.ui.showGame();
  }

  openEditor() {
    this.audio.unlock();
    this.state = 'edit';
    this.ui.hideScreens();
    this.ui.hideHUD();
    this.editor.open();
  }

  closeEditor() {
    this.editor.close();
    this.state = 'title';
    this.loadDemo();
    this.ui.showTitle(this.progress);
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
    this.ui.showGame();
  }

  restart() {
    if (this.state !== 'playing' && this.state !== 'dead' && this.state !== 'paused') return;
    if (this.floorMode) {
      this.startRun();
      if (this.state !== 'playing') this.state = 'playing';
      return;
    }
    // Same room, same seed — a retry must not quietly hand you a new map.
    if (this.worldMode) this.startWorld(this.worldSeed ?? 424242);
    else if (this.customData) this.startCustom(this.customData);
    else this.startChamber(this.chamberIndex);
    if (this.state !== 'playing') this.state = 'playing';
  }

  toggleMute() {
    const muted = this.audio.toggleMute();
    this.ui.toast(muted ? 'deny' : 'shard');
    this.ui.syncMute();
    return muted;
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
    if (this.floorMode) {
      if (this.depth < FLOORS) this.startFloor(this.depth + 1);
      else this.victory();
      return;
    }
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
    if (this.input.consume('KeyM')) this.toggleMute();
    if (this.input.consume('Tab')) this.ui.toggleInventory(this);
    for (let i = 0; i < 4; i++) {
      if (this.input.consume(`Digit${HOTKEY_ORDER[i]}`)) this.useHotkey(i);
    }
    if (this.input.consume('Backquote')) {
      this.debugMode = !this.debugMode;
      if (!this.debugMode) this.debugFreeze = false;
      this.ui.toast(this.debugMode ? 'shard' : 'deny');
    }
    if (this.debugMode && this.input.consume('Digit1')) {
      this.debugFreeze = !this.debugFreeze;
      this.ui.toast(this.debugFreeze ? 'deny' : 'shard');
    }
    if (this.state === 'edit' && this.input.consume('Escape')) this.closeEditor();
    else if (this.state === 'playing' && this.input.consume('Escape')) this.pause();
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
    if (this.deathT > 0.75) {
      if (this.worldMode) {
        this.ui.worldLabels = CHAMBERS.map((c) => c.title);
        this.ui.showDead({ sector: this.sector, deepest: this.maxSector ?? 0 });
      } else {
        this.ui.showDead();
      }
    }
  }

  updateIdle(dt) {
    this.updateRays(dt);
    this.updateParticles(dt);
    this.shake = Math.max(0, this.shake - dt * 30);
  }

  update(dt) {
    const p = this.player;
    const L = this.level;
    if (this.debugFreeze && this.debugMode) {
      this.updateRays(0);
      this.updateParticles(dt);
      this.ui.updateHUD({
        chamber: this.chamberLabel,
        shards: this.totalShards - this.shards.length,
        total: this.totalShards,
        charges: this.charges,
        listen: this.listen,
        muted: this.audio.muted,
        danger: this.danger,
      });
      return;
    }
    this.levelTime += dt;

    // Shift is HELD, not toggled: silent and blind while the key is down.
    const sneaking = this.input.down('ShiftLeft') || this.input.down('ShiftRight');
    if (sneaking !== this.sneak) {
      this.sneak = sneaking;
      this.audio.click(0.4);
      if (this.sneak) this.audio.noise({ dur: 0.25, gain: 0.01, type: 'lowpass', freq: 300, send: 0.4 });
    }
    this.blind = false; // sneaking is silence, not blindness: you still see every line
    const creeping = this.sneak;
    const run = false;
    const move = this.debugMove || this.input.moveVector();

    const listen = !this.sneak && (this.debugListen === true || (this.listenT > 0.26 && !p.moving));
    this.listen = listen;
    const swiftLvl = this.inv.level('swift');
    const creepMul = this.sneak && swiftLvl ? CHARMS.swift.creep[swiftLvl - 1] : 0.5;
    if (this.speedT > 0) {
      this.speedT -= dt;
      this.speedMul = 1 + 2;
      if (this.speedT <= 0) this.speedMul = 1;
    }
    const motion = p.update(dt, move, { run, listen, creep: this.sneak, creepMul, mul: this.speedMul });
    const resolved = this.resolve(p, motion.x, motion.y);
    p.x = resolved.x;
    p.y = resolved.y;
    const k = Math.min(1, dt * 7);
    this.camX += (p.x - this.camX) * k;
    this.camY += (p.y - this.camY) * k;

    if (p.moving) this.listenT = 0;
    else this.listenT = Math.min(1, this.listenT + dt);

    // footsteps
    if (p.moving && !this.sneak) {
      if (p.stepPhase > 58) {
        p.stepPhase = 0;
        this.audio.footstep(0, 0.85);
        this.stepEcho(p.x, p.y);
      }
    }

    // 潜行声呐: while creeping the charm draws quiet lines on its own; they are
    // untagged, so no hunter ever learns anything from them.
    if (this.sneak && p.moving && this.inv.level('sneakSonar')) {
      this.sneakAcc = (this.sneakAcc || 0) + dt;
      if (this.sneakAcc > 0.42) {
        this.sneakAcc = 0;
        const lvl = this.inv.level('sneakSonar');
        this.spawnRays(p.x, p.y, {
          count: CHARMS.sneakSonar.directions[lvl - 1],
          speed: 300,
          life: 0.55,
          tag: null,
        });
      }
    } else {
      this.sneakAcc = 0;
    }

    // pinging
    if (this.input.consume('Mouse0')) {
      if (this.activeItem) this.throwItem(this.activeItem);
      else if (this.inv.stones > 0) this.throwStone();
      else this.tryPing();
    }
    if (this.input.consume('Space') || this.input.consume('KeyJ')) this.firePing();


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
        this.stepEcho(p.x, p.y, null, { count: 34, speed: 380, life: 0.7 });
        if (sh.key) this.hasKey = true;
        if (this.shards.length === 0) this.tryOpenExit(true);
      }
    }

    // loot: charms and items sit at the end of side branches
    let near = null;
    let nd = 46 * 46;
    for (const it of this.loot) {
      const d = dist2(p.x, p.y, it.x, it.y);
      if (d < nd) { nd = d; near = it; }
    }
    this.nearLoot = near;
    if (near) {
      const txt = near.kind === 'charm' ? CHARM_TEXT[near.id] : ITEM_TEXT[near.id];
      const r = this.renderer;
      const sx = r.cw / 2 + (near.x - this.camX) * r.scale;
      const sy = r.ch / 2 + (near.y - this.camY) * r.scale - 26;
      this.ui.showTip(txt.name, `${near.kind === 'charm' ? charmText(near.id, 1) : txt.line}

[ F ] 拾取`, sx + 18, sy - 30);
    } else {
      this.ui.hideTip();
    }
    if (near && this.input.consume('KeyF')) {
      const res = near.kind === 'charm'
        ? this.inv.addCharm(near.id)
        : (this.inv.addItem(near.id) ? 'added' : 'full');
      if (res === 'full' || res === 'max') {
        this.audio.deny();
        this.ui.toast('deny');
        this.ui.guide('背包已满：按 Tab 打开背包，把物品拖到外面即可丢弃');
      } else {
        const it = near;
        this.loot.splice(this.loot.indexOf(it), 1);
        this.audio.shard();
        this.flash = 1;
        this.refreshStones();
        this.ui.toast('shard');
        this.stepEcho(p.x, p.y, '255, 205, 110', { count: 26, speed: 360, life: 0.6 });
        this.nearLoot = null;
        this.ui.hideTip();
        this.maybeGuide('bag', '按下 Tab 键打开背包');
        if (it.id === 'stone' || (it.kind === 'item' && ITEMS[it.id] && ITEMS[it.id].kind === 'throw')) {
          this.maybeGuide('throw', '鼠标选择角度以丢出');
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
        if (this.shards.length > 0) this.ui.toast('deny');
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
        this.hurt(h);
        return;
      }
    }

    if (this.worldMode) {
      const sec = sectorOf(p.x, p.y, L);
      if (sec !== this.sector) {
        this.sector = sec;
        this.maxSector = Math.max(this.maxSector ?? 0, sec);
        const cfg = CHAMBERS[sec];
        this.ui.setSector(cfg.num, cfg.title);
        this.audio.setSector(sec);
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
        this.stepEcho(L.exit.x, L.exit.y, '140,240,170', { count: 18, speed: 260, life: 0.9, tagged: false });
      }
    }

    this.updateThrows(dt);
    if (this.invulnT > 0) this.invulnT = Math.max(0, this.invulnT - dt);
    this.audio.update(dt, { danger: this.danger });
    this.updateRays(dt);
    this.updateParticles(dt);
    this.shake = Math.max(0, this.shake - dt * 24);
    this.flash = Math.max(0, this.flash - dt * 3.4);
    this.ui.updateHUD({
      chamber: this.chamberIndex,
      shards: this.shards.length,
      total: this.totalShards || (this.floorMode ? 1 : CHAMBERS[this.chamberIndex].shards),
      depth: this.floorMode ? this.depth : 0,
      charges: this.charges,
      listen,
      muted: this.audio.muted,
      danger: this.danger,
      diamonds: this.diamonds,
      gold: this.gold,
      charms: this.inv.charms.length,
    });
    this.homeMarkers = [];
    const homeLvl = this.inv.level('home');
    if (homeLvl) {
      const r = CHARMS.home.range[homeLvl - 1];
      if (dist(p.x, p.y, L.key.x, L.key.y) < r) this.homeMarkers.push({ x: L.key.x, y: L.key.y, c: '150,220,255', s: 'key' });
      if (dist(p.x, p.y, L.exit.x, L.exit.y) < r) this.homeMarkers.push({ x: L.exit.x, y: L.exit.y, c: '255,205,110', s: 'exit' });
    }
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
    if (withFanfare) this.ui.toast('shard');
    return true;
  }

  alertHunter(h, x, y, delay) {
    this.maybeGuide('sneak', '按下 Shift 潜行');
    const tracking = h.state === 'investigate';
    h.hear(x, y, delay);
    if (tracking || this.alertCd > 0) return;
    this.alertCd = 0.75;
    const pan = clamp((h.x - this.player.x) / 420, -1, 1) * 0.8;
    this.audio.alert(pan);
  }

  maybeGuide(key, text) {
    if (!this.guides) this.guides = {};
    if (this.guides[key]) return;
    this.guides[key] = true;
    this.ui.guide(text);
  }

  resolve(entity, dx, dy) {
    const L = this.level;
    return moveCircle(L.grid, L.w, L.h, L.tile, entity.x, entity.y, entity.r, dx, dy);
  }

  /** Spawn a fan of sonar rays that bounce off walls and leave light trails. */
  /** A sound line touched a body: it now knows the tagged origin of that sound.
   *  Newer tags overwrite older ones; an equal tag changes nothing. */
  onRayTouch(e, tag) {
    if (!e || !tag) return;
    if (e instanceof Hunter) {
      if (tag.t <= (e.lastTag ?? -1)) return;
      e.lastTag = tag.t;
      this.alertHunter(e, tag.x, tag.y, 0.14);
    } else if (e instanceof Skitter) {
      if (tag.t <= (e.lastTag ?? -1)) return;
      e.lastTag = tag.t;
      e.hear(tag.x, tag.y, tag.kind, tag.kind === 'ping' ? 1.05 : 1.35);
    }
  }

  /** Which body a ray touched, if any. */
  /** What a ray is allowed to touch. Colour is knowledge: gold is a shard,
   *  green is the door, red is something that hunts you. */
  hitEntity(x, y) {
    for (const sh of this.shards) {
      if (dist(x, y, sh.x, sh.y) < 13) return { e: sh, kind: 'shard', tint: '255,205,110' };
    }
    const ex = this.level.exit;
    if (dist(x, y, ex.x, ex.y) < 17) return { e: ex, kind: 'exit', tint: '140,240,170' };
    for (const h of this.hunters) {
      if (dist(x, y, h.x, h.y) < 15) return { e: h, kind: 'hunter', tint: '255,58,58', hot: true };
    }
    for (const sk of this.skitters) {
      if (dist(x, y, sk.x, sk.y) < 12) return { e: sk, kind: 'skitter', tint: '255,58,58', hot: true };
    }
    return null;
  }

  /** Every footstep is a small sonar ring. White for you and for hunters,
   *  blue for the mimic, which is neither prey nor predator. */
  // A footstep is a small sonar burst and nothing else: no ring, no centre dot.
  // Only the player's own bursts carry a tag; a hunter's steps are mute.
  stepEcho(x, y, tint = null, opts = {}) {
    const count = opts.count ?? 22;
    const speed = opts.speed ?? 330;
    const life = opts.life ?? 0.58;
    const tag = opts.tagged === false ? null : undefined;
    this.spawnRays(x, y, { count, speed, life, tint, tag, kind: opts.kind || 'step' });
  }

  spawnRays(x, y, { count = RAY_COUNT, speed = RAY_SPEED, life = RAY_LIFE, tint = null, kind = 'ping', tag = undefined, sweep = null } = {}) {
    const stamp = tag === null ? null : tag || { x, y, t: this.now, kind };
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.035;
      this.rays.push({
        x,
        y,
        dx: Math.cos(a),
        dy: Math.sin(a),
        age: 0,
        speed,
        life: life * (0.85 + Math.random() * 0.25),
        bounce: 0,
        hot: false,
        tint,
        tag: stamp,
        sweep,
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
        let move = (r.speed || RAY_SPEED) * dt;
        while (move > 0.001) {
          const d = Math.min(6, move);
          move -= d;
          const nx = r.x + r.dx * d;
          const ny = r.y + r.dy * d;
          // Only tagged (player-made) sound can touch a body. A hunter's own
          // footstep is scenery: it must not collide with the hunter itself.
          const ent = r.tag ? this.hitEntity(nx, ny) : null;
          if (ent) {
            ent.e.seenAt = this.now;
            if (r.tag) this.onRayTouch(ent.e, r.tag);
            r.tint = ent.tint;
            r.hot = !!ent.hot;
            if (ent.hot) {
              r.life += 0.55;
              this.flashes.push({ x: ent.e.x, y: ent.e.y, t: this.now });
            }
            this.contacts.push({ x: r.x, y: r.y, t: this.now, kind: ent.kind });
            const nlen = Math.hypot(r.x - ent.e.x, r.y - ent.e.y) || 1;
            const nxn = (r.x - ent.e.x) / nlen;
            const nyn = (r.y - ent.e.y) / nlen;
            const dot = r.dx * nxn + r.dy * nyn;
            r.dx -= 2 * dot * nxn;
            r.dy -= 2 * dot * nyn;
            r.x += r.dx * 3;
            r.y += r.dy * 3;
            r.bounce++;
            if (r.bounce >= 3) { r.age = Math.max(r.age, r.life); break; }
            continue;
          }
          const hitX = isSolid(L.grid, L.w, L.h, Math.floor(nx / TILE), Math.floor(r.y / TILE));
          const hitY = isSolid(L.grid, L.w, L.h, Math.floor(r.x / TILE), Math.floor(ny / TILE));
          if (hitX) r.dx *= -1;
          if (hitY) r.dy *= -1;
          if (hitX || hitY) {
            r.bounce++;
            this.contacts.push({ x: r.x, y: r.y, t: this.now, tint: r.tint });
          }
          r.x = hitX ? r.x : nx;
          r.y = hitY ? r.y : ny;
          if (r.sweep) this.sweepCheck(r, nx, ny);
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
    if (this.flashes.length) this.flashes = this.flashes.filter((f) => this.now - f.t < 0.55);
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
    const quietLvl = this.inv.level('sleep');
    const quiet = quietLvl && Math.random() < CHARMS.sleep.quiet[quietLvl - 1];
    this.spawnRays(p.x, p.y, quiet ? { tag: null } : {});
    this.audio.ping();
    this.echoShards(p.x, p.y);
    this.shake = Math.max(this.shake, 2.4);
    this.flash = 0.85;
    if (!this.pingHintShown) {
      this.pingHintShown = true;
      this.ui.toast('shard');
    }

  }

  /** The shards are not silent. A pulse reaching them is answered by a bell
   *  whose delay is its distance and whose pan is its bearing — navigation by
   *  ear, never by pointer. */
  echoShards(px, py) {
    const reached = [];
    for (const sh of this.shards) {
      const d = dist(px, py, sh.x, sh.y);
      if (d > SHARD_ECHO_RANGE) continue;
      const delay = d / SHARD_ECHO_SPEED;
      const gain = 0.05 * (1 - d / SHARD_ECHO_RANGE) ** 1.4 + 0.006;
      const pan = echoPan(sh.x - px, sh.y - py);
      this.audio.shardEcho(pan, gain, delay);
      reached.push({ id: sh.id, d: Math.round(d), delay: +delay.toFixed(3) });
    }
    reached.sort((a, b) => a.d - b.d);
    this.lastShardEchoes = reached.slice(0, 4);
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
    if (this.floorMode) {
      this.audio.gateOpen();
      this.state = 'complete';
      if (this.depth < FLOORS) {
        this.ui.dismiss();
        this.ui.showFloorClear({ depth: this.depth, max: FLOORS, time: this.levelTime, open: true });
      } else {
        this.progress.floorCleared = (this.progress.floorCleared || 0) + 1;
        this.progress.bestRun = this.progress.bestRun || null;
        const t = this.levelTime;
        if (!this.progress.bestRun || t < this.progress.bestRun) this.progress.bestRun = t;
        this.saveProgress();
        this.state = 'victory';
        this.ui.dismiss();
        this.ui.showRunVictory({ time: t, best: this.progress.bestRun, depth: FLOORS });
      }
      return;
    }
    if (this.worldMode) {
      const time = Math.max(0, this.levelTime);
      const prev = this.progress.worldBest;
      const isRecord = !prev || time < prev.time;
      if (isRecord) this.progress.worldBest = { time, pings: this.pingsUsed };
      this.progress.worldCleared = true;
      this.saveProgress();
      this.state = 'victory';
      this.audio.clear();
      this.ui.dismiss();
      this.ui.showWorldVictory({
        time,
        pings: this.pingsUsed,
        best: this.progress.worldBest,
        isRecord,
        shards: this.collected,
      });
      return;
    }
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
    if (!this.player || !this.level) return;
    this.debugMove = opts.move || null;
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
    this.debugMove = null;
    this.frozen = true;
  }
}
