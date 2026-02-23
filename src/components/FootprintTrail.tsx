"use client";

import { useCallback, useEffect, useRef } from "react";

type Point = {
  x: number;
  y: number;
  age: number;
  size: number;
  rotation: number;
};

const MAX_POINTS = 40;
const FADE_DURATION_MS = 1200;
const THROTTLE_MS = 60;
const MIN_MOVE_PX = 12;

export default function FootprintTrail({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointsRef = useRef<Point[]>([]);
  const rafRef = useRef<number>(0);
  const lastPointRef = useRef<{ x: number; y: number; time: number }>({ x: 0, y: 0, time: 0 });

  const drawBlot = useCallback((ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rotation: number, alpha: number) => {
    ctx.save();
    ctx.globalAlpha = alpha * 0.35;
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.fillStyle = "rgba(30, 15, 8, 1)";

    // Main blot
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.6, size * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Secondary smaller blot offset (footstep pair)
    ctx.beginPath();
    ctx.ellipse(size * 0.3, -size * 0.5, size * 0.35, size * 0.25, 0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }, []);

  // Animation loop
  useEffect(() => {
    if (!active) {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
      pointsRef.current = [];
      return;
    }

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const now = Date.now();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      pointsRef.current = pointsRef.current.filter(
        (p) => now - p.age < FADE_DURATION_MS
      );

      for (const p of pointsRef.current) {
        const elapsed = now - p.age;
        const alpha = 1 - elapsed / FADE_DURATION_MS;
        drawBlot(ctx, p.x, p.y, p.size, p.rotation, alpha);
      }

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active, drawBlot]);

  // Mouse move handler
  useEffect(() => {
    if (!active) return;

    const handleMouseMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const now = Date.now();

      const last = lastPointRef.current;
      const dx = x - last.x;
      const dy = y - last.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (now - last.time < THROTTLE_MS || dist < MIN_MOVE_PX) return;

      lastPointRef.current = { x, y, time: now };

      pointsRef.current.push({
        x,
        y,
        age: now,
        size: 6 + Math.random() * 6,
        rotation: Math.random() * Math.PI,
      });

      if (pointsRef.current.length > MAX_POINTS) {
        pointsRef.current = pointsRef.current.slice(-MAX_POINTS);
      }
    };

    const container = canvasRef.current?.parentElement;
    container?.addEventListener("mousemove", handleMouseMove);
    return () => container?.removeEventListener("mousemove", handleMouseMove);
  }, [active]);

  // Resize canvas to match parent
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        canvas.width = width;
        canvas.height = height;
      }
    });

    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }
    return () => resizeObserver.disconnect();
  }, []);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-10 pointer-events-none"
      style={{ mixBlendMode: "multiply" }}
    />
  );
}
