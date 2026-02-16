"use client";

import { useEffect, useRef } from "react";

export default function TronGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    
    const speed = 1.5;
    let offset = 0;
    
    const fov = 400;
    const viewDist = 150;
    const gridWidth = 5000;
    const gridDepth = 5000;
    const spacing = 120;
    
    // Data pulses
    const pulses: { z: number, lineIndex: number, speed: number, length: number }[] = [];
    const numLines = Math.floor(gridWidth / spacing);
    
    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };
    
    window.addEventListener("resize", resize);
    resize();

    const project = (x: number, y: number, z: number) => {
      const scale = fov / (viewDist + z);
      const x2d = (x * scale) + width / 2;
      // Horizon slightly above center
      const horizonY = height * 0.4;
      const y2d = (y * scale) + horizonY; 
      return { x: x2d, y: y2d, scale };
    };

    const animate = (time: number) => {
      // Deep space background
      ctx.fillStyle = "#020408";
      ctx.fillRect(0, 0, width, height);

      // Atmospheric glow at horizon
      const glow = ctx.createLinearGradient(0, 0, 0, height);
      glow.addColorStop(0, "#010204");
      glow.addColorStop(0.38, "#0a1f2e");
      glow.addColorStop(0.45, "#020408");
      glow.addColorStop(1, "#030812");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      offset = (offset + speed) % spacing;

      // Vertical lines (Z-axis) - Moving towards viewer
      ctx.lineWidth = 1.2;
      for (let xIndex = -numLines/2; xIndex <= numLines/2; xIndex++) {
        const x = xIndex * spacing;
        
        // Use time to create a "wave" effect on the sides
        const getWaveY = (zVal: number) => {
            const distFromCenter = Math.abs(xIndex);
            if (distFromCenter < 3) return 120; // Keep center path flat
            return 120 - Math.sin(zVal * 0.002 + time * 0.001) * (distFromCenter * 8);
        };

        ctx.beginPath();
        const pStart = project(x, getWaveY(0), 0);
        ctx.moveTo(pStart.x, pStart.y);

        // Draw in segments for better perspective/fading
        const segments = 15;
        for (let i = 1; i <= segments; i++) {
            const z = (i / segments) * gridDepth;
            const p = project(x, getWaveY(z), z);
            const alpha = Math.max(0, 0.4 - (z / gridDepth));
            ctx.strokeStyle = `rgba(89, 242, 215, ${alpha})`;
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
        }
      }

      // Horizontal lines (X-axis) - Moving towards viewer
      for (let zBase = 0; zBase < gridDepth; zBase += spacing) {
        let currentZ = zBase - offset;
        if (currentZ < 0) currentZ += gridDepth;
        if (currentZ < 10) continue;

        const alpha = Math.max(0, 0.6 * (1 - (currentZ / (gridDepth * 0.7))));
        ctx.strokeStyle = `rgba(89, 242, 215, ${alpha})`;
        
        ctx.beginPath();
        // Path follows the same wave logic
        const getWaveY = (xVal: number) => {
            const xIdx = xVal / spacing;
            const distFromCenter = Math.abs(xIdx);
            if (distFromCenter < 3) return 120;
            return 120 - Math.sin(currentZ * 0.002 + time * 0.001) * (distFromCenter * 8);
        };

        const pStart = project(-gridWidth / 2, getWaveY(-gridWidth/2), currentZ);
        ctx.moveTo(pStart.x, pStart.y);

        const xSegments = 20;
        for(let i=1; i<=xSegments; i++) {
            const x = (-gridWidth/2) + (i/xSegments) * gridWidth;
            const p = project(x, getWaveY(x), currentZ);
            ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();

        // Occasional "Nodes" at intersections
        if (currentZ < 1500 && Math.sin(currentZ + time * 0.005) > 0.98) {
            for (let xIdx = -4; xIdx <= 4; xIdx++) {
                if (xIdx % 2 !== 0) continue;
                const p = project(xIdx * spacing, 120, currentZ);
                ctx.fillStyle = `rgba(124, 255, 230, ${alpha * 0.8})`;
                ctx.beginPath();
                ctx.arc(p.x, p.y, 2 * p.scale, 0, Math.PI * 2);
                ctx.fill();
            }
        }
      }

      // Random Data Pulses traveling down Z lines
      if (pulses.length < 12 && Math.random() < 0.05) {
          pulses.push({
              z: gridDepth,
              lineIndex: Math.floor((Math.random() - 0.5) * (numLines - 4)),
              speed: 10 + Math.random() * 20,
              length: 200 + Math.random() * 400
          });
      }

      for (let i = pulses.length - 1; i >= 0; i--) {
          const pulse = pulses[i];
          pulse.z -= pulse.speed;
          if (pulse.z < -pulse.length) {
              pulses.splice(i, 1);
              continue;
          }

          const x = pulse.lineIndex * spacing;
          const p1 = project(x, 120, Math.max(0, pulse.z));
          const p2 = project(x, 120, Math.min(gridDepth, pulse.z + pulse.length));

          const alpha = Math.max(0, 0.8 * (1 - (pulse.z / gridDepth)));
          const grad = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
          grad.addColorStop(0, `rgba(89, 242, 215, ${alpha})`);
          grad.addColorStop(1, "transparent");
          
          ctx.strokeStyle = grad;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
      }
      
      requestAnimationFrame(animate);
    };

    const frameId = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      className="tron-grid-canvas"
      style={{ 
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: -1,
        background: '#020408'
      }}
    />
  );
}
