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
    
    // Grid parameters
    const speed = 2; // Speed of movement
    let offset = 0;
    
    // Perspective parameters
    const fov = 300;
    const viewDist = 200;
    const gridWidth = 4000; // Wider grid to cover edges
    const gridDepth = 4000;
    const spacing = 100; // Grid cell size
    
    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };
    
    window.addEventListener("resize", resize);
    resize();

    const drawLine = (x1: number, y1: number, x2: number, y2: number, alpha: number) => {
        ctx.strokeStyle = `rgba(89, 242, 215, ${alpha})`; // Minty Cyan
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    };

    // Project 3D point to 2D screen
    const project = (x: number, y: number, z: number) => {
        const scale = fov / (viewDist + z);
        const x2d = (x * scale) + width / 2;
        const y2d = (y * scale) + height / 2; // Horizon at center?
        // Adjust horizon to be slightly above center (approx 35% down)
        const horizonY = height * 0.35;
        const y2d_adjusted = ((y * scale) + horizonY); 
        return { x: x2d, y: y2d_adjusted, scale };
    };

    const animate = () => {
      ctx.fillStyle = "#020408"; // Deep dark background
      ctx.fillRect(0, 0, width, height);

      // Gradient sky/fog
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, "#010204");
      gradient.addColorStop(0.35, "#0a1f2e"); // Horizon glow
      gradient.addColorStop(0.45, "#020408");
      gradient.addColorStop(1, "#020408");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      offset = (offset + speed) % spacing;

      // Draw Vertical Lines
      for (let x = -gridWidth / 2; x <= gridWidth / 2; x += spacing) {
        // Find start and end points of the line in 3D
        // From z=0 (closest) to z=gridDepth (farthest)
        // But we want it to move towards us, so z goes from near to far
        
        // Actually, to simulate moving forward, the world moves towards -z ? 
        // Let's stick to a static grid where we shift the 'z' logic.
        
        // Let's draw lines from z=0 to z=2000
        const p1 = project(x, 100, 0); // floor is at y=100
        const p2 = project(x, 100, gridDepth);
        
        // Fade out as it gets further
        // We can't easily gradient stroke in canvas, so just solid for now
        // or draw segments. Simple solid lines for vertical is fine.
        
        if (p1.x > 0 && p1.x < width && p1.y > 0 && p1.y < height) {
           drawLine(p1.x, p1.y, p2.x, p2.y, 0.2); // Low opacity vertical lines
        } else if (p2.x > 0 && p2.x < width) {
             drawLine(p1.x, p1.y, p2.x, p2.y, 0.2);
        }
      }

      // Draw Horizontal Lines (moving towards viewer)
      // They are at fixed Z intervals relative to the offset
      for (let z = 0; z < gridDepth; z += spacing) {
        // The z coordinate in camera space.
        // We want them to appear at z, z+spacing, etc.
        // We subtract offset to make them come closer.
        
        let currentZ = z - offset;
        if (currentZ < 0) currentZ += gridDepth; // Loop back
        
        // Don't draw if behind camera or too close
        if (currentZ < 10) continue; 
        
        const p1 = project(-gridWidth / 2, 100, currentZ);
        const p2 = project(gridWidth / 2, 100, currentZ);

        // Calculate alpha based on distance (fog)
        // Closer = brighter, Farther = dimmer
        const alpha = Math.max(0, 1 - (currentZ / (gridDepth * 0.8)));

        drawLine(p1.x, p1.y, p2.x, p2.y, alpha * 0.6);
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
