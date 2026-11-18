import { clamp, lerp, smoothstep, viewCenter } from './util.js';
import { lineOfSight } from './pathfind.js';
import { mapNode } from './maps.js';
import { drawPortalFx } from './portal-fx.js';
import { PORTAL } from './portal-config.js';

const WALL_RGB = '150, 238, 226';
const GLOW_RGB = '80, 210, 198';
const AMBER = '255, 196, 107';
const RED = '255, 86, 86';
const TEAL = '127, 227, 212';
// Sonar lines sit a step below the UI teal: the dark should stay dark.
const RAY_RGB = '150, 198, 192';
const GOLD = '255, 205, 110';
const GREEN = '140, 240, 170';

const BUCKETS = 12;
const TAU = Math.PI * 2;

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
    const { x: cx, y: cy } = viewCenter(level.size.w, level.size.h, game.camX, game.camY, vw, vh);

    ctx.save();
    ctx.translate(this.cw / 2 - cx * this.scale + sx, this.ch / 2 - cy * this.scale + sy);
    ctx.scale(this.scale, this.scale);

    this._drawLab(game, now);
    this._drawCage(game, now);

    // ---- sonar: sparks fly out, bounce off walls, leave short comet tails ---
    // Stealth is silence, and silence is blindness: nothing renders at all.
    const vision = !game.blind;
    const rays = vision ? game.rays || [] : [];
    const brightness = Math.max(0.3, Math.min(1.8, game.settings ? game.settings.brightness : 1));
    if (rays.length) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 0; i < rays.length; i++) {
        const r = rays[i];
        if (!r.pts || r.pts.length < 2) continue;
        const fade = r.age <= r.life ? 1 : Math.max(0, 1 - (r.age - r.life) / 1.2);
        if (fade <= 0.02) continue;
        const head = Math.min(1, r.age / r.life);
        const a = (0.34 - head * 0.2) * fade * (r.tint ? 1.2 : 1) * brightness;
        if (a <= 0.02) continue;
        // Fog is invisible; a brighter green line is the only cue that a ray
        // is travelling through it.
        const fogBoost = r.fog ? 1.85 : 1;
        // Water is never drawn. A pool only exists as a stretch of blue sound
        // running twice as fast as the rest of the room.
        const col = r.wet && !r.tint ? '104, 178, 255' : r.fog ? '170, 255, 190' : r.tint || RAY_RGB;
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
            ctx.strokeStyle = `rgba(${col}, ${Math.min(1, ta * (r.hot ? 1.9 : r.tint ? 1.3 : 1) * fogBoost)})`;
            ctx.lineWidth = (r.hot ? 1.6 : r.tint ? 1.0 : 0.8) + ta * (r.hot ? 2.4 : 1.4) + (r.fog ? 0.9 : 0);
            ctx.stroke();
          }
        }
        if (r.age <= r.life) {
          ctx.fillStyle = `rgba(${col}, ${Math.min(0.9, a * (r.hot ? 2.6 : 1.25) * fogBoost)})`;
          ctx.beginPath();
          ctx.arc(r.x, r.y, r.hot ? 2.6 : r.fog ? 2.2 : 1.4, 0, Math.PI * 2);
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
      // Until the player is close, a spot is only a faint, colourless echo.
      const unknown = !l.kind;
      const k = Math.max(0, 1 - (now - (l.seenAt ?? -9)) / 2.2);
      const glow = unknown ? 0.09 + 0.03 * Math.sin(now * 1.5 + l.x * 0.01) : Math.max(0.16, k);
      const col = unknown ? '170, 220, 210' : l.kind === 'charm' ? '170,225,255' : '255,205,110';
      ctx.strokeStyle = `rgba(${col}, ${glow * 0.8})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(l.x, l.y, unknown ? 3.4 : 5.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(${col}, ${glow * 0.55})`;
      ctx.beginPath();
      ctx.arc(l.x, l.y, unknown ? 1 : 1.6, 0, Math.PI * 2);
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
        const near = game.player ? Math.hypot(game.player.x - e.x, game.player.y - e.y) : 999;
        // Far away a door is only a small signal; the ring opens up as you walk
        // closer, so a room reads before you are standing on top of it.
        // Two-arm phase keeps its size; growth runs in the same window as
        // the third arm's fade-in, so full size arrives with the full triad.
        const prox = smoothstep(PORTAL.d3, Math.max(60, PORTAL.d3 - PORTAL.fade), near);
        const R = lerp(PORTAL.far, PORTAL.near, prox);
        const arm3 = smoothstep(PORTAL.d3, PORTAL.d3 - PORTAL.fade, near);
        const a = (locked ? 0.5 : 0.55 + 0.35 * pulse) * (0.55 + 0.45 * prox);
        // Even a far door is a small living vortex; it opens up as you walk
        // closer, so the same door reads at both ends of the room.
        drawPortalFx(ctx, e.x, e.y, R, now, col, locked, 1, e.x * 0.017 + e.y * 0.011, arm3, PORTAL.spin);
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.strokeStyle = `rgba(${col}, ${a})`;
        // Radius scales; the ink weight does not, so distant doors stay crisp.
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(0, 0, R, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = `rgba(${col}, ${a * 0.7})`;
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(1.6, R * 0.22), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // A portal should name its destination before you step in. The font is
        // divided by the zoom so the label stays readable at every scale; it
        // keeps its size while the ring breathes with proximity.
        const dest = mapNode(e.to);
        const suffix = !e.built ? '·未开通' : locked ? '·需钥匙' : '';
        ctx.save();
        ctx.font = `${Math.round(11 / this.scale)}px ui-monospace, monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = `rgba(${col}, ${near < 170 ? 0.9 : 0.4})`;
        ctx.fillText(`${dest ? dest.name : '未知'}${suffix}`, e.x, e.y - (R + 17 * prox));
        ctx.restore();
      }
    }

    // ---- moving maze: sound particles, cores, flip rings --------------------
    // A sound line is a moving particle with a fading point trail, exactly like
    // the sonar rays. Nothing here is a static stroke.
    if (level.moving) {
      const tile = level.tile;
      ctx.save();

      // Door warning: four red particles per door, two crossing each way.
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const t of game.soundTrails || []) {
        const pts = t.trail;
        if (!pts || pts.length < 2) continue;
        const life = Math.max(0, 1 - t.age / t.life);
        if (life <= 0) continue;
        const n = pts.length;
        const start = Math.max(0, n - 10);
        const segs = n - 1 - start;
        if (segs <= 0) continue;
        for (let b = 0; b < 3; b++) {
          const i0 = start + Math.floor((segs * b) / 3);
          const i1 = start + Math.max(1, Math.floor((segs * (b + 1)) / 3));
          if (i1 <= i0) continue;
          const f = (b + 1) / 3;
          ctx.strokeStyle = `rgba(${t.tint}, ${life * (0.08 + 0.62 * f)})`;
          ctx.lineWidth = t.width * (0.6 + f * 0.8);
          ctx.beginPath();
          ctx.moveTo(pts[i0].x, pts[i0].y);
          for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.stroke();
        }
        ctx.fillStyle = `rgba(${t.tint}, ${0.85 * life})`;
        ctx.beginPath();
        ctx.arc(pts[n - 1].x, pts[n - 1].y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Core: three real sonar particles bouncing inside the one-tile 口.
      for (const t of game.coreTrails || []) {
        const blk = level.blocks[t.block];
        if (!blk || blk.gone || blk.core.broken || blk.decor[blk.z] === 'none') continue;
        const pts = t.pts;
        if (!pts || pts.length < 2) continue;
        const col = blk.i === 4 ? '255, 200, 90' : blk.z === 1 ? '70, 150, 160' : '127, 227, 212';
        const n = pts.length;
        const start = Math.max(0, n - 32);
        const tail = pts[start];
        const grad = ctx.createLinearGradient(tail.x, tail.y, t.x, t.y);
        grad.addColorStop(0, `rgba(${col}, 0)`);
        grad.addColorStop(0.45, `rgba(${col}, 0.14)`);
        grad.addColorStop(1, `rgba(${col}, 0.62)`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.5;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(pts[start].x, pts[start].y);
        for (let i = start + 1; i < n - 1; i++) {
          const mx = (pts[i].x + pts[i + 1].x) / 2;
          const my = (pts[i].y + pts[i + 1].y) / 2;
          ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
        }
        ctx.lineTo(pts[n - 1].x, pts[n - 1].y);
        ctx.stroke();
        ctx.fillStyle = `rgba(${col}, 0.9)`;
        ctx.beginPath();
        ctx.arc(t.x, t.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      for (const blk of level.blocks) {
        if (blk.gone) continue;
        const kind = blk.decor[blk.z];
        if (kind === 'none') continue;
        const cx = (blk.ox + 12.5) * tile;
        const cy = (blk.oy + 12.5) * tile;
        if (blk.core.broken) {
          // The 口 is gone; only a cold ember is left.
          const flick = 0.25 + 0.1 * Math.sin(now * 7.1 + blk.i);
          ctx.fillStyle = `rgba(180, 190, 195, ${flick})`;
          ctx.beginPath();
          ctx.arc(cx, cy, 2.2, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        const col = blk.i === 4 ? '255, 200, 90' : blk.z === 1 ? '70, 150, 160' : '127, 227, 212';
        // The sealed cell's four edges, faint enough to read without a pulse.
        ctx.strokeStyle = blk.i === 4 ? 'rgba(255, 200, 90, 0.16)' : 'rgba(255, 255, 255, 0.10)';
        ctx.lineWidth = 1;
        ctx.strokeRect((blk.ox + 12) * tile, (blk.oy + 12) * tile, tile, tile);
        if (kind === 'button') {
          const pulse = 0.5 + 0.5 * Math.sin(now * (Math.PI * 2 / 1.2));
          ctx.strokeStyle = `rgba(255, 240, 200, ${0.35 + 0.5 * pulse})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(cx, cy, 6, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(cx, cy - 10);
          ctx.lineTo(cx, cy - 3);
          ctx.stroke();
        }
      }
      for (const fr of level.moving.state === 'running' ? game.flipRings || [] : []) {
        const k = (now - fr.t) / 0.5;
        if (k < 0 || k > 1) continue;
        ctx.strokeStyle = `rgba(255, 70, 70, ${0.5 * (1 - k)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(fr.x, fr.y, 18 + 362 * k, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // ---- exit ---------------------------------------------------------------
    // Map nodes now leave through portals; the old arch only marks the stair
    // on ordinary floors, where there is no portal to read instead.
    if (vision && level.exit && !game.mapMode) {
      const eSeen = now - (level.exit.seenAt ?? -99);
      if (game.scanT > 0 && game.level) {
        // The route is a real path around walls, drawn only while it lasts.
        for (const rt of game.scanRoutes || []) {
          if (!rt.pts || rt.pts.length < 2) continue;
          ctx.save();
          ctx.setLineDash([6, 6]);
          ctx.lineDashOffset = -now * 16;
          ctx.strokeStyle = `rgba(${rt.col}, 0.62)`;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(rt.pts[0].x, rt.pts[0].y);
          for (let i = 1; i < rt.pts.length; i++) ctx.lineTo(rt.pts[i].x, rt.pts[i].y);
          ctx.stroke();
          ctx.restore();
        }
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
      for (const e of game.labEnemies || []) {
        const col = e.type === 'lab2' ? '255, 150, 80' : '150, 255, 190';
        ctx.strokeStyle = `rgba(${col}, 0.95)`;
        ctx.strokeRect(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2);
        if (e.path && e.path.length) {
          ctx.beginPath();
          ctx.moveTo(e.x, e.y);
          for (const wp of e.path) ctx.lineTo(wp.x, wp.y);
          ctx.strokeStyle = `rgba(${col}, 0.4)`;
          ctx.stroke();
        }
        ctx.fillStyle = `rgba(${col}, 0.9)`;
        ctx.font = '9px monospace';
        ctx.fillText(`${e.type}:${e.state}`, e.x - 14, e.y - e.r - 5);
      }
      ctx.restore();
    }

    // ---- throwables: aiming fan and flight trails ---------------------------
    if (game.player) {
      const p = game.player;
      const showAim = !!game.activeItem;
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
      // a corpse keeps calling: the long rings are its rays, this marks the body
      for (const lu of game.lures || []) {
        const k = Math.max(0, Math.min(1, lu.t / 5));
        const pulse = 0.6 + 0.4 * Math.sin(now * 2.2);
        ctx.strokeStyle = `rgba(232, 178, 148, ${0.34 * k * pulse})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(lu.x, lu.y, 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([2, 8]);
        ctx.strokeStyle = `rgba(232, 178, 148, ${0.18 * k})`;
        ctx.beginPath();
        ctx.arc(lu.x, lu.y, 34 + pulse * 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = `rgba(232, 178, 148, ${0.5 * k})`;
        ctx.beginPath();
        ctx.arc(lu.x, lu.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
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
      ctx.strokeStyle = `rgba(${p.tint || TEAL}, ${fade * (p.tint ? 0.45 : 0.13)})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(${p.tint || TEAL}, ${fade * fade * 0.055})`;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(p.x, p.y, R, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();

    // ---- screen space overlays ---------------------------------------------
    if (game.stunT > 0) {
      const r = Math.min(this.cw, this.ch) * 0.46;
      const g = ctx.createRadialGradient(this.cw / 2, this.ch / 2, r * 0.2, this.cw / 2, this.ch / 2, r);
      g.addColorStop(0, 'rgba(80, 220, 120, 0)');
      g.addColorStop(1, `rgba(60, 190, 100, ${Math.min(0.42, 0.18 + game.stunT * 0.1)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.cw, this.ch);
    }
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

  /**
   * The cat cage draws almost nothing: no cat, no water, no fog, no walls.
   * Only the answer rings, a breaker strike, and the hole left at the end.
   */
  _drawCage(game, now) {
    const { ctx } = this;
    const c = game.cage;
    if (!c) return;
    for (const r of c.rings || []) {
      const k = clamp((now - r.t) / r.life, 0, 1);
      if (k >= 1) continue;
      const rad = lerp(r.r0, r.r1, 1 - (1 - k) ** 2);
      const a = (1 - k) ** 1.45;
      ctx.strokeStyle = `rgba(${r.col}, ${0.55 * a})`;
      ctx.lineWidth = 1.2 + a * 2.2;
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = `rgba(${r.col}, ${0.14 * a})`;
      ctx.lineWidth = 7 * a + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad, 0, TAU);
      ctx.stroke();
    }
    const d = c.device;
    if (d && d.alive && d.hitT > 0) {
      // The breaker is a wall tile, and walls are invisible. Only a line that
      // lands on it reveals a purple seam for a moment.
      const k = d.hitT / 0.4;
      ctx.strokeStyle = `rgba(196, 132, 255, ${0.18 + k * 0.5})`;
      ctx.lineWidth = 1.4;
      ctx.strokeRect(d.x - 16, d.y - 16, 32, 32);
      ctx.fillStyle = `rgba(196, 132, 255, ${0.025 + k * 0.06})`;
      ctx.fillRect(d.x - 16, d.y - 16, 32, 32);
    }
    if (c.finished && c.end) {
      const x = c.end.x;
      const y = c.end.y;
      const R = 46 + Math.sin(now * 1.3) * 1.5;
      const seed = 917;
      drawPortalFx(ctx, x, y, R, now, '196, 132, 255', false, 1, seed, 3, PORTAL.spin);
      ctx.save();
      ctx.strokeStyle = 'rgba(206, 166, 255, 0.5)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(x, y, R * 1.08, 0, TAU);
      ctx.stroke();
      // Missing wedges and a few dead pixels: this is a portal with holes in it.
      const step = Math.floor(now * 9);
      ctx.fillStyle = 'rgba(4, 7, 10, 0.9)';
      for (let i = 0; i < 9; i++) {
        const h = (n) => {
          const v = Math.sin((seed + step * 13 + i * 71 + n * 191) * 12.9898) * 43758.5453;
          return v - Math.floor(v);
        };
        const a0 = h(1) * TAU;
        const a1 = a0 + 0.08 + h(2) * 0.34;
        const rr = R * (0.25 + h(3) * 0.72);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.arc(x, y, rr, a0, a1);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(236, 220, 255, 0.45)';
      for (let i = 0; i < 7; i++) {
        const h = (n) => {
          const v = Math.sin((seed + step * 7 + i * 53 + n * 97) * 78.233) * 12345.678;
          return v - Math.floor(v);
        };
        const a = h(4) * TAU;
        const rr = R * (0.3 + h(5) * 0.8);
        ctx.fillRect(x + Math.cos(a) * rr, y + Math.sin(a) * rr, 2, 2);
      }
      ctx.restore();
    }
  }

  /** Lab-only scenery: fog, dishes, gates, cards and the two experimental bodies. */
  _drawLab(game, now) {
    const lab = game.lab;
    const level = game.level;
    if (!lab || !level) return;
    const { ctx } = this;

    // Culture dishes: three green sound particles bouncing forever inside the
    // sealed one-tile cell, drawn exactly like a moving-maze core.
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const t of game.dishTrails || []) {
      const d = lab.dishes[t.dish];
      const pts = t.pts;
      if (!d || d.broken || !pts || pts.length < 2) continue;
      const n = pts.length;
      const start = Math.max(0, n - 22);
      const tail = pts[start];
      const grad = ctx.createLinearGradient(tail.x, tail.y, t.x, t.y);
      grad.addColorStop(0, 'rgba(90, 255, 130, 0)');
      grad.addColorStop(0.45, 'rgba(90, 255, 130, 0.18)');
      grad.addColorStop(1, 'rgba(120, 255, 150, 0.8)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(pts[start].x, pts[start].y);
      for (let i = start + 1; i < n - 1; i++) {
        const mx = (pts[i].x + pts[i + 1].x) / 2;
        const my = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      ctx.lineTo(pts[n - 1].x, pts[n - 1].y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(170, 255, 185, 0.95)';
      ctx.beginPath();
      ctx.arc(t.x, t.y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    // Key cards are carried objects, so they stay visible.
    for (const c of game.mapCards || []) {
      if (c.taken) continue;
      const pulse = 0.55 + 0.45 * Math.sin(now * 2.6 + c.zone);
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.strokeStyle = `rgba(${c.color}, ${0.45 + 0.45 * pulse})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.rect(-5, -3.5, 10, 7);
      ctx.stroke();
      ctx.fillStyle = `rgba(${c.color}, ${0.5 * pulse})`;
      ctx.fillRect(-2, -1, 4, 2);
      ctx.restore();
    }

    if (lab.finalExit) this._drawExit(lab.finalExit.x, lab.finalExit.y, 0.75, GREEN, now, true);
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
