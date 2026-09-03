"use client";

import { useEffect, useRef } from "react";

/** Mission-control reticle cursor — a hollow-axis crosshair (open center, no
 *  dot, no ring). It trails the pointer on a spring, stretches along its
 *  direction of travel like a comet, tightens on interactive targets and
 *  squashes on press. Over the dark console it flips to paper so it never
 *  vanishes. Skipped on touch and under prefers-reduced-motion, where the
 *  native cursor stays put. */
export default function CursorReticle() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = ref.current;
    if (!el) return;

    document.documentElement.classList.add("has-reticle");

    // Pointer position (target) vs. drawn position (spring-lagged).
    let tx = window.innerWidth / 2;
    let ty = window.innerHeight / 2;
    let x = tx;
    let y = ty;
    // Velocity-derived stretch: drawn along the travel angle, easing back to 1.
    let scale = 1;
    let scaleT = 1;
    let angle = 0;
    let angleT = 0;
    let hovering = false;
    let overConsole = false;
    let pressed = false;
    let raf = 0;
    let guard = 0;

    const setState = () => {
      el.classList.toggle("is-hover", hovering && !pressed);
      el.classList.toggle("is-dark", overConsole);
      el.classList.toggle("is-press", pressed);
    };

    const onMove = (e: PointerEvent) => {
      tx = e.clientX;
      ty = e.clientY;
      const target = e.target as Element | null;
      hovering = !!target?.closest?.("a, button, [data-cur]");
      overConsole = !!target?.closest?.(".research-console-entry");
      setState();
    };

    const onDown = () => {
      pressed = true;
      setState();
    };
    const onUp = () => {
      pressed = false;
      setState();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });

    let lastX = tx;
    let lastY = ty;

    let last = performance.now();
    const tick = () => {
      last = performance.now();
      // Spring toward the pointer; measure the raw pointer velocity for stretch.
      x += (tx - x) * 0.2;
      y += (ty - y) * 0.2;
      const dx = tx - lastX;
      const dy = ty - lastY;
      const speed = Math.hypot(dx, dy);
      lastX = tx;
      lastY = ty;

      const base = pressed ? 0.8 : hovering ? 1.45 : 1;
      // Stretch grows with speed but only while actually moving; when idle the
      // reticle unwinds back to upright so it never sits cocked on a target.
      scaleT = speed > 0.6 ? Math.min(1 + speed * 0.0016, 1.7) : 1;
      if (speed > 2.5) angleT = (Math.atan2(dy, dx) * 180) / Math.PI;
      else angleT = angle > 180 ? 360 : 0;
      scale += (base * scaleT - scale) * 0.14;
      angle += (angleT - angle) * 0.12;

      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      const inner = el.firstElementChild as HTMLElement | null;
      if (inner) inner.style.transform = `rotate(${angle}deg) scale(${scale}, ${1 / Math.sqrt(scale)})`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // Safety net: if rAF stalls (occluded tab / throttled webview), keep the
    // reticle alive on a slow timer instead of freezing wherever it was.
    guard = window.setInterval(() => {
      if (performance.now() - last > 250) tick();
    }, 120);

    return () => {
      document.documentElement.classList.remove("has-reticle");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      cancelAnimationFrame(raf);
      window.clearInterval(guard);
    };
  }, []);

  return (
    <div ref={ref} className="reticle" aria-hidden="true">
      <svg viewBox="0 0 28 28" width="30" height="30">
        {/* four hairlines converge on an OPEN center — no dot, no ring */}
        <path d="M14 3.2V10 M14 18V24.8 M3.2 14H10 M18 14H24.8" />
        {/* measurement ticks — ruler marks on the outer arms */}
        <path d="M14 3.2v2.2 M14 22.6v2.2 M3.2 14h2.2 M22.6 14h2.2" />
      </svg>
    </div>
  );
}
