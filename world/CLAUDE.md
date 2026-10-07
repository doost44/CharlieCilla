# Chair World

The home page's ASCII office chair is a doorway: click it ("click E for more" appears under it), press E, and you sit in it in a first-person 3D world. ASCII glyphs swirl round you and draw a suburban living room, the room fades into real textures, its walls fall outward like a film set, and Charlie's projects float round the chair as orbs with panels. Built on Automation Map (`doost44/automation-map`): same player, pixel-shooter look, HUD, orbs and panels.

## Stack (do not change)
- Plain JavaScript ES modules, no bundler, no npm, no TypeScript, no frameworks, relative paths only. Runs from any static server and GitHub Pages.
- three.js: reuse the copy `index.html` already loads for the ASCII chair (r128 from cdnjs, the global `THREE`, re-exported by `three.js`). Never load a second copy. r128 differences from Automation Map's 0.160: no `flatShading` on Lambert (use `flatMaterial` in `textures.js`, a shine-less Phong), no `colorSpace`, no PointerLockControls module (`mouse.js` is a small one), lights are dimmer numbers.
- Only asset file: `assets/audio/bassline.m4a` (Charlie's own bass line). Everything else (textures, glyph atlas, geometry) is generated in code. Project covers are the site's own images; video posters live in `../Assets/covers/`.
- Lazy: `index.html` loads only `entry.js` (and it loads `world.css`). `main.js` and the rest load on the first E.

## Files
- `entry.js` home-page glue: click/keyboard selection, hint, E, lazy import, `?phase=`, back to the site.
- `main.js` boots renderer/scene/camera, wires everything, frame loop; `launchWorld()` / `leaveWorld()` (which frees everything: GPU, listeners via one AbortController, audio, DOM).
- `sequence.js` the intro as phases: sit → swirl → form → texture → hold → collapse → projects → free. Each phase's `finish()` must leave the world as if it had played out, so skipping works.
- `config.js` every duration, count, size and colour.
- `ascii.js` glyph swirl/formation (own full-res canvas, instanced quads, motion in the vertex shader) and `sampleRoom()` (glyph targets sampled from the room's surfaces and edges).
- `room.js` the room set (walls as hinged flats in two halves) and its collapse; `furniture.js` couch, table, CRT, lamp, window, door, pictures; `room-textures.js` their canvas textures.
- `chair.js` the home page's own `buildChair()` (via `window.asciiChair`), re-skinned; seat pose; the camera matching the home page's view.
- `player.js` seated only (v1): the ease into the seat. `mouse.js` mouse look under pointer lock.
- `projects.js` the site's project list (`AdminData.getHomeProjects()`) → orbs and panels, covers; `orbs.js`, `panels.js`, `interaction.js`, `hud.js`, `options.js`, `sound.js`, `world-island.js`, `textures.js` ported from Automation Map.

## Look
Early-2000s PC shooter (Half-Life 1 era), not realism.
- Low-poly geometry, flat shading. Textures painted on `<canvas>` at 32-256px with `NearestFilter`, no mipmaps.
- Main render at half resolution, upscaled with `image-rendering: pixelated`. The ASCII glyphs alone are full resolution.
- One ambient + one directional light (plus the floor lamp's warm point light in the room), linear fog into a dusk gradient sky.
- HUD: amber on translucent dark boxes, IBM Plex Mono (the site's mono), centre crosshair.

## Data
Everything about a project comes from `admin/data.js` / the admin panel (`title`, `year`, `category`, `description`, `type`, media fields, optional `cover`). Nothing project-specific is hard-coded in `world/`. Cover order: `cover` → first slide/page → first image → YouTube thumbnail → generated placeholder.

## Integration with index.html
Keep it tiny: the hook at the end of the ASCII IIFE (`window.asciiChair`), `#chair-hint`, `#world-root` and one module script tag. Enter on an orb calls the page's own `openProject(id)`; the world notices the modal closing and takes the mouse back. Never duplicate the modal code.

## Testing
Serve the repo root (`python3 -m http.server 8000`). `?phase=swirl|form|texture|collapse|projects` jumps straight to a phase. Desktop only: under 900px wide, no fine pointer or no WebGL, the chair stays decorative.

Keep modules short and readable; comment only what is non-obvious.
