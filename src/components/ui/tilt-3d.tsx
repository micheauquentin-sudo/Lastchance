"use client";

import React, { useRef, useState } from "react";

export function Tilt3D({
  children,
  className = "",
  intensity = 10,
  scale = 1.02,
}: {
  children: React.ReactNode;
  className?: string;
  intensity?: number;
  scale?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const [active, setActive] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;

    if (!active) setActive(true);

    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const xc = rect.width / 2;
    const yc = rect.height / 2;

    const rotateX = -((y - yc) / yc) * intensity;
    const rotateY = ((x - xc) / xc) * intensity;

    setRotation({ x: rotateX, y: rotateY });
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setActive(false);
    setRotation({ x: 0, y: 0 });
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={className}
      style={{
        transition: active ? "transform 100ms ease-out" : "transform 400ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        transform: isHovered
          ? `perspective(1000px) rotateX(${rotation.x.toFixed(2)}deg) rotateY(${rotation.y.toFixed(2)}deg) scale3d(${scale}, ${scale}, ${scale})`
          : "perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)",
        transformStyle: "preserve-3d",
      }}
    >
      <div className="h-full w-full" style={{ transform: "translateZ(24px)", transformStyle: "preserve-3d" }}>
        {children}
      </div>
    </div>
  );
}
