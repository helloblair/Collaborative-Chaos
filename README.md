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

3. Copy the environment template and fill in your values:
   ```bash
   cp .env.example .env.local
   ```
   See `.env.example` for the full list of required variables.

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

## Deployment

**Production URL:** [collaborative-chaos-j7ow.vercel.app](https://collaborative-chaos-j7ow.vercel.app/)

### Vercel (primary)

1. Push your branch to GitHub.
2. Import the repo in [vercel.com/new](https://vercel.com/new) and set the root directory to `web`.
3. Add the environment variables from `.env.example` in the Vercel dashboard under **Settings > Environment Variables**.
4. Deploy. Vercel auto-detects Next.js and uses the settings in `vercel.json`.

Subsequent pushes to `main` trigger automatic deployments.

```bash
# Or deploy from the CLI
npx vercel --prod
```

### Firebase Hosting (alternative)

Firebase Hosting with the web frameworks preview can serve the Next.js app via Cloud Functions.

```bash
# Install the Firebase CLI if you haven't already
npm install -g firebase-tools

# Log in and select the project
firebase login
firebase use collabboard-chaos

# Set server-side env vars as Firebase config
firebase functions:config:set \
  firebase.project_id="YOUR_PROJECT_ID" \
  firebase.client_email="YOUR_CLIENT_EMAIL" \
  firebase.private_key="YOUR_PRIVATE_KEY" \
  anthropic.api_key="YOUR_ANTHROPIC_KEY"

# Deploy Firestore rules, RTDB rules, and hosting
firebase deploy
```

### Deploying Firebase Security Rules Only

```bash
firebase deploy --only firestore:rules,database
```

## Performance Targets

| Metric | Target |
|--------|--------|
| Frame rate during pan/zoom/manipulation | 60 FPS |
| Object sync latency | <100ms |
| Cursor sync latency | <50ms |
| Object count without degradation | 500+ |
| Concurrent users | 5+ |
