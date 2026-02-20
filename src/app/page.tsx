"use client";

import { auth } from "@/lib/firebase";
import { createBoard, deleteBoard, subscribeUserBoards } from "@/lib/boards";
import { upsertUserProfile } from "@/lib/users";
import type { Board } from "@/types/board";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
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
      <div className="max-w-2xl mx-auto">
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
            className="mb-4 flex gap-2 items-center bg-white border border-gray-200 rounded-xl p-3"
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
            className="mb-4 rounded-lg px-4 py-2 bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            + New Board
          </button>
        )}

        {/* Board list */}
        {boards.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">
            No boards yet. Create one to get started.
          </div>
        ) : (
          <ul className="space-y-2">
            {boards.map((board) => (
              <li key={board.id} className="group relative">
                <Link
                  href={`/board/${board.id}`}
                  className="flex items-center gap-4 w-full rounded-xl border border-gray-200 bg-white px-5 py-4 hover:border-gray-300 hover:shadow-sm transition-all"
                >
                  {/* Avatar stack */}
                  <div className="flex -space-x-2 shrink-0">
                    {board.memberEmails.slice(0, 3).map((email, i) => (
                      <span
                        key={email}
                        title={email}
                        className="w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-white text-xs font-semibold uppercase"
                        style={{ background: avatarColor(email), zIndex: 3 - i }}
                      >
                        {email[0]}
                      </span>
                    ))}
                    {board.memberEmails.length > 3 && (
                      <span className="w-7 h-7 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-gray-600 text-xs font-medium">
                        +{board.memberEmails.length - 3}
                      </span>
                    )}
                  </div>

                  {/* Board name */}
                  <span className="flex-1 font-medium text-gray-900 truncate">
                    {board.name}
                  </span>

                  {/* Metadata */}
                  <div className="flex items-center gap-3 text-xs text-gray-400 shrink-0">
                    <span>{board.members.length} member{board.members.length !== 1 ? "s" : ""}</span>
                    <span>{relativeTime(board.updatedAt)}</span>
                    <span className="text-gray-300">Open →</span>
                  </div>
                </Link>

                {/* Delete (owner only) */}
                {user.uid === board.createdBy && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      handleDeleteBoard(board.id);
                    }}
                    disabled={deletingId === board.id}
                    title="Delete board"
                    className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity rounded-md p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:cursor-not-allowed"
                  >
                    {deletingId === board.id ? "…" : "✕"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
