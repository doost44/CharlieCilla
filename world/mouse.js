import THREE from './three.js';

// Mouse look under pointer lock. (The page's three.js is the classic r128 build,
// which has no PointerLockControls module, so this is a small one.) It keeps
// Automation Map's fixes for sudden view jolts: raw mouse input where supported,
// and movements that are impossibly big, or arrive right after locking, dropped.
//
// While the room forms, setLimit() keeps the head turned towards it: the view eases
// to a stop about ±40° left/right and ±25° up/down of where it started.

const SETTLE_MS = 100; // ignore movement for this long after locking
const MAX_STEP = 250; // pixels in one event; real flicks stay well under this
const PITCH = Math.PI / 2 - 0.01;

export function createLook(camera, element, signal) {
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const center = new THREE.Euler(0, 0, 0, 'YXZ');
  const raw = { yaw: 0, pitch: 0 }; // mouse travel since the limit was set
  let lockedAt = 0;
  const look = {
    isLocked: document.pointerLockElement === element,
    enabled: true,
    pointerSpeed: 1,
    limit: null, // { yaw, pitch } in radians, or null for free look
    onLock: null,
    onUnlock: null,
    lock() {
      const request = element.requestPointerLock({ unadjustedMovement: true });
      request?.catch?.(() => element.requestPointerLock()?.catch?.(() => {}));
    },
    unlock() {
      if (document.pointerLockElement === element) document.exitPointerLock();
    },
    // Limit the look around the camera's current direction (null frees it, with no jump).
    setLimit(limit) {
      look.limit = limit;
      if (!limit) return;
      center.setFromQuaternion(camera.quaternion);
      raw.yaw = raw.pitch = 0;
    },
  };

  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === element;
    if (locked === look.isLocked) return;
    look.isLocked = locked;
    lockedAt = performance.now();
    (locked ? look.onLock : look.onUnlock)?.();
  }, { signal });

  document.addEventListener('mousemove', (e) => {
    if (!look.isLocked || !look.enabled) return;
    const tooSoon = performance.now() - lockedAt < SETTLE_MS;
    if (tooSoon || Math.abs(e.movementX) > MAX_STEP || Math.abs(e.movementY) > MAX_STEP) return;
    const dx = e.movementX * 0.002 * look.pointerSpeed;
    const dy = e.movementY * 0.002 * look.pointerSpeed;
    if (look.limit) {
      // Soft stop: the view follows the mouse freely near the middle and eases to the edge.
      const { yaw, pitch } = look.limit;
      raw.yaw = THREE.MathUtils.clamp(raw.yaw - dx, -2 * yaw, 2 * yaw);
      raw.pitch = THREE.MathUtils.clamp(raw.pitch - dy, -2 * pitch, 2 * pitch);
      euler.set(center.x + pitch * Math.tanh(raw.pitch / pitch), center.y + yaw * Math.tanh(raw.yaw / yaw), 0);
    } else {
      euler.setFromQuaternion(camera.quaternion);
      euler.y -= dx;
      euler.x = THREE.MathUtils.clamp(euler.x - dy, -PITCH, PITCH);
    }
    camera.quaternion.setFromEuler(euler);
  }, { signal });

  return look;
}
