// Cel shading in the style of the 2D sprites: three flat light bands, a warm light patch mask
// (muzzle, chest) and a dark brown outline drawn as an inflated back-face hull.
import * as THREE from 'three';
import { HEAD_LOCKS, BODY_LOCKS } from './locks.js';

export const OUTLINE_COLOR = '#4a2a18';

let gradient = null;
function gradientMap() {
  if (gradient) return gradient;
  gradient = new THREE.DataTexture(new Uint8Array([150, 205, 255]), 3, 1, THREE.RedFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

// Ink arcs inside the big locks, like the concept's curl lines: the same lock centres as the
// baked lumps (locks.js), an arc of ~100 degrees on the combed side of each lock, a constant
// pixel width, fading out when the dog is small on screen. Only on head (set 1) and body (2).
const NH = HEAD_LOCKS.seeds.length, NB = BODY_LOCKS.seeds.length, NL = NH + NB;
export const LOCK_UNIFORMS = {
  uLockSeed: { value: [...HEAD_LOCKS.seeds, ...BODY_LOCKS.seeds] },
  uGuide: { value: [...HEAD_LOCKS.guides, ...BODY_LOCKS.guides] },
  uInk: { value: [...HEAD_LOCKS.ink, ...BODY_LOCKS.ink] },
  uHalfWidthPx: { value: 0.8 },   // half of 1.6 CSS px, times the device pixel ratio
  uInsetE: { value: 0.06 },       // the arc runs a little inside the lock, not on the border
  uInkColor: { value: new THREE.Color(OUTLINE_COLOR) },
};
const LOCK_GLSL = `
#define NH ${NH}
#define NL ${NL}
uniform vec3 uLockSeed[NL];
uniform vec3 uGuide[NL];
uniform float uInk[NL];
uniform float uHalfWidthPx;
uniform float uInsetE;
uniform vec3 uInkColor;
float lockInk(vec3 dir, float set, float allow) {
  if (set < 0.5) return 0.0;
  vec3 p = normalize(dir);
  int i0 = set < 1.5 ? 0 : NH, i1 = set < 1.5 ? NH : NL;
  float f1 = 1e10, f2 = 1e10, on = 0.0;
  vec3 nearest = vec3(0.0), guide = vec3(0.0, 1.0, 0.0);
  for (int i = 0; i < NL; i++) {
    if (i < i0 || i >= i1) continue;
    vec3 q = p - uLockSeed[i]; float d = dot(q, q);
    if (d < f1) { f2 = f1; f1 = d; nearest = uLockSeed[i]; guide = uGuide[i]; on = uInk[i]; }
    else if (d < f2) f2 = d;
  }
  float E = sqrt(f2) - sqrt(f1);
  float pixelE = max(length(vec2(dFdx(E), dFdy(E))), 1e-5);
  float stroke = 1.0 - smoothstep(max(0.0, uHalfWidthPx - 0.5), uHalfWidthPx + 0.5, abs(E - uInsetE) / pixelE);
  vec3 axis = normalize(nearest), off = p - nearest; off -= axis * dot(off, axis);
  vec3 flow = guide - axis * dot(guide, axis);
  float cosArc = dot(off, flow) * inversesqrt(max(dot(off, off) * dot(flow, flow), 1e-8));
  float arc = smoothstep(0.25, 0.5, cosArc);
  float lod = 1.0 - smoothstep(0.06, 0.14, pixelE);
  return stroke * arc * lod * on * clamp(allow, 0.0, 1.0);
}
`;

// Toon coat. Vertex colour = crease shade; attribute `patch` (0..1) blends towards uPatch.
// Marble coat: 4 dark and 1 caramel patch on the body, by direction from its middle.
const SPOT_GLSL = `
uniform float uSpotOn;
uniform vec3 uSpotA, uSpotB;
float spot(vec3 d, vec3 c, float r, float w) { return smoothstep(-0.02, 0.02, dot(d, normalize(c)) - cos(r) + w); }
vec3 spots(vec3 col, vec3 shade, float k) {
  vec3 d = normalize(vBase);
  float w = 0.05 * sin(dot(d, vec3(13.0, 9.0, 11.0))) + 0.04 * sin(dot(d, vec3(-7.0, 17.0, 5.0)));
  float a = max(max(spot(d, vec3(-0.62, 0.45, 0.64), 0.5, w), spot(d, vec3(-0.45, -0.25, 0.86), 0.4, w)),
                max(spot(d, vec3(0.2, -0.35, -0.9), 0.45, w), spot(d, vec3(-0.3, 0.9, -0.35), 0.42, w)));
  float b = spot(d, vec3(0.4, 0.3, 0.86), 0.42, w) * (1.0 - a);
  col = mix(col, uSpotA * shade, a * k);
  return mix(col, uSpotB * shade, b * k);
}
`;

export function coatMaterial(color, patchColor = color) {
  const m = new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), vertexColors: true });
  m.userData.patch = { value: new THREE.Color(patchColor) };
  m.userData.spots = { on: { value: 0 }, a: { value: new THREE.Color() }, b: { value: new THREE.Color() } };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPatch = m.userData.patch;
    sh.uniforms.uSpotOn = m.userData.spots.on; sh.uniforms.uSpotA = m.userData.spots.a; sh.uniforms.uSpotB = m.userData.spots.b;
    Object.assign(sh.uniforms, LOCK_UNIFORMS);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float furPatch;\nattribute vec3 outlineDir;\nattribute vec2 lockInfo;\nvarying float vPatch;\nvarying vec3 vDir;\nvarying vec2 vLock;\nvarying vec3 vBase;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPatch = furPatch;\nvDir = outlineDir;\nvLock = lockInfo;\nvBase = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uPatch;\nvarying float vPatch;\nvarying vec3 vDir;\nvarying vec2 vLock;\nvarying vec3 vBase;\n' + SPOT_GLSL + LOCK_GLSL)
      .replace('#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, uPatch * vColor.rgb, vPatch);\nif (uSpotOn > 0.5) diffuseColor.rgb = spots(diffuseColor.rgb, vColor.rgb, 1.0 - vPatch);')
      .replace('#include <opaque_fragment>',
        '#include <opaque_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, uInkColor, 0.7 * lockInk(vDir, vLock.x, vLock.y));');
  };
  m.customProgramCacheKey = () => 'coat';
  return m;
}

// Plain toon for small parts (paws, crown...).
export function toonMaterial(color) {
  return new THREE.MeshToonMaterial({ color, gradientMap: gradientMap() });
}

// Outline: back faces pushed out along the screen-space normal by a constant pixel width, so
// thin parts and big dogs get the same line. Works with morph targets.
export function outlineMaterial(radial = false) {
  return new THREE.ShaderMaterial({
    defines: radial ? { RADIAL: '' } : {},
    uniforms: {
      uPx: { value: 2 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uColor: { value: new THREE.Color(OUTLINE_COLOR) },
    },
    vertexShader: `
      #include <common>
      #include <morphtarget_pars_vertex>
      uniform float uPx;
      uniform vec2 uRes;
      #ifdef RADIAL
      attribute vec3 outlineDir;
      #endif
      void main() {
        #include <morphinstance_vertex>
        #include <beginnormal_vertex>
        #include <morphnormal_vertex>
        #include <begin_vertex>
        #include <morphtarget_vertex>
        #include <project_vertex>
        vec3 od = objectNormal;
        #ifdef RADIAL
        // Lobed fur: push along the smooth radial direction, not the lobe normal, so the
        // creases between curls don't poke through as cracks.
        od = outlineDir;
        #endif
        #ifdef USE_INSTANCING
        od = mat3(instanceMatrix) * od;
        #endif
        vec3 vn = normalize(normalMatrix * od);
        vec2 sn = (projectionMatrix * vec4(vn, 0.0)).xy;
        float l = length(sn);
        if (l > 1e-5) gl_Position.xy += sn / l * uPx * 2.0 / uRes * gl_Position.w;
        gl_Position.z += 0.0015 * gl_Position.w; // keep the hull behind the body: lines only at the rim
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      void main() {
        gl_FragColor = vec4(uColor, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
  });
}

// Adds an outline twin as a child of `mesh` (same transform, shares morph weights).
export function outline(mesh, mat, radialMat = mat) {
  if (mesh.geometry.attributes.outlineDir && mesh.geometry.userData.radialOutline !== false) mat = radialMat;
  const o = new THREE.Mesh(mesh.geometry, mat);
  if (mesh.morphTargetInfluences) o.morphTargetInfluences = mesh.morphTargetInfluences;
  mesh.add(o);
  return o;
}
