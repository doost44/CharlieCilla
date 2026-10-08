// Options menu (ported from Automation Map): O, or OPTIONS on the pause screen.
// Settings are remembered in this browser via localStorage.

const KEY = 'chair-world-options-v2';
const DEFAULTS = { fov: 70, sensitivity: 1, pixel: 1, hud: true, shake: true, bob: true, volume: 0.6, music: 0.7, mute: false };

// Other modules read this (e.g. sound.js checks settings.volume).
export const settings = { ...DEFAULTS };

const PIXEL_SIZES = [
  [0.25, 'chunky'],
  [0.5, 'retro'],
  [0.75, 'soft'],
  [1, 'sharp (default)'],
];

function load() {
  try {
    Object.assign(settings, JSON.parse(localStorage.getItem(KEY)) ?? {});
  } catch { /* storage blocked or bad JSON: keep defaults */ }
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}

export function createOptions({ renderer, camera, look, signal, onOpen, onClose, onApply }) {
  const $ = (id) => document.getElementById('cw-' + id);
  const menu = $('options');
  const ui = {
    fov: $('opt-fov'), fovVal: $('opt-fov-val'),
    sens: $('opt-sens'), sensVal: $('opt-sens-val'),
    pixel: $('opt-pixel'),
    hud: $('opt-hud'), shake: $('opt-shake'), bob: $('opt-bob'),
    full: $('opt-full'),
    vol: $('opt-vol'), volVal: $('opt-vol-val'), mute: $('opt-mute'),
    music: $('opt-music'), musicVal: $('opt-music-val'),
  };
  for (const [v, name] of PIXEL_SIZES) ui.pixel.add(new Option(name, v));
  const on = (el, type, fn) => el.addEventListener(type, fn, { signal });

  function apply() {
    camera.fov = settings.fov;
    camera.updateProjectionMatrix();
    look.pointerSpeed = settings.sensitivity;
    renderer.setPixelRatio(settings.pixel);
    renderer.setSize(innerWidth, innerHeight, false);
    document.body.classList.toggle('cw-no-hud', !settings.hud);

    ui.fov.value = settings.fov;
    ui.fovVal.textContent = settings.fov;
    ui.sens.value = settings.sensitivity;
    ui.sensVal.textContent = Number(settings.sensitivity).toFixed(1);
    ui.pixel.value = settings.pixel;
    ui.hud.checked = settings.hud;
    ui.shake.checked = settings.shake;
    ui.bob.checked = settings.bob;
    ui.vol.value = settings.volume;
    ui.volVal.textContent = Math.round(settings.volume * 100);
    ui.mute.checked = settings.mute;
    ui.music.value = settings.music;
    ui.musicVal.textContent = Math.round(settings.music * 100);
    ui.full.textContent = document.fullscreenElement ? 'exit fullscreen' : 'go fullscreen';
    save();
    onApply?.();
  }

  on(ui.fov, 'input', () => { settings.fov = Number(ui.fov.value); apply(); });
  on(ui.sens, 'input', () => { settings.sensitivity = Number(ui.sens.value); apply(); });
  on(ui.pixel, 'change', () => { settings.pixel = Number(ui.pixel.value); apply(); });
  on(ui.hud, 'change', () => { settings.hud = ui.hud.checked; apply(); });
  on(ui.shake, 'change', () => { settings.shake = ui.shake.checked; apply(); });
  on(ui.bob, 'change', () => { settings.bob = ui.bob.checked; apply(); });
  on(ui.vol, 'input', () => { settings.volume = Number(ui.vol.value); apply(); });
  on(ui.mute, 'change', () => { settings.mute = ui.mute.checked; apply(); });
  on(ui.music, 'input', () => { settings.music = Number(ui.music.value); apply(); });
  on($('opt-reset'), 'click', () => { Object.assign(settings, DEFAULTS); apply(); });

  // Fullscreen. Keyboard Lock takes Esc over while fullscreen, so a tap only frees
  // the mouse (holding Esc still leaves fullscreen). Browsers without it get put back
  // into fullscreen when you click to resume.
  const canLockEsc = !!navigator.keyboard?.lock;
  let wantFull = false;
  function goFullscreen() {
    return document.documentElement.requestFullscreen?.()
      .then(() => navigator.keyboard?.lock?.(['Escape']))
      .catch(() => {});
  }
  on(ui.full, 'click', () => {
    wantFull = !document.fullscreenElement;
    if (wantFull) goFullscreen();
    else document.exitFullscreen();
  });
  on(document, 'fullscreenchange', () => {
    if (!document.fullscreenElement) navigator.keyboard?.unlock?.();
    apply();
  });

  const options = {
    isOpen: false,
    restoreFullscreen() {
      if (wantFull && !canLockEsc && !document.fullscreenElement) goFullscreen();
    },
    open() {
      options.isOpen = true;
      menu.classList.remove('cw-hidden');
      onOpen?.();
      look.unlock();
    },
    close() {
      options.isOpen = false;
      menu.classList.add('cw-hidden');
      onClose?.();
    },
    apply,
  };
  on($('opt-close'), 'click', options.close);

  load();
  apply();
  return options;
}
