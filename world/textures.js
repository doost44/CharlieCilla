import THREE from './three.js';

// Small seeded RNG so the procedural textures look the same on every load.
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Chunky retro texture: nearest-neighbour, no mipmaps.
export function crunchy(c, repeatX = 1, repeatY = repeatX) {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  // Power-of-two textures tile (room.js scales UVs to tile walls and floors by size).
  const pot = (n) => (n & (n - 1)) === 0;
  if (pot(c.width) && pot(c.height)) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  return t;
}

// Fill every pixel with a base colour plus random brightness noise.
export function noisy(w, h, base, spread, seed) {
  const c = canvas(w, h);
  const g = c.getContext('2d');
  const r = rng(seed);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = (r() - 0.5) * spread;
      g.fillStyle = `rgb(${base[0] + n},${base[1] + n * 1.2},${base[2] + n * 0.6})`;
      g.fillRect(x, y, 1, 1);
    }
  }
  return { c, g, r };
}

export const hex = (color) => '#' + color.toString(16).padStart(6, '0');

// Flat-shaded matte material. r128's Lambert can't flat-shade, so this is Phong with
// no shine, which lights exactly like Lambert but per face.
export const flatMaterial = (opts) => new THREE.MeshPhongMaterial({ flatShading: true, shininess: 0, specular: 0x000000, ...opts });

// The office chair's skins: worn black leather, black moulded plastic, dark gunmetal.
export function leatherTexture() {
  const { c, g, r } = noisy(64, 64, [30, 29, 28], 10, 21);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = r() > 0.6 ? '#4a4846' : '#141312'; // creases and scuffs
    g.fillRect((r() * 64) | 0, (r() * 64) | 0, 1 + ((r() * 3) | 0), 1);
  }
  return crunchy(c, 2);
}

export const plasticTexture = () => crunchy(noisy(32, 32, [24, 24, 26], 8, 22).c);
export const metalTexture = () => crunchy(noisy(32, 32, [62, 64, 70], 16, 23).c);

// Round soft puff in the given 'r,g,b' colour (dust when the walls land).
export function puffTexture(rgb) {
  const c = canvas(32, 32);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 1, 16, 16, 16);
  grad.addColorStop(0, `rgba(${rgb},1)`);
  grad.addColorStop(0.6, `rgba(${rgb},0.6)`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return crunchy(c);
}
