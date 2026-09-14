/** Mission dataset (public/mission.json, built by scripts/export_mission.py)
 *  plus the interpolation and derived telemetry the console reads every frame.
 *
 *  Everything is heliocentric, mean ecliptic J2000, in km and km/s. Positions
 *  are cubic-Hermite interpolated between samples using the exported
 *  velocities, so the scene moves continuously instead of stepping between
 *  10-hour samples. */

export type BodyKey = "earth" | "mars";
export type EventKey = "launch" | "decay" | "flag" | "lock" | "arrival";

export interface MissionEvent {
  h: number;
  key: EventKey;
  label: string;
  detail: string;
}

export interface MissionSummary {
  launchVinfKms?: number;
  launchUtc: string;
  arrivalUtc: string;
  earthMarsAtLaunchKm: number;
  earthMarsAtArrivalKm: number;
  pathLengthKm: number;
  maxRangeEarthKm: number;
  maxLightTimeS: number;
  sunDistanceMinKm: number;
  sunDistanceMaxKm: number;
  speedMinKms: number;
  speedMaxKms: number;
  propellantUsedKg: number;
  deltaVKms: number;
  arrivalMarsRelSpeedKms: number;
  burnHours: number;
}

interface MissionJson {
  meta: {
    epochUtc: string;
    missionHours: number;
    frame: string;
    constants: {
      auKm: number;
      cKms: number;
      g0: number;
      ispNominal: number;
      ispLocked: number;
      dryMassKg: number;
      wetMassKg: number;
      thrustMaxN: number;
      radiiKm: { sun: number; earth: number; mars: number };
    };
    summary: MissionSummary;
  };
  events: MissionEvent[];
  sc: { stepH: number; pos: number[]; vel: number[]; thrust: number[]; dir: number[]; mass: number[]; isp: number[]; dv: number[] };
  planets: {
    stepH: number;
    earth: { pos: number[]; vel: number[]; periodDays: number };
    mars: { pos: number[]; vel: number[]; periodDays: number };
  };
}

export interface Telemetry {
  hour: number;
  date: Date;
  phase: string;
  ispState: "nominal" | "decay" | "flagged" | "locked";
  sc: Float64Array;
  scVel: Float64Array;
  earth: Float64Array;
  mars: Float64Array;
  sunDistKm: number;
  sunDistAu: number;
  speedKms: number;
  earthRangeKm: number;
  lightTimeS: number;
  marsRangeKm: number;
  marsRelSpeedKms: number;
  sepAngleDeg: number;
  thrustN: number;
  thrustFrac: number;
  accelMms2: number;
  ispS: number;
  massKg: number;
  propellantKg: number;
  propellantFrac: number;
  massFlowGh: number;
  dvKms: number;
}

const HOUR_S = 3600;

/** Cubic Hermite on flat xyz arrays: samples every `stepH` hours. */
function hermite(pos: Float64Array, vel: Float64Array, stepH: number, hour: number, outP: Float64Array, outV?: Float64Array) {
  const n = pos.length / 3;
  const x = Math.min(Math.max(hour / stepH, 0), n - 1);
  let i = Math.floor(x);
  if (i >= n - 1) i = n - 2;
  const u = x - i;
  const dt = stepH * HOUR_S;
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  const a = i * 3;
  const b = a + 3;
  for (let k = 0; k < 3; k++) {
    outP[k] = h00 * pos[a + k] + h10 * dt * vel[a + k] + h01 * pos[b + k] + h11 * dt * vel[b + k];
  }
  if (outV) {
    const d00 = 6 * u2 - 6 * u;
    const d10 = 3 * u2 - 4 * u + 1;
    const d01 = -6 * u2 + 6 * u;
    const d11 = 3 * u2 - 2 * u;
    for (let k = 0; k < 3; k++) {
      outV[k] = (d00 * pos[a + k] + d01 * pos[b + k]) / dt + d10 * vel[a + k] + d11 * vel[b + k];
    }
  }
}

function lerpSeries(series: Float64Array, stepH: number, hour: number) {
  const n = series.length;
  const x = Math.min(Math.max(hour / stepH, 0), n - 1);
  const i = Math.min(Math.floor(x), n - 2);
  const u = x - i;
  return series[i] + (series[i + 1] - series[i]) * u;
}

const f64 = (a: number[]) => Float64Array.from(a);

export class Mission {
  readonly hours: number;
  readonly epoch: Date;
  readonly events: MissionEvent[];
  readonly summary: MissionSummary;
  readonly constants: MissionJson["meta"]["constants"];
  readonly scStepH: number;
  readonly planetStepH: number;
  readonly scPos: Float64Array;
  readonly scVel: Float64Array;
  readonly earthPos: Float64Array;
  readonly marsPos: Float64Array;
  readonly periodDays: Record<BodyKey, number>;
  /** Named series sampled every scStepH hours — used for sparklines. */
  readonly series: { thrust: Float64Array; mass: Float64Array; isp: Float64Array; dv: Float64Array };
  private readonly earthVel: Float64Array;
  private readonly marsVel: Float64Array;
  private readonly dir: Float64Array;

  constructor(json: MissionJson) {
    this.hours = json.meta.missionHours;
    this.epoch = new Date(json.meta.epochUtc);
    this.events = json.events;
    this.summary = json.meta.summary;
    this.constants = json.meta.constants;
    this.scStepH = json.sc.stepH;
    this.planetStepH = json.planets.stepH;
    this.scPos = f64(json.sc.pos);
    this.scVel = f64(json.sc.vel);
    this.dir = f64(json.sc.dir);
    this.series = { thrust: f64(json.sc.thrust), mass: f64(json.sc.mass), isp: f64(json.sc.isp), dv: f64(json.sc.dv) };
    this.earthPos = f64(json.planets.earth.pos);
    this.earthVel = f64(json.planets.earth.vel);
    this.marsPos = f64(json.planets.mars.pos);
    this.marsVel = f64(json.planets.mars.vel);
    this.periodDays = { earth: json.planets.earth.periodDays, mars: json.planets.mars.periodDays };
  }

  spacecraft(hour: number, outP: Float64Array, outV?: Float64Array) {
    hermite(this.scPos, this.scVel, this.scStepH, hour, outP, outV);
  }

  body(key: BodyKey, hour: number, outP: Float64Array, outV?: Float64Array) {
    if (key === "earth") hermite(this.earthPos, this.earthVel, this.planetStepH, hour, outP, outV);
    else hermite(this.marsPos, this.marsVel, this.planetStepH, hour, outP, outV);
  }

  /** Commanded thrust direction (unit vector, ecliptic). */
  thrustDir(hour: number, out: Float64Array) {
    const n = this.dir.length / 3;
    const x = Math.min(Math.max(hour / this.scStepH, 0), n - 1);
    const i = Math.min(Math.floor(x), n - 2);
    const u = x - i;
    let m = 0;
    for (let k = 0; k < 3; k++) {
      out[k] = this.dir[i * 3 + k] * (1 - u) + this.dir[(i + 1) * 3 + k] * u;
      m += out[k] * out[k];
    }
    m = Math.sqrt(m) || 1;
    for (let k = 0; k < 3; k++) out[k] /= m;
  }

  sample(name: keyof Mission["series"], hour: number) {
    return lerpSeries(this.series[name], this.scStepH, hour);
  }

  dateAt(hour: number) {
    return new Date(this.epoch.getTime() + hour * HOUR_S * 1000);
  }

  phaseAt(hour: number) {
    if (hour >= this.hours) return "MARS ARRIVAL";
    if (hour >= 1500) return "DEGRADED CRUISE";
    if (hour >= 1497) return "ANOMALY WINDOW";
    if (hour >= 1000) return "THRUSTER DECAY";
    if (hour > 0) return "EARTH DEPARTURE";
    return "PRE-LAUNCH";
  }

  ispStateAt(hour: number): Telemetry["ispState"] {
    if (hour >= 1500) return "locked";
    if (hour >= 1497) return "flagged";
    if (hour >= 1000) return "decay";
    return "nominal";
  }

  telemetry(hour: number, t?: Telemetry): Telemetry {
    const c = this.constants;
    const out: Telemetry = t ?? {
      hour: 0, date: new Date(), phase: "", ispState: "nominal",
      sc: new Float64Array(3), scVel: new Float64Array(3), earth: new Float64Array(3), mars: new Float64Array(3),
      sunDistKm: 0, sunDistAu: 0, speedKms: 0, earthRangeKm: 0, lightTimeS: 0, marsRangeKm: 0, marsRelSpeedKms: 0,
      sepAngleDeg: 0, thrustN: 0, thrustFrac: 0, accelMms2: 0, ispS: 0, massKg: 0, propellantKg: 0, propellantFrac: 0,
      massFlowGh: 0, dvKms: 0,
    };
    const marsVel = scratchV;
    out.hour = hour;
    out.date = this.dateAt(hour);
    out.phase = this.phaseAt(hour);
    out.ispState = this.ispStateAt(hour);
    this.spacecraft(hour, out.sc, out.scVel);
    this.body("earth", hour, out.earth);
    this.body("mars", hour, out.mars, marsVel);

    const s = out.sc;
    const e = out.earth;
    const m = out.mars;
    out.sunDistKm = Math.hypot(s[0], s[1], s[2]);
    out.sunDistAu = out.sunDistKm / c.auKm;
    out.speedKms = Math.hypot(out.scVel[0], out.scVel[1], out.scVel[2]);
    const ex = s[0] - e[0], ey = s[1] - e[1], ez = s[2] - e[2];
    out.earthRangeKm = Math.hypot(ex, ey, ez);
    out.lightTimeS = out.earthRangeKm / c.cKms;
    out.marsRangeKm = Math.hypot(m[0] - s[0], m[1] - s[1], m[2] - s[2]);
    out.marsRelSpeedKms = Math.hypot(out.scVel[0] - marsVel[0], out.scVel[1] - marsVel[1], out.scVel[2] - marsVel[2]);
    // Sun–Earth–Probe angle: small values mean the Sun sits between the
    // antenna's line of sight and the spacecraft (solar conjunction).
    const eSun = Math.hypot(e[0], e[1], e[2]);
    if (out.earthRangeKm > 1) {
      const cos = (-e[0] * ex - e[1] * ey - e[2] * ez) / (eSun * out.earthRangeKm);
      out.sepAngleDeg = (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
    } else {
      out.sepAngleDeg = 180;
    }

    out.thrustN = this.sample("thrust", hour);
    out.thrustFrac = out.thrustN / c.thrustMaxN;
    out.massKg = this.sample("mass", hour);
    out.accelMms2 = (out.thrustN / out.massKg) * 1000;
    out.ispS = this.sample("isp", hour);
    out.propellantKg = Math.max(0, out.massKg - c.dryMassKg);
    out.propellantFrac = out.propellantKg / (c.wetMassKg - c.dryMassKg);
    out.massFlowGh = (out.thrustN / (out.ispS * c.g0)) * HOUR_S * 1000;
    out.dvKms = this.sample("dv", hour);
    return out;
  }
}

const scratchV = new Float64Array(3);

export async function loadMission(url: string, signal?: AbortSignal): Promise<Mission> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Mission data request failed: ${res.status}`);
  const json = (await res.json()) as MissionJson;
  if (!json?.sc?.pos?.length) throw new Error("Mission dataset is empty");
  return new Mission(json);
}

/* ---------- formatting ---------- */

const pad = (n: number, w = 2) => String(Math.floor(n)).padStart(w, "0");

export function formatUtc(d: Date) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function formatMet(hour: number) {
  const whole = Math.floor(hour);
  return `T+${String(whole).padStart(5, "0")}`;
}

export function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds - m * 60);
  return m > 0 ? `${m}m ${pad(s)}s` : `${s}s`;
}

export const nf = (v: number, digits = 0) =>
  v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
