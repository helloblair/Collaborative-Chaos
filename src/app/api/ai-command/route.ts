import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { verifyIdToken, adminDb } from "@/lib/firebaseAdmin";
import { AI_TOOLS, SYSTEM_PROMPT } from "@/lib/aiTools";
import type { BoardItem } from "@/types/board";
import { nanoid } from "nanoid";
import {
  computeGridLayout,
  computeSWOTLayout,
  computeJourneyMapLayout,
  computeRetroLayout,
  computeContainerChildLayout,
  getItemBounds,
  rectsIntersect,
  rectContains,
  findNonOverlappingPosition,
  findNonOverlappingPositionInFrame,
  type BoardObjectMap,
  type Rect,
} from "@/lib/layoutEngine";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ViewportBounds { x: number; y: number; width: number; height: number; }
interface ChatMessage { role: "user" | "assistant"; content: string; }
interface AiCommandRequest { command: string; boardId: string; viewportObjects: BoardItem[]; viewportBounds: ViewportBounds; conversationHistory?: ChatMessage[]; selectedIds?: string[]; }
interface ActionResult { tool: string; id?: string; [key: string]: unknown; }

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

// Firebase project ID — available without admin credentials
const PROJECT_ID =
  process.env.FIREBASE_PROJECT_ID ??
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
  "";

const RESERVATION_TTL_MS = 30_000;

const STICKY_COLORS: Record<string, string> = {
  yellow: "#FEF08A", pink: "#FBCFE8", blue: "#BFDBFE",
  green: "#BBF7D0", purple: "#E9D5FF", orange: "#FED7AA",
};

// ---------------------------------------------------------------------------
// Firestore REST helpers
//
// The Firestore REST API accepts the user's Firebase ID token directly.
// No service-account credentials are required — access is governed by the
// same Firestore security rules that apply on the client.
// ---------------------------------------------------------------------------

type FSValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { timestampValue: string }
  | { stringValue: string }
  | { arrayValue: { values?: FSValue[] } }
  | { mapValue: { fields?: Record<string, FSValue> } };

/** Convert a plain JS value to a Firestore REST field value. */
function toFSValue(v: unknown): FSValue {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFSValue) } };
  if (typeof v === "object") {
    // Non-plain objects (e.g. FieldValue sentinels) → record current time
    if (Object.getPrototypeOf(v) !== Object.prototype) {
      return { timestampValue: new Date().toISOString() };
    }
    const fields: Record<string, FSValue> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      fields[k] = toFSValue(val);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

/** Convert a Firestore REST field value back to a plain JS value. */
function fromFSValue(v: FSValue): unknown {
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return (v as { booleanValue: boolean }).booleanValue;
  if ("integerValue" in v) return Number((v as { integerValue: string }).integerValue);
  if ("doubleValue" in v) return (v as { doubleValue: number }).doubleValue;
  if ("timestampValue" in v) return (v as { timestampValue: string }).timestampValue;
  if ("stringValue" in v) return (v as { stringValue: string }).stringValue;
  if ("arrayValue" in v) {
    return ((v as { arrayValue: { values?: FSValue[] } }).arrayValue.values ?? []).map(fromFSValue);
  }
  if ("mapValue" in v) {
    const obj: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(
      (v as { mapValue: { fields?: Record<string, FSValue> } }).mapValue.fields ?? {}
    )) {
      obj[k] = fromFSValue(val);
    }
    return obj;
  }
  return null;
}

/** Convert a raw REST document (with `name` and `fields`) to a plain object. */
function fromFSDoc(doc: { name: string; fields?: Record<string, FSValue> }): Record<string, unknown> {
  const result: Record<string, unknown> = { id: doc.name.split("/").pop() };
  for (const [k, v] of Object.entries(doc.fields ?? {})) {
    result[k] = fromFSValue(v);
  }
  return result;
}

/**
 * Queues Firestore set/update/delete ops and flushes them as individual
 * PATCH/DELETE REST calls authenticated with the user's Firebase ID token.
 *
 * `batchWrite` requires Cloud IAM / service-account OAuth2 scopes and does NOT
 * work with Firebase ID tokens. Individual document endpoints (PATCH, DELETE)
 * DO support Firebase ID tokens and evaluate Firestore security rules normally.
 */
class RestBatchWriter {
  private pendingWrites: Array<() => Promise<void>> = [];

  constructor(private projectId: string, private idToken: string) {}

  private get baseUrl() {
    return `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents`;
  }

  set(collectionPath: string, docId: string, data: Record<string, unknown>) {
    const url = `${this.baseUrl}/${collectionPath}/${docId}`;
    const fields: Record<string, FSValue> = {};
    for (const [k, v] of Object.entries(data)) fields[k] = toFSValue(v);
    this.pendingWrites.push(async () => {
      const res = await fetch(url, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${this.idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Firestore set failed (${res.status}): ${text}`);
      }
    });
  }

  update(collectionPath: string, docId: string, data: Record<string, unknown>) {
    const fieldPaths = Object.keys(data)
      .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
      .join("&");
    const url = `${this.baseUrl}/${collectionPath}/${docId}?${fieldPaths}`;
    const fields: Record<string, FSValue> = {};
    for (const [k, v] of Object.entries(data)) fields[k] = toFSValue(v);
    this.pendingWrites.push(async () => {
      const res = await fetch(url, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${this.idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Firestore update failed (${res.status}): ${text}`);
      }
    });
  }

  delete(collectionPath: string, docId: string) {
    const url = `${this.baseUrl}/${collectionPath}/${docId}`;
    this.pendingWrites.push(async () => {
      const res = await fetch(url, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${this.idToken}` },
      });
      if (!res.ok && res.status !== 404) {
        const text = await res.text();
        throw new Error(`Firestore delete failed (${res.status}): ${text}`);
      }
    });
  }

  async flush() {
    if (this.pendingWrites.length === 0) return;
    await Promise.all(this.pendingWrites.map((fn) => fn()));
    this.pendingWrites = [];
  }
}

/** List all documents in a Firestore collection via REST. */
async function firestoreList(
  projectId: string,
  idToken: string,
  collectionPath: string
): Promise<Record<string, unknown>[]> {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionPath}?pageSize=300`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
  if (!res.ok) throw new Error(`Firestore list failed (${res.status})`);
  const data = (await res.json()) as {
    documents?: Array<{ name: string; fields?: Record<string, FSValue> }>;
  };
  return (data.documents ?? []).map(fromFSDoc);
}

/** Fetch multiple Firestore documents in a single batchGet request. */
async function firestoreBatchGet(
  projectId: string,
  idToken: string,
  docPaths: string[]
): Promise<(Record<string, unknown> | null)[]> {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:batchGet`;
  const names = docPaths.map(
    (p) => `projects/${projectId}/databases/(default)/documents/${p}`
  );
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ documents: names }),
  });
  if (!res.ok) return docPaths.map(() => null);
  const data = (await res.json()) as Array<{
    found?: { name: string; fields?: Record<string, FSValue> };
    missing?: string;
  }>;
  return data.map((r) => (r.found ? fromFSDoc(r.found) : null));
}

// ---------------------------------------------------------------------------
// Sticky-in-frame helper
// ---------------------------------------------------------------------------

/** Default sticky color per frame title. */
const FRAME_STICKY_COLOR: Record<string, string> = {
  Strengths: "green", Weaknesses: "pink",
  Opportunities: "blue", Threats: "orange",
  "What Went Well": "green", "What Didn't": "pink", "Action Items": "blue",
};

/**
 * Create sticky notes inside a frame with deterministic grid positioning.
 * Returns the array of created sticky IDs.
 */
function createStickiesInFrame(
  frame: { x: number; y: number; width: number; height: number; title?: string },
  texts: string[],
  opts: { writer: RestBatchWriter; itemsPath: string; uid: string; at: string; color?: string },
): string[] {
  if (texts.length === 0) return [];

  const positions = computeContainerChildLayout({
    containerX: frame.x,
    containerY: frame.y,
    containerW: frame.width,
    containerH: frame.height,
    childCount: texts.length,
  });

  const colorName = opts.color ?? FRAME_STICKY_COLOR[frame.title ?? ""] ?? "yellow";
  const fill = STICKY_COLORS[colorName] ?? STICKY_COLORS.yellow;
  const ids: string[] = [];

  for (let i = 0; i < texts.length; i++) {
    const id = nanoid();
    ids.push(id);
    opts.writer.set(opts.itemsPath, id, {
      type: "sticky", text: texts[i], fill,
      x: positions[i].x, y: positions[i].y,
      width: positions[i].width, height: positions[i].height,
      createdBy: opts.uid, updatedAt: opts.at,
    });
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Board state cache for collision detection
// ---------------------------------------------------------------------------

class BoardStateCache {
  private items: BoardItem[] | null = null;

  constructor(
    private projectId: string,
    private idToken: string,
    private itemsPath: string,
  ) {}

  async getItems(): Promise<BoardItem[]> {
    if (this.items === null) {
      const docs = await firestoreList(this.projectId, this.idToken, this.itemsPath);
      this.items = docs as unknown as BoardItem[];
    }
    return this.items;
  }

  addItem(item: BoardItem): void {
    if (this.items) this.items.push(item);
  }

  updatePosition(id: string, x: number, y: number): void {
    if (!this.items) return;
    const item = this.items.find(i => i.id === id);
    if (item) { item.x = x; item.y = y; }
  }
}

// ---------------------------------------------------------------------------
// Tool executor (with collision avoidance)
// ---------------------------------------------------------------------------

async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  boardId: string,
  uid: string,
  writer: RestBatchWriter,
  vb: ViewportBounds,
  boardState: BoardStateCache,
): Promise<{ toolResult: unknown; action: ActionResult }> {
  const at = new Date().toISOString();
  const defaultX = vb.x + vb.width / 2 - 100;
  const defaultY = vb.y + vb.height / 2 - 100;
  const itemsPath = `boards/${boardId}/items`;
  const connectorsPath = `boards/${boardId}/connectors`;

  switch (toolName) {
    case "createStickyNote": {
      const id = nanoid();
      const w = 140, h = 140;
      let x = (input.x as number) ?? defaultX;
      let y = (input.y as number) ?? defaultY;
      const fill = STICKY_COLORS[(input.color as string) || "yellow"] ?? STICKY_COLORS.yellow;

      const allItems = await boardState.getItems();
      const occupiedRects = allItems.map(i => getItemBounds(i));
      const desired: Rect = { x, y, w, h };

      // If position is inside a frame, constrain within it
      const containingFrame = allItems.find(
        i => i.type === "frame" && rectContains(getItemBounds(i), desired)
      );
      if (containingFrame) {
        const frameRect = getItemBounds(containingFrame);
        const childRects = allItems
          .filter(i => i.id !== containingFrame.id && rectContains(frameRect, getItemBounds(i)))
          .map(i => getItemBounds(i));
        const pos = findNonOverlappingPositionInFrame(desired, childRects, frameRect);
        x = pos.x; y = pos.y;
      } else {
        const pos = findNonOverlappingPosition(desired, occupiedRects);
        x = pos.x; y = pos.y;
      }

      boardState.addItem({ id, type: "sticky", x, y, width: w, height: h, text: input.text as string, fill, createdBy: uid });
      writer.set(itemsPath, id, {
        type: "sticky", text: input.text as string, fill,
        x, y, width: w, height: h, createdBy: uid, updatedAt: at,
      });
      return { toolResult: { success: true, id, x, y }, action: { tool: "createStickyNote", id } };
    }
    case "createShape": {
      const id = nanoid();
      const shapeTypeMap: Record<string, BoardItem["type"]> = {
        rectangle: "rect", circle: "circle", line: "line", heart: "heart",
      };
      const mappedType = shapeTypeMap[(input.type as string) || "rectangle"] ?? "rect";
      const defaultWidth = mappedType === "circle" ? 150 : mappedType === "heart" ? 120 : mappedType === "line" ? 200 : 150;
      const defaultHeight = mappedType === "circle" ? 150 : mappedType === "heart" ? 120 : mappedType === "line" ? 0 : 100;
      const defaultFill = mappedType === "heart" ? "#FFD7D7" : mappedType === "line" ? "#374151" : "#94A3B8";
      const w = (input.width as number) ?? defaultWidth;
      const h = (input.height as number) ?? defaultHeight;
      let x = (input.x as number) ?? defaultX;
      let y = (input.y as number) ?? defaultY;

      const allItems = await boardState.getItems();
      const occupiedRects = allItems.map(i => getItemBounds(i));
      const pos = findNonOverlappingPosition({ x, y, w, h }, occupiedRects);
      x = pos.x; y = pos.y;

      boardState.addItem({ id, type: mappedType, x, y, width: w, height: h, fill: (input.color as string) || defaultFill, createdBy: uid });
      writer.set(itemsPath, id, {
        type: mappedType, fill: (input.color as string) || defaultFill,
        x, y, width: w, height: h, createdBy: uid, updatedAt: at,
      });
      return { toolResult: { success: true, id, x, y }, action: { tool: "createShape", id, shapeType: input.type } };
    }
    case "createFrame": {
      const id = nanoid();
      const w = (input.width as number) ?? 400;
      const h = (input.height as number) ?? 300;
      let x = (input.x as number) ?? defaultX;
      let y = (input.y as number) ?? defaultY;

      const allItems = await boardState.getItems();
      const occupiedRects = allItems.map(i => getItemBounds(i));
      const pos = findNonOverlappingPosition({ x, y, w, h }, occupiedRects);
      x = pos.x; y = pos.y;

      boardState.addItem({ id, type: "frame", x, y, width: w, height: h, title: input.title as string, createdBy: uid });
      writer.set(itemsPath, id, {
        type: "frame", title: input.title as string,
        x, y, width: w, height: h, createdBy: uid, updatedAt: at,
      });
      return { toolResult: { success: true, id, x, y }, action: { tool: "createFrame", id, title: input.title } };
    }
    case "createConnector": {
      const fromId = input.fromId as string;
      const toId = input.toId as string;
      if (fromId === toId) {
        return { toolResult: { success: false, error: "Cannot connect an item to itself" }, action: { tool: "createConnector" } };
      }
      const allItemsForConn = await boardState.getItems();
      const fromExists = allItemsForConn.some(i => i.id === fromId);
      const toExists = allItemsForConn.some(i => i.id === toId);
      if (!fromExists || !toExists) {
        return { toolResult: { success: false, error: "Source or target item does not exist" }, action: { tool: "createConnector" } };
      }
      const id = nanoid();
      writer.set(connectorsPath, id, {
        boardId, fromId, toId,
        style: (input.style as string) || "arrow", color: "#64748B",
        createdBy: uid, createdAt: at,
      });
      return { toolResult: { success: true, id }, action: { tool: "createConnector", id } };
    }
    case "moveObject": {
      const objectId = input.objectId as string;
      let x = input.x as number;
      let y = input.y as number;

      const allItems = await boardState.getItems();
      const movingItem = allItems.find(i => i.id === objectId);
      if (movingItem) {
        const w = movingItem.width ?? 200;
        const h = movingItem.height ?? 160;
        const occupiedRects = allItems
          .filter(i => i.id !== objectId)
          .map(i => getItemBounds(i));
        const pos = findNonOverlappingPosition({ x, y, w, h }, occupiedRects);
        x = pos.x; y = pos.y;
        boardState.updatePosition(objectId, x, y);
      }

      writer.update(itemsPath, objectId, { x, y, updatedAt: at });
      return { toolResult: { success: true, x, y }, action: { tool: "moveObject", objectId } };
    }
    case "changeColor":
      writer.update(itemsPath, input.objectId as string, { fill: input.color, updatedAt: at });
      return { toolResult: { success: true }, action: { tool: "changeColor", objectId: input.objectId } };
    case "resizeObject":
      writer.update(itemsPath, input.objectId as string, { width: input.width, height: input.height, updatedAt: at });
      return { toolResult: { success: true }, action: { tool: "resizeObject", objectId: input.objectId } };
    case "updateText":
      writer.update(itemsPath, input.objectId as string, { text: input.newText, updatedAt: at });
      return { toolResult: { success: true }, action: { tool: "updateText", objectId: input.objectId } };
    default:
      return {
        toolResult: { error: `Unknown tool: ${toolName}` },
        action: { tool: toolName, error: "unknown tool" },
      };
  }
}

/**
 * Offset a template layout so its bounding box doesn't overlap existing items.
 * Returns {dx, dy} delta to apply to all template element positions.
 */
async function adjustTemplatePosition(
  frames: Array<{ x: number; y: number; width: number; height: number }>,
  boardState: BoardStateCache,
): Promise<{ dx: number; dy: number }> {
  const allItems = await boardState.getItems();
  if (allItems.length === 0) return { dx: 0, dy: 0 };

  const minX = Math.min(...frames.map(f => f.x));
  const minY = Math.min(...frames.map(f => f.y));
  const maxX = Math.max(...frames.map(f => f.x + f.width));
  const maxY = Math.max(...frames.map(f => f.y + f.height));
  const bbox: Rect = { x: minX - 40, y: minY - 40, w: (maxX - minX) + 80, h: (maxY - minY) + 80 };

  const occupiedRects = allItems.map(i => getItemBounds(i));
  const adjusted = findNonOverlappingPosition(bbox, occupiedRects, { gap: 40 });

  return { dx: adjusted.x - bbox.x, dy: adjusted.y - bbox.y };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  // 1. Guard: OPENAI_API_KEY must be set
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "AI agent not configured — add OPENAI_API_KEY to .env.local" },
      { status: 503 }
    );
  }
  if (!PROJECT_ID) {
    return NextResponse.json(
      { error: "Server configuration error: FIREBASE_PROJECT_ID is not set" },
      { status: 503 }
    );
  }

  // 2. Authenticate
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let uid: string;
  try {
    const payload = await verifyIdToken(token);
    uid = payload.uid;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 3. Parse and validate body
  let body: AiCommandRequest;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }

  const { command, boardId, viewportObjects, viewportBounds, conversationHistory } = body;
  if (!command || !boardId || !viewportObjects || !viewportBounds) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const vb = viewportBounds;
  const itemsPath = `boards/${boardId}/items`;
  const connectorsPath = `boards/${boardId}/connectors`;
  const reservationsPath = `boards/${boardId}/reservations`;

  // 4. Reservation pattern (best-effort — silently skipped when admin credentials absent)
  const reservationId = nanoid();
  const now = Date.now();
  let reservationWritten = false;
  const activeReservations: Array<{ x: number; y: number; w: number; h: number }> = [];

  try {
    const snap = await adminDb.collection(reservationsPath).get();
    const staleDeletes: Promise<unknown>[] = [];
    for (const d of snap.docs) {
      const data = d.data();
      const age = now - ((data.createdAt as number) ?? 0);
      if (age >= RESERVATION_TTL_MS) {
        staleDeletes.push(d.ref.delete().catch(() => {}));
      } else {
        activeReservations.push(data.area as { x: number; y: number; w: number; h: number });
      }
    }
    if (staleDeletes.length > 0) await Promise.all(staleDeletes).catch(() => {});
    await adminDb.doc(`${reservationsPath}/${reservationId}`).set({
      area: { x: vb.x, y: vb.y, w: vb.width, h: vb.height },
      createdAt: now, type: "reservation",
    });
    reservationWritten = true;
  } catch {
    // No admin credentials in dev — reservation skipped
  }

  try {
    // 5. Build the initial LLM messages
    const reservationNote =
      activeReservations.length > 0
        ? `\nActive space reservations (avoid placing objects here):\n${JSON.stringify(activeReservations)}`
        : "";

    // Detect if a selected item is a frame
    const selectedFrameInfo = (() => {
      if (!body.selectedIds?.length) return "";
      const selectedFrame = viewportObjects.find(
        (o: BoardItem) => body.selectedIds!.includes(o.id) && o.type === "frame"
      );
      if (!selectedFrame) return "";
      return `\nSelected frame: id=${selectedFrame.id}, title="${selectedFrame.title ?? ""}", bounds={x:${selectedFrame.x}, y:${selectedFrame.y}, w:${selectedFrame.width ?? 400}, h:${selectedFrame.height ?? 300}}. Place new items INSIDE this frame.`;
    })();

    const userContent = [
      `Viewport: x=${vb.x}, y=${vb.y}, width=${vb.width}, height=${vb.height}`,
      `Objects visible in viewport (${viewportObjects.length}):`,
      JSON.stringify(viewportObjects),
      reservationNote,
      selectedFrameInfo,
      `\nCommand: ${command}`,
    ].join("\n");

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    // Include recent conversation history for multi-turn chat context.
    // Limit to last 4 messages. Truncate assistant replies to reduce the
    // "task already completed" signal that causes small models to skip
    // content generation on repeat template requests.
    if (conversationHistory && conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-4);
      for (const msg of recentHistory) {
        if (msg.role === "assistant") {
          const truncated = msg.content.length > 80
            ? msg.content.slice(0, 80) + "..."
            : msg.content;
          messages.push({ role: msg.role, content: truncated });
        } else {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    messages.push({ role: "user", content: userContent });
    const results: ActionResult[] = [];

    // Track standalone stickies (created via createStickyNote, NOT via template helpers)
    // so we can auto-wrap them in a frame after the loop.
    const standaloneStickyIds: string[] = [];
    const standaloneStickyPositions: Array<{ id: string; x: number; y: number; w: number; h: number }> = [];
    let usedTemplateTools = false;

    // All Firestore writes go through the REST batch writer (user ID token, no admin credentials needed)
    const writer = new RestBatchWriter(PROJECT_ID, token);
    const boardState = new BoardStateCache(PROJECT_ID, token, itemsPath);

    // 6. Agentic loop — up to 10 turns
    // First turn: force the model to call a tool (prevents it from just
    // describing actions in text without executing them).
    for (let turn = 0; turn < 10; turn++) {
      const response = await getOpenAI().chat.completions.create({
        model: "gpt-4.1-nano-2025-04-14",
        max_tokens: 4096,
        messages,
        tools: AI_TOOLS,
        tool_choice: turn === 0 ? "required" : "auto",
        parallel_tool_calls: false,
      });

      const choice = response.choices[0];
      const assistantMessage = choice.message;

      // Append the assistant message to conversation history
      messages.push(assistantMessage);

      // If no tool calls, the model is done
      if (!assistantMessage.tool_calls?.length) break;

      for (const toolCall of assistantMessage.tool_calls) {
        if (toolCall.type !== "function") continue;
        const toolName = toolCall.function.name;
        const input = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
        const at = new Date().toISOString();

        let toolResultContent: string;

        // ── getBoardState ───────────────────────────────────────────────────
        if (toolName === "getBoardState") {
          await writer.flush();
          const items = await boardState.getItems();
          toolResultContent = JSON.stringify(items);
          results.push({ tool: "getBoardState", count: items.length });

        // ── arrangeInGrid (fetches real object sizes) ───────────────────────
        } else if (toolName === "arrangeInGrid") {
          await writer.flush();
          const ids = input.objectIds as string[];
          const docs = await firestoreBatchGet(PROJECT_ID, token, ids.map((id) => `${itemsPath}/${id}`));
          const objectMap: BoardObjectMap = new Map();
          docs.forEach((doc, i) => { if (doc) objectMap.set(ids[i], doc as BoardItem); });

          const positions = computeGridLayout(ids, objectMap, {
            columns: (input.columns as number) || undefined,
            startX: vb.x + 40, startY: vb.y + 40, gapX: 40, gapY: 40,
          });
          for (const [id, pos] of positions) {
            writer.update(itemsPath, id, { x: pos.x, y: pos.y, updatedAt: at });
          }
          results.push({ tool: "arrangeInGrid", count: ids.length });
          toolResultContent = JSON.stringify({ success: true, arranged: ids.length });

        // ── createSWOTTemplate ──────────────────────────────────────────────
        } else if (toolName === "createSWOTTemplate") {
          // Guard: topic-specific templates must include content
          if (input.topic && !input.content) {
            toolResultContent = JSON.stringify({
              error: "Content is required when topic is specified. Call createSWOTTemplate again with the content parameter populated — provide 2-4 sticky note texts per quadrant (strengths, weaknesses, opportunities, threats).",
            });
            messages.push({ role: "tool", tool_call_id: toolCall.id, content: toolResultContent });
            continue;
          }
          usedTemplateTools = true;
          const centerX = (input.centerX as number) ?? (vb.x + vb.width / 2);
          const centerY = (input.centerY as number) ?? (vb.y + vb.height / 2);
          const topic = input.topic as string | null;
          const wrapperTitle = topic ? `SWOT Analysis — ${topic}` : "SWOT Analysis";
          const layout = computeSWOTLayout(centerX, centerY);
          const { dx, dy } = await adjustTemplatePosition(layout.frames, boardState);
          if (dx !== 0 || dy !== 0) {
            for (const frame of layout.frames) { frame.x += dx; frame.y += dy; }
          }
          const frameIds: string[] = [];
          const allStickyIds: string[] = [];
          const frameDetails: Array<{ id: string; title: string; x: number; y: number; width: number; height: number }> = [];

          const content = input.content as {
            strengths: string[]; weaknesses: string[];
            opportunities: string[]; threats: string[];
          } | null;
          const contentArrays = content
            ? [content.strengths, content.weaknesses, content.opportunities, content.threats]
            : [[], [], [], []];

          for (let fi = 0; fi < layout.frames.length; fi++) {
            const frame = layout.frames[fi];
            const id = nanoid(); frameIds.push(id);
            writer.set(itemsPath, id, {
              type: "frame", title: frame.title, x: frame.x, y: frame.y,
              width: frame.width, height: frame.height, fill: frame.color,
              createdBy: uid, updatedAt: at,
            });
            frameDetails.push({ id, title: frame.title, x: frame.x, y: frame.y, width: frame.width, height: frame.height });
            results.push({ tool: "createSWOTTemplate", id });

            const stickyIds = createStickiesInFrame(frame, contentArrays[fi] ?? [], { writer, itemsPath, uid, at });
            allStickyIds.push(...stickyIds);
            for (const sid of stickyIds) results.push({ tool: "createStickyNote", id: sid });
          }
          // Create outer wrapper frame
          const swotMinX = Math.min(...layout.frames.map(f => f.x));
          const swotMinY = Math.min(...layout.frames.map(f => f.y));
          const swotMaxX = Math.max(...layout.frames.map(f => f.x + f.width));
          const swotMaxY = Math.max(...layout.frames.map(f => f.y + f.height));
          const swotWrapperId = nanoid();
          writer.set(itemsPath, swotWrapperId, {
            type: "frame", title: wrapperTitle,
            x: swotMinX - 40, y: swotMinY - 40,
            width: (swotMaxX - swotMinX) + 80, height: (swotMaxY - swotMinY) + 80,
            createdBy: uid, updatedAt: at,
          });
          frameIds.unshift(swotWrapperId);
          results.push({ tool: "createSWOTTemplate", id: swotWrapperId });
          toolResultContent = JSON.stringify({
            success: true, frameIds, stickyIds: allStickyIds, frames: frameDetails,
            message: allStickyIds.length > 0
              ? `SWOT template created with ${frameDetails.length} frames and ${allStickyIds.length} sticky notes, all perfectly positioned.`
              : `SWOT template created with ${frameDetails.length} empty frames. Pass content to auto-populate with stickies.`,
          });

        // ── createJourneyMap ────────────────────────────────────────────────
        } else if (toolName === "createJourneyMap") {
          // Guard: topic-specific templates must include content
          if (input.topic && !input.stageContent) {
            toolResultContent = JSON.stringify({
              error: "stageContent is required when topic is specified. Call createJourneyMap again with the stageContent parameter populated — provide an array of {stickies: string[]} objects, one per stage.",
            });
            messages.push({ role: "tool", tool_call_id: toolCall.id, content: toolResultContent });
            continue;
          }
          usedTemplateTools = true;
          const stages = (input.stages as string[]) ?? ["Stage 1", "Stage 2", "Stage 3"];
          const centerX = (input.centerX as number) ?? (vb.x + vb.width / 2);
          const centerY = (input.centerY as number) ?? (vb.y + vb.height / 2);
          const topic = input.topic as string | null;
          const jmWrapperTitle = topic ? `User Journey Map — ${topic}` : "User Journey Map";
          const layout = computeJourneyMapLayout(stages, centerX, centerY);
          const { dx: jmDx, dy: jmDy } = await adjustTemplatePosition(layout.frames, boardState);
          if (jmDx !== 0 || jmDy !== 0) {
            for (const frame of layout.frames) { frame.x += jmDx; frame.y += jmDy; }
          }
          const frameIds: string[] = [];
          const allStickyIds: string[] = [];
          const frameDetails: Array<{ id: string; title: string; x: number; y: number; width: number; height: number }> = [];

          const stageContent = input.stageContent as Array<{ stickies: string[] }> | null;

          for (let fi = 0; fi < layout.frames.length; fi++) {
            const frame = layout.frames[fi];
            const id = nanoid(); frameIds.push(id);
            writer.set(itemsPath, id, {
              type: "frame", title: frame.title, x: frame.x, y: frame.y,
              width: frame.width, height: frame.height, createdBy: uid, updatedAt: at,
            });
            frameDetails.push({ id, title: frame.title, x: frame.x, y: frame.y, width: frame.width, height: frame.height });
            results.push({ tool: "createJourneyMap", id });

            const stickyTexts = stageContent?.[fi]?.stickies ?? [];
            const stickyIds = createStickiesInFrame(frame, stickyTexts, { writer, itemsPath, uid, at, color: "yellow" });
            allStickyIds.push(...stickyIds);
            for (const sid of stickyIds) results.push({ tool: "createStickyNote", id: sid });
          }
          for (const conn of layout.connectors) {
            const connId = nanoid();
            writer.set(connectorsPath, connId, {
              boardId, fromId: frameIds[conn.fromIndex], toId: frameIds[conn.toIndex],
              style: "arrow", color: "#64748B", createdBy: uid, createdAt: at,
            });
          }
          // Create outer wrapper frame
          const jmMinX = Math.min(...layout.frames.map(f => f.x));
          const jmMinY = Math.min(...layout.frames.map(f => f.y));
          const jmMaxX = Math.max(...layout.frames.map(f => f.x + f.width));
          const jmMaxY = Math.max(...layout.frames.map(f => f.y + f.height));
          const jmWrapperId = nanoid();
          writer.set(itemsPath, jmWrapperId, {
            type: "frame", title: jmWrapperTitle,
            x: jmMinX - 40, y: jmMinY - 40,
            width: (jmMaxX - jmMinX) + 80, height: (jmMaxY - jmMinY) + 80,
            createdBy: uid, updatedAt: at,
          });
          frameIds.unshift(jmWrapperId);
          results.push({ tool: "createJourneyMap", id: jmWrapperId });
          toolResultContent = JSON.stringify({
            success: true, frameIds, stickyIds: allStickyIds, frames: frameDetails,
            message: allStickyIds.length > 0
              ? `Journey map created with ${stages.length} stages and ${allStickyIds.length} sticky notes.`
              : `Journey map created with ${stages.length} empty stages. Pass stageContent to auto-populate.`,
          });

        // ── createRetroTemplate ─────────────────────────────────────────────
        } else if (toolName === "createRetroTemplate") {
          // Guard: topic-specific templates must include content
          if (input.topic && !input.content) {
            toolResultContent = JSON.stringify({
              error: "Content is required when topic is specified. Call createRetroTemplate again with the content parameter populated — provide 2-4 sticky note texts per column (wentWell, didntGoWell, actionItems).",
            });
            messages.push({ role: "tool", tool_call_id: toolCall.id, content: toolResultContent });
            continue;
          }
          usedTemplateTools = true;
          const centerX = (input.centerX as number) ?? (vb.x + vb.width / 2);
          const centerY = (input.centerY as number) ?? (vb.y + vb.height / 2);
          const topic = input.topic as string | null;
          const retroWrapperTitle = topic ? `Retrospective — ${topic}` : "Retrospective";
          const layout = computeRetroLayout(centerX, centerY);
          const { dx: retroDx, dy: retroDy } = await adjustTemplatePosition(layout.frames, boardState);
          if (retroDx !== 0 || retroDy !== 0) {
            for (const frame of layout.frames) { frame.x += retroDx; frame.y += retroDy; }
          }
          const frameIds: string[] = [];
          const allStickyIds: string[] = [];
          const frameDetails: Array<{ id: string; title: string; x: number; y: number; width: number; height: number }> = [];

          const content = input.content as {
            wentWell: string[]; didntGoWell: string[]; actionItems: string[];
          } | null;
          const contentArrays = content
            ? [content.wentWell, content.didntGoWell, content.actionItems]
            : [[], [], []];

          for (let fi = 0; fi < layout.frames.length; fi++) {
            const frame = layout.frames[fi];
            const id = nanoid(); frameIds.push(id);
            writer.set(itemsPath, id, {
              type: "frame", title: frame.title, x: frame.x, y: frame.y,
              width: frame.width, height: frame.height, fill: frame.color,
              createdBy: uid, updatedAt: at,
            });
            frameDetails.push({ id, title: frame.title, x: frame.x, y: frame.y, width: frame.width, height: frame.height });
            results.push({ tool: "createRetroTemplate", id });

            const stickyIds = createStickiesInFrame(frame, contentArrays[fi] ?? [], { writer, itemsPath, uid, at });
            allStickyIds.push(...stickyIds);
            for (const sid of stickyIds) results.push({ tool: "createStickyNote", id: sid });
          }
          // Create outer wrapper frame
          const retroMinX = Math.min(...layout.frames.map(f => f.x));
          const retroMinY = Math.min(...layout.frames.map(f => f.y));
          const retroMaxX = Math.max(...layout.frames.map(f => f.x + f.width));
          const retroMaxY = Math.max(...layout.frames.map(f => f.y + f.height));
          const retroWrapperId = nanoid();
          writer.set(itemsPath, retroWrapperId, {
            type: "frame", title: retroWrapperTitle,
            x: retroMinX - 40, y: retroMinY - 40,
            width: (retroMaxX - retroMinX) + 80, height: (retroMaxY - retroMinY) + 80,
            createdBy: uid, updatedAt: at,
          });
          frameIds.unshift(retroWrapperId);
          results.push({ tool: "createRetroTemplate", id: retroWrapperId });
          toolResultContent = JSON.stringify({
            success: true, frameIds, stickyIds: allStickyIds, frames: frameDetails,
            message: allStickyIds.length > 0
              ? `Retrospective created with 3 columns and ${allStickyIds.length} sticky notes.`
              : `Retrospective created with 3 empty columns. Pass content to auto-populate.`,
          });

        // ── All other sync tools ────────────────────────────────────────────
        } else {
          const { toolResult, action } = await executeTool(toolName, input, boardId, uid, writer, vb, boardState);
          toolResultContent = JSON.stringify(toolResult);
          results.push(action);

          // Track standalone stickies for potential auto-wrapping
          // Use returned x/y (may differ from input due to collision nudging)
          if (toolName === "createStickyNote" && action.id) {
            const result = toolResult as { x?: number; y?: number };
            const sx = result.x ?? (input.x as number) ?? (vb.x + vb.width / 2 - 100);
            const sy = result.y ?? (input.y as number) ?? (vb.y + vb.height / 2 - 100);
            standaloneStickyIds.push(action.id);
            standaloneStickyPositions.push({ id: action.id, x: sx, y: sy, w: 140, h: 140 });
          }
        }

        // Append tool result to conversation for multi-turn
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: toolResultContent,
        });
      }
    }

    // Auto-wrap standalone stickies in a frame when 2+ were created outside
    // of a template tool. This gives visual grouping to loose AI output.
    if (standaloneStickyPositions.length >= 2 && !usedTemplateTools) {
      const minX = Math.min(...standaloneStickyPositions.map(s => s.x));
      const minY = Math.min(...standaloneStickyPositions.map(s => s.y));
      const maxX = Math.max(...standaloneStickyPositions.map(s => s.x + s.w));
      const maxY = Math.max(...standaloneStickyPositions.map(s => s.y + s.h));
      const pad = 40;
      const wrapperId = nanoid();
      writer.set(itemsPath, wrapperId, {
        type: "frame",
        title: command.length > 60 ? command.slice(0, 57) + "…" : command,
        x: minX - pad, y: minY - pad,
        width: (maxX - minX) + pad * 2, height: (maxY - minY) + pad * 2,
        createdBy: uid, updatedAt: new Date().toISOString(),
      });
      results.push({ tool: "autoWrapFrame", id: wrapperId });
    }

    // Flush all remaining writes in one batch so frames + content stickies
    // arrive together (prevents empty-frame flash on the client).
    await writer.flush();

    const createdIds = results.filter((r) => r.id).map((r) => r.id as string);

    // Extract the AI's final text reply from the last assistant message
    let reply = "";
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === "assistant" && typeof msg.content === "string" && msg.content.trim()) {
        reply = msg.content.trim();
        break;
      }
    }

    return NextResponse.json({ success: true, results, createdIds, reply });

  } catch (err) {
    const message = err instanceof Error ? err.message : "AI command failed";
    console.error("[ai-command]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (reservationWritten) {
      await adminDb.doc(`${reservationsPath}/${reservationId}`).delete().catch(() => {});
    }
  }
}
