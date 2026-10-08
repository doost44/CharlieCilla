import { config } from './config.js';
import { settings } from './options.js';

// The load screen. On E the home page's ASCII chair glides to the middle of the
// screen, spinning faster and faster, and grows as the visitor sinks into it; then,
// still turning, it sheds its glyphs into a swirl round them: the vortex the 3D world
// opens with (ascii.js), drawn flat on a canvas over the page. The chair is the page's
// own live ASCII render, sped up with asciiChair.setSpin and read from its text every
// frame. The swirl keeps turning while the world loads; once the world's own swirl is
// running underneath, finish() fades it out.

const RAMP = " .`',:;-~+<>!ilI?*xnuvcz#XMW8%B$@";
const CENTER = 0.7; // seconds for the chair to glide to the middle
const SINK = 1; // seconds to sink into it
const PEEL = 1.6; // seconds for the chair to shed its glyphs (from halfway through the sink)
const EACH = 0.8; // seconds each glyph takes to fly out; their starts are spread over the rest of PEEL
const FADE = 1.2; // seconds to fade out once the world has taken over (matches .cw-portal in world.css)
const EXTRA = 5500; // new glyphs that fade into the swirl alongside the chair's own
const SPIN = 0.16; // the chair's extra turn per frame (radians) by the time the visitor sits
const EYE = 1.3; // eye height in the seat, above the vortex's floor

const smooth = (k) => k * k * (3 - 2 * k);
const clamp01 = (k) => Math.min(1, Math.max(0, k));
const lerp = (a, b, k) => a + (b - a) * k;
const rgb = (css) => (css.match(/\d+(\.\d+)?/g) || [0, 0, 0]).slice(0, 3).map(Number);
const hash = (a, b) => { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); };

export function startPortal(home) {
  const pre = home.domEl;
  const style = getComputedStyle(pre);
  const fontPx = parseFloat(style.fontSize) || 9;
  const lineH = parseFloat(style.lineHeight) || fontPx;
  const font = `500 ${fontPx}px ${config.font}`;
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = font;
  const charW = probe.measureText('0').width;

  // Where each cell of the chair's text sits on the page (it is hidden, not moved), and
  // the middle of its ink when E was pressed.
  const rect = pre.getBoundingClientRect();
  const cellX = (col) => rect.left + (col + 0.5) * charW, cellY = (row) => rect.top + (row + 0.5) * lineH;
  const box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  pre.textContent.split('\n').forEach((line, row) => {
    for (let col = 0; col < line.length; col++) {
      if (line[col] === ' ') continue;
      box.x0 = Math.min(box.x0, cellX(col)); box.x1 = Math.max(box.x1, cellX(col));
      box.y0 = Math.min(box.y0, cellY(row)); box.y1 = Math.max(box.y1, cellY(row));
    }
  });
  const cx0 = box.x0 < Infinity ? (box.x0 + box.x1) / 2 : rect.left + rect.width / 2;
  const cy0 = box.y0 < Infinity ? (box.y0 + box.y1) / 2 : rect.top + rect.height / 2;
  // When each cell sheds whatever glyph the spinning chair has there: scattered over PEEL - EACH.
  const shedAt = (row, col) => hash(row, col) * (PEEL - EACH);

  // A glyph's place in the vortex, spread as in ascii.js: a ring 1.2–5 m round the
  // seat, rising and wrapping, nearer glyphs turning faster.
  const [rMin, rMax] = config.glyphs.swirlRadius;
  const swirlH = config.glyphs.swirlHeight;
  const toVortex = (g, born) => {
    const r = rMin + (rMax - rMin) * Math.sqrt(Math.random());
    return Object.assign(g, {
      born, r, a: Math.random() * Math.PI * 2, w: (0.8 + Math.random() * 0.8) * (2.4 / r),
      rise: Math.random() * swirlH, climb: 0.25 + Math.random() * 0.5, seed: Math.random() * 97,
    });
  };
  const shed = []; // the chair's glyphs, on their way into the swirl
  const extras = Array.from({ length: EXTRA }, () => toVortex({}, Math.random() * (PEEL - EACH)));

  const from = rgb(style.color), ink = [16, 8, 0].map((shift) => (config.glyphs.ink >> shift) & 255);
  const canvas = document.createElement('canvas');
  canvas.className = 'cw-portal';
  document.body.appendChild(canvas);
  const g2 = canvas.getContext('2d');
  pre.style.visibility = 'hidden'; // its glyphs are on the portal now

  let vw, vh, dpr;
  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    vw = innerWidth;
    vh = innerHeight;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
  }
  resize();
  addEventListener('resize', resize);

  const marks = []; // promises that resolve at a time in the timeline
  const when = (seconds) => new Promise((resolve) => marks.push({ seconds, resolve }));
  const seated = when(CENTER + SINK);
  const swirling = when(CENTER + SINK / 2 + PEEL);
  const t0 = performance.now();
  let live = true; // the page's chair is still being drawn (and spun)
  let last = -Infinity; // seconds into the shedding, last frame
  let raf = requestAnimationFrame(draw);

  function draw(now) {
    raf = requestAnimationFrame(draw);
    const t = (now - t0) / 1000;
    const glide = smooth(clamp01(t / CENTER));
    const sink = clamp01((t - CENTER) / SINK) ** 2; // slow, then falling into the seat
    const shedding = t - CENTER - SINK / 2; // seconds since the chair began to shed
    for (const m of marks) if (t >= m.seconds) m.resolve();

    const cx = lerp(cx0, vw / 2, glide), cy = lerp(cy0, vh / 2, glide);
    const zoom = 1 + 3 * sink;
    const f = vh / 2 / Math.tan((settings.fov * Math.PI) / 360); // the world's lens, in px
    const spin = Math.max(0, shedding);
    const tone = from.map((c, i) => Math.round(lerp(c, ink[i], glide)));

    g2.setTransform(1, 0, 0, 1, 0, 0);
    g2.clearRect(0, 0, canvas.width, canvas.height);
    g2.fillStyle = `rgb(${tone})`;
    g2.font = font;
    g2.textAlign = 'center';
    g2.textBaseline = 'middle';
    const put = (ch, x, y, scale, alpha) => {
      if (alpha < 0.02 || x < -60 || x > vw + 60 || y < -60 || y > vh + 60) return;
      g2.globalAlpha = alpha;
      g2.setTransform(dpr * scale, 0, 0, dpr * scale, x * dpr, y * dpr);
      g2.fillText(ch, 0, 0);
    };

    // The chair as the page draws it right now, turning faster as the visitor sits.
    // A cell whose time has come stops being drawn here; if the chair has a glyph in
    // it at that moment, the glyph flies off into the swirl.
    if (live) {
      home.setSpin?.(SPIN * smooth(clamp01(t / (CENTER + SINK))));
      pre.textContent.split('\n').forEach((line, row) => {
        for (let col = 0; col < line.length; col++) {
          const ch = line[col];
          if (ch === ' ') continue;
          const at = shedAt(row, col);
          if (shedding < at) put(ch, cx + (cellX(col) - cx0) * zoom, cy + (cellY(row) - cy0) * zoom, zoom, 1);
          else if (last < at) shed.push(toVortex({ ch, x: cellX(col), y: cellY(row) }, at));
        }
      });
      if (shedding >= PEEL - EACH) {
        live = false;
        home.setSpin?.(0);
        home.setPaused(true); // nothing left of it to draw
      }
    }
    last = shedding;

    // Glyphs in the vortex, seen from the seat: angle 0 is straight ahead, glyphs
    // behind the visitor fade out. A shed glyph flies there from its place in the chair.
    for (const g of shed.concat(extras)) {
      const k = smooth(clamp01((shedding - g.born) / EACH));
      if (k === 0) continue;
      const rise = (g.rise + g.climb * spin) % swirlH;
      const a = g.a + g.w * spin;
      const r = g.r * (0.7 + (0.3 * rise) / swirlH);
      const depth = r * Math.cos(a);
      const z = Math.max(depth, 0.3);
      const x = vw / 2 + (f * r * Math.sin(a)) / z;
      const y = vh / 2 - (f * (rise - 0.3 - EYE)) / z;
      const alpha = clamp01((depth - 0.3) / 0.5) * smooth(clamp01(rise / 0.4)) * smooth(clamp01((swirlH - rise) / 0.4));
      const scale = (0.72 * f * config.glyphs.size) / z / fontPx; // as big as the 3D glyphs
      const ch = !g.ch || k > 0.3 ? RAMP[1 + (Math.floor(g.seed + t * 3) % (RAMP.length - 1))] : g.ch;
      if (!g.ch) put(ch, x, y, scale, alpha * k);
      else put(ch, lerp(cx + (g.x - cx0) * zoom, x, k), lerp(cy + (g.y - cy0) * zoom, y, k), lerp(zoom, scale, k), lerp(1, alpha, k));
    }
  }

  function stop() {
    cancelAnimationFrame(raf);
    removeEventListener('resize', resize);
    canvas.remove();
    pre.style.visibility = '';
    home.setSpin?.(0);
  }

  return {
    seated, // resolves once the visitor has sunk into the chair
    swirling, // resolves once every glyph is in the swirl
    // The world's swirl has started underneath: fade out over it.
    finish() {
      canvas.classList.add('cw-gone');
      setTimeout(stop, FADE * 1000);
    },
    stop,
  };
}
