"use client";

import { useEffect, useState } from "react";

/** Boot sequence — "ARES 1." wordmark, fill bar, VCR percentage counter.
 *  Fixed full-screen by default; fades out when `done` flips. `overlay` marks
 *  the page-level gate, which sits above the landing chrome (progress bar)
 *  instead of just inside the console section. */
export default function BootScreen({ done, overlay = false }: { done: boolean; overlay?: boolean }) {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    if (done) {
      setPct(100);
      return;
    }
    const iv = setInterval(() => {
      setPct((p) => Math.min(96, p + Math.max(1, Math.round((96 - p) * 0.16))));
    }, 70);
    return () => clearInterval(iv);
  }, [done]);

  return (
    <div className={`boot ${overlay ? "boot--overlay " : ""}${done ? "is-done" : ""}`} role="status" aria-label="Loading">
      <p className="boot__word">
        ARES<em>1.</em>
      </p>
      <div className="boot__bar">
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="boot__pct">{String(Math.round(pct)).padStart(3, "0")}</div>
      <div className="boot__line">PPO guidance · trajectory scheduler</div>
    </div>
  );
}