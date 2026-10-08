import THREE from './three.js';
import { config } from './config.js';
import { leatherTexture, plasticTexture, metalTexture, flatMaterial } from './textures.js';

const SEAT_TOP = 0.47; // seat height in the model (see buildChair() in index.html)

// The office chair the visitor just clicked: the home page shares its buildChair()
// (window.asciiChair), so the seat in the world is the very same model. Here it is
// unwrapped from the ASCII frame-fitting, set at real size and re-skinned in black,
// keyed off the model's three tones (cushion, frame, hardware). It faces `focus`.
export function buildChair(home, focus) {
  const chair = home.buildChair().children[0];
  chair.position.set(0, 0, 0);
  chair.scale.setScalar(config.chair.scale);
  if (focus) chair.rotation.y = Math.atan2(focus.x, focus.z); // the chair's front is +Z

  const skins = new Map([
    [0xffffff, flatMaterial({ map: leatherTexture(), specular: 0x2a2a2a, shininess: 18 })],
    [0xf2f2f2, flatMaterial({ map: plasticTexture() })],
    [0xa6a6a6, flatMaterial({ map: metalTexture(), specular: 0x333333, shininess: 30 })],
  ]);
  const old = new Set();
  chair.traverse((m) => {
    if (!m.isMesh) return;
    old.add(m.material);
    m.material = skins.get(m.material.color.getHex()) ?? skins.get(0xf2f2f2);
  });
  for (const m of old) m.dispose();
  chair.updateMatrixWorld(true);
  return chair;
}

// Where the eyes are when seated, looking at `focus` (or straight out over the chair's front).
export function seatPose(chair, focus) {
  const pos = chair.localToWorld(new THREE.Vector3(0, SEAT_TOP, -0.03));
  pos.y += config.seatedEye;
  const target = focus ?? chair.localToWorld(new THREE.Vector3(0, pos.y, 5));
  const look = new THREE.Object3D();
  look.position.copy(pos);
  look.lookAt(target); // an Object3D's lookAt points +Z; a camera looks down -Z
  look.rotateY(Math.PI);
  return { pos, quat: look.quaternion.clone() };
}
