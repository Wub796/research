'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from 'framer-motion';
import dynamic from 'next/dynamic';

const DynamicGlobe = dynamic(() => import('../components/Globe'), { ssr: false });
const DynamicMissionPan = dynamic(() => import('../components/MissionPan'), { ssr: false });

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

/** Moves children at a different speed than the page, so text visibly
 *  drifts past as the section crosses the viewport. */
function Parallax({ children, from = 80, to = -80, className }: { children: ReactNode; from?: number; to?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion() ?? false;
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [from, to]);
  return <motion.div ref={ref} className={className} style={{ y }}>{children}</motion.div>;
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
              hidden: { y: '115%' },
              visible: { y: '0%', transition: { duration: 0.75, ease: [0.16, 1, 0.3, 1], delay: 0.05 * i } },
            }}
          >
            {word}{'\u00A0'}
          </motion.span>
        </span>
      ))}
    </h2>
  );
}

/** Scroll-scrubbed statement (scroll-skill text-reveal pattern): words
 *  brighten one after another, locked to how far the block has traveled up
 *  the viewport, and re-dim if the reader scrolls back. The reveal window
 *  is compressed so the line is fully legible shortly after it enters. */
function ScrubStatement({ lines }: { lines: { text: string; em?: boolean }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion() ?? false;
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const wordCount = lines.reduce((a, l) => a + l.text.split(' ').length, 0);

  const line = (l: { text: string; em?: boolean }, li: number) => {
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
  };

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
  return <h2 ref={ref}>{lines.map(line)}</h2>;
}

function ScrubWord({ progress, start, end, em, children }: { progress: MotionValue<number>; start: number; end: number; em?: boolean; children: ReactNode }) {
  const opacity = useTransform(progress, [start, end], [0.14, 1]);
  return em
    ? <motion.em style={{ opacity }}>{children}{' '}</motion.em>
    : <motion.span style={{ opacity }}>{children}{' '}</motion.span>;
}

/** One object in the stage parade. Each tumbles as it travels: scaling up,
 *  flipping around its Y axis and swooshing across its lane as it passes
 *  the viewport center, then shrinking away as the next object takes over. */
function StageObject({ index, spring, pinEnd, reduce }: { index: number; spring: MotionValue<number>; pinEnd: number; reduce: boolean }) {
  const center = (index / 2) * pinEnd;
  const half = pinEnd / 4;
  const [p0, p1] = [center - half, center + half];
  const scale = useTransform(spring, [p0, center, p1], reduce ? [1, 1, 1] : [0.5, 1.08, 0.5]);
  const rotateY = useTransform(spring, [p0, center, p1], reduce ? [0, 0, 0] : [-60, 0, 60]);
  const x = useTransform(spring, [p0, center, p1], reduce ? [0, 0, 0] : [48, 0, -48]);
  const opacity = useTransform(spring, [p0, center, p1], reduce ? [1, 1, 1] : [0.25, 1, 0.25]);
  return (
    <motion.div
      className={`stage-object stage-object-${index + 1}`}
      style={{ scale, rotateY, x, opacity, rotate: index === 0 ? 45 : 0 }}
    >
      {index === 0 && <><span /><span /><span /></>}
      {index === 1 && <><span /><span /><i /></>}
      {index === 2 && <><span /><b /></>}
    </motion.div>
  );
}

function ResearchChapter({ number, label, title, body }: (typeof researchChapters[number])) {
  const sectionRef = useRef<HTMLElement>(null);
  const reduce = useReducedMotion() ?? false;
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start end', 'end start'] });
  // Layers move at different rates — the copy runs ahead of the number,
  // which reads as depth while the section passes through the viewport.
  const numY = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [48, -48]);
  const copyY = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [120, -120]);
  const copySkew = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [-2.5, 2.5]);
  const ghostY = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [240, -240]);
  const ghostOpacity = useTransform(scrollYProgress, [0, 0.1, 0.9, 1], reduce ? [0, 0, 0, 0] : [0, 0.7, 0.7, 0]);

  return (
    <motion.section
      ref={sectionRef}
      className="research-chapter"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.3 }}
      variants={{ hidden: { opacity: 0, y: 48 }, visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } } }}
    >
      <motion.span className="chapter-ghost" aria-hidden="true" style={{ y: ghostY, opacity: ghostOpacity }}>{label}</motion.span>
      <motion.div className="chapter-number" style={{ y: numY }}>{number}</motion.div>
      <motion.div className="chapter-copy" style={{ y: copyY, skewY: copySkew }}>
        {reduce ? <h2>{title}</h2> : <MaskedWords text={title} />}
        <p>{body}</p>
      </motion.div>
    </motion.section>
  );
}

function ResearchLanding({ cesiumReady }: { cesiumReady: boolean }) {
  const pageRef = useRef<HTMLElement>(null);
  const consoleRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion() ?? false;

  const { scrollYProgress } = useScroll({ target: pageRef });
  const progress = useSpring(scrollYProgress, { stiffness: 90, damping: 24 });
  const orbY = useTransform(progress, [0, 1], [0, -260]);
  const orbRotate = useTransform(progress, [0, 1], [0, 180]);
  const titleY = useTransform(progress, [0, 0.35], [0, -100]);
  const titleOpacity = useTransform(progress, [0, 0.28], [1, 0]);

  // Background scene: three objects are stacked inside the sticky viewport
  // layer and translated upward as the chapters scroll. Each object takes a
  // turn at center — entering from below, holding, then exiting above.
  const { scrollYProgress: stageProgress } = useScroll({ target: stageRef, offset: ['start start', 'end end'] });
  const stageSpring = useSpring(stageProgress, { stiffness: 90, damping: 24 });
  // The scene is only pinned while there is >= 100vh of stage left below the
  // viewport; progress beyond that point just carries the whole scene upward.
  const [pinEnd, setPinEnd] = useState(1);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const ratio = (el.offsetHeight - window.innerHeight) / el.offsetHeight;
      setPinEnd(Math.min(1, Math.max(0.08, ratio)));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  const trackY = useTransform(stageSpring, [0, pinEnd], reduce ? ['56vh', '56vh'] : ['56vh', '-56vh']);
  const orbScale = useTransform(progress, [0, 1], [1, 1.18]);


  const jumpToConsole = () => {
    requestAnimationFrame(() => consoleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  return (
    <main className="research-site" ref={pageRef}>
      <motion.div className="research-progress" style={{ scaleX: progress }} />
      <section className="research-hero">
        <motion.div
          className="research-topline"
          initial={reduce ? false : { opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        >
          <span>ORBITAL WATCH / FIELD NOTE 001</span><span>HOUSTON · EARTH → MARS</span>
        </motion.div>
        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1], delay: 0.12 }}
        >
          <motion.div className="research-orbit" style={{ y: orbY, rotate: orbRotate, scale: orbScale }} aria-hidden="true"><span /><i /><b /></motion.div>
        </motion.div>
        <motion.div className="research-hero-copy" style={{ y: titleY, opacity: titleOpacity }}>
          <motion.p
            className="research-kicker"
            initial={reduce ? false : { opacity: 0, y: 26, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.18 }}
          >A research instrument for a mission under stress</motion.p>
          <motion.h1
            initial={reduce ? false : { opacity: 0, y: 34, filter: 'blur(12px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.28 }}
          >ARES<span>1.</span></motion.h1>
          <motion.p
            className="research-deck"
            initial={reduce ? false : { opacity: 0, y: 30, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.95, ease: [0.16, 1, 0.3, 1], delay: 0.4 }}
          >What happens when autonomous guidance has to keep learning after propulsion starts to fail?</motion.p>
          <motion.button
            className="research-launch"
            onClick={jumpToConsole}
            initial={reduce ? false : { opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.52 }}
          >ENTER ARES-1 <span className="research-launch-arrow">↘</span></motion.button>
        </motion.div>
      </section>

      <section className="research-intro">
        <p className="research-index">THE BRIEF / 2026</p>
        <Parallax className="research-intro-copy" from={60} to={-60}>
          <ScrubStatement lines={[{ text: 'Not a dashboard.' }, { text: 'A controlled encounter with uncertainty.', em: true }]} />
          <p>ARES-1 is an interactive visualization of a guidance research study. It turns model behavior, propulsion degradation, and orbital geometry into something you can interrogate rather than merely admire.</p>
        </Parallax>
      </section>

      <div className="research-stage" ref={stageRef}>
        <div className="research-stage-scene" aria-hidden="true">
          <motion.div className="research-stage-track" style={{ y: trackY }}>
            <StageObject index={0} spring={stageSpring} pinEnd={pinEnd} reduce={reduce} />
            <StageObject index={1} spring={stageSpring} pinEnd={pinEnd} reduce={reduce} />
            <StageObject index={2} spring={stageSpring} pinEnd={pinEnd} reduce={reduce} />
          </motion.div>
        </div>
        <div className="research-stage-body">
          {researchChapters.map((chapter) => <ResearchChapter key={chapter.number} {...chapter} />)}
        </div>
      </div>

      <DynamicMissionPan />

      <section className="research-cta">
        <p className="research-index">THE INSTRUMENT</p>
        <Parallax from={70} to={-70}>
          <ScrubStatement lines={[{ text: 'See where the model' }, { text: 'changes its mind.', em: true }]} />
        </Parallax>
        <button className="research-launch" onClick={jumpToConsole}>ENTER ARES-1 <span className="research-launch-arrow">↘</span></button>
      </section>

      <section ref={consoleRef} className="research-console-entry" aria-label="Live ARES-1 console">
        <div className="research-console-label"><span>04</span><span>LIVE INSTRUMENT</span></div>
        {cesiumReady ? (
          <DynamicGlobe embedded />
        ) : (
          <div className="research-console-loading" aria-live="polite">
            <span>BOOTING INSTRUMENT</span>
            <i>LOADING CESIUM ASSET / /CESIUM/CESIUM.JS</i>
          </div>
        )}
      </section>
    </main>
  );
}

export default function Home() {
  const [cesiumReady, setCesiumReady] = useState(false);

  useEffect(() => {
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = '/cesium/Widgets/widgets.css';
    document.head.appendChild(stylesheet);

    const existing = document.querySelector('script[data-cesium]');
    if (existing) {
      if ((window as any).Cesium) setCesiumReady(true);
      return () => stylesheet.remove();
    }

    const script = document.createElement('script');
    script.dataset.cesium = 'true';
    script.src = '/cesium/Cesium.js';
    script.onload = () => {
      (window as any).Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJlMzI0NzViMS04ZjZjLTQxNmQtOTJkNC0yZTViZjkwYzYxOWMiLCJpZCI6NDI0NDcxLCJpYXQiOjE3NzczMjg3MTl9.kCCHm-YA8SWZzz1ulCKkP0uDCUTISmH2MHHkXTg76z4';
      // The Globe chunk imports from "cesium", which is externalized to the
      // window.Cesium global. Render DynamicGlobe only once the global exists,
      // so the chunk evaluates after the script — never before it.
      setCesiumReady(true);
    };
    document.head.appendChild(script);
    return () => stylesheet.remove();
  }, []);

  return <ResearchLanding cesiumReady={cesiumReady} />;
}
