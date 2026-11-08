'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { motion, useMotionTemplate, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from 'framer-motion';
import dynamic from 'next/dynamic';
import { useLenis } from 'lenis/react';
import BootScreen, { type BootStage } from '../components/BootScreen';
import HeroOrrery from '../components/HeroOrrery';
import SignalChart from '../components/SignalChart';
import SmoothScroll from '../components/SmoothScroll';
import { DecodeText, Magnetic } from '../components/fx';
import BlurText from '../components/bits/BlurText';
import { orrery } from '../lib/orrery.generated';
import { pub } from '../lib/paths';

const DynamicGlobe = dynamic(() => import('../components/Globe'), { ssr: false });
const DynamicMissionPan = dynamic(() => import('../components/MissionPan'), { ssr: false });

const EDITORIAL = [0.16, 1, 0.3, 1] as const;

const researchChapters = [
  {
    number: '01',
    label: 'THE QUESTION',
    spec: 'DWG 01-A · SPT-140 DISCHARGE EROSION',
    title: 'Can a policy learn to fly when the engine forgets how to burn?',
    body: 'ARES-1 tests autonomous flight guidance against a severe operational constraint: Hall thruster discharge channel erosion degrades performance in deep space while ground replanning delays compound over millions of kilometers.',
  },
  {
    number: '02',
    label: 'THE METHOD',
    spec: 'DWG 02-B · 11-STATE NEURAL PILOT + COLLECTIVE IF',
    title: 'Collective residual monitoring meets two-stage curriculum guidance.',
    body: 'A 24-hour collective window with secant-slope features detects gradual thruster decay with F₁ = 0.990 and zero false alarms. A 243-parameter neural pilot (11 → 16 → 3) adapts continuous 3D pointing and throttle in 1.94 microseconds.',
  },
  {
    number: '03',
    label: 'THE FINDING',
    spec: 'DWG 03-C · 55.8% TRAJECTORY ERROR REDUCTION',
    title: 'Immediate onboard intervention prevents millions of kilometers of drift.',
    body: 'Across 100 dispersed degradation scenarios, onboard autonomy cuts median terminal miss distance from 5.87M km to 2.60M km (a 55.8% reduction), scaling to 4.13M km of error prevented under extreme wear.',
  },
];

const summary = orrery.summary;
const fmtM = (km: number) => `${Math.round(km / 1e6).toLocaleString('en-US')}M KM`;

function Parallax({ children, from = 80, to = -80, className }: { children: ReactNode; from?: number; to?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion() ?? false;
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [from, to]);
  const transform = useMotionTemplate`translate3d(0, ${y}px, 0)`;
  return <motion.div ref={ref} className={className} style={{ transform }}>{children}</motion.div>;
}

function MaskedWords({ text }: { text: string }) {
  return (
    <h2>
      {text.split(' ').map((word, i) => (
        <span className="mask-word" key={i}>
          <motion.span
            className="mask-word-inner"
            variants={{
              hidden: { transform: 'translateY(115%)' },
              visible: { transform: 'translateY(0%)', transition: { duration: 0.75, ease: EDITORIAL, delay: 0.05 * i } },
            }}
          >
            {word}{' '}
          </motion.span>
        </span>
      ))}
    </h2>
  );
}

function ScrubStatement({ lines }: { lines: { text: string; em?: boolean }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion() ?? false;
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const wordCount = lines.reduce((a, l) => a + l.text.split(' ').length, 0);

  if (reduce) {
    return (
      <h2 ref={ref}>
        {lines.map((l, i) => (
          <span key={i}>
            {i > 0 && <br />}
            {l.em ? <em>{l.text}</em> : l.text}
          </span>
        ))}
      </h2>
    );
  }
  return (
    <h2 ref={ref}>
      {lines.map((l, li) => {
        const before = lines.slice(0, li).reduce((a, x) => a + x.text.split(' ').length, 0);
        return (
          <span key={li}>
            {li > 0 && <br />}
            {l.text.split(' ').map((word, wi) => {
              const idx = before + wi;
              return (
                <ScrubWord key={wi} progress={scrollYProgress} start={(idx / wordCount) * 0.45} end={((idx + 1) / wordCount) * 0.45} em={l.em}>
                  {word}
                </ScrubWord>
              );
            })}
          </span>
        );
      })}
    </h2>
  );
}

function ScrubWord({ progress, start, end, em, children }: { progress: MotionValue<number>; start: number; end: number; em?: boolean; children: ReactNode }) {
  const opacity = useTransform(progress, [start, end], [0.14, 1]);
  return em
    ? <motion.em style={{ opacity }}>{children}{' '}</motion.em>
    : <motion.span style={{ opacity }}>{children}{' '}</motion.span>;
}

/** Precision technical CAD schematics in the sticky 3-act stage parade */
function StageObject({ index, spring, reduce }: { index: number; spring: MotionValue<number>; reduce: boolean }) {
  const center = index / 3 + 1 / 6;
  const half = 1 / 6;
  const [p0, p1] = [center - half, center + half];
  const scale = useTransform(spring, [p0, center, p1], reduce ? [1, 1, 1] : [0.38, 1.16, 0.38]);
  const rotateY = useTransform(spring, [p0, center, p1], reduce ? [0, 0, 0] : [-82, 0, 82]);
  const x = useTransform(spring, [p0, center, p1], reduce ? [0, 0, 0] : [110, 0, -110]);
  const opacity = useTransform(spring, [p0, center, p1], reduce ? [1, 1, 1] : [0.08, 1, 0.08]);
  const depth = useTransform(spring, [p0, center, p1], reduce ? ['blur(0px)', 'blur(0px)', 'blur(0px)'] : ['blur(4px)', 'blur(0px)', 'blur(4px)']);
  const transform = useMotionTemplate`translate3d(${x}px, 0, 0) rotateY(${rotateY}deg) scale(${scale})`;

  return (
    <motion.div className={`stage-object stage-object-${index + 1}`} style={{ transform, opacity, filter: depth }}>
      {index === 0 && (
        <svg viewBox="-160 -160 320 320" className="stage-schematic">
          <circle r="142" className="stage-schematic__outer" />
          <circle r="110" className="stage-schematic__channel" />
          <circle r="68" className="stage-schematic__inner" />
          <circle r="24" className="stage-schematic__core" />
          <line x1="-152" y1="0" x2="152" y2="0" className="stage-schematic__axis" />
          <line x1="0" y1="-152" x2="0" y2="152" className="stage-schematic__axis" />
          <line x1="-110" y1="-132" x2="110" y2="-132" className="stage-schematic__dim" />
          <text x="0" y="-138" textAnchor="middle">Ø 140 MM ANNULUS · SPT-140</text>
          <text x="0" y="138" textAnchor="middle">P(h) = P₀ − k ln(1 + h/τ) · R² = 0.9996</text>
        </svg>
      )}
      {index === 1 && (
        <svg viewBox="-160 -160 320 320" className="stage-schematic">
          <circle r="138" className="stage-schematic__outer" />
          <ellipse rx="138" ry="68" transform="rotate(32)" className="stage-schematic__orbit" />
          <ellipse rx="138" ry="68" transform="rotate(-32)" className="stage-schematic__orbit is-muted" />
          <polygon points="0,-54 47,27 -47,27" className="stage-schematic__poly" />
          <circle r="8" className="stage-schematic__core" />
          <text x="0" y="-144" textAnchor="middle">NEURAL PILOT [11 → 16 → 3 TANH]</text>
          <text x="0" y="148" textAnchor="middle">243 WEIGHTS · 1.90 KB RAM · 1.94 µS</text>
        </svg>
      )}
      {index === 2 && (
        <svg viewBox="-160 -160 320 320" className="stage-schematic">
          <rect x="-136" y="-136" width="272" height="272" className="stage-schematic__outer" />
          <line x1="-136" y1="36" x2="136" y2="36" className="stage-schematic__orbit" />
          <line x1="-28" y1="-136" x2="-28" y2="136" className="stage-schematic__axis is-warn" />
          <line x1="28" y1="-136" x2="28" y2="136" className="stage-schematic__orbit" />
          <path d="M-120,-80 Q-50,15 -28,32 L28,36 L120,36" className="stage-schematic__curve" />
          <rect x="-33" y="27" width="10" height="10" transform="rotate(45 -28 32)" className="stage-schematic__mark-warn" />
          <rect x="23" y="31" width="10" height="10" transform="rotate(45 28 36)" className="stage-schematic__mark-crit" />
          <text x="0" y="-114" textAnchor="middle">55.8% MISS CUT · 5.87M → 2.60M KM</text>
          <text x="0" y="122" textAnchor="middle">4.13M KM ERROR PREVENTED @ 25% WEAR</text>
        </svg>
      )}
    </motion.div>
  );
}

function ResearchChapter({ number, label, spec, title, body }: (typeof researchChapters)[number]) {
  const sectionRef = useRef<HTMLElement>(null);
  const reduce = useReducedMotion() ?? false;
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start end', 'end start'] });
  const numY = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [48, -48]);
  const copyY = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [120, -120]);
  const copySkew = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [-2.5, 2.5]);
  const ghostY = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [240, -240]);
  const ghostRotate = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [-2.6, 2.6]);
  const ghostOpacity = useTransform(scrollYProgress, [0, 0.1, 0.9, 1], reduce ? [0, 0, 0, 0] : [0, 0.7, 0.7, 0]);
  const numTransform = useMotionTemplate`translate3d(0, ${numY}px, 0)`;
  const copyTransform = useMotionTemplate`translate3d(0, ${copyY}px, 0) skewY(${copySkew}deg)`;
  const ghostTransform = useMotionTemplate`translate3d(0, ${ghostY}px, 0) rotate(${ghostRotate}deg)`;

  return (
    <motion.section
      ref={sectionRef}
      className="research-chapter"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.3 }}
      variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 0.7, ease: EDITORIAL } } }}
    >
      <span className="chapter-ghost" aria-hidden="true">
        <motion.span style={{ transform: ghostTransform, opacity: ghostOpacity }}>{label}</motion.span>
      </span>
      <motion.div className="chapter-number" style={{ transform: numTransform }}>
        <span>{number}</span>
        <small>{spec}</small>
      </motion.div>
      <motion.div className="chapter-copy" style={{ transform: copyTransform }}>
        <p className="chapter-label"><DecodeText text={label} /></p>
        {reduce ? <h2>{title}</h2> : <MaskedWords text={title} />}
        <p>{body}</p>
      </motion.div>
    </motion.section>
  );
}

function ConsolePortal({ children, sectionRef }: { children: ReactNode; sectionRef: RefObject<HTMLElement> }) {
  const reduce = useReducedMotion() ?? false;
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start end', 'start start'] });
  const p = useSpring(scrollYProgress, { stiffness: 150, damping: 32, mass: 0.5 });
  const top = useTransform(p, [0, 1], reduce ? [0, 0] : [10, 0]);
  const side = useTransform(p, [0, 1], reduce ? [0, 0] : [7, 0]);
  const radius = useTransform(p, [0, 1], reduce ? [0, 0] : [24, 0]);
  const clipPath = useMotionTemplate`inset(${top}% ${side}% 0% ${side}% round ${radius}px)`;
  const push = useTransform(p, [0, 1], reduce ? [1, 1] : [1.05, 1]);
  const bodyTransform = useMotionTemplate`scale(${push})`;
  return (
    <motion.section ref={sectionRef} id="section-console" className="research-console-entry" aria-label="Live ARES-1 console" style={{ clipPath }}>
      <div className="research-console-label">
        <span>05 · LIVE 3D HELIOCENTRIC INSTRUMENT</span>
        <span className="research-console-facts">
          {summary.launchUtc.slice(0, 10)} → {summary.arrivalUtc.slice(0, 10)} · {fmtM(summary.pathLengthKm)} FLOWN · C3 {(summary.launchVinfKms ** 2).toFixed(1)} KM²/S² · ENGINE Δv {summary.deltaVKms.toFixed(2)} KM/S
        </span>
      </div>
      <motion.div className="research-console-body" style={{ transform: bodyTransform }}>{children}</motion.div>
    </motion.section>
  );
}

const REGIMES = [
  {
    key: 'nominal',
    tag: 'NOMINAL · T+0500 H',
    tone: 'ok',
    isp: '1,782.0 s (R² = 0.9996)',
    flow: '5.12 mg/s Xe',
    ifScore: '0.140 (NOMINAL)',
    ifGate: 'BELOW 0.65 THRESHOLD',
    pilotOutput: 'δ=1.000 · α=+0.0° · β=+0.0°',
    thrust: '279.9 mN @ 4.5 kW',
    summary: 'Thruster operates on nominal design plateau (279.9 mN, 1,782.0 s). 24-hour collective residuals remain quiescent while the 243-parameter neural pilot tracks Stage 1 nominal guidance.',
  },
  {
    key: 'flagged',
    tag: 'FLAGGED · T+1497 H',
    tone: 'warn',
    isp: '1,514.96 s',
    flow: '6.02 mg/s Xe',
    ifScore: '0.654 (GATE TRIPPED)',
    ifGate: '3.0 H EARLY WARNING',
    pilotOutput: 'δ=1.000 · α=+3.8° · β=+1.2°',
    thrust: '246.5 mN DEGRADED',
    summary: 'Collective Isolation Forest trips at hour 1,497 (F₁ = 0.990, 0 false alarms across 100 missions). Neural pilot adjusts 3D pitch and yaw to arrest energy drain 180 minutes before mechanical lock.',
  },
  {
    key: 'locked',
    tag: 'LOCKED · T+1500 H',
    tone: 'crit',
    isp: '1,514.70 s LOCKED',
    flow: '6.03 mg/s Xe',
    ifScore: '0.880 (CLAMPED)',
    ifGate: 'PERMANENT −15.0% ISP',
    pilotOutput: 'δ=1.000 · α=+5.4° · β=+2.1°',
    thrust: '246.4 mN CLAMPED',
    summary: 'Channel erosion locks specific impulse at 1,514.7 s. Autonomous closed-loop guidance absorbs the 15% efficiency deficit, closing Mars encounter within 2.60M km vs. 5.87M km open-loop drift.',
  },
] as const;

const SPEC_MODULES = [
  {
    code: 'SYS-01',
    title: 'OBSERVATION VECTOR & EPHEMERIS',
    spec: 'o ∈ ℝ¹¹ · J2000 ECLIPTIC',
    body: '11-dimensional normalized state: Mars-relative position & velocity, radial heliocentric distance & velocity, propellant mass fraction, time fraction, and believed engine health.',
    metric: '11-D STATE · DOP853 RK8',
    crisis: false,
  },
  {
    code: 'SYS-02',
    title: 'COLLECTIVE ANOMALY DETECTOR',
    spec: 'w = 24 H · 50 TREES · τ = 0.65',
    body: '24-hour rolling residual window and AP Calculus AB secant slope filter. Achieves F₁ = 0.990 (precision 1.000, recall 0.980, 0 false alarms) vs. Point-Only F₁ = 0.543.',
    metric: 'F₁ = 0.990 (COLLECTIVE)',
    crisis: true,
  },
  {
    code: 'SYS-03',
    title: 'NEURAL GUIDANCE PILOT',
    spec: '11 → 16 → 3 TANH · 243 WEIGHTS',
    body: 'Ultra-compact policy trained via two-stage curriculum with PPO proximal clipping bounds (ε_clip = 0.05). Cuts median terminal miss by 55.8% (5.87M → 2.60M km).',
    metric: '1.94 µS · 1.90 KB RAM',
    crisis: false,
  },
  {
    code: 'SYS-04',
    title: 'SPT-140 HALL THRUSTER',
    spec: '4.5 KW · 1,099 KG USABLE XE',
    body: 'Calibrated logarithmic wear fit against Kamhawi et al. (R² = 0.9966 thrust, R² = 0.9996 Isp). Wet mass 2,747 kg, dry mass 1,648 kg. Nominal 279.9 mN thrust, 1,782 s Isp.',
    metric: 'R² = 0.9996 LOG FIT',
    crisis: true,
  },
];

/** Interactive Closed-Loop Telemetry Schematic & Dimensional Spec Sheet */
function GuidanceArchitectureSpec() {
  const [regimeIdx, setRegimeIdx] = useState(1); // default to T+1497 H flagged state
  const regime = REGIMES[regimeIdx];

  return (
    <section className="arch-spec" id="section-architecture" aria-label="Closed-loop guidance architecture and technical specification">
      <div className="arch-spec__inner">
        <div className="arch-spec__header">
          <div>
            <p className="research-index"><DecodeText text="04 · CLOSED-LOOP ARCHITECTURE & SPEC SHEET" /></p>
            <h2>
              Four subsystems. <em>One closed loop.</em>
            </h2>
          </div>
          <div className="arch-spec__controls" role="group" aria-label="Select telemetry regime">
            {REGIMES.map((r, i) => (
              <button
                key={r.key}
                type="button"
                className={`arch-spec__btn is-${r.tone}${regimeIdx === i ? ' is-active' : ''}`}
                onClick={() => setRegimeIdx(i)}
              >
                <span className="arch-spec__dot" />
                {r.tag}
              </button>
            ))}
          </div>
        </div>

        {/* Interactive Node-and-Bus Engineering Schematic */}
        <div className={`arch-diagram is-${regime.tone}`}>
          <div className="arch-diagram__titlebar">
            <span>SCHEMATIC DWG · ARES-1-LOOP-04 // CLOSED-LOOP TELEMETRY BUS</span>
            <span>ACTIVE REGIME: {regime.tag}</span>
          </div>

          <svg className="arch-diagram__svg" viewBox="0 0 960 310" role="img" aria-label={`Closed-loop architecture schematic in ${regime.tag} regime`}>
            {/* Technical grid hairlines */}
            <g className="arch-diagram__grid">
              {[120, 240, 360, 480, 600, 720, 840].map((x) => (
                <line key={x} x1={x} y1={0} x2={x} y2={310} />
              ))}
              {[75, 155, 235].map((y) => (
                <line key={y} x1={0} y1={y} x2={960} y2={y} />
              ))}
            </g>

            {/* Dimension callouts (top) */}
            <g className="arch-diagram__dims">
              <line x1={40} y1={28} x2={920} y2={28} />
              <line x1={40} y1={22} x2={40} y2={34} />
              <line x1={920} y1={22} x2={920} y2={34} />
              <text x={480} y={21} textAnchor="middle">CLOSED-LOOP CONTROL CYCLE · Δt = 1.0 H STEP · 11,040 STEPS TOTAL</text>
            </g>

            {/* Signal Buses (Base + Animated Pulse Traces) */}
            <g className="arch-diagram__buses">
              {/* Forward bus 1->2, 2->3, 3->4 */}
              <path d="M220,130 L275,130" className="arch-bus-base" />
              <path d="M465,130 L520,130" className="arch-bus-base" />
              <path d="M710,130 L765,130" className="arch-bus-base" />
              {/* Feedback bus 4 -> 1 & 2 */}
              <path d="M842,195 L842,262 L130,262 L130,195" className="arch-bus-base" />
              <path d="M370,262 L370,195" className="arch-bus-base" />

              {/* Animated live pulse traces */}
              <path d="M220,130 L275,130" className="arch-bus-pulse" />
              <path d="M465,130 L520,130" className="arch-bus-pulse is-alert" />
              <path d="M710,130 L765,130" className="arch-bus-pulse" />
              <path d="M842,195 L842,262 L130,262 L130,195" className="arch-bus-pulse is-feedback" />
            </g>

            {/* NODE 01: Ephemeris & State */}
            <g transform="translate(40, 65)" className="arch-node">
              <rect width="180" height="130" rx="2" className="arch-node__box" />
              <text x="14" y="24" className="arch-node__id">01 // OBSERVATION VECTOR</text>
              <text x="14" y="46" className="arch-node__name">11-STATE COMPACT OBS</text>
              <line x1="14" y1="58" x2="166" y2="58" className="arch-node__rule" />
              <text x="14" y="78" className="arch-node__kv">OBS: o_t ∈ ℝ¹¹ (r, v, m, t, h)</text>
              <text x="14" y="96" className="arch-node__kv">SOLVER: DOP853 RK8</text>
              <text x="14" y="114" className="arch-node__val">ARC: 948.1M KM</text>
            </g>

            {/* NODE 02: Isolation Forest */}
            <g transform="translate(275, 65)" className="arch-node is-detector">
              <rect width="190" height="130" rx="2" className="arch-node__box" />
              <text x="14" y="24" className="arch-node__id">02 // ANOMALY DETECTOR</text>
              <text x="14" y="46" className="arch-node__name">COLLECTIVE IF (w=24H)</text>
              <line x1="14" y1="58" x2="176" y2="58" className="arch-node__rule" />
              <text x="14" y="78" className="arch-node__kv">F₁ SCORE: 0.990 (P=1.0, R=0.98)</text>
              <text x="14" y="96" className="arch-node__kv">GATE: {regime.ifGate}</text>
              <text x="14" y="114" className="arch-node__val">FLOW: {regime.flow}</text>
            </g>

            {/* NODE 03: Neural Policy */}
            <g transform="translate(520, 65)" className="arch-node">
              <rect width="190" height="130" rx="2" className="arch-node__box" />
              <text x="14" y="24" className="arch-node__id">03 // AUTONOMOUS POLICY</text>
              <text x="14" y="46" className="arch-node__name">243-WEIGHT MLP</text>
              <line x1="14" y1="58" x2="176" y2="58" className="arch-node__rule" />
              <text x="14" y="78" className="arch-node__kv">ARCH: 11 → 16 → 3 TANH</text>
              <text x="14" y="96" className="arch-node__kv">LATENCY: 1.94 µs (1.90 KB)</text>
              <text x="14" y="114" className="arch-node__val">{regime.pilotOutput}</text>
            </g>

            {/* NODE 04: SPT-140 Thruster */}
            <g transform="translate(765, 65)" className="arch-node is-thruster">
              <rect width="155" height="130" rx="2" className="arch-node__box" />
              <text x="14" y="24" className="arch-node__id">04 // PROPULSION</text>
              <text x="14" y="46" className="arch-node__name">SPT-140 HALL</text>
              <line x1="14" y1="58" x2="141" y2="58" className="arch-node__rule" />
              <text x="14" y="78" className="arch-node__kv">THRUST: {regime.thrust}</text>
              <text x="14" y="96" className="arch-node__kv">XENON: 1,099 KG USABLE</text>
              <text x="14" y="114" className="arch-node__val">ISP: {regime.isp}</text>
            </g>

            <text x={480} y={284} textAnchor="middle" className="arch-diagram__fb-label">
              ← CLOSED-LOOP STATE PROPAGATION & 24H RESIDUAL FEEDBACK BUS (r_t+1, v_t+1, m_t+1, Isp_t, h_t)
            </text>
          </svg>

          <div className="arch-diagram__footer">
            <p>{regime.summary}</p>
          </div>
        </div>

        {/* 4-Column Engineering Specification Ledger */}
        <div className="arch-spec__grid">
          {SPEC_MODULES.map((mod) => (
            <article key={mod.code} className={`arch-spec__card${mod.crisis ? ' is-crisis' : ''}`}>
              <div className="arch-spec__card-top">
                <span className="arch-spec__code"><DecodeText text={mod.code} /></span>
                <span className="arch-spec__subspec">{mod.spec}</span>
              </div>
              <h3>{mod.title}</h3>
              <p>{mod.body}</p>
              <div className="arch-spec__metric">
                <DecodeText text={mod.metric} />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ResearchLanding({ cesiumReady, booted, onInstrumentReady, onStage }: { cesiumReady: boolean; booted: boolean; onInstrumentReady: () => void; onStage: (s: 'data' | 'scene') => void }) {
  const pageRef = useRef<HTMLElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const consoleRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion() ?? false;
  const lenis = useLenis();

  const { scrollYProgress } = useScroll({ target: pageRef });
  const progress = useSpring(scrollYProgress, { stiffness: 90, damping: 24 });
  const titleY = useTransform(progress, [0, 0.12], reduce ? [0, 0] : [0, -90]);
  const titleOpacity = useTransform(progress, [0, 0.1], [1, 0]);
  const titleTransform = useMotionTemplate`translate3d(0, ${titleY}px, 0)`;

  const { scrollYProgress: stageProgress } = useScroll({ target: stageRef, offset: ['start start', 'end end'] });
  const stageSpring = useSpring(stageProgress, { stiffness: 90, damping: 24 });
  const trackY = useTransform(stageSpring, [0, 1], reduce ? [56, 56] : [56, -56]);
  const trackX = useTransform(stageSpring, [0, 1], reduce ? [0, 0] : [5, -5]);
  const deepY = useTransform(stageSpring, [0, 1], reduce ? [30, 30] : [34, -34]);
  const trackTransform = useMotionTemplate`translate3d(${trackX}vw, ${trackY}vh, 0)`;
  const deepTransform = useMotionTemplate`translate3d(0, ${deepY}vh, 0)`;

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (lenis) lenis.scrollTo(el, { duration: 1.8, easing: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2) });
    else el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };

  const jumpToConsole = () => scrollToSection('section-console');

  const enter = (delay: number, y = 26, blur = 10) => ({
    initial: reduce ? false : { opacity: 0, transform: `translate3d(0, ${y}px, 0)`, filter: `blur(${blur}px)` },
    animate: booted ? { opacity: 1, transform: 'translate3d(0, 0px, 0)', filter: 'blur(0px)' } : undefined,
    transition: { duration: 0.95, ease: EDITORIAL, delay },
  });

  return (
    <main className="research-site" ref={pageRef}>
      <motion.div className="research-progress" style={{ scaleX: progress }} />

      {/* Sticky Technical Index & Title Block Bar */}
      <header className="research-nav" aria-label="Technical document navigation">
        <div className="research-nav__brand">
          <span className="research-nav__dot" aria-hidden="true" />
          <strong>ARES-1</strong>
          <span className="research-nav__doc">TM-2026-001 · AUTONOMOUS FAULT-TOLERANT NEURAL GUIDANCE</span>
        </div>
        <nav className="research-nav__links">
          <button type="button" onClick={() => scrollToSection('section-orbit')}>00 ORBIT</button>
          <button type="button" onClick={() => scrollToSection('section-brief')}>01 BRIEF</button>
          <button type="button" onClick={() => scrollToSection('section-signal')}>02 SIGNAL</button>
          <button type="button" onClick={() => scrollToSection('section-filmstrip')}>03 FILMSTRIP</button>
          <button type="button" onClick={() => scrollToSection('section-architecture')}>04 SPEC SHEET</button>
          <button type="button" className="is-cta" onClick={jumpToConsole}>05 CONSOLE ↘</button>
        </nav>
      </header>

      <section className="research-hero" id="section-orbit" ref={heroRef}>
        <motion.div className="research-topline" {...enter(0, -14, 0)}>
          <span><DecodeText text="ARES-1 / FIELD NOTE 001 · J2000 ECLIPTIC TRANSFER" active={booted} /></span>
          <span><DecodeText text="EARTH → MARS · 2027-02-19 TO 2028-05-24 UTC" active={booted} delay={120} /></span>
        </motion.div>
        <motion.div
          className="research-orrery-wrap"
          initial={reduce ? false : { opacity: 0, transform: 'scale(0.94)' }}
          animate={booted ? { opacity: 1, transform: 'scale(1)' } : undefined}
          transition={{ duration: 1.6, ease: EDITORIAL, delay: 0.1 }}
        >
          <HeroOrrery booted={booted} target={heroRef} />
        </motion.div>
        <motion.div className="research-hero-copy" style={{ transform: titleTransform, opacity: titleOpacity }}>
          <motion.p className="research-kicker" {...enter(0.18)}>
            <DecodeText text="00 · ASTRODYNAMICS & FAULT-TOLERANT CONTROL" active={booted} delay={180} />
          </motion.p>
          <motion.h1 {...enter(0.28, 34, 12)}>ARES<span>1.</span></motion.h1>
          <motion.p className="research-deck" {...enter(0.4, 30, 8)}>
            What happens when autonomous guidance has to keep flying after propulsion starts to fail?
          </motion.p>
          <motion.div className="research-hero-actions" {...enter(0.52, 22, 0)}>
            <Magnetic>
              <button className="research-launch" onClick={jumpToConsole}>
                ENTER ARES-1 CONSOLE <span className="research-launch-arrow">↘</span>
              </button>
            </Magnetic>
            <button type="button" className="research-secondary-btn" onClick={() => scrollToSection('section-signal')}>
              INSPECT ISP SIGNAL ↓
            </button>
          </motion.div>
        </motion.div>
        <motion.div className="research-hero-facts" {...enter(0.7, 12, 0)} aria-label="Mission at a glance">
          <span><b>11,040</b> H CRUISE DURATION</span>
          <span><b>{Math.round(summary.pathLengthKm / 1e6)}M</b> KM HELIOCENTRIC ARC</span>
          <span><b>55.8%</b> TERMINAL ERROR CUT</span>
          <span><b>1.94 µS / 1.90 KB</b> INFERENCE</span>
          <span><b>F₁ = 0.990</b> COLLECTIVE IF</span>
        </motion.div>
      </section>

      <section className="research-intro" id="section-brief">
        <div className="research-intro-meta">
          <p className="research-index"><DecodeText text="01 · THE BRIEF / 2026" /></p>
          <dl className="research-intro-specs">
            <div><dt>PROPULSION</dt><dd>SPT-140 HALL (4.5 KW)</dd></div>
            <div><dt>CONTROLLER</dt><dd>243-WEIGHT MLP (11→16→3)</dd></div>
            <div><dt>DETECTOR</dt><dd>COLLECTIVE IF (w=24 H)</dd></div>
            <div><dt>INTEGRATOR</dt><dd>DOP853 (SUN-ONLY)</dd></div>
          </dl>
        </div>
        <Parallax className="research-intro-copy" from={60} to={-60}>
          <ScrubStatement lines={[{ text: 'Not a dashboard.' }, { text: 'A controlled encounter with uncertainty.', em: true }]} />
          <BlurText
            text="ARES-1 is an interactive visualization of a guidance research study. It turns model behavior, propulsion degradation, and orbital geometry into something you can interrogate rather than merely admire."
            className="text-base leading-relaxed"
            animateBy="words"
            delay={30}
            stepDuration={0.4}
          />
        </Parallax>
      </section>

      <div className="research-stage" ref={stageRef}>
        <div className="research-stage-scene" aria-hidden="true">
          <motion.div className="research-stage-deep" style={{ transform: deepTransform }} aria-hidden="true"><span /><span /></motion.div>
          <motion.div className="research-stage-track" style={{ transform: trackTransform }}>
            <StageObject index={0} spring={stageSpring} reduce={reduce} />
            <StageObject index={1} spring={stageSpring} reduce={reduce} />
            <StageObject index={2} spring={stageSpring} reduce={reduce} />
          </motion.div>
        </div>
        <div className="research-stage-body">
          {researchChapters.map((chapter) => <ResearchChapter key={chapter.number} {...chapter} />)}
        </div>
      </div>

      <SignalChart />

      <DynamicMissionPan />

      <GuidanceArchitectureSpec />

      <section className="research-cta">
        <p className="research-index"><DecodeText text="05 · THE INSTRUMENT / INTERACTIVE EPHEMERIS" /></p>
        <Parallax from={70} to={-70}>
          <ScrubStatement lines={[{ text: 'See where the model' }, { text: 'changes its mind.', em: true }]} />
        </Parallax>
        <Magnetic>
          <button className="research-launch" onClick={jumpToConsole}>ENTER ARES-1 CONSOLE <span className="research-launch-arrow">↘</span></button>
        </Magnetic>
      </section>

      <ConsolePortal sectionRef={consoleRef}>
        {cesiumReady ? (
          <DynamicGlobe onReady={onInstrumentReady} onStage={onStage} />
        ) : (
          <div className="research-console-loading" aria-live="polite">
            <span>BOOTING INSTRUMENT</span>
            <i>LOADING CESIUM ENGINE</i>
          </div>
        )}
      </ConsolePortal>
    </main>
  );
}

const STAGE_ORDER: BootStage[] = ['init', 'script', 'data', 'scene'];

export default function Home() {
  const [cesiumReady, setCesiumReady] = useState(false);
  const [stage, setStage] = useState<BootStage>('init');
  const [booted, setBooted] = useState(false);
  const onInstrumentReady = useCallback(() => setBooted(true), []);
  const advance = useCallback((next: BootStage) => {
    setStage((prev) => (STAGE_ORDER.indexOf(next) > STAGE_ORDER.indexOf(prev) ? next : prev));
  }, []);
  const onStage = useCallback((s: 'data' | 'scene') => advance(s), [advance]);

  useEffect(() => {
    const existing = document.querySelector('script[data-cesium]');
    if (existing) {
      if ((window as unknown as { Cesium?: unknown }).Cesium) {
        setCesiumReady(true);
        advance('script');
      }
      return;
    }
    const script = document.createElement('script');
    script.dataset.cesium = 'true';
    script.src = pub('/cesium/Cesium.js');
    script.onload = () => {
      setCesiumReady(true);
      advance('script');
    };
    script.onerror = () => setBooted(true);
    document.head.appendChild(script);
    const stall = setTimeout(() => setBooted(true), 20000);
    return () => clearTimeout(stall);
  }, [advance]);

  return (
    <SmoothScroll>
      <ResearchLanding cesiumReady={cesiumReady} booted={booted} onInstrumentReady={onInstrumentReady} onStage={onStage} />
      <BootScreen done={booted} overlay stage={stage} />
    </SmoothScroll>
  );
}
