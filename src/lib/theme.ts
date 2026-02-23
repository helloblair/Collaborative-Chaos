/* ─── Dual-Theme System: Aurora UI + Magic Mode ─────────────────────────── */

export type ThemeMode = "aurora" | "magic";

/* ─── Aurora Theme: Teal/cyan glassmorphism with aurora light streaks ──────── */
export const auroraVars: Record<string, string> = {
  // Surfaces
  "--surface-bg": "#0a2e2e",
  "--surface-bg-gradient":
    "radial-gradient(ellipse at 30% 20%, rgba(0, 201, 167, 0.18) 0%, transparent 50%), " +
    "radial-gradient(ellipse at 70% 60%, rgba(77, 232, 192, 0.12) 0%, transparent 50%), " +
    "radial-gradient(ellipse at 50% 80%, rgba(184, 169, 212, 0.08) 0%, transparent 50%), " +
    "radial-gradient(ellipse at 20% 70%, rgba(0, 180, 160, 0.06) 0%, transparent 40%), " +
    "linear-gradient(180deg, #0d3838 0%, #0a2e2e 100%)",
  "--surface-panel": "rgba(10, 46, 46, 0.78)",
  "--surface-panel-border": "rgba(77, 232, 192, 0.15)",
  "--surface-input": "rgba(10, 46, 46, 0.6)",
  "--surface-input-border": "rgba(77, 232, 192, 0.3)",
  "--surface-elevated": "rgba(10, 46, 46, 0.92)",

  // Text
  "--text-primary": "rgba(255, 255, 255, 0.92)",
  "--text-secondary": "#a8e6cf",
  "--text-muted": "rgba(77, 232, 192, 0.5)",
  "--text-heading": "#e0fff5",
  "--text-accent": "#4de8c0",
  "--text-on-accent": "#ffffff",

  // Borders
  "--border-default": "rgba(77, 232, 192, 0.2)",
  "--border-subtle": "rgba(77, 232, 192, 0.1)",
  "--border-focus": "#4de8c0",

  // Accent / interactive
  "--accent-primary": "rgba(77, 232, 192, 0.25)",
  "--accent-primary-hover": "rgba(77, 232, 192, 0.35)",
  "--accent-active-bg": "linear-gradient(135deg, rgba(0, 201, 167, 0.35), rgba(77, 232, 192, 0.25))",
  "--accent-active-border": "#4de8c0",
  "--accent-secondary-bg": "rgba(77, 232, 192, 0.08)",
  "--accent-secondary-hover": "rgba(77, 232, 192, 0.16)",
  "--accent-danger-bg": "rgba(127, 29, 29, 0.25)",
  "--accent-danger-border": "rgba(239, 68, 68, 0.3)",
  "--accent-danger-text": "#fca5a5",
  "--accent-danger-hover-bg": "rgba(127, 29, 29, 0.4)",

  // Effects
  "--glow-primary": "rgba(77, 232, 192, 0.3)",
  "--glow-secondary": "rgba(184, 169, 212, 0.15)",
  "--glow-teal": "rgba(77, 232, 192, 0.3)",
  "--glow-lilac": "rgba(184, 169, 212, 0.3)",
  "--blur-glass": "20px",
  "--shadow-card": "0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.06)",
  "--shadow-elevated": "0 4px 20px rgba(0, 0, 0, 0.3)",

  // Glass
  "--glass-bg": "rgba(255, 255, 255, 0.08)",
  "--glass-bg-hover": "rgba(255, 255, 255, 0.14)",
  "--glass-border": "rgba(255, 255, 255, 0.15)",
  "--glass-shadow": "0 8px 32px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.08)",

  // Tooltip
  "--tooltip-bg": "rgba(10, 46, 46, 0.95)",
  "--tooltip-text": "#e0fff5",
  "--tooltip-border": "rgba(77, 232, 192, 0.25)",

  // Typography
  "--font-heading": "'Geist', ui-sans-serif, system-ui, sans-serif",
  "--font-body": "'Geist', ui-sans-serif, system-ui, sans-serif",

  // Transition
  "--transition-theme": "0.6s",

  // Presence cursor stroke
  "--cursor-stroke": "#0a2e2e",

  // Board canvas
  "--board-bg": "#f5f5f5",
  "--board-grid-color": "#f3f4f6",

  // Chat panel
  "--chat-panel-bg": "linear-gradient(180deg, rgba(10, 46, 46, 0.95) 0%, rgba(8, 36, 36, 0.98) 100%)",
  "--chat-panel-border": "rgba(77, 232, 192, 0.15)",
  "--chat-header-border": "rgba(77, 232, 192, 0.15)",
  "--chat-accent": "#4de8c0",
  "--chat-accent-bg": "rgba(0, 201, 167, 0.4)",
  "--chat-accent-border": "rgba(77, 232, 192, 0.3)",
  "--chat-user-bg": "rgba(77, 232, 192, 0.15)",
  "--chat-user-border": "rgba(77, 232, 192, 0.1)",
  "--chat-user-text": "#e0fff5",
  "--chat-assistant-bg": "rgba(184, 169, 212, 0.12)",
  "--chat-assistant-border": "rgba(184, 169, 212, 0.08)",
  "--chat-assistant-text": "rgba(255, 255, 255, 0.85)",
  "--chat-system-bg": "rgba(77, 232, 192, 0.1)",
  "--chat-system-text": "rgba(77, 232, 192, 0.7)",
  "--chat-input-bg": "rgba(255, 255, 255, 0.06)",
  "--chat-input-border": "rgba(77, 232, 192, 0.15)",
  "--chat-heading": "#e0fff5",
  "--chat-hint": "rgba(77, 232, 192, 0.35)",
  "--chat-dot": "rgba(77, 232, 192, 0.7)",
  "--chat-fab-bg": "linear-gradient(135deg, rgba(0, 201, 167, 0.5), rgba(77, 232, 192, 0.3), rgba(184, 169, 212, 0.3))",
  "--chat-fab-border": "rgba(77, 232, 192, 0.3)",
  "--chat-fab-color": "#e0fff5",
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

  "--glow-teal": "rgba(251, 191, 36, 0.2)",
  "--glow-lilac": "rgba(139, 90, 43, 0.15)",

  // Glass (parchment-style)
  "--glass-bg": "rgba(62, 39, 24, 0.6)",
  "--glass-bg-hover": "rgba(62, 39, 24, 0.75)",
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

  // Board canvas
  "--board-bg": "#f5f0e6",
  "--board-grid-color": "rgba(139, 90, 43, 0.1)",

  // Chat panel
  "--chat-panel-bg": "linear-gradient(180deg, rgba(44, 24, 16, 0.95) 0%, rgba(26, 15, 10, 0.98) 100%)",
  "--chat-panel-border": "rgba(139, 90, 43, 0.3)",
  "--chat-header-border": "rgba(139, 90, 43, 0.3)",
  "--chat-accent": "#fbbf24",
  "--chat-accent-bg": "rgba(139, 90, 43, 0.4)",
  "--chat-accent-border": "rgba(139, 90, 43, 0.4)",
  "--chat-user-bg": "rgba(139, 90, 43, 0.2)",
  "--chat-user-border": "rgba(139, 90, 43, 0.15)",
  "--chat-user-text": "#d4a574",
  "--chat-assistant-bg": "rgba(251, 191, 36, 0.08)",
  "--chat-assistant-border": "rgba(251, 191, 36, 0.06)",
  "--chat-assistant-text": "#d4a574",
  "--chat-system-bg": "rgba(139, 90, 43, 0.15)",
  "--chat-system-text": "rgba(139, 90, 43, 0.7)",
  "--chat-input-bg": "rgba(255, 255, 255, 0.04)",
  "--chat-input-border": "rgba(139, 90, 43, 0.3)",
  "--chat-heading": "#fbbf24",
  "--chat-hint": "rgba(139, 90, 43, 0.5)",
  "--chat-dot": "rgba(251, 191, 36, 0.7)",
  "--chat-fab-bg": "linear-gradient(135deg, rgba(139, 90, 43, 0.5), rgba(251, 191, 36, 0.3), rgba(120, 80, 30, 0.3))",
  "--chat-fab-border": "rgba(139, 90, 43, 0.4)",
  "--chat-fab-color": "#fbbf24",
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
