"use client";

import { useState, useEffect, useRef, useMemo, type CSSProperties } from "react";
import "../lib/cesiumInit";
import { ReactLenis, type LenisRef } from "lenis/react";
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Crosshair, 
  Activity, 
  Gauge, 
  Fuel, 
  AlertTriangle, 
  CheckCircle2, 
  HelpCircle,
  Clock,
  Terminal,
  Image,
  Maximize2,
  Compass
} from "lucide-react";import {
  Viewer as CesiumViewer,
  Cartesian3,
  Cartesian2,
  Color,
  Math as CesiumMath,
  ArcType,
  HeadingPitchRange,
  Matrix4,
  ScreenSpaceEventType,
} from "cesium";
import {
  CesiumComponentRef, 
  Viewer, 
  Entity, 
  PointGraphics, 
  PolylineGraphics, 
  EllipsoidGraphics,
  LabelGraphics,
  BillboardGraphics
} from "resium";
import HeroBlob from "./HeroBlob";
import BootScreen from "./BootScreen";
import { pub } from "../lib/paths";

// Soft radial glow sprite (canvas-generated) used for the Sun corona and the
// Earth/Mars halos. Additive blend in Cesium so it reads as light, not paint.
const GLOW_URL = (() => {
  if (typeof document === "undefined") return "";
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  if (!g) return "";
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.22, "rgba(255,255,255,0.6)");
  grad.addColorStop(0.55, "rgba(255,255,255,0.14)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return c.toDataURL();
})();

export default function Globe({ embedded = false, onReady }: { embedded?: boolean; onReady?: () => void }) {
  const [ready, setReady] = useState(false);
  const [trajectoryData, setTrajectoryData] = useState<any | null>(null);
  const [animationStep, setAnimationStep] = useState<number>(0);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const [trackSC, setTrackSC] = useState<boolean>(false);
  // Which celestial body (if any) the camera should continuously follow:
  // "sun" | "earth" | "mars" | null. Unlike the one-shot focus buttons,
  // tracking keeps the body centered as the simulation advances.
  const [trackBody, setTrackBody] = useState<string | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [activeRightTab, setActiveRightTab] = useState<"console" | "trajectory" | "isp" | "thrust">("console");
  const [zoomPlot, setZoomPlot] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState<boolean>(true);
  const [dataError, setDataError] = useState<string | null>(null);
  // Portfolio signatures: invert flips the whole console light/dark via CSS
  // tokens; showBoot keeps the boot screen up briefly after assets arrive.
  const [inverted, setInverted] = useState<boolean>(false);
  const [soundOn, setSoundOn] = useState<boolean>(false);
  const [showBoot, setShowBoot] = useState<boolean>(true);
  // Scroll progress (0→1) and current section (1 hero, 2 stats, 3 console)
  const [scrollPct, setScrollPct] = useState<number>(0);
  const [sectionIdx, setSectionIdx] = useState<number>(1);
  // True once the page is scrolled to the bottom (console fills the viewport)
  // — the only state where the 3D view accepts wheel/pinch zoom.
  const [atBottom, setAtBottom] = useState<boolean>(false);
  
  const viewerRef = useRef<CesiumComponentRef<CesiumViewer>>(null);
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lenisRef = useRef<LenisRef>(null);

  // Scroll FX refs — hero parallax layers
  const heroRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const metaRef = useRef<HTMLDivElement | null>(null);
  const statsRef = useRef<HTMLElement | null>(null);
  const consoleShellRef = useRef<HTMLDivElement | null>(null);
  const cursorRef = useRef<HTMLDivElement | null>(null);

  // User-interaction guard: while the visitor drags/zooms the camera, the
  // auto-framing camera stands down so the view never fights their hand.
  const userInteractingRef = useRef(false);
  const interactionTimerRef = useRef<number | null>(null);
  // True once the page is scrolled to the bottom — the only state where
  // Cesium wheel/pinch zoom is enabled (the console fills the viewport).
  const atBottomRef = useRef(false);
  // Camera follow state. The target is eased toward the latest trajectory
  // sample, avoiding the visible 10-hour step jumps during playback.
  const lastFollowRef = useRef<{ target: Cartesian3; mode: string } | null>(null);
  const followRafRef = useRef<number | null>(null);
  const followTargetRef = useRef<Cartesian3 | null>(null);
  const followModeRef = useRef("none");

  // Invert: flip the B&W design tokens on <html> (like the portfolio's
  // body.is-invert). Every surface and cut-out flips together.
  useEffect(() => {
    document.documentElement.classList.toggle("is-invert", inverted);
    return () => document.documentElement.classList.remove("is-invert");
  }, [inverted]);

  // Boot: hold the boot screen a beat after the scene is ready, then fade out.
  // onReady lifts the page-level boot overlay at the same instant, so the
  // visitor sees exactly one boot screen and one reveal.
  useEffect(() => {
    if (!ready || !trajectoryData) return;
    const t = setTimeout(() => {
      setShowBoot(false);
      onReady?.();
    }, 1100);
    return () => clearTimeout(t);
  }, [ready, trajectoryData, onReady]);

  // Sound: portfolio pattern — the track rolls muted from the first frame so
  // it is buffered; toggling only unmutes (which cannot fail on a gesture).
  const toggleSound = () => {
    const a = audioRef.current;
    if (!a) return;
    if (!soundOn) {
      a.muted = false;
      a.volume = 0.42;
      a.play().catch(() => {});
      setSoundOn(true);
    } else {
      a.volume = 0;
      a.pause();
      setSoundOn(false);
    }
  };

  // Auto-scroll the guidance console to the bottom as the simulation steps forward.
  // Direct scrollTop (not scrollIntoView) so Lenis never fights it and it doesn't
  // queue smooth-scrolls at 22fps.
  useEffect(() => {
    const el = consoleEndRef.current;
    const scroller = el?.closest("[data-lenis-prevent]");
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }, [animationStep, activeRightTab]);

  const getConsoleLogs = () => {
    if (!trajectoryData) return [];
    const logsList: string[] = [];
    const steps = trajectoryData.steps;
    const thrusts = trajectoryData.thrust;
    
    for (let i = 0; i <= animationStep; i++) {
      const hr = steps[i];
      if (i === 0) {
        logsList.push(`[0h] 🚀 Departure: ARES-1 initiated Earth departure. PPO policy loaded.`);
      }
      
      if (hr === 1000) {
        logsList.push(`[1000h] ⚠️ Warning: Thruster specific impulse decay detected (degradation curve initiated).`);
      }

      // Add periodic telemetry syncs to make the console feel alive and provide visual data
      if (hr % 1000 === 0 && hr > 0 && hr < 11000) {
        const scPosKm = trajectoryData.sc_pos[i];
        const marsPosKm = trajectoryData.mars_pos[i];
        const sunDistKm = Math.sqrt(scPosKm[0]**2 + scPosKm[1]**2 + scPosKm[2]**2);
        const marsDistKm = Math.sqrt(
          (marsPosKm[0] - scPosKm[0])**2 + 
          (marsPosKm[1] - scPosKm[1])**2 + 
          (marsPosKm[2] - scPosKm[2])**2
        );
        const latencySec = (sunDistKm / 299792.458).toFixed(1);
        logsList.push(`[${hr}h] 📡 Telemetry: Sun Dist = ${(sunDistKm/1e6).toFixed(1)}M km | Mars Dist = ${(marsDistKm/1e6).toFixed(1)}M km | Latency = ${latencySec}s.`);
      }
      
      const prevAnomaly = i > 0 ? (trajectoryData.anomaly[i-1] || steps[i-1] >= 1497) : false;
      const currAnomaly = trajectoryData.anomaly[i] || hr >= 1497;
      if (currAnomaly && !prevAnomaly && hr < 1500) {
        logsList.push(`[${hr}h] 🚨 Isolation Forest: Anomalous engine signature flagged (threshold exceeded).`);
      }
      
      if (hr === 1500) {
        logsList.push(`[1500h] 💥 Critical: Hardware failure. Isp locked at 1514.7s. Re-solving optimization matrix.`);
      }
      
      if (i > 0) {
        const isBurning = thrusts[i] > 0.005;
        const wasBurning = thrusts[i - 1] > 0.005;
        if (isBurning && !wasBurning) {
          logsList.push(`[${hr}h] ⚡ Ignition: PPO active burn engaged (Command = ${(thrusts[i]/0.289*100).toFixed(0)}% capacity).`);
        } else if (!isBurning && wasBurning) {
          logsList.push(`[${hr}h] 💤 Coasting: PPO burn completed. Reverting to ballistic trajectory.`);
        }
      }
      
      if (i === steps.length - 1 && animationStep === steps.length - 1) {
        logsList.push(`[${hr}h] 🎯 Intercept: Mars orbit insertion completed. Mission success.`);
      }
    }
    return logsList.slice(-40); // Keep last 40 logs for scrolling display
  };

  const logs = getConsoleLogs();

  // 1a. Camera zoom policy + user-interaction guard.
  // Zoom policy: wheel/pinch zoom is only enabled once the page is scrolled
  // to the bottom — i.e. when the console (with the 3D view) fills the
  // viewport. While scrolling through the hero/stats, wheel scrolls the page
  // instead of fighting the camera.
  // Interaction guard: drag gestures raise the flag so the auto-follow camera
  // (effect #6) stands down for a beat; after the timeout the follow resumes.
  useEffect(() => {
    if (!ready || !trajectoryData) return;
    const types = [
      ScreenSpaceEventType.LEFT_DOWN, ScreenSpaceEventType.LEFT_UP,
      ScreenSpaceEventType.RIGHT_DOWN, ScreenSpaceEventType.RIGHT_UP,
      ScreenSpaceEventType.MIDDLE_DOWN, ScreenSpaceEventType.MIDDLE_UP,
    ];
    let attached = false;
    let viewerLocal: any = null;
    const syncZoom = () => {
      const doc = document.documentElement;
      const atBottom = window.innerHeight + window.scrollY >= doc.scrollHeight - 4;
      atBottomRef.current = atBottom;
      setAtBottom((prev) => (prev === atBottom ? prev : atBottom));
      const v = viewerRef.current?.cesiumElement;
      if (v) (v.scene.screenSpaceCameraController as any).enableZoom = atBottom;
    };
    const onInput = () => {
      userInteractingRef.current = true;
      syncZoom();
      if (interactionTimerRef.current !== null) {
        window.clearTimeout(interactionTimerRef.current);
      }
      interactionTimerRef.current = window.setTimeout(() => {
        userInteractingRef.current = false;
        syncZoom();
      }, 800);
    };
    const interval = setInterval(() => {
      const viewer = viewerRef.current?.cesiumElement;
      if (!viewer || attached) return;
      attached = true;
      viewerLocal = viewer;
      clearInterval(interval);
      syncZoom();
      types.forEach((t) => viewer.screenSpaceEventHandler.setInputAction(onInput, t));
    }, 100);
    window.addEventListener("scroll", syncZoom, { passive: true });
    window.addEventListener("resize", syncZoom);
    syncZoom();
    return () => {
      window.removeEventListener("scroll", syncZoom);
      window.removeEventListener("resize", syncZoom);
      clearInterval(interval);
      if (attached && viewerLocal) {
        types.forEach((t) => viewerLocal.screenSpaceEventHandler.removeInputAction(t));
      }
    };
  }, [ready, trajectoryData]);

  // 1b. Scroll FX — hero parallax (stage drifts slower, meta faster, fade out),
  // rail progress + section index. Skipped under prefers-reduced-motion.
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY;
        const docH = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        const pct = Math.min(1, Math.max(0, y / docH));
        setScrollPct(pct);
        setSectionIdx(pct < 0.33 ? 1 : pct < 0.66 ? 2 : 3);
        if (!reduce) {
          const hero = heroRef.current, stage = stageRef.current, meta = metaRef.current;
          if (hero && stage && meta) {
            const p = Math.min(1, Math.max(0, -hero.getBoundingClientRect().top / window.innerHeight));
            // 3D wordmark: the whole stage tilts back in perspective as you
            // scroll, like the type is falling away from the viewport.
            stage.style.transform =
              `perspective(1000px) translate3d(0, ${p * 70}px, 0) rotateX(${p * 26}deg)`;
            meta.style.transform = `translate3d(0, ${-p * 46}px, 0)`;
            stage.style.opacity = String(1 - p * 0.7);
          }
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  // 1c. Cursor light — a soft radial glow that trails the pointer with lag
  // (difference blend so it reads on both the dark and inverted themes).
  // Skipped on touch devices and under prefers-reduced-motion. Gated on
  // ready+data because the main tree (with the cursor div) only mounts then.
  useEffect(() => {
    if (!ready || !trajectoryData) return;
    const el = cursorRef.current;
    if (!el) return;
    if (
      window.matchMedia("(pointer: coarse)").matches ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    let x = window.innerWidth / 2, y = window.innerHeight / 2;
    let tx = x, ty = y, raf = 0;
    const onMove = (e: PointerEvent) => {
      tx = e.clientX;
      ty = e.clientY;
    };
    const loop = () => {
      x += (tx - x) * 0.12;
      y += (ty - y) * 0.12;
      el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, [ready, trajectoryData]);

  // 1d. Stats reveal + count-up: when the mission-parameters strip scrolls
  // into view, the cards stagger in and the VCR numbers count up to target.
  useEffect(() => {
    if (!ready || !trajectoryData) return;
    const section = statsRef.current;
    if (!section) return;
    let started = false;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || started) return;
      started = true;
      section.classList.add("is-in");
      section.querySelectorAll<HTMLElement>("[data-count]").forEach((el) => {
        const target = parseFloat(el.dataset.count || "0");
        const decimals = parseInt(el.dataset.decimals || "0", 10);
        const dur = 1400;
        const t0 = performance.now();
        const fmt = (v: number) =>
          v.toLocaleString("en-US", {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          });
        const step = (now: number) => {
          const p = Math.min(1, (now - t0) / dur);
          const eased = 1 - Math.pow(1 - p, 3);
          el.textContent = fmt(target * eased);
          if (p < 1) requestAnimationFrame(step);
          else el.textContent = fmt(target);
        };
        requestAnimationFrame(step);
      });
      io.disconnect();
    }, { threshold: 0.25 });
    io.observe(section);
    return () => io.disconnect();
  }, [ready, trajectoryData]);

  // 1e. Console pin-in: as the console settles into its sticky position, it
  // straightens from a slight 3D tilt (buttermax-style "settle" entrance).
  useEffect(() => {
    if (!ready || !trajectoryData) return;
    const shell = consoleShellRef.current;
    if (!shell) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        shell.classList.add("is-pinned");
        io.disconnect();
      }
    }, { threshold: 0.2 });
    io.observe(shell);
    return () => io.disconnect();
  }, [ready, trajectoryData]);

  // 1f. Glow pulse — breathes the Sun corona and the Earth/Mars halos so the
  // scene feels alive even when the sim is paused. Runs on its own rAF.
  useEffect(() => {
    if (!ready || !trajectoryData) return;
    let raf = 0;
    const t0 = performance.now();
    const loop = () => {
      const viewer = viewerRef.current?.cesiumElement;
      if (viewer) {
        const t = (performance.now() - t0) / 1000;
        const sunPulse = 340 + Math.sin(t * 1.7) * 30;
        const planetPulse = 110 + Math.sin(t * 2.3 + 1) * 14;
        const sun = viewer.entities.getById("sun-glow");
        const earth = viewer.entities.getById("earth-glow");
        const mars = viewer.entities.getById("mars-glow");
        // (as any: Cesium accepts raw numbers here; the public types say Property)
        if (sun?.billboard) { (sun.billboard as any).width = sunPulse; (sun.billboard as any).height = sunPulse; }
        if (earth?.billboard) { (earth.billboard as any).width = planetPulse; (earth.billboard as any).height = planetPulse; }
        if (mars?.billboard) { (mars.billboard as any).width = planetPulse; (mars.billboard as any).height = planetPulse; }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ready, trajectoryData]);

  // 1. Initial Cesium Ready Check
  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).Cesium) {
      setReady(true);
      return;
    }
    const interval = setInterval(() => {
      if ((window as any).Cesium) {
        setReady(true);
        clearInterval(interval);
      }
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // 2. Fetch Trajectory JSON Data
  useEffect(() => {
    fetch(pub("/trajectory_data.json"))
      .then((res) => {
        if (!res.ok) throw new Error(`Trajectory request failed: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!data?.steps?.length) throw new Error("Trajectory dataset is empty");
        setTrajectoryData(data);
      })
      .catch((err) => {
        console.error("Failed to load trajectory data:", err);
        setDataError("Trajectory data could not be loaded. Refresh to try again.");
      });
  }, []);

  // 3. Configure Cesium Environment (Disable Globe & Set Camera View)
  // The resium <Viewer> only mounts once BOTH `ready` and `trajectoryData` are
  // available, and it exposes the Cesium viewer asynchronously (via an internal
  // layout effect + state round-trip). Polling here guarantees the setup runs
  // exactly once after the viewer actually exists — otherwise the default Earth
  // globe stays visible and the camera stays at the planet surface instead of the
  // Sun-centered heliocentric view.
  useEffect(() => {
    if (!ready || !trajectoryData) return;

    let applied = false;
    const interval = setInterval(() => {
      const viewer = viewerRef.current?.cesiumElement;
      if (!viewer || applied) return;
      applied = true;
      clearInterval(interval);

      // Hide default Earth globe to enable Sun-centered Heliocentric Mode
      viewer.scene.globe.show = false;
      if (viewer.scene.skyAtmosphere) {
        viewer.scene.skyAtmosphere.show = false;
      }

      // CRITICAL: Cesium 1.134 enables logarithmic depth by default, which caps
      // the camera frustum far plane at 1e10 m (10 million km). The heliocentric
      // scene spans ~3.5e11 m, so without raising this cap every planet and the
      // spacecraft end up BEYOND the far plane and are clipped — the scene
      // renders only the skybox. Push the cap out to cover the whole system.
      viewer.camera.frustum.far = 1e13;

      // Frame the heliocentric system: look at the origin (Sun) from a slight
      // elevation so Earth, Mars, and the spacecraft are all in view. A plain
      // setView with heading/pitch/roll here does NOT point at the Sun — in the
      // ECEF frame it aims at empty space above the ecliptic plane, leaving the
      // planets off-screen. lookAt the origin (same as the SUN focus button),
      // then release the transform so the user can rotate freely.
      viewer.camera.lookAt(
        Cartesian3.ZERO,
        new HeadingPitchRange(0, CesiumMath.toRadians(-35), 3.0e11)
      );
      viewer.camera.lookAtTransform(Matrix4.IDENTITY);

      // Zoom policy is owned by the interaction guard in effect #1a: wheel
      // zoom is enabled only when the page is scrolled to the bottom (the
      // console fills the viewport); otherwise wheel scrolls the page.
    }, 100);
    return () => {
      clearInterval(interval);

    };
  }, [ready, trajectoryData]);

  // 4. Animation Control Interval Loop
  useEffect(() => {
    if (!isAnimating || !trajectoryData) return;
    const interval = setInterval(() => {
      setAnimationStep((prev) => {
        if (prev >= trajectoryData.steps.length - 1) {
          setIsAnimating(false);
          return prev;
        }
        const nextStep = prev + playbackSpeed;
        if (nextStep >= trajectoryData.steps.length - 1) {
          setIsAnimating(false);
          return trajectoryData.steps.length - 1;
        }
        return nextStep;
      });
    }, 45); // ~22 frames per second
    return () => clearInterval(interval);
  }, [isAnimating, trajectoryData, playbackSpeed]);

  // 5. (Camera tracking is handled entirely by the unified follow in effect
  // #6 below — it never uses Cesium's trackedEntity, whose auto-view caused
  // camera jumps and flashing.)

  // Precompute Cartesian3 arrays for orbital lines (memoized to prevent worker allocation spam)
  const earthPositions = useMemo(() => {
    if (!trajectoryData) return [];
    return trajectoryData.earth_pos.map((p: number[]) => 
      Cartesian3.fromElements(p[0] * 1000, p[1] * 1000, p[2] * 1000)
    );
  }, [trajectoryData]);

  const marsPositions = useMemo(() => {
    if (!trajectoryData) return [];
    return trajectoryData.mars_pos.map((p: number[]) => 
      Cartesian3.fromElements(p[0] * 1000, p[1] * 1000, p[2] * 1000)
    );
  }, [trajectoryData]);

  const scPositionsAll = useMemo(() => {
    if (!trajectoryData) return [];
    return trajectoryData.sc_pos.map((p: number[]) => 
      Cartesian3.fromElements(p[0] * 1000, p[1] * 1000, p[2] * 1000)
    );
  }, [trajectoryData]);

  // Progressive SC trail: only positions up to current animation step
  const scPositions = useMemo(() => {
    if (!scPositionsAll.length) return [];
    return scPositionsAll.slice(0, animationStep + 1);
  }, [scPositionsAll, animationStep]);

  // Connection lines: spacecraft → Mars and spacecraft → Earth
  const scToMarsLine = useMemo(() => {
    if (!scPositionsAll.length || !marsPositions.length) return [];
    const scPos = scPositionsAll[animationStep];
    const marsPos = marsPositions[animationStep];
    if (!scPos || !marsPos) return [];
    return [scPos, marsPos];
  }, [scPositionsAll, marsPositions, animationStep]);

  const scToEarthLine = useMemo(() => {
    if (!scPositionsAll.length || !earthPositions.length) return [];
    const scPos = scPositionsAll[animationStep];
    const earthPos = earthPositions[animationStep];
    if (!scPos || !earthPos) return [];
    return [scPos, earthPos];
  }, [scPositionsAll, earthPositions, animationStep]);

  // 6. Manual camera follow — the single owner of tracking views. Rather than
  // re-centering the camera on the target every tick (which yanked the view
  // back whenever the visitor zoomed or panned), this translates the camera
  // by the target's movement delta since the last tick: the target keeps its
  // current screen position while the visitor's zoom distance and orientation
  // are preserved exactly. If the visitor drags or zooms, the view stays where
  // they put it — the follow only ever shifts by the target's own motion.
  //   - trackBody earth/mars → follow that body
  //   - trackSC + playing    → follow the SC↔Mars midpoint (both in view)
  //   - trackSC + paused     → follow the spacecraft
  // Stands down during an active drag (userInteractingRef) but keeps updating
  // the reference target, so resuming never causes a jump.
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer || !ready || !trajectoryData) return;
    viewer.trackedEntity = undefined;

    const mode = trackBody
      ? `body:${trackBody}`
      : trackSC
        ? isAnimating
          ? "sc-live"
          : "sc-paused"
        : "none";

    let target: Cartesian3 | null = null;
    if (trackBody === "earth" || trackBody === "mars") {
      const positions = trackBody === "earth" ? earthPositions : marsPositions;
      target = positions[animationStep] ?? null;
    } else if (trackSC) {
      const scPos = scPositionsAll[animationStep];
      if (scPos) {
        if (isAnimating) {
          const marsPos = marsPositions[animationStep];
          if (marsPos) target = Cartesian3.midpoint(scPos, marsPos, new Cartesian3());
        } else {
          target = scPos;
        }
      }
    }

    if (!target) {
      lastFollowRef.current = null;
      followTargetRef.current = null;
      if (followRafRef.current !== null) cancelAnimationFrame(followRafRef.current);
      followRafRef.current = null;
      return;
    }

    const prev = lastFollowRef.current;
    lastFollowRef.current = { target: target.clone(), mode };

    // Keep the follow on one continuous render loop. The old per-sample RAF
    // restarted every 45ms, which left the camera in a repeated start/stop
    // easing cycle and produced visible judder. This loop interpolates toward
    // the newest target every frame, without touching heading/pitch/range.
    followTargetRef.current = target.clone();
    followModeRef.current = mode;
    if (prev && prev.mode === mode && !userInteractingRef.current && followRafRef.current === null) {
      const tick = () => {
        const currentTarget = followTargetRef.current;
        const current = viewerRef.current?.cesiumElement;
        if (!current || !currentTarget || userInteractingRef.current || followModeRef.current === "none") {
          followRafRef.current = null;
          return;
        }
        const previousTarget = lastFollowRef.current?.target;
        if (previousTarget) {
          const delta = Cartesian3.subtract(currentTarget, previousTarget, new Cartesian3());
          const smoothed = Cartesian3.multiplyByScalar(delta, 0.16, new Cartesian3());
          current.camera.position = Cartesian3.add(current.camera.positionWC, smoothed, new Cartesian3());
          current.camera.lookAtTransform(Matrix4.IDENTITY);
        }
        followRafRef.current = requestAnimationFrame(tick);
      };
      followRafRef.current = requestAnimationFrame(tick);
    }
  }, [animationStep, isAnimating, trackSC, trackBody, scPositionsAll, earthPositions, marsPositions, ready, trajectoryData]);

  if (dataError) {
    return <div className="boot" role="alert"><p className="boot__word">ARES<em>1.</em></p><p className="boot__line">{dataError}</p><button className="ctl__b" onClick={() => window.location.reload()}>refresh mission data</button></div>;
  }

  if (!ready || !trajectoryData) {
    return <BootScreen done={false} />;
  }

  // 3. Non-linear mapping functions for synchronized timeline
  const getPercentForHour = (hour: number) => {
    if (hour <= 0) return 0;
    if (hour <= 1000) return (hour / 1000) * 25;
    if (hour <= 1497) return 25 + ((hour - 1000) / 497) * 25;
    if (hour <= 1500) return 50 + ((hour - 1497) / 3) * 25;
    if (hour <= 11040) return 75 + ((hour - 1500) / 9540) * 25;
    return 100;
  };

  const getHourForPercent = (pct: number) => {
    if (pct <= 0) return 0;
    if (pct <= 25) return (pct / 25) * 1000;
    if (pct <= 50) return 1000 + ((pct - 25) / 25) * 497;
    if (pct <= 75) return 1497 + ((pct - 50) / 25) * 3;
    if (pct <= 100) return 1500 + ((pct - 75) / 25) * 9540;
    return 11040;
  };

  // Helper to jump to a specific hour index dynamically
  const getStepIndexForHour = (hour: number) => {
    const steps = trajectoryData.steps;
    let closestIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < steps.length; i++) {
      const diff = Math.abs(steps[i] - hour);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }
    return closestIdx;
  };

  // After a camera-option jump, make wheel zoom live immediately. The option
  // buttons are only reachable once the console is pinned at the bottom — the
  // exact state where the zoom policy (effect #1a) allows zooming — so this
  // just re-asserts the policy rather than overriding it.
  const ensureZoomEnabled = () => {
    const v = viewerRef.current?.cesiumElement;
    if (v) (v.scene.screenSpaceCameraController as any).enableZoom = atBottomRef.current;
  };

  // Camera presets — use lookAt to position the camera at a good range from
  // the target, then immediately release with lookAtTransform(IDENTITY) so the
  // user can still rotate/zoom freely after the jump. Effect #6 then follows
  // the chosen target by translating the camera with its motion — never
  // re-centering — so whatever the user does to the view afterwards sticks.
  const focusSun = () => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;
    setTrackSC(false);
    setTrackBody(null);
    viewer.trackedEntity = undefined;
    viewer.camera.lookAt(
      Cartesian3.ZERO,
      new HeadingPitchRange(0, CesiumMath.toRadians(-35), 3.0e11)
    );
    viewer.camera.lookAtTransform(Matrix4.IDENTITY);
    ensureZoomEnabled();
  };

  const focusEarth = () => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;
    setTrackSC(false);
    // Jump to Earth now, then keep following it as the simulation advances.
    // Earth stays the CENTER of the view, but at 1.0e11 the shot is zoomed
    // out enough to keep the sun, the SC trajectory, and Mars in context.
    const ep = earthPositions[animationStep];
    if (!ep) return;
    viewer.camera.lookAt(
      ep,
      new HeadingPitchRange(0, CesiumMath.toRadians(-32), 1.0e11)
    );
    viewer.camera.lookAtTransform(Matrix4.IDENTITY);
    setTrackBody("earth");
    ensureZoomEnabled();
  };

  const focusMars = () => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;
    setTrackSC(false);
    // Jump to Mars now, then keep following it as the simulation advances.
    // Mars stays the CENTER of the view, but at 9e10 the shot is zoomed out
    // enough to keep Earth, the SC trajectory, and the sun in context.
    const mp = marsPositions[animationStep];
    if (!mp) return;
    viewer.camera.lookAt(
      mp,
      new HeadingPitchRange(0, CesiumMath.toRadians(-32), 9e10)
    );
    viewer.camera.lookAtTransform(Matrix4.IDENTITY);
    setTrackBody("mars");
    ensureZoomEnabled();
  };

  // Frame the SC↔Mars midpoint (during playback) or the spacecraft (paused) —
  // the initial jump when LOCK SC is engaged. After this, effect #6 follows
  // relatively, so this framing is never re-applied and the user's view stays.
  const frameSC = (animating = isAnimating) => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;
    const scPos = scPositionsAll[animationStep];
    if (!scPos) return;
    if (animating) {
      const marsPos = marsPositions[animationStep];
      if (!marsPos) return;
      const mid = Cartesian3.midpoint(scPos, marsPos, new Cartesian3());
      // Both bodies in view: range adapts to the SC→Mars gap, floored so the
      // pair stays legible even when they're nearly docked.
      const dist = Math.max(Cartesian3.distance(scPos, marsPos) * 1.65, 2.8e10);
      viewer.camera.lookAt(mid, new HeadingPitchRange(0, CesiumMath.toRadians(-52), dist));
    } else {
      viewer.camera.lookAt(scPos, new HeadingPitchRange(0, CesiumMath.toRadians(-52), 2.2e10));
    }
    viewer.camera.lookAtTransform(Matrix4.IDENTITY);
  };

  // Extract current telemetry values based on animation step
  const currentHour = trajectoryData.steps[animationStep];
  const currentDay = Math.floor(currentHour / 24);
  
  const scPosNow = scPositionsAll[animationStep];
  const earthPosNow = earthPositions[animationStep];
  const marsPosNow = marsPositions[animationStep];

  const thrustVal = trajectoryData.thrust[animationStep];
  const ispVal = trajectoryData.isp[animationStep];
  const massVal = trajectoryData.mass[animationStep];
  const fuelRemaining = Math.max(0.0, massVal - 1648.0);
  const fuelPercentage = Math.max(0.0, (fuelRemaining / 1099.0) * 100);
  const isAnomalyActive = trajectoryData.anomaly[animationStep];
  const isCatastrophic = currentHour >= 1500;

  // Calculate distances relative to Mars, Earth, and Sun in kilometers
  const scPosKm = trajectoryData.sc_pos[animationStep];
  const marsPosKm = trajectoryData.mars_pos[animationStep];
  const earthPosKm = trajectoryData.earth_pos[animationStep];
  const sunDistKm = Math.sqrt(scPosKm[0]**2 + scPosKm[1]**2 + scPosKm[2]**2);
  const marsDistKm = Math.sqrt(
    (marsPosKm[0] - scPosKm[0])**2 + 
    (marsPosKm[1] - scPosKm[1])**2 + 
    (marsPosKm[2] - scPosKm[2])**2
  );
  const earthDistKm = Math.sqrt(
    (earthPosKm[0] - scPosKm[0])**2 + 
    (earthPosKm[1] - scPosKm[1])**2 + 
    (earthPosKm[2] - scPosKm[2])**2
  );

  // Exaggerated planetary radii (meters) so the bodies stay clearly visible at
  // heliocentric scale. Real radii are ~1000x smaller but would be sub-pixel at
  // the 10^11 m viewing distances used here. These match the original 3D design;
  // the earlier ArrayBuffer crash was caused by geodesic polyline interpolation
  // (now disabled via ArcType.NONE), not by these ellipsoids.
  const sunRadius = 1.4e10;
  const earthRadius = 6.5e9;
  const marsRadius = 5.5e9;

  const getSystemStatusLabel = () => {
    if (isCatastrophic) return "CATASTROPHIC DEGRADATION";
    if (isAnomalyActive) return "ANOMALOUS ACTIVITY";
    return "NOMINAL SYSTEM STABILITY";
  };

  const getIspColor = () => {
    if (isCatastrophic) return "text-red-400 bg-red-500/10 border-red-500/30";
    if (isAnomalyActive) return "text-amber-400 bg-amber-500/10 border-amber-500/30";
    return "text-[var(--ink)] bg-white/[0.04] border-[var(--hairline-strong)]";
  };

  const getIspBarColor = () => {
    if (isCatastrophic) return "bg-red-500 shadow-[0_0_10px_#ef4444]";
    if (isAnomalyActive) return "bg-amber-500 shadow-[0_0_10px_#f59e0b]";
    return "bg-[var(--ink)] shadow-[0_0_10px_var(--glow)]";
  };

  const getProgressBarWidth = () => {
    return 10 + getPercentForHour(currentHour) * 0.8;
  };

  const milestones = [
    { name: "Launch", hour: 0, label: "Launch (0h)", color: "emerald", style: { left: "10%" } },
    { name: "Decay", hour: 1000, label: "Decay (1000h)", color: "amber", style: { left: "30%" } },
    { name: "Anomaly", hour: 1497, label: "Anomaly (1497h)", color: "rose", style: { left: "50%" } },
    { name: "Failure", hour: 1500, label: "Failure (1500h)", color: "red", style: { left: "70%" } },
    { name: "Arrival", hour: 11040, label: "Arrival (11040h)", color: "violet", style: { left: "90%" } },
  ];

  // Mission phase chip shown in the header bar
  const getMissionPhase = () => {
    if (currentHour >= 11040) return "MARS INSERTION COMPLETE";
    if (currentHour >= 1500) return "DEGRADED CRUISE";
    if (currentHour >= 1497) return "ANOMALY WINDOW";
    if (currentHour >= 1000) return "THRUSTER DECAY";
    if (currentHour > 0) return "EARTH DEPARTURE";
    return "PRE-LAUNCH";
  };

  return (
    <ReactLenis ref={lenisRef} root options={{ lerp: 0.09, smoothWheel: true }}>
      {/* The standalone portfolio layout (hero, marquee, stats) only renders
          when Globe is mounted on its own. The research landing mounts it
          embedded inside its console section, where only the instrument
          (console-shell) should appear. */}
      {!embedded && (
        <>
      {/* HERO — portfolio "shutter kif." style landing, with a liquid
          Three.js wireframe blob behind the wordmark (HeroBlob) */}
      <section className="hero" ref={heroRef}>
        <HeroBlob />
        <div className="hero__stage" ref={stageRef}>
          <span className="hero__tag" aria-hidden="true">✕</span>
          <h1 className="hero__word">ARES</h1>
          <p className="hero__word hero__word--one" aria-hidden="true">1.</p>
          <span className="hero__mark" aria-hidden="true">✦</span>
        </div>

        {/* portfolio-style corner controls — anchored to the hero top-right,
            scroll away with it so they never cover the pinned console header */}
        <div className="ctl">
          <button className="ctl__b" aria-pressed={inverted} onClick={() => setInverted(!inverted)}>invert</button>
          <button className="ctl__b" aria-pressed={soundOn} onClick={toggleSound}>{soundOn ? "sound on" : "sound off"}</button>
        </div>

        <div className="hero__meta" ref={metaRef}>
          <span>PPO guidance &amp; trajectory scheduler</span>
          <span>Earth → Mars · 11,040 h · thruster decay simulation</span>
        </div>
        <span className="hero__scrolllabel">scroll</span>
        <button className="hero__cue" aria-label="Scroll to console" onClick={() => {
          // Scroll to the true document bottom (Lenis "bottom" = its limit),
          // not the console's pin position, so the at-bottom zoom policy
          // engages the moment the cue settles.
          lenisRef.current?.lenis?.scrollTo("bottom");
        }}><i /></button>
      </section>

      {/* MARQUEE — buttermax-style scrolling ticker */}
      <div className="marquee" aria-hidden="true">
        <div className="marquee__track">
          {[0, 1].map((k) => (
            <span className="marquee__group" key={k}>
              <b>PPO GUIDANCE</b><i>✕</i>
              <b>LOW-THRUST CRUISE</b><i>✕</i>
              <b>MARS TRANSFER</b><i>✕</i>
              <b>ISOLATION FOREST</b><i>✕</i>
              <b>ISP DECAY</b><i>✕</i>
              <b>11,040 HOURS</b><i>✕</i>
            </span>
          ))}
        </div>
      </div>

      {/* STATS — mission flight-profile strip: four events placed on a true
          0→11,040h scale. The anomaly (1,497h) sits 3h before the Isp failure
          lock (1,500h) — that gap is the whole story, and the scale shows it. */}
      <section className="stats" id="stats" ref={statsRef}>
        <div className="stats__head">
          <span className="stats__num">02</span>
          <span className="stats__title">mission flight profile</span>
        </div>

        <div className="profile">
          {/* scale rail: 0 … 11,040h with the mid-rail spanning the timeline */}
          <div className="profile__rail" aria-hidden="true">
            <span className="profile__zero">T+0000</span>
            <span className="profile__rail-ticks"><i /><i /><i /><i /><i /></span>
            <span className="profile__total" data-count="11040" data-decimals="0">11,040</span>
            <span className="profile__unit">H</span>
          </div>

          {/* events sit at their true fraction of 11,040h */}
          <div className="profile__track">
            {/* mission wave — a hairline sweeping left→right as it enters */}
            <i className="profile__sweep" aria-hidden="true" />

            <div className="profile__evt" data-t="T+0000" style={{ "--at": "0%" } as CSSProperties}>
              <span className="profile__dot" />
              <div className="profile__card">
                <span className="profile__t">burn start</span>
                <span className="profile__v">earth departure</span>
              </div>
            </div>

            <div className="profile__evt" data-t="H1497" style={{ "--at": "13.56%" } as CSSProperties}>
              <span className="profile__dot profile__dot--alarm" />
              <div className="profile__card">
                <span className="profile__t">hour 1,497</span>
                <span className="profile__v">anomaly flagged</span>
              </div>
            </div>

            <div className="profile__evt" data-t="H1500" style={{ "--at": "13.59%" } as CSSProperties}>
              <span className="profile__dot profile__dot--bad" />
              <div className="profile__card">
                <span className="profile__t">hour 1,500</span>
                <span className="profile__v">isp failure lock</span>
              </div>
            </div>

            <div className="profile__evt" data-t="T+11040" style={{ "--at": "100%" } as CSSProperties}>
              <span className="profile__dot" />
              <div className="profile__card">
                <span className="profile__t">hour 11,040</span>
                <span className="profile__v">mars arrival</span>
              </div>
            </div>
          </div>
        </div>

        {/* supporting numbers, left of the timeline */}
        <div className="stats__grid">
          <div className="stat">
            <span className="stat__v"><span data-count="54.7" data-decimals="1">54.7</span><span className="stat__u">M km</span></span>
            <span className="stat__k">earth → mars distance</span>
          </div>
          <div className="stat">
            <span className="stat__v"><span data-count="0.289" data-decimals="3">0.289</span><span className="stat__u">N</span></span>
            <span className="stat__k">max PPO thrust</span>
          </div>
          <div className="stat">
            <span className="stat__v"><span data-count="1782" data-decimals="0">1782</span><span className="stat__u">→ 1514.7 s</span></span>
            <span className="stat__k">specific impulse decay</span>
          </div>
          <div className="stat">
            <span className="stat__v"><span data-count="3" data-decimals="0">3</span><span className="stat__u">h</span></span>
            <span className="stat__k">warning → lock margin</span>
          </div>
        </div>
        <p className="stats__note">
          Autonomous guidance under thruster specific-impulse decay. The Isolation
          Forest flags the anomaly at hour 1,497, three hours before the 1,500h
          failure lock caps Isp for the rest of the cruise.
        </p>
        </section>
        </>
      )}

      {/* CONSOLE — pinned below the hero + stats */}
      <div className="console-shell" id="console" ref={consoleShellRef}>
        <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }} className="bg-black select-none text-slate-200">
      
      {/* 3D Cesium Canvas — at the bottom of the page (console pinned) the
          canvas takes over wheel input for camera zoom; while scrolling the
          page, wheel passes through to Lenis. data-lenis-prevent-wheel stops
          Lenis from double-scrolling once the canvas owns the wheel. */}
      <div style={{ position: "absolute", inset: 0 }} {...(atBottom ? { "data-lenis-prevent-wheel": "" } : {})}>
      <Viewer
        ref={viewerRef}
        full
        animation={false}
        timeline={false}
        geocoder={false}
        homeButton={false}
        infoBox={false}
        sceneModePicker={false}
        navigationHelpButton={false}
        baseLayerPicker={false}
      >
        {/* Orbit Polylines */}
        <Entity>
          <PolylineGraphics
            positions={earthPositions}
            width={1.5}
            material={Color.BLUE.withAlpha(0.25)}
            arcType={ArcType.NONE}
          />
        </Entity>
        <Entity>
          <PolylineGraphics
            positions={marsPositions}
            width={1.5}
            material={Color.RED.withAlpha(0.25)}
            arcType={ArcType.NONE}
          />
        </Entity>
        {/* SC Trajectory (progressive — grows with animation). A wide faint
            underlay gives the burn trail a neon glow; the crisp line sits on top. */}
        {scPositions.length >= 2 && (
          <Entity>
            <PolylineGraphics
              positions={scPositions}
              width={9}
              material={(isAnomalyActive ? Color.GOLDENROD : Color.CYAN).withAlpha(0.09)}
              arcType={ArcType.NONE}
            />
          </Entity>
        )}
        {scPositions.length >= 2 && (
          <Entity>
            <PolylineGraphics
              positions={scPositions}
              width={2.5}
              material={isAnomalyActive ? Color.GOLDENROD : Color.CYAN}
              arcType={ArcType.NONE}
            />
          </Entity>
        )}

        {/* Distance line: SC → Mars (dashed) */}
        {scToMarsLine.length === 2 && (
          <Entity>
            <PolylineGraphics
              positions={scToMarsLine}
              width={1}
              material={Color.RED.withAlpha(0.35)}
              arcType={ArcType.NONE}
            />
          </Entity>
        )}

        {/* Distance line: SC → Earth (dashed) */}
        {scToEarthLine.length === 2 && (
          <Entity>
            <PolylineGraphics
              positions={scToEarthLine}
              width={1}
              material={Color.DEEPSKYBLUE.withAlpha(0.2)}
              arcType={ArcType.NONE}
            />
          </Entity>
        )}

        {/* Celestial Body Entities — rendered as 3D spheres (ellipsoids) */}

        {/* Sun corona — additive glow sprite that pulses (see effect 1f) */}
        {GLOW_URL && (
          <Entity id="sun-glow" position={Cartesian3.ZERO}>
            <BillboardGraphics
              image={GLOW_URL}
              width={340}
              height={340}
              color={Color.WHITE.withAlpha(0.55)}
              disableDepthTestDistance={Number.POSITIVE_INFINITY}
            />
          </Entity>
        )}

        {/* Sun (Origin) */}
        <Entity id="sun" position={Cartesian3.ZERO} name="Sun">
          <EllipsoidGraphics
            radii={new Cartesian3(sunRadius, sunRadius, sunRadius)}
            material={Color.YELLOW}
            outline={true}
            outlineColor={Color.ORANGE.withAlpha(0.9)}
            outlineWidth={2}
          />
          <LabelGraphics 
            text="Sun" 
            font="11px monospace" 
            fillColor={Color.WHITE} 
            showBackground={true} 
            backgroundColor={Color.BLACK.withAlpha(0.65)} 
            pixelOffset={new Cartesian2(0, -30)} 
            disableDepthTestDistance={Number.POSITIVE_INFINITY}
          />
        </Entity>

        {/* Earth halo — soft additive glow hugging the planet */}
        {GLOW_URL && (
          <Entity id="earth-glow" position={earthPosNow}>
            <BillboardGraphics
              image={GLOW_URL}
              width={110}
              height={110}
              color={Color.DEEPSKYBLUE.withAlpha(0.35)}
              disableDepthTestDistance={Number.POSITIVE_INFINITY}
            />
          </Entity>
        )}

        {/* Earth — 3D sphere with distance readout */}
        <Entity id="earth" position={earthPosNow} name="Earth">
          <EllipsoidGraphics
            radii={new Cartesian3(earthRadius, earthRadius, earthRadius)}
            material={Color.DEEPSKYBLUE}
            outline={true}
            outlineColor={Color.WHITE.withAlpha(0.8)}
            outlineWidth={2}
          />
          <LabelGraphics 
            text={`Earth  ${earthDistKm < 1e6 ? (earthDistKm / 1e3).toFixed(0) + 'k km' : (earthDistKm / 1e6).toFixed(1) + 'M km'}`}
            font="11px monospace" 
            fillColor={Color.DEEPSKYBLUE} 
            showBackground={true} 
            backgroundColor={Color.BLACK.withAlpha(0.65)} 
            pixelOffset={new Cartesian2(0, -30)} 
            disableDepthTestDistance={Number.POSITIVE_INFINITY}
          />
        </Entity>

        {/* Mars halo — soft additive glow hugging the planet */}
        {GLOW_URL && (
          <Entity id="mars-glow" position={marsPosNow}>
            <BillboardGraphics
              image={GLOW_URL}
              width={110}
              height={110}
              color={Color.ORANGERED.withAlpha(0.32)}
              disableDepthTestDistance={Number.POSITIVE_INFINITY}
            />
          </Entity>
        )}

        {/* Mars — 3D sphere with distance readout */}
        <Entity id="mars" position={marsPosNow} name="Mars">
          <EllipsoidGraphics
            radii={new Cartesian3(marsRadius, marsRadius, marsRadius)}
            material={Color.ORANGERED}
            outline={true}
            outlineColor={Color.WHITE.withAlpha(0.8)}
            outlineWidth={2}
          />
          <LabelGraphics 
            text={`Mars  ${marsDistKm < 1e6 ? (marsDistKm / 1e3).toFixed(0) + 'k km' : (marsDistKm / 1e6).toFixed(1) + 'M km'}`}
            font="11px monospace" 
            fillColor={Color.ORANGERED} 
            showBackground={true} 
            backgroundColor={Color.BLACK.withAlpha(0.65)} 
            pixelOffset={new Cartesian2(0, -30)} 
            disableDepthTestDistance={Number.POSITIVE_INFINITY}
          />
        </Entity>

        {/* Spacecraft — glowing beacon marker (point-based, avoids external GLB
            dependency). A soft translucent halo sits behind a bright core so the
            craft stays legible at heliocentric scale. disableDepthTestDistance
            keeps it visible even while parked at the Earth/Mars sphere centers
            during departure/insertion. */}
        <Entity id="spacecraft" position={scPosNow} name="PPO Spacecraft">
          <PointGraphics
            pixelSize={isAnomalyActive ? 34 : 28}
            color={(isAnomalyActive ? Color.RED : Color.CYAN).withAlpha(0.18)}
            disableDepthTestDistance={Number.POSITIVE_INFINITY}
          />
          <PointGraphics
            pixelSize={isAnomalyActive ? 16 : 12}
            color={isAnomalyActive ? Color.RED : Color.CYAN}
            outlineColor={Color.WHITE}
            outlineWidth={2}
            disableDepthTestDistance={Number.POSITIVE_INFINITY}
          />
          <LabelGraphics 
            text="ARES-1" 
            font="10px monospace" 
            fillColor={isAnomalyActive ? Color.RED : Color.CYAN} 
            showBackground={true} 
            backgroundColor={Color.BLACK.withAlpha(0.65)} 
            pixelOffset={new Cartesian2(0, -22)} 
            disableDepthTestDistance={Number.POSITIVE_INFINITY}
          />
        </Entity>
      </Viewer>
      </div>

      {/* Top Header Bar — full-width, B&W */}
      <div className="absolute top-0 left-0 right-0 z-50 h-16 flex items-center justify-between px-5 backdrop-blur-xl"
           style={{
             background: "linear-gradient(180deg, var(--paper) 0%, var(--paper-2) 100%)",
             borderBottom: "1px solid var(--hairline)",
             boxShadow: "0 4px 30px rgba(0,0,0,0.55), 0 1px 0 var(--hairline)"
           }}>
        {/* Brand cluster */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[var(--ink)] text-[var(--paper)] flex items-center justify-center shadow-[0_0_18px_var(--glow)]">
            <span className="text-sm font-black font-mono tracking-tighter">A1</span>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full shadow-[0_0_10px_currentColor] transition-all duration-300 ${
                isCatastrophic ? "bg-red-500 text-red-500 animate-pulse" :
                isAnomalyActive ? "bg-amber-500 text-amber-500 animate-pulse" :
                "bg-emerald-500 text-emerald-500"
              }`}></span>
              <h1 className="text-[var(--ink)] text-sm font-bold tracking-wider font-sans leading-none uppercase">ARES-1 Flight Console</h1>
            </div>
            <span className="text-[9px] font-mono text-[var(--ink-dim)] mt-1 uppercase tracking-[0.2em]">PPO Guidance & Trajectory Scheduler</span>
          </div>
        </div>

        {/* Center status cluster */}
        <div className="hidden md:flex items-center gap-4">
          <div className="h-5 w-px bg-white/20"></div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-[var(--ink-faint)] uppercase">SYS STATUS:</span>
            <span className={`text-[10px] font-mono font-bold tracking-wide uppercase ${
              isCatastrophic ? "text-red-400" :
              isAnomalyActive ? "text-amber-400 animate-pulse" :
              "text-emerald-400"
            }`}>{getSystemStatusLabel()}</span>
          </div>
        </div>

        {/* Right cluster: invert/sound docked + mission phase + live badge */}
        <div className="flex items-center gap-3">
          <div className="ctl ctl--dock">
            <button className="ctl__b" aria-pressed={inverted} onClick={() => setInverted(!inverted)}>invert</button>
            <button className="ctl__b" aria-pressed={soundOn} onClick={toggleSound}>{soundOn ? "sound on" : "sound off"}</button>
          </div>
          <span className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[var(--hairline-strong)] bg-white/[0.04] text-[9px] font-mono font-bold tracking-widest text-[var(--ink-dim)] uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--ink)] animate-pulse"></span>
            {getMissionPhase()}
          </span>
          <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[9px] font-mono font-bold tracking-widest uppercase ${
            isCatastrophic
              ? "border-red-500/30 bg-red-500/10 text-red-400"
              : isAnomalyActive
                ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isCatastrophic || isAnomalyActive ? "bg-current animate-ping" : "bg-current"}`}></span>
            {isAnimating ? "LIVE TELEMETRY" : "TELEMETRY STANDBY"}
          </span>
        </div>
      </div>

      {/* LEFT SIDE PANEL: Telemetry Hub — B&W */}
      <div className="absolute top-[4.5rem] left-4 w-[380px] z-40 flex flex-col rounded-2xl overflow-hidden"
           style={{
             maxHeight: "calc(100vh - 12rem)",
             background: "linear-gradient(135deg, var(--paper) 0%, var(--paper-2) 100%)",
             backdropFilter: "blur(24px)",
             border: "1px solid var(--hairline)",
             borderTop: isCatastrophic 
               ? "2px solid rgba(239,68,68,0.8)" 
               : isAnomalyActive 
                 ? "2px solid rgba(245,158,11,0.8)"
                 : "2px solid var(--ink)",
             boxShadow: "0 25px 60px rgba(0,0,0,0.7)"
           }}>
        
        {/* Hub Header */}
        <div className="p-5 border-b border-[var(--hairline)] shrink-0 flex items-center justify-between">
          <div>
            <span className="uppercase tracking-[0.2em] text-[9px] font-bold text-[var(--ink)] font-mono">Flight Metrics</span>
            <h2 className="text-base font-medium tracking-tight mt-0.5 text-[var(--ink)]">System Diagnostics</h2>
          </div>
          <Activity size={16} className={isAnomalyActive ? "text-amber-500 animate-pulse" : "text-[var(--ink)]"} />
        </div>

        {/* Telemetry Scrollable Content */}
        <div data-lenis-prevent className="overflow-y-auto p-5 space-y-6 scrollbar-thin scrollbar-thumb-neutral-700 scrollbar-track-transparent">
          
          {/* Mission Elapsed Time */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-mono text-[var(--ink-faint)] uppercase tracking-wider block">Mission Elapsed Time</span>
            <div className="p-4 rounded-xl bg-white/[0.04] border border-[var(--hairline)] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock size={16} className="text-[var(--ink)]" />
                <span className="text-base font-bold font-mono text-[var(--ink)] tracking-wide">
                  Day {currentDay.toString().padStart(3, '0')} / Hr {currentHour.toString().padStart(5, '0')}
                </span>
              </div>
              <span className="text-[9px] font-mono text-[var(--ink-dim)] bg-[var(--paper-3)] px-2 py-0.5 rounded border border-[var(--hairline)]">
                {isAnimating ? "PLAYING" : animationStep === 0 ? "READY · PRESS PLAY" : "PAUSED"}
              </span>
            </div>
          </div>

          {/* Engine Parameters: Isp & Fuel */}
          <div className="space-y-4">
            <span className="text-[10px] font-mono text-[var(--ink-faint)] uppercase tracking-wider block">Engine Diagnostic State</span>
            
            {/* Specific Impulse Progress */}
            <div className="p-4 rounded-xl bg-white/[0.04] border border-[var(--hairline)] space-y-3">
              <div className="flex justify-between items-center text-xs">
                <div className="flex items-center gap-2">
                  <Gauge size={14} className="text-[var(--ink-dim)]" />
                  <span className="text-slate-300 font-medium">Specific Impulse (Isp)</span>
                </div>
                <span className="font-mono text-[var(--ink)] font-bold">{ispVal.toFixed(1)} s</span>
              </div>
              <div className="w-full h-2 bg-[var(--paper-3)] rounded-full overflow-hidden border border-[var(--hairline)]">
                <div 
                  className={`h-full transition-all duration-300 ${getIspBarColor()}`}
                  style={{ width: `${((ispVal - 1514.7) / (1782 - 1514.7)) * 100}%` }}
                ></div>
              </div>
              <div className="flex justify-between items-center text-[9px] font-mono text-[var(--ink-faint)] pt-0.5">
                <span>Failed Limit: 1514.7s</span>
                <span className="px-1.5 py-0.5 rounded bg-[var(--paper-3)] border border-[var(--hairline)] text-[8px]">
                  {isCatastrophic ? "FAIL LOCK" : isAnomalyActive ? "DECAY ACTIVE" : "NOMINAL"}
                </span>
                <span>Nominal Capacity: 1782.0s</span>
              </div>
            </div>

            {/* Propellant Mass Level Indicator with SVG Fuel Tank visual */}
            <div className="p-4 rounded-xl bg-white/[0.04] border border-[var(--hairline)] space-y-4">
              <div className="flex justify-between items-center text-xs">
                <div className="flex items-center gap-2">
                  <Fuel size={14} className="text-emerald-400" />
                  <span className="text-slate-300 font-medium">Propellant Mass</span>
                </div>
                <span className="font-mono text-emerald-400 font-bold">{fuelRemaining.toFixed(1)} kg / 1099.0 kg</span>
              </div>
              
              <div className="flex gap-4 items-center">
                {/* SVG Fuel Tank */}
                <div className="w-10 h-16 shrink-0 relative flex items-center justify-center bg-[var(--paper-3)] border border-[var(--hairline)] rounded-lg overflow-hidden">
                  <div 
                    className="absolute bottom-0 w-full bg-gradient-to-t from-emerald-600 to-emerald-400 opacity-80 transition-all duration-500"
                    style={{ height: `${fuelPercentage}%` }}
                  >
                    <div className="absolute top-0 w-full h-1 bg-white/40 animate-pulse"></div>
                  </div>
                  <span className="absolute z-10 text-[9px] font-mono font-bold text-white shadow-sm">{fuelPercentage.toFixed(0)}%</span>
                </div>
                
                <div className="flex-1 space-y-2">
                  <div className="w-full h-2 bg-[var(--paper-3)] rounded-full overflow-hidden border border-[var(--hairline)]">
                    <div 
                      className="h-full bg-emerald-500 shadow-[0_0_10px_#10b981] transition-all duration-300"
                      style={{ width: `${fuelPercentage}%` }}
                    ></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[9px] font-mono text-[var(--ink-faint)]">
                    <div>
                      <span>Dry Mass:</span>
                      <span className="text-slate-300 block">1648.0 kg</span>
                    </div>
                    <div>
                      <span>Total Mass:</span>
                      <span className="text-slate-300 block">{massVal.toFixed(1)} kg</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Thrust Level Card */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-mono text-[var(--ink-faint)] uppercase tracking-wider block">Engine Control Command</span>
            <div className="p-4 rounded-xl bg-white/[0.04] border border-[var(--hairline)] space-y-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${thrustVal > 0.005 ? "bg-amber-500 animate-ping" : "bg-slate-700"}`}></span>
                  <span className="text-xs text-slate-300 font-medium">Thrust Engine state</span>
                </div>
                <span className="text-xs font-mono font-bold text-[var(--ink)]">
                  {((thrustVal / 0.289) * 100).toFixed(1)}% ({thrustVal.toFixed(3)} N)
                </span>
              </div>
              <div className="w-full h-1.5 bg-[var(--paper-3)] rounded-full overflow-hidden border border-[var(--hairline)]">
                <div 
                  className="h-full bg-[var(--ink)] transition-all duration-300"
                  style={{ width: `${(thrustVal / 0.289) * 100}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-[9px] font-mono text-[var(--ink-faint)]">
                <span>0.000 N (Ballistic Coasting)</span>
                <span className="text-[var(--ink)] font-bold uppercase">{thrustVal > 0.005 ? "Engaged PPO Burn" : "Coasting"}</span>
                <span>0.289 N (Max Capacity)</span>
              </div>
            </div>
          </div>

          {/* Planetary Distance Stats */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-mono text-[var(--ink-faint)] uppercase tracking-wider block">Astrodynamic Positions</span>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl bg-white/[0.04] border border-[var(--hairline)] text-center">
                <div className="text-[9px] uppercase tracking-wider text-[var(--ink-faint)] font-bold font-mono">Distance to Mars</div>
                <div className="text-sm font-bold text-red-400 mt-1 font-mono">{(marsDistKm / 1e6).toFixed(2)}M km</div>
              </div>
              <div className="p-3.5 rounded-xl bg-white/[0.04] border border-[var(--hairline)] text-center">
                <div className="text-[9px] uppercase tracking-wider text-[var(--ink-faint)] font-bold font-mono">Distance to Sun</div>
                <div className="text-sm font-bold text-amber-400 mt-1 font-mono">{(sunDistKm / 1e6).toFixed(2)}M km</div>
              </div>
            </div>
          </div>

          {/* System Health Check grid */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-mono text-[var(--ink-faint)] uppercase tracking-wider block">Subsystem Verification Matrix</span>
            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
              <div className="p-2.5 rounded-lg bg-white/[0.04] border border-[var(--hairline)] flex items-center justify-between">
                <span className="text-[var(--ink-dim)]">AI Guidance:</span>
                <span className={`font-bold ${isCatastrophic ? "text-amber-400" : "text-emerald-400"}`}>
                  {isCatastrophic ? "RE-ROUTING" : "ACTIVE"}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-white/[0.04] border border-[var(--hairline)] flex items-center justify-between">
                <span className="text-[var(--ink-dim)]">Propellant:</span>
                <span className="text-emerald-400 font-bold">NOMINAL</span>
              </div>
              <div className="p-2.5 rounded-lg bg-white/[0.04] border border-[var(--hairline)] flex items-center justify-between">
                <span className="text-[var(--ink-dim)]">Thruster Isp:</span>
                <span className={`font-bold ${isCatastrophic ? "text-red-400" : isAnomalyActive ? "text-amber-400" : "text-emerald-400"}`}>
                  {isCatastrophic ? "DEGRADED" : isAnomalyActive ? "DECAY" : "NOMINAL"}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-white/[0.04] border border-[var(--hairline)] flex items-center justify-between">
                <span className="text-[var(--ink-dim)]">Anomaly Det:</span>
                <span className={`font-bold ${isAnomalyActive ? "text-red-400" : "text-emerald-400"}`}>
                  {isAnomalyActive ? "FLAGGED" : "NOMINAL"}
                </span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* RIGHT SIDE PANEL: Live Guidance Logs & Scientific Plots — B&W */}
      <div className="absolute top-[4.5rem] right-4 w-[440px] z-40 flex flex-col rounded-2xl overflow-hidden"
           style={{
             maxHeight: "calc(100vh - 12rem)",
             background: "linear-gradient(135deg, var(--paper) 0%, var(--paper-2) 100%)",
             backdropFilter: "blur(24px)",
             border: "1px solid var(--hairline)",
             borderTop: "2px solid var(--ink)",
             boxShadow: "-10px 25px 60px rgba(0,0,0,0.7)"
           }}>
        
        {/* Tab Controls Selector */}
        <div className="bg-[var(--paper-2)] p-2 shrink-0 border-b border-[var(--hairline)] flex items-center justify-between">
          <div className="flex gap-1.5 w-full">
            <button
              onClick={() => setActiveRightTab("console")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-mono font-bold tracking-wide uppercase transition-all ${
                activeRightTab === "console" 
                  ? "bg-[var(--ink)] text-[var(--paper)] border border-transparent" 
                  : "text-[var(--ink-dim)] hover:text-[var(--ink)] border border-transparent hover:bg-white/[0.04]"
              }`}
            >
              <Terminal size={12} />
              Console
            </button>
            <button
              onClick={() => setActiveRightTab("trajectory")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-mono font-bold tracking-wide uppercase transition-all ${
                activeRightTab === "trajectory" 
                  ? "bg-[var(--ink)] text-[var(--paper)] border border-transparent" 
                  : "text-[var(--ink-dim)] hover:text-[var(--ink)] border border-transparent hover:bg-white/[0.04]"
              }`}
            >
              <Image size={12} />
              Orbit
            </button>
            <button
              onClick={() => setActiveRightTab("isp")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-mono font-bold tracking-wide uppercase transition-all ${
                activeRightTab === "isp" 
                  ? "bg-[var(--ink)] text-[var(--paper)] border border-transparent" 
                  : "text-[var(--ink-dim)] hover:text-[var(--ink)] border border-transparent hover:bg-white/[0.04]"
              }`}
            >
              <Image size={12} />
              Isp
            </button>
            <button
              onClick={() => setActiveRightTab("thrust")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-mono font-bold tracking-wide uppercase transition-all ${
                activeRightTab === "thrust" 
                  ? "bg-[var(--ink)] text-[var(--paper)] border border-transparent" 
                  : "text-[var(--ink-dim)] hover:text-[var(--ink)] border border-transparent hover:bg-white/[0.04]"
              }`}
            >
              <Image size={12} />
              Thrust
            </button>
          </div>
        </div>

        {/* Tab Contents */}
        <div data-lenis-prevent className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent flex flex-col justify-between" style={{ minHeight: "260px" }}>
          
          {/* TAB 1: Live Terminal Log */}
          {activeRightTab === "console" && (
            <div className="flex flex-col flex-1 h-full min-h-0 justify-between">
              <div className="flex items-center gap-2 pb-2 shrink-0 border-b border-white/5 mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--ink)] animate-pulse shadow-[0_0_6px_var(--glow)]"></span>
                <span className="text-[10px] font-mono uppercase text-[var(--ink-dim)] font-bold">PPO Guidance Neural Network Log</span>
              </div>
              <div data-lenis-prevent className="flex-1 overflow-y-auto font-mono text-[10px] text-slate-300 space-y-2.5 leading-relaxed pr-1 max-h-[380px] scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                {logs.map((log, idx) => (
                  <div key={idx} className="border-l-2 border-white/5 pl-2">
                    {log.includes('🚀') || log.includes('🎯') ? (
                      <span className="text-[var(--ink)] font-semibold">{log}</span>
                    ) : log.includes('⚠️') ? (
                      <span className="text-amber-400 font-semibold">{log}</span>
                    ) : log.includes('🚨') || log.includes('💥') ? (
                      <span className="text-red-400 font-bold">{log}</span>
                    ) : log.includes('⚡') ? (
                      <span className="text-amber-300">{log}</span>
                    ) : (
                      <span>{log}</span>
                    )}
                  </div>
                ))}
                <div ref={consoleEndRef} />
              </div>
            </div>
          )}

          {/* TAB 2: Trajectory Image */}
          {activeRightTab === "trajectory" && (
            <div className="orbit-figure space-y-3">
              <div className="flex items-start justify-between gap-3 pb-2 border-b border-[var(--hairline)]">
                <div>
                  <span className="block text-[10px] font-mono uppercase text-[var(--ink)] font-bold tracking-wide">Paper Figure · heliocentric transfer</span>
                  <span className="block mt-1 text-[9px] font-mono text-[var(--ink-faint)]">Fig. 01 / top view · not to scale</span>
                </div>
                <button
                  onClick={() => setZoomPlot(pub("/figures/3d_heliocentric_trajectory.png"))}
                  className="shrink-0 p-1 hover:bg-[var(--paper-3)] rounded text-[var(--ink)] flex items-center gap-1 text-[9px] font-mono uppercase border border-[var(--hairline-strong)]"
                  aria-label="Zoom heliocentric transfer figure"
                >
                  <Maximize2 size={10} />
                  Zoom
                </button>
              </div>
              <figure className="relative rounded-lg overflow-hidden border border-[var(--hairline)] bg-[var(--paper-3)]">
                <img
                  src={pub("/figures/3d_heliocentric_trajectory.png")}
                  alt="Heliocentric transfer from Earth's orbit around the Sun to Mars's orbit"
                  className="w-full h-auto object-contain"
                />
                <figcaption className="orbit-figure__legend" aria-label="Figure legend">
                  <span><i className="orbit-figure__swatch orbit-figure__swatch--earth" />Earth orbit</span>
                  <span><i className="orbit-figure__swatch orbit-figure__swatch--mars" />Mars orbit</span>
                  <span><i className="orbit-figure__swatch orbit-figure__swatch--transfer" />ARES-1 transfer</span>
                </figcaption>
              </figure>
              <div className="grid grid-cols-3 gap-2 text-[9px] font-mono uppercase tracking-wide">
                <div className="border-l-2 border-cyan-400 pl-2"><span className="block text-[var(--ink-faint)]">Origin</span><strong className="text-[var(--ink)]">Earth orbit</strong></div>
                <div className="border-l-2 border-cyan-400 pl-2"><span className="block text-[var(--ink-faint)]">Transfer</span><strong className="text-[var(--ink)]">PPO path</strong></div>
                <div className="border-l-2 border-red-400 pl-2"><span className="block text-[var(--ink-faint)]">Target</span><strong className="text-[var(--ink)]">Mars orbit</strong></div>
              </div>
              <p className="text-[10.5px] text-[var(--ink-dim)] font-sans leading-relaxed">
                Heliocentric top view: the blue and red ellipses are the reference orbits; the cyan curve is the spacecraft transfer path from Earth toward Mars. Distances and body sizes are intentionally exaggerated for legibility.
              </p>
            </div>
          )}

          {/* TAB 3: Isp Image */}
          {activeRightTab === "isp" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-white/5">
                <span className="text-[10px] font-mono uppercase text-slate-400 font-bold">Paper Figure: Specific Impulse decay</span>
                <button 
                  onClick={() => setZoomPlot(pub("/figures/isp_degradation_anomaly_detection.png"))}
                  className="p-1 hover:bg-white/5 rounded text-[var(--ink)] flex items-center gap-1 text-[9px] font-mono uppercase border border-[var(--hairline-strong)]"
                >
                  <Maximize2 size={10} />
                  Zoom
                </button>
              </div>
              <div className="relative group cursor-zoom-in rounded-lg overflow-hidden border border-white/10"
                   onClick={() => setZoomPlot(pub("/figures/isp_degradation_anomaly_detection.png"))}>
                <img 
                  src={pub("/figures/isp_degradation_anomaly_detection.png")}
                  alt="Isp degradation curves" 
                  className="w-full h-auto object-cover group-hover:scale-[1.02] transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-200">
                  <span className="text-xs font-mono font-bold text-white bg-slate-950/80 px-3 py-1.5 rounded-lg border border-white/10">Click to expand analysis</span>
                </div>
              </div>
              <p className="text-[10.5px] text-slate-400 font-sans leading-relaxed">
                **Mathematical Summary**: Specific impulse decays logarithmically starting at Hour 1,000. Anomaly flagged by Isolation Forest at Hour 1,497 (I_sp ≈ 1514.96s) prior to hitting the catastrophic failure limit at Hour 1,500 (1514.7s).
              </p>
            </div>
          )}

          {/* TAB 4: Thrust & Propellant */}
          {activeRightTab === "thrust" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-white/5">
                <span className="text-[10px] font-mono uppercase text-slate-400 font-bold">Paper Figure: Thrust and propellant conservation</span>
                <button 
                  onClick={() => setZoomPlot(pub("/figures/thrust_magnitude_propellant.png"))}
                  className="p-1 hover:bg-white/5 rounded text-[var(--ink)] flex items-center gap-1 text-[9px] font-mono uppercase border border-[var(--hairline-strong)]"
                >
                  <Maximize2 size={10} />
                  Zoom
                </button>
              </div>
              <div className="relative group cursor-zoom-in rounded-lg overflow-hidden border border-white/10"
                   onClick={() => setZoomPlot(pub("/figures/thrust_magnitude_propellant.png"))}>
                <img 
                  src={pub("/figures/thrust_magnitude_propellant.png")}
                  alt="Thrust Command vs Propellant Conservation" 
                  className="w-full h-auto object-cover group-hover:scale-[1.02] transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-200">
                  <span className="text-xs font-mono font-bold text-white bg-slate-950/80 px-3 py-1.5 rounded-lg border border-white/10">Click to expand analysis</span>
                </div>
              </div>
              <p className="text-[10.5px] text-slate-400 font-sans leading-relaxed">
                **Mathematical Summary**: Displays PPO thrust execution commands (limited to 0.289 N) alongside propellant conservation. High thrust commands occur early, transitioning to extended coasting to conserve fuel for final orbital insertion.
              </p>
            </div>
          )}

        </div>
      </div>

      {/* Guide Box (Floating Bottom Left) */}
      {showGuide && (
        <div 
          onClick={() => setShowGuide(false)}
          className="absolute bottom-28 left-6 z-40 px-5 py-4 rounded-xl max-w-[320px] shadow-2xl cursor-pointer transition-colors text-[var(--ink)] text-xs"
          style={{
            background: "linear-gradient(135deg, var(--paper) 0%, var(--paper-2) 100%)",
            backdropFilter: "blur(20px)",
            border: "1px solid var(--hairline)",
            boxShadow: "0 20px 50px rgba(0,0,0,0.7)"
          }}
        >
          <div className="text-xs font-bold font-mono tracking-wider mb-1.5 text-[var(--ink)] flex items-center gap-1.5">
            <HelpCircle size={14} />
            Heliocentric Navigation Map
          </div>
          <div className="text-[var(--ink-dim)] font-mono text-[10px] leading-relaxed space-y-1">
            <p>• <span className="text-yellow-400 font-bold">Yellow Center</span>: Sun (Barycentric origin)</p>
            <p>• <span className="text-cyan-400 font-bold">Blue Track</span>: Earth Orbital Ellipse</p>
            <p>• <span className="text-red-400 font-bold">Red Track</span>: Mars Orbital Ellipse</p>
            <p>• <span className="text-indigo-400 font-bold">Cyan Line</span>: Spacecraft Trajectory (turns gold during thruster degradation)</p>
            <p className="mt-2 text-[var(--ink)] font-bold">Start with Play, then scrub to 1497h to inspect the warning window.</p>
          </div>
          <div className="text-[var(--ink-faint)] text-[9px] font-mono mt-2.5 text-right">Click to dismiss guide</div>
        </div>
      )}

      {/* BOTTOM CENTER CONTROLS: Timeline & Playback Panel — B&W */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-3.5 p-5 rounded-2xl min-w-[620px] max-w-[90vw]"
           style={{
             background: "linear-gradient(135deg, var(--paper) 0%, var(--paper-2) 100%)",
             backdropFilter: "blur(20px)",
             border: "1px solid var(--hairline)",
             boxShadow: "0 20px 50px rgba(0,0,0,0.7)"
           }}>
        
        {/* Clickable Event Milestone Timeline Checkpoints */}
        <div className="relative w-full h-8 flex items-center px-4">
          {/* Background Track Line */}
          <div className="absolute left-4 right-4 h-[3px] bg-[var(--paper-3)] rounded-full border border-[var(--hairline)]"></div>
          
          {/* Active Gradient Progress Track */}
          <div 
            className="absolute left-4 h-[3px] bg-[var(--ink)] rounded-full shadow-[0_0_8px_var(--glow)] transition-all duration-300"
            style={{ width: `${getProgressBarWidth()}%` }}
          ></div>
          
          {/* Render Milestones */}
          {milestones.map((m, idx) => {
            const index = getStepIndexForHour(m.hour);
            const isReached = animationStep >= index;
            let btnColor = "bg-[var(--paper-3)] hover:bg-[var(--paper-2)]";
            if (isReached) {
              if (m.color === "emerald") btnColor = "bg-emerald-500 shadow-[0_0_8px_#10b981]";
              else if (m.color === "amber") btnColor = "bg-amber-500 shadow-[0_0_8px_#f59e0b]";
              else if (m.color === "rose") btnColor = "bg-rose-500 shadow-[0_0_8px_#f43f5e]";
              else if (m.color === "red") btnColor = "bg-red-500 shadow-[0_0_8px_#ef4444]";
              else if (m.color === "violet") btnColor = "bg-[var(--ink)] shadow-[0_0_8px_var(--glow)]";
            }
            return (
              <button 
                key={idx}
                onClick={() => { 
                  setAnimationStep(index); 
                  setIsAnimating(false); // Pause playback on jump
                }}
                className="absolute flex flex-col-reverse items-center -translate-x-1/2 group"
                style={m.style}
              >
                <span className={`w-3 h-3 rounded-full border border-white/20 transition-all duration-300 ${btnColor}`}></span>
                <span className="text-[8px] text-slate-400 group-hover:text-[var(--ink)] mb-1.5 font-mono tracking-wide transition-colors uppercase">
                  {m.name}
                </span>
              </button>
            );
          })}
        </div>

        {/* Playback Range Scrubber */}
        <div className="w-full flex items-center justify-between gap-4 mt-1">
          <input
            type="range"
            min={0}
            max={100}
            step={0.1}
            value={getPercentForHour(currentHour)}
            onChange={(e) => {
              const pct = parseFloat(e.target.value);
              const targetHour = getHourForPercent(pct);
              const targetStep = getStepIndexForHour(targetHour);
              setAnimationStep(targetStep);
              setIsAnimating(false); // Pause on scrub
            }}
            className="flex-1 h-1.5 bg-[var(--paper-3)] rounded-lg appearance-none cursor-pointer accent-[var(--ink)] focus:outline-none"
          />
          <span className="text-xs font-mono text-[var(--ink)] px-3 py-1 rounded-lg min-w-[140px] text-center shadow-inner border border-[var(--hairline)] bg-[var(--paper-3)]">
            Day {currentDay.toString().padStart(3, '0')} / Hr {currentHour.toString().padStart(5, '0')}
          </span>
        </div>

        {/* Buttons and Multiplier Controls Row */}
        <div className="w-full flex items-center justify-between mt-1">
          
          {/* Play/Pause & Reset */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setAnimationStep(0);
                setIsAnimating(false);
              }}
              className="p-2 bg-[var(--paper-3)] border border-[var(--hairline)] hover:border-[var(--hairline-strong)] hover:bg-[var(--paper-2)] rounded-lg transition-all text-[var(--ink-dim)] hover:text-[var(--ink)] flex items-center justify-center"
              title="Reset flight timeline"
              aria-label="Reset flight timeline"
            >
              <RotateCcw size={14} />
            </button>
            <button
              onClick={() => {
                const next = !isAnimating;
                setIsAnimating(next);
                if (next) {
                  const wasTracking = trackSC;
                  setTrackSC(true);  // auto-lock SC on play
                  setTrackBody(null);  // stop following any single planet
                  // Frame the SC→Mars pair once when tracking first engages
                  // (not on a plain pause→resume of an existing session).
                  if (!wasTracking) frameSC(true);
                }
              }}
              className={`p-2 px-3.5 rounded-lg transition-all font-semibold flex items-center gap-1.5 text-xs ${
                isAnimating 
                  ? "bg-amber-600 shadow-lg shadow-amber-500/10 hover:bg-amber-500 border border-amber-500/20 text-white" 
                  : "bg-[var(--ink)] text-[var(--paper)] shadow-lg hover:opacity-80 border border-transparent"
              }`}
              title={isAnimating ? "Pause simulation" : "Start simulation"}
              aria-label={isAnimating ? "Pause simulation" : "Start simulation"}
            >
              {isAnimating ? <Pause size={14} /> : <Play size={14} />}
              <span>{isAnimating ? "Pause" : "Play"}</span>
            </button>
          </div>

          {/* Playback Speed Multiplier selector */}
          <div className="flex items-center gap-1 bg-[var(--paper-3)] p-0.5 rounded-lg border border-[var(--hairline)]">
            {[1, 2, 5, 10, 20].map((s) => (
              <button
                key={s}
                onClick={() => setPlaybackSpeed(s)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-mono font-bold transition-all ${
                  playbackSpeed === s 
                    ? "bg-[var(--ink)] text-[var(--paper)] border border-transparent" 
                    : "text-[var(--ink-faint)] hover:text-[var(--ink-dim)]"
                }`}
              >
                {s}x
              </button>
            ))}
          </div>

          {/* Camera Focus Controls */}
          <div className="flex items-center gap-1 bg-[var(--paper-3)] p-0.5 rounded-lg border border-[var(--hairline)]">
            <button
              onClick={focusSun}
              className="px-2 py-1.5 rounded-md text-[9px] font-mono font-bold text-[var(--ink-faint)] hover:text-[var(--ink)] flex items-center gap-1 transition-all"
              title="Focus Sun Viewport"
            >
              <Compass size={11} />
              SUN
            </button>
            <button
              onClick={focusEarth}
              className={`px-2 py-1.5 rounded-md text-[9px] font-mono font-bold flex items-center gap-1 transition-all ${
                trackBody === "earth"
                  ? "bg-[var(--ink)] text-[var(--paper)] border border-transparent"                  : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                }`}
              title="Track Earth — camera follows it as the simulation advances"
            >
              <Compass size={11} />
              EARTH
            </button>
            <button
              onClick={focusMars}
              className={`px-2 py-1.5 rounded-md text-[9px] font-mono font-bold flex items-center gap-1 transition-all ${
                trackBody === "mars"
                  ? "bg-[var(--ink)] text-[var(--paper)] border border-transparent"                  : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                }`}
              title="Track Mars — camera follows it as the simulation advances"
            >
              <Compass size={11} />
              MARS
            </button>
            <div className="w-px h-3.5 bg-white/20 mx-1"></div>
            <button
              onClick={() => {
                const next = !trackSC;
                setTrackSC(next);
                setTrackBody(null);
                ensureZoomEnabled();
                if (next) frameSC();
              }}
              className={`px-2 py-1.5 rounded-md text-[9px] font-mono font-bold flex items-center gap-1 transition-all ${
                trackSC 
                  ? "bg-[var(--ink)] text-[var(--paper)] border border-transparent"                  : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                }`}
              title="Track Spacecraft Viewport — during playback, frames the spacecraft and Mars together"
            >
              <Crosshair size={11} className={trackSC ? "animate-spin" : ""} style={{ animationDuration: "5s" }} />
              LOCK SC
            </button>
          </div>

        </div>

      </div>

      {/* PRO MAX ZOOM MODAL FOR RESEARCH PLOTS */}
      {zoomPlot && (
        <div 
          onClick={() => setZoomPlot(null)}
          className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-8 cursor-zoom-out animate-fade-in"
        >
          <div 
            className="relative max-w-5xl w-full rounded-3xl overflow-hidden shadow-2xl p-6 animate-scale-up"
            style={{
              background: "linear-gradient(135deg, var(--paper) 0%, var(--paper-2) 100%)",
              border: "1px solid var(--hairline-strong)",
              boxShadow: "0 30px 80px rgba(0,0,0,0.8)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center pb-4 border-b border-[var(--hairline)] mb-4">
              <div className="flex items-center gap-2 text-[var(--ink)]">
                <Image size={18} />
                <span className="text-sm font-mono font-bold uppercase tracking-wider">
                  {zoomPlot.includes('trajectory') ? "Trajectory Plot (Fig. 1)" :
                   zoomPlot.includes('isp') ? "Specific Impulse Decay Curve (Fig. 2)" :
                   "Thrust Magnitude & Fuel Curve (Fig. 3)"}
                </span>
              </div>
              <button 
                onClick={() => setZoomPlot(null)}
                className="p-2 bg-[var(--paper-3)] border border-[var(--hairline)] hover:border-[var(--hairline-strong)] rounded-xl text-[var(--ink-dim)] hover:text-[var(--ink)]"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="w-full flex flex-col md:flex-row gap-6 items-start">
              <div className="flex-1 bg-black p-2 rounded-2xl border border-[var(--hairline)]">
                <img 
                  src={zoomPlot} 
                  alt="Zoomed Reference Chart" 
                  className="w-full h-auto object-contain rounded-xl max-h-[70vh]"
                />
              </div>
              <div className="w-full md:w-80 shrink-0 space-y-4">
                <h4 className="text-xs font-mono font-bold text-[var(--ink-dim)] uppercase tracking-widest border-b border-[var(--hairline)] pb-1">
                  Academic Summary
                </h4>
                <div className="text-xs text-slate-300 leading-relaxed font-sans space-y-3">
                  {zoomPlot.includes('trajectory') ? (
                    <>
                      <p>
                        This heliocentric plot tracks Earth orbital trajectory (a = 1.0 AU) and Mars target capture trajectory (a ≈ 1.52 AU).
                      </p>
                      <p>
                        The solid cyan line shows the actual PPO guidance path. Initial orbit matching is achieved via low thrust arcs to align phase angles before degradation starts.
                      </p>
                    </>
                  ) : zoomPlot.includes('isp') ? (
                    <>
                      <p>
                        Reconstructs specific impulse (I_sp) degradation. The curve shows flat nominal capacity (1782.0s) until degradation begins at Hour 1,000.
                      </p>
                      <p>
                        The decay is modeled logarithmically down to the 1514.7s failure limit. The Isolation Forest flags anomalous thruster activity at Hour 1,497, 3 hours before catastrophic failure locks specific impulse permanently.
                      </p>
                    </>
                  ) : (
                    <>
                      <p>
                        Correlates thrust commands (left scale, N) with propellant mass consumption (right scale, kg).
                      </p>
                      <p>
                        The PPO controller alternates between high-frequency burns and prolonged coasting. Despite thruster decay, the reinforcement learning agent conserves fuel to ensure sufficient propellant remains for the critical Mars insertion burn.
                      </p>
                    </>
                  )}
                </div>
                
                <div className="p-4 rounded-xl bg-[var(--paper-3)] border border-[var(--hairline)] font-mono text-[9.5px] text-[var(--ink-dim)] leading-normal space-y-1">
                  <div><strong>Project</strong>: ARES-1 (PPO Guidance Console)</div>
                  <div><strong>Context</strong>: Autonomous Guidance Optimization</div>
                  <div><strong>Format</strong>: Publication Figure (.png/.pdf)</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

        </div>

        {/* Scroll progress rail — index + hairline fill (portfolio-style).
            Lives inside the shell so it only ever floats over the console,
            never the research landing above it. */}
        <div className="rail" aria-hidden="true">
          <div className="rail__track">
            <div className="rail__fill" style={{ height: `${Math.round(scrollPct * 100)}%` }} />
          </div>
          <div className="rail__idx">{String(sectionIdx).padStart(2, "0")}<i>/03</i></div>
        </div>
      </div>

      {/* cursor light — soft glow trailing the pointer (difference blend) */}
      <div className="cursor-light" ref={cursorRef} aria-hidden="true" />

      <BootScreen done={!showBoot} />
      <audio ref={audioRef} src={pub("/audio/theme.mp3")} loop preload="auto" playsInline muted />
    </ReactLenis>
  );
}

// Simple missing X icon component since it wasn't imported from lucide-react in previous versions
function X(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}