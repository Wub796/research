"use client";

import { useMemo } from "react";
import { motion, useInView, type Transition, type BezierDefinition } from "framer-motion";
import { useRef } from "react";

interface BlurTextProps {
  text: string;
  delay?: number;
  className?: string;
  animateBy?: "words" | "letters";
  direction?: "top" | "bottom" | "left" | "right";
  onAnimationComplete?: () => void;
  stepDuration?: number;
  easing?: BezierDefinition;
  threshold?: number;
  animationFrom?: Record<string, string | number>;
  animationTo?: Record<string, string | number>[];
}

function buildKeyframes(
  from: Record<string, string | number>,
  steps: Record<string, string | number>[]
) {
  const keys = new Set([...Object.keys(from), ...steps.flatMap(Object.keys)]);
  const keyframes: Record<string, (string | number)[]> = {};
  keys.forEach((k) => {
    keyframes[k] = [from[k] ?? 0, ...steps.map((s) => s[k] ?? 0)];
  });
  return keyframes;
}

export default function BlurText({
  text,
  delay = 60,
  className = "",
  animateBy = "words",
  direction = "top",
  onAnimationComplete,
  stepDuration = 0.35,
  easing = [0.25, 0.4, 0.25, 1],
  threshold = 0.1,
  animationFrom,
  animationTo,
}: BlurTextProps) {
  const ref = useRef<HTMLParagraphElement>(null);
  const inView = useInView(ref, { once: true, amount: threshold });

  const elements = useMemo(
    () => (animateBy === "words" ? text.split(" ") : text.split("")),
    [text, animateBy]
  );

  const defaultFrom = useMemo(() => {
    const y = direction === "top" ? -20 : direction === "bottom" ? 20 : 0;
    const x = direction === "left" ? -20 : direction === "right" ? 20 : 0;
    return { filter: "blur(12px)", opacity: 0, y, x };
  }, [direction]);

  const defaultTo = useMemo(
    () => [{ filter: "blur(0px)", opacity: 1, y: 0, x: 0 }],
    []
  );

  const fromSnapshot = animationFrom ?? defaultFrom;
  const toSnapshots = animationTo ?? defaultTo;
  const stepCount = toSnapshots.length + 1;
  const totalDuration = stepDuration * (stepCount - 1);
  const times = Array.from(
    { length: stepCount },
    (_, i) => (stepCount === 1 ? 0 : i / (stepCount - 1))
  );

  return (
    <p ref={ref} className={`blur-text ${className} flex flex-wrap`}>
      {elements.map((segment, index) => {
        const animateKeyframes = buildKeyframes(fromSnapshot, toSnapshots);
        const spanTransition: Transition = {
          duration: totalDuration,
          times,
          delay: (index * delay) / 1000,
          ease: easing,
        };
        return (
          <motion.span
            key={index}
            initial={fromSnapshot}
            animate={inView ? animateKeyframes : fromSnapshot}
            transition={spanTransition}
            onAnimationComplete={
              index === elements.length - 1 ? onAnimationComplete : undefined
            }
            style={{
              display: "inline-block",
              willChange: "transform, filter, opacity",
            }}
          >
            {segment === " " ? "\u00A0" : segment}
            {animateBy === "words" && index < elements.length - 1 && "\u00A0"}
          </motion.span>
        );
      })}
    </p>
  );
}
