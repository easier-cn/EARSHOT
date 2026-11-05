import { findPath, nearestOpen } from './pathfind.js';

export function isSolid(grid, w, h, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= w || ty >= h) return true;
  return grid[ty * w + tx] !== 0;
}

/**
 * Axis-separated collision for a square-ish body (radius r) against the tile
 * grid. Returns the resolved position.
 */
export function moveCircle(grid, w, h, tile, x, y, r, dx, dy) {
  let nx = x;
  let ny = y;
  if (dx !== 0) {
    nx = x + dx;
    const minTy = Math.floor((y - r + 0.01) / tile);
    const maxTy = Math.floor((y + r - 0.01) / tile);
    const solidColumn = (tx) => {
      for (let ty = minTy; ty <= maxTy; ty++) if (isSolid(grid, w, h, tx, ty)) return true;
      return false;
    };
    if (dx > 0) {
      const from = Math.floor((x + r - 0.01) / tile);
      const to = Math.floor((nx + r) / tile);
      for (let tx = from; tx <= to; tx++) {
        if (solidColumn(tx)) {
          nx = tx * tile - r - 0.01;
          break;
        }
      }
    } else {
      const from = Math.floor((x - r + 0.01) / tile);
      const to = Math.floor((nx - r) / tile);
      for (let tx = from; tx >= to; tx--) {
        if (solidColumn(tx)) {
          nx = (tx + 1) * tile + r + 0.01;
          break;
        }
      }
    }
  }
  if (dy !== 0) {
    ny = y + dy;
    const minTx = Math.floor((nx - r + 0.01) / tile);
    const maxTx = Math.floor((nx + r - 0.01) / tile);
    const solidRow = (ty) => {
      for (let tx = minTx; tx <= maxTx; tx++) if (isSolid(grid, w, h, tx, ty)) return true;
      return false;
    };
    if (dy > 0) {
      const from = Math.floor((y + r - 0.01) / tile);
      const to = Math.floor((ny + r) / tile);
      for (let ty = from; ty <= to; ty++) {
        if (solidRow(ty)) {
          ny = ty * tile - r - 0.01;
          break;
        }
      }
    } else {
      const from = Math.floor((y - r + 0.01) / tile);
      const to = Math.floor((ny - r) / tile);
      for (let ty = from; ty >= to; ty--) {
        if (solidRow(ty)) {
          ny = (ty + 1) * tile + r + 0.01;
          break;
        }
      }
    }
  }
  return { x: nx, y: ny };
}

export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.r = 9;
    this.vx = 0;
    this.vy = 0;
    this.speed = 0;
    this.moving = false;
    this.face = 0;
    this.stride = 0;
    this.trail = [];
    this.trailT = 0;
    this.stepPhase = 0;
  }

  update(dt, move, { run = false, listen = false, creep = false, creepMul = 0.5, mul = 1 } = {}) {
    const maxSpeed = (creep ? Math.round(92 * creepMul) : listen ? 60 : run ? 152 : 92) * mul;
    const targetX = move.x * maxSpeed;
    const targetY = move.y * maxSpeed;
    const k = 1 - Math.exp(-(move.x || move.y ? 16 : 12) * dt);
    this.vx += (targetX - this.vx) * k;
    this.vy += (targetY - this.vy) * k;
    this.speed = Math.hypot(this.vx, this.vy);
    this.moving = this.speed > 14;
    if (this.moving) this.face = Math.atan2(this.vy, this.vx);
    this.stepPhase += this.speed * dt;
    this.trailT -= dt;
    if (this.trailT <= 0 && this.speed > 20) {
      this.trailT = 0.05;
      this.trail.push({ x: this.x, y: this.y, life: 0.55 });
      if (this.trail.length > 26) this.trail.shift();
    }
    for (let i = this.trail.length - 1; i >= 0; i--) {
      this.trail[i].life -= dt;
      if (this.trail[i].life <= 0) this.trail.splice(i, 1);
    }
    return { x: this.vx * dt, y: this.vy * dt };
  }
}

let hunterId = 0;

export class Hunter {
  constructor(x, y, type = 'hunter', home = null) {
    this.id = hunterId++;
    this.x = x;
    this.y = y;
    this.r = 11;
    this.type = type;
    this.home = home;
    this.route = home && home.route ? home.route : null;
    this.routeIdx = 0;
    this.state = this.route ? 'patrol' : 'idle';
    this.path = [];
    this.searchT = 0;
    this.pending = null;
    this.lastTag = -1;
    this.face = Math.random() * Math.PI * 2;
    this.speed = 0;
    this.stepAcc = 0;
    this.wanderCooldown = Math.random() * 2;
    this.turn = 0;
    this.target = null;
    this.chaseT = 0;
    this.windT = 0;
    this.burstT = 0;
    this.restT = 0;
    this.chargeT = 0;
    this.vx = 0;
    this.vy = 0;
    this.bounces = 0;
    this.cycleT = 0;
    this.pulseDone = false;
    this.pounce = null;
    this.dashT = 0;
  }

  hear(x, y, delay = 0.25) {
    this.pending = { x, y, t: delay };
  }

  _retarget(game, x, y) {
    const far = !this.target || Math.hypot(this.target.x - x, this.target.y - y) > 22;
    if (this.path.length && !far) return;
    this.target = { x, y };
    this._plan(game, x, y);
  }

  _plan(game, x, y) {
    const L = game.level;
    const sx = Math.floor(this.x / L.tile);
    const sy = Math.floor(this.y / L.tile);
    let tx = Math.floor(x / L.tile);
    let ty = Math.floor(y / L.tile);
    if (isSolid(L.grid, L.w, L.h, tx, ty)) {
      const open = nearestOpen(L.grid, L.w, L.h, tx * L.tile, ty * L.tile);
      tx = Math.floor(open.x / L.tile);
      ty = Math.floor(open.y / L.tile);
    }
    const path = findPath(L.grid, L.w, L.h, sx, sy, tx, ty);
    if (path && path.length) {
      this.path = path.map((p) => ({ x: (p.x + 0.5) * L.tile, y: (p.y + 0.5) * L.tile }));
      return true;
    }
    return false;
  }

  _walk(dt, game, speed) {
    const L = game.level;
    let tx = this.x;
    let ty = this.y;
    while (this.path.length && Math.hypot(this.path[0].x - this.x, this.path[0].y - this.y) < 9) this.path.shift();
    const arrived = this.path.length === 0;
    if (!arrived) {
      tx = this.path[0].x;
      ty = this.path[0].y;
    }
    let dx = 0;
    let dy = 0;
    if (!arrived) {
      const d = Math.hypot(tx - this.x, ty - this.y) || 1;
      dx = ((tx - this.x) / d) * speed;
      dy = ((ty - this.y) / d) * speed;
      this.face = Math.atan2(dy, dx);
    }
    this.speed = Math.hypot(dx, dy);
    const step = moveCircle(L.grid, L.w, L.h, L.tile, this.x, this.y, this.r, dx * dt, dy * dt);
    this.x = step.x;
    this.y = step.y;
    this._footsteps(dt, game);
    return arrived;
  }

  _footsteps(dt, game) {
    if (this.speed <= 5) return;
    this.stepAcc += this.speed * dt;
    if (this.stepAcc < 58) return;
    this.stepAcc = 0;
    const rel = this.x - game.player.x;
    const d = Math.hypot(rel, this.y - game.player.y);
    if (d < 620) game.audio.hunterStep(Math.max(-1, Math.min(1, rel / 380)), Math.min(1, 1.15 - d / 640));
    game.stepEcho?.(this.x, this.y, this.type === 'butcher' ? '255, 90, 60' : '255, 70, 70', { tagged: false });
  }

  _burst(game, tint = '255, 110, 90', count = 12) {
    game.stepEcho?.(this.x, this.y, tint, { count, speed: 300, life: 0.45, tagged: false });
  }

  update(dt, game) {
    const speed = game.hunterSpeed ? game.hunterSpeed() : 126;
    if (this.pending) {
      this.pending.t -= dt;
      if (this.pending.t <= 0) {
        const s = this.pending;
        this.pending = null;
        this.target = { x: s.x, y: s.y };
        this.chaseT = 0;
        this._plan(game, s.x, s.y);
        if (this.type === 'patroller') this.state = 'chase';
        else if (this.type === 'stalker') {
          if (this.state !== 'windup' && this.state !== 'charge') this.state = 'chase';
        } else if (this.type === 'hunter') this.state = 'investigate';
      }
    }

    if (this.type === 'patroller') return this._patrol(dt, game, speed);
    if (this.type === 'stalker') return this._stalker(dt, game, speed);
    if (this.type === 'butcher') return this._butcher(dt, game, speed);

    const arrived = this._walk(dt, game, speed);
    if (arrived && this.state === 'investigate') this.state = 'idle';
  }

  _patrol(dt, game, speed) {
    if (this.state === 'chase') {
      this.chaseT += dt;
      const arrived = this._walk(dt, game, speed * 1.05);
      if (arrived || this.chaseT > 9) {
        this._returnHome(game);
      }
      return;
    }
    if (this.state === 'return' && this.path.length === 0) this._returnHome(game);
    if (!this.path.length) {
      if (!this.route || !this.route.length) return;
      const wp = this.route[this.routeIdx % this.route.length];
      this.routeIdx = (this.routeIdx + 1) % this.route.length;
      this._plan(game, wp.x, wp.y);
    }
    this._walk(dt, game, speed * 0.72);
  }

  _returnHome(game) {
    const route = this.route;
    if (!route) return;
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < route.length; i++) {
      const d = Math.hypot(route[i].x - this.x, route[i].y - this.y);
      if (d < bd) { bd = d; best = i; }
    }
    this.routeIdx = (best + 1) % route.length;
    this._plan(game, route[best].x, route[best].y);
    this.state = 'patrol';
  }

  _stalker(dt, game, speed) {
    if (this.state === 'windup') {
      this.windT -= dt;
      this.burstT -= dt;
      if (this.burstT <= 0) { this.burstT = 0.17; this._burst(game, '255, 120, 90', 10); }
      if (this.windT <= 0) {
        const tx = this.target ? this.target.x : this.x;
        const ty = this.target ? this.target.y : this.y;
        const d = Math.hypot(tx - this.x, ty - this.y) || 1;
        this.vx = ((tx - this.x) / d) * 560;
        this.vy = ((ty - this.y) / d) * 560;
        this.chargeT = 0.95;
        this.bounces = 0;
        this.state = 'charge';
      }
      return;
    }
    if (this.state === 'charge') {
      this.chargeT -= dt;
      this.burstT -= dt;
      if (this.burstT <= 0) { this.burstT = 0.12; this._burst(game, '255, 110, 80', 8); }
      const L = game.level;
      const wantX = this.vx * dt;
      const wantY = this.vy * dt;
      const step = moveCircle(L.grid, L.w, L.h, L.tile, this.x, this.y, this.r, wantX, wantY);
      const blockedX = Math.abs((step.x - this.x) - wantX) > 0.6;
      const blockedY = Math.abs((step.y - this.y) - wantY) > 0.6;
      this.x = step.x;
      this.y = step.y;
      if (blockedX) { this.vx = -this.vx; this.bounces += 1; }
      if (blockedY) { this.vy = -this.vy; this.bounces += 1; }
      this.speed = Math.hypot(this.vx, this.vy);
      if (this.bounces >= 2 || this.chargeT <= 0) {
        this.state = 'rest';
        this.restT = 1.3;
      }
      return;
    }
    if (this.state === 'rest') {
      this.restT -= dt;
      if (this.restT <= 0) this.state = this.target ? 'chase' : 'idle';
      return;
    }
    if (this.state === 'chase') {
      const arrived = this._walk(dt, game, speed * 1.15);
      const near = this.target && Math.hypot(this.target.x - this.x, this.target.y - this.y) < 130;
      if (arrived || near) {
        this.state = 'windup';
        this.windT = 1.05;
        this.burstT = 0;
      }
    }
  }

  _butcher(dt, game, speed) {
    if (this.pounce) {
      this.dashT -= dt;
      if (this.dashT <= 0) { this.pounce = null; this.cycleT = 0; this.pulseDone = false; return; }
      const tx = this.pounce.x;
      const ty = this.pounce.y;
      const d = Math.hypot(tx - this.x, ty - this.y) || 1;
      const step = moveCircle(game.level.grid, game.level.w, game.level.h, game.level.tile, this.x, this.y, this.r, ((tx - this.x) / d) * 640 * dt, ((ty - this.y) / d) * 640 * dt);
      this.x = step.x;
      this.y = step.y;
      this.speed = 640;
      this._footsteps(dt, game);
      return;
    }
    this.cycleT += dt;
    const phase = this.cycleT % 4;
    if (phase >= 2) {
      this.burstT -= dt;
      if (this.burstT <= 0 && phase < 3.2) { this.burstT = 0.13; this._burst(game, '255, 150, 90', 7); }
      if (!this.pulseDone && phase >= 3.2) {
        this.pulseDone = true;
        game.butcherSweep?.(this.x, this.y, this);
      }
      return;
    }
    this.pulseDone = false;
    if (this.target) this._walk(dt, game, speed * 0.85);
  }
}

let skitterId = 0;

// The hunter listens. The skitter does not. It is deaf, fast and predictable:
// the only way to know where it is, is to look -- which costs a ping, and a
// ping can wake a hunter. That trade is the whole point of the thing.
export class Skitter {
  constructor(x, y) {
    this.id = skitterId++;
    this.x = x;
    this.y = y;
    this.r = 8;
    this.path = [];
    this.rest = 0.3 + Math.random() * 1.2;
    this.speed = 0;
    this.tickAcc = Math.random();
    this.face = 0;
    this.wobble = Math.random() * 6;
    this.echoT = 0;
    this.echoCool = 0;
    this.lastTag = -1;
    this.echoKind = null;
    this.echoSrc = null;
    this.revealT = 0;
    this.lure = null;
  }

  /** It is deaf to meaning but not to sound: anything loud enough is repeated
   *  back a beat later, from where the mimic is standing. */
  hear(x, y, kind = 'ping', delay = 1.2) {
    if (this.echoT > 0 || this.echoCool > 0) return false;
    this.echoT = delay + Math.random() * 0.3;
    this.echoKind = kind;
    this.echoSrc = { x, y };
    return true;
  }

  _plan(game) {
    const L = game.level;
    const sx = Math.floor(this.x / L.tile);
    const sy = Math.floor(this.y / L.tile);
    if (this.lure) {
      const tx = Math.floor(this.lure.x / L.tile);
      const ty = Math.floor(this.lure.y / L.tile);
      const path = findPath(L.grid, L.w, L.h, sx, sy, tx, ty);
      this.lure = null;
      if (path && path.length) {
        this.path = path.map((p) => ({
          x: (p.x + 0.5) * L.tile,
          y: (p.y + 0.5) * L.tile,
        }));
        return true;
      }
    }
    for (let tries = 0; tries < 16; tries++) {
      const tx = sx + Math.round((Math.random() * 2 - 1) * 9);
      const ty = sy + Math.round((Math.random() * 2 - 1) * 9);
      if (tx < 1 || ty < 1 || tx >= L.w - 1 || ty >= L.h - 1) continue;
      if (L.grid[ty * L.w + tx] !== 0) continue;
      if (Math.abs(tx - sx) + Math.abs(ty - sy) < 5) continue;
      const path = findPath(L.grid, L.w, L.h, sx, sy, tx, ty);
      if (path && path.length) {
        this.path = path.map((p) => ({
          x: (p.x + 0.5) * L.tile,
          y: (p.y + 0.5) * L.tile,
        }));
        return true;
      }
    }
    this.rest = 0.4;
    return false;
  }

  update(dt, game) {
    const L = game.level;
    this.wobble += dt * 6;
    this.stepAcc = (this.stepAcc || 0);
    if (this.revealT > 0) this.revealT -= dt;
    if (this.echoCool > 0) this.echoCool -= dt;
    if (this.echoT > 0) {
      this.echoT -= dt;
      if (this.echoT <= 0) {
        this.echoT = 0;
        if (game.onEcho) game.onEcho(this, this.echoKind, this.echoSrc);
        this.lure = this.echoSrc;
        this.echoSrc = null;
      }
    }

    if (!this.path.length) {
      this.speed = 0;
      this.rest -= dt;
      if (this.rest <= 0) this._plan(game);
      return;
    }

    const wp = this.path[0];
    if (Math.hypot(wp.x - this.x, wp.y - this.y) < 7) {
      this.path.shift();
      if (!this.path.length) this.rest = 0.35 + Math.random() * 0.9;
      return;
    }

    const SPEED = 118;
    const d = Math.hypot(wp.x - this.x, wp.y - this.y) || 1;
    this.face = Math.atan2(wp.y - this.y, wp.x - this.x);
    const step = moveCircle(
      L.grid,
      L.w,
      L.h,
      L.tile,
      this.x,
      this.y,
      this.r,
      ((wp.x - this.x) / d) * SPEED * dt,
      ((wp.y - this.y) / d) * SPEED * dt,
    );
    this.x = step.x;
    this.y = step.y;
    this.speed = SPEED;

    // neutral things still make sound: a blue thread through the dark
    this.stepAcc += SPEED * dt;
    if (this.stepAcc > 64) {
      this.stepAcc = 0;
      game.stepEcho?.(this.x, this.y, '110, 180, 255', { tagged: false });
    }

    // a dry tick, only audible close by: enough to feel it, not to track it
    this.tickAcc += dt;
    if (this.tickAcc > 0.85) {
      this.tickAcc = 0;
      const dx = this.x - game.player.x;
      const dy = this.y - game.player.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 260 && game.audio) {
        const pan = Math.max(-1, Math.min(1, dx / 300));
        game.audio.skitterTick(pan, Math.max(0, 1 - dist / 300));
      }
    }
  }
}
