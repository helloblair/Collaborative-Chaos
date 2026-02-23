# AI Development Log — Collaborative Chaos

**Project:** Collaborative Chaos (CollabBoard)
**Developer:** Kirsten Blair
**Sprint:** Feb 16–22, 2026 (7 days)
**Repository:** https://github.com/helloblair/Collaborative-Chaos
**Deployed:** https://collaborative-chaos-j7ow.vercel.app/

---

## 1. Tools & Workflow

### AI Coding Tools Used

| Tool | Role | Usage |
|:-----|:-----|:------|
| **Claude Code** (CLI, Opus) | Primary development agent | Architecture, scaffolding, features, debugging, performance optimization, and final polish |
| **Claude Sonnet** (Cursor/IDE) | Inline editing & refactoring | Quick fixes, code navigation, and targeted edits within the IDE |
| **OpenAI GPT-4.1 Nano** | Production AI agent | Powers the in-app Sorting Hat board agent via OpenAI API with function calling |

Note: The in-app AI agent was initially built on Anthropic Claude Sonnet (`claude-sonnet-4-20250514`) but was switched to OpenAI GPT-4.1 Nano mid-sprint for lower latency and cost on structured tool-calling tasks.

### Development Workflow

The project followed a **spec-first, prompt-driven** workflow:

1. **Pre-Search document authored first** — architecture decisions, technology tradeoffs, and constraints documented before writing code
2. **Spec document with milestones** — full PRD with tool schemas, acceptance criteria, and build order
3. **Milestone-scoped prompts** — each prompt targeted one milestone (e.g., "add multi-select, resize/rotate, frames, text, connectors, delete/duplicate/copy-paste")
4. **Claude Code executed prompts** — generating full feature implementations across multiple files in a single session
5. **Manual validation** — tested in browser with multiple tabs, fixed issues Claude Code introduced
6. **Iterative fix prompts** — follow-up prompts for specific bugs (e.g., "frame rotation resets to zero on reload")
7. **Audit-driven polish** — used Claude Code to audit the codebase against the PRD and feedback, then targeted remaining gaps

### MCP Integrations

**None used.** The project relied entirely on Claude Code's built-in tools (file read/write, bash, grep, glob) without any external MCP server connections (no Firebase MCP, GitHub MCP, or filesystem MCP). All Firebase and Vercel interactions were done through direct CLI commands and the Firebase console.

---

## 2. Effective Prompts

### Prompt 1 — MVP Foundation (Feb 17)
> "Set up a Next.js app with Firebase Auth (Google sign-in), Firestore for persistent board state, and Firebase Realtime Database for presence and cursors. Create a board page with Konva canvas that supports pan/zoom, sticky note creation, and real-time sync between multiple users. Include multiplayer cursors with name labels."

**Result:** Generated the entire MVP in a single session — auth flow, Firestore listeners, RTDB presence, Konva rendering layer with pan/zoom, and cursor broadcasting. Required minor fixes for RTDB security rules and cursor deduplication afterward.

### Prompt 2 — Board Features (Feb 20)
> "Implement the full Milestone 1 feature set: multi-select (shift-click and drag-to-select marquee), resize and rotate transforms using Konva Transformer, frame objects with titles and send-to-back layering, standalone text objects with double-click editing, and delete/duplicate/copy-paste operations."

**Result:** Generated ~800 lines of new canvas logic in a single pass. Core functionality worked, but frame rotation was not persisted (reset to zero on reload) and required a follow-up fix commit. Multi-select and transforms worked correctly out of the box.

### Prompt 3 — AI Agent Architecture (Feb 20)
> "Build the AI board agent: create an API route at /api/ai-command that accepts a natural language command and the user's viewport state. Use tool-use to interpret commands and execute board mutations via Firestore. Include tools for creating sticky notes, shapes, frames, connectors, moving/resizing/recoloring objects, arranging in grids, and template commands (SWOT, Journey Map, Retrospective). Add a client-side command bar UI with staggered animation for AI-created objects."

**Result:** Generated the full AI agent architecture — 13 tool schemas, system prompt, agentic loop (up to 10 turns), deterministic layout engine, REST-based Firestore writes, reservation pattern for concurrent commands, and client-side UI with animation. Initially used `batchWrite` which requires service-account credentials and failed in production; had to be replaced with individual PATCH/DELETE REST calls using the user's Firebase ID token.

### Prompt 4 — Performance at Scale (Feb 21)
> "The board slows down at 200+ objects. Add React.memo with custom equality functions to all item components, viewport culling so only visible items render, and structural sharing for Firestore snapshots. Add a stress test button behind ?debug=1."

**Result:** Generated all 8 item memoization wrappers with custom `boardItemEqual` functions, viewport culling with a 200px buffer, and structural sharing in the Firestore listener. Also produced a stress-test utility that generates 500 items in a spiral pattern. Performance jumped from noticeable lag at 200 objects to smooth 60fps at 500+.

### Prompt 5 — Theming & Polish (Feb 22)
> "Add a dual-theme system: Aurora mode (default, gradient aurora background) and Magic mode (Harry Potter-inspired, remaps all UI copy to wizarding terms). The AI agent panel should be themed as the Sorting Hat with a Revelio animation on results."

**Result:** Generated the full theme system with context provider, themed copy mappings, gradient backgrounds, and the Sorting Hat panel with Revelio reveal animation. The themed copy was creative and consistent (e.g., "Sign in with Google" becomes "Enter the Wizarding World"). Required minimal manual adjustment.

---

## 3. Code Analysis

### Codebase Size
- **~7,200 lines** of TypeScript/TSX across `src/`
- Key files: `BoardCanvas.tsx` (2,230 lines), `BoardClient.tsx` (1,819 lines), `route.ts` (788 lines), `aiTools.ts` (486 lines), `SortingHatPanel.tsx` (348 lines), `layoutEngine.ts` (279 lines)
- **39 commits** over 7 days

### AI-Generated vs Hand-Written Code

| Category | Estimate |
|:---------|:---------|
| AI-generated (Claude Code + Cursor) | **~90%** |
| Hand-written / manually fixed | **~10%** |

The 10% manual work was concentrated in:
- Firebase security rules debugging and fixes
- Credential and environment variable configuration
- Firestore REST API migration (`batchWrite` to individual PATCH/DELETE calls)
- Frame rotation persistence fix
- Presence/cursor deduplication and ghost cursor cleanup
- Deployment configuration (Vercel env vars, `next.config.ts` external packages, `@opentelemetry/api` workaround)
- LLM provider switch from Anthropic to OpenAI (route refactor)

---

## 4. Strengths — Where AI Excelled

**Large-scale feature generation.** Claude Code's strongest capability was generating entire feature sets (500–800 lines) in a single prompt that were mostly correct. The board features prompt produced working multi-select, transforms, frames, text, connectors, and operations in one pass.

**Architectural decisions.** The AI made several good unprompted architectural choices:
- Splitting Konva into separate object and ephemeral layers for rendering performance
- Using `nanoid` for client-generated IDs instead of Firestore auto-IDs
- Implementing a reservation pattern with TTL for concurrent AI commands
- Building a deterministic layout engine with auto-scaling child placement instead of hardcoded positions
- Using the user's Firebase ID token for REST API calls instead of requiring service-account credentials
- Separating RTDB (cursors/presence) from Firestore (persistent state) to control cost

**Performance optimization.** When prompted about the 500-object target, the AI produced a comprehensive optimization pass — React.memo with custom equality, viewport culling with buffer, structural sharing, and stable callbacks — that was architecturally sound and required no manual fixes.

**Tool schema design.** The AI agent's tool definitions and system prompt were well-structured from the first generation, with clear descriptions, sensible defaults, and proper required/optional field separation. The 13-tool schema exceeded the PRD requirement of 9.

**Consistent code style.** Generated code maintained consistent patterns across files — same error handling approach, same Firestore data shapes, same TypeScript conventions throughout.

---

## 5. Limitations — Where AI Struggled

### Firebase Security Rules
Claude Code consistently generated incorrect or incomplete Firestore and RTDB security rules:
- **Firestore `read` vs `get`/`list`:** Generated a single `read` rule instead of splitting into `get` and `list`, which caused `permission-denied` on `onSnapshot` collection listeners
- **RTDB presence path:** Generated rules that didn't allow reads at `presence/{boardId}`, breaking the presence feature

**Root cause:** Security rules operate on a different mental model than application code, and the AI lacked visibility into how Firebase evaluates rules at runtime.

### Firestore REST API Compatibility
The AI initially used `batchWrite` for the AI agent's Firestore mutations, which requires Cloud IAM / service-account OAuth2 scopes. This does not work with Firebase ID tokens. The entire write layer had to be rewritten to use individual PATCH/DELETE REST calls. This failure only surfaced in production on Vercel, not during local development with the Admin SDK.

### State Persistence Edge Cases
Frame rotation values were not being persisted on transform end — the generated `onTransformEnd` handler saved position and scale but reset rotation to zero. The AI handles the happy path well but misses edge cases in state serialization.

### Presence & Cursor Cleanup
The initial cursor implementation left ghost cursors when users disconnected, and the online user list showed duplicate entries for users with multiple tabs. Real-time cleanup logic (RTDB `onDisconnect`, stale-presence detection, deduplication) required manual intervention.

### Firebase Admin in Serverless
Claude Code scaffolded the AI route using `firebase-admin` with a service account key, but the key path resolution and environment variable format didn't work correctly in Vercel's serverless environment. Additionally, `firebase-admin` pulls in `@opentelemetry/api` as a peer dependency that Turbopack tries to load — required adding it as an optional dep and configuring `serverExternalPackages` in `next.config.ts`.

---

## 6. Key Learnings

### 1. Spec-first prompting is essential
The detailed PRD with explicit milestones, tool schemas, and acceptance criteria made prompts dramatically more effective. Vague prompts produced vague code; prompts that referenced specific schema definitions and architectural decisions produced targeted, correct implementations. The Pre-Search document was equally valuable — having architecture decisions locked down before coding began prevented costly mid-sprint pivots.

### 2. AI excels at generation, not validation
Claude Code is excellent at writing new code but poor at predicting runtime behavior — especially for security rules, serverless deployment constraints, and real-time cleanup logic. Always test AI-generated code against the actual runtime environment (not just local dev) before trusting it.

### 3. The "last 10%" is where AI breaks down
The first 90% of each feature (structure, types, rendering, basic logic) was generated correctly. The remaining 10% (edge cases, cleanup, persistence of all fields, deployment config) consistently required manual intervention. This ratio improved over the sprint as the codebase grew and provided more context for the AI to pattern-match against.

### 4. Batch prompts for related features
Prompting for an entire milestone at once (multi-select + transforms + frames + text + operations) produced more cohesive code than prompting for each feature individually, because the AI could make consistent architectural decisions across the full feature set.

### 5. Firebase + AI is a rough combination
Firebase's security model (rules evaluated server-side with different semantics than application code) and its multiple products (Firestore vs RTDB vs Auth, each with different APIs) created a surface area where AI-generated code frequently had subtle bugs. Writing security rules manually and only using AI for application logic was the most effective strategy.

### 6. Audit-driven development closes gaps
Using the AI to audit its own output against the PRD was highly effective for the final polish phase. Claude Code identified 2 missing deliverables and 2 code improvements that would have been easy to miss manually. The audit-then-fix cycle was more efficient than trying to remember every requirement.

### 7. Model selection matters for production features
Switching the in-app AI agent from Claude Sonnet to GPT-4.1 Nano cut response latency and reduced API cost to $0.02 total across 96 requests (270K tokens). For structured tool-calling, smaller specialized models outperform larger general-purpose models on cost and speed while maintaining accuracy.
