import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { FieldValue } from "firebase-admin/firestore";
import { verifyIdToken, adminDb } from "@/lib/firebaseAdmin";
import { AI_TOOLS, SYSTEM_PROMPT } from "@/lib/aiTools";
import type { BoardItem } from "@/types/board";
import { nanoid } from "nanoid";

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

// Initialised once at module level — reused across requests
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const STICKY_COLORS: Record<string, string> = {
  yellow: "#FEF08A",
  pink: "#FBCFE8",
  blue: "#BFDBFE",
  green: "#BBF7D0",
  purple: "#E9D5FF",
  orange: "#FED7AA",
};

// ---------------------------------------------------------------------------
// Batch writer helper
// ---------------------------------------------------------------------------

/**
 * Thin wrapper around Firestore WriteBatch that tracks operation count
 * and resets itself after each flush.
 */
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

  async flush() {
    if (this.opCount > 0) {
      await this.batch.commit();
      this.batch = adminDb.batch();
      this.opCount = 0;
    }
  }
}

// ---------------------------------------------------------------------------
// Tool executor
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
      return {
        toolResult: { success: true, id },
        action: { tool: "createStickyNote", id },
      };
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
      return {
        toolResult: { success: true, id },
        action: { tool: "createFrame", id, title: input.title },
      };
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

    case "arrangeInGrid": {
      const ids = input.objectIds as string[];
      const cols = (input.columns as number) || Math.ceil(Math.sqrt(ids.length));
      const spacing = 220; // 200px object + 20px gap

      ids.forEach((id, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        writer.update(itemsPath, id, {
          x: defaultX + col * spacing,
          y: defaultY + row * spacing,
          updatedAt: at,
        });
      });

      return {
        toolResult: { success: true, arranged: ids.length },
        action: { tool: "arrangeInGrid", count: ids.length, columns: cols },
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

  // 3. Build the initial user message with viewport context
  const userContent = [
    `Viewport: x=${viewportBounds.x}, y=${viewportBounds.y}, width=${viewportBounds.width}, height=${viewportBounds.height}`,
    `Objects visible in viewport (${viewportObjects.length}):`,
    JSON.stringify(viewportObjects),
    `\nCommand: ${command}`,
  ].join("\n");

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userContent },
  ];

  const results: ActionResult[] = [];
  const writer = new BatchWriter();

  // 4. Agentic loop — run until end_turn or 10 turns max
  for (let turn = 0; turn < 10; turn++) {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages,
      tools: AI_TOOLS,
    });

    // Append assistant turn so Claude has the full conversation history
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") break;

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type !== "tool_use") continue;

      const input = block.input as Record<string, unknown>;

      if (block.name === "getBoardState") {
        // Flush pending writes first so the read reflects the latest state
        await writer.flush();

        const snap = await adminDb.collection(`boards/${boardId}/items`).get();
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(items),
        });
        results.push({ tool: "getBoardState", count: items.length });
      } else {
        const { toolResult, action } = executeTool(
          block.name,
          input,
          boardId,
          uid,
          writer,
          viewportBounds
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

  return NextResponse.json({ success: true, results });
}
