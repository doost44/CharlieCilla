import THREE from './three.js';
import { config } from './config.js';
import { leatherTexture, plasticTexture, metalTexture, flatMaterial } from './textures.js';

const SEAT_TOP = 0.47; // seat height in the model (see buildChair() in index.html)

// The office chair the visitor just clicked: the home page shares its buildChair()
// (window.asciiChair), so the seat in the world is the very same model. Here it is
// unwrapped from the ASCII frame-fitting, set at real size and re-skinned in flat
// retro materials keyed off the model's three tones (cushion, frame, hardware).
export function buildChair(home) {
  const chair = home.buildChair().children[0];
  chair.position.set(0, 0, 0);
  chair.scale.setScalar(config.chair.scale);
  chair.rotation.y = config.chair.turn;

  const skins = new Map([
    [0xffffff, flatMaterial({ map: leatherTexture() })],
    [0xf2f2f2, flatMaterial({ map: plasticTexture() })],
    [0xa6a6a6, flatMaterial({ map: metalTexture() })],
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

// Where the eyes are when seated, and which way they face (out over the chair's front).
export function seatPose(chair) {
  const pos = chair.localToWorld(new THREE.Vector3(0, SEAT_TOP, -0.03));
  pos.y += config.seatedEye;
  const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, chair.rotation.y + Math.PI, 0, 'YXZ'));
  return { pos, quat };
}

// The camera that matches the home page's view of the ASCII chair right now, moved
// into the world: same angle, same framing, so the cut from text to 3D lines up.
export function homePose(home, chair) {
  home.camera.updateMatrixWorld();
  home.mesh.updateMatrixWorld(true);
  const fromChair = new THREE.Matrix4().copy(home.mesh.children[0].matrixWorld).invert().multiply(home.camera.matrixWorld);
  const m = new THREE.Matrix4().multiplyMatrices(chair.matrixWorld, fromChair);
  const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scale = new THREE.Vector3();
  m.decompose(pos, quat, scale);
  return { pos, quat, fov: home.camera.fov };
}
