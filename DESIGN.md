# DESIGN.md — ARES-1 Heliocentric Guidance Showcase

> Derived from the Vibe Code Vault (`04 Templates/project-starter/DESIGN.md`, `oxidecomputer.md`, `mengto--light-mode-paper-technical`, `enesozturk--dimensional-drawing`, and `leonxlnx--taste-skill`).

---

## 1. Aesthetic Direction

- **Domain:** Autonomous spacecraft guidance, low-thrust astrodynamics, and propulsion anomaly detection (`ARES-1 / J2000 Ecliptic Transfer`).
- **Persona:** **Archival Swiss Engineering Plate × Oxide Mission Console** — warm technical drafting stock (`#f0eee8`) with exposed coordinate hairlines, L-bracket corner fiducials, and dimensional callouts above; obsidian mission telemetry (`#050505`) with phosphor-amber (`#fab219`) and thruster-vermilion (`#e84b2c`) status vectors below.
- **Brand Inspirations:**
  1. **JPL Technical Memoranda & Voyager Flight Data Sheets** — true-scale ecliptic plots, ephemeris tables, `tabular-nums` mission elapsed time (`T+01497 H`).
  2. **Oxide Computer (`oxidecomputer.md`)** — engineering transparency, schematic SVG bus architectures, terminal-grade honesty, zero decorative marketing fluff.
  3. **Swiss Editorial & Framed Technical Paper (`mengto--light-mode-paper-technical`, `enesozturk--dimensional-drawing`)** — structural hairlines, dimension extension lines with arrowheads, title-block metadata strips, and extreme typographic scale contrast.

---

## 2. Color & Atmospheric Polarity

### Editorial Paper Surface (Sections 00–04)
- **Primary Canvas (`--paper`):** `#f0eee8` (Warm archival drafting paper)
- **Elevated / Blueprint Surface (`--paper-deep`):** `#e6e3db` (Recessed technical well)
- **Primary Ink (`--ink`):** `#111111` (Deep carbon)
- **Secondary Ink (`--ink-muted`):** `#52504b` (Graphite technical note)
- **Rule / Grid Hairline (`--paper-rule`):** `rgba(17, 17, 17, 0.16)`

### Live Telemetry & Closed-Loop Architecture Surface (Sections 04–05)
- **Primary Void (`--c-bg`):** `#050505` (Deep instrument black)
- **Elevated Module (`--c-surface`):** `#0b0b0b`
- **Primary Readout (`--c-ink`):** `#f0eee8`
- **Secondary Readout (`--c-dim`):** `rgba(240, 238, 232, 0.62)`
- **Faint / Coordinate (`--c-faint`):** `rgba(240, 238, 232, 0.38)`
- **Hairline (`--c-hair`):** `rgba(240, 238, 232, 0.12)`

### Semantic Signal Tokens
- **Primary Accent / Failure Lock (`--accent`):** `#e84b2c` (International aerospace vermilion — H1,500 lock at `1,514.7 s`)
- **Anomaly Warning (`--warn`):** `#fab219` (Isolation Forest early-warning flag at H1,497 / decay onset at H1,000)
- **Nominal / Locked Vector (`--good`):** `#0ca30c` (Nominal SPT-140 operation at `1,782.0 s`)
- **Banned Tokens:** Zero `#8b5cf6` / `#6366f1` purple/indigo glows, zero neon gradients, zero glassmorphic filler cards.

---

## 3. Typography & Scannable Hierarchy

- **Display & Editorial (`--f`):** Self-hosted `Helv` (`Helvetica`, bold + oblique) — tight tracking (`-0.06em` to `-0.09em`), `text-wrap: balance` on display headers.
- **Telemetry & Coordinate Mono (`--f-vcr`):** Self-hosted `VCR` monospace — uppercase tracking (`0.14em` to `0.28em`), mandatory `font-variant-numeric: tabular-nums` on all mission hours, distances, $\Delta v$, and $I_{\text{sp}}$ values.

---

## 4. Layout, Spatial Architecture & Focal Point Design

- **Architectural Title Block & Sticky Index Bar:** Top instrument strip with live scroll-synced mission clock, coordinate reference (`ECLIPTIC J2000`), and section jump indices (`00 ORBIT`, `01 BRIEF`, `02 SIGNAL`, `03 FILMSTRIP`, `04 ARCHITECTURE`, `05 CONSOLE`).
- **Hero Ecliptic Plate (`HeroOrrery.tsx`):** True-scale heliocentric J2000 plot with L-bracket fiducials, Sun-to-spacecraft radial range vector, thrust-vector ticks along the spiral, Hohmann reference chord, and interactive time-scrubbing probe directly on the orbital plane.
- **3-Act Stage Parade (`page.tsx`):** Technical SVG cross-sections and phase-space plots (Act 01: SPT-140 Hall Thruster discharge channel & logarithmic wear fit $P(h) = P_0 - k \ln(1 + h/\tau)$; Act 02: 11-state observation vector to 243-parameter neural pilot $11 \to 16 \to 3$; Act 03: 55.8% terminal miss cut & 1.94 µs flight computer execution) replacing generic CSS boxes.
- **Multi-Channel Signal Plot (`SignalChart.tsx`):** Synchronized $I_{\text{sp}}(t)$ decay curve, Xenon mass-flow rate $\dot{m}(t)$, and Isolation Forest anomaly score $s(t)$ crossing the `0.65` detection threshold at H1,497, with magnifier loupe and accessible keyboard/pointer probe.
- **Horizontal Filmstrip (`MissionPan.tsx`):** Each of the 5 decision frames includes a true-scale orbital phase vignette showing the exact Sun–Earth–ARES-1–Mars geometry and telemetry vector at that hour.
- **Closed-Loop Guidance & SPT-140 Spec Sheet (`page.tsx`):** Interactive schematic bus diagram (`leonxlnx--taste-skill` + `enesozturk--dimensional-drawing`) where visitors can switch between `NOMINAL (T+0500 H)`, `ANOMALY FLAGGED (T+1497 H)`, and `ISP LOCKED (T+1500 H)` to inspect live signal propagation across the 4 subsystems and read the dimensional engineering specification table.
- **Live 3D Console (`Globe.tsx`):** Full-viewport CesiumJS heliocentric instrument with native `<dialog>` figure lightbox (`showModal()`, `closedby="any"`, `overscroll-behavior: contain`).
