import THREE from './three.js';
import { config } from './config.js';
import { mountHud, setSubtitle, showHint } from './hud.js';
import { createLook } from './mouse.js';
import { createOptions, settings } from './options.js';
import { startSound, stopSound, resumeSound, updateSound, sfx } from './sound.js';
import { buildWorld } from './world-island.js';
import { buildChair, seatPose } from './chair.js';
import { buildRoom } from './room.js';
import { createAscii } from './ascii.js';
import { createPlayer } from './player.js';
import { buildProjects } from './projects.js';
import { updateOrbs, resetOrbits, startArrival, finishArrival } from './orbs.js';
import { updatePanels } from './panels.js';
import { createInteraction } from './interaction.js';
import { createSequence } from './sequence.js';

// The chair world: built inside #world-root when the visitor presses E at the
// home page's ASCII chair (see entry.js), and torn down completely on the way back.

let world = null;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// home: the page's ASCII chair hook (window.asciiChair). audio: an AudioContext made
// inside the E key press. phase: where to start (?phase= for testing). onLeft: called
// once the world is gone and the page should show again.
export async function launchWorld({ root, home, audio, phase = 'sit', onLeft }) {
  if (world) return;
  await document.fonts.load(`500 16px ${config.font}`); // the canvases draw text in it
  const abort = new AbortController();
  const { signal } = abort;
  const on = (target, type, fn, opts = {}) => target.addEventListener(type, fn, { ...opts, signal });
  const $ = (id) => document.getElementById('cw-' + id);

  mountHud(root);
  document.body.classList.add('cw-intro');
  const view = $('view');
  const renderer = new THREE.WebGLRenderer({ canvas: view, antialias: false });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 400);

  const island = buildWorld(scene);
  const room = buildRoom(scene);
  const chair = buildChair(home, room.focus); // facing the room's focal point
  scene.add(chair);
  const seat = seatPose(chair, room.focus);
  const ascii = createAscii({ canvas: $('ascii'), room, center: new THREE.Vector3(seat.pos.x, 0, seat.pos.z), eye: seat.pos, chair });
  const look = createLook(camera, root, signal);
  const player = createPlayer(camera, look);
  const projects = buildProjects(scene);
  const { orbs, lines, panels } = projects;
  setSubtitle(`SELECTED WORKS · ${projects.count} PROJECTS`);
  startSound(audio);

  const interaction = createInteraction({ camera, look, orbs, panels, signal, onOpen: openWork });
  const options = createOptions({
    renderer, camera, look, signal,
    onOpen: () => showOverlay(false),
    onClose: () => showOverlay(!look.isLocked),
  });

  // --- Pause screen, pointer lock, leaving -------------------------------------
  const state = { modal: false }; // the site's project view is open over the world
  const overlay = $('overlay');
  let everLocked = look.isLocked;
  let leaving = false;
  const showOverlay = (show) => overlay.classList.toggle('cw-hidden', !show);
  function resume() {
    options.restoreFullscreen();
    resumeSound();
    look.lock();
  }
  look.onLock = () => {
    everLocked = true;
    showOverlay(false);
    document.activeElement?.blur?.(); // so Space doesn't press a button
    resumeSound();
  };
  look.onUnlock = () => {
    interaction.release();
    if (!options.isOpen && !state.modal && !leaving) showOverlay(true);
  };
  on($('resume'), 'click', resume);
  on($('options-button'), 'click', () => options.open());
  on($('leave'), 'click', leave);
  on($('back'), 'click', leave);
  // Clicking the world itself (not a button) takes the mouse, or skips the intro.
  on(root, 'mousedown', (e) => {
    if (e.button !== 0 || e.target.closest('button, #cw-options, #cw-overlay .cw-box')) return;
    if (!look.isLocked) resume();
    else if (sequence.intro) sequence.skip();
  });

  on(window, 'keydown', (e) => {
    if (state.modal || leaving) return;
    const inMenu = e.target.closest?.('input, select, button');
    if (!inMenu && (e.code === 'Space' || e.code.startsWith('Arrow'))) e.preventDefault(); // the page behind must not scroll
    // With Esc taken over in fullscreen (see options.js), a tap still frees the mouse.
    if (e.code === 'Escape' && options.isOpen) options.close();
    else if (e.code === 'Escape' && look.isLocked) look.unlock();
    if (e.repeat) return;
    if (e.code === 'KeyO') {
      if (options.isOpen) options.close();
      else options.open();
    }
    if (e.code === 'KeyR' && !sequence.intro) resetOrbs();
    if (e.code === 'Space' && sequence.intro) sequence.skip();
  });

  // Enter on an orb opens the site's own project view over the world; closing it comes back here.
  const modal = document.getElementById('project-modal');
  function openWork(orb) {
    state.modal = true;
    sfx.open();
    look.unlock();
    window.openProject(orb.project.id);
  }
  const watcher = new MutationObserver(() => {
    if (!state.modal || modal.classList.contains('is-open')) return;
    state.modal = false;
    showOverlay(true); // hidden again as soon as the mouse is taken back
    resume();
  });
  watcher.observe(modal, { attributes: true, attributeFilter: ['class'] });

  async function leave() {
    if (leaving) return;
    leaving = true;
    look.unlock();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    $('white').classList.add('cw-on');
    await wait(config.fade * 1000);
    leaveWorld();
    onLeft?.();
  }

  function resetOrbs() {
    interaction.release();
    resetOrbits(orbs);
  }

  on(window, 'resize', () => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    ascii.resize();
  });

  // --- The intro ------------------------------------------------------------------
  let shake = 0;
  const toWall = new THREE.Vector3(), right = new THREE.Vector3();
  const sequence = createSequence({
    // In the chair from the first frame; the head stays turned to the room while it forms.
    sit: {
      start(instant) {
        player.seat(seat, true);
        if (!instant) sfx.creak();
      },
    },
    swirl: {
      start(instant) {
        ascii.show(true);
        if (!instant) sfx.riser(config.durations.swirl);
      },
    },
    form: {
      start: () => ascii.form(),
      finish: () => ascii.lockAll(),
    },
    texture: {
      update(t, k) {
        room.setOpacity(k);
        ascii.setOpacity(1 - k);
      },
      finish() {
        room.setOpacity(1);
        ascii.show(false);
        island.reveal(true); // hidden behind the solid room until the walls fall
        player.freeLook();
      },
    },
    collapse: {
      start(instant) {
        room.collapse.start();
        if (!instant) sfx.lift();
      },
      update(t, k, dt) {
        for (const name of room.collapse.update(t, dt)) {
          // Thud from the side the wall fell on.
          toWall.copy(room.walls[name].pivot.position).sub(camera.position).normalize();
          right.setFromMatrixColumn(camera.matrixWorld, 0);
          sfx.thud(toWall.dot(right));
          shake = Math.max(shake, 0.6);
        }
      },
      finish: () => room.collapse.finish(),
    },
    projects: {
      start() {
        startArrival(orbs);
        interaction.enabled = true;
        document.body.classList.remove('cw-intro');
      },
      finish: () => finishArrival(orbs),
    },
  });

  world = { root, renderer, scene, abort, watcher, ascii, room, island, panels, home };

  // Fade the page to black first (entry.js), then show the chair and start.
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let startIn = config.fade;
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.elapsedTime;
    if (startIn > 0 && (startIn -= dt) <= 0) {
      sequence.start(reduced ? 'projects' : phase);
      view.classList.add('cw-shown');
    }
    sequence.update(dt);
    room.update(dt);
    ascii.update(dt);
    updateOrbs(orbs, lines, t, dt);
    interaction.update(dt);
    updatePanels(panels, camera, dt);
    updateSound(dt, camera, orbs);

    showHint(sequence.intro && startIn <= 0 ? 'SPACE OR CLICK TO SKIP' : null, 'skip');
    showHint(!look.isLocked && !everLocked ? 'CLICK TO LOOK AROUND' : null, 'lock');

    // Screen shake on the canvas itself, so it doesn't fight mouse look.
    if (shake > 0.01 && settings.shake) {
      shake *= Math.pow(0.03, dt);
      const s = shake * 24;
      view.style.transform = `translate(${(Math.random() - 0.5) * s}px, ${(Math.random() - 0.5) * s}px)`;
    } else if (view.style.transform) {
      view.style.transform = '';
    }

    renderer.render(scene, camera);
    ascii.render(camera);
  });

  // Handy for debugging in the browser console.
  window.chairWorld = { scene, camera, renderer, sequence, player, orbs, panels, room, look, interaction };
}

// Stop everything and free it: loop, listeners, sound, GPU memory, DOM.
export function leaveWorld() {
  if (!world) return;
  const w = world;
  world = null;
  w.renderer.setAnimationLoop(null);
  w.abort.abort();
  w.watcher.disconnect();
  stopSound();
  w.ascii.dispose();
  w.room.collapse.dispose();
  const extra = [w.island.sky, ...w.panels.flatMap((p) => [p.screen, ...p.pageTextures])];
  disposeScene(w.scene, extra);
  w.renderer.dispose();
  w.renderer.forceContextLoss();
  document.body.classList.remove('cw-intro', 'cw-reading', 'cw-no-hud');
  w.root.replaceChildren();
  delete window.chairWorld;
}

function disposeScene(scene, extra) {
  const textures = new Set(extra);
  scene.traverse((o) => {
    o.geometry?.dispose();
    for (const m of [o.material].flat()) {
      if (!m) continue;
      for (const value of Object.values(m)) if (value?.isTexture) textures.add(value);
      m.dispose();
    }
  });
  for (const t of textures) t.dispose();
}
