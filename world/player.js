import { config } from './config.js';
import { settings } from './options.js';

// The visitor is in the chair from the very first frame: no camera flight. While the
// room forms the head can only turn so far (see mouse.js); once it is solid the look
// is free. (Standing up and walking come later in the intro.)

export function createPlayer(camera, look) {
  return {
    // Put the camera on the seat. limited: keep the head turned towards the room.
    seat(pose, limited) {
      camera.position.copy(pose.pos);
      camera.quaternion.copy(pose.quat);
      camera.fov = settings.fov;
      camera.updateProjectionMatrix();
      look.setLimit(limited ? config.introLook : null);
    },
    freeLook() {
      look.setLimit(null);
    },
  };
}
