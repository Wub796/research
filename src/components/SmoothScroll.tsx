"use client";

import { useEffect, type ReactNode } from "react";
import { ReactLenis, useLenis } from "lenis/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/** Drives Lenis from GSAP's ticker so ScrollTrigger scrubs (the mission pan)
 *  and framer's scroll-linked values read the same smoothed position on the
 *  same frame. Lenis previously only mounted with the console, after Cesium
 *  loaded, so the landing scrolled natively while GSAP scrubbed. */
function LenisSync() {
  const lenis = useLenis(ScrollTrigger.update);
  useEffect(() => {
    if (!lenis) return;
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => gsap.ticker.remove(tick);
  }, [lenis]);
  return null;
}

export default function SmoothScroll({ children }: { children: ReactNode }) {
  return (
    <ReactLenis root options={{ autoRaf: false, lerp: 0.1, smoothWheel: true }}>
      <LenisSync />
      {children}
    </ReactLenis>
  );
}
