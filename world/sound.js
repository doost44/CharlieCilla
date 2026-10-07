import { settings } from './options.js';

// Sound, made with the Web Audio API (ported from Automation Map). Effects are
// synthesised on the fly from oscillators and filtered noise. The one audio file is
// Charlie's own bass line, which drifts round the space as a musical wind. The
// AudioContext is made by entry.js inside the E key press, so browsers allow it.

const BASSLINE = new URL('./assets/audio/bassline.m4a', import.meta.url).href;

// The track sits in A-flat major pentatonic, so every synth note comes from these.
const SCALE = [8, 10, 0, 3, 5]; // Ab Bb C Eb F, as semitones above C
const noteFreq = (i, octave) => {
  const pc = SCALE[((i % 5) + 5) % 5];
  const midi = 12 * (octave + 1 + Math.floor(i / 5)) + pc;
  return 440 * 2 ** ((midi - 69) / 12);
};

let ctx = null;
let master = null;
let echo = null; // shared delay the synth sounds are sent into
let heldBus = null; // the held orb's sounds go through here, louder the closer it is
let noiseBuf = null;
let wind = null; // the bass-line wind
let held = null;

export function startSound(audioContext) {
  ctx = audioContext;
  if (!ctx) return;
  ctx.resume?.();
  master = ctx.createGain();
  master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  buildEcho();
  startWind();
}

// Leaving the world: close the context so nothing keeps playing or holding memory.
export function stopSound() {
  ctx?.close?.().catch(() => {});
  ctx = master = echo = heldBus = noiseBuf = wind = held = null;
}

// Browsers may hold the context suspended until a click; call this from one.
export const resumeSound = () => ctx?.resume?.();

const ready = () => ctx && ctx.state === 'running';

// Send a node to the speakers, panned left (-1) to right (1), optionally into the echo too.
function out(node, pan = 0, echoAmount = 0) {
  let last = node;
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    node.connect(p);
    last = p;
  }
  last.connect(master);
  if (echoAmount) {
    const send = ctx.createGain();
    send.gain.value = echoAmount;
    last.connect(send);
    send.connect(echo);
  }
}

// A soft, dark echo: 3/8 of a second, fading repeats.
function buildEcho() {
  echo = ctx.createDelay(1);
  echo.delayTime.value = 0.375;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.38;
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 1800;
  echo.connect(tone);
  tone.connect(feedback);
  feedback.connect(echo);
  tone.connect(master);

  heldBus = ctx.createGain();
  heldBus.connect(master);
  const send = ctx.createGain();
  send.gain.value = 0.5;
  heldBus.connect(send);
  send.connect(echo);
}

// Gain that rises then fades, so sounds don't click.
function envelope(vol, attack, dur, t = ctx.currentTime) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
  return g;
}

function tone({ freq, to = freq, dur = 0.15, type = 'sine', vol = 0.2, pan = 0, attack = 0.005, delay = 0 }) {
  if (!ready()) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t + attack + dur);
  const g = envelope(vol, attack, dur, t);
  o.connect(g);
  out(g, pan);
  o.start(t);
  o.stop(t + attack + dur + 0.05);
}

function noise({ dur = 0.2, filter = 'lowpass', freq = 1000, to = freq, q = 1, vol = 0.2, pan = 0, attack = 0.005, delay = 0 }) {
  if (!ready()) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t + attack + dur);
  const g = envelope(vol, attack, dur, t);
  src.connect(f);
  f.connect(g);
  out(g, pan);
  src.start(t, Math.random() * 0.5);
  src.stop(t + attack + dur + 0.05);
}

// One synth note: two slightly detuned oscillators through a filter that closes
// as the note fades (a classic analogue pluck/pad), sent into the echo.
function synth({ freq, dur = 0.3, type = 'sawtooth', vol = 0.06, pan = 0, attack = 0.01, cutoff = 2400, cutoffEnd = 400, echoAmount = 0.35, delay = 0, spread = 7, bus = null }) {
  if (!ready()) return;
  const t = ctx.currentTime + delay;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = 4;
  f.frequency.setValueAtTime(cutoff, t);
  f.frequency.exponentialRampToValueAtTime(cutoffEnd, t + attack + dur);
  const g = envelope(vol, attack, dur, t);
  f.connect(g);
  if (bus) g.connect(bus);
  else out(g, pan, echoAmount);
  for (const detune of [-spread, spread]) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    o.connect(f);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
  }
}

// --- Bass-line wind ---------------------------------------------------------------
// The bass line loops through a slowly sweeping filter and a 3D panner that circles
// the player, with a breath of airy noise on top, so it whooshes round the space.

async function startWind() {
  const own = ctx;
  try {
    const res = await fetch(BASSLINE);
    const buffer = await own.decodeAudioData(await res.arrayBuffer());
    if (own !== ctx) return; // left the world while it was loading
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const sweep = ctx.createBiquadFilter();
    sweep.type = 'bandpass';
    sweep.Q.value = 0.9;
    sweep.frequency.value = 180;

    const air = ctx.createBiquadFilter(); // airy noise riding the same sweep
    air.type = 'bandpass';
    air.Q.value = 1.2;
    const airGain = ctx.createGain();
    airGain.gain.value = 0.05;
    const airSrc = ctx.createBufferSource();
    airSrc.buffer = noiseBuf;
    airSrc.loop = true;
    airSrc.connect(air);
    air.connect(airGain);

    const gain = ctx.createGain();
    gain.gain.value = 0;
    const panner = new PannerNode(ctx, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 6, rolloffFactor: 0.6 });

    src.connect(sweep);
    sweep.connect(gain);
    airGain.connect(gain);
    gain.connect(panner);
    panner.connect(master);
    src.start();
    airSrc.start();
    wind = { sweep, air, gain, panner, t: 0 };
  } catch {
    // No bass line (file missing or format unsupported): the world is fine without it.
  }
}

function updateWind(dt, camera) {
  if (!wind) return;
  const t = (wind.t += dt);
  const now = ctx.currentTime;
  // Swells in and out, and the filter opens and closes like a gust.
  const gust = 0.5 + 0.5 * Math.sin(t * 0.21) * Math.sin(t * 0.13 + 1);
  const fadeIn = Math.min(1, t / 6);
  wind.gain.gain.setTargetAtTime((0.25 + 0.3 * gust) * settings.music * fadeIn, now, 0.3);
  wind.sweep.frequency.setTargetAtTime(110 + 260 * gust, now, 0.3);
  wind.air.frequency.setTargetAtTime(600 + 1400 * gust, now, 0.3);
  // Circle round the player at changing speed and height.
  const a = t * 0.35 + Math.sin(t * 0.17) * 2;
  const r = 9 + 4 * Math.sin(t * 0.11);
  const p = camera.position;
  setPos(wind.panner, p.x + Math.cos(a) * r, p.y + 2 + 3 * Math.sin(t * 0.23), p.z + Math.sin(a) * r);
}

function setPos(node, x, y, z) {
  if (node.positionX) {
    node.positionX.value = x;
    node.positionY.value = y;
    node.positionZ.value = z;
  } else {
    node.setPosition(x, y, z);
  }
}

// The listener's ears follow the camera, so 3D sounds move as you turn.
function updateListener(camera) {
  const l = ctx.listener;
  const p = camera.position;
  const e = camera.matrixWorld.elements;
  const fwd = [-e[8], -e[9], -e[10]], up = [e[4], e[5], e[6]];
  if (l.positionX) {
    l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z;
    l.forwardX.value = fwd[0]; l.forwardY.value = fwd[1]; l.forwardZ.value = fwd[2];
    l.upX.value = up[0]; l.upY.value = up[1]; l.upZ.value = up[2];
  } else {
    l.setPosition(p.x, p.y, p.z);
    l.setOrientation(...fwd, ...up);
  }
}

// Each orb (by its place in the project list) gets its own voice: waveform, octave,
// a short note pattern and how fast it plays, so orbs are easy to tell apart by ear.
const VOICES = [
  { type: 'triangle', octave: 5, pattern: [0, 2, 4], rate: 3, cutoff: 4000 },
  { type: 'square', octave: 4, pattern: [0, 4], rate: 2, cutoff: 1600 },
  { type: 'sawtooth', octave: 5, pattern: [0, 1, 2, 3], rate: 3.5, cutoff: 2000 },
  { type: 'sawtooth', octave: 4, pattern: [0, 2], rate: 1.6, cutoff: 1300 },
  { type: 'triangle', octave: 6, pattern: [4, 2, 0], rate: 4.5, cutoff: 5000 },
  { type: 'square', octave: 5, pattern: [0, 3], rate: 2.5, cutoff: 2200 },
  { type: 'sawtooth', octave: 4, pattern: [0, 2, 4, 2], rate: 2, cutoff: 1500 },
  { type: 'sawtooth', octave: 5, pattern: [0, 4, 3], rate: 3, cutoff: 1800 },
  { type: 'triangle', octave: 5, pattern: [0, 4], rate: 1.2, cutoff: 3000 },
  { type: 'square', octave: 6, pattern: [2, 0], rate: 4, cutoff: 2600 },
];
const voiceOf = (i) => VOICES[((i % VOICES.length) + VOICES.length) % VOICES.length];

// Play one note in an orb's voice: step is a scale step above the orb's own root note.
function voice(i, step = 0, { vol = 0.04, dur, octave = 0, pan = 0, delay = 0, echoAmount = 0.35 } = {}) {
  const v = voiceOf(i);
  const freq = noteFreq(i + step, v.octave + octave);
  const len = dur ?? Math.min(0.35, 0.9 / v.rate);
  synth({ freq, dur: len, type: v.type, vol, pan, delay, cutoff: v.cutoff, cutoffEnd: v.cutoff * 0.25, echoAmount });
}

// A long, slowly swelling synth pad in an orb's voice.
function pad(i, steps, { vol = 0.028, delay = 0, short = false, bus = null } = {}) {
  const v = voiceOf(i);
  const type = v.type === 'square' ? 'sawtooth' : v.type; // squares are too buzzy held long
  const octave = Math.min(v.octave, 5) - 1;
  steps.forEach((step, k) => synth({
    freq: noteFreq(i + step, octave),
    type,
    vol,
    attack: short ? 0.05 : 0.3 + (i % 3) * 0.15 + k * 0.08,
    dur: short ? 0.8 : 1.8 + (i % 4) * 0.4,
    cutoff: 250,
    cutoffEnd: v.cutoff,
    spread: 5 + ((i * 3) % 12),
    echoAmount: 0.5,
    delay: delay + k * 0.04,
    bus,
  }));
}

// While an orb is held it drifts through slow, overlapping pad notes of its pattern.
function updateHeld(dt, camera, orbs) {
  if (!held) return;
  // Pulling the orb in with the wheel makes it louder; pushing it away fades it.
  const d = orbs[held.i] ? camera.position.distanceTo(orbs[held.i].group.position) : 20;
  const near = Math.max(0, Math.min(1, 1 - (d - 3) / 25));
  heldBus.gain.setTargetAtTime(0.3 + 1.7 * near ** 1.5, ctx.currentTime, 0.1);
  held.timer -= dt;
  if (held.timer > 0) return;
  const v = voiceOf(held.i);
  pad(held.i, [v.pattern[held.step % v.pattern.length]], { vol: 0.016, bus: heldBus });
  held.step++;
  held.timer = (1.6 + (held.i % 3) * 0.4) * (1 - 0.45 * near);
}

// --- The sound effects, by what causes them -------------------------------------

const rnd = (a, b) => a + Math.random() * (b - a);

export const sfx = {
  creak() {
    tone({ freq: 140, to: 100, dur: 0.35, type: 'sawtooth', vol: 0.04, attack: 0.05 });
    tone({ freq: 210, to: 160, dur: 0.25, type: 'sawtooth', vol: 0.025, attack: 0.08 });
  },
  // The swirl: filtered noise sweeping up like a rising wind, with a pad climbing the scale.
  riser(seconds) {
    noise({ dur: 0.8, attack: seconds, filter: 'bandpass', freq: 220, to: 2600, q: 1.5, vol: 0.07 });
    [0, 2, 4, 5, 7].forEach((step, k) => synth({
      freq: noteFreq(step, 3), type: 'sawtooth', vol: 0.02, attack: 1.2, dur: 1.8,
      cutoff: 300, cutoffEnd: 2400, echoAmount: 0.6, delay: (k * seconds) / 5,
    }));
  },
  // A glyph locking into place: a tiny high blip from the scale.
  tick(level = 0.5) {
    synth({ freq: noteFreq((Math.random() * 5) | 0, 6), dur: 0.04, type: 'square', vol: 0.006 + level * 0.014, cutoff: 5000, cutoffEnd: 1500, echoAmount: 0.15, pan: rnd(-0.6, 0.6) });
  },
  // A wall slamming flat onto the grass, then its dust.
  thud(pan = 0) {
    tone({ freq: 90, to: 32, dur: 0.45, vol: 0.4, pan });
    noise({ dur: 0.35, filter: 'lowpass', freq: 500, to: 90, vol: 0.3, pan });
    noise({ dur: 0.9, filter: 'bandpass', freq: 1400, to: 300, q: 0.7, vol: 0.05, attack: 0.08, delay: 0.05, pan });
  },
  lift: () => noise({ dur: 1.6, attack: 0.4, filter: 'bandpass', freq: 400, to: 1800, q: 0.8, vol: 0.05 }),
  // A project orb arriving in orbit.
  chime(i = 0) {
    voice(i, 0, { vol: 0.03, echoAmount: 0.5 });
    voice(i, 2, { vol: 0.025, echoAmount: 0.5, delay: 0.09 });
  },
  aim: (i = 0) => voice(i, 0, { vol: 0.03, echoAmount: 0.25 }),
  grab(i = 0) {
    pad(i, [...new Set([0, ...voiceOf(i).pattern])].slice(0, 3), { bus: heldBus });
    held = { i, step: 1, timer: 1.5 };
  },
  drop(i = 0) {
    pad(i, [2], { vol: 0.025, short: true });
    pad(i, [0], { vol: 0.025, short: true, delay: 0.12 });
  },
  release() { held = null; },
  whoosh(speed = 1, i = 0) {
    noise({ dur: 0.35, filter: 'bandpass', freq: 2200, to: 300, q: 1.2, vol: Math.min(0.2, 0.06 + speed * 0.004) });
    voice(i, 4, { vol: 0.03, dur: 0.3 });
  },
  bonk(size = 1, strength = 1, i = 0, j = i) {
    const octave = size > 2.2 ? -1 : 0;
    const v = Math.min(0.09, 0.03 + strength * 0.005);
    voice(i, 0, { vol: v, octave, echoAmount: 0.4 });
    voice(j, 0, { vol: v * 0.7, octave, echoAmount: 0.4, delay: 0.03 });
  },
  readOn() {
    noise({ dur: 0.015, filter: 'highpass', freq: 2000, vol: 0.12 });
    [0, 2, 4].forEach((k, i) => synth({ freq: noteFreq(k, 4), dur: 0.15, type: 'square', vol: 0.025, cutoff: 3000, cutoffEnd: 800, delay: i * 0.06 }));
  },
  readOff() {
    noise({ dur: 0.02, filter: 'highpass', freq: 1500, vol: 0.1 });
    [4, 0].forEach((k, i) => synth({ freq: noteFreq(k, 4), dur: 0.12, type: 'square', vol: 0.02, cutoff: 2500, cutoffEnd: 600, delay: i * 0.06 }));
  },
  page: () => synth({ freq: noteFreq(4, 5), dur: 0.08, type: 'square', vol: 0.02, cutoff: 3000, cutoffEnd: 900 }),
  open() {
    [0, 2, 4, 7].forEach((k, i) => synth({ freq: noteFreq(k, 4), dur: 0.2, type: 'triangle', vol: 0.03, cutoff: 3500, cutoffEnd: 900, delay: i * 0.05 }));
  },
};

// Each frame: volume, ears, the bass-line wind, and faint synth chatter from nearby orbs.
const _to = { x: 0, y: 0, z: 0 };
export function updateSound(dt, camera, orbs) {
  if (!ready()) return;
  master.gain.setTargetAtTime(settings.mute ? 0 : settings.volume, ctx.currentTime, 0.05);
  updateListener(camera);
  updateWind(dt, camera);
  updateHeld(dt, camera, orbs);
  const e = camera.matrixWorld.elements; // camera right vector is the first column
  orbs.forEach((o, i) => {
    if (!o.group.visible) return;
    const p = o.group.position;
    _to.x = p.x - camera.position.x;
    _to.y = p.y - camera.position.y;
    _to.z = p.z - camera.position.z;
    const d = Math.hypot(_to.x, _to.y, _to.z);
    if (d > 45 || Math.random() > 0.35 * dt) return;
    const pan = (_to.x * e[0] + _to.y * e[1] + _to.z * e[2]) / (d || 1);
    const pattern = voiceOf(i).pattern;
    voice(i, pattern[Math.floor(Math.random() * pattern.length)], { vol: 0.022 * (1 - d / 45), pan, echoAmount: 0.45 });
  });
}
