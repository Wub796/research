"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/* ------------------------------------------------------------------ *
 * HERO — "THE ANCHORAGE", a procedural ring megastructure.
 *
 * Deliberately abstract artwork (the mission console below the fold owns
 * the research). One InstancedMesh carries the whole built environment:
 *
 *   - ~7,000 instanced buildings: two city bands wrapped around a giant
 *     ring (R=10), a tapered central spire, and eight radial bridges —
 *     every box gets procedural window lights (per-instance hash grid),
 *     ink-stroke edges, and paper-colored aerial-perspective fog so the
 *     piece reads on both the dark and inverted (white paper) themes
 *   - a floating black monolith above the spire (fresnel edge, slow spin)
 *   - ~120 drones on individual inclined orbits (3 instanced draw calls)
 *   - blinking beacon lights, suspension cables, a debris torus, stars
 *
 * Interaction contract (unchanged from the verified revisions):
 *   - drag to orbit (inertia + idle drift); `touch-action: pan-y` keeps
 *     vertical swipes scrolling the page; no wheel listeners at all
 *   - click → a light-wave races around the ring's circumference,
 *     flashing windows and beacons in sequence as it passes
 *   - scroll → a keyframed flythrough: establishing shot → dive along
 *     the city → rise past the monolith → top-down blueprint view
 *   - IntersectionObserver pause, rAF-starvation timer fallback,
 *     invert-theme re-ink, reduced-motion static render, full disposal
 * ------------------------------------------------------------------ */

const ACCENT_A = new THREE.Color("#39bdf8");
const ACCENT_B = new THREE.Color("#fb6048");
const RING_R = 10;
const TUBE = 1.4;

function readVar(name: string, fallback: string): THREE.Color {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) return new THREE.Color(`#${hex[1]}`);
  const rgb = value.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (rgb) return new THREE.Color(Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255);
  return new THREE.Color(fallback);
}
const readInk = () => readVar("--ink", "#ffffff");
const readPaper = () => readVar("--paper", "#000000");

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function glowTexture(inner: string, outer: string) {
  const el = document.createElement("canvas");
  el.width = 128; el.height = 128;
  const ctx = el.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
    g.addColorStop(0, inner);
    g.addColorStop(0.42, outer);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(el);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ------------------------------------------------------------------ *
 * GLSL
 * ------------------------------------------------------------------ */
const HASH_GLSL = /* glsl */ `
float hash12(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`;

const CITY_VERT = /* glsl */ `
attribute float aSeed;
attribute float aAngle;
attribute float aKind;
uniform float uPulse;
uniform float uPulseOrigin;
varying vec3 vLocal;
varying vec3 vScale;
varying vec3 vNrm;
varying vec3 vFaceN;
varying vec3 vWorldPos;
varying float vSeed;
varying float vAngle;
varying float vKind;
void main(){
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  /* the pulse physically lifts the buildings it passes through */
  float age = max(uPulse, 0.0);
  float aDist = abs(mod(aAngle - (uPulseOrigin + age * 4.4) + 3.14159265, 6.28318531) - 3.14159265);
  float lift = exp(-aDist * aDist * 9.0) * exp(-age * 1.2) * step(0.0, uPulse) * smoothstep(0.0, 0.12, age);
  wp.y += lift * 0.42;
  vec3 sc = vec3(
    length(instanceMatrix[0].xyz),
    length(instanceMatrix[1].xyz),
    length(instanceMatrix[2].xyz)
  );
  vLocal = position * sc;
  vScale = sc;
  vNrm = normalize(mat3(modelMatrix) * (mat3(instanceMatrix) * normal));
  vFaceN = normal;
  vWorldPos = wp.xyz;
  vSeed = aSeed;
  vAngle = aAngle;
  vKind = aKind;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const CITY_FRAG = /* glsl */ `
uniform vec3 uInk;
uniform vec3 uPaper;
uniform vec3 uAccentA;
uniform vec3 uAccentB;
uniform float uTime;
uniform float uPulse;
uniform float uPulseOrigin;
uniform float uFogNear;
uniform float uFogFar;
uniform float uBeamAngle;
uniform float uSpin;
varying vec3 vLocal;
varying vec3 vScale;
varying vec3 vNrm;
varying vec3 vFaceN;
varying vec3 vWorldPos;
varying float vSeed;
varying float vAngle;
varying float vKind;
${HASH_GLSL}
void main(){
  /* window grid on side faces of the unit box, scaled to the instance */
  float side = 1.0 - step(0.5, abs(vFaceN.y));
  float colCoord = mix(vLocal.x, vLocal.z, step(0.5, abs(vFaceN.x)));
  float rowD = vKind < 0.5 ? 4.5 : 6.0;
  vec2 cell = vec2(floor(colCoord * 7.0), floor((vLocal.y + vScale.y * 0.5) * rowD));
  float h = hash12(cell + vSeed * 137.0);
  float lit = step(0.52, h) * side * step(0.22, vScale.y);

  /* pulse wave racing around the ring circumference */
  float age = max(uPulse, 0.0);
  float angDist = abs(mod(vAngle - (uPulseOrigin + age * 4.4) + 3.14159265, 6.28318531) - 3.14159265);
  float wave = exp(-angDist * angDist * 10.0) * exp(-age * 1.1) * step(0.0, uPulse);

  /* stylized lighting: key light + sky top-light + ink edges */
  float diff = max(dot(normalize(vNrm), normalize(vec3(0.5, 0.85, 0.4))), 0.0);
  float topLight = clamp(vNrm.y, 0.0, 1.0) * 0.22;
  vec3 body = mix(vec3(0.035, 0.048, 0.07), vec3(0.15, 0.19, 0.26), diff + topLight);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float rim = pow(1.0 - abs(dot(normalize(vNrm), V)), 2.2);
  vec3 col = mix(body, uInk, rim * 0.5);

  /* windows: paper-colored light, rare accents */
  vec3 winCol = uPaper;
  winCol = mix(winCol, uAccentA, step(0.962, h));
  winCol = mix(winCol, uAccentB, step(0.984, h));
  float flicker = 0.78 + 0.22 * sin(uTime * 1.9 + h * 43.0);
  /* the scanner beam sweeping the pointer's angle energizes nearby windows */
  float bDist = abs(mod(vAngle - uBeamAngle + 3.14159265, 6.28318531) - 3.14159265);
  float beam = exp(-bDist * bDist * 16.0);
  float winGlow = lit * flicker * (1.0 + beam * 1.2 + uSpin * 0.3);
  col = mix(col, winCol, winGlow * 0.9);
  col += uInk * beam * 0.1;

  /* wave flash: windows bloom and edges catch light as the front passes */
  col += (uInk * 0.55 + winCol) * wave * (0.3 + winGlow * 1.6);

  /* aerial perspective toward the paper color, graded to camera distance */
  float fogF = smoothstep(uFogNear, uFogFar, length(vWorldPos - cameraPosition));
  col = mix(col, uPaper, fogF);
  gl_FragColor = vec4(col, 1.0);
}
`;

const MONOLITH_FRAG = /* glsl */ `
uniform vec3 uInk;
uniform vec3 uPaper;
uniform float uPulse;
uniform float uFogNear;
uniform float uFogFar;
varying vec3 vNrm;
varying vec3 vWorldPos;
void main(){
  vec3 N = normalize(vNrm);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float fres = pow(1.0 - abs(dot(N, V)), 3.0);
  float pulse = exp(-max(uPulse, 0.0) * 1.4) * step(0.0, uPulse);
  vec3 col = vec3(0.008, 0.01, 0.016);
  col += uInk * fres * (1.1 + pulse * 1.6);
  float fogF = smoothstep(uFogNear, uFogFar, length(vWorldPos - cameraPosition));
  col = mix(col, uPaper, fogF);
  gl_FragColor = vec4(col, 1.0);
}
`;

const MONO_VERT = /* glsl */ `
varying vec3 vNrm;
varying vec3 vWorldPos;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vNrm = normalize(mat3(modelMatrix) * normal);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const BEACON_VERT = /* glsl */ `
attribute float aPhase;
attribute float aAngle;
attribute float aTint;
uniform float uTime;
uniform float uPixelRatio;
uniform float uPulse;
uniform float uPulseOrigin;
varying float vTint;
varying float vBright;
varying vec3 vWorld;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mv = viewMatrix * wp;
  float tw = 0.5 + 0.5 * sin(uTime * (1.5 + fract(aPhase) * 2.2) + aPhase * 17.0);
  float age = max(uPulse, 0.0);
  float angDist = abs(mod(aAngle - (uPulseOrigin + age * 4.4) + 3.14159265, 6.28318531) - 3.14159265);
  float wave = exp(-angDist * angDist * 10.0) * exp(-age * 1.1) * step(0.0, uPulse);
  vBright = 0.35 + 0.65 * tw + wave * 3.0;
  vTint = aTint;
  gl_PointSize = (1.1 + tw * 1.4 + wave * 2.2) * uPixelRatio * (26.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;

const BEACON_FRAG = /* glsl */ `
uniform vec3 uInk;
uniform vec3 uAccentA;
uniform vec3 uAccentB;
uniform vec3 uPaper;
uniform float uFogNear;
uniform float uFogFar;
varying float vTint;
varying float vBright;
varying vec3 vWorld;
void main(){
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;
  float soft = smoothstep(0.5, 0.08, d);
  vec3 col = vTint < 0.25 ? uInk : (vTint < 0.7 ? uAccentA : uAccentB);
  float fogF = smoothstep(uFogNear, uFogFar, length(vWorld - cameraPosition));
  col = mix(col, uPaper, fogF * 0.6);
  gl_FragColor = vec4(col, soft * clamp(vBright, 0.0, 1.0));
}
`;

const BEAM_VERT = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const BEAM_FRAG = /* glsl */ `
uniform vec3 uInk;
uniform float uOpacity;
varying vec2 vUv;
void main(){
  float fade = (1.0 - vUv.x) * smoothstep(0.0, 0.14, vUv.x);
  float edge = smoothstep(0.5, 0.12, abs(vUv.y - 0.5));
  gl_FragColor = vec4(uInk, uOpacity * fade * edge);
}
`;

/* ------------------------------------------------------------------ *
 * placement helpers
 * ------------------------------------------------------------------ */
function torusPoint(u: number, v: number, out: THREE.Vector3) {
  out.set(
    (RING_R + TUBE * Math.cos(v)) * Math.cos(u),
    TUBE * Math.sin(v),
    (RING_R + TUBE * Math.cos(v)) * Math.sin(u),
  );
  return out;
}
function torusNormal(u: number, v: number, out: THREE.Vector3) {
  out.set(Math.cos(v) * Math.cos(u), Math.sin(v), Math.cos(v) * Math.sin(u));
  return out;
}
const UP = new THREE.Vector3(0, 1, 0);
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();

export default function HeroBlob() {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let raf = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const small = window.innerWidth < 900 || "ontouchstart" in window;

    /* ---------- DOM: canvas + HUD ---------- */
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    Object.assign(canvas.style, {
      position: "absolute", inset: "0", width: "100%", height: "100%", display: "block", opacity: "0",
      transition: "opacity 1.2s ease",
    });
    host.appendChild(canvas);
    requestAnimationFrame(() => { canvas.style.opacity = "1"; });

    const ui = document.createElement("div");
    ui.className = "hero-orb__ui";
    ui.setAttribute("aria-hidden", "true");
    host.appendChild(ui);

    const chip = document.createElement("div");
    chip.className = "hero-orb__chip";
    chip.innerHTML = `<span class="hero-orb__chip-mode">OBJ // THE ANCHORAGE</span><span class="hero-orb__chip-tele">INST ----- · DRONES --- · -- FPS</span>`;
    ui.appendChild(chip);

    const hint = document.createElement("div");
    hint.className = "hero-orb__hint";
    hint.textContent = "DRAG // SPIN — CLICK // SHOCKWAVE — SCROLL // FLYTHROUGH";
    ui.appendChild(hint);

    /* ---------- renderer / scene / camera ---------- */
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(pixelRatio);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(readPaper().getHex(), 26, 74);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 220);
    const structure = new THREE.Group();
    scene.add(structure);

    const inkColors = { main: readInk(), paper: readPaper() };
    const inkMaterials: Array<THREE.Material & { color: THREE.Color }> = [];
    const trackInk = <T extends THREE.Material & { color: THREE.Color }>(m: T): T => {
      m.color.copy(inkColors.main);
      inkMaterials.push(m);
      return m;
    };

    const disposables: Array<{ dispose: () => void }> = [];
    const keep = <T extends { dispose: () => void }>(x: T): T => { disposables.push(x); return x; };

    /* ---------- starfields ---------- */
    const starField = (count: number, radius: number, size: number, seed: number) => {
      const pos = new Float32Array(count * 3);
      const rnd = mulberry32(seed);
      for (let i = 0; i < count; i += 1) {
        const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2;
        const s = Math.sqrt(1 - u * u);
        pos[i * 3] = Math.cos(th) * s * radius;
        pos[i * 3 + 1] = u * radius * 0.85;
        pos[i * 3 + 2] = Math.sin(th) * s * radius;
      }
      const geo = keep(new THREE.BufferGeometry());
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const mat = trackInk(keep(new THREE.PointsMaterial({
        size, sizeAttenuation: true, transparent: true, opacity: 0.5, depthWrite: false,
      })));
      mat.fog = false;
      const pts = new THREE.Points(geo, mat);
      pts.renderOrder = -2;
      scene.add(pts);
      return pts;
    };
    const starsA = starField(1500, 90, 0.17, 11);
    const starsB = starField(450, 120, 0.26, 23);

    /* ---------- THE CITY: one InstancedMesh for every built box ---------- */
    const rnd = mulberry32(4242);
    const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;

    type Inst = { pos: THREE.Vector3; up: THREE.Vector3; scale: THREE.Vector3; kind: number };
    const instances: Inst[] = [];
    const dummy = new THREE.Object3D();
    const spawn = (pos: THREE.Vector3, up: THREE.Vector3, sx: number, sy: number, sz: number, kind: number) => {
      instances.push({ pos, up, scale: new THREE.Vector3(sx, sy, sz), kind });
    };

    // ring city — outer band, inner band, sparse top band
    const ringCount = small ? 3200 : 5400;
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (let i = 0; i < ringCount; i += 1) {
      const u = (i / ringCount) * Math.PI * 2 + gauss() * 0.0012;
      const bandRoll = rnd();
      let v: number;
      let hMin = 0.2, hMax = 1.15;
      if (bandRoll < 0.62) { v = gauss() * 0.5; }                       // outer equator
      else if (bandRoll < 0.9) { v = Math.PI + gauss() * 0.42; hMin = 0.18; hMax = 0.9; } // inner band
      else { v = (rnd() < 0.5 ? 1 : -1) * (1.25 + rnd() * 0.35); hMin = 0.12; hMax = 0.6; } // top/bottom
      torusPoint(u, v, p);
      torusNormal(u, v, n);
      const tall = rnd() < 0.045;
      const h = tall ? 1.9 + rnd() * 1.3 : hMin + rnd() * (hMax - hMin);
      const w = 0.1 + rnd() * 0.2;
      p.addScaledVector(n, h / 2);
      spawn(p.clone(), n.clone(), w, h, w * (0.7 + rnd() * 0.8), 0);
      if (tall && rnd() < 0.6) {
        p.addScaledVector(n, h / 2 + 0.14);
        spawn(p.clone(), n.clone(), w * 0.5, 0.3, w * 0.5, 0);
        p.addScaledVector(n, -(h / 2 + 0.14));
      }
    }

    // 8 capital towers at the spoke junctions — orientation landmarks
    for (let k = 0; k < 8; k += 1) {
      const u = (k / 8) * Math.PI * 2;
      torusPoint(u, 0, p);
      torusNormal(u, 0, n);
      const h = 2.4 + rnd() * 1.1;
      p.addScaledVector(n, h / 2 + 0.1);
      spawn(p.clone(), n.clone(), 0.42, h, 0.42, 0);
    }

    // central spire — tapering stack of box levels
    const spireLevels = small ? 40 : 62;
    let spireY = 0;
    for (let lvl = 0; lvl < spireLevels; lvl += 1) {
      const f = lvl / spireLevels;
      const rad = 1.7 * (1 - f) * (1 - f) + 0.22;
      const lh = 0.075;
      const per = Math.max(3, Math.round(8 * (1 - f) + 2));
      for (let k = 0; k < per; k += 1) {
        const a = (k / per) * Math.PI * 2 + lvl * 0.35;
        const rr = rad * (0.55 + rnd() * 0.45);
        spawn(
          new THREE.Vector3(Math.cos(a) * rr, spireY + lh / 2, Math.sin(a) * rr),
          UP.clone(),
          0.1 + rnd() * 0.18, lh * (0.8 + rnd() * 0.9), 0.1 + rnd() * 0.18,
          1,
        );
      }
      spireY += lh;
    }
    // spire mast
    spawn(new THREE.Vector3(0, spireY + 0.5, 0), UP.clone(), 0.06, 1.0, 0.06, 1);

    // radial bridges — truss decks from spire to ring
    const bridgeSegs = 46;
    for (let k = 0; k < 8; k += 1) {
      const a = (k / 8) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      for (let s = 0; s < bridgeSegs; s += 1) {
        const rr = 2.3 + (s / bridgeSegs) * 7.0;
        const py = 0.32 + Math.sin((s / bridgeSegs) * Math.PI) * 0.5;
        spawn(
          new THREE.Vector3(dir.x * rr, py, dir.z * rr),
          UP.clone(),
          0.34, 0.07, 0.11,
          2,
        );
        if (s % 9 === 4) {
          spawn(
            new THREE.Vector3(dir.x * rr, py + 0.28, dir.z * rr),
            UP.clone(),
            0.09, 0.5, 0.09,
            2,
          );
        }
      }
    }

    /* build the InstancedMesh — one draw call for the whole built world.
       `instanceMatrix` is auto-declared by three's vertex prefix when
       rendering an InstancedMesh, so the custom shader reads it directly. */
    const total = instances.length;
    const cityGeo = keep(new THREE.BoxGeometry(1, 1, 1));
    const seeds = new Float32Array(total);
    const angles = new Float32Array(total);
    const kinds = new Float32Array(total);
    const cityUniforms = {
      uTime: { value: 0 },
      uPulse: { value: 99 },
      uPulseOrigin: { value: 0 },
      uFogNear: { value: 24 },
      uFogFar: { value: 72 },
      uBeamAngle: { value: 0 },
      uSpin: { value: 0 },
      uInk: { value: inkColors.main.clone() },
      uPaper: { value: inkColors.paper.clone() },
      uAccentA: { value: ACCENT_A },
      uAccentB: { value: ACCENT_B },
    };
    const city = new THREE.InstancedMesh(cityGeo, keep(new THREE.ShaderMaterial({
      vertexShader: CITY_VERT,
      fragmentShader: CITY_FRAG,
      uniforms: cityUniforms,
    })), total);
    instances.forEach((inst, i) => {
      dummy.position.copy(inst.pos);
      _v1.copy(inst.up);
      if (Math.abs(_v1.y) > 0.98) _v1.set(0.13, _v1.y, 0.07).normalize();
      _q.setFromUnitVectors(UP, _v1);
      dummy.quaternion.copy(_q);
      dummy.rotateY(rnd() * Math.PI * 2);
      dummy.scale.copy(inst.scale);
      dummy.updateMatrix();
      city.setMatrixAt(i, dummy.matrix);
      angles[i] = Math.atan2(inst.pos.z, inst.pos.x);
      seeds[i] = rnd();
      kinds[i] = inst.kind;
    });
    city.instanceMatrix.needsUpdate = true;
    cityGeo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
    cityGeo.setAttribute("aAngle", new THREE.InstancedBufferAttribute(angles, 1));
    cityGeo.setAttribute("aKind", new THREE.InstancedBufferAttribute(kinds, 1));
    city.frustumCulled = false;
    keep({ dispose: () => city.dispose() });
    structure.add(city);

    /* ---------- beacons ---------- */
    const beaconCount = small ? 260 : 460;
    const bPos = new Float32Array(beaconCount * 3);
    const bPhase = new Float32Array(beaconCount);
    const bAngle = new Float32Array(beaconCount);
    const bTint = new Float32Array(beaconCount);
    const brnd = mulberry32(777);
    for (let i = 0; i < beaconCount; i += 1) {
      let bp: THREE.Vector3;
      if (i < beaconCount * 0.62) {
        // on tall ring buildings: resample their positions
        const u = brnd() * Math.PI * 2;
        const v = brnd() < 0.75 ? gauss() * 0.5 : Math.PI + gauss() * 0.42;
        torusPoint(u, v, p);
        torusNormal(u, v, n);
        bp = p.clone().addScaledVector(n, 1.15 + brnd() * 0.75);
        bAngle[i] = u;
      } else if (i < beaconCount * 0.82) {
        // spire
        const hh = brnd() * spireY;
        const a = brnd() * Math.PI * 2;
        const rr = (1 - hh / spireY) * 1.4 + 0.15;
        bp = new THREE.Vector3(Math.cos(a) * rr, hh, Math.sin(a) * rr);
        bAngle[i] = a;
      } else {
        // bridge pylons
        const k = Math.floor(brnd() * 8);
        const a = (k / 8) * Math.PI * 2;
        const rr = 3 + brnd() * 6.2;
        bp = new THREE.Vector3(Math.cos(a) * rr, 0.75, Math.sin(a) * rr);
        bAngle[i] = a;
      }
      bPos.set([bp.x, bp.y, bp.z], i * 3);
      bPhase[i] = brnd() * 100;
      const t = brnd();
      bTint[i] = t < 0.68 ? 0 : t < 0.88 ? 0.5 : 1;
    }
    const beaconGeo = keep(new THREE.BufferGeometry());
    beaconGeo.setAttribute("position", new THREE.BufferAttribute(bPos, 3));
    beaconGeo.setAttribute("aPhase", new THREE.BufferAttribute(bPhase, 1));
    beaconGeo.setAttribute("aAngle", new THREE.BufferAttribute(bAngle, 1));
    beaconGeo.setAttribute("aTint", new THREE.BufferAttribute(bTint, 1));
    const beaconUniforms = {
      uTime: { value: 0 },
      uPulse: { value: 99 },
      uPulseOrigin: { value: 0 },
      uPixelRatio: { value: pixelRatio },
      uFogNear: { value: 24 },
      uFogFar: { value: 72 },
      uInk: { value: inkColors.main.clone() },
      uPaper: { value: inkColors.paper.clone() },
      uAccentA: { value: ACCENT_A },
      uAccentB: { value: ACCENT_B },
    };
    const beacons = new THREE.Points(beaconGeo, keep(new THREE.ShaderMaterial({
      vertexShader: BEACON_VERT,
      fragmentShader: BEACON_FRAG,
      uniforms: beaconUniforms,
      transparent: true,
      depthWrite: false,
    })));
    beacons.renderOrder = 4;
    structure.add(beacons);

    /* ---------- monolith ---------- */
    const monoUniforms = {
      uPulse: { value: 99 },
      uFogNear: { value: 24 },
      uFogFar: { value: 72 },
      uInk: { value: inkColors.main.clone() },
      uPaper: { value: inkColors.paper.clone() },
    };
    const monolith = new THREE.Mesh(
      keep(new THREE.BoxGeometry(0.95, 2.5, 0.3)),
      keep(new THREE.ShaderMaterial({
        vertexShader: MONO_VERT,
        fragmentShader: MONOLITH_FRAG,
        uniforms: monoUniforms,
      })),
    );
    monolith.position.set(0, spireY + 1.7, 0);
    scene.add(monolith);

    /* ---------- suspension cables (spire mast → ring) ---------- */
    const cablePts: THREE.Vector3[] = [];
    for (let k = 0; k < 8; k += 1) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      const from = new THREE.Vector3(0, spireY + 0.9, 0);
      const to = new THREE.Vector3(Math.cos(a) * RING_R, TUBE * 0.55, Math.sin(a) * RING_R);
      for (let s = 0; s < 22; s += 1) {
        const t0 = s / 22, t1 = (s + 1) / 22;
        const pt = (t: number) => {
          const sag = Math.sin(t * Math.PI) * 0.55;
          return new THREE.Vector3().lerpVectors(from, to, t).add(new THREE.Vector3(0, -sag, 0));
        };
        cablePts.push(pt(t0), pt(t1));
      }
    }
    const cableGeo = keep(new THREE.BufferGeometry().setFromPoints(cablePts));
    const cables = new THREE.LineSegments(cableGeo, trackInk(keep(new THREE.LineBasicMaterial({ transparent: true, opacity: 0.22 }))));
    structure.add(cables);

    /* ---------- spire collars ---------- */
    const collars: THREE.Mesh[] = [];
    for (const [cy, cr] of [[spireY * 0.35, 1.9], [spireY * 0.62, 1.35], [spireY * 0.86, 0.8]] as const) {
      const collar = new THREE.Mesh(
        keep(new THREE.TorusGeometry(cr, 0.035, 6, 90)),
        trackInk(keep(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.4 }))),
      );
      collar.rotation.x = Math.PI / 2;
      collar.position.y = cy;
      structure.add(collar);
      collars.push(collar);
    }

    /* ---------- drones ---------- */
    const droneSpecs: Array<{ radius: number; speed: number; phase: number; incline: number; yBase: number; bob: number }> = [];
    const droneRnd = mulberry32(31337);
    const DRONES = small ? 70 : 120;
    for (let i = 0; i < DRONES; i += 1) {
      droneSpecs.push({
        radius: 2.6 + droneRnd() * 9.4,
        speed: (0.1 + droneRnd() * 0.34) * (droneRnd() < 0.5 ? -1 : 1),
        phase: droneRnd() * Math.PI * 2,
        incline: (droneRnd() - 0.5) * 0.9,
        yBase: -1.2 + droneRnd() * 3.6,
        bob: droneRnd() * Math.PI * 2,
      });
    }
    const droneGeo = keep(new THREE.OctahedronGeometry(0.085, 0));
    const droneGroups: Array<{ mesh: THREE.InstancedMesh; specs: typeof droneSpecs }> = [];
    const groupCounts = [Math.ceil(DRONES * 0.42), Math.ceil(DRONES * 0.75), DRONES]; // cumulative boundaries
    const droneColors = [ACCENT_A, ACCENT_B, new THREE.Color("#d7e3ee")];
    let specOffset = 0;
    for (let g = 0; g < 3; g += 1) {
      const count = groupCounts[g] - (g === 0 ? 0 : groupCounts[g - 1]);
      const mesh = new THREE.InstancedMesh(droneGeo, keep(new THREE.MeshBasicMaterial({ color: droneColors[g], transparent: true, opacity: g === 2 ? 0.85 : 0.95 })), count);
      mesh.frustumCulled = false;
      keep({ dispose: () => mesh.dispose() });
      scene.add(mesh);
      droneGroups.push({ mesh, specs: droneSpecs.slice(specOffset, specOffset + count) });
      specOffset += count;
    }
    const updateDrones = (t: number, speedMul: number, radiusMul = 1) => {
      for (let g = 0; g < droneGroups.length; g += 1) {
        const grp = droneGroups[g];
        const specs = grp.specs;
        for (let i = 0; i < specs.length; i += 1) {
          const s = specs[i];
          const th = s.phase + t * s.speed * speedMul;
          const rr = s.radius * radiusMul;
          dummy.position.set(
            Math.cos(th) * rr,
            s.yBase + Math.sin(th * 2 + s.bob) * 0.5 + Math.sin(th) * s.incline * rr * 0.16,
            Math.sin(th) * rr,
          );
          dummy.rotation.set(th * 3, th * 2, 0);
          dummy.scale.setScalar(1);
          dummy.updateMatrix();
          grp.mesh.setMatrixAt(i, dummy.matrix);
        }
        grp.mesh.instanceMatrix.needsUpdate = true;
      }
    };

    /* ---------- debris torus ---------- */
    const debrisCount = small ? 1400 : 2800;
    const dPos = new Float32Array(debrisCount * 3);
    const drnd = mulberry32(555);
    for (let i = 0; i < debrisCount; i += 1) {
      const u = drnd() * Math.PI * 2;
      const rr = RING_R + gauss() * 2.4;
      const y = TUBE * gauss() * 1.6;
      dPos[i * 3] = Math.cos(u) * rr;
      dPos[i * 3 + 1] = y;
      dPos[i * 3 + 2] = Math.sin(u) * rr;
    }
    const debrisGeo = keep(new THREE.BufferGeometry());
    debrisGeo.setAttribute("position", new THREE.BufferAttribute(dPos, 3));
    const debris = new THREE.Points(debrisGeo, trackInk(keep(new THREE.PointsMaterial({
      size: 0.045, sizeAttenuation: true, transparent: true, opacity: 0.35, depthWrite: false,
    }))));
    scene.add(debris);

    /* ---------- theme reaction ---------- */
    const applyInk = () => {
      inkColors.main.copy(readInk());
      inkColors.paper.copy(readPaper());
      for (const m of inkMaterials) m.color.copy(inkColors.main);
      (cityUniforms.uInk.value as THREE.Color).copy(inkColors.main);
      (cityUniforms.uPaper.value as THREE.Color).copy(inkColors.paper);
      (monoUniforms.uInk.value as THREE.Color).copy(inkColors.main);
      (monoUniforms.uPaper.value as THREE.Color).copy(inkColors.paper);
      (beaconUniforms.uInk.value as THREE.Color).copy(inkColors.main);
      (beaconUniforms.uPaper.value as THREE.Color).copy(inkColors.paper);
      (beamMat.uniforms.uInk.value as THREE.Color).copy(inkColors.main);
      pulseOrb.material.color.copy(inkColors.main);
      beamTip.material.color.copy(inkColors.main);
      (scene.fog as THREE.Fog).color.copy(inkColors.paper);
    };

    /* ---------- scanner beam + pulse orb ---------- */
    const beamGroup = new THREE.Group();
    beamGroup.position.y = spireY + 0.95;
    structure.add(beamGroup);
    const beamGeo = keep(new THREE.PlaneGeometry(11.2, 0.34));
    beamGeo.translate(5.6, 0, 0); // pivot at the spire mast
    /* taper into a searchlight cone: widen the far end */
    {
      const pos = beamGeo.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i += 1) {
        if (pos.getX(i) > 0) pos.setY(i, pos.getY(i) * 4.2);
      }
      pos.needsUpdate = true;
    }
    const beamMat = keep(new THREE.ShaderMaterial({
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      uniforms: {
        uInk: { value: inkColors.main.clone() },
        uOpacity: { value: 0.15 },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }));
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.rotation.x = -Math.PI / 2; // lay flat in the ring plane
    beamGroup.add(beam);
    const beamVert = new THREE.Mesh(beamGeo, beamMat); // crossed blade — stays visible from above
    beamGroup.add(beamVert);
    const beamTip = new THREE.Sprite(keep(new THREE.SpriteMaterial({
      map: keep(glowTexture("rgba(255,255,255,0.95)", "rgba(160,210,255,0.4)")),
      transparent: true, opacity: 0.5, depthWrite: false,
    })));
    beamTip.scale.setScalar(0.55);
    beamTip.position.set(11.2, 0, 0);
    beamGroup.add(beamTip);

    const pulseOrb = new THREE.Sprite(keep(new THREE.SpriteMaterial({
      map: keep(glowTexture("rgba(255,240,220,0.95)", "rgba(255,170,90,0.45)")),
      transparent: true, opacity: 0, depthWrite: false,
    })));
    pulseOrb.scale.setScalar(1.2);
    structure.add(pulseOrb);

    /* first paint + theme flips — must run after every tinted material exists */
    applyInk();
    const themeObserver = new MutationObserver(applyInk);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    /* ---------- camera rig + journey ---------- */
    const rig = { theta: 0.85, phi: 1.02, radius: 44, vTheta: 0, vPhi: 0 };
    let lastInteraction = 0;
    let dragging = false;
    let lastX = 0, lastY = 0;
    let dragMoved = 0;
    let shockAt = -99;
    let pulseOrigin = 0; // start angle (rad) of the click shockwave — randomized
    const pointerNdc = new THREE.Vector2(2, 2);
    const tmpRay = new THREE.Vector3();
    let beamAngle = 0;
    let beamTarget = 0;
    let pointerWorldAngle = 0;

    const JOURNEY = [
      { p: 0.0, r: 30, phi: 1.02, th: 0.0, ty: 0.0 },
      { p: 0.28, r: 16.5, phi: 1.3, th: 1.4, ty: 0.4 },
      { p: 0.55, r: 14.5, phi: 1.12, th: 2.7, ty: 3.4 },
      { p: 0.8, r: 19, phi: 0.72, th: 4.1, ty: 0.6 },
      { p: 1.0, r: 27, phi: 0.3, th: 5.4, ty: 0.0 },
    ];
    const journeyAt = (scrollP: number) => {
      let i = 0;
      while (i < JOURNEY.length - 2 && scrollP > JOURNEY[i + 1].p) i += 1;
      const a = JOURNEY[i], b = JOURNEY[i + 1];
      const t = THREE.MathUtils.clamp((scrollP - a.p) / (b.p - a.p), 0, 1);
      const e = t * t * (3 - 2 * t);
      return {
        r: a.r + (b.r - a.r) * e,
        phi: a.phi + (b.phi - a.phi) * e,
        th: a.th + (b.th - a.th) * e,
        ty: a.ty + (b.ty - a.ty) * e,
      };
    };

    /* ---------- pointer interaction ---------- */
    const onPointerDown = (e: PointerEvent) => {
      hint.classList.add("is-hidden");
      dragging = true;
      dragMoved = 0;
      lastX = e.clientX; lastY = e.clientY;
      rig.vTheta = 0; rig.vPhi = 0;
      lastInteraction = performance.now();
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
    };
    const onPointerMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      pointerNdc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      if (dragging) {
        const dx = e.clientX - lastX, dy = e.clientY - lastY;
        lastX = e.clientX; lastY = e.clientY;
        dragMoved += Math.abs(dx) + Math.abs(dy);
        rig.theta -= dx * 0.0048;
        rig.phi = THREE.MathUtils.clamp(rig.phi - dy * 0.0032, 0.22, 1.45);
        rig.vTheta = -dx * 0.0048 * 0.5;
        rig.vPhi = -dy * 0.0032 * 0.5;
        canvas.style.cursor = "grabbing";
      } else {
        canvas.style.cursor = "grab";
      }
      lastInteraction = performance.now();
    };
    const firePulse = () => {
      shockAt = clock;
      /* Map the click's screen position to the ring plane so the wave starts
         where the visitor touched the city, with a random fallback only when
         the ray misses the plane. */
      const ray = new THREE.Raycaster();
      ray.setFromCamera(pointerNdc, camera);
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.95);
      const hit = ray.ray.intersectPlane(plane, new THREE.Vector3());
      const localHit = hit ? structure.worldToLocal(hit) : null;
      pulseOrigin = localHit ? Math.atan2(localHit.z, localHit.x) : Math.random() * Math.PI * 2;
      cityUniforms.uPulseOrigin.value = pulseOrigin;
      beaconUniforms.uPulseOrigin.value = pulseOrigin;
      cityUniforms.uPulse.value = 0;
      beaconUniforms.uPulse.value = 0;
      monoUniforms.uPulse.value = 0;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      canvas.style.cursor = "grab";
      lastInteraction = performance.now();
      if (dragMoved < 7) firePulse();
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* released already */ }
    };
    const onPointerCancel = () => { dragging = false; };
    const onPointerLeave = () => { pointerNdc.set(2, 2); };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerCancel);
    canvas.addEventListener("pointerleave", onPointerLeave);

    /* ---------- resize ---------- */
    let viewAspect = 1;
    const setSize = () => {
      const width = host.clientWidth || 1;
      const height = host.clientHeight || 1;
      viewAspect = width / height;
      camera.aspect = viewAspect;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    setSize();
    const resizeObserver = new ResizeObserver(() => {
      setSize();
      if (reduce) renderStatic();
    });
    resizeObserver.observe(host);

    /* ---------- pause when hero off-screen ---------- */
    let visible = true;
    const io = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? true;
      if (visible) { last = performance.now(); if (!reduce && !raf) raf = requestAnimationFrame(frame); }
      else if (raf) { cancelAnimationFrame(raf); raf = 0; }
    }, { threshold: 0.02 });
    io.observe(host);

    /* ---------- animation state ---------- */
    let clock = 0;
    let last = performance.now();
    let chipClock = 0;
    let lastRenderAt = 0;
    let timerDriver = 0;
    let fpsEma = 60;
    const introT0 = performance.now();

    const updateChip = () => {
      const fps = Math.min(120, Math.round(fpsEma));
      (chip.children[1] as HTMLElement).textContent =
        `INST ${total} · DRONES ${DRONES} · ${fps} FPS`;
    };

    /* ---------- main loop ---------- */
    const frame = () => {
      if (disposed) return;
      tick();
      if (!reduce && visible) raf = requestAnimationFrame(frame);
      else raf = 0;
    };

    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      lastRenderAt = now;
      clock += dt;
      fpsEma += (1 / Math.max(dt, 1e-4) - fpsEma) * 0.06;

      const heroEl = host.parentElement;
      const scrollP = heroEl
        ? THREE.MathUtils.clamp(-heroEl.getBoundingClientRect().top / Math.max(1, window.innerHeight), 0, 1)
        : 0;

      const intro = reduce ? 1 : THREE.MathUtils.smoothstep(THREE.MathUtils.clamp((now - introT0) / 2600, 0, 1), 0, 1);
      const introDolly = (1 - intro) * 0.55;

      /* camera rig */
      if (!dragging) {
        rig.theta += rig.vTheta; rig.phi = THREE.MathUtils.clamp(rig.phi + rig.vPhi, 0.22, 1.45);
        rig.vTheta *= 0.93; rig.vPhi *= 0.93;
        if (now - lastInteraction > 3200) rig.theta += dt * 0.05;
      }
      const j = journeyAt(scrollP);
      /* narrow viewports pull back so the whole wheel still reads */
      const aspectFit = Math.max(1, Math.pow(1.5 / Math.max(0.4, viewAspect), 0.8));
      const breathe = Math.sin(clock * 0.4) * 0.18 * (1 - scrollP);
      /* click shockwave: camera thump, monolith spring, drone scatter */
      const pa = clock - shockAt;
      const kick = pa < 3 ? Math.exp(-pa * 3.2) * 0.7 * Math.sin(pa * 9.0) : 0;
      const radius = (j.r * aspectFit + breathe + kick) * (1 + introDolly);
      rig.radius += (radius - rig.radius) * 0.055;
      /* fog grades relative to camera distance so pull-backs keep contrast */
      const fogNear = rig.radius * 0.85, fogFar = rig.radius * 2.6;
      cityUniforms.uFogNear.value = fogNear; cityUniforms.uFogFar.value = fogFar;
      beaconUniforms.uFogNear.value = fogNear; beaconUniforms.uFogFar.value = fogFar;
      monoUniforms.uFogNear.value = fogNear; monoUniforms.uFogFar.value = fogFar;
      (scene.fog as THREE.Fog).near = fogNear;
      (scene.fog as THREE.Fog).far = fogFar;
      const phi = THREE.MathUtils.clamp(rig.phi + (j.phi - rig.phi) * Math.min(1, scrollP * 2.2), 0.22, 1.45);
      const theta = rig.theta + j.th;
      const target = _v2.set(0, j.ty, 0);
      const sinPhi = Math.sin(phi);
      camera.position.set(
        target.x + rig.radius * sinPhi * Math.sin(theta),
        target.y + rig.radius * Math.cos(phi),
        target.z + rig.radius * sinPhi * Math.cos(theta),
      );
      camera.lookAt(target);

      /* structure motion — drags carry torsional mass: the whole wheel
         coasts with the fling and the windows glow with spin energy */
      structure.rotation.y += dt * (0.02 + scrollP * 0.06) + rig.vTheta * 0.42;
      const spinEnergy = Math.min(1, Math.abs(rig.vTheta) * 26);
      cityUniforms.uSpin.value += (spinEnergy - cityUniforms.uSpin.value) * 0.08;
      for (let i = 0; i < collars.length; i += 1) collars[i].rotation.z += dt * (0.25 - i * 0.08) * (i % 2 ? -1 : 1);
      monolith.rotation.y += dt * 0.22;
      const mk = pa < 3 ? Math.exp(-pa * 2.2) : 0;
      monolith.scale.setScalar(1 + 0.09 * mk * Math.sin(pa * 13.0));
      monolith.position.y = spireY + 1.7 + Math.sin(clock * 0.6) * 0.14 + mk * 0.55;
      starsA.rotation.y = clock * 0.0035 + scrollP * 0.1;
      starsB.rotation.y = -clock * 0.0026 + scrollP * 0.06;
      debris.rotation.y = clock * 0.006;
      (starsA.material as THREE.PointsMaterial).opacity = 0.38 + Math.sin(clock * 1.1) * 0.1;
      (starsB.material as THREE.PointsMaterial).opacity = 0.46 + Math.sin(clock * 1.7 + 2) * 0.14;

      /* uniforms */
      cityUniforms.uTime.value = clock;
      beaconUniforms.uTime.value = clock;
      cityUniforms.uPulse.value = pa < 6 ? pa : 99;
      beaconUniforms.uPulse.value = cityUniforms.uPulse.value;
      monoUniforms.uPulse.value = cityUniforms.uPulse.value;
      updateDrones(clock, 1 + Math.max(0, 2.2 - pa) * 0.8, 1 + (pa < 4 ? Math.exp(-pa * 1.3) * 0.4 : 0));

      /* pulse orb racing the ring circumference from its randomized origin */
      if (pa >= 0 && pa < 2.4) {
        torusPoint(pulseOrigin + pa * 4.4, 0, p);
        pulseOrb.position.set(p.x, 0.95, p.z);
        pulseOrb.material.opacity = Math.exp(-pa * 1.2) * 0.85;
        pulseOrb.scale.setScalar(1.0 + 0.5 * Math.exp(-pa * 2.0));
      } else {
        pulseOrb.material.opacity = 0;
      }

      /* scanner beam: tracks the pointer's angle around the wheel,
         auto-sweeps when the pointer is idle or gone */
      const pointerInside = pointerNdc.x <= 1;
      if (pointerInside) {
        tmpRay.set(pointerNdc.x, pointerNdc.y, 0.5).unproject(camera).sub(camera.position).normalize();
        const t = (spireY + 0.95 - camera.position.y) / tmpRay.y;
        if (Number.isFinite(t) && t > 0) {
          const px = camera.position.x + tmpRay.x * t;
          const pz = camera.position.z + tmpRay.z * t;
          pointerWorldAngle = Math.atan2(pz, px);
        }
      }
      if (pointerInside && now - lastInteraction < 2600) {
        beamTarget = pointerWorldAngle - structure.rotation.y;
      } else {
        beamTarget += dt * 0.38;
      }
      const beamDelta = Math.atan2(Math.sin(beamTarget - beamAngle), Math.cos(beamTarget - beamAngle));
      beamAngle += beamDelta * Math.min(1, dt * 5);
      beamGroup.rotation.y = -beamAngle;
      cityUniforms.uBeamAngle.value = beamAngle;
      beamMat.uniforms.uOpacity.value = 0.13 + Math.min(1, Math.abs(beamDelta) * 1.4) * 0.25;

      /* HUD (throttled) */
      chipClock += dt;
      if (chipClock > 0.3) { chipClock = 0; updateChip(); }

      renderer.render(scene, camera);
    };

    function renderStatic() {
      clock = 8;
      cityUniforms.uTime.value = clock;
      beaconUniforms.uTime.value = clock;
      rig.phi = 1.0;
      rig.radius = 30;
      rig.theta = 0.85;
      const sinPhi = Math.sin(rig.phi);
      camera.position.set(rig.radius * sinPhi * Math.sin(rig.theta), rig.radius * Math.cos(rig.phi), rig.radius * sinPhi * Math.cos(rig.theta));
      camera.lookAt(0, 0, 0);
      updateDrones(clock, 1);
      updateChip();
      renderer.render(scene, camera);
    }

    if (reduce) {
      renderStatic();
      const rerender = () => renderStatic();
      canvas.addEventListener("pointerdown", rerender);
      canvas.addEventListener("pointerup", rerender);
      disposables.push({ dispose: () => {
        canvas.removeEventListener("pointerdown", rerender);
        canvas.removeEventListener("pointerup", rerender);
      } });
    } else {
      raf = requestAnimationFrame(frame);
      /* Some embedded/occluded webviews stall requestAnimationFrame when
         they stop painting. Drive the scene from a timer whenever rAF has
         been silent for >90ms so the hero never freezes; in normal
         browsers rAF keeps this interval idle. */        timerDriver = window.setInterval(() => {
          if (disposed || reduce || !visible) return;
        if (performance.now() - lastRenderAt < 90) return;
        frame();
      }, 50);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      if (timerDriver) window.clearInterval(timerDriver);
      io.disconnect();
      resizeObserver.disconnect();
      themeObserver.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      host.removeChild(canvas);
      host.removeChild(ui);
    };
  }, []);

  return <div ref={hostRef} className="hero-blob" aria-label="Interactive ring megastructure — abstract 3D artwork" />;
}
