import THREE from './three.js';
import { canvas, crunchy, flatMaterial } from './textures.js';
import * as tex from './room-textures.js';

// Low-poly furniture and wall fittings for the room set. Each builder returns a group
// standing on y = 0 (or, for wall fittings, with its back on z = 0), facing +Z.
// A material's userData.tone (0..1) is how bright its ASCII glyphs are (ascii.js).

export function matte(opts, tone = 0.6) {
  const m = flatMaterial(opts);
  m.userData.tone = tone;
  return m;
}

export function basic(opts, tone = 0.9) {
  const m = new THREE.MeshBasicMaterial(opts);
  m.userData.tone = tone;
  return m;
}

export function box(parent, w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function cylinder(parent, rTop, rBottom, h, sides, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, sides), material);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

export function couch() {
  const g = new THREE.Group();
  const fabric = matte({ map: tex.fabricTexture() }, 0.45);
  const wood = matte({ map: tex.woodTexture() }, 0.35);
  for (const x of [-0.9, 0.9]) for (const z of [-0.33, 0.33]) box(g, 0.06, 0.06, 0.06, wood, x, 0.03, z);
  box(g, 2, 0.24, 0.85, fabric, 0, 0.18, 0);
  for (const x of [-0.6, 0, 0.6]) box(g, 0.58, 0.13, 0.62, fabric, x, 0.365, 0.08);
  for (const x of [-0.6, 0, 0.6]) box(g, 0.58, 0.44, 0.2, fabric, x, 0.62, -0.3);
  for (const x of [-0.92, 0.92]) box(g, 0.17, 0.62, 0.85, fabric, x, 0.31, 0);
  return g;
}

export function coffeeTable() {
  const g = new THREE.Group();
  const wood = matte({ map: tex.woodTexture() }, 0.4);
  box(g, 1.1, 0.05, 0.55, wood, 0, 0.42, 0);
  for (const x of [-0.5, 0.5]) for (const z of [-0.22, 0.22]) box(g, 0.05, 0.4, 0.05, wood, x, 0.2, z);
  box(g, 1, 0.02, 0.45, wood, 0, 0.1, 0); // lower shelf
  cylinder(g, 0.04, 0.035, 0.09, 8, matte({ color: 0xc8483c }, 0.6), 0.3, 0.49, 0.05); // mug
  box(g, 0.24, 0.03, 0.17, matte({ color: 0x3c5a8a }, 0.5), -0.25, 0.46, -0.04).rotation.y = 0.3; // magazine
  return g;
}

// A chunky CRT on a wooden stand, showing static, with a VCR blinking 12:00.
export function tv() {
  const g = new THREE.Group();
  const wood = matte({ map: tex.woodTexture() }, 0.4);
  const plastic = matte({ color: 0x8c8a84 }, 0.6);
  box(g, 1.2, 0.5, 0.45, wood, 0, 0.25, 0);
  box(g, 1.1, 0.4, 0.01, matte({ color: 0x3a2618 }, 0.25), 0, 0.25, 0.226);
  const vcr = box(g, 0.44, 0.08, 0.3, matte({ color: 0x1c1c1e }, 0.3), 0, 0.54, 0);
  const clock = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.04), basic({ map: clockTexture() }, 0.8));
  clock.position.set(0.12, 0, 0.151);
  vcr.add(clock);

  box(g, 0.74, 0.56, 0.5, plastic, 0, 0.86, 0);
  box(g, 0.5, 0.42, 0.25, plastic, 0, 0.84, -0.36); // the tube's back
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.42), basic({ map: tex.staticTexture() }, 0.9));
  screen.position.set(-0.04, 0.87, 0.251);
  g.add(screen);
  for (const s of [-1, 1]) {
    const ear = cylinder(g, 0.006, 0.006, 0.5, 4, matte({ color: 0xb0b0b4 }, 0.7), s * 0.12, 1.32, -0.05);
    ear.rotation.z = -s * 0.5;
  }
  cylinder(g, 0.06, 0.07, 0.04, 8, plastic, 0, 1.16, -0.05);
  g.userData.screen = screen;
  return g;
}

function clockTexture() {
  const c = canvas(48, 16);
  const g = c.getContext('2d');
  g.fillStyle = '#060806';
  g.fillRect(0, 0, 48, 16);
  g.fillStyle = '#50f070';
  g.font = 'bold 13px monospace';
  g.fillText('12:00', 4, 13);
  return crunchy(c);
}

// Floor lamp with a warm glowing shade and a point light inside it.
export function floorLamp() {
  const g = new THREE.Group();
  const brass = matte({ color: 0xb08a48 }, 0.6);
  cylinder(g, 0.16, 0.17, 0.03, 10, brass, 0, 0.015, 0);
  cylinder(g, 0.015, 0.015, 1.45, 6, brass, 0, 0.75, 0);
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.24, 0.28, 10, 1, true),
    basic({ map: tex.lampShadeTexture(), side: THREE.DoubleSide }, 0.95),
  );
  shade.position.y = 1.5;
  g.add(shade);
  const light = new THREE.PointLight(0xffc070, 0.8, 7, 1.5);
  light.position.set(0, 1.4, 0);
  g.add(light);
  g.userData.light = light;
  return g;
}

// Flush dome light for the middle of the ceiling (hangs down from y = 0).
export function ceilingLight() {
  const g = new THREE.Group();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 10, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    basic({ color: 0xfff0d0 }, 1),
  );
  g.add(dome);
  cylinder(g, 0.26, 0.26, 0.02, 10, matte({ color: 0xb08a48 }, 0.6), 0, -0.01, 0);
  return g;
}

// Window with a dusk view, white frame, sill, curtains and a rod.
export function windowFitting(w = 1.3, h = 1) {
  const g = new THREE.Group();
  const trim = matte({ color: 0xece6d8 }, 0.85);
  const view = new THREE.Mesh(new THREE.PlaneGeometry(w, h), basic({ map: tex.windowTexture() }, 0.95));
  view.position.z = 0.01;
  g.add(view);
  for (const s of [-1, 1]) {
    box(g, w + 0.12, 0.06, 0.05, trim, 0, s * (h / 2 + 0.03), 0.025);
    box(g, 0.06, h, 0.05, trim, s * (w / 2 + 0.03), 0, 0.025);
  }
  box(g, w, 0.03, 0.03, trim, 0, 0, 0.02); // mullions
  box(g, 0.03, h, 0.03, trim, 0, 0, 0.02);
  box(g, w + 0.3, 0.04, 0.14, trim, 0, -h / 2 - 0.08, 0.07); // sill
  const curtain = matte({ map: tex.curtainTexture() }, 0.35);
  for (const s of [-1, 1]) box(g, 0.42, h + 0.55, 0.04, curtain, s * (w / 2 + 0.2), 0.05, 0.1);
  cylinder(g, 0.015, 0.015, w + 1.1, 6, matte({ color: 0x6a4a2a }, 0.4), 0, h / 2 + 0.36, 0.12).rotation.z = Math.PI / 2;
  return g;
}

// Panelled door in a frame, its bottom on y = 0.
export function door(w = 0.9, h = 2.05) {
  const g = new THREE.Group();
  const trim = matte({ color: 0xece6d8 }, 0.85);
  box(g, w, h, 0.04, matte({ map: tex.doorTexture() }, 0.75), 0, h / 2, 0.02);
  box(g, w + 0.16, 0.08, 0.05, trim, 0, h + 0.04, 0.025);
  for (const s of [-1, 1]) box(g, 0.08, h, 0.05, trim, s * (w / 2 + 0.04), h / 2, 0.025);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), matte({ color: 0xc8a050 }, 0.8));
  knob.position.set(w / 2 - 0.1, 0.95, 0.07);
  g.add(knob);
  return g;
}

export function picture(seed, w = 0.6, h = 0.45) {
  const g = new THREE.Group();
  box(g, w + 0.07, h + 0.07, 0.03, matte({ color: 0x4a3020 }, 0.3), 0, 0, 0.015);
  const art = new THREE.Mesh(new THREE.PlaneGeometry(w, h), matte({ map: tex.pictureTexture(seed) }, 0.65));
  art.position.z = 0.031;
  g.add(art);
  return g;
}

export function rug() {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.6), matte({ map: tex.rugTexture(), alphaTest: 0.5 }, 0.55));
  m.rotation.x = -Math.PI / 2;
  return m;
}
