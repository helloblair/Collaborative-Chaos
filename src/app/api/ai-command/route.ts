import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/firebaseAdmin";
import type { BoardItem } from "@/types/board";

interface AiCommandRequest {
  command: string;
  boardId: string;
  viewportObjects: BoardItem[];
  viewportBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export async function POST(req: NextRequest) {
  // Verify Firebase auth token from Authorization header
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await verifyIdToken(token);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse and validate request body
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

  // TODO: Add LLM calls and tool schemas here

  return NextResponse.json({ success: true, message: "API route working" });
}
