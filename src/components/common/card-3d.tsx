import React, { useState, useRef } from "react";
import { cn } from "@/lib/utils";

interface Card3DProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  goldBorder?: boolean;
  glow?: boolean;
  intensity?: number;
}

export function Card3D({
  children,
  className = "",
  goldBorder = true,
  glow = true,
  intensity = 15,
  ...props
}: Card3DProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [glarePos, setGlarePos] = useState({ x: 50, y: 50 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotX = ((y - centerY) / centerY) * -intensity;
    const rotY = ((x - centerX) / centerX) * intensity;

    setRotateX(rotX);
    setRotateY(rotY);
    setGlarePos({
      x: (x / rect.width) * 100,
      y: (y / rect.height) * 100,
    });
  };

  const handleMouseEnter = () => setIsHovered(true);

  const handleMouseLeave = () => {
    setIsHovered(false);
    setRotateX(0);
    setRotateY(0);
  };

  return (
    <div
      style={{ perspective: "1000px" }}
      className="inline-block w-full transition-transform"
      suppressHydrationWarning
    >
      <div
        ref={cardRef}
        suppressHydrationWarning
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          transform: isHovered
            ? `rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`
            : "rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)",
          transition: isHovered ? "transform 0.1s ease-out" : "transform 0.5s ease-out",
          transformStyle: "preserve-3d",
        }}
        className={cn(
          "relative rounded-2xl transition-all duration-300",
          goldBorder && "gold-card-animated-border",
          glow && isHovered && "shadow-[0_0_35px_rgba(212,175,55,0.35)]",
          className,
        )}
        {...props}
      >
        {/* Dynamic Specular Sheen */}
        {isHovered && (
          <div
            className="pointer-events-none absolute inset-0 z-30 rounded-2xl opacity-40 transition-opacity"
            style={{
              background: `radial-gradient(circle 220px at ${glarePos.x}% ${glarePos.y}%, rgba(255, 230, 140, 0.4), transparent 80%)`,
            }}
          />
        )}

        <div className="relative z-10 w-full h-full [transform:translateZ(10px)]">{children}</div>
      </div>
    </div>
  );
}
