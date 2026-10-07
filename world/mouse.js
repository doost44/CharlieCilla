import THREE from './three.js';

// Mouse look under pointer lock. (The page's three.js is the classic r128 build,
// which has no PointerLockControls module, so this is a small one.) It keeps
// Automation Map's fixes for sudden view jolts: raw mouse input where supported,
// and movements that are impossibly big, or arrive right after locking, dropped.

const SETTLE_MS = 100; // ignore movement for this long after locking
const MAX_STEP = 250; // pixels in one event; real flicks stay well under this
const PITCH = Math.PI / 2 - 0.01;

export function createLook(camera, element, signal) {
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  let lockedAt = 0;
  const look = {
    isLocked: document.pointerLockElement === element,
    enabled: true, // off while the camera eases into the seat
    pointerSpeed: 1,
    onLock: null,
    onUnlock: null,
    lock() {
      const request = element.requestPointerLock({ unadjustedMovement: true });
      request?.catch?.(() => element.requestPointerLock()?.catch?.(() => {}));
    },
    unlock() {
      if (document.pointerLockElement === element) document.exitPointerLock();
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
    euler.setFromQuaternion(camera.quaternion);
    euler.y -= e.movementX * 0.002 * look.pointerSpeed;
    euler.x = THREE.MathUtils.clamp(euler.x - e.movementY * 0.002 * look.pointerSpeed, -PITCH, PITCH);
    camera.quaternion.setFromEuler(euler);
  }, { signal });

  return look;
}
