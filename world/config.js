// Every timing, count and colour of the chair world, in one place to tune.
export const config = {
  // Seconds per phase of the intro (see sequence.js). "free" has no end.
  durations: { sit: 1.2, swirl: 6.3, form: 5, texture: 2.5, hold: 1, collapse: 3, projects: 3.5 },
  fade: 0.5, // the page fading to black on E, and to white on the way back

  // ASCII glyphs that swirl round the chair and then draw the room (ascii.js).
  glyphs: {
    count: 5000,
    edgeShare: 0.4, // the rest land on surfaces, shaded by a fake light
    size: 0.15, // metres
    swirlRadius: [1.5, 6],
    swirlHeight: 3.6,
    formSpread: 3.4, // seconds over which glyphs peel off the vortex
    formEach: 1.6, // seconds each glyph takes to fly to its spot
    ink: 0xffb43c,
    lockInk: 0xffe4a8, // a little brighter once locked in place
  },

  // The suburban room set (room.js). The chair sits in the middle.
  room: { width: 6, depth: 5, height: 2.6, wall: 0.12 },
  collapse: {
    mode: 'outward', // 'outward': whole walls fall away from the middle; 'split': each wall splits at its midpoint
    order: ['back', 'left', 'right', 'front'],
    stagger: 0.25,
    fall: 1.4,
  },

  chair: { scale: 1.15, turn: 0 },
  seatedEye: 0.75, // eye height above the seat

  // Project orbs (projects.js): the same band as Automation Map's "chosen by me" orbs.
  orbits: { radius: [13, 20], height: [1.5, 10], speed: 0.018 },
  orbSize: [1.1, 1.6], // oldest to newest project
  palette: [0xe0503c, 0xe8a33a, 0x7fc24a, 0x4fa3c9, 0xb06ad8, 0x3ad6b8, 0xd8d24a, 0x6c7cf4, 0xf06aa8],

  amber: '#ffb43c',
  font: '"IBM Plex Mono", ui-monospace, Menlo, monospace',
};
