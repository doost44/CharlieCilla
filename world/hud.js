// The world's DOM: two canvases, the HUD, the pause screen and the options menu,
// all in the site's own look (white paper, IBM Plex, small mono labels). Everything
// is built inside #world-root on launch and removed on leaving. Ids start with cw-
// (chair world) so they never clash with the site's own.

const HELP = 'mouse look · click links · e stand / sit · w a s d walk · o options · esc pause';

const TEMPLATE = `
<canvas id="cw-view"></canvas>
<canvas id="cw-ascii"></canvas>
<div id="cw-hud">
  <div id="cw-title"><span class="cw-name">charlie cilla</span><span id="cw-subtitle" class="cw-label"></span></div>
  <div id="cw-crosshair"></div>
  <div id="cw-target" class="cw-label cw-hidden"></div>
  <div id="cw-hint" class="cw-label cw-hidden"></div>
  <div id="cw-help" class="cw-label">${HELP}</div>
  <div id="cw-error" class="cw-label cw-hidden"></div>
</div>
<button id="cw-back" class="cw-link" type="button">&larr; back to site</button>

<div id="cw-overlay" class="cw-hidden">
  <div class="cw-card">
    <p class="cw-label">selected works</p>
    <h1>charlie cilla</h1>
    <div class="cw-row">
      <button id="cw-resume" class="cw-link" type="button">resume</button>
      <button id="cw-options-button" class="cw-link" type="button">options</button>
      <button id="cw-leave" class="cw-link" type="button">back to site</button>
    </div>
    <p class="cw-label cw-small">${HELP}</p>
  </div>
</div>

<div id="cw-options" class="cw-hidden">
  <div class="cw-card">
    <p class="cw-label">options</p>
    <label>field of view <span id="cw-opt-fov-val"></span>
      <input id="cw-opt-fov" type="range" min="60" max="110" step="1">
    </label>
    <label>mouse sensitivity <span id="cw-opt-sens-val"></span>
      <input id="cw-opt-sens" type="range" min="0.2" max="3" step="0.1">
    </label>
    <label>pixel size
      <select id="cw-opt-pixel"></select>
    </label>
    <label>volume <span id="cw-opt-vol-val"></span>
      <input id="cw-opt-vol" type="range" min="0" max="1" step="0.05">
    </label>
    <label>music (synths, drone, bass-line wind) <span id="cw-opt-music-val"></span>
      <input id="cw-opt-music" type="range" min="0" max="1" step="0.05">
    </label>
    <label class="cw-check"><input id="cw-opt-mute" type="checkbox"> mute</label>
    <label class="cw-check"><input id="cw-opt-hud" type="checkbox"> show hud</label>
    <label class="cw-check"><input id="cw-opt-shake" type="checkbox"> screen shake</label>
    <label class="cw-check"><input id="cw-opt-bob" type="checkbox"> head bob when walking</label>
    <div class="cw-row">
      <button id="cw-opt-full" class="cw-link" type="button"></button>
      <button id="cw-opt-reset" class="cw-link" type="button">reset</button>
      <button id="cw-opt-close" class="cw-link" type="button">back</button>
    </div>
    <p class="cw-label cw-small">o or esc closes this menu</p>
  </div>
</div>
<div id="cw-white"></div>`;

const $ = (id) => document.getElementById('cw-' + id);
let hints = {};

export function mountHud(root) {
  root.innerHTML = TEMPLATE;
  hints = {};
}

export function setSubtitle(text) {
  $('subtitle').textContent = text;
}

// What the crosshair is on (a link's action), or null.
export function showTarget(text) {
  const el = $('target');
  el.classList.toggle('cw-hidden', !text);
  if (text) el.textContent = text;
}

// Small prompt in the lower right. Several things can ask for it, so each has its
// own slot and the first one with something to say wins.
export function showHint(text, slot = 'main') {
  hints[slot] = text;
  const shown = Object.values(hints).find(Boolean);
  const el = $('hint');
  el.classList.toggle('cw-hidden', !shown);
  if (shown) el.textContent = shown;
}

// The crosshair: a small dot, or a ring while it is over something clickable.
export function setCrosshair(mode) {
  $('crosshair').classList.toggle('cw-ring', mode === 'ring');
}

export function showError(msg) {
  const el = $('error');
  el.textContent = msg;
  el.classList.remove('cw-hidden');
}
