import THREE from './three.js';
import { settings } from './options.js';

// The visitor stays seated in v1 (no walking). This eases the camera from the home
// page's view of the chair onto the seat, facing out, like pressing E at the chair
// in Automation Map: a smoothstep over the move, with a little arc so the camera
// passes over the backrest instead of through it.

export function createPlayer(camera, look) {
  const from = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 70 };
  const to = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };

  return {
    // Start of the sit: put the camera on the home page's view.
    begin(start, seat) {
      from.pos.copy(start.pos);
      from.quat.copy(start.quat);
      from.fov = start.fov;
      to.pos.copy(seat.pos);
      to.quat.copy(seat.quat);
      look.enabled = false;
      this.ease(0);
    },
    // k: 0..1 through the sit.
    ease(k) {
      const s = k * k * (3 - 2 * k); // smoothstep
      camera.position.lerpVectors(from.pos, to.pos, s);
      camera.position.y += Math.sin(s * Math.PI) * 0.6;
      camera.quaternion.slerpQuaternions(from.quat, to.quat, s);
      camera.fov = THREE.MathUtils.lerp(from.fov, settings.fov, s);
      camera.updateProjectionMatrix();
    },
    // Seated: the seat is fixed, the head turns with the mouse.
    seated() {
      camera.position.copy(to.pos);
      if (!look.enabled) camera.quaternion.copy(to.quat);
      camera.fov = settings.fov;
      camera.updateProjectionMatrix();
      look.enabled = true;
    },
  };
}
