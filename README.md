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

The page is one long scroll scene: the editorial chapters ride over a
parallax object parade (each act hands off to the next as you scroll), the
mission's five decision points play out in a pinned horizontal pan, and the
whole thing hands into a black CesiumJS console — the instrument where you
scrub the transfer, watch the anomaly fire, and see the model change its mind.

**In the console:** play/pause the 11,040-hour timeline, follow the spacecraft
or lock onto the Sun, Earth, or Mars, and switch the right-hand panel between
the live guidance log and the science plots (trajectory, Isp decay, thrust vs.
propellant) — each plot opens full-screen with a zoom overlay. A boot sequence
covers the page until the instrument is ready.

## Repository layout

```
public/                 cesium/ (copied by postinstall), figures/, fonts/, trajectory_data.json
scripts/
  copy-cesium-assets.cjs  postinstall hook — copies Cesium into public/cesium
  visualize.py            offline analysis + figure generation (matplotlib)
src/
  app/page.tsx            the scroll-led landing (boot gate, hero, chapters, CTA)
  app/globals.css         design tokens + all landing/console styles
  components/
    BootScreen.tsx        full-screen boot sequence
    Globe.tsx             the CesiumJS console (the instrument)
    MissionPan.tsx        GSAP pinned horizontal scrub of the five decision points
    HeroBlob.tsx          legacy standalone Three.js blob (not used on the landing)
  lib/
    cesiumInit.ts         sets window.CESIUM_BASE_URL before Cesium boots
    paths.ts              GitHub Pages base-path helper (mirrors next.config.mjs)
public/trajectory_data.json   precomputed mission telemetry for the console
```

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
