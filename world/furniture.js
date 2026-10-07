import THREE from './three.js';
import { flatMaterial } from './textures.js';
import * as tex from './room-textures.js';

// Low-poly fittings and props for the bedroom set (REF-B). Wall fittings are built in
// a wall's own space (x along the wall, y up, +Z into the room, the wall face on z = 0);
// floor props stand on y = 0. Every material carries userData.tone (0..1, how dense
// its ASCII glyphs are) and userData.revealBias (metres added to the bottom-up
// build-out height, so fittings resolve after the walls; see reveal.js).

const BIAS = { fitting: 0.6, prop: 0.9 };
const Y = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);

export function matte(opts, tone = 0.6, revealBias = 0) {
  const m = flatMaterial(opts);
  Object.assign(m.userData, { tone, revealBias });
  return m;
}

export function basic(opts, tone = 0.9, revealBias = 0) {
  const m = new THREE.MeshBasicMaterial(opts);
  Object.assign(m.userData, { tone, revealBias });
  return m;
}

// Light painted onto a surface (additive). The only see-through material in the room:
// never sampled for glyphs, and hidden whenever the lamp is off (see swagLamp).
export function glowMesh(geometry, map, color) {
  const material = new THREE.MeshBasicMaterial({ map, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  material.userData.glow = true;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.noAscii = true;
  mesh.userData.noEdges = true;
  return mesh;
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

// Bake transformed copies of geometries into one mesh's geometry (one draw call).
// shade(localNormal) can darken faces through vertex colours.
function merge(parts) {
  const pos = [], nor = [], uv = [], col = [];
  const n = new THREE.Vector3();
  for (const { geometry, matrix, shade } of parts) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    const normals = g.attributes.normal, uvs = g.attributes.uv;
    for (let i = 0; i < normals.count; i++) {
      const k = shade ? shade(n.fromBufferAttribute(normals, i)) : 1;
      col.push(k, k, k);
      uv.push(uvs ? uvs.getX(i) : 0, uvs ? uvs.getY(i) : 0);
    }
    g.applyMatrix4(matrix);
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

// A link chain along a curve: small stretched rings, every other one turned 90°.
export function chain(curve, material, step = 0.021) {
  const link = new THREE.TorusGeometry(0.0075, 0.0022, 3, 6).scale(1, 1.6, 1);
  const twist = new THREE.Quaternion().setFromAxisAngle(Y, Math.PI / 2);
  const count = Math.max(2, Math.round(curve.getLength() / step));
  const parts = [];
  for (let i = 0; i <= count; i++) {
    const q = new THREE.Quaternion().setFromUnitVectors(Y, curve.getTangentAt(i / count));
    if (i % 2) q.multiply(twist);
    parts.push({ geometry: link, matrix: new THREE.Matrix4().compose(curve.getPointAt(i / count), q, ONE) });
  }
  const mesh = new THREE.Mesh(merge(parts), material);
  link.dispose();
  mesh.userData.noEdges = true; // hundreds of tiny edges would soak up the edge glyphs
  return mesh;
}

export function cord(points, material) {
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 24, 0.004, 4), material);
  mesh.userData.noEdges = true;
  return mesh;
}

// --- Wall fittings ------------------------------------------------------------

// White double-hung window (two sashes, meeting rail, sill and apron) with night
// panes and an empty curtain rod. Centred on x = 0, y = 0 is the middle of the glass.
export function windowFitting(w = 0.72, h = 1.25) {
  const g = new THREE.Group();
  const trim = matte({ map: tex.trimTexture() }, 0.9, BIAS.fitting);
  const glass = basic({ map: tex.paneTexture() }, 0.25, BIAS.fitting);
  const C = 0.075; // casing width
  for (const s of [-1, 1]) box(g, C, h + 2 * C, 0.02, trim, s * (w / 2 + C / 2), 0, 0.01);
  box(g, w + 2 * C, C, 0.02, trim, 0, h / 2 + C / 2, 0.01);
  // Each sash: a frame round one pane; the lower sash sits a little proud of the upper.
  for (const [cy, z] of [[h / 4, 0.022], [-h / 4, 0.034]]) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.08, h / 2 - 0.08), glass);
    pane.position.set(0, cy, z - 0.01);
    g.add(pane);
    for (const s of [-1, 1]) {
      box(g, 0.04, h / 2, 0.022, trim, s * (w / 2 - 0.02), cy, z);
      box(g, w, 0.04, 0.022, trim, 0, cy + s * (h / 4 - 0.02), z);
    }
  }
  box(g, 0.05, 0.012, 0.02, matte({ color: 0xb09a62 }, 0.7, BIAS.fitting), 0, 0.012, 0.052); // sash lock
  box(g, w + 0.24, 0.03, 0.08, trim, 0, -h / 2 - C + 0.015, 0.04); // sill
  box(g, w + 2 * C, 0.07, 0.016, trim, 0, -h / 2 - C - 0.05, 0.008); // apron
  // Thin dark rod on two brackets, with finials.
  const rod = matte({ color: 0x2e2620 }, 0.3, BIAS.fitting);
  const top = h / 2 + C + 0.07, span = w + 2 * C + 0.3;
  cylinder(g, 0.008, 0.008, span, 6, rod, 0, top, 0.07).rotation.z = Math.PI / 2;
  for (const s of [-1, 1]) {
    const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.022, 0), rod);
    finial.position.set(s * (span / 2 + 0.015), top, 0.07);
    finial.scale.set(1.3, 1, 1);
    g.add(finial);
    box(g, 0.012, 0.03, 0.07, rod, s * (w / 2 + C), top - 0.012, 0.035);
  }
  return g;
}

// A doorway with a dark frame onto an unlit hall, and a honey-oak slab standing open
// into the room, hinged on the left jamb. Centred on x = 0, standing on y = 0.
export function doorway(w = 0.78, h = 2.03, open = 0.87) {
  const g = new THREE.Group();
  const dark = basic({ map: tex.doorwayTexture() }, 0.2, BIAS.fitting);
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(w, h), dark);
  hole.position.set(0, h / 2, 0.004);
  g.add(hole);
  const frame = matte({ map: tex.oakTexture(), color: 0x6a4836 }, 0.4, BIAS.fitting);
  const C = 0.07;
  for (const s of [-1, 1]) box(g, C, h + C, 0.02, frame, s * (w / 2 + C / 2), (h + C) / 2, 0.01);
  box(g, w + 2 * C, C, 0.02, frame, 0, h + C / 2, 0.01);

  const hinge = new THREE.Group();
  hinge.position.set(-w / 2 + 0.01, 0, 0.03);
  hinge.rotation.y = -open; // the free edge swings out into the room
  hinge.userData.open = open; // and falls shut when the wall falls (room.js)
  g.add(hinge);
  const slabW = w - 0.02;
  // A little emissive stands in for light bounced back from the room (it faces away from the lamp).
  box(hinge, slabW, h - 0.015, 0.035, matte({ map: tex.oakTexture(), emissive: 0x2a1a0a }, 0.55, BIAS.fitting), slabW / 2, h / 2, 0);
  const brass = matte({ color: 0xb09a62 }, 0.7, BIAS.fitting);
  for (const y of [0.25, 1.0, h - 0.25]) box(hinge, 0.016, 0.09, 0.045, brass, 0, y, 0);
  for (const s of [-1, 1]) {
    const rose = cylinder(hinge, 0.026, 0.026, 0.01, 8, brass, slabW - 0.07, 0.92, s * 0.022);
    rose.rotation.x = Math.PI / 2;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.027, 8, 5), brass);
    knob.position.set(slabW - 0.07, 0.92, s * 0.055);
    hinge.add(knob);
  }
  return g;
}

// Duplex wall outlet; plug = true adds the lamp's plug in the lower socket.
export function outlet(plug = false) {
  const g = new THREE.Group();
  box(g, 0.07, 0.115, 0.006, matte({ map: tex.outletTexture() }, 0.85, BIAS.fitting), 0, 0, 0.003);
  if (plug) box(g, 0.034, 0.03, 0.022, matte({ color: 0xd8d0c0 }, 0.8, BIAS.prop), 0, -0.03, 0.017);
  return g;
}

// --- Floor props ---------------------------------------------------------------

// Low floor register, long side along x.
export function floorVent(w = 0.3, d = 0.1) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.012, d), matte({ map: tex.ventTexture() }, 0.6, BIAS.prop));
  m.position.y = 0.006;
  return m;
}

// Open cardboard box: four walls and a bottom, flaps flopped outward. One mesh;
// the inside is darkened with vertex colours. No print, no brand.
export function cardboardBox(w = 0.44, d = 0.34, h = 0.32) {
  const t = 0.006, flap = d / 2;
  const parts = [];
  const inside = (n) => (n.z < -0.5 ? 0.5 : 1);
  const panel = new THREE.BoxGeometry(1, 1, t);
  const m = () => new THREE.Matrix4();
  // [turn, distance from centre, width, flap angle outward from upright]
  const sides = [[0, d / 2, w, 1.75], [Math.PI / 2, w / 2, d, 1.35], [Math.PI, d / 2, w, 2.0], [-Math.PI / 2, w / 2, d, 1.55]];
  for (const [turn, dist, width, angle] of sides) {
    const side = m().makeRotationY(turn).multiply(m().makeTranslation(0, 0, dist));
    parts.push({ geometry: panel, shade: inside, matrix: side.clone().multiply(m().makeTranslation(0, h / 2, 0)).multiply(m().makeScale(width, h, 1)) });
    const hinge = side.clone().multiply(m().makeTranslation(0, h, 0)).multiply(m().makeRotationX(angle));
    parts.push({ geometry: panel, matrix: hinge.multiply(m().makeTranslation(0, flap / 2, 0)).multiply(m().makeScale(width * 0.97, flap, 1)) });
  }
  const bottom = new THREE.BoxGeometry(w, t, d);
  parts.push({ geometry: bottom, matrix: m().makeTranslation(0, t / 2, 0), shade: (n) => (n.y > 0.5 ? 0.4 : 1) });
  const mesh = new THREE.Mesh(merge(parts), matte({ map: tex.cardboardTexture(), vertexColors: true, emissive: 0x140c04 }, 0.6, BIAS.prop));
  panel.dispose();
  bottom.dispose();
  return mesh;
}

// A crumpled sheet of newsprint: a jittered grid bunched up in the middle, creased
// along a few folds.
export function crumpledPaper(sx = 0.38, sz = 0.3, nx = 8, nz = 6, seed = 7) {
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const folds = Array.from({ length: 4 }, () => [r() * Math.PI, (r() - 0.5) * 0.6, 0.02 + r() * 0.03]);
  const grid = [];
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const u = i / nx - 0.5, v = j / nz - 0.5;
      const bulge = Math.exp(-(u * u + v * v) * 7);
      let y = 0.005 + bulge * 0.1 * (0.7 + 0.3 * r());
      for (const [a, off, depth] of folds) y += depth * Math.max(0, 1 - Math.abs(u * Math.cos(a) + v * Math.sin(a) - off) * 6);
      const gather = 0.55 + 0.45 * (1 - bulge); // the middle bunches up
      grid.push([(u + (r() - 0.5) * 0.1) * sx * gather, y, (v + (r() - 0.5) * 0.1) * sz * gather, i / nx, j / nz]);
    }
  }
  const pos = [], uv = [];
  const at = (i, j) => grid[j * (nx + 1) + i];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const [a, b, c, d] = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
      for (const p of r() > 0.5 ? [a, d, b, b, d, c] : [a, d, c, a, c, b]) {
        pos.push(p[0], p[1], p[2]);
        uv.push(p[3], p[4]);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, matte({ map: tex.newsprintTexture(), side: THREE.DoubleSide, emissive: 0x2a2826 }, 0.95, BIAS.prop));
  mesh.userData.noEdges = true; // every crease is an edge; let the surface glyphs draw it
  return mesh;
}

// The faint carpet stain, lying flat just above the carpet.
export function stain(w = 0.6, d = 0.46) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2),
    matte({ map: tex.stainTexture(), alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }, 0.45, 0),
  );
  m.userData.noEdges = true;
  return m;
}

// --- The swag lamp ---------------------------------------------------------------

const LAMP = { color: 0xffd08e, power: 1.6, reach: 8.5, decay: 1.6, halo: 0.3, gravity: 9.8, damping: 0.35 };

// Ruffled milk-glass tulip: a lathe whose rim waves in and out.
function shadeGeometry() {
  const profile = [[0.03, 0], [0.045, -0.016], [0.07, -0.045], [0.083, -0.085], [0.092, -0.115], [0.112, -0.14], [0.132, -0.155]];
  const geo = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 16);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = THREE.MathUtils.smoothstep(-y, 0.1, 0.155) * Math.cos(Math.atan2(x, z) * 8);
    p.setXYZ(i, x * (1 + 0.1 * k), y + 0.01 * k, z * (1 + 0.1 * k));
  }
  return geo;
}

// A vintage swag lamp hanging from a ceiling hook: chain, brass fitting, ruffled
// milk-glass shade, a halo, and a warm point light. `pendulum` hangs from its origin
// (put it at the hook) and swings like one when whatever holds it moves.
// The light itself is returned separately: keep it outside anything that gets hidden,
// since a light dropping out of the scene changes the light count and recompiles
// every shader in r128.
export function swagLamp(drop = 0.72) {
  const pendulum = new THREE.Group();
  const brass = matte({ color: 0xa88a52 }, 0.7, BIAS.prop);
  pendulum.add(chain(new THREE.LineCurve3(new THREE.Vector3(), new THREE.Vector3(0, -drop, 0)), matte({ color: 0x8c7a56 }, 0.5, BIAS.prop)));
  cylinder(pendulum, 0.02, 0.032, 0.035, 8, brass, 0, -drop - 0.012);
  const shadeMat = basic({ map: tex.milkGlassTexture(), side: THREE.DoubleSide }, 0.95, BIAS.prop);
  const shade = new THREE.Mesh(shadeGeometry(), shadeMat);
  shade.position.y = -drop - 0.025;
  pendulum.add(shade);
  const bulbMat = basic({ color: 0xfff0d0 }, 1, BIAS.prop);
  const bulbY = -drop - 0.12;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 4), bulbMat);
  bulb.position.y = bulbY;
  pendulum.add(bulb);
  cylinder(pendulum, 0.022, 0.012, 0.04, 8, brass, 0, -drop - 0.19); // socket cup below the rim
  const finial = new THREE.Mesh(new THREE.OctahedronGeometry(0.012, 0), brass);
  finial.position.y = -drop - 0.22;
  pendulum.add(finial);

  // depthTest off: a halo is bloom, and it would be cut by the corner walls behind it.
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex.glowTexture(), color: LAMP.color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest: false,
  }));
  halo.material.userData.glow = true;
  halo.userData.noAscii = true;
  halo.position.y = bulbY;
  halo.scale.setScalar(0.6);
  halo.renderOrder = 2;
  pendulum.add(halo);

  const light = new THREE.PointLight(LAMP.color, LAMP.power, LAMP.reach, LAMP.decay);
  const glows = [[halo, LAMP.halo, false]];
  let level = 1, presence = 1, onSpot = 1;
  function apply() {
    const k = level * presence;
    light.intensity = LAMP.power * k;
    for (const [o, strength, fixed] of glows) {
      o.material.opacity = strength * k * (fixed ? onSpot : 1);
      o.visible = o.material.opacity > 0.002;
    }
    shadeMat.color.setScalar(0.5 + 0.5 * k); // unlit milk glass is grey
    bulbMat.color.setScalar(0.45 + 0.55 * k);
  }

  // The swing: the shade is a bob on a rigid chain from the hook, integrated in small
  // steps, with the hook's own motion interpolated over the frame.
  const length = drop + 0.1;
  const pivot = new THREE.Vector3(), last = new THREE.Vector3(), hook = new THREE.Vector3();
  const bob = new THREE.Vector3(), vel = new THREE.Vector3(), prev = new THREE.Vector3();
  const dir = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0), q = new THREE.Quaternion();
  let ready = false, time = 0;

  function update(dt) {
    const holder = pendulum.parent;
    if (!holder) return;
    holder.updateWorldMatrix(true, false);
    pivot.copy(pendulum.position).applyMatrix4(holder.matrixWorld);
    if (!ready) {
      last.copy(pivot);
      bob.copy(pivot).y -= length;
      ready = true;
    }
    const steps = Math.max(1, Math.ceil(dt * 240)), h = dt / steps;
    for (let i = 1; h > 0 && i <= steps; i++) {
      hook.lerpVectors(last, pivot, i / steps);
      time += h;
      prev.copy(bob);
      vel.y -= LAMP.gravity * h;
      vel.x += Math.sin(time * 0.9) * 0.03 * h; // a faint draft
      vel.z += Math.cos(time * 0.63) * 0.03 * h;
      vel.multiplyScalar(1 - LAMP.damping * h);
      bob.addScaledVector(vel, h).sub(hook).setLength(length).add(hook);
      vel.subVectors(bob, prev).divideScalar(h);
    }
    last.copy(pivot);
    dir.subVectors(bob, pivot).normalize().applyQuaternion(holder.getWorldQuaternion(q).invert());
    pendulum.quaternion.setFromUnitVectors(down, dir);
    pendulum.updateWorldMatrix(false, false);
    light.position.set(0, bulbY, 0).applyMatrix4(pendulum.matrixWorld);
    light.parent?.worldToLocal(light.position);
  }

  return {
    pendulum,
    light,
    update,
    // Light painted on nearby surfaces dims with the lamp. fixed: painted for the lamp
    // hanging at rest, so it also fades once the lamp is carried off its spot.
    addGlow(mesh, strength, fixed = false) {
      glows.push([mesh, strength, fixed]);
      apply();
    },
    setLevel(k) {
      level = THREE.MathUtils.clamp(k, 0, 1);
      apply();
    },
    // 0..1 as the lamp is carried away (the collapse); spot: the same for fixed glows.
    setPresence(k, spot = k) {
      presence = THREE.MathUtils.clamp(k, 0, 1);
      onSpot = THREE.MathUtils.clamp(spot, 0, 1);
      apply();
    },
    // How far the chain is from hanging straight down (radians), for testing.
    get swing() { return Math.acos(THREE.MathUtils.clamp((pivot.y - bob.y) / length, -1, 1)); },
  };
}
