"use client";

import "../lib/cesiumInit";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { formatDuration, formatMet, formatUtc, loadMission, nf, type Mission, type MissionEvent } from "../lib/mission";
import { pub } from "../lib/paths";
import { createScene, type FocusKey, type SceneController } from "./console/scene";
import { RATES, SimClock } from "./console/simClock";

/* ------------------------------------------------------------------------
   ARES-1 live instrument
   The Cesium scene (console/scene.ts) owns the render loop and advances the
   mission clock every frame; React re-renders the chrome at ~15 fps from the
   same clock, so panels stay readable without fighting the 60 fps scene.
   ------------------------------------------------------------------------ */

type Stage = "data" | "scene";

const FOCI: { key: FocusKey; label: string }[] = [
  { key: "sun", label: "SUN" },
  { key: "earth", label: "EARTH" },
  { key: "mars", label: "MARS" },
  { key: "sc", label: "ARES-1" },
];

const FIGURES = [
  {
    src: "/figures/3d_heliocentric_trajectory.png",
    title: "Heliocentric transfer",
    caption: "Earth (a = 1.00 AU) and Mars (a = 1.52 AU) reference orbits with the ARES-1 transfer path. Top view; body sizes exaggerated.",
  },
  {
    src: "/figures/isp_degradation_anomaly_detection.png",
    title: "Isp decay & anomaly flag",
    caption: "Specific impulse holds 1,782 s until hour 1,000, then decays logarithmically. The Isolation Forest flags at hour 1,497 (Isp ≈ 1,514.96 s), three hours before the 1,514.7 s lock.",
  },
  {
    src: "/figures/thrust_magnitude_propellant.png",
    title: "Thrust & propellant",
    caption: "Commanded thrust (≤ 0.289 N) against propellant mass. 509 kg of the 1,099 kg load is spent over the 11,040 h transfer.",
  },
];

/** Re-render the chrome from the clock, capped at `fps`; play/pause flips render immediately. */
function useClockFrame(clock: SimClock | null, fps = 15) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!clock) return;
    let last = 0;
    let timer: number | null = null;
    let lastPlaying = clock.playing;
    const run = () => {
      timer = null;
      last = performance.now();
      force((v) => v + 1);
    };
    const unsubscribe = clock.subscribe(() => {
      if (clock.playing !== lastPlaying) {
        lastPlaying = clock.playing;
        if (timer !== null) window.clearTimeout(timer);
        run();
        return;
      }
      const wait = 1000 / fps - (performance.now() - last);
      if (wait <= 0) {
        if (timer !== null) window.clearTimeout(timer);
        run();
      } else if (timer === null) {
        timer = window.setTimeout(run, wait);
      }
    });
    return () => {
      unsubscribe();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [clock, fps]);
}

/** Segmented control. The active styling lives on a duplicate layer clipped to
 *  the selected option, so text and fill change colour in one motion. */
function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  size = "md",
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  size?: "sm" | "md";
}) {
  const baseRef = useRef<HTMLDivElement>(null);
  const [clip, setClip] = useState<string>("inset(0 100% 0 0 round 999px)");
  const index = Math.max(0, options.findIndex((o) => o.value === value));

  useLayoutEffect(() => {
    const base = baseRef.current;
    if (!base) return;
    const measure = () => {
      const btn = base.children[index] as HTMLElement | undefined;
      if (!btn) return;
      const w = base.clientWidth || 1;
      const left = (btn.offsetLeft / w) * 100;
      const right = 100 - ((btn.offsetLeft + btn.offsetWidth) / w) * 100;
      setClip(`inset(0 ${right.toFixed(3)}% 0 ${left.toFixed(3)}% round 999px)`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(base);
    return () => ro.disconnect();
  }, [index, options.length]);

  return (
    <div className={`ac-seg ac-seg--${size}`} role="radiogroup" aria-label={label}>
      <div className="ac-seg__base" ref={baseRef}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            className="ac-seg__opt"
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="ac-seg__active" aria-hidden="true" style={{ clipPath: clip }}>
        {options.map((o) => (
          <span key={String(o.value)} className="ac-seg__opt">
            {o.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Whole-mission sparkline: faint full curve, the flown part in ink, and a
 *  marker at the current hour. */
function Spark({ values, hours, hour, lo, hi }: { values: number[]; hours: number; hour: number; lo?: number; hi?: number }) {
  const W = 132;
  const H = 26;
  const min = lo ?? Math.min(...values);
  const max = hi ?? Math.max(...values);
  const span = max - min || 1;
  const d = useMemo(
    () => values.map((v, i) => `${i ? "L" : "M"}${((i / (values.length - 1)) * W).toFixed(1)},${(H - 3 - ((v - min) / span) * (H - 6)).toFixed(1)}`).join(""),
    [values, min, span],
  );
  const f = Math.min(1, Math.max(0, hour / hours));
  const idx = f * (values.length - 1);
  const i0 = Math.floor(idx);
  const i1 = Math.min(values.length - 1, i0 + 1);
  const v = values[i0] + (values[i1] - values[i0]) * (idx - i0);
  const x = f * W;
  const y = H - 3 - ((v - min) / span) * (H - 6);
  const id = useRef(`spark-${Math.random().toString(36).slice(2, 8)}`).current;
  return (
    <svg className="ac-spark" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
      <defs>
        <clipPath id={id}>
          <rect x="0" y="0" width={x} height={H} />
        </clipPath>
      </defs>
      <path d={d} className="ac-spark__all" />
      <path d={d} className="ac-spark__flown" clipPath={`url(#${id})`} />
      <circle cx={x} cy={y} r="2.6" className="ac-spark__dot" />
    </svg>
  );
}

function Stat({ label, value, unit, sub, tag, children }: { label: string; value: string; unit?: string; sub?: ReactNode; tag?: ReactNode; children?: ReactNode }) {
  return (
    <div className="ac-stat">
      <div className="ac-stat__head">
        <span className="ac-stat__label">{label}</span>
        {tag}
      </div>
      <div className="ac-stat__row">
        <span className="ac-stat__value">
          {value}
          {unit && <i>{unit}</i>}
        </span>
        {children}
      </div>
      {sub && <div className="ac-stat__sub">{sub}</div>}
    </div>
  );
}

interface LogEntry {
  h: number;
  kind: MissionEvent["key"] | "nav" | "conj";
  title: string;
  body: string;
}

function buildLog(m: Mission): LogEntry[] {
  const entries: LogEntry[] = m.events.map((e) => ({ h: e.h, kind: e.key, title: e.label.toUpperCase(), body: e.detail }));
  for (let h = 500; h < m.hours; h += 500) {
    const t = m.telemetry(h);
    entries.push({
      h,
      kind: "nav",
      title: "NAV FIX",
      body: `r ${t.sunDistAu.toFixed(3)} AU · v ${t.speedKms.toFixed(2)} km/s · Earth ${(t.earthRangeKm / 1e6).toFixed(1)}M km · light time ${formatDuration(t.lightTimeS)}`,
    });
  }
  // Solar conjunction: the Sun within 5° of the Earth→spacecraft line.
  let inConj = false;
  for (let h = 24; h <= m.hours; h += 6) {
    const sep = m.telemetry(h).sepAngleDeg;
    if (!inConj && sep < 5) {
      inConj = true;
      entries.push({ h, kind: "conj", title: "SOLAR CONJUNCTION", body: `Sun–Earth–probe angle below 5° (${sep.toFixed(1)}°): downlink degraded` });
    } else if (inConj && sep >= 5) {
      inConj = false;
      entries.push({ h, kind: "conj", title: "CONJUNCTION EXIT", body: `Sun–Earth–probe angle back above 5°` });
    }
  }
  return entries.sort((a, b) => a.h - b.h);
}

function sparkSeries(m: Mission) {
  const N = 220;
  const out = { isp: [] as number[], thrust: [] as number[], prop: [] as number[], dv: [] as number[], speed: [] as number[], earth: [] as number[], mars: [] as number[] };
  for (let i = 0; i < N; i++) {
    const t = m.telemetry((i / (N - 1)) * m.hours);
    out.isp.push(t.ispS);
    out.thrust.push(t.thrustN);
    out.prop.push(t.propellantKg);
    out.dv.push(t.dvKms);
    out.speed.push(t.speedKms);
    out.earth.push(t.earthRangeKm);
    out.mars.push(t.marsRangeKm);
  }
  return out;
}

const ISP_TAG: Record<string, { label: string; tone: string }> = {
  nominal: { label: "NOMINAL", tone: "ok" },
  decay: { label: "DECAY", tone: "warn" },
  flagged: { label: "FLAGGED", tone: "warn" },
  locked: { label: "LOCKED", tone: "crit" },
};

function Tag({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span className={`ac-tag ac-tag--${tone}`}>
      <span className="ac-tag__glyph" aria-hidden="true" />
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------------ */

function Scrubber({ mission, clock }: { mission: Mission; clock: SimClock }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const dragging = useRef(false);
  const hours = mission.hours;
  const f = clock.hour / hours;

  const hourAt = (clientX: number) => {
    const r = trackRef.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * hours;
  };
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragging.current) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    clock.pause();
    clock.seek(hourAt(e.clientX));
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const h = hourAt(e.clientX);
    setHover(h);
    if (dragging.current) clock.seek(h);
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const big = e.shiftKey ? 24 : 1;
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") next = clock.hour + big;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = clock.hour - big;
    if (e.key === "PageUp") next = clock.hour + 240;
    if (e.key === "PageDown") next = clock.hour - 240;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = hours;
    if (next !== null) {
      e.preventDefault();
      e.stopPropagation();
      clock.pause();
      clock.seek(Math.round(Math.min(hours, Math.max(0, next))));
    }
  };

  const ticks = [];
  for (let h = 0; h <= hours; h += 1000) ticks.push(h);

  return (
    <div className="ac-scrub">
      <div className="ac-scrub__events" aria-hidden="true">
        <span className="ac-scrub__evt ac-scrub__evt--end ac-scrub__evt--warn" style={{ left: `${(1000 / hours) * 100}%` }}>DECAY 1,000</span>
        <span className="ac-scrub__evt ac-scrub__evt--start ac-scrub__evt--crit" style={{ left: `${(1497 / hours) * 100}%` }}>FLAG 1,497 · LOCK 1,500</span>
        <span className="ac-scrub__evt ac-scrub__evt--end ac-scrub__evt--arrival" style={{ left: "100%" }}>ARRIVAL 11,040</span>
      </div>
      <div
        ref={trackRef}
        className="ac-scrub__track"
        role="slider"
        tabIndex={0}
        aria-label="Mission time"
        aria-valuemin={0}
        aria-valuemax={hours}
        aria-valuenow={Math.round(clock.hour)}
        aria-valuetext={`Hour ${Math.round(clock.hour)}, ${formatUtc(mission.dateAt(clock.hour))} UTC`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={() => setHover(null)}
        onKeyDown={onKey}
        data-cur
      >
        <div className="ac-scrub__rail" />
        <div className="ac-scrub__fill" style={{ transform: `scaleX(${f})` }} />
        {ticks.map((h) => (
          <i key={h} className="ac-scrub__tick" style={{ left: `${(h / hours) * 100}%` }} />
        ))}
        {[1000, 1497, 1500].map((h) => (
          <b key={h} className={`ac-scrub__mark ${h === 1000 ? "is-warn" : h === 1497 ? "is-warn" : "is-crit"}`} style={{ left: `${(h / hours) * 100}%` }} />
        ))}
        <div className="ac-scrub__head" style={{ transform: `translateX(${(f * 100).toFixed(3)}%)` }}>
          <span />
        </div>
        {hover !== null && (
          <div className="ac-scrub__hover" style={{ transform: `translateX(${((hover / hours) * 100).toFixed(3)}%)` }}>
            <span>
              <strong>H {nf(hover, 0)}</strong> {formatUtc(mission.dateAt(hover)).slice(0, 10)}
            </span>
          </div>
        )}
      </div>
      <div className="ac-scrub__scale" aria-hidden="true">
        {ticks.map((h) => (
          <span key={h} style={{ left: `${(h / hours) * 100}%` }}>
            {h === 0 ? "0" : `${h / 1000}K`}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

interface Toast {
  id: number;
  event: MissionEvent;
  leaving: boolean;
}

export default function Globe({ onReady, onStage }: { onReady?: () => void; onStage?: (stage: Stage) => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const sceneRef = useRef<SceneController | null>(null);
  const firstFrameRef = useRef(false);
  const visibleRef = useRef(false);

  const [mission, setMission] = useState<Mission | null>(null);
  const [clock, setClock] = useState<SimClock | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [focus, setFocusState] = useState<FocusKey>("sun");
  const [tab, setTab] = useState<"log" | "figures">("log");
  const [figure, setFigure] = useState<{ index: number; closing: boolean } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [engaged, setEngaged] = useState(false);
  const [entered, setEntered] = useState(false);
  const [pulse, setPulse] = useState(0);
  const [hint, setHint] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [drawer, setDrawer] = useState<"none" | "data" | "log">("none");

  useClockFrame(clock);

  // 1. data
  useEffect(() => {
    const ctrl = new AbortController();
    setError(null);
    loadMission(pub("/mission.json"), ctrl.signal)
      .then((m) => {
        setMission(m);
        setClock(new SimClock(m));
        onStage?.("data");
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        console.error(err);
        setError("Mission data could not be loaded.");
        onReady?.();
      });
    return () => ctrl.abort();
  }, [attempt, onReady, onStage]);

  // 2. scene
  useEffect(() => {
    if (!mission || !clock || !canvasRef.current || !labelsRef.current) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let controller: SceneController | null = null;
    try {
      controller = createScene(canvasRef.current, mission, clock, {
        labels: labelsRef.current,
        reduceMotion,
        onFirstFrame: () => {
          firstFrameRef.current = true;
          onStage?.("scene");
          onReady?.();
          // the scene boots while offscreen; stop rendering until it is seen
          window.setTimeout(() => sceneRef.current?.setRendering(visibleRef.current), 0);
        },
        onFocusChange: setFocusState,
      });
    } catch (err) {
      console.error(err);
      setError("WebGL could not start the instrument on this device.");
      onReady?.();
      return;
    }
    sceneRef.current = controller;
    return () => {
      controller?.destroy();
      sceneRef.current = null;
    };
  }, [mission, clock, onReady, onStage]);

  // 3. events → toasts (and one red pulse when the lock is crossed in flight)
  useEffect(() => {
    if (!clock) return;
    let id = 0;
    return clock.onEvent((event, dir) => {
      if (dir !== 1) return;
      const toast: Toast = { id: ++id, event, leaving: false };
      setToasts((list) => [...list.slice(-2), toast]);
      if (event.key === "lock" && clock.playing) setPulse((p) => p + 1);
      window.setTimeout(() => setToasts((list) => list.map((t) => (t.id === toast.id ? { ...t, leaving: true } : t))), 3400);
      window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== toast.id)), 3650);
    }) as () => void;
  }, [clock]);

  // 4. engagement: materialize once, zoom only when the console fills the view
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        const ratio = entry.intersectionRatio;
        visibleRef.current = entry.isIntersecting;
        if (firstFrameRef.current) sceneRef.current?.setRendering(entry.isIntersecting);
        if (ratio > 0.35 && !entered) {
          setEntered(true);
          sceneRef.current?.playIntro();
        }
        setEngaged(ratio > 0.97);
      },
      { threshold: [0, 0.2, 0.35, 0.6, 0.9, 0.97, 1] },
    );
    io.observe(root);
    return () => io.disconnect();
  }, [entered, mission]);

  useEffect(() => {
    sceneRef.current?.setZoomEnabled(engaged);
  }, [engaged]);

  // 5. first-visit hint
  useEffect(() => {
    if (!entered) return;
    try {
      if (!window.localStorage.getItem("ares-console-hint")) setHint(true);
    } catch {
      setHint(true);
    }
  }, [entered]);
  const dismissHint = () => {
    setHint(false);
    try {
      window.localStorage.setItem("ares-console-hint", "1");
    } catch {
      /* storage unavailable — the hint simply returns next visit */
    }
  };

  const setFocus = useCallback((key: FocusKey) => {
    sceneRef.current?.setFocus(key);
    setFocusState(key);
  }, []);

  // 6. keyboard — instant, never animated (repeated input)
  useEffect(() => {
    if (!clock || !engaged) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [role=slider]")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === " ") {
        if (target?.closest("button")) return;
        e.preventDefault();
        clock.toggle();
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        clock.pause();
        clock.seek(Math.round(clock.hour + (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 24 : 1)));
      } else if (["1", "2", "3", "4"].includes(e.key)) {
        setFocus(FOCI[Number(e.key) - 1].key);
      } else if (e.key === "Escape" && figure) {
        setFigure((f) => (f ? { ...f, closing: true } : f));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clock, engaged, figure, setFocus]);

  // figure modal exit
  useEffect(() => {
    if (!figure?.closing) return;
    const t = window.setTimeout(() => setFigure(null), 200);
    return () => window.clearTimeout(t);
  }, [figure]);

  const log = useMemo(() => (mission ? buildLog(mission) : []), [mission]);
  const sparks = useMemo(() => (mission ? sparkSeries(mission) : null), [mission]);

  const hour = clock?.hour ?? 0;
  const visibleLog = useMemo(() => log.filter((e) => e.h <= hour + 1e-6).slice(-40), [log, hour]);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visibleLog.length, tab]);

  const toggleSound = () => {
    const a = audioRef.current;
    if (!a) return;
    if (!soundOn) {
      a.muted = false;
      a.volume = 0.42;
      a.play().catch(() => {});
      setSoundOn(true);
    } else {
      a.pause();
      setSoundOn(false);
    }
  };

  if (error) {
    return (
      <div className="ac ac--error" role="alert">
        <p className="ac-error__word">
          ARES<em>1.</em>
        </p>
        <p className="ac-error__line">{error}</p>
        <button className="ac-btn" type="button" onClick={() => setAttempt((a) => a + 1)}>
          RETRY
        </button>
      </div>
    );
  }

  const t = mission && clock ? mission.telemetry(hour) : null;
  const isp = t ? ISP_TAG[t.ispState] : ISP_TAG.nominal;
  const statusTone = t?.ispState === "locked" ? "crit" : t && t.ispState !== "nominal" ? "warn" : "ok";
  const day = Math.floor(hour / 24);

  return (
    <div
      ref={rootRef}
      className={`ac${entered ? " is-entered" : ""}${engaged ? " is-engaged" : ""}`}
      data-tone={statusTone}
      data-drawer={drawer}
    >
      <div className="ac-canvas" ref={canvasRef} {...(engaged ? { "data-lenis-prevent-wheel": "" } : {})} />
      <div className="ac-vignette" key={pulse} data-pulse={pulse > 0 ? "on" : "off"} aria-hidden="true" />

      {/* labels positioned by the scene every frame */}
      <div className="ac-labels" ref={labelsRef}>
        <button type="button" className="ac-label ac-label--sun" data-label="sun" data-visible="false" onClick={() => setFocus("sun")}>
          <span className="ac-label__name">SUN</span>
        </button>
        <button type="button" className="ac-label ac-label--earth" data-label="earth" data-visible="false" onClick={() => setFocus("earth")}>
          <span className="ac-label__name">EARTH</span>
          {t && <span className="ac-label__metric">{(t.earthRangeKm / 1e6).toFixed(1)}M km</span>}
        </button>
        <button type="button" className="ac-label ac-label--mars" data-label="mars" data-visible="false" onClick={() => setFocus("mars")}>
          <span className="ac-label__name">MARS</span>
          {t && <span className="ac-label__metric">{(t.marsRangeKm / 1e6).toFixed(1)}M km</span>}
        </button>
        <button type="button" className="ac-label ac-label--sc" data-label="sc" data-visible="false" onClick={() => setFocus("sc")}>
          <span className="ac-label__name">ARES-1</span>
          {t && <span className="ac-label__metric">{t.speedKms.toFixed(2)} km/s</span>}
        </button>
        <span className="ac-label ac-label--event is-warn" data-label="decay" data-visible="false">
          <span className="ac-label__name">H1,000 DECAY</span>
        </span>
        <span className="ac-label ac-label--event is-crit" data-label="crisis" data-visible="false">
          <span className="ac-label__name">H1,497 FLAG · H1,500 LOCK</span>
        </span>
        {[0, 90, 180, 270].map((deg) => (
          <span key={deg} className="ac-label ac-label--lon" data-label={`lon${deg}`} data-visible="false">
            {deg === 0 ? "λ 0° ♈" : `λ ${deg}°`}
          </span>
        ))}
      </div>

      {/* header */}
      <header className="ac-top ac-glass" style={{ "--i": 0 } as React.CSSProperties}>
        <div className="ac-top__brand">
          <span className="ac-top__word">
            ARES<em>1.</em>
          </span>
          <span className="ac-top__sub">HELIOCENTRIC INSTRUMENT · ECLIPTIC J2000</span>
        </div>
        <div className="ac-top__clock" aria-live="off">
          <span className="ac-top__met">
            {formatMet(hour)}
            <i>H</i>
          </span>
          <span className="ac-top__date">
            {mission ? formatUtc(mission.dateAt(hour)) : "—"} UTC · DAY {String(day).padStart(3, "0")}
          </span>
        </div>
        <div className="ac-top__right">
          <span className="ac-top__phase">{t?.phase ?? "PRE-LAUNCH"}</span>
          <Tag tone={statusTone}>{statusTone === "crit" ? "DEGRADED" : statusTone === "warn" ? "ANOMALY" : "NOMINAL"}</Tag>
          <button type="button" className="ac-btn ac-btn--ghost ac-only-narrow" aria-pressed={drawer === "data"} onClick={() => setDrawer((d) => (d === "data" ? "none" : "data"))}>
            DATA
          </button>
          <button type="button" className="ac-btn ac-btn--ghost ac-only-narrow" aria-pressed={drawer === "log"} onClick={() => setDrawer((d) => (d === "log" ? "none" : "log"))}>
            LOG
          </button>
          <button type="button" className="ac-btn ac-btn--ghost" aria-pressed={soundOn} onClick={toggleSound}>
            {soundOn ? "SOUND ON" : "SOUND OFF"}
          </button>
        </div>
      </header>

      {/* telemetry */}
      <aside className="ac-panel ac-panel--left ac-glass" aria-label="Flight state" style={{ "--i": 1 } as React.CSSProperties}>
        <div className="ac-panel__head">
          <span>FLIGHT STATE</span>
          <span className="ac-panel__meta">{clock?.playing ? `${nf(clock.effectiveRate, clock.effectiveRate < 10 ? 1 : 0)} H/S` : "PAUSED"}</span>
        </div>
        {t && sparks && mission && (
          <div className="ac-panel__body" data-lenis-prevent>
            <Stat label="Specific impulse" value={nf(t.ispS, 1)} unit="s" tag={<Tag tone={isp.tone}>{isp.label}</Tag>} sub={`${nf(mission.constants.ispNominal, 0)} s nominal · lock ${nf(mission.constants.ispLocked, 1)} s`}>
              <Spark values={sparks.isp} hours={mission.hours} hour={hour} />
            </Stat>
            <Stat label="Thrust" value={t.thrustN.toFixed(3)} unit="N" sub={`${nf(t.thrustFrac * 100, 1)}% of max · ${t.accelMms2.toFixed(4)} mm/s²`}>
              <Spark values={sparks.thrust} hours={mission.hours} hour={hour} lo={0} hi={mission.constants.thrustMaxN} />
            </Stat>
            <Stat label="Propellant" value={nf(t.propellantKg, 1)} unit="kg" sub={`${nf(t.propellantFrac * 100, 1)}% · flow ${t.massFlowGh.toFixed(1)} g/h`}>
              <Spark values={sparks.prop} hours={mission.hours} hour={hour} lo={0} hi={mission.constants.wetMassKg - mission.constants.dryMassKg} />
            </Stat>
            <Stat label="Δv delivered" value={t.dvKms.toFixed(3)} unit="km/s" sub={`mass ${nf(t.massKg, 1)} kg`}>
              <Spark values={sparks.dv} hours={mission.hours} hour={hour} lo={0} />
            </Stat>
            <Stat label="Heliocentric speed" value={t.speedKms.toFixed(2)} unit="km/s" sub={`r ${t.sunDistAu.toFixed(4)} AU · ${nf(t.sunDistKm / 1e6, 2)}M km`}>
              <Spark values={sparks.speed} hours={mission.hours} hour={hour} lo={0} />
            </Stat>
            <Stat
              label="Earth range"
              value={nf(t.earthRangeKm / 1e6, 2)}
              unit="M km"
              sub={`light time ${formatDuration(t.lightTimeS)} · SEP ${t.sepAngleDeg.toFixed(1)}°`}
              tag={t.sepAngleDeg < 5 && hour > 24 ? <Tag tone="warn">CONJUNCTION</Tag> : undefined}
            >
              <Spark values={sparks.earth} hours={mission.hours} hour={hour} lo={0} />
            </Stat>
            <Stat label="Mars range" value={nf(t.marsRangeKm / 1e6, 2)} unit="M km" sub={`relative speed ${t.marsRelSpeedKms.toFixed(2)} km/s`}>
              <Spark values={sparks.mars} hours={mission.hours} hour={hour} lo={0} />
            </Stat>
          </div>
        )}
      </aside>

      {/* log & figures */}
      <aside className="ac-panel ac-panel--right ac-glass" aria-label="Guidance log and figures" style={{ "--i": 2 } as React.CSSProperties}>
        <div className="ac-panel__head ac-panel__head--tabs">
          <Segmented
            size="sm"
            label="Panel"
            value={tab}
            onChange={setTab}
            options={[
              { value: "log", label: "GUIDANCE LOG" },
              { value: "figures", label: "FIGURES" },
            ]}
          />
        </div>
        <div className="ac-panel__swap" key={tab}>
          {tab === "log" ? (
            <div className="ac-log" ref={logRef} data-lenis-prevent>
              {visibleLog.map((e) => (
                <div key={`${e.kind}-${e.h}`} className={`ac-log__row ac-log__row--${e.kind}`}>
                  <span className="ac-log__h">H{String(e.h).padStart(5, "0")}</span>
                  <div>
                    <span className="ac-log__title">{e.title}</span>
                    <span className="ac-log__body">{e.body}</span>
                  </div>
                </div>
              ))}
              {visibleLog.length <= 1 && <p className="ac-log__empty">Press play or scrub the timeline — entries print as the mission clock passes them.</p>}
            </div>
          ) : (
            <div className="ac-figs" data-lenis-prevent>
              {FIGURES.map((fig, i) => (
                <button key={fig.src} type="button" className="ac-fig" onClick={() => setFigure({ index: i, closing: false })}>
                  <img src={pub(fig.src)} alt="" loading="lazy" />
                  <span className="ac-fig__title">
                    FIG. {String(i + 1).padStart(2, "0")} · {fig.title.toUpperCase()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* toasts */}
      <div className="ac-toasts" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`ac-toast ac-toast--${toast.event.key}`} data-leaving={toast.leaving}>
            <span className="ac-toast__h">H{nf(toast.event.h, 0)}</span>
            <span className="ac-toast__title">{toast.event.label.toUpperCase()}</span>
            <span className="ac-toast__body">{toast.event.detail}</span>
          </div>
        ))}
      </div>

      {hint && (
        <div className="ac-hint ac-material" role="note">
          <span className="ac-hint__title">FLYING THE INSTRUMENT</span>
          <span>
            <kbd>DRAG</kbd> orbit · <kbd>SCROLL</kbd> zoom · <kbd>SPACE</kbd> play · <kbd>← →</kbd> ±1 h · <kbd>1–4</kbd> focus
          </span>
          <button type="button" className="ac-btn ac-btn--ghost" onClick={dismissHint}>
            GOT IT
          </button>
        </div>
      )}

      {/* timeline + transport */}
      <footer className="ac-dock ac-glass" style={{ "--i": 3 } as React.CSSProperties}>
        {mission && clock && (
          <>
            <div className="ac-dock__row">
              <div className="ac-transport">
                <button type="button" className="ac-btn ac-btn--icon" aria-label="Back to launch" onClick={() => clock.seek(0, true, 1.1)}>
                  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3v10M13 3 6 8l7 5z" /></svg>
                </button>
                <button type="button" className="ac-btn ac-btn--icon" aria-label="Back one day" onClick={() => { clock.pause(); clock.seek(Math.max(0, Math.round(clock.hour) - 24)); }}>
                  −1D
                </button>
                <button type="button" className={`ac-btn ac-btn--play${clock.playing ? " is-playing" : ""}`} aria-label={clock.playing ? "Pause" : "Play"} onClick={() => clock.toggle()}>
                  <span className="ac-play__icon" aria-hidden="true" />
                  {clock.playing ? "PAUSE" : hour >= mission.hours ? "REPLAY" : "PLAY"}
                </button>
                <button type="button" className="ac-btn ac-btn--icon" aria-label="Forward one day" onClick={() => { clock.pause(); clock.seek(Math.min(mission.hours, Math.round(clock.hour) + 24)); }}>
                  +1D
                </button>
              </div>
              <Segmented size="sm" label="Playback rate" value={clock.rate} onChange={(v) => clock.setRate(v)} options={RATES.map((r) => ({ value: r.hps, label: r.label }))} />
              <button type="button" className="ac-btn ac-btn--ghost ac-hold" aria-pressed={clock.hold} onClick={() => clock.setHold(!clock.hold)} title="Slow the clock through mission events">
                EVENT HOLD {clock.hold ? "ON" : "OFF"}
              </button>
              <div className="ac-jumps" aria-label="Jump to event">
                {mission.events.slice(1).map((e) => (
                  <button key={e.key} type="button" className={`ac-jump ac-jump--${e.key}`} onClick={() => { clock.pause(); clock.seek(e.key === "flag" ? e.h - 6 : e.h, true); }}>
                    {e.key === "flag" ? "H1,497" : e.key === "lock" ? "H1,500" : e.key === "decay" ? "H1,000" : "ARRIVAL"}
                  </button>
                ))}
              </div>
              <Segmented label="Camera focus" value={focus} onChange={setFocus} options={FOCI.map((f) => ({ value: f.key, label: f.label }))} />
            </div>
            <Scrubber mission={mission} clock={clock} />
          </>
        )}
      </footer>

      {figure && (
        <div className="ac-modal" data-closing={figure.closing} onClick={() => setFigure((f) => (f ? { ...f, closing: true } : f))}>
          <div className="ac-modal__card" role="dialog" aria-modal="true" aria-label={FIGURES[figure.index].title} onClick={(e) => e.stopPropagation()}>
            <div className="ac-modal__head">
              <span>
                FIG. {String(figure.index + 1).padStart(2, "0")} · {FIGURES[figure.index].title.toUpperCase()}
              </span>
              <button type="button" className="ac-btn ac-btn--ghost" autoFocus onClick={() => setFigure((f) => (f ? { ...f, closing: true } : f))}>
                CLOSE
              </button>
            </div>
            <img src={pub(FIGURES[figure.index].src)} alt={FIGURES[figure.index].title} />
            <p>{FIGURES[figure.index].caption}</p>
          </div>
        </div>
      )}

      <audio ref={audioRef} src={pub("/audio/theme.mp3")} loop preload="none" playsInline muted />
    </div>
  );
}
