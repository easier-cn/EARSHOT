import { findPath } from './pathfind.js';

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

  update(dt, move, { run = false, listen = false, creep = false } = {}) {
    const maxSpeed = creep ? 52 : listen ? 60 : run ? 152 : 92;
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
  constructor(x, y) {
    this.id = hunterId++;
    this.x = x;
    this.y = y;
    this.r = 11;
    this.state = 'idle';
    this.path = [];
    this.searchT = 0;
    this.pending = null;
    this.lastTag = -1;
    this.face = Math.random() * Math.PI * 2;
    this.speed = 0;
    this.stepAcc = 0;
    this.wanderCooldown = Math.random() * 2;
    this.turn = 0;
  }

  hear(x, y, delay = 0.25) {
    this.pending = { x, y, t: delay };
  }

  _plan(game, x, y) {
    const L = game.level;
    const sx = Math.floor(this.x / L.tile);
    const sy = Math.floor(this.y / L.tile);
    const tx = Math.floor(x / L.tile);
    const ty = Math.floor(y / L.tile);
    const path = findPath(L.grid, L.w, L.h, sx, sy, tx, ty);
    if (path && path.length) {
      this.path = path.map((p) => ({
        x: (p.x + 0.5) * L.tile,
        y: (p.y + 0.5) * L.tile,
      }));
      return true;
    }
    return false;
  }

  // A hunter has no will of its own. It stands still until a sound front
  // touches it, walks to exactly that point, and stops again.
  update(dt, game) {
    const L = game.level;

    if (this.pending) {
      this.pending.t -= dt;
      if (this.pending.t <= 0) {
        const sound = this.pending;
        this.pending = null;
        this.state = 'investigate';
        this._plan(game, sound.x, sound.y);
        if (!this.path.length) this.state = 'idle';
      }
    }

    let tx = this.x;
    let ty = this.y;
    let arrived = this.path.length === 0;
    if (this.path.length) {
      const wp = this.path[0];
      tx = wp.x;
      ty = wp.y;
      if (Math.hypot(wp.x - this.x, wp.y - this.y) < 7) {
        this.path.shift();
        if (!this.path.length) arrived = true;
      }
    }

    const speed = 126;
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

    if (arrived && this.state === 'investigate') this.state = 'idle';

    if (this.speed > 5) {
      this.stepAcc += this.speed * dt;
      if (this.stepAcc > 58) {
        this.stepAcc = 0;
        const rel = this.x - game.player.x;
        const dist = Math.hypot(rel, this.y - game.player.y);
        if (dist < 620) {
          const pan = Math.max(-1, Math.min(1, rel / 380));
          game.audio.hunterStep(pan, Math.min(1, 1.15 - dist / 640));
        }
        game.stepEcho?.(this.x, this.y, '255, 70, 70');
      }
    }
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
      game.stepEcho?.(this.x, this.y, '110, 180, 255');
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
