"use client";

import { useMemo, useRef, type RefObject } from "react";
import { motion, useMotionTemplate, useMotionValueEvent, useReducedMotion, useScroll, useSpring, useTransform } from "framer-motion";
import { orrery } from "../lib/orrery.generated";

/* The hero figure is the real mission, drawn to scale in the ecliptic plane:
   Earth's and Mars' orbits, the ARES-1 path and the planets at their true
   positions. Scrolling the hero runs the mission clock — the path inks in,
   the planets move to where they actually were, and the plane rises out of
   its tilt. Explanatory motion on a marketing surface, seen once per visit. */

const S = 196; // svg units per AU
type P = readonly [number, number];
const xy = (p: P) => [p[0] * S, -p[1] * S] as const;
const pathOf = (pts: readonly P[], close = false) =>
  pts.map((p, i) => `${i ? "L" : "M"}${xy(p)[0].toFixed(1)},${xy(p)[1].toFixed(1)}`).join("") + (close ? "Z" : "");

const HOURS = orrery.hours[orrery.hours.length - 1];

function sampleAt(arr: readonly P[], f: number) {
  const x = Math.min(Math.max(f, 0), 1) * (arr.length - 1);
  const i = Math.min(Math.floor(x), arr.length - 2);
  const u = x - i;
  return [arr[i][0] + (arr[i + 1][0] - arr[i][0]) * u, arr[i][1] + (arr[i + 1][1] - arr[i][1]) * u] as const;
}

export default function HeroOrrery({ booted, target }: { booted: boolean; target: RefObject<HTMLElement | null> }) {
  const reduce = useReducedMotion() ?? false;
  const sc = orrery.sc as readonly P[];
  const earth = orrery.earth as readonly P[];
  const mars = orrery.mars as readonly P[];

  const geo = useMemo(() => {
    // cumulative arc length so "fraction of mission time" maps to "fraction of path drawn"
    const cum = [0];
    for (let i = 1; i < sc.length; i++) cum.push(cum[i - 1] + Math.hypot(sc[i][0] - sc[i - 1][0], sc[i][1] - sc[i - 1][1]));
    const total = cum[cum.length - 1];
    const events = [1000, 1500].map((h) => {
      const f = h / HOURS;
      return { h, p: xy(sampleAt(sc, f)) };
    });
    const ticks = Array.from({ length: 36 }, (_, i) => {
      const a = (i * 10 * Math.PI) / 180;
      const r0 = 1.86 * S;
      const r1 = r0 + (i % 9 === 0 ? 16 : i % 3 === 0 ? 9 : 4);
      return { i, d: `M${(Math.cos(a) * r0).toFixed(1)},${(-Math.sin(a) * r0).toFixed(1)}L${(Math.cos(a) * r1).toFixed(1)},${(-Math.sin(a) * r1).toFixed(1)}` };
    });
    return {
      transfer: pathOf(sc),
      earthOrbit: pathOf(orrery.earthOrbit as readonly P[], true),
      marsOrbit: pathOf(orrery.marsOrbit as readonly P[], true),
      lengthAt: (f: number) => {
        const x = Math.min(Math.max(f, 0), 1) * (cum.length - 1);
        const i = Math.min(Math.floor(x), cum.length - 2);
        return (cum[i] + (cum[i + 1] - cum[i]) * (x - i)) / total;
      },
      events,
      ticks,
    };
  }, [sc]);

  const { scrollYProgress } = useScroll({ target, offset: ["start start", "end start"] });
  const progress = useSpring(scrollYProgress, { stiffness: 110, damping: 28, mass: 0.6 });
  const rx = useTransform(progress, [0, 1], reduce ? [52, 52] : [58, 22]);
  const rz = useTransform(progress, [0, 1], reduce ? [-16, -16] : [-16, 4]);
  const scale = useTransform(progress, [0, 1], reduce ? [1, 1] : [1, 1.1]);
  const transform = useMotionTemplate`perspective(1700px) rotateX(${rx}deg) rotateZ(${rz}deg) scale(${scale})`;

  const flownRef = useRef<SVGPathElement>(null);
  const scRef = useRef<SVGGElement>(null);
  const earthRef = useRef<SVGGElement>(null);
  const marsRef = useRef<SVGGElement>(null);
  const metRef = useRef<HTMLSpanElement>(null);
  const dateRef = useRef<HTMLSpanElement>(null);
  const launch = new Date(orrery.summary.launchUtc).getTime();

  const place = (p: number) => {
    const f = reduce ? 0 : Math.min(1, Math.max(0, p * 1.05));
    const hour = f * HOURS;
    flownRef.current?.style.setProperty("stroke-dashoffset", String(1 - geo.lengthAt(f)));
    const [sx, sy] = xy(sampleAt(sc, f));
    scRef.current?.setAttribute("transform", `translate(${sx.toFixed(1)} ${sy.toFixed(1)})`);
    const [ex, ey] = xy(sampleAt(earth, f));
    earthRef.current?.setAttribute("transform", `translate(${ex.toFixed(1)} ${ey.toFixed(1)})`);
    const [mx, my] = xy(sampleAt(mars, f));
    marsRef.current?.setAttribute("transform", `translate(${mx.toFixed(1)} ${my.toFixed(1)})`);
    if (metRef.current) metRef.current.textContent = `T+${String(Math.round(hour)).padStart(5, "0")} H`;
    if (dateRef.current) dateRef.current.textContent = new Date(launch + hour * 3.6e6).toISOString().slice(0, 10);
  };
  useMotionValueEvent(progress, "change", place);

  const [sx0, sy0] = xy(sc[0]);
  const [ex0, ey0] = xy(earth[0]);
  const [mx0, my0] = xy(mars[0]);

  return (
    <div className="orrery" data-booted={booted} aria-hidden="true">
      <motion.div className="orrery__plane" style={{ transform }}>
        <svg className="orrery__svg" viewBox="-420 -420 840 840">
          <circle className="orrery__compass" r={1.86 * S} pathLength={1} data-draw />
          {geo.ticks.map((t) => (
            <path key={t.i} d={t.d} className={`orrery__tick${t.i % 9 === 0 ? " is-major" : ""}`} />
          ))}
          <text className="orrery__lon" x={1.86 * S + 22} y={4}>0° ♈</text>
          <path d={geo.earthOrbit} className="orrery__orbit orrery__orbit--earth" pathLength={1} data-draw />
          <path d={geo.marsOrbit} className="orrery__orbit orrery__orbit--mars" pathLength={1} data-draw />
          <path d={geo.transfer} className="orrery__planned" pathLength={1} data-draw />
          <path ref={flownRef} d={geo.transfer} className="orrery__flown" pathLength={1} />
          {geo.events.map((e) => (
            <g key={e.h} transform={`translate(${e.p[0].toFixed(1)} ${e.p[1].toFixed(1)})`} className={`orrery__event${e.h === 1500 ? " is-crit" : ""}`}>
              <rect x={-3.5} y={-3.5} width={7} height={7} transform="rotate(45)" />
              <text x={9} y={-8}>{e.h === 1500 ? "H1,500 LOCK" : "H1,000 DECAY"}</text>
            </g>
          ))}
          <g className="orrery__sun">
            <circle r={16} className="orrery__sun-halo" />
            <circle r={6.5} />
          </g>
          <g ref={earthRef} className="orrery__earth" transform={`translate(${ex0} ${ey0})`}>
            <circle r={4.5} />
            <text x={9} y={4}>EARTH</text>
          </g>
          <g ref={marsRef} className="orrery__mars" transform={`translate(${mx0} ${my0})`}>
            <circle r={4.5} />
            <text x={9} y={4}>MARS</text>
          </g>
          <g ref={scRef} className="orrery__sc" transform={`translate(${sx0} ${sy0})`}>
            <circle r={9} className="orrery__sc-ping" />
            <rect x={-3.2} y={-3.2} width={6.4} height={6.4} transform="rotate(45)" />
          </g>
        </svg>
      </motion.div>
      <div className="orrery__readout">
        <span ref={metRef}>T+00000 H</span>
        <span ref={dateRef}>{orrery.summary.launchUtc.slice(0, 10)}</span>
        <span>ECLIPTIC J2000 · TO SCALE</span>
      </div>
    </div>
  );
}
