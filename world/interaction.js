import THREE from './three.js';
import { setCrosshair, showTarget } from './hud.js';
import { createProjectPanel } from './project-panel.js';

// Aim the crosshair at a link on a station's card or open project panel and click.
// Card: desc opens the full description (prev / next for long ones), project (or the
// title) opens the work beside the card. Panel: prev / next, click a video to play
// or pause it, expand (or the title, or a film's play button) hands the project to
// the site's own project view through onExpand. One project panel at a time.

const CENTER = new THREE.Vector2(0, 0);
const REACH = 7; // metres: links further away can't be clicked
const PANEL_KEEP = 14; // walk further than this from an open project and it closes

// Visible all the way up (the raycaster also hits hidden meshes).
const shown = (o) => {
  for (; o; o = o.parent) if (!o.visible) return false;
  return true;
};

export function createInteraction({ camera, look, stations, signal, onExpand, onTick }) {
  const list = Array.isArray(stations) ? stations : stations.stations;
  const raycaster = new THREE.Raycaster();
  raycaster.far = REACH;
  let enabled = false;
  let hover = null; // { owner, link }: card or panel, and the link under the crosshair
  let label = null;
  let open = null; // { station, panel }

  // What the crosshair is on. The first sheet of paper hit blocks anything behind it.
  function aim() {
    const targets = list.flatMap((s) => s.card.targets);
    if (open) targets.push(...open.panel.targets);
    camera.updateMatrixWorld();
    raycaster.setFromCamera(CENTER, camera);
    const hit = raycaster.intersectObjects(targets, false).find((h) => shown(h.object));
    if (!hit) return null;
    const owner = hit.object.userData.owner;
    const link = owner.linkAt(hit.object, hit.uv);
    return link ? { owner, link } : null;
  }

  function setHover(next) {
    if (hover?.owner !== next?.owner || hover?.link.id !== next?.link.id) {
      hover?.owner.setHover(null);
      next?.owner.setHover(next.link.id);
      setCrosshair(next ? 'ring' : 'dot');
    }
    hover = next;
    const text = next?.link.label ?? null;
    if (text !== label) showTarget(text);
    label = text;
  }

  function openProject(station) {
    closeProject();
    const panel = createProjectPanel(station.project, station.index);
    station.card.attachPanel(panel);
    open = { station, panel };
    onTick?.(station.index);
  }

  function closeProject() {
    if (!open) return;
    const { station, panel } = open;
    open = null;
    if (hover?.owner === panel) setHover(null);
    station.card.attachPanel(null);
    panel.dispose();
  }

  const stationOf = (owner) => list.find((s) => s.card === owner || s.card.panel === owner);

  function activate({ owner, link }) {
    const station = stationOf(owner);
    switch (link.action) {
      case 'desc':
        if (owner.toggleDesc()) onTick?.(station.index);
        break;
      case 'project':
        if (open?.station === station) closeProject();
        else openProject(station);
        break;
      case 'prev':
      case 'next':
        owner.turnPage(link.action === 'next' ? 1 : -1);
        break;
      case 'play':
        owner.togglePlay();
        break;
      case 'close':
        closeProject();
        break;
      case 'expand':
        open?.panel.pause();
        onExpand?.(station.project);
        break;
    }
  }

  document.addEventListener('mousedown', (e) => {
    if (!enabled || !look.isLocked || e.button !== 0) return;
    const target = aim();
    if (target) activate(target);
  }, { signal });

  return {
    get enabled() { return enabled; },
    set enabled(on) {
      enabled = on;
      if (!on) setHover(null);
    },
    update() {
      if (!enabled || !look.isLocked) {
        setHover(null);
        if (!look.isLocked) open?.panel.pause(); // paused world, or the site's project view is up
        return;
      }
      if (open && open.station.holder.position.distanceTo(camera.position) > PANEL_KEEP) closeProject();
      setHover(aim());
    },
    closeAll() {
      closeProject();
      for (const s of list) if (s.card.descOpen) s.card.toggleDesc();
      setHover(null);
    },
  };
}
