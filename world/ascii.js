import THREE from './three.js';
import { config } from './config.js';
import { canvas, rng } from './textures.js';
import { sfx } from './sound.js';

// The ASCII swirl: thousands of small blue glyphs spiral round the chair in the white
// void, then fly to spots sampled from the room's surfaces and land flat on them,
// drawing the room in text before it is built out (reveal.js). They live on their own
// full-resolution canvas over the main one so the text stays crisp; depth-only copies
// of the chair and the room are drawn into it first, so glyphs hide behind them.
// All motion is in the vertex shader: each glyph is one instance of a small quad.

const RAMP = " .`',:;-~+<>!ilI?*xnuvcz#XMW8%B$@"; // the home page's ramp, light to dense
const CHARS = RAMP + '|/\\-';
const COLS = 8;
const CELL_W = 64, CELL_H = 96, ATLAS = 512;
const LIFT = 0.004; // metres a landed glyph floats off its surface
const LANDED = 0.995; // flight progress from which a glyph is on its surface (see render)
const SHRINK = 0.12; // metres of build-out front over which a glyph shrinks away
const VIEW_MARGIN = THREE.MathUtils.degToRad(62); // beyond the intro look limits: about half the widest screen's view
const REVEAL_NOISE = 0.12; // metres the build-out front wanders, so its edge is organic

const f = (x) => x.toFixed(5); // a JS number as a GLSL float

// Shared with reveal.js: the atlas layout and the build-out front's wobble.
export const GLYPH_GLSL = /* glsl */ `
const float GLYPH_COLS = ${f(COLS)};
const float GLYPH_RAMP = ${f(RAMP.length)};
const vec2 GLYPH_CELL_UV = vec2(${f(CELL_W / ATLAS)}, ${f(CELL_H / ATLAS)});
vec2 glyphUv(float g, vec2 inCell) {
  float col = mod(g, GLYPH_COLS), row = floor(g / GLYPH_COLS);
  return vec2((col + inCell.x) * GLYPH_CELL_UV.x, 1.0 - (row + 1.0 - inCell.y) * GLYPH_CELL_UV.y);
}
float rvHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float rvNoise(vec3 x) {
  vec3 i = floor(x), u = fract(x);
  u = u * u * (3.0 - 2.0 * u);
  return mix(
    mix(mix(rvHash(i), rvHash(i + vec3(1, 0, 0)), u.x), mix(rvHash(i + vec3(0, 1, 0)), rvHash(i + vec3(1, 1, 0)), u.x), u.y),
    mix(mix(rvHash(i + vec3(0, 0, 1)), rvHash(i + vec3(1, 0, 1)), u.x), mix(rvHash(i + vec3(0, 1, 1)), rvHash(i + vec3(1, 1, 1)), u.x), u.y),
    u.z);
}
// Added to a point's height: the front reaches it a little early (-) or late (+).
float revealNoise(vec3 p) {
  return (rvNoise(p * 2.7) * 0.7 + rvNoise(p * 7.3) * 0.3 - 0.5) * ${f(2 * REVEAL_NOISE)};
}
`;

const VERTEX = /* glsl */ `
attribute vec4 aSwirl; // radius, start angle, start height, angular speed
attribute vec4 aMisc;  // rise speed, phase, form delay, spawn time
attribute vec3 aTarget; // its spot, just off the surface
attribute vec3 aRight, aUp; // the surface's axes at the spot, upright as seen from the seat
attribute vec3 aGlyph; // glyph once locked in, random seed, build-out height of the spot
uniform float uTime, uForm, uEach, uSize, uHeight, uReveal, uPass;
uniform vec3 uCenter;
varying vec2 vUv;
varying float vAlpha, vLock;
${GLYPH_GLSL}

float smoother(float x) { x = clamp(x, 0.0, 1.0); return x * x * x * (x * (x * 6.0 - 15.0) + 10.0); }

void main() {
  float k = smoother((uForm - aMisc.z) / uEach);
  // Drawn in two passes (see render): glyphs in the air, then glyphs on their surfaces.
  if (step(${f(LANDED)}, k) != uPass) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float rise = mod(aSwirl.z + aMisc.x * uTime, uHeight);
  float a = aSwirl.y + aSwirl.w * uTime;
  float r = aSwirl.x * (0.7 + 0.3 * rise / uHeight) * (1.0 + 0.1 * sin(uTime * 0.7 + aMisc.y));
  vec3 swirl = uCenter + vec3(cos(a) * r, rise - 0.3, sin(a) * r);
  vec3 p = mix(swirl, aTarget, k);
  p.y += sin(k * 3.14159) * 0.5; // arc up and over on the way to its spot

  // Facing the camera while it flies, turning to lie flat on its surface as it lands.
  vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float turn = smoothstep(0.6, 1.0, k);
  vec3 right = normalize(mix(camRight, aRight, turn));
  vec3 up = normalize(mix(camUp, aUp, turn));
  // Once the build-out front passes its spot, the glyph shrinks away.
  float size = uSize * (1.0 - clamp((uReveal - aGlyph.z - revealNoise(aTarget)) / ${f(SHRINK)}, 0.0, 1.0));

  float ends = smoothstep(0.0, 0.4, rise) * smoothstep(uHeight, uHeight - 0.4, rise);
  vAlpha = clamp((uTime - aMisc.w) / 0.6, 0.0, 1.0) * mix(ends, 1.0, k);
  vLock = step(0.999, k);
  float g = vLock > 0.5 ? aGlyph.x : 1.0 + floor(mod(aGlyph.y * 97.0 + uTime * 3.0, GLYPH_RAMP - 1.0));
  vUv = glyphUv(g, uv);
  gl_Position = projectionMatrix * viewMatrix * vec4(p + (right * position.x + up * position.y) * size, 1.0);
}`;

const FRAGMENT = /* glsl */ `
uniform sampler2D uAtlas;
uniform vec3 uInk, uLock;
varying vec2 vUv;
varying float vAlpha, vLock;
void main() {
  float a = texture2D(uAtlas, vUv).a * vAlpha;
  if (a < 0.03) discard;
  gl_FragColor = vec4(mix(uInk, uLock, vLock), a);
}`;

// Every character drawn white in a grid, in the site's IBM Plex Mono.
export function glyphAtlas(mipmaps = true) {
  const c = canvas(ATLAS, ATLAS);
  const g = c.getContext('2d');
  g.font = `500 ${CELL_H * 0.72}px ${config.font}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#fff';
  [...CHARS].forEach((ch, i) => g.fillText(ch, (i % COLS + 0.5) * CELL_W, (Math.floor(i / COLS) + 0.5) * CELL_H));
  const t = new THREE.CanvasTexture(c);
  t.generateMipmaps = mipmaps;
  t.minFilter = mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  return t;
}

// Invisible stand-ins for every solid mesh under root: they only fill the depth buffer.
// They share the meshes' geometry and copy their world matrices before each render.
function depthCopies(root) {
  const scene = new THREE.Scene();
  const materials = {};
  const pairs = [];
  root.traverse((m) => {
    if (!m.isMesh || [m.material].flat().some((x) => x.transparent || x.userData.glow)) return;
    const side = [m.material].flat()[0].side;
    // Pushed back a hair, so glyphs lying on a surface win against that same surface.
    materials[side] ??= new THREE.MeshBasicMaterial({ colorWrite: false, side, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 });
    const copy = new THREE.Mesh(m.geometry, materials[side]);
    copy.matrixAutoUpdate = false;
    scene.add(copy);
    pairs.push([m, copy]);
  });
  const shown = (o) => {
    for (; o; o = o.parent) if (!o.visible) return false;
    return true;
  };
  return {
    scene,
    sync() {
      for (const [m, copy] of pairs) {
        copy.visible = shown(m);
        copy.matrix.copy(m.matrixWorld);
      }
    },
    dispose: () => Object.values(materials).forEach((m) => m.dispose()),
  };
}

export function createAscii({ canvas: el, room, chair, eye }) {
  const { count: n, size, swirlRadius, swirlHeight, formSpread, formEach } = config.glyphs;
  const renderer = new THREE.WebGLRenderer({ canvas: el, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;

  // The chair faces the room's focus; the head can only turn so far from it during the intro.
  const forward = room.focus ? room.focus.clone().sub(eye) : new THREE.Vector3(0, 0, 1).transformDirection(chair.matrixWorld);
  const spots = sampleRoom(room, n, eye, forward);
  const r = rng(7);
  const swirl = new Float32Array(n * 4);
  const misc = new Float32Array(n * 4);
  const glyph = new Float32Array(n * 3);
  const locks = []; // when each glyph locks in, for the ticking sound
  for (let i = 0; i < n; i++) {
    const radius = swirlRadius[0] + (swirlRadius[1] - swirlRadius[0]) * Math.sqrt(r());
    swirl.set([radius, r() * Math.PI * 2, r() * swirlHeight, (0.8 + r() * 0.8) * (2.4 / radius)], i * 4);
    // The room builds up from the floor: low spots peel off the vortex first.
    const up = THREE.MathUtils.clamp(spots.pos[i * 3 + 1] / config.room.height, 0, 1);
    const delay = formSpread * (0.7 * up + 0.3 * r());
    misc.set([0.25 + r() * 0.5, r() * Math.PI * 2, delay, r() * 2.5], i * 4);
    glyph.set([spots.glyph[i], r(), spots.height[i]], i * 3);
    locks.push(delay + formEach);
  }
  locks.sort((a, b) => a - b);

  const quad = new THREE.PlaneGeometry(CELL_W / CELL_H, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute('position', quad.attributes.position);
  geo.setAttribute('uv', quad.attributes.uv);
  geo.setAttribute('aSwirl', new THREE.InstancedBufferAttribute(swirl, 4));
  geo.setAttribute('aMisc', new THREE.InstancedBufferAttribute(misc, 4));
  geo.setAttribute('aTarget', new THREE.InstancedBufferAttribute(spots.pos, 3));
  geo.setAttribute('aRight', new THREE.InstancedBufferAttribute(spots.right, 3));
  geo.setAttribute('aUp', new THREE.InstancedBufferAttribute(spots.up, 3));
  geo.setAttribute('aGlyph', new THREE.InstancedBufferAttribute(glyph, 3));
  geo.instanceCount = n;

  const atlas = glyphAtlas();
  atlas.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); // glyphs seen edge-on, on the floor
  const uniforms = {
    uTime: { value: 0 },
    uForm: { value: -1e4 },
    uEach: { value: formEach },
    uSize: { value: size },
    uHeight: { value: swirlHeight },
    uReveal: { value: -1e4 },
    uCenter: { value: new THREE.Vector3(eye.x, 0, eye.z) },
    uAtlas: { value: atlas },
    uInk: { value: new THREE.Color(config.glyphs.ink) },
    uLock: { value: new THREE.Color(config.glyphs.lockInk) },
  };
  // One draw per pass, both from the same instanced geometry.
  const glyphPass = (pass) => {
    const material = new THREE.ShaderMaterial({
      uniforms: { ...uniforms, uPass: { value: pass } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, material);
    mesh.frustumCulled = false;
    const scene = new THREE.Scene();
    scene.add(mesh);
    return scene;
  };
  // Glyphs in the air are only hidden by the chair: the room is not there yet. Once on
  // its surface a glyph is part of the room, so the room's depth hides it as well
  // (glyphs behind furniture, on the far side of the box).
  const chairDepth = depthCopies(chair);
  const roomDepth = depthCopies(room.group);
  const passes = [chairDepth.scene, glyphPass(0), roomDepth.scene, glyphPass(1)];

  let visible = false;
  let forming = false;
  let nextLock = 0;
  let tickTimer = 0;

  function resize() {
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight, false);
  }
  resize();

  function show(on) {
    visible = on;
    el.style.display = on ? '' : 'none';
  }
  show(false);

  return {
    show,
    resize,
    // Jumping straight here (?phase=, skipping) skips the swirl's fade-in, so every glyph is out.
    form() { forming = true; uniforms.uForm.value = 0; uniforms.uTime.value = Math.max(uniforms.uTime.value, 3); },
    lockAll() { forming = false; uniforms.uForm.value = 1e4; uniforms.uTime.value = Math.max(uniforms.uTime.value, 3); },
    setReveal(h) { uniforms.uReveal.value = h; },
    update(dt) {
      if (!visible) return;
      uniforms.uTime.value += dt;
      if (!forming) return;
      const t = (uniforms.uForm.value += dt);
      // A soft tick as glyphs lock in, at most every 50 ms, louder when many land at once.
      let landed = 0;
      while (nextLock < locks.length && locks[nextLock] <= t) { nextLock++; landed++; }
      tickTimer -= dt;
      if (landed && tickTimer <= 0) {
        sfx.tick(Math.min(1, landed / 20));
        tickTimer = 0.05;
      }
    },
    render(camera) {
      if (!visible) return;
      chairDepth.sync();
      roomDepth.sync();
      renderer.clear();
      for (const scene of passes) renderer.render(scene, camera);
    },
    dispose() {
      for (const scene of passes) scene.traverse((m) => m.isMesh && m.material.isShaderMaterial && m.material.dispose());
      chairDepth.dispose();
      roomDepth.dispose();
      quad.dispose();
      geo.dispose();
      atlas.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

// --- Where the glyphs land --------------------------------------------------
// Spots spread over the room: some along edges (furniture outlines, the room's
// corners), the rest over surfaces that face the seat, by area. Each spot keeps its
// surface's normal and gets axes on it that look upright from the seat, so its glyph
// lies flat there. Surface glyphs come from the density ramp by how brightly the lamp
// (or a fake light) hits them; edge glyphs are the line glyph (| - / \) along the edge.

const LIGHT = new THREE.Vector3(-0.6, 0.8, 0.3).normalize();
const UP = new THREE.Vector3(0, 1, 0);
const EDGE_ANGLE = Math.cos(THREE.MathUtils.degToRad(25)); // as THREE.EdgesGeometry's default
const lineGlyph = (angle) => {
  const a = ((angle % Math.PI) + Math.PI) % Math.PI; // 0..PI, direction without sign
  const steps = ['-', '/', '|', '\\', '-'];
  return CHARS.indexOf(steps[Math.round(a / (Math.PI / 4))]);
};

// A mesh's triangles in world space, with their normals and the material's tags.
function triangles(mesh) {
  const pos = mesh.geometry.attributes.position;
  const index = mesh.geometry.index;
  const material = [mesh.material].flat()[0];
  const tone = material.userData.tone ?? 0.6;
  const bias = material.userData.revealBias ?? 0;
  const count = index ? index.count : pos.count;
  const out = [];
  for (let i = 0; i + 2 < count; i += 3) {
    const v = [0, 1, 2].map((j) => new THREE.Vector3().fromBufferAttribute(pos, index ? index.getX(i + j) : i + j).applyMatrix4(mesh.matrixWorld));
    const n = new THREE.Vector3().subVectors(v[1], v[0]).cross(new THREE.Vector3().subVectors(v[2], v[0]));
    const twice = n.length();
    if (twice < 1e-9) continue;
    out.push({ v, n: n.divideScalar(twice), area: twice / 2, tone, bias });
  }
  return out;
}

// Where the surface folds (as THREE.EdgesGeometry finds them) or ends, with the faces beside each edge.
function hardEdges(tris) {
  const key = (p) => `${Math.round(p.x * 1e4)},${Math.round(p.y * 1e4)},${Math.round(p.z * 1e4)}`;
  const open = new Map();
  const out = [];
  for (const t of tris) {
    const keys = t.v.map(key);
    for (let j = 0; j < 3; j++) {
      const k0 = keys[j], k1 = keys[(j + 1) % 3];
      const twin = open.get(k1 + '|' + k0);
      if (twin) {
        open.delete(k1 + '|' + k0);
        if (twin.faces[0].n.dot(t.n) <= EDGE_ANGLE) out.push({ ...twin, faces: [twin.faces[0], t] });
      } else if (!open.has(k0 + '|' + k1)) {
        open.set(k0 + '|' + k1, { a: t.v[j], b: t.v[(j + 1) % 3], faces: [t] });
      }
    }
  }
  return out.concat([...open.values()]);
}

// The faces a loose segment (room.outline) runs along: its ends lie in their plane, its middle on them.
function facesAlong(a, b, tris) {
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  const tri = new THREE.Triangle(), near = new THREE.Vector3();
  return tris.filter((t) => {
    if (Math.abs(t.n.dot(near.subVectors(a, t.v[0]))) > 0.03 || Math.abs(t.n.dot(near.subVectors(b, t.v[0]))) > 0.03) return false;
    tri.set(...t.v).closestPointToPoint(mid, near);
    return near.distanceTo(mid) < 0.05;
  });
}

// Right and up on the surface at p, as upright as possible from the seat.
function surfaceAxes(p, n, eye, right, up) {
  right.subVectors(p, eye).cross(UP);
  right.addScaledVector(n, -right.dot(n));
  if (right.lengthSq() < 1e-6) right.crossVectors(UP, n);
  right.normalize();
  up.crossVectors(n, right);
}

// forward: where the seated head looks. Spots go only where the head can see during the
// intro (config.introLook plus half a view), so none are wasted behind the chair.
export function sampleRoom(room, n, eye, forward) {
  room.group.updateMatrixWorld(true);
  const angles = (v) => [Math.atan2(v.x, v.z), Math.atan2(v.y, Math.hypot(v.x, v.z))];
  const [yaw0, pitch0] = angles(forward);
  const { yaw: yawMax, pitch: pitchMax } = config.introLook;
  const seen = (p) => {
    const [yaw, pitch] = angles(new THREE.Vector3().subVectors(p, eye));
    const off = Math.abs(((yaw - yaw0 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
    return off < yawMax + VIEW_MARGIN && Math.abs(pitch - pitch0) < pitchMax + VIEW_MARGIN;
  };
  const lamp = room.lamp?.light.getWorldPosition(new THREE.Vector3());
  const toEye = new THREE.Vector3();
  const facing = (t, p) => t.n.dot(toEye.subVectors(eye, p).normalize());

  const tris = [], triCum = [];
  const edges = [], edgeCum = [];
  let area = 0, length = 0;
  // An edge's glyphs lie on whichever face beside it faces the seat most.
  const addEdge = (a, b, faces) => {
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    let face = null, best = 0.05;
    for (const t of faces) {
      const d = facing(t, mid);
      if (d > best) [face, best] = [t, d];
    }
    if (!face) return;
    length += a.distanceTo(b);
    edges.push({ a, b, face });
    edgeCum.push(length);
  };

  room.group.traverse((m) => {
    if (!m.isMesh || m.userData.noAscii) return;
    const all = triangles(m);
    for (const t of all) {
      if (facing(t, t.v[0]) <= 0) continue; // faces away from the seat
      area += t.area;
      tris.push(t);
      triCum.push(area);
    }
    if (!m.userData.noEdges) for (const e of hardEdges(all)) addEdge(e.a, e.b, e.faces);
  });
  for (const [a, b] of room.outline ?? []) addEdge(a, b, facesAlong(a, b, tris));

  const r = rng(11);
  const pick = (cum, total) => {
    const x = r() * total;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  const pos = new Float32Array(n * 3);
  const rights = new Float32Array(n * 3);
  const ups = new Float32Array(n * 3);
  const glyph = new Float32Array(n);
  const height = new Float32Array(n);
  const onEdges = edges.length ? Math.round(n * config.glyphs.edgeShare) : 0;
  const p = new THREE.Vector3(), d = new THREE.Vector3(), inward = new THREE.Vector3();
  const right = new THREE.Vector3(), up = new THREE.Vector3(), ab = new THREE.Vector3(), ac = new THREE.Vector3();
  const size = config.glyphs.size;
  for (let i = 0; i < n; i++) {
    let t;
    if (i < onEdges) {
      let e;
      for (let tries = 0; tries < 40; tries++) {
        e = edges[pick(edgeCum, length)];
        p.lerpVectors(e.a, e.b, r());
        if (seen(p)) break;
      }
      t = e.face;
      p.addScaledVector(t.n, -t.n.dot(ab.subVectors(p, t.v[0]))); // onto the face's plane
      // Just inside the face rather than hanging over its edge.
      d.subVectors(e.b, e.a).normalize();
      inward.crossVectors(t.n, d);
      ac.addVectors(t.v[0], t.v[1]).add(t.v[2]).divideScalar(3).sub(p);
      if (inward.dot(ac) < 0) inward.negate();
      p.addScaledVector(inward, size * 0.4);
      surfaceAxes(p, t.n, eye, right, up);
      glyph[i] = lineGlyph(Math.atan2(d.dot(up), d.dot(right)));
    } else {
      for (let tries = 0; tries < 40; tries++) {
        t = tris[pick(triCum, area)];
        let u = r(), v = r();
        if (u + v > 1) { u = 1 - u; v = 1 - v; }
        p.copy(t.v[0]).addScaledVector(ab.subVectors(t.v[1], t.v[0]), u).addScaledVector(ac.subVectors(t.v[2], t.v[0]), v);
        if (seen(p)) break;
      }
      surfaceAxes(p, t.n, eye, right, up);
      const light = lamp ? d.subVectors(lamp, p).normalize() : LIGHT;
      const shade = t.tone * (0.45 + 0.55 * Math.max(0, t.n.dot(light))) + (r() - 0.5) * 0.25; // a little grain
      glyph[i] = 1 + Math.round(THREE.MathUtils.clamp(shade, 0, 1) * (RAMP.length - 2));
    }
    height[i] = p.y + t.bias;
    p.addScaledVector(t.n, LIFT);
    pos.set([p.x, p.y, p.z], i * 3);
    rights.set([right.x, right.y, right.z], i * 3);
    ups.set([up.x, up.y, up.z], i * 3);
  }
  return { pos, right: rights, up: ups, glyph, height };
}
