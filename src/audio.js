import { clamp } from './util.js';

/**
 * Every sound in HUSH is synthesised at runtime — no audio files.
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

  ping(strength = 1) {
    this.tone({ freq: 1680, freqEnd: 720, type: 'triangle', dur: 0.16, gain: 0.05 * strength, send: 0.5 });
    this.tone({ freq: 780, freqEnd: 210, type: 'sine', dur: 0.85, gain: 0.16 * strength, send: 1.1 });
    this.noise({ dur: 0.09, gain: 0.05 * strength, type: 'highpass', freq: 2600, send: 0.6 });
  }

  deny() {
    this.tone({ freq: 180, freqEnd: 120, type: 'square', dur: 0.12, gain: 0.05, send: 0.1 });
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
