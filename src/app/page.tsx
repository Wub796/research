'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useSpring, useTransform } from 'framer-motion';
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

function ResearchChapter({ number, label, title, body, index }: (typeof researchChapters[number] & { index: number })) {
  return (
    <motion.section
      className={`research-chapter chapter-${index + 1}`}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.3 }}
      variants={{ hidden: { opacity: 0, y: 48 }, visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } } }}
    >
      <div className="chapter-number">{number}</div>
      <div className="chapter-copy">
        <p className="research-index">{label}</p>
        <h2>{title}</h2>
        <p>{body}</p>
      </div>
      <div className="chapter-object" aria-hidden="true"><span /><span /><span /></div>
    </motion.section>
  );
}

function ResearchLanding() {
  const pageRef = useRef<HTMLElement>(null);
  const consoleRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: pageRef });
  const progress = useSpring(scrollYProgress, { stiffness: 90, damping: 24 });
  const orbY = useTransform(progress, [0, 1], [0, -260]);
  const orbRotate = useTransform(progress, [0, 1], [0, 180]);
  const titleY = useTransform(progress, [0, 0.35], [0, -100]);
  const titleOpacity = useTransform(progress, [0, 0.28], [1, 0]);

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
        <h2>Not a dashboard.<br /><em>A controlled encounter with uncertainty.</em></h2>
        <p>ARES-1 is an interactive visualization of a guidance research study. It turns model behavior, propulsion degradation, and orbital geometry into something you can interrogate rather than merely admire.</p>
      </section>

      {researchChapters.map((chapter, index) => <ResearchChapter key={chapter.number} {...chapter} index={index} />)}

      <section className="research-cta">
        <p className="research-index">THE INSTRUMENT</p>
        <h2>Move through the mission.<br /><em>See where the model changes its mind.</em></h2>
        <button className="research-launch" onClick={jumpToConsole}>OPEN ARES-1 <span>↘</span></button>
      </section>

      <section ref={consoleRef} className="research-console-entry" aria-label="Live ARES-1 console">
        <div className="research-console-label"><span>04</span><span>LIVE INSTRUMENT</span></div>
        <DynamicGlobe />
      </section>
    </main>
  );
}

export default function Home() {
  useEffect(() => {
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = '/cesium/Widgets/widgets.css';
    document.head.appendChild(stylesheet);

    const existing = document.querySelector('script[data-cesium]');
    if (existing) return () => stylesheet.remove();

    const script = document.createElement('script');
    script.dataset.cesium = 'true';
    script.src = '/cesium/Cesium.js';
    script.onload = () => {
      (window as any).Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJlMzI0NzViMS04ZjZjLTQxNmQtOTJkNC0yZTViZjkwYzYxOWMiLCJpZCI6NDI0NDcxLCJpYXQiOjE3NzczMjg3MTl9.kCCHm-YA8SWZzz1ulCKkP0uDCUTISmH2MHHkXTg76z4';
      // Cesium readiness is owned by Globe; this route only loads the asset.
    };
    document.head.appendChild(script);
    return () => stylesheet.remove();
  }, []);

  return <ResearchLanding />;
}
