import { clamp, lerp } from './util.js';
import { lineOfSight } from './pathfind.js';

const WALL_RGB = '150, 238, 226';
const GLOW_RGB = '80, 210, 198';
const AMBER = '255, 196, 107';
const RED = '255, 86, 86';
const TEAL = '127, 227, 212';

const BUCKETS = 12;

/**
 * Sonar renderer.
 *
 * The world is drawn in world units; walls are lit analytically: for each wall
 * segment we compute the distance from every live ping's wavefront, so a wall
 * only glows while the shell is passing over it. Everything else is black.
 */
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = 1;
    this.cw = 0;
    this.ch = 0;
    this.scale = 1;
    this.ox = 0;
    this.oy = 0;
    this.buckets = Array.from({ length: BUCKETS }, () => []);
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.cw = Math.max(320, rect.width);
    this.ch = Math.max(240, rect.height);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.cw * this.dpr);
    this.canvas.height = Math.round(this.ch * this.dpr);
  }

  fit(level) {
    const pad = Math.min(56, Math.max(18, Math.min(this.cw, this.ch) * 0.06));
    const fitScale = Math.min(
      (this.cw - pad * 2) / level.size.w,
      (this.ch - pad * 2) / level.size.h,
    );
    // Stay close enough that the room never fits on screen at once: darkness
    // should extend past the edge of the display.
    const zoom = Math.max(this.cw / 900, this.ch / 620);
    this.scale = Math.max(fitScale, Math.min(2.35, Math.max(1, zoom)));
  }

  _segBrightness(s, pings, now) {
    let best = 0;
    for (let i = 0; i < pings.length; i++) {
      const p = pings[i];
      const age = now - p.t0;
      if (age < 0 || age > p.life) continue;
      const R = age * p.speed;
      const dx = s.x2 - s.x1;
      const dy = s.y2 - s.y1;
      const len2 = dx * dx + dy * dy || 1;
      let t = ((p.x - s.x1) * dx + (p.y - s.y1) * dy) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const cx = s.x1 + dx * t;
      const cy = s.y1 + dy * t;
      const d = Math.hypot(p.x - cx, p.y - cy);
      const band = d - R;
      if (band > 64 || band < -64) continue;
      const pulse = 1 - age / p.life;
      const v = pulse * Math.exp(-(band * band) / 1600);
      if (v > best) best = v;
    }
    return best;
  }

  _pointBrightness(x, y, pings, now, level, occlude = true) {
    let best = 0;
    for (let i = 0; i < pings.length; i++) {
      const p = pings[i];
      const age = now - p.t0;
      if (age < 0 || age > p.life) continue;
      const R = age * p.speed;
      const d = Math.hypot(x - p.x, y - p.y);
      const band = d - R;
      if (band > 58 || band < -58) continue;
      const pulse = 1 - age / p.life;
      let v = pulse * Math.exp(-(band * band) / 1200);
      if (occlude && v > 0.02 && level) {
        if (!lineOfSight(level.grid, level.w, level.h, p.x, p.y, x, y, level.tile)) v *= 0.1;
      }
      if (v > best) best = v;
    }
    return best;
  }

  draw(game) {
    const { ctx } = this;
    const level = game.level;
    if (!level) return;
    this.fit(level);
    const now = game.now;
    const shake = game.shake || 0;
    const sx = (Math.random() * 2 - 1) * shake;
    const sy = (Math.random() * 2 - 1) * shake;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#04070a';
    ctx.fillRect(0, 0, this.cw, this.ch);

    const vw = this.cw / this.scale;
    const vh = this.ch / this.scale;
    const cx = level.size.w <= vw
      ? level.size.w / 2
      : clamp(game.camX || level.size.w / 2, vw / 2, level.size.w - vw / 2);
    const cy = level.size.h <= vh
      ? level.size.h / 2
      : clamp(game.camY || level.size.h / 2, vh / 2, level.size.h - vh / 2);

    ctx.save();
    ctx.translate(this.cw / 2 - cx * this.scale + sx, this.ch / 2 - cy * this.scale + sy);
    ctx.scale(this.scale, this.scale);

    // ---- sonar: sparks fly out, bounce off walls, leave short comet tails ---
    const rays = game.rays || [];
    const contacts = game.contacts || [];
    if (rays.length || contacts.length) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 0; i < contacts.length; i++) {
        const c = contacts[i];
        const k = Math.max(0, 1 - (now - c.t) / 1.7);
        if (k <= 0.02) continue;
        ctx.fillStyle = `rgba(150, 246, 232, ${k * 0.5})`;
        ctx.beginPath();
        ctx.arc(c.x, c.y, 1.4 + k * 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = 0; i < rays.length; i++) {
        const r = rays[i];
        if (!r.pts || r.pts.length < 2) continue;
        const fade = r.age <= r.life ? 1 : Math.max(0, 1 - (r.age - r.life) / 1.2);
        if (fade <= 0.02) continue;
        const head = Math.min(1, r.age / r.life);
        const a = (0.5 - head * 0.3) * fade;
        if (a <= 0.02) continue;
        const pts = r.pts;
        const n = pts.length;
        const start = Math.max(0, n - 10);
        const segs = n - 1 - start;
        if (segs > 0) {
          const batches = 3;
          for (let b = 0; b < batches; b++) {
            const i0 = start + Math.floor((segs * b) / batches);
            const i1 = start + Math.max(1, Math.floor((segs * (b + 1)) / batches));
            if (i1 <= i0) continue;
            const ta = a * Math.pow((b + 1) / batches, 1.6);
            ctx.beginPath();
            ctx.moveTo(pts[i0].x, pts[i0].y);
            for (let j = i0 + 1; j <= i1; j++) ctx.lineTo(pts[j].x, pts[j].y);
            if (b === batches - 1) ctx.lineTo(r.x, r.y);
            ctx.strokeStyle = `rgba(150, 246, 232, ${ta})`;
            ctx.lineWidth = 0.8 + ta * 1.6;
            ctx.stroke();
          }
        }
        if (r.age <= r.life) {
          ctx.fillStyle = `rgba(226, 255, 250, ${Math.min(0.9, a * 1.5)})`;
          ctx.beginPath();
          ctx.arc(r.x, r.y, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // ---- particles ----------------------------------------------------------
    const dust = game.particles;
    if (dust) {
      for (let i = 0; i < dust.length; i++) {
        const p = dust[i];
        const b = this._pointBrightness(p.x, p.y, game.pings, now, level, false);
        if (b < 0.02) continue;
        ctx.fillStyle = `rgba(180, 245, 238, ${b * 0.5})`;
        ctx.fillRect(p.x, p.y, 1.5, 1.5);
      }
    }

    // ---- shards -------------------------------------------------------------
    for (const sh of game.shards) {
      const lit = this._pointBrightness(sh.x, sh.y, game.pings, now, level);
      const near = Math.max(0, 1 - Math.hypot(sh.x - game.camX, sh.y - game.camY) / 90) * 0.35;
      const a = clamp(Math.max(lit, near), 0, 1);
      if (a < 0.02) continue;
      const pulse = 0.75 + 0.25 * Math.sin(now * 2.4 + sh.id * 1.7);
      ctx.save();
      ctx.translate(sh.x, sh.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = `rgba(${AMBER}, ${0.16 * a * pulse})`;
      ctx.fillRect(-12, -12, 24, 24);
      ctx.strokeStyle = `rgba(${AMBER}, ${0.9 * a * pulse})`;
      ctx.lineWidth = 1.6;
      ctx.strokeRect(-6.5, -6.5, 13, 13);
      ctx.fillStyle = `rgba(255, 240, 210, ${0.9 * a * pulse})`;
      ctx.fillRect(-2.5, -2.5, 5, 5);
      ctx.restore();
    }

    // ---- exit ---------------------------------------------------------------
    if (game.exitOpen) {
      this._drawExit(level.exit.x, level.exit.y, 0.9, AMBER, now, true);
    } else {
      const b = this._pointBrightness(level.exit.x, level.exit.y, game.pings, now, level);
      this._drawExit(level.exit.x, level.exit.y, Math.max(b, 0.12), TEAL, now, false);
    }

    // ---- hunters ------------------------------------------------------------
    for (const h of game.hunters) {
      const b = this._pointBrightness(h.x, h.y, game.pings, now, level);
      if (b < 0.035) continue;
      const a = clamp(b * 1.8, 0.08, 1);
      const wobble = 1 + 0.04 * Math.sin(now * 9 + h.id);
      ctx.save();
      ctx.translate(h.x, h.y);
      ctx.rotate(h.face + Math.PI / 2);
      ctx.scale(wobble, wobble);
      ctx.fillStyle = `rgba(10, 14, 18, ${0.9 * a})`;
      ctx.strokeStyle = `rgba(${RED}, ${a})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, -15);
      ctx.lineTo(10, 8);
      ctx.lineTo(4, 4);
      ctx.lineTo(0, 13);
      ctx.lineTo(-4, 4);
      ctx.lineTo(-10, 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = `rgba(${RED}, ${a})`;
      ctx.beginPath();
      ctx.arc(-4, -4, 1.7, 0, Math.PI * 2);
      ctx.arc(4, -4, 1.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // ---- echo rings: where a mimic answered --------------------------------
    for (const r of game.echoRings || []) {
      const k = (now - r.t) / 1.2;
      if (k < 0 || k > 1) continue;
      ctx.strokeStyle = `rgba(150, 242, 230, ${(1 - k) * 0.3})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 7 + k * 54, 0, Math.PI * 2);
      ctx.stroke();
    }

    // ---- skitters -----------------------------------------------------------
    for (const sk of game.skitters || []) {
      const b = this._pointBrightness(sk.x, sk.y, game.pings, now, level);
      const revealed = (sk.revealT || 0) > 0;
      if (b < 0.045 && !revealed) continue;
      const a = clamp(revealed ? Math.max(0.4, b * 1.9) : b * 1.9, 0.1, 1);
      const stride = Math.sin(sk.wobble) * 2.2;
      ctx.save();
      ctx.translate(sk.x, sk.y);
      ctx.rotate(sk.face);
      ctx.strokeStyle = `rgba(${RED}, ${a * 0.9})`;
      ctx.lineWidth = 1.4;
      // four legs, two forward two back, scissoring
      ctx.beginPath();
      for (const side of [-1, 1]) {
        ctx.moveTo(-2, side * 3);
        ctx.lineTo(-9 - stride, side * 9);
        ctx.moveTo(3, side * 3);
        ctx.lineTo(9 + stride, side * 9);
      }
      ctx.stroke();
      // a thin carapace with a hot core
      ctx.fillStyle = `rgba(8, 10, 12, ${0.85 * a})`;
      ctx.beginPath();
      ctx.moveTo(11, 0);
      ctx.lineTo(3, 6);
      ctx.lineTo(-9, 4);
      ctx.lineTo(-9, -4);
      ctx.lineTo(3, -6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = `rgba(${RED}, ${a})`;
      ctx.stroke();
      ctx.fillStyle = `rgba(255, 220, 210, ${a})`;
      ctx.beginPath();
      ctx.arc(2, 0, 2.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // ---- player -------------------------------------------------------------
    if (game.player) {
      const p = game.player;
      for (const t of p.trail) {
        ctx.fillStyle = `rgba(190, 255, 246, ${(t.life / 0.55) * 0.07})`;
        ctx.beginPath();
        ctx.arc(t.x, t.y, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
      const breathe = 0.75 + 0.25 * Math.sin(now * 2.1);
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 34);
      grad.addColorStop(0, `rgba(225, 255, 250, ${0.9 * breathe})`);
      grad.addColorStop(0.25, `rgba(150, 245, 235, ${0.4 * breathe})`);
      grad.addColorStop(1, 'rgba(80, 210, 198, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(240, 255, 252, 0.95)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4.4, 0, Math.PI * 2);
      ctx.fill();
      // facing tick
      ctx.strokeStyle = 'rgba(220, 255, 250, 0.5)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(p.face) * 7, p.y + Math.sin(p.face) * 7);
      ctx.lineTo(p.x + Math.cos(p.face) * 11, p.y + Math.sin(p.face) * 11);
      ctx.stroke();

      if (game.listen) {
        const rr = 58 + Math.sin(now * 2.6) * 2.5;
        ctx.strokeStyle = 'rgba(120, 220, 210, 0.10)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 7]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        // directional chevrons
        const targets = [];
        for (const h of game.hunters) targets.push({ x: h.x, y: h.y, color: RED, danger: true });
        for (const s of game.shards) targets.push({ x: s.x, y: s.y, color: AMBER, danger: false });
        targets.push({ x: level.exit.x, y: level.exit.y, color: TEAL, danger: false });
        for (const t of targets) {
          const dx = t.x - p.x;
          const dy = t.y - p.y;
          const d = Math.hypot(dx, dy);
          if (d > 560 || d < 1) continue;
          const a = clamp(1 - d / 560, 0, 1) * (t.danger ? 0.85 : 0.5);
          const ang = Math.atan2(dy, dx);
          const r = 54;
          ctx.save();
          ctx.translate(p.x + Math.cos(ang) * r, p.y + Math.sin(ang) * r);
          ctx.rotate(ang);
          ctx.fillStyle = `rgba(${t.color}, ${a})`;
          ctx.beginPath();
          ctx.moveTo(7, 0);
          ctx.lineTo(-2, -3.4);
          ctx.lineTo(-2, 3.4);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }
    }

    // ---- wavefront rings ----------------------------------------------------
    for (const p of game.pings) {
      const age = now - p.t0;
      if (age < 0 || age > p.life) continue;
      const R = age * p.speed;
      const fade = 1 - age / p.life;
      ctx.strokeStyle = `rgba(${TEAL}, ${fade * 0.2})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(${TEAL}, ${fade * fade * 0.05})`;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(p.x, p.y, R, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();

    // ---- screen space overlays ---------------------------------------------
    const danger = game.danger || 0;
    if (danger > 0.02) {
      const g = ctx.createRadialGradient(
        this.cw / 2,
        this.ch / 2,
        Math.min(this.cw, this.ch) * 0.24,
        this.cw / 2,
        this.ch / 2,
        Math.max(this.cw, this.ch) * 0.72,
      );
      g.addColorStop(0, 'rgba(255, 40, 40, 0)');
      g.addColorStop(1, `rgba(255, 40, 40, ${0.22 * danger})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.cw, this.ch);
    }
    if (game.state === 'dead' && game.deathT !== undefined) {
      const a = clamp(0.55 - game.deathT * 0.25, 0, 0.55);
      ctx.fillStyle = `rgba(120, 8, 8, ${a})`;
      ctx.fillRect(0, 0, this.cw, this.ch);
    }
    if (game.flash > 0) {
      ctx.fillStyle = `rgba(190, 255, 245, ${game.flash * 0.06})`;
      ctx.fillRect(0, 0, this.cw, this.ch);
    }
  }

  _drawExit(x, y, a, color, now, open) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    const pulse = open ? 0.8 + 0.2 * Math.sin(now * 2.2) : 1;
    if (open) {
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 46);
      g.addColorStop(0, `rgba(255, 210, 140, ${0.25 * a})`);
      g.addColorStop(1, 'rgba(255, 210, 140, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 46, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = `rgba(${color}, ${a * pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-13, 16);
    ctx.lineTo(-13, -6);
    ctx.arc(0, -6, 13, Math.PI, 0);
    ctx.lineTo(13, 16);
    ctx.stroke();
    ctx.strokeStyle = `rgba(${color}, ${a * pulse * 0.5})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-7, 16);
    ctx.lineTo(-7, -4);
    ctx.arc(0, -4, 7, Math.PI, 0);
    ctx.lineTo(7, 16);
    ctx.stroke();
    if (open) {
      ctx.fillStyle = `rgba(255, 230, 190, ${a * 0.6})`;
      for (let i = 0; i < 3; i++) {
        const yy = 4 - ((now * 18 + i * 12) % 26);
        ctx.fillRect(-2, yy, 4, 2);
      }
    }
    ctx.restore();
  }
}
