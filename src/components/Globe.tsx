"use client";

import { useState, useEffect, useRef } from "react";
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
} from "lucide-react";
import { 
  Viewer as CesiumViewer, 
  Cartesian3, 
  Cartesian2,
  Color, 
  Math as CesiumMath 
} from "cesium";
import { 
  CesiumComponentRef, 
  Viewer, 
  Entity, 
  PointGraphics, 
  PolylineGraphics, 
  ModelGraphics,
  LabelGraphics
} from "resium";

interface TrajectoryPoint {
  step: number;
  sc_pos: Cartesian3;
  mars_pos: Cartesian3;
  earth_pos: Cartesian3;
  thrust: number;
  isp: number;
  mass: number;
  anomaly: boolean;
}

export default function Globe() {
  const [ready, setReady] = useState(false);
  const [trajectoryData, setTrajectoryData] = useState<any | null>(null);
  const [animationStep, setAnimationStep] = useState<number>(0);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const [trackSC, setTrackSC] = useState<boolean>(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [activeRightTab, setActiveRightTab] = useState<"console" | "trajectory" | "isp" | "thrust">("console");
  const [zoomPlot, setZoomPlot] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState<boolean>(true);
  
  const viewerRef = useRef<CesiumComponentRef<CesiumViewer>>(null);
  const consoleEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the guidance console to the bottom as the simulation steps forward
  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: "smooth" });
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

  // 1. Initial Cesium Ready Check
  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof window !== "undefined" && (window as any).Cesium) {
        setReady(true);
        clearInterval(interval);
      }
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // 2. Fetch Trajectory JSON Data
  useEffect(() => {
    fetch("/trajectory_data.json")
      .then((res) => res.json())
      .then((data) => {
        setTrajectoryData(data);
      })
      .catch((err) => console.error("Failed to load trajectory data:", err));
  }, []);

  // 3. Configure Cesium Environment (Disable Globe & Set Camera View)
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer || !ready) return;

    // Hide default Earth globe to enable Sun-centered Heliocentric Mode
    viewer.scene.globe.show = false;
    if (viewer.scene.skyAtmosphere) {
      viewer.scene.skyAtmosphere.show = false;
    }

    // Set initial camera view centered at origin (Sun) looking down at the solar system plane
    viewer.camera.setView({
      destination: Cartesian3.fromElements(0, -3.2e11, 1.5e11),
      orientation: {
        heading: CesiumMath.toRadians(0),
        pitch: CesiumMath.toRadians(-25),
        roll: 0,
      },
    });
  }, [ready]);

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

  // 5. Dynamic Camera Tracking of the Spacecraft Entity
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer || !ready || !trajectoryData) return;

    if (trackSC) {
      const entity = viewer.entities.getById("spacecraft");
      if (entity) {
        viewer.trackedEntity = entity;
      }
    } else {
      viewer.trackedEntity = undefined;
    }
  }, [trackSC, animationStep, ready, trajectoryData]);

  if (!ready || !trajectoryData) {
    return (
      <div className="h-screen w-screen bg-black flex flex-col items-center justify-center space-y-4">
        <div className="w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
        <span className="text-slate-400 text-sm font-mono tracking-widest animate-pulse">ESTABLISHING TELEMETRY CONSOLE...</span>
      </div>
    );
  }

  // Precompute Cartesian3 arrays for orbital lines
  const earthPositions = trajectoryData.earth_pos.map((p: number[]) => 
    Cartesian3.fromElements(p[0] * 1000, p[1] * 1000, p[2] * 1000)
  );
  const marsPositions = trajectoryData.mars_pos.map((p: number[]) => 
    Cartesian3.fromElements(p[0] * 1000, p[1] * 1000, p[2] * 1000)
  );
  const scPositions = trajectoryData.sc_pos.map((p: number[]) => 
    Cartesian3.fromElements(p[0] * 1000, p[1] * 1000, p[2] * 1000)
  );

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

  // Camera presets
  const focusSun = () => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;
    setTrackSC(false);
    viewer.camera.flyTo({
      destination: Cartesian3.fromElements(0, -3.2e11, 1.5e11),
      orientation: {
        heading: CesiumMath.toRadians(0),
        pitch: CesiumMath.toRadians(-25),
        roll: 0,
      },
    });
  };

  const focusEarth = () => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;
    setTrackSC(false);
    const currentEarthPos = earthPositions[animationStep];
    viewer.camera.flyTo({
      destination: Cartesian3.add(currentEarthPos, new Cartesian3(0, -1e10, 5e9), new Cartesian3()),
      orientation: {
        heading: CesiumMath.toRadians(0),
        pitch: CesiumMath.toRadians(-35),
        roll: 0,
      },
    });
  };

  const focusMars = () => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;
    setTrackSC(false);
    const currentMarsPos = marsPositions[animationStep];
    viewer.camera.flyTo({
      destination: Cartesian3.add(currentMarsPos, new Cartesian3(0, -1e10, 5e9), new Cartesian3()),
      orientation: {
        heading: CesiumMath.toRadians(0),
        pitch: CesiumMath.toRadians(-35),
        roll: 0,
      },
    });
  };

  // Extract current telemetry values based on animation step
  const currentHour = trajectoryData.steps[animationStep];
  const currentDay = Math.floor(currentHour / 24);
  
  const scPosNow = scPositions[animationStep];
  const earthPosNow = earthPositions[animationStep];
  const marsPosNow = marsPositions[animationStep];

  const thrustVal = trajectoryData.thrust[animationStep];
  const ispVal = trajectoryData.isp[animationStep];
  const massVal = trajectoryData.mass[animationStep];
  const fuelRemaining = Math.max(0.0, massVal - 1648.0);
  const fuelPercentage = Math.max(0.0, (fuelRemaining / 1099.0) * 100);
  const isAnomalyActive = trajectoryData.anomaly[animationStep];
  const isCatastrophic = currentHour >= 1500;

  // Calculate distances relative to Mars and Sun in kilometers
  const scPosKm = trajectoryData.sc_pos[animationStep];
  const marsPosKm = trajectoryData.mars_pos[animationStep];
  const sunDistKm = Math.sqrt(scPosKm[0]**2 + scPosKm[1]**2 + scPosKm[2]**2);
  const marsDistKm = Math.sqrt(
    (marsPosKm[0] - scPosKm[0])**2 + 
    (marsPosKm[1] - scPosKm[1])**2 + 
    (marsPosKm[2] - scPosKm[2])**2
  );

  const getSystemStatusLabel = () => {
    if (isCatastrophic) return "CATASTROPHIC DEGRADATION";
    if (isAnomalyActive) return "ANOMALOUS ACTIVITY";
    return "NOMINAL SYSTEM STABILITY";
  };

  const getIspColor = () => {
    if (isCatastrophic) return "text-red-400 bg-red-500/10 border-red-500/30";
    if (isAnomalyActive) return "text-amber-400 bg-amber-500/10 border-amber-500/30";
    return "text-indigo-400 bg-indigo-500/10 border-indigo-500/30";
  };

  const getIspBarColor = () => {
    if (isCatastrophic) return "bg-red-500 shadow-[0_0_10px_#ef4444]";
    if (isAnomalyActive) return "bg-amber-500 shadow-[0_0_10px_#f59e0b]";
    return "bg-indigo-500 shadow-[0_0_10px_#6366f1]";
  };

  const milestones = [
    { name: "Launch", hour: 0, label: "Launch (0h)", color: "emerald", style: { left: "2%" } },
    { name: "Decay", hour: 1000, label: "Decay (1000h)", color: "amber", style: { left: "10.5%" } },
    { name: "Anomaly", hour: 1497, label: "Anomaly (1497h)", color: "rose", style: { left: "14%" } },
    { name: "Failure", hour: 1500, label: "Failure (1500h)", color: "red", style: { left: "16%" } },
    { name: "Arrival", hour: 11040, label: "Arrival (11040h)", color: "indigo", style: { left: "98%" } },
  ];

  return (
    <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", overflow: "hidden" }} className="bg-black select-none text-slate-200">
      
      {/* 3D Cesium Canvas */}
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
          />
        </Entity>
        <Entity>
          <PolylineGraphics
            positions={marsPositions}
            width={1.5}
            material={Color.RED.withAlpha(0.25)}
          />
        </Entity>
        <Entity>
          <PolylineGraphics
            positions={scPositions}
            width={2.5}
            material={isAnomalyActive ? Color.GOLDENROD : Color.CYAN}
          />
        </Entity>

        {/* Celestial Body Entities */}
        {/* Sun (Origin) */}
        <Entity position={Cartesian3.ZERO} name="Sun">
          <PointGraphics 
            pixelSize={24} 
            color={Color.YELLOW} 
            outlineColor={Color.ORANGE} 
            outlineWidth={2} 
          />
          <LabelGraphics 
            text="Sun" 
            font="11px monospace" 
            fillColor={Color.WHITE} 
            showBackground={true} 
            backgroundColor={Color.BLACK.withAlpha(0.65)} 
            pixelOffset={new Cartesian2(0, -20)} 
          />
        </Entity>

        {/* Earth */}
        <Entity position={earthPosNow} name="Earth">
          <PointGraphics 
            pixelSize={14} 
            color={Color.DEEPSKYBLUE} 
            outlineColor={Color.WHITE} 
            outlineWidth={1} 
          />
          <LabelGraphics 
            text="Earth" 
            font="11px monospace" 
            fillColor={Color.WHITE} 
            showBackground={true} 
            backgroundColor={Color.BLACK.withAlpha(0.65)} 
            pixelOffset={new Cartesian2(0, -16)} 
          />
        </Entity>

        {/* Mars */}
        <Entity position={marsPosNow} name="Mars">
          <PointGraphics 
            pixelSize={12} 
            color={Color.ORANGERED} 
            outlineColor={Color.WHITE} 
            outlineWidth={1} 
          />
          <LabelGraphics 
            text="Mars" 
            font="11px monospace" 
            fillColor={Color.WHITE} 
            showBackground={true} 
            backgroundColor={Color.BLACK.withAlpha(0.65)} 
            pixelOffset={new Cartesian2(0, -16)} 
          />
        </Entity>

        {/* Spacecraft (3D Model with warning light) */}
        <Entity id="spacecraft" position={scPosNow} name="PPO Spacecraft">
          <ModelGraphics
            uri="https://raw.githubusercontent.com/CesiumGS/cesium/main/Apps/SampleData/models/Cesium_Satellite/Cesium_Satellite.glb"
            minimumPixelSize={60}
            maximumScale={10000}
          />
          {isAnomalyActive && (
            <PointGraphics
              pixelSize={14}
              color={Color.RED}
              outlineColor={Color.WHITE}
              outlineWidth={1}
            />
          )}
        </Entity>
      </Viewer>

      {/* Top Header Panel */}
      <div className="absolute top-6 left-6 z-50 flex items-center gap-4 bg-slate-950/85 backdrop-blur-md px-6 py-3.5 rounded-2xl border border-slate-800/80 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-2.5">
          <span className={`w-3.5 h-3.5 rounded-full shadow-[0_0_10px_currentColor] transition-all duration-300 ${
            isCatastrophic ? "bg-red-500 text-red-500 animate-pulse" :
            isAnomalyActive ? "bg-amber-500 text-amber-500 animate-pulse" :
            "bg-emerald-500 text-emerald-500"
          }`}></span>
          <div className="flex flex-col">
            <h1 className="text-white text-sm font-bold tracking-wider font-sans leading-none uppercase">ARES-1 Flight Console</h1>
            <span className="text-[9px] font-mono text-slate-400 mt-1 uppercase">PPO GUIDANCE & TRAJECTORY SCHEDULER</span>
          </div>
        </div>
        <div className="h-6 w-px bg-slate-800"></div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-slate-500 uppercase">SYS STATUS:</span>
          <span className={`text-[10px] font-mono font-bold tracking-wide uppercase ${
            isCatastrophic ? "text-red-400" :
            isAnomalyActive ? "text-amber-400 animate-pulse" :
            "text-emerald-400"
          }`}>{getSystemStatusLabel()}</span>
        </div>
      </div>

      {/* LEFT SIDE PANEL: Telemetry Hub */}
      <div className="absolute top-24 left-6 w-[380px] z-40 flex flex-col rounded-2xl overflow-hidden"
           style={{
             maxHeight: "calc(100vh - 12rem)",
             background: "linear-gradient(135deg, rgba(8,12,24,0.92) 0%, rgba(0,0,0,0.97) 100%)",
             backdropFilter: "blur(24px)",
             border: "1px solid rgba(255,255,255,0.06)",
             borderTop: isCatastrophic 
               ? "2px solid rgba(239,68,68,0.7)" 
               : isAnomalyActive 
                 ? "2px solid rgba(245,158,11,0.7)"
                 : "2px solid rgba(16,185,129,0.7)",
             boxShadow: "0 25px 60px rgba(0,0,0,0.85)"
           }}>
        
        {/* Hub Header */}
        <div className="p-5 border-b border-white/5 shrink-0 flex items-center justify-between">
          <div>
            <span className="uppercase tracking-[0.2em] text-[9px] font-bold text-cyan-400 font-mono">Flight Metrics</span>
            <h2 className="text-base font-medium tracking-tight mt-0.5 text-white">System Diagnostics</h2>
          </div>
          <Activity size={16} className={isAnomalyActive ? "text-amber-500 animate-pulse" : "text-cyan-400"} />
        </div>

        {/* Telemetry Scrollable Content */}
        <div className="overflow-y-auto p-5 space-y-6 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
          
          {/* Mission Elapsed Time */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">Mission Elapsed Time</span>
            <div className="p-4 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock size={16} className="text-cyan-400" />
                <span className="text-base font-bold font-mono text-white tracking-wide">
                  Day {currentDay.toString().padStart(3, '0')} / Hr {currentHour.toString().padStart(5, '0')}
                </span>
              </div>
              <span className="text-[9px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-white/5">
                MAX 11,040h
              </span>
            </div>
          </div>

          {/* Engine Parameters: Isp & Fuel */}
          <div className="space-y-4">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">Engine Diagnostic State</span>
            
            {/* Specific Impulse Progress */}
            <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-3">
              <div className="flex justify-between items-center text-xs">
                <div className="flex items-center gap-2">
                  <Gauge size={14} className="text-slate-400" />
                  <span className="text-slate-300 font-medium">Specific Impulse (Isp)</span>
                </div>
                <span className="font-mono text-white font-bold">{ispVal.toFixed(1)} s</span>
              </div>
              <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-white/5">
                <div 
                  className={`h-full transition-all duration-300 ${getIspBarColor()}`}
                  style={{ width: `${((ispVal - 1514.7) / (1782 - 1514.7)) * 100}%` }}
                ></div>
              </div>
              <div className="flex justify-between items-center text-[9px] font-mono text-slate-500 pt-0.5">
                <span>Failed Limit: 1514.7s</span>
                <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-white/5 text-[8px]">
                  {isCatastrophic ? "FAIL LOCK" : isAnomalyActive ? "DECAY ACTIVE" : "NOMINAL"}
                </span>
                <span>Nominal Capacity: 1782.0s</span>
              </div>
            </div>

            {/* Propellant Mass Level Indicator with SVG Fuel Tank visual */}
            <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-4">
              <div className="flex justify-between items-center text-xs">
                <div className="flex items-center gap-2">
                  <Fuel size={14} className="text-emerald-400" />
                  <span className="text-slate-300 font-medium">Propellant Mass</span>
                </div>
                <span className="font-mono text-emerald-400 font-bold">{fuelRemaining.toFixed(1)} kg / 1099.0 kg</span>
              </div>
              
              <div className="flex gap-4 items-center">
                {/* SVG Fuel Tank */}
                <div className="w-10 h-16 shrink-0 relative flex items-center justify-center bg-slate-900 border border-white/10 rounded-lg overflow-hidden">
                  <div 
                    className="absolute bottom-0 w-full bg-gradient-to-t from-emerald-600 to-emerald-400 opacity-80 transition-all duration-500"
                    style={{ height: `${fuelPercentage}%` }}
                  >
                    <div className="absolute top-0 w-full h-1 bg-white/40 animate-pulse"></div>
                  </div>
                  <span className="absolute z-10 text-[9px] font-mono font-bold text-white shadow-sm">{fuelPercentage.toFixed(0)}%</span>
                </div>
                
                <div className="flex-1 space-y-2">
                  <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-white/5">
                    <div 
                      className="h-full bg-emerald-500 shadow-[0_0_10px_#10b981] transition-all duration-300"
                      style={{ width: `${fuelPercentage}%` }}
                    ></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[9px] font-mono text-slate-500">
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
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">Engine Control Command</span>
            <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${thrustVal > 0.005 ? "bg-amber-500 animate-ping" : "bg-slate-700"}`}></span>
                  <span className="text-xs text-slate-300 font-medium">Thrust Engine state</span>
                </div>
                <span className="text-xs font-mono font-bold text-cyan-400">
                  {((thrustVal / 0.289) * 100).toFixed(1)}% ({thrustVal.toFixed(3)} N)
                </span>
              </div>
              <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden border border-white/5">
                <div 
                  className="h-full bg-cyan-400 shadow-[0_0_8px_#22d3ee] transition-all duration-300"
                  style={{ width: `${(thrustVal / 0.289) * 100}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-[9px] font-mono text-slate-500">
                <span>0.000 N (Ballistic Coasting)</span>
                <span className="text-slate-400 font-bold uppercase">{thrustVal > 0.005 ? "Engaged PPO Burn" : "Coasting"}</span>
                <span>0.289 N (Max Capacity)</span>
              </div>
            </div>
          </div>

          {/* Planetary Distance Stats */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">Astrodynamic Positions</span>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl bg-white/5 border border-white/5 text-center">
                <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold font-mono">Distance to Mars</div>
                <div className="text-sm font-bold text-red-400 mt-1 font-mono">{(marsDistKm / 1e6).toFixed(2)}M km</div>
              </div>
              <div className="p-3.5 rounded-xl bg-white/5 border border-white/5 text-center">
                <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold font-mono">Distance to Sun</div>
                <div className="text-sm font-bold text-amber-400 mt-1 font-mono">{(sunDistKm / 1e6).toFixed(2)}M km</div>
              </div>
            </div>
          </div>

          {/* System Health Check grid */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">Subsystem Verification Matrix</span>
            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
              <div className="p-2.5 rounded-lg bg-white/5 border border-white/5 flex items-center justify-between">
                <span className="text-slate-400">AI Guidance:</span>
                <span className={`font-bold ${isCatastrophic ? "text-amber-400" : "text-emerald-400"}`}>
                  {isCatastrophic ? "RE-ROUTING" : "ACTIVE"}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-white/5 border border-white/5 flex items-center justify-between">
                <span className="text-slate-400">Propellant:</span>
                <span className="text-emerald-400 font-bold">NOMINAL</span>
              </div>
              <div className="p-2.5 rounded-lg bg-white/5 border border-white/5 flex items-center justify-between">
                <span className="text-slate-400">Thruster Isp:</span>
                <span className={`font-bold ${isCatastrophic ? "text-red-400" : isAnomalyActive ? "text-amber-400" : "text-emerald-400"}`}>
                  {isCatastrophic ? "DEGRADED" : isAnomalyActive ? "DECAY" : "NOMINAL"}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-white/5 border border-white/5 flex items-center justify-between">
                <span className="text-slate-400">Anomaly Det:</span>
                <span className={`font-bold ${isAnomalyActive ? "text-red-400" : "text-emerald-400"}`}>
                  {isAnomalyActive ? "FLAGGED" : "NOMINAL"}
                </span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* RIGHT SIDE PANEL: Live Guidance Logs & Scientific Plots */}
      <div className="absolute top-24 right-6 w-[440px] z-40 flex flex-col rounded-2xl overflow-hidden"
           style={{
             maxHeight: "calc(100vh - 12rem)",
             background: "linear-gradient(135deg, rgba(8,12,24,0.92) 0%, rgba(0,0,0,0.97) 100%)",
             backdropFilter: "blur(24px)",
             border: "1px solid rgba(255,255,255,0.06)",
             borderTop: "2px solid rgba(6,182,212,0.7)",
             boxShadow: "-10px 25px 60px rgba(0,0,0,0.85)"
           }}>
        
        {/* Tab Controls Selector */}
        <div className="bg-slate-900/60 p-2 shrink-0 border-b border-white/5 flex items-center justify-between">
          <div className="flex gap-1.5 w-full">
            <button
              onClick={() => setActiveRightTab("console")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-mono font-bold tracking-wide uppercase transition-all ${
                activeRightTab === "console" 
                  ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/25" 
                  : "text-slate-400 hover:text-white border border-transparent hover:bg-white/5"
              }`}
            >
              <Terminal size={12} />
              Console
            </button>
            <button
              onClick={() => setActiveRightTab("trajectory")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-mono font-bold tracking-wide uppercase transition-all ${
                activeRightTab === "trajectory" 
                  ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/25" 
                  : "text-slate-400 hover:text-white border border-transparent hover:bg-white/5"
              }`}
            >
              <Image size={12} />
              Orbit
            </button>
            <button
              onClick={() => setActiveRightTab("isp")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-mono font-bold tracking-wide uppercase transition-all ${
                activeRightTab === "isp" 
                  ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/25" 
                  : "text-slate-400 hover:text-white border border-transparent hover:bg-white/5"
              }`}
            >
              <Image size={12} />
              Isp
            </button>
            <button
              onClick={() => setActiveRightTab("thrust")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-mono font-bold tracking-wide uppercase transition-all ${
                activeRightTab === "thrust" 
                  ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/25" 
                  : "text-slate-400 hover:text-white border border-transparent hover:bg-white/5"
              }`}
            >
              <Image size={12} />
              Thrust
            </button>
          </div>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent flex flex-col justify-between" style={{ minHeight: "260px" }}>
          
          {/* TAB 1: Live Terminal Log */}
          {activeRightTab === "console" && (
            <div className="flex flex-col flex-1 h-full min-h-0 justify-between">
              <div className="flex items-center gap-2 pb-2 shrink-0 border-b border-white/5 mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_6px_#22d3ee]"></span>
                <span className="text-[10px] font-mono uppercase text-slate-400 font-bold">PPO Guidance Neural Network Log</span>
              </div>
              <div className="flex-1 overflow-y-auto font-mono text-[10px] text-slate-300 space-y-2.5 leading-relaxed pr-1 max-h-[380px] scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                {logs.map((log, idx) => (
                  <div key={idx} className="border-l-2 border-white/5 pl-2">
                    {log.includes('🚀') || log.includes('🎯') ? (
                      <span className="text-cyan-400 font-semibold">{log}</span>
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
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-white/5">
                <span className="text-[10px] font-mono uppercase text-slate-400 font-bold">Paper Figure: 3D Heliocentric trajectory</span>
                <button 
                  onClick={() => setZoomPlot("/figures/3d_heliocentric_trajectory.png")}
                  className="p-1 hover:bg-white/5 rounded text-cyan-400 flex items-center gap-1 text-[9px] font-mono uppercase border border-cyan-500/20"
                >
                  <Maximize2 size={10} />
                  Zoom
                </button>
              </div>
              <div className="relative group cursor-zoom-in rounded-lg overflow-hidden border border-white/10"
                   onClick={() => setZoomPlot("/figures/3d_heliocentric_trajectory.png")}>
                <img 
                  src="/figures/3d_heliocentric_trajectory.png" 
                  alt="3D Trajectory" 
                  className="w-full h-auto object-cover group-hover:scale-[1.02] transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-200">
                  <span className="text-xs font-mono font-bold text-white bg-slate-950/80 px-3 py-1.5 rounded-lg border border-white/10">Click to expand analysis</span>
                </div>
              </div>
              <p className="text-[10.5px] text-slate-400 font-sans leading-relaxed">
                **Mathematical Summary**: Shows heliocentric departure from Earth orbit and intercept matching Mars position. Under degradation, PPO adjusts steering vectors dynamically to optimize thrust vector angles relative to the orbital plane.
              </p>
            </div>
          )}

          {/* TAB 3: Isp Image */}
          {activeRightTab === "isp" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-white/5">
                <span className="text-[10px] font-mono uppercase text-slate-400 font-bold">Paper Figure: Specific Impulse decay</span>
                <button 
                  onClick={() => setZoomPlot("/figures/isp_degradation_anomaly_detection.png")}
                  className="p-1 hover:bg-white/5 rounded text-cyan-400 flex items-center gap-1 text-[9px] font-mono uppercase border border-cyan-500/20"
                >
                  <Maximize2 size={10} />
                  Zoom
                </button>
              </div>
              <div className="relative group cursor-zoom-in rounded-lg overflow-hidden border border-white/10"
                   onClick={() => setZoomPlot("/figures/isp_degradation_anomaly_detection.png")}>
                <img 
                  src="/figures/isp_degradation_anomaly_detection.png" 
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
                  onClick={() => setZoomPlot("/figures/thrust_magnitude_propellant.png")}
                  className="p-1 hover:bg-white/5 rounded text-cyan-400 flex items-center gap-1 text-[9px] font-mono uppercase border border-cyan-500/20"
                >
                  <Maximize2 size={10} />
                  Zoom
                </button>
              </div>
              <div className="relative group cursor-zoom-in rounded-lg overflow-hidden border border-white/10"
                   onClick={() => setZoomPlot("/figures/thrust_magnitude_propellant.png")}>
                <img 
                  src="/figures/thrust_magnitude_propellant.png" 
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
          className="absolute bottom-28 left-6 z-40 bg-slate-950/95 border border-slate-800/80 text-white text-xs px-5 py-4 rounded-xl max-w-[320px] shadow-2xl cursor-pointer hover:border-slate-700 transition-colors"
        >
          <div className="text-xs font-bold font-mono tracking-wider mb-1.5 text-cyan-400 flex items-center gap-1.5">
            <HelpCircle size={14} />
            Heliocentric Navigation Map
          </div>
          <div className="text-slate-400 font-mono text-[10px] leading-relaxed space-y-1">
            <p>• <span className="text-yellow-400 font-bold">Yellow Center</span>: Sun (Barycentric origin)</p>
            <p>• <span className="text-cyan-400 font-bold">Blue Track</span>: Earth Orbital Ellipse</p>
            <p>• <span className="text-red-400 font-bold">Red Track</span>: Mars Orbital Ellipse</p>
            <p>• <span className="text-indigo-400 font-bold">Cyan Line</span>: Spacecraft Trajectory (turns gold during thruster degradation)</p>
          </div>
          <div className="text-slate-500 text-[9px] font-mono mt-2.5 text-right">Click to dismiss guide</div>
        </div>
      )}

      {/* BOTTOM CENTER CONTROLS: Timeline & Playback Panel */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-3.5 bg-slate-950/90 border border-slate-800/75 p-5 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.85)] backdrop-blur-md min-w-[620px] max-w-[90vw]">
        
        {/* Clickable Event Milestone Timeline Checkpoints */}
        <div className="relative w-full h-8 flex items-center px-4">
          {/* Background Track Line */}
          <div className="absolute left-4 right-4 h-[3px] bg-slate-800 rounded-full"></div>
          
          {/* Active Gradient Progress Track */}
          <div 
            className="absolute left-4 h-[3px] bg-gradient-to-r from-emerald-500 via-amber-500 to-indigo-500 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.6)] transition-all duration-300"
            style={{ width: `${Math.min(97.0, (currentHour / 11040) * 97.0)}%` }}
          ></div>
          
          {/* Render Milestones */}
          {milestones.map((m, idx) => {
            const index = getStepIndexForHour(m.hour);
            const isReached = animationStep >= index;
            let btnColor = "bg-slate-700 hover:bg-slate-600";
            if (isReached) {
              if (m.color === "emerald") btnColor = "bg-emerald-500 shadow-[0_0_8px_#10b981]";
              else if (m.color === "amber") btnColor = "bg-amber-500 shadow-[0_0_8px_#f59e0b]";
              else if (m.color === "rose") btnColor = "bg-rose-500 shadow-[0_0_8px_#f43f5e]";
              else if (m.color === "red") btnColor = "bg-red-500 shadow-[0_0_8px_#ef4444]";
              else if (m.color === "indigo") btnColor = "bg-indigo-500 shadow-[0_0_8px_#6366f1]";
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
                <span className="text-[8px] text-slate-400 group-hover:text-white mb-1.5 font-mono tracking-wide transition-colors uppercase">
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
            max={trajectoryData.steps.length - 1}
            value={animationStep}
            onChange={(e) => {
              setAnimationStep(parseInt(e.target.value));
              setIsAnimating(false); // Pause on scrub
            }}
            className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500 focus:outline-none"
          />
          <span className="text-xs font-mono text-white bg-slate-900 border border-white/5 px-3 py-1 rounded-lg min-w-[140px] text-center shadow-inner">
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
              className="p-2 bg-slate-900 border border-white/10 hover:border-white/20 hover:bg-slate-800 rounded-lg transition-all text-slate-400 hover:text-white flex items-center justify-center"
              title="Reset flight timeline"
            >
              <RotateCcw size={14} />
            </button>
            <button
              onClick={() => setIsAnimating(!isAnimating)}
              className={`p-2 px-3.5 rounded-lg transition-all font-semibold flex items-center gap-1.5 text-xs text-white ${
                isAnimating 
                  ? "bg-amber-600 shadow-lg shadow-amber-500/10 hover:bg-amber-500 border border-amber-500/20" 
                  : "bg-cyan-600 shadow-lg shadow-cyan-500/10 hover:bg-cyan-500 border border-cyan-500/20"
              }`}
              title={isAnimating ? "Pause simulation" : "Start simulation"}
            >
              {isAnimating ? <Pause size={14} /> : <Play size={14} />}
              <span>{isAnimating ? "Pause" : "Play"}</span>
            </button>
          </div>

          {/* Playback Speed Multiplier selector */}
          <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-white/5">
            {[1, 2, 5, 10, 20].map((s) => (
              <button
                key={s}
                onClick={() => setPlaybackSpeed(s)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-mono font-bold transition-all ${
                  playbackSpeed === s 
                    ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/25" 
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {s}x
              </button>
            ))}
          </div>

          {/* Camera Focus Controls */}
          <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-white/5">
            <button
              onClick={focusSun}
              className="px-2 py-1.5 rounded-md text-[9px] font-mono font-bold text-slate-400 hover:text-white flex items-center gap-1 transition-all"
              title="Focus Sun Viewport"
            >
              <Compass size={11} />
              SUN
            </button>
            <button
              onClick={focusEarth}
              className="px-2 py-1.5 rounded-md text-[9px] font-mono font-bold text-slate-400 hover:text-white flex items-center gap-1 transition-all"
              title="Focus Earth Orbit"
            >
              <Compass size={11} />
              EARTH
            </button>
            <button
              onClick={focusMars}
              className="px-2 py-1.5 rounded-md text-[9px] font-mono font-bold text-slate-400 hover:text-white flex items-center gap-1 transition-all"
              title="Focus Mars Intercept"
            >
              <Compass size={11} />
              MARS
            </button>
            <div className="w-px h-3.5 bg-slate-800 mx-1"></div>
            <button
              onClick={() => setTrackSC(!trackSC)}
              className={`px-2 py-1.5 rounded-md text-[9px] font-mono font-bold flex items-center gap-1 transition-all ${
                trackSC 
                  ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/25" 
                  : "text-slate-400 hover:text-white"
              }`}
              title="Track Spacecraft Viewport"
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
            className="relative max-w-5xl w-full bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl p-6 animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center pb-4 border-b border-white/5 mb-4">
              <div className="flex items-center gap-2 text-cyan-400">
                <Image size={18} />
                <span className="text-sm font-mono font-bold uppercase tracking-wider">
                  {zoomPlot.includes('trajectory') ? "Trajectory Plot (Fig. 1)" :
                   zoomPlot.includes('isp') ? "Specific Impulse Decay Curve (Fig. 2)" :
                   "Thrust Magnitude & Fuel Curve (Fig. 3)"}
                </span>
              </div>
              <button 
                onClick={() => setZoomPlot(null)}
                className="p-2 bg-slate-900 border border-white/5 hover:border-white/10 rounded-xl text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="w-full flex flex-col md:flex-row gap-6 items-start">
              <div className="flex-1 bg-black p-2 rounded-2xl border border-white/5">
                <img 
                  src={zoomPlot} 
                  alt="Zoomed Reference Chart" 
                  className="w-full h-auto object-contain rounded-xl max-h-[70vh]"
                />
              </div>
              <div className="w-full md:w-80 shrink-0 space-y-4">
                <h4 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest border-b border-white/5 pb-1">
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
                
                <div className="p-4 rounded-xl bg-slate-900 border border-white/5 font-mono text-[9.5px] text-slate-400 leading-normal space-y-1">
                  <div><strong>Project</strong>: Houston Climate Dashboard (Visualizer)</div>
                  <div><strong>Context</strong>: Autonomous Guidance Optimization</div>
                  <div><strong>Format</strong>: Publication Figure (.png/.pdf)</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
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