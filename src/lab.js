/**
 * 实验室的两种特殊实验体。
 *
 * 实验体 ii 型（LabBrute）是瞎子：它不听声呐，只对"第一个"打到自己的信号
 * 做出反应——原地蓄力一秒，然后朝那个方向以 5.5 倍玩家速度冲撞六秒，撞墙
 * 反弹。冲撞期间它不再接收任何声音。
 *
 * 实验体 iii 型（LabStalker）贴着房间外墙游荡，游荡时完全无声。听到信号后
 * 先跑到离声源最近的那面墙，发出一圈长声呐和尖啸，再以 3.5 倍速度扑向声源，
 * 扑完停顿两秒，退回墙上继续巡逻。
 */
import { moveCircle, isSolid } from './entities.js';
import { findPath, nearestOpen } from './pathfind.js';

const PLAYER_SPEED = 92;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function plan(e, game, x, y) {
  const L = game.level;
  const sx = Math.floor(e.x / L.tile);
  const sy = Math.floor(e.y / L.tile);
  let tx = Math.floor(x / L.tile);
  let ty = Math.floor(y / L.tile);
  if (isSolid(L.grid, L.w, L.h, tx, ty)) {
    const open = nearestOpen(L.grid, L.w, L.h, tx, ty);
    if (!open) return false;
    tx = open.x;
    ty = open.y;
  }
  const path = findPath(L.grid, L.w, L.h, sx, sy, tx, ty);
  if (!path || !path.length) return false;
  e.path = path.map((p) => ({ x: (p.x + 0.5) * L.tile, y: (p.y + 0.5) * L.tile }));
  return true;
}

function walk(e, dt, game, speed) {
  const L = game.level;
  while (e.path.length && Math.hypot(e.path[0].x - e.x, e.path[0].y - e.y) < 9) e.path.shift();
  if (!e.path.length) {
    e.speed = 0;
    return true;
  }
  const t = e.path[0];
  const d = Math.hypot(t.x - e.x, t.y - e.y) || 1;
  const dx = ((t.x - e.x) / d) * speed;
  const dy = ((t.y - e.y) / d) * speed;
  e.face = Math.atan2(dy, dx);
  const res = moveCircle(L.grid, L.w, L.h, L.tile, e.x, e.y, e.r, dx * dt, dy * dt);
  const moved = Math.hypot(res.x - e.x, res.y - e.y);
  e.x = res.x;
  e.y = res.y;
  e.speed = moved / Math.max(dt, 1e-6);
  return false;
}

function roomPoint(e, game, wallOnly = false) {
  const L = game.level;
  const h = e.home;
  for (let i = 0; i < 40; i++) {
    const tx = wallOnly
      ? (Math.random() < 0.5
        ? (Math.random() < 0.5 ? h.tx0 + 1 : h.tx1 - 1)
        : h.tx0 + 1 + Math.floor(Math.random() * Math.max(1, h.tx1 - h.tx0 - 2)))
      : h.tx0 + 1 + Math.floor(Math.random() * Math.max(1, h.tx1 - h.tx0 - 2));
    const ty = wallOnly
      ? (Math.random() < 0.5
        ? h.ty0 + 1
        : h.ty1 - 1)
      : h.ty0 + 1 + Math.floor(Math.random() * Math.max(1, h.ty1 - h.ty0 - 2));
    const x = (tx + 0.5) * L.tile;
    const y = (ty + 0.5) * L.tile;
    if (!isSolid(L.grid, L.w, L.h, tx, ty)) return { x, y, tx, ty };
  }
  return { x: (h.tx0 + 1.5) * L.tile, y: (h.ty0 + 1.5) * L.tile, tx: h.tx0 + 1, ty: h.ty0 + 1 };
}

function inHome(e, x, y) {
  const h = e.home;
  return x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1;
}

/** Closest wall tile around a point, used by the stalker's post-card drift. */
function wallNear(game, x, y) {
  const L = game.level;
  const T = L.tile;
  const px = Math.floor(x / T);
  const py = Math.floor(y / T);
  for (let r = 1; r <= 12; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = px + dx;
        const ty = py + dy;
        if (tx < 1 || ty < 1 || tx >= L.w - 1 || ty >= L.h - 1) continue;
        if (isSolid(L.grid, L.w, L.h, tx, ty)) {
          return { x: (tx + 0.5) * T, y: (ty + 0.5) * T };
        }
      }
    }
  }
  return { x, y };
}

/**
 * 无声猎手的“活动范围”：贴着墙体的地板带。
 *
 * A body with radius needs more than one cell of clearance to turn a 90°
 * corner: the exact 1-cell band breaks into disconnected diagonal pieces at
 * every convex corner. We therefore keep a two-cell band; it still reads as
 * "hugging the wall", but the path can round corners without clipping one.
 * 对 iii 型来说，这一圈之外的地板等同于墙——它只沿着墙根走。
 */
function activityCell(L, tx, ty, home) {
  if (tx < 1 || ty < 1 || tx >= L.w - 1 || ty >= L.h - 1) return false;
  if (home && (tx < home.tx0 || tx > home.tx1 || ty < home.ty0 || ty > home.ty1)) return false;
  if (L.grid[ty * L.w + tx] !== 0) return false;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (!dx && !dy) continue;
      const nx = tx + dx;
      const ny = ty + dy;
      if (nx < 0 || ny < 0 || nx >= L.w || ny >= L.h) continue;
      if (L.grid[ny * L.w + nx] !== 0) return true;
    }
  }
  return false;
}

/**
 * 在“墙根活动范围”内做 BFS，选一个离 (x,y) 最近且可达的格子。
 * `withinHome` 把范围再限制在出生房间内；锁住的卡房守卫始终受此限制。
 */
function planActivity(e, game, x, y, withinHome = false) {
  const L = game.level;
  const T = L.tile;
  const W = L.w;
  const N = W * L.h;
  const home = e.locked || withinHome ? e.home : null;
  const active = (tx, ty) => activityCell(L, tx, ty, home);

  let sx = Math.floor(e.x / T);
  let sy = Math.floor(e.y / T);
  if (!active(sx, sy)) {
    let bx = -1;
    let by = -1;
    let bd = Infinity;
    for (let r = 1; r <= 6 && bx < 0; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const tx = sx + dx;
          const ty = sy + dy;
          if (!active(tx, ty)) continue;
          const d = Math.hypot((tx + 0.5) * T - e.x, (ty + 0.5) * T - e.y);
          if (d < bd) {
            bd = d;
            bx = tx;
            by = ty;
          }
        }
      }
    }
    if (bx < 0) return false;
    sx = bx;
    sy = by;
  }

  const start = sy * W + sx;
  const prev = new Int32Array(N).fill(-1);
  const seen = new Uint8Array(N);
  const queue = new Int32Array(N);
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  seen[start] = 1;
  let best = start;
  let bestD = Math.hypot((sx + 0.5) * T - x, (sy + 0.5) * T - y);

  while (head < tail) {
    const i = queue[head++];
    const tx = i % W;
    const ty = (i / W) | 0;
    const d = Math.hypot((tx + 0.5) * T - x, (ty + 0.5) * T - y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = tx + dx;
      const ny = ty + dy;
      if (!active(nx, ny)) continue;
      const ni = ny * W + nx;
      if (seen[ni]) continue;
      seen[ni] = 1;
      prev[ni] = i;
      queue[tail++] = ni;
    }
  }

  const pts = [];
  for (let i = best; i !== -1; i = prev[i]) {
    pts.push({ x: ((i % W) + 0.5) * T, y: (((i / W) | 0) + 0.5) * T });
    if (i === start) break;
  }
  pts.reverse();
  if (!pts.length) return false;
  e.path = pts;
  e.wall = { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y };
  return true;
}

/** 实验体 ii 型：蓄力、冲撞、反弹。 */
export class LabBrute {
  constructor(x, y, home, { guardCard = -1, locked = false } = {}) {
    this.type = 'lab2';
    this.x = x;
    this.y = y;
    this.r = 16;
    this.home = home;
    this.guardCard = guardCard;
    this.locked = locked;
    this.state = 'wander';
    this.path = [];
    this.target = null;
    this.wanderT = 0.5;
    this.autoT = 0;
    this.wasSneak = false;
    this.windT = 0;
    this.chargeT = 0;
    this.restT = 0;
    this.vx = 0;
    this.vy = 0;
    this.speed = 0;
    this.face = 0;
    this.alertT = 0;
    this.boostT = 0;
    this.emitT = 0;
    this.trailT = 0;
    this.stepT = 0;
    this.hitWall = 0;
  }

  hear(x, y) {
    if (this.locked && !inHome(this, x, y)) return;
    if (this.state === 'windup' || this.state === 'charge' || this.state === 'rest') return;
    this.alertT = 4;
    this.state = 'windup';
    this.windT = 1;
    this.target = { x, y };
    this.path = [];
    this.speed = 0;
  }

  update(dt, game) {
    this.boostT = Math.max(0, this.boostT - dt);
    this.alertT = Math.max(0, this.alertT - dt);
    const mul = this.boostT > 0 ? 2 : 1;
    const L = game.level;
    this.emitT -= dt;
    this.trailT -= dt;
    this.stepT -= dt;

    if (this.state === 'wander') {
      // Once its card is taken, a card-room guard follows the player while
      // the player is noisy. Sneaking breaks the trail and sends it wandering.
      if (this.guardCard >= 0 && !this.locked && game.player && this.alertT <= 0) {
        this.autoT -= dt;
        if (game.sneak) {
          if (!this.wasSneak) {
            this.path = [];
            this.autoT = 0;
          }
        } else if (this.autoT <= 0) {
          this.autoT = 1.6;
          plan(this, game, game.player.x, game.player.y);
          this.wanderT = 2;
        }
        this.wasSneak = game.sneak;
      }
      this.wanderT -= dt;
      if (!this.path.length || this.wanderT <= 0) {
        this.wanderT = 2.4 + Math.random() * 2;
        const p = roomPoint(this, game);
        plan(this, game, p.x, p.y);
      }
      walk(this, dt, game, PLAYER_SPEED * 0.5 * mul);
      if (this.speed > 8 && this.stepT <= 0) {
        this.stepT = 0.55;
        game.spawnRays(this.x, this.y, {
          count: 6,
          speed: 95,
          life: 0.5,
          tint: '255,170,90',
          tag: null,
          kind: 'brute-step',
        });
      }
      return;
    }

    if (this.state === 'windup') {
      this.windT -= dt;
      this.speed = 0;
      if (this.emitT <= 0) {
        this.emitT = 0.1;
        game.spawnRays(this.x, this.y, { count: 10, speed: 240, life: 0.26, tint: '255,170,90', tag: null, kind: 'brute', even: true });
      }
      if (this.windT <= 0) {
        const dx = this.target.x - this.x;
        const dy = this.target.y - this.y;
        const d = Math.hypot(dx, dy) || 1;
        this.vx = dx / d;
        this.vy = dy / d;
        this.state = 'charge';
        this.chargeT = 6;
        game.audio?.bruteCharge?.(0, 1);
      }
      return;
    }

    if (this.state === 'charge') {
      this.chargeT -= dt;
      const sp = PLAYER_SPEED * 5.5 * mul;
      const bx = this.x;
      const by = this.y;
      const res = moveCircle(L.grid, L.w, L.h, L.tile, this.x, this.y, this.r, this.vx * sp * dt, this.vy * sp * dt);
      let hit = false;
      const wantX = this.vx * sp * dt;
      const wantY = this.vy * sp * dt;
      if (Math.abs(this.vx) > 0.05 && Math.abs(res.x - bx) < Math.abs(wantX) * 0.45) {
        this.vx = -this.vx;
        hit = true;
      }
      if (Math.abs(this.vy) > 0.05 && Math.abs(res.y - by) < Math.abs(wantY) * 0.45) {
        this.vy = -this.vy;
        hit = true;
      }
      this.x = res.x;
      this.y = res.y;
      this.face = Math.atan2(this.vy, this.vx);
      this.speed = sp;
      // 守卫在拿到卡之前不会冲出卡房；撞到门框就反弹。
      if (this.locked) {
        const h = this.home;
        if (this.x < h.x0 + this.r || this.x > h.x1 - this.r) {
          this.x = clamp(this.x, h.x0 + this.r, h.x1 - this.r);
          this.vx = -this.vx;
          hit = true;
        }
        if (this.y < h.y0 + this.r || this.y > h.y1 - this.r) {
          this.y = clamp(this.y, h.y0 + this.r, h.y1 - this.r);
          this.vy = -this.vy;
          hit = true;
        }
      }
      if (hit) {
        this.hitWall = 0.25;
        game.tryBreakDishAt?.(this.x, this.y, this.r + 6);
      }
      if (this.trailT <= 0) {
        this.trailT = 0.055;
        game.spawnRays(this.x, this.y, { count: 10, speed: 210, life: 0.22, tint: '255,140,80', tag: null, kind: 'brute', even: true });
      }
      game.tryBreakDishAt?.(this.x, this.y, this.r + 4);
      if (this.chargeT <= 0) {
        this.state = 'rest';
        this.restT = 1.4;
        this.speed = 0;
        this.vx = 0;
        this.vy = 0;
      }
      return;
    }

    if (this.state === 'rest') {
      this.restT -= dt;
      this.speed = 0;
      if (this.restT <= 0) {
        this.state = 'wander';
        this.wanderT = 0;
      }
    }
  }
}

/** 实验体 iii 型：贴墙的无声猎手。 */
export class LabStalker {
  constructor(x, y, home, { guardCard = -1, locked = false } = {}) {
    this.type = 'lab3';
    this.x = x;
    this.y = y;
    this.r = 9;
    this.home = home;
    this.guardCard = guardCard;
    this.locked = locked;
    this.state = 'wander';
    this.path = [];
    this.target = null;
    this.wall = null;
    this.wanderT = 0.4;
    this.autoT = 0;
    this.wasSneak = false;
    this.huntT = 0;
    this.pauseT = 0;
    this.windT = 0;
    this.speed = 0;
    this.face = 0;
    this.alertT = 0;
    this.boostT = 0;
    this.emitT = 0;
    this.screeched = false;
  }

  hear(x, y) {
    if (this.locked && !inHome(this, x, y)) return;
    if (this.state === 'windup' || this.state === 'hunt' || this.state === 'pause') return;
    this.alertT = 5;
    this.target = { x, y };
    this.wall = null;
    this.state = 'approach';
    this.screeched = false;
    this.path = [];
    this._needPath = true;
  }

  _nearestWallPoint(x, y) {
    const h = this.home;
    const tile = this.tile || 32;
    const tx = clamp(Math.floor(x / tile), h.tx0 + 1, h.tx1 - 1);
    const ty = clamp(Math.floor(y / tile), h.ty0 + 1, h.ty1 - 1);
    const cands = [
      { tx, ty: h.ty0 + 1 },
      { tx, ty: h.ty1 - 1 },
      { tx: h.tx0 + 1, ty },
      { tx: h.tx1 - 1, ty },
    ];
    let best = cands[0];
    let bd = Infinity;
    for (const c of cands) {
      const d = Math.hypot((c.tx + 0.5) * tile - x, (c.ty + 0.5) * tile - y);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return { x: (best.tx + 0.5) * tile, y: (best.ty + 0.5) * tile };
  }

  update(dt, game) {
    this.boostT = Math.max(0, this.boostT - dt);
    this.alertT = Math.max(0, this.alertT - dt);
    const mul = this.boostT > 0 ? 2 : 1;
    this.emitT -= dt;

    if (this.state === 'wander') {
      if (this.guardCard >= 0 && !this.locked && game.player && this.alertT <= 0) {
        this.autoT -= dt;
        if (game.sneak) {
          if (!this.wasSneak) {
            this.path = [];
            this.autoT = 0;
          }
        } else if (this.autoT <= 0) {
          this.autoT = 1.6;
          if (!planActivity(this, game, game.player.x, game.player.y)) {
            const p = wallNear(game, game.player.x, game.player.y);
            plan(this, game, p.x, p.y);
          }
          this.wanderT = 2;
        }
        this.wasSneak = game.sneak;
      }
      this.wanderT -= dt;
      if (!this.path.length || this.wanderT <= 0) {
        this.wanderT = 2 + Math.random() * 1.6;
        const p = roomPoint(this, game, true);
        if (!planActivity(this, game, p.x, p.y, true)) plan(this, game, p.x, p.y);
      }
      walk(this, dt, game, PLAYER_SPEED * 0.5 * mul);
      return;
    }

    if (this.state === 'approach') {
      if (this._needPath) {
        this._needPath = false;
        const tx = this.target ? this.target.x : this.x;
        const ty = this.target ? this.target.y : this.y;
        if (!planActivity(this, game, tx, ty)) {
          this.wall = this._nearestWallPoint(tx, ty);
          plan(this, game, this.wall.x, this.wall.y);
        }
      }
      const arrived = walk(this, dt, game, PLAYER_SPEED * 2.5 * mul);
      if (arrived) {
        this.state = 'windup';
        this.windT = 2;
        this.speed = 0;
        this.emitT = 0;
        this.wall = { x: this.x, y: this.y };
      }
      return;
    }

    if (this.state === 'windup') {
      this.windT -= dt;
      this.speed = 0;
      if (this.emitT <= 0) {
        this.emitT = 0.1;
        game.spawnRays(this.x, this.y, {
          count: 10,
          speed: 230,
          life: 0.22,
          tint: '190,255,210',
          tag: null,
          kind: 'stalker',
          even: true,
        });
      }
      if (this.windT <= 0) {
        this.state = 'hunt';
        this.huntT = 2.2;
        this.screeched = true;
        game.audio?.screech?.(0, 1);
        game.spawnRays(this.x, this.y, {
          count: 40,
          speed: 250,
          life: 1.1,
          tint: '190,255,210',
          tag: null,
          kind: 'screech',
        });
        this.huntPath = true;
      }
      return;
    }

    if (this.state === 'hunt') {
      if (this.huntPath) {
        plan(this, game, this.target ? this.target.x : this.x, this.target ? this.target.y : this.y);
        this.huntPath = false;
      }
      this.huntT -= dt;
      const arrived = walk(this, dt, game, PLAYER_SPEED * 3.5 * mul);
      if (this.emitT <= 0) {
        this.emitT = 0.07;
        game.spawnRays(this.x, this.y, { count: 10, speed: 260, life: 0.2, tint: '170,255,220', tag: null, kind: 'stalker', even: true });
      }
      if (arrived || this.huntT <= 0) {
        this.state = 'pause';
        this.pauseT = 2;
        this.speed = 0;
      }
      return;
    }

    if (this.state === 'pause') {
      this.pauseT -= dt;
      this.speed = 0;
      if (this.pauseT <= 0) {
        this.state = 'return';
        this._needPath = true;
      }
      return;
    }

    if (this.state === 'return') {
      if (this._needPath) {
        this._needPath = false;
        if (this.wall && !planActivity(this, game, this.wall.x, this.wall.y)) {
          plan(this, game, this.wall.x, this.wall.y);
        }
      }
      const arrived = walk(this, dt, game, PLAYER_SPEED * 2.5 * mul);
      this.speed = Math.min(this.speed, PLAYER_SPEED * 2.5);
      if (arrived) {
        this.state = 'wander';
        this.wanderT = 0.4;
        this.path = [];
      }
    }
  }
}
