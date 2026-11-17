import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RotateCw, Eye, Cpu } from "lucide-react";
import { liveAudioTelemetry, useUIStore, type AudioSystemMode } from "@/stores/ui-store";

interface AudioOrb3DProps {
  isPlaying?: boolean;
  className?: string;
  size?: "xs" | "sm" | "md" | "lg";
  interactive?: boolean;
  title?: string;
  compactCard?: boolean;
}

// Pre-allocated module-level helpers to guarantee zero GC allocations in the render loop
const _tempColor = new THREE.Color();

export function AudioOrb3D({
  isPlaying = true,
  className = "",
  size = "md",
  interactive = true,
  title = "3D Waves",
  compactCard = false,
}: AudioOrb3DProps) {
  const [mounted, setMounted] = useState(false);
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const rootContainerRef = useRef<HTMLDivElement | null>(null);

  const [wireframeMode, setWireframeMode] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);
  const [isLightweightMode, setIsLightweightMode] = useState(false);

  const audioSystemMode = useUIStore((s) => s.audioSystemMode);
  const audioJobProgress = useUIStore((s) => s.audioJobProgress);

  // Store reactive props in refs so React updates never tear down or recreate the WebGL context
  const stateRef = useRef<{
    isPlaying: boolean;
    wireframeMode: boolean;
    speedMultiplier: number;
    systemMode: AudioSystemMode;
  }>({
    isPlaying,
    wireframeMode,
    speedMultiplier,
    systemMode: audioSystemMode,
  });

  useEffect(() => {
    stateRef.current.isPlaying = isPlaying;
    stateRef.current.wireframeMode = wireframeMode;
    stateRef.current.speedMultiplier = speedMultiplier;
    stateRef.current.systemMode = audioSystemMode;
  }, [isPlaying, wireframeMode, speedMultiplier, audioSystemMode]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const heightClass = compactCard
    ? "flex-1 min-h-[112px] h-full"
    : size === "xs"
      ? "h-36"
      : size === "sm"
        ? "h-40 sm:h-44"
        : size === "lg"
          ? "h-96"
          : "h-72";

  useEffect(() => {
    if (!mounted) return;
    const container = canvasMountRef.current;
    if (!container) return;

    // 1. Hardware & Software-WebGL Detection for Automatic Lightweight Mode
    const isSoftwareGl = (() => {
      try {
        const probeCanvas = document.createElement("canvas");
        const gl = probeCanvas.getContext("webgl2") || probeCanvas.getContext("webgl");
        if (!gl) return true;
        const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
        const rendererStr = debugInfo
          ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
          : String(gl.getParameter(gl.RENDERER));
        gl.getExtension("WEBGL_lose_context")?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(rendererStr);
      } catch {
        return false;
      }
    })();

    const lowCores =
      typeof navigator !== "undefined" &&
      navigator.hardwareConcurrency &&
      navigator.hardwareConcurrency <= 4;
    const lightweight = Boolean(isSoftwareGl || lowCores);
    setIsLightweightMode(lightweight);

    const width = Math.max(160, container.clientWidth || 280);
    const height = Math.max(110, container.clientHeight || 160);

    // 2. Scene, Fog & True Perspective Camera
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x09090b, 0.095);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 0.15, 5.25);
    camera.lookAt(0, 0, 0);

    // 3. Single GPU-Accelerated WebGLRenderer
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch {
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, lightweight ? 1.25 : 1.75),
    );
    renderer.setSize(width, height);

    container.innerHTML = "";
    const canvasEl = renderer.domElement;
    canvasEl.style.display = "block";
    canvasEl.style.width = "100%";
    canvasEl.style.height = "100%";
    container.appendChild(canvasEl);

    // Handle WebGL Context Loss Gracefully
    const handleContextLost = (e: Event) => {
      e.preventDefault();
    };
    canvasEl.addEventListener("webglcontextlost", handleContextLost, false);

    // 4. Studio Environment Map for Authentic Metallic Gold PBR Reflections
    let envTexture: THREE.Texture | null = null;
    try {
      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = envTexture;
      pmremGenerator.dispose();
    } catch {
      // Fallback to point lights if PMREM fails
    }

    // 5. Balanced 3-Point Warm/Cool Studio Lighting
    const hemiLight = new THREE.HemisphereLight(0xfff4d2, 0x12100b, 1.4);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffdf80, 2.8);
    keyLight.position.set(3.5, 4.0, 4.0);
    scene.add(keyLight);

    const rimLight = new THREE.PointLight(0xd4af37, 3.6, 14);
    rimLight.position.set(-3.0, -2.2, -2.5);
    scene.add(rimLight);

    // 6. Composite Multi-Part 3D Subject (orbGroup)
    const orbGroup = new THREE.Group();
    scene.add(orbGroup);

    // Part A: Inner Neural Core Sphere (Harmonic Displacement)
    const coreSegments = lightweight ? 28 : 40;
    const coreGeo = new THREE.SphereGeometry(0.62, coreSegments, coreSegments);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x1c1608,
      emissive: 0xd4af37,
      emissiveIntensity: 0.42,
      metalness: 0.92,
      roughness: 0.18,
      wireframe: stateRef.current.wireframeMode,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    orbGroup.add(coreMesh);

    const corePosAttr = coreGeo.attributes.position;
    const coreOrigPos = new Float32Array(corePosAttr.array.length);
    coreOrigPos.set(corePosAttr.array as ArrayLike<number>);

    // Part B: Geodesic Faceted Gold Cage
    const latticeGeo = new THREE.IcosahedronGeometry(0.88, lightweight ? 1 : 2);
    const latticeMat = new THREE.MeshStandardMaterial({
      color: 0xf3cf65,
      wireframe: true,
      transparent: true,
      opacity: 0.34,
      metalness: 0.9,
      roughness: 0.15,
      emissive: 0x9a7b1c,
      emissiveIntensity: 0.22,
    });
    const latticeMesh = new THREE.Mesh(latticeGeo, latticeMat);
    orbGroup.add(latticeMesh);

    // Part C: 4 Synchronized Atomic Orbital Gimbal Rings (Varying Roughness/Metalness & Inclinations)
    const tubularSegments = lightweight ? 64 : 96;

    const ringMatPrimary = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      metalness: 0.96,
      roughness: 0.12,
      emissive: 0xb8860b,
      emissiveIntensity: 0.32,
    });

    const ringMatSecondary = new THREE.MeshStandardMaterial({
      color: 0xffe58f,
      metalness: 0.88,
      roughness: 0.38,
      emissive: 0xd4af37,
      emissiveIntensity: 0.25,
    });

    // Ring 1: Inner high-speed inclined atomic orbit
    const ring1Geo = new THREE.TorusGeometry(1.12, 0.018, 12, tubularSegments);
    const ring1 = new THREE.Mesh(ring1Geo, ringMatPrimary);
    ring1.rotation.set(Math.PI / 3.2, Math.PI / 6, 0);
    orbGroup.add(ring1);

    // Ring 2: Counter-rotating meridian orbit
    const ring2Geo = new THREE.TorusGeometry(1.28, 0.015, 12, tubularSegments);
    const ring2 = new THREE.Mesh(ring2Geo, ringMatSecondary);
    ring2.rotation.set(-Math.PI / 2.8, Math.PI / 3.5, Math.PI / 8);
    orbGroup.add(ring2);

    // Ring 3: Wide diagonal harmonic gimbal
    const ring3Geo = new THREE.TorusGeometry(1.44, 0.02, 14, tubularSegments);
    const ring3 = new THREE.Mesh(ring3Geo, ringMatPrimary);
    ring3.rotation.set(Math.PI / 5, -Math.PI / 4, Math.PI / 3);
    orbGroup.add(ring3);

    // Part C-2: 3 Multi-Layer 3D Harmonic Soundwave Ribbons (Deforming 3D Gold Wave Layers)
    const wavePointsCount = lightweight ? 72 : 108;
    const waveBaseAngles = new Float32Array(wavePointsCount);
    for (let i = 0; i < wavePointsCount; i++) {
      waveBaseAngles[i] = (i / wavePointsCount) * Math.PI * 2;
    }

    const createWaveLayer = (
      radius: number,
      colorHex: number,
      opacity: number,
      rotX: number,
      rotY: number,
    ) => {
      const positions = new Float32Array(wavePointsCount * 3);
      for (let i = 0; i < wavePointsCount; i++) {
        const theta = waveBaseAngles[i];
        positions[i * 3] = Math.cos(theta) * radius;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = Math.sin(theta) * radius;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.LineBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity,
      });
      const loop = new THREE.LineLoop(geo, mat);
      loop.rotation.x = rotX;
      loop.rotation.y = rotY;
      orbGroup.add(loop);
      return { geo, mat, loop, radius };
    };

    const waveLayer1 = createWaveLayer(1.56, 0xfff3b0, 0.88, Math.PI / 2.35, 0.12);
    const waveLayer2 = createWaveLayer(1.72, 0xd4af37, 0.65, -Math.PI / 2.6, -0.28);
    const waveLayer3 = createWaveLayer(1.86, 0xb8860b, 0.48, Math.PI / 3.1, 0.42);

    // Part D: Orbital Electron Nodes on the Rings (4 small golden spheres)
    const nodeGeo = new THREE.SphereGeometry(0.042, 12, 12);
    const nodeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffd700,
      emissiveIntensity: 1.2,
      metalness: 0.5,
      roughness: 0.1,
    });
    const orbitalNode1 = new THREE.Mesh(nodeGeo, nodeMat);
    orbitalNode1.position.set(1.12, 0, 0);
    ring1.add(orbitalNode1);

    const orbitalNode2 = new THREE.Mesh(nodeGeo, nodeMat);
    orbitalNode2.position.set(0, 1.28, 0);
    ring2.add(orbitalNode2);

    const orbitalNode3 = new THREE.Mesh(nodeGeo, nodeMat);
    orbitalNode3.position.set(-1.44, 0, 0);
    ring3.add(orbitalNode3);

    // 7. Subtle Background Golden Dust Particles (Responsive Count)
    const isMobileViewport = typeof window !== "undefined" && window.innerWidth < 768;
    const particleCount = lightweight || isMobileViewport ? 55 : 135;
    const particleGeo = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const r = 1.4 + Math.random() * 1.55;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      particlePositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      particlePositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      particlePositions[i * 3 + 2] = r * Math.cos(phi);
    }

    particleGeo.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));

    const particleMat = new THREE.PointsMaterial({
      color: 0xffe484,
      size: 0.038,
      transparent: true,
      opacity: 0.68,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const particles = new THREE.Points(particleGeo, particleMat);
    orbGroup.add(particles);

    // Pre-warm shaders once on hardware GPU
    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // 8. Pointer Interaction with Smooth Damping
    let targetRotationX = 0;
    let targetRotationY = 0;

    const handlePointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      targetRotationY = nx * 0.65;
      targetRotationX = -ny * 0.55;
    };

    const handlePointerLeave = () => {
      targetRotationX = 0;
      targetRotationY = 0;
    };

    if (interactive) {
      container.addEventListener("pointermove", handlePointerMove, {
        passive: true,
      });
      container.addEventListener("pointerleave", handlePointerLeave, {
        passive: true,
      });
    }

    // 9. Visibility & Off-Screen Rendering Suspension (Zero CPU/GPU waste when off-screen)
    let isVisibleOnScreen = true;
    let isTabVisible = !document.hidden;

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) {
          isVisibleOnScreen = entry.isIntersecting;
        }
      },
      { threshold: 0.05 },
    );
    intersectionObserver.observe(container);

    const handleVisibilityChange = () => {
      isTabVisible = !document.hidden;
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // 10. Frame-Rate Independent Animation Loop with Software-WebGL Fence Pacing
    let frameId = 0;
    let disposed = false;
    const clock = new THREE.Clock();
    let smoothedEnergy = 0.09;

    function afterDraw(cb: () => void) {
      if (disposed) return;
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (gl && typeof gl.fenceSync === "function") {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed) return;
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 6);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 6);
      } else {
        frameId = window.setTimeout(cb, 80);
      }
    }

    const tick = () => {
      if (disposed) return;

      // If off-screen or hidden tab, throttle check without rendering WebGL
      if (!isVisibleOnScreen || !isTabVisible) {
        frameId = window.setTimeout(tick, 250);
        return;
      }

      const delta = Math.min(clock.getDelta(), 0.1);
      const { wireframeMode: wf, speedMultiplier: spd, systemMode } = stateRef.current;

      if (coreMat.wireframe !== wf) {
        coreMat.wireframe = wf;
      }

      // Compute target activity level from real Web Audio API telemetry + simulated speech cadence
      const isProcessingStage =
        systemMode === "Uploading" ||
        systemMode === "Processing" ||
        systemMode === "Transcribing" ||
        systemMode === "Analyzing";
      const isRecordingOrListening = systemMode === "Recording" || systemMode === "Listening";

      const realRms = liveAudioTelemetry.active ? liveAudioTelemetry.rms : 0;
      const idleSimulatedWave = 0.09 + 0.05 * Math.sin(clock.elapsedTime * 1.9);
      const targetEnergy = isRecordingOrListening
        ? Math.max(0.18, realRms * 1.35)
        : isProcessingStage
          ? 0.52
          : idleSimulatedWave;

      smoothedEnergy = THREE.MathUtils.damp(smoothedEnergy, targetEnergy, 6, delta);

      const effectiveSpeed = spd * (1 + smoothedEnergy * 1.45);
      const elapsed = clock.elapsedTime * effectiveSpeed;

      // Gentle autonomous perspective movement + pointer parallax damping
      const autoParallaxX = Math.sin(clock.elapsedTime * 0.65) * 0.14;
      const autoParallaxY = Math.cos(clock.elapsedTime * 0.5) * 0.18;

      orbGroup.rotation.y = THREE.MathUtils.damp(
        orbGroup.rotation.y,
        targetRotationY + autoParallaxY,
        5,
        delta,
      );
      orbGroup.rotation.x = THREE.MathUtils.damp(
        orbGroup.rotation.x,
        targetRotationX + autoParallaxX,
        5,
        delta,
      );

      // Synchronized multi-axis atomic ring rotations (different speeds & directions)
      ring1.rotation.z += delta * 0.85 * effectiveSpeed;
      ring1.rotation.x += delta * 0.42 * effectiveSpeed;

      ring2.rotation.y -= delta * 0.95 * effectiveSpeed;
      ring2.rotation.z += delta * 0.52 * effectiveSpeed;

      ring3.rotation.x += delta * 0.62 * effectiveSpeed;
      ring3.rotation.y += delta * 0.74 * effectiveSpeed;

      waveLayer1.loop.rotation.z -= delta * 0.55 * effectiveSpeed;
      waveLayer2.loop.rotation.z += delta * 0.42 * effectiveSpeed;
      waveLayer3.loop.rotation.z -= delta * 0.31 * effectiveSpeed;

      latticeMesh.rotation.y += delta * 0.28 * effectiveSpeed;
      latticeMesh.rotation.x -= delta * 0.18 * effectiveSpeed;

      particles.rotation.y -= delta * 0.15 * effectiveSpeed;
      particles.rotation.x += delta * 0.06 * effectiveSpeed;

      // Update all 3 3D Harmonic Soundwave Ribbon Layers with continuous wave deformation
      const bands = liveAudioTelemetry.bands;
      const waveLayers = [waveLayer1, waveLayer2, waveLayer3];
      for (let l = 0; l < waveLayers.length; l++) {
        const layer = waveLayers[l];
        const posArr = layer.geo.attributes.position.array as Float32Array;
        const freqMul = 5 + l * 2;
        const phaseDir = l % 2 === 0 ? 1 : -1;
        for (let i = 0; i < wavePointsCount; i++) {
          const angle = waveBaseAngles[i];
          const bandVal = bands[(i + l * 9) % 32] || 0;
          const harmonic =
            Math.sin(angle * freqMul + elapsed * (3.0 - l * 0.45) * phaseDir) *
              (0.055 + smoothedEnergy * (0.15 - l * 0.02)) +
            Math.cos(angle * 3 - elapsed * 1.8) * 0.035 +
            bandVal * 0.16;
          const r = layer.radius + harmonic * 0.38;
          posArr[i * 3] = Math.cos(angle) * r;
          posArr[i * 3 + 1] = harmonic * (1.15 - l * 0.15);
          posArr[i * 3 + 2] = Math.sin(angle) * r;
        }
        layer.geo.attributes.position.needsUpdate = true;
      }

      // Update inner core sphere vertices smoothly
      const posArr = corePosAttr.array as Float32Array;
      const waveFreq = 2.6;
      const displacementAmp = 0.038 + smoothedEnergy * 0.16;

      for (let i = 0; i < corePosAttr.count; i++) {
        const u = i * 3;
        const ox = coreOrigPos[u];
        const oy = coreOrigPos[u + 1];
        const oz = coreOrigPos[u + 2];

        const w =
          Math.sin(ox * 4 + elapsed * waveFreq) *
          Math.cos(oy * 4 + elapsed * waveFreq) *
          Math.sin(oz * 3 + elapsed * waveFreq);

        const s = 1 + w * displacementAmp;
        posArr[u] = ox * s;
        posArr[u + 1] = oy * s;
        posArr[u + 2] = oz * s;
      }
      corePosAttr.needsUpdate = true;

      // Subtle emissive intensity modulation
      coreMat.emissiveIntensity = 0.34 + smoothedEnergy * 0.55 + Math.sin(elapsed * 2.2) * 0.08;

      if (isProcessingStage) {
        _tempColor.setHex(0xf59e0b);
      } else {
        _tempColor.setHex(0xd4af37);
      }
      coreMat.emissive.copy(_tempColor);

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    frameId = requestAnimationFrame(tick);

    // 11. ResizeObserver
    const handleResize = () => {
      if (!container || disposed) return;
      const w = Math.max(160, container.clientWidth);
      const h = Math.max(110, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // 12. Deterministic Cleanup on Unmount
    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      canvasEl.removeEventListener("webglcontextlost", handleContextLost);

      if (interactive) {
        container.removeEventListener("pointermove", handlePointerMove);
        container.removeEventListener("pointerleave", handlePointerLeave);
      }

      coreGeo.dispose();
      coreMat.dispose();
      latticeGeo.dispose();
      latticeMat.dispose();
      ring1Geo.dispose();
      ring2Geo.dispose();
      ring3Geo.dispose();
      ringMatPrimary.dispose();
      ringMatSecondary.dispose();
      waveLayer1.geo.dispose();
      waveLayer1.mat.dispose();
      waveLayer2.geo.dispose();
      waveLayer2.mat.dispose();
      waveLayer3.geo.dispose();
      waveLayer3.mat.dispose();
      nodeGeo.dispose();
      nodeMat.dispose();
      particleGeo.dispose();
      particleMat.dispose();
      if (envTexture) envTexture.dispose();
      renderer.dispose();
      container.innerHTML = "";
    };
  }, [mounted, interactive]);

  const isProcessingActive =
    audioSystemMode === "Uploading" ||
    audioSystemMode === "Processing" ||
    audioSystemMode === "Transcribing" ||
    audioSystemMode === "Analyzing";

  return (
    <div
      ref={rootContainerRef}
      suppressHydrationWarning
      className={`relative rounded-2xl overflow-hidden border border-[#D4AF37]/30 bg-[#0A0A0C] shadow-[0_10px_30px_-10px_rgba(212,175,55,0.22)] flex flex-col justify-between select-none ${className}`}
    >
      {/* Top Header Bar (Clean Enterprise Layout, Zero Backdrop Blur Over WebGL) */}
      <div className="relative z-10 flex items-center justify-between px-3.5 pt-2.5 pb-1.5 border-b border-zinc-800/70 bg-[#0D0D10]">
        <div className="flex items-center gap-2 min-w-0">
          <Cpu className="h-3.5 w-3.5 text-[#D4AF37] shrink-0" />
          <div className="truncate">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-zinc-100 tracking-wide truncate">
                {title}
              </span>
              <span className="text-[10px] font-mono text-[#D4AF37]/90">
                · {isLightweightMode ? "WebGL Lite" : "3D WebGL"}
              </span>
            </div>
          </div>
        </div>

        {/* Interactive 3D Controls */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setWireframeMode((v) => !v)}
            className={`inline-flex items-center gap-1 h-6 px-2 text-[10px] font-medium rounded-md border transition-colors cursor-pointer ${
              wireframeMode
                ? "border-[#D4AF37] bg-[#D4AF37]/15 text-[#D4AF37]"
                : "border-zinc-800 bg-zinc-900/90 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
            }`}
            title="Toggle 3D Wireframe Lattice"
          >
            <Eye className="h-3 w-3" />
            <span>{wireframeMode ? "Solid" : "Mesh"}</span>
          </button>

          <button
            type="button"
            onClick={() => setSpeedMultiplier((s) => (s === 1 ? 1.75 : 1))}
            className="inline-flex items-center gap-1 h-6 px-2 text-[10px] font-mono font-medium rounded-md border border-zinc-800 bg-zinc-900/90 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-colors cursor-pointer"
            title="Toggle Orbital Speed"
          >
            <RotateCw className="h-2.5 w-2.5 text-[#D4AF37]" />
            <span>{speedMultiplier === 1 ? "1x" : "1.8x"}</span>
          </button>
        </div>
      </div>

      {/* Dedicated Isolated WebGL Canvas Mount Container */}
      <div
        ref={canvasMountRef}
        className={`relative w-full ${heightClass} cursor-grab active:cursor-grabbing bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.08)_0%,rgba(10,10,12,0)_70%)]`}
        title="3D Neural Orbital Visualization — Drag or move pointer to inspect"
      />

      {/* Bottom Telemetry Bar */}
      <div className="relative z-10 px-3.5 py-1.5 bg-[#0D0D10] border-t border-zinc-800/70 flex items-center justify-between text-[10px] text-zinc-400">
        <span className="font-medium text-zinc-300 truncate">AI Processing Visualization</span>
        <span className="font-mono text-[#D4AF37] tabular-nums shrink-0">
          {isProcessingActive && audioJobProgress > 0
            ? `${audioSystemMode} · ${audioJobProgress}%`
            : audioSystemMode === "Recording" || audioSystemMode === "Listening"
              ? "Neural Sync · Live"
              : "Atomic Orbits · 60fps"}
        </span>
      </div>
    </div>
  );
}
