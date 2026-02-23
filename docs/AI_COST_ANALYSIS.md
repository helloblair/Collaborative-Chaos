# AI Cost Analysis — Collaborative Chaos

## Development & Testing Costs

### LLM API Spend (OpenAI)

| Metric | Value |
|:-------|:------|
| Provider | OpenAI (GPT-4.1 Nano) |
| Total spend | **$0.02** |
| Total tokens consumed | **270,558** |
| Total API requests | **96** |
| Average tokens per request | ~2,818 |
| Model | `gpt-4.1-nano-2025-04-14` |

### AI Coding Tool Spend

| Tool | Cost Model | Estimated Spend |
|:-----|:-----------|:----------------|
| Claude Code (CLI) | Claude Max subscription ($100/mo) | ~$15 attributed to this project (1 week of a monthly sub) |
| Claude Sonnet (Cursor/IDE) | Included in Claude Max | $0 incremental |

### Total Development AI Cost

| Category | Amount |
|:---------|:-------|
| In-app AI agent (OpenAI API) | $0.02 |
| AI coding tools (subscription) | ~$15 |
| **Total** | **~$15.02** |

The in-app AI agent cost is negligible because GPT-4.1 Nano is extremely cheap for structured tool-calling. The vast majority of AI spend went toward development tooling, not the production feature.

---

## Production Cost Projections

### Assumptions

| Parameter | Value | Reasoning |
|:----------|:------|:----------|
| AI commands per user per session | 5 | Typical: create a template, arrange items, a few creation commands |
| Sessions per user per month | 8 | ~2x/week for active collaborators |
| AI commands per user per month | 40 | 5 commands x 8 sessions |
| Avg tokens per command (input) | 2,200 | Viewport context + system prompt + tool schema |
| Avg tokens per command (output) | 600 | Tool call JSON + short reply |
| Avg total tokens per command | 2,800 | Matches observed average of ~2,818 |
| GPT-4.1 Nano pricing | $0.10/1M input, $0.40/1M output | OpenAI published rates |
| Avg cost per command | ~$0.00046 | (2,200 x $0.10 + 600 x $0.40) / 1,000,000 |
| Firebase Firestore reads | $0.06/100K | Per-read pricing |
| Firebase Firestore writes | $0.18/100K | Per-write pricing |
| Firebase RTDB | ~$5/mo baseline | Cursor + presence at moderate usage |
| Vercel hosting | $0 (Hobby) / $20 (Pro) | Depends on scale |

### Cost Per AI Command Breakdown

| Component | Cost per command |
|:----------|:----------------|
| LLM tokens (GPT-4.1 Nano) | $0.00046 |
| Firestore writes (~8 objects avg) | $0.0000144 |
| Firestore reads (getBoardState) | $0.00006 |
| **Total per command** | **~$0.0005** |

### Monthly Projection Table

| | 100 Users | 1,000 Users | 10,000 Users | 100,000 Users |
|:----------|:----------|:------------|:-------------|:--------------|
| AI commands/mo | 4,000 | 40,000 | 400,000 | 4,000,000 |
| LLM cost | $0.02 | $0.18 | $1.84 | $18.40 |
| Firestore writes | $0.06 | $0.58 | $5.76 | $57.60 |
| Firestore reads | $0.24 | $2.40 | $24.00 | $240.00 |
| RTDB (presence) | $5 | $5 | $25 | $100 |
| Hosting (Vercel) | $0 | $20 | $20 | $150+ |
| **Total/month** | **~$5** | **~$28** | **~$77** | **~$566** |

### Key Observations

1. **LLM cost is almost free.** GPT-4.1 Nano at structured tool-calling rates makes the AI agent essentially costless even at 100K users ($18/mo). The model choice was deliberate — Nano handles tool-calling reliably while keeping costs 100x lower than GPT-4o.

2. **Firestore reads are the dominant cost driver.** The `getBoardState` tool fetches all board objects, which scales with board density. At 100K users, Firestore reads account for ~42% of total cost.

3. **RTDB is a flat cost.** Cursor/presence telemetry via Realtime Database is billed on bandwidth and connections, not per-write, making it predictable.

4. **The architecture's cost separation works.** Putting cursors on RTDB instead of Firestore avoids the primary cost amplification risk identified in the Pre-Search document. At 60Hz cursor updates with 5 users, Firestore would cost ~$0.65/board/hour vs. RTDB at essentially zero marginal cost.

### Cost Optimization Levers (if needed at scale)

- **Cache getBoardState** server-side per board with a 5-second TTL — reduces Firestore reads by ~80%
- **Switch to GPT-4.1 Mini** only if Nano quality degrades — 4x cost increase but still cheap
- **Paginate board objects** — only fetch objects in the user's viewport region instead of full board
- **Rate-limit AI commands** — 10 commands/minute/user prevents abuse
