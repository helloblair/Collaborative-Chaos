"use client";

import { auth, db } from "@/lib/firebase";
import { createBoard, deleteBoard, subscribeUserBoards } from "@/lib/boards";
import { upsertUserProfile } from "@/lib/users";
import type { Board, BoardItem } from "@/types/board";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { collection, onSnapshot } from "firebase/firestore";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";

const AVATAR_COLORS = ["#e11d48", "#2563eb", "#16a34a", "#f59e0b", "#9333ea"];

function avatarColor(email: string): string {
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function relativeTime(ts: unknown): string {
  if (!ts || typeof (ts as { toMillis?: () => number }).toMillis !== "function") return "";
  const diff = Date.now() - (ts as { toMillis: () => number }).toMillis();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// Default fill colors by item type (matches BoardCanvas defaults)
const DEFAULT_FILLS: Record<string, string> = {
  sticky: "#C9E4DE",
  rect: "#C6DEF1",
  circle: "#C6DEF1",
  heart: "#FFD7D7",
  line: "#374151",
  frame: "#6366f1",
  text: "#1c1917",
};

const DEFAULT_SIZES: Record<string, { w: number; h: number }> = {
  sticky: { w: 160, h: 160 },
  rect: { w: 200, h: 120 },
  circle: { w: 150, h: 150 },
  heart: { w: 120, h: 120 },
  line: { w: 200, h: 4 },
  frame: { w: 300, h: 200 },
  text: { w: 200, h: 30 },
};

// Deterministic rotation per board ID (-2deg to +2deg)
function polaroidRotation(boardId: string): number {
  let h = 0;
  for (let i = 0; i < boardId.length; i++) h = (h * 31 + boardId.charCodeAt(i)) >>> 0;
  return ((h % 500) / 500) * 4 - 2; // range: -2 to +2
}

function BoardThumbnail({ boardId }: { boardId: string }) {
  const [items, setItems] = useState<BoardItem[]>([]);

  useEffect(() => {
    const itemsRef = collection(db, "boards", boardId, "items");
    return onSnapshot(
      itemsRef,
      (snap) => {
        setItems(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              type: data.type ?? "sticky",
              x: data.x ?? 0,
              y: data.y ?? 0,
              width: data.width,
              height: data.height,
              fill: data.fill,
              createdBy: data.createdBy ?? "",
            } as BoardItem;
          })
        );
      },
      () => {
        // Permission denied or other error — show empty
        setItems([]);
      }
    );
  }, [boardId]);

  if (items.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center rounded-sm" style={{ background: "var(--accent-secondary-bg)" }}>
        <span className="text-xs select-none" style={{ color: "var(--text-muted)" }}>Empty board</span>
      </div>
    );
  }

  // Compute bounding box of all items, then scale to fit
  const rects = items.map((item) => {
    const w = item.width ?? DEFAULT_SIZES[item.type]?.w ?? 160;
    const h = item.height ?? DEFAULT_SIZES[item.type]?.h ?? 160;
    return { x: item.x, y: item.y, w, h, type: item.type, fill: item.fill };
  });

  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.w));
  const maxY = Math.max(...rects.map((r) => r.y + r.h));
  const bboxW = maxX - minX || 1;
  const bboxH = maxY - minY || 1;

  // SVG viewBox with 5% padding
  const pad = Math.max(bboxW, bboxH) * 0.05;
  const viewBox = `${minX - pad} ${minY - pad} ${bboxW + pad * 2} ${bboxH + pad * 2}`;

  return (
    <svg viewBox={viewBox} className="w-full h-full rounded-sm" style={{ background: "var(--surface-panel)" }} preserveAspectRatio="xMidYMid meet">
      {rects.map((r, i) => {
        const fill = r.fill ?? DEFAULT_FILLS[r.type] ?? "#C9E4DE";
        if (r.type === "circle") {
          return (
            <ellipse
              key={i}
              cx={r.x + r.w / 2}
              cy={r.y + r.h / 2}
              rx={r.w / 2}
              ry={r.h / 2}
              fill={fill}
              opacity={0.85}
            />
          );
        }
        if (r.type === "heart") {
          return (
            <ellipse
              key={i}
              cx={r.x + r.w / 2}
              cy={r.y + r.h / 2}
              rx={r.w / 2}
              ry={r.h / 2}
              fill={fill}
              opacity={0.85}
            />
          );
        }
        if (r.type === "line") {
          return (
            <line
              key={i}
              x1={r.x}
              y1={r.y + r.h / 2}
              x2={r.x + r.w}
              y2={r.y + r.h / 2}
              stroke={fill}
              strokeWidth={Math.max(3, bboxW * 0.004)}
            />
          );
        }
        if (r.type === "frame") {
          return (
            <rect
              key={i}
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              fill="none"
              stroke={fill}
              strokeWidth={Math.max(2, bboxW * 0.003)}
              strokeDasharray={`${bboxW * 0.01} ${bboxW * 0.005}`}
              opacity={0.6}
              rx={2}
            />
          );
        }
        if (r.type === "text") {
          return (
            <rect
              key={i}
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              fill={fill}
              opacity={0.25}
              rx={2}
            />
          );
        }
        // sticky, rect — solid rounded rect
        return (
          <rect
            key={i}
            x={r.x}
            y={r.y}
            width={r.w}
            height={r.h}
            fill={fill}
            rx={r.type === "sticky" ? 6 : 3}
            opacity={0.85}
          />
        );
      })}
    </svg>
  );
}

/* ─── Hero Product Mockup (CSS/SVG whiteboard preview) ──────────────────── */
function ProductMockup() {
  return (
    <div className="relative w-full max-w-3xl mx-auto">
      {/* Outer glow frame */}
      <div
        className="mockup-glow rounded-xl overflow-hidden"
        style={{ border: "1px solid var(--border-default)", background: "var(--surface-elevated)" }}
      >
        {/* Toolbar bar */}
        <div
          className="flex items-center gap-2 px-4 py-2"
          style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--surface-panel)" }}
        >
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#ef4444", opacity: 0.7 }} />
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#f59e0b", opacity: 0.7 }} />
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: "#22c55e", opacity: 0.7 }} />
          </div>
          <div className="flex-1 flex justify-center">
            <span className="text-[10px] font-medium px-3 py-0.5 rounded" style={{ color: "var(--text-muted)", background: "var(--accent-secondary-bg)" }}>
              Team Brainstorm — Collaborative Chaos
            </span>
          </div>
        </div>

        {/* Canvas area */}
        <div className="relative" style={{ background: "#f5f5f5", height: "clamp(200px, 38vh, 340px)" }}>
          {/* Grid dots */}
          <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
                <circle cx="12" cy="12" r="0.8" fill="#d1d5db" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>

          {/* Sticky notes — floating */}
          <div className="absolute" style={{ left: "8%", top: "12%", animation: "hero-float-1 8s ease-in-out infinite" }}>
            <div className="w-32 h-32 rounded-lg shadow-md flex items-center justify-center p-3" style={{ background: "#C9E4DE" }}>
              <span className="text-[11px] font-medium text-gray-700 text-center leading-tight">User Research Findings</span>
            </div>
          </div>
          <div className="absolute" style={{ left: "28%", top: "45%", animation: "hero-float-2 9s ease-in-out infinite" }}>
            <div className="w-28 h-28 rounded-lg shadow-md flex items-center justify-center p-3" style={{ background: "#FDECC8" }}>
              <span className="text-[11px] font-medium text-gray-700 text-center leading-tight">MVP Features</span>
            </div>
          </div>
          <div className="absolute" style={{ left: "52%", top: "15%", animation: "hero-float-3 7s ease-in-out infinite" }}>
            <div className="w-36 h-28 rounded-lg shadow-md flex items-center justify-center p-3" style={{ background: "#C6DEF1" }}>
              <span className="text-[11px] font-medium text-gray-700 text-center leading-tight">Architecture Diagram</span>
            </div>
          </div>
          <div className="absolute" style={{ left: "12%", top: "60%", animation: "hero-float-2 10s ease-in-out infinite" }}>
            <div className="w-24 h-24 rounded-lg shadow-md flex items-center justify-center p-3" style={{ background: "#FFD7D7" }}>
              <span className="text-[11px] font-medium text-gray-700 text-center leading-tight">Team Vibes</span>
            </div>
          </div>

          {/* Rectangle shape */}
          <div className="absolute" style={{ left: "48%", top: "55%", animation: "hero-float-1 11s ease-in-out infinite" }}>
            <div className="w-40 h-20 rounded shadow-md flex items-center justify-center" style={{ background: "#E8D5F5" }}>
              <span className="text-[10px] text-gray-600">Sprint Goals Q1</span>
            </div>
          </div>

          {/* Circle shape */}
          <div className="absolute" style={{ right: "10%", top: "30%", animation: "hero-float-3 9s ease-in-out infinite" }}>
            <div className="w-20 h-20 rounded-full shadow-md flex items-center justify-center" style={{ background: "#C6DEF1" }}>
              <span className="text-[9px] text-gray-600 text-center leading-tight">Ideas</span>
            </div>
          </div>

          {/* Connector lines (SVG) */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
            <line x1="26%" y1="38%" x2="36%" y2="50%" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="6 3" opacity="0.5" />
            <line x1="56%" y1="42%" x2="54%" y2="55%" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="6 3" opacity="0.5" />
          </svg>

          {/* Live cursors */}
          <div className="absolute" style={{ left: "40%", top: "28%", animation: "cursor-pulse 2s ease-in-out infinite", zIndex: 5 }}>
            <svg width="16" height="20" viewBox="0 0 16 20" fill="none">
              <path d="M1 1L1 15L5 11L10 17L13 14L8 8L14 7L1 1Z" fill="#e11d48" stroke="#fff" strokeWidth="1" />
            </svg>
            <span className="ml-3 -mt-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full text-white inline-block" style={{ background: "#e11d48" }}>
              Sarah
            </span>
          </div>
          <div className="absolute" style={{ left: "68%", top: "55%", animation: "cursor-pulse 2.5s ease-in-out infinite 0.5s", zIndex: 5 }}>
            <svg width="16" height="20" viewBox="0 0 16 20" fill="none">
              <path d="M1 1L1 15L5 11L10 17L13 14L8 8L14 7L1 1Z" fill="#2563eb" stroke="#fff" strokeWidth="1" />
            </svg>
            <span className="ml-3 -mt-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full text-white inline-block" style={{ background: "#2563eb" }}>
              Alex
            </span>
          </div>
          <div className="absolute" style={{ left: "22%", top: "70%", animation: "cursor-pulse 3s ease-in-out infinite 1s", zIndex: 5 }}>
            <svg width="16" height="20" viewBox="0 0 16 20" fill="none">
              <path d="M1 1L1 15L5 11L10 17L13 14L8 8L14 7L1 1Z" fill="#16a34a" stroke="#fff" strokeWidth="1" />
            </svg>
            <span className="ml-3 -mt-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full text-white inline-block" style={{ background: "#16a34a" }}>
              Jordan
            </span>
          </div>

          {/* AI chat panel peeking from right */}
          <div
            className="absolute right-0 top-4 bottom-4 w-52 rounded-l-xl flex flex-col"
            style={{ background: "rgba(20, 52, 84, 0.95)", border: "1px solid rgba(124, 210, 204, 0.2)", borderRight: "none", zIndex: 10 }}
          >
            <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: "1px solid rgba(124, 210, 204, 0.15)" }}>
              <span className="text-sm">&#x1F9D9;</span>
              <span className="text-[10px] font-semibold" style={{ color: "#e0f4ff" }}>AI Assistant</span>
            </div>
            <div className="flex-1 px-3 py-2 space-y-2 overflow-hidden">
              <div className="rounded-lg px-2 py-1.5" style={{ background: "rgba(51, 144, 158, 0.18)" }}>
                <span className="text-[9px]" style={{ color: "#e0f4ff" }}>Create a SWOT analysis template</span>
              </div>
              <div className="rounded-lg px-2 py-1.5" style={{ background: "rgba(141, 190, 213, 0.12)" }}>
                <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.85)" }}>Done! I created 4 quadrants with headers and sticky notes for each category.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Feature icons (SVG) ──────────────────────────────────────────────── */
function CollabIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10" cy="12" r="4" stroke="var(--text-accent)" strokeWidth="1.5" fill="none" />
      <circle cx="22" cy="12" r="4" stroke="var(--text-accent)" strokeWidth="1.5" fill="none" />
      <path d="M4 26c0-4 3-7 6-7h0c1.5 0 3 .5 4 1.5" stroke="var(--text-accent)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M28 26c0-4-3-7-6-7h0c-1.5 0-3 .5-4 1.5" stroke="var(--text-accent)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {/* Live cursor hint */}
      <path d="M15 6L15 9L17 7.5L15 6Z" fill="var(--text-accent)" opacity="0.6" />
    </svg>
  );
}

function ShapesIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="3" width="12" height="10" rx="2" stroke="var(--text-accent)" strokeWidth="1.5" fill="none" />
      <circle cx="23" cy="10" r="5" stroke="var(--text-accent)" strokeWidth="1.5" fill="none" />
      <rect x="4" y="20" width="10" height="10" rx="1" stroke="var(--text-accent)" strokeWidth="1.5" fill="none" transform="rotate(-3 9 25)" />
      <line x1="19" y1="22" x2="28" y2="28" stroke="var(--text-accent)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function AIIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Chat bubble */}
      <path d="M6 6h20a2 2 0 012 2v12a2 2 0 01-2 2H14l-4 4v-4H6a2 2 0 01-2-2V8a2 2 0 012-2z" stroke="var(--text-accent)" strokeWidth="1.5" fill="none" />
      {/* Sparkle */}
      <path d="M16 11v4M14 13h4" stroke="var(--text-accent)" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="22" cy="11" r="1" fill="var(--text-accent)" opacity="0.5" />
      <circle cx="10" cy="15" r="1" fill="var(--text-accent)" opacity="0.5" />
    </svg>
  );
}

function SyncIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 14a10 10 0 0118-6" stroke="var(--text-accent)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M24 14a10 10 0 01-18 6" stroke="var(--text-accent)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <polyline points="19,4 22,8 18,9" stroke="var(--text-accent)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="9,24 6,20 10,19" stroke="var(--text-accent)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TemplatesIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="3" width="10" height="10" rx="2" stroke="var(--text-accent)" strokeWidth="1.5" fill="none" />
      <rect x="15" y="3" width="10" height="10" rx="2" stroke="var(--text-accent)" strokeWidth="1.5" fill="none" />
      <rect x="3" y="15" width="10" height="10" rx="2" stroke="var(--text-accent)" strokeWidth="1.5" fill="none" />
      <rect x="15" y="15" width="10" height="10" rx="2" stroke="var(--text-accent)" strokeWidth="1.5" fill="none" />
      <line x1="8" y1="7" x2="8" y2="9" stroke="var(--text-accent)" strokeWidth="1" strokeLinecap="round" opacity="0.5" />
      <line x1="20" y1="7" x2="20" y2="9" stroke="var(--text-accent)" strokeWidth="1" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="6" r="3" stroke="var(--text-accent)" strokeWidth="1.5" fill="none" />
      <circle cx="8" cy="14" r="3" stroke="var(--text-accent)" strokeWidth="1.5" fill="none" />
      <circle cx="20" cy="22" r="3" stroke="var(--text-accent)" strokeWidth="1.5" fill="none" />
      <line x1="10.5" y1="12.5" x2="17.5" y2="7.5" stroke="var(--text-accent)" strokeWidth="1.5" />
      <line x1="10.5" y1="15.5" x2="17.5" y2="20.5" stroke="var(--text-accent)" strokeWidth="1.5" />
    </svg>
  );
}

/* ─── Scroll reveal hook ───────────────────────────────────────────────── */
function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("is-visible");
          observer.unobserve(el);
        }
      },
      { threshold: 0.15 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return ref;
}

function RevealSection({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useScrollReveal();
  const delayClass = delay === 1 ? " landing-reveal-delay-1" : delay === 2 ? " landing-reveal-delay-2" : delay === 3 ? " landing-reveal-delay-3" : "";
  return (
    <div ref={ref} className={`landing-reveal${delayClass} ${className}`}>
      {children}
    </div>
  );
}

/* ─── Landing Page (unauthenticated) ───────────────────────────────────── */
const FEATURES = [
  { icon: CollabIcon, title: "Real-Time Collaboration", desc: "Multiple cursors, live object sync, and presence awareness — all at 60Hz via Firebase RTDB." },
  { icon: AIIcon, title: "AI Agent", desc: "Natural language commands create, arrange, and template content via structured function calling." },
  { icon: TemplatesIcon, title: "Smart Templates", desc: "SWOT, journey maps, and retros auto-populate with content and deterministic grid layouts." },
  { icon: SyncIcon, title: "Instant Sync", desc: "Dual-database architecture: Firestore for persistence, RTDB for ephemeral real-time data." },
  { icon: ShapesIcon, title: "Rich Canvas Objects", desc: "Sticky notes, shapes, frames, text, connectors — with multi-select, resize, and rotate." },
  { icon: ShareIcon, title: "Board Sharing", desc: "Invite via link, multi-board dashboard, and per-board membership controls." },
];

function LandingPage({ onLogin }: { onLogin: () => void }) {
  const { t } = useTheme();

  return (
    <main className="min-h-screen overflow-y-auto">
      <ThemeToggle />

      {/* Hero section — fills viewport */}
      <section className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-4xl flex flex-col items-center text-center gap-5">
          {/* Tagline */}
          <RevealSection>
            <p className="text-xs sm:text-sm font-semibold tracking-widest uppercase" style={{ color: "var(--text-accent)" }}>
              {t("Where ideas collide and great things happen")}
            </p>
          </RevealSection>

          {/* Product name */}
          <RevealSection delay={1}>
            <h1
              className="text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight"
              style={{ color: "var(--text-heading)", fontFamily: "var(--font-heading)" }}
            >
              {t("Collaborative Chaos")}
            </h1>
          </RevealSection>

          {/* Product mockup */}
          <RevealSection delay={2} className="w-full">
            <ProductMockup />
          </RevealSection>

          {/* Description + CTA */}
          <RevealSection delay={3}>
            <p className="text-sm sm:text-base max-w-xl mx-auto mb-4 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              A collaborative whiteboard where your whole team can brainstorm, diagram, and plan in real time — with an AI assistant built right in.
            </p>
            <button
              type="button"
              onClick={onLogin}
              className="btn-primary rounded-xl px-8 py-3 sm:py-4 text-sm sm:text-base font-semibold active:scale-95 transition-all"
            >
              Start Building — It&apos;s Free
            </button>
          </RevealSection>
        </div>
      </section>

      {/* Feature cards */}
      <section className="px-6 py-16 sm:py-24">
        <div className="max-w-5xl mx-auto">
          <RevealSection>
            <h2
              className="text-2xl sm:text-3xl font-bold text-center mb-12 tracking-tight"
              style={{ color: "var(--text-heading)", fontFamily: "var(--font-heading)" }}
            >
              {t("Built for teams who think visually")}
            </h2>
          </RevealSection>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(({ icon: Icon, title, desc }, i) => (
              <RevealSection key={title} delay={Math.min(i, 3) as 0 | 1 | 2 | 3}>
                <div
                  className="feature-card rounded-xl p-5 h-full"
                  style={{
                    background: "var(--glass-bg)",
                    border: "1px solid var(--glass-border)",
                    backdropFilter: "blur(var(--blur-glass))",
                    WebkitBackdropFilter: "blur(var(--blur-glass))",
                  }}
                >
                  <div className="mb-3 opacity-80"><Icon /></div>
                  <h3 className="text-sm font-semibold mb-1.5" style={{ color: "var(--text-heading)" }}>{t(title)}</h3>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{desc}</p>
                </div>
              </RevealSection>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="px-6 py-16 text-center">
        <RevealSection>
          <p className="text-sm sm:text-base mb-5" style={{ color: "var(--text-secondary)" }}>
            Ready to turn chaos into collaboration?
          </p>
          <button
            type="button"
            onClick={onLogin}
            className="btn-primary rounded-xl px-8 py-3 sm:py-4 text-sm sm:text-base font-semibold active:scale-95 transition-all"
          >
            Get Started Free
          </button>
        </RevealSection>
      </section>

      {/* Footer */}
      <footer className="px-6 py-6 text-center flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-4">
          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            Built solo by Kirsten Coronado
          </span>
          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>·</span>
          <a
            href="https://github.com/helloblair/Collaborative-Chaos"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] underline underline-offset-2 transition-colors"
            style={{ color: "var(--text-accent)" }}
          >
            View Source on GitHub
          </a>
        </div>
        <span className="text-[9px]" style={{ color: "var(--text-muted)", opacity: 0.6 }}>
          © 2026 Collaborative Chaos
        </span>
      </footer>
    </main>
  );
}

export default function Home() {
  const { t } = useTheme();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [boards, setBoards] = useState<Board[]>([]);
  const [showNewBoard, setShowNewBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const router = useRouter();
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        upsertUserProfile(u).catch(console.error);
      }
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setBoards([]);
      return;
    }
    return subscribeUserBoards(user.uid, setBoards);
  }, [user]);

  useEffect(() => {
    if (showNewBoard) nameInputRef.current?.focus();
  }, [showNewBoard]);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const handleCreateBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newBoardName.trim()) return;
    setCreating(true);
    try {
      const id = await createBoard(newBoardName.trim(), user.uid, user.email ?? "");
      router.push(`/board/${id}`);
    } finally {
      setCreating(false);
    }
  };

  const cancelNewBoard = () => {
    setShowNewBoard(false);
    setNewBoardName("");
  };

  const handleDeleteBoard = async (boardId: string) => {
    if (!window.confirm("Delete this board? This cannot be undone.")) return;
    setDeletingId(boardId);
    try {
      await deleteBoard(boardId);
    } catch (err) {
      console.error("Failed to delete board:", err);
    } finally {
      setDeletingId(null);
    }
  };

  if (user === undefined) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-sm" style={{ color: "var(--text-secondary)" }}>{t("Loading...")}</div>
      </main>
    );
  }

  if (user === null) {
    return <LandingPage onLogin={login} />;
  }

  return (
    <main className="min-h-screen px-10 py-12 sm:px-14 sm:py-16">
      <ThemeToggle />
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <h1 className="text-5xl font-bold tracking-tight" style={{ color: "var(--text-heading)", fontFamily: "var(--font-heading)" }}>{t("My Boards")}</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm font-bold truncate max-w-[200px]" style={{ color: "var(--text-primary)" }}>
              {user.displayName ?? user.email}
            </span>
            <button
              type="button"
              onClick={() => signOut(auth)}
              className="rounded-lg px-4 py-2 text-sm font-medium border transition-colors"
              style={{
                background: "var(--accent-secondary-bg)",
                borderColor: "var(--border-default)",
                color: "var(--text-secondary)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--accent-secondary-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--accent-secondary-bg)";
              }}
            >
              {t("Sign out")}
            </button>
          </div>
        </div>

        {/* New board form */}
        {showNewBoard ? (
          <form
            onSubmit={handleCreateBoard}
            className="glass-panel mb-8 flex gap-3 items-center rounded-xl p-4"
          >
            <input
              ref={nameInputRef}
              type="text"
              value={newBoardName}
              onChange={(e) => setNewBoardName(e.target.value)}
              placeholder={t("Board name")}
              className="flex-1 text-sm focus:outline-none bg-transparent"
              style={{ color: "var(--text-primary)", placeholder: "var(--text-muted)" } as React.CSSProperties}
              disabled={creating}
            />
            <button
              type="submit"
              disabled={creating || !newBoardName.trim()}
              className="btn-primary rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {creating ? t("Creating…") : t("Create")}
            </button>
            <button
              type="button"
              onClick={cancelNewBoard}
              disabled={creating}
              className="btn-secondary rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
            >
              {t("Cancel")}
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setShowNewBoard(true)}
            className="btn-primary mb-8 rounded-lg px-5 py-2.5 text-sm font-medium active:scale-95 transition-colors"
          >
            {t("+ New Board")}
          </button>
        )}

        {/* Board grid — polaroid cards */}
        {boards.length === 0 ? (
          <div className="text-center py-20 text-sm" style={{ color: "var(--text-muted)" }}>
            {t("No boards yet. Create one to get started.")}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-10">
            {boards.map((board) => {
              const rotation = polaroidRotation(board.id);
              return (
                <div key={board.id} className="group relative">
                  <Link
                    href={`/board/${board.id}`}
                    className="block rounded-md p-2.5 pb-5 transition-all duration-200 ease-out"
                    style={{
                      transform: `rotate(${rotation}deg)`,
                      background: "var(--surface-panel)",
                      border: "1px solid var(--border-subtle)",
                      boxShadow: "var(--shadow-card)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "rotate(0deg) translateY(-4px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = `rotate(${rotation}deg)`;
                    }}
                  >
                    {/* Board name — top label */}
                    <p
                      className="text-sm font-semibold truncate mb-2 px-0.5"
                      style={{ fontStyle: "italic", color: "var(--text-heading)", fontFamily: "var(--font-heading)" }}
                      title={board.name}
                    >
                      {board.name}
                    </p>

                    {/* Thumbnail preview area */}
                    <div className="aspect-[4/3] w-full overflow-hidden rounded-sm" style={{ background: "var(--accent-secondary-bg)" }}>
                      <BoardThumbnail boardId={board.id} />
                    </div>

                    {/* Bottom metadata */}
                    <div className="mt-2.5 flex items-center gap-2 px-0.5">
                      {/* Avatar stack */}
                      <div className="flex -space-x-1.5 shrink-0">
                        {board.memberEmails.slice(0, 3).map((email, i) => (
                          <span
                            key={email}
                            title={email}
                            className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-semibold uppercase"
                            style={{ background: avatarColor(email), zIndex: 3 - i, borderWidth: 2, borderStyle: "solid", borderColor: "var(--surface-bg)" }}
                          >
                            {email[0]}
                          </span>
                        ))}
                        {board.memberEmails.length > 3 && (
                          <span
                            className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-medium"
                            style={{ borderWidth: 2, borderStyle: "solid", borderColor: "var(--surface-bg)", background: "var(--accent-secondary-bg)", color: "var(--text-secondary)" }}
                          >
                            +{board.memberEmails.length - 3}
                          </span>
                        )}
                      </div>

                      <span className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>
                        {board.members.length} member{board.members.length !== 1 ? "s" : ""}
                        {relativeTime(board.updatedAt) ? ` · ${relativeTime(board.updatedAt)}` : ""}
                      </span>
                    </div>
                  </Link>

                  {/* Delete (owner only) — top-right corner on hover */}
                  {user.uid === board.createdBy && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDeleteBoard(board.id);
                      }}
                      disabled={deletingId === board.id}
                      title="Delete board"
                      className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity rounded-full w-6 h-6 flex items-center justify-center shadow-sm disabled:cursor-not-allowed text-xs z-10"
                      style={{
                        background: "var(--surface-elevated)",
                        border: "1px solid var(--border-default)",
                        color: "var(--text-muted)",
                      }}
                    >
                      {deletingId === board.id ? "…" : "✕"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
