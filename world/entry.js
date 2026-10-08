// Home-page glue for the chair world. Click the ASCII chair to select it ("click E
// for more" appears under it), then E to sit in it. Everything heavy (main.js and
// the rest of world/) only loads on that first E, so the home page stays light.
// Phones, tablets, narrow windows and browsers without WebGL keep the chair as it
// always was: decorative, with no hint.

import { startPortal } from './portal.js';

const MIN_WIDTH = 900;
const LOADING_DELAY = 300; // ms before a "loading…" line shows (only without the swirl)

const hint = document.getElementById('chair-hint');
const root = document.getElementById('world-root');
let home = null; // window.asciiChair, set once the page's three.js chair is running
let selected = false;
let inWorld = false;

const styles = document.createElement('link');
styles.rel = 'stylesheet';
styles.href = new URL('./world.css', import.meta.url).href;
document.head.appendChild(styles);

const supported = () =>
  matchMedia('(pointer: fine)').matches &&
  innerWidth >= MIN_WIDTH &&
  !matchMedia('(prefers-reduced-data: reduce)').matches;

function select(on) {
  if (on && !supported()) return;
  selected = on;
  home.setSelected(on);
  hint.hidden = !on;
  if (on) placeHint();
}

// Centred just under the chair: below the lowest of its bounding box's bottom corners
// as seen on screen (the nearest casters sit lower than the middle), inside the column.
function placeHint() {
  const THREE = home.THREE;
  const box = new THREE.Box3().setFromObject(home.mesh);
  const corners = [box.min.x, box.max.x].flatMap((x) => [box.min.z, box.max.z].map((z) => home.projectToScreen(new THREE.Vector3(x, box.min.y, z))));
  const x = corners.reduce((sum, p) => sum + p.x, 0) / 4;
  const y = Math.max(...corners.map((p) => p.y));
  const wrap = hint.parentElement.getBoundingClientRect();
  const half = hint.offsetWidth / 2;
  hint.style.left = Math.min(Math.max(x - wrap.left, half), wrap.width - half) + 'px';
  hint.style.top = Math.min(y - wrap.top + 6, wrap.height - hint.offsetHeight) + 'px';
}

async function launch(phase) {
  if (inWorld) return;
  inWorld = true;
  // The load screen is the chair itself, swirling (not when testing a ?phase=, nor with reduced motion).
  const still = phase || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const portal = still ? null : startPortal(home);
  home.setPaused(true); // the ASCII render is hidden behind the load screen and the world: save the work
  select(false);
  home.domEl.blur(); // or Space and Enter in the world would reach the chair's own key handler
  root.hidden = false;
  root.getBoundingClientRect(); // so the fade below transitions from transparent
  root.classList.add('cw-on');
  document.body.classList.add('world-open');
  // Both need a user gesture, so they happen here in the key press, not after loading.
  root.requestPointerLock?.()?.catch?.(() => {});
  const AC = window.AudioContext || window.webkitAudioContext;
  const audio = AC ? new AC() : null;

  const loading = portal ? 0 : setTimeout(() => root.classList.add('cw-loading'), LOADING_DELAY);
  try {
    const world = await import('./main.js');
    clearTimeout(loading);
    root.classList.remove('cw-loading');
    await world.launchWorld({ root, home, audio, phase, portal, onLeft: backToSite });
  } catch (err) {
    clearTimeout(loading);
    portal?.stop();
    console.error('Chair world failed to start:', err);
    audio?.close?.();
    document.exitPointerLock?.();
    backToSite();
  }
}

// The world is gone (the screen is white): fade the page back in.
function backToSite() {
  home.setPaused(false);
  root.classList.remove('cw-loading');
  root.classList.add('cw-white');
  root.classList.remove('cw-on');
  document.body.classList.remove('world-open');
  setTimeout(() => {
    root.hidden = true;
    root.classList.remove('cw-white');
    root.replaceChildren();
    inWorld = false;
  }, 500);
}

function init() {
  home = window.asciiChair;
  if (!home || !supported()) return;
  const el = home.domEl;
  el.tabIndex = 0;
  el.setAttribute('role', 'button');
  el.removeAttribute('aria-hidden');
  el.setAttribute('aria-label', 'Sit in the chair to explore projects (press E once selected)');

  // Hover cursor where there is ink; a click on the chair selects it, anywhere else deselects.
  el.addEventListener('mousemove', (e) => {
    el.style.cursor = supported() && home.hitTest(e.clientX, e.clientY) ? 'pointer' : '';
  });
  document.addEventListener('click', (e) => {
    if (inWorld) return;
    select(e.target === el && home.hitTest(e.clientX, e.clientY));
  });
  el.addEventListener('keydown', (e) => {
    if (!inWorld && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      select(true);
    }
  });
  addEventListener('keydown', (e) => {
    if (inWorld) return;
    if (e.key === 'Escape') select(false);
    const typing = e.target.closest?.('input, textarea, select, [contenteditable]');
    if (e.code === 'KeyE' && selected && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) launch();
  });
  addEventListener('resize', () => selected && placeHint());
  addEventListener('blur', () => selected && select(false));
  document.addEventListener('visibilitychange', () => document.hidden && selected && select(false));

  // ?phase=swirl|form|texture|collapse|projects jumps straight to that part of the intro.
  const phase = new URLSearchParams(location.search).get('phase');
  if (phase) launch(phase);
}

if (window.asciiChair) init();
else addEventListener('asciichairready', init, { once: true });
