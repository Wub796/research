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
import { orrery } from '../lib/orrery.generated';
import { pub } from '../lib/paths';

const DynamicGlobe = dynamic(() => import('../components/Globe'), { ssr: false });
const DynamicMissionPan = dynamic(() => import('../components/MissionPan'), { ssr: false });

const EDITORIAL = [0.16, 1, 0.3, 1] as const;

const researchChapters = [
  {
    number: '01',
    label: 'THE QUESTION',
    title: 'Can a policy learn to fly when the engine forgets how to burn?',
    body: 'ARES-1 tests autonomous guidance against a hostile assumption: propulsion performance decays in flight while the destination keeps moving.',
  },
  {
    number: '02',
    label: 'THE METHOD',
    title: 'A long transfer, compressed into a visible experiment.',
    body: 'A PPO controller selects low-thrust commands across an 11,040-hour heliocentric transfer. An Isolation Forest watches engine telemetry for the first signs of an unseen failure.',
  },
  {
    number: '03',
    label: 'THE FINDING',
    title: 'Three hours can separate a warning from a mission rewrite.',
    body: 'The anomaly is flagged at hour 1,497. At hour 1,500, specific impulse locks at 1,514.7 seconds. The live instrument below exposes every decision that follows.',
  },
];

const summary = orrery.summary;
const fmtM = (km: number) => `${Math.round(km / 1e6).toLocaleString('en-US')}M KM`;

/** Moves children at a different speed than the page, so text visibly
 *  drifts past as the section crosses the viewport. */
function Parallax({ children, from = 80, to = -80, className }: { children: ReactNode; from?: number; to?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion() ?? false;
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [from, to]);
  const transform = useMotionTemplate`translate3d(0, ${y}px, 0)`;
  return <motion.div ref={ref} className={className} style={{ transform }}>{children}</motion.div>;
}

/** Heading that reveals word-by-word, each word sliding up out of an
 *  overflow mask with a small stagger — reads like an editorial press.
 *  Inherits the section's initial/whileInView trigger by variant name. */
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
            {word}{' '}
          </motion.span>
        </span>
      ))}
    </h2>
  );
}

/** Scroll-scrubbed statement: words brighten one after another, locked to how
 *  far the block has traveled up the viewport, and re-dim on scroll back. */
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

/** One object in the stage parade — each chapter is a scene and the stage
 *  travel is split into three equal acts. The incoming object sweeps in small
 *  and out of focus, is sharp and large at the viewport centre, then flips
 *  away through its Y axis as the next act takes the stage. */
function StageObject({ index, spring, reduce }: { index: number; spring: MotionValue<number>; reduce: boolean }) {
  const center = index / 3 + 1 / 6;
  const half = 1 / 6;
  const [p0, p1] = [center - half, center + half];
  const scale = useTransform(spring, [p0, center, p1], reduce ? [1, 1, 1] : [0.3, 1.22, 0.3]);
  const rotateY = useTransform(spring, [p0, center, p1], reduce ? [0, 0, 0] : [-95, 0, 95]);
  const x = useTransform(spring, [p0, center, p1], reduce ? [0, 0, 0] : [120, 0, -120]);
  const opacity = useTransform(spring, [p0, center, p1], reduce ? [1, 1, 1] : [0.1, 1, 0.1]);
  const depth = useTransform(spring, [p0, center, p1], reduce ? ['blur(0px)', 'blur(0px)', 'blur(0px)'] : ['blur(5px)', 'blur(0px)', 'blur(5px)']);
  const transform = useMotionTemplate`translate3d(${x}px, 0, 0) rotateY(${rotateY}deg) rotate(${index === 0 ? 45 : 0}deg) scale(${scale})`;
  return (
    <motion.div className={`stage-object stage-object-${index + 1}`} style={{ transform, opacity, filter: depth }}>
      {index === 0 && <><span /><span /><span /></>}
      {index === 1 && <><span /><span /><i /></>}
      {index === 2 && <><span /><b /></>}
    </motion.div>
  );
}

function ResearchChapter({ number, label, title, body }: (typeof researchChapters)[number]) {
  const sectionRef = useRef<HTMLElement>(null);
  const reduce = useReducedMotion() ?? false;
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start end', 'end start'] });
  // layers move at different rates — the copy runs ahead of the number
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
      <motion.div className="chapter-number" style={{ transform: numTransform }}>{number}</motion.div>
      <motion.div className="chapter-copy" style={{ transform: copyTransform }}>
        <p className="chapter-label"><DecodeText text={label} /></p>
        {reduce ? <h2>{title}</h2> : <MaskedWords text={title} />}
        <p>{body}</p>
      </motion.div>
    </motion.section>
  );
}

/** The console section opens like an aperture: it arrives as an inset card
 *  over the paper and widens to full bleed as it reaches the top, while the
 *  instrument inside settles back from a slight push-in. */
function ConsolePortal({ children, sectionRef }: { children: ReactNode; sectionRef: RefObject<HTMLElement> }) {
  const reduce = useReducedMotion() ?? false;
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start end', 'start start'] });
  const p = useSpring(scrollYProgress, { stiffness: 150, damping: 32, mass: 0.5 });
  const top = useTransform(p, [0, 1], reduce ? [0, 0] : [10, 0]);
  const side = useTransform(p, [0, 1], reduce ? [0, 0] : [7, 0]);
  const radius = useTransform(p, [0, 1], reduce ? [0, 0] : [30, 0]);
  const clipPath = useMotionTemplate`inset(${top}% ${side}% 0% ${side}% round ${radius}px)`;
  const push = useTransform(p, [0, 1], reduce ? [1, 1] : [1.07, 1]);
  const bodyTransform = useMotionTemplate`scale(${push})`;
  return (
    <motion.section ref={sectionRef} className="research-console-entry" aria-label="Live ARES-1 console" style={{ clipPath }}>
      <div className="research-console-label">
        <span>04 · LIVE INSTRUMENT</span>
        <span className="research-console-facts">
          {summary.launchUtc.slice(0, 10)} → {summary.arrivalUtc.slice(0, 10)} · {fmtM(summary.pathLengthKm)} FLOWN · C3 {(summary.launchVinfKms ** 2).toFixed(1)} KM²/S² · ENGINE Δv {summary.deltaVKms.toFixed(2)} KM/S
        </span>
      </div>
      <motion.div className="research-console-body" style={{ transform: bodyTransform }}>{children}</motion.div>
    </motion.section>
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

  // Background scene: three objects stacked in a sticky layer and carried
  // across the whole stage travel, so chapter i always rides object i.
  const { scrollYProgress: stageProgress } = useScroll({ target: stageRef, offset: ['start start', 'end end'] });
  const stageSpring = useSpring(stageProgress, { stiffness: 90, damping: 24 });
  const trackY = useTransform(stageSpring, [0, 1], reduce ? [56, 56] : [56, -56]);
  const trackX = useTransform(stageSpring, [0, 1], reduce ? [0, 0] : [5, -5]);
  const deepY = useTransform(stageSpring, [0, 1], reduce ? [30, 30] : [34, -34]);
  const trackTransform = useMotionTemplate`translate3d(${trackX}vw, ${trackY}vh, 0)`;
  const deepTransform = useMotionTemplate`translate3d(0, ${deepY}vh, 0)`;

  const jumpToConsole = () => {
    const el = consoleRef.current;
    if (!el) return;
    if (lenis) lenis.scrollTo(el, { duration: 2.2, easing: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2) });
    else el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };

  const enter = (delay: number, y = 26, blur = 10) => ({
    initial: reduce ? false : { opacity: 0, transform: `translate3d(0, ${y}px, 0)`, filter: `blur(${blur}px)` },
    animate: booted ? { opacity: 1, transform: 'translate3d(0, 0px, 0)', filter: 'blur(0px)' } : undefined,
    transition: { duration: 0.95, ease: EDITORIAL, delay },
  });

  return (
    <main className="research-site" ref={pageRef}>
      <motion.div className="research-progress" style={{ scaleX: progress }} />
      <section className="research-hero" ref={heroRef}>
        <motion.div className="research-topline" {...enter(0, -14, 0)}>
          <span><DecodeText text="ARES-1 / FIELD NOTE 001" active={booted} /></span>
          <span><DecodeText text="EARTH → MARS · 2027–2028" active={booted} delay={120} /></span>
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
            <DecodeText text="A research instrument for a mission under stress" active={booted} delay={180} />
          </motion.p>
          <motion.h1 {...enter(0.28, 34, 12)}>ARES<span>1.</span></motion.h1>
          <motion.p className="research-deck" {...enter(0.4, 30, 8)}>
            What happens when autonomous guidance has to keep flying after propulsion starts to fail?
          </motion.p>
          <motion.div {...enter(0.52, 22, 0)}>
            <Magnetic>
              <button className="research-launch" onClick={jumpToConsole}>
                ENTER ARES-1 <span className="research-launch-arrow">↘</span>
              </button>
            </Magnetic>
          </motion.div>
        </motion.div>
        <motion.div className="research-hero-facts" {...enter(0.7, 12, 0)} aria-label="Mission at a glance">
          <span><b>11,040</b> H CRUISE</span>
          <span><b>{Math.round(summary.earthMarsAtLaunchKm / 1e6)}M</b> KM TO MARS AT LAUNCH</span>
          <span><b>{summary.propellantUsedKg.toFixed(0)}</b> KG XENON SPENT</span>
          <span><b>3</b> H WARNING</span>
        </motion.div>
      </section>

      <section className="research-intro">
        <p className="research-index"><DecodeText text="THE BRIEF / 2026" /></p>
        <Parallax className="research-intro-copy" from={60} to={-60}>
          <ScrubStatement lines={[{ text: 'Not a dashboard.' }, { text: 'A controlled encounter with uncertainty.', em: true }]} />
          <p>ARES-1 is an interactive visualization of a guidance research study. It turns model behavior, propulsion degradation, and orbital geometry into something you can interrogate rather than merely admire.</p>
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

      <section className="research-cta">
        <p className="research-index"><DecodeText text="THE INSTRUMENT" /></p>
        <Parallax from={70} to={-70}>
          <ScrubStatement lines={[{ text: 'See where the model' }, { text: 'changes its mind.', em: true }]} />
        </Parallax>
        <Magnetic>
          <button className="research-launch" onClick={jumpToConsole}>ENTER ARES-1 <span className="research-launch-arrow">↘</span></button>
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
  // Boot gate: the full-screen boot overlay is the first thing rendered and
  // lifts only once the instrument reports its first frame.
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
      // The Globe chunk imports from "cesium", which is externalized to the
      // window.Cesium global — render it only once the global exists.
      setCesiumReady(true);
      advance('script');
    };
    // Never trap the visitor on a stalled boot.
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
