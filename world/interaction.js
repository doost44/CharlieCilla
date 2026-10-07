import THREE from './three.js';
import { showTarget } from './hud.js';
import { releaseOrb } from './orbs.js';
import { sfx } from './sound.js';

// Aim with the crosshair, click to grab, wheel to pull in or push away, click again
// to let go (a swipe as you let go throws it). F, → or a trackpad swipe right brings
// the panel to the middle to read; ← and → turn its pages. Enter, or a double-click,
// opens the project in the site's own project view.

const CENTER = new THREE.Vector2(0, 0);
const MAX_DIST = 40;
const SWIPE = 40; // horizontal wheel distance that counts as a swipe

export function createInteraction({ camera, look, orbs, panels, signal, onOpen }) {
  const raycaster = new THREE.Raycaster();
  const targets = [...orbs.map((o) => o.mesh), ...panels.map((p) => p.mesh)];
  const state = { enabled: false, targeted: null, held: null, dist: 0, wantDist: 0, swipe: 0, released: null, releasedAt: 0 };
  const on = (target, type, fn, opts = {}) => target.addEventListener(type, fn, { ...opts, signal });

  function setReading(on) {
    const o = state.held;
    if (!o || o.reading === on) return;
    o.reading = on;
    o.page = 0;
    if (on) sfx.readOn();
    else sfx.readOff();
  }

  // → / swipe right: start reading, then next page. ← / swipe left: previous page, then back to the orb.
  function forward() {
    const o = state.held;
    if (!o) return;
    if (!o.reading) return setReading(true);
    if (o.page < o.panel.pages.length - 1) { o.page++; sfx.page(); }
  }
  function back() {
    const o = state.held;
    if (!o?.reading) return;
    if (o.page > 0) { o.page--; sfx.page(); } else setReading(false);
  }

  function open(o) {
    release();
    onOpen(o);
  }

  on(document, 'mousedown', (e) => {
    if (!state.enabled || !look.isLocked || e.button !== 0) return;
    if (state.held) {
      release();
    } else if (state.targeted) {
      const o = state.targeted;
      o.held = true;
      o.returning = o.arriving = false;
      sfx.grab(orbs.indexOf(o));
      o.free = false;
      o.heldVel.set(0, 0, 0);
      prev.copy(o.group.position);
      state.held = o;
      state.dist = state.wantDist = camera.position.distanceTo(o.group.position);
    }
  });

  // The first click of a double-click grabs (or lets go), so open whatever was just handled.
  on(document, 'dblclick', () => {
    if (!state.enabled || !look.isLocked) return;
    const recent = performance.now() - state.releasedAt < 600 ? state.released : null;
    const o = state.held ?? state.targeted ?? recent;
    if (o) open(o);
  });

  on(document, 'wheel', (e) => {
    if (!state.held) return;
    // Two-finger swipe on a trackpad: right reads the panel, left goes back to the orb.
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      state.swipe += e.deltaX;
      if (Math.abs(state.swipe) > SWIPE) {
        if (state.swipe > 0) forward();
        else back();
        state.swipe = 0;
      }
      return;
    }
    state.swipe = 0;
    if (state.held.reading) return;
    const min = state.held.radius + 1.5;
    state.wantDist = THREE.MathUtils.clamp(state.wantDist + Math.sign(e.deltaY) * 1.5, min, MAX_DIST);
  }, { passive: true });

  on(window, 'keydown', (e) => {
    if (!state.enabled || !look.isLocked) return;
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      const o = state.held ?? state.targeted;
      if (o) open(o);
    }
    if (!state.held) return;
    if (e.code === 'KeyF') setReading(!state.held.reading);
    if (e.code === 'ArrowRight') forward();
    if (e.code === 'ArrowLeft') back();
  });

  const dir = new THREE.Vector3();
  const side = new THREE.Vector3();
  const goal = new THREE.Vector3();
  const prev = new THREE.Vector3();
  const step = new THREE.Vector3();

  function update(dt) {
    // Aim with the crosshair (screen centre), which works under pointer lock.
    let aimed = null;
    if (state.enabled && look.isLocked) {
      raycaster.setFromCamera(CENTER, camera);
      const hit = raycaster.intersectObjects(targets, false).find((h) => h.object.visible && h.object.userData.orb.group.visible);
      aimed = hit ? hit.object.userData.orb : null;
    }
    for (const o of orbs) o.targeted = o === aimed && !state.held;
    if (aimed && aimed !== state.lastAimed && !state.held) sfx.aim(orbs.indexOf(aimed));
    state.lastAimed = aimed;
    state.targeted = aimed;

    if (state.held) {
      const o = state.held;
      state.dist += (state.wantDist - state.dist) * Math.min(1, dt * 6);
      camera.getWorldDirection(dir);
      goal.copy(camera.position).addScaledVector(dir, state.dist);
      // While reading, the orb steps out of the way to the left.
      if (o.reading) {
        side.crossVectors(dir, camera.up).normalize();
        goal.addScaledVector(side, -(o.radius + 3.5));
      }
      o.group.position.lerp(goal, Math.min(1, dt * 10));
      // Average speed over roughly the last tenth of a second, for throwing on release.
      if (dt > 0) {
        step.subVectors(o.group.position, prev).divideScalar(dt);
        o.heldVel.lerp(step, 1 - Math.exp(-dt / 0.1));
      }
      prev.copy(o.group.position);
    }
    showTarget(state.enabled ? state.held ?? aimed : null, !!state.held);
  }

  function release() {
    const o = state.held;
    if (!o) return;
    releaseOrb(o);
    sfx.release();
    if (o.free) sfx.whoosh(o.vel.length(), orbs.indexOf(o));
    else sfx.drop(orbs.indexOf(o));
    state.held = null;
    state.released = o;
    state.releasedAt = performance.now();
  }

  return {
    update,
    release,
    set enabled(on) { state.enabled = on; },
    get enabled() { return state.enabled; },
  };
}
