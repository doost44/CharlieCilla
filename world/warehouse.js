import THREE from './three.js';
import { config } from './config.js';
import { rng, flatMaterial } from './textures.js';
import * as tex from './warehouse-textures.js';

// The abandoned brick warehouse the room set stands in (REF-A): whitewashed brick
// peeling to red, rows of tall steel-framed windows, black steel columns, a dark roof
// of trusses and timber with one broken patch, rubble, cinder blocks, haze. The only
// real lights are one ambient and one directional; the sun is faked with additive
// god-ray shafts, pools on the floor and glowing glass. Hidden until the room falls.

const { width: W, depth: D, height: H } = config.hall;
const HX = W / 2, HZ = D / 2;
const BAY = 7; // window and truss spacing along the long walls
const WIN = { width: 3.6, sill: 1.2, head: 7.2, depth: 0.45 }; // depth: glass set back in the wall
const BAND = 1.05; // red brick skirting under the whitewash
const LINTEL = 0.45; // red brick band over each opening (and LIP past its sides)
const LIP = 0.3;
const SUN = new THREE.Vector3(-0.55, -0.62, 1).normalize(); // sunlight, in through the -z windows and the hole
const HOLE = { x0: 17.5, x1: 25, z0: -11.25, z1: -6.75 }; // roof sheets missing here
const HOLE_BEAMS = [[17.7, 19.9], [20.5, 22.4], [22.9, 24.3]]; // light between the hanging sheets (x)
const CLEAR = 7; // nothing on the floor within this radius of the origin (the room and its fallen walls)
const TRUSS_X = Array.from({ length: W / BAY }, (_, i) => -HX + BAY * (i + 0.5)); // over the piers between windows
const COLUMN_Z = HZ - 0.9; // the columns stand this far out, in front of both long walls

const AMBIENT = [0x7484aa, 0.4];
const LIGHT_FADE = 2; // seconds for the hall's light to reach the room set once revealed (0: at once)
const TOP_LIGHT = [0xcfd6e4, 0.22]; // cool light from above: shape for the floor and rubble
const FOG = [0x262f40, 2, 75];
const SKY = 0xe4e6e2; // seen through the hole in the roof
const WARM = [1, 0.84, 0.62], COOL = [0.66, 0.76, 0.92];
const SHAFT_STRENGTH = 0.42;
const DUST = { count: 2400, box: [30, H, 30], size: 0.022 };

const V3 = THREE.Vector3;
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const blotch = (a, b) => 0.88 + 0.06 * (Math.sin(a * 0.31 + b * 0.7) + Math.sin(a * 0.13 - b * 0.37 + 1.7));
const hash = (n) => { const x = Math.sin(n * 91.7) * 437.5; return x - Math.floor(x); };
const toFloor = (p, dir = SUN) => p.clone().addScaledVector(dir, p.y / -dir.y);

export function buildWarehouse(scene) {
  const group = new THREE.Group();
  const parts = { sheets: [], timber: [] }; // corrugated sheets and timber from every builder, drawn once each
  const walls = buildWalls(group, parts);
  buildFloor(group);
  const props = buildProps(group, parts);
  const colliders = [...buildRoof(group, parts), ...props.colliders];
  boxes(group, flatMaterial({ map: tex.corrugatedTexture() }), parts.sheets);
  boxes(group, flatMaterial({ map: tex.timberTexture() }), parts.timber);
  const light = buildLight(group, walls);
  const dust = buildDust(group);
  scene.add(group);

  // The lights stay in the scene at zero while hidden, so no material recompiles on reveal.
  // They also light the room set, so after reveal(true) they fade up (in update) rather
  // than flattening the lamp-lit room in one frame.
  const ambient = new THREE.AmbientLight(AMBIENT[0], 0);
  const top = new THREE.DirectionalLight(TOP_LIGHT[0], 0);
  top.position.set(-0.2, 1, -0.35);
  scene.add(ambient, top);
  let level = 0;
  const setLevel = (k) => {
    level = k;
    ambient.intensity = AMBIENT[1] * k;
    top.intensity = TOP_LIGHT[1] * k;
    light.uniforms.uStrength.value = SHAFT_STRENGTH * k; // the god-rays and dust come up with it
    dust.uniforms.uLevel.value = k;
  };

  const sky = new THREE.Color(SKY);
  const paper = new THREE.Color(config.site.paper);
  const fog = new THREE.Fog(...FOG);

  function reveal(on) {
    if (!on) setLevel(0);
    else if (!LIGHT_FADE) setLevel(1);
    group.visible = on;
    scene.background = on ? sky : paper;
    scene.fog = on ? fog : null;
  }
  reveal(false);

  let time = 0;
  return {
    group,
    reveal,
    update(dt, camera) {
      if (!group.visible) return;
      if (level < 1) setLevel(Math.min(1, level + dt / LIGHT_FADE));
      time += dt;
      light.uniforms.uTime.value = time;
      dust.uniforms.uTime.value = time;
      dust.uniforms.uCenter.value.copy(camera.position);
    },
    bounds: { minX: -HX + 0.6, maxX: HX - 0.6, minZ: -HZ + 0.6, maxZ: HZ - 0.6 },
    colliders,
    // The top of the stack GoatMan tends, and the blocks knocked off it: { mesh (instanced),
    // items ({ p, s, r, c } per instance), stack: { x, z, nx, nz, top } }.
    work: props.work,
    dispose() {
      scene.remove(group, ambient, top);
      group.traverse((o) => {
        o.geometry?.dispose();
        if (o.isInstancedMesh) o.dispatchEvent({ type: 'dispose' }); // frees its instance buffers (r128 has no dispose())
        for (const m of [o.material].flat()) {
          if (!m) continue;
          for (const v of [...Object.values(m), ...Object.values(m.uniforms || {}).map((u) => u.value)]) if (v?.isTexture) v.dispose();
          m.dispose();
        }
      });
    },
  };
}

// --- Geometry helpers -------------------------------------------------------------

// Collects quads and triangles into one non-indexed geometry: one draw call per material.
// attrs: extra per-vertex attributes and their sizes.
function merger(attrs = { color: 3 }) {
  const data = { position: [], uv: [] };
  for (const k in attrs) data[k] = [];
  const ab = new V3(), ac = new V3();
  return {
    // Corners in order round the face, flipped if needed so it faces `facing`. vals: per
    // attribute one value for every corner, or an array with one per corner.
    poly(pts, uvs, vals = {}, facing) {
      let order = pts.length === 4 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2];
      ab.subVectors(pts[1], pts[0]);
      ac.subVectors(pts[2], pts[0]);
      if (facing && ab.cross(ac).dot(facing) < 0) order = order.map((i) => (i ? pts.length - i : 0));
      for (const i of order) {
        data.position.push(pts[i].x, pts[i].y, pts[i].z);
        data.uv.push(...uvs[i]);
        for (const k in attrs) {
          const v = vals[k] ?? Array(attrs[k]).fill(1);
          data[k].push(...(Array.isArray(v[0]) ? v[i] : v));
        }
      }
    },
    geometry() {
      const g = new THREE.BufferGeometry();
      for (const [k, arr] of Object.entries(data)) {
        g.setAttribute(k, new THREE.Float32BufferAttribute(arr, k === 'position' ? 3 : k === 'uv' ? 2 : attrs[k]));
      }
      g.computeVertexNormals();
      return g;
    },
  };
}

const UP = new V3(0, 1, 0);
const quadUv = [[0, 0], [1, 0], [1, 1], [0, 1]];

// Many boxes as one InstancedMesh. Each item: p position, s size, r euler or q quaternion, c colour.
const dummy = new THREE.Object3D();
function boxes(group, material, items) {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, items.length);
  const color = new THREE.Color();
  items.forEach((it, i) => {
    dummy.position.set(...it.p);
    if (it.q) dummy.quaternion.copy(it.q);
    else dummy.rotation.set(...(it.r || [0, 0, 0]));
    dummy.scale.set(...it.s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, color.setRGB(...(it.c || [1, 1, 1])));
  });
  mesh.frustumCulled = false; // r128 culls instances by the unit box at the origin
  group.add(mesh);
  return mesh;
}

// A beam between two points (its length along local x).
const X = new V3(1, 0, 0);
function beam(items, a, b, w, h, c) {
  const dir = new V3().subVectors(b, a);
  const len = dir.length();
  items.push({ p: a.clone().add(b).multiplyScalar(0.5).toArray(), s: [len, h, w], q: new THREE.Quaternion().setFromUnitVectors(X, dir.normalize()), c });
}

// Sorted breakpoints with no gap wider than `max`.
function breaks(list, max) {
  const xs = [...new Set(list.map((v) => +v.toFixed(3)))].sort((a, b) => a - b);
  const out = [xs[0]];
  for (let i = 1; i < xs.length; i++) {
    const n = Math.ceil((xs[i] - xs[i - 1]) / max);
    for (let k = 1; k <= n; k++) out.push(xs[i - 1] + ((xs[i] - xs[i - 1]) * k) / n);
  }
  return out;
}

// Fog for things that glow: glass fades only halfway (it is the light), additive light
// fades to nothing instead of to the fog colour.
function glowFog(material, additive) {
  material.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <fog_fragment>', `#ifdef USE_FOG
      float fogK = smoothstep(fogNear, fogFar, fogDepth);
      ${additive ? 'gl_FragColor.rgb *= 1.0 - fogK;' : 'gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogK * 0.5);'}
    #endif`);
  };
  material.customProgramCacheKey = () => (additive ? 'hall-glow-add' : 'hall-glow');
  return material;
}

// --- Walls and windows ---------------------------------------------------------------

// The four walls seen from inside: o is the left end, u runs along the wall to the right.
function wallSpecs() {
  const win = (s, w = WIN.width, t0 = WIN.sill, t1 = WIN.head) => ({ s0: s - w / 2, s1: s + w / 2, t0, t1 });
  const long = [];
  for (let s = BAY; s < W; s += BAY) long.push(win(s));
  const small = (s) => win(s, 2.4, 3.4, 5.8);
  return [
    { o: [-HX, -HZ], u: [1, 0], len: W, sun: true, openings: long },
    { o: [HX, HZ], u: [-1, 0], len: W, openings: long },
    { o: [-HX, HZ], u: [0, -1], len: D, openings: [6.75, 15.75, 29.25, 38.25].map((s) => small(s)) },
    { o: [HX, -HZ], u: [0, 1], len: D, openings: [small(9), { s0: 19.9, s1: 25.1, t0: 0, t1: 5.4, door: true }, small(36)] },
  ];
}

function buildWalls(group, parts) {
  const r = rng(501);
  const paint = merger(), red = merger(), peel = merger(), glassSun = merger(), glass = merger();
  const specs = wallSpecs();

  for (const wall of specs) {
    const [ux, uz] = wall.u;
    const n = new V3(-uz, 0, ux); // into the room
    const at = (s, t, d = 0) => new V3(wall.o[0] + ux * s - n.x * d, t, wall.o[1] + uz * s - n.z * d);
    const tint = wall.sun ? WARM : COOL;
    const inside = (o, s, t) => s > o.s0 && s < o.s1 && t > o.t0 && t < o.t1;
    const lintel = (o, s, t) => s > o.s0 - LIP && s < o.s1 + LIP && t > o.t1 && t < o.t1 + LINTEL;

    // Grime and light: damp near the floor, soot under the roof, a glow round each window.
    const shade = (s, t) => {
      const p = at(s, t);
      const streak = 1 - (0.15 + 0.3 * smooth((t - 3) / 6)) * hash(Math.round(s * 1.3) + wall.len); // rain run-off
      const k = (0.6 + 0.4 * smooth(t / 2.6)) * (1 - 0.4 * smooth((t - 6) / 3)) * blotch(p.x + p.z, t) * streak;
      let spill = 0;
      for (const o of wall.openings) {
        if (o.door) continue;
        const ds = Math.max(o.s0 - s, 0, s - o.s1), dt = Math.max(o.t0 - t, 0, t - o.t1);
        spill += Math.exp(-Math.hypot(ds, dt) / 1.2);
      }
      spill *= wall.sun ? 0.9 : 0.5;
      return tint.map((c) => k * (1 + spill * c));
    };

    const ss = breaks([0, wall.len, ...wall.openings.flatMap((o) => [o.s0, o.s1, o.s0 - LIP, o.s1 + LIP])], 1);
    const ts = breaks([0, BAND, H + 0.1, ...wall.openings.flatMap((o) => [o.t0, o.t1, o.t1 + LINTEL])], 1);
    for (let i = 1; i < ss.length; i++) {
      for (let j = 1; j < ts.length; j++) {
        const [s0, s1, t0, t1] = [ss[i - 1], ss[i], ts[j - 1], ts[j]];
        const sc = (s0 + s1) / 2, tc = (t0 + t1) / 2;
        if (wall.openings.some((o) => inside(o, sc, tc))) continue;
        const isRed = tc < BAND || wall.openings.some((o) => lintel(o, sc, tc));
        const tile = isRed ? 1.2 : tex.BRICK_TILE;
        const corners = [[s0, t0], [s1, t0], [s1, t1], [s0, t1]];
        (isRed ? red : paint).poly(corners.map(([s, t]) => at(s, t)), corners.map(([s, t]) => [s / tile, t / tile]), { color: corners.map(([s, t]) => shade(s, t)) }, n);
      }
    }

    for (const o of wall.openings) {
      // Brick reveals round the opening, lit by the glass.
      const mid = at((o.s0 + o.s1) / 2, (o.t0 + o.t1) / 2, WIN.depth / 2);
      const lit = wall.sun ? [1.5, 1.32, 1.1] : [1.1, 1.18, 1.3];
      const edges = [[[o.s0, o.t0], [o.s0, o.t1]], [[o.s1, o.t1], [o.s1, o.t0]], [[o.s0, o.t1], [o.s1, o.t1]]];
      if (!o.door) edges.push([[o.s1, o.t0], [o.s0, o.t0]]);
      for (const [[sa, ta], [sb, tb]] of edges) {
        const pts = [at(sa, ta), at(sb, tb), at(sb, tb, WIN.depth), at(sa, ta, WIN.depth)];
        const len = Math.hypot(sb - sa, tb - ta) / 1.2, dep = WIN.depth / 1.2;
        const face = new V3().addVectors(pts[0], pts[2]).multiplyScalar(0.5);
        red.poly(pts, [[0, 0], [len, 0], [len, dep], [0, dep]], { color: lit }, mid.clone().sub(face));
      }
      const pts = [at(o.s0, o.t0, WIN.depth), at(o.s1, o.t0, WIN.depth), at(o.s1, o.t1, WIN.depth), at(o.s0, o.t1, WIN.depth)];
      if (o.door) {
        // A rolled-down shutter (a corrugated sheet turned so the ridges run across).
        const c = at((o.s0 + o.s1) / 2, o.t1 / 2, WIN.depth - 0.05);
        const turn = new THREE.Matrix4().makeBasis(UP, n, new V3(ux, 0, uz)); // box x up, y out of the wall, z along it
        parts.sheets.push({ p: c.toArray(), s: [o.t1, 0.06, o.s1 - o.s0], q: new THREE.Quaternion().setFromRotationMatrix(turn), c: [0.36, 0.33, 0.32] });
        continue;
      }
      // Glass from a random window variant, cropped for the small windows, sometimes mirrored.
      o.variant = (r() * tex.WINDOW_VARIANTS) | 0;
      o.mirror = r() < 0.5;
      o.uSpan = (o.s1 - o.s0) / WIN.width;
      o.vSpan = (o.t1 - o.t0) / (WIN.head - WIN.sill);
      (wall.sun ? glassSun : glass).poly(pts, paneUvs(o, tex.WINDOW_VARIANTS), {}, n);
    }

    // Big patches where the whitewash has fallen away to the red brick.
    for (let k = 0; k < wall.len / 3; k++) {
      const size = 2.4;
      const s0 = Math.round((1 + r() * (wall.len - size - 2)) / 0.6) * 0.6, t0 = 0.6 + 0.15 * Math.round((r() * (H - 2)) / 0.15);
      const hits = wall.openings.some((o) => s0 < o.s1 + 0.1 && s0 + size > o.s0 - 0.1 && t0 < o.t1 + 0.1 && t0 + size > o.t0 - 0.1);
      if (hits) continue;
      const corners = [[s0, t0], [s0 + size, t0], [s0 + size, t0 + size], [s0, t0 + size]];
      const fu = r() < 0.5, fv = r() < 0.5;
      const uv = quadUv.map(([u, v]) => [fu ? 1 - u : u, fv ? 1 - v : v]); // mirrored, so it doesn't look stamped
      peel.poly(corners.map(([s, t]) => at(s, t, -0.01)), uv, { color: corners.map(([s, t]) => shade(s, t).map((c) => c * 1.5)) }, n);
    }
    wall.at = at;
    wall.n = n;
  }

  const mesh = (m, mat) => group.add(new THREE.Mesh(m.geometry(), mat));
  mesh(paint, flatMaterial({ map: tex.whitewashTexture(), vertexColors: true }));
  mesh(red, flatMaterial({ map: tex.redBrickTexture(), vertexColors: true }));
  mesh(peel, flatMaterial({ map: tex.peelTexture(), vertexColors: true, alphaTest: 0.5 }));
  const windowTex = tex.windowTexture();
  mesh(glassSun, glowFog(new THREE.MeshBasicMaterial({ map: windowTex, color: 0xfff4e2 }), false));
  mesh(glass, glowFog(new THREE.MeshBasicMaterial({ map: windowTex, color: 0xbcc6d4 }), false));
  return specs;
}

// UVs into a strip of `slots` window-sized slots for this opening's variant.
function paneUvs(o, slots) {
  let u0 = o.variant / slots, u1 = (o.variant + o.uSpan) / slots;
  if (o.mirror) [u0, u1] = [u1, u0];
  return [[u0, 0], [u1, 0], [u1, o.vSpan], [u0, o.vSpan]];
}

// --- Floor ---------------------------------------------------------------------------------

function buildFloor(group) {
  const floor = merger();
  const NX = 40, NZ = 26;
  // Darker towards the walls and in big wet patches; warmer where the sun lands.
  const shade = (x, z) => {
    const edge = Math.min(HX - Math.abs(x), HZ - Math.abs(z));
    const wet = smooth((Math.sin(x * 0.21 + 1) * Math.sin(z * 0.27 - 0.5) - 0.3) * 3);
    const dusty = smooth((Math.sin(x * 0.13 - 2) * Math.sin(z * 0.19 + 1.3) - 0.2) * 2.5);
    const k = (0.6 + 0.4 * smooth(edge / 5)) * blotch(x * 0.8, z * 0.8) * (1 - 0.4 * wet) * (1 + 0.3 * dusty);
    const sun = 0.3 * Math.exp(-Math.abs(z + 14) / 6);
    return [k + sun * WARM[0], k + sun * WARM[1], k + sun * WARM[2]];
  };
  for (let i = 0; i < NX; i++) {
    for (let j = 0; j < NZ; j++) {
      const x0 = -HX + (W * i) / NX, x1 = x0 + W / NX, z0 = -HZ + (D * j) / NZ, z1 = z0 + D / NZ;
      const corners = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
      floor.poly(corners.map(([x, z]) => new V3(x, 0, z)), corners.map(([x, z]) => [x / 4, -z / 4]), { color: corners.map(([x, z]) => shade(x, z)) }, UP);
    }
  }
  group.add(new THREE.Mesh(floor.geometry(), flatMaterial({ map: tex.concreteTexture(), vertexColors: true })));

  // Decals: dark wet puddles (a little shine) and pale dust, kept off the room's patch.
  const r = rng(502);
  const decal = (m, x, z, w, d, y) => {
    const a = r() * Math.PI, c = Math.cos(a), s = Math.sin(a);
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => new V3(x + (u * w * c - v * d * s) / 2, y, z + (u * w * s + v * d * c) / 2));
    m.poly(pts, quadUv, { color: [1, 1, 1] }, UP);
  };
  const spot = (minR) => {
    for (;;) {
      const x = (r() - 0.5) * (W - 4), z = (r() - 0.5) * (D - 4);
      if (Math.hypot(x, z) > minR) return [x, z];
    }
  };
  const puddles = merger(), dust = merger();
  for (let i = 0; i < 4; i++) decal(puddles, 21 + (r() - 0.5) * 6, -6 + (r() - 0.5) * 8, 2 + r() * 3, 1.5 + r() * 2, 0.012); // rain through the hole
  for (let i = 0; i < 12; i++) decal(puddles, ...spot(CLEAR), 1.5 + r() * 4, 1 + r() * 3, 0.012);
  for (let i = 0; i < 22; i++) decal(dust, ...spot(CLEAR), 2 + r() * 5, 2 + r() * 4, 0.008);
  const decalMat = (opts) => ({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4, ...opts });
  group.add(new THREE.Mesh(puddles.geometry(), new THREE.MeshPhongMaterial(decalMat({ map: tex.puddleTexture(), color: 0x1c232c, specular: 0x5c6a7c, shininess: 30 }))));
  group.add(new THREE.Mesh(dust.geometry(), flatMaterial(decalMat({ map: tex.dustTexture() }))));
}

// --- Roof: corrugated sheets, timber purlins, steel trusses and the columns under them --

function buildRoof(group, { sheets, timber }) {
  const r = rng(503);
  const steel = [];
  const inHole = (x, z) => x > HOLE.x0 && x < HOLE.x1 && z > HOLE.z0 && z < HOLE.z1;
  const grey = () => { const g = 0.45 + r() * 0.35; return [g, g, g]; };

  // Sheets overlap a little; alternate heights so the overlaps never z-fight.
  for (let i = 0; i < W / 2.5; i++) {
    for (let k = 0; k < D / 2.25; k++) {
      const x = -HX + 2.5 * (i + 0.5), z = -HZ + 2.25 * (k + 0.5);
      if (!inHole(x, z)) sheets.push({ p: [x, H + 0.03 + ((i + k) % 2) * 0.02, z], s: [2.6, 0.03, 2.35], c: grey() });
    }
  }
  // Torn sheets still hinged on an edge of the hole, hanging into it, and the ones that came down.
  const hang = (x, z, angle, about) => {
    const half = about === 'x' ? 1.125 : 1.25;
    const p = about === 'x'
      ? [x, H - Math.sin(angle) * half, z + Math.cos(angle) * half]
      : [x - Math.cos(angle) * half, H - Math.sin(angle) * half, z];
    sheets.push({ p, s: [2.5, 0.03, 2.25], r: about === 'x' ? [angle, 0, 0] : [0, 0, angle], c: grey() });
  };
  hang(21.25, HOLE.z0, 1.05, 'x');
  hang(HOLE.x1, -7.9, 0.75, 'z');
  // Ragged bits still clinging round the rim, so the hole isn't a clean rectangle.
  for (const [x, y, z, sx, sz, rx, rz] of [
    [18.6, 8.7, -10, 1.4, 1.6, 0.5, -0.2], [17.95, H - 0.2, -7.9, 0.9, 1.7, 0, -0.45], [24.4, H - 0.12, -10.6, 1.1, 0.9, 0.3, 0],
    [19.6, H + 0.01, -7.05, 1.7, 0.6, 0, 0], [23.1, H + 0.01, -11.0, 1.4, 0.55, 0, 0], [24.6, H + 0.01, -7.4, 0.8, 1.2, 0, 0],
  ]) sheets.push({ p: [x, y, z], s: [sx, 0.03, sz], r: [rx, 0.2 * (rx - rz), rz], c: grey() });
  for (const [x, z, a, b] of [[20.2, -8.4, 0.35, 0.2], [22.5, -10, -0.3, 1.1], [23.6, -7.3, 0.15, 2.4]]) {
    sheets.push({ p: [x, 0.55, z], s: [2.5, 0.03, 2.25], r: [a, b, 0.1], c: grey() });
  }

  // Purlins run along the hall between the trusses (one is broken over the hole).
  const stops = [-HX, ...TRUSS_X, HX];
  for (let k = 0; k <= D / 2.25; k++) {
    const z = -HZ + 2.25 * k;
    for (let i = 1; i < stops.length; i++) {
      const x0 = stops[i - 1], x1 = stops[i];
      if (inHole((x0 + x1) / 2, z)) continue;
      timber.push({ p: [(x0 + x1) / 2, H - 0.11, z], s: [x1 - x0, 0.22, 0.14] });
    }
  }
  beam(timber, new V3(HOLE.x0, H - 0.11, -9), new V3(HOLE.x0 + 2.4, H - 1.6, -9.3), 0.14, 0.22);
  beam(timber, new V3(22.4, 0.9, -8.2), new V3(25.8, 0.1, -9.6), 0.14, 0.22);

  // Steel trusses across the hall, on black columns standing in front of the long walls.
  const dark = [0.55, 0.55, 0.58];
  const yb = 7.62, yt = H - 0.33, P = 2.25;
  const colliders = [];
  for (const x of TRUSS_X) {
    beam(steel, new V3(x, yb, -HZ), new V3(x, yb, HZ), 0.2, 0.22, dark);
    beam(steel, new V3(x, yt, -HZ), new V3(x, yt, HZ), 0.2, 0.2, dark);
    for (let k = 0; k <= D / P; k++) {
      const z = -HZ + k * P;
      beam(steel, new V3(x, yb, z), new V3(x, yt, z), 0.08, 0.08, dark);
      if (k < D / P - 0.5) {
        const z1 = z + P, up = z < 0; // diagonals slope up towards the middle
        beam(steel, new V3(x, up ? yb : yt, z), new V3(x, up ? yt : yb, z1), 0.08, 0.08, dark);
      }
    }
    for (const side of [-1, 1]) {
      const z = side * COLUMN_Z, h = yb - 0.11; // an I-section: two flanges, a web, a base plate
      steel.push({ p: [x, h / 2, z - 0.16], s: [0.34, h, 0.03], c: dark }, { p: [x, h / 2, z + 0.16], s: [0.34, h, 0.03], c: dark });
      steel.push({ p: [x, h / 2, z], s: [0.03, h, 0.3], c: dark }, { p: [x, 0.02, z], s: [0.6, 0.04, 0.6], c: dark });
      colliders.push({ x, z, r: 0.45 });
    }
  }
  for (const side of [-1, 1]) steel.push({ p: [0, 7.4, side * COLUMN_Z], s: [W, 0.3, 0.2], c: dark });
  boxes(group, flatMaterial({ map: tex.steelTexture() }), steel);
  return colliders;
}

// --- Rubble, bricks, cinder blocks, planks: everything that stands on the floor -----

const MOUNDS = [
  // x, z, radius, height
  [-24, 19.6, 2.6, 1.0], [-10, 19.8, 2.0, 0.7], [3, 19.4, 3.0, 1.2], [14.5, 19.8, 2.2, 0.8], [28, 19.2, 2.8, 1.1],
  [21.3, -9, 2.6, 1.0], // under the hole
  [-27, -13, 2.0, 0.7], [30, -4, 1.6, 0.6],
];
const STACKS = [
  // x, z, blocks along x, along z, layers (cinder blocks on a pallet, far back)
  [-31.2, 0.8, 4, 9, 7],
  [-29.6, -1.9, 3, 5, 5],
  [-31.6, 3.4, 3, 4, 3],
];
// The stack GoatMan tends (goatman-site.js): its top layer and the blocks knocked off are
// drawn as a mesh of their own, so he can move them.
const WORK = 1;

function buildProps(group, { timber }) {
  const r = rng(504);
  const colliders = [];

  // Sand and broken mortar mounds, with bricks strewn over and round them.
  const sand = merger(), bricks = [], blocks = [];
  const brickColor = () => {
    const p = r();
    const c = p < 0.6 ? [0.62, 0.3, 0.22] : p < 0.88 ? [0.86, 0.84, 0.8] : [0.3, 0.26, 0.24];
    const k = 0.85 + r() * 0.3;
    return c.map((v) => v * k);
  };
  const brick = (x, y, z, big) => bricks.push({
    p: [x, y, z],
    s: big ? [0.5 + r() * 0.3, 0.2 + r() * 0.1, 0.3 + r() * 0.2] : [0.23, 0.075, 0.11],
    r: [(r() - 0.5) * 0.8, r() * Math.PI, (r() - 0.5) * 0.8],
    c: brickColor(),
  });
  for (const [cx, cz, R, h] of MOUNDS) {
    const RINGS = 5, SEGS = 11;
    const ring = [[new V3(cx, h, cz)]];
    for (let i = 1; i <= RINGS; i++) {
      const pts = [];
      for (let j = 0; j < SEGS; j++) {
        const a = (j / SEGS) * Math.PI * 2, d = (R * i) / RINGS * (0.8 + r() * 0.35);
        const y = i === RINGS ? -0.02 : h * (1 - Math.pow(i / RINGS, 1.6)) + (r() - 0.5) * 0.15;
        pts.push(new V3(cx + Math.cos(a) * d, y, cz + Math.sin(a) * d * 0.85));
      }
      ring.push(pts);
    }
    const uv = (p) => [p.x / 1.5, p.z / 1.5];
    const col = (p) => { const k = 0.7 + 0.3 * (p.y / h) + r() * 0.1; return [k, k, k]; };
    for (let i = 0; i < RINGS; i++) {
      for (let j = 0; j < SEGS; j++) {
        const j1 = (j + 1) % SEGS;
        const pts = i === 0 ? [ring[0][0], ring[1][j], ring[1][j1]] : [ring[i][j], ring[i + 1][j], ring[i + 1][j1], ring[i][j1]];
        sand.poly(pts, pts.map(uv), { color: pts.map(col) }, UP);
      }
    }
    for (let k = 0; k < 10 + R * 8; k++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R * 1.25;
      const y = Math.max(0.03, h * (1 - Math.pow(Math.min(d / R, 1), 1.6)) - 0.02);
      brick(cx + Math.cos(a) * d, y, cz + Math.sin(a) * d * 0.85, k < 3);
    }
    colliders.push({ x: cx, z: cz, r: R * 0.8 });
  }
  for (let k = 0; k < 70; k++) {
    const x = (r() - 0.5) * (W - 3), z = (r() - 0.5) * (D - 3);
    if (Math.hypot(x, z) > CLEAR + 1) brick(x, 0.035, z);
  }

  // Cinder blocks stacked on pallets, a few knocked off.
  const work = [];
  STACKS.forEach(([cx, cz, nx, nz, layers], si) => {
    const w = nx * 0.41, d = nz * 0.21;
    for (const z of [-d / 2 + 0.05, 0, d / 2 - 0.05]) timber.push({ p: [cx, 0.05, cz + z], s: [w + 0.1, 0.1, 0.1] });
    for (let x = -w / 2; x <= w / 2; x += 0.25) timber.push({ p: [cx + x, 0.115, cz], s: [0.12, 0.03, d + 0.1] });
    for (let ly = 0; ly < layers; ly++) {
      for (let ix = 0; ix < nx; ix++) {
        for (let iz = 0; iz < nz; iz++) {
          if (ly === layers - 1 && r() < 0.35) continue;
          const g = 0.8 + r() * 0.25;
          const p = [cx + (ix - (nx - 1) / 2) * 0.41, 0.23 + ly * 0.2, cz + (iz - (nz - 1) / 2) * 0.21];
          (si === WORK && ly === layers - 1 ? work : blocks).push({ p, s: [0.4, 0.19, 0.2], r: [0, (r() - 0.5) * 0.05, 0], c: [g, g, g * 0.98] });
        }
      }
    }
    colliders.push({ x: cx, z: cz, r: Math.hypot(w, d) / 2 + 0.2 });
  });
  for (let k = 0; k < 9; k++) {
    blocks.push({ p: [-29.2 + r() * 2.5, 0.1, -3 + r() * 7], s: [0.4, 0.19, 0.2], r: [r() < 0.3 ? Math.PI / 2 : 0, r() * Math.PI, 0], c: [0.85, 0.85, 0.84] });
  }
  // Blocks lying round the stack GoatMan tends: most behind it, towards the wall and the big
  // stack (where he works), a few out in front. Their own random numbers, so nothing else moves.
  const wr = rng(505);
  const [wx, wz] = STACKS[WORK];
  for (let k = 0, tries = 0; k < 17 && tries < 600; tries++) {
    const a = (k < 14 ? Math.PI : 0) + (wr() - 0.5) * 2.2; // behind is towards -x, the wall
    const d = 1.2 + wr() * 1.6;
    const p = [wx + Math.cos(a) * d, 0.1, wz + Math.sin(a) * d];
    const onStack = STACKS.some(([x, z, nx, nz]) => Math.abs(p[0] - x) < nx * 0.205 + 0.45 && Math.abs(p[2] - z) < nz * 0.105 + 0.45);
    if (onStack || p[0] < -HX + 1 || p[2] < wz - 1.5 || work.some((b) => Math.hypot(b.p[0] - p[0], b.p[2] - p[2]) < 0.55)) continue;
    const g = 0.8 + wr() * 0.25;
    work.push({ p, s: [0.4, 0.19, 0.2], r: [wr() < 0.3 ? Math.PI / 2 : 0, wr() * Math.PI, 0], c: [g, g, g * 0.98] });
    k++;
  }

  // Planks lying about, and a few leaning on the far wall.
  for (let k = 0; k < 8; k++) {
    const x = (r() - 0.5) * (W - 8), z = (r() - 0.5) * (D - 8);
    if (Math.hypot(x, z) > CLEAR + 2) timber.push({ p: [x, 0.03, z], s: [2.4 + r() * 1.6, 0.05, 0.22], r: [0, r() * Math.PI, 0] });
  }
  for (const x of [-17.5 + 1.2, 8.4, 9.1]) timber.push({ p: [x, 1.5, HZ - 0.45], s: [0.22, 3.1, 0.05], r: [-0.28, 0, (r() - 0.5) * 0.2] });

  group.add(new THREE.Mesh(sand.geometry(), flatMaterial({ map: tex.sandTexture(), vertexColors: true })));
  boxes(group, flatMaterial({ map: tex.brickBitTexture() }), bricks);
  const cinder = flatMaterial({ map: tex.cinderTexture() });
  boxes(group, cinder, blocks);
  const [x, z, nx, nz, layers] = STACKS[WORK];
  return { colliders, work: { mesh: boxes(group, cinder, work), items: work, stack: { x, z, nx, nz, top: layers - 1 } } };
}

// --- Fake light: god-ray shafts, pools of sun on the floor, haze, glow round windows ----

const SHAFT_VERTEX = /* glsl */ `
attribute vec3 aTint;
attribute vec2 aMeta; // seed, kind (0 shaft, 1 haze on the floor, 2 glow round a window)
uniform float uTime;
varying vec2 vUv;
varying vec3 vTint, vWorld, vNormal;
varying vec2 vMeta;
void main() {
  vUv = uv;
  vTint = aTint;
  vMeta = aMeta;
  vec4 world = modelMatrix * vec4(position, 1.0);
  if (aMeta.y > 0.5 && aMeta.y < 1.5) world.xz += 0.6 * vec2(sin(uTime * 0.11 + aMeta.x * 6.0), cos(uTime * 0.07 + aMeta.x * 4.0)); // haze drifts
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const SHAFT_FRAGMENT = /* glsl */ `
uniform sampler2D uStreak;
uniform float uTime, uStrength;
uniform vec2 uFade;
varying vec2 vUv;
varying vec3 vTint, vWorld, vNormal;
varying vec2 vMeta;
void main() {
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  float facing = abs(dot(normalize(vNormal), toCam / dist));
  float seed = vMeta.x, shape;
  if (vMeta.y < 0.5) {
    float across = smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x);
    float along = mix(1.0, 0.4, vUv.y) * smoothstep(1.0, 0.9, vUv.y);
    float streak = texture2D(uStreak, vec2(vUv.x * 0.9 + seed + uTime * 0.003, 0.5)).r;
    float motes = texture2D(uStreak, vec2(vUv.x * 2.3 + seed * 3.0 - uTime * 0.011, 0.5)).r;
    shape = across * along * streak * mix(0.7, 1.0, motes);
  } else if (vMeta.y < 1.5) {
    vec2 d = vec2((vUv.x - 0.5) * 2.0, vUv.y);
    shape = (1.0 - smoothstep(0.2, 1.0, abs(d.x))) * (1.0 - smoothstep(0.0, 1.0, d.y));
  } else {
    vec2 q = abs(vUv - 0.5) * 2.0;
    shape = (1.0 - smoothstep(0.4, 1.0, q.x)) * (1.0 - smoothstep(0.55, 1.0, q.y));
  }
  float breathe = 0.8 + 0.2 * sin(uTime * 0.21 + seed * 6.3) * sin(uTime * 0.13 + seed * 2.1);
  float near = smoothstep(0.4, 3.0, dist);
  float far = 1.0 - smoothstep(uFade.x, uFade.y, dist) * 0.75;
  float a = uStrength * shape * breathe * near * far * mix(0.3, 1.0, facing);
  gl_FragColor = vec4(vTint * a, 1.0);
}`;

function buildLight(group, walls) {
  const r = rng(505);
  const m = merger({ aTint: 3, aMeta: 2 });
  const pools = merger();
  const add = (pts, tint, seed, kind) => m.poly(pts, quadUv, { aTint: tint, aMeta: [seed, kind] });
  const scale = (c, k) => c.map((v) => v * k);
  const soft = paneUvs({ variant: tex.WINDOW_VARIANTS, uSpan: 1, vSpan: 1 }, tex.WINDOW_VARIANTS + 1);
  // A pool of light on the floor, with a faint wider glow round it (light bouncing off the dust).
  const pool = (pts, uvs, tint) => {
    pools.poly(pts.map((p) => p.clone().setY(0.015)), uvs, { color: tint }, UP);
    const c = pts.reduce((a, p) => a.add(p), new V3()).multiplyScalar(0.25);
    pools.poly(pts.map((p) => p.clone().sub(c).multiplyScalar(1.8).add(c).setY(0.012)), soft, { color: scale(tint, 0.3) }, UP);
  };
  // A plane of light from the edge a-b down to its shadow on the floor (u across, v along).
  const shaft = (a, b, tint, seed) => add([a, b, toFloor(b), toFloor(a)], tint, seed, 0);
  // Sunlight through the opening a-b-c-d: the four sides of the beam and two planes through it.
  const sunbeam = ([a, b, c, d], tint, seed) => {
    const mid = (p, q) => p.clone().lerp(q, 0.5);
    for (const [p, q] of [[a, b], [d, c], [a, d], [b, c], [mid(a, d), mid(b, c)], [mid(a, b), mid(d, c)]]) shaft(p, q, tint, seed);
    haze(toFloor(mid(a, c)), 7, 3, scale(WARM, 0.75), seed);
  };
  const haze = (c, w, h, tint, seed) => {
    add([new V3(c.x - w / 2, 0, c.z), new V3(c.x + w / 2, 0, c.z), new V3(c.x + w / 2, h, c.z), new V3(c.x - w / 2, h, c.z)], tint, seed, 1);
    add([new V3(c.x, 0, c.z - w / 2), new V3(c.x, 0, c.z + w / 2), new V3(c.x, h, c.z + w / 2), new V3(c.x, h, c.z - w / 2)], tint, seed + 0.3, 1);
  };

  for (const wall of walls) {
    // Rectangles just in front of the wall (s along it, t up) and on the floor (d out from it).
    const onWall = (s0, s1, t0, t1) => [[s0, t0], [s1, t0], [s1, t1], [s0, t1]].map(([s, t]) => wall.at(s, t, -0.05));
    const onFloor = (s0, s1, d0, d1) => [[s0, d0], [s1, d0], [s1, d1], [s0, d1]].map(([s, d]) => wall.at(s, 0.012, -d));
    for (const o of wall.openings) {
      if (o.door) {
        // Daylight leaking under the shutter.
        add(onWall(o.s0, o.s1, 0, 0.7), scale(WARM, 0.8), r(), 1);
        pools.poly(onFloor(o.s0, o.s1, 0, 1.2), soft, { color: scale(WARM, 0.5) }, UP);
        continue;
      }
      // A soft glow round every window.
      add(onWall(o.s0 - 1.2, o.s1 + 1.2, o.t0 - 1.2, o.t1 + 1.2), scale(wall.sun ? WARM : COOL, wall.sun ? 0.9 : 0.5), r(), 2);
      if (!wall.sun) {
        // Overcast light from the shady side: faint, cool, falling steeply just inside.
        const sky = new V3(0, -1.6, 0).add(wall.n).normalize();
        const [a, b] = [wall.at(o.s0, o.t1), wall.at(o.s1, o.t1)];
        add([a, b, toFloor(b, sky), toFloor(a, sky)], scale(COOL, 0.3), r(), 0);
        pools.poly(onFloor(o.s0 - 0.8, o.s1 + 0.8, 0.3, 4.5), soft, { color: scale(COOL, 0.22) }, UP);
        continue;
      }
      const opening = [wall.at(o.s0, o.t0), wall.at(o.s1, o.t0), wall.at(o.s1, o.t1), wall.at(o.s0, o.t1)];
      const tint = scale(WARM, 0.85 + r() * 0.3);
      sunbeam(opening, tint, r());
      pool(opening.map((p) => toFloor(p)), paneUvs(o, tex.WINDOW_VARIANTS + 1), tint);
    }
  }

  // Sun through the hole in the roof, in strips between the hanging sheets.
  for (const [x0, x1] of HOLE_BEAMS) {
    const z0 = HOLE.z0 + 0.1, z1 = HOLE.z1 - 0.1;
    const opening = [new V3(x0, H, z0), new V3(x1, H, z0), new V3(x1, H, z1), new V3(x0, H, z1)];
    sunbeam(opening, scale(WARM, 0.95), r());
    pool(opening.map((p) => toFloor(p)), soft, scale(WARM, 1.1));
  }

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uStreak: { value: tex.streakTexture() },
      uTime: { value: 0 },
      uStrength: { value: SHAFT_STRENGTH },
      uFade: { value: new THREE.Vector2(FOG[1] + 10, FOG[2]) },
    },
    vertexShader: SHAFT_VERTEX,
    fragmentShader: SHAFT_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const shafts = new THREE.Mesh(m.geometry(), material);
  shafts.renderOrder = 2;
  const poolMat = glowFog(new THREE.MeshBasicMaterial({
    map: tex.poolTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8,
  }), true);
  const poolMesh = new THREE.Mesh(pools.geometry(), poolMat);
  poolMesh.renderOrder = 1;
  group.add(poolMesh, shafts);
  return material;
}

// --- Dust: motes drifting in a box that follows the camera, bright in the sunbeams ------

const DUST_VERTEX = /* glsl */ `
uniform float uTime, uSize, uViewH, uRoof, uLevel;
uniform vec3 uCenter, uBox, uSun;
uniform vec4 uWindows; // spacing, half width, last window x, wall z
uniform vec2 uSill;    // sill and head heights
uniform vec4 uHole;    // x0, x1, z0, z1
attribute float aSeed;
varying float vSun, vAlpha;
void main() {
  vec3 p = position + uTime * vec3(0.05, -0.012, 0.03)
    + 0.5 * vec3(sin(uTime * 0.21 + aSeed * 40.0), sin(uTime * 0.17 + aSeed * 23.0), cos(uTime * 0.19 + aSeed * 31.0));
  p.xz = uCenter.xz + mod(p.xz - uCenter.xz + 0.5 * uBox.xz, uBox.xz) - 0.5 * uBox.xz;
  p.y = mod(p.y, uBox.y);
  // Follow the sunlight back: did it come through a window of the sunny wall, or the hole?
  vec3 w = p - uSun * ((p.z - uWindows.w) / uSun.z);
  float cell = abs(mod(w.x + 0.5 * uWindows.x, uWindows.x) - 0.5 * uWindows.x);
  float win = step(cell, uWindows.y) * step(uSill.x, w.y) * step(w.y, uSill.y) * step(abs(w.x), uWindows.z + uWindows.y);
  vec3 h = p - uSun * ((p.y - uRoof) / uSun.y);
  float hole = step(uHole.x, h.x) * step(h.x, uHole.y) * step(uHole.z, h.z) * step(h.z, uHole.w);
  vSun = max(win, hole);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = -mv.z;
  gl_PointSize = clamp(uSize * uViewH * 0.5 * projectionMatrix[1][1] / d, 1.0, 5.0);
  vAlpha = uLevel * smoothstep(0.3, 1.0, d) * (1.0 - smoothstep(9.0, 15.0, d));
}`;

const DUST_FRAGMENT = /* glsl */ `
uniform vec3 uWarm, uCool;
varying float vSun, vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = dot(c, c) * 4.0;
  if (r > 1.0) discard;
  float a = vAlpha * mix(0.18, 1.0, vSun) * (1.0 - r);
  gl_FragColor = vec4(mix(uCool, uWarm, vSun) * a, 1.0);
}`;

function buildDust(group) {
  const r = rng(506);
  const [bx, by, bz] = DUST.box;
  const pos = [], seeds = [];
  for (let i = 0; i < DUST.count; i++) {
    pos.push((r() - 0.5) * bx, r() * by, (r() - 0.5) * bz);
    seeds.push(r());
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uLevel: { value: 1 },
      uSize: { value: DUST.size },
      uViewH: { value: 800 },
      uRoof: { value: H },
      uCenter: { value: new V3() },
      uBox: { value: new V3(...DUST.box) },
      uSun: { value: SUN },
      uWindows: { value: new THREE.Vector4(BAY, WIN.width / 2, HX - BAY, -HZ) },
      uSill: { value: new THREE.Vector2(WIN.sill, WIN.head) },
      uHole: { value: new THREE.Vector4(HOLE.x0, HOLE.x1, HOLE.z0, HOLE.z1) },
      uWarm: { value: new THREE.Color(...WARM) },
      uCool: { value: new THREE.Color(...COOL) },
    },
    vertexShader: DUST_VERTEX,
    fragmentShader: DUST_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false; // the shader moves every mote round the camera
  points.renderOrder = 3;
  const size = new THREE.Vector2();
  points.onBeforeRender = (renderer) => {
    material.uniforms.uViewH.value = renderer.getDrawingBufferSize(size).y;
  };
  group.add(points);
  return material;
}
