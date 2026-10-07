import THREE from './three.js';
import { config } from './config.js';
import { canvas, rng } from './textures.js';
import { sfx } from './sound.js';

// The ASCII swirl: thousands of amber glyphs spiral round the chair, then fly to
// points sampled from the room and lock in, drawing it in text. They live on their
// own full-resolution canvas (over the chunky half-res one) so the text stays crisp.
// All motion is in the vertex shader: each glyph is one instance of a small quad.

const RAMP = " .`',:;-~+<>!ilI?*xnuvcz#XMW8%B$@"; // the home page's ramp, light to dense
const CHARS = RAMP + '|/\\-';
const COLS = 8;
const CELL_W = 32, CELL_H = 48, ATLAS = 256;

const VERTEX = /* glsl */ `
attribute vec4 aSwirl; // radius, start angle, start height, angular speed
attribute vec4 aMisc;  // rise speed, phase, form delay, spawn time
attribute vec3 aTarget;
attribute vec2 aGlyph; // glyph once locked in, random seed
uniform float uTime, uForm, uEach, uSize, uHeight;
uniform vec3 uCenter;
varying vec2 vUv;
varying float vAlpha, vLock;

float smoother(float x) { x = clamp(x, 0.0, 1.0); return x * x * x * (x * (x * 6.0 - 15.0) + 10.0); }

void main() {
  float rise = mod(aSwirl.z + aMisc.x * uTime, uHeight);
  float a = aSwirl.y + aSwirl.w * uTime;
  float r = aSwirl.x * (0.7 + 0.3 * rise / uHeight) * (1.0 + 0.1 * sin(uTime * 0.7 + aMisc.y));
  vec3 swirl = uCenter + vec3(cos(a) * r, rise - 0.3, sin(a) * r);
  float k = smoother((uForm - aMisc.z) / uEach);
  vec3 p = mix(swirl, aTarget, k);
  p.y += sin(k * 3.14159) * 0.5; // arc up and over on the way to its spot

  float ends = smoothstep(0.0, 0.4, rise) * smoothstep(uHeight, uHeight - 0.4, rise);
  vAlpha = clamp((uTime - aMisc.w) / 0.6, 0.0, 1.0) * mix(ends, 1.0, k);
  vLock = step(0.999, k);
  float g = vLock > 0.5 ? aGlyph.x : 1.0 + floor(mod(aGlyph.y * 97.0 + uTime * 3.0, RAMP_LEN - 1.0));
  float col = mod(g, COLS), row = floor(g / COLS);
  vUv = vec2((col + uv.x) * CELL_U, 1.0 - (row + 1.0 - uv.y) * CELL_V);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  mv.xy += position.xy * uSize; // billboard: always faces the camera
  gl_Position = projectionMatrix * mv;
}`;

const FRAGMENT = /* glsl */ `
uniform sampler2D uAtlas;
uniform vec3 uInk, uLock;
uniform float uOpacity;
varying vec2 vUv;
varying float vAlpha, vLock;
void main() {
  float a = texture2D(uAtlas, vUv).a * vAlpha * uOpacity;
  if (a < 0.03) discard;
  gl_FragColor = vec4(mix(uInk, uLock, vLock), a);
}`;

// Every character drawn white in a grid, in the site's IBM Plex Mono.
function atlasTexture() {
  const c = canvas(ATLAS, ATLAS);
  const g = c.getContext('2d');
  g.font = `500 40px ${config.font}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#fff';
  [...CHARS].forEach((ch, i) => g.fillText(ch, (i % COLS + 0.5) * CELL_W, (Math.floor(i / COLS) + 0.5) * CELL_H));
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}

export function createAscii({ canvas: el, room, center, eye, chair }) {
  const { count: n, size, swirlRadius, swirlHeight, formSpread, formEach } = config.glyphs;
  const renderer = new THREE.WebGLRenderer({ canvas: el, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();

  const targets = sampleRoom(room.group, n, eye, room.outline);
  const r = rng(7);
  const swirl = new Float32Array(n * 4);
  const misc = new Float32Array(n * 4);
  const glyph = new Float32Array(n * 2);
  const locks = []; // when each glyph locks in, for the ticking sound
  for (let i = 0; i < n; i++) {
    const radius = swirlRadius[0] + (swirlRadius[1] - swirlRadius[0]) * Math.sqrt(r());
    swirl.set([radius, r() * Math.PI * 2, r() * swirlHeight, (0.8 + r() * 0.8) * (2.4 / radius)], i * 4);
    // The room builds up from the floor: low targets peel off the vortex first.
    const up = THREE.MathUtils.clamp(targets.pos[i * 3 + 1] / config.room.height, 0, 1);
    const delay = formSpread * (0.7 * up + 0.3 * r());
    misc.set([0.25 + r() * 0.5, r() * Math.PI * 2, delay, r() * 2.5], i * 4);
    glyph.set([targets.glyph[i], r()], i * 2);
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
  geo.setAttribute('aTarget', new THREE.InstancedBufferAttribute(targets.pos, 3));
  geo.setAttribute('aGlyph', new THREE.InstancedBufferAttribute(glyph, 2));
  geo.instanceCount = n;

  const uniforms = {
    uTime: { value: 0 },
    uForm: { value: -1e4 },
    uEach: { value: formEach },
    uSize: { value: size },
    uHeight: { value: swirlHeight },
    uCenter: { value: center.clone() },
    uAtlas: { value: atlasTexture() },
    uInk: { value: new THREE.Color(config.glyphs.ink) },
    uLock: { value: new THREE.Color(config.glyphs.lockInk) },
    uOpacity: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    defines: {
      COLS: COLS.toFixed(1),
      RAMP_LEN: RAMP.length.toFixed(1),
      CELL_U: (CELL_W / ATLAS).toFixed(5),
      CELL_V: (CELL_H / ATLAS).toFixed(5),
    },
    transparent: true,
    depthWrite: false,
  });
  const glyphs = new THREE.Mesh(geo, material);
  glyphs.frustumCulled = false;
  scene.add(glyphs);

  // A depth-only copy of the chair, so glyphs passing behind it are hidden.
  const occluder = chair.clone();
  const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false });
  occluder.traverse((m) => { if (m.isMesh) m.material = depthOnly; });
  scene.add(occluder);

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
    setOpacity(k) { uniforms.uOpacity.value = k; },
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
      if (visible) renderer.render(scene, camera);
    },
    dispose() {
      quad.dispose();
      geo.dispose();
      material.dispose();
      depthOnly.dispose();
      uniforms.uAtlas.value.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}

// --- Where the glyphs land --------------------------------------------------
// Points spread over the room: some along edges (furniture outlines, the room's
// corners), the rest over surfaces that face the chair. Edge glyphs follow the
// edge's direction as seen from the seat (| - / \); surface glyphs come from the
// density ramp, by how brightly a fake window light would hit them.

const LIGHT = new THREE.Vector3(-0.6, 0.8, 0.3).normalize();
const lineGlyph = (angle) => {
  const a = ((angle % Math.PI) + Math.PI) % Math.PI; // 0..PI, direction without sign
  const steps = ['-', '/', '|', '\\', '-'];
  return CHARS.indexOf(steps[Math.round(a / (Math.PI / 4))]);
};

export function sampleRoom(group, n, eye, extraEdges = []) {
  group.updateMatrixWorld(true);
  const tris = [], triCum = [];
  const segs = [], segCum = [];
  let area = 0, length = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), toEye = new THREE.Vector3();

  const addSeg = (p, q) => {
    length += p.distanceTo(q);
    segs.push([p.clone(), q.clone()]);
    segCum.push(length);
  };

  group.traverse((m) => {
    if (!m.isMesh || m.userData.noAscii) return;
    const tone = m.material.userData.tone ?? 0.6;
    const pos = m.geometry.attributes.position;
    const index = m.geometry.index;
    const count = index ? index.count : pos.count;
    for (let i = 0; i < count; i += 3) {
      const [ia, ib, ic] = index ? [index.getX(i), index.getX(i + 1), index.getX(i + 2)] : [i, i + 1, i + 2];
      a.fromBufferAttribute(pos, ia).applyMatrix4(m.matrixWorld);
      b.fromBufferAttribute(pos, ib).applyMatrix4(m.matrixWorld);
      c.fromBufferAttribute(pos, ic).applyMatrix4(m.matrixWorld);
      const normal = ab.subVectors(b, a).cross(ac.subVectors(c, a));
      const twice = normal.length();
      if (twice < 1e-6) continue;
      normal.divideScalar(twice);
      if (normal.dot(toEye.subVectors(eye, a)) <= 0) continue; // faces away from the seat
      area += twice / 2;
      tris.push({ a: a.clone(), b: b.clone(), c: c.clone(), shade: tone * (0.45 + 0.55 * Math.max(0, normal.dot(LIGHT))) });
      triCum.push(area);
    }
    if (m.userData.noEdges) return;
    const edges = new THREE.EdgesGeometry(m.geometry, 25);
    const ep = edges.attributes.position;
    for (let i = 0; i < ep.count; i += 2) {
      addSeg(a.fromBufferAttribute(ep, i).applyMatrix4(m.matrixWorld), b.fromBufferAttribute(ep, i + 1).applyMatrix4(m.matrixWorld));
    }
    edges.dispose();
  });
  for (const [p, q] of extraEdges) addSeg(p, q);

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
  const glyph = new Float32Array(n);
  const onEdges = Math.round(n * config.glyphs.edgeShare);
  const p = new THREE.Vector3(), d = new THREE.Vector3();
  const right = new THREE.Vector3(), up = new THREE.Vector3(), view = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < n; i++) {
    if (i < onEdges) {
      const [s, e] = segs[pick(segCum, length)];
      p.lerpVectors(s, e, r());
      // Screen direction of the edge from the seat, so the right slash is used.
      view.subVectors(p, eye).normalize();
      right.crossVectors(view, UP).normalize();
      up.crossVectors(right, view);
      d.subVectors(e, s);
      glyph[i] = lineGlyph(Math.atan2(d.dot(up), d.dot(right)));
    } else {
      const t = tris[pick(triCum, area)];
      let u = r(), v = r();
      if (u + v > 1) { u = 1 - u; v = 1 - v; }
      p.copy(t.a).addScaledVector(ab.subVectors(t.b, t.a), u).addScaledVector(ac.subVectors(t.c, t.a), v);
      const shade = t.shade + (r() - 0.5) * 0.25; // a little grain, so flat walls aren't one repeated glyph
      glyph[i] = 1 + Math.round(THREE.MathUtils.clamp(shade, 0, 1) * (RAMP.length - 2));
    }
    pos.set([p.x, p.y, p.z], i * 3);
  }
  return { pos, glyph };
}
