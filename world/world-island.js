import THREE from './three.js';
import { config } from './config.js';
import { grassTexture, dirtTexture, skyTexture, rng, flatMaterial } from './textures.js';

// Automation Map's floating grass island, dusk sky and fog. Until the room's walls
// come down the island and sky are hidden: the chair sits in a white void.

export const PLATFORM_RADIUS = 8;
const SIDES = 16; // the grass top and rock underside must match so their edges meet

// Key for a vertex position. Rounded so duplicated seam vertices match, and +0 so
// that -0 and 0 give the same key.
const vertexKey = (x, y, z) => [x, y, z].map((v) => Math.round(v * 100) + 0).join(',');

export function buildWorld(scene) {
  // Light levels are for r128's lighting, which reads brighter than Automation Map's 0.160.
  scene.add(new THREE.AmbientLight(0xb8b4c8, 0.6));
  const sun = new THREE.DirectionalLight(0xffd8a8, 0.75);
  sun.position.set(-30, 40, 20);
  scene.add(sun);

  const platform = new THREE.Group();
  const r = rng(42);

  // Grass top: a low cylinder, flat shaded.
  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(PLATFORM_RADIUS, PLATFORM_RADIUS * 0.96, 0.6, SIDES),
    [
      flatMaterial({ map: dirtTexture() }),
      new THREE.MeshLambertMaterial({ map: grassTexture() }),
      new THREE.MeshLambertMaterial({ map: grassTexture() }),
    ],
  );
  top.position.y = -0.3;
  platform.add(top);

  // Jagged rock underside: a cone with its vertices pushed around.
  const coneGeo = new THREE.ConeGeometry(PLATFORM_RADIUS * 0.96, 9, SIDES, 4);
  coneGeo.rotateX(Math.PI);
  const pos = coneGeo.attributes.position;
  const jitter = new Map(); // same offset for duplicated seam vertices, so no cracks
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (y > 4.4) continue; // keep the rim flush with the grass
    const key = vertexKey(x, y, z);
    if (!jitter.has(key)) jitter.set(key, [0.8 + r() * 0.4, (r() - 0.5) * 1.2]);
    const [s, dy] = jitter.get(key);
    pos.setXYZ(i, x * s, y + dy, z * s);
  }
  coneGeo.computeVertexNormals();
  const underside = new THREE.Mesh(coneGeo, flatMaterial({ map: dirtTexture() }));
  underside.position.y = -0.6 - 4.5;
  platform.add(underside);

  // Grass tufts, kept off the room's floor and the cross of ground its walls fall onto.
  const tuftMat = flatMaterial({ color: 0x5f7d34 });
  const { width, depth, height } = config.room;
  const under = (x, z, w, d) => Math.abs(x) < w / 2 + 0.4 && Math.abs(z) < d / 2 + 0.4;
  for (let i = 0; i < 60; i++) {
    const a = r() * Math.PI * 2;
    const d = 1.5 + r() * (PLATFORM_RADIUS - 2);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (under(x, z, width + 2 * height, depth) || under(x, z, width, depth + 2 * height)) continue;
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35 + r() * 0.3, 3), tuftMat);
    tuft.position.set(x, 0.15, z);
    tuft.rotation.z = (r() - 0.5) * 0.5;
    platform.add(tuft);
  }
  scene.add(platform);

  const sky = skyTexture();
  const fog = new THREE.Fog(0x8a8590, 45, 150);
  const white = new THREE.Color(config.site.paper);

  // Show the island, sky and fog (once the room hides the void), or the black void.
  function reveal(on) {
    platform.visible = on;
    scene.background = on ? sky : white;
    scene.fog = on ? fog : null;
  }
  reveal(false);
  return { reveal, sky };
}
