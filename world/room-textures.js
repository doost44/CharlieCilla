import { canvas, crunchy, noisy, rng } from './textures.js';

// Painted textures for the suburban room set: an early-2000s living room at dusk.

// Sage and cream stripes with a small repeating flower.
export function wallpaperTexture() {
  const { c, g } = noisy(64, 64, [214, 206, 172], 10, 31);
  g.fillStyle = 'rgba(122,140,104,0.55)';
  for (let x = 0; x < 64; x += 16) g.fillRect(x, 0, 6, 64);
  g.fillStyle = 'rgba(122,140,104,0.3)';
  for (let x = 8; x < 64; x += 16) g.fillRect(x, 0, 1, 64);
  for (const [x, y] of [[11, 10], [11, 42], [27, 26], [27, 58], [43, 10], [43, 42], [59, 26], [59, 58]]) {
    g.fillStyle = '#a4545a';
    g.fillRect(x - 1, y - 1, 3, 3);
    g.fillStyle = '#e8c860';
    g.fillRect(x, y, 1, 1);
  }
  return crunchy(c);
}

// Wood-look panelling below the chair rail.
export function wainscotTexture() {
  const { c, g, r } = noisy(64, 32, [118, 82, 52], 18, 32);
  for (let x = 0; x < 64; x += 16) {
    g.fillStyle = '#4e321e';
    g.fillRect(x, 0, 1, 32);
    g.fillStyle = 'rgba(255,220,170,0.18)';
    g.fillRect(x + 1, 0, 1, 32);
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = 'rgba(60,36,20,0.35)';
    g.fillRect((r() * 64) | 0, (r() * 32) | 0, 1, 3 + ((r() * 6) | 0));
  }
  return crunchy(c);
}

export function carpetTexture() {
  const { c, g, r } = noisy(64, 64, [150, 124, 92], 30, 33);
  for (let i = 0; i < 120; i++) {
    g.fillStyle = r() > 0.5 ? '#7a6248' : '#b49a74';
    g.fillRect((r() * 64) | 0, (r() * 64) | 0, 1, 1);
  }
  return crunchy(c);
}

export const popcornTexture = () => crunchy(noisy(64, 64, [232, 228, 216], 34, 34).c);
export const plywoodTexture = () => crunchy(noisy(64, 64, [196, 160, 112], 26, 35).c, 2);

// Heavy maroon curtains with vertical folds.
export function curtainTexture() {
  const { c, g } = noisy(32, 64, [120, 36, 40], 14, 36);
  for (let x = 0; x < 32; x++) {
    g.fillStyle = `rgba(0,0,0,${0.25 * (0.5 + 0.5 * Math.sin((x / 32) * Math.PI * 6))})`;
    g.fillRect(x, 0, 1, 64);
  }
  return crunchy(c);
}

// The view out of the window: dusk sky over a row of house roofs and a fence.
export function windowTexture() {
  const c = canvas(128, 96);
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 96);
  sky.addColorStop(0, '#3a4a66');
  sky.addColorStop(0.55, '#c98a56');
  sky.addColorStop(1, '#e8b070');
  g.fillStyle = sky;
  g.fillRect(0, 0, 128, 96);
  const r = rng(37);
  g.fillStyle = '#2a2430';
  for (let x = -10; x < 128; x += 34 + ((r() * 10) | 0)) {
    const w = 26 + ((r() * 8) | 0), h = 18 + ((r() * 8) | 0);
    g.fillRect(x, 96 - h, w, h);
    g.beginPath();
    g.moveTo(x - 3, 96 - h);
    g.lineTo(x + w / 2, 96 - h - 12);
    g.lineTo(x + w + 3, 96 - h);
    g.fill();
    g.fillStyle = '#f0c870'; // a lit window
    g.fillRect(x + 6, 96 - h + 5, 4, 4);
    g.fillStyle = '#2a2430';
  }
  g.fillStyle = '#4a3a30';
  for (let x = 0; x < 128; x += 6) g.fillRect(x, 82, 4, 14);
  g.fillRect(0, 86, 128, 2);
  return crunchy(c);
}

// Six-panel interior door.
export function doorTexture() {
  const { c, g } = noisy(48, 96, [208, 196, 172], 10, 38);
  for (const [x, y, w, h] of [[6, 6, 16, 22], [26, 6, 16, 22], [6, 34, 16, 26], [26, 34, 16, 26], [6, 66, 16, 24], [26, 66, 16, 24]]) {
    g.fillStyle = 'rgba(80,60,40,0.35)';
    g.fillRect(x, y, w, 1);
    g.fillRect(x, y, 1, h);
    g.fillStyle = 'rgba(255,255,240,0.4)';
    g.fillRect(x, y + h - 1, w, 1);
    g.fillRect(x + w - 1, y, 1, h);
  }
  return crunchy(c);
}

// Little framed paintings: a different landscape for each seed.
export function pictureTexture(seed) {
  const r = rng(seed);
  const c = canvas(48, 36);
  const g = c.getContext('2d');
  const hue = (r() * 360) | 0;
  g.fillStyle = `hsl(${hue},35%,62%)`;
  g.fillRect(0, 0, 48, 36);
  g.fillStyle = `hsl(${(hue + 40) % 360},30%,40%)`;
  g.beginPath();
  g.moveTo(0, 24);
  for (let x = 0; x <= 48; x += 8) g.lineTo(x, 14 + r() * 12);
  g.lineTo(48, 36);
  g.lineTo(0, 36);
  g.fill();
  g.fillStyle = '#f4e4a0';
  g.fillRect(8 + ((r() * 28) | 0), 5, 5, 5);
  return crunchy(c);
}

// Brown plaid couch fabric.
export function fabricTexture() {
  const { c, g } = noisy(32, 32, [132, 92, 64], 18, 39);
  g.fillStyle = 'rgba(60,40,24,0.35)';
  for (let i = 0; i < 32; i += 8) {
    g.fillRect(i, 0, 3, 32);
    g.fillRect(0, i, 32, 3);
  }
  g.fillStyle = 'rgba(220,190,120,0.25)';
  for (let i = 4; i < 32; i += 8) {
    g.fillRect(i, 0, 1, 32);
    g.fillRect(0, i, 32, 1);
  }
  return crunchy(c, 2);
}

export function woodTexture() {
  const { c, g, r } = noisy(64, 32, [112, 70, 40], 16, 40);
  for (let y = 0; y < 32; y += 2 + ((r() * 3) | 0)) {
    g.fillStyle = 'rgba(50,28,14,0.35)';
    g.fillRect(0, y, 64, 1);
  }
  return crunchy(c);
}

// Oval braided rug in faded rings.
export function rugTexture() {
  const c = canvas(64, 48);
  const g = c.getContext('2d');
  const rings = ['#6a3a32', '#b07850', '#d8c090', '#5a6a4a', '#a05040', '#e0cfa0'];
  rings.forEach((col, i) => {
    g.fillStyle = col;
    g.beginPath();
    g.ellipse(32, 24, 32 - i * 5, 24 - i * 3.8, 0, 0, Math.PI * 2);
    g.fill();
  });
  return crunchy(c);
}

// TV static, scrolled randomly each frame so it looks alive.
export function staticTexture() {
  const c = canvas(64, 64);
  const g = c.getContext('2d');
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const v = (60 + Math.random() * 160) | 0;
      g.fillStyle = `rgb(${v},${v},${v + 20})`;
      g.fillRect(x, y, 1, 1);
    }
  }
  return crunchy(c); // power of two, so it wraps and the offset can scroll
}

export const lampShadeTexture = () => crunchy(noisy(32, 32, [240, 220, 170], 14, 41).c);
