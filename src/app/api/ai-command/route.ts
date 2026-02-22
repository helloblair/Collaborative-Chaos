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
  type BoardObjectMap,
} from "@/lib/layoutEngine";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ViewportBounds { x: number; y: number; width: number; height: number; }
interface AiCommandRequest { command: string; boardId: string; viewportObjects: BoardItem[]; viewportBounds: ViewportBounds; }
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
// Synchronous tool executor
// ---------------------------------------------------------------------------

function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  boardId: string,
  uid: string,
  writer: RestBatchWriter,
  vb: ViewportBounds
): { toolResult: unknown; action: ActionResult } {
  const at = new Date().toISOString();
  const defaultX = vb.x + 20;
  const defaultY = vb.y + 20;
  const itemsPath = `boards/${boardId}/items`;
  const connectorsPath = `boards/${boardId}/connectors`;

  switch (toolName) {
    case "createStickyNote": {
      const id = nanoid();
      writer.set(itemsPath, id, {
        type: "sticky",
        text: input.text as string,
        fill: STICKY_COLORS[(input.color as string) || "yellow"] ?? STICKY_COLORS.yellow,
        x: (input.x as number) ?? defaultX,
        y: (input.y as number) ?? defaultY,
        width: 200, height: 200, createdBy: uid, updatedAt: at,
      });
      return { toolResult: { success: true, id }, action: { tool: "createStickyNote", id } };
    }
    case "createShape": {
      const id = nanoid();
      const shapeTypeMap: Record<string, BoardItem["type"]> = {
        rectangle: "rect",
        circle: "circle",
        line: "line",
        heart: "heart",
      };
      const mappedType = shapeTypeMap[(input.type as string) || "rectangle"] ?? "rect";
      const defaultWidth = mappedType === "circle" ? 150 : mappedType === "heart" ? 120 : mappedType === "line" ? 200 : 150;
      const defaultHeight = mappedType === "circle" ? 150 : mappedType === "heart" ? 120 : mappedType === "line" ? 0 : 100;
      const defaultFill = mappedType === "heart" ? "#FFD7D7" : mappedType === "line" ? "#374151" : "#94A3B8";
      writer.set(itemsPath, id, {
        type: mappedType,
        fill: (input.color as string) || defaultFill,
        x: (input.x as number) ?? defaultX,
        y: (input.y as number) ?? defaultY,
        width: (input.width as number) ?? defaultWidth,
        height: (input.height as number) ?? defaultHeight,
        createdBy: uid, updatedAt: at,
      });
      return { toolResult: { success: true, id }, action: { tool: "createShape", id, shapeType: input.type } };
    }
    case "createFrame": {
      const id = nanoid();
      writer.set(itemsPath, id, {
        type: "frame", title: input.title as string,
        x: (input.x as number) ?? defaultX,
        y: (input.y as number) ?? defaultY,
        width: (input.width as number) ?? 400,
        height: (input.height as number) ?? 300,
        createdBy: uid, updatedAt: at,
      });
      return { toolResult: { success: true, id }, action: { tool: "createFrame", id, title: input.title } };
    }
    case "createConnector": {
      const id = nanoid();
      writer.set(connectorsPath, id, {
        boardId, fromId: input.fromId as string, toId: input.toId as string,
        style: (input.style as string) || "arrow", color: "#64748B",
        createdBy: uid, createdAt: at,
      });
      return { toolResult: { success: true, id }, action: { tool: "createConnector", id } };
    }
    case "moveObject":
      writer.update(itemsPath, input.objectId as string, { x: input.x, y: input.y, updatedAt: at });
      return { toolResult: { success: true }, action: { tool: "moveObject", objectId: input.objectId } };
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

  const { command, boardId, viewportObjects, viewportBounds } = body;
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

    const userContent = [
      `Viewport: x=${vb.x}, y=${vb.y}, width=${vb.width}, height=${vb.height}`,
      `Objects visible in viewport (${viewportObjects.length}):`,
      JSON.stringify(viewportObjects),
      reservationNote,
      `\nCommand: ${command}`,
    ].join("\n");

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ];
    const results: ActionResult[] = [];

    // All Firestore writes go through the REST batch writer (user ID token, no admin credentials needed)
    const writer = new RestBatchWriter(PROJECT_ID, token);

    // 6. Agentic loop — up to 10 turns
    for (let turn = 0; turn < 10; turn++) {
      const response = await getOpenAI().chat.completions.create({
        model: "gpt-4.1-nano-2025-04-14",
        max_tokens: 4096,
        messages,
        tools: AI_TOOLS,
        parallel_tool_calls: false,
      });

      const choice = response.choices[0];
      const assistantMessage = choice.message;

      // Append the assistant message to conversation history
      messages.push(assistantMessage);

      // If no tool calls, the model is done
      if (choice.finish_reason !== "tool_calls" || !assistantMessage.tool_calls?.length) break;

      for (const toolCall of assistantMessage.tool_calls) {
        if (toolCall.type !== "function") continue;
        const toolName = toolCall.function.name;
        const input = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
        const at = new Date().toISOString();

        let toolResultContent: string;

        // ── getBoardState ───────────────────────────────────────────────────
        if (toolName === "getBoardState") {
          await writer.flush();
          const items = await firestoreList(PROJECT_ID, token, itemsPath);
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
            startX: vb.x + 20, startY: vb.y + 20, gapX: 20, gapY: 20,
          });
          for (const [id, pos] of positions) {
            writer.update(itemsPath, id, { x: pos.x, y: pos.y, updatedAt: at });
          }
          results.push({ tool: "arrangeInGrid", count: ids.length });
          toolResultContent = JSON.stringify({ success: true, arranged: ids.length });

        // ── createSWOTTemplate ──────────────────────────────────────────────
        } else if (toolName === "createSWOTTemplate") {
          const centerX = (input.centerX as number) ?? (vb.x + vb.width / 2);
          const centerY = (input.centerY as number) ?? (vb.y + vb.height / 2);
          const layout = computeSWOTLayout(centerX, centerY);
          const frameIds: string[] = [];
          for (const frame of layout.frames) {
            const id = nanoid(); frameIds.push(id);
            writer.set(itemsPath, id, {
              type: "frame", title: frame.title, x: frame.x, y: frame.y,
              width: frame.width, height: frame.height, fill: frame.color,
              createdBy: uid, updatedAt: at,
            });
            results.push({ tool: "createSWOTTemplate", id });
          }
          toolResultContent = JSON.stringify({ success: true, frameIds });

        // ── createJourneyMap ────────────────────────────────────────────────
        } else if (toolName === "createJourneyMap") {
          const stages = (input.stages as string[]) ?? ["Stage 1", "Stage 2", "Stage 3"];
          const centerX = (input.centerX as number) ?? (vb.x + vb.width / 2);
          const centerY = (input.centerY as number) ?? (vb.y + vb.height / 2);
          const layout = computeJourneyMapLayout(stages, centerX, centerY);
          const frameIds: string[] = [];
          for (const frame of layout.frames) {
            const id = nanoid(); frameIds.push(id);
            writer.set(itemsPath, id, {
              type: "frame", title: frame.title, x: frame.x, y: frame.y,
              width: frame.width, height: frame.height, createdBy: uid, updatedAt: at,
            });
            results.push({ tool: "createJourneyMap", id });
          }
          for (const conn of layout.connectors) {
            const connId = nanoid();
            writer.set(connectorsPath, connId, {
              boardId, fromId: frameIds[conn.fromIndex], toId: frameIds[conn.toIndex],
              style: "arrow", color: "#64748B", createdBy: uid, createdAt: at,
            });
          }
          toolResultContent = JSON.stringify({ success: true, frameIds });

        // ── createRetroTemplate ─────────────────────────────────────────────
        } else if (toolName === "createRetroTemplate") {
          const centerX = (input.centerX as number) ?? (vb.x + vb.width / 2);
          const centerY = (input.centerY as number) ?? (vb.y + vb.height / 2);
          const layout = computeRetroLayout(centerX, centerY);
          const frameIds: string[] = [];
          for (const frame of layout.frames) {
            const id = nanoid(); frameIds.push(id);
            writer.set(itemsPath, id, {
              type: "frame", title: frame.title, x: frame.x, y: frame.y,
              width: frame.width, height: frame.height, fill: frame.color,
              createdBy: uid, updatedAt: at,
            });
            results.push({ tool: "createRetroTemplate", id });
          }
          toolResultContent = JSON.stringify({ success: true, frameIds });

        // ── All other sync tools ────────────────────────────────────────────
        } else {
          const { toolResult, action } = executeTool(toolName, input, boardId, uid, writer, vb);
          toolResultContent = JSON.stringify(toolResult);
          results.push(action);
        }

        // Append tool result to conversation for multi-turn
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: toolResultContent,
        });
      }

      await writer.flush();
    }

    const createdIds = results.filter((r) => r.id).map((r) => r.id as string);
    return NextResponse.json({ success: true, results, createdIds });

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
