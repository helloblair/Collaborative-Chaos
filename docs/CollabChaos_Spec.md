# Create the G4 Week 1 CollabBoard Spec as a standalone Markdown file

import pypandoc

spec_content = """
# G4 Week 1 – CollabBoard Specification  
**Project:** Collaborative Chaos  
**Deployed MVP:** https://collaborative-chaos-j7ow.vercel.app/board/demo  
**Repository:** https://github.com/helloblair/Collaborative-Chaos  

**Tech Stack:**  
- Next.js (App Router)  
- TypeScript  
- Konva (canvas rendering)  
- Firebase Auth  
- Firestore (durable board state)  
- Firebase Realtime Database (presence + cursors)  
- Vercel (deployment)

---

# Core Collaborative Whiteboard

## Board Features

### Current (MVP Complete)
- Infinite board with pan/zoom
- Sticky notes with editable text
- At least one shape type
- Create, move, edit objects
- Real-time sync (2+ users)
- Multiplayer cursors with labels
- Presence awareness
- Authentication
- Public deployment

---

## Milestone 1 – Advanced Interaction Layer

### Selection Model
- Single select (click)
- Multi-select (shift-click)
- Drag-to-select marquee
- Client-only selection state

### Transform System
- Resize handles (Konva Transformer)
- Optional rotation
- Persist final state on transform end

### Frames
- Frame object type (rect + title)
- Send-to-back layering
- Resize-to-fit-contents

### Standalone Text Objects
- Double-click to edit
- HTML overlay input
- Persist on blur

### Connectors
- Straight-line connectors
- `{fromId, toId}`
- Auto-update on object move

### Operations
- Delete (batch)
- Duplicate (offset clone)
- Copy/Paste (local clipboard JSON)

---

## What I Will Demo (Board Features)
1. Multi-select + group move  
2. Resize + rotate object  
3. Create frame and resize to fit  
4. Add standalone text  
5. Connect two objects  
6. Duplicate and copy/paste group  
7. Real-time sync across browsers  

---

# Real Time Collaboration

## Milestone 2 – Collaboration Hardening

### Presence (RTDB)
- Online user list
- `onDisconnect()` cleanup
- Idle fade-out

### Cursors (RTDB)
- Throttled writes (30–60ms)
- Automatic cleanup

### Firestore Sync
- Scoped board listener
- Optimistic UI updates
- Last-write-wins with timestamps

### Reconnection Resilience
- Presence re-register
- UI reconnect banner
- State rehydration

---

## What I Will Demo (Real Time)
1. Two users editing simultaneously  
2. Refresh mid-edit persistence  
3. Network throttle test  
4. Offline → reconnect recovery  
5. 5+ simultaneous sessions  

---

# Testing Scenarios

- Simultaneous object edits
- Rapid object creation (100+ objects)
- Rapid dragging
- Refresh persistence
- Network throttling
- Disconnect recovery
- Multi-user stress test

---

# Performance Targets

## Targets
- 60 FPS canvas interactions
- Cursor sync < 50ms perceived
- Object sync < 100ms perceived
- 500+ objects
- 5+ concurrent users

## Implementation Strategy
- Separate Konva layers
- Memoized object components
- Optimistic local updates
- Minimal document payload

---

# AI Board Agent

## 1. Required Capabilities

### Creation Commands
- Add sticky note
- Create shape
- Create frame

### Manipulation Commands
- Move object(s)
- Resize object
- Change color
- Update text

### Layout Commands
- Arrange in grid
- Space evenly

### Complex Commands
- Create SWOT template
- Create Retrospective board template

---

## 2. Tool Schema (Minimum)
- getBoardState(boardId)
- createStickyNote(...)
- createShape(...)
- createFrame(...)
- createConnector(...)
- moveObject(...)
- resizeObject(...)
- updateText(...)
- changeColor(...)

---

## 3. Evaluation Criteria
- Correct object count
- Correct layout structure
- Grid alignment consistency
- Multi-step execution reliability
- Determinism across prompts
- Shared visibility across users

---

## 4. Shared AI State
- AI mutations go through server API
- Firestore sync to all users
- Optional AI job queue

---

## 5. AI Agent Performance
- <2s single command response
- Reliable multi-step execution
- Live shared updates

---

# AI-First Development Requirements

## Tools Used
- Cursor
- Claude/OpenAI API
- GitHub Copilot (optional)

## AI-Driven Workflow
- Spec-first prompting
- Feature-by-feature generation
- Iterative refinement
- Manual validation

---

# AI Development Log (required)

Will include:
- Tools used
- Representative prompts
- % AI vs human-written code
- Successes and failures
- Lessons learned

---

# AI Cost Analysis (required)

## Development & Testing Costs
- Model usage logs
- Token counts
- Latency metrics
- Command frequency tracking

## Production Cost Projections
Modeled for:
- 100 users
- 1,000 users
- 10,000 users
- 100,000 users

Includes:
- Infrastructure cost estimates
- AI API cost estimates
- Scaling assumptions

---

# Milestone Timeline

- Milestone 1: Selection + Transforms + Frames
- Milestone 2: Connectors + Performance polish
- Milestone 3: AI Tool Schema + 6+ Commands
- Milestone 4: Complex Templates + Shared AI State
- Milestone 5: Testing + Logging + Cost Analysis + Demo Prep

---

# Final Demo Flow

1. Deployed app intro  
2. Board feature expansion  
3. Real-time collaboration stress test  
4. Performance validation  
5. AI agent live commands  
6. Shared AI state demo  
7. AI-first workflow explanation  
8. Cost model walkthrough  
"""

output_path = "/mnt/data/G4_Week1_CollabBoard_Spec.md"

pypandoc.convert_text(
    spec_content,
    "md",
    format="md",
    outputfile=output_path,
    extra_args=['--standalone']
)

output_path
