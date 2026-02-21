import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { FieldValue } from "firebase-admin/firestore";
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

interface ViewportBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AiCommandRequest {
  command: string;
  boardId: string;
  viewportObjects: BoardItem[];
  viewportBounds: ViewportBounds;
}

interface ActionResult {
  tool: string;
  id?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const STICKY_COLORS: Record<string, string> = {
  yellow: "#FEF08A",
  pink: "#FBCFE8",
  blue: "#BFDBFE",
  green: "#BBF7D0",
  purple: "#E9D5FF",
  orange: "#FED7AA",
};

/** Reservations older than this are considered stale and ignored/deleted. */
const RESERVATION_TTL_MS = 30_000;

// ---------------------------------------------------------------------------
// Batch writer helper
// ---------------------------------------------------------------------------

class BatchWriter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private batch: any = adminDb.batch();
  private opCount = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  set(collectionPath: string, docId: string, data: Record<string, any>) {
    this.batch.set(adminDb.doc(`${collectionPath}/${docId}`), data);
    this.opCount++;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update(collectionPath: string, docId: string, data: Record<string, any>) {
    this.batch.update(adminDb.doc(`${collectionPath}/${docId}`), data);
    this.opCount++;
  }

  delete(collectionPath: string, docId: string) {
    this.batch.delete(adminDb.doc(`${collectionPath}/${docId}`));
    this.opCount++;
  }

  async flush() {
    if (this.opCount > 0) {
      await this.batch.commit();
      this.batch = adminDb.batch();
      this.opCount = 0;
    }
  }
}

// ---------------------------------------------------------------------------
// Synchronous tool executor (simple CRUD ops)
// ---------------------------------------------------------------------------

function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  boardId: string,
  uid: string,
  writer: BatchWriter,
  vb: ViewportBounds
): { toolResult: unknown; action: ActionResult } {
  const at = FieldValue.serverTimestamp();
  const defaultX = vb.x + 20;
  const defaultY = vb.y + 20;
  const itemsPath = `boards/${boardId}/items`;
  const connectorsPath = `boards/${boardId}/connectors`;

  switch (toolName) {
    case "createStickyNote": {
      const id = nanoid();
      const colorName = (input.color as string) || "yellow";
      writer.set(itemsPath, id, {
        type: "sticky",
        text: input.text as string,
        fill: STICKY_COLORS[colorName] ?? STICKY_COLORS.yellow,
        x: (input.x as number) ?? defaultX,
        y: (input.y as number) ?? defaultY,
        width: 200,
        height: 200,
        createdBy: uid,
        updatedAt: at,
      });
      return { toolResult: { success: true, id }, action: { tool: "createStickyNote", id } };
    }

    case "createShape": {
      const id = nanoid();
      writer.set(itemsPath, id, {
        type: "rect",
        fill: (input.color as string) || "#94A3B8",
        x: (input.x as number) ?? defaultX,
        y: (input.y as number) ?? defaultY,
        width: (input.width as number) ?? 150,
        height: (input.height as number) ?? 100,
        createdBy: uid,
        updatedAt: at,
      });
      return {
        toolResult: { success: true, id },
        action: { tool: "createShape", id, shapeType: input.type },
      };
    }

    case "createFrame": {
      const id = nanoid();
      writer.set(itemsPath, id, {
        type: "frame",
        title: input.title as string,
        x: (input.x as number) ?? defaultX,
        y: (input.y as number) ?? defaultY,
        width: (input.width as number) ?? 400,
        height: (input.height as number) ?? 300,
        createdBy: uid,
        updatedAt: at,
      });
      return { toolResult: { success: true, id }, action: { tool: "createFrame", id, title: input.title } };
    }

    case "createConnector": {
      const id = nanoid();
      writer.set(connectorsPath, id, {
        boardId,
        fromId: input.fromId as string,
        toId: input.toId as string,
        style: (input.style as string) || "arrow",
        color: "#64748B",
        createdBy: uid,
        createdAt: at,
      });
      return {
        toolResult: { success: true, id },
        action: { tool: "createConnector", id, fromId: input.fromId, toId: input.toId },
      };
    }

    case "moveObject": {
      writer.update(itemsPath, input.objectId as string, {
        x: input.x,
        y: input.y,
        updatedAt: at,
      });
      return {
        toolResult: { success: true },
        action: { tool: "moveObject", objectId: input.objectId, x: input.x, y: input.y },
      };
    }

    case "changeColor": {
      writer.update(itemsPath, input.objectId as string, {
        fill: input.color,
        updatedAt: at,
      });
      return {
        toolResult: { success: true },
        action: { tool: "changeColor", objectId: input.objectId, color: input.color },
      };
    }

    case "resizeObject": {
      writer.update(itemsPath, input.objectId as string, {
        width: input.width,
        height: input.height,
        updatedAt: at,
      });
      return {
        toolResult: { success: true },
        action: { tool: "resizeObject", objectId: input.objectId },
      };
    }

    case "updateText": {
      writer.update(itemsPath, input.objectId as string, {
        text: input.newText,
        updatedAt: at,
      });
      return {
        toolResult: { success: true },
        action: { tool: "updateText", objectId: input.objectId },
      };
    }

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
  // 1. Authenticate
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let uid: string;
  try {
    const payload = await verifyIdToken(token);
    uid = payload.uid;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse and validate body
  let body: AiCommandRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { command, boardId, viewportObjects, viewportBounds } = body;

  if (!command || !boardId || !viewportObjects || !viewportBounds) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const vb = viewportBounds;
  const itemsPath = `boards/${boardId}/items`;
  const connectorsPath = `boards/${boardId}/connectors`;
  const reservationsPath = `boards/${boardId}/reservations`;

  // 3. Reservation pattern: write a bounding-box reservation before calling the LLM.
  //    This prevents concurrent AI commands from placing objects on top of each other.
  const reservationId = nanoid();
  const now = Date.now();

  // Read + cleanup stale reservations
  const reservationsSnap = await adminDb.collection(reservationsPath).get();
  const activeReservations: Array<{ x: number; y: number; w: number; h: number }> = [];
  const staleDeletes: Promise<unknown>[] = [];

  for (const d of reservationsSnap.docs) {
    const data = d.data();
    const age = now - (data.createdAt as number ?? 0);
    if (age >= RESERVATION_TTL_MS) {
      staleDeletes.push(d.ref.delete().catch(() => {}));
    } else if (d.id !== reservationId) {
      activeReservations.push(data.area as { x: number; y: number; w: number; h: number });
    }
  }
  // Fire-and-forget stale cleanup
  if (staleDeletes.length > 0) Promise.all(staleDeletes).catch(() => {});

  // Write our own reservation
  await adminDb.doc(`${reservationsPath}/${reservationId}`).set({
    area: { x: vb.x, y: vb.y, w: vb.width, h: vb.height },
    createdAt: now,
    type: "reservation",
  });

  try {
    // 4. Build the initial user message with viewport context
    const reservationNote =
      activeReservations.length > 0
        ? `\nActive space reservations (another AI command is using these areas — avoid placing objects here):\n${JSON.stringify(activeReservations)}`
        : "";

    const userContent = [
      `Viewport: x=${vb.x}, y=${vb.y}, width=${vb.width}, height=${vb.height}`,
      `Objects visible in viewport (${viewportObjects.length}):`,
      JSON.stringify(viewportObjects),
      reservationNote,
      `\nCommand: ${command}`,
    ].join("\n");

    const messages: Anthropic.MessageParam[] = [{ role: "user", content: userContent }];

    const results: ActionResult[] = [];
    const writer = new BatchWriter();

    // 5. Agentic loop — run until end_turn or 10 turns max
    for (let turn = 0; turn < 10; turn++) {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages,
        tools: AI_TOOLS,
      });

      messages.push({ role: "assistant", content: response.content });

      if (response.stop_reason !== "tool_use") break;

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;

        const input = block.input as Record<string, unknown>;
        const at = FieldValue.serverTimestamp();

        // ── getBoardState ───────────────────────────────────────────────────
        if (block.name === "getBoardState") {
          await writer.flush();
          const snap = await adminDb.collection(itemsPath).get();
          const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(items),
          });
          results.push({ tool: "getBoardState", count: items.length });

        // ── arrangeInGrid (async: fetches real object sizes) ────────────────
        } else if (block.name === "arrangeInGrid") {
          await writer.flush();
          const ids = input.objectIds as string[];
          const cols = (input.columns as number) || undefined;

          // Fetch actual object sizes from Firestore
          const objectMap: BoardObjectMap = new Map();
          await Promise.all(
            ids.map(async (id) => {
              const snap = await adminDb.doc(`${itemsPath}/${id}`).get();
              if (snap.exists) {
                objectMap.set(id, { id, ...snap.data() } as BoardItem);
              }
            })
          );

          const positions = computeGridLayout(ids, objectMap, {
            columns: cols,
            startX: vb.x + 20,
            startY: vb.y + 20,
            gapX: 20,
            gapY: 20,
          });

          for (const [id, pos] of positions) {
            writer.update(itemsPath, id, { x: pos.x, y: pos.y, updatedAt: at });
          }

          const action: ActionResult = { tool: "arrangeInGrid", count: ids.length, columns: cols };
          results.push(action);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify({ success: true, arranged: ids.length }),
          });

        // ── createSWOTTemplate ──────────────────────────────────────────────
        } else if (block.name === "createSWOTTemplate") {
          const centerX = (input.centerX as number) ?? (vb.x + vb.width / 2);
          const centerY = (input.centerY as number) ?? (vb.y + vb.height / 2);
          const layout = computeSWOTLayout(centerX, centerY);
          const frameIds: string[] = [];

          for (const frame of layout.frames) {
            const id = nanoid();
            frameIds.push(id);
            writer.set(itemsPath, id, {
              type: "frame",
              title: frame.title,
              x: frame.x,
              y: frame.y,
              width: frame.width,
              height: frame.height,
              fill: frame.color,
              createdBy: uid,
              updatedAt: at,
            });
            results.push({ tool: "createSWOTTemplate", id });
          }

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify({ success: true, frameIds }),
          });

        // ── createJourneyMap ────────────────────────────────────────────────
        } else if (block.name === "createJourneyMap") {
          const stages = (input.stages as string[]) ?? ["Stage 1", "Stage 2", "Stage 3"];
          const centerX = (input.centerX as number) ?? (vb.x + vb.width / 2);
          const centerY = (input.centerY as number) ?? (vb.y + vb.height / 2);
          const layout = computeJourneyMapLayout(stages, centerX, centerY);
          const frameIds: string[] = [];

          for (const frame of layout.frames) {
            const id = nanoid();
            frameIds.push(id);
            writer.set(itemsPath, id, {
              type: "frame",
              title: frame.title,
              x: frame.x,
              y: frame.y,
              width: frame.width,
              height: frame.height,
              createdBy: uid,
              updatedAt: at,
            });
            results.push({ tool: "createJourneyMap", id });
          }

          // Create arrow connectors between adjacent frames
          for (const conn of layout.connectors) {
            const connId = nanoid();
            writer.set(connectorsPath, connId, {
              boardId,
              fromId: frameIds[conn.fromIndex],
              toId: frameIds[conn.toIndex],
              style: "arrow",
              color: "#64748B",
              createdBy: uid,
              createdAt: at,
            });
          }

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify({ success: true, frameIds }),
          });

        // ── createRetroTemplate ─────────────────────────────────────────────
        } else if (block.name === "createRetroTemplate") {
          const centerX = (input.centerX as number) ?? (vb.x + vb.width / 2);
          const centerY = (input.centerY as number) ?? (vb.y + vb.height / 2);
          const layout = computeRetroLayout(centerX, centerY);
          const frameIds: string[] = [];

          for (const frame of layout.frames) {
            const id = nanoid();
            frameIds.push(id);
            writer.set(itemsPath, id, {
              type: "frame",
              title: frame.title,
              x: frame.x,
              y: frame.y,
              width: frame.width,
              height: frame.height,
              fill: frame.color,
              createdBy: uid,
              updatedAt: at,
            });
            results.push({ tool: "createRetroTemplate", id });
          }

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify({ success: true, frameIds }),
          });

        // ── All other sync tools ────────────────────────────────────────────
        } else {
          const { toolResult, action } = executeTool(
            block.name,
            input,
            boardId,
            uid,
            writer,
            vb
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(toolResult),
          });
          results.push(action);
        }
      }

      // Flush all writes queued during this turn before the next LLM call
      await writer.flush();
      messages.push({ role: "user", content: toolResults });
    }

    // Collect IDs of all created objects for client-side animation
    const createdIds = results.filter((r) => r.id).map((r) => r.id as string);

    return NextResponse.json({ success: true, results, createdIds });
  } finally {
    // Always delete our reservation, even if the LLM call failed
    await adminDb.doc(`${reservationsPath}/${reservationId}`).delete().catch(() => {});
  }
}
