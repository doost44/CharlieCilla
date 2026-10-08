import THREE from './three.js';
import { config } from './config.js';
import { canvas, rng, flatMaterial } from './textures.js';
import { createCard } from './cards.js';

// One station per project on the home page's list, newest first: a hanging
// industrial lamp (long cord from the roof, wide shallow shade, warm glow, a pool of
// light on the floor) with the project's title card floating under it, turned to
// the visitor. They wind outward from the chair in a loose spiral through the hall.
// Only LIGHTS real point lights exist; each frame they go to the lit stations
// nearest the camera (fading across), everything else is glow sprites and decals.

const CARD_TOP = 1.76; // top edge of the card; its middle is near eye height
const LAMP_Y = 3.4; // bottom rim of the shade
const ROOF_Y = config.hall.height;
const CLEAR = 9.5; // metres kept free round the chair (the room and its fallen walls)
const EDGE = 3; // from the hall's walls
const SPACING = 10; // between stations
const AVOID_GAP = 1.8; // from columns and rubble
const TURNS = 1.5; // about how far the path winds round the room
const LIGHTS = 4;
const LIGHT = { color: 0xffb066, intensity: 1.4, distance: 11, decay: 1.3 };
const WARM = new THREE.Color(0xffa04a);
const FLICKER = 0.75; // seconds a lamp stutters before it stays on
const BOB = 0.025; // metres; it fades out as you come close, so links hold still under the crosshair
const STILL = 3; // metres from the card at which it stops bobbing
const PURLIN_STEP = 2.25; // the warehouse roof's purlins run along x every 2.25 m from its back wall
const PURLIN_FROM = -config.hall.depth / 2;
const DEFAULT_BOUNDS = { minX: -34.4, maxX: 34.4, minZ: -21.9, maxZ: 21.9 }; // the warehouse's, if none are passed

// Soft radial spot, for glows and the light pool.
function radial(size, stops) {
  const c = canvas(size, size);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, color] of stops) grad.addColorStop(at, color);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

// Top to bottom fade, for the faint beam under each shade.
function fade() {
  const c = canvas(4, 64);
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 64);
  return new THREE.CanvasTexture(c);
}

// Geometry and textures every lamp shares.
function sharedParts() {
  // A wide, shallow enamel cone with a short neck, bottom to top (outside faces out).
  const profile = [[0.36, 0], [0.335, 0.035], [0.2, 0.13], [0.075, 0.2], [0.04, 0.22], [0.04, 0.32]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  return {
    shade: new THREE.LatheGeometry(profile, 18),
    bulb: new THREE.SphereGeometry(0.055, 10, 6),
    cord: new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.32, 0), new THREE.Vector3(0, ROOF_Y - LAMP_Y, 0)]),
    beam: new THREE.CylinderGeometry(0.33, 1.15, 1.5, 20, 1, true).translate(0, -0.75, 0),
    pool: new THREE.PlaneGeometry(6, 6).rotateX(-Math.PI / 2),
    shadeMat: flatMaterial({ color: 0x2c302c }),
    cordMat: new THREE.LineBasicMaterial({ color: 0x141414 }),
    glow: radial(64, [[0, 'rgba(255,236,200,1)'], [0.2, 'rgba(255,190,110,0.55)'], [0.55, 'rgba(255,140,60,0.12)'], [1, 'rgba(255,120,40,0)']]),
    poolTex: radial(128, [[0, 'rgba(255,200,140,0.75)'], [0.35, 'rgba(255,160,80,0.32)'], [0.7, 'rgba(255,130,60,0.08)'], [1, 'rgba(255,120,50,0)']]),
    fade: fade(),
  };
}

const additive = (opts) => ({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, ...opts });

function buildLamp(parts) {
  const lamp = new THREE.Group();
  const inner = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide });
  const bulb = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const glow = new THREE.SpriteMaterial(additive({ map: parts.glow, color: WARM, opacity: 0 }));
  const halo = new THREE.SpriteMaterial(additive({ map: parts.glow, color: WARM, opacity: 0 }));
  const beam = new THREE.MeshBasicMaterial(additive({ map: parts.fade, color: WARM, opacity: 0, side: THREE.DoubleSide }));
  const pool = new THREE.MeshBasicMaterial(additive({ map: parts.poolTex, color: WARM, opacity: 0, polygonOffset: true, polygonOffsetFactor: -2 }));

  const glowSprite = new THREE.Sprite(glow);
  glowSprite.scale.setScalar(1.1);
  glowSprite.position.y = 0.02;
  const haloSprite = new THREE.Sprite(halo);
  haloSprite.scale.setScalar(4.5);
  const bulbMesh = new THREE.Mesh(parts.bulb, bulb);
  bulbMesh.position.y = 0.06;
  const poolMesh = new THREE.Mesh(parts.pool, pool);
  poolMesh.position.y = 0.015 - LAMP_Y;
  poolMesh.renderOrder = -1;
  lamp.add(
    new THREE.Mesh(parts.shade, parts.shadeMat),
    new THREE.Mesh(parts.shade, inner),
    new THREE.LineSegments(parts.cord, parts.cordMat),
    bulbMesh, glowSprite, haloSprite,
    new THREE.Mesh(parts.beam, beam),
    poolMesh,
  );
  const materials = [inner, bulb, glow, halo, beam, pool];
  return {
    lamp,
    materials,
    // k: 0 off .. 1 fully on
    setLevel(k) {
      inner.color.copy(WARM).multiplyScalar(0.25 + 0.75 * k).multiplyScalar(k > 0 ? 1 : 0);
      bulb.color.setRGB(0.12 + 0.88 * k, 0.1 + 0.8 * k, 0.08 + 0.6 * k);
      glow.opacity = k;
      halo.opacity = 0.16 * k;
      beam.opacity = 0.07 * k;
      pool.opacity = 0.55 * k;
    },
  };
}

// Push p (Vector2 of x, z) out of a circle.
function pushOut(p, x, z, min, r) {
  const dx = p.x - x, dz = p.y - z;
  const d = Math.hypot(dx, dz);
  if (d >= min) return;
  if (d < 1e-3) return p.set(x + min * Math.cos(r * 6.28), z + min * Math.sin(r * 6.28));
  p.set(x + (dx / d) * min, z + (dz / d) * min);
}

// A loose spiral out from the chair, starting towards `start` and stretched to the
// hall's shape so the last stations reach its far ends, then nudged clear of the
// room, the warehouse's columns and rubble, the walls and each other.
function layout(n, b, avoid, start) {
  const r = rng(17);
  const a0 = start ? Math.atan2(start.z, start.x) : -Math.PI / 2;
  // Wind about TURNS times, ending on the long axis so the oldest work is at one end
  // of the hall and the path has passed the other end a little before.
  const span = Math.round((a0 + TURNS * Math.PI * 2) / Math.PI) * Math.PI - a0;
  const near = CLEAR + 1;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0;
    const a = a0 + t * span + (r() - 0.5) * 0.25;
    const grow = Math.pow(t, 0.7);
    const rx = near + (Math.max(-b.minX, b.maxX) - EDGE - near) * grow;
    const rz = near + (Math.max(-b.minZ, b.maxZ) - EDGE - near) * grow;
    const jitter = 1 + (r() - 0.5) * 0.12;
    pts.push(new THREE.Vector2(Math.cos(a) * rx * jitter, Math.sin(a) * rz * jitter));
  }
  for (let pass = 0; pass < 60; pass++) {
    for (const p of pts) {
      for (const c of avoid) pushOut(p, c.x, c.z, c.r + AVOID_GAP, r());
      pushOut(p, 0, 0, CLEAR, r());
      p.x = THREE.MathUtils.clamp(p.x, b.minX + EDGE, b.maxX - EDGE);
      p.y = THREE.MathUtils.clamp(p.y, b.minZ + EDGE, b.maxZ - EDGE);
    }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = pts[i], c = pts[j];
        const d = a.distanceTo(c);
        if (d >= SPACING || d < 1e-3) continue;
        const push = (SPACING - d) / 2 / d;
        const dx = (c.x - a.x) * push, dz = (c.y - a.y) * push;
        a.x -= dx; a.y -= dz;
        c.x += dx; c.y += dz;
      }
    }
  }
  // Hang each lamp from a purlin: move it onto the nearest purlin line.
  for (const p of pts) p.y = PURLIN_FROM + Math.round((p.y - PURLIN_FROM) / PURLIN_STEP) * PURLIN_STEP;
  return pts;
}

// A lamp warming up: a few uneven blinks, then on.
function stutter(e, seed) {
  if (e >= FLICKER) return 1;
  const k = e / FLICKER;
  const blink = Math.sin(e * 41 + seed) * Math.sin(e * 17 + seed * 3);
  return blink > 0.15 - k * 0.6 ? 0.55 + 0.45 * k : 0.05;
}

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// start (optional): a point the chair faces (e.g. room.focus); the newest station is that way.
export function buildStations(scene, { bounds, avoid = [], start } = {}) {
  const projects = window.AdminData.getHomeProjects().filter((p) => p.visible !== false);
  const b = bounds ?? DEFAULT_BOUNDS;
  const parts = sharedParts();
  const group = new THREE.Group();
  group.visible = false; // until startArrival: the hall is hidden during the intro
  scene.add(group);
  const r = rng(5);

  const spots = layout(projects.length, b, avoid, start);
  const stations = projects.map((project, index) => {
    const { x, y: z } = spots[index];
    const { lamp, materials, setLevel } = buildLamp(parts);
    lamp.position.set(x, LAMP_Y, z);
    const card = createCard(project, index);
    const holder = new THREE.Group(); // turns to the visitor, bobs
    holder.position.set(x, CARD_TOP, z);
    holder.rotation.y = Math.atan2(-x, -z); // facing the chair to begin with
    holder.add(card.group);
    group.add(lamp, holder);
    card.setLevel(0);
    holder.visible = false;
    setLevel(0);
    return {
      project, index, card,
      lampPosition: new THREE.Vector3(x, LAMP_Y + 0.06, z), // the bulb
      lamp, holder, materials, setLevel,
      on: false, onAt: 0, level: 0, seed: r() * 100, bob: BOB,
      yaw: holder.rotation.y,
    };
  });

  const lights = Array.from({ length: LIGHTS }, () => {
    const light = new THREE.PointLight(LIGHT.color, 0, LIGHT.distance, LIGHT.decay);
    scene.add(light); // always in the scene, so shaders never recompile; off is intensity 0
    return { light, station: null, level: 0 };
  });

  let time = 0;
  let arrival = null; // { onLampOn, gap } while the lamps come on one by one

  function setStation(s, k) {
    s.level = k;
    s.setLevel(k);
    s.holder.visible = s.on;
    s.card.setLevel(0.12 + 0.88 * k);
  }

  // The LIGHTS nearest lit stations get a real light; a light leaving a station fades
  // out before it moves, so nothing pops. Stations that have one count as a bit nearer.
  function assignLights(camera, dt) {
    const ranked = stations
      .filter((s) => s.on)
      .map((s) => ({ s, d: s.lampPosition.distanceTo(camera.position) - (lights.some((l) => l.station === s) ? 1.5 : 0) }))
      .sort((a, c) => a.d - c.d)
      .slice(0, LIGHTS)
      .map((e) => e.s);
    for (const l of lights) {
      const keep = l.station && ranked.includes(l.station);
      l.level = THREE.MathUtils.clamp(l.level + (keep ? 1 : -1) * dt * 2.5, 0, 1);
      if (!keep && l.level === 0) l.station = null;
    }
    for (const s of ranked) {
      if (lights.some((l) => l.station === s)) continue;
      const free = lights.find((l) => !l.station);
      if (!free) break;
      free.station = s;
      free.light.position.copy(s.lampPosition);
    }
    for (const l of lights) l.light.intensity = l.station ? LIGHT.intensity * l.level * l.station.level : 0;
  }

  return {
    group,
    stations,
    colliders: stations.map((s) => ({ x: s.holder.position.x, z: s.holder.position.z, r: 0.5 })), // the floating card

    // The projects phase: the lamps flicker on one by one along the path.
    startArrival(onLampOn) {
      group.visible = true;
      const gap = Math.min(0.4, (config.durations.projects - 1) / Math.max(1, stations.length));
      arrival = { onLampOn, t: 0, gap };
      for (const s of stations) {
        s.on = false;
        setStation(s, 0);
      }
    },
    finishArrival() {
      group.visible = true;
      arrival = null;
      for (const s of stations) {
        s.on = true;
        s.onAt = -Infinity;
        setStation(s, 1);
      }
    },

    update(dt, camera) {
      time += dt;
      if (arrival) {
        arrival.t += dt;
        for (const s of stations) {
          if (s.on || arrival.t < 0.3 + s.index * arrival.gap) continue;
          s.on = true;
          s.onAt = time;
          arrival.onLampOn?.(s.index);
        }
        if (stations.every((s) => s.on && time - s.onAt > FLICKER)) arrival = null;
      }
      const cam = camera.position;
      for (const s of stations) {
        if (!group.visible) break;
        setStation(s, s.on ? stutter(time - s.onAt, s.seed) : 0);
        if (!s.on) continue;
        // Face the visitor (turning only round the vertical), with a slow bob.
        const h = s.holder;
        const dx = cam.x - h.position.x, dz = cam.z - h.position.z;
        s.yaw += wrapAngle(Math.atan2(dx, dz) - s.yaw) * (1 - Math.exp(-dt * 5));
        h.rotation.y = s.yaw;
        const bob = BOB * THREE.MathUtils.smoothstep(Math.hypot(dx, dz), STILL, STILL + 3);
        s.bob += (bob - s.bob) * Math.min(1, dt * 2);
        h.position.y = CARD_TOP + Math.sin(time * 0.8 + s.seed) * s.bob;
        s.card.update(dt);
      }
      assignLights(camera, dt);
    },

    dispose() {
      for (const s of stations) s.card.dispose();
      for (const l of lights) scene.remove(l.light);
      scene.remove(group);
      for (const s of stations) for (const m of s.materials) m.dispose();
      for (const k of ['shade', 'bulb', 'cord', 'beam', 'pool', 'shadeMat', 'cordMat', 'glow', 'poolTex', 'fade']) parts[k].dispose();
    },
  };
}
