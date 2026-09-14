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

## The flight path is physically propagated

The trajectory the site draws is **not** `artifacts/optimal_mars_trajectory.csv`.
That file is a geometric blend between Earth's and Mars' ephemerides (it
matches `research/scripts/generate_transfer_trajectory.py` exactly): it needs
~25× the acceleration the thruster can make, and replaying its thrust commands
through real dynamics ends ~360 million km from Mars.

`scripts/design_transfer.py` replaces it with a transfer that obeys the
equations of motion under the study's own hardware and timeline:

- heliocentric point-mass Sun + continuous thrust, integrated with DOP853
  (planetary perturbations neglected — Jupiter is < 0.4% of thrust acceleration)
- SPT-140: T ≤ 0.289 N; Isp 1,782 s → log decay from 1,000 h → 1,514.7 s lock at
  1,500 h; ṁ = T/(Isp·g0); 2,747 kg wet, 1,648 kg dry
- launch 2027-02-19 from Earth with a launch-vehicle v∞; arrival fixed at
  11,040 h at Mars' position (intercept — the research environment's success test)
- smooth Chebyshev steering and throttle; SLSQP minimises launch and arrival
  speeds, then a polish closes the intercept exactly

| Result | Value |
| --- | --- |
| Launch v∞ / C3 | 4.26 km/s / 18.1 km²/s² |
| Arrival speed relative to Mars | 3.62 km/s |
| Engine Δv / mean throttle | 4.88 km/s / 99.9% |
| Propellant used | 761 kg of 1,099 kg |
| Sun distance | 0.99 – 1.70 AU |

A rendezvous (zero relative speed) is not reachable on these dates: the
ballistic arc arrives at 9.1 km/s relative to Mars, about twice the engine's
whole Δv budget. **Checks** (printed by the script): terminal miss 11 m;
Radau vs DOP853 terminal difference 13 m; finite-difference acceleration vs
gravity + thrust residual < 1×10⁻⁹ m/s²; implied thrust never exceeds 0.289 N.
Replaying the hourly commands through `SpacecraftEnv.step()`'s 1-hour
semi-implicit Euler lands 299,000 km from Mars — inside its 577,000 km
success radius.

The thrust schedule is an optimized reference under the study's engine model,
not a PPO rollout (the trained policy could not be replayed here); the console
says so beside the telemetry.

## Regenerating the flight data

All three scripts need astropy + scipy (the research repo's venv has them):

```bash
/path/to/research/.venv/bin/python scripts/design_transfer.py   # CSV + checks from the saved solution (--optimize to re-solve)
/path/to/research/.venv/bin/python scripts/export_mission.py    # mission.json + orrery geometry
/path/to/research/.venv/bin/python scripts/visualize.py         # paper figures → artifacts/ (copy PNGs to public/figures)
```

`export_mission.py` converts the barycentric-equatorial CSV into heliocentric
mean-ecliptic J2000 (removing the Sun's barycentric offset and the 23.4°
equatorial tilt), samples the spacecraft every 2 h and the planets daily with
velocities for Hermite interpolation, and prints the summary numbers the site
quotes.

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
