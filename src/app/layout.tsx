import type { Metadata } from "next";
import "./globals.css";
import CursorReticle from "../components/CursorReticle";

export const metadata: Metadata = {
  title: "ARES-1 Heliocentric Trajectory Visualizer | PPO Guidance Console",
  description: "Autonomous spacecraft guidance simulation using Proximal Policy Optimization (PPO) under thruster specific impulse degradation.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased bg-black text-white">
        {children}
        {/* Paper/matte film grain over everything — never blocks input */}
        <div className="grain" aria-hidden="true" />
        {/* Mission-control reticle cursor — hides the native pointer on
            fine-pointer, non-reduced-motion devices only */}
        <CursorReticle />
      </body>
    </html>
  );
}
