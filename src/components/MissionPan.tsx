"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { DecodeText } from "./fx";

gsap.registerPlugin(ScrollTrigger);

// The five decision points of the ARES-1 transfer, as a horizontal filmstrip.
// Desktop: ScrollTrigger pins the section and scrubs the track sideways in
// lockstep with vertical scroll. A true-scale rail underneath shows where the
// frame at centre sits in the 11,040 h mission — four frames crowd the first
// 14%, then the playhead races to arrival, which is the mission's real shape.
// Mobile / reduced-motion: the same frames become a native scroll-snap rail.
const HOURS = 11040;
const missionPhases = [
  { h: 0, hour: "T+0000", label: "LAUNCH", note: "ARES-1 departs with a policy trained only against healthy engines.", crisis: false },
  { h: 1000, hour: "T+1000", label: "THRUSTER DECAY", note: "Specific impulse begins a logarithmic slide from its 1,782 second nominal.", crisis: false },
  { h: 1497, hour: "T+1497", label: "ANOMALY WINDOW", note: "The Isolation Forest flags the first off-nominal burn.", crisis: true },
  { h: 1500, hour: "T+1500", label: "FAILURE LOCK", note: "Isp locks at 1,514.7 seconds. The engine keeps burning, but it burns differently forever.", crisis: true },
  { h: HOURS, hour: "T+11040", label: "MARS ARRIVAL", note: "The controller has to close the transfer on degraded hardware.", crisis: false },
];

export default function MissionPan() {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const scrubRef = useRef<HTMLElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);
  const [isPan, setIsPan] = useState(false);

  useEffect(() => {
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
          // big type leans into the direction of travel, then settles
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

      // inside each frame: the title drifts against the pan (parallax) and
      // the note lands once the frame is well inside the viewport
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
  }, []);

  return (
    <section ref={sectionRef} className={"mission-pan" + (isPan ? " is-panning" : "")} aria-label="The mission in five phases">
      <div className="mission-pan-track" ref={trackRef}>
        <div className="mission-pan-frame mission-pan-cover">
          <h2>Move through the mission.</h2>
          <p className="mission-pan-note">
            The same flight laid out flat: where the engine decays, when the model notices, and what locks in at hour 1,500. Keep scrolling to pan across it.
          </p>
        </div>
        {missionPhases.map((phase) => (
          <div className={"mission-pan-frame" + (phase.crisis ? " is-crisis" : "")} key={phase.hour}>
            <p className="mission-pan-hour">
              <DecodeText text={phase.hour} />
            </p>
            <h3>{phase.label}</h3>
            <p className="mission-pan-note">{phase.note}</p>
          </div>
        ))}
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
