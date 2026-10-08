import THREE from '../three.js';
import { crunchy, flatMaterial } from '../textures.js';
import { buildHead } from './head.js';
import { buildHand } from './hand.js';
import {
  HIP, THIGH, SHIN, PASTERN, HOOF, BELLY, CHEST, NECK, UPPER_ARM, FOREARM, ACTIONS, createMotion,
} from './poses.js';

// GoatMan himself, from doost44/the-goatman (goatman3d/src/goatman.js), ported to the chair
// world's three r128: a low-poly body of tapered six-sided limbs, a shaped head and long
// skinned hands, textured with crops of Charlie's painting (parts/*.png) and animated in
// code (poses.js). The game's first person, colour grades and the head coming off are left
// out; what is new is gaze(), turning his head to look at something, and gripIn().
//
// The model faces -Z and stands on y = 0. Every joint is a Group. Limbs hang down (-Y)
// from their joint and a positive rotation.x swings them forward.

const PARTS = ['face-front', 'face-side', 'hair', 'chest', 'arm', 'hand', 'leg', 'hoof'];
const partUrl = (p) => new URL(`./parts/part-${p}.png`, import.meta.url).href;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

// A crop on a canvas, its see-through pixels filled with the average colour of the rest,
// so the edges of the painting don't show up black on the model.
function filled(img) {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  const p = data.data;
  let r = 0, gr = 0, b = 0, n = 0;
  for (let i = 0; i < p.length; i += 4) if (p[i + 3] > 127) { r += p[i]; gr += p[i + 1]; b += p[i + 2]; n++; }
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] > 127) continue;
    p[i] = r / n; p[i + 1] = gr / n; p[i + 2] = b / n; p[i + 3] = 255;
  }
  g.putImageData(data, 0, 0);
  return c;
}

// A soft dark disc for under him.
function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(8, 8, 1, 8, 8, 8);
  grad.addColorStop(0, 'rgba(0,0,0,0.6)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.35)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 16, 16);
  return crunchy(c);
}

// A tapered six-sided limb with rounded ends, from its joint down (or up). The rounded
// ends overlap at each bend like knuckles, so no gaps open between the limbs.
function limb(len, rJoint, rEnd, mat, up = false) {
  const profile = [[0, -rEnd * 0.9], [rEnd * 0.8, -rEnd * 0.45], [rEnd, 0], [rJoint, len], [rJoint * 0.8, len + rJoint * 0.45], [0, len + rJoint * 0.9]];
  const geo = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 6);
  if (up) geo.rotateX(Math.PI).translate(0, len, 0); // the joint at the bottom, reaching up
  else geo.translate(0, -len, 0); // the joint at the top, hanging down
  return new THREE.Mesh(geo, mat);
}

export async function createGoatMan() {
  const imgs = await Promise.all(PARTS.map((p) => loadImage(partUrl(p))));
  const tex = {};
  PARTS.forEach((p, i) => { tex[p] = crunchy(filled(imgs[i])); });
  for (const p of ['arm', 'leg', 'chest']) tex[p].wrapS = THREE.RepeatWrapping;
  tex.arm.repeat.x = tex.leg.repeat.x = 3;
  tex.chest.repeat.x = 2;

  const M = {};
  for (const p in tex) M[p] = flatMaterial({ map: tex[p] });
  M.hair.side = THREE.DoubleSide; // its ragged edge is seen from below too
  M.hand.skinning = true; // r128 wants this said for skinned meshes
  M.hoof = flatMaterial({ color: 0x2a1418 });
  M.shin = flatMaterial({ map: tex.hoof }); // hairy, dark at the bottom

  // A tapered six-sided cylinder from its joint, up or (usually) down, for the torso.
  const cylinder = (len, rTop, rBottom, mat, up = false) => {
    const geo = new THREE.CylinderGeometry(rTop, rBottom, len + 0.04, 6, 1);
    geo.translate(0, up ? len / 2 : -len / 2, 0);
    return new THREE.Mesh(geo, mat);
  };
  const joint = (parent, x, y, z) => {
    const j = new THREE.Group();
    j.position.set(x, y, z);
    parent.add(j);
    return j;
  };

  // --- The body ------------------------------------------------------------------------
  const group = new THREE.Group(); // at his hooves, turned to face where he is going
  const root = joint(group, 0, HIP, 0); // the pelvis
  root.add(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.28), M.leg));
  const belly = joint(root, 0, 0, 0);
  const bellyMesh = cylinder(BELLY + 0.04, 0.24, 0.2, M.chest, true);
  belly.add(bellyMesh);
  const chest = joint(belly, 0, BELLY - 0.05, 0);
  const chestMesh = new THREE.Mesh(new THREE.LatheGeometry(
    [[0.24, -0.02], [0.28, CHEST - 0.06], [0.22, CHEST + 0.02], [0.1, CHEST + 0.06], [0, CHEST + 0.07]].map(([r, y]) => new THREE.Vector2(r, y)), 6,
  ), M.chest);
  chest.add(chestMesh);
  for (const m of [bellyMesh, chestMesh]) m.scale.z = 0.8; // flatter front to back

  // A long thin neck from the front of his hunched shoulders, carrying the head out ahead.
  const neck = joint(chest, 0, CHEST - 0.05, -0.08);
  neck.add(limb(NECK, 0.075, 0.062, M.chest, true));
  const headMount = joint(neck, 0, NECK, 0);
  headMount.add(buildHead({ face: M['face-front'], profile: M['face-side'], hair: M.hair }));

  function arm(side) {
    const shoulder = joint(chest, side * 0.25, CHEST - 0.07, -0.02);
    shoulder.add(limb(UPPER_ARM, 0.058, 0.046, M.arm));
    const elbow = joint(shoulder, 0, -UPPER_ARM, 0);
    elbow.add(limb(FOREARM, 0.046, 0.036, M.arm));
    const wrist = joint(elbow, 0, -FOREARM, 0);
    const hand = buildHand(M.hand, side);
    hand.mesh.rotation.y = side * 1.2; // palms turned in towards him, thumbs forward
    wrist.add(hand.mesh);
    return { shoulder, elbow, wrist, hand };
  }
  const armL = arm(-1), armR = arm(1);

  function leg(side) {
    const hip = joint(root, side * 0.11, 0, 0.03);
    hip.add(limb(THIGH, 0.12, 0.1, M.leg));
    const knee = joint(hip, 0, -THIGH, 0);
    knee.add(limb(SHIN, 0.1, 0.075, M.leg));
    const ankle = joint(knee, 0, -SHIN, 0);
    ankle.add(limb(PASTERN, 0.075, 0.068, M.shin));
    const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.13, HOOF, 0.17), M.hoof);
    hoof.position.set(0, -PASTERN - HOOF / 2, -0.03);
    ankle.add(hoof);
    return { hip, knee, ankle };
  }
  const legL = leg(-1), legR = leg(1);

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 1.2).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
  );
  shadow.position.y = 0.02;
  group.add(shadow);

  // --- Posing ----------------------------------------------------------------------------
  const motion = createMotion();
  let action = null; // { act, k, from, done, resolve }
  let hold = 0; // right forearm raised to carry something, 0..1
  const look = { yaw: 0, pitch: 0 }; // where his head is turned, on top of his pose

  function apply(P) {
    root.position.y = P.hipY;
    root.rotation.set(0, P.twist, P.roll);
    belly.rotation.set(-P.lean, 0, P.sway);
    chest.rotation.set(-P.hunch, P.turn, 0);
    const bent = P.lean + P.hunch; // undoes the torso's bend for parts measured from the vertical
    neck.rotation.x = bent - P.neck;
    headMount.rotation.set(P.neck - P.head, P.look, 0);
    armL.shoulder.rotation.set(bent + P.armL, 0, -P.spreadL);
    armR.shoulder.rotation.set(bent + P.armR, 0, P.spreadR);
    armL.elbow.rotation.x = P.elbowL;
    armR.elbow.rotation.x = P.elbowR;
    armL.wrist.rotation.x = P.wristL;
    armR.wrist.rotation.x = P.wristR;
    legL.hip.rotation.set(P.thighL, 0, -P.straddle);
    legR.hip.rotation.set(P.thighR, 0, P.straddle);
    legL.knee.rotation.x = P.shinL;
    legL.ankle.rotation.x = P.ankleL;
    legR.knee.rotation.x = P.shinR;
    legR.ankle.rotation.x = P.ankleR;
  }

  const inverse = new THREE.Matrix4();
  const gm = {
    group,
    grip: armR.hand.grip, // where something he carries sits, in his right hand
    holding: false, // carrying something: the right forearm comes up
    // Play a scripted action (a name from ACTIONS, or one made by place()); the promise
    // resolves when it is done. Kneeling holds its pose until the next one.
    play(act) {
      action?.resolve();
      const a = typeof act === 'string' ? ACTIONS[act] : act;
      return new Promise((resolve) => { action = { a, k: 0, from: motion.pose, resolve }; });
    },
    get acting() { return !!action && !action.done; },
    // Turn his head this far (radians, left/right and up/down) from where his pose has it.
    gaze(yaw, pitch) { look.yaw = yaw; look.pitch = pitch; },
    // Where his grip would be, in his own space, standing in a pose (to know where to stand).
    gripIn(pose, out = new THREE.Vector3()) {
      apply(pose);
      group.updateMatrixWorld(true);
      armR.hand.grip.getWorldPosition(out);
      return out.applyMatrix4(inverse.copy(group.matrixWorld).invert());
    },
    // move: { pos, yaw, speed (1 = walking), stride (metres walked) }.
    update(dt, move) {
      group.position.copy(move.pos);
      group.rotation.y = move.yaw;
      let scripted = null;
      if (action) {
        action.k = Math.min(1, action.k + dt / action.a.time);
        scripted = action.a.at(action.k, action.from).pose;
        if (action.k >= 1 && !action.done) {
          action.done = true;
          action.resolve();
          if (!action.a.hold) action = null;
        }
      }
      hold += ((gm.holding ? 1 : 0) - hold) * Math.min(1, dt * 6);
      let P = motion.update(dt, { grounded: true, vy: 0, sprint: 0, ...move }, scripted, hold);
      if (!Number.isFinite(P.hipY)) { // a bad number would stay in the springs for good
        motion.reset();
        P = motion.update(0, { grounded: true, vy: 0, sprint: 0, ...move, speed: 0 }, null, 0);
      }
      apply(P);
      headMount.rotation.y += look.yaw;
      headMount.rotation.x += look.pitch;
      const kneeling = action?.a === ACTIONS.kneel;
      armL.hand.update(dt, { curl: kneeling ? 0.12 : 0.3 });
      armR.hand.update(dt, { curl: gm.holding ? 0.75 : kneeling ? 0.12 : 0.3 });
    },
    dispose() {
      group.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry.dispose();
        for (const m of [].concat(o.material)) { m.map?.dispose(); m.dispose(); }
      });
    },
  };
  apply(motion.update(0, { yaw: 0, speed: 0, stride: 0, grounded: true, vy: 0 }, null, 0));
  return gm;
}
