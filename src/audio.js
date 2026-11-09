import { clamp } from './util.js';

/**
 * Every sound in EARSHOT is synthesised at runtime — no audio files.
 * The engine keeps a dry bus and a convolution reverb bus, and exposes
 * small musical helpers that the game calls for events.
 */
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.dry = null;
    this.reverbSend = null;
    this.volume = 0.85;
    this.muted = false;
    this.started = false;
    this._heartTimer = 0;
    this._creakTimer = 6;
    this._noiseBuffer = null;
  }

  get ready() {
    return !!this.ctx;
  }

  async unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(ctx.destination);
    this.dry = ctx.createGain();
    this.dry.gain.value = 0.9;
    this.dry.connect(this.master);
    const convolver = ctx.createConvolver();
    convolver.buffer = this._impulse(2.4, 2.6);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.55;
    this.reverbSend.connect(convolver);
    convolver.connect(this.master);
    this._noiseBuffer = this._makeNoise(2);
    this._startAmbience();
    this.started = true;
    if (ctx.state === 'suspended') await ctx.resume();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(muted ? 0 : this.volume, this.ctx.currentTime, 0.05);
    }
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /** Live volume changes, also from the settings panel. 0..1. */
  setVolume(v) {
    this.volume = Math.min(1, Math.max(0, Number(v) || 0));
    if (this.master && !this.muted) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    }
  }

  _impulse(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  _makeNoise(seconds) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(1, len, rate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  _route(node, pan, send) {
    let out = node;
    if (pan) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      out.connect(p);
      out = p;
    }
    out.connect(this.dry);
    if (send > 0) {
      const s = this.ctx.createGain();
      s.gain.value = send;
      out.connect(s);
      s.connect(this.reverbSend);
    }
  }

  tone({
    freq,
    freqEnd,
    type = 'sine',
    dur = 0.4,
    gain = 0.15,
    attack = 0.006,
    pan = 0,
    send = 0.35,
    delay = 0,
    detune = 0,
  } = {}) {
    if (!this.ready) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
    if (detune) osc.detune.value = detune;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    this._route(g, pan, send);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
    osc.onended = () => {
      try {
        osc.disconnect();
        g.disconnect();
      } catch {
        /* already gone */
      }
    };
  }

  noise({
    dur = 0.2,
    gain = 0.1,
    type = 'bandpass',
    freq = 800,
    q = 1,
    pan = 0,
    send = 0.2,
    delay = 0,
  } = {}) {
    if (!this.ready) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    this._route(g, pan, send);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
    src.onended = () => {
      try {
        src.disconnect();
        filter.disconnect();
        g.disconnect();
      } catch {
        /* already gone */
      }
    };
  }

  _startAmbience() {
    const ctx = this.ctx;
    // Low drone: two slightly detuned oscillators through a soft lowpass.
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.035;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    droneGain.connect(lp);
    lp.connect(this.dry);
    this._drone = [];
    for (const [f, det] of [
      [55, -6],
      [82.4, 7],
      [110, 3],
    ]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.detune.value = det;
      const g = ctx.createGain();
      g.gain.value = f < 60 ? 0.5 : 0.2;
      o.connect(g);
      g.connect(droneGain);
      o.start();
      this._drone.push({ osc: o, base: f });
    }
    // Wind.
    const wind = ctx.createBufferSource();
    wind.buffer = this._noiseBuffer;
    wind.loop = true;
    const wf = ctx.createBiquadFilter();
    wf.type = 'lowpass';
    wf.frequency.value = 320;
    const wg = ctx.createGain();
    wg.gain.value = 0.02;
    wind.connect(wf);
    wf.connect(wg);
    wg.connect(this.dry);
    wind.start();
    // Slow breathing LFO on the wind.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.012;
    lfo.connect(lfoGain);
    lfoGain.connect(wg.gain);
    lfo.start();
  }

  /** Each part of the cave sits on a different note of the same chord. Crossing
   *  into it is a slow detune, not a cut. */
  setSector(n) {
    if (!this._drone || !this.ctx) return;
    const ratios = [1, 1.0595, 0.9439, 1.1225, 0.8909, 1.1892, 1.0293, 0.8409];
    const r = ratios[((n % 8) + 8) % 8];
    const t = this.ctx.currentTime;
    for (const d of this._drone) d.osc.frequency.setTargetAtTime(d.base * r, t, 2.2);
  }

  ping(strength = 1) {
    this.tone({ freq: 1680, freqEnd: 720, type: 'triangle', dur: 0.16, gain: 0.05 * strength, send: 0.5 });
    this.tone({ freq: 780, freqEnd: 210, type: 'sine', dur: 0.85, gain: 0.16 * strength, send: 1.1 });
    this.noise({ dur: 0.09, gain: 0.05 * strength, type: 'highpass', freq: 2600, send: 0.6 });
  }

  /** Something out there answered your sound. Detuned, wetter, further away. */
  echo(pan = 0, kind = 'ping') {
    const heavy = kind === 'ping' || kind === 'hum';
    const g = heavy ? 0.1 : 0.055;
    this.tone({ freq: 1640, freqEnd: 600, type: 'triangle', dur: 0.22, gain: g * 0.45, pan, send: 1.5, delay: 0.02, detune: -40 });
    this.tone({ freq: 720, freqEnd: 170, type: 'sine', dur: 1.15, gain: g, pan, send: 1.7, delay: 0.06, detune: -70 });
    this.noise({ dur: 0.16, gain: g * 0.22, type: 'bandpass', freq: 1700, q: 3.5, pan, send: 1.3, delay: 0.04 });
  }

  /** Dry chitin clicks: the only warning a mimic gives, and only up close. */
  skitterTick(pan = 0, loud = 1) {
    this.noise({ dur: 0.028, gain: 0.022 * loud, type: 'highpass', freq: 3400, pan, send: 0.12 });
    this.tone({ freq: 2100, freqEnd: 1500, type: 'square', dur: 0.018, gain: 0.005 * loud, pan, send: 0.08 });
  }

  /** A sealed door breathing: low, patient, and just audible enough to answer. */
  gateHum() {
    this.tone({ freq: 61, freqEnd: 57, type: 'sine', dur: 1.5, gain: 0.05, send: 1.2, delay: 0.02 });
    this.tone({ freq: 122, freqEnd: 116, type: 'triangle', dur: 1.1, gain: 0.012, send: 1.0 });
  }

  deny() {
    this.tone({ freq: 180, freqEnd: 120, type: 'square', dur: 0.12, gain: 0.05, send: 0.1 });
  }

  // A hunter just heard something. Low, sour, panned toward it: the "it knows"
  // tell, so the player can connect their own noise to the reaction.
  alert(pan = 0) {
    this.tone({ freq: 150, freqEnd: 96, type: 'triangle', dur: 0.28, gain: 0.05, pan, send: 0.25 });
    this.tone({ freq: 300, freqEnd: 240, type: 'sine', dur: 0.09, gain: 0.02, pan, send: 0.2, delay: 0.02 });
  }

  footstep(pan = 0, loud = 1) {
    this.noise({ dur: 0.07, gain: 0.035 * loud, type: 'bandpass', freq: 900 + Math.random() * 300, q: 1.2, pan, send: 0.12 });
  }

  hunterStep(pan = 0, closeness = 0.3) {
    this.noise({ dur: 0.1, gain: 0.09 * closeness, type: 'lowpass', freq: 190, q: 0.8, pan, send: 0.25 });
    this.tone({ freq: 62, freqEnd: 44, type: 'sine', dur: 0.16, gain: 0.06 * closeness, pan, send: 0.1 });
  }

  shard() {
    const notes = [880, 1174.7, 1568];
    notes.forEach((f, i) =>
      this.tone({ freq: f, type: 'triangle', dur: 0.7, gain: 0.07, delay: i * 0.07, send: 0.9 }),
    );
  }

  /** A shard answering a pulse: thin, high, far away. */
  shardEcho(pan = 0, gain = 0.02, delay = 0) {
    const f = 1876 + Math.random() * 120;
    this.tone({ freq: f, type: 'sine', dur: 0.5, gain, pan, delay, send: 1.1 });
    this.tone({ freq: f * 1.5, type: 'sine', dur: 0.35, gain: gain * 0.35, pan, delay: delay + 0.04, send: 1.3 });
  }

  gateOpen() {
    this.tone({ freq: 220, freqEnd: 55, type: 'sawtooth', dur: 1.4, gain: 0.07, send: 0.7 });
    this.tone({ freq: 660, freqEnd: 990, type: 'sine', dur: 1.2, gain: 0.05, send: 0.9 });
    this.noise({ dur: 1.1, gain: 0.03, type: 'lowpass', freq: 500, send: 0.5 });
  }

  heartbeat(intensity = 1) {
    this.tone({ freq: 54, freqEnd: 40, type: 'sine', dur: 0.16, gain: 0.12 * intensity, send: 0.05 });
    this.tone({ freq: 48, freqEnd: 36, type: 'sine', dur: 0.2, gain: 0.08 * intensity, send: 0.05, delay: 0.18 });
  }

  death() {
    this.noise({ dur: 0.8, gain: 0.28, type: 'lowpass', freq: 1400, send: 0.8 });
    this.tone({ freq: 190, freqEnd: 30, type: 'sawtooth', dur: 1.1, gain: 0.18, send: 0.6 });
    this.tone({ freq: 2400, freqEnd: 400, type: 'sine', dur: 0.5, gain: 0.05, send: 0.9 });
  }

  clear() {
    const chord = [261.6, 329.6, 392, 523.3];
    chord.forEach((f, i) =>
      this.tone({ freq: f, type: 'sine', dur: 1.8, gain: 0.055, delay: i * 0.12, send: 1.2 }),
    );
  }

  click() {
    this.tone({ freq: 900, freqEnd: 600, type: 'square', dur: 0.05, gain: 0.03, send: 0.1 });
  }

  /** Which floor just arrived under your feet: 1, 2, or -1. */
  floorChime(n = 1) {
    const pair = n === 2 ? [660, 990] : n === -1 ? [300, 200] : [520, 780];
    const t = this.ctx ? this.ctx.currentTime : 0;
    this.tone({ freq: pair[0], type: 'square', dur: 0.09, gain: 0.035, send: 0.25 });
    this.tone({ freq: pair[1], type: 'square', dur: 0.09, gain: 0.03, send: 0.3, delay: 0.06 });
    this.tone({ freq: pair[0] * 0.5, type: 'sine', dur: 0.5, gain: 0.02, send: 0.5, delay: 0.01 });
    void t;
  }

  /** Nine rooms moving at once: stone grinding somewhere under everything. */
  swapRumble() {
    this.tone({ freq: 120, freqEnd: 40, type: 'sine', dur: 1.1, gain: 0.11, send: 0.8 });
    this.noise({ dur: 0.03, gain: 0.05, type: 'bandpass', freq: 1800, q: 1.4, send: 0.5, delay: 0.04 });
    this.noise({ dur: 0.9, gain: 0.03, type: 'lowpass', freq: 260, send: 0.7, delay: 0.02 });
  }

  /** A core shatters. Glass, then three bright falling shards. */
  glassBreak() {
    this.noise({ dur: 0.04, gain: 0.08, type: 'highpass', freq: 2600, send: 0.3 });
    for (const [f, i] of [[2400, 0], [3100, 0.045], [4200, 0.09]]) {
      this.tone({ freq: f, freqEnd: f * 0.62, type: 'triangle', dur: 0.32, gain: 0.03, send: 0.6, delay: i });
    }
  }

  /** The silent hunter finds a wall and screams down it. */
  screech(pan = 0, loud = 1) {
    this.tone({ freq: 3200, freqEnd: 1400, type: 'sawtooth', dur: 0.55, gain: 0.05 * loud, pan, send: 1.2 });
    this.tone({ freq: 4700, freqEnd: 2200, type: 'square', dur: 0.35, gain: 0.025 * loud, pan, send: 1.1 });
    this.noise({ dur: 0.4, gain: 0.06 * loud, type: 'highpass', freq: 1800, pan, send: 1.0 });
  }

  /** A brute winding up before the six-second charge. */
  bruteCharge(pan = 0, loud = 1) {
    this.tone({ freq: 70, freqEnd: 120, type: 'sawtooth', dur: 0.9, gain: 0.09 * loud, pan, send: 0.6 });
    this.noise({ dur: 0.8, gain: 0.04 * loud, type: 'lowpass', freq: 380, pan, send: 0.5 });
  }

  /** b2 breaks: the whole structure drops a floor. */
  b2Quake() {
    this.tone({ freq: 30, type: 'sine', dur: 1.4, gain: 0.3, send: 0.9 });
    this.noise({ dur: 1.4, gain: 0.2, type: 'lowpass', freq: 200, send: 0.8 });
    this.noise({ dur: 0.5, gain: 0.06, type: 'bandpass', freq: 900, q: 0.9, send: 0.6, delay: 0.1 });
  }

  /** The maze stops: a long, settling exhale. */
  mcStopped() {
    this.tone({ freq: 220, freqEnd: 110, type: 'sine', dur: 1.6, gain: 0.08, send: 1.1 });
    this.tone({ freq: 110, freqEnd: 55, type: 'triangle', dur: 1.8, gain: 0.035, send: 1.2, delay: 0.05 });
  }

  /** Called each frame from the game loop. */
  update(dt, { danger = 0, paused = false } = {}) {
    if (!this.ready) return;
    if (paused) return;
    this._heartTimer -= dt;
    if (danger > 0.15 && this._heartTimer <= 0) {
      this._heartTimer = 1.15 - danger * 0.65;
      this.heartbeat(clamp(danger, 0.2, 1));
    }
    this._creakTimer -= dt;
    if (this._creakTimer <= 0) {
      this._creakTimer = 9 + Math.random() * 10;
      const f = 70 + Math.random() * 60;
      this.tone({ freq: f, freqEnd: f * 0.8, type: 'sine', dur: 1.6, gain: 0.025, send: 1 });
    }
  }
}
