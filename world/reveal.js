import THREE from './three.js';
import { config } from './config.js';
import { glyphAtlas, GLYPH_GLSL } from './ascii.js';

// The build-out: in the texture phase a front sweeps up through the room in world
// space, at world Y plus each material's userData.revealBias (so the door, window and
// lamp come after the walls, the ceiling last). Above the front nothing is drawn and
// the white void shows; at the front each surface turns into a thin band of blue
// glyphs on a grid laid on the surface, over its own texture and lighting (never on
// white, so the build-out has no white edge), thinning out below. Done by patching the room's own materials (onBeforeCompile);
// finish() puts them back exactly as they were.

const EDGE = 0.2; // metres of glyph band at the front
const HIDDEN = -1e3; // front height before the build-out: nothing drawn
const { size } = config.glyphs;
const CELL = [size * (2 / 3), size]; // glyph cells as big as the glyphs (ascii.js atlas aspect)
const f = (x) => x.toFixed(5);

const VARYINGS = /* glsl */ `
varying vec3 vRevealPos;
varying vec3 vRevealNormal;
`;
const UNIFORMS = /* glsl */ `
uniform float uReveal, uRevealBias, uRevealEdge;
uniform vec3 uRevealInk;
uniform sampler2D uRevealAtlas;
`;

const VERTEX = /* glsl */ `
  vec4 rvWorld = vec4(transformed, 1.0);
  vec3 rvNormal = normal;
  #ifdef USE_INSTANCING
    rvWorld = instanceMatrix * rvWorld;
    rvNormal = mat3(instanceMatrix) * rvNormal;
  #endif
  vRevealPos = (modelMatrix * rvWorld).xyz;
  rvNormal = mat3(modelMatrix) * rvNormal;
  vRevealNormal = dot(rvNormal, rvNormal) > 0.0 ? normalize(rvNormal) : vec3(0.0, 1.0, 0.0);
`;

// Start of the fragment shader: which glyph cell this is, and is the front past it yet?
const FRAGMENT_START = /* glsl */ `
  // The grid runs over the two world axes that lie most along the surface, upright on walls.
  vec3 rvN = abs(vRevealNormal), rvA, rvB;
  if (rvN.y >= max(rvN.x, rvN.z)) { rvA = vec3(1.0, 0.0, 0.0); rvB = vec3(0.0, 0.0, -sign(vRevealNormal.y)); }
  else if (rvN.x >= rvN.z) { rvA = vec3(0.0, 0.0, -sign(vRevealNormal.x)); rvB = vec3(0.0, 1.0, 0.0); }
  else { rvA = vec3(sign(vRevealNormal.z), 0.0, 0.0); rvB = vec3(0.0, 1.0, 0.0); }
  vec2 rvSt = vec2(dot(vRevealPos, rvA), dot(vRevealPos, rvB)) / vec2(${f(CELL[0])}, ${f(CELL[1])});
  vec2 rvCell = floor(rvSt);
  vec2 rvShift = (rvCell + 0.5 - rvSt) * vec2(${f(CELL[0])}, ${f(CELL[1])});
  vec3 rvCentre = vRevealPos + rvA * rvShift.x + rvB * rvShift.y;
  // Each cell turns over as a whole, when the front reaches its centre.
  float rvPast = uReveal - (rvCentre.y + uRevealBias + revealNoise(rvCentre));
  if (rvPast < 0.0) discard;
`;

// End of the fragment shader: at the front, glyphs over the lit surface, dense at
// first and thinning out.
const FRAGMENT_END = /* glsl */ `
  if (rvPast < ${f(EDGE)} && uRevealEdge > 0.5) {
    float rvK = rvPast / ${f(EDGE)};
    float rvDensity = clamp(1.0 - rvK + (rvHash(rvCentre * 7.31) - 0.5) * 0.6, 0.0, 1.0);
    float rvInk = texture2D(uRevealAtlas, glyphUv(1.0 + floor(rvDensity * (GLYPH_RAMP - 2.0)), rvSt - rvCell)).a;
    gl_FragColor.rgb = mix(gl_FragColor.rgb, uRevealInk, rvInk * (1.0 - smoothstep(0.55, 1.0, rvK)));
  }
`;

export function createReveal(room) {
  let atlas = glyphAtlas(false); // no mipmaps: the grid's cell seams would show the smallest one
  const shared = {
    uReveal: { value: HIDDEN },
    uRevealInk: { value: new THREE.Color(config.glyphs.ink) },
    uRevealAtlas: { value: atlas },
  };
  const patched = new Map(); // material → its own onBeforeCompile / customProgramCacheKey, if any

  function patch(m) {
    const before = m.onBeforeCompile;
    const key = m.customProgramCacheKey();
    const own = (name) => (Object.prototype.hasOwnProperty.call(m, name) ? m[name] : undefined);
    patched.set(m, { onBeforeCompile: own('onBeforeCompile'), customProgramCacheKey: own('customProgramCacheKey') });
    const uniforms = {
      ...shared,
      uRevealBias: { value: m.userData.revealBias ?? 0 },
      uRevealEdge: { value: m.transparent ? 0 : 1 }, // no glyph band on anything see-through
    };
    m.onBeforeCompile = (shader, renderer) => {
      before.call(m, shader, renderer);
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = VARYINGS + shader.vertexShader.replace('#include <project_vertex>', (chunk) => chunk + VERTEX);
      shader.fragmentShader = VARYINGS + UNIFORMS + GLYPH_GLSL + shader.fragmentShader
        .replace('void main() {', (start) => start + FRAGMENT_START)
        .replace('#include <dithering_fragment>', (chunk) => chunk + FRAGMENT_END);
    };
    m.customProgramCacheKey = () => key + '|reveal';
    m.needsUpdate = true;
  }

  // Glows (the lamp's halo, light on the walls) are left alone: the lamp's own setLevel fades them.
  room.group.traverse((o) => {
    if (!o.isMesh && !o.isLine) return;
    for (const m of [o.material].flat()) if (!m.isShaderMaterial && !m.userData.glow && !patched.has(m)) patch(m);
  });

  function finish() {
    if (!atlas) return;
    for (const [m, own] of patched) {
      for (const [name, value] of Object.entries(own)) {
        if (value) m[name] = value;
        else delete m[name]; // back to Material.prototype's
      }
      m.needsUpdate = true;
    }
    patched.clear();
    atlas.dispose();
    atlas = null;
  }

  return {
    set(h) { shared.uReveal.value = h; },
    finish,
    dispose: finish,
  };
}
