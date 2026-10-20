// Floating ASCII arrows round the home page's chair and across the page, all pointing at
// the chair world's prompt in the chair (asciiChair.labelRect()) and drifting towards it
// and back. Any that would sit on the page's text or the chair's ink fade out, so the
// page stays readable. entry.js shows them once the visitor has looked round a little.

const ARROW = '--->';
const LENGTH = 27; // px, roughly: four 11px mono glyphs
// Spots to try across the page, as fractions of the window...
const PAGE = [[0.04, 0.07], [0.3, 0.06], [0.24, 0.32], [0.05, 0.62], [0.24, 0.7], [0.06, 0.92], [0.52, 0.86], [0.96, 0.45], [0.94, 0.9]];
// ...and round the chair: [angle from the prompt (radians, 0 = right, y down), px away].
const ROUND = [[Math.PI, 230], [Math.PI * 1.2, 240], [Math.PI * 0.8, 270], [Math.PI * 1.5, 170], [Math.PI * 0.5, 330], [0, 230]];
const NEAR = 110; // px: an arrow closer than this to the prompt is left out
const MARGIN = 8; // px kept clear round text and ink
const BOB = 7; // px it drifts towards the prompt and back
const RECHECK = 20; // frames between checks for text and ink under each arrow

export function createArrows(home) {
  const layer = document.createElement('div');
  layer.className = 'cw-arrows';
  layer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(layer);
  const spots = [...PAGE.map((p) => ({ page: p })), ...ROUND.map((r) => ({ round: r }))];
  const arrows = spots.map((spot, i) => {
    const el = document.createElement('span');
    el.className = 'cw-arrow';
    el.textContent = ARROW;
    layer.appendChild(el);
    return { el, spot, phase: i * 1.7, clear: false };
  });
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let raf = 0, frames = 0, words = null;
  const restale = () => { words = null; frames = 0; };
  addEventListener('scroll', restale, { passive: true });
  addEventListener('resize', restale);

  // Where the page's visible text is (client px), skipping the chair's own.
  function textRects() {
    const out = [], range = document.createRange();
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.data.trim() && !home.domEl.contains(n) && !layer.contains(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
    });
    for (let n; (n = walk.nextNode());) {
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) if (r.bottom > 0 && r.top < innerHeight) out.push(r);
    }
    return out;
  }
  // Nothing under the arrow's head, middle or tail (or within MARGIN of them).
  function isClear(x, y, angle) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    for (const back of [0, LENGTH / 2, LENGTH]) {
      const px = x - dx * back, py = y - dy * back;
      if (px < MARGIN || px > innerWidth - MARGIN || py < MARGIN || py > innerHeight - MARGIN) return false;
      if (words.some((r) => px > r.left - MARGIN && px < r.right + MARGIN && py > r.top - MARGIN && py < r.bottom + MARGIN)) return false;
      if (home.hitTest(px, py)) return false;
    }
    return true;
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const r = home.labelRect();
    layer.classList.toggle('cw-ready', !!r);
    if (!r) return;
    const check = frames++ % RECHECK === 0;
    if (check && !words) words = textRects();
    const tx = r.left + r.width / 2, ty = r.top + r.height / 2;
    for (const a of arrows) {
      let x, y;
      if (a.spot.page) [x, y] = [a.spot.page[0] * innerWidth, a.spot.page[1] * innerHeight];
      else [x, y] = [tx + Math.cos(a.spot.round[0]) * a.spot.round[1], ty + Math.sin(a.spot.round[0]) * a.spot.round[1]];
      const angle = Math.atan2(ty - y, tx - x);
      if (check) a.clear = Math.hypot(tx - x, ty - y) > NEAR && isClear(x, y, angle);
      a.el.classList.toggle('cw-off', !a.clear);
      // Its head at (x, y), drifting along the way it points.
      const bob = still ? 0 : BOB * Math.sin(now / 550 + a.phase);
      x += Math.cos(angle) * bob;
      y += Math.sin(angle) * bob;
      a.el.style.transform = `translate(${x}px, ${y}px) rotate(${angle}rad) translate(-100%, -50%)`;
    }
  }

  return {
    show() {
      if (raf) return;
      layer.classList.add('cw-on');
      restale();
      raf = requestAnimationFrame(frame);
    },
    hide() {
      layer.classList.remove('cw-on');
      cancelAnimationFrame(raf);
      raf = 0;
    },
    // Fainter once the visitor has found the chair (hovering or selecting it).
    found(on) { layer.classList.toggle('cw-found', on); },
  };
}
