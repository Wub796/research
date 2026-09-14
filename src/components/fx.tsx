"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { motion, useMotionTemplate, useReducedMotion, useSpring } from "framer-motion";

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/+-·";

/** VCR-style decode: characters resolve left to right out of random glyphs
 *  the first time the label enters the viewport. Seen once per visit, so it
 *  sits in the delight budget; screen readers get the final text only. */
export function DecodeText({ text, active = true, delay = 0 }: { text: string; active?: boolean; delay?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || reduce || !active) return;
    let raf = 0;
    let started = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || started) return;
        started = true;
        io.disconnect();
        const t0 = performance.now() + delay;
        const dur = 90 + text.length * 28;
        let lastSwap = 0;
        const frame = (now: number) => {
          const p = Math.min(1, Math.max(0, (now - t0) / dur));
          // stepped at ~24 fps so the glyphs flicker like a tape counter
          if (now - lastSwap > 42 || p >= 1) {
            lastSwap = now;
            let out = "";
            for (let i = 0; i < text.length; i++) {
              const ch = text[i];
              out += ch === " " || i < Math.floor(p * text.length) ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
            }
            el.textContent = out;
          }
          if (p < 1) raf = requestAnimationFrame(frame);
          else el.textContent = text;
        };
        raf = requestAnimationFrame(frame);
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      el.textContent = text;
    };
  }, [text, reduce, active, delay]);

  return (
    <span className="decode">
      <span className="sr-only">{text}</span>
      <span ref={ref} aria-hidden="true">
        {text}
      </span>
    </span>
  );
}

/** Pulls its child a fraction of the way toward the pointer on a spring.
 *  Decorative only — fine pointers without reduced motion. */
export function Magnetic({ children, strength = 0.24 }: { children: ReactNode; strength?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const x = useSpring(0, { stiffness: 260, damping: 20, mass: 0.5 });
  const y = useSpring(0, { stiffness: 260, damping: 20, mass: 0.5 });
  const transform = useMotionTemplate`translate3d(${x}px, ${y}px, 0)`;

  useEffect(() => {
    const el = ref.current;
    if (!el || reduce) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      x.set((e.clientX - (r.left + r.width / 2)) * strength);
      y.set((e.clientY - (r.top + r.height / 2)) * strength);
    };
    const leave = () => {
      x.set(0);
      y.set(0);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, [reduce, strength, x, y]);

  return (
    <motion.span ref={ref} className="magnetic" style={{ transform }}>
      {children}
    </motion.span>
  );
}
