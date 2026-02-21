# Collaborative Chaos — Real-Time Collaborative Whiteboard with AI Agent

**Live:** [collaborative-chaos-j7ow.vercel.app](https://collaborative-chaos-j7ow.vercel.app/)
**Repo:** [github.com/helloblair/Collaborative-Chaos](https://github.com/helloblair/Collaborative-Chaos)

A production-scale collaborative whiteboard built with AI-first development methodology. Multiple users can brainstorm, create, and organize content in real-time with an AI agent that manipulates the board through natural language commands.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js, React, TypeScript, react-konva (HTML5 Canvas) |
| Backend | Next.js API Routes (serverless) |
| Database | Firebase Firestore + Firebase Realtime Database |
| Auth | Firebase Auth (Google OAuth) |
| AI | Anthropic Claude API with function calling (tool use) |
| Deployment | Vercel |

## Architecture Overview

### Dual-Database Design

The app uses two Firebase databases, each optimized for a different access pattern:

- **Firestore** handles persistent board state — objects, connectors, board metadata. Configured with `persistentLocalCache` for offline durability so users don't lose work on disconnect.
- **Realtime Database (RTDB)** handles ephemeral high-frequency data — cursor positions broadcast at 20Hz, user presence, and drag telemetry. Optimized for low-latency pub/sub where durability doesn't matter.

### Canvas Rendering

The Konva canvas is split into two layers to avoid unnecessary redraws:

- **Objects layer** — renders board items (sticky notes, shapes, frames, text, connectors). Redraws only when object state changes.
- **Ephemeral layer** — renders cursors, selection rectangles, and drag previews. Redraws at cursor broadcast frequency without triggering object layer updates.

### AI Agent Pipeline

The AI agent follows a structured pipeline that separates intent from execution:

1. The LLM receives a serialized snapshot of the current viewport and outputs structured intent via function calling.
2. A deterministic layout engine computes exact pixel coordinates for grid, row, column, and template arrangements.
3. Batch Firestore writes apply the computed state atomically.

Spatial reservations via Firestore transactions prevent concurrent AI commands from colliding. Each reservation carries a 30-second TTL for automatic cleanup on failure.

### Conflict Resolution

- **Object mutations:** Field-level last-write-wins using `updateDoc()`. Only modified fields are written, so concurrent edits to different properties (e.g., position vs. color) don't conflict.
- **Text editing:** Local draft state is maintained during active text input. The Firestore write happens on blur/commit, not on every keystroke.
- **Drag optimization:** Interim positions are broadcast via RTDB during drag so other users see smooth movement. A single Firestore write persists the final position on `dragEnd`.

## Features

- Infinite canvas with smooth pan and zoom
- Sticky notes, shapes (rectangle, circle, line), frames, standalone text, connectors with arrows
- Move, resize, and rotate transforms via Konva Transformer
- Single and multi-select (shift-click, drag-to-select), delete, duplicate, copy/paste
- Real-time multiplayer cursors with name labels
- Presence awareness — see who's currently on the board
- AI board agent (Cmd/Ctrl+K) with creation, manipulation, layout, and complex template commands
- Deterministic layout engine for grid, row, column, and template arrangements
- Multi-board dashboard with invite links and board sharing
- Offline persistence with graceful disconnect and reconnect
- RTDB security rules and Firestore board membership validation

## Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/helloblair/Collaborative-Chaos.git
   cd Collaborative-Chaos/web
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env.local` file with the following variables:
   ```
   NEXT_PUBLIC_FIREBASE_API_KEY=
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
   NEXT_PUBLIC_FIREBASE_APP_ID=
   NEXT_PUBLIC_FIREBASE_DATABASE_URL=

   FIREBASE_ADMIN_PROJECT_ID=
   FIREBASE_ADMIN_CLIENT_EMAIL=
   FIREBASE_ADMIN_PRIVATE_KEY=

   ANTHROPIC_API_KEY=
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000).

## AI Agent Commands

Open the command bar with **Cmd+K** (Mac) or **Ctrl+K** (Windows/Linux). Example commands:

- "Add a yellow sticky note that says 'User Research'"
- "Create a SWOT analysis template"
- "Arrange these sticky notes in a grid"
- "Move all pink sticky notes to the right side"
- "Build a user journey map with 5 stages"
- "Set up a retrospective board"

## Performance Targets

| Metric | Target |
|--------|--------|
| Frame rate during pan/zoom/manipulation | 60 FPS |
| Object sync latency | <100ms |
| Cursor sync latency | <50ms |
| Object count without degradation | 500+ |
| Concurrent users | 5+ |
