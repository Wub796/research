"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/** Read the --ink token (flips with .is-invert) as a THREE.Color. */
function readInk(): THREE.Color {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim();
  const hex = v.match(/^#([0-9a-f]{6})$/i);
  if (hex) return new THREE.Color("#" + hex[1]);
  const rgb = v.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (rgb) {
    return new THREE.Color(
      parseInt(rgb[1], 10) / 255,
      parseInt(rgb[2], 10) / 255,
      parseInt(rgb[3], 10) / 255
    );
  }
  return new THREE.Color(0xffffff);
}

/**
 * HeroBlob — a liquid wireframe blob rendered behind the hero wordmark.
 * It deforms over time, drifts with the pointer, and shrinks/rotates/fades
 * as the hero scrolls away. Pure Three.js on its own canvas (no react
 * bindings), clipped by the hero's overflow. Honours prefers-reduced-motion.
 */
export default function HeroBlob() {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const canvas = document.createElement("canvas");
    canvas.style.position = "absolute";
    canvas.style.inset = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    host.appendChild(canvas);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 5.6);

    // Liquid blob — displaced icosahedron wireframe
    const blobGeo = new THREE.IcosahedronGeometry(1.55, 3);
    const base = new Float32Array(blobGeo.attributes.position.array as Float32Array);
    const blobMat = new THREE.MeshBasicMaterial({
      color: readInk(),
      wireframe: true,
      transparent: true,
      opacity: 0.9,
    });
    const blob = new THREE.Mesh(blobGeo, blobMat);
    blob.position.set(1.25, 0.15, 0);

    // Outer low-detail shell — slow counter-rotation, faint
    const shellGeo = new THREE.IcosahedronGeometry(2.35, 1);
    const shellMat = new THREE.MeshBasicMaterial({
      color: readInk(),
      wireframe: true,
      transparent: true,
      opacity: 0.16,
    });
    const shell = new THREE.Mesh(shellGeo, shellMat);
    shell.position.copy(blob.position);

    scene.add(blob);
    scene.add(shell);

    // sizing
    const setSize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    setSize();
    const ro = new ResizeObserver(setSize);
    ro.observe(host);

    // pointer + scroll state
    let mx = 0, my = 0; // target, -1..1
    const onPointer = (e: PointerEvent) => {
      mx = (e.clientX / window.innerWidth) * 2 - 1;
      my = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    // ink token follows invert toggle
    let inkColor = readInk();
    const mo = new MutationObserver(() => {
      const c = readInk();
      blobMat.color.copy(c);
      shellMat.color.copy(c);
      inkColor = c;
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    let raf = 0;
    let disposed = false;
    let t = 0;
    let last = performance.now();

    if (reduce) {
      // Static render — no loop, no pointer drift
      blob.rotation.set(0.5, 0.6, 0.1);
      shell.rotation.set(-0.3, 0.4, 0.2);
      renderer.render(scene, camera);
    } else {
      const tick = () => {
        if (disposed) return;
        const now = performance.now();
        t += (now - last) / 1000;
        last = now;

        // liquid displacement
        const pos = blobGeo.attributes.position as THREE.BufferAttribute;
        const arr = pos.array as Float32Array;
        for (let i = 0; i < arr.length; i += 3) {
          const x = base[i], y = base[i + 1], z = base[i + 2];
          const d =
            1 +
            0.17 * Math.sin(x * 3.1 + t * 1.15) * Math.cos(y * 2.7 + t * 0.85) +
            0.11 * Math.sin(z * 4.2 + t * 1.4) * Math.cos(x * 2.2 - t * 0.6);
          arr[i] = x * d;
          arr[i + 1] = y * d;
          arr[i + 2] = z * d;
        }
        pos.needsUpdate = true;
        blobGeo.computeVertexNormals();

        // scroll progress of the hero (0 in view → 1 scrolled away)
        const hero = host.parentElement;
        let p = 0;
        if (hero) {
          p = Math.min(1, Math.max(0, -hero.getBoundingClientRect().top / window.innerHeight));
        }

        // pointer-following camera drift (lerped)
        camera.position.x += (mx * 0.55 - camera.position.x) * 0.045;
        camera.position.y += (my * 0.42 - camera.position.y) * 0.045;
        camera.lookAt(blob.position);

        // rotation + scroll response
        const breathe = 1 + Math.sin(t * 0.8) * 0.03;
        blob.rotation.x = t * 0.24 + my * 0.5;
        blob.rotation.y = t * 0.18 + mx * 0.7 + p * 2.4;
        blob.scale.setScalar((1 - p * 0.38) * breathe);
        blobMat.opacity = 0.9 * (1 - p * 0.85);

        shell.rotation.x = -t * 0.09 + p * 1.6;
        shell.rotation.y = t * 0.13;
        shell.rotation.z = t * 0.04;
        shell.scale.setScalar(1 - p * 0.2);
        shellMat.opacity = 0.16 * (1 - p * 0.9);

        renderer.render(scene, camera);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointer);
      mo.disconnect();
      ro.disconnect();
      blobGeo.dispose();
      shellGeo.dispose();
      blobMat.dispose();
      shellMat.dispose();
      renderer.dispose();
      host.removeChild(canvas);
    };
  }, []);

  return <div ref={hostRef} className="hero-blob" aria-hidden="true" />;
}
