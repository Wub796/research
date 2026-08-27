"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

function readInk(): THREE.Color {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim();
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) return new THREE.Color(`#${hex[1]}`);
  const rgb = value.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (rgb) return new THREE.Color(Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255);
  return new THREE.Color(0xffffff);
}

/**
 * A purposeful, data-backed ARES-1 mission map for the landing page.
 * The orbit diagram communicates the actual Earth → Mars transfer and reacts
 * to pointer position and hero scroll without intercepting page input.
 */
export default function HeroBlob() {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let raf = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    Object.assign(canvas.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      display: "block",
    });
    host.appendChild(canvas);

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-5, 5, 3.5, -3.5, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);

    const ink = readInk();
    const accentEarth = new THREE.Color("#39bdf8");
    const accentMars = new THREE.Color("#fb6048");
    const accentSC = new THREE.Color("#e8faff");
    const group = new THREE.Group();
    scene.add(group);

    const disposeList: THREE.Object3D[] = [];
    const line = (points: THREE.Vector3[], color: THREE.Color, opacity: number, dashed = false) => {
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = dashed
        ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.075, gapSize: 0.06 })
        : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
      const object = new THREE.Line(geometry, material);
      if (dashed) object.computeLineDistances();
      group.add(object);
      disposeList.push(object);
      return object;
    };

    const makeMesh = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
      const object = new THREE.Mesh(geometry, material);
      group.add(object);
      disposeList.push(object);
      return object;
    };

    // Heliocentric origin: core + three thin corona rings.
    const sun = makeMesh(
      new THREE.SphereGeometry(0.14, 16, 10),
      new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffd34d"), wireframe: true, transparent: true, opacity: 0.95 }),
    );
    for (const radius of [0.22, 0.3, 0.39]) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.006, 4, 48),
        new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffd34d"), transparent: true, opacity: 0.16 }),
      );
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
      disposeList.push(ring);
    }
    line([new THREE.Vector3(-0.3, 0, 0), new THREE.Vector3(0.3, 0, 0)], ink, 0.2);
    line([new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(0, 0.3, 0)], ink, 0.2);

    const orbit = (radius: number, opacity: number, color: THREE.Color) => {
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= 180; i += 1) {
        const angle = (i / 180) * Math.PI * 2;
        points.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.62, 0));
      }
      return line(points, color, opacity);
    };
    const earthOrbit = orbit(1.55, 0.48, accentEarth);
    const marsOrbit = orbit(2.55, 0.48, accentMars);

    // Transfer lane plus arrowheads that make direction obvious.
    const transfer: THREE.Vector3[] = [];
    for (let i = 0; i <= 120; i += 1) {
      const p = i / 120;
      const angle = Math.PI * (0.92 - p * 0.9);
      const radius = 1.55 + p;
      transfer.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.62, 0.03));
    }
    const transferLine = line(transfer, accentSC, 0.68, true);
    const arrows: THREE.Mesh[] = [];
    for (const p of [0.22, 0.48, 0.74]) {
      const index = Math.floor(p * (transfer.length - 1));
      const marker = makeMesh(
        new THREE.ConeGeometry(0.045, 0.16, 4),
        new THREE.MeshBasicMaterial({ color: accentSC, transparent: true, opacity: 0.72 }),
      );
      marker.rotation.z = -Math.PI / 2;
      marker.position.copy(transfer[index]);
      arrows.push(marker);
    }

    const earth = makeMesh(new THREE.SphereGeometry(0.11, 16, 10), new THREE.MeshBasicMaterial({ color: accentEarth }));
    const mars = makeMesh(new THREE.SphereGeometry(0.14, 16, 10), new THREE.MeshBasicMaterial({ color: accentMars }));
    const spacecraft = makeMesh(
      new THREE.OctahedronGeometry(0.105, 0),
      new THREE.MeshBasicMaterial({ color: accentSC, wireframe: true, transparent: true, opacity: 1 }),
    );
    const spacecraftGlow = makeMesh(
      new THREE.SphereGeometry(0.2, 12, 8),
      new THREE.MeshBasicMaterial({ color: accentSC, transparent: true, opacity: 0.12, wireframe: true }),
    );

    let samples: Array<{ sc: number[]; earth: number[]; mars: number[] }> = [];
    let sampleIndex = 0;
    const loadData = async () => {
      try {
        const response = await fetch("/trajectory_data.json");
        const data = await response.json();
        if (!disposed && Array.isArray(data.sc_pos)) {
          samples = data.sc_pos.map((sc: number[], i: number) => ({ sc, earth: data.earth_pos[i], mars: data.mars_pos[i] }))
            .filter((sample: { sc: number[]; earth: number[]; mars: number[] }) => sample.earth && sample.mars);
        }
      } catch {
        // Keep the diagram's static orbital fallback when data is unavailable.
      }
    };
    void loadData();

    const project = (position: number[]) => new THREE.Vector3(
      position[0] / 220000000,
      (position[1] / 220000000) * 0.62,
      0.06,
    );

    const setSize = () => {
      const width = host.clientWidth || 1;
      const height = host.clientHeight || 1;
      const aspect = width / height;
      const viewHeight = 7;
      camera.top = viewHeight / 2;
      camera.bottom = -viewHeight / 2;
      camera.left = (-viewHeight * aspect) / 2;
      camera.right = (viewHeight * aspect) / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    setSize();
    const resizeObserver = new ResizeObserver(setSize);
    resizeObserver.observe(host);

    let mx = 0;
    let my = 0;
    const onPointer = (event: PointerEvent) => {
      mx = (event.clientX / window.innerWidth) * 2 - 1;
      my = -(event.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    const mutationObserver = new MutationObserver(() => {
      const next = readInk();
      scene.traverse((object) => {
        const material = (object as THREE.Mesh).material;
        if (material instanceof THREE.MeshBasicMaterial && material.color.equals(ink)) material.color.copy(next);
      });
    });
    mutationObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    let elapsed = 0;
    let last = performance.now();
    const render = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      elapsed += dt;

      const hero = host.parentElement;
      const scrollProgress = hero ? Math.min(1, Math.max(0, -hero.getBoundingClientRect().top / window.innerHeight)) : 0;
      const targetX = 1.15 + mx * 0.14;
      const targetY = 0.12 + my * 0.1;
      group.position.x += (targetX - group.position.x) * 0.045;
      group.position.y += (targetY - group.position.y) * 0.045;
      group.rotation.x += ((my * 0.045 + scrollProgress * 0.16) - group.rotation.x) * 0.04;
      group.rotation.y += ((mx * 0.08 + scrollProgress * 0.24) - group.rotation.y) * 0.04;
      group.scale.setScalar((1 - scrollProgress * 0.28) * (1 + Math.sin(elapsed * 1.4) * 0.018));
      group.position.z = -scrollProgress * 0.3;

      sun.rotation.z = elapsed * 0.28;
      sun.scale.setScalar(1 + Math.sin(elapsed * 2.2) * 0.08);
      spacecraft.rotation.x = elapsed * 1.4;
      spacecraft.rotation.y = elapsed * 1.9;
      spacecraftGlow.rotation.y = -elapsed * 0.8;
      spacecraftGlow.scale.setScalar(1 + Math.sin(elapsed * 4) * 0.13);
      arrows.forEach((arrow, index) => { arrow.rotation.y = elapsed * (index % 2 ? -0.8 : 0.8); });
      transferLine.material.opacity = 0.48 + Math.sin(elapsed * 2) * 0.12;

      if (samples.length > 1) {
        sampleIndex = (sampleIndex + dt * 3.2) % samples.length;
        const sample = samples[Math.floor(sampleIndex)];
        spacecraft.position.lerp(project(sample.sc), 0.18);
        spacecraftGlow.position.copy(spacecraft.position);
        earth.position.lerp(project(sample.earth), 0.12);
        mars.position.lerp(project(sample.mars), 0.12);
      } else {
        const orbitTime = elapsed * 0.22;
        earth.position.set(Math.cos(orbitTime) * 1.55, Math.sin(orbitTime) * 1.55 * 0.62, 0.08);
        mars.position.set(Math.cos(orbitTime * 0.62 + 1.8) * 2.55, Math.sin(orbitTime * 0.62 + 1.8) * 2.55 * 0.62, 0.08);
        spacecraft.position.lerp(transfer[Math.floor((elapsed * 15) % transfer.length)], 0.1);
        spacecraftGlow.position.copy(spacecraft.position);
      }

      renderer.render(scene, camera);
      if (!reduce) raf = requestAnimationFrame(render);
    };

    if (reduce) {
      spacecraft.position.copy(transfer[50]);
      spacecraftGlow.position.copy(spacecraft.position);
      earth.position.set(1.1, 0.8, 0.08);
      mars.position.set(-1.8, -0.75, 0.08);
      renderer.render(scene, camera);
    } else {
      raf = requestAnimationFrame(render);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointer);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      disposeList.forEach((object) => {
        object.traverse((child) => {
          const mesh = child as THREE.Mesh;
          mesh.geometry?.dispose();
          if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material.dispose());
          else mesh.material?.dispose();
        });
      });
      renderer.dispose();
      host.removeChild(canvas);
    };
  }, []);

  return <div ref={hostRef} className="hero-blob" aria-label="Animated ARES-1 Earth-to-Mars transfer diagram" />;
}
