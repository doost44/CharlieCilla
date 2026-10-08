# Chair World

The home page's ASCII office chair is a doorway: click it ("click E for more" appears under it), press E, and the chair glides to the middle of the screen as the page fades to white, grows as the visitor sinks into it, and its own glyphs peel off into a swirl round them: that is the load screen. The world takes over underneath, already seated, its small blue ASCII glyphs swirling round the seat. They land on the surfaces of an empty bedroom (a swag lamp in the corner, a window, an open box), the room builds out of its glyphs from the floor up into real textures, its walls fall outward like a film set and the ceiling lifts away with the lamp, revealing a vast dark warehouse. Charlie's projects hang there as stations under industrial lamps, each with a card in the home page's own list style; the visitor stands up and walks between them while each station's synth swells nearby. Built on Automation Map (`doost44/automation-map`).

## Stack (do not change)
- Plain JavaScript ES modules, no bundler, no npm, no TypeScript, no frameworks, relative paths only. Runs from any static server and GitHub Pages.
- three.js: reuse the copy `index.html` already loads for the ASCII chair (r128 from cdnjs, the global `THREE`, re-exported by `three.js`). Never load a second copy. r128 differences from Automation Map's 0.160: no `flatShading` on Lambert (use `flatMaterial` in `textures.js`, a shine-less Phong), no `colorSpace`, no PointerLockControls module (`mouse.js` is a small one), lights are dimmer numbers. `onBeforeCompile` and `VideoTexture` exist.
- Only asset files: `assets/audio/bassline.m4a` (Charlie's own bass line) and GoatMan's painted parts in `goatman/parts/` (crops of Charlie's GoatMan paintings, from `doost44/the-goatman`'s `goatman3d/assets/goatman/`). Everything else (textures, glyph atlas, geometry, sound) is generated in code. Project covers and media are the site's own files; video posters live in `../Assets/covers/`.
- Lazy: `index.html` loads only `entry.js` (with the small `portal.js`; it loads `world.css`). `main.js` and the rest load on the first E.

## Files
- `entry.js` home-page glue: click/keyboard selection, hint, E, lazy import, `?phase=`, back to the site.
- `portal.js` the load screen (loaded with `entry.js`, so it is there the moment E is pressed): the page's live ASCII chair (spun faster through `asciiChair.setSpin`, read from its text each frame), drawn on a 2D canvas over everything, centred and zoomed into, shedding its glyphs into the same vortex as `ascii.js` while it turns. `launchWorld` builds only once the visitor has sat down (`portal.seated`), starts at the swirl phase once `portal.swirling` resolves, and the swirl phase calls `portal.finish()` to fade it. Skipped for `?phase=` and reduced motion, which keep the plain "loading…" line.
- `main.js` boots renderer/scene/camera, wires every module, runs the frame loop; `launchWorld()` / `leaveWorld()` (which frees everything: GPU, listeners via one AbortController, audio, DOM).
- `sequence.js` the intro as phases: sit → swirl → form → texture → hold → collapse → projects → free. Each phase's `finish()` must leave the world as if it had played out, so skipping, reduced motion and `?phase=` work.
- `config.js` durations, sizes, the site's colours and fonts; module-specific tunables sit at the top of each module.
- `chair.js` the home page's own `buildChair()` (via `window.asciiChair`) re-skinned in black, facing the room's focal point; the seat pose. `player.js` seated from frame one (look softly limited while the room forms), then stand up, walk, run, hop, collide with the hall and sit back down. `mouse.js` mouse look and its soft limits.
- `ascii.js` the glyph swirl and the glyphs landing flat on the room's surfaces (own full-res canvas, instanced quads, motion in the vertex shader, depth-only copies of the room and chair for occlusion). `reveal.js` the bottom-up build-out: patches the room's materials with `onBeforeCompile` and restores them after.
- `room.js` the bedroom set (walls as hinged flats in two halves, the swag lamp as the only light) and its collapse; `furniture.js` its fittings and props and the swag lamp; `room-textures.js` their canvas textures.
- `warehouse.js` the hall (brick, windows, columns, roof hole, god-rays, dust, fog; colliders and bounds for walking); `warehouse-textures.js` its textures.
- `goatman-site.js` GoatMan at work by the wall: he carries the blocks lying in front of the stack the warehouse sets aside (`hall.work`, instances he moves) back onto it one at a time, the top tumbles off when none are left and he starts again; he stops and stares at the visitor within 5 m. `goatman/` is GoatMan himself, ported from `doost44/the-goatman` (`goatman3d/src/goatman*.js`) to r128: `goatman.js` the body (flat Phong materials, `skinning: true` on the hands, `gaze()` and `gripIn()` added), `head.js`, `hand.js` (its own geometry merge), `poses.js` (only standing, walking, kneel and stand, plus `place(h)`).
- `stations.js` one station per visible project (hanging lamp, light pool, card; at most 4 real point lights handed to the nearest; a project with a `companion` trades places with the station nearest where its companion works), `cards.js` the home-list-style cards (canvas at 2x, mipmapped), `project-panel.js` a project opened beside its card (slides, video, a hand-off to the site's project view for YouTube films and `interactive` projects such as Automation Map; books marked `spread` show the cover alone and then two pages side by side, paired by the page's own `buildCarouselGroups`, the frame sliding out to the right for them), `interaction.js` crosshair aiming and clicking on card links.
- `sound.js` everything audible, synthesised with Web Audio: generated hall reverb, drone, a generative voice per station in A-flat major pentatonic with HRTF proximity (at most 3 at once), footsteps, thuds, lamps, plus the bass-line wind.
- `hud.js` the world's DOM; `options.js` the options menu; `world.css` all of it in the site's look.

## Look
- Intro: white void, small glyphs in the site's link blue. The room: early-2000s low-poly, flat shading, canvas textures at 32-256 px with `NearestFilter`, lit by one warm swag lamp. The hall: cool blue-grey dark with warm god-rays, faked light (additive planes, sprites, floor decals); big tiled textures are mipmapped so 70 m of brick doesn't shimmer. Light budget: the swag lamp plus at most 4 station point lights, one ambient and one directional.
- Renderer at pixel ratio 1 by default (crisp cards); the options' pixel size still offers the chunky look.
- Everything with text looks like the website, not a game: HUD, pause screen, options and the in-world cards use white paper, IBM Plex Serif and Mono, `.list-heading`-style mono labels, the site's purple/blue links.

## Data
Everything about a project comes from `admin/data.js` / the admin panel (`title`, `year`, `category`, `description`, `type`, media fields, optional `cover`, optional `companion`: `"goatman"` puts GoatMan to work beside its station). Nothing project-specific is hard-coded in `world/`; the admin form keeps fields it doesn't show. Stations follow the home list's order (newest nearest the chair).

## Integration with index.html
Keep it tiny: the hook at the end of the ASCII IIFE (`window.asciiChair`), `#chair-hint`, `#world-root` and one module script tag. "expand" on a project calls the page's own `openProject(id)`; while that view is up the world stops drawing and its sound is suspended, and it takes the mouse back when the view closes. Never duplicate the modal code.

## Testing
Serve the repo root (`python3 -m http.server 8000`). `?phase=sit|swirl|form|texture|hold|collapse|projects|free` jumps straight to a phase. Desktop only: under 900px wide, no fine pointer or no WebGL, the chair stays decorative.

Keep modules short and readable; comment only what is non-obvious.
