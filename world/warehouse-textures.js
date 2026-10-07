import THREE from './three.js';
import { canvas, crunchy, rng } from './textures.js';

// Painted textures for the abandoned warehouse: whitewashed brick peeling to red,
// dusty concrete, corrugated roof sheets, steel-framed windows and their light.

const BRICK_W = 32, BRICK_H = 8; // pixels per brick (with its mortar) in every brick texture
export const BRICK_TILE = 2.4; // metres covered by the 256 px whitewash tile (so a brick is 0.3 x 0.075 m)

// Base colour plus per-pixel noise, written straight into the pixels (fast at 256 px).
function base(w, h, [R, G, B], spread, seed) {
  const c = canvas(w, h);
  const g = c.getContext('2d', { willReadFrequently: true });
  const r = rng(seed);
  const img = g.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const n = (r() - 0.5) * spread;
    img.data.set([R + n, G + n, B + n * 0.9, 255], i * 4);
  }
  g.putImageData(img, 0, 0);
  return { c, g, r };
}

// Add brightness noise over whatever is painted (keeps alpha).
function grain(g, spread, seed) {
  const { width: w, height: h } = g.canvas;
  const img = g.getImageData(0, 0, w, h);
  const r = rng(seed);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * spread;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n * 0.9;
  }
  g.putImageData(img, 0, 0);
}

// A rect drawn wrapped round the edges, so tiles stay seamless.
function wrapRect(g, x, y, w, h) {
  const W = g.canvas.width, H = g.canvas.height;
  x = ((x % W) + W) % W;
  y = ((y % H) + H) % H;
  for (const dx of [0, -W]) for (const dy of [0, -H]) g.fillRect(x + dx, y + dy, w, h);
}

// Big tiled surfaces: crunchy up close, mipmapped far away so 70 m of brick doesn't shimmer.
function tiled(c) {
  const t = crunchy(c);
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.generateMipmaps = true;
  return t;
}

// Red brick in running bond: mixed reds, soot, chipped corners, specks of old whitewash.
function brickCanvas(w, h, seed) {
  const c = canvas(w, h);
  const g = c.getContext('2d', { willReadFrequently: true });
  const r = rng(seed);
  g.fillStyle = '#8c857a';
  g.fillRect(0, 0, w, h);
  const reds = ['#8e3f2c', '#9c4a32', '#7a3326', '#a8583a', '#6e3428', '#94503c'];
  for (let y = 0; y < h; y += BRICK_H) {
    const off = (y / BRICK_H) % 2 ? BRICK_W / 2 : 0;
    for (let x = -off; x < w; x += BRICK_W) {
      g.fillStyle = reds[(r() * reds.length) | 0];
      wrapRect(g, x + 1, y + 1, BRICK_W - 1, BRICK_H - 1);
      g.fillStyle = `rgba(20,12,10,${r() * r() * 0.5})`; // soot
      wrapRect(g, x + 1, y + 1, BRICK_W - 1, BRICK_H - 1);
      g.fillStyle = 'rgba(255,220,190,0.12)'; // worn top edge
      wrapRect(g, x + 1, y + 1, BRICK_W - 1, 1);
      if (r() < 0.25) {
        g.fillStyle = '#8c857a'; // a chipped corner
        wrapRect(g, x + 1 + (r() < 0.5 ? 0 : BRICK_W - 4), y + 1, 3, 2);
      }
    }
  }
  for (let i = 0; i < w * h * 0.004; i++) {
    g.fillStyle = 'rgba(230,226,214,0.7)';
    g.fillRect((r() * w) | 0, (r() * h) | 0, 1 + ((r() * 2) | 0), 1);
  }
  grain(g, 26, seed + 1);
  return c;
}

export const redBrickTexture = () => tiled(brickCanvas(128, 128, 401));

// Whitewashed brick: chalky paint over the courses, dirty and streaked. (The paint
// flaking off to red brick is done with peel decals, so it doesn't repeat every tile.)
export function whitewashTexture() {
  const S = 256;
  const { c, g, r } = base(S, S, [200, 197, 188], 12, 402);
  for (let y = 0; y < S; y += BRICK_H) {
    const off = (y / BRICK_H) % 2 ? BRICK_W / 2 : 0;
    g.fillStyle = 'rgba(64,58,52,0.32)'; // the bed joint shows as a shadow line under the paint
    g.fillRect(0, y + BRICK_H - 1, S, 1);
    for (let x = -off; x < S; x += BRICK_W) {
      g.fillStyle = 'rgba(64,58,52,0.26)';
      wrapRect(g, x, y, 1, BRICK_H - 1);
      g.fillStyle = r() < 0.5 ? `rgba(255,252,240,${r() * 0.12})` : `rgba(110,100,84,${r() * 0.14})`;
      wrapRect(g, x + 1, y, BRICK_W - 1, BRICK_H - 1);
    }
  }
  for (let i = 0; i < 30; i++) {
    g.fillStyle = `rgba(80,72,62,${r() * 0.07})`; // dirty patches
    wrapRect(g, r() * S, r() * S, 20 + r() * 80, 10 + r() * 50);
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(52,46,40,${0.06 + r() * 0.14})`; // drips
    wrapRect(g, r() * S, r() * S, 1 + ((r() * 2) | 0), 10 + r() * 70);
  }
  for (let i = 0; i < 8; i++) {
    g.fillStyle = '#8e3f2c'; // a few tiny chips
    wrapRect(g, r() * S, r() * S, 2 + ((r() * 4) | 0), 2);
  }
  return tiled(c);
}

// A big ragged patch where the whitewash has fallen away in sheets (transparent elsewhere).
export function peelTexture() {
  const S = 256;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const r = rng(404);
  const rects = [];
  for (let k = 0; k < 60; k++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r());
    const w = 14 + r() * 44, h = 8 + r() * 22;
    rects.push([S / 2 + Math.cos(a) * d * 84 - w / 2, S / 2 + Math.sin(a) * d * 64 - h / 2, w, h]);
  }
  for (let k = 0; k < 18; k++) rects.push([12 + r() * (S - 40), 12 + r() * (S - 30), 3 + r() * 10, 2 + r() * 5]); // stray flakes
  g.fillStyle = 'rgba(46,38,32,0.55)'; // paint edge shadow
  for (const [x, y, w, h] of rects) g.fillRect(x - 2, y + 2, w + 3, h + 1);
  g.fillStyle = 'rgba(232,228,216,0.9)'; // lifted paint lip
  for (const [x, y, w, h] of rects) g.fillRect(x - 1, y - 1, w + 1, 1);
  g.save();
  g.beginPath();
  for (const [x, y, w, h] of rects) g.rect(x, y, w, h);
  g.clip();
  g.drawImage(brickCanvas(S, S, 405), 0, 0);
  g.fillStyle = 'rgba(30,22,18,0.25)';
  for (let i = 0; i < 30; i++) g.fillRect(r() * S, r() * S, 1, 12 + r() * 40);
  g.restore();
  return crunchy(c);
}

// Poured concrete, 4 m per tile: cloudy blotches, aggregate, a joint line, cracks, tyre scuffs.
export function concreteTexture() {
  const S = 256;
  const { c, g, r } = base(S, S, [128, 126, 120], 16, 405);
  for (let i = 0; i < 70; i++) {
    const s = 6 + r() * 30;
    g.fillStyle = r() < 0.55 ? `rgba(70,68,64,${r() * 0.12})` : `rgba(200,196,184,${r() * 0.12})`;
    wrapRect(g, r() * S, r() * S, s, s * (0.5 + r()));
  }
  for (let i = 0; i < 900; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(60,58,54,0.5)' : 'rgba(190,186,176,0.5)';
    g.fillRect((r() * S) | 0, (r() * S) | 0, 1, 1);
  }
  g.fillStyle = 'rgba(30,30,28,0.35)';
  g.fillRect(0, 0, S, 1);
  g.fillRect(0, 0, 1, S);
  g.fillStyle = 'rgba(200,196,186,0.2)';
  g.fillRect(0, 1, S, 1);
  g.fillRect(1, 0, 1, S);
  for (let i = 0; i < 3; i++) {
    let x = r() * S, y = r() * S;
    let a = r() * Math.PI * 2;
    g.fillStyle = 'rgba(34,32,30,0.5)';
    for (let k = 0; k < 40 + r() * 60; k++) {
      a += (r() - 0.5) * 0.5;
      x += Math.cos(a) * 1.5;
      y += Math.sin(a) * 1.5;
      wrapRect(g, x, y, 1, 1);
    }
  }
  for (let i = 0; i < 4; i++) {
    const x = r() * S, y = r() * S, len = 20 + r() * 50, a = r() * Math.PI;
    g.fillStyle = 'rgba(40,38,36,0.07)';
    for (let k = 0; k < len; k++) wrapRect(g, x + Math.cos(a + k * 0.02) * k, y + Math.sin(a + k * 0.02) * k, 2, 2);
  }
  return tiled(c);
}

// Underside of a corrugated roof sheet: ridges across, rust bleeding down.
export function corrugatedTexture() {
  const { c, g, r } = base(64, 64, [56, 54, 54], 12, 406);
  for (let x = 0; x < 64; x++) {
    const k = Math.sin((x / 8) * Math.PI * 2);
    g.fillStyle = k > 0 ? `rgba(160,160,160,${k * 0.18})` : `rgba(0,0,0,${-k * 0.3})`;
    g.fillRect(x, 0, 1, 64);
  }
  for (let i = 0; i < 14; i++) {
    g.fillStyle = `rgba(120,64,32,${0.15 + r() * 0.25})`;
    g.fillRect((r() * 64) | 0, (r() * 64) | 0, 2 + ((r() * 4) | 0), 6 + r() * 30);
  }
  return tiled(c);
}

export function steelTexture() {
  const { c, g, r } = base(32, 32, [58, 60, 64], 14, 407);
  for (let i = 0; i < 12; i++) {
    g.fillStyle = `rgba(116,62,34,${0.2 + r() * 0.3})`;
    g.fillRect((r() * 32) | 0, (r() * 32) | 0, 1 + ((r() * 3) | 0), 1 + ((r() * 3) | 0));
  }
  return crunchy(c);
}

export function timberTexture() {
  const { c, g, r } = base(64, 32, [72, 54, 40], 14, 408);
  for (let y = 0; y < 32; y += 2 + ((r() * 3) | 0)) {
    g.fillStyle = 'rgba(30,20,14,0.4)';
    g.fillRect(0, y, 64, 1);
  }
  return crunchy(c);
}

// Builder's sand and broken mortar for the rubble mounds.
export function sandTexture() {
  const { c, g, r } = base(64, 64, [146, 132, 110], 34, 409);
  for (let i = 0; i < 70; i++) {
    g.fillStyle = ['#6e5a48', '#b8aa92', '#8e3f2c', '#5a5450'][(r() * 4) | 0];
    g.fillRect((r() * 64) | 0, (r() * 64) | 0, 1 + ((r() * 2) | 0), 1 + ((r() * 2) | 0));
  }
  return tiled(c);
}

// Cinder block: porous grey with a darker arris.
export function cinderTexture() {
  const { c, g } = base(64, 32, [136, 134, 128], 40, 410);
  g.fillStyle = 'rgba(40,40,38,0.35)';
  g.fillRect(0, 0, 64, 2);
  g.fillRect(0, 30, 64, 2);
  g.fillRect(0, 0, 2, 32);
  g.fillRect(62, 0, 2, 32);
  return crunchy(c);
}

// Neutral speckle for loose bricks (tinted per instance red, whitewashed or sooty).
export const brickBitTexture = () => crunchy(base(32, 16, [210, 206, 198], 50, 411).c);

// Steel-framed windows, three variants side by side (72 x 120 each: 6 x 10 panes).
// Pane kinds are shared with the floor pools so each pool matches its window.
export const WINDOW_VARIANTS = 3;
const PANE = 12, COLS = 6, ROWS = 10;
function paneKinds(seed) {
  const r = rng(seed);
  return Array.from({ length: WINDOW_VARIANTS * COLS * ROWS }, () => {
    const p = r();
    return p < 0.08 ? 'broken' : p < 0.14 ? 'boarded' : p < 0.36 ? 'grimy' : 'glass';
  });
}
const KINDS = paneKinds(412);
const kindAt = (v, col, row) => KINDS[(v * ROWS + row) * COLS + col];

export function windowTexture() {
  const c = canvas(72 * WINDOW_VARIANTS, 120);
  const g = c.getContext('2d');
  const r = rng(413);
  g.fillStyle = '#16171a';
  g.fillRect(0, 0, c.width, c.height);
  for (let v = 0; v < WINDOW_VARIANTS; v++) {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const x = v * 72 + col * PANE + 2, y = row * PANE + 2;
        const kind = kindAt(v, col, row);
        const lift = 1 - row / ROWS * 0.12; // glass reads brighter towards the top
        const shade = { glass: 236, grimy: 196, broken: 255, boarded: 0 }[kind] * lift;
        g.fillStyle = kind === 'boarded' ? '#4a3a2c' : `rgb(${shade},${shade * 0.98},${shade * 0.94})`;
        g.fillRect(x, y, PANE - 2, PANE - 2);
        if (kind === 'grimy') {
          g.fillStyle = 'rgba(90,84,70,0.35)';
          g.fillRect(x, y + PANE - 6, PANE - 2, 4);
        }
        if (kind === 'glass' && r() < 0.15) {
          g.fillStyle = 'rgba(40,40,40,0.6)'; // a crack
          for (let k = 0; k < 8; k++) g.fillRect(x + k, y + ((k * 1.2) | 0), 1, 1);
        }
      }
    }
  }
  return crunchy(c);
}

// The patch of sun each window throws on the floor: the same panes, softer at the rim.
// One extra slot at the end holds a plain soft patch (for the light from the roof hole).
export function poolTexture() {
  const c = canvas(72 * (WINDOW_VARIANTS + 1), 120);
  const g = c.getContext('2d');
  for (let v = 0; v < WINDOW_VARIANTS; v++) {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const kind = kindAt(v, col, row);
        if (kind === 'boarded') continue;
        const k = { glass: 0.85, grimy: 0.55, broken: 1 }[kind];
        const rim = Math.min(col + 1, COLS - col, row + 1, ROWS - row) === 1 ? 0.7 : 1;
        g.fillStyle = `rgba(255,255,255,${k * rim})`;
        g.fillRect(v * 72 + col * PANE + 2, row * PANE + 2, PANE - 2, PANE - 2);
      }
    }
  }
  const x0 = WINDOW_VARIANTS * 72;
  for (let i = 0; i < 12; i++) {
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(x0 + i * 3, i * 5, 72 - i * 6, 120 - i * 10);
  }
  return crunchy(c);
}

// Light streaks across a god-ray (dark gaps where the mullions are).
export function streakTexture() {
  const c = canvas(64, 4);
  const g = c.getContext('2d');
  const r = rng(414);
  for (let x = 0; x < 64; x++) {
    const v = (0.55 + 0.45 * r()) * (x % 11 < 2 ? 0.35 : 1);
    g.fillStyle = `rgb(${v * 255},${v * 255},${v * 255})`;
    g.fillRect(x, 0, 1, 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Ragged puddle (dark, wet) and pale dust patch decals, transparent round the edge.
function blob(seed, fill, count, spread) {
  const c = canvas(64, 64);
  const g = c.getContext('2d');
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2, d = r() * spread;
    const x = 32 + Math.cos(a) * d, y = 32 + Math.sin(a) * d * 0.7;
    const s = 4 + r() * 12;
    g.fillStyle = fill(r);
    g.fillRect(x - s / 2, y - s / 2, s, s * (0.5 + r() * 0.5));
  }
  return c;
}
export const puddleTexture = () => crunchy(blob(415, () => 'rgba(255,255,255,0.9)', 40, 20));
export const dustTexture = () => crunchy(blob(416, (r) => `rgba(${196 + r() * 30},${188 + r() * 30},${170 + r() * 30},${0.03 + r() * 0.06})`, 70, 22));
