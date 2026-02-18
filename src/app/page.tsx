"use client";

import { auth } from "@/lib/firebase";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export default function Home() {
  const [user, setUser] = useState(() => auth.currentUser);
  const [boardId, setBoardId] = useState("demo");
  const boardIdRef = useRef(boardId);
  boardIdRef.current = boardId;
  const router = useRouter();

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      setUser(u);
      if (u) {
        const id = (boardIdRef.current || "demo").trim();
        router.replace(`/board/${id}`);
      }
    });
    return unsub;
  }, [router]);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
    // Redirect is handled by onAuthStateChanged
  };

  const openBoard = (e: React.FormEvent) => {
    e.preventDefault();
    const id = (boardId || "demo").trim();
    router.push(`/board/${id}`);
  };

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

        <form onSubmit={openBoard} className="mt-6 flex gap-2">
          <label htmlFor="board-id" className="sr-only">
            Board ID
          </label>
          <input
            id="board-id"
            type="text"
            value={boardId}
            onChange={(e) => setBoardId(e.target.value)}
            placeholder="Board ID"
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200"
          />
          <button
            type="submit"
            className="rounded-lg px-4 py-2 border border-gray-200 bg-white text-gray-700 font-medium text-sm hover:bg-gray-50 transition-colors"
          >
            Open Board
          </button>
        </form>
      </div>
    </main>
  );
}
