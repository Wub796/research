"use client";

import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useMotionValueEvent, useReducedMotion, useScroll } from "framer-motion";
import { orrery } from "../lib/orrery.generated";
import { DecodeText } from "./fx";

/* THE SIGNAL — a pinned, scroll-drawn chart of specific impulse through the
   degradation window. Scroll is the clock: the line inks forward, the
   playhead reads the exact value, and scroll time dilates around hours
   1,450–1,510 so the three hours between the Isolation Forest flag and the
   Isp lock get room to be read. A loupe magnifies that window because at the
   chart's true scale the two events sit 3 px apart. */

const W = 640;
const H = 360;
const M = { l: 58, r: 18, t: 22, b: 40 };
const X0 = 800;
const X1 = 1700;
const Y0 = 1500;
const Y1 = 1800;

const L = { x0: 1488, x1: 1508, y0: 1514.5, y1: 1515.9, w: 230, h: 150, l: 44, r: 10, t: 14, b: 26 };

const data = orrery.isp as readonly (readonly [number, number])[];
const ispAt = (h: number) => {
  const i = Math.min(Math.max(Math.floor(h) - X0, 0), data.length - 2);
  const u = h - Math.floor(h);
  return data[i][1] + (data[i + 1][1] - data[i][1]) * Math.min(Math.max(u, 0), 1);
};

const sx = (h: number) => M.l + ((h - X0) / (X1 - X0)) * (W - M.l - M.r);
const sy = (v: number) => M.t + (1 - (v - Y0) / (Y1 - Y0)) * (H - M.t - M.b);
const lx = (h: number) => L.l + ((h - L.x0) / (L.x1 - L.x0)) * (L.w - L.l - L.r);
const ly = (v: number) => L.t + (1 - (v - L.y0) / (L.y1 - L.y0)) * (L.h - L.t - L.b);

/** Scroll progress → hour, with dilation through the crisis window. */
const hourFor = (p: number) => {
  if (p < 0.42) return X0 + (p / 0.42) * (1450 - X0);
  if (p < 0.8) return 1450 + ((p - 0.42) / 0.38) * 60;
  return 1510 + ((Math.min(p, 1) - 0.8) / 0.2) * (X1 - 1510);
};

const STEPS = [
  { from: 0, h: "0–1,000 H", text: "The engine holds 1,782 s. The policy flies the engine it trained on." },
  { from: 1000, h: "1,000 H", text: "Specific impulse starts a logarithmic slide. Nothing has tripped yet." },
  { from: 1497, h: "1,497 H", text: "The Isolation Forest flags the engine signature at 1,514.96 s." },
  { from: 1500, h: "1,500 H", text: "Isp locks at 1,514.7 s. Every burn after this is a different engine." },
];

const TABLE = [800, 1000, 1100, 1200, 1300, 1400, 1490, 1497, 1500, 1700];
const fmt = (v: number, d: number) => v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

export default function SignalChart() {
  const sectionRef = useRef<HTMLElement>(null);
  const reduce = useReducedMotion() ?? false;
  const [hour, setHour] = useState(reduce ? X1 : X0);
  const [probe, setProbe] = useState<number | null>(null);

  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end end"] });
  const clipRef = useRef<SVGRectElement>(null);
  const headRef = useRef<SVGGElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);

  const paths = useMemo(() => {
    const line = data.map(([h, v], i) => `${i ? "L" : "M"}${sx(h).toFixed(2)},${sy(v).toFixed(2)}`).join("");
    const area = `${line}L${sx(X1)},${sy(Y0)}L${sx(X0)},${sy(Y0)}Z`;
    const loupe = data
      .filter(([h]) => h >= L.x0 && h <= L.x1)
      .map(([h, v], i) => `${i ? "L" : "M"}${lx(h).toFixed(2)},${ly(v).toFixed(2)}`)
      .join("");
    return { line, area, loupe };
  }, []);

  useMotionValueEvent(scrollYProgress, "change", (p) => {
    if (reduce) return;
    const h = hourFor(p);
    const x = sx(h);
    const v = ispAt(h);
    clipRef.current?.setAttribute("width", Math.max(0, x).toFixed(2));
    headRef.current?.setAttribute("transform", `translate(${x.toFixed(2)} ${sy(v).toFixed(2)})`);
    if (readoutRef.current) readoutRef.current.textContent = `H ${fmt(h, 0)}`;
    if (valueRef.current) valueRef.current.textContent = `${fmt(v, 2)} s`;
    // coarse state for the captions and the loupe
    const bucket = h >= 1500 ? 1500 : h >= 1497 ? 1497 : h >= 1470 ? 1470 : h >= 1000 ? 1000 : 0;
    setHour((prev) => {
      const pb = prev >= 1500 ? 1500 : prev >= 1497 ? 1497 : prev >= 1470 ? 1470 : prev >= 1000 ? 1000 : 0;
      return pb === bucket ? prev : h;
    });
  });

  const step = [...STEPS].reverse().find((s) => hour >= s.from) ?? STEPS[0];
  const loupeOn = hour >= 1470;

  const probeFromPointer = (e: PointerEvent<SVGRectElement>) => {
    const svg = e.currentTarget.ownerSVGElement!;
    const r = svg.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const h = X0 + ((x - M.l) / (W - M.l - M.r)) * (X1 - X0);
    setProbe(Math.round(Math.min(X1, Math.max(X0, h))));
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const d = e.shiftKey ? 50 : 5;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      setProbe((p) => Math.min(X1, Math.max(X0, (p ?? Math.round(hour)) + (e.key === "ArrowRight" ? d : -d))));
    }
    if (e.key === "Escape") setProbe(null);
  };

  const yTicks = [1500, 1550, 1600, 1650, 1700, 1750, 1800];
  const xTicks = [800, 1000, 1200, 1400, 1600];

  return (
    <section className="signal" ref={sectionRef} aria-label="Specific impulse through the degradation window">
      <div className="signal__sticky">
        <div className="signal__copy">
          <p className="research-index">
            <DecodeText text="THE SIGNAL" />
          </p>
          <h2>
            A warning, then <em>a permanent change.</em>
          </h2>
          <div className="signal__steps" aria-live="polite">
            {STEPS.map((s) => (
              <p key={s.from} className="signal__step" data-active={s === step}>
                <span>{s.h}</span>
                {s.text}
              </p>
            ))}
          </div>
          <p className="signal__readout" aria-hidden="true">
            <span ref={readoutRef}>H {fmt(hour, 0)}</span>
            <span ref={valueRef}>{fmt(ispAt(hour), 2)} s</span>
          </p>
        </div>

        <figure className="signal__figure">
          <figcaption>
            <span>Specific impulse, s</span>
            <span>Hours 800–1,700 · Isp stays locked to 11,040 h</span>
          </figcaption>
          <div className="signal__plot">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="signal__svg"
              role="img"
              aria-label="Specific impulse holds at 1,782 seconds until hour 1,000, decays logarithmically, is flagged at hour 1,497 at 1,514.96 seconds and locks at 1,514.7 seconds at hour 1,500."
              tabIndex={0}
              onKeyDown={onKey}
              onBlur={() => setProbe(null)}
            >
              <defs>
                <clipPath id="signal-clip">
                  <rect ref={clipRef} x="0" y="0" width={reduce ? W : sx(X0)} height={H} />
                </clipPath>
              </defs>
              {yTicks.map((v) => (
                <g key={v}>
                  <line x1={M.l} x2={W - M.r} y1={sy(v)} y2={sy(v)} className="signal__grid" />
                  <text x={M.l - 10} y={sy(v) + 3.5} className="signal__axis" textAnchor="end">
                    {fmt(v, 0)}
                  </text>
                </g>
              ))}
              {xTicks.map((h) => (
                <text key={h} x={sx(h)} y={H - M.b + 20} className="signal__axis" textAnchor="middle">
                  {fmt(h, 0)} h
                </text>
              ))}
              <line x1={M.l} x2={W - M.r} y1={sy(Y0)} y2={sy(Y0)} className="signal__baseline" />

              <path d={paths.line} className="signal__ghost" />
              <g clipPath="url(#signal-clip)">
                <path d={paths.area} className="signal__area" />
                <path d={paths.line} className="signal__line" />
              </g>

              <g className="signal__event" transform={`translate(${sx(1000)} 0)`}>
                <line y1={M.t} y2={H - M.b} />
                <text x={6} y={M.t + 10}>DECAY ONSET</text>
              </g>
              <g className="signal__event is-warn" transform={`translate(${sx(1497)} 0)`}>
                <line y1={M.t} y2={H - M.b} />
              </g>
              <g className="signal__event is-crit" transform={`translate(${sx(1500)} 0)`}>
                <line y1={M.t} y2={H - M.b} />
              </g>
              <rect x={sx(L.x0)} y={sy(1530)} width={sx(L.x1) - sx(L.x0)} height={sy(Y0) - sy(1530)} className="signal__bracket" data-on={loupeOn} />

              <g ref={headRef} className="signal__head" transform={`translate(${sx(reduce ? X1 : X0)} ${sy(ispAt(reduce ? X1 : X0))})`}>
                <circle r={9} className="signal__head-ring" />
                <circle r={4} />
              </g>

              {probe !== null && (
                <g className="signal__probe" transform={`translate(${sx(probe)} 0)`}>
                  <line y1={M.t} y2={H - M.b} />
                  <circle cy={sy(ispAt(probe))} r={4} />
                  <g transform={`translate(${sx(probe) > W - 170 ? -150 : 10} ${Math.max(M.t + 4, sy(ispAt(probe)) - 44)})`}>
                    <rect width={140} height={38} rx={3} />
                    <text x={10} y={17} className="signal__probe-value">
                      {fmt(ispAt(probe), 2)} s
                    </text>
                    <text x={10} y={31} className="signal__probe-label">
                      HOUR {fmt(probe, 0)}
                    </text>
                  </g>
                </g>
              )}
              <rect
                x={M.l}
                y={M.t}
                width={W - M.l - M.r}
                height={H - M.t - M.b}
                fill="transparent"
                onPointerMove={probeFromPointer}
                onPointerLeave={() => setProbe(null)}
              />
            </svg>

            <div className="signal__loupe" data-on={loupeOn} aria-hidden={!loupeOn}>
              <svg viewBox={`0 0 ${L.w} ${L.h}`}>
                {[1514.5, 1515, 1515.5].map((v) => (
                  <g key={v}>
                    <line x1={L.l} x2={L.w - L.r} y1={ly(v)} y2={ly(v)} className="signal__grid" />
                    <text x={L.l - 6} y={ly(v) + 3} className="signal__axis" textAnchor="end">
                      {fmt(v, 1)}
                    </text>
                  </g>
                ))}
                {[1490, 1495, 1500, 1505].map((h) => (
                  <text key={h} x={lx(h)} y={L.h - 8} className="signal__axis" textAnchor="middle">
                    {h}
                  </text>
                ))}
                <path d={paths.loupe} className="signal__line" />
                <g className="signal__event is-warn" transform={`translate(${lx(1497)} 0)`}>
                  <line y1={L.t} y2={L.h - L.b} />
                  <rect x={-4} y={ly(ispAt(1497)) - 4} width={8} height={8} transform={`rotate(45 0 ${ly(ispAt(1497))})`} />
                </g>
                <g className="signal__event is-crit" transform={`translate(${lx(1500)} 0)`}>
                  <line y1={L.t} y2={L.h - L.b} />
                  <rect x={-4} y={ly(1514.7) - 4} width={8} height={8} transform={`rotate(45 0 ${ly(1514.7)})`} />
                </g>
              </svg>
              <div className="signal__loupe-key">
                <span><i className="is-warn" />FLAG 1,497 h · 1,514.96 s</span>
                <span><i className="is-crit" />LOCK 1,500 h · 1,514.70 s</span>
              </div>
            </div>
          </div>

          <details className="signal__table">
            <summary>View data</summary>
            <table>
              <thead>
                <tr>
                  <th scope="col">Hour</th>
                  <th scope="col">Isp (s)</th>
                  <th scope="col">State</th>
                </tr>
              </thead>
              <tbody>
                {TABLE.map((h) => (
                  <tr key={h}>
                    <td>{fmt(h, 0)}</td>
                    <td>{fmt(ispAt(h), 2)}</td>
                    <td>{h >= 1500 ? "Locked" : h >= 1497 ? "Flagged" : h >= 1000 ? "Decaying" : "Nominal"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </figure>
      </div>
    </section>
  );
}
