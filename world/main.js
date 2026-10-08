import THREE from './three.js';
import { config } from './config.js';
import { mountHud, setSubtitle, showHint } from './hud.js';
import { createLook } from './mouse.js';
import { createOptions, settings } from './options.js';
import { startSound, stopSound, resumeSound, pauseSound, updateSound, setStations, sfx } from './sound.js';
import { buildWarehouse } from './warehouse.js';
import { buildChair, seatPose } from './chair.js';
import { buildRoom } from './room.js';
import { createAscii } from './ascii.js';
import { createReveal } from './reveal.js';
import { createPlayer } from './player.js';
import { buildStations } from './stations.js';
import { createInteraction } from './interaction.js';
import { createSequence } from './sequence.js';

// The chair world: built inside #world-root when the visitor presses E at the
// home page's ASCII chair (see entry.js), and torn down completely on the way back.

let world = null;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// After the next paint: lets the load screen's swirl draw a frame between heavy builds.
const breathe = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)));
const ROOM_AMBIENT = 0.3; // the only other light in the room is its swag lamp
const ZOOM = 2.5; // Z narrows the view this many times (and slows the mouse to match)

// home: the page's ASCII chair hook (window.asciiChair). audio: an AudioContext made
// inside the E key press. phase: where to start (?phase= for testing). portal: the
// load screen's swirl (portal.js), if one is running; the world's own swirl takes over
// from it. onLeft: called once the world is gone and the page should show again.
export async function launchWorld({ root, home, audio, phase = 'sit', portal, onLeft }) {
  if (world) return;
  await portal?.seated; // building stutters the main thread: not while the chair glides and grows
  await Promise.all([ // the canvases draw text in the site's fonts
    document.fonts.load(`500 16px ${config.font}`),
    document.fonts.load(`600 16px ${config.serif}`),
    document.fonts.load(`italic 16px ${config.serif}`),
  ]);
  const abort = new AbortController();
  const { signal } = abort;
  const on = (target, type, fn, opts = {}) => target.addEventListener(type, fn, { ...opts, signal });
  const $ = (id) => document.getElementById('cw-' + id);

  mountHud(root);
  document.body.classList.add('cw-intro');
  const view = $('view');
  const renderer = new THREE.WebGLRenderer({ canvas: view, antialias: true });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(settings.fov, innerWidth / innerHeight, 0.05, 400);
  const ambient = new THREE.AmbientLight(0xfff0dd, ROOM_AMBIENT);
  scene.add(ambient);

  await breathe();
  const hall = buildWarehouse(scene);
  await breathe();
  const room = buildRoom(scene);
  const reveal = createReveal(room); // the room is invisible (but hides glyphs) until it builds out
  room.lamp.setLevel(0);
  const chair = buildChair(home, room.focus); // facing the lamp corner
  scene.add(chair);
  const seat = seatPose(chair, room.focus);
  await breathe();
  const ascii = createAscii({ canvas: $('ascii'), room, chair, eye: seat.pos });
  const look = createLook(camera, root, signal);
  const player = createPlayer({ camera, look, signal, chair, seat });
  await breathe();
  const stations = buildStations(scene, { bounds: hall.bounds, avoid: hall.colliders, start: room.focus }); // station 0 the way the chair faces
  player.setWorld({ bounds: hall.bounds, colliders: [...hall.colliders, ...stations.colliders] });
  setSubtitle(`selected works · ${stations.stations.length} projects`);
  startSound(audio);
  setStations(stations.stations.map((s) => s.lampPosition));

  const interaction = createInteraction({
    camera, look, signal, stations,
    onExpand: openWork,
    onTick: (i) => sfx.cardTick(i),
  });
  // Z toggles a zoomed-in view; the field of view eases between the two (see updateZoom).
  // Options re-apply the plain field of view, so the zoom is applied again after them.
  let zoom = 0, zoomTo = 0, zoomStale = false;
  const options = createOptions({
    renderer, camera, look, signal,
    onApply: () => { zoomStale = true; },
    onOpen: () => showOverlay(false),
    onClose: () => showOverlay(!look.isLocked),
  });

  // --- Pause screen, pointer lock, leaving -------------------------------------
  const state = { modal: false, hall: false }; // modal: the site's project view is open over the world
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
    if (!options.isOpen && !state.modal && !leaving) showOverlay(true);
  };
  on($('resume'), 'click', resume);
  on($('options-button'), 'click', () => options.open());
  on($('leave'), 'click', leave);
  on($('back'), 'click', leave);
  // Clicking the world itself (not a button) takes the mouse, or skips the intro.
  on(root, 'mousedown', (e) => {
    if (e.button !== 0 || e.target.closest('button, #cw-options, #cw-overlay .cw-card')) return;
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
    if (e.code === 'Space' && sequence.intro) sequence.skip();
    if (e.code === 'KeyZ' && !options.isOpen) zoomTo = 1 - zoomTo;
  });

  // "expand" on a project opens the site's own project view over the world; closing it comes back here.
  const modal = document.getElementById('project-modal');
  function openWork(project) {
    state.modal = true;
    sfx.open();
    setTimeout(() => state.modal && pauseSound(), 400); // after the open sound; a film or another world may have its own
    look.unlock();
    window.openProject(project.id);
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
    portal?.stop(); // if it was still turning
    leaveWorld();
    onLeft?.();
  }

  on(window, 'resize', () => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    ascii.resize();
  });

  function updateZoom(dt) {
    if (zoom === zoomTo && !zoomStale) return;
    zoomStale = false;
    zoom += (zoomTo - zoom) * Math.min(1, dt * 8);
    if (Math.abs(zoomTo - zoom) < 0.002) zoom = zoomTo;
    const factor = THREE.MathUtils.lerp(1, ZOOM, zoom);
    camera.fov = settings.fov / factor;
    camera.updateProjectionMatrix();
    look.pointerSpeed = settings.sensitivity / factor;
  }

  // --- The intro ------------------------------------------------------------------
  let shake = 0;
  const toWall = new THREE.Vector3(), right = new THREE.Vector3();
  const revealTop = config.room.height + 1.7; // past the ceiling's bias, the noise and the edge band
  const sequence = createSequence({
    // In the chair from the first frame; the head stays turned to the room while it forms.
    sit: { // skipped (instant) after the load screen, which did the sitting down
      start(instant) {
        player.seat(seat, true);
        room.lamp.setLevel(0); // the bulb comes up as the room builds out
        if (!instant) sfx.creak();
      },
    },
    swirl: {
      start(instant) {
        ascii.show(true, portal ? 2 : 0); // most glyphs already out, as the load screen's swirl fades over them
        portal?.finish();
        if (!instant) sfx.riser(config.durations.swirl);
      },
    },
    form: {
      start: () => ascii.form(),
      finish: () => ascii.lockAll(),
    },
    // The room builds out of its glyphs from the floor up.
    texture: {
      update(t, k) {
        const h = THREE.MathUtils.lerp(-0.2, revealTop, k);
        reveal.set(h);
        ascii.setReveal(h);
        room.lamp.setLevel(THREE.MathUtils.smoothstep(h, -0.2, 1)); // warms up as the floor appears
      },
      finish() {
        reveal.finish();
        room.lamp.setLevel(1);
        ascii.show(false);
        player.freeLook();
        state.hall = true;
      },
    },
    collapse: {
      start(instant) {
        hall.reveal(true); // still hidden by the closed room; its light comes up as the walls fall
        stations.group.visible = true; // the station lamps hang dark until they flicker on
        room.collapse.start();
        if (!instant) sfx.lift();
      },
      update(t, k, dt) {
        ambient.intensity = ROOM_AMBIENT * (1 - k); // the room's warm fill gives way to the hall's light
        for (const name of room.collapse.update(t, dt)) {
          // Thud from the side the wall fell on.
          toWall.copy(room.walls[name].pivot.position).sub(camera.position).normalize();
          right.setFromMatrixColumn(camera.matrixWorld, 0);
          sfx.thud(toWall.dot(right));
          shake = Math.max(shake, 0.6);
        }
      },
      finish() {
        room.collapse.finish();
        ambient.intensity = 0;
      },
    },
    // Station lamps flicker on one by one along the path; then the visitor may stand up.
    projects: {
      start() {
        stations.startArrival((i) => sfx.lampOn(i));
        interaction.enabled = true;
        player.allowStanding(true);
        document.body.classList.remove('cw-intro');
      },
      finish: () => stations.finishArrival(),
    },
  });

  world = { root, renderer, scene, abort, watcher, ascii, reveal, room, hall, stations };

  // Compile the hall's shaders (and the fogged versions of the rest) now, so the reveal doesn't stutter.
  await breathe();
  if (leaving) return; // back to the site while it was loading
  hall.reveal(true);
  renderer.compile(scene, camera);
  hall.reveal(false);
  await portal?.swirling;
  if (leaving) return;

  // Fade the page to white first (entry.js), then start, already in the chair. After
  // the load screen the page is long white and the visitor already sat down: go
  // straight to the swirl.
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let startIn = portal ? 0 : config.fade;
  let started = false;
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    if (state.modal) return; // the site's project view covers the world: nothing to draw
    if (!started && (startIn -= dt) <= 0) {
      started = true;
      sequence.start(reduced ? 'projects' : portal ? 'swirl' : phase);
      view.classList.add('cw-shown');
    }
    sequence.update(dt);
    room.update(dt);
    ascii.update(dt);
    hall.update(dt, camera);
    stations.update(dt, camera);
    player.update(dt);
    updateZoom(dt);
    interaction.update(dt);
    updateSound(dt, camera, { hall: state.hall });

    const intro = sequence.intro && started;
    showHint(intro ? 'space or click to skip' : null, 'skip');
    showHint(!intro && player.seated ? 'e or w a s d to stand' : player.canSit ? 'e to sit' : null, 'stand');
    showHint(!look.isLocked && !everLocked ? 'click to look around' : null, 'lock');

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
  window.chairWorld = { scene, camera, renderer, sequence, player, room, hall, stations, look, interaction, chair, ascii };
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
  w.reveal.dispose();
  w.room.collapse.dispose();
  w.hall.dispose();
  w.stations.dispose();
  disposeScene(w.scene);
  w.renderer.dispose();
  w.renderer.forceContextLoss();
  document.body.classList.remove('cw-intro', 'cw-no-hud');
  w.root.replaceChildren();
  delete window.chairWorld;
}

function disposeScene(scene) {
  const textures = new Set();
  if (scene.background?.isTexture) textures.add(scene.background);
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
