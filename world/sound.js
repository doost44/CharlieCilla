import { settings } from './options.js';

// Sound, made with the Web Audio API (ported from Automation Map). Effects are
// synthesised on the fly from oscillators and filtered noise, and everything rings
// into one big reverb made in code, so the warehouse sounds huge. Each project
// station has its own small generative synth, all in the same key, that swells in as
// you walk up to it (after the Kid A Mnesia exhibition's rooms; original synthesis).
// The one audio file is Charlie's own bass line, which drifts round the space as a
// musical wind. The AudioContext is made by entry.js inside the E key press, so
// browsers allow it.

const BASSLINE = new URL('./assets/audio/bassline.m4a', import.meta.url).href;

const PULSE = 0.375; // seconds: an eighth note at 80 bpm. Station notes fall on this grid; the echo repeats on it.
const HEAR = 14; // station voices are silent beyond this many metres...
const FULL = 3; // ...at full level this close, where the first visit also brings an arrival swell
const MAX_VOICES = 3; // only the nearest stations sound at once
const LOOKAHEAD = 0.3; // seconds of station notes scheduled ahead of time
const NOTE_VOL = 0.045;
const PAD_VOL = 0.032;
const DRONE_VOL = 0.02;
const OPENING = 4; // seconds over which the stations come in once the hall shows (as the walls fall)
// The hall's reverb tail (seconds, decay time, silent gap before it) and its wet level
// in the closed room and once the hall shows.
const VERB = { seconds: 5, rt60: 4.5, preDelay: 0.03, room: 0.4, hall: 1.6 };

// The track sits in A-flat major pentatonic, so every synth note comes from these.
const SCALE = [8, 10, 0, 3, 5]; // Ab Bb C Eb F, as semitones above C
const noteFreq = (i, octave) => {
  const pc = SCALE[((i % 5) + 5) % 5];
  const midi = 12 * (octave + 1 + Math.floor(i / 5)) + pc;
  return 440 * 2 ** ((midi - 69) / 12);
};

let ctx = null;
let master = null; // volume and mute
let music = null; // the music slider: bass-line wind, drone bed and station voices
let musicSends = null; // { echo, verb }: the music's way into the echo and reverb, under the same slider
let echo = null; // shared delay the synth sounds are sent into
let verb = null; // input of the shared hall reverb
let verbOut = null; // its wet level
let noiseBuf = null;
let wind = null; // the bass-line wind
let drone = null; // the hall's low bed, made once the hall shows
let inHall = false;
let hallAt = 0; // when the hall showed, on the context's clock
let stations = []; // lamp positions, by station index
const voices = new Map(); // station index → its sounding voice (never more than MAX_VOICES)
const arrived = new Set(); // stations already greeted with an arrival swell
const ear = { x: 0, y: 0, z: 0 }; // where the listener was last frame

export function startSound(audioContext) {
  ctx = audioContext;
  if (!ctx) return;
  ctx.resume?.()?.catch?.(() => {});
  // A limiter at the very end, so a pile-up of sounds never clips.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 4;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  limiter.connect(ctx.destination);
  master = gain(settings.mute ? 0 : settings.volume, limiter);
  music = gain(settings.music, master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  buildReverb();
  buildEcho();
  musicSends = { echo: gain(settings.music, echo), verb: gain(settings.music, verb) };
  startWind();
}

// Leaving the world: close the context, which stops and frees every node in it.
export function stopSound() {
  ctx?.close?.()?.catch?.(() => {});
  ctx = master = music = musicSends = echo = verb = verbOut = noiseBuf = wind = drone = null;
  inHall = false;
  stations = [];
  voices.clear();
  arrived.clear();
}

// Browsers may hold the context suspended until a click; call this from one.
export const resumeSound = () => ctx?.resume?.()?.catch?.(() => {});

// The stations' lamp positions (Vector3s), in station order (index 0 = newest).
export function setStations(positions = []) {
  for (const v of voices.values()) freeVoice(v);
  voices.clear();
  arrived.clear();
  stations = positions.map((p) => ({ x: p.x, y: p.y, z: p.z }));
}

const ready = () => ctx && ctx.state === 'running';
const rnd = (a, b) => a + Math.random() * (b - a);
const smooth = (k) => k * k * (3 - 2 * k);

function gain(value, dest) {
  const g = ctx.createGain();
  g.gain.value = value;
  if (dest) g.connect(dest);
  return g;
}

function filter(type, freq, q = 1, dest) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  if (dest) f.connect(dest);
  return f;
}

function osc(type, freq, dest, detune = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detune;
  if (dest) o.connect(dest);
  o.start();
  return o;
}

// Slowly push an audio setting up and down with a sine (an LFO).
function wobble(param, rate, amount) {
  const depth = gain(amount, param);
  return [osc('sine', rate * rnd(0.9, 1.1), depth), depth];
}

function send(from, to, amount) {
  if (amount && to) from.connect(gain(amount, to));
}

// A 3D position for a sound (HRTF, so it is heard from the right direction). Distance
// is handled by our own gains, not the panner.
const panner = (p) => new PannerNode(ctx, {
  panningModel: 'HRTF', distanceModel: 'inverse', rolloffFactor: 0, positionX: p.x, positionY: p.y, positionZ: p.z,
});

// Send a node to the speakers (or to dest), panned left (-1) to right (1), with some
// of it into the echo and the reverb.
function out(node, pan = 0, echoAmount = 0, verbAmount = 0.15, dest = master) {
  let last = node;
  if (pan && dest === master && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    node.connect(p);
    last = p;
  }
  last.connect(dest);
  send(last, echo, echoAmount);
  send(last, verb, verbAmount);
}

// --- The hall: reverb and echo -------------------------------------------------------

function buildReverb() {
  verb = filter('highpass', 120); // lows kept out of the tail so it doesn't boom
  const convolver = ctx.createConvolver();
  convolver.buffer = hallImpulse();
  verbOut = gain(VERB.room, master);
  verb.connect(convolver);
  convolver.connect(verbOut);
}

// The echo pattern of an imaginary huge hall: a few early reflections off the nearer
// walls, then noise dying away over seconds and getting darker as it goes (the air and
// brick swallow the highs first). Each ear gets its own noise, so the tail is wide.
function hallImpulse() {
  const rate = ctx.sampleRate;
  const length = Math.floor(VERB.seconds * rate);
  const start = Math.floor(VERB.preDelay * rate);
  const buffer = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buffer.getChannelData(ch);
    let low = 0, a = 1;
    for (let i = start; i < length; i++) {
      const t = (i - start) / rate;
      // A one-pole lowpass whose cutoff slides from about 8 kHz down to 500 Hz.
      if ((i & 63) === 0) a = 1 - Math.exp((-2 * Math.PI * (500 + 7500 * Math.exp(-t * 1.5))) / rate);
      low += a * (Math.random() * 2 - 1 - low);
      d[i] = low * Math.exp((-6.9 * t) / VERB.rt60) * Math.min(1, t / 0.01);
    }
    for (let k = 0; k < 8; k++) d[start + Math.floor(rate * rnd(0.01, 0.08))] += (Math.random() < 0.5 ? -0.5 : 0.5) * (1 - k / 10);
  }
  return buffer;
}

// A soft, dark echo, one pulse long, with fading repeats.
function buildEcho() {
  echo = ctx.createDelay(1);
  echo.delayTime.value = PULSE;
  const tone = filter('lowpass', 1800, 1);
  const feedback = gain(0.38, echo);
  echo.connect(tone);
  tone.connect(feedback);
  tone.connect(master);
  send(tone, verb, 0.3);
}

// --- Building blocks ---------------------------------------------------------------

// Gain that rises then fades, so sounds don't click.
function envelope(vol, attack, dur, t = ctx.currentTime) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
  return g;
}

function tone({ freq, to = freq, dur = 0.15, type = 'sine', vol = 0.2, pan = 0, attack = 0.005, delay = 0, verb: wet = 0.15, dest }) {
  if (!ready()) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t + attack + dur);
  const g = envelope(vol, attack, dur, t);
  o.connect(g);
  out(g, pan, 0, wet, dest);
  o.start(t);
  o.stop(t + attack + dur + 0.05);
}

function noise({ dur = 0.2, filter: type = 'lowpass', freq = 1000, to = freq, q = 1, vol = 0.2, pan = 0, attack = 0.005, delay = 0, verb: wet = 0.15, dest }) {
  if (!ready()) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = filter(type, freq, q);
  f.frequency.setValueAtTime(freq, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t + attack + dur);
  const g = envelope(vol, attack, dur, t);
  src.connect(f);
  f.connect(g);
  out(g, pan, 0, wet, dest);
  src.start(t, Math.random() * 0.5);
  src.stop(t + attack + dur + 0.05);
}

// One synth note: two slightly detuned oscillators through a filter that closes
// as the note fades (a classic analogue pluck/pad). at: an exact start time on the
// context's clock; bus: play into that node only (a station voice's own chain).
function synth({ freq, dur = 0.3, type = 'sawtooth', vol = 0.06, pan = 0, attack = 0.01, cutoff = 2400, cutoffEnd = 400, echoAmount = 0.35, verb: wet = 0.3, delay = 0, at, spread = 7, bus = null, dest }) {
  if (!ready()) return;
  const t = at ?? ctx.currentTime + delay;
  const f = filter('lowpass', cutoff, 4);
  f.frequency.setValueAtTime(cutoff, t);
  f.frequency.exponentialRampToValueAtTime(cutoffEnd, t + attack + dur);
  const g = envelope(vol, attack, dur, t);
  f.connect(g);
  if (bus) g.connect(bus);
  else out(g, pan, echoAmount, wet, dest);
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

// A creak: the stick-slip of a joint under weight, a buzzy pulse train slowing down
// through a woody resonance.
function creaking({ rate = 42, to = 26, freq = 950, dur = 0.35, vol = 0.3, attack = 0.04, delay = 0 }) {
  if (!ready()) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(rate, t);
  o.frequency.exponentialRampToValueAtTime(to, t + attack + dur);
  const f = filter('bandpass', freq, 5);
  const g = envelope(vol, attack, dur, t);
  o.connect(f);
  f.connect(g);
  out(g, 0, 0, 0.2);
  o.start(t);
  o.stop(t + attack + dur + 0.05);
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
    const sweep = filter('bandpass', 180, 0.9);
    const air = filter('bandpass', 600, 1.2); // airy noise riding the same sweep
    const airGain = gain(0.05);
    const airSrc = ctx.createBufferSource();
    airSrc.buffer = noiseBuf;
    airSrc.loop = true;
    airSrc.connect(air);
    air.connect(airGain);

    const level = gain(0);
    const pan = new PannerNode(ctx, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 6, rolloffFactor: 0.6 });
    src.connect(sweep);
    sweep.connect(level);
    airGain.connect(level);
    level.connect(pan);
    pan.connect(music);
    send(level, musicSends.verb, 0.2);
    src.start();
    airSrc.start();
    wind = { sweep, air, level, pan, t: 0 };
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
  wind.level.gain.setTargetAtTime((0.25 + 0.3 * gust) * fadeIn, now, 0.3);
  wind.sweep.frequency.setTargetAtTime(110 + 260 * gust, now, 0.3);
  wind.air.frequency.setTargetAtTime(600 + 1400 * gust, now, 0.3);
  // Circle round the player at changing speed and height.
  const a = t * 0.35 + Math.sin(t * 0.17) * 2;
  const r = 9 + 4 * Math.sin(t * 0.11);
  const p = camera.position;
  setPos(wind.pan, p.x + Math.cos(a) * r, p.y + 2 + 3 * Math.sin(t * 0.23), p.z + Math.sin(a) * r);
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
  ear.x = p.x;
  ear.y = p.y;
  ear.z = p.z;
  if (l.positionX) {
    l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z;
    l.forwardX.value = fwd[0]; l.forwardY.value = fwd[1]; l.forwardZ.value = fwd[2];
    l.upX.value = up[0]; l.upY.value = up[1]; l.upZ.value = up[2];
  } else {
    l.setPosition(p.x, p.y, p.z);
    l.setOrientation(...fwd, ...up);
  }
}

// --- The drone bed --------------------------------------------------------------------
// Once the hall shows: a low Ab and Eb on slowly beating oscillators under a breathing
// filter, and a faint rush of air, like the hum of a huge empty building.

function startDrone() {
  const level = gain(0, music);
  send(level, musicSends.verb, 0.5);
  const low = filter('lowpass', 170, 0.8, level);
  wobble(low.frequency, 0.045, 70);
  osc('sawtooth', noteFreq(0, 1), low, -6);
  osc('sawtooth', noteFreq(0, 1), low, 5);
  osc('triangle', noteFreq(3, 2), low, 0);
  osc('sine', noteFreq(0, 2), low, 3);
  const air = gain(0.25, level);
  wobble(air.gain, 0.07, 0.15);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  src.connect(filter('bandpass', 400, 0.5, air));
  src.start();
  drone = { level };
}

// --- Station voices -------------------------------------------------------------------
// Each station (by its place in the list) gets its own voice, all in the track's key.
// type/octave/pattern/rate/cutoff are the short notes (as the v1 orbs had); every: a
// note every this many pulses; len: note length in seconds; q: filter resonance;
// rest: chance of a note being left out; pad: [waveform, octave, chord steps, filter
// cutoff] of the chord held underneath. Different timbres, same key and pulse, so
// overlapping stations play as one piece.
const VOICES = [
  { type: 'triangle', octave: 5, pattern: [0, 2, 4, 5], rate: 3, cutoff: 4000, every: 2, len: 0.9, q: 2, rest: 0.25, pad: ['triangle', 3, [0, 4], 900] },
  { type: 'square', octave: 4, pattern: [0, 4, 2], rate: 2, cutoff: 1400, every: 3, len: 0.35, q: 6, rest: 0.3, pad: ['sawtooth', 3, [0, 2], 500] },
  { type: 'sawtooth', octave: 5, pattern: [0, 1, 2, 3], rate: 3.5, cutoff: 2000, every: 1, len: 0.18, q: 5, rest: 0.4, pad: ['triangle', 4, [0, 3], 1200] },
  { type: 'sine', octave: 4, pattern: [0, 2], rate: 1.6, cutoff: 1300, every: 4, len: 1.6, q: 1, rest: 0.15, pad: ['sawtooth', 2, [0, 2, 4], 400] },
  { type: 'triangle', octave: 5, pattern: [4, 2, 0], rate: 4.5, cutoff: 5000, every: 3, len: 0.25, q: 2, rest: 0.3, pad: ['sine', 4, [0, 4], 2000] },
  { type: 'square', octave: 5, pattern: [0, 3, 1], rate: 2.5, cutoff: 2200, every: 2, len: 0.25, q: 8, rest: 0.3, pad: ['triangle', 3, [0, 3], 800] },
  { type: 'sawtooth', octave: 4, pattern: [0, 2, 4, 2], rate: 2, cutoff: 1500, every: 2, len: 0.6, q: 2, rest: 0.2, pad: ['sawtooth', 3, [0, 4], 600] },
  { type: 'sine', octave: 5, pattern: [0, 4, 3, 5], rate: 3, cutoff: 3000, every: 3, len: 1.2, q: 1, rest: 0.2, pad: ['triangle', 3, [0, 2, 4], 1000] },
  { type: 'triangle', octave: 5, pattern: [0, 4], rate: 1.2, cutoff: 3000, every: 4, len: 2, attack: 0.4, q: 1, rest: 0.1, pad: ['sawtooth', 3, [0, 3], 500] },
  { type: 'square', octave: 5, pattern: [2, 0, 4], rate: 4, cutoff: 2600, every: 1, len: 0.12, q: 3, rest: 0.5, pad: ['sine', 4, [0, 2], 1500] },
  { type: 'sawtooth', octave: 3, pattern: [0, 2, 0, 4], rate: 1.5, cutoff: 700, every: 4, len: 1, q: 6, rest: 0.15, pad: ['triangle', 4, [0, 4], 1200] },
  { type: 'triangle', octave: 4, pattern: [0, 1, 2, 4, 3], rate: 2.5, cutoff: 2400, every: 2, len: 0.7, q: 2, rest: 0.25, pad: ['sine', 3, [0, 2], 900] },
];
const voiceOf = (i) => VOICES[((i % VOICES.length) + VOICES.length) % VOICES.length];
const rootOf = (i) => ((i % 5) + 5) % 5; // each station starts on its own note of the scale

// A station's sound: its notes and pad → filter (opens as you approach) → level
// (fades in) → a 3D panner at the lamp. The reverb gets more of it from afar.
function startVoice(i) {
  const s = voiceOf(i);
  const v = { i, s, root: rootOf(i), step: 0, next: 0, releasing: false, end: 0 };
  v.input = ctx.createGain();
  v.filter = filter('lowpass', 200, s.q);
  v.level = gain(0);
  v.panner = panner(stations[i]);
  v.wet = gain(1, musicSends.verb);
  const echoSend = gain(0.15, musicSends.echo);
  v.input.connect(v.filter);
  v.filter.connect(v.level);
  v.level.connect(v.panner);
  v.panner.connect(music);
  v.level.connect(v.wet);
  v.level.connect(echoSend);
  // The pad: the voice's chord on detuned oscillators, breathing through its own filter.
  const [type, octave, chord] = s.pad;
  v.padFilter = filter('lowpass', 150, 0.7);
  v.pad = gain(0, v.level);
  v.padFilter.connect(v.pad);
  v.oscs = chord.flatMap((step) => [-8, 8].map((cents) => osc(type, noteFreq(v.root + step, octave), v.padFilter, cents)));
  const [lfo, depth] = wobble(v.padFilter.frequency, 0.05 + (i % 4) * 0.02, 120);
  v.oscs.push(lfo);
  v.nodes = [v.input, v.filter, v.level, v.panner, v.wet, echoSend, v.padFilter, v.pad, depth];
  return v;
}

function freeVoice(v) {
  for (const o of v.oscs) o.stop();
  for (const n of v.nodes) n.disconnect();
}

// Notes for the next moment, on the shared pulse grid, walking the voice's pattern
// with a little chance in it: rests, a step up or down the scale, an octave jump.
function playVoice(v, now) {
  const { s } = v;
  const every = PULSE * s.every;
  if (v.next < now) v.next = Math.ceil(now / every) * every; // (back) onto the grid
  while (v.next < now + LOOKAHEAD) {
    if (Math.random() > s.rest) {
      let step = s.pattern[v.step % s.pattern.length];
      if (Math.random() < 0.15) step += Math.random() < 0.5 ? 1 : -1;
      if (Math.random() < 0.06) step += s.octave >= 5 ? -5 : 5; // now and then an octave away (down for the high voices)
      synth({
        freq: noteFreq(v.root + step, s.octave), type: s.type, at: v.next + rnd(0, 0.012),
        dur: s.len, attack: s.attack ?? 0.01, cutoff: s.cutoff * 1.5, cutoffEnd: s.cutoff * 0.3, spread: 6,
        vol: NOTE_VOL * (v.step % s.pattern.length === 0 ? 1 : 0.75) * rnd(0.8, 1), bus: v.input,
      });
    }
    v.step++;
    v.next += every;
  }
}

// The first time you reach a station: a slow chord in its voice swells up and fades.
function arrival(v) {
  const { s } = v;
  [0, 2, 4].forEach((step, k) => synth({
    freq: noteFreq(v.root + s.pattern[0] + step, Math.max(3, s.octave - 1)),
    type: s.type === 'square' ? 'sawtooth' : s.type,
    vol: 0.02, attack: 1.2 + k * 0.3, dur: 3.5, cutoff: 300, cutoffEnd: s.cutoff, spread: 9, bus: v.input,
  }));
}

function updateStations(now) {
  // Which stations should sound: the nearest few within earshot. One already sounding
  // gets a metre of slack, so voices don't flicker on and off at the edge.
  const near = [];
  if (inHall) {
    stations.forEach((p, i) => {
      const slack = voices.get(i)?.releasing === false ? 1 : 0;
      const d = Math.hypot(p.x - ear.x, p.z - ear.z) - slack;
      if (d < HEAR) near.push({ i, d });
    });
  }
  near.sort((a, b) => a.d - b.d);
  const wanted = new Set(near.slice(0, MAX_VOICES).map((n) => n.i));
  // The rest fade out, and are stopped and disconnected once silent.
  for (const v of voices.values()) {
    if (wanted.has(v.i)) v.releasing = false;
    else if (!v.releasing) {
      v.releasing = true;
      v.end = now + 1.5;
    } else if (now > v.end) {
      freeVoice(v);
      voices.delete(v.i);
    }
  }
  for (const i of wanted) if (!voices.has(i) && voices.size < MAX_VOICES) voices.set(i, startVoice(i));

  // Closer: louder, brighter, a slower swell of the pad, and less of it in the reverb.
  const opening = Math.min(1, (now - hallAt) / OPENING);
  for (const v of voices.values()) {
    const p = stations[v.i];
    const d = Math.hypot(p.x - ear.x, p.z - ear.z);
    const k = v.releasing ? 0 : smooth(Math.min(1, Math.max(0, (HEAR - d) / (HEAR - FULL)))) * opening;
    v.level.gain.setTargetAtTime(k, now, v.releasing ? 0.3 : 0.5);
    v.filter.frequency.setTargetAtTime(200 * (v.s.cutoff / 200) ** k, now, 0.5);
    v.padFilter.frequency.setTargetAtTime(150 * (v.s.pad[3] / 150) ** k, now, 1);
    v.pad.gain.setTargetAtTime(PAD_VOL * k ** 1.5, now, 2.5);
    v.wet.gain.setTargetAtTime(1 - 0.5 * k, now, 0.5);
    if (v.releasing) continue;
    playVoice(v, now);
    if (d < FULL && !arrived.has(v.i)) {
      arrived.add(v.i);
      arrival(v);
    }
  }
}

// A one-off sound from station i's lamp, louder the nearer you are. The panner is
// disconnected again once the sound has died away.
function fromStation(i, seconds) {
  const p = stations[i];
  if (!p || !ready()) return master;
  const d = Math.hypot(p.x - ear.x, p.z - ear.z);
  const g = gain(0.35 + 0.65 * Math.max(0, 1 - d / 40));
  const pan = panner(p);
  g.connect(pan);
  pan.connect(master);
  setTimeout(() => { g.disconnect(); pan.disconnect(); }, (seconds + 1) * 1000);
  return g;
}

// Play one note in a station's (v1: orb's) voice: step is a scale step above its root.
function voice(i, step = 0, { vol = 0.04, dur, octave = 0, pan = 0, delay = 0, echoAmount = 0.35 } = {}) {
  const v = voiceOf(i);
  const freq = noteFreq(rootOf(i) + step, v.octave + octave);
  const len = dur ?? Math.min(0.35, 0.9 / v.rate);
  synth({ freq, dur: len, type: v.type, vol, pan, delay, cutoff: v.cutoff, cutoffEnd: v.cutoff * 0.25, echoAmount });
}

// A long, slowly swelling synth pad in a voice.
function pad(i, steps, { vol = 0.028, delay = 0, short = false } = {}) {
  const v = voiceOf(i);
  const type = v.type === 'square' ? 'sawtooth' : v.type; // squares are too buzzy held long
  const octave = Math.min(v.octave, 5) - 1;
  steps.forEach((step, k) => synth({
    freq: noteFreq(rootOf(i) + step, octave),
    type,
    vol,
    attack: short ? 0.05 : 0.3 + (i % 3) * 0.15 + k * 0.08,
    dur: short ? 0.8 : 1.8 + (i % 4) * 0.4,
    cutoff: 250,
    cutoffEnd: v.cutoff,
    spread: 5 + ((i * 3) % 12),
    echoAmount: 0.5,
    delay: delay + k * 0.04,
  }));
}

// --- The sound effects, by what causes them -------------------------------------

let stepSide = 1;

export const sfx = {
  // The office chair taking your weight.
  creak() {
    creaking({ rate: 40, to: 24, freq: 900, dur: 0.4, vol: 0.35 });
    creaking({ rate: 55, to: 38, freq: 1500, dur: 0.25, vol: 0.2, delay: 0.12 });
    tone({ freq: 140, to: 100, dur: 0.35, type: 'sawtooth', vol: 0.02, attack: 0.05 });
  },
  // Standing up: the seat springs back with a sigh of its gas lift, the frame creaks.
  stand() {
    noise({ dur: 0.18, filter: 'bandpass', freq: 1300, q: 0.8, vol: 0.03 }); // clothes on the seat
    noise({ dur: 0.45, attack: 0.1, filter: 'bandpass', freq: 2200, to: 4200, q: 0.9, vol: 0.03, delay: 0.05 });
    creaking({ rate: 30, to: 50, freq: 1100, dur: 0.3, vol: 0.25, delay: 0.08 });
  },
  // Sitting down: weight onto the cushion, the gas lift hissing as it sinks, a creak.
  sit() {
    noise({ dur: 0.12, filter: 'lowpass', freq: 240, to: 80, vol: 0.14 });
    noise({ dur: 0.5, attack: 0.02, filter: 'bandpass', freq: 4000, to: 1800, q: 0.9, vol: 0.035, delay: 0.03 });
    creaking({ rate: 44, to: 25, freq: 880, dur: 0.38, vol: 0.32, delay: 0.05 });
  },
  // A footstep on concrete: heel thump, the hard tok of the sole, a scuff of grit.
  // Left and right alternate a little; no two are quite the same.
  step(level = 1) {
    stepSide = -stepSide;
    const pan = stepSide * 0.12, v = level * rnd(0.85, 1.1);
    tone({ freq: rnd(95, 125), to: 45, dur: 0.07, vol: 0.13 * v, pan, verb: 0.2 });
    noise({ dur: rnd(0.03, 0.05), filter: 'bandpass', freq: rnd(850, 1400), to: 500, q: 1.4, vol: 0.12 * v, pan, verb: 0.35 });
    noise({ dur: rnd(0.02, 0.04), filter: 'highpass', freq: rnd(3000, 4500), vol: 0.04 * v, pan, delay: rnd(0.004, 0.02), verb: 0.3 });
    for (let k = 0; k < 2; k++) noise({ dur: 0.006, filter: 'highpass', freq: rnd(6000, 9000), vol: 0.02 * v, pan, delay: rnd(0.01, 0.07), verb: 0.1 });
  },
  jump() {
    noise({ dur: 0.06, filter: 'bandpass', freq: 2600, to: 1500, q: 0.8, vol: 0.06, verb: 0.2 });
    tone({ freq: 110, to: 60, dur: 0.05, vol: 0.06, verb: 0.2 });
  },
  land() {
    tone({ freq: 90, to: 38, dur: 0.12, vol: 0.2, verb: 0.3 });
    noise({ dur: 0.06, filter: 'bandpass', freq: 1000, to: 450, q: 1.2, vol: 0.15, verb: 0.4 });
    noise({ dur: 0.05, filter: 'highpass', freq: 3500, vol: 0.05, delay: 0.01, verb: 0.3 });
  },
  // The swirl: filtered noise sweeping up like a rising wind, with a pad climbing the scale.
  riser(seconds) {
    noise({ dur: 0.8, attack: seconds, filter: 'bandpass', freq: 220, to: 2600, q: 1.5, vol: 0.07, verb: 0.3 });
    [0, 2, 4, 5, 7].forEach((step, k) => synth({
      freq: noteFreq(step, 3), type: 'sawtooth', vol: 0.02, attack: 1.2, dur: 1.8,
      cutoff: 300, cutoffEnd: 2400, echoAmount: 0.6, verb: 0.4, delay: (k * seconds) / 5,
    }));
  },
  // A glyph locking into place: a tiny high blip from the scale.
  tick(level = 0.5) {
    synth({ freq: noteFreq((Math.random() * 5) | 0, 6), dur: 0.04, type: 'square', vol: 0.006 + level * 0.014, cutoff: 5000, cutoffEnd: 1500, echoAmount: 0.15, verb: 0.1, pan: rnd(-0.6, 0.6) });
  },
  // A wall slamming flat onto the concrete, then its dust, booming round the hall.
  thud(pan = 0) {
    tone({ freq: 90, to: 32, dur: 0.45, vol: 0.4, pan, verb: 0.5 });
    noise({ dur: 0.35, filter: 'lowpass', freq: 500, to: 90, vol: 0.3, pan, verb: 0.6 });
    noise({ dur: 0.9, filter: 'bandpass', freq: 1400, to: 300, q: 0.7, vol: 0.05, attack: 0.08, delay: 0.05, pan, verb: 0.3 });
  },
  lift: () => noise({ dur: 1.6, attack: 0.4, filter: 'bandpass', freq: 400, to: 1800, q: 0.8, vol: 0.05, verb: 0.4 }),
  // A station's lamp flickering on: the filament's buzz and a soft hit in the station's voice, from the lamp.
  lampOn(i = 0) {
    const v = voiceOf(i), dest = fromStation(i, 2.5);
    noise({ dur: 0.05, filter: 'bandpass', freq: 3200, q: 2, vol: 0.03, verb: 0.3, dest });
    tone({ freq: 120, dur: 0.18, type: 'square', vol: 0.006, attack: 0.01, verb: 0, dest }); // mains hum
    synth({
      freq: noteFreq(rootOf(i) + v.pattern[0], Math.min(5, v.octave)), type: v.type === 'square' ? 'triangle' : v.type,
      dur: 1.4, attack: 0.015, vol: 0.045, cutoff: v.cutoff, cutoffEnd: 300, echoAmount: 0.3, verb: 0.6, delay: 0.04, dest,
    });
  },
  // Opening desc/project: a paper tick and a small two-note chime in the station's voice.
  cardTick(i = 0) {
    const v = voiceOf(i), type = v.type === 'square' || v.type === 'sawtooth' ? 'triangle' : v.type;
    const octave = Math.min(6, v.octave + 1);
    noise({ dur: 0.012, filter: 'highpass', freq: 4000, vol: 0.035, verb: 0.1 });
    synth({ freq: noteFreq(rootOf(i) + 4, octave - 1), type, dur: 0.45, attack: 0.004, vol: 0.024, cutoff: 6000, cutoffEnd: 1500, echoAmount: 0.25, verb: 0.35 });
    synth({ freq: noteFreq(rootOf(i) + 7, octave - 1), type, dur: 0.6, attack: 0.004, vol: 0.017, cutoff: 6000, cutoffEnd: 1500, echoAmount: 0.25, verb: 0.35, delay: 0.07 });
  },

  // From v1's orbs and panels, kept so their callers still work.
  chime(i = 0) {
    voice(i, 0, { vol: 0.03, echoAmount: 0.5 });
    voice(i, 2, { vol: 0.025, echoAmount: 0.5, delay: 0.09 });
  },
  aim: (i = 0) => voice(i, 0, { vol: 0.03, echoAmount: 0.25 }),
  grab: (i = 0) => pad(i, [...new Set([0, ...voiceOf(i).pattern])].slice(0, 3)),
  drop(i = 0) {
    pad(i, [2], { vol: 0.025, short: true });
    pad(i, [0], { vol: 0.025, short: true, delay: 0.12 });
  },
  release() {},
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

// Each frame: volume, ears, the bass-line wind, and once the hall shows (hall: true)
// its drone bed, bigger reverb and the stations' voices.
export function updateSound(dt, camera, opts) {
  if (!ready()) return;
  const now = ctx.currentTime;
  if (opts?.hall && !inHall) hallAt = now;
  inHall = !!opts?.hall;
  master.gain.setTargetAtTime(settings.mute ? 0 : settings.volume, now, 0.05);
  for (const g of [music, musicSends.echo, musicSends.verb]) g.gain.setTargetAtTime(settings.music, now, 0.1);
  verbOut.gain.setTargetAtTime(inHall ? VERB.hall : VERB.room, now, 1.5);
  updateListener(camera);
  updateWind(dt, camera);
  if (inHall && !drone) startDrone();
  drone?.level.gain.setTargetAtTime(inHall ? DRONE_VOL : 0, now, 3);
  updateStations(now);
}

// What is sounding, for debugging in the console and for tests.
export function soundState() {
  return {
    state: ctx?.state ?? 'none',
    hall: inHall,
    wind: !!wind,
    drone: !!drone,
    arrived: [...arrived],
    voices: [...voices.values()].map((v) => ({
      i: v.i, releasing: v.releasing, level: +v.level.gain.value.toFixed(3),
      cutoff: Math.round(v.filter.frequency.value), pad: +v.pad.gain.value.toFixed(4),
    })),
  };
}
