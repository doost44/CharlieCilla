import THREE from './three.js';
import { config } from './config.js';
import { settings } from './options.js';
import { sfx } from './sound.js';

// The visitor is in the chair from the very first frame: no camera flight. While the
// room forms the head can only turn so far (see mouse.js). After the collapse, E or
// W/A/S/D stands up (a smooth ease up and a step forward, as in Automation Map) and
// the hall can be walked: W/A/S/D, Shift to run, Space to hop. E by the chair, facing
// it, sits back down. Collision is kept cheap: the hall's bounds plus circles.

const STAND_TIME = 0.8; // seconds to rise out of the chair and step forward
const SIT_TIME = 0.9; // seconds to step back in front of the chair and sit
const STAND_OUT = 0.95; // where you end up: this far in front of the chair's centre
const SIT_REACH = 2; // E sits you down within this distance of the chair...
const SIT_FACING = Math.cos(THREE.MathUtils.degToRad(55)); // ...looking at it within this angle
const CHAIR_RADIUS = 0.45;
const ACCEL = 12; // how quickly you reach walking speed, or stop (per second)
const STRIDE = 1.9; // metres per footstep at walking speed (a little longer when running)
const BOB = { height: 0.035, sway: 0.018 }; // head bob in metres, at walking speed
const JUMP = 4; // take-off speed in m/s: a hop of about half a metre
const GRAVITY = 16;
const DIP = { depth: 0.07, time: 0.25 }; // the knees giving a little on landing
const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];

const smooth = (k) => k * k * (3 - 2 * k);
const clamp01 = (k) => Math.min(1, Math.max(0, k));
const lerp = THREE.MathUtils.lerp;

export function createPlayer({ camera, look, signal, chair, seat: seatPose }) {
  const keys = new Set();
  const body = new THREE.Vector3(); // feet on the floor (x, z); y is the height of a hop
  const vel = new THREE.Vector3();
  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), wish = new THREE.Vector3();
  const chairAt = new THREE.Vector3(), chairFront = new THREE.Vector3();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  let pose = seatPose ?? null; // the seat to come back to
  let mode = 'seated'; // seated | standing (easing up) | walking | sitting (easing down)
  let ease = null;
  let canStand = false;
  let bounds = hallBounds();
  let colliders = [chairCollider()];
  let stride = 0; // footsteps walked; the fraction is where we are in the current step
  let bobAmount = 0; // head bob fades in and out as you start and stop
  let wasWalking = false;
  let vy = 0; // vertical speed of a hop
  let dip = 1; // landing dip progress, 0..1

  // --- Keys (only while the mouse is captured, so the visitor never walks on alone) ---
  const listen = (target, type, fn) => target.addEventListener(type, fn, { signal });
  listen(window, 'keydown', (e) => {
    if (!look.isLocked) return;
    keys.add(e.code);
    if (e.repeat) return;
    if (e.code === 'KeyE') {
      if (mode === 'seated' && canStand) standUp();
      else if (nearChair()) sitDown();
    }
    if (e.code === 'Space' && mode === 'walking' && body.y === 0) {
      vy = JUMP;
      sfx.jump();
    }
  });
  listen(window, 'keyup', (e) => keys.delete(e.code));
  listen(window, 'blur', () => keys.clear());
  listen(document, 'pointerlockchange', () => document.pointerLockElement || keys.clear());

  function hallBounds() {
    const x = config.hall.width / 2 - 1, z = config.hall.depth / 2 - 1;
    return { minX: -x, maxX: x, minZ: -z, maxZ: z };
  }

  // Where the chair is and which way its seat faces, flat on the floor.
  function chairSpot() {
    if (!chair) return chairAt.set(0, 0, 0);
    chair.getWorldPosition(chairAt);
    chair.getWorldDirection(chairFront); // an Object3D's front is +Z
    chairFront.y = 0;
    chairFront.normalize();
    return chairAt;
  }

  function chairCollider() {
    chairSpot();
    return { x: chairAt.x, z: chairAt.z, r: CHAIR_RADIUS };
  }

  // Within reach of the chair and looking roughly at it.
  function nearChair() {
    if (mode !== 'walking' || !pose) return false;
    chairSpot();
    const dx = chairAt.x - body.x, dz = chairAt.z - body.z;
    const d = Math.hypot(dx, dz);
    if (d > SIT_REACH) return false;
    camera.getWorldDirection(fwd);
    return (fwd.x * dx + fwd.z * dz) / ((Math.hypot(fwd.x, fwd.z) || 1) * (d || 1)) > SIT_FACING;
  }

  // --- Standing up and sitting down -------------------------------------------------
  function standUp() {
    chairSpot();
    body.copy(chairAt).addScaledVector(chairFront, STAND_OUT);
    body.y = 0;
    collide();
    ease = { t: 0, time: STAND_TIME, from: camera.position.clone(), to: new THREE.Vector3(body.x, config.walk.eye, body.z) };
    mode = 'standing';
    vel.set(0, 0, 0);
    look.setLimit(null);
    sfx.stand();
  }

  // Back to the front of the chair, then down onto the seat, turning to face where it faces.
  function sitDown() {
    chairSpot();
    euler.setFromQuaternion(camera.quaternion);
    const from = { yaw: euler.y, pitch: euler.x };
    euler.setFromQuaternion(pose.quat);
    let turn = euler.y - from.yaw;
    turn -= Math.PI * 2 * Math.round(turn / (Math.PI * 2)); // the short way round
    ease = {
      t: 0, time: SIT_TIME, from: camera.position.clone(), to: pose.pos.clone(),
      via: chairAt.clone().addScaledVector(chairFront, STAND_OUT),
      yaw: from.yaw, turn, pitch: from.pitch, pitchTo: euler.x, landed: false,
    };
    mode = 'sitting';
    vel.set(0, 0, 0);
    vy = 0;
    body.y = 0;
  }

  function updateEase(dt) {
    const e = ease;
    e.t = Math.min(1, e.t + dt / e.time);
    const k = e.t;
    const p = camera.position;
    if (mode === 'standing') {
      // Up first, then the step forward catches up.
      const up = smooth(Math.min(1, k / 0.7)), out = smooth(k);
      p.set(lerp(e.from.x, e.to.x, out), lerp(e.from.y, e.to.y, up), lerp(e.from.z, e.to.z, out));
      if (k === 1) {
        mode = 'walking';
        ease = null;
      }
      return;
    }
    // Sitting: a curve through the spot in front of the chair, dropping onto the seat at the end.
    const u = smooth(k), a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
    const down = smooth(clamp01((k - 0.35) / 0.65));
    p.set(a * e.from.x + b * e.via.x + c * e.to.x, lerp(e.from.y, e.to.y, down), a * e.from.z + b * e.via.z + c * e.to.z);
    const turn = smooth(Math.min(1, k / 0.8));
    euler.set(lerp(e.pitch, e.pitchTo, turn), e.yaw + e.turn * turn, 0);
    camera.quaternion.setFromEuler(euler);
    if (!e.landed && k >= 0.7) {
      e.landed = true;
      sfx.sit();
    }
    if (k === 1) {
      mode = 'seated';
      ease = null;
    }
  }

  // --- Walking -------------------------------------------------------------------
  // W/A/S/D as a direction on the floor, relative to where the camera faces.
  function wishDir() {
    wish.set(0, 0, 0);
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    right.set(-fwd.z, 0, fwd.x);
    wish.addScaledVector(fwd, (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0));
    wish.addScaledVector(right, (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0));
    return wish.lengthSq() > 0 ? wish.normalize() : wish;
  }

  // Push the body out of every circle (a few passes settle corners between two of
  // them), dropping the part of the velocity that points into it, then keep it
  // inside the hall.
  function collide() {
    const r = config.walk.radius;
    for (let pass = 0; pass < 3; pass++) {
      let hit = false;
      for (const c of colliders) {
        const dx = body.x - c.x, dz = body.z - c.z, min = c.r + r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2);
        const nx = d > 1e-6 ? dx / d : 1, nz = d > 1e-6 ? dz / d : 0;
        body.x = c.x + nx * min;
        body.z = c.z + nz * min;
        const into = vel.x * nx + vel.z * nz;
        if (into < 0) {
          vel.x -= nx * into;
          vel.z -= nz * into;
        }
        hit = true;
      }
      if (!hit) break;
    }
    const x = Math.min(bounds.maxX - r, Math.max(bounds.minX + r, body.x));
    const z = Math.min(bounds.maxZ - r, Math.max(bounds.minZ + r, body.z));
    if (x !== body.x) vel.x = 0;
    if (z !== body.z) vel.z = 0;
    body.x = x;
    body.z = z;
  }

  function walk(dt) {
    const dir = wishDir();
    const run = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const speed = run ? config.walk.run : config.walk.speed;
    const k = 1 - Math.exp(-ACCEL * dt);
    vel.x += (dir.x * speed - vel.x) * k;
    vel.z += (dir.z * speed - vel.z) * k;
    const x0 = body.x, z0 = body.z;
    body.x += vel.x * dt;
    body.z += vel.z * dt;
    collide();
    const moved = Math.hypot(body.x - x0, body.z - z0);

    // A hop: up, down, and the knees give a little when you land.
    if (vy !== 0 || body.y > 0) {
      vy -= GRAVITY * dt;
      body.y += vy * dt;
      if (body.y <= 0) {
        body.y = vy = 0;
        dip = 0;
        sfx.land();
      }
    }
    if (dip < 1) dip = Math.min(1, dip + dt / DIP.time);

    // Footsteps and the head bob follow the distance walked, so they keep time with
    // the stride whatever the speed (and stop when you walk into a wall).
    const grounded = body.y === 0;
    const walking = grounded && moved > 0.3 * dt;
    if (walking) {
      if (!wasWalking && bobAmount < 0.05) stride = Math.floor(stride) + 0.6; // first step comes quickly
      const before = Math.floor(stride);
      const length = STRIDE * Math.sqrt(Math.max(0.5, Math.hypot(vel.x, vel.z)) / config.walk.speed);
      stride += moved / length;
      if (Math.floor(stride) > before) sfx.step(run ? 1 : 0.8);
    } else if (wasWalking && grounded && stride % 1 > 0.35) {
      sfx.step(0.45); // coming to a stop: the trailing foot catches up
      stride = Math.ceil(stride);
    }
    wasWalking = walking;
    const target = walking ? Math.min(1.3, Math.hypot(vel.x, vel.z) / config.walk.speed) : 0;
    bobAmount += (target - bobAmount) * (1 - Math.exp(-8 * dt));

    // Head down as each foot lands, up between steps, swaying a touch from foot to foot.
    const amount = settings.bob ? bobAmount : 0;
    const s = stride * Math.PI;
    const bob = -BOB.height * amount * (1 + Math.cos(2 * s)) / 2;
    const sway = BOB.sway * amount * Math.sin(s);
    const knees = dip < 1 ? -DIP.depth * Math.sin(Math.PI * dip) : 0;
    camera.position.set(body.x + right.x * sway, config.walk.eye + body.y + bob + knees, body.z + right.z * sway);
  }

  return {
    // Put the camera on the seat. limited: keep the head turned towards the room.
    seat(p, limited) {
      pose = p;
      mode = 'seated';
      ease = null;
      vel.set(0, 0, 0);
      vy = body.y = 0;
      camera.position.copy(p.pos);
      camera.quaternion.copy(p.quat);
      camera.fov = settings.fov;
      camera.updateProjectionMatrix();
      look.setLimit(limited ? config.introLook : null);
    },
    freeLook() {
      look.setLimit(null);
    },
    allowStanding(on) {
      canStand = on;
    },
    // bounds: { minX, maxX, minZ, maxZ } the walkable floor; colliders: [{ x, z, r }].
    setWorld({ bounds: b, colliders: list } = {}) {
      if (b) bounds = b;
      if (list) colliders = [chairCollider(), ...list];
    },
    update(dt) {
      if (!look.isLocked) keys.clear();
      if (ease) return updateEase(dt);
      if (mode === 'seated') {
        if (canStand && MOVE_KEYS.some((code) => keys.has(code))) standUp();
        return;
      }
      walk(dt);
    },
    get seated() {
      return mode === 'seated' || mode === 'sitting';
    },
    get mode() {
      return mode;
    },
    // True when E would sit you down (for the "e to sit" hint).
    get canSit() {
      return nearChair();
    },
  };
}
