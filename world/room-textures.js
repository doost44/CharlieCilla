import THREE from './three.js';
import { canvas, crunchy, noisy, rng } from './textures.js';

// Painted textures for the bedroom set (REF-B): an empty room at night, one warm bulb.

// Fill a canvas pixel by pixel: fn(x, y) returns [r, g, b] or [r, g, b, a].
function paint(w, h, fn) {
  const c = canvas(w, h);
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, gr, b, a = 255] = fn(x, y);
      img.data.set([r, gr, b, a], (y * w + x) * 4);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

// A height field of soft round bumps that wraps at the edges, so it tiles.
// flat > 1 clips each bump into a plateau (knockdown splats instead of peel).
function bumps(n, count, minR, maxR, seed, flat = 1) {
  const r = rng(seed);
  const h = new Float32Array(n * n);
  for (let i = 0; i < count; i++) {
    const cx = (r() * n) | 0, cy = (r() * n) | 0;
    const rad = minR + r() * (maxR - minR), amp = 0.5 + r(), R = Math.ceil(rad);
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const d = (dx * dx + dy * dy) / (rad * rad);
        if (d < 1) h[((cy + dy + n) % n) * n + ((cx + dx + n) % n)] += amp * Math.min(1, flat * (1 - d));
      }
    }
  }
  return (x, y) => h[((y + n) % n) * n + ((x + n) % n)];
}

// Orange-peel stucco: cream paint over small bumps, lit from the top left.
// The ceiling adds wider knockdown splats on top of the peel.
export function stuccoTexture(base = [240, 226, 188], seed = 61, knockdown = false) {
  const N = 64;
  const peel = bumps(N, 300, 1, 2.4, seed);
  const splat = knockdown ? bumps(N, 22, 3, 7, seed + 1, 3) : () => 0;
  const r = rng(seed + 2);
  const c = paint(N, N, (x, y) => {
    const slope = peel(x - 1, y - 1) - peel(x + 1, y + 1) + 0.4 * (splat(x - 1, y - 1) - splat(x + 1, y + 1));
    const k = 1 + 0.032 * slope + (r() - 0.5) * 0.025;
    return base.map((v) => v * k);
  });
  return crunchy(c);
}

// Speckled berber: beige loops in a fine checker, flecked darker and lighter.
// k darkens it (the stain is the same carpet, a little darker).
function berber(seed, k = 1) {
  const r = rng(seed);
  return (x, y) => {
    const loop = ((x >> 1) + (y >> 1)) & 1 ? 3 : -3;
    const n = (r() - 0.5) * 18 + loop;
    const f = r();
    const col = f < 0.1 ? [160, 148, 128] : f < 0.17 ? [230, 224, 208] : [208, 198, 178];
    return col.map((v) => (v + n) * k);
  };
}

export const carpetTexture = () => crunchy(paint(64, 64, berber(62)));

// One faint dried stain: a blotch of slightly darker carpet with a darker rim, cut
// out with alpha.
export function stainTexture() {
  const r = rng(63);
  const blobs = Array.from({ length: 6 }, () => [20 + r() * 24, 20 + r() * 24, 7 + r() * 9]);
  const inner = berber(64, 0.92), rim = berber(65, 0.86);
  const c = paint(64, 64, (x, y) => {
    let inside = 0;
    for (const [bx, by, br] of blobs) inside = Math.max(inside, 1 - Math.hypot(x - bx, y - by) / br);
    return [...(inside < 0.15 ? rim(x, y) : inner(x, y)), inside + (r() - 0.5) * 0.12 > 0.04 ? 255 : 0];
  });
  return crunchy(c);
}

// Tan baseboard with a rounded top edge.
export function baseboardTexture() {
  const r = rng(64);
  const c = paint(64, 16, (x, y) => {
    const k = y === 0 ? 1.12 : y === 1 ? 1.05 : y === 2 ? 0.86 : y === 15 ? 0.8 : 1;
    const n = (r() - 0.5) * 10;
    return [196, 164, 118].map((v) => v * k + n);
  });
  return crunchy(c);
}

// Plywood for the backs and edges of the flats.
export const plywoodTexture = () => crunchy(noisy(64, 64, [196, 160, 112], 26, 35).c, 2);

// Off-white painted trim.
export const trimTexture = () => crunchy(noisy(32, 32, [236, 230, 214], 8, 65).c);

// Honey oak slab with strong grain: straight lines below, nested cathedral arches
// above. 128 x 256, finer than the rest: the door is the closest thing to the chair.
export function oakTexture() {
  const r = rng(66);
  const W = 128, H = 256;
  const shade = Array.from({ length: 64 }, () => 0.5 + r() * 0.5); // how dark each grain line is
  const c = paint(W, H, (x, y) => {
    const wob = x + 3 * Math.sin(y * 0.035) + 1.5 * Math.sin(y * 0.11 + 1);
    const arch = (cx, cy) => Math.max(0, cy - y) * 0.3 * Math.exp(-Math.abs(wob - cx) / 28);
    const f = Math.abs(wob - 60) + arch(60, 140) + 0.6 * arch(60, 60);
    const line = f / 5;
    const dark = (line % 1 < 0.24 ? shade[Math.floor(line) % 64] : 0) + (r() < 0.03 ? 0.3 : 0);
    const n = (r() - 0.5) * 10;
    const edge = x < 2 || x > W - 3 || y < 2 || y > H - 3 ? 0.8 : 1;
    return [214 - 74 * dark + n, 156 - 62 * dark + n * 0.8, 86 - 40 * dark + n * 0.5].map((v) => v * edge);
  });
  return crunchy(c);
}

// The dark doorway beyond the open door: an unlit hall, darkest at the top.
export function doorwayTexture() {
  const r = rng(67);
  const c = paint(16, 64, (x, y) => {
    const k = 0.4 + 0.6 * (y / 63);
    const n = (r() - 0.5) * 3;
    return [26 * k + n, 20 * k + n, 17 * k + n];
  });
  return crunchy(c);
}

// Night glass: near black, a faint blue sky, a soft diagonal sheen and a warm smudge
// where the lamp is reflected.
export function paneTexture() {
  const r = rng(68);
  const c = paint(64, 64, (x, y) => {
    const sky = 1 - y / 64;
    const sheen = Math.max(0, 1 - Math.abs(x - y * 0.7 - 30) / 10) * 0.5;
    const warm = Math.max(0, 1 - Math.hypot(x - 52, y - 16) / 14) ** 2;
    const n = (r() - 0.5) * 4;
    return [14 + 8 * sheen + 34 * warm + n, 16 + 5 * sky + 8 * sheen + 24 * warm + n, 21 + 9 * sky + 9 * sheen + 10 * warm + n];
  });
  return crunchy(c);
}

// Duplex outlet: ivory plate, two faces with slots and ground holes, a middle screw.
export function outletTexture() {
  const c = canvas(16, 32);
  const g = c.getContext('2d');
  g.fillStyle = '#ece4d2';
  g.fillRect(0, 0, 16, 32);
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.fillRect(0, 31, 16, 1);
  g.fillRect(15, 0, 1, 32);
  for (const y of [5, 19]) {
    g.fillStyle = '#ddd3bf';
    g.fillRect(3, y - 1, 10, 9);
    g.fillStyle = '#2a2622';
    g.fillRect(5, y + 1, 1, 3);
    g.fillRect(10, y + 1, 1, 3);
    g.fillRect(7, y + 5, 2, 2);
  }
  g.fillStyle = '#b8ad98';
  g.fillRect(7, 15, 2, 2);
  return crunchy(c);
}

// Floor register: off-white frame round dark louvre slots.
export function ventTexture() {
  const c = canvas(64, 16);
  const g = c.getContext('2d');
  g.fillStyle = '#e4ded0';
  g.fillRect(0, 0, 64, 16);
  g.fillStyle = '#c8c0ae';
  g.fillRect(0, 15, 64, 1);
  for (let x = 6; x < 58; x += 4) {
    g.fillStyle = '#2c2824';
    g.fillRect(x, 4, 2, 8);
    g.fillStyle = '#9a9282';
    g.fillRect(x + 2, 4, 1, 8);
  }
  return crunchy(c);
}

// Kraft cardboard with faint corrugation and a strip of old tape.
export function cardboardTexture() {
  const { c, g, r } = noisy(64, 64, [172, 128, 82], 18, 69);
  for (let y = 0; y < 64; y += 3) {
    g.fillStyle = 'rgba(90,60,30,0.12)';
    g.fillRect(0, y, 64, 1);
  }
  for (let i = 0; i < 30; i++) {
    g.fillStyle = r() > 0.5 ? 'rgba(80,50,24,0.35)' : 'rgba(220,180,130,0.3)';
    g.fillRect((r() * 64) | 0, (r() * 64) | 0, 1 + ((r() * 3) | 0), 1);
  }
  g.fillStyle = 'rgba(214,180,120,0.55)';
  g.fillRect(0, 0, 64, 7);
  g.fillStyle = 'rgba(255,240,200,0.25)';
  g.fillRect(0, 2, 64, 1);
  return crunchy(c);
}

// Crumpled newsprint: columns of grey print and a dark picture block, no words.
export function newsprintTexture() {
  const { c, g, r } = noisy(64, 64, [222, 218, 206], 10, 70);
  g.fillStyle = '#4a4744';
  g.fillRect(6, 4, 52, 5); // headline bar
  for (let col = 0; col < 3; col++) {
    for (let y = 13; y < 60; y += 3) {
      if (col === 1 && y > 18 && y < 38) continue;
      g.fillStyle = `rgba(60,58,54,${0.35 + r() * 0.3})`;
      g.fillRect(6 + col * 18, y, 12 + ((r() * 4) | 0), 1);
    }
  }
  g.fillStyle = '#5a5650';
  g.fillRect(24, 19, 16, 18);
  g.fillStyle = '#8a857c';
  g.fillRect(27, 24, 9, 9);
  return crunchy(c);
}

// Milk glass: warm white with faint vertical ribs, brightest towards the rim.
export function milkGlassTexture() {
  const r = rng(71);
  const c = paint(32, 32, (x, y) => {
    const rib = x % 4 === 0 ? 0.93 : 1;
    const k = (0.88 + 0.12 * (y / 31)) * rib + (r() - 0.5) * 0.03;
    return [255 * k, 246 * k, 226 * k];
  });
  return crunchy(c);
}

// --- Light, painted as additive decals ------------------------------------------
// Smooth (linear filtered) on purpose: a stepped glow reads as banding, not pixels.

function smooth(c) {
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}

// A soft round glow (halo round the shade, the bright patch on the ceiling).
export function glowTexture() {
  const c = canvas(64, 64);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return smooth(c);
}

// What the ruffled shade throws on a wall next to it: a soft glow round the lamp and,
// below it, a fan of petal-shaped patches from the rim (none straight down, where the
// socket is). The lamp sits at the centre of the texture.
export function scallopTexture() {
  const S = 128;
  const petals = [-66, -36, 36, 66].map((deg) => [Math.sin((deg * Math.PI) / 180), Math.cos((deg * Math.PI) / 180)]);
  const c = paint(S, S, (x, y) => {
    const px = (x - S / 2) / (S / 2), py = (y - S / 2) / (S / 2); // +y is down the wall
    const rad = Math.hypot(px, py);
    let v = Math.exp(-rad * rad * 30) * 0.8 + Math.exp(-rad * rad * 4) * 0.15;
    for (const [dx, dy] of petals) {
      const along = px * dx + py * dy, across = px * dy - py * dx;
      const width = 0.02 + 0.13 * along * (1 - along); // a petal: thin at the lamp, round at the tip
      const tip = 1 - smoothstep(0.5, 0.7, along + 0.08 * Math.cos(across * 40)); // scalloped end
      v += 0.75 * smoothstep(0.05, 0.16, along) * tip * Math.exp(-(across * across) / (2 * width * width));
    }
    v = Math.min(1, v) * (1 - smoothstep(0.8, 1, rad));
    return [255 * v, 255 * v, 255 * v];
  });
  return smooth(c);
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
