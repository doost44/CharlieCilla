import THREE from './three.js';
import { rng } from './textures.js';
import { sfx } from './sound.js';
import { createGoatMan } from './goatman/goatman.js';
import { ACTIONS, STAND, place } from './goatman/poses.js';

// GoatMan (from doost44/the-goatman) at work on the cinder-block stack by the wall that the
// warehouse sets aside for him (hall.work), with his project's station (the project marked
// `companion: "goatman"` in admin/data.js) hanging beside it. He works from behind it, tucked
// between it and the big stack by the wall, and carries the blocks lying about (most of them
// back there, a few out in front, which he walks round to fetch) back one at a time: over to a block, down on his knees, up with it, over to
// the stack, and set it on top, filling the top layer and starting another. Once none are
// left on the floor, the top of the stack tumbles off again and he starts over. When the
// visitor comes close he stops what he is doing and stares at them until they go.
//
// The blocks are the warehouse's own instances (hall.work.mesh); he moves them by
// rewriting their matrices. Everything is in world space.

const LAYERS = 2; // layers of the stack that are his: its old top and one more on it
const WALK = 0.9; // his pace, metres a second
const TURN = 2.4; // radians a second
const STARE = 5, STARE_OFF = 6.5; // he stops to stare inside the first, goes back to work outside the second
const GAZE = { yaw: 1.2, pitch: 0.5 }; // how far his head turns before his body has to
const EYES = 1.55; // his eye height in his stoop
const PLACE_TIME = 1.6; // seconds, matching place() in poses.js
const FRONT = 0.25; // of the blocks that tumble off, about this many land out in front
const CLEAR = 0.35; // metres he keeps from the stack's side when he reaches over it

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const turnToward = (from, to, step) => from + Math.max(-step, Math.min(step, wrap(to - from)));
const clamp = (v, m) => Math.max(-m, Math.min(m, v));
// Facing a point: he faces -Z, so his forward is (-sin yaw, -cos yaw).
const yawTo = (from, to) => Math.atan2(from.x - to.x, from.z - to.z);
const UP = new THREE.Vector3(0, 1, 0);

export async function buildGoatmanSite(stations, hall) {
  const station = stations.stations.find((s) => s.project.companion === 'goatman');
  const { mesh, items, stack } = hall.work ?? {};
  if (!station || !mesh) return null;
  const gm = await createGoatMan();
  const r = rng(712);
  const group = new THREE.Group();
  group.add(gm.group);
  stations.group.add(group); // dark and hidden with the stations until the hall is revealed

  // Behind the stack, away from the middle of the hall towards the wall: his side.
  const out = new THREE.Vector3(stack.x, 0, stack.z).normalize();
  const faceStack = Math.atan2(out.x, out.z); // the yaw that faces the stack from behind it
  const centre = new THREE.Vector3(stack.x, 0, stack.z);
  const halfAlong = Math.abs(out.x) * stack.nx * 0.205 + Math.abs(out.z) * stack.nz * 0.105; // the stack's half depth, seen from behind
  const ROUND = Math.hypot(stack.nx * 0.205, stack.nz * 0.105) + 0.3; // keep this far from its middle walking past

  // The stack's slots that are his, layer by layer, the far side of each first.
  const slots = [];
  for (let ly = stack.top; ly < stack.top + LAYERS; ly++) {
    const layer = [];
    for (let ix = 0; ix < stack.nx; ix++) {
      for (let iz = 0; iz < stack.nz; iz++) {
        layer.push(new THREE.Vector3(stack.x + (ix - (stack.nx - 1) / 2) * 0.41, 0.23 + ly * 0.2, stack.z + (iz - (stack.nz - 1) / 2) * 0.21));
      }
    }
    slots.push(...layer.sort((a, b) => a.clone().sub(centre).dot(out) - b.clone().sub(centre).dot(out)));
  }

  // The blocks: where each is, in which slot (if any), and its size.
  const blocks = items.map((it, i) => ({
    i,
    size: new THREE.Vector3(...it.s),
    pos: new THREE.Vector3(...it.p),
    quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(...it.r)),
    slot: -1,
  }));
  const taken = new Array(slots.length).fill(null);
  const loose = [];
  for (const b of blocks) {
    const s = slots.findIndex((p) => p.distanceTo(b.pos) < 0.08);
    if (s >= 0) { b.slot = s; taken[s] = b; } else loose.push(b);
  }
  const nextSlot = () => taken.indexOf(null);

  // Where blocks lie: in an arc out in front of the stack, apart from each other, from him
  // and from the hall's things (the other stacks, his station).
  const avoid = [
    ...hall.colliders.filter((c) => Math.hypot(c.x - stack.x, c.z - stack.z) > 0.5),
    { x: station.holder.position.x, z: station.holder.position.z, r: 1.2 },
  ];
  const bounds = hall.bounds;
  const lying = (n, keepOff) => {
    const spots = [];
    for (let tries = 0; spots.length < n && tries < 800; tries++) {
      const a = Math.atan2(out.x, out.z) + (r() < FRONT ? Math.PI : 0) + (r() - 0.5) * 2;
      const d = 1.3 + r() * 1.7;
      const p = new THREE.Vector3(stack.x + Math.sin(a) * d, 0, stack.z + Math.cos(a) * d);
      if (p.x < bounds.minX + 0.5 || p.x > bounds.maxX - 0.5 || p.z < bounds.minZ + 0.5 || p.z > bounds.maxZ - 0.5) continue;
      if ([...spots, ...keepOff].some((o) => Math.hypot(o.x - p.x, o.z - p.z) < 0.6)) continue;
      if (avoid.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < c.r + 0.3)) continue;
      spots.push(p);
    }
    return spots;
  };
  const restingAt = (p, size) => {
    const onSide = r() < 0.3;
    return {
      pos: new THREE.Vector3(p.x, onSide ? size.z / 2 : size.y / 2, p.z),
      quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(onSide ? Math.PI / 2 : 0, r() * Math.PI, 0)),
    };
  };

  // --- Him --------------------------------------------------------------------------------
  const kneelGrip = gm.gripIn(ACTIONS.kneel.at(1, STAND).pose);
  const placeGrip = (h) => gm.gripIn(place(h).at(0.5, STAND).pose);
  gm.gripIn(STAND);
  const me = { pos: centre.clone().addScaledVector(out, 1.5), yaw: faceStack, speed: 0, stride: 0 };
  const collider = { x: me.pos.x, z: me.pos.z, r: 0.45 }; // for the visitor to bump into
  let goal = null; // { spot, yaw, resolve }: walking somewhere, then turning to face a way
  let staring = false, stare = 0;
  let down = false; // on his knees
  let carried = null; // the block in his hand: { b, from: { pos, quat }, k }
  let setting = null; // putting it down: { b, slot, t, from }
  const falling = []; // blocks tumbling off the top
  const waits = []; // things the work is waiting for, checked every frame
  let alive = true;

  // Where to stand for his grip (offset `grip` in his own space) to reach `target`, facing
  // `yaw`; never inside the stack (reaching over to its far side, the block goes the rest).
  const standFor = (target, grip, yaw = yawTo(me.pos, target)) => {
    const g = new THREE.Vector3(grip.x, 0, grip.z).applyAxisAngle(UP, yaw);
    const spot = new THREE.Vector3(target.x - g.x, 0, target.z - g.z);
    const behind = spot.clone().sub(centre).dot(out);
    if (behind < halfAlong + CLEAR && Math.abs(spot.clone().sub(centre).cross(out).y) < ROUND) {
      spot.addScaledVector(out, halfAlong + CLEAR - behind);
    }
    return { spot, yaw };
  };
  // A point to walk by so as to go round the stack, not through it (null: the way is clear).
  const roundBy = (from, to) => {
    const way = new THREE.Vector3().subVectors(to, from).setY(0);
    const t = THREE.MathUtils.clamp(new THREE.Vector3().subVectors(centre, from).dot(way) / way.lengthSq(), 0, 1);
    const nearest = from.clone().addScaledVector(way, t);
    if (t <= 0 || t >= 1 || nearest.distanceTo(centre) > ROUND) return null;
    const side = nearest.sub(centre).setY(0);
    if (side.lengthSq() < 1e-4) side.set(-way.z, 0, way.x);
    return centre.clone().addScaledVector(side.normalize(), ROUND + 0.25);
  };
  const moveTo = (spot, yaw = null) => new Promise((resolve) => { goal = { spot, yaw, resolve }; });
  async function walkTo({ spot, yaw }) {
    for (let i = 0; i < 2; i++) {
      const by = roundBy(me.pos, spot);
      if (!by) break;
      await moveTo(by);
    }
    await moveTo(spot, yaw);
  }
  const wait = (s) => new Promise((resolve) => { let t = 0; waits.push((dt) => (t += dt) >= s && (resolve(), true)); });
  const calm = () => new Promise((resolve) => waits.push(() => !staring && (resolve(), true)));
  const play = async (act) => { await calm(); return gm.play(act); };

  // A block held in his right hand, in the hand's space: across his palm.
  const HELD = { pos: new THREE.Vector3(0, -0.06, -0.08), quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)) };
  const held = new THREE.Matrix4(), hand = new THREE.Matrix4();
  const heldPos = new THREE.Vector3(), heldQuat = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), scale = new THREE.Vector3();
  const heldNow = () => {
    hand.copy(gm.grip.matrixWorld).multiply(held.compose(HELD.pos, HELD.quat, one));
    hand.decompose(heldPos, heldQuat, scale);
  };

  async function work() {
    while (alive) {
      while (loose.length && nextSlot() >= 0 && alive) {
        loose.sort((a, b) => a.pos.distanceTo(me.pos) - b.pos.distanceTo(me.pos));
        const b = loose.shift();
        await calm();
        await walkTo(standFor(b.pos, kneelGrip));
        await play('kneel');
        down = true;
        carried = { b, from: { pos: b.pos.clone(), quat: b.quat.clone() }, k: 0 };
        gm.holding = true;
        await play('stand');
        down = false;
        const s = nextSlot();
        taken[s] = b;
        await calm();
        await walkTo(standFor(slots[s], placeGrip(slots[s].y), faceStack));
        await calm();
        setting = { b, slot: s, t: 0 };
        gm.holding = false;
        await gm.play(place(slots[s].y));
      }
      if (!alive) return;
      // Nothing left to carry: he steps back and looks, and the top of the stack comes down.
      await walkTo({ spot: centre.clone().addScaledVector(out, 2.4), yaw: faceStack });
      await wait(1.5);
      topple();
      await wait(3.5);
    }
  }

  function topple() {
    const top = blocks.filter((b) => b.slot >= 0).sort((a, b) => b.slot - a.slot);
    const spots = lying(top.length, [me.pos]);
    top.forEach((b, k) => {
      const ly = Math.floor(b.slot / (stack.nx * stack.nz));
      falling.push({
        b, t: -((LAYERS - 1 - ly) * 0.15 + r() * 0.12), time: 0.55 + r() * 0.35,
        from: { pos: b.pos.clone(), quat: b.quat.clone() },
        to: restingAt(spots[k] ?? centre.clone().addScaledVector(out, 2 + r()), b.size),
        spin: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(), Math.PI * (1 + r())),
      });
      taken[b.slot] = null;
      b.slot = -1;
    });
  }

  const eye = new THREE.Vector3(), q = new THREE.Quaternion(), m = new THREE.Matrix4();
  function update(dt, camera) {
    // The visitor: near enough, he stops and stares.
    eye.copy(camera.position);
    const away = Math.hypot(eye.x - me.pos.x, eye.z - me.pos.z);
    if (away < STARE) staring = true;
    else if (away > STARE_OFF) staring = false;
    stare += ((staring ? 1 : 0) - stare) * Math.min(1, dt * 3);

    me.speed = 0;
    if (staring) {
      // Turn to face them once his head can't turn far enough (not while kneeling).
      const want = yawTo(me.pos, eye);
      if (!gm.acting && !down && Math.abs(wrap(want - me.yaw)) > GAZE.yaw * 0.8) {
        me.yaw = wrap(turnToward(me.yaw, want, 1.2 * dt));
        me.speed = 0.3; // shuffling round
        me.stride += 0.25 * dt;
      }
    } else if (goal) {
      const to = new THREE.Vector3().subVectors(goal.spot, me.pos).setY(0);
      const d = to.length();
      if (goal.yaw === null && d < 0.2) {
        const done = goal; // a point on the way: walk on
        goal = null;
        done.resolve();
      } else if (d > 0.03) {
        // Over a step or two he shuffles there still facing his work (backing off the
        // stack, say); further, he turns and walks.
        const near = d < 1.2 && goal.yaw !== null;
        const want = near ? goal.yaw : Math.atan2(-to.x, -to.z);
        me.yaw = wrap(turnToward(me.yaw, want, TURN * dt));
        const step = Math.min(d, WALK * dt * (near ? 0.6 : Math.max(0, Math.cos(wrap(want - me.yaw))) ** 2));
        me.pos.addScaledVector(to, step / d);
        me.stride += step;
        me.speed = step / dt / WALK;
      } else {
        me.yaw = wrap(turnToward(me.yaw, goal.yaw, TURN * dt));
        me.speed = 0.25;
        me.stride += 0.2 * dt;
        if (Math.abs(wrap(goal.yaw - me.yaw)) < 0.04) {
          const done = goal;
          goal = null;
          done.resolve();
        }
      }
    }
    for (let i = waits.length - 1; i >= 0; i--) if (waits[i](dt)) waits.splice(i, 1);

    // His head follows the visitor while he stares.
    const rel = wrap(yawTo(me.pos, eye) - me.yaw);
    const up = Math.atan2(eye.y - EYES, Math.max(0.5, away));
    gm.gaze(clamp(rel, GAZE.yaw) * stare, clamp(up, GAZE.pitch) * stare);
    gm.update(dt, me);
    gm.group.updateMatrixWorld(true);

    // The block in his hand settles into his grip as he gets up.
    if (carried) {
      carried.k = Math.min(1, carried.k + dt * 2.5);
      heldNow();
      carried.b.pos.lerpVectors(carried.from.pos, heldPos, carried.k);
      carried.b.quat.slerpQuaternions(carried.from.quat, heldQuat, carried.k);
    }
    // Setting it down: from his hand to its place on the stack, partway through reaching.
    if (setting) {
      setting.t += dt;
      const k = (setting.t / PLACE_TIME - 0.28) / 0.25;
      const b = setting.b;
      if (k > 0 && !setting.from) {
        setting.from = { pos: b.pos.clone(), quat: b.quat.clone() };
        carried = null;
      }
      if (setting.from) {
        const e = Math.min(1, k);
        b.pos.lerpVectors(setting.from.pos, slots[setting.slot], e);
        b.pos.y += Math.sin(Math.PI * e) * 0.06;
        b.quat.slerpQuaternions(setting.from.quat, q.identity(), e);
        if (e >= 1) {
          b.pos.copy(slots[setting.slot]);
          b.slot = setting.slot;
          sfx.block?.(b.pos, 0.7);
          setting = null;
        }
      }
    }
    // Blocks tumbling off the top of the stack.
    for (let i = falling.length - 1; i >= 0; i--) {
      const f = falling[i];
      f.t += dt;
      const k = Math.min(1, Math.max(0, f.t / f.time));
      f.b.pos.lerpVectors(f.from.pos, f.to.pos, Math.sqrt(k));
      f.b.pos.y = THREE.MathUtils.lerp(f.from.pos.y, f.to.pos.y, k * k) + Math.sin(Math.PI * k) * 0.15; // falling faster and faster
      f.b.quat.slerpQuaternions(f.from.quat, f.to.quat, k); // (doesn't return itself in r128)
      f.b.quat.multiply(q.identity().slerp(f.spin, 1 - k));
      if (k >= 1) {
        f.b.pos.copy(f.to.pos);
        f.b.quat.copy(f.to.quat);
        if (i % 3 === 0) sfx.block?.(f.to.pos, 1);
        loose.push(f.b);
        falling.splice(i, 1);
      }
    }

    // Draw the blocks where they are now.
    for (const b of blocks) mesh.setMatrixAt(b.i, m.compose(b.pos, b.quat, b.size));
    mesh.instanceMatrix.needsUpdate = true;
    collider.x = me.pos.x;
    collider.z = me.pos.z;
  }

  work();
  return {
    group,
    station,
    // For testing: where he is and how the stack stands.
    get state() {
      return { pos: me.pos.clone(), yaw: me.yaw, stacked: taken.filter(Boolean).length, loose: loose.length, falling: falling.length, staring, down, holding: gm.holding, goal: !!goal, acting: gm.acting, setting: !!setting };
    },
    colliders: [collider], // him, moving with him (the stack's own is the hall's)
    update,
    dispose() {
      alive = false;
      gm.dispose();
      group.parent?.remove(group);
    },
  };
}
