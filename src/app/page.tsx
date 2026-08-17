'use client';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

const DynamicGlobe = dynamic(() => import('../components/Globe'), { ssr: false });

export default function Home() {
  const [cesiumReady, setCesiumReady] = useState(false);

  useEffect(() => {
    // Load Cesium CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/cesium/Widgets/widgets.css';
    document.head.appendChild(link);

    // Load Cesium JS
    const script = document.createElement('script');
    script.src = '/cesium/Cesium.js';
    script.onload = () => {
      (window as any).Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJlMzI0NzViMS04ZjZjLTQxNmQtOTJkNC0yZTViZjkwYzYxOWMiLCJpZCI6NDI0NDcxLCJpYXQiOjE3NzczMjg3MTl9.kCCHm-YA8SWZzz1ulCKkP0uDCUTISmH2MHHkXTg76z4';
      setCesiumReady(true);
    };
    document.head.appendChild(script);
  }, []);

  return (
    <main style={{ width: '100%', minHeight: '100vh', background: 'black' }}>
      {cesiumReady ? (
        <DynamicGlobe />
      ) : (
        <div className="h-screen w-screen bg-black flex items-center justify-center">
          <span className="text-slate-500 text-sm font-mono">Initializing...</span>
        </div>
      )}
    </main>
  );
}