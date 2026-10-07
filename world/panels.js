import THREE from './three.js';
import { config } from './config.js';
import { canvas, crunchy, hex } from './textures.js';
import { showReader } from './hud.js';

// Terminal-style panels beside each orb (ported from Automation Map): title, year,
// category and type badges, the start of the description and ENTER TO OPEN.
// F brings the panel to the middle of the view to read the whole description,
// over as many pages as it needs (← → turn them).

const W = 512, H = 384;
const AMBER = config.amber, WHITE = '#f2ecd8';
const FONT = (size) => `500 ${size}px ${config.font}`;
const BODY_TOP = 104, LINE = 21, BODY_LINES = 11;
const SUMMARY = 220; // characters of description on the outside of the panel

// Panel background, border, header bar with the title and year, and the two badges.
function frame(item) {
  const c = canvas(W, H);
  const g = c.getContext('2d');
  const p = item.project;
  g.fillStyle = '#1e2420';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = AMBER;
  g.lineWidth = 4;
  g.strokeRect(2, 2, W - 4, H - 4);

  g.fillStyle = hex(item.color);
  g.fillRect(4, 4, W - 8, 40);
  g.fillStyle = '#111';
  g.textBaseline = 'middle';
  g.font = FONT(16);
  const year = String(p.year || '');
  const yearW = g.measureText(year).width;
  g.fillText(year, W - 14 - yearW, 25);
  const title = String(p.title || 'Untitled').toUpperCase();
  const titleW = W - 44 - yearW;
  let size = 22;
  do { g.font = FONT(size); } while (g.measureText(title).width > titleW && --size > 13);
  g.fillText(fit(g, title, titleW), 14, 25);

  let x = 16;
  for (const [text, color] of [[item.category, hex(item.color)], [item.typeLabel, AMBER]]) {
    if (!text) continue;
    g.font = FONT(13);
    const w = Math.min(g.measureText(text).width + 16, W - 32 - (x - 16));
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.strokeRect(x, 58, w, 24);
    g.fillStyle = color;
    g.fillText(fit(g, text, w - 16), x + 8, 71);
    x += w + 10;
  }
  return { c, g };
}

function footer(g, text) {
  g.fillStyle = 'rgba(255,180,60,0.35)';
  g.fillRect(16, H - 44, W - 32, 2);
  g.fillStyle = AMBER;
  g.font = FONT(14);
  g.textBaseline = 'middle';
  g.fillText(text, 16, H - 24);
}

function scanlines(g) {
  g.fillStyle = 'rgba(0,0,0,0.2)';
  for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
}

// Shorten text with an ellipsis until it fits.
function fit(g, text, maxW) {
  if (g.measureText(text).width <= maxW) return text;
  while (text.length > 1 && g.measureText(text + '…').width > maxW) text = text.slice(0, -1);
  return text.trimEnd() + '…';
}

// Break text into lines that fit, keeping paragraph breaks as empty lines.
function wrapLines(g, text, maxW) {
  const lines = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ').filter(Boolean)) {
      const test = line ? line + ' ' + word : word;
      if (g.measureText(test).width > maxW && line) {
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

function body(g, lines) {
  g.fillStyle = WHITE;
  g.font = FONT(16);
  g.textBaseline = 'alphabetic';
  lines.forEach((line, i) => g.fillText(line, 16, BODY_TOP + 14 + i * LINE));
}

// The outside of the panel: a summary of the description.
function drawSummary(item) {
  const { c, g } = frame(item);
  g.font = FONT(16);
  let text = item.text.replace(/\s+/g, ' ');
  if (text.length > SUMMARY) text = text.slice(0, SUMMARY).replace(/\s+\S*$/, '') + '…';
  body(g, wrapLines(g, text || 'Project details coming soon.', W - 32).slice(0, BODY_LINES));
  footer(g, 'ENTER TO OPEN · F TO READ');
  scanlines(g);
  return c;
}

// Reading pages: the whole description, as many panels as it takes.
function drawPages(item) {
  const probe = canvas(1, 1).getContext('2d');
  probe.font = FONT(16);
  const lines = wrapLines(probe, item.text || 'Project details coming soon.', W - 32);
  while (lines.length > 1 && !lines[lines.length - 1]) lines.pop();
  const count = Math.max(1, Math.ceil(lines.length / BODY_LINES));
  const pages = [];
  for (let i = 0; i < count; i++) {
    const { c, g } = frame(item);
    body(g, lines.slice(i * BODY_LINES, (i + 1) * BODY_LINES));
    const turn = count > 1 ? `PAGE ${i + 1}/${count} · ← → · ` : '';
    footer(g, `${turn}ENTER TO OPEN`);
    scanlines(g);
    pages.push(c);
  }
  return pages;
}

export function buildPanels(scene, orbs, items) {
  return orbs.map((orb, i) => {
    const summary = drawSummary(items[i]);
    const pages = drawPages(items[i]);
    const screen = crunchy(summary);
    const pageTextures = pages.map((c) => crunchy(c));
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 4.5),
      new THREE.MeshBasicMaterial({ map: screen, fog: false, transparent: true }),
    );
    mesh.userData.orb = orb;
    scene.add(mesh);

    const tether = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0xffb43c, transparent: true, opacity: 0.5 }),
    );
    tether.frustumCulled = false;
    scene.add(tether);

    const panel = { orb, mesh, tether, brightness: 0.4, read: 0, screen, pages, pageTextures };
    orb.panel = panel;
    return panel;
  });
}

const _toCam = new THREE.Vector3();
const _side = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _front = new THREE.Vector3();
// Reading distance at which the 4.5-tall panel fills 70% of the view height (the
// overlay in world.css uses the same 70%), for whatever field of view is set.
const readDist = (camera) => 4.5 / (0.7 * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));

export function updatePanels(panels, camera, dt) {
  let reading = null;
  for (const p of panels) {
    const o = p.orb;
    // Sit beside the orb, on its right as seen from the chair.
    _toCam.subVectors(camera.position, o.group.position);
    const dist = _toCam.length();
    _side.crossVectors(UP, _toCam).normalize();
    p.mesh.position.copy(o.group.position)
      .addScaledVector(_side, o.radius + 4)
      .addScaledVector(UP, 1);
    p.mesh.lookAt(camera.position);

    // Reading mode: glide to the middle of the view, square to the screen, showing the current page.
    p.read += ((o.reading ? 1 : 0) - p.read) * Math.min(1, dt * 7);
    if (p.read > 0.001) {
      camera.getWorldDirection(_dir);
      _front.copy(camera.position).addScaledVector(_dir, readDist(camera));
      p.mesh.position.lerp(_front, p.read);
      p.mesh.quaternion.slerp(camera.quaternion, p.read);
    }
    p.mesh.material.map = o.reading ? p.pageTextures[o.page] : p.screen;
    if (o.reading && p.read > 0.9) reading = p;

    const pos = p.tether.geometry.attributes.position;
    pos.setXYZ(0, ...o.group.position.toArray());
    pos.setXYZ(1, p.mesh.position.x - _side.x * 3, p.mesh.position.y, p.mesh.position.z - _side.z * 3);
    pos.needsUpdate = true;

    const lit = o.targeted || o.held;
    const target = lit ? 1 : THREE.MathUtils.clamp(1.1 - dist / 70, 0.3, 0.6);
    p.brightness += (target - p.brightness) * Math.min(1, dt * 8);
    p.mesh.material.color.setScalar(p.brightness);
    // Panels ignore fog to stay readable, so fade them out by hand when very far away.
    const far = THREE.MathUtils.clamp((150 - dist) / 50, 0, 1) * o.shown;
    p.mesh.material.opacity = far;
    p.mesh.visible = far > 0;
    p.tether.material.opacity = p.brightness * 0.7 * far;
    p.tether.visible = far > 0;
  }
  // Once the panel has arrived, show its canvas as a sharp 2D overlay exactly on top,
  // so nothing in the scene (word rings, other panels) can cover or blur it.
  showReader(reading ? reading.pages[reading.orb.page] : null);
}
