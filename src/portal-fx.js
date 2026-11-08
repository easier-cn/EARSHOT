import { clamp } from './util.js';

const TAU = Math.PI * 2;

/** Stable 0..1 hash: lets every door keep the same particle pattern. */
function portalHash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * The living part of a portal: a dark well ringed by a segmented membrane,
 * winding arms and a vortex of motes. Everything is sized from the on-screen
 * radius R; `arm3` fades the third arm in as the player approaches.
 */
export function drawPortalFx(ctx, x, y, R, now, col, locked, grow, seed, arm3 = 1, rate = 1) {
  const t = now * (locked ? 0.5 : 0.9) * rate;
  const s = R / 46;
  const coreCol = locked ? '255, 210, 205' : '242, 255, 250';
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = grow;

  // Light spilling onto the floor.
  const glow = ctx.createRadialGradient(0, 0, R * 0.15, 0, 0, R * 2.9);
  glow.addColorStop(0, `rgba(${col}, 0.12)`);
  glow.addColorStop(0.5, `rgba(${col}, 0.04)`);
  glow.addColorStop(1, `rgba(${col}, 0)`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, R * 2.9, 0, TAU);
  ctx.fill();

  // Membrane: nearly clear in the middle, a bright skin at the rim.
  const membrane = ctx.createRadialGradient(0, 0, R * 0.15, 0, 0, R * 1.02);
  membrane.addColorStop(0, 'rgba(4, 10, 12, 0.34)');
  membrane.addColorStop(0.78, `rgba(${col}, 0.04)`);
  membrane.addColorStop(0.94, `rgba(${coreCol}, ${locked ? 0.16 : 0.26})`);
  membrane.addColorStop(1, `rgba(${col}, 0)`);
  ctx.fillStyle = membrane;
  ctx.beginPath();
  ctx.arc(0, 0, R * 1.02, 0, TAU);
  ctx.fill();

  // Rotating conic sheen: broad blades of light sweep round the mouth.
  if (ctx.createConicGradient) {
    const cg = ctx.createConicGradient(t * (locked ? -0.6 : 0.9), 0, 0);
    for (let i = 0; i <= 12; i++) {
      cg.addColorStop(i / 12, `rgba(${col}, ${i % 2 ? 0.08 : 0.015})`);
    }
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.985, 0, TAU);
    ctx.clip();
    ctx.fillStyle = cg;
    ctx.fillRect(-R, -R, R * 2, R * 2);
    ctx.restore();
  }

  // Three streams of energy winding in, tapering toward the middle, each with
  // a bright bead sliding along it.
  const arms = 3;
  const segs = 30;
  const twist = 3.25;
  const wob = locked ? 0.10 : 0.16;
  const spin = t * (locked ? -0.35 : 0.70);
  // Two arms sit opposite each other; as the third fades in the ring
  // closes from 180° to 120° spacing.
  const spacing = Math.PI + (TAU / 3 - Math.PI) * arm3;
  ctx.lineCap = 'round';
  for (let arm = 0; arm < arms; arm++) {
    const armFade = arm === 2 ? arm3 : 1;
    if (armFade <= 0.02) continue;
    const base = arm * spacing + spin;
    for (let i = 0; i < segs; i++) {
      const s0 = i / segs;
      const s1 = (i + 1) / segs;
      const a0 = base + s0 * twist + Math.sin(t * 1.2 + s0 * 5.5 + arm) * wob;
      const a1 = base + s1 * twist + Math.sin(t * 1.2 + s1 * 5.5 + arm) * wob;
      const r0 = R * (0.12 + 0.9 * s0);
      const r1 = R * (0.12 + 0.9 * s1);
      const al = (locked ? 0.36 : 0.88) * (1 - s0 * 0.6) * armFade;
      const lw = Math.max(0.9, R * (0.012 + 0.044 * (1 - s0)));
      // Soft halo under the filigree, then the crisp strand on top.
      ctx.strokeStyle = `rgba(${col}, ${al * 0.16})`;
      ctx.lineWidth = lw * 3.2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0);
      ctx.lineTo(Math.cos(a1) * r1, Math.sin(a1) * r1);
      ctx.stroke();
      ctx.strokeStyle = `rgba(${col}, ${al})`;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0);
      ctx.lineTo(Math.cos(a1) * r1, Math.sin(a1) * r1);
      ctx.stroke();
    }
    const hp = ((t * 0.45 + arm * 0.33) % 1 + 1) % 1;
    const ha = base + hp * twist + Math.sin(t * 1.2 + hp * 5.5 + arm) * wob;
    const hr = R * (0.12 + 0.9 * hp);
    ctx.fillStyle = `rgba(${coreCol}, ${0.5 * Math.min(1, hp * 5) * (locked ? 0.5 : 1) * armFade})`;
    ctx.beginPath();
    ctx.arc(Math.cos(ha) * hr, Math.sin(ha) * hr, Math.max(0.9, R * 0.014), 0, TAU);
    ctx.fill();
  }

  // One continuous thread keeps the door reading as closed even while the
  // machinery arcs turn; the broken layers add texture on top.
  ctx.strokeStyle = `rgba(${col}, ${locked ? 0.28 : 0.62})`;
  ctx.lineWidth = Math.max(0.8, R * 0.013);
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.stroke();

  const rimLayers = [
    { rr: 1.0, w: 0.014, seg: 3, gap: 0.9, rot: 0.35, a: 0.30 },
    { rr: 1.055, w: 0.007, seg: 2, gap: 1.4, rot: -0.28, a: 0.26 },
  ];
  for (const L of rimLayers) {
    ctx.strokeStyle = `rgba(${col}, ${L.a * (locked ? 0.6 : 1)})`;
    ctx.lineWidth = Math.max(1, R * L.w);
    const step = TAU / L.seg;
    for (let i = 0; i < L.seg; i++) {
      const start = i * step + L.rot * t + (locked ? Math.sin(t * 12 + i) * 0.04 : 0);
      ctx.beginPath();
      ctx.arc(0, 0, R * L.rr, start, start + step - L.gap);
      ctx.stroke();
    }
  }

  // A faint outer orbit, like a second containment ring.
  ctx.strokeStyle = `rgba(${col}, ${locked ? 0.05 : 0.10})`;
  ctx.lineWidth = Math.max(0.6, R * 0.006);
  ctx.beginPath();
  ctx.arc(0, 0, R * 1.30, 0, TAU);
  ctx.stroke();

  // Ticks on the outer edge: rotating instrumentation.
  ctx.fillStyle = `rgba(${col}, ${locked ? 0.16 : 0.26})`;
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * TAU + t * 0.12;
    const len = i % 3 === 0 ? R * 0.05 : R * 0.022;
    ctx.save();
    ctx.rotate(a);
    ctx.fillRect(R * 1.10, -Math.max(0.4, R * 0.005), len, Math.max(0.8, R * 0.01));
    ctx.restore();
  }

  // Crisp inner lip.
  ctx.strokeStyle = `rgba(${coreCol}, ${locked ? 0.28 : 0.55})`;
  ctx.lineWidth = Math.max(0.8, R * 0.012);
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.99, 0, TAU);
  ctx.stroke();

  // Motes: deterministic orbits with short comet tails, entering at the rim.
  const count = locked
    ? Math.round(clamp(8 + R * 1.0, 8, 56))
    : Math.round(clamp(10 + R * 1.9, 10, 110));
  for (let i = 0; i < count; i++) {
    const h1 = portalHash(seed + i * 7.31 + 1.7);
    const h2 = portalHash(seed + i * 3.77 + 9.1);
    const h3 = portalHash(seed + i * 5.13 + 4.2);
    const h4 = portalHash(seed + i * 2.11 + 0.3);
    const rf = 0.20 + Math.pow(h1, 0.62) * 0.95;
    const spd = (0.55 + h2 * 0.5) * (0.28 + 0.9 / (0.22 + rf)) * (locked ? -0.7 : 1.0);
    const ang = h2 * TAU + t * spd + Math.sin(t * 0.8 + h1 * 6.28) * 0.10;
    const size = Math.max(0.45, (0.5 + Math.pow(h3, 1.5) * 1.35) * (0.5 + 0.5 * s));
    const life = Math.min(1, 0.3 + (1.18 - rf) * 5);
    if (life <= 0.02) continue;

    // Trail: a short polyline behind the mote, on the same orbit.
    const ta0 = ang - 0.26 * (0.6 + Math.abs(spd));
    ctx.strokeStyle = `rgba(${col}, ${0.20 * life})`;
    ctx.lineWidth = Math.max(0.4, size * 0.9);
    ctx.beginPath();
    for (let q = 0; q <= 4; q++) {
      const qa = ta0 + (0.26 * (0.6 + Math.abs(spd)) * q) / 4;
      const qr = R * rf * (1 - 0.004 * (4 - q));
      const qx = Math.cos(qa) * qr;
      const qy = Math.sin(qa) * qr;
      q ? ctx.lineTo(qx, qy) : ctx.moveTo(qx, qy);
    }
    ctx.stroke();

    const mx = Math.cos(ang) * R * rf;
    const my = Math.sin(ang) * R * rf;
    ctx.fillStyle = `rgba(${coreCol}, ${(0.5 + 0.4 * h4) * life})`;
    ctx.beginPath();
    ctx.arc(mx, my, size, 0, TAU);
    ctx.fill();
    if (h3 > 0.8) {
      ctx.fillStyle = `rgba(${col}, ${0.10 * life})`;
      ctx.beginPath();
      ctx.arc(mx, my, size * 2.2, 0, TAU);
      ctx.fill();
    }
  }

  // Core: a hot bead with a short falloff, plus the knot where arms meet.
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.2);
  core.addColorStop(0, `rgba(${coreCol}, ${locked ? 0.5 : 0.9})`);
  core.addColorStop(0.3, `rgba(${coreCol}, ${locked ? 0.2 : 0.3})`);
  core.addColorStop(0.62, `rgba(${col}, 0.14)`);
  core.addColorStop(1, `rgba(${col}, 0)`);
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = `rgba(255, 255, 252, ${locked ? 0.55 : 0.92})`;
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(1, R * 0.016), 0, TAU);
  ctx.fill();
  for (let i = 0; i < 8; i++) {
    const a = t * 0.7 + i * 1.9;
    const rr = R * (0.02 + 0.13 * portalHash(seed + i * 3.1 + 2.4));
    ctx.fillStyle = `rgba(252, 255, 253, ${locked ? 0.3 : 0.7})`;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, Math.max(0.9, R * (0.012 + 0.012 * portalHash(seed + i * 5.7))), 0, TAU);
    ctx.fill();
  }

  ctx.restore();
}

