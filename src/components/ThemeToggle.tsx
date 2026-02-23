"use client";

import { useRef } from "react";
import { useTheme } from "./ThemeProvider";

/* Keyhole icon — subtle easter egg for Aurora mode */
function KeyholeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="9" r="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M10 12 L9 20 L15 20 L14 12" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
      <rect x="3" y="2" width="18" height="20" rx="3" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.3" />
    </svg>
  );
}

/* Gothic door icon — prominent for Magic mode */
function DoorIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Door arch */}
      <path d="M5 22 L5 6 Q5 2 12 2 Q19 2 19 6 L19 22" stroke="currentColor" strokeWidth="1.5" fill="none" />
      {/* Inner panel */}
      <path d="M8 22 L8 8 Q8 5 12 5 Q16 5 16 8 L16 22" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.5" />
      {/* Door handle */}
      <circle cx="14.5" cy="14" r="1" fill="currentColor" />
      {/* Threshold */}
      <line x1="4" y1="22" x2="20" y2="22" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function ThemeToggle({ chatOpen }: { chatOpen?: boolean } = {}) {
  const { mode, toggleTheme } = useTheme();
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleClick = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    const x = rect ? rect.left + rect.width / 2 : undefined;
    const y = rect ? rect.top + rect.height / 2 : undefined;
    toggleTheme(x, y);
  };

  return (
    <div
      className="secret-toggle-container"
      style={chatOpen ? { right: "calc(340px + 0.75rem)", transition: "right 0.3s ease-out" } : { transition: "right 0.3s ease-out" }}
    >
      {/* Particle burst on hover */}
      <span className="secret-particle secret-particle-1" />
      <span className="secret-particle secret-particle-2" />
      <span className="secret-particle secret-particle-3" />
      <span className="secret-particle secret-particle-4" />
      <span className="secret-particle secret-particle-5" />
      <span className="secret-particle secret-particle-6" />
      <span className="secret-particle secret-particle-7" />
      <span className="secret-particle secret-particle-8" />

      {/* Smoke wisps on hover */}
      <span className="secret-smoke secret-smoke-1" />
      <span className="secret-smoke secret-smoke-2" />

      <button
        ref={btnRef}
        type="button"
        onClick={handleClick}
        className="theme-toggle-btn"
        aria-label={
          mode === "aurora"
            ? "I solemnly swear I am up to no good..."
            : "Mischief managed."
        }
      >
        {mode === "aurora" ? <KeyholeIcon /> : <DoorIcon />}
      </button>

      {/* Tooltip — appears on hover with delay */}
      <span className="secret-toggle-tooltip">
        {mode === "aurora"
          ? "I solemnly swear I am up to no good..."
          : "Mischief managed."}
      </span>
    </div>
  );
}
