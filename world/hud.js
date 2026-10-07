// The world's DOM: two canvases, the amber HUD, the pause screen and the options
// menu. Everything is built inside #world-root on launch and removed on leaving.
// Ids start with cw- (chair world) so they never clash with the site's own.

const HELP = 'MOUSE LOOK · CLICK GRAB · WHEEL PULL · F READ · ENTER OPEN · R RESET ORBITS · O OPTIONS · ESC PAUSE';

const TEMPLATE = `
<canvas id="cw-view"></canvas>
<canvas id="cw-ascii"></canvas>
<div id="cw-hud">
  <div id="cw-title" class="cw-box">CHARLIE CILLA<span id="cw-subtitle"></span></div>
  <div id="cw-reader"></div>
  <div id="cw-crosshair">+</div>
  <div id="cw-target" class="cw-box cw-hidden"></div>
  <div id="cw-hint" class="cw-box cw-hidden"></div>
  <div id="cw-help" class="cw-box">${HELP}</div>
  <div id="cw-error" class="cw-box cw-hidden"></div>
</div>
<button id="cw-back" class="cw-btn" type="button">&times; BACK TO SITE</button>

<div id="cw-overlay" class="cw-hidden">
  <div class="cw-box">
    <h1>CHARLIE CILLA</h1>
    <p>SELECTED WORKS</p>
    <div class="cw-row">
      <button id="cw-resume" class="cw-btn" type="button">RESUME</button>
      <button id="cw-options-button" class="cw-btn" type="button">OPTIONS</button>
      <button id="cw-leave" class="cw-btn" type="button">BACK TO SITE</button>
    </div>
    <p class="cw-small">${HELP}</p>
  </div>
</div>

<div id="cw-options" class="cw-hidden">
  <div class="cw-box">
    <h2>OPTIONS</h2>
    <label>FIELD OF VIEW <span id="cw-opt-fov-val"></span>
      <input id="cw-opt-fov" type="range" min="60" max="110" step="1">
    </label>
    <label>MOUSE SENSITIVITY <span id="cw-opt-sens-val"></span>
      <input id="cw-opt-sens" type="range" min="0.2" max="3" step="0.1">
    </label>
    <label>PIXEL SIZE
      <select id="cw-opt-pixel"></select>
    </label>
    <label>VOLUME <span id="cw-opt-vol-val"></span>
      <input id="cw-opt-vol" type="range" min="0" max="1" step="0.05">
    </label>
    <label>MUSIC (BASS-LINE WIND) <span id="cw-opt-music-val"></span>
      <input id="cw-opt-music" type="range" min="0" max="1" step="0.05">
    </label>
    <label class="cw-check"><input id="cw-opt-mute" type="checkbox"> MUTE</label>
    <label class="cw-check"><input id="cw-opt-hud" type="checkbox"> SHOW HUD</label>
    <label class="cw-check"><input id="cw-opt-shake" type="checkbox"> SCREEN SHAKE</label>
    <div class="cw-row">
      <button id="cw-opt-orbs" class="cw-btn" type="button">RESET ORBITS</button>
      <button id="cw-opt-full" class="cw-btn" type="button"></button>
      <button id="cw-opt-reset" class="cw-btn" type="button">RESET</button>
      <button id="cw-opt-close" class="cw-btn" type="button">BACK</button>
    </div>
    <p class="cw-small">O or ESC closes this menu</p>
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

export function showTarget(orb, held) {
  const el = $('target');
  if (!orb) {
    document.body.classList.remove('cw-reading');
    return el.classList.add('cw-hidden');
  }
  el.classList.remove('cw-hidden');
  document.body.classList.toggle('cw-reading', !!orb.reading);
  const name = orb.project.title;
  const pages = orb.panel?.pages.length ?? 1;
  if (orb.reading) {
    const turn = pages > 1 ? ` · PAGE ${orb.page + 1}/${pages} ← →` : '';
    el.textContent = `READING: ${name}${turn} · F BACK · ENTER OPEN`;
  } else if (held) {
    el.textContent = `HOLDING: ${name} · WHEEL PULL · F READ · ENTER OPEN · CLICK RELEASE`;
  } else {
    el.textContent = `${name} · ENTER OPEN`;
  }
}

// The panel being read, as a sharp 2D copy over the 3D view (null hides it).
export function showReader(panelCanvas) {
  const el = $('reader');
  if (panelCanvas && el.firstChild !== panelCanvas) el.replaceChildren(panelCanvas);
  el.classList.toggle('cw-on', !!panelCanvas);
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

export function showError(msg) {
  const el = $('error');
  el.textContent = msg;
  el.classList.remove('cw-hidden');
}
