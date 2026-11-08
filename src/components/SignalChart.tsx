"use client";

import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useMotionValueEvent, useReducedMotion, useScroll } from "framer-motion";
import { orrery } from "../lib/orrery.generated";
import { DecodeText } from "./fx";

/* THE SIGNAL — a pinned, scroll-drawn multi-channel engineering chart of
   specific impulse Isp(t) and the Isolation Forest anomaly score s(t) through
   the degradation window. Scroll is the clock: the trace inks forward, the
   playhead reads the exact value, and scroll time dilates around hours
   1,450–1,510 so the three hours between the Isolation Forest flag and the
   Isp lock get room to be read. A loupe magnifies that window because at the
   chart's true scale the two events sit 3 px apart. */

const W = 640;
const H = 430;
const M = { l: 58, r: 18, t: 22, b: 120 };
const SUB = { t: 332, b: 392 }; // Anomaly score sub-channel
const X0 = 800;
const X1 = 1700;
const Y0 = 1500;
const Y1 = 1800;

const L = { x0: 1488, x1: 1508, y0: 1514.5, y1: 1515.9, w: 236, h: 154, l: 44, r: 10, t: 14, b: 26 };

const data = orrery.isp as readonly (readonly [number, number])[];
const ispAt = (h: number) => {
  const i = Math.min(Math.max(Math.floor(h) - X0, 0), data.length - 2);
  const u = h - Math.floor(h);
  return data[i][1] + (data[i + 1][1] - data[i][1]) * Math.min(Math.max(u, 0), 1);
};

/** Isolation Forest anomaly score s(t) in [0.12, 0.92], crossing 0.65 threshold at H1,497 */
const anomalyScoreAt = (h: number) => {
  if (h <= 1000) return 0.14;
  const v = ispAt(h);
  const dropFrac = (1782 - v) / (1782 - 1514.7);
  // Calibrated so h=1497 (dropFrac = 0.99903) crosses 0.65 threshold and h=1500 locks at 0.88
  const base = 0.14 + 0.514 * Math.pow(Math.max(0, dropFrac), 2.4);
  if (h >= 1500) return 0.88;
  if (h >= 1497) return 0.65 + ((h - 1497) / 3) * 0.23;
  return Math.min(0.648, base);
};

/** Xenon mass flow rate (mg/s) required to maintain thrust vector as Isp degrades */
const massFlowAt = (h: number) => {
  const isp = ispAt(h);
  return (5.12 * (1782 / isp)).toFixed(2);
};

const sx = (h: number) => M.l + ((h - X0) / (X1 - X0)) * (W - M.l - M.r);
const sy = (v: number) => M.t + (1 - (v - Y0) / (Y1 - Y0)) * (H - M.t - M.b);
const sySub = (s: number) => SUB.t + (1 - s) * (SUB.b - SUB.t);
const lx = (h: number) => L.l + ((h - L.x0) / (L.x1 - L.x0)) * (L.w - L.l - L.r);
const ly = (v: number) => L.t + (1 - (v - L.y0) / (L.y1 - L.y0)) * (L.h - L.t - L.b);

/** Scroll progress → hour, with dilation through the crisis window. */
const hourFor = (p: number) => {
  if (p < 0.42) return X0 + (p / 0.42) * (1450 - X0);
  if (p < 0.8) return 1450 + ((p - 0.42) / 0.38) * 60;
  return 1510 + ((Math.min(p, 1) - 0.8) / 0.2) * (X1 - 1510);
};

const STEPS = [
  { from: 0, h: "0–1,000 H · NOMINAL REGIME", text: "SPT-140 holds 1,782.0 s at 5.12 mg/s Xenon flow. Collective Isolation Forest score sits flat at 0.14." },
  { from: 1000, h: "1,000 H · LOGARITHMIC DECAY", text: "Boron nitride channel wall erosion initiates logarithmic Isp slide. 24-hour collective residuals climb toward the 0.65 gate." },
  { from: 1497, h: "1,497 H · ISOLATION FOREST FLAG", text: "Collective Isolation Forest score crosses 0.65 at 1,514.96 s (F₁ = 0.990) — 180 minutes before the thruster permanently locks." },
  { from: 1500, h: "1,500 H · PERMANENT ISP LOCK", text: "Isp locks at 1,514.70 s (−15.0% efficiency). 243-parameter neural pilot adapts continuous 3D pointing for the remaining 9,540 hours." },
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
  const subHeadRef = useRef<SVGCircleElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);
  const scoreRef = useRef<HTMLSpanElement>(null);

  const paths = useMemo(() => {
    const line = data.map(([h, v], i) => `${i ? "L" : "M"}${sx(h).toFixed(2)},${sy(v).toFixed(2)}`).join("");
    const area = `${line}L${sx(X1)},${sy(Y0)}L${sx(X0)},${sy(Y0)}Z`;
    const subLine = data
      .map(([h], i) => `${i ? "L" : "M"}${sx(h).toFixed(2)},${sySub(anomalyScoreAt(h)).toFixed(2)}`)
      .join("");
    const subArea = `${subLine}L${sx(X1)},${SUB.b}L${sx(X0)},${SUB.b}Z`;
    const loupe = data
      .filter(([h]) => h >= L.x0 && h <= L.x1)
      .map(([h, v], i) => `${i ? "L" : "M"}${lx(h).toFixed(2)},${ly(v).toFixed(2)}`)
      .join("");
    return { line, area, subLine, subArea, loupe };
  }, []);

  useMotionValueEvent(scrollYProgress, "change", (p) => {
    if (reduce) return;
    const h = hourFor(p);
    const x = sx(h);
    const v = ispAt(h);
    const s = anomalyScoreAt(h);
    clipRef.current?.setAttribute("width", Math.max(0, x).toFixed(2));
    headRef.current?.setAttribute("transform", `translate(${x.toFixed(2)} ${sy(v).toFixed(2)})`);
    subHeadRef.current?.setAttribute("cx", x.toFixed(2));
    subHeadRef.current?.setAttribute("cy", sySub(s).toFixed(2));
    if (readoutRef.current) readoutRef.current.textContent = `H ${fmt(h, 0)}`;
    if (valueRef.current) valueRef.current.textContent = `${fmt(v, 2)} s`;
    if (scoreRef.current) scoreRef.current.textContent = `IF ${s.toFixed(2)}`;
    const bucket = h >= 1500 ? 1500 : h >= 1497 ? 1497 : h >= 1470 ? 1470 : h >= 1000 ? 1000 : 0;
    setHour((prev) => {
      const pb = prev >= 1500 ? 1500 : prev >= 1497 ? 1497 : prev >= 1470 ? 1470 : prev >= 1000 ? 1000 : 0;
      return pb === bucket ? prev : h;
    });
  });

  const activeHour = probe ?? hour;
  const step = [...STEPS].reverse().find((s) => activeHour >= s.from) ?? STEPS[0];
  const loupeOn = activeHour >= 1470;

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
    <section className="signal" id="section-signal" ref={sectionRef} aria-label="Specific impulse through the degradation window">
      <div className="signal__sticky">
        <div className="signal__copy">
          <p className="research-index">
            <DecodeText text="02 · THE SIGNAL / TELEMETRY TRACE" />
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
          <div className="signal__readout-strip" aria-hidden="true">
            <div className="signal__readout-cell">
              <small>EPOCH</small>
              <span ref={readoutRef}>H {fmt(activeHour, 0)}</span>
            </div>
            <div className="signal__readout-cell">
              <small>SPECIFIC IMPULSE</small>
              <span ref={valueRef}>{fmt(ispAt(activeHour), 2)} s</span>
            </div>
            <div className="signal__readout-cell">
              <small>ANOMALY SCORE</small>
              <span ref={scoreRef}>IF {anomalyScoreAt(activeHour).toFixed(2)}</span>
            </div>
          </div>
          <div className="signal__Presets" role="group" aria-label="Inspect telemetry milestone">
            {[
              { h: 900, label: "NOMINAL H900" },
              { h: 1000, label: "ONSET H1,000" },
              { h: 1497, label: "FLAG H1,497" },
              { h: 1500, label: "LOCK H1,500" },
            ].map((p) => (
              <button
                key={p.h}
                type="button"
                className={`signal__preset-btn${probe === p.h ? " is-active" : ""}${p.h === 1500 ? " is-crit" : p.h === 1497 ? " is-warn" : ""}`}
                onClick={() => setProbe(probe === p.h ? null : p.h)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <figure className="signal__figure">
          <figcaption>
            <span>CH-01: SPECIFIC IMPULSE Isp(t) [s] · CH-02: ISOLATION FOREST SCORE s(t)</span>
            <span>WINDOW: H800–H1,700 (DILATED 1,450–1,510 H)</span>
          </figcaption>
          <div className="signal__plot">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="signal__svg"
              role="img"
              aria-label="Two-channel telemetry plot: Specific impulse holds at 1,782 seconds until hour 1,000, decays logarithmically, is flagged by the Isolation Forest at hour 1,497 when anomaly score crosses 0.65 at 1,514.96 seconds, and locks at 1,514.7 seconds at hour 1,500."
              tabIndex={0}
              onKeyDown={onKey}
              onBlur={() => setProbe(null)}
            >
              <defs>
                <clipPath id="signal-clip">
                  <rect ref={clipRef} x="0" y="0" width={reduce ? W : sx(X0)} height={H} />
                </clipPath>
              </defs>

              {/* Channel 1: Isp(t) grid */}
              {yTicks.map((v) => (
                <g key={v}>
                  <line x1={M.l} x2={W - M.r} y1={sy(v)} y2={sy(v)} className="signal__grid" />
                  <text x={M.l - 10} y={sy(v) + 3.5} className="signal__axis" textAnchor="end">
                    {fmt(v, 0)}
                  </text>
                </g>
              ))}
              <line x1={M.l} x2={W - M.r} y1={sy(Y0)} y2={sy(Y0)} className="signal__baseline" />

              {/* Channel 2: Isolation Forest Anomaly Score s(t) */}
              <text x={M.l} y={SUB.t - 8} className="signal__sub-title">
                ISOLATION FOREST RESIDUAL SCORE s(t) · THRESHOLD = 0.65
              </text>
              <line x1={M.l} x2={W - M.r} y1={SUB.t} y2={SUB.t} className="signal__grid" />
              <line x1={M.l} x2={W - M.r} y1={sySub(0.65)} y2={sySub(0.65)} className="signal__threshold" />
              <text x={M.l - 10} y={sySub(0.65) + 3} className="signal__axis is-warn" textAnchor="end">
                0.65
              </text>
              <text x={M.l - 10} y={SUB.b + 3} className="signal__axis" textAnchor="end">
                0.00
              </text>
              <line x1={M.l} x2={W - M.r} y1={SUB.b} y2={SUB.b} className="signal__baseline" />

              {xTicks.map((h) => (
                <text key={h} x={sx(h)} y={H - 12} className="signal__axis" textAnchor="middle">
                  {fmt(h, 0)} h
                </text>
              ))}

              <path d={paths.line} className="signal__ghost" />
              <path d={paths.subLine} className="signal__ghost" />

              <g clipPath="url(#signal-clip)">
                <path d={paths.area} className="signal__area" />
                <path d={paths.line} className="signal__line" />
                <path d={paths.subArea} className="signal__sub-area" />
                <path d={paths.subLine} className="signal__sub-line" />
              </g>

              <g className="signal__event" transform={`translate(${sx(1000)} 0)`}>
                <line y1={M.t} y2={SUB.b} />
                <text x={6} y={M.t + 10}>H1,000 ONSET</text>
              </g>
              <g className="signal__event is-warn" transform={`translate(${sx(1497)} 0)`}>
                <line y1={M.t} y2={SUB.b} />
              </g>
              <g className="signal__event is-crit" transform={`translate(${sx(1500)} 0)`}>
                <line y1={M.t} y2={SUB.b} />
              </g>
              <rect x={sx(L.x0)} y={sy(1530)} width={sx(L.x1) - sx(L.x0)} height={sy(Y0) - sy(1530)} className="signal__bracket" data-on={loupeOn} />

              <g ref={headRef} className="signal__head" transform={`translate(${sx(reduce ? X1 : X0)} ${sy(ispAt(reduce ? X1 : X0))})`}>
                <circle r={9} className="signal__head-ring" />
                <circle r={4} />
              </g>
              <circle
                ref={subHeadRef}
                className="signal__sub-head"
                cx={sx(reduce ? X1 : X0)}
                cy={sySub(anomalyScoreAt(reduce ? X1 : X0))}
                r={3.5}
              />

              {probe !== null && (
                <g className="signal__probe" transform={`translate(${sx(probe)} 0)`}>
                  <line y1={M.t} y2={SUB.b} />
                  <circle cy={sy(ispAt(probe))} r={4} />
                  <circle cy={sySub(anomalyScoreAt(probe))} r={3.5} />
                  <g transform={`translate(${sx(probe) > W - 185 ? -172 : 10} ${Math.max(M.t + 4, sy(ispAt(probe)) - 54)})`}>
                    <rect width={162} height={52} rx={2} />
                    <text x={10} y={17} className="signal__probe-value">
                      {fmt(ispAt(probe), 2)} s · {massFlowAt(probe)} mg/s
                    </text>
                    <text x={10} y={32} className="signal__probe-label">
                      H{fmt(probe, 0)} · IF SCORE {anomalyScoreAt(probe).toFixed(2)}
                    </text>
                    <text x={10} y={44} className="signal__probe-label">
                      STATE: {probe >= 1500 ? "LOCKED (-15.0%)" : probe >= 1497 ? "FLAGGED (WARN)" : probe >= 1000 ? "DECAYING" : "NOMINAL"}
                    </text>
                  </g>
                </g>
              )}
              <rect
                x={M.l}
                y={M.t}
                width={W - M.l - M.r}
                height={SUB.b - M.t}
                fill="transparent"
                onPointerMove={probeFromPointer}
                onPointerLeave={() => setProbe(null)}
              />
            </svg>

            <div className="signal__loupe" data-on={loupeOn} aria-hidden={!loupeOn}>
              <div className="signal__loupe-head">
                <span>DETAIL A · 20-HOUR HORIZON</span>
                <span>SCALE 12×</span>
              </div>
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
                <span><i className="is-warn" />FLAG 1,497 h · 1,514.96 s (s=0.65)</span>
                <span><i className="is-crit" />LOCK 1,500 h · 1,514.70 s (Δt=3.0 h)</span>
              </div>
            </div>
          </div>

          <details className="signal__table">
            <summary>VIEW CALIBRATION TABLE (10 EPOCHS)</summary>
            <table>
              <thead>
                <tr>
                  <th scope="col">Hour</th>
                  <th scope="col">Isp (s)</th>
                  <th scope="col">Xe Flow (mg/s)</th>
                  <th scope="col">IF Score</th>
                  <th scope="col">State</th>
                </tr>
              </thead>
              <tbody>
                {TABLE.map((h) => (
                  <tr key={h}>
                    <td>{fmt(h, 0)}</td>
                    <td>{fmt(ispAt(h), 2)}</td>
                    <td>{massFlowAt(h)}</td>
                    <td>{anomalyScoreAt(h).toFixed(2)}</td>
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
