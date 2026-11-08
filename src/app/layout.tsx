import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ARES-1 · Autonomous Fault-Tolerant Neural Guidance Console",
  description: "Interactive heliocentric astrodynamics showcase and technical specification for autonomous deep-space trajectory optimization under progressive thruster degradation using collective anomaly detection and closed-loop neural guidance.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased bg-black text-white">
        {children}
        {/* Paper/matte film grain over everything — never blocks input */}
        <div className="grain" aria-hidden="true" />
      </body>
    </html>
  );
}
