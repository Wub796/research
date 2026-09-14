import {
  BillboardCollection,
  BlendOption,
  Cartesian2,
  Cartesian3,
  Color,
  EllipsoidGeometry,
  GeometryInstance,
  HeadingPitchRange,
  JulianDate,
  Material,
  MaterialAppearance,
  Math as CesiumMath,
  Matrix3,
  Matrix4,
  PerspectiveFrustum,
  PointPrimitiveCollection,
  Polyline,
  PolylineCollection,
  Primitive,
  SceneTransforms,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Transforms,
  Viewer,
} from "cesium";
import type { Mission } from "../../lib/mission";
import { pub } from "../../lib/paths";
import type { SimClock } from "./simClock";
import { EARTH_SOURCE, MARS_SOURCE, ORBIT_SOURCE, PLUME_SOURCE, SUN_SOURCE, TRAIL_SOURCE } from "./materials";

export type FocusKey = "sun" | "earth" | "mars" | "sc";

export interface SceneController {
  setFocus(key: FocusKey): void;
  getFocus(): FocusKey;
  setZoomEnabled(on: boolean): void;
  /** Pause Cesium's render loop (and with it the mission clock) offscreen. */
  setRendering(on: boolean): void;
  playIntro(): void;
  destroy(): void;
}

interface Options {
  labels: HTMLElement;
  reduceMotion: boolean;
  onFirstFrame?: () => void;
  onFocusChange?: (key: FocusKey) => void;
}

const PAPER = Color.fromCssColorString("#f0eee8");
const WARN = Color.fromCssColorString("#fab219");
const CRIT = Color.fromCssColorString("#e84b2c");
const EARTH_TINT = Color.fromCssColorString("#6fa8ff");
const MARS_TINT = Color.fromCssColorString("#e8793f");

const J2000_MS = Date.UTC(2000, 0, 1, 11, 58, 55, 816);
const OBLIQUITY = CesiumMath.toRadians(84381.448 / 3600);
const AU_M = 1.495978707e11;

/** Minimum on-screen radius (CSS px) per body: bodies are drawn at true size
 *  whenever that is larger, so zooming in reveals the real globe while the
 *  overview keeps every body legible. */
const MIN_PX = { sun: 10, earth: 4.5, mars: 4 };
const RANGES: Record<FocusKey, number> = { sun: 4.4e11, earth: 3.2e10, mars: 3.2e10, sc: 1.6e10 };

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function glowCanvas() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.18, "rgba(255,255,255,0.55)");
  grad.addColorStop(0.45, "rgba(255,255,255,0.12)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return c;
}

function diamondCanvas() {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d")!;
  g.translate(16, 16);
  g.rotate(Math.PI / 4);
  g.fillStyle = "#fff";
  g.fillRect(-7, -7, 14, 14);
  g.strokeStyle = "#000";
  g.lineWidth = 2;
  g.strokeRect(-7, -7, 14, 14);
  return c;
}

/** NaturalEarthII ships with Cesium as a TMS pyramid (origin bottom-left);
 *  stitch level 1 (4×2 tiles) into one equirectangular day texture.
 *  EllipsoidGeometry derives `s` from the *negated* normal, so longitude 0
 *  sits on the texture seam and 180° at s = 0.5 — the tiles are laid out
 *  two columns over to match, which also keeps the image edge on the
 *  geometry seam. */
function earthTexture(): Promise<HTMLCanvasElement> {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const g = c.getContext("2d")!;
  const base = pub("/cesium/Assets/Textures/NaturalEarthII/1");
  const jobs: Promise<void>[] = [];
  for (let x = 0; x < 4; x++) {
    for (let y = 0; y < 2; y++) {
      jobs.push(
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            g.drawImage(img, ((x + 2) % 4) * 256, (1 - y) * 256, 256, 256);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = `${base}/${x}/${y}.jpg`;
        }),
      );
    }
  }
  return Promise.all(jobs).then(() => c);
}

function fabric(type: string, source: string, uniforms: Record<string, unknown>, translucent = false) {
  return new Material({ fabric: { type, uniforms, source }, translucent });
}

export function createScene(container: HTMLElement, mission: Mission, clock: SimClock, opts: Options): SceneController {
  const viewer = new Viewer(container, {
    globe: false,
    skyAtmosphere: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    animation: false,
    timeline: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    shouldAnimate: false,
    useBrowserRecommendedResolution: false,
    msaaSamples: 4,
  });
  const { scene, camera } = viewer;
  viewer.resolutionScale = Math.min(1, 2 / (window.devicePixelRatio || 1));

  // Freeze the Cesium clock at launch: the star skybox is oriented by the
  // TEME→pseudo-fixed rotation at clock time, so a frozen clock keeps the
  // stars still while the mission clock runs on its own.
  const T0 = JulianDate.fromDate(mission.epoch);
  viewer.clock.currentTime = T0;
  viewer.clock.shouldAnimate = false;
  if (scene.sun) scene.sun.show = false;
  if (scene.moon) scene.moon.show = false;
  scene.backgroundColor = Color.BLACK;
  scene.highDynamicRange = false;
  (camera.frustum as PerspectiveFrustum).far = 1e14;

  const bloom = scene.postProcessStages.bloom;
  bloom.enabled = true;
  bloom.uniforms.glowOnly = false;
  bloom.uniforms.contrast = 128;
  bloom.uniforms.brightness = -0.3;
  bloom.uniforms.delta = 1.0;
  bloom.uniforms.sigma = 2.4;
  bloom.uniforms.stepSize = 1.1;

  // ---- frame: ecliptic J2000 km → world metres, aligned with the sky ----
  const teme = Transforms.computeTemeToPseudoFixedMatrix(T0, new Matrix3());
  const W = Matrix3.multiply(teme, Matrix3.fromRotationX(OBLIQUITY), new Matrix3());
  const scratchIn = new Cartesian3();
  const toWorld = (p: ArrayLike<number>, out: Cartesian3, offset = 0) => {
    scratchIn.x = p[offset] * 1000;
    scratchIn.y = p[offset + 1] * 1000;
    scratchIn.z = p[offset + 2] * 1000;
    return Matrix3.multiplyByVector(W, scratchIn, out);
  };
  const eclToWorld = (x: number, y: number, z: number, out: Cartesian3) => {
    scratchIn.x = x;
    scratchIn.y = y;
    scratchIn.z = z;
    return Matrix3.multiplyByVector(W, scratchIn, out);
  };

  // ---- bodies ----
  const bodyPrimitive = (material: Material) =>
    scene.primitives.add(
      new Primitive({
        geometryInstances: new GeometryInstance({
          geometry: new EllipsoidGeometry({
            radii: new Cartesian3(1, 1, 1),
            stackPartitions: 96,
            slicePartitions: 144,
            vertexFormat: MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat,
          }),
        }),
        appearance: new MaterialAppearance({
          material,
          flat: true,
          closed: true,
          translucent: false,
          materialSupport: MaterialAppearance.MaterialSupport.TEXTURED,
        }),
        asynchronous: false,
      }),
    ) as Primitive;

  const sunMaterial = fabric("AresSun", SUN_SOURCE, { time: 0 });
  const placeholder = document.createElement("canvas");
  placeholder.width = placeholder.height = 2;
  const earthMaterial = fabric("AresEarth", EARTH_SOURCE, { image: placeholder });
  const marsMaterial = fabric("AresMars", MARS_SOURCE, {});
  const sun = bodyPrimitive(sunMaterial);
  const earth = bodyPrimitive(earthMaterial);
  const mars = bodyPrimitive(marsMaterial);
  let destroyed = false;
  earthTexture().then((canvas) => {
    if (!destroyed) earthMaterial.uniforms.image = canvas;
  });

  const glows = scene.primitives.add(new BillboardCollection({ scene, blendOption: BlendOption.TRANSLUCENT })) as BillboardCollection;
  const glowImage = glowCanvas();
  const corona = glows.add({ image: glowImage, position: Cartesian3.ZERO, color: new Color(1, 0.86, 0.62, 0.8), sizeInMeters: true, width: 1, height: 1 });
  const earthHalo = glows.add({ image: glowImage, position: Cartesian3.ZERO, color: EARTH_TINT.withAlpha(0.7), width: 28, height: 28 });
  const marsHalo = glows.add({ image: glowImage, position: Cartesian3.ZERO, color: MARS_TINT.withAlpha(0.7), width: 26, height: 26 });

  // ---- orbits: one full sidereal period each, sampled daily ----
  const lines = scene.primitives.add(new PolylineCollection()) as PolylineCollection;
  const ringPositions = (pos: Float64Array, days: number) => {
    const out: Cartesian3[] = [];
    for (let d = 0; d < days; d++) out.push(toWorld(pos, new Cartesian3(), d * 3));
    return out;
  };
  const orbitMaterial = (color: Color) => fabric("AresOrbit", ORBIT_SOURCE, { color, head: 0, tail: 0.3, base: 0.16 }, true);
  const earthOrbit = lines.add({ positions: ringPositions(mission.earthPos, 366), width: 1.6, loop: true, material: orbitMaterial(EARTH_TINT.withAlpha(0.75)) });
  const marsOrbit = lines.add({ positions: ringPositions(mission.marsPos, 687), width: 1.6, loop: true, material: orbitMaterial(MARS_TINT.withAlpha(0.75)) });

  // ---- ecliptic longitude compass (instrument reference ring) ----
  const grid = scene.primitives.add(new PolylineCollection()) as PolylineCollection;
  const gridMaterial = Material.fromType("Color", { color: Color.WHITE.withAlpha(0.09) });
  const ringR = 1.86 * AU_M;
  const ring: Cartesian3[] = [];
  for (let i = 0; i < 360; i++) {
    const a = (i / 360) * Math.PI * 2;
    ring.push(eclToWorld(Math.cos(a) * ringR, Math.sin(a) * ringR, 0, new Cartesian3()));
  }
  grid.add({ positions: ring, loop: true, width: 1, material: gridMaterial });
  for (let deg = 0; deg < 360; deg += 10) {
    const a = CesiumMath.toRadians(deg);
    const len = deg % 90 === 0 ? 0.12 : deg % 30 === 0 ? 0.07 : 0.035;
    grid.add({
      positions: [
        eclToWorld(Math.cos(a) * ringR, Math.sin(a) * ringR, 0, new Cartesian3()),
        eclToWorld(Math.cos(a) * (ringR + len * AU_M), Math.sin(a) * (ringR + len * AU_M), 0, new Cartesian3()),
      ],
      width: 1,
      material: gridMaterial,
    });
  }
  const lonLabelPos = [0, 90, 180, 270].map((deg) => {
    const a = CesiumMath.toRadians(deg);
    const r = ringR + 0.2 * AU_M;
    return eclToWorld(Math.cos(a) * r, Math.sin(a) * r, 0, new Cartesian3());
  });

  // ---- spacecraft path ----
  const scCount = mission.scPos.length / 3;
  const trailPositions: Cartesian3[] = new Array(scCount);
  for (let i = 0; i < scCount; i++) trailPositions[i] = toWorld(mission.scPos, new Cartesian3(), i * 3);
  const trailMaterial = fabric(
    "AresTrail",
    TRAIL_SOURCE,
    {
      progress: 0,
      decayS: 1000 / mission.hours,
      lockS: 1500 / mission.hours,
      nominalColor: PAPER,
      warnColor: WARN,
      critColor: CRIT,
      ghostColor: Color.WHITE.withAlpha(0.2),
    },
    true,
  );
  lines.add({ positions: trailPositions, width: 7, material: trailMaterial });

  const dynamic = scene.primitives.add(new PolylineCollection()) as PolylineCollection;
  const plumeMaterial = fabric("AresPlume", PLUME_SOURCE, { color: PAPER, time: 0, strength: 1 }, true);
  const plume: Polyline = dynamic.add({ positions: [new Cartesian3(1, 0, 0), new Cartesian3(2, 0, 0)], width: 9, material: plumeMaterial });
  const marsLineMaterial = Material.fromType("Color", { color: CRIT.withAlpha(0.22) });
  const marsLine: Polyline = dynamic.add({ positions: [new Cartesian3(1, 0, 0), new Cartesian3(2, 0, 0)], width: 1, material: marsLineMaterial });

  const points = scene.primitives.add(new PointPrimitiveCollection()) as PointPrimitiveCollection;
  const scPoint = points.add({ position: Cartesian3.ZERO, pixelSize: 7, color: PAPER, outlineColor: Color.BLACK, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY });

  const markers = scene.primitives.add(new BillboardCollection({ scene })) as BillboardCollection;
  const diamond = diamondCanvas();
  const scAt = (hour: number) => {
    const p = new Float64Array(3);
    mission.spacecraft(hour, p);
    return toWorld(p, new Cartesian3());
  };
  const decayPos = scAt(1000);
  const crisisPos = scAt(1500);
  markers.add({ image: diamond, position: decayPos, width: 13, height: 13, color: WARN, disableDepthTestDistance: Number.POSITIVE_INFINITY });
  markers.add({ image: diamond, position: scAt(1497), width: 13, height: 13, color: WARN, disableDepthTestDistance: Number.POSITIVE_INFINITY });
  markers.add({ image: diamond, position: crisisPos, width: 15, height: 15, color: CRIT, disableDepthTestDistance: Number.POSITIVE_INFINITY });

  // ---- per-frame state ----
  const tmpKm = new Float64Array(3);
  const dirKm = new Float64Array(3);
  const pos = { sc: new Cartesian3(), earth: new Cartesian3(), mars: new Cartesian3() };
  const radius = { sun: 695700e3, earth: 6371e3, mars: 3389.5e3 };
  const render = { sun: 0, earth: 0, mars: 0 };
  const rot = new Matrix3();
  const rotScaled = new Matrix3();
  const model = new Matrix4();
  const cam = new Cartesian3();
  const haloEarth = new Color();
  const haloMars = new Color();

  const metersPerPixel = (distance: number) => {
    const fovy = (camera.frustum as PerspectiveFrustum).fovy ?? CesiumMath.toRadians(60);
    return (2 * distance * Math.tan(fovy / 2)) / Math.max(1, scene.canvas.clientHeight);
  };

  /** IAU body-fixed frame → world rotation (pole RA/Dec + prime meridian). */
  const bodyRotation = (alpha0: number, delta0: number, w: number, out: Matrix3) => {
    const a = CesiumMath.toRadians(alpha0);
    const d = CesiumMath.toRadians(delta0);
    const wr = CesiumMath.toRadians(w);
    const pole = new Cartesian3(Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d));
    const node = new Cartesian3(-Math.sin(a), Math.cos(a), 0);
    const q = Cartesian3.cross(pole, node, new Cartesian3());
    const x = Cartesian3.add(Cartesian3.multiplyByScalar(node, Math.cos(wr), new Cartesian3()), Cartesian3.multiplyByScalar(q, Math.sin(wr), new Cartesian3()), new Cartesian3());
    const y = Cartesian3.cross(pole, x, new Cartesian3());
    const local = new Matrix3(x.x, y.x, pole.x, x.y, y.y, pole.y, x.z, y.z, pole.z);
    return Matrix3.multiply(teme, local, out);
  };

  const placeBody = (prim: Primitive, center: Cartesian3, r: number, rotation: Matrix3) => {
    Matrix3.multiplyByUniformScale(rotation, r, rotScaled);
    Matrix4.fromRotationTranslation(rotScaled, center, model);
    Matrix4.clone(model, prim.modelMatrix);
  };

  // ---- camera: reference frame at the focus, ecliptic north up ----
  let focus: FocusKey = "sun";
  let prevFocus: FocusKey = "sun";
  let blend = 1;
  let rangeTween: { from: number; to: number; t: number } | null = null;
  let intro: { t: number } | null = null;
  const frame = new Matrix4();
  const center = new Cartesian3();
  const centerA = new Cartesian3();
  const localP = new Cartesian3();
  const localD = new Cartesian3();
  const localU = new Cartesian3();
  const localR = new Cartesian3();

  const focusPosition = (key: FocusKey, out: Cartesian3) => {
    if (key === "sun") return Cartesian3.clone(Cartesian3.ZERO, out);
    if (key === "earth") return Cartesian3.clone(pos.earth, out);
    if (key === "mars") return Cartesian3.clone(pos.mars, out);
    return Cartesian3.clone(pos.sc, out);
  };

  const seatCamera = () => {
    Cartesian3.clone(camera.position, localP);
    Cartesian3.clone(camera.direction, localD);
    Cartesian3.clone(camera.up, localU);
    Cartesian3.clone(camera.right, localR);
    Matrix4.fromRotationTranslation(W, center, frame);
    camera.lookAtTransform(frame);
    Cartesian3.clone(localP, camera.position);
    Cartesian3.clone(localD, camera.direction);
    Cartesian3.clone(localU, camera.up);
    Cartesian3.clone(localR, camera.right);
  };

  const controller = scene.screenSpaceCameraController;
  controller.enableTranslate = false;
  controller.enableLook = false;
  controller.inertiaSpin = 0.88;
  // Cesium's own zoom measures height above an Earth ellipsoid at the world
  // origin — here, the Sun — so it would race past Mars. Zoom is handled
  // below instead, in log space, as distance to whatever is in focus.
  controller.enableZoom = false;

  Matrix4.fromRotationTranslation(W, Cartesian3.ZERO, frame);
  camera.lookAtTransform(frame, new HeadingPitchRange(CesiumMath.toRadians(-62), CesiumMath.toRadians(-36), RANGES.sun));

  const handler = new ScreenSpaceEventHandler(scene.canvas);
  const interrupt = () => {
    rangeTween = null;
    intro = null;
  };
  for (const t of [ScreenSpaceEventType.LEFT_DOWN, ScreenSpaceEventType.RIGHT_DOWN, ScreenSpaceEventType.MIDDLE_DOWN, ScreenSpaceEventType.PINCH_START]) {
    handler.setInputAction(interrupt, t);
  }

  let zoomEnabled = false;
  let zoomTarget: number | null = null;
  const MAX_RANGE = 3e12;
  // Floor on true radii: a body drawn at its minimum pixel size always stays
  // a few pixels wide, so the camera can only ever meet the real globe.
  const minRange = () => (focus === "sc" ? 2.5e6 : focus === "sun" ? radius.sun * 1.6 : radius[focus] * 2.2);
  const clampRange = (r: number) => Math.min(MAX_RANGE, Math.max(minRange(), r));
  const onWheel = (e: WheelEvent) => {
    if (!zoomEnabled) return;
    e.preventDefault();
    interrupt();
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    zoomTarget = clampRange((zoomTarget ?? Cartesian3.magnitude(camera.position)) * Math.exp(delta * 0.0016));
  };
  scene.canvas.addEventListener("wheel", onWheel, { passive: false });
  // pinch distance arrives in the y component of the two-point motion event
  const onPinch = (m: { distance: { startPosition: Cartesian2; endPosition: Cartesian2 } }) => {
    if (!zoomEnabled) return;
    const ratio = m.distance.startPosition.y / Math.max(1, m.distance.endPosition.y);
    zoomTarget = clampRange((zoomTarget ?? Cartesian3.magnitude(camera.position)) * ratio);
  };
  handler.setInputAction(onPinch as unknown as Parameters<ScreenSpaceEventHandler["setInputAction"]>[0], ScreenSpaceEventType.PINCH_MOVE);
  const setRange = (r: number) => Cartesian3.multiplyByScalar(Cartesian3.normalize(camera.position, localP), r, camera.position);

  // ---- labels ----
  const labelEls = new Map<string, HTMLElement>();
  opts.labels.querySelectorAll<HTMLElement>("[data-label]").forEach((el) => labelEls.set(el.dataset.label!, el));
  const win = new Cartesian2();
  const scWin = new Cartesian2();
  const earthWin = new Cartesian2();
  const marsWin = new Cartesian2();
  const eventWin = new Cartesian2();
  const placeLabel = (key: string, world: Cartesian3) => {
    const el = labelEls.get(key);
    if (!el) return;
    const p = SceneTransforms.worldToWindowCoordinates(scene, world, win);
    const w = scene.canvas.clientWidth;
    const h = scene.canvas.clientHeight;
    const visible = !!p && p.x > -40 && p.y > -40 && p.x < w + 40 && p.y < h + 40;
    if (visible) el.style.transform = `translate3d(${p!.x.toFixed(1)}px, ${p!.y.toFixed(1)}px, 0)`;
    if (el.dataset.visible !== String(visible)) el.dataset.visible = String(visible);
  };

  let last = performance.now();
  let firstFrame = false;

  const onPreUpdate = () => {
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;
    clock.tick(dt);
    const hour = clock.hour;
    const t = now / 1000;

    mission.spacecraft(hour, tmpKm);
    toWorld(tmpKm, pos.sc);
    mission.body("earth", hour, tmpKm);
    toWorld(tmpKm, pos.earth);
    mission.body("mars", hour, tmpKm);
    toWorld(tmpKm, pos.mars);

    // bodies at max(true size, minimum pixel size)
    Cartesian3.clone(camera.positionWC, cam);
    const days = (mission.epoch.getTime() + hour * 3.6e6 - J2000_MS) / 86400000;
    const pxSun = metersPerPixel(Cartesian3.magnitude(cam));
    render.sun = Math.max(radius.sun, MIN_PX.sun * pxSun);
    placeBody(sun, Cartesian3.ZERO, render.sun, bodyRotation(286.13, 63.87, 84.176 + 14.1844 * days, rot));
    const pxEarth = metersPerPixel(Cartesian3.distance(cam, pos.earth));
    render.earth = Math.max(radius.earth, MIN_PX.earth * pxEarth);
    placeBody(earth, pos.earth, render.earth, bodyRotation(0, 90, 190.147 + 360.9856235 * days, rot));
    const pxMars = metersPerPixel(Cartesian3.distance(cam, pos.mars));
    render.mars = Math.max(radius.mars, MIN_PX.mars * pxMars);
    placeBody(mars, pos.mars, render.mars, bodyRotation(317.68143, 52.8865, 176.63 + 350.89198226 * days, rot));

    corona.width = corona.height = render.sun * 7.5;
    earthHalo.position = pos.earth;
    marsHalo.position = pos.mars;
    // halos only while a body is a few pixels wide; they fade as the true
    // globe fills in (fresh Color objects — Billboard ignores in-place edits)
    earthHalo.color = EARTH_TINT.withAlpha(0.7 * Math.min(1, Math.max(0, 1 - (render.earth / pxEarth - 5) / 8)), haloEarth);
    marsHalo.color = MARS_TINT.withAlpha(0.7 * Math.min(1, Math.max(0, 1 - (render.mars / pxMars - 5) / 8)), haloMars);

    sunMaterial.uniforms.time = t;
    trailMaterial.uniforms.progress = hour / mission.hours;
    (earthOrbit.material.uniforms as { head: number }).head = (((hour / 24) % 366) + 366) % 366 / 366;
    (marsOrbit.material.uniforms as { head: number }).head = (((hour / 24) % 687) + 687) % 687 / 687;

    scPoint.position = pos.sc;
    // exhaust points opposite the commanded thrust; constant on-screen length
    const pxSc = metersPerPixel(Cartesian3.distance(cam, pos.sc));
    const thrustFrac = mission.sample("thrust", hour) / mission.constants.thrustMaxN;
    mission.thrustDir(hour, dirKm);
    const dirWorld = eclToWorld(dirKm[0], dirKm[1], dirKm[2], new Cartesian3());
    const tail = Cartesian3.add(pos.sc, Cartesian3.multiplyByScalar(dirWorld, -46 * pxSc * (0.35 + 0.65 * thrustFrac), new Cartesian3()), new Cartesian3());
    plume.positions = [pos.sc, tail];
    const ispState = mission.ispStateAt(hour);
    (plumeMaterial.uniforms as { color: Color }).color = ispState === "nominal" ? PAPER : ispState === "locked" ? CRIT : WARN;
    plumeMaterial.uniforms.time = t;
    plumeMaterial.uniforms.strength = hour >= mission.hours ? 0 : 0.35 + 0.65 * thrustFrac;
    marsLine.positions = [pos.sc, pos.mars];
    marsLine.show = hour < mission.hours - 1;

    // camera follow + transitions
    focusPosition(focus, center);
    if (blend < 1) {
      blend = Math.min(1, blend + dt / 1.2);
      focusPosition(prevFocus, centerA);
      Cartesian3.lerp(centerA, center, easeInOut(blend), center);
    }
    seatCamera();
    if (rangeTween) {
      // interpolate range in log space: an order-of-magnitude dolly reads as
      // one even move instead of a slow start and a lunge at the end
      rangeTween.t = Math.min(1, rangeTween.t + dt / 1.2);
      const lf = Math.log(rangeTween.from);
      setRange(Math.exp(lf + (Math.log(rangeTween.to) - lf) * easeInOut(rangeTween.t)));
      if (rangeTween.t >= 1) rangeTween = null;
    }
    if (zoomTarget !== null) {
      const r = Cartesian3.magnitude(camera.position);
      const k = 1 - Math.exp(-dt / 0.12);
      const next = Math.exp(Math.log(r) + (Math.log(zoomTarget) - Math.log(r)) * k);
      setRange(next);
      if (Math.abs(Math.log(next / zoomTarget)) < 1e-3) zoomTarget = null;
    }
    if (intro) {
      intro.t = Math.min(1, intro.t + dt / 2.8);
      const e = easeInOut(intro.t);
      camera.lookAtTransform(
        frame,
        new HeadingPitchRange(CesiumMath.toRadians(-20 - 42 * e), CesiumMath.toRadians(-78 + 42 * e), 1.5e12 + (RANGES.sun - 1.5e12) * e),
      );
      if (intro.t >= 1) intro = null;
    }
    const mag = Cartesian3.magnitude(camera.position);
    if (!intro && mag < minRange()) setRange(minRange());
  };

  const onPostRender = () => {
    placeLabel("sun", Cartesian3.ZERO);
    placeLabel("earth", pos.earth);
    placeLabel("mars", pos.mars);
    placeLabel("sc", pos.sc);
    placeLabel("decay", decayPos);
    placeLabel("crisis", crisisPos);
    lonLabelPos.forEach((p, i) => placeLabel(`lon${i * 90}`, p));
    // near departure and arrival the spacecraft sits on a planet: drop its
    // label below the point so the two readouts never print over each other
    const s = SceneTransforms.worldToWindowCoordinates(scene, pos.sc, scWin);
    const e = SceneTransforms.worldToWindowCoordinates(scene, pos.earth, earthWin);
    const m = SceneTransforms.worldToWindowCoordinates(scene, pos.mars, marsWin);
    const near = (a?: Cartesian2, b?: Cartesian2) => !!a && !!b && Math.abs(a.x - b.x) < 190 && Math.abs(a.y - b.y) < 28;
    const stack = String(near(s, e) || near(s, m));
    const scEl = labelEls.get("sc");
    if (scEl && scEl.dataset.stack !== stack) scEl.dataset.stack = stack;
    // event callouts give way to the live spacecraft and Earth readouts
    for (const [key, world] of [["decay", decayPos], ["crisis", crisisPos]] as const) {
      const el = labelEls.get(key);
      if (!el) continue;
      const p = SceneTransforms.worldToWindowCoordinates(scene, world, eventWin);
      const hide = String(near(p, s) || near(p, e));
      if (el.dataset.occluded !== hide) el.dataset.occluded = hide;
    }
    if (!firstFrame) {
      firstFrame = true;
      opts.onFirstFrame?.();
    }
  };

  scene.preUpdate.addEventListener(onPreUpdate);
  scene.postRender.addEventListener(onPostRender);

  return {
    setFocus(key) {
      if (key === focus) {
        rangeTween = { from: Cartesian3.magnitude(camera.position), to: RANGES[key], t: opts.reduceMotion ? 1 : 0 };
        return;
      }
      prevFocus = focus;
      focus = key;
      blend = opts.reduceMotion ? 1 : 0;
      rangeTween = { from: Cartesian3.magnitude(camera.position), to: RANGES[key], t: opts.reduceMotion ? 1 : 0 };
      intro = null;
      zoomTarget = null;
      opts.onFocusChange?.(key);
    },
    getFocus: () => focus,
    setZoomEnabled(on) {
      zoomEnabled = on;
    },
    setRendering(on) {
      if (viewer.useDefaultRenderLoop === on) return;
      last = performance.now();
      viewer.useDefaultRenderLoop = on;
    },
    playIntro() {
      if (opts.reduceMotion) return;
      intro = { t: 0 };
    },
    destroy() {
      destroyed = true;
      scene.preUpdate.removeEventListener(onPreUpdate);
      scene.postRender.removeEventListener(onPostRender);
      scene.canvas.removeEventListener("wheel", onWheel);
      handler.destroy();
      viewer.destroy();
    },
  };
}
