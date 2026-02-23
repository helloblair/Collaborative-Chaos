# CollabBoard Pre-Search Document

This proposal outlines an MVP architecture for a real-time collaborative whiteboard. The system prioritizes rapid delivery, controlled cost, and reliable real-time behavior under moderate concurrency constraints.

---

## Phase 1: Define Constraints

### 1. Scale & Load Profile

**Users at Launch**
- Expected concurrent users per board: **2-5 active editors**
- Designed concurrency buffer: **5-20 simultaneous users per board**

Reasoning:
A collaborative whiteboard degrades in usability beyond ~20 simultaneous editors due to cursor noise and visual clutter. Designing for 5-20 users provides reasonable buffer capacity without prematurely optimizing for enterprise-scale concurrency.

**Users in 6 Months**
- Modest growth expected
- Architecture allows scaling beyond MVP levels but does not optimize for hundreds of concurrent editors initially

**Traffic Pattern**
- Spiky during active collaboration sessions
- Idle between sessions

**Real-Time Requirements**
- Cursor update latency target: <50ms perceived
- Object synchronization latency target: <100ms
- Board state consistency required across all connected users

**Cold Start Tolerance**
- AI endpoint cold start tolerance: 1-2 seconds acceptable
- Real-time board interactions must remain independent of AI cold start delays

---

### 2. Budget & Cost Ceiling

**MVP Phase Budget**

Target monthly cost during development: **<$50**

Reasoning:
- Limited concurrency (under 20 users)
- Human-speed object interaction (no automated bulk writes)
- AI usage limited to structured command generation rather than long-form streaming output

Primary cost risk: high-frequency writes (cursor movement).

Mitigation strategy:
- Separate high-frequency cursor updates from durable board state.
- Throttle cursor updates client-side.
- Persist object position updates on drag end rather than per pixel movement.

This balances development speed with cost awareness.

---

### 3. Time to Ship

**MVP Timeline**

Target delivery window: **3-7 days**

Priority order:
1. Speed to working multiplayer sync
2. Functional correctness
3. Reliability under reconnect scenarios
4. Maintainability
5. Scalability optimization (deferred)

Given time constraints, managed services are preferred over custom infrastructure.

---

### 4. Compliance & Regulatory Needs

- No HIPAA requirements
- No enterprise SOC2 requirements
- No sensitive financial or medical data stored

Security focus for MVP:
- Authenticated access control
- Basic rule enforcement
- Server-side validation of AI tool calls

---

### 5. Team & Skill Constraints

- Solo developer
- Strong familiarity with TypeScript, React, Next.js
- Limited experience with custom distributed systems infrastructure

Preference: ship quickly using familiar tools and managed services rather than building custom real-time servers.

---

## Phase 2: Architecture Discovery

### 6. Hosting & Deployment

**Chosen Deployment Model**

Serverless + managed hosting
- Frontend + API routes: Vercel
- Backend services: Firebase

Reasoning:
- Fastest deployment path
- Minimal infrastructure management
- Automatic scaling

Alternative considered:
- Custom Node server with WebSockets

Rejected due to increased operational complexity, connection management overhead, and higher failure surface within a 1-week sprint constraint.

---

### 7. Authentication & Authorization

**Chosen Approach**

Firebase Auth (Google OAuth for MVP)

Reasoning:
- Fast implementation
- Managed security model
- Reduces need to build custom auth flows

Authorization model:
- Authenticated access required
- Board access via simple share model for MVP
- No complex RBAC required initially

---

### 8. Database & Real-Time Strategy

**Alternatives Considered**

**Supabase (Postgres + Realtime)**
Pros:
- SQL flexibility
- Strong querying capability
- Built-in presence channels

Cons:
- Row Level Security complexity
- Additional schema planning overhead
- Increased architectural decision load under time pressure

**Custom WebSockets + Postgres**
Pros:
- Full control over presence and conflict resolution
- Lower theoretical latency ceiling

Cons:
- Stateful connection management
- Custom scaling logic
- Higher implementation risk

**Final Decision: Firebase Split Architecture**
- Firestore -> Durable board state
- Realtime Database (RTDB) -> Presence and cursor telemetry

Reasoning:

Firestore provides:
- Structured document storage for board objects
- Mature real-time listeners
- Automatic reconnection handling

However, Firestore charges per read/write. High-frequency cursor updates would amplify cost.

RTDB is better suited for:
- Transient, high-frequency updates
- Presence tracking
- Lower write amplification

This separation aligns storage model with data behavior:
- Durable state -> Firestore
- Live telemetry -> RTDB

---

### 9. Backend / API Architecture

**Chosen Architecture**

Monolithic Next.js application with serverless API routes.

Reasoning:
- Faster development
- Reduced debugging surface
- Minimal deployment complexity

Microservices architecture rejected as premature for MVP scale.

AI command flow:
1. Natural language input received
2. LLM invoked with structured tool schema
3. Tool calls validated server-side
4. Validated changes written to Firestore
5. All clients sync via listeners

---

### 10. Frontend Framework & Rendering

- Next.js + React + TypeScript
- SPA rendering model
- Konva for canvas interactions

Reasoning:
- Whiteboard app does not require SEO
- Highly interactive canvas application
- Familiar ecosystem with strong tooling support

---

## Phase 3: Post-Stack Refinement

### 11. Conflict Resolution Strategy

Chosen approach: Last-write-wins using server timestamps.

Tradeoff:
- Does not implement Operational Transform (OT)
- Does not implement CRDT

Given moderate concurrency and MVP scope, last-write-wins provides acceptable consistency with minimal implementation complexity.

---

### 12. Security Considerations

Potential risks:
- Misconfigured Firestore rules
- AI-generated tool injection
- Unauthorized board access

Mitigation:
- Authenticated read/write rules
- Server-side validation of AI tool arguments
- Throttling AI endpoint
- Avoid exposing private credentials

---

### 13. Connectivity Risk (Primary Technical Concern)

Distributed real-time systems must handle:
- Disconnect/reconnect events
- Ghost cursors
- Partial state updates

Mitigation strategy:
- Use RTDB `onDisconnect()` for presence cleanup
- Rely on Firestore's built-in reconnection handling
- Persist object updates on drag end rather than continuous writes

This prioritizes state integrity over ultra-low latency.

---

### 14. Testing Strategy

Manual multi-browser testing:
- 2+ simultaneous editors
- Rapid object creation
- Refresh persistence validation
- Network throttling simulation
- Disconnect/reconnect scenarios
- 5-user concurrency test

Focus: reliability and real-time correctness rather than coverage percentage.

---

## Build Order

1. Cursor sync (RTDB)
2. Object sync (Firestore)
3. Conflict handling documentation
4. Persistence validation
5. Expanded board features
6. Basic AI commands
7. Multi-step AI templates

---

## Summary

This architecture:
- Optimizes for rapid MVP delivery
- Uses managed infrastructure to reduce operational risk
- Separates durable state from high-frequency telemetry
- Mitigates cost amplification risks
- Avoids premature complexity

All major decisions were made relative to:
- Solo developer constraint
- 1-week sprint timeline
- Moderate concurrency expectations
- Real-time system reliability requirements
