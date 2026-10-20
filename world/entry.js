// Home-page glue for the chair world. At first the page is just the page. Once the
// visitor has looked round it (hovered a project, a link or the chair), "click E for
// more" appears in a box inside the ASCII chair, drawn in its own glyphs; from then on,
// whenever the pointer is on something clickable, ASCII arrows round the page point at
// it (arrows.js). E, or a click on the box, sits
// them in the chair; clicking the chair still selects it too. Everything heavy (main.js
// and the rest of world/) only loads on that first E, so the home page stays light.
// Phones, tablets, narrow windows and browsers without WebGL keep the chair as it
// always was: decorative, with no prompt.

import { startPortal } from './portal.js';
import { createArrows } from './arrows.js';

const MIN_WIDTH = 900;
const LOADING_DELAY = 300; // ms before a "loading…" line shows (only without the swirl)
const LOOK_ROUND = 1500; // ms on the page before hovering things brings the prompt
const LABEL = ['+--------------------+', '|  click E for more  |', '+--------------------+'];
const SEEN = 'chair-world-prompted'; // sessionStorage: prompted already this visit
const CLICKABLE = 'a, button, .entry, [role="button"], input, select, textarea';

const root = document.getElementById('world-root');
let home = null; // window.asciiChair, set once the page's three.js chair is running
let arrows = null;
let selected = false;
let prompted = false;
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
  if (on) showPrompt();
}

// The prompt: the box in the chair (the arrows point at it while something clickable is hovered).
function showPrompt() {
  if (inWorld || !supported()) return;
  if (!prompted) {
    prompted = true;
    try { sessionStorage.setItem(SEEN, '1'); } catch { /* storage blocked: fine */ }
    home.domEl.setAttribute('aria-label', 'Sit in the chair to explore projects: press E');
  }
  home.setLabel(LABEL);
}

function hidePrompt() {
  home.setLabel(null);
  arrows.hide();
}

function pointAt(on) {
  if (on && prompted && !inWorld) arrows.show();
  else arrows.hide();
}

const inside = (r, e) => r && e.clientX >= r.left && e.clientX <= r.left + r.width && e.clientY >= r.top && e.clientY <= r.top + r.height;

async function launch(phase) {
  if (inWorld) return;
  inWorld = true;
  // The load screen is the chair itself, swirling (not when testing a ?phase=, nor with reduced motion).
  const still = phase || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const portal = still ? null : startPortal(home);
  if (!portal) home.setPaused(true); // hidden behind the world: save the work (the load screen still draws it, then pauses it)
  select(false);
  hidePrompt();
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
    if (prompted) showPrompt();
  }, 500);
}

function init() {
  home = window.asciiChair;
  if (!home || !supported()) return;
  arrows = createArrows(home);
  const el = home.domEl;
  el.tabIndex = 0;
  el.setAttribute('role', 'button');
  el.removeAttribute('aria-hidden');
  el.setAttribute('aria-label', 'Sit in the chair to explore projects (select it, then press E)');

  // Looking round the page (hovering anything that can be clicked, after a moment) brings
  // the prompt; straight away if it came up earlier this visit.
  const lookRound = performance.now() + LOOK_ROUND;
  document.addEventListener('pointerover', (e) => {
    if (e.target === el) return; // the chair: only its ink and the box count (mousemove below)
    const clickable = !!e.target.closest?.(CLICKABLE);
    if (clickable && !prompted && performance.now() >= lookRound) showPrompt();
    pointAt(clickable);
  });
  document.addEventListener('pointerout', (e) => !e.relatedTarget && pointAt(false)); // off the window
  try { if (sessionStorage.getItem(SEEN) === '1') showPrompt(); } catch { /* storage blocked: wait for a hover */ }

  // Hover cursor where there is ink or the prompt's box; hovering the chair counts as looking round too.
  el.addEventListener('mousemove', (e) => {
    const onChair = home.hitTest(e.clientX, e.clientY), onBox = prompted && inside(home.labelRect(), e);
    el.style.cursor = supported() && (onChair || onBox) ? 'pointer' : '';
    if (onChair && !prompted && performance.now() >= lookRound) showPrompt();
    pointAt(onChair || onBox);
  });
  // A click on the prompt's box goes straight in; on the chair it selects it; anywhere else deselects.
  document.addEventListener('click', (e) => {
    if (inWorld) return;
    if (prompted && e.target === el && inside(home.labelRect(), e)) return launch();
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
    const busy = document.body.classList.contains('modal-open'); // a project is open over the page
    if (e.code === 'KeyE' && (selected || prompted) && !typing && !busy && !e.ctrlKey && !e.metaKey && !e.altKey) launch();
  });
  addEventListener('resize', () => {
    if (!supported()) hidePrompt();
    else if (prompted && !inWorld) showPrompt();
  });
  addEventListener('blur', () => selected && select(false));
  document.addEventListener('visibilitychange', () => document.hidden && selected && select(false));

  // ?phase=swirl|form|texture|collapse|projects jumps straight to that part of the intro.
  const phase = new URLSearchParams(location.search).get('phase');
  if (phase) launch(phase);
}

if (window.asciiChair) init();
else addEventListener('asciichairready', init, { once: true });
