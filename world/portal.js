import { config } from './config.js';

// The load screen. On E the home page's ASCII chair glides to the middle of the
// screen and grows as the visitor sinks into it, then its own glyphs peel away into
// a swirl round them: the vortex the 3D world opens with (ascii.js), drawn flat on a
// canvas over the page. It keeps turning while the world loads; once the world's own
// swirl is running underneath, finish() fades it out.

const RAMP = " .`',:;-~+<>!ilI?*xnuvcz#XMW8%B$@";
const CENTER = 0.7; // seconds for the chair to glide to the middle
const SINK = 1; // seconds to sink into it
const PEEL = 1.6; // seconds for its glyphs to peel off into the swirl (from halfway through the sink)
const EACH = 0.8; // seconds each glyph takes to fly out; their starts are spread over the rest of PEEL
const FADE = 1.2; // seconds to fade out once the world has taken over (matches .cw-portal in world.css)
const COUNT = 9000; // glyphs in the swirl: the chair's own, topped up with new ones
const FOV = 70; // the world's default lens, so the two swirls line up
const EYE = 1.3; // eye height in the seat, above the vortex's floor

const smooth = (k) => k * k * (3 - 2 * k);
const clamp01 = (k) => Math.min(1, Math.max(0, k));
const lerp = (a, b, k) => a + (b - a) * k;
const rgb = (css) => (css.match(/\d+(\.\d+)?/g) || [0, 0, 0]).slice(0, 3).map(Number);

export function startPortal(home) {
  const pre = home.domEl;
  const style = getComputedStyle(pre);
  const fontPx = parseFloat(style.fontSize) || 9;
  const lineH = parseFloat(style.lineHeight) || fontPx;
  const font = `500 ${fontPx}px ${config.font}`;
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = font;
  const charW = probe.measureText('0').width;

  // Every glyph of the chair, where it is on screen right now.
  const rect = pre.getBoundingClientRect();
  let chair = [];
  pre.textContent.split('\n').forEach((line, row) => {
    for (let col = 0; col < line.length; col++) {
      if (line[col] !== ' ') chair.push({ ch: line[col], x: rect.left + (col + 0.5) * charW, y: rect.top + (row + 0.5) * lineH });
    }
  });
  if (chair.length > COUNT) chair = chair.filter((_, i) => i % Math.ceil(chair.length / COUNT) === 0);
  const xs = chair.map((g) => g.x), ys = chair.map((g) => g.y);
  const cx0 = chair.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : rect.left + rect.width / 2;
  const cy0 = chair.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : rect.top + rect.height / 2;

  // Each glyph's place in the vortex, spread as in ascii.js: a ring 1.2–5 m round the
  // seat, rising and wrapping, nearer glyphs turning faster. New ones only fade in.
  const [rMin, rMax] = config.glyphs.swirlRadius;
  const swirlH = config.glyphs.swirlHeight;
  const glyphs = [...chair, ...Array.from({ length: COUNT - chair.length }, () => ({ extra: true }))];
  for (const g of glyphs) {
    g.r = rMin + (rMax - rMin) * Math.sqrt(Math.random());
    g.a = Math.random() * Math.PI * 2;
    g.w = (0.8 + Math.random() * 0.8) * (2.4 / g.r);
    g.rise = Math.random() * swirlH;
    g.climb = 0.25 + Math.random() * 0.5;
    g.seed = Math.random() * 97;
    g.delay = Math.random() * (PEEL - EACH);
  }

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
  let raf = requestAnimationFrame(draw);

  function draw(now) {
    raf = requestAnimationFrame(draw);
    const t = (now - t0) / 1000;
    const glide = smooth(clamp01(t / CENTER));
    const sink = clamp01((t - CENTER) / SINK) ** 2; // slow, then falling into the seat
    const spin = Math.max(0, t - CENTER - SINK / 2); // seconds since the peel began
    for (const m of marks) if (t >= m.seconds) m.resolve();

    const cx = lerp(cx0, vw / 2, glide), cy = lerp(cy0, vh / 2, glide);
    const zoom = 1 + 3 * sink;
    const f = vh / 2 / Math.tan((FOV * Math.PI) / 360); // focal length in px
    const tone = from.map((c, i) => Math.round(lerp(c, ink[i], glide)));

    g2.setTransform(1, 0, 0, 1, 0, 0);
    g2.clearRect(0, 0, canvas.width, canvas.height);
    g2.fillStyle = `rgb(${tone})`;
    g2.font = font;
    g2.textAlign = 'center';
    g2.textBaseline = 'middle';
    for (const g of glyphs) {
      const peel = spin > 0 ? smooth(clamp01((spin - g.delay) / EACH)) : 0;
      if (g.extra && peel === 0) continue;
      let x = cx + (g.x - cx0) * zoom, y = cy + (g.y - cy0) * zoom, scale = zoom, alpha = 1, ch = g.ch;
      if (peel > 0) {
        // Seen from the seat: angle 0 is straight ahead, glyphs behind fade out.
        const rise = (g.rise + g.climb * spin) % swirlH;
        const a = g.a + g.w * spin;
        const r = g.r * (0.7 + (0.3 * rise) / swirlH);
        const depth = r * Math.cos(a);
        const z = Math.max(depth, 0.3);
        const vx = vw / 2 + (f * r * Math.sin(a)) / z;
        const vy = vh / 2 - (f * (rise - 0.3 - EYE)) / z;
        const vAlpha = clamp01((depth - 0.3) / 0.5) * smooth(clamp01(rise / 0.4)) * smooth(clamp01((swirlH - rise) / 0.4));
        const vScale = (0.72 * f * config.glyphs.size) / z / fontPx; // as big as the 3D glyphs
        if (g.extra) {
          [x, y, scale, alpha] = [vx, vy, vScale, vAlpha * peel];
        } else {
          [x, y, scale, alpha] = [lerp(x, vx, peel), lerp(y, vy, peel), lerp(scale, vScale, peel), lerp(1, vAlpha, peel)];
        }
        if (g.extra || peel > 0.3) ch = RAMP[1 + (Math.floor(g.seed + t * 3) % (RAMP.length - 1))];
      }
      if (alpha < 0.02 || x < -60 || x > vw + 60 || y < -60 || y > vh + 60) continue;
      g2.globalAlpha = alpha;
      g2.setTransform(dpr * scale, 0, 0, dpr * scale, x * dpr, y * dpr);
      g2.fillText(ch, 0, 0);
    }
  }

  function stop() {
    cancelAnimationFrame(raf);
    removeEventListener('resize', resize);
    canvas.remove();
    pre.style.visibility = '';
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
