'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useSpring, useTransform } from 'framer-motion';
import dynamic from 'next/dynamic';

const DynamicGlobe = dynamic(() => import('../components/Globe'), { ssr: false });

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

function ResearchChapter({ number, label, title, body }: (typeof researchChapters[number])) {
  const sectionRef = useRef<HTMLElement>(null);
  const reduce = useReducedMotion() ?? false;
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start end', 'end start'] });
  // Layers move at different rates — the copy runs ahead of the number,
  // which reads as depth while the section passes through the viewport.
  const numY = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [48, -48]);
  const copyY = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [120, -120]);
  const copySkew = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [-2.5, 2.5]);

  return (
    <motion.section
      ref={sectionRef}
      className="research-chapter"
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.3 }}
      variants={{ hidden: { opacity: 0, y: 48 }, visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } } }}
    >
      <motion.div className="chapter-number" style={{ y: numY }}>{number}</motion.div>
      <motion.div className="chapter-copy" style={{ y: copyY, skewY: copySkew }}>
        <p className="research-index">{label}</p>
        <h2>{title}</h2>
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

  // Index chip — flips when each object reaches its moment at center.
  const [active, setActive] = useState(0);
  useMotionValueEvent(stageSpring, 'change', (v) => {
    const c2 = pinEnd / 2;
    const t1 = c2 / 2;
    const t2 = c2 + (pinEnd - c2) / 2;
    const i = v < t1 ? 0 : v < t2 ? 1 : 2;
    setActive((prev) => (prev === i ? prev : i));
  });

  const jumpToConsole = () => {
    requestAnimationFrame(() => consoleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  return (
    <main className="research-site" ref={pageRef}>
      <motion.div className="research-progress" style={{ scaleX: progress }} />
      <section className="research-hero">
        <div className="research-topline"><span>ORBITAL WATCH / FIELD NOTE 001</span><span>HOUSTON · EARTH → MARS</span></div>
        <motion.div className="research-orbit" style={{ y: orbY, rotate: orbRotate }} aria-hidden="true"><span /><i /><b /></motion.div>
        <motion.div className="research-hero-copy" style={{ y: titleY, opacity: titleOpacity }}>
          <p className="research-kicker">A research instrument for a mission under stress</p>
          <h1>ARES<span>1.</span></h1>
          <p className="research-deck">What happens when autonomous guidance has to keep learning after propulsion starts to fail?</p>
          <button className="research-launch" onClick={jumpToConsole}>ENTER THE LIVE CONSOLE <span>↘</span></button>
        </motion.div>
        <div className="research-hero-foot"><span>SCROLL TO TRACE THE EVIDENCE</span><span>↓</span></div>
      </section>

      <section className="research-intro">
        <p className="research-index">THE BRIEF / 2026</p>
        <Parallax className="research-intro-copy" from={60} to={-60}>
          <h2>Not a dashboard.<br /><em>A controlled encounter with uncertainty.</em></h2>
          <p>ARES-1 is an interactive visualization of a guidance research study. It turns model behavior, propulsion degradation, and orbital geometry into something you can interrogate rather than merely admire.</p>
        </Parallax>
      </section>

      <div className="research-stage" ref={stageRef}>
        <div className="research-stage-scene" aria-hidden="true">
          <motion.div className="research-stage-track" style={{ y: trackY }}>
            <div className="stage-object stage-object-1"><span /><span /><span /></div>
            <div className="stage-object stage-object-2"><span /><span /><i /></div>
            <div className="stage-object stage-object-3"><span /><b /></div>
          </motion.div>
          <div className="research-stage-idx">
            <span className={active === 0 ? 'is-on' : ''}>01</span>
            <span className={active === 1 ? 'is-on' : ''}>02</span>
            <span className={active === 2 ? 'is-on' : ''}>03</span>
          </div>
        </div>
        <div className="research-stage-body">
          {researchChapters.map((chapter) => <ResearchChapter key={chapter.number} {...chapter} />)}
        </div>
      </div>

      <section className="research-cta">
        <p className="research-index">THE INSTRUMENT</p>
        <Parallax from={70} to={-70}>
          <h2>Move through the mission.<br /><em>See where the model changes its mind.</em></h2>
        </Parallax>
        <button className="research-launch" onClick={jumpToConsole}>OPEN ARES-1 <span>↘</span></button>
      </section>

      <section ref={consoleRef} className="research-console-entry" aria-label="Live ARES-1 console">
        <div className="research-console-label"><span>04</span><span>LIVE INSTRUMENT</span></div>
        {cesiumReady ? (
          <DynamicGlobe />
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
