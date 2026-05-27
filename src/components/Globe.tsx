"use client";

import * as satellite from "satellite.js";
import { X, Activity, Mountain, ShieldAlert } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Component, ReactNode, useState, useEffect, useRef } from 'react';
import { Viewer as CesiumViewer, Cartesian3, Color, ScreenSpaceEventType, HeadingPitchRange, Math as CesiumMath } from "cesium";
import { CesiumComponentRef, Viewer, Entity, ScreenSpaceEventHandler, ScreenSpaceEvent, EllipseGraphics, PointGraphics } from "resium";
import { a } from "framer-motion/client";

class CesiumErrorBoundary extends Component<{
  children: ReactNode;
}, {
  error: string | null;
}> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }

  componentDidCatch(error: Error, info: any) {
    console.error("Cesium boundary caught:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="text-white p-8 bg-red-900 h-screen">
          <h2 className="text-xl font-bold mb-4">Cesium Error:</h2>
          <pre className="text-sm whitespace-pre-wrap">{this.state.error}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export interface SatelliteData {
  id: string;
  name: string;
  position: Cartesian3;
  altitude: number;
  velocity: number;
  tle1: string;
  tle2: string;
  type: "active" | "debris";
}

export default function Globe() {
  const [ready, setReady] = useState(false);
  const [satellites, setSatellites] = useState<SatelliteData[]>([]);
  const [selectedSat, setSelectedSat] = useState<SatelliteData | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "debris">("all");
  const viewerRef = useRef<CesiumComponentRef<CesiumViewer>>(null);
  const [flyoverCount, setFlyoverCount] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [flyoverPanelOpen, setFlyoverPanelOpen] = useState(false);
  const [flyoverObjects, setFlyoverObjects] = useState<SatelliteData[]>([]);
  const [flyoverLocation, setFlyoverLocation] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof window !== 'undefined' && (window as any).Cesium) {
        setReady(true);
        clearInterval(interval);
      }
    }, 100);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const processData = (data: string, type: "active" | "debris", sats: SatelliteData[], seenIds: Set<string>) => {
      const now = new Date();
      const gmst = satellite.gstime(now);
      const lines = data.split("\n");
      for (let i = 0; i < lines.length - 2; i += 3) {
        const name = lines[i].trim();
        const tle1 = lines[i + 1]?.trim();
        const tle2 = lines[i + 2]?.trim();
        if (!tle1?.startsWith('1 ') || !tle2?.startsWith('2 ')) continue;
        try {
          const satrec = satellite.twoline2satrec(tle1, tle2);
          const posVel = satellite.propagate(satrec, now);
          if (
            posVel.position && typeof posVel.position !== "boolean" && !isNaN(posVel.position.x) &&
            posVel.velocity && typeof posVel.velocity !== "boolean"
          ) {
            const posEcf = satellite.eciToEcf(posVel.position, gmst);
            const geodetic = satellite.eciToGeodetic(posVel.position, gmst);
            let uniqueId = name;
            if (seenIds.has(uniqueId)) uniqueId = `${name}-${i}`;
            seenIds.add(uniqueId);
            sats.push({
              id: uniqueId,
              name,
              position: Cartesian3.fromElements(posEcf.x * 1000, posEcf.y * 1000, posEcf.z * 1000),
              altitude: geodetic.height,
              velocity: Math.sqrt(
                Math.pow(posVel.velocity.x, 2) +
                Math.pow(posVel.velocity.y, 2) +
                Math.pow(posVel.velocity.z, 2)
              ),
              tle1,
              tle2,
              type
            });
          }
        } catch { /* skip bad TLEs */ }
      }
    };

    fetch('/api/satellites')
      .then(res => res.json())
      .then((payloads: Array<{ data: string; type: "active" | "debris" }>) => {
        const sats: SatelliteData[] = [];
        const seenIds = new Set<string>();
        payloads.forEach(({ data, type }) => processData(data, type, sats, seenIds));
        console.log(`Loaded ${sats.length} satellites`);
        setSatellites(sats);
        try {
          sessionStorage.setItem('satellite-data', JSON.stringify(sats));
        } catch {
          console.warn('sessionStorage quota exceeded — skipping cache');
        }
      })
      .catch(err => console.error('Failed to load satellites:', err));
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timeout = setTimeout(() => {
      const v = viewerRef.current?.cesiumElement;
      if (v && !v.isDestroyed()) {
        v.canvas.style.width = '100vw';
        v.canvas.style.height = '100vh';
        v.resize();
        v.scene.requestRender();
      }
    }, 500); // wait for DOM to settle
    return () => clearTimeout(timeout);
  }, [ready]);

  useEffect(() => {
    if (satellites.length === 0) return;

    const tick = setInterval(() => {
      const now = new Date();
      const gmst = satellite.gstime(now);

      setSatellites(prev => prev.map(sat => {
        try {
          const satrec = satellite.twoline2satrec(sat.tle1, sat.tle2);
          const posVel = satellite.propagate(satrec, now);
          if (
            !posVel.position || typeof posVel.position === 'boolean' ||
            !posVel.velocity || typeof posVel.velocity === 'boolean'
          ) return sat;

          const posEcf = satellite.eciToEcf(posVel.position, gmst);
          const geodetic = satellite.eciToGeodetic(posVel.position, gmst);

          return {
            ...sat,
            position: Cartesian3.fromElements(posEcf.x * 1000, posEcf.y * 1000, posEcf.z * 1000),
            altitude: geodetic.height,
            velocity: Math.sqrt(
              Math.pow(posVel.velocity.x, 2) +
              Math.pow(posVel.velocity.y, 2) +
              Math.pow(posVel.velocity.z, 2)
            ),
          };
        } catch {
          return sat;
        }
      }));
    }, 5000); // update every 5 seconds

    return () => clearInterval(tick);
  }, [satellites.length]);

  if (!ready) return (
    <div className="h-screen w-screen bg-black flex items-center justify-center">
      <span className="text-slate-500 text-sm font-mono">Initializing...</span>
    </div>
  );

  const handleFlyover = async () => {
    const zip = (document.getElementById('zip-input') as HTMLInputElement)?.value;
    if (!zip || zip.length !== 5) return;
    try {
      const geo = await fetch(`https://api.zippopotam.us/us/${zip}`).then(r => r.json());
      const lat = parseFloat(geo.places[0].latitude);
      const lon = parseFloat(geo.places[0]['longitude']);
      const city = geo.places[0]['place name'];
      const state = geo.places[0]['state abbreviation'];

      if (viewerRef.current?.cesiumElement) {
        viewerRef.current.cesiumElement.camera.flyTo({
          destination: Cartesian3.fromDegrees(lon, lat, 3500000),
          duration: 2.5,
        });
      }

      const now = new Date();
      const gmst = satellite.gstime(now);
      const nearby = satellites.filter((sat) => {
        try {
          const satrec = satellite.twoline2satrec(sat.tle1, sat.tle2);
          const posVel = satellite.propagate(satrec, now);
          if (!posVel.position || typeof posVel.position === 'boolean') return false;
          const geo2 = satellite.eciToGeodetic(posVel.position, gmst);
          const satLat = satellite.degreesLat(geo2.latitude);
          const satLon = satellite.degreesLong(geo2.longitude);
          return Math.abs(satLat - lat) < 12 && Math.abs(satLon - lon) < 12;
        } catch { return false; }
      });

      setFlyoverObjects(nearby);
      setFlyoverCount(nearby.length);
      setFlyoverLocation(`${city}, ${state}`);
      setFlyoverPanelOpen(true);
    } catch {
      console.error('ZIP lookup failed');
    }
  };

  return (
    <CesiumErrorBoundary>
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', overflow: 'hidden' }}>

        {/* ✅ Viewer — direct child of outer div, NOT inside toolbar */}
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
          onSelectedEntityChange={(entity) => {
            if (entity && entity.id) {
              const satData = satellites.find(s => s.name === entity.id);
              setSelectedSat(satData || null);
            } else {
              setSelectedSat(null);
            }
          }}
        >
          <Entity
            position={Cartesian3.fromDegrees(-95.3698, 29.7604, 0)}
            onClick={() => {
              setFlyoverPanelOpen(true);
              setFlyoverLocation('Houston, TX');
              const now = new Date();
              const gmst = satellite.gstime(now);
              const nearby = satellites.filter((sat) => {
                try {
                  const satrec = satellite.twoline2satrec(sat.tle1, sat.tle2);
                  const posVel = satellite.propagate(satrec, now);
                  if (!posVel.position || typeof posVel.position === 'boolean') return false;
                  const geo2 = satellite.eciToGeodetic(posVel.position, gmst);
                  const satLat = satellite.degreesLat(geo2.latitude);
                  const satLon = satellite.degreesLong(geo2.longitude);
                  return Math.abs(satLat - 29.7604) < 12 && Math.abs(satLon - (-95.3698)) < 12;
                } catch { return false; }
              });
              setFlyoverObjects(nearby);
              setFlyoverCount(nearby.length);
              if (viewerRef.current?.cesiumElement) {
                viewerRef.current.cesiumElement.camera.flyTo({
                  destination: Cartesian3.fromDegrees(-95.3698, 29.7604, 3500000),
                  duration: 2.5,
                });
              }
            }}
          >
            <EllipseGraphics
              semiMajorAxis={500000.0}
              semiMinorAxis={500000.0}
              material={Color.RED.withAlpha(0.2)}
              outline={true}
              outlineColor={Color.RED}
            />
          </Entity>

          <ScreenSpaceEventHandler>
            <ScreenSpaceEvent
              type={ScreenSpaceEventType.LEFT_CLICK}
              action={(movement) => {
                if ("position" in movement && movement.position) {
                  const viewer = viewerRef.current?.cesiumElement;
                  if (viewer) {
                    const pickedObject = viewer.scene.pick(movement.position);
                    if (!pickedObject) {
                      setSelectedSat(null);
                      viewer.camera.flyHome(1.5);
                    }
                  }
                }
              }}
            />
          </ScreenSpaceEventHandler>

          {satellites
            .filter((sat) => filter === "all" || sat.type === filter)
            .map((sat) => (
              <Entity
                key={sat.id}
                id={sat.id}
                position={sat.position}
                name={sat.name}
                onClick={() => {
                  setSelectedSat(sat);
                  if (viewerRef.current?.cesiumElement) {
                    const target = viewerRef.current.cesiumElement.entities.getById(sat.id);
                    if (target) {
                      viewerRef.current.cesiumElement.flyTo(target, {
                        duration: 1.5,
                        offset: new HeadingPitchRange(0, CesiumMath.toRadians(-90), 5000000),
                      });
                    }
                  }
                }}
              >
                <PointGraphics
                  pixelSize={sat.type === "active" ? 6 : 4}
                  color={sat.type === "active" ? Color.WHITE : Color.RED}
                />
              </Entity>
            ))}

          {selectedSat && (
            <Entity position={selectedSat.position}>
              <PointGraphics pixelSize={12} color={Color.CYAN} />
            </Entity>
          )}
        </Viewer>

        {/* ✅ Toolbar — overlaid on top via z-index */}
        <div className="absolute top-6 right-6 z-50 flex gap-4 bg-slate-900/80 backdrop-blur-md p-2 rounded-lg border border-slate-700 shadow-2xl">
          <button
            onClick={() => setFilter("all")}
            className={`px-4 py-2 rounded ${filter === "all" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}
          >
            View All
          </button>
          <button
            onClick={() => setFilter("active")}
            className={`px-4 py-2 rounded flex items-center gap-2 ${filter === "active" ? "bg-white text-black" : "text-slate-400 hover:text-white"}`}
          >
            <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
            Active Payloads
          </button>
          <button
            onClick={() => setFilter("debris")}
            className={`px-4 py-2 rounded flex items-center gap-2 ${filter === "debris" ? "bg-red-600 text-white" : "text-slate-400 hover:text-white"}`}
          >
            <span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,1)]"></span>
            Space Debris
          </button>
          <div className="flex items-center gap-2">
            <input
              id="zip-input"
              type="text"
              maxLength={5}
              placeholder="ZIP code..."
              className="w-24 px-2 py-2 rounded bg-slate-800 text-white text-sm border border-slate-600 focus:outline-none focus:border-amber-500"
              onKeyDown={(e) => { if (e.key === 'Enter') handleFlyover(); }}
            />
            <button
              onClick={handleFlyover}
              className="px-4 py-2 rounded bg-amber-600/20 text-amber-500 border border-amber-600/50 hover:bg-amber-600 hover:text-white transition-all font-bold whitespace-nowrap"
            >
              Flyover
            </button>
          </div>
        </div>

        {/* ✅ Flyover count badge */}
        {flyoverCount !== null && (
          <div className="absolute top-20 right-6 z-50 bg-slate-900/90 text-amber-400 text-xs px-4 py-2 rounded-lg border border-amber-600/40">
            {flyoverCount} objects currently near this location
          </div>
        )}

        {/* ✅ Flyover info sidebar */}
        <AnimatePresence>
          {flyoverPanelOpen && (
            <motion.div
              initial={{ opacity: 0, x: -60, filter: "blur(10px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, x: -40, filter: "blur(10px)" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute top-24 left-3 w-[360px] z-50 flex flex-col rounded-3xl overflow-hidden"
              style={{
                maxHeight: 'calc(100vh - 8rem)',
                background: "linear-gradient(135deg, rgba(15,23,42,0.96) 0%, rgba(0,0,0,0.97) 100%)",
                backdropFilter: "blur(20px)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderTop: "1px solid rgba(239,68,68,0.4)",
                boxShadow: "0 20px 50px rgba(0,0,0,0.8)",
                color: "white"
              }}
            >
              {/* Fixed header */}
              <div className="p-6 pb-3 shrink-0">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <span className="uppercase tracking-[0.3em] text-[10px] font-bold text-red-400">Live Overhead Scan</span>
                    <h2 className="text-xl font-light tracking-tight mt-1">
                      {flyoverLocation ?? 'Houston Zone'}
                    </h2>
                  </div>
                  <button
                    onClick={() => setFlyoverPanelOpen(false)}
                    className="p-1 hover:bg-slate-800 rounded-full transition-colors"
                  >
                    <X size={18} className="text-slate-400 hover:text-white" />
                  </button>
                </div>

                {/* Risk score */}
                {flyoverObjects.length > 0 && (() => {
                  const debrisCount = flyoverObjects.filter(s => s.type === 'debris').length;
                  const debrisRatio = debrisCount / flyoverObjects.length;
                  const riskLevel = debrisRatio > 0.5 ? 'HIGH' : debrisRatio > 0.25 ? 'MODERATE' : 'LOW';
                  const riskColor = riskLevel === 'HIGH' ? 'text-red-400 border-red-500/30 bg-red-500/10'
                    : riskLevel === 'MODERATE' ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
                      : 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
                  return (
                    <div className={`flex items-center justify-between p-3 rounded-xl border mb-3 ${riskColor}`}>
                      <div>
                        <div className="text-[10px] uppercase tracking-widest font-bold mb-0.5">Debris Risk Level</div>
                        <div className="text-lg font-bold">{riskLevel}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold">{flyoverObjects.length}</div>
                        <div className="text-[10px] uppercase tracking-widest">objects overhead</div>
                      </div>
                    </div>
                  );
                })()}

                {/* Stats row */}
                {flyoverObjects.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="p-2 rounded-lg bg-white/5 border border-white/10 text-center">
                      <div className="text-sm font-bold text-white">
                        {flyoverObjects.filter(s => s.type === 'active').length}
                      </div>
                      <div className="text-[9px] uppercase tracking-wider text-slate-400">Active</div>
                    </div>
                    <div className="p-2 rounded-lg bg-white/5 border border-white/10 text-center">
                      <div className="text-sm font-bold text-red-400">
                        {flyoverObjects.filter(s => s.type === 'debris').length}
                      </div>
                      <div className="text-[9px] uppercase tracking-wider text-slate-400">Debris</div>
                    </div>
                    <div className="p-2 rounded-lg bg-white/5 border border-white/10 text-center">
                      <div className="text-sm font-bold text-cyan-400">
                        {flyoverObjects.length > 0
                          ? Math.round(flyoverObjects.reduce((a, s) => a + s.altitude, 0) / flyoverObjects.length)
                          : 0} km
                      </div>
                      <div className="text-[9px] uppercase tracking-wider text-slate-400">Avg Alt</div>
                    </div>
                  </div>
                )}

                <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1 px-1">
                  Objects — sorted by altitude
                </div>
              </div>

              {/* Scrollable satellite list */}
              <div className="overflow-y-auto px-6 pb-6 space-y-2" style={{ flex: 1 }}>
                {flyoverObjects.length === 0 && (
                  <div className="text-center text-slate-500 text-xs py-8">No objects detected overhead</div>
                )}
                {flyoverObjects
                  .slice()
                  .sort((a, b) => a.altitude - b.altitude)
                  .map((sat) => (
                    <div
                      key={sat.id}
                      onClick={() => {
                        setSelectedSat(sat);
                        setFlyoverPanelOpen(false);
                        if (viewerRef.current?.cesiumElement) {
                          const target = viewerRef.current.cesiumElement.entities.getById(sat.id);
                          if (target) {
                            viewerRef.current.cesiumElement.flyTo(target, {
                              duration: 1.5,
                              offset: new HeadingPitchRange(0, CesiumMath.toRadians(-90), 5000000),
                            });
                          }
                        }
                      }}
                      className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 hover:border-white/20 transition-all group"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${sat.type === 'debris' ? 'bg-red-500' : 'bg-white'}`} />
                        <span className="text-xs text-slate-200 truncate group-hover:text-white transition-colors">
                          {sat.name}
                        </span>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <div className="text-xs font-mono text-cyan-400">{Math.round(sat.altitude)} km</div>
                        <div className="text-[9px] text-slate-500">{sat.velocity.toFixed(1)} km/s</div>
                      </div>
                    </div>
                  ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ✅ Satellite detail panel */}
        <AnimatePresence>
          {selectedSat && (
            <motion.div
              initial={{ opacity: 0, x: 100, filter: "blur(10px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, x: 50, filter: "blur(10px)" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute top-4 left-3 bottom-4 w-[400px] z-50 flex flex-col p-8 overflow-y-auto rounded-3xl"
              style={{
                background: "linear-gradient(135deg, rgba(15, 23, 42, 0.8) 0%, rgba(0, 0, 0, 0.9) 100%)",
                backdropFilter: "blur(20px)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderTop: "1px solid rgba(0, 255, 204, 0.3)",
                boxShadow: "0 20px 50px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.1)",
                color: "white"
              }}
            >
              <div className="flex justify-between items-start mb-10">
                <div className="flex flex-col">
                  <span className="uppercase tracking-[0.3em] text-[10px] font-bold text-cyan-400 mb-1">Target Locked</span>
                  <span className="text-gray-400 text-xs font-mono">NORAD ID: {selectedSat.name.split(' ')[selectedSat.name.split(' ').length - 1] || 'UNKNOWN'}</span>
                </div>
                <button
                  onClick={() => {
                    setSelectedSat(null);
                    if (viewerRef.current?.cesiumElement) {
                      viewerRef.current.cesiumElement.camera.flyHome(1.5);
                    }
                  }}
                  className="p-1 hover:bg-slate-800 rounded-full transition-colors"
                >
                  <X size={20} className="text-slate-400 hover:text-white" />
                </button>
              </div>
              <h2 className="text-3xl font-light tracking-tight mb-2 pr-4">{selectedSat.name}</h2>
              <div className="flex items-center space-x-3 mb-10 border-b border-white/5 pb-6">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-ping shadow-[0_0_15px_rgba(239,68,68,1)]"></div>
                <span className="text-xs text-red-400 uppercase tracking-widest font-semibold">Active Telemetry</span>
              </div>
              <div className="space-y-6 mb-10">
                <div className="flex flex-col">
                  <div className="flex justify-between items-center mb-2 text-gray-400">
                    <div className="flex items-center space-x-2">
                      <Activity size={16} className="text-cyan-500" />
                      <span className="text-xs uppercase tracking-widest font-semibold">Velocity</span>
                    </div>
                    <span className="text-sm font-mono text-cyan-400">{selectedSat.velocity.toFixed(2)} km/s</span>
                  </div>
                  <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min((selectedSat.velocity / 10) * 100, 100)}%` }}
                      transition={{ duration: 1, delay: 0.2 }}
                      className="h-full bg-cyan-400 shadow-[0_0_10px_#00ffcc]"
                    />
                  </div>
                </div>
                <div className="flex flex-col">
                  <div className="flex justify-between items-center mb-2 text-gray-400">
                    <div className="flex items-center space-x-2">
                      <Mountain size={16} className="text-emerald-500" />
                      <span className="text-xs uppercase tracking-widest font-semibold">Altitude</span>
                    </div>
                    <span className="text-sm font-mono text-emerald-400">{selectedSat.altitude.toFixed(2)} km</span>
                  </div>
                  <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min((selectedSat.altitude / 1000) * 100, 100)}%` }}
                      transition={{ duration: 1, delay: 0.4 }}
                      className="h-full bg-emerald-400 shadow-[0_0_10px_#34d399]"
                    />
                  </div>
                </div>
              </div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                style={{ background: "rgba(99, 102, 241, 0.05)", border: "1px solid rgba(99, 102, 241, 0.1)" }}
                className="p-6 rounded-2xl mt-auto relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-32 h-32 bg-indigo-500/10 blur-3xl rounded-full"></div>
                <div className="flex items-center space-x-2 mb-3 text-indigo-400 relative z-10">
                  <ShieldAlert size={18} />
                  <h3 className="text-xs font-bold uppercase tracking-[0.2em]">Community Impact</h3>
                </div>
                <p className="text-xs text-indigo-100/60 leading-relaxed font-light relative z-10">
                  Tracking extreme weather patterns. Community leaders in Houston utilize this telemetry to predict localized flash flooding and identify urban heat islands.
                </p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ✅ Info drawer button */}
        <button
          onClick={() => setDrawerOpen(o => !o)}
          className="absolute bottom-6 right-6 z-50 px-4 py-2 rounded-full bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-600 hover:text-white transition-all text-sm font-semibold"
        >
          {drawerOpen ? '✕ Close' : '📡 Why This Matters'}
        </button>

        {/* ✅ Info drawer */}
        <AnimatePresence>
          {drawerOpen && (
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              transition={{ type: 'spring', damping: 28, stiffness: 220 }}
              className="absolute bottom-20 right-6 z-50 w-80 rounded-2xl overflow-y-auto max-h-[70vh]"
              style={{
                background: 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(0,0,0,0.98))',
                border: '1px solid rgba(99,102,241,0.2)',
                boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
                color: 'white',
                padding: '1.5rem',
              }}
            >
              <h2 className="text-lg font-bold text-indigo-300 mb-1">Space Debris Crisis</h2>
              <p className="text-xs text-slate-400 mb-4">Why Congress needs to act now</p>
              <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <span className="text-amber-400 font-bold block mb-1">27,000+</span>
                  Tracked objects in orbit — defunct satellites, rocket stages, and collision fragments.
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <span className="text-red-400 font-bold block mb-1">Kessler Syndrome</span>
                  One major collision can trigger a cascade, rendering entire orbital shells permanently unusable.
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <span className="text-cyan-400 font-bold block mb-1">Houston's Stake</span>
                  NASA JSC, energy sector satellite comms, and emergency weather systems all depend on a clean orbital environment.
                </div>
                <div className="p-3 rounded-xl bg-indigo-900/30 border border-indigo-500/30">
                  <span className="text-indigo-300 font-bold block mb-1">What Congress Can Do</span>
                  Mandate deorbit standards, fund active debris removal, and ratify orbital traffic management treaties.
                </div>
              </div>

              <a
                href="https://www.congress.gov"
                target="_blank"
                rel="noreferrer"
                className="block mt-4 text-center py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all"
              >
                📜 Contact Your Representative →
              </a>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </CesiumErrorBoundary >
  );
}