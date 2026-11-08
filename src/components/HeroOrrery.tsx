"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { motion, useMotionTemplate, useMotionValueEvent, useReducedMotion, useScroll, useSpring, useTransform } from "framer-motion";
import { orrery } from "../lib/orrery.generated";

/* The hero figure is the real mission, drawn to scale in the J2000 ecliptic plane:
   Earth's and Mars' orbits, the ARES-1 low-thrust spiral, Chebyshev thrust-vector
   comb ticks, and live Sun-spacecraft / Earth-spacecraft range vectors.
   Scrolling the hero runs the mission clock — or visitors can scrub/jump across
   the five mission phases directly on the plate readout. */

const S = 196; // svg units per AU
const AU_KM = 149597870.7;
type P = readonly [number, number];
const xy = (p: P) => [p[0] * S, -p[1] * S] as const;
const pathOf = (pts: readonly P[], close = false) =>
  pts.map((p, i) => `${i ? "L" : "M"}${xy(p)[0].toFixed(1)},${xy(p)[1].toFixed(1)}`).join("") + (close ? "Z" : "");

const HOURS = orrery.hours[orrery.hours.length - 1];
const ispData = orrery.isp as readonly (readonly [number, number])[];

function ispAtHour(h: number): number {
  if (h <= 1000) return 1782.0;
  if (h >= 1500) return 1514.7;
  const idx = Math.min(Math.max(Math.round(h) - 800, 0), ispData.length - 1);
  return ispData[idx]?.[1] ?? 1514.7;
}

function sampleAt(arr: readonly P[], f: number) {
  const x = Math.min(Math.max(f, 0), 1) * (arr.length - 1);
  const i = Math.min(Math.floor(x), arr.length - 2);
  const u = x - i;
  return [arr[i][0] + (arr[i + 1][0] - arr[i][0]) * u, arr[i][1] + (arr[i + 1][1] - arr[i][1]) * u] as const;
}

const KEY_HOURS = [
  { h: 0, label: "LAUNCH" },
  { h: 1000, label: "H1,000 DECAY" },
  { h: 1497, label: "H1,497 FLAG" },
  { h: 1500, label: "H1,500 LOCK" },
  { h: 11040, label: "ARRIVAL" },
] as const;

export default function HeroOrrery({ booted, target }: { booted: boolean; target: RefObject<HTMLElement | null> }) {
  const reduce = useReducedMotion() ?? false;
  const sc = orrery.sc as readonly P[];
  const earth = orrery.earth as readonly P[];
  const mars = orrery.mars as readonly P[];
  const [manualFrac, setManualFrac] = useState<number | null>(null);

  const geo = useMemo(() => {
    const cum = [0];
    for (let i = 1; i < sc.length; i++) cum.push(cum[i - 1] + Math.hypot(sc[i][0] - sc[i - 1][0], sc[i][1] - sc[i - 1][1]));
    const total = cum[cum.length - 1];
    const events = [
      { h: 1000, tag: "H1,000 DECAY", crit: false },
      { h: 1497, tag: "H1,497 FLAG", crit: false },
      { h: 1500, tag: "H1,500 LOCK", crit: true },
    ].map((e) => ({
      ...e,
      p: xy(sampleAt(sc, e.h / HOURS)),
    }));
    const ticks = Array.from({ length: 72 }, (_, i) => {
      const a = (i * 5 * Math.PI) / 180;
      const r0 = 1.86 * S;
      const r1 = r0 + (i % 18 === 0 ? 18 : i % 6 === 0 ? 10 : 4.5);
      return {
        i,
        major: i % 18 === 0,
        mid: i % 6 === 0,
        deg: i * 5,
        lx: Math.cos(a) * (r0 + 30),
        ly: -Math.sin(a) * (r0 + 30),
        d: `M${(Math.cos(a) * r0).toFixed(1)},${(-Math.sin(a) * r0).toFixed(1)}L${(Math.cos(a) * r1).toFixed(1)},${(-Math.sin(a) * r1).toFixed(1)}`,
      };
    });
    // Thrust-vector comb ticks along the spiral showing outward tangential acceleration
    const thrustVectors: string[] = [];
    for (let i = 4; i < sc.length - 4; i += 6) {
      const [x, y] = xy(sc[i]);
      const [nx, ny] = xy(sc[i + 1]);
      const tx = nx - x;
      const ty = ny - y;
      const tLen = Math.hypot(tx, ty) || 1;
      // Normal + tangential low-thrust steering vector
      const rx = x;
      const ry = y;
      const rLen = Math.hypot(rx, ry) || 1;
      const vx = (tx / tLen) * 0.78 + (rx / rLen) * 0.62;
      const vy = (ty / tLen) * 0.78 + (ry / rLen) * 0.62;
      const vLen = Math.hypot(vx, vy) || 1;
      const scale = i * 46 >= 1000 && i * 46 <= 1550 ? 17 : 12;
      thrustVectors.push(
        `M${x.toFixed(1)},${y.toFixed(1)}L${(x + (vx / vLen) * scale).toFixed(1)},${(y + (vy / vLen) * scale).toFixed(1)}`,
      );
    }

    const [ex0, ey0] = xy(earth[0]);
    const [mxEnd, myEnd] = xy(mars[mars.length - 1]);

    return {
      transfer: pathOf(sc),
      earthOrbit: pathOf(orrery.earthOrbit as readonly P[], true),
      marsOrbit: pathOf(orrery.marsOrbit as readonly P[], true),
      thrustComb: thrustVectors.join(""),
      chord: `M${ex0.toFixed(1)},${ey0.toFixed(1)}L${mxEnd.toFixed(1)},${myEnd.toFixed(1)}`,
      lengthAt: (f: number) => {
        const x = Math.min(Math.max(f, 0), 1) * (cum.length - 1);
        const i = Math.min(Math.floor(x), cum.length - 2);
        return (cum[i] + (cum[i + 1] - cum[i]) * (x - i)) / total;
      },
      events,
      ticks,
    };
  }, [sc, earth, mars]);

  const { scrollYProgress } = useScroll({ target, offset: ["start start", "end start"] });
  const progress = useSpring(scrollYProgress, { stiffness: 110, damping: 28, mass: 0.6 });
  const rx = useTransform(progress, [0, 1], reduce ? [46, 46] : [54, 20]);
  const rz = useTransform(progress, [0, 1], reduce ? [-14, -14] : [-15, 4]);
  const scale = useTransform(progress, [0, 1], reduce ? [1, 1] : [1, 1.08]);
  const transform = useMotionTemplate`perspective(1700px) rotateX(${rx}deg) rotateZ(${rz}deg) scale(${scale})`;

  const flownRef = useRef<SVGPathElement>(null);
  const scRef = useRef<SVGGElement>(null);
  const earthRef = useRef<SVGGElement>(null);
  const marsRef = useRef<SVGGElement>(null);
  const sunVecRef = useRef<SVGLineElement>(null);
  const earthChordRef = useRef<SVGLineElement>(null);
  const metRef = useRef<HTMLSpanElement>(null);
  const dateRef = useRef<HTMLSpanElement>(null);
  const radRef = useRef<HTMLSpanElement>(null);
  const ispRef = useRef<HTMLSpanElement>(null);
  const launch = new Date(orrery.summary.launchUtc).getTime();

  const applyFraction = (fRaw: number) => {
    const f = Math.min(1, Math.max(0, fRaw));
    const hour = f * HOURS;
    flownRef.current?.style.setProperty("stroke-dashoffset", String(1 - geo.lengthAt(f)));
    const scPt = sampleAt(sc, f);
    const [sx, sy] = xy(scPt);
    scRef.current?.setAttribute("transform", `translate(${sx.toFixed(1)} ${sy.toFixed(1)})`);
    const [ex, ey] = xy(sampleAt(earth, f));
    earthRef.current?.setAttribute("transform", `translate(${ex.toFixed(1)} ${ey.toFixed(1)})`);
    const [mx, my] = xy(sampleAt(mars, f));
    marsRef.current?.setAttribute("transform", `translate(${mx.toFixed(1)} ${my.toFixed(1)})`);

    sunVecRef.current?.setAttribute("x2", sx.toFixed(1));
    sunVecRef.current?.setAttribute("y2", sy.toFixed(1));
    earthChordRef.current?.setAttribute("x1", ex.toFixed(1));
    earthChordRef.current?.setAttribute("y1", ey.toFixed(1));
    earthChordRef.current?.setAttribute("x2", sx.toFixed(1));
    earthChordRef.current?.setAttribute("y2", sy.toFixed(1));

    const rAu = Math.hypot(scPt[0], scPt[1]);
    const isp = ispAtHour(hour);
    if (metRef.current) metRef.current.textContent = `T+${String(Math.round(hour)).padStart(5, "0")} H`;
    if (dateRef.current) dateRef.current.textContent = new Date(launch + hour * 3.6e6).toISOString().slice(0, 10);
    if (radRef.current) radRef.current.textContent = `R ${rAu.toFixed(3)} AU (${Math.round((rAu * AU_KM) / 1e6)}M KM)`;
    if (ispRef.current) ispRef.current.textContent = `ISP ${isp.toFixed(1)} S`;
  };

  useMotionValueEvent(progress, "change", (p) => {
    if (manualFrac !== null) return;
    applyFraction(reduce ? 0.136 : p * 1.05);
  });

  useEffect(() => {
    if (manualFrac !== null) applyFraction(manualFrac);
  });

  const [sx0, sy0] = xy(sc[0]);
  const [ex0, ey0] = xy(earth[0]);
  const [mx0, my0] = xy(mars[0]);

  return (
    <div className="orrery-plate" data-booted={booted}>
      {/* Plate Header */}
      <div className="orrery-plate__head">
        <div className="orrery-plate__head-left">
          <span className="orrery-plate__badge">PLATE 01</span>
          <span className="orrery-plate__title">J2000 HELIOCENTRIC ORBITAL PLANE</span>
        </div>
        <div className="orrery-plate__head-right">
          <span>SCALE · 1 AU = 196U</span>
        </div>
      </div>

      {/* Plate Canvas Area with Corner Fiducials */}
      <div className="orrery-plate__canvas-wrap">
        <div className="orrery__fiducials" aria-hidden="true">
          <span className="orrery__fid orrery__fid--tl">γ 0° EQUINOX</span>
          <span className="orrery__fid orrery__fid--tr">DWG · ARES-1</span>
          <span className="orrery__fid orrery__fid--bl">SOL-CENTERED</span>
          <span className="orrery__fid orrery__fid--br">EPOCH · 2027</span>
        </div>

        <motion.div className="orrery__plane" style={{ transform }} aria-hidden="true">
          <svg className="orrery__svg" viewBox="-430 -430 860 860">
            {/* Reference heliocentric AU rings */}
            <circle className="orrery__au-ring" r={0.5 * S} />
            <circle className="orrery__au-ring" r={1.0 * S} />
            <circle className="orrery__au-ring" r={1.5 * S} />
            <line className="orrery__crosshair" x1={-1.86 * S} y1={0} x2={1.86 * S} y2={0} />
            <line className="orrery__crosshair" x1={0} y1={-1.86 * S} x2={0} y2={1.86 * S} />

            <circle className="orrery__compass" r={1.86 * S} pathLength={1} data-draw />
            {geo.ticks.map((t) => (
              <g key={t.i}>
                <path d={t.d} className={`orrery__tick${t.major ? " is-major" : t.mid ? " is-mid" : ""}`} />
                {t.major && (
                  <text className="orrery__lon" x={t.lx} y={t.ly + 3} textAnchor="middle">
                    {t.deg === 0 ? "0° γ" : `${t.deg}°`}
                  </text>
                )}
              </g>
            ))}

            {/* Direct Launch-to-Arrival synodic chord */}
            <path d={geo.chord} className="orrery__chord" />

            {/* Planetary orbits & low-thrust transfer */}
            <path d={geo.earthOrbit} className="orrery__orbit orrery__orbit--earth" pathLength={1} data-draw />
            <path d={geo.marsOrbit} className="orrery__orbit orrery__orbit--mars" pathLength={1} data-draw />
            <path d={geo.thrustComb} className="orrery__comb" />
            <path d={geo.transfer} className="orrery__planned" pathLength={1} data-draw />
            <path ref={flownRef} d={geo.transfer} className="orrery__flown" pathLength={1} />

            {/* Live dynamic telemetry vectors */}
            <line ref={sunVecRef} x1={0} y1={0} x2={sx0} y2={sy0} className="orrery__vec-sun" />
            <line ref={earthChordRef} x1={ex0} y1={ey0} x2={sx0} y2={sy0} className="orrery__vec-earth" />

            {geo.events.map((e) => (
              <g
                key={e.h}
                transform={`translate(${e.p[0].toFixed(1)} ${e.p[1].toFixed(1)})`}
                className={`orrery__event${e.crit ? " is-crit" : ""}`}
              >
                <line x1={0} y1={0} x2={e.h === 1497 ? -18 : 16} y2={e.h === 1497 ? 16 : -14} className="orrery__event-leader" />
                <rect x={-3.5} y={-3.5} width={7} height={7} transform="rotate(45)" />
                <text x={e.h === 1497 ? -22 : 20} y={e.h === 1497 ? 24 : -14} textAnchor={e.h === 1497 ? "end" : "start"}>
                  {e.tag}
                </text>
              </g>
            ))}

            <g className="orrery__sun">
              <circle r={18} className="orrery__sun-halo" />
              <circle r={6.5} />
              <text x={12} y={14} className="orrery__body-tag">SOL</text>
            </g>
            <g ref={earthRef} className="orrery__earth" transform={`translate(${ex0} ${ey0})`}>
              <circle r={4.5} />
              <text x={9} y={4}>EARTH · 1.00 AU</text>
            </g>
            <g ref={marsRef} className="orrery__mars" transform={`translate(${mx0} ${my0})`}>
              <circle r={4.5} />
              <text x={9} y={4}>MARS · 1.52 AU</text>
            </g>
            <g ref={scRef} className="orrery__sc" transform={`translate(${sx0} ${sy0})`}>
              <circle r={10} className="orrery__sc-ping" />
              <rect x={-3.5} y={-3.5} width={7} height={7} transform="rotate(45)" />
              <text x={10} y={-8} className="orrery__sc-tag">ARES-1</text>
            </g>
          </svg>
        </motion.div>
      </div>

      {/* Plate Footer: Live Telemetry & Quick-Epoch Pills */}
      <div className="orrery-plate__foot">
        <div className="orrery-plate__readout" aria-live="off">
          <span ref={metRef} className="orrery-plate__readout-primary">T+00000 H</span>
          <span ref={dateRef}>{orrery.summary.launchUtc.slice(0, 10)}</span>
          <span ref={radRef}>R 0.988 AU (148M KM)</span>
          <span ref={ispRef}>ISP 1782.0 S</span>
        </div>
        <div className="orrery-plate__pills" role="group" aria-label="Inspect mission epoch on hero plate">
          {KEY_HOURS.map((item) => {
            const f = item.h / HOURS;
            const active = manualFrac !== null && Math.abs(manualFrac - f) < 0.001;
            return (
              <button
                key={item.h}
                type="button"
                className={`orrery-plate__pill${active ? " is-active" : ""}${item.h === 1500 ? " is-crit" : item.h === 1497 ? " is-warn" : ""}`}
                onClick={() => setManualFrac(active ? null : f)}
              >
                {item.label}
              </button>
            );
          })}
          {manualFrac !== null && (
            <button type="button" className="orrery-plate__pill orrery-plate__pill--reset" onClick={() => setManualFrac(null)}>
              SYNC
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
