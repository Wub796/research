"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

// The five decision points of the ARES-1 transfer, as a horizontal filmstrip.
// Desktop: ScrollTrigger pins the section and scrubs the track sideways in
// lockstep with vertical scroll (start: "top top", end: +=track travel).
// Mobile / reduced-motion: the same frames become a native scroll-snap rail,
// user-driven, no pinning, no JS.
const missionPhases = [
  { hour: "T+0000", label: "LAUNCH", note: "ARES-1 departs with a policy trained only against healthy engines.", crisis: false },
  { hour: "T+1000", label: "THRUSTER DECAY", note: "Specific impulse begins a logarithmic slide from its 1,782 second nominal.", crisis: false },
  { hour: "T+1497", label: "ANOMALY WINDOW", note: "The Isolation Forest flags the first off-nominal burn.", crisis: true },
  { hour: "T+1500", label: "FAILURE LOCK", note: "Isp locks at 1,514.7 seconds. The engine keeps burning, but it burns differently forever.", crisis: true },
  { hour: "T+11040", label: "MARS ARRIVAL", note: "The controller has to close the transfer on degraded hardware.", crisis: false },
];

export default function MissionPan() {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const scrubRef = useRef<HTMLElement>(null);
  const [isPan, setIsPan] = useState(false);

  useEffect(() => {
    const mm = gsap.matchMedia();
    mm.add("(min-width: 769px) and (prefers-reduced-motion: no-preference)", () => {
      const section = sectionRef.current;
      const track = trackRef.current;
      if (!section || !track) return;
      setIsPan(true);
      const distance = () => Math.max(0, track.scrollWidth - window.innerWidth);
      const tween = gsap.to(track, {
        x: () => -distance(),
        ease: "none",
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: () => "+=" + distance(),
          pin: true,
          scrub: 1,
          anticipatePin: 1,
          invalidateOnRefresh: true,
        },
      });
      if (scrubRef.current) {
        gsap.to(scrubRef.current, {
          scaleX: 1,
          ease: "none",
          scrollTrigger: {
            trigger: section,
            start: "top top",
            end: () => "+=" + distance(),
            scrub: 1,
          },
        });
      }
      return () => {
        setIsPan(false);
        tween.scrollTrigger?.kill();
        tween.kill();
      };
    });
    return () => mm.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      className={"mission-pan" + (isPan ? " is-panning" : "")}
      aria-label="The mission in five phases"
    >
      <div className="mission-pan-track" ref={trackRef}>
        <div className="mission-pan-frame mission-pan-cover">
          <h2>Move through the mission.</h2>
          <p className="mission-pan-note">
            The same flight laid out flat: where the engine decays, when the
            model notices, and what locks in at hour 1,500. Keep scrolling to
            pan across it.
          </p>
        </div>
        {missionPhases.map((phase) => (
          <div className={"mission-pan-frame" + (phase.crisis ? " is-crisis" : "")} key={phase.hour}>
            <p className="mission-pan-hour">{phase.hour}</p>
            <h3>{phase.label}</h3>
            <p className="mission-pan-note">{phase.note}</p>
          </div>
        ))}
      </div>
      <i className="mission-pan-scrub" ref={scrubRef} aria-hidden="true" />
    </section>
  );
}
