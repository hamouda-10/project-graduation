import { useEffect, useRef } from "react";
import { liveAudioTelemetry, useUIStore, type AudioSystemMode } from "@/stores/ui-store";

interface CentralMicCoreProps {
  isArabic: boolean;
  onActivateMic: () => void;
  className?: string;
}

interface OrbitalParticle {
  angle: number;
  angularSpeed: number;
  baseRadiusX: number;
  baseRadiusY: number;
  tiltAngle: number;
  driftOffset: number;
  driftSpeed: number;
  maxDrift: number;
  size: number;
  baseAlpha: number;
  phase: number;
  warmWhite: boolean;
}

interface EnergyWaveRipple {
  progress: number; // 0 to 1
  speed: number;
}

const ORBITAL_RING_CONFIGS = [
  {
    id: 1,
    sizePx: 102,
    className: "hero-orbit-ring hero-orbit-1",
    borderStyle: "border border-[#FFE89E]/55 shadow-[0_0_12px_rgba(212,175,55,0.28)]",
    nodePos: "top-0 left-1/2 -translate-x-1/2 -translate-y-1/2",
    nodeSize: "h-1.5 w-1.5 bg-[#FFF8DC] shadow-[0_0_8px_2px_#D4AF37]",
  },
  {
    id: 2,
    sizePx: 120,
    className: "hero-orbit-ring hero-orbit-2",
    borderStyle: "border border-[#D4AF37]/45 shadow-[0_0_10px_rgba(212,175,55,0.2)]",
    nodePos: "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2",
    nodeSize: "h-1.5 w-1.5 bg-[#FFE58F] shadow-[0_0_6px_1.5px_#F59E0B]",
  },
  {
    id: 3,
    sizePx: 138,
    className: "hero-orbit-ring hero-orbit-3",
    borderStyle: "border border-[#F5D77F]/35 shadow-[0_0_14px_rgba(245,215,127,0.18)]",
    nodePos: "top-1/2 right-0 translate-x-1/2 -translate-y-1/2",
    nodeSize: "h-1 w-1 bg-white shadow-[0_0_6px_1.5px_#D4AF37]",
  },
  {
    id: 4,
    sizePx: 154,
    className: "hero-orbit-ring hero-orbit-4",
    borderStyle: "border border-dashed border-[#D4AF37]/40",
    nodePos: "top-1/2 left-0 -translate-x-1/2 -translate-y-1/2",
    nodeSize: "h-1.5 w-1.5 bg-[#F5D77F] shadow-[0_0_7px_1.5px_#D4AF37]",
  },
  {
    id: 5,
    sizePx: 170,
    className: "hero-orbit-ring hero-orbit-5",
    borderStyle: "border border-[#FFF3B0]/30 shadow-[0_0_12px_rgba(212,175,55,0.15)]",
    nodePos: "top-[14%] right-[14%]",
    nodeSize: "h-1 w-1 bg-[#FFFBEB] shadow-[0_0_6px_1px_#D4AF37]",
  },
  {
    id: 6,
    sizePx: 184,
    className: "hero-orbit-ring hero-orbit-6",
    borderStyle: "border border-[#B8860B]/35",
    nodePos: "bottom-[14%] left-[14%]",
    nodeSize: "h-1 w-1 bg-[#FDE68A] shadow-[0_0_5px_1px_#B8860B]",
  },
  {
    id: 7,
    sizePx: 198,
    className: "hero-orbit-ring hero-orbit-7",
    borderStyle: "border border-dotted border-[#F5D77F]/25",
    nodePos: "top-0 left-1/2 -translate-x-1/2 -translate-y-1/2",
    nodeSize: "h-1 w-1 bg-[#FFF3B0]/90 shadow-[0_0_5px_1px_#D4AF37]",
  },
];

export function CentralMicCore({ isArabic, onActivateMic, className = "" }: CentralMicCoreProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const parallaxStageRef = useRef<HTMLDivElement | null>(null);
  const ringsGroupRef = useRef<HTMLDivElement | null>(null);
  const micCapsuleRef = useRef<HTMLButtonElement | null>(null);

  const audioSystemMode = useUIStore((s) => s.audioSystemMode);
  const modeRef = useRef<AudioSystemMode>(audioSystemMode);

  useEffect(() => {
    modeRef.current = audioSystemMode;
  }, [audioSystemMode]);

  useEffect(() => {
    const container = rootRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let width = Math.max(200, container.clientWidth || 240);
    let height = Math.max(190, container.clientHeight || 210);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Responsive tier detection: Desktop (>=1024), Tablet (768-1023), Mobile (<768)
    const getResponsiveTier = () => {
      const vw = window.innerWidth || 1280;
      if (vw < 768) return "mobile";
      if (vw < 1024) return "tablet";
      return "desktop";
    };

    let tier = getResponsiveTier();
    let particleCount = tier === "desktop" ? 180 : tier === "tablet" ? 105 : 48;
    let spectrumBarCount = tier === "mobile" ? 40 : 64;

    const createParticles = (count: number, maxR: number): OrbitalParticle[] =>
      Array.from({ length: count }, (_, i) => {
        const direction = i % 3 === 0 ? -1 : 1;
        const baseR = 26 + Math.pow(Math.random(), 0.88) * (maxR - 26);
        const eccentricity = 0.55 + Math.random() * 0.45;
        return {
          angle: Math.random() * Math.PI * 2,
          angularSpeed: direction * (0.14 + Math.random() * 0.42),
          baseRadiusX: baseR,
          baseRadiusY: baseR * eccentricity,
          tiltAngle: (i % 7) * (Math.PI / 7) + (Math.random() - 0.5) * 0.25,
          driftOffset: Math.random() * Math.PI * 2,
          driftSpeed: 0.35 + Math.random() * 0.65,
          maxDrift: 3 + Math.random() * 14,
          size: 0.65 + (i % 5) * 0.28,
          baseAlpha: 0.18 + Math.random() * 0.52,
          phase: Math.random() * Math.PI * 2,
          warmWhite: i % 6 === 0,
        };
      });

    let maxOrbitRadius = Math.min(width, height) * 0.48;
    let particles = createParticles(particleCount, maxOrbitRadius);

    // 3 Radial Energy Wave Ripples
    const ripples: EnergyWaveRipple[] = [
      { progress: 0.0, speed: 0.22 },
      { progress: 0.33, speed: 0.22 },
      { progress: 0.66, speed: 0.22 },
    ];

    const smoothedSpectrum = new Float32Array(64);
    let smoothedEnergy = 0.08;

    const updateSize = () => {
      if (!container || !canvas) return;
      width = Math.max(200, container.clientWidth || 240);
      height = Math.max(190, container.clientHeight || 210);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const nextTier = getResponsiveTier();
      maxOrbitRadius = Math.min(width, height) * 0.48;
      if (nextTier !== tier) {
        tier = nextTier;
        particleCount = tier === "desktop" ? 180 : tier === "tablet" ? 105 : 48;
        spectrumBarCount = tier === "mobile" ? 40 : 64;
        particles = createParticles(particleCount, maxOrbitRadius);
      }
    };

    updateSize();

    // Pointer parallax tracking (updated via refs, applied in rAF without React state)
    let targetTiltX = 0;
    let targetTiltY = 0;
    let currentTiltX = 0;
    let currentTiltY = 0;

    const handlePointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      targetTiltY = nx * 9;
      targetTiltX = -ny * 9;
    };

    const handlePointerLeave = () => {
      targetTiltX = 0;
      targetTiltY = 0;
    };

    container.addEventListener("pointermove", handlePointerMove, { passive: true });
    container.addEventListener("pointerleave", handlePointerLeave, { passive: true });

    let isVisible = true;
    let isTabVisible = !document.hidden;

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0]) isVisible = entries[0].isIntersecting;
      },
      { threshold: 0.05 },
    );
    intersectionObserver.observe(container);

    const handleVisibility = () => {
      isTabVisible = !document.hidden;
    };
    document.addEventListener("visibilitychange", handleVisibility);

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);

    let rafId = 0;
    let disposed = false;
    let lastTime = performance.now();

    const render = (now: number) => {
      if (disposed) return;

      if (!isVisible || !isTabVisible) {
        rafId = window.setTimeout(() => {
          rafId = requestAnimationFrame(render);
        }, 220) as unknown as number;
        return;
      }

      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      const t = now * 0.001;

      const mode = modeRef.current;
      const isRealAudioActive =
        liveAudioTelemetry.active &&
        (mode === "Recording" || mode === "Listening" || now - liveAudioTelemetry.updatedAt < 450);
      const isProcessing =
        mode === "Uploading" ||
        mode === "Processing" ||
        mode === "Transcribing" ||
        mode === "Analyzing";

      // Intelligent simulated speech cadence in idle mode vs real audio energy when active
      const simulatedSpeechPulse =
        0.09 +
        0.055 * Math.sin(t * 2.1) * Math.cos(t * 0.85) +
        0.035 * Math.max(0, Math.sin(t * 4.3));

      const targetEnergy = isRealAudioActive
        ? Math.max(0.18, liveAudioTelemetry.rms * 1.35)
        : isProcessing
          ? 0.44 + 0.16 * Math.sin(t * 3.6)
          : simulatedSpeechPulse;

      smoothedEnergy += (targetEnergy - smoothedEnergy) * Math.min(1, dt * 10);

      // Smooth pointer + autonomous parallax
      const autoTiltX = Math.sin(t * 0.9) * 2.2;
      const autoTiltY = Math.cos(t * 0.7) * 2.6;
      currentTiltX += (targetTiltX + autoTiltX - currentTiltX) * Math.min(1, dt * 6);
      currentTiltY += (targetTiltY + autoTiltY - currentTiltY) * Math.min(1, dt * 6);

      if (parallaxStageRef.current) {
        parallaxStageRef.current.style.transform = `perspective(800px) rotateX(${currentTiltX.toFixed(
          2,
        )}deg) rotateY(${currentTiltY.toFixed(2)}deg)`;
      }

      // Expand orbital rings slightly when audio is active
      if (ringsGroupRef.current) {
        const ringScale = 1 + smoothedEnergy * 0.12;
        ringsGroupRef.current.style.transform = `scale3d(${ringScale.toFixed(
          3,
        )}, ${ringScale.toFixed(3)}, 1)`;
      }

      // Pulse microphone glow smoothly
      if (micCapsuleRef.current) {
        const micScale = 1 + smoothedEnergy * 0.08;
        micCapsuleRef.current.style.transform = `scale3d(${micScale.toFixed(
          3,
        )}, ${micScale.toFixed(3)}, 1)`;
      }

      ctx.clearRect(0, 0, width, height);

      const cx = width * 0.5;
      const cy = height * 0.5;

      // LAYER 1: Volumetric Ambient Gold Glow & Soft Bloom
      const outerBloomRadius = Math.min(width, height) * (0.44 + smoothedEnergy * 0.12);
      const bloomGrad = ctx.createRadialGradient(cx, cy, 6, cx, cy, outerBloomRadius);
      bloomGrad.addColorStop(
        0,
        `rgba(245, 215, 127, ${(0.22 + smoothedEnergy * 0.26).toFixed(3)})`,
      );
      bloomGrad.addColorStop(
        0.38,
        `rgba(212, 175, 55, ${(0.1 + smoothedEnergy * 0.14).toFixed(3)})`,
      );
      bloomGrad.addColorStop(
        0.72,
        `rgba(184, 134, 11, ${(0.03 + smoothedEnergy * 0.05).toFixed(3)})`,
      );
      bloomGrad.addColorStop(1, "rgba(10, 10, 12, 0)");

      ctx.fillStyle = bloomGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, outerBloomRadius, 0, Math.PI * 2);
      ctx.fill();

      // LAYER 2: Radial Energy Waves (Expanding Concentric Gold Ripples)
      const rippleSpeedBoost = 1 + smoothedEnergy * 1.9;
      const minRippleR = 26;
      const maxRippleR = Math.min(width, height) * 0.46;

      for (let i = 0; i < ripples.length; i++) {
        const rp = ripples[i];
        rp.progress = (rp.progress + dt * rp.speed * rippleSpeedBoost) % 1;
        const r = minRippleR + rp.progress * (maxRippleR - minRippleR);
        const fade = Math.sin(rp.progress * Math.PI) * (0.22 + smoothedEnergy * 0.25);

        ctx.strokeStyle = `rgba(212, 175, 55, ${fade.toFixed(3)})`;
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      // LAYER 3: Circular Frequency Spectrum Around the Microphone Core
      const innerSpectrumRadius = 33 + smoothedEnergy * 3.5;
      const maxBarLength = 14 + smoothedEnergy * 18;

      for (let i = 0; i < spectrumBarCount; i++) {
        const angle = (i / spectrumBarCount) * Math.PI * 2 - Math.PI * 0.5;
        const bandIdx = i % 32;

        let targetVal = 0.12;
        if (isRealAudioActive) {
          const band = liveAudioTelemetry.bands[bandIdx] || 0;
          const wave = Math.abs(liveAudioTelemetry.waveform[i % 64] || 0);
          targetVal = 0.1 + Math.min(1, band * 0.85 + wave * 0.45);
        } else if (isProcessing) {
          targetVal =
            0.2 + 0.65 * Math.abs(Math.sin(angle * 4 + t * 5.2) * Math.cos(angle * 2 - t * 3.1));
        } else {
          // Intelligent idle harmonic spectrum
          targetVal =
            0.08 +
            0.28 *
              Math.abs(Math.sin(angle * 3 + t * 1.8) * Math.cos(angle * 5 - t * 1.1)) *
              (0.7 + smoothedEnergy * 2.2);
        }

        smoothedSpectrum[i] += (targetVal - smoothedSpectrum[i]) * Math.min(1, dt * 15);
        const barLen = Math.max(2, smoothedSpectrum[i] * maxBarLength);

        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const x1 = cx + cosA * innerSpectrumRadius;
        const y1 = cy + sinA * innerSpectrumRadius;
        const x2 = cx + cosA * (innerSpectrumRadius + barLen);
        const y2 = cy + sinA * (innerSpectrumRadius + barLen);

        const barAlpha = 0.28 + smoothedSpectrum[i] * 0.62;
        ctx.strokeStyle =
          smoothedSpectrum[i] > 0.45
            ? `rgba(255, 243, 176, ${barAlpha.toFixed(3)})`
            : `rgba(212, 175, 55, ${barAlpha.toFixed(3)})`;
        ctx.lineWidth = tier === "mobile" ? 1.5 : 1.35;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // LAYER 4: Continuous Circular Harmonic Waveform Ring
      const waveRingRadius = 51 + smoothedEnergy * 6;
      const waveSteps = tier === "mobile" ? 48 : 72;
      ctx.beginPath();
      for (let s = 0; s <= waveSteps; s++) {
        const theta = (s / waveSteps) * Math.PI * 2;
        const freqVal = isRealAudioActive ? (liveAudioTelemetry.bands[s % 32] || 0) * 8.5 : 0;
        const harmonic =
          Math.sin(theta * 6 + t * 2.8) * (1.2 + smoothedEnergy * 5.2) +
          Math.cos(theta * 4 - t * 2.1) * (0.8 + smoothedEnergy * 3.1) +
          freqVal;
        const r = waveRingRadius + harmonic;
        const px = cx + Math.cos(theta) * r;
        const py = cy + Math.sin(theta) * r;
        if (s === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.strokeStyle = `rgba(245, 215, 127, ${(0.35 + smoothedEnergy * 0.4).toFixed(3)})`;
      ctx.lineWidth = 1.15;
      ctx.stroke();

      // LAYER 5: Thin Holographic Scanning Line (Subtle Vertical Sweep)
      const scanRange = Math.min(width, height) * 0.36;
      const scanY = cy + Math.sin(t * 1.15) * scanRange;
      const scanHalfWidth = Math.sqrt(
        Math.max(0, scanRange * scanRange - (scanY - cy) * (scanY - cy)),
      );
      if (scanHalfWidth > 8) {
        const scanGrad = ctx.createLinearGradient(
          cx - scanHalfWidth,
          scanY,
          cx + scanHalfWidth,
          scanY,
        );
        scanGrad.addColorStop(0, "rgba(212, 175, 55, 0)");
        scanGrad.addColorStop(
          0.5,
          `rgba(255, 243, 176, ${(0.18 + smoothedEnergy * 0.2).toFixed(3)})`,
        );
        scanGrad.addColorStop(1, "rgba(212, 175, 55, 0)");
        ctx.strokeStyle = scanGrad;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(cx - scanHalfWidth, scanY);
        ctx.lineTo(cx + scanHalfWidth, scanY);
        ctx.stroke();
      }

      // LAYER 6: Hundreds of Orbiting Micro-Particles Along Elliptical Paths
      const speedMul = 1 + smoothedEnergy * 2.4;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.angle += p.angularSpeed * dt * speedMul;

        // Smooth radial outward drift and breathing
        const driftWave = Math.max(0, Math.sin(t * p.driftSpeed + p.driftOffset));
        const outwardDrift = driftWave * p.maxDrift * (1 + smoothedEnergy * 1.2);

        const rx = (p.baseRadiusX + outwardDrift) * (1 + smoothedEnergy * 0.08);
        const ry = (p.baseRadiusY + outwardDrift * 0.7) * (1 + smoothedEnergy * 0.08);

        const localX = Math.cos(p.angle) * rx;
        const localY = Math.sin(p.angle) * ry;

        const cosT = Math.cos(p.tiltAngle);
        const sinT = Math.sin(p.tiltAngle);

        const px = cx + localX * cosT - localY * sinT;
        const py = cy + localX * sinT + localY * cosT;

        // Smooth fade in/out
        const fadeCycle = 0.55 + 0.45 * Math.sin(t * 1.7 + p.phase);
        const alpha = Math.min(0.92, p.baseAlpha * fadeCycle * (0.85 + smoothedEnergy * 0.6));

        ctx.fillStyle = p.warmWhite
          ? `rgba(255, 250, 224, ${alpha.toFixed(3)})`
          : `rgba(212, 175, 55, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      clearTimeout(rafId);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener("visibilitychange", handleVisibility);
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      role="button"
      tabIndex={0}
      onClick={onActivateMic}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (onActivateMic) onActivateMic();
        }
      }}
      title={
        isArabic
          ? "نواة معالجة الكلام الذكية — اضغط في أي مكان لبدء التفريغ الصوتي الحي"
          : "AI Speech Intelligence Core — Click anywhere to open live microphone recording"
      }
      className={`group/card relative flex flex-col items-center justify-between py-2 px-3 select-none overflow-hidden rounded-2xl border border-[#D4AF37]/25 hover:border-[#D4AF37]/60 bg-[#0A0A0C]/70 hover:bg-[#0E0E12]/85 transition-colors cursor-pointer ${className}`}
    >
      {/* Hardware-Accelerated 2D Canvas: Orbiting Particle System, Volumetric Glow, Circular Spectrum & Energy Ripples */}
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />

      {/* Top Subtle Tag */}
      <div className="relative z-10 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-[#F5D77F]/90">
        <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37] animate-pulse" />
        <span>{isArabic ? "النواة الصوتية الذكية" : "AI Speech Core"}</span>
      </div>

      {/* 3D Parallax Stage: 7 Atomic Orbital Rings + Floating Metallic Gold Microphone */}
      <div
        ref={parallaxStageRef}
        className="relative z-10 flex h-36 w-36 sm:h-40 sm:w-40 items-center justify-center my-auto"
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* 7 Elliptical Atomic / AI Energy Orbital Rings (Different Angles, Directions, Speeds & Radii) */}
        <div
          ref={ringsGroupRef}
          className="pointer-events-none absolute inset-0 flex items-center justify-center transition-transform duration-150"
          style={{ transformStyle: "preserve-3d" }}
        >
          {ORBITAL_RING_CONFIGS.map((ring) => {
            const scaledSize = Math.round(ring.sizePx * 0.84);
            return (
              <div
                key={ring.id}
                className={`${ring.className} ${ring.borderStyle}`}
                style={{
                  width: `${scaledSize}px`,
                  height: `${scaledSize}px`,
                }}
              >
                <span className={`absolute rounded-full ${ring.nodePos} ${ring.nodeSize}`} />
              </div>
            );
          })}
        </div>

        {/* Central Floating Microphone Capsule with Metallic Gold Highlights & Internal Light Sweep */}
        <div className="hero-mic-float relative z-20 flex items-center justify-center">
          <button
            ref={micCapsuleRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onActivateMic) onActivateMic();
            }}
            title={
              isArabic
                ? "نواة معالجة الكلام الذكية — اضغط لبدء التفريغ الصوتي الحي"
                : "AI Speech Intelligence Core — Click to start live speech processing"
            }
            className="group relative flex h-13 w-13 sm:h-14 sm:w-14 items-center justify-center rounded-full border border-[#FFF3B0]/70 bg-gradient-to-b from-[#2A210B] via-[#120E05] to-[#080704] shadow-[0_0_26px_rgba(212,175,55,0.45),inset_0_1px_12px_rgba(255,243,176,0.32)] cursor-pointer overflow-hidden"
          >
            {/* Inner Metallic Ring Accent */}
            <span className="pointer-events-none absolute inset-1 rounded-full border border-[#D4AF37]/45 bg-[radial-gradient(circle_at_30%_25%,rgba(255,243,176,0.22),rgba(212,175,55,0.06)_55%,transparent_80%)]" />

            {/* Small Internal Light Sweep Movement */}
            <span className="hero-mic-light-sweep pointer-events-none absolute -inset-3 bg-gradient-to-r from-transparent via-[#FFF8DC]/45 to-transparent" />

            {/* Bespoke Metallic Gold Studio Microphone SVG with Grille Highlights */}
            <svg
              viewBox="0 0 36 36"
              fill="none"
              className="relative z-10 h-6 w-6 sm:h-7 sm:w-7 drop-shadow-[0_0_8px_rgba(212,175,55,0.65)] transition-transform duration-300 group-hover:scale-110"
            >
              <defs>
                <linearGradient id="heroMicGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FFF8DC" />
                  <stop offset="45%" stopColor="#D4AF37" />
                  <stop offset="100%" stopColor="#8C6D1F" />
                </linearGradient>
                <linearGradient id="heroMicCoreGlow" x1="50%" y1="0%" x2="50%" y2="100%">
                  <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
                  <stop offset="50%" stopColor="#F5D77F" stopOpacity="0.85" />
                  <stop offset="100%" stopColor="#B8860B" stopOpacity="0.9" />
                </linearGradient>
              </defs>

              {/* Microphone Capsule Body */}
              <rect
                x="13"
                y="6"
                width="10"
                height="15"
                rx="5"
                fill="url(#heroMicGoldGrad)"
                stroke="#FFF3B0"
                strokeWidth="0.9"
              />
              {/* Acoustic Mesh Grille Lines */}
              <line
                x1="15"
                y1="10"
                x2="21"
                y2="10"
                stroke="#141006"
                strokeWidth="1"
                strokeLinecap="round"
                opacity="0.65"
              />
              <line
                x1="14.5"
                y1="13"
                x2="21.5"
                y2="13"
                stroke="#141006"
                strokeWidth="1"
                strokeLinecap="round"
                opacity="0.65"
              />
              <line
                x1="15"
                y1="16"
                x2="21"
                y2="16"
                stroke="#141006"
                strokeWidth="1"
                strokeLinecap="round"
                opacity="0.65"
              />

              {/* Cradle Arc */}
              <path
                d="M9.5 16.5C9.5 21.1944 13.3056 25 18 25C22.6944 25 26.5 21.1944 26.5 16.5"
                stroke="url(#heroMicCoreGlow)"
                strokeWidth="2"
                strokeLinecap="round"
              />
              {/* Stem & Base */}
              <line
                x1="18"
                y1="25"
                x2="18"
                y2="29.5"
                stroke="url(#heroMicGoldGrad)"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <line
                x1="13.5"
                y1="29.5"
                x2="22.5"
                y2="29.5"
                stroke="url(#heroMicGoldGrad)"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Subtle Bottom Label */}
      <div className="relative z-10 max-w-full flex items-center gap-1.5 rounded-full border border-[#D4AF37]/25 bg-[#0D0D10]/90 px-2.5 py-0.5 text-[9.5px] font-mono text-zinc-300 shadow-sm truncate">
        <span className="text-[#D4AF37] font-semibold">
          {isArabic ? "اضغط للتسجيل الحي" : "Click for Live Mic"}
        </span>
      </div>
    </div>
  );
}
