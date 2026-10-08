import { config } from './config.js';

// The intro, as a chain of phases (timings in config.durations):
//   sit → swirl → form → texture → hold → collapse → projects → free
// Each phase can have start(instant), update(t, k, dt) with k going 0..1, and finish(),
// which must leave the world exactly as if the phase had played out. That is what
// lets jump() skip ahead (the skip key, reduced motion, and ?phase= for testing).

export const PHASES = ['sit', 'swirl', 'form', 'texture', 'hold', 'collapse', 'projects', 'free'];
const SKIPPABLE = new Set(['sit', 'swirl', 'form', 'texture', 'hold', 'collapse']);

export function createSequence(handlers) {
  let index = -1;
  let t = 0;

  function begin(i) {
    index = i;
    t = 0;
    handlers[PHASES[i]]?.start?.(false);
  }

  // Finish the current phase, play every phase up to `name` instantly, then begin it.
  function jump(name) {
    const target = PHASES.indexOf(name);
    if (target <= index) return;
    if (index >= 0) handlers[PHASES[index]]?.finish?.();
    for (let i = index + 1; i < target; i++) {
      handlers[PHASES[i]]?.start?.(true); // instant: no sounds
      handlers[PHASES[i]]?.finish?.();
    }
    begin(target);
  }

  return {
    get phase() { return PHASES[index]; },
    get intro() { return SKIPPABLE.has(PHASES[index]); },
    start: (name = 'sit') => jump(PHASES.includes(name) ? name : 'sit'),
    jump,
    skip() { if (SKIPPABLE.has(PHASES[index])) jump('projects'); },
    update(dt) {
      if (index < 0) return;
      const name = PHASES[index];
      const duration = config.durations[name] ?? Infinity;
      t += dt;
      handlers[name]?.update?.(Math.min(t, duration), Math.min(1, t / duration), dt);
      if (t >= duration) jump(PHASES[index + 1]);
    },
  };
}
