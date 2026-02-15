"use client";

import { useEffect, useRef } from "react";

type BinaryGlyph = "0" | "1";

type Particle = {
  ox: number;
  oy: number;
  phase: number;
  speed: number;
  ampX: number;
  ampY: number;
  alpha: number;
  glow: number;
  glyph: BinaryGlyph;
  nextFlipAt: number;
};

const MIN_SPACING = 12;
const MAX_DPR = 2;
const PUSH_RADIUS = 126;
const PUSH_STRENGTH = 32;

function nextGlyph(): BinaryGlyph {
  return Math.random() < 0.5 ? "0" : "1";
}

export default function BinarySignalField() {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const pointer = {
      x: 0,
      y: 0,
      active: false,
    };

    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    let frame = 0;
    let reducedMotion = false;

    const motionMedia = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => {
      reducedMotion = motionMedia.matches;
    };

    const buildParticles = () => {
      particles = [];
      const spacing = Math.max(MIN_SPACING, width < 700 ? 14 : 12);
      const yStart = spacing * 0.7;
      const xStart = spacing * 0.55;

      for (let y = yStart; y < height - spacing * 0.5; y += spacing) {
        for (let x = xStart; x < width - spacing * 0.45; x += spacing) {
          particles.push({
            ox: x + (Math.random() - 0.5) * 1.8,
            oy: y + (Math.random() - 0.5) * 1.8,
            phase: Math.random() * Math.PI * 2,
            speed: 0.75 + Math.random() * 1.15,
            ampX: 0.3 + Math.random() * 1.2,
            ampY: 0.45 + Math.random() * 1.5,
            alpha: 0.18 + Math.random() * 0.45,
            glow: 0.2 + Math.random() * 0.8,
            glyph: nextGlyph(),
            nextFlipAt: performance.now() + 200 + Math.random() * 1000,
          });
        }
      }
    };

    const resize = () => {
      const rect = wrapper.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));

      const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.textAlign = "center";
      context.textBaseline = "middle";

      buildParticles();
    };

    const draw = (time: number) => {
      context.clearRect(0, 0, width, height);
      context.font = `${width < 700 ? 9 : 10}px "IBM Plex Mono", "SF Mono", Menlo, monospace`;

      for (const item of particles) {
        if (time >= item.nextFlipAt) {
          item.glyph = nextGlyph();
          item.nextFlipAt = time + 140 + Math.random() * 1200;
        }

        const wobbleX = reducedMotion ? 0 : Math.sin(time * 0.0022 * item.speed + item.phase) * item.ampX;
        const wobbleY = reducedMotion ? 0 : Math.cos(time * 0.0018 * item.speed + item.phase) * item.ampY;

        let pushX = 0;
        let pushY = 0;
        let hoverForce = 0;

        if (pointer.active) {
          const dx = item.ox - pointer.x;
          const dy = item.oy - pointer.y;
          const distance = Math.hypot(dx, dy);

          if (distance > 0 && distance < PUSH_RADIUS) {
            const intensity = (1 - distance / PUSH_RADIUS) ** 2;
            hoverForce = intensity;
            const impulse = intensity * PUSH_STRENGTH;
            pushX = (dx / distance) * impulse;
            pushY = (dy / distance) * impulse;
          }
        }

        const drawX = item.ox + wobbleX + pushX;
        const drawY = item.oy + wobbleY + pushY;
        const alpha = Math.min(0.96, item.alpha + hoverForce * 0.7);

        context.fillStyle = `rgba(${8 + item.glow * 26}, ${172 + item.glow * 62}, ${95 + item.glow * 62}, ${alpha})`;
        context.fillText(item.glyph, drawX, drawY);
      }

      frame = window.requestAnimationFrame(draw);
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      pointer.active = true;
    };

    const onPointerLeave = () => {
      pointer.active = false;
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(wrapper);

    updateMotionPreference();
    motionMedia.addEventListener("change", updateMotionPreference);

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("pointercancel", onPointerLeave);

    resize();
    frame = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      motionMedia.removeEventListener("change", updateMotionPreference);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("pointercancel", onPointerLeave);
    };
  }, []);

  return (
    <div className="binary-field" ref={wrapperRef}>
      <canvas className="binary-canvas" ref={canvasRef} />
    </div>
  );
}
