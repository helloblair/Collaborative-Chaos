"use client";

import { auth, db, rtdb } from "@/lib/firebase";
import type { BoardItem } from "@/types/board";
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { collection, onSnapshot } from "firebase/firestore";
import { onDisconnect, onValue, ref, serverTimestamp, set, update } from "firebase/database";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";


type Presence = {
  name: string;
  color: string;
  cursorX: number;
  cursorY: number;
  isOnline: boolean;
  lastActive: unknown;
};

const COLORS = ["#e11d48", "#2563eb", "#16a34a", "#f59e0b", "#9333ea"];

function pickColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

export default function BoardClient({ boardId }: { boardId: string }) {
  const [uid, setUid] = useState<string | null | undefined>(undefined);
  const [presenceMap, setPresenceMap] = useState<Record<string, Presence>>({});
  const [boardItems, setBoardItems] = useState<Record<string, BoardItem>>({});
  const localSessionId = useMemo(() => nanoid(), []);
  const myPresencePath = uid ? `presence/${boardId}/${uid}-${localSessionId}` : null;
  
  const signInHere = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };
  
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
    });
    return unsub;
  }, []);
  

  useEffect(() => {
    const pRef = ref(rtdb, `presence/${boardId}`);
    return onValue(pRef, (snap) => {
        const val = snap.val() as Record<string, Presence> | null;
        setPresenceMap(val ?? {});
    });
  }, [boardId]);

  useEffect(() => {
    const itemsRef = collection(db, "boards", boardId, "items");
    const unsubscribe = onSnapshot(itemsRef, (snapshot) => {
      const items: Record<string, BoardItem> = {};
      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        items[doc.id] = {
          id: doc.id,
          type: "sticky",
          x: data.x ?? 0,
          y: data.y ?? 0,
          text: data.text ?? "",
          createdBy: data.createdBy ?? "",
          updatedAt: data.updatedAt,
        };
      });
      setBoardItems(items);
    });
    return unsubscribe;
  }, [boardId]);

  useEffect(() => {
    if (!uid || !myPresencePath) return;

    const user = auth.currentUser!;
    const myRef = ref(rtdb, myPresencePath);

    const data: Presence = {
      name: user.displayName || "Anonymous",
      color: pickColor(uid),
      cursorX: 0,
      cursorY: 0,
      isOnline: true,
      lastActive: serverTimestamp(),
    };

    set(myRef, data);

    onDisconnect(myRef).update({ isOnline: false, lastActive: serverTimestamp() });

    const interval = setInterval(() => {
      update(myRef, { lastActive: serverTimestamp(), isOnline: true });
    }, 8000);

    return () => clearInterval(interval);
  }, [uid, myPresencePath]);

  const lastSentRef = useRef(0);

  useEffect(() => {
    if (!uid || !myPresencePath) return;

    const myRef = ref(rtdb, myPresencePath);

    const onMove = (e: MouseEvent) => {
      const now = performance.now();
      if (now - lastSentRef.current < 40) return;
      lastSentRef.current = now;

      update(myRef, {
        cursorX: e.clientX,
        cursorY: e.clientY,
        lastActive: serverTimestamp(),
        isOnline: true,
      });
    };

    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [uid, myPresencePath]);

  return (
    <main className="h-screen w-screen relative overflow-hidden bg-neutral-950 text-white">
      {uid === undefined && (
        <div className="absolute top-24 left-3 z-10 text-sm bg-black/60 rounded px-3 py-2">
          Loading auth...
        </div>
      )}
      {uid === null && (
        <div className="absolute top-24 left-3 z-10 text-sm bg-black/60 rounded px-3 py-2 space-y-2">
          <div>Not signed in on this route.</div>
          <button className="underline text-blue-500 cursor-pointer" onClick={signInHere}>
            Sign in with Google
          </button>
          <div className="opacity-70 text-xs">
          Tip: use the same URL origin (prefer <Link className="underline" href="http://localhost:3000">http://localhost:3000</Link>).
          </div>
        </div>
      )}


      {Object.values(boardItems).map((item) => (
        <div
          key={item.id}
          className="absolute z-10 w-48 min-h-24 p-3 rounded-lg shadow-lg bg-amber-100 text-neutral-900 text-sm"
          style={{ left: item.x, top: item.y }}
        >
          {item.text || "Sticky"}
        </div>
      ))}

      {Object.entries(presenceMap).map(([key, p]) => {
        if (!p?.isOnline) return null;
        if (key.startsWith(`${uid}-`)) return null;

        return (
          <div
            key={key}
            className="absolute z-20 pointer-events-none"
            style={{ left: p.cursorX + 10, top: p.cursorY + 10 }}
          >
            <div
              className="text-[11px] px-2 py-1 rounded bg-black/70"
              style={{ color: p.color }}
            >
              {p.name}
            </div>
            <div
              className="w-2 h-2 rounded-full"
              style={{ background: p.color }}
            />
          </div>
        );
      })}
    </main>
  );
}
