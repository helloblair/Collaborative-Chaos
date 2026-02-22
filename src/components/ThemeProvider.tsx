"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  auroraVars,
  magicVars,
  magicCopy,
  type ThemeMode,
} from "@/lib/theme";

type ThemeContextValue = {
  mode: ThemeMode;
  toggleTheme: (originX?: number, originY?: number) => void;
  t: (key: string) => string;
};

const ThemeContext = createContext<ThemeContextValue>({
  mode: "aurora",
  toggleTheme: () => {},
  t: (k) => k,
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>("aurora");
  const transitioning = useRef(false);

  // Apply CSS variables whenever mode changes
  useEffect(() => {
    const vars = mode === "aurora" ? auroraVars : magicVars;
    const root = document.documentElement;
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value);
    }
    root.setAttribute("data-theme", mode);
  }, [mode]);

  const toggleTheme = useCallback(
    (originX?: number, originY?: number) => {
      if (transitioning.current) return;
      transitioning.current = true;

      const root = document.documentElement;
      const x = originX ?? window.innerWidth / 2;
      const y = originY ?? window.innerHeight / 2;

      // Set the origin for the radial clip-path animation
      root.style.setProperty("--transition-origin-x", `${x}px`);
      root.style.setProperty("--transition-origin-y", `${y}px`);

      // Pre-set the incoming theme's bg gradient on the pseudo-element
      const incoming = mode === "aurora" ? magicVars : auroraVars;
      root.style.setProperty(
        "--transition-incoming-bg",
        incoming["--surface-bg-gradient"]
      );

      root.setAttribute("data-theme-transitioning", "true");

      // Swap theme at midpoint of the reveal animation
      setTimeout(() => {
        setMode((prev) => (prev === "aurora" ? "magic" : "aurora"));
      }, 300);

      // Clean up after animation completes
      setTimeout(() => {
        root.removeAttribute("data-theme-transitioning");
        transitioning.current = false;
      }, 650);
    },
    [mode]
  );

  const t = useCallback(
    (key: string): string => {
      if (mode === "magic") return magicCopy[key] ?? key;
      return key;
    },
    [mode]
  );

  return (
    <ThemeContext value={{ mode, toggleTheme, t }}>
      {children}
    </ThemeContext>
  );
}
