/* ─── Dual-Theme System: Aurora UI + Magic Mode ─────────────────────────── */

export type ThemeMode = "aurora" | "magic";

/* ─── Aurora Theme: Mixed purple-to-blue gradient mesh, teal/cyan accents ─── */
export const auroraVars: Record<string, string> = {
  // Surfaces
  "--surface-bg": "#0a0618",
  "--surface-bg-gradient":
    "radial-gradient(ellipse at 20% 50%, rgba(88, 28, 135, 0.15) 0%, transparent 50%), " +
    "radial-gradient(ellipse at 80% 20%, rgba(59, 130, 246, 0.12) 0%, transparent 50%), " +
    "radial-gradient(ellipse at 50% 80%, rgba(236, 72, 153, 0.08) 0%, transparent 50%), " +
    "radial-gradient(ellipse at 70% 60%, rgba(20, 184, 166, 0.06) 0%, transparent 40%), " +
    "linear-gradient(180deg, #0f0a1a 0%, #0a0618 100%)",
  "--surface-panel": "rgba(15, 10, 30, 0.75)",
  "--surface-panel-border": "rgba(139, 92, 246, 0.15)",
  "--surface-input": "rgba(15, 10, 30, 0.6)",
  "--surface-input-border": "rgba(99, 102, 241, 0.3)",
  "--surface-elevated": "rgba(15, 10, 30, 0.92)",

  // Text
  "--text-primary": "rgba(255, 255, 255, 0.88)",
  "--text-secondary": "#c4b5fd",
  "--text-muted": "rgba(139, 92, 246, 0.6)",
  "--text-heading": "#e0e7ff",
  "--text-accent": "#67e8f9",
  "--text-on-accent": "#ffffff",

  // Borders
  "--border-default": "rgba(139, 92, 246, 0.2)",
  "--border-subtle": "rgba(139, 92, 246, 0.1)",
  "--border-focus": "#818cf8",

  // Accent / interactive
  "--accent-primary": "#6366f1",
  "--accent-primary-hover": "#818cf8",
  "--accent-active-bg": "linear-gradient(135deg, #6366f1, #8b5cf6)",
  "--accent-active-border": "#818cf8",
  "--accent-secondary-bg": "rgba(99, 102, 241, 0.1)",
  "--accent-secondary-hover": "rgba(99, 102, 241, 0.2)",
  "--accent-danger-bg": "rgba(127, 29, 29, 0.25)",
  "--accent-danger-border": "rgba(239, 68, 68, 0.3)",
  "--accent-danger-text": "#fca5a5",
  "--accent-danger-hover-bg": "rgba(127, 29, 29, 0.4)",

  // Effects
  "--glow-primary": "rgba(99, 102, 241, 0.3)",
  "--glow-secondary": "rgba(139, 92, 246, 0.15)",
  "--blur-glass": "12px",
  "--shadow-card": "0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.04)",
  "--shadow-elevated": "0 4px 20px rgba(0, 0, 0, 0.3)",

  // Glass
  "--glass-bg": "rgba(255, 255, 255, 0.04)",
  "--glass-border": "rgba(255, 255, 255, 0.08)",
  "--glass-shadow": "0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)",

  // Tooltip
  "--tooltip-bg": "rgba(10, 6, 24, 0.95)",
  "--tooltip-text": "#e0e7ff",
  "--tooltip-border": "rgba(99, 102, 241, 0.25)",

  // Typography
  "--font-heading": "'Geist', ui-sans-serif, system-ui, sans-serif",
  "--font-body": "'Geist', ui-sans-serif, system-ui, sans-serif",

  // Transition
  "--transition-theme": "0.6s",

  // Presence cursor stroke
  "--cursor-stroke": "#0f0a1a",
};

/* ─── Magic Theme: Harry Potter — parchment, burgundy, gold ──────────────── */
export const magicVars: Record<string, string> = {
  // Surfaces
  "--surface-bg": "#1a0f0a",
  "--surface-bg-gradient":
    "radial-gradient(ellipse at 30% 40%, rgba(139, 26, 26, 0.1) 0%, transparent 50%), " +
    "radial-gradient(ellipse at 70% 70%, rgba(120, 80, 30, 0.08) 0%, transparent 50%), " +
    "radial-gradient(ellipse at 50% 20%, rgba(180, 130, 60, 0.05) 0%, transparent 40%), " +
    "linear-gradient(180deg, #2c1810 0%, #1a0f0a 100%)",
  "--surface-panel": "rgba(44, 24, 16, 0.88)",
  "--surface-panel-border": "rgba(139, 90, 43, 0.3)",
  "--surface-input": "rgba(44, 24, 16, 0.8)",
  "--surface-input-border": "rgba(139, 90, 43, 0.4)",
  "--surface-elevated": "rgba(44, 24, 16, 0.95)",

  // Text
  "--text-primary": "#d4a574",
  "--text-secondary": "#a67c52",
  "--text-muted": "rgba(139, 90, 43, 0.6)",
  "--text-heading": "#fbbf24",
  "--text-accent": "#fbbf24",
  "--text-on-accent": "#ffffff",

  // Borders
  "--border-default": "rgba(139, 90, 43, 0.35)",
  "--border-subtle": "rgba(139, 90, 43, 0.2)",
  "--border-focus": "#fbbf24",

  // Accent / interactive
  "--accent-primary": "#8b1a1a",
  "--accent-primary-hover": "#a52020",
  "--accent-active-bg": "linear-gradient(135deg, #8b1a1a, #a52020)",
  "--accent-active-border": "#a52020",
  "--accent-secondary-bg": "rgba(139, 90, 43, 0.15)",
  "--accent-secondary-hover": "rgba(139, 90, 43, 0.3)",
  "--accent-danger-bg": "rgba(127, 29, 29, 0.25)",
  "--accent-danger-border": "rgba(239, 68, 68, 0.3)",
  "--accent-danger-text": "#fca5a5",
  "--accent-danger-hover-bg": "rgba(127, 29, 29, 0.4)",

  // Effects
  "--glow-primary": "rgba(251, 191, 36, 0.2)",
  "--glow-secondary": "rgba(139, 90, 43, 0.15)",
  "--blur-glass": "4px",
  "--shadow-card": "0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.02)",
  "--shadow-elevated": "0 4px 20px rgba(0, 0, 0, 0.4)",

  // Glass (parchment-style)
  "--glass-bg": "rgba(62, 39, 24, 0.6)",
  "--glass-border": "rgba(139, 90, 43, 0.25)",
  "--glass-shadow": "0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.03)",

  // Tooltip
  "--tooltip-bg": "rgba(26, 15, 10, 0.95)",
  "--tooltip-text": "#fbbf24",
  "--tooltip-border": "rgba(139, 90, 43, 0.4)",

  // Typography
  "--font-heading": "'Cinzel', serif",
  "--font-body": "'Geist', ui-sans-serif, system-ui, sans-serif",

  // Transition
  "--transition-theme": "0.6s",

  // Presence cursor stroke
  "--cursor-stroke": "#2c1810",
};

/* ─── Magic Mode copy swaps ──────────────────────────────────────────────── */
export const magicCopy: Record<string, string> = {
  "Collaborative Chaos": "The Wizarding Workspace",
  "A shared canvas for sticky notes and shapes.": "A shared canvas for spells and enchantments.",
  "My Boards": "The Great Hall",
  "← My Boards": "← The Great Hall",
  "+ New Board": "Cast New Spell",
  "Create": "Conjure",
  "Creating…": "Conjuring...",
  "Cancel": "Finite",
  "Board name": "Spell name",
  "Sign out": "Vanish",
  "Sign Out": "Vanish",
  "Sign in with Google": "Enter the Wizarding World",
  "Loading...": "Summoning...",
  "Loading auth...": "The wand chooses the wizard...",
  "No boards yet. Create one to get started.":
    "The Great Hall is empty. Cast your first spell to begin.",
  "Empty board": "Uncharted territory",
  "Online": "In the Castle",
  "No one else online": "The castle appears empty",
  "Connector selected": "Binding selected",
  "Sticky Note": "Parchment Note",
  "Rectangle": "Stone Tablet",
  "Circle": "Crystal Ball",
  "Line": "Spell Trace",
  "Heart": "Love Potion",
  "Text": "Inscription",
  "Frame": "Enchanted Frame",
  "Connect": "Bind",
  "Select (V)": "Accio (V)",
  "Pan (Space+Drag)": "Broom Flight (Space+Drag)",
  "Share": "Owl Post",
  "Link copied!": "Owl dispatched!",
  "Color": "Tincture",
  "Text Color": "Ink Colour",
  "Size": "Magnitude",
  "Duplicate": "Geminio",
  "Delete (Del)": "Evanesco (Del)",
  "Delete Connector": "Sever Binding",
  "Board not found.": "This passage has been sealed.",
  "Not signed in on this route.": "You must present your wand first.",
  "You don't have access to this board.":
    "The door is sealed — you lack the password.",
  "Join Board": "Enter the Chamber",
  "Joining…": "Entering...",
  "Decline": "Turn Back",
  "items selected": "enchantments selected",
};
