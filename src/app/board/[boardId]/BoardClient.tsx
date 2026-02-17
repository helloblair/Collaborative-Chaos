"use client";

import { auth, rtdb } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { onDisconnect, onValue, ref, serverTimestamp, set, update } from "firebase/database";
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
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [presenceMap, setPresenceMap] = useState<Record<string, Presence>>({});
  const localSessionId = useMemo(() => nanoid(), []);
  const myPresencePath = uid ? `presence/${boardId}/${uid}-${localSessionId}` : null;

  useEffect(() => onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null)), []);

  useEffect(() => {
    const pRef = ref(rtdb, `presence/${boardId}`);
    return onValue(pRef, (snap) => {
        const val = snap.val() as Record<string, Presence> | null;
        setPresenceMap(val ?? {});
    });
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

  if (!uid) {
    return <div className="p-6">Please sign in first.</div>;
  }

  return (
    <main className="h-screen w-screen relative overflow-hidden bg-neutral-950 text-white">
      <div className="absolute top-3 left-3 z-10 text-xs bg-black/60 rounded px-3 py-2 space-y-1">
        <div>Board: {boardId}</div>
        <div>UID: {uid ?? "null (not signed in)"}</div>
        <div>My path: {myPresencePath ?? "null"}</div>
        <div>Presence keys: {Object.keys(presenceMap).length}</div>
        <div>Online: {Object.values(presenceMap).filter((p) => p?.isOnline).length}</div>
      </div>

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
