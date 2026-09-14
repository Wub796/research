import type { Mission, MissionEvent } from "../../lib/mission";

/** Continuous mission clock, advanced once per rendered frame by the scene.
 *
 *  Playback rate is expressed in mission hours per real second. With "event
 *  hold" on, the clock eases down as it approaches a mission event so the
 *  three hours between the Isolation Forest flag and the Isp lock are
 *  actually watchable, then eases back up — the rate follows a critically
 *  damped approach rather than snapping. */

export const RATES = [
  { label: "1 D/S", hps: 24 },
  { label: "5 D/S", hps: 120 },
  { label: "20 D/S", hps: 480 },
  { label: "60 D/S", hps: 1440 },
] as const;

const HOLDS: { from: number; to: number; cap: number }[] = [
  { from: 975, to: 1004, cap: 8 },
  { from: 1470, to: 1508, cap: 1.5 },
];

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class SimClock {
  hour = 0;
  playing = false;
  rate: number = RATES[2].hps;
  hold = true;
  /** Rate actually applied this frame (after holds), for the UI readout. */
  effectiveRate = 0;

  private tween: { from: number; to: number; t: number; dur: number } | null = null;
  private listeners = new Set<() => void>();
  private eventListeners = new Set<(e: MissionEvent, direction: 1 | -1) => void>();
  private version = 0;

  constructor(private readonly mission: Mission) {}

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  onEvent(fn: (e: MissionEvent, direction: 1 | -1) => void) {
    this.eventListeners.add(fn);
    return () => this.eventListeners.delete(fn);
  }

  getVersion = () => this.version;

  private emit() {
    this.version++;
    this.listeners.forEach((fn) => fn());
  }

  private cap(hour: number) {
    if (!this.hold) return Infinity;
    let cap = Infinity;
    for (const h of HOLDS) {
      if (hour >= h.from && hour < h.to) cap = Math.min(cap, h.cap);
    }
    const left = this.mission.hours - hour;
    if (left < 240) cap = Math.min(cap, Math.max(18, left * 1.2));
    return cap;
  }

  /** Advance by `dt` real seconds. Returns true when the hour changed. */
  tick(dt: number) {
    // clamp long frames (tab switches, first frame) without slowing the
    // clock on devices that simply render slowly
    const step = Math.min(Math.max(dt, 0), 0.25);
    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + step / tw.dur);
      this.setHourInternal(tw.from + (tw.to - tw.from) * easeInOut(tw.t), false);
      if (tw.t >= 1) this.tween = null;
      this.emit();
      return true;
    }
    if (!this.playing) {
      this.effectiveRate = 0;
      return false;
    }
    const target = Math.min(this.rate, this.cap(this.hour));
    // exponential approach (τ ≈ 0.3 s) toward the capped rate
    const k = 1 - Math.exp(-step / 0.3);
    this.effectiveRate = this.effectiveRate + (target - this.effectiveRate) * k;
    if (this.effectiveRate > target) this.effectiveRate = Math.max(target, this.effectiveRate);
    const next = this.hour + this.effectiveRate * step;
    if (next >= this.mission.hours) {
      this.setHourInternal(this.mission.hours, true);
      this.playing = false;
      this.effectiveRate = 0;
    } else {
      this.setHourInternal(next, true);
    }
    this.emit();
    return true;
  }

  private setHourInternal(next: number, announce: boolean) {
    const prev = this.hour;
    this.hour = Math.min(Math.max(next, 0), this.mission.hours);
    if (!announce || prev === this.hour) return;
    const dir: 1 | -1 = this.hour > prev ? 1 : -1;
    for (const e of this.mission.events) {
      const crossed = dir === 1 ? prev < e.h && this.hour >= e.h : prev >= e.h && this.hour < e.h;
      if (crossed && e.h > 0) this.eventListeners.forEach((fn) => fn(e, dir));
    }
  }

  /** Jump to an hour. `animate` scrubs there over `dur` seconds (used for
   *  event jumps so the scene travels instead of teleporting). */
  seek(hour: number, animate = false, dur = 0.9) {
    this.tween = null;
    if (animate && Math.abs(hour - this.hour) > 1) {
      this.tween = { from: this.hour, to: hour, t: 0, dur };
    } else {
      this.setHourInternal(hour, false);
    }
    this.emit();
  }

  play() {
    if (this.hour >= this.mission.hours) this.hour = 0;
    this.tween = null;
    this.playing = true;
    this.emit();
  }

  pause() {
    this.playing = false;
    this.effectiveRate = 0;
    this.emit();
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  setRate(hps: number) {
    this.rate = hps;
    this.emit();
  }

  setHold(on: boolean) {
    this.hold = on;
    this.emit();
  }
}
