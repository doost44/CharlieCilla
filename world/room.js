import THREE from './three.js';
import { config } from './config.js';
import { puffTexture } from './textures.js';
import * as tex from './room-textures.js';
import { matte, box, couch, coffeeTable, tv, floorLamp, ceilingLight, windowFitting, door, picture, rug } from './furniture.js';

const { width: W, depth: D, height: H, wall: T } = config.room;
const RAIL = 0.9; // chair rail height: panelling below, wallpaper above

// Each wall is a flat on a hinge along its outer bottom edge, like a film set, so it
// can fall flat outward. In a wall's own space +Z points into the room, x runs along it.
const WALLS = {
  back: { at: [0, -D / 2 - T], turn: 0, length: W + 2 * T, inner: W },
  front: { at: [0, D / 2 + T], turn: Math.PI, length: W + 2 * T, inner: W },
  left: { at: [-W / 2 - T, 0], turn: Math.PI / 2, length: D, inner: D },
  right: { at: [W / 2 + T, 0], turn: -Math.PI / 2, length: D, inner: D },
};

// What hangs on each wall, at [x along the wall, y].
const FITTINGS = {
  back: [[() => picture(51, 0.9, 0.6), 0, 1.55]],
  front: [[() => picture(52), -1.7, 1.6], [() => picture(53, 0.4, 0.5), 1.7, 1.6]],
  left: [[() => windowFitting(), 0.9, 1.45]],
  right: [[() => door(), -1.2, 0], [() => picture(54, 0.5, 0.4), 1, 1.5]],
};

// A plane whose UVs repeat the texture every `tile` metres.
function tiled(w, h, tileW, tileH = tileW) {
  const geo = new THREE.PlaneGeometry(w, h);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tileW, (uv.getY(i) * h) / tileH);
  return geo;
}

export function buildRoom(scene) {
  const group = new THREE.Group();
  const paper = matte({ map: tex.wallpaperTexture() }, 0.7);
  const panel = matte({ map: tex.wainscotTexture() }, 0.45);
  const trim = matte({ color: 0xece6d8 }, 0.85);
  const plywood = matte({ map: tex.plywoodTexture() }, 0.5);

  // Walls, each built as two halves so the 'split' collapse can pull them apart.
  const walls = {};
  for (const [name, spec] of Object.entries(WALLS)) {
    const pivot = new THREE.Group();
    pivot.position.set(spec.at[0], 0, spec.at[1]);
    pivot.rotation.y = spec.turn;
    group.add(pivot);
    const halves = [-1, 1].map((side) => {
      const half = new THREE.Group();
      pivot.add(half);
      const len = spec.length / 2, inner = spec.inner / 2;
      box(half, len, H, T, plywood, (side * len) / 2, H / 2, T / 2).userData.noAscii = true;
      const x = (side * inner) / 2;
      const upper = new THREE.Mesh(tiled(inner, H - RAIL, 0.5), paper);
      upper.position.set(x, (H + RAIL) / 2, T + 0.002);
      const lower = new THREE.Mesh(tiled(inner, RAIL, 1.2, RAIL), panel);
      lower.position.set(x, RAIL / 2, T + 0.002);
      upper.userData.noEdges = lower.userData.noEdges = true; // see outline below
      half.add(upper, lower);
      box(half, inner, 0.04, 0.03, trim, x, RAIL, T + 0.015);
      box(half, inner, 0.1, 0.02, trim, x, 0.05, T + 0.01);
      for (const [make, fx, fy] of FITTINGS[name]) {
        if (Math.sign(fx || 1) !== side) continue;
        const f = make();
        f.position.set(fx, fy, T + 0.004);
        half.add(f);
      }
      return { group: half, side };
    });
    walls[name] = { pivot, halves, length: spec.length };
  }

  // Floor: carpet, a braided rug and the furniture stay put when the walls go.
  const carpet = new THREE.Mesh(tiled(W, D, 0.8), matte({ map: tex.carpetTexture() }, 0.5));
  carpet.rotation.x = -Math.PI / 2;
  carpet.position.y = 0.02;
  carpet.userData.noEdges = true;
  const mat = rug();
  mat.position.set(0, 0.025, 0.85);
  group.add(carpet, mat);
  const place = (obj, x, z, turn = 0) => {
    obj.position.set(x, 0, z);
    obj.rotation.y = turn;
    group.add(obj);
    return obj;
  };
  place(couch(), 0, -D / 2 + 0.5);
  place(coffeeTable(), 0, 1);
  const set = place(tv(), 0, D / 2 - 0.55, Math.PI);
  const lamp = place(floorLamp(), -W / 2 + 0.45, -D / 2 + 0.45);

  const ceiling = new THREE.Group();
  ceiling.position.y = H;
  const top = new THREE.Mesh(new THREE.BoxGeometry(W + 2 * T, 0.08, D + 2 * T), matte({ map: tex.popcornTexture() }, 0.8));
  const uv = top.geometry.attributes.uv; // tile the popcorn finish by size
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 8, uv.getY(i) * 6);
  top.position.y = 0.04;
  top.userData.noEdges = true;
  ceiling.add(top, ceilingLight());
  group.add(ceiling);

  scene.add(group);

  // The room's corner lines, for the ASCII outline. (The wall planes skip their own
  // edges, which would draw a seam down the middle of every wall.)
  const corner = (x, y, z) => new THREE.Vector3((x * W) / 2, y * H, (z * D) / 2);
  const ring = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const outline = [];
  ring.forEach(([x, z], i) => {
    const [nx, nz] = ring[(i + 1) % 4];
    outline.push([corner(x, 0, z), corner(x, 1, z)], [corner(x, 0, z), corner(nx, 0, nz)], [corner(x, 1, z), corner(nx, 1, nz)]);
  });

  const materials = new Set();
  group.traverse((m) => m.isMesh && materials.add(m.material));
  const ceilingMats = new Set();
  ceiling.traverse((m) => m.isMesh && ceilingMats.add(m.material));
  const lampPower = lamp.userData.light.intensity;

  // Cross-fade: materials go see-through while fading in, then back to solid.
  function setOpacity(k, mats = materials) {
    for (const m of mats) {
      m.transparent = k < 1;
      m.opacity = k;
    }
    if (mats === materials) {
      group.visible = k > 0;
      lamp.userData.light.intensity = lampPower * k;
    }
  }

  let staticTimer = 0;
  function update(dt) {
    staticTimer -= dt;
    if (staticTimer > 0) return;
    staticTimer = 0.06;
    set.userData.screen.material.map.offset.set(Math.random(), Math.random());
  }

  const collapse = createCollapse(scene, walls, ceiling, (k) => setOpacity(k, ceilingMats));
  setOpacity(0);
  return { group, walls, outline, setOpacity, update, collapse };
}

// --- Collapse: the walls fall outward from the middle like a film set -----------

const easeIn = (u) => u * u * u;
const BOUNCE = 0.35; // seconds of rebound after a wall hits the ground

function createCollapse(scene, walls, ceiling, fadeCeiling) {
  const { order, stagger, fall, mode } = config.collapse;
  const split = mode === 'split';
  const dust = [];
  const dustMat = new THREE.SpriteMaterial({ map: puffTexture('170,150,128'), transparent: true, opacity: 0.6, depthWrite: false });
  let landed = new Set();

  // Pose one half-wall for time `local` seconds after it starts to fall.
  function pose(h, local) {
    const u = THREE.MathUtils.clamp(local / fall, 0, 1);
    let angle = (Math.PI / 2) * easeIn(u);
    const b = local - fall;
    if (b > 0 && b < BOUNCE) angle -= 0.09 * Math.sin((b / BOUNCE) * Math.PI);
    h.group.rotation.x = -angle;
    if (split) {
      h.group.position.x = h.side * 0.6 * u * u; // the halves pull apart from the middle...
      h.group.rotation.z = -h.side * 0.12 * u; // ...and twist away from each other
    }
    return u >= 1;
  }

  function puffs(wall) {
    const out = new THREE.Vector3(0, 0, -1).transformDirection(wall.pivot.matrixWorld);
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Sprite(dustMat.clone());
      const along = (Math.random() - 0.5) * wall.length;
      const from = -0.2 - Math.random() * config.room.height; // from the hinge out to where the top hit
      s.position.copy(wall.pivot.localToWorld(new THREE.Vector3(along, 0.3, from)));
      s.scale.setScalar(0.8);
      scene.add(s);
      const vel = out.clone().multiplyScalar(0.8 + Math.random()).setY(0.4 + Math.random() * 0.4);
      dust.push({ s, vel, life: 1.6 });
    }
  }

  return {
    start() {
      landed = new Set();
      fadeCeiling(1);
    },
    // Returns the names of walls that hit the ground this frame (for thuds and shake).
    update(t, dt) {
      const hits = [];
      order.forEach((name, i) => {
        const wall = walls[name];
        let down = true;
        wall.halves.forEach((h, k) => {
          down = pose(h, t - i * stagger - (split ? k * 0.12 : 0)) && down;
        });
        if (down && !landed.has(name)) {
          landed.add(name);
          puffs(wall);
          hits.push(name);
        }
      });
      // The ceiling lifts off and drifts away.
      ceiling.position.y = config.room.height + 3 * t * t;
      ceiling.position.x = -0.8 * t * t;
      ceiling.rotation.z = 0.08 * t;
      fadeCeiling(1 - THREE.MathUtils.clamp((t - 1) / 1.5, 0, 1));
      ceiling.visible = t < 2.6;
      for (let i = dust.length - 1; i >= 0; i--) {
        const d = dust[i];
        d.life -= dt;
        d.s.position.addScaledVector(d.vel, dt);
        d.s.scale.addScalar(dt * 1.5);
        d.s.material.opacity = Math.max(0, d.life / 1.6) * 0.6;
        if (d.life <= 0) {
          scene.remove(d.s);
          d.s.material.dispose();
          dust.splice(i, 1);
        }
      }
      return hits;
    },
    finish() {
      for (const wall of Object.values(walls)) for (const h of wall.halves) pose(h, fall + BOUNCE);
      ceiling.visible = false;
      for (const d of dust) {
        scene.remove(d.s);
        d.s.material.dispose();
      }
      dust.length = 0;
    },
    dispose() {
      dustMat.map.dispose();
      dustMat.dispose();
    },
  };
}
