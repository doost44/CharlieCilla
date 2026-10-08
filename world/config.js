// Every timing, count and colour of the chair world, in one place to tune.
const deg = (d) => (d * Math.PI) / 180;

export const config = {
  // Seconds per phase of the intro (see sequence.js). "free" has no end.
  durations: { sit: 0.3, swirl: 6, form: 6, texture: 4, hold: 1, collapse: 3.5, projects: 4 },
  fade: 0.5, // the page fading to white on E, and back to the site

  // The site's own colours (index.html :root).
  site: {
    paper: 0xffffff,
    text: 0x0d0d0d,
    muted: 0x3a3a3a,
    faint: 0x8a8a84,
    line: 0xdadada,
    blue: 0x1237c4,
    purple: 0x63239e,
  },

  // ASCII glyphs that swirl round the chair and then land on the room (ascii.js).
  glyphs: {
    count: 12000,
    edgeShare: 0.3, // the rest land on surfaces, shaded by a fake light
    size: 0.05, // metres
    swirlRadius: [1.2, 5],
    swirlHeight: 3,
    formSpread: 4, // seconds over which glyphs peel off the vortex
    formEach: 1.8, // seconds each glyph takes to fly to its spot
    ink: 0x1237c4, // the site's link blue, as the chair turns when selected
    lockInk: 0x0a2283, // a little darker once locked in place
  },

  // The bedroom set (room.js). The chair sits in the middle, facing the lamp corner.
  room: { width: 4.5, depth: 3.8, height: 2.4, wall: 0.12 },
  collapse: {
    mode: 'outward', // 'outward': whole walls fall away from the middle; 'split': each wall splits at its midpoint
    order: ['back', 'left', 'right', 'front'],
    stagger: 0.25,
    fall: 1.4,
  },

  chair: { scale: 1.15 },
  seatedEye: 0.75, // eye height above the seat
  introLook: { yaw: deg(40), pitch: deg(25) }, // how far the head turns while the room forms

  // The warehouse hall the room stands in (warehouse.js).
  hall: { width: 70, depth: 45, height: 9 },
  walk: { speed: 4.5, run: 7.5, eye: 1.7, radius: 0.35 },

  font: '"IBM Plex Mono", ui-monospace, Menlo, monospace',
  serif: '"IBM Plex Serif", Georgia, "Times New Roman", serif',
};
