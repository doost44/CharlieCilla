import { config } from './config.js';
import { canvas, crunchy, hex } from './textures.js';
import { buildOrbs, setCover } from './orbs.js';
import { buildPanels } from './panels.js';

// The site's own project list (the same one the Selected Works column and the admin
// panel use) turned into orbs and panels. Nothing about a project is hard-coded here.

const TYPE_LABELS = {
  'carousel-images': 'SLIDES',
  'flipbook-images': 'FLIPBOOK',
  'flipbook-pdf': 'FLIPBOOK',
  images: 'IMAGES',
  video: 'FILM',
  'video-file': 'VIDEO',
};

export function buildProjects(scene) {
  const projects = window.AdminData.getHomeProjects().filter((p) => p.visible !== false);
  const years = projects.map((p) => parseInt(p.year, 10)).filter(Number.isFinite);
  const oldest = Math.min(...years), newest = Math.max(...years);
  const categories = [...new Set(projects.map((p) => p.category || ''))];
  const [small, big] = config.orbSize;

  const items = projects.map((p) => {
    const color = config.palette[categories.indexOf(p.category || '') % config.palette.length];
    const year = parseInt(p.year, 10);
    const age = newest > oldest && Number.isFinite(year) ? (year - oldest) / (newest - oldest) : 0.5;
    return {
      project: p,
      color,
      radius: small + (big - small) * age, // recent work is a little bigger
      category: String(p.category || '').toUpperCase(),
      typeLabel: TYPE_LABELS[p.type] ?? '',
      text: plainText(p.description),
      words: [...String(p.title || '').split(/\s+/).filter(Boolean), String(p.year || '')].filter(Boolean),
      links: projects.map((q, j) => (q !== p && q.category && q.category === p.category ? j : -1)).filter((j) => j >= 0),
      cover: placeholder(p, color),
    };
  });

  const { orbs, lines } = buildOrbs(scene, items);
  const panels = buildPanels(scene, orbs, items);
  for (const o of orbs) {
    o.group.visible = false; // until the walls come down (see startArrival)
    o.arriveIn = Infinity;
    o.shown = 0;
  }
  orbs.forEach((o, i) => loadCover(items[i].project).then((t) => t && setCover(o, t)));
  return { orbs, lines, panels, count: projects.length };
}

// Description HTML as plain text, keeping <br> as line breaks. DOMParser never runs
// scripts or loads images, so it is safe on text typed into the admin panel.
function plainText(html) {
  const doc = new DOMParser().parseFromString(String(html || '').replace(/<br\s*\/?>/gi, '\n'), 'text/html');
  return doc.body.textContent.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Where a project's cover can come from, best first: its own `cover`, the first
// slide or page, its first image, then its YouTube thumbnail.
function coverCandidates(p) {
  const list = [];
  if (p.cover) list.push(p.cover);
  const pages = p.carouselImages || p.flipbookImages;
  if (pages) list.push(window.getFlipbookPageUrls(pages)[0]);
  if (p.images?.length) list.push(p.images[0]);
  const youtube = window.youtubeIdFromProject(p);
  if (youtube) list.push(`https://i.ytimg.com/vi/${youtube}/hqdefault.jpg`);
  return list.filter(Boolean).map((src) => window.normalizeFlipbookPath(src));
}

async function loadCover(p) {
  for (const src of coverCandidates(p)) {
    const img = await loadImage(src);
    if (img) return coverTexture(img);
  }
  return null; // keeps the generated placeholder
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    if (/^https?:/i.test(src)) img.crossOrigin = 'anonymous'; // WebGL needs CORS for other sites' images
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// Centre-cropped and shrunk to 128px so it stays chunky like the rest of the world,
// repeated twice round the ball.
function coverTexture(img) {
  const c = canvas(128, 128);
  const g = c.getContext('2d');
  const s = Math.min(img.naturalWidth, img.naturalHeight);
  g.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, 128, 128);
  return crunchy(c, 2, 1);
}

// Until (or unless) a cover loads: the category colour with the title's initials.
function placeholder(p, color) {
  const c = canvas(64, 64);
  const g = c.getContext('2d');
  g.fillStyle = hex(color);
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#1e2420';
  g.font = `500 22px ${config.font}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const initials = String(p.title || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase();
  g.fillText(initials, 32, 33);
  return crunchy(c, 2, 1);
}
