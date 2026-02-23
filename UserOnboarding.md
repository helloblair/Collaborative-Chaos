# Collaborative Chaos — User Guide

A complete guide to every feature of the collaborative whiteboard, organized from the most hands-on interactions down to the things happening behind the scenes.

---

## Table of Contents

1. [Signing In](#1-signing-in)
2. [Managing Boards](#2-managing-boards)
3. [Navigating the Board](#3-navigating-the-board)
4. [Creating Objects](#4-creating-objects)
5. [Editing Objects](#5-editing-objects)
6. [Selecting and Transforming](#6-selecting-and-transforming)
7. [Connectors](#7-connectors)
8. [Frames](#8-frames)
9. [Operations — Delete, Duplicate, Copy/Paste, Undo](#9-operations)
10. [Using the AI Agent (Sorting Hat)](#10-using-the-ai-agent-sorting-hat)
11. [Themes — Aurora and Magic](#11-themes--aurora-and-magic)
12. [Collaborating in Real Time](#12-collaborating-in-real-time)
13. [Keyboard Shortcuts](#13-keyboard-shortcuts)
14. [Behind the Scenes](#14-behind-the-scenes)

---

## 1. Signing In

1. Open the app. You'll see a landing page with a product mockup, feature cards, and a call-to-action.
2. Click **"Sign in with Google"**. A Google OAuth popup will open.
3. Choose your Google account. Once authenticated, you land on the board list.

If you navigate directly to a board URL without being signed in, you'll see a **"Sign in with Google"** link at the top of the page.

To sign out, click **"Sign Out"** at the bottom of the left sidebar (on a board) or the **"Sign out"** link in the top-right corner (on the home page). In Magic mode, this button reads **"Vanish"**.

---

## 2. Managing Boards

### Creating a Board

1. From the home page, click **"+ New Board"**.
2. Type a name in the text field that appears and press `Enter` or click **"Create"**.
3. You're taken directly into the new board.

### Opening a Board

Click any board card on the home page. Each card shows the board name, member count, member avatars, and a relative timestamp (e.g. "5m ago"). Live board thumbnails preview board content.

### Sharing a Board

1. Inside a board, click **"Share…"** at the bottom of the left sidebar.
2. An invite link is copied to your clipboard. A tooltip confirms **"Link copied!"** (or **"Owl dispatched!"** in Magic mode).
3. When they open the link, they'll see **"You've been invited to this board"** with a **"Join Board"** button.

### Deleting a Board

Hover over a board card you created. An **"✕"** button appears on the right. Click it and confirm the deletion dialog.

### Returning to the Board List

Click **"← My Boards"** at the top of the left sidebar from any board.

---

## 3. Navigating the Board

The board is an infinite canvas. You can pan and zoom freely.

| Action | How |
| :----- | :-- |
| **Zoom in/out** | Scroll the mouse wheel. Zoom stays centered on your cursor. |
| **Pan** | Hold `Space` and drag anywhere on the canvas, or press `H` to enter pan mode. |
| **Pan (touch)** | Single-finger drag on an empty area of the canvas. |

- Zoom range: 0.4x to 2.5x.
- The background shows a subtle grid to help with spatial orientation. Grid color adapts to the active theme.

---

## 4. Creating Objects

All creation tools live in the **left sidebar** (the 192px-wide panel on the left edge of the screen). Tools are arranged in a 3-column grid.

### Sticky Notes

1. Click **"Sticky Note"** (or **"Parchment Note"** in Magic mode) in the sidebar.
2. A sticky note appears on the canvas (default: mint green, 160×160px, text reads "New note").
3. If you previously clicked a spot on the canvas, the note spawns there. Otherwise it spawns at the center of your viewport.

### Rectangles

1. Click **"Rectangle"** in the sidebar.
2. A rectangle appears at the center of your viewport (default: sky blue, 200×120px).

### Circles

1. Click **"Circle"** in the sidebar.
2. A circle appears at the center of your viewport.

### Lines

1. Click **"Line"** in the sidebar.
2. A line element appears at the center of your viewport.

### Hearts

1. Click **"Heart"** in the sidebar.
2. A heart shape appears at the center of your viewport.

### Text

1. Click **"Text"** in the sidebar.
2. A text element spawns at your viewport center and immediately enters edit mode — start typing right away.
3. Press `Enter` to commit, or `Escape` to cancel.

---

## 5. Editing Objects

### Editing Sticky Note Text

1. **Double-click** a sticky note.
2. A text area appears over the note. Type your changes.
3. Press `Enter` to save. Press `Shift+Enter` for a newline. Press `Escape` to cancel.

### Editing Standalone Text

Same as stickies: **double-click** to edit, `Enter` to save, `Escape` to cancel.

### Changing Colors

1. **Click** an object to select it.
2. In the sidebar, a row of **7 color swatches** appears under a "Color" label. Click any swatch to change the object's fill color.

Available fill colors for stickies, rectangles, and frames:

| Swatch | Color |
| :----- | :---- |
| `#C9E4DE` | Mint (default for stickies) |
| `#C6DEF1` | Sky blue (default for rectangles) |
| `#FDEBD0` | Peach |
| `#D5E8D4` | Sage |
| `#E1D5E7` | Lavender |
| `#FFF2CC` | Yellow |
| `#FFD7D7` | Blush |

Text elements have a separate **"Text Color"** palette (near-black, gray, blue, green, orange, purple, rose).

### Changing Font Size (Text Only)

1. Select a text element.
2. In the sidebar, under **"Size"**, click one of the five size buttons: `12`, `16`, `20`, `28`, or `40`.

---

## 6. Selecting and Transforming

### Selecting

| Action | How |
| :----- | :-- |
| **Select one item** | Click it (or press `V` to enter select mode first). |
| **Add/remove from selection** | `Shift + Click` an item to toggle it in or out of the current selection. |
| **Drag-to-select** | In select mode, click and drag on an empty area of the canvas. A dashed indigo rectangle appears. All items it touches are selected on release. |
| **Deselect all** | Click on an empty area of the canvas, or press `Escape`. |

Selected items show an **amber outline** and Konva transform handles.

### Moving

Click and drag any selected item. If multiple items are selected, dragging one moves them all together.

### Resizing

Select a single item. Drag any of the 8 resize handles (corners and edges) on the transform box. Minimum sizes:

- Stickies / Rectangles / Text: 40×40px
- Frames: 80×80px

### Rotating

Select a single non-frame item. A rotation handle appears above the transform box. Drag it to rotate. Frames cannot be rotated.

---

## 7. Connectors

Connectors are lines or arrows that visually link two objects.

### Drawing a Connector

1. Click **"Connect"** in the sidebar. The button turns blue and shows **"Click source…"**.
2. Click the first object (the source). It gets a blue outline and the label changes to **"Click target…"**.
3. Click the second object (the target). An arrow is drawn between them.

The connector attaches to the nearest edge of each object's bounding box and updates automatically when objects are moved.

### Selecting and Deleting a Connector

- Click directly on a connector line to select it (it turns amber).
- Press `Delete` / `Backspace`, or click **"Delete Connector"** in the sidebar.

### Notes

- Frames cannot be used as connector endpoints.
- Press `Escape` at any point to cancel connector mode and return to select.

---

## 8. Frames

Frames are labeled containers for grouping content visually.

### Creating a Frame

1. Click **"Frame"** in the sidebar. It turns indigo and shows **"Click & drag…"**. The cursor becomes a crosshair.
2. Click and drag on the canvas to define the frame area. A dashed indigo preview appears.
3. Release the mouse. The frame is created (minimum size: 80×80px).
4. A title input appears immediately — type a name and press `Enter`.

### Renaming a Frame

**Double-click** the frame to re-open the title input. Press `Enter` to save or `Escape` to cancel.

### Appearance

Frames render as dashed indigo borders with a colored title bar at the top. They are always drawn **behind** all other objects so they act as visual containers.

---

## 9. Operations

| Operation | Shortcut | Notes |
| :-------- | :------- | :---- |
| **Delete** | `Delete` or `Backspace` | Deletes all selected items and any connectors attached to them. Also works for a selected connector. In Magic mode, the button reads **"Evanesco"**. |
| **Duplicate** | `Cmd+D` / `Ctrl+D` | Creates copies offset by +20px. The copies become the new selection. In Magic mode: **"Geminio"**. |
| **Copy** | `Cmd+C` / `Ctrl+C` | Copies selected items to an internal clipboard. |
| **Paste** | `Cmd+V` / `Ctrl+V` | Pastes from the clipboard at the center of your viewport. Repeated pastes stagger by +20px. |
| **Undo** | `Cmd+Z` / `Ctrl+Z` | Undoes the last operation. Supports create, delete, move, field update, and connector operations. Up to 50 entries. Also available as an undo button in the sidebar. |

You can also delete via the red **"Delete"** button in the sidebar when items are selected.

---

## 10. Using the AI Agent (Sorting Hat)

The AI agent can create, move, rearrange, and template objects on your board using natural language. It operates as a chat interface with multi-turn conversation support.

### Opening the Chat Panel

- Click the **floating action button** (bottom-right corner of the screen) — a robot icon in Aurora mode, a wizard hat in Magic mode, **or**
- Press `Cmd+K` / `Ctrl+K` from anywhere.

A 340px-wide chat panel slides in from the right side of the screen.

### Issuing a Command

1. Type a natural language instruction in the input field at the bottom of the panel.
2. Click the **Send** button (or **Wand** icon in Magic mode) or press `Enter`.
3. A typing indicator appears while the AI processes (**"Thinking…"** in Aurora, **"The hat is thinking…"** in Magic).
4. Results appear on the board with a staggered fade-in animation. The viewport auto-centers on newly created items.
5. A summary appears in the chat (e.g. "3 sticky notes conjured"). In Magic mode, this displays as a **"Revelio!"** animation with sparkle effects.

The AI remembers earlier messages in the conversation, so you can issue follow-up commands like "now change those to blue" or "add two more."

Press `Escape` or click the **X** button to close the panel.

### Example Commands

**Creation**

- "Add a yellow sticky note that says 'User Research'"
- "Create a blue rectangle"
- "Add a frame called 'Sprint Planning'"
- "Create a heart shape"

**Manipulation**

- "Move all the pink sticky notes to the right side"
- "Change the sticky note color to green"
- "Resize the frame to fit its contents"

**Layout**

- "Arrange these sticky notes in a grid"
- "Create a 2x3 grid of sticky notes for pros and cons"
- "Space these elements evenly"

**Templates (complex, multi-step with auto-populated content)**

- "Create a SWOT analysis for launching a mobile app" — generates 4 labeled quadrant frames (Strengths, Weaknesses, Opportunities, Threats) with topic-relevant sticky notes inside each quadrant, wrapped in a labeled frame.
- "Build a user journey map with 5 stages for an onboarding flow" — generates a horizontal row of labeled frames connected by arrows, with relevant sticky notes in each stage.
- "Set up a retrospective board for our last sprint" — generates 3 columns (What Went Well, What Didn't, Action Items) with pre-populated stickies.

Template commands automatically populate sticky notes inside each section with content relevant to your topic. The AI creates 2–4 stickies per section, positioned using the deterministic layout engine.

### AI Tools Available

| Tool | What It Does |
| :--- | :----------- |
| `createStickyNote` | Places a sticky note with text, color, and position |
| `createShape` | Creates a rectangle, circle, line, or heart |
| `createFrame` | Creates a labeled frame/container |
| `createConnector` | Draws a line or arrow between two objects |
| `moveObject` | Moves an object to a new position |
| `resizeObject` | Resizes an object |
| `updateText` | Changes text content of a sticky or text element |
| `changeColor` | Changes an object's fill color |
| `arrangeInGrid` | Arranges objects into a grid layout |
| `getBoardState` | Reads the board so the AI can reason about existing objects |
| `createSWOTTemplate` | One-shot SWOT analysis (4 quadrants with auto-populated stickies) |
| `createJourneyMap` | One-shot journey map (labeled stages with arrows and auto-populated stickies) |
| `createRetroTemplate` | One-shot retrospective board (3 columns with auto-populated stickies) |

### Auto-Wrapping

When the AI creates 2 or more standalone sticky notes (not as part of a template), they are automatically wrapped in a frame titled with your command text. This keeps AI-created content visually grouped.

### Error Handling

If a command fails, an error message appears inside the chat panel. If you close the panel, a red toast notification appears at the bottom of the screen with a dismiss button.

---

## 11. Themes — Aurora and Magic

The app has two visual themes that change the entire look and feel.

### Switching Themes

Look for the **secret toggle button** in the top-right corner of the screen:

- In **Aurora** mode, it appears as a **keyhole** icon.
- In **Magic** mode, it appears as a **gothic door** icon.

Hover over it to see particle burst and smoke effects. Click it to switch themes. A radial reveal animation sweeps outward from the button.

- **Aurora → Magic tooltip:** "I solemnly swear I am up to no good..."
- **Magic → Aurora tooltip:** "Mischief managed."

Your theme preference is saved and persists across sessions.

### Aurora Theme (Default)

- Deep navy-teal glassmorphism aesthetic
- Animated aurora drift background on non-board pages
- Glassmorphic panels with blur effects
- Clean, modern sans-serif typography (Geist)
- Light grey board canvas with subtle grid
- AI panel uses a **robot** icon and straightforward labels

### Magic Theme

- Dark parchment/burgundy/gold aesthetic inspired by Harry Potter
- Warm amber and gold text on dark backgrounds
- Cinzel serif headings for a fantasy feel
- Parchment texture overlays on panels
- Warm parchment-colored board canvas
- **Ink footprint trail** follows your cursor on the board canvas
- **All UI labels transform** to wizarding equivalents:

| Aurora Label | Magic Label |
| :----------- | :---------- |
| My Boards | The Great Hall |
| Sign out | Vanish |
| Sticky Note | Parchment Note |
| Delete (Del) | Evanesco (Del) |
| Duplicate | Geminio |
| AI Assistant | The Sorting Hat |
| Thinking... | The hat is thinking... |
| Done | Revelio! (with sparkle animation) |

...and 50+ more label mappings throughout the UI.

---

## 12. Collaborating in Real Time

Everything described above works simultaneously for all users on the same board.

### Presence — Who's Online

The left sidebar shows an **"Online (N)"** section listing the names of all users currently on the board. Your name appears first with a **(You)** suffix.

Each user is assigned a consistent color (red, blue, green, amber, or purple) based on their account.

**Idle detection:** Users who have been inactive for more than 2 minutes appear dimmed with a grey dot and italic styling, so you can tell who's actively working versus away.

If no one else is connected, it reads **"No one else online"**.

### Live Cursors

Other users' cursors appear on the canvas as **colored circles** with their name displayed beside them. Cursor positions update at ~60Hz for smooth tracking.

### Live Dragging

When another user drags an object, you see it move on your canvas in real time. While someone else is dragging an item, that item is temporarily locked — you can't pick it up until they release it.

### Synced Edits

Any object created, edited, moved, resized, rotated, recolored, or deleted by any user is reflected on all other users' canvases within moments.

### AI Commands Are Shared

When any user issues an AI command, the resulting objects appear on **everyone's** board. Multiple users can issue AI commands at the same time without conflicts (protected by the reservation system).

### Disconnect and Reconnect

If your connection drops, the app reconnects automatically. Board state is persisted — even if all users leave and come back later, everything is exactly as they left it.

---

## 13. Keyboard Shortcuts

| Shortcut | Action |
| :------- | :----- |
| `V` | Switch to select mode |
| `H` | Switch to pan mode |
| `Escape` | Deselect all / cancel current tool / close AI panel |
| `Space` (hold) + drag | Pan the canvas |
| `Delete` / `Backspace` | Delete selected items or connector |
| `Cmd/Ctrl + Z` | Undo last action |
| `Cmd/Ctrl + D` | Duplicate selected items |
| `Cmd/Ctrl + C` | Copy selected items |
| `Cmd/Ctrl + V` | Paste items |
| `Cmd/Ctrl + K` | Open or close the AI chat panel |
| `Enter` | Commit text edit / frame title edit |
| `Shift + Enter` | Newline inside a text edit (or in the AI chat input) |
| `Escape` (while editing) | Cancel text edit without saving |

---

## 14. Behind the Scenes

These features fulfill PRD requirements but aren't directly controlled by the user.

### Conflict Resolution — Last Write Wins

When two users edit the same object at the same time (e.g. both change a sticky's text), the last save wins. There is no merge — whichever write reaches the server last becomes the canonical state, and all clients are updated to match.

### Drag Locking via RTDB

While a user is actively dragging an item, a temporary lock is broadcast through Firebase Realtime Database. Other users cannot pick up that item until the drag finishes. The lock is automatically cleaned up if the dragging user disconnects.

### Presence Heartbeat and Stale Detection

Each client sends a heartbeat every 8 seconds. If no heartbeat is received for 20 seconds, that user is considered stale and removed from the online list and cursor display. On disconnect (tab close, crash, network loss), the Firebase server automatically removes the presence entry. Users idle for more than 2 minutes are shown with dimmed styling.

### Offline Persistence (Firestore Local Cache)

Firestore is initialized with `persistentLocalCache`, which means board data is cached in your browser's IndexedDB. If you briefly lose connectivity, the board continues to display correctly and queued writes are sent once you reconnect.

### Viewport Culling

To support 500+ objects, only items that intersect the visible viewport (plus a 200px buffer) are rendered. Selected items, AI-animating items, and connector endpoints are always rendered regardless of visibility. This keeps the Konva canvas performant during pan and zoom.

### React.memo Optimization

All 8 item components (RectItem, StickyItem, CircleItem, LineItem, HeartItem, TextItem, FrameItem) and ConnectorLine are wrapped in `React.memo` with custom equality functions. Only render-relevant fields (position, size, color, text, rotation) are compared — metadata like `createdBy` and `updatedAt` are ignored.

### Performance Targets

The application is built to meet these benchmarks:

| Metric | Target |
| :----- | :----- |
| Frame rate | 60 FPS during pan, zoom, and manipulation |
| Object sync latency | < 100ms |
| Cursor sync latency | < 50ms (16ms broadcast interval) |
| Object capacity | 500+ objects without degradation |
| Concurrent users | 5+ without degradation |

### Cursor Update Throttling

Cursor positions are broadcast at most every **16ms** (one frame at 60fps) to maximize smoothness. Drag positions are broadcast every **50ms**.

### Connector Geometry

Connector endpoints dynamically attach to the nearest edge of each connected object's bounding box. When objects are moved, connectors re-route automatically.

### AI Agent Reservation

When an AI command is in progress, a temporary reservation document is written to Firestore to prevent conflicting concurrent AI operations. It has a 30-second TTL and is cleaned up automatically when the command completes.

### AI Stagger Animation

Objects created by the AI agent appear with a staggered entrance animation — each item fades in and scales up at 100ms intervals, giving a sequential "build" effect. After all items animate in, the viewport auto-centers on the newly created content.

### Debug / Stress Test Mode

Append `?debug=1` to the board URL to reveal a debug overlay with an "Add 500 Items" stress test button. Items are generated in a spiral pattern for performance testing.
