import THREE from './three.js';
import { config } from './config.js';
import { canvas, hex } from './textures.js';

// A station's title card: one entry of the home page's Selected Works list
// (index.html: .entry, .entry .yr, .entry p, renderHomePage) on white paper with a
// thin border. "2026." in bold, the title as an underlined lowercase link (purple and
// blue alternating), the italic excerpt, and two small mono links, desc and project.
// Sizes are the home page's CSS pixels (1rem = 16px). Canvases are drawn at SCALE x
// and mipmapped so the text stays sharp from arm's length to across the room.
// project-panel.js reuses the paper and text helpers exported here.

export const SCALE = 2; // canvas pixels per CSS pixel
export const PX = 0.0028; // metres per CSS pixel (the card is about 1.2 m wide)
const CARD_W = 440;
const PAD_X = 20, PAD_Y = 16;
const LINK_GAP = 12; // between the mono links
const EXCERPT = 110; // characters, as on the home page
const PAGE_LINES = 12; // most lines of the full description per page
const BODY_LINE = 21.12; // .entry p: 0.88rem, line-height 1.5
const MONO_LINE = 18;
const HIT = 5; // CSS pixels added round each link, so small links are easy to aim at

const S = config.site;
export const COLOR = {
  paper: hex(S.paper), line: hex(S.line), text: hex(S.text), muted: hex(S.muted), faint: hex(S.faint),
  blue: hex(S.blue), purple: hex(S.purple),
  // Hovered links go a shade darker.
  blueDark: '#0b2275', purpleDark: '#3f1466',
};
export const FONT = {
  yr: `600 14.72px ${config.serif}`, // .entry .yr: 0.92rem, bold
  body: `italic 400 14.08px ${config.serif}`, // .entry p: 0.88rem, italic
  mono: `400 12px ${config.font}`,
};

// The page loads the fonts, but they may still be on their way: cards are drawn at
// once and again when they arrive.
let fonts = null;
export function whenFonts() {
  fonts ??= Promise.all(Object.values(FONT).map((f) => document.fonts.load(f))).catch(() => {});
  return fonts;
}

const probe = canvas(1, 1).getContext('2d');

// Where the baseline sits in a line box (line-height normal when lineHeight is left out).
export function lineBox(font, lineHeight) {
  probe.font = font;
  const m = probe.measureText('Hg');
  const asc = m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent;
  const desc = m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent;
  const lh = lineHeight ?? asc + desc;
  return { lh, base: (lh - asc - desc) / 2 + asc };
}

export const textWidth = (font, text) => ((probe.font = font), probe.measureText(text).width);

// HTML entities decoded the way innerHTML would (DOMParser never runs scripts or loads images).
const decode = (s) => new DOMParser().parseFromString(s, 'text/html').body.textContent;

// The home page's excerpt: stripHtml, the first 110 characters, then "...".
export function excerpt(p) {
  const text = String(p.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return 'Project details coming soon.';
  return decode(text.slice(0, EXCERPT) + (text.length > EXCERPT ? '...' : ''));
}

// The whole description as plain text, keeping <br> as line breaks.
export function plainText(html) {
  const text = decode(String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n'));
  return text.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim() || 'Project details coming soon.';
}

export const yearOf = (p) => decode(String(p.year || 'Current'));
export const titleOf = (p) => decode(String(p.title || 'Untitled')).replace(/\s+/g, ' ').trim().toLowerCase();
export const linkColor = (index) => (index % 2 === 0 ? 'purple' : 'blue'); // renderHomePage: odd entries are "blue"

// Words into lines no wider than maxW; paragraph breaks become empty lines.
export function wrap(font, text, maxW) {
  probe.font = font;
  const lines = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(' ').filter(Boolean)) {
      const test = line ? `${line} ${word}` : word;
      if (line && probe.measureText(test).width > maxW) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    lines.push(line);
  }
  return lines;
}

// "2026. designer handbook" wrapped, each line split into the plain part and the link part.
export function titleLines(year, title, maxW) {
  const lead = `${year}. `;
  let start = 0;
  return wrap(FONT.yr, lead + title, maxW).map((text) => {
    const cut = Math.max(0, lead.length - start);
    start += text.length + 1;
    return { lead: text.slice(0, cut), link: text.slice(cut) };
  });
}

function underline(g, x, baseline, w, thick) {
  g.fillRect(x, baseline + 1.6, w, thick ? 1.5 : 1);
}

// The title block; returns the link's rectangles (one per line) for aiming.
export function drawTitle(g, lines, x, y, color, hover) {
  const { lh, base } = lineBox(FONT.yr);
  const rects = [];
  g.font = FONT.yr;
  lines.forEach(({ lead, link }, i) => {
    const by = y + i * lh + base;
    g.fillStyle = COLOR.text;
    g.fillText(lead, x, by);
    const lx = x + g.measureText(lead).width;
    const lw = g.measureText(link).width;
    g.fillStyle = hover ? COLOR[color + 'Dark'] : COLOR[color];
    g.fillText(link, lx, by);
    underline(g, lx, by, lw, hover);
    if (lw) rects.push({ x: lx, y: y + i * lh, w: lw, h: lh });
  });
  return rects;
}

// A small mono link. state: 'link', 'hover', 'active' (its panel is open) or 'off' (greyed).
export function drawMono(g, text, x, baseline, state = 'link') {
  g.font = FONT.mono;
  g.fillStyle = { link: COLOR.blue, hover: COLOR.blueDark, active: COLOR.text, off: COLOR.faint }[state];
  g.fillText(text, x, baseline);
  const w = g.measureText(text).width;
  if (state !== 'off') underline(g, x, baseline, w, state === 'hover');
  return { x, y: baseline - 14, w, h: MONO_LINE + 2 };
}

// Mono links in a row from x; returns each one's rectangle tagged with its action.
export function drawLinks(g, links, x, baseline, hover) {
  const rects = [];
  for (const l of links) {
    const state = l.off ? 'off' : l.active ? 'active' : hover === l.id ? 'hover' : 'link';
    const r = drawMono(g, l.text, x, baseline, state);
    if (!l.off) rects.push({ ...r, id: l.id, action: l.action ?? l.id, label: l.label ?? l.text });
    x += r.w + LINK_GAP;
  }
  return rects;
}
export const linksWidth = (links) => links.reduce((w, l, i) => w + textWidth(FONT.mono, l.text) + (i ? LINK_GAP : 0), 0);
export const MONO = { line: MONO_LINE, base: 13 };

// A blank sheet of the site's paper with its thin --line border, in CSS pixels.
export function paper(w, h) {
  const c = canvas(Math.ceil(w * SCALE), Math.ceil(h * SCALE));
  const g = c.getContext('2d');
  g.scale(SCALE, SCALE);
  g.fillStyle = COLOR.paper;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = COLOR.line;
  g.lineWidth = 1;
  g.strokeRect(0.5, 0.5, w - 1, h - 1);
  g.textBaseline = 'alphabetic';
  return { c, g };
}

// Smooth, mipmapped texture for text and pictures (the world's crunchy look is for surfaces).
export function smoothTexture(source) {
  const t = new THREE.CanvasTexture(source);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8; // three clamps it to what the GPU supports
  return t;
}

// Text on paper samples a slightly sharper mipmap than three would pick (a negative
// LOD bias), so thin serif strokes keep their weight a few metres away.
const LOD_BIAS = -0.6;
function sharpen(shader) {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <map_fragment>',
    THREE.ShaderChunk.map_fragment.replace('texture2D( map, vUv )', `texture2D( map, vUv, ${LOD_BIAS.toFixed(2)} )`),
  );
}

// A paper plane redrawn from canvases of changing size, anchored at its top edge
// (anchor 0.5: top centre, 0: top left). It has a plain back in case it is seen from behind.
export function createSheet(anchor = 0.5) {
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
  material.onBeforeCompile = sharpen;
  const backMaterial = new THREE.MeshBasicMaterial({ color: 0xe6e6e2, side: THREE.BackSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  const back = new THREE.Mesh(mesh.geometry, backMaterial);
  mesh.add(back);
  const size = { w: 0, h: 0 };
  return {
    mesh,
    size, // CSS pixels
    get width() { return size.w * PX; },
    get height() { return size.h * PX; },
    // Show a canvas from paper(w, h).
    set(c, w, h) {
      const old = material.map;
      if (old && old.image.width === c.width && old.image.height === c.height) {
        old.image = c;
        old.needsUpdate = true;
      } else {
        material.map = smoothTexture(c);
        material.needsUpdate = true;
        old?.dispose();
      }
      if (w !== size.w || h !== size.h) {
        mesh.geometry.dispose();
        mesh.geometry = back.geometry = new THREE.PlaneGeometry(w * PX, h * PX).translate((0.5 - anchor) * w * PX, (-h * PX) / 2, 0);
        Object.assign(size, { w, h });
      }
    },
    // Hit point (the plane's uv) in CSS pixels from the top left.
    toCss: (uv) => ({ x: uv.x * size.w, y: (1 - uv.y) * size.h }),
    setLevel(k) {
      material.color.setScalar(k);
      backMaterial.color.setRGB(0.9 * k, 0.9 * k, 0.89 * k);
    },
    dispose() {
      material.map?.dispose();
      material.dispose();
      backMaterial.dispose();
      mesh.geometry.dispose();
    },
  };
}

// Which link (if any) is at a CSS-pixel point.
export function linkAt(rects, p) {
  return rects.find((r) => p.x >= r.x - HIT && p.x <= r.x + r.w + HIT && p.y >= r.y - HIT && p.y <= r.y + r.h + HIT) ?? null;
}

const GAP = 0.06; // metres between the card and an open project panel
const TILT = 0.2; // the panel turns this much (radians) towards the visitor

export function createCard(project, index) {
  const color = linkColor(index);
  const year = yearOf(project);
  const title = titleOf(project);
  const short = excerpt(project);
  let pages = null; // the full description in pages, made on first open
  let rects = [];
  let disposed = false;

  const group = new THREE.Group(); // the card, plus the project panel when one is open
  const sheet = createSheet(0.5);
  group.add(sheet.mesh);

  const card = {
    project, index, group,
    mesh: sheet.mesh,
    targets: [sheet.mesh],
    descOpen: false,
    page: 0,
    hover: null,
    panel: null,
    get width() { return sheet.width; },
    get height() { return sheet.height; },

    linkAt: (object, uv) => (object === sheet.mesh ? linkAt(rects, sheet.toCss(uv)) : null),
    setHover(id) {
      if (id === card.hover) return;
      card.hover = id;
      redraw();
    },
    toggleDesc() {
      card.descOpen = !card.descOpen;
      card.page = 0;
      redraw();
      return card.descOpen;
    },
    turnPage(step) {
      const count = pages?.length ?? 1;
      const next = THREE.MathUtils.clamp(card.page + step, 0, count - 1);
      if (next === card.page) return;
      card.page = next;
      redraw();
    },
    // Put a project panel (project-panel.js) beside the card, or take it away (null).
    attachPanel(panel) {
      if (card.panel) group.remove(card.panel.group);
      card.panel = panel;
      if (panel) {
        panel.group.position.set(sheet.width / 2 + GAP, 0, 0);
        panel.group.rotation.y = -TILT;
        group.add(panel.group);
      }
      redraw();
    },
    setLevel: (k) => sheet.setLevel(k),
    update(dt) {
      // With a panel open the pair slides over so it stays centred under the lamp.
      const shift = card.panel ? -(GAP + card.panel.width * Math.cos(TILT)) / 2 : 0;
      group.position.x += (shift - group.position.x) * Math.min(1, dt * 6);
      card.panel?.update(dt);
    },
    dispose() {
      disposed = true;
      card.panel?.dispose();
      card.panel = null;
      sheet.dispose();
      group.parent?.remove(group);
    },
  };
  sheet.mesh.userData.owner = card;

  function paginate() {
    const lines = wrap(FONT.body, plainText(project.description), CARD_W - 2 * PAD_X);
    const per = Math.ceil(lines.length / Math.ceil(lines.length / PAGE_LINES)); // pages of even length
    const out = [];
    for (let i = 0; i < lines.length; i += per) {
      const page = lines.slice(i, i + per);
      while (page.length > 1 && !page[0]) page.shift();
      while (page.length > 1 && !page[page.length - 1]) page.pop();
      out.push(page);
    }
    return out;
  }

  function redraw() {
    if (disposed) return;
    const inner = CARD_W - 2 * PAD_X;
    const links = [
      { id: 'desc', text: 'desc', active: card.descOpen },
      { id: 'project', text: 'project', active: !!card.panel },
    ];
    const head = titleLines(year, title, inner - linksWidth(links) - 16);
    const yr = lineBox(FONT.yr);
    const body = lineBox(FONT.body, BODY_LINE);
    let text;
    if (card.descOpen) {
      pages ??= paginate();
      text = pages[card.page];
    } else {
      text = wrap(FONT.body, short, inner);
    }
    const pager = card.descOpen && pages.length > 1;
    const bodyTop = PAD_Y + head.length * yr.lh + 2; // .entry p has a 2px top margin
    const h = Math.ceil(bodyTop + text.length * BODY_LINE + (pager ? 10 + MONO_LINE : 0) + PAD_Y);
    const { c, g } = paper(CARD_W, h);

    rects = drawTitle(g, head, PAD_X, PAD_Y, color, card.hover === 'title')
      .map((r) => ({ ...r, id: 'title', action: 'project', label: card.panel ? 'close project' : 'project' }));
    rects.push(...drawLinks(g, links, CARD_W - PAD_X - linksWidth(links), PAD_Y + yr.base, card.hover));

    g.font = FONT.body;
    g.fillStyle = COLOR.muted;
    text.forEach((line, i) => g.fillText(line, PAD_X, bodyTop + i * BODY_LINE + body.base));

    if (pager) {
      const by = bodyTop + text.length * BODY_LINE + 10 + MONO.base;
      const first = card.page === 0, last = card.page === pages.length - 1;
      rects.push(...drawLinks(g, [
        { id: 'prev', text: 'prev', off: first },
        { id: 'count', text: `${card.page + 1} / ${pages.length}`, off: true },
        { id: 'next', text: 'next', off: last },
      ], PAD_X, by, card.hover));
    }
    sheet.set(c, CARD_W, h);
  }

  redraw();
  whenFonts().then(redraw);
  return card;
}
