"use client";

import { useEffect, useState } from "react";

export type BootStage = "init" | "script" | "data" | "scene";

/** Each stage is a real milestone in bringing the instrument up; the bar
 *  eases toward the stage's share instead of counting on a timer. */
const STAGES: Record<BootStage, { target: number; label: string }> = {
  init: { target: 38, label: "Loading Cesium engine" },
  script: { target: 66, label: "Fetching ephemerides · flight data" },
  data: { target: 88, label: "Compiling shaders · first light" },
  scene: { target: 100, label: "Instrument ready" },
};

export default function BootScreen({ done, overlay = false, stage = "init" }: { done: boolean; overlay?: boolean; stage?: BootStage }) {
  const [pct, setPct] = useState(0);
  const target = done ? 100 : STAGES[stage].target;

  useEffect(() => {
    const iv = setInterval(() => {
      setPct((p) => {
        const cap = done ? 100 : target - 1.5;
        if (p >= cap) return p;
        return Math.min(cap, p + Math.max(0.35, (cap - p) * 0.14));
      });
    }, 50);
    return () => clearInterval(iv);
  }, [target, done]);

  return (
    <div className={`boot ${overlay ? "boot--overlay " : ""}${done ? "is-done" : ""}`} role="status" aria-label="Loading">
      <p className="boot__word">
        ARES<em>1.</em>
      </p>
      <div className="boot__bar">
        <span style={{ transform: `scaleX(${pct / 100})` }} />
      </div>
      <div className="boot__pct">{String(Math.round(pct)).padStart(3, "0")}</div>
      <div className="boot__line" aria-live="polite">
        {done ? STAGES.scene.label : STAGES[stage].label}
      </div>
    </div>
  );
}
