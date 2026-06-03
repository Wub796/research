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
  Clock
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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
  const [trackSC, setTrackSC] = useState<boolean>(false);
  const [showGuide, setShowGuide] = useState<boolean>(true);
  
  const viewerRef = useRef<CesiumComponentRef<CesiumViewer>>(null);
  const consoleEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the guidance console to the bottom as the simulation steps forward
  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [animationStep]);

  const getConsoleLogs = () => {
    if (!trajectoryData) return [];
    const logsList: string[] = [];
    const steps = trajectoryData.steps;
    const thrusts = trajectoryData.thrust;
    
    for (let i = 0; i <= animationStep; i++) {
      const hr = steps[i];
      if (i === 0) {
        logsList.push(`[0h] 🚀 Earth departure initiated. PPO policy loaded.`);
      }
      
      if (hr === 1000) {
        logsList.push(`[1000h] ⚠️ Warning: Thruster specific impulse decay started.`);
      }
      
      const prevAnomaly = i > 0 ? (trajectoryData.anomaly[i-1] || steps[i-1] >= 1497) : false;
      const currAnomaly = trajectoryData.anomaly[i] || hr >= 1497;
      if (currAnomaly && !prevAnomaly && hr < 1500) {
        logsList.push(`[${hr}h] 🚨 Isolation Forest: Anomaly flagged in thruster telemetry.`);
      }
      
      if (hr === 1500) {
        logsList.push(`[1500h] 💥 Critical: Catastrophic hardware failure. Isp locked at 1514.7s. PPO controller re-optimizing path.`);
      }
      
      if (i > 0) {
        const isBurning = thrusts[i] > 0.005;
        const wasBurning = thrusts[i - 1] > 0.005;
        if (isBurning && !wasBurning) {
          logsList.push(`[${hr}h] ⚡ PPO: Thruster ignition (Commanding ${(thrusts[i]/0.289*100).toFixed(0)}% burn).`);
        } else if (!isBurning && wasBurning) {
          logsList.push(`[${hr}h] 💤 PPO: Burn complete. Transitioning to coasting.`);
        }
      }
      
      if (i === steps.length - 1 && animationStep === steps.length - 1) {
        logsList.push(`[${hr}h] 🎯 Mars intercept complete. Insertion successful.`);
      }
    }
    return logsList.slice(-25); // Keep the last 25 logs for display
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
        console.log("Loaded trajectory data:", data);
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
        return prev + 1;
      });
    }, 45); // ~22 frames per second
    return () => clearInterval(interval);
  }, [isAnimating, trajectoryData]);

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
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
        <span className="text-slate-400 text-sm font-mono tracking-widest">LOADING TELEMETRY...</span>
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



  return (
    <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", overflow: "hidden" }}>
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
            material={Color.BLUE.withAlpha(0.3)}
          />
        </Entity>
        <Entity>
          <PolylineGraphics
            positions={marsPositions}
            width={1.5}
            material={Color.RED.withAlpha(0.3)}
          />
        </Entity>
        <Entity>
          <PolylineGraphics
            positions={scPositions}
            width={2.5}
            material={Color.CYAN}
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
            font="10px monospace" 
            fillColor={Color.WHITE} 
            showBackground={true} 
            backgroundColor={Color.BLACK.withAlpha(0.6)} 
            pixelOffset={new Cartesian2(0, -18)} 
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
            font="10px monospace" 
            fillColor={Color.WHITE} 
            showBackground={true} 
            backgroundColor={Color.BLACK.withAlpha(0.6)} 
            pixelOffset={new Cartesian2(0, -15)} 
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
            font="10px monospace" 
            fillColor={Color.WHITE} 
            showBackground={true} 
            backgroundColor={Color.BLACK.withAlpha(0.6)} 
            pixelOffset={new Cartesian2(0, -15)} 
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

      {/* Header Overlay */}
      <div className="absolute top-6 left-6 z-50">
        <div className="text-white text-lg font-bold tracking-wider flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 shadow-[0_0_10px_#06b6d4]"></span>
          ARES-1 VISUALIZER
        </div>
        <div className="text-slate-400 text-xs mt-0.5 font-mono">Heliocentric PPO Flight Optimization</div>
      </div>

      {/* Telemetry Dashboard (Left Side Panel) */}
      <div className="absolute top-24 left-6 w-[360px] z-50 flex flex-col rounded-3xl overflow-hidden"
           style={{
             maxHeight: "calc(100vh - 10rem)",
             background: "linear-gradient(135deg, rgba(15,23,42,0.92) 0%, rgba(0,0,0,0.95) 100%)",
             backdropFilter: "blur(20px)",
             border: "1px solid rgba(255,255,255,0.08)",
             borderTop: isAnomalyActive 
               ? "1px solid rgba(239,68,68,0.5)" 
               : "1px solid rgba(6,182,212,0.4)",
             boxShadow: "0 20px 50px rgba(0,0,0,0.8)",
             color: "white"
           }}>
        
        {/* Header */}
        <div className="p-6 pb-3 shrink-0 border-b border-white/5">
          <span className="uppercase tracking-[0.2em] text-[10px] font-bold text-cyan-400">Flight Telemetry</span>
          <h2 className="text-xl font-light tracking-tight mt-1">Autonomous Spacecraft</h2>
          
          {/* Status Badge */}
          <div className="mt-3">
            {isCatastrophic ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-xs font-semibold">
                <AlertTriangle size={14} className="animate-pulse" />
                <span>CATASTROPHIC DEGRADATION (Isp = 1514.7s)</span>
              </div>
            ) : isAnomalyActive ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-orange-500/30 bg-orange-500/10 text-orange-400 text-xs font-semibold">
                <AlertTriangle size={14} className="animate-pulse" />
                <span>ISOLATION FOREST ANOMALY FLAGGED</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs font-semibold">
                <CheckCircle2 size={14} />
                <span>NOMINAL OPERATIONS</span>
              </div>
            )}
          </div>
        </div>

        {/* Dashboard Content */}
        <div className="overflow-y-auto p-6 space-y-5" style={{ flex: 1 }}>
          
          {/* MET Card */}
          <div className="p-4 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock size={18} className="text-cyan-400" />
              <div>
                <div className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Mission Elapsed Time</div>
                <div className="text-sm font-semibold font-mono text-white">Day {currentDay} / Hr {currentHour}</div>
              </div>
            </div>
            <span className="text-[10px] font-mono text-slate-400">Total: 11,040h</span>
          </div>

          {/* Specific Impulse Progress */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs">
              <div className="flex items-center gap-2 text-slate-400">
                <Gauge size={14} className="text-indigo-400" />
                <span className="uppercase tracking-wider font-semibold">Specific Impulse (Isp)</span>
              </div>
              <span className="font-mono text-indigo-400 font-semibold">{ispVal.toFixed(1)} s</span>
            </div>
            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div 
                className="h-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)] transition-all duration-300"
                style={{ width: `${((ispVal - 1514.7) / (1782 - 1514.7)) * 100}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-[9px] text-slate-500 font-mono">
              <span>Limit: 1514.7s</span>
              <span>Nominal: 1782.0s</span>
            </div>
          </div>

          {/* Propellant Progress */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs">
              <div className="flex items-center gap-2 text-slate-400">
                <Fuel size={14} className="text-emerald-400" />
                <span className="uppercase tracking-wider font-semibold">Propellant Mass</span>
              </div>
              <span className="font-mono text-emerald-400 font-semibold">{fuelRemaining.toFixed(1)} kg</span>
            </div>
            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div 
                className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)] transition-all"
                style={{ width: `${(fuelRemaining / 1099.0) * 100}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-[9px] text-slate-500 font-mono">
              <span>Dry Mass: 1648kg</span>
              <span>Initial: 1099kg</span>
            </div>
          </div>

          {/* Thrust Level Card */}
          <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[10px] uppercase text-slate-500 font-bold tracking-wider">Thrust Command</span>
              <span className="text-xs font-mono font-semibold text-cyan-400">
                {((thrustVal / 0.289) * 100).toFixed(1)}% ({thrustVal.toFixed(3)} N)
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${thrustVal > 0.005 ? "bg-amber-400 animate-pulse" : "bg-slate-600"}`}></span>
                <span className="text-xs text-slate-300">{thrustVal > 0.005 ? "PPO ACTIVE BURN" : "BALLISTIC COASTING"}</span>
              </div>
              <span className="text-[9px] text-slate-500 font-mono">Max: 0.289 N</span>
            </div>
          </div>

          {/* Planetary Distance Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-white/5 border border-white/5 text-center">
              <div className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">Dist to Mars</div>
              <div className="text-sm font-bold text-red-400 mt-1 font-mono">{(marsDistKm / 1e6).toFixed(2)}M km</div>
            </div>
            <div className="p-3 rounded-xl bg-white/5 border border-white/5 text-center">
              <div className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">Dist to Sun</div>
              <div className="text-sm font-bold text-amber-400 mt-1 font-mono">{(sunDistKm / 1e6).toFixed(2)}M km</div>
            </div>
          </div>

          {/* Guidance Console */}
          <div className="p-4 rounded-2xl bg-black/40 border border-white/5 space-y-2">
            <div className="text-[9px] uppercase text-slate-500 font-bold tracking-wider flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_6px_#22d3ee]"></span>
              PPO Guidance & Control Log
            </div>
            <div className="h-32 overflow-y-auto font-mono text-[9px] text-slate-300 space-y-1.5 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
              {logs.map((log, idx) => (
                <div key={idx} className="leading-relaxed">
                  {log.includes('🚀') || log.includes('🎯') ? (
                    <span className="text-cyan-300">{log}</span>
                  ) : log.includes('⚠️') ? (
                    <span className="text-amber-400">{log}</span>
                  ) : log.includes('🚨') || log.includes('💥') ? (
                    <span className="text-red-400 font-semibold">{log}</span>
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

        </div>
      </div>

      {/* Guide Box */}
      {showGuide && (
        <div 
          onClick={() => setShowGuide(false)}
          className="absolute bottom-28 left-6 z-50 bg-slate-950/95 border border-slate-800 text-white text-xs px-5 py-4 rounded-2xl max-w-[320px] shadow-2xl cursor-pointer"
        >
          <div className="text-sm font-semibold mb-1 text-cyan-400 flex items-center gap-1.5">
            <HelpCircle size={15} />
            Heliocentric Path Navigation
          </div>
          <div className="text-slate-400 leading-relaxed">
            - **Yellow Center**: Sun<br />
            - **Blue Loop**: Earth Orbit<br />
            - **Red Loop**: Mars Orbit<br />
            - **Cyan Line**: RL Spacecraft Path (turns red when degradation starts).
          </div>
          <div className="text-slate-600 text-[10px] mt-2 text-right">tap to dismiss</div>
        </div>
      )}

      {/* Animation Controls (Bottom Center Panel) */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-3 bg-slate-950/90 border border-slate-800/80 p-4 rounded-3xl shadow-2xl backdrop-blur-md min-w-[500px] max-w-[90vw]">
        
        {/* Interactive Event Timeline */}
        <div className="relative w-full h-8 flex items-center px-1.5 border-b border-white/5 pb-2.5">
          <div className="absolute left-1.5 right-1.5 h-0.5 bg-slate-800"></div>
          
          {/* Milestone 1: Earth Launch */}
          <button 
            onClick={() => { setAnimationStep(0); setIsAnimating(false); }}
            className="absolute flex flex-col items-center -translate-x-1/2 group"
            style={{ left: "1.5%" }}
          >
            <span className={`w-2.5 h-2.5 rounded-full border border-white/20 transition-all ${animationStep >= 0 ? "bg-emerald-500 shadow-[0_0_8px_#10b981]" : "bg-slate-700"}`}></span>
            <span className="text-[8px] text-slate-400 group-hover:text-white mt-1.5 font-mono transition-colors">Launch (0h)</span>
          </button>
          
          {/* Milestone 2: Isp Decay Start */}
          <button 
            onClick={() => { setAnimationStep(100); setIsAnimating(false); }}
            className="absolute flex flex-col items-center -translate-x-1/2 group"
            style={{ left: "10.5%" }}
          >
            <span className={`w-2.5 h-2.5 rounded-full border border-white/20 transition-all ${animationStep >= 100 ? "bg-amber-500 shadow-[0_0_8px_#f59e0b]" : "bg-slate-700"}`}></span>
            <span className="text-[8px] text-slate-400 group-hover:text-white mt-1.5 font-mono transition-colors">Decay (1000h)</span>
          </button>
          
          {/* Milestone 3: Anomaly & Failure */}
          <button 
            onClick={() => { setAnimationStep(150); setIsAnimating(false); }}
            className="absolute flex flex-col items-center -translate-x-1/2 group"
            style={{ left: "15.0%" }}
          >
            <span className={`w-2.5 h-2.5 rounded-full border border-white/20 transition-all ${animationStep >= 150 ? "bg-red-500 shadow-[0_0_8px_#ef4444]" : "bg-slate-700"}`}></span>
            <span className="text-[8px] text-slate-400 group-hover:text-white mt-1.5 font-mono transition-colors">Failure (1500h)</span>
          </button>
          
          {/* Milestone 4: Mars Intercept */}
          <button 
            onClick={() => { setAnimationStep(trajectoryData.steps.length - 1); setIsAnimating(false); }}
            className="absolute flex flex-col items-center -translate-x-1/2 group"
            style={{ left: "98.5%" }}
          >
            <span className={`w-2.5 h-2.5 rounded-full border border-white/20 transition-all ${animationStep >= trajectoryData.steps.length - 1 ? "bg-indigo-500 shadow-[0_0_8px_#6366f1]" : "bg-slate-700"}`}></span>
            <span className="text-[8px] text-slate-400 group-hover:text-white mt-1.5 font-mono transition-colors">Arrival (11040h)</span>
          </button>
        </div>

        {/* Scrubber and Step Count */}
        <div className="w-full flex items-center justify-between gap-4">
          <input
            type="range"
            min={0}
            max={trajectoryData.steps.length - 1}
            value={animationStep}
            onChange={(e) => {
              setAnimationStep(parseInt(e.target.value));
              setIsAnimating(false); // pause on scrubbing
            }}
            className="flex-1 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500 focus:outline-none"
          />
          <span className="text-[10px] font-mono text-slate-400 min-w-[60px] text-right">
            Hr {currentHour}
          </span>
        </div>

        {/* Buttons Row */}
        <div className="w-full flex items-center justify-between mt-1">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setAnimationStep(0);
                setIsAnimating(false);
              }}
              className="p-2 bg-slate-900 border border-white/10 hover:border-white/20 rounded-xl transition-all hover:bg-slate-800"
              title="Reset Timeline"
            >
              <RotateCcw size={16} className="text-slate-400 hover:text-white" />
            </button>
            <button
              onClick={() => setIsAnimating(!isAnimating)}
              className={`p-2 rounded-xl transition-all font-semibold flex items-center justify-center ${
                isAnimating 
                  ? "bg-amber-600 text-white shadow-lg shadow-amber-500/20" 
                  : "bg-cyan-600 text-white shadow-lg shadow-cyan-500/20 hover:bg-cyan-500"
              }`}
              style={{ width: "38px" }}
              title={isAnimating ? "Pause" : "Play"}
            >
              {isAnimating ? <Pause size={16} /> : <Play size={16} />}
            </button>
          </div>

          {/* Camera Follow Toggle */}
          <button
            onClick={() => setTrackSC(!trackSC)}
            className={`px-4 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-all ${
              trackSC 
                ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/50" 
                : "bg-slate-900 text-slate-400 border-white/10 hover:border-white/20 hover:text-white"
            }`}
          >
            <Crosshair size={14} />
            {trackSC ? "Lock Camera: Spacecraft" : "Free Camera"}
          </button>
        </div>

      </div>
    </div>
  );
}