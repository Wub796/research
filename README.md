# ARES-1 — Heliocentric Trajectory Visualizer / PPO Guidance Console

A scroll-led research visualization of an autonomous guidance experiment: a PPO
(reinforcement learning) controller pilots a low-thrust spacecraft from Earth
to Mars while its engine quietly degrades in flight. An Isolation Forest
watches telemetry for the first sign of the unseen failure — and the site's
live instrument lets you scrub through every decision the controller makes
after that point.

Live at **https://Wub796.github.io/research/**

## The mission, in numbers

- **11,040 hours** — duration of the heliocentric transfer
- **1,000 h** — thruster specific-impulse decay begins
- **1,497 h** — the Isolation Forest flags an anomalous engine signature
- **1,500 h** — hardware failure locks specific impulse at **1,514.7 s**
- **1,514.7 s** — the degraded Isp the PPO policy must keep flying with

## The experience

The page is one long scroll scene. The hero is the real mission drawn to scale
in the ecliptic plane — scrolling it runs the mission clock, inks the transfer
in and moves Earth and Mars to where they actually were. The editorial chapters
ride over a parallax object parade; **The Signal** pins a scroll-drawn chart of
specific impulse whose scroll time dilates through hours 1,450–1,510, with a
loupe that separates the 1,497 h flag from the 1,500 h lock; the five decision
points play out in a pinned horizontal pan over a true-scale mission rail; and
the black console opens like an aperture as it reaches the top.

**In the console:** a heliocentric CesiumJS scene in mean-ecliptic J2000,
aligned with the real star background. Bodies render at true size once you
zoom close enough (lit from the Sun, Earth textured and rotating at its real
sidereal rate), orbit rings carry comet tails behind each planet, and the
spacecraft trail is shaded by engine state with the exhaust pointing opposite
the commanded thrust. The mission clock runs continuously (cubic-Hermite
interpolation between samples) with an *event hold* that slows playback through
the anomaly window. Telemetry includes Isp, thrust, propellant, Δv delivered,
heliocentric speed, Earth range with one-way light time and Sun–Earth–probe
angle, and Mars range with relative speed. Keyboard: `Space` play, `←/→` ±1 h
(`Shift` ±24 h), `1–4` camera focus.

## Repository layout

```
public/
  mission.json            flight data for the console (built by scripts/export_mission.py)
  cesium/                 copied by postinstall; figures/, fonts/, audio/
scripts/
  export_mission.py       CSV + astropy ephemerides → mission.json + src/lib/orrery.generated.ts
  copy-cesium-assets.cjs  postinstall hook — copies Cesium into public/cesium
  visualize.py            offline analysis + figure generation (matplotlib)
src/
  app/page.tsx            the scroll-led landing (boot gate, hero, chapters, signal, pan, console)
  app/globals.css         design tokens + all landing/console styles
  components/
    BootScreen.tsx        boot overlay driven by real load stages
    Globe.tsx             the instrument chrome (telemetry, log, timeline, transport)
    console/scene.ts      imperative Cesium scene: frame, bodies, trail, camera, labels
    console/materials.ts  GLSL fabric materials (Sun, Earth, Mars, trail, orbits, plume)
    console/simClock.ts   continuous mission clock with event hold
    HeroOrrery.tsx        to-scale scroll-driven orrery in the hero
    SignalChart.tsx       pinned scroll-drawn Isp chart with loupe
    MissionPan.tsx        GSAP pinned horizontal scrub + true-scale rail
    SmoothScroll.tsx      Lenis driven by GSAP's ticker (ScrollTrigger in sync)
    fx.tsx                decode text, magnetic buttons
  lib/
    mission.ts            dataset loader, Hermite interpolation, derived telemetry
    orrery.generated.ts   precomputed landing geometry (generated)
    cesiumInit.ts         sets window.CESIUM_BASE_URL before Cesium boots
    paths.ts              GitHub Pages base-path helper (mirrors next.config.mjs)
```

## Regenerating the flight data

`scripts/export_mission.py` needs astropy (the research repo's venv has it):

```bash
/path/to/research/.venv/bin/python scripts/export_mission.py
```

It converts the barycentric-equatorial CSV into heliocentric mean-ecliptic
J2000 (removing the Sun's barycentric offset and the 23.4° equatorial tilt the
previous export drew), samples the spacecraft every 2 h and the planets daily
with velocities for Hermite interpolation, and prints the summary numbers the
site quotes.

## Tech stack

- **Next.js 15** — static export (`output: 'export'`) for GitHub Pages
- **CesiumJS + Resium** — the 3D heliocentric console
- **Framer Motion + GSAP ScrollTrigger** — scroll scenes, scrubbed text, the pinned pan
- **Tailwind CSS + Lenis** — styling and smooth scrolling

## Local development

```bash
npm ci          # installs and copies Cesium assets into public/cesium
npm run dev     # dev server — served under the /research base path
npm run build   # static export to out/
```

`basePath` is `/research` to match the GitHub Pages subpath; mirror it wherever
runtime URLs are built (`src/lib/paths.ts`).

## Deploying to GitHub Pages

Pushes to `main` trigger `.github/workflows/deploy.yml` (static export →
`actions/upload-pages-artifact` → `actions/deploy-pages`). One-time setup:

1. Repo **Settings → Pages → Source**: pick **GitHub Actions**.
2. Push (or re-run the workflow) — the site appears at the repo's Pages URL.
3. If the base path ever changes (repo rename or custom domain at the root),
   update `basePath` in `next.config.mjs` and `BASE_PATH` in `src/lib/paths.ts`
   together — everything else derives from them.
