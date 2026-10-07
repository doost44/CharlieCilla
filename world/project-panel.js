import THREE from './three.js';
import { config } from './config.js';
import { canvas } from './textures.js';
import { settings } from './options.js';
import {
  PX, FONT, COLOR, MONO, paper, createSheet, smoothTexture, lineBox, titleLines, drawTitle, drawLinks,
  linksWidth, linkAt, yearOf, titleOf, linkColor, wrap,
} from './cards.js';

// A project opened beside its title card, on the same white paper: the card's
// "2026. title" caption with "expand" and "close", the category in italics, and the
// work itself. images / carousel-images / flipbook-images: pages with prev and next.
// video-file: a VideoTexture, click to play or pause. video (YouTube): its thumbnail
// with a play button that hands over to the site's own player (iframes cannot be
// textures). Media load only when the panel opens, and everything is freed on close.

const AREA = 1; // square metres the media box takes, whatever its shape
const MAX_W = 1.5, MAX_H = 1.1; // metres
const MEDIA_MAX = 1024; // pictures are shrunk to this many pixels before upload
const PAD_X = 20, PAD_Y = 16;
const BODY_LINE = 21.12;
const BOX_BG = '#f3f3f1';
const PLAY_SIZE = 0.16;
const youtubeThumb = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

// What to show for a project, from its admin-panel fields.
function mediaOf(p) {
  const norm = (src) => window.normalizeFlipbookPath(src);
  if (p.type === 'video-file' && p.videoSrc) return { kind: 'video', src: norm(p.videoSrc), poster: p.cover && norm(p.cover) };
  if (p.type === 'video') {
    const id = window.youtubeIdFromProject(p);
    return { kind: 'youtube', poster: p.cover ? norm(p.cover) : id && youtubeThumb(id) };
  }
  const book = p.carouselImages || p.flipbookImages;
  const pages = p.type === 'images' ? (p.images || []).map(norm) : book ? window.getFlipbookPageUrls(book) : [];
  if (pages.length) return { kind: 'pages', pages };
  return { kind: 'cover', poster: p.cover && norm(p.cover) }; // e.g. a PDF flipbook: the site shows it
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    if (/^https?:/i.test(src)) img.crossOrigin = 'anonymous'; // WebGL needs CORS for other sites' pictures
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// A picture as a texture, shrunk to MEDIA_MAX on its long side.
function pictureTexture(img) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const k = Math.min(1, MEDIA_MAX / Math.max(w, h));
  const c = canvas(Math.round(w * k), Math.round(h * k));
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, c.width, c.height);
  return smoothTexture(c);
}

// Stand-in when there is no picture to show (e.g. a film whose thumbnail can't load): a dark title card.
function titleCard(p, kind) {
  const c = canvas(1024, 576);
  const g = c.getContext('2d');
  g.fillStyle = '#141414';
  g.fillRect(0, 0, 1024, 576);
  g.textAlign = 'center';
  g.fillStyle = '#f4f4f2';
  g.font = `600 56px ${config.serif}`;
  const lines = wrap(g.font, titleOf(p), 820);
  lines.forEach((line, i) => g.fillText(line, 512, 150 + i * 68)); // above the play button
  g.fillStyle = COLOR.faint;
  g.font = `400 24px ${config.font}`;
  g.fillText([yearOf(p), p.category, kind].filter(Boolean).join(' · ').toLowerCase(), 512, 520);
  return smoothTexture(c);
}

// The round play button over videos.
function playTexture() {
  const c = canvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(13,13,13,0.72)';
  g.beginPath();
  g.arc(64, 64, 60, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(50, 38);
  g.lineTo(94, 64);
  g.lineTo(50, 90);
  g.closePath();
  g.fill();
  return smoothTexture(c);
}

// Media box size in metres for a picture of aspect a (width / height): about the same area for every shape.
function boxFor(a) {
  const w = Math.sqrt(AREA * a), h = Math.sqrt(AREA / a);
  const k = Math.min(1, MAX_W / w, MAX_H / h);
  return { w: w * k, h: h * k };
}

export function createProjectPanel(project, index) {
  const media = mediaOf(project);
  const color = linkColor(index);
  const year = yearOf(project), title = titleOf(project);
  const pageCount = media.pages?.length ?? 1;
  const caption = [project.category, media.kind === 'pages' && pageCount > 1 && `${pageCount} pages`, media.kind === 'youtube' && 'film']
    .filter(Boolean).join(' · ').toLowerCase();

  const group = new THREE.Group(); // anchored at the panel's top-left corner
  const sheet = createSheet(0);
  const pictureMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const picture = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), pictureMaterial);
  picture.visible = false;
  const playMaterial = new THREE.MeshBasicMaterial({ map: playTexture(), transparent: true, depthWrite: false });
  const play = new THREE.Mesh(new THREE.PlaneGeometry(PLAY_SIZE, PLAY_SIZE), playMaterial);
  play.visible = false;
  group.add(sheet.mesh, picture, play);

  const abort = new AbortController(); // the video's listeners
  // failed: nothing could be shown. noVideo: the video can't play here (the site's player can).
  const st = { page: 0, loading: true, failed: false, noVideo: false, hover: null, aspect: 0 };
  let box = boxFor(4 / 3); // until the first picture says otherwise
  let boxTop = 0; // CSS pixels
  let rects = [];
  let token = 0; // newest picture request; older ones are dropped when they arrive
  let video = null, videoTexture = null, disposed = false;

  const panel = {
    project, index, group,
    targets: [sheet.mesh, picture, play],
    get width() { return sheet.width; },
    get height() { return sheet.height; },

    linkAt(object, uv) {
      if (object === sheet.mesh) return linkAt(rects, sheet.toCss(uv));
      // On the picture itself: play/pause a video, hand a film to the site, turn a page.
      if (media.kind === 'video' && !st.noVideo) return { id: 'play', action: 'play', label: video && !video.paused ? 'pause' : 'play' };
      if (media.kind === 'youtube') return { id: 'play', action: 'expand', label: 'play' };
      if (media.kind !== 'pages' || st.failed) return { id: 'play', action: 'expand', label: 'expand' };
      return pageCount > 1 ? { id: 'next', action: 'next', label: 'next' } : null;
    },
    setHover(id) {
      if (id === st.hover) return;
      st.hover = id;
      redraw();
    },
    turnPage(step) {
      if (media.kind !== 'pages' || pageCount < 2) return;
      showPage((st.page + step + pageCount) % pageCount);
    },
    togglePlay() {
      if (!video) return;
      if (!video.paused) return video.pause();
      video.play().then(() => {
        if (disposed) return;
        videoTexture ??= new THREE.VideoTexture(video);
        show(videoTexture, video.videoWidth / video.videoHeight);
      }).catch(() => {
        if (!disposed && video.error) videoFailed();
      });
    },
    pause: () => video?.pause(),
    update() {
      if (video) video.volume = settings.mute ? 0 : THREE.MathUtils.clamp(settings.volume ?? 1, 0, 1);
      const paused = !video || video.paused;
      play.visible = !st.loading && (media.kind === 'youtube' || (media.kind === 'video' && paused && !st.noVideo));
      play.scale.setScalar(st.hover === 'play' ? 1.12 : 1);
    },
    dispose() {
      disposed = true;
      token++;
      abort.abort();
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load(); // lets go of the file
        video = null;
      }
      videoTexture?.dispose();
      if (pictureMaterial.map !== videoTexture) pictureMaterial.map?.dispose();
      pictureMaterial.dispose();
      picture.geometry.dispose();
      playMaterial.map.dispose();
      playMaterial.dispose();
      play.geometry.dispose();
      sheet.dispose();
      group.parent?.remove(group);
    },
  };
  for (const m of panel.targets) m.userData.owner = panel;

  // Put a texture in the media box (contain-fit), sizing the box to the first one shown.
  function show(texture, aspect) {
    const old = pictureMaterial.map;
    if (old !== texture) {
      if (old && old !== videoTexture) old.dispose();
      pictureMaterial.map = texture;
      pictureMaterial.needsUpdate = true;
    }
    st.loading = st.failed = false;
    if (!st.aspect && aspect) {
      st.aspect = aspect;
      box = boxFor(aspect);
    }
    redraw();
    const fit = Math.min(box.w / aspect, box.h);
    picture.scale.set(fit * aspect, fit, 1);
    picture.visible = true;
  }

  function fail() {
    st.loading = false;
    st.failed = true;
    redraw();
  }

  function videoFailed() {
    st.noVideo = true;
    if (!pictureMaterial.map || pictureMaterial.map === videoTexture) show(titleCard(project, 'video'), 16 / 9);
    else redraw();
  }

  async function showPicture(src, fallback) {
    const mine = ++token;
    const img = src ? await loadImage(src) : null;
    if (mine !== token || disposed) return;
    const texture = img ? pictureTexture(img) : fallback?.();
    if (texture) show(texture, texture.image.width / texture.image.height);
    else if (!pictureMaterial.map) fail();
  }

  function showPage(i) {
    st.page = i;
    redraw();
    showPicture(media.pages[i]);
  }

  function redraw() {
    if (disposed) return;
    const w = Math.ceil(box.w / PX + 2 * PAD_X);
    const inner = w - 2 * PAD_X;
    const links = [{ id: 'expand', text: 'expand' }, { id: 'close', text: 'close' }];
    const head = titleLines(year, title, inner - linksWidth(links) - 16);
    const yr = lineBox(FONT.yr);
    const body = lineBox(FONT.body, BODY_LINE);
    boxTop = PAD_Y + head.length * yr.lh + 2 + (caption ? BODY_LINE : 0) + 10;
    const boxH = Math.round(box.h / PX);
    const footer = footerLinks();
    const h = Math.ceil(boxTop + boxH + (footer ? 10 + MONO.line : 0) + PAD_Y);
    const { c, g } = paper(w, h);

    rects = drawTitle(g, head, PAD_X, PAD_Y, color, st.hover === 'title')
      .map((r) => ({ ...r, id: 'title', action: 'expand', label: 'expand' }));
    rects.push(...drawLinks(g, links, w - PAD_X - linksWidth(links), PAD_Y + yr.base, st.hover));
    if (caption) {
      g.font = FONT.body;
      g.fillStyle = COLOR.muted;
      g.fillText(caption, PAD_X, PAD_Y + head.length * yr.lh + 2 + body.base);
    }

    g.fillStyle = BOX_BG;
    g.fillRect(PAD_X, boxTop, inner, boxH);
    if (st.loading || st.failed) {
      g.font = FONT.mono;
      g.fillStyle = COLOR.faint;
      g.textAlign = 'center';
      g.fillText(st.failed ? "can't show this here: expand" : 'loading', PAD_X + inner / 2, boxTop + boxH / 2 + 4);
      g.textAlign = 'left';
    }
    if (footer) rects.push(...drawLinks(g, footer, PAD_X, boxTop + boxH + 10 + MONO.base, st.hover));
    sheet.set(c, w, h);

    // The picture and the play button sit over the box, just in front of the paper.
    const cx = (PAD_X + inner / 2) * PX, cy = -(boxTop + boxH / 2) * PX;
    picture.position.set(cx, cy, 0.002);
    play.position.set(cx, cy, 0.004);
  }

  function footerLinks() {
    if (media.kind === 'pages' && pageCount > 1) {
      return [
        { id: 'prev', text: 'prev' },
        { id: 'count', text: `${st.page + 1} / ${pageCount}`, off: true },
        { id: 'next', text: 'next' },
      ];
    }
    if (media.kind === 'video') return [{ id: 'note', text: st.noVideo ? 'plays on the site: expand' : 'click the video to play or pause', off: true }];
    if (media.kind === 'youtube') return [{ id: 'note', text: 'plays on the site', off: true }];
    if (media.kind === 'cover') return [{ id: 'note', text: 'opens on the site: expand', off: true }];
    return null;
  }

  // Start loading what this project shows.
  redraw();
  if (media.kind === 'pages') {
    showPage(0);
  } else if (media.kind === 'video') {
    video = document.createElement('video');
    video.playsInline = true;
    video.loop = true;
    video.preload = media.poster ? 'metadata' : 'auto'; // without a poster, its first frame is the picture
    const { signal } = abort;
    video.addEventListener('loadeddata', () => {
      if (pictureMaterial.map) return;
      videoTexture ??= new THREE.VideoTexture(video);
      show(videoTexture, video.videoWidth / video.videoHeight);
    }, { signal });
    video.addEventListener('error', videoFailed, { signal });
    video.src = media.src;
    if (media.poster) showPicture(media.poster, () => titleCard(project, 'video'));
  } else {
    showPicture(media.poster, () => titleCard(project, media.kind === 'youtube' ? 'film' : ''));
  }
  return panel;
}
