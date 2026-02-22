"use client";

import { auth, db } from "@/lib/firebase";
import { createBoard, deleteBoard, subscribeUserBoards } from "@/lib/boards";
import { upsertUserProfile } from "@/lib/users";
import type { Board, BoardItem } from "@/types/board";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { collection, onSnapshot } from "firebase/firestore";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const AVATAR_COLORS = ["#e11d48", "#2563eb", "#16a34a", "#f59e0b", "#9333ea"];

function avatarColor(email: string): string {
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function relativeTime(ts: unknown): string {
  if (!ts || typeof (ts as { toMillis?: () => number }).toMillis !== "function") return "";
  const diff = Date.now() - (ts as { toMillis: () => number }).toMillis();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// Default fill colors by item type (matches BoardCanvas defaults)
const DEFAULT_FILLS: Record<string, string> = {
  sticky: "#C9E4DE",
  rect: "#C6DEF1",
  circle: "#C6DEF1",
  heart: "#FFD7D7",
  line: "#374151",
  frame: "#6366f1",
  text: "#1c1917",
};

const DEFAULT_SIZES: Record<string, { w: number; h: number }> = {
  sticky: { w: 160, h: 160 },
  rect: { w: 200, h: 120 },
  circle: { w: 150, h: 150 },
  heart: { w: 120, h: 120 },
  line: { w: 200, h: 4 },
  frame: { w: 300, h: 200 },
  text: { w: 200, h: 30 },
};

// Deterministic rotation per board ID (-2deg to +2deg)
function polaroidRotation(boardId: string): number {
  let h = 0;
  for (let i = 0; i < boardId.length; i++) h = (h * 31 + boardId.charCodeAt(i)) >>> 0;
  return ((h % 500) / 500) * 4 - 2; // range: -2 to +2
}

function BoardThumbnail({ boardId }: { boardId: string }) {
  const [items, setItems] = useState<BoardItem[]>([]);

  useEffect(() => {
    const itemsRef = collection(db, "boards", boardId, "items");
    return onSnapshot(
      itemsRef,
      (snap) => {
        setItems(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              type: data.type ?? "sticky",
              x: data.x ?? 0,
              y: data.y ?? 0,
              width: data.width,
              height: data.height,
              fill: data.fill,
              createdBy: data.createdBy ?? "",
            } as BoardItem;
          })
        );
      },
      () => {
        // Permission denied or other error — show empty
        setItems([]);
      }
    );
  }, [boardId]);

  if (items.length === 0) {
    return (
      <div className="w-full h-full bg-gray-100 flex items-center justify-center rounded-sm">
        <span className="text-xs text-gray-400 select-none">Empty board</span>
      </div>
    );
  }

  // Compute bounding box of all items, then scale to fit
  const rects = items.map((item) => {
    const w = item.width ?? DEFAULT_SIZES[item.type]?.w ?? 160;
    const h = item.height ?? DEFAULT_SIZES[item.type]?.h ?? 160;
    return { x: item.x, y: item.y, w, h, type: item.type, fill: item.fill };
  });

  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.w));
  const maxY = Math.max(...rects.map((r) => r.y + r.h));
  const bboxW = maxX - minX || 1;
  const bboxH = maxY - minY || 1;

  // SVG viewBox with 5% padding
  const pad = Math.max(bboxW, bboxH) * 0.05;
  const viewBox = `${minX - pad} ${minY - pad} ${bboxW + pad * 2} ${bboxH + pad * 2}`;

  return (
    <svg viewBox={viewBox} className="w-full h-full rounded-sm bg-gray-50" preserveAspectRatio="xMidYMid meet">
      {rects.map((r, i) => {
        const fill = r.fill ?? DEFAULT_FILLS[r.type] ?? "#C9E4DE";
        if (r.type === "circle") {
          return (
            <ellipse
              key={i}
              cx={r.x + r.w / 2}
              cy={r.y + r.h / 2}
              rx={r.w / 2}
              ry={r.h / 2}
              fill={fill}
              opacity={0.85}
            />
          );
        }
        if (r.type === "heart") {
          return (
            <ellipse
              key={i}
              cx={r.x + r.w / 2}
              cy={r.y + r.h / 2}
              rx={r.w / 2}
              ry={r.h / 2}
              fill={fill}
              opacity={0.85}
            />
          );
        }
        if (r.type === "line") {
          return (
            <line
              key={i}
              x1={r.x}
              y1={r.y + r.h / 2}
              x2={r.x + r.w}
              y2={r.y + r.h / 2}
              stroke={fill}
              strokeWidth={Math.max(3, bboxW * 0.004)}
            />
          );
        }
        if (r.type === "frame") {
          return (
            <rect
              key={i}
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              fill="none"
              stroke={fill}
              strokeWidth={Math.max(2, bboxW * 0.003)}
              strokeDasharray={`${bboxW * 0.01} ${bboxW * 0.005}`}
              opacity={0.6}
              rx={2}
            />
          );
        }
        if (r.type === "text") {
          return (
            <rect
              key={i}
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              fill={fill}
              opacity={0.25}
              rx={2}
            />
          );
        }
        // sticky, rect — solid rounded rect
        return (
          <rect
            key={i}
            x={r.x}
            y={r.y}
            width={r.w}
            height={r.h}
            fill={fill}
            rx={r.type === "sticky" ? 6 : 3}
            opacity={0.85}
          />
        );
      })}
    </svg>
  );
}

export default function Home() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [boards, setBoards] = useState<Board[]>([]);
  const [showNewBoard, setShowNewBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const router = useRouter();
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        upsertUserProfile(u).catch(console.error);
      }
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setBoards([]);
      return;
    }
    return subscribeUserBoards(user.uid, setBoards);
  }, [user]);

  useEffect(() => {
    if (showNewBoard) nameInputRef.current?.focus();
  }, [showNewBoard]);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const handleCreateBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newBoardName.trim()) return;
    setCreating(true);
    try {
      const id = await createBoard(newBoardName.trim(), user.uid, user.email ?? "");
      router.push(`/board/${id}`);
    } finally {
      setCreating(false);
    }
  };

  const cancelNewBoard = () => {
    setShowNewBoard(false);
    setNewBoardName("");
  };

  const handleDeleteBoard = async (boardId: string) => {
    if (!window.confirm("Delete this board? This cannot be undone.")) return;
    setDeletingId(boardId);
    try {
      await deleteBoard(boardId);
    } catch (err) {
      console.error("Failed to delete board:", err);
    } finally {
      setDeletingId(null);
    }
  };

  if (user === undefined) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-sm text-gray-400">Loading...</div>
      </main>
    );
  }

  if (user === null) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-sm p-8">
          <h1 className="text-2xl font-semibold text-gray-900 mb-1">
            Collaborative Chaos
          </h1>
          <p className="text-gray-500 text-sm mb-6">
            A shared canvas for sticky notes and shapes.
          </p>
          <button
            type="button"
            onClick={login}
            className="w-full rounded-lg px-4 py-3 bg-gray-900 text-white font-medium text-sm hover:bg-gray-800 transition-colors"
          >
            Sign in with Google
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">My Boards</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 truncate max-w-[180px]">
              {user.displayName ?? user.email}
            </span>
            <button
              type="button"
              onClick={() => signOut(auth)}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>

        {/* New board form */}
        {showNewBoard ? (
          <form
            onSubmit={handleCreateBoard}
            className="mb-6 flex gap-2 items-center bg-white border border-gray-200 rounded-xl p-3"
          >
            <input
              ref={nameInputRef}
              type="text"
              value={newBoardName}
              onChange={(e) => setNewBoardName(e.target.value)}
              placeholder="Board name"
              className="flex-1 text-sm text-gray-900 placeholder-gray-400 focus:outline-none bg-transparent"
              disabled={creating}
            />
            <button
              type="submit"
              disabled={creating || !newBoardName.trim()}
              className="rounded-lg px-3 py-1.5 bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {creating ? "Creating…" : "Create"}
            </button>
            <button
              type="button"
              onClick={cancelNewBoard}
              disabled={creating}
              className="rounded-lg px-3 py-1.5 border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setShowNewBoard(true)}
            className="mb-6 rounded-lg px-4 py-2 bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            + New Board
          </button>
        )}

        {/* Board grid — polaroid cards */}
        {boards.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">
            No boards yet. Create one to get started.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {boards.map((board) => {
              const rotation = polaroidRotation(board.id);
              return (
                <div key={board.id} className="group relative">
                  <Link
                    href={`/board/${board.id}`}
                    className="block bg-white rounded-md p-2.5 pb-5 shadow-md hover:shadow-xl transition-all duration-200 ease-out"
                    style={{
                      transform: `rotate(${rotation}deg)`,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "rotate(0deg) translateY(-4px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = `rotate(${rotation}deg)`;
                    }}
                  >
                    {/* Board name — top label */}
                    <p
                      className="text-sm font-semibold text-gray-800 truncate mb-2 px-0.5"
                      style={{ fontStyle: "italic" }}
                      title={board.name}
                    >
                      {board.name}
                    </p>

                    {/* Thumbnail preview area */}
                    <div className="aspect-[4/3] w-full overflow-hidden rounded-sm bg-gray-100">
                      <BoardThumbnail boardId={board.id} />
                    </div>

                    {/* Bottom metadata */}
                    <div className="mt-2.5 flex items-center gap-2 px-0.5">
                      {/* Avatar stack */}
                      <div className="flex -space-x-1.5 shrink-0">
                        {board.memberEmails.slice(0, 3).map((email, i) => (
                          <span
                            key={email}
                            title={email}
                            className="w-5 h-5 rounded-full border-2 border-white flex items-center justify-center text-white text-[9px] font-semibold uppercase"
                            style={{ background: avatarColor(email), zIndex: 3 - i }}
                          >
                            {email[0]}
                          </span>
                        ))}
                        {board.memberEmails.length > 3 && (
                          <span className="w-5 h-5 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-gray-600 text-[9px] font-medium">
                            +{board.memberEmails.length - 3}
                          </span>
                        )}
                      </div>

                      <span className="text-[10px] text-gray-400 truncate">
                        {board.members.length} member{board.members.length !== 1 ? "s" : ""}
                        {relativeTime(board.updatedAt) ? ` · ${relativeTime(board.updatedAt)}` : ""}
                      </span>
                    </div>
                  </Link>

                  {/* Delete (owner only) — top-right corner on hover */}
                  {user.uid === board.createdBy && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDeleteBoard(board.id);
                      }}
                      disabled={deletingId === board.id}
                      title="Delete board"
                      className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity rounded-full w-6 h-6 flex items-center justify-center bg-white border border-gray-200 shadow-sm text-gray-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 disabled:cursor-not-allowed text-xs z-10"
                    >
                      {deletingId === board.id ? "…" : "✕"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
