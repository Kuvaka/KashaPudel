// Cel shading in the style of the 2D sprites: three flat light bands, a warm light patch mask
// (muzzle, chest) and a dark brown outline drawn as an inflated back-face hull.
import * as THREE from 'three';

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

// Painted curls: a short C-shaped arc around each Worley cell centre on the part's sphere
// direction (stable while the stage morphs). Fades out when the curls get too small on screen.
const CURL_GLSL = `
vec3 curlHash(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453);
}
float curlStroke(vec3 dir) {
  if (dot(dir, dir) < 0.25) return 0.0; // parts without a sphere direction (leg tubes)
  vec3 p = dir * 4.2 + 3.0, i = floor(p), f = fract(p);
  float best = 9.0; vec3 off = vec3(0.0), h = vec3(0.0);
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z)), o = curlHash(i + g), r = g + o - f;
    float d = dot(r, r);
    if (d < best) { best = d; off = r; h = o; }
  }
  float d = sqrt(best), aa = max(fwidth(d), 1e-4);
  float ring = 1.0 - smoothstep(0.035, 0.035 + aa * 1.5, abs(d - 0.27));
  float arc = smoothstep(-0.3, 0.3, dot(normalize(-off), normalize(h - 0.5)));
  return ring * arc * (1.0 - smoothstep(0.05, 0.12, aa));
}
`;

// Toon coat. Vertex colour = crease shade; attribute `patch` (0..1) blends towards uPatch.
export function coatMaterial(color, patchColor = color) {
  const m = new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), vertexColors: true });
  m.userData.patch = { value: new THREE.Color(patchColor) };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPatch = m.userData.patch;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float furPatch;\nattribute vec3 outlineDir;\nvarying float vPatch;\nvarying vec3 vDir;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPatch = furPatch;\nvDir = outlineDir;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uPatch;\nvarying float vPatch;\nvarying vec3 vDir;\n' + CURL_GLSL)
      .replace('#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, uPatch * vColor.rgb, vPatch);\n' +
        'diffuseColor.rgb *= 1.0 - 0.2 * curlStroke(vDir);');
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
