import { clamp, lerp } from './util.js';
import { lineOfSight } from './pathfind.js';

const WALL_RGB = '150, 238, 226';
const GLOW_RGB = '80, 210, 198';
const AMBER = '255, 196, 107';
const RED = '255, 86, 86';
const TEAL = '127, 227, 212';
const GOLD = '255, 205, 110';
const GREEN = '140, 240, 170';

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
    // Stealth is silence, and silence is blindness: nothing renders at all.
    const vision = !game.blind;
    const rays = vision ? game.rays || [] : [];
    const contacts = vision ? game.contacts || [] : [];
    if (rays.length || contacts.length) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 0; i < contacts.length; i++) {
        const c = contacts[i];
        if (c.kind === 'hunter' || c.kind === 'skitter') continue;
        const k = Math.max(0, 1 - (now - c.t) / 1.7);
        if (k <= 0.02) continue;
        const col = c.tint || (c.kind === 'shard' ? '255,205,110'
          : c.kind === 'exit' ? '140,240,170'
            : '236,252,250');
        ctx.fillStyle = `rgba(${col}, ${k * 0.5})`;
        ctx.beginPath();
        ctx.arc(c.x, c.y, 1.4 + k * 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
      // A reflection off something that hunts you is the loudest thing in the dark.
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < contacts.length; i++) {
        const c = contacts[i];
        if (c.kind !== 'hunter' && c.kind !== 'skitter') continue;
        const k = Math.max(0, 1 - (now - c.t) / 1.7);
        if (k <= 0.02) continue;
        ctx.fillStyle = `rgba(255, 44, 44, ${0.55 + k * 0.45})`;
        ctx.beginPath();
        ctx.arc(c.x, c.y, 1.2 + k * 0.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 90, 90, ${k * 0.5})`;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.arc(c.x, c.y, 3.2 + (1 - k) * 6, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < rays.length; i++) {
        const r = rays[i];
        if (!r.pts || r.pts.length < 2) continue;
        const fade = r.age <= r.life ? 1 : Math.max(0, 1 - (r.age - r.life) / 1.2);
        if (fade <= 0.02) continue;
        const head = Math.min(1, r.age / r.life);
        const a = (0.5 - head * 0.3) * fade * (r.tint ? 1.45 : 1);
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
            ctx.strokeStyle = `rgba(${r.tint || '240,253,252'}, ${Math.min(1, ta * (r.hot ? 2.1 : r.tint ? 1.5 : 1))})`;
            ctx.lineWidth = (r.hot ? 1.6 : r.tint ? 1.0 : 0.8) + ta * (r.hot ? 2.4 : 1.4);
            ctx.stroke();
          }
        }
        if (r.age <= r.life) {
          ctx.fillStyle = `rgba(${r.tint || '240,253,252'}, ${Math.min(0.9, a * (r.hot ? 3 : 1.4))})`;
          ctx.beginPath();
          ctx.arc(r.x, r.y, r.hot ? 2.6 : 1.4, 0, Math.PI * 2);
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
        ctx.fillStyle = `rgba(225, 248, 246, ${b * 0.45})`;
        ctx.fillRect(p.x, p.y, 1.5, 1.5);
      }
    }

    // ---- shards -------------------------------------------------------------
    for (const l of game.loot || []) {
      const k = Math.max(0, 1 - (now - (l.seenAt ?? -9)) / 2.2);
      const glow = Math.max(0.16, k);
      const col = l.kind === 'charm' ? '170,225,255' : '255,205,110';
      ctx.strokeStyle = `rgba(${col}, ${glow * 0.8})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(l.x, l.y, 5.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(${col}, ${glow * 0.55})`;
      ctx.beginPath();
      ctx.arc(l.x, l.y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const sh of game.shards) {
      if (!vision) continue;
      const seen = now - (sh.seenAt ?? -99);
      const px = game.player ? game.player.x : game.camX;
      const py = game.player ? game.player.y : game.camY;
      const near = Math.max(0, 1 - Math.hypot(sh.x - px, sh.y - py) / 46) * 0.22;
      const a = clamp(seen < 2.6 ? 0.35 + 0.65 * (1 - seen / 2.6) : near, 0, 1);
      if (a < 0.02) continue;
      const pulse = 0.75 + 0.25 * Math.sin(now * 2.4 + sh.id * 1.7);
      ctx.save();
      ctx.translate(sh.x, sh.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = `rgba(${GOLD}, ${0.16 * a * pulse})`;
      ctx.fillRect(-12, -12, 24, 24);
      ctx.strokeStyle = `rgba(${GOLD}, ${0.9 * a * pulse})`;
      ctx.lineWidth = 1.6;
      ctx.strokeRect(-6.5, -6.5, 13, 13);
      ctx.fillStyle = `rgba(255, 240, 210, ${0.9 * a * pulse})`;
      ctx.fillRect(-2.5, -2.5, 5, 5);
      ctx.restore();
    }

    // ---- named-map key and doors --------------------------------------------
    if (vision && game.mapMode) {
      if (game.mapKey && !game.hasKey) {
        const k = game.mapKey;
        const pulse = 0.72 + 0.28 * Math.sin(now * 3.1);
        ctx.save();
        ctx.translate(k.x, k.y);
        ctx.rotate(Math.PI / 4);
        ctx.strokeStyle = `rgba(${GOLD}, ${0.95 * pulse})`;
        ctx.lineWidth = 1.8;
        ctx.strokeRect(-7, -7, 14, 14);
        ctx.strokeRect(-3.5, -3.5, 7, 7);
        ctx.restore();
      }
      for (const e of game.mapExits || []) {
        const locked = e.require === 'key' && !game.hasKey;
        const col = locked ? '255, 110, 110' : e.color;
        const pulse = 0.6 + 0.4 * Math.sin(now * 2.2);
        const a = locked ? 0.5 : 0.55 + 0.35 * pulse;
        ctx.strokeStyle = `rgba(${col}, ${a})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(e.x, e.y, 13, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(e.x, e.y, 20, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
        ctx.fillStyle = `rgba(${col}, ${a * 0.7})`;
        ctx.beginPath();
        ctx.arc(e.x, e.y, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ---- exit ---------------------------------------------------------------
    if (vision) {
      const eSeen = now - (level.exit.seenAt ?? -99);
      if (game.scanT > 0 && game.level) {
        const pulse = 0.5 + 0.5 * Math.sin(now * 4);
        const marks = [];
        if (game.mapMode) {
          if (game.mapKey) marks.push({ x: game.mapKey.x, y: game.mapKey.y, col: '255,205,110' });
          for (const e of game.mapExits || []) marks.push({ x: e.x, y: e.y, col: '140,240,170' });
        } else {
          if (game.level.key) marks.push({ x: game.level.key.x, y: game.level.key.y, col: '255,205,110' });
          if (game.level.exit) marks.push({ x: game.level.exit.x, y: game.level.exit.y, col: '140,240,170' });
        }
        for (const m of marks) {
          ctx.strokeStyle = `rgba(${m.col}, ${0.35 + pulse * 0.45})`;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(m.x, m.y, 12 + pulse * 6, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(m.x, m.y, 3, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${m.col}, 0.9)`;
          ctx.fill();
        }
      }
      if (game.exitOpen) {
        this._drawExit(level.exit.x, level.exit.y, 0.9, GREEN, now, true);
      } else if (eSeen < 2.6) {
        this._drawExit(level.exit.x, level.exit.y, 0.3 + 0.6 * (1 - eSeen / 2.6), GREEN, now, false);
      }
    }

    // ---- hunters: never drawn as bodies. Only their reflection exists --------

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

    // ---- debug view (only when ~ was pressed) -------------------------------
    if (game.debugMode) {
      ctx.save();
      ctx.lineWidth = 1;
      for (const h of game.hunters) {
        ctx.strokeStyle = 'rgba(255, 70, 70, 0.95)';
        ctx.strokeRect(h.x - 11, h.y - 11, 22, 22);
        if (h.path && h.path.length) {
          ctx.beginPath();
          ctx.moveTo(h.x, h.y);
          for (const wp of h.path) ctx.lineTo(wp.x, wp.y);
          ctx.strokeStyle = 'rgba(255, 70, 70, 0.45)';
          ctx.stroke();
        }
        if (h.state) {
          ctx.strokeStyle = 'rgba(255, 220, 140, 0.85)';
          ctx.font = '9px monospace';
          ctx.fillStyle = 'rgba(255, 220, 140, 0.9)';
          ctx.fillText(h.type === 'hunter' ? h.state : `${h.type}:${h.state}`, h.x - 14, h.y - 16);
        }
        if (h.pending) {
          ctx.strokeStyle = 'rgba(255, 200, 120, 0.9)';
          ctx.beginPath();
          ctx.arc(h.pending.x, h.pending.y, 8, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      for (const sk of game.skitters || []) {
        ctx.strokeStyle = 'rgba(110, 180, 255, 0.95)';
        ctx.strokeRect(sk.x - 9, sk.y - 9, 18, 18);
      }
      ctx.restore();
    }

    // ---- throwables: aiming fan and flight trails ---------------------------
    if (game.player) {
      const p = game.player;
      const showAim = !!game.activeItem || (game.inv && game.stoneCount && game.stoneCount() > 0) || !!(game.inv && (game.inv.count('pebbles') + game.inv.count('sharpStone')) > 0);
      if (showAim) {
        const r = this;
        const ax = game.aimX ?? p.x + Math.cos(p.face || 0) * 160;
        const ay = game.aimY ?? p.y + Math.sin(p.face || 0) * 160;
        const a = Math.atan2(ay - p.y, ax - p.x);
        const len = 196;
        ctx.save();
        ctx.setLineDash([9, 7]);
        ctx.lineDashOffset = -now * 34;
        ctx.strokeStyle = 'rgba(255, 214, 150, 0.5)';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(a) * 16, p.y + Math.sin(a) * 16);
        ctx.lineTo(p.x + Math.cos(a) * len, p.y + Math.sin(a) * len);
        ctx.stroke();
        ctx.setLineDash([3, 5]);
        ctx.lineDashOffset = 0;
        ctx.strokeStyle = 'rgba(255, 236, 200, 0.22)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(a) * 16, p.y + Math.sin(a) * 16);
        ctx.lineTo(p.x + Math.cos(a) * len, p.y + Math.sin(a) * len);
        ctx.stroke();
        ctx.restore();
      }
      for (const t of game.throws || []) {
        if (!t.trail || t.trail.length < 2) continue;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 1; i < t.trail.length; i++) {
          const k = i / t.trail.length;
          ctx.strokeStyle = `rgba(${game.activeItem === 'sharpStone' || t.kills ? '255, 205, 120' : '220, 250, 245'}, ${k * 0.5})`;
          ctx.lineWidth = 0.8 + k * 2.2;
          ctx.beginPath();
          ctx.moveTo(t.trail[i - 1].x, t.trail[i - 1].y);
          ctx.lineTo(t.trail[i].x, t.trail[i].y);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(255, 246, 226, 0.95)';
        ctx.beginPath();
        ctx.arc(t.x, t.y, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // ---- player -------------------------------------------------------------
    if (game.player) {
      const p = game.player;
      // Way home: a small triangle orbiting the player toward the key / exit.
      for (const m of game.homeMarkers || []) {
        const a = Math.atan2(m.y - p.y, m.x - p.x);
        const mx = p.x + Math.cos(a) * 34;
        const my = p.y + Math.sin(a) * 34;
        ctx.fillStyle = `rgba(${m.c}, 0.85)`;
        ctx.beginPath();
        ctx.moveTo(mx + Math.cos(a) * 6, my + Math.sin(a) * 6);
        ctx.lineTo(mx + Math.cos(a + 2.4) * 5, my + Math.sin(a + 2.4) * 5);
        ctx.lineTo(mx + Math.cos(a - 2.4) * 5, my + Math.sin(a - 2.4) * 5);
        ctx.closePath();
        ctx.fill();
      }
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
      }
    }

    // ---- wavefront rings ----------------------------------------------------
    for (const p of game.pings) {
      const age = now - p.t0;
      if (age < 0 || age > p.life) continue;
      const R = age * p.speed;
      const fade = (1 - age / p.life) * (p.small ? 0.45 : 1);
      ctx.strokeStyle = `rgba(${p.tint || TEAL}, ${fade * (p.tint ? 0.6 : 0.2)})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(${p.tint || TEAL}, ${fade * fade * 0.09})`;
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
    if (game.debugMode) {
      ctx.save();
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillStyle = 'rgba(255, 90, 90, 0.85)';
      const p = game.player || { x: 0, y: 0 };
      const lines = [
        `hunters ${game.hunters.length}  mimics ${(game.skitters || []).length}  shards ${game.shards.length}`,
        `player ${Math.round(p.x)},${Math.round(p.y)}  rays ${(game.rays || []).length}`,
        `freeze ${game.debugFreeze ? 'ON (1)' : 'off (1)'}`,
      ];
      lines.forEach((t, i) => ctx.fillText(t, 18, this.ch - 54 + i * 15));
      ctx.restore();
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
