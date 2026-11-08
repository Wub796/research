"use client";

import { useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { orrery } from "../lib/orrery.generated";
import { DecodeText } from "./fx";

gsap.registerPlugin(ScrollTrigger, useGSAP);

// The five decision points of the ARES-1 transfer, as a horizontal filmstrip.
// Desktop: ScrollTrigger pins the section and scrubs the track sideways in
// lockstep with vertical scroll. Each frame embeds a true-scale J2000 orbital
// vignette showing the exact Sun–Earth–ARES-1–Mars geometry at that hour.
const HOURS = 11040;
const AU_KM = 149.598; // M km per AU
type P = readonly [number, number];

function sampleAt(arr: readonly P[], f: number): P {
  const x = Math.min(Math.max(f, 0), 1) * (arr.length - 1);
  const i = Math.min(Math.floor(x), arr.length - 2);
  const u = x - i;
  return [arr[i][0] + (arr[i + 1][0] - arr[i][0]) * u, arr[i][1] + (arr[i + 1][1] - arr[i][1]) * u] as const;
}

const missionPhases = [
  {
    h: 0,
    hour: "T+0000",
    code: "PHASE 01 / DEPARTURE",
    label: "LAUNCH",
    isp: "1,782.0 s",
    steer: "+0.0° NOMINAL",
    note: "ARES-1 departs Earth escape (C3 = 18.1 km²/s²) with a 243-parameter neural pilot trained against nominal SPT-140 thruster dynamics.",
    crisis: false,
  },
  {
    h: 1000,
    hour: "T+1000",
    code: "PHASE 02 / ONSET",
    label: "THRUSTER DECAY",
    isp: "1,782.0 → 1,752.2 s",
    steer: "+1.4° COMPENSATING",
    note: "Specific impulse begins a logarithmic slide from its 1,782 s nominal plateau as boron nitride discharge channel erosion accelerates.",
    crisis: false,
  },
  {
    h: 1497,
    hour: "T+1497",
    code: "PHASE 03 / DETECTION",
    label: "ANOMALY WINDOW",
    isp: "1,514.96 s",
    steer: "IF SCORE 0.654",
    note: "Collective Isolation Forest (w = 24 h) flags the anomaly signature (F₁ = 0.990) 180 minutes before hardware lock — opening the autonomous reconfiguration window.",
    crisis: true,
  },
  {
    h: 1500,
    hour: "T+1500",
    code: "PHASE 04 / CLAMP",
    label: "FAILURE LOCK",
    isp: "1,514.70 s LOCKED",
    steer: "−15.0% EFFICIENCY",
    note: "Isp clamps permanently at 1,514.7 seconds. The 243-parameter neural pilot begins immediate closed-loop adaptation to preserve orbital energy.",
    crisis: true,
  },
  {
    h: HOURS,
    hour: "T+11040",
    code: "PHASE 05 / CAPTURE",
    label: "MARS ARRIVAL",
    isp: "1,514.70 s",
    steer: "761 KG XE SPENT",
    note: "After 9,540 hours of degraded flight and continuous closed-loop 3D pointing, the autonomous pilot closes Mars intercept (55.8% error reduction vs. open-loop drift).",
    crisis: false,
  },
];

export default function MissionPan() {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const scrubRef = useRef<HTMLElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);
  const [isPan, setIsPan] = useState(false);

  const sc = orrery.sc as readonly P[];
  const earth = orrery.earth as readonly P[];
  const mars = orrery.mars as readonly P[];

  const vignettes = useMemo(() => {
    const S = 58;
    const xy = (p: P) => [p[0] * S, -p[1] * S] as const;
    const toPath = (pts: readonly P[], close = false) =>
      pts.map((p, i) => `${i ? "L" : "M"}${xy(p)[0].toFixed(1)},${xy(p)[1].toFixed(1)}`).join("") + (close ? "Z" : "");

    const earthOrbit = toPath(orrery.earthOrbit as readonly P[], true);
    const marsOrbit = toPath(orrery.marsOrbit as readonly P[], true);
    const fullTransfer = toPath(sc);

    return missionPhases.map((phase) => {
      const f = phase.h / HOURS;
      const endIdx = Math.max(1, Math.round(f * (sc.length - 1)));
      const flownTransfer = toPath(sc.slice(0, endIdx + 1));
      const scPos = sampleAt(sc, f);
      const earthPos = sampleAt(earth, f);
      const marsPos = sampleAt(mars, f);
      const rAu = Math.hypot(scPos[0], scPos[1]);
      const marsDistM = Math.hypot(scPos[0] - marsPos[0], scPos[1] - marsPos[1]) * AU_KM;
      return {
        earthOrbit,
        marsOrbit,
        fullTransfer,
        flownTransfer,
        scXy: xy(scPos),
        earthXy: xy(earthPos),
        marsXy: xy(marsPos),
        rAu: rAu.toFixed(2),
        marsDistM: `${Math.max(0, Math.round(marsDistM))}M KM`,
      };
    });
  }, [sc, earth, mars]);

  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add("(min-width: 769px) and (prefers-reduced-motion: no-preference)", () => {
      const section = sectionRef.current;
      const track = trackRef.current;
      if (!section || !track) return;
      setIsPan(true);
      const frames = Array.from(track.querySelectorAll<HTMLElement>(".mission-pan-frame"));
      const phaseFrames = frames.slice(1);
      const titles = frames.map((f) => f.querySelector<HTMLElement>("h2, h3")).filter(Boolean) as HTMLElement[];
      const skewers = titles.map((el) => gsap.quickTo(el, "skewX", { duration: 0.5, ease: "power3.out" }));
      const distance = () => Math.max(0, track.scrollWidth - window.innerWidth);

      let lastHour = -1;
      const syncRail = () => {
        const x = Number(gsap.getProperty(track, "x")) || 0;
        const centre = -x + window.innerWidth / 2;
        const centres = phaseFrames.map((f) => f.offsetLeft + f.offsetWidth / 2);
        let hour = 0;
        if (centre >= centres[centres.length - 1]) hour = HOURS;
        else if (centre > centres[0]) {
          for (let i = 0; i < centres.length - 1; i++) {
            if (centre <= centres[i + 1]) {
              const u = (centre - centres[i]) / (centres[i + 1] - centres[i]);
              hour = missionPhases[i].h + (missionPhases[i + 1].h - missionPhases[i].h) * u;
              break;
            }
          }
        }
        if (headRef.current) headRef.current.style.transform = `translateX(${((hour / HOURS) * 100).toFixed(3)}%)`;
        const rounded = Math.round(hour);
        if (rounded !== lastHour && readoutRef.current) {
          lastHour = rounded;
          readoutRef.current.textContent = `T+${String(rounded).padStart(5, "0")} H`;
        }
      };

      const tween = gsap.to(track, {
        x: () => -distance(),
        ease: "none",
        onUpdate: syncRail,
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: () => "+=" + distance(),
          pin: true,
          scrub: 1,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            const lean = gsap.utils.clamp(-5, 5, self.getVelocity() / -320);
            skewers.forEach((to) => to(lean));
          },
        },
      });

      if (scrubRef.current) {
        gsap.to(scrubRef.current, {
          scaleX: 1,
          ease: "none",
          scrollTrigger: { trigger: section, start: "top top", end: () => "+=" + distance(), scrub: 1 },
        });
      }

      frames.forEach((frame) => {
        const title = frame.querySelector("h2, h3");
        if (title) {
          gsap.fromTo(
            title,
            { xPercent: 10 },
            { xPercent: -10, ease: "none", scrollTrigger: { trigger: frame, containerAnimation: tween, start: "left right", end: "right left", scrub: true } },
          );
        }
        ScrollTrigger.create({
          trigger: frame,
          containerAnimation: tween,
          start: "left 68%",
          onEnter: () => frame.classList.add("is-in"),
          onLeaveBack: () => frame.classList.remove("is-in"),
        });
      });

      const settle = () => skewers.forEach((to) => to(0));
      ScrollTrigger.addEventListener("scrollEnd", settle);
      syncRail();

      return () => {
        ScrollTrigger.removeEventListener("scrollEnd", settle);
        frames.forEach((f) => f.classList.remove("is-in"));
        setIsPan(false);
      };
    });
    return () => mm.revert();
  }, { scope: sectionRef });

  return (
    <section ref={sectionRef} id="section-filmstrip" className={"mission-pan" + (isPan ? " is-panning" : "")} aria-label="The mission in five phases">
      <div className="mission-pan-track" ref={trackRef}>
        <div className="mission-pan-frame mission-pan-cover">
          <p className="research-index">
            <DecodeText text="03 · PHASE FILMSTRIP / FIVE EPOCHS" />
          </p>
          <h2>Move through the mission.</h2>
          <p className="mission-pan-note">
            The entire 11,040-hour heliocentric transfer laid out as an inspection filmstrip: where the thruster begins to erode, when the Isolation Forest trips, and how the trajectory bends to still reach Mars.
          </p>
        </div>
        {missionPhases.map((phase, idx) => {
          const vig = vignettes[idx];
          return (
            <div className={"mission-pan-frame" + (phase.crisis ? " is-crisis" : "")} key={phase.hour}>
              <div className="mission-pan-top">
                <div className="mission-pan-meta">
                  <p className="mission-pan-code">{phase.code}</p>
                  <p className="mission-pan-hour">
                    <DecodeText text={phase.hour} />
                  </p>
                </div>
                <svg className="mission-pan-vignette" viewBox="-115 -115 230 230" aria-hidden="true">
                  <circle r={104} className="mission-pan-vig__frame" />
                  <line x1={-104} y1={0} x2={104} y2={0} className="mission-pan-vig__axis" />
                  <line x1={0} y1={-104} x2={0} y2={104} className="mission-pan-vig__axis" />
                  <path d={vig.earthOrbit} className="mission-pan-vig__orbit" />
                  <path d={vig.marsOrbit} className="mission-pan-vig__orbit is-mars" />
                  <path d={vig.fullTransfer} className="mission-pan-vig__planned" />
                  <path d={vig.flownTransfer} className="mission-pan-vig__flown" />
                  <line x1={0} y1={0} x2={vig.scXy[0]} y2={vig.scXy[1]} className="mission-pan-vig__rad" />
                  <circle r={3} className="mission-pan-vig__sun" />
                  <circle cx={vig.earthXy[0]} cy={vig.earthXy[1]} r={2.5} className="mission-pan-vig__earth" />
                  <circle cx={vig.marsXy[0]} cy={vig.marsXy[1]} r={2.5} className="mission-pan-vig__mars" />
                  <g transform={`translate(${vig.scXy[0].toFixed(1)} ${vig.scXy[1].toFixed(1)})`}>
                    <rect x={-3.2} y={-3.2} width={6.4} height={6.4} transform="rotate(45)" className="mission-pan-vig__sc" />
                  </g>
                </svg>
              </div>
              <h3>{phase.label}</h3>
              <p className="mission-pan-note">{phase.note}</p>
              <dl className="mission-pan-telemetry">
                <div>
                  <dt>SPECIFIC IMPULSE</dt>
                  <dd>{phase.isp}</dd>
                </div>
                <div>
                  <dt>SOLAR RADIUS</dt>
                  <dd>{vig.rAu} AU</dd>
                </div>
                <div>
                  <dt>MARS RANGE</dt>
                  <dd>{vig.marsDistM}</dd>
                </div>
                <div>
                  <dt>CONTROL STATUS</dt>
                  <dd>{phase.steer}</dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>
      <div className="mission-pan-rail" aria-hidden="true">
        <span className="mission-pan-rail__readout" ref={readoutRef}>
          T+00000 H
        </span>
        <div className="mission-pan-rail__track">
          {missionPhases.map((p) => (
            <i key={p.h} className={p.crisis ? "is-crit" : p.h === 1000 ? "is-warn" : ""} style={{ left: `${(p.h / HOURS) * 100}%` }} />
          ))}
          <div className="mission-pan-rail__head" ref={headRef}>
            <span />
          </div>
        </div>
        <span>11,040 H · TRUE SCALE</span>
      </div>
      <i className="mission-pan-scrub" ref={scrubRef} aria-hidden="true" />
    </section>
  );
}
