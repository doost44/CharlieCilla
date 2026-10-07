import THREE from './three.js';
import { config } from './config.js';
import { puffTexture } from './textures.js';
import * as tex from './room-textures.js';
import {
  matte, glowMesh, box, chain, cord, windowFitting, doorway, outlet,
  floorVent, cardboardBox, crumpledPaper, stain, swagLamp,
} from './furniture.js';

// The bedroom set (REF-B): an empty room lit by one swag lamp hanging in the corner
// the chair faces (back-right, +x -z). Window and doorway on the back wall, the lamp's
// chain swagged along the top of the right wall and down to an outlet.

const { width: W, depth: D, height: H, wall: T } = config.room;
const BASEBOARD = 0.075;
const HOOK = new THREE.Vector3(W / 2 - 0.17, H, -D / 2 + 0.16); // the lamp's ceiling hook
const DROP = 0.72; // chain from the hook to the shade
// The corner the chair faces, a little under the shade so the seated view takes in
// the box and the carpet, as REF-B does.
const FOCUS = new THREE.Vector3(W / 2, 1.1, -D / 2);
const DOOR_X = 0.14, WINDOW_X = 1.27, CORD_Z = -0.85; // along their walls
const WALL_LIGHT = 1.1; // radius of the lamp's painted light on the walls and ceiling

// Each wall is a flat on a hinge along its outer bottom edge, like a film set, so it
// can fall flat outward. In a wall's own space +Z points into the room, x runs along
// it. It is built in two halves split at `split` (the 'split' collapse pulls them apart).
const WALLS = {
  back: { at: [0, -D / 2 - T], turn: 0, length: W + 2 * T, inner: W, split: -0.45 },
  front: { at: [0, D / 2 + T], turn: Math.PI, length: W + 2 * T, inner: W, split: 0 },
  left: { at: [-W / 2 - T, 0], turn: Math.PI / 2, length: D, inner: D, split: 0 },
  right: { at: [W / 2 + T, 0], turn: -Math.PI / 2, length: D, inner: D, split: 0 }, // x runs along world +z
};

// A plane over [x0, x1] x [y0, y1] whose UVs repeat the texture every `tile` metres,
// measured from the wall's origin so the halves meet without a seam.
function tiled(x0, x1, y0, y1, tile) {
  const geo = new THREE.PlaneGeometry(x1 - x0, y1 - y0);
  geo.translate((x0 + x1) / 2, (y0 + y1) / 2, 0);
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / tile, p.getY(i) / tile);
  return geo;
}

// The lamp's light on a flat surface: a decal centred where the lamp is nearest,
// clipped to the surface's rectangle [x0, x1] x [y0, y1].
function lampLight(map, cx, cy, x0, x1, y0, y1) {
  const geo = tiled(x0, x1, y0, y1, 1);
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, 0.5 + (p.getX(i) - cx) / (2 * WALL_LIGHT), 0.5 + (p.getY(i) - cy) / (2 * WALL_LIGHT));
  }
  return glowMesh(geo, map, 0xffc888);
}

export function buildRoom(scene) {
  const group = new THREE.Group();
  const stucco = matte({ map: tex.stuccoTexture() }, 0.75, 0);
  const plywood = matte({ map: tex.plywoodTexture() }, 0.4, 0);
  const baseboard = matte({ map: tex.baseboardTexture() }, 0.7, 0);
  const chainMat = matte({ color: 0x8c7a56 }, 0.5, 0.9);
  const scallops = tex.scallopTexture();
  const lamp = swagLamp(DROP);
  const lampY = H - DROP - 0.12;

  // What hangs on each wall: [build(), x, y, z off the wall face, x that picks the half].
  const FITTINGS = {
    back: [
      [() => doorway(), DOOR_X, 0, 0],
      [() => windowFitting(), WINDOW_X, 1.475, 0],
      [() => outlet(), WINDOW_X - 0.17, 0.3, 0],
      [() => lampLight(scallops, HOOK.x, lampY, HOOK.x - WALL_LIGHT, W / 2 - 0.01, 0, H), 0, 0, 0.004, HOOK.x],
    ],
    right: [
      [() => outlet(true), CORD_Z + 0.05, 0.3, 0],
      [() => lampCord(), 0, 0, 0, CORD_Z],
      [() => lampLight(scallops, HOOK.z, lampY, -D / 2 + 0.01, HOOK.z + WALL_LIGHT, 0, H), 0, 0, 0.004, HOOK.z],
    ],
    front: [],
    left: [],
  };
  const GAPS = { back: [[DOOR_X - 0.47, DOOR_X + 0.47]] }; // no baseboard across the doorway

  // From the ceiling hook the chain swags along the top of the right wall to a second
  // hook, drops straight down the wall and ends in a loop of cord into the outlet.
  function lampCord() {
    const g = new THREE.Group();
    const out = (along, y, off) => new THREE.Vector3(along, y, off);
    const start = out(HOOK.z, H - 0.02, W / 2 - HOOK.x), end = out(CORD_Z, H - 0.05, 0.02);
    const sag = out((start.x + end.x) / 2, H - 0.4, (start.z + end.z) / 2);
    g.add(chain(new THREE.QuadraticBezierCurve3(start, sag, end), chainMat));
    g.add(chain(new THREE.LineCurve3(end, out(CORD_Z, 0.42, 0.02)), chainMat));
    g.add(cord([out(CORD_Z, 0.42, 0.02), out(CORD_Z - 0.03, 0.22, 0.03), out(CORD_Z, 0.09, 0.04),
      out(CORD_Z + 0.06, 0.14, 0.035), out(CORD_Z + 0.06, 0.24, 0.03), out(CORD_Z + 0.05, 0.27, 0.025)], matte({ color: 0x3a3028 }, 0.3, 0.9)));
    const hook2 = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.004, 3, 8), chainMat);
    hook2.position.copy(end).y += 0.012;
    g.add(hook2);
    return g;
  }

  // Walls, each built as two halves.
  const walls = {};
  const lights = [];
  for (const [name, spec] of Object.entries(WALLS)) {
    const pivot = new THREE.Group();
    pivot.position.set(spec.at[0], 0, spec.at[1]);
    pivot.rotation.y = spec.turn;
    group.add(pivot);
    const halves = [-1, 1].map((side) => {
      const half = new THREE.Group();
      const doors = []; // open doors fall shut with their wall (see pose)
      half.userData.doors = doors;
      pivot.add(half);
      const [lo, hi] = side < 0 ? [-spec.length / 2, spec.split] : [spec.split, spec.length / 2];
      box(half, hi - lo, H, T, plywood, (lo + hi) / 2, H / 2, T / 2).userData.noAscii = true;
      const [a, b] = [Math.max(lo, -spec.inner / 2), Math.min(hi, spec.inner / 2)];
      const face = new THREE.Mesh(tiled(a, b, 0, H, 0.6), stucco);
      face.position.z = T + 0.002;
      face.userData.noEdges = true; // the outline draws the room's corners instead
      half.add(face);
      for (const [x0, x1] of without([a, b], GAPS[name] ?? [])) box(half, x1 - x0, BASEBOARD, 0.014, baseboard, (x0 + x1) / 2, BASEBOARD / 2, T + 0.007);
      for (const [make, x, y, z, along = x] of FITTINGS[name]) {
        if ((along < spec.split ? -1 : 1) !== side) continue;
        const f = make();
        f.position.set(x, y, T + 0.003 + z);
        half.add(f);
        if (f.material?.userData.glow) lights.push(f);
        f.traverse((o) => o.userData.open && doors.push(o));
      }
      return { group: half, side };
    });
    walls[name] = { pivot, halves, length: spec.length };
  }

  // Floor: carpet with a stain, the vent, the box and the paper stay when the walls go.
  const carpet = new THREE.Mesh(tiled(-W / 2, W / 2, -D / 2, D / 2, 0.5), matte({ map: tex.carpetTexture() }, 0.5, 0));
  carpet.rotation.x = -Math.PI / 2;
  carpet.position.y = 0.02;
  carpet.userData.noEdges = true;
  const edge = box(group, W, 0.018, D, matte({ color: 0x6a5e4c }, 0.3, 0), 0, 0.009, 0);
  edge.userData.noAscii = true;
  group.add(carpet);
  const place = (obj, x, z, turn = 0) => {
    obj.position.x = x;
    obj.position.y += 0.02;
    obj.position.z = z;
    obj.rotation.y = turn;
    group.add(obj);
    return obj;
  };
  place(stain(), 0.8, -0.95, 0.4).position.y = 0.021;
  place(floorVent(), WINDOW_X - 0.1, -D / 2 + 0.065);
  place(cardboardBox(), 1.55, -1.3, 0.22);
  place(crumpledPaper(), 1.92, -0.5, 0.9);

  // Ceiling: carries the lamp, and lifts away with it in the collapse.
  const ceiling = new THREE.Group();
  ceiling.position.y = H;
  const under = new THREE.Mesh(tiled(-W / 2, W / 2, -D / 2, D / 2, 0.8), matte({ map: tex.stuccoTexture([236, 228, 208], 72, true) }, 0.75, 1.2));
  under.rotation.x = Math.PI / 2; // facing down; its y runs along world +z
  under.userData.noEdges = true;
  const slab = box(ceiling, W + 2 * T, 0.08, D + 2 * T, matte({ map: tex.plywoodTexture() }, 0.4, 1.2), 0, 0.041, 0);
  slab.userData.noAscii = true;
  ceiling.add(under);
  const bright = lampLight(tex.glowTexture(), HOOK.x, HOOK.z, HOOK.x - WALL_LIGHT, W / 2, -D / 2, HOOK.z + WALL_LIGHT);
  bright.rotation.x = Math.PI / 2;
  bright.position.y = -0.003;
  ceiling.add(bright);
  lights.push(bright);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 8), chainMat);
  plate.position.set(HOOK.x, -0.006, HOOK.z);
  ceiling.add(plate);
  lamp.pendulum.position.set(HOOK.x, -0.02, HOOK.z);
  ceiling.add(lamp.pendulum);
  group.add(ceiling, lamp.light);
  for (const m of lights) lamp.addGlow(m, m === bright ? 0.15 : 0.4, m !== bright);

  scene.add(group);
  lamp.update(0);

  // The room's corner lines, for the ASCII outline. (The wall planes skip their own
  // edges, which would draw a seam down the middle of every wall.)
  const corner = (x, y, z) => new THREE.Vector3((x * W) / 2, y * H, (z * D) / 2);
  const ring = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const outline = [];
  ring.forEach(([x, z], i) => {
    const [nx, nz] = ring[(i + 1) % 4];
    outline.push([corner(x, 0, z), corner(x, 1, z)], [corner(x, 0, z), corner(nx, 0, nz)], [corner(x, 1, z), corner(nx, 1, nz)]);
  });

  return {
    group,
    focus: FOCUS.clone(),
    walls,
    outline,
    slab: { width: W, depth: D },
    lamp: { light: lamp.light, setLevel: lamp.setLevel },
    update: (dt) => lamp.update(dt),
    collapse: createCollapse(scene, walls, ceiling, lamp),
  };
}

// [a, b] with the gaps cut out.
function without([a, b], gaps) {
  const out = [];
  let from = a;
  for (const [g0, g1] of gaps) {
    if (g0 > from) out.push([from, Math.min(g0, b)]);
    from = Math.max(from, g1);
  }
  if (from < b) out.push([from, b]);
  return out.filter(([x0, x1]) => x1 - x0 > 0.01);
}

// --- Collapse: the walls fall outward like a film set; the ceiling is lifted away,
// the lamp swinging under it ---------------------------------------------------------

const easeIn = (u) => u * u * u;
const BOUNCE = 0.35; // seconds of rebound after a wall hits the ground
const GONE = config.hall.height + 0.5; // the ceiling is hidden once it is up past the hall's roof

function createCollapse(scene, walls, ceiling, lamp) {
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
    // An open door falls shut as its wall tips over.
    for (const door of h.group.userData.doors) door.rotation.y = -door.userData.open * (1 - THREE.MathUtils.smoothstep(u, 0.35, 0.95));
    if (split) {
      h.group.position.x = h.side * 0.6 * u * u; // the halves pull apart...
      h.group.rotation.z = -h.side * 0.12 * u; // ...and twist away from each other
    }
    return u >= 1;
  }

  // The ceiling breaks loose with a yank (which sets the lamp swinging), then is
  // hauled up and away over the corner, fast. The lamp dims as it goes; the light it
  // painted on the walls fades as soon as it leaves its spot.
  function lift(t) {
    const loose = THREE.MathUtils.smoothstep(t, 0, 0.45);
    const yank = Math.sin(Math.PI * Math.min(1, t / 0.45));
    const up = Math.max(0, t - 0.35) ** 2;
    ceiling.position.set(0.3 * yank + 0.45 * up, H + 0.2 * loose + 2.6 * up, -0.06 * yank - 0.35 * up);
    ceiling.rotation.set(-0.04 * up, 0, 0.06 * yank + 0.05 * up);
    ceiling.visible = ceiling.position.y < GONE;
    lamp.setPresence(1 - THREE.MathUtils.smoothstep(ceiling.position.y, H + 1.2, H + 5), 1 - THREE.MathUtils.smoothstep(t, 0.1, 0.7));
  }

  function puffs(wall) {
    const out = new THREE.Vector3(0, 0, -1).transformDirection(wall.pivot.matrixWorld);
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Sprite(dustMat.clone());
      const along = (Math.random() - 0.5) * wall.length;
      const from = -0.2 - Math.random() * H; // from the hinge out to where the top hit
      s.position.copy(wall.pivot.localToWorld(new THREE.Vector3(along, 0.3, from)));
      s.scale.setScalar(0.8);
      scene.add(s);
      const vel = out.clone().multiplyScalar(0.8 + Math.random()).setY(0.4 + Math.random() * 0.4);
      dust.push({ s, vel, life: 1.6 });
    }
  }

  function clearDust() {
    for (const d of dust) {
      scene.remove(d.s);
      d.s.material.dispose();
    }
    dust.length = 0;
  }

  return {
    start() {
      landed = new Set();
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
      lift(t);
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
    // The end state: walls flat, ceiling and lamp gone (up past the roof, hidden, dark).
    finish() {
      for (const wall of Object.values(walls)) for (const h of wall.halves) pose(h, fall + BOUNCE);
      lift(4);
      ceiling.visible = false;
      lamp.setPresence(0);
      clearDust();
    },
    dispose() {
      clearDust();
      dustMat.map.dispose();
      dustMat.dispose();
    },
  };
}
