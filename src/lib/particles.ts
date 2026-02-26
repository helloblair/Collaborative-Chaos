/**
 * Canvas particle system for spell effects.
 *
 * Pure data + math — no React, no Konva. The BoardCanvas ephemeral layer
 * calls `tickParticles` each frame and draws via `drawParticles`.
 *
 * Two effect types:
 *   - spark: golden burst radiating outward (AI creation)
 *   - smoke: translucent wisps drifting upward (Evanesco deletion)
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type ParticleKind = "spark" | "smoke";

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds remaining */
  life: number;
  /** Total lifetime (for alpha calc) */
  maxLife: number;
  size: number;
  kind: ParticleKind;
  /** Hue-shift for color variety (0-1) */
  hue: number;
  /** Rotation in radians (smoke only) */
  rotation: number;
  /** Rotation speed rad/s */
  rotationSpeed: number;
}

// ─── Spawn helpers ───────────────────────────────────────────────────────────

const TAU = Math.PI * 2;
const rand = (min: number, max: number) => min + Math.random() * (max - min);

/**
 * Emit a burst of golden spark particles radiating outward from (cx, cy).
 * Used when the AI creates an object.
 */
export function emitSparks(cx: number, cy: number, count = 14): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * TAU + rand(-0.2, 0.2);
    const speed = rand(60, 180);
    const life = rand(0.4, 0.9);
    particles.push({
      x: cx + rand(-4, 4),
      y: cy + rand(-4, 4),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      maxLife: life,
      size: rand(2, 5),
      kind: "spark",
      hue: rand(0, 1),
      rotation: 0,
      rotationSpeed: 0,
    });
  }
  return particles;
}

/**
 * Emit smoke wisps drifting upward from (cx, cy).
 * Used when an object is deleted (Evanesco).
 */
export function emitSmoke(cx: number, cy: number, count = 10): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const life = rand(0.6, 1.3);
    particles.push({
      x: cx + rand(-20, 20),
      y: cy + rand(-10, 10),
      vx: rand(-15, 15),
      vy: rand(-80, -30), // drifts upward
      life,
      maxLife: life,
      size: rand(8, 18),
      kind: "smoke",
      hue: rand(0, 1),
      rotation: rand(0, TAU),
      rotationSpeed: rand(-1.5, 1.5),
    });
  }
  return particles;
}

// ─── Update ──────────────────────────────────────────────────────────────────

/**
 * Advance all particles by `dt` seconds. Returns only the particles still alive.
 */
export function tickParticles(particles: Particle[], dt: number): Particle[] {
  const alive: Particle[] = [];
  for (const p of particles) {
    p.life -= dt;
    if (p.life <= 0) continue;

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rotation += p.rotationSpeed * dt;

    // Sparks decelerate; smoke decelerates gently
    if (p.kind === "spark") {
      p.vx *= 0.96;
      p.vy *= 0.96;
    } else {
      p.vx *= 0.98;
      p.vy *= 0.99;
      // Smoke expands
      p.size += dt * 6;
    }

    alive.push(p);
  }
  return alive;
}

// ─── Draw ────────────────────────────────────────────────────────────────────

/**
 * Draw all particles onto a Canvas 2D context.
 * Called from a Konva `Shape` sceneFunc — the context is already in world coords.
 */
export function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]): void {
  for (const p of particles) {
    const alpha = Math.max(0, p.life / p.maxLife);

    if (p.kind === "spark") {
      // Golden gradient: warm yellow → amber based on hue
      const r = Math.round(255 - p.hue * 30);
      const g = Math.round(180 + p.hue * 40);
      const b = Math.round(30 + p.hue * 20);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, TAU);
      ctx.fill();
      // Glow halo
      ctx.globalAlpha = alpha * 0.3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 2.5, 0, TAU);
      ctx.fill();
    } else {
      // Smoke: translucent gray-brown wisps
      const gray = Math.round(120 + p.hue * 60);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.globalAlpha = alpha * 0.35;
      ctx.fillStyle = `rgb(${gray},${gray - 20},${gray - 40})`;
      ctx.beginPath();
      // Elliptical wisp
      ctx.ellipse(0, 0, p.size, p.size * 0.6, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

// ─── Cursor trail drawing ────────────────────────────────────────────────────

export interface TrailPoint {
  x: number;
  y: number;
  t: number; // timestamp ms
}

const TRAIL_FADE_MS = 500;

/**
 * Draw fading sparkle trail dots for a set of cursors.
 * Each cursor has an array of recent positions with timestamps.
 */
export function drawCursorTrails(
  ctx: CanvasRenderingContext2D,
  trails: Map<string, TrailPoint[]>,
  now: number,
  colors: Map<string, string>,
): void {
  for (const [key, points] of trails) {
    const color = colors.get(key) ?? "#fbbf24";
    for (const pt of points) {
      const age = now - pt.t;
      if (age > TRAIL_FADE_MS) continue;
      const alpha = 1 - age / TRAIL_FADE_MS;
      const size = 2.5 * alpha + 1;
      ctx.globalAlpha = alpha * 0.7;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, size, 0, TAU);
      ctx.fill();
      // Sparkle glow
      ctx.globalAlpha = alpha * 0.2;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, size * 3, 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

/**
 * Prune trail points older than TRAIL_FADE_MS.
 */
export function pruneTrails(trails: Map<string, TrailPoint[]>, now: number): void {
  for (const [key, points] of trails) {
    const cutoff = now - TRAIL_FADE_MS;
    const pruned = points.filter((p) => p.t > cutoff);
    if (pruned.length === 0) {
      trails.delete(key);
    } else {
      trails.set(key, pruned);
    }
  }
}
