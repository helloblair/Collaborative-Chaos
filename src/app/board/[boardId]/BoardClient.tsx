"use client";

import { auth, db, rtdb } from "@/lib/firebase";
import type { BoardItem } from "@/types/board";
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { addDoc, collection, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { onDisconnect, onValue, ref, serverTimestamp as rtdbServerTimestamp, set, update } from "firebase/database";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { BoardCanvas } from "./BoardCanvas";

const STICKY_WIDTH = 192;
const STICKY_HEIGHT = 96;
const RECT_WIDTH = 200;
const RECT_HEIGHT = 120;
const RECT_FILL = "#60a5fa";

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lastBoardClick, setLastBoardClick] = useState<{ x: number; y: number } | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const boardRef = useRef<HTMLElement | null>(null);
  const localSessionId = useMemo(() => nanoid(), []);

  useEffect(() => {
    const measure = () =>
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Drag state
  const [dragState, setDragState] = useState<{
    itemId: string;
    startX: number;
    startY: number;
    itemStartX: number;
    itemStartY: number;
    localX: number;
    localY: number;
  } | null>(null);
  const justDidDragRef = useRef(false);
  const dragStateRef = useRef(dragState);
  dragStateRef.current = dragState;

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

  // A) Auth-gated Firestore: only subscribe when uid is non-null string
  useEffect(() => {
    if (typeof uid !== "string" || uid === "") {
      setBoardItems({});
      return;
    }
    const itemsRef = collection(db, "boards", boardId, "items");
    const unsubscribe = onSnapshot(itemsRef, (snapshot) => {
      const items: Record<string, BoardItem> = {};
      snapshot.docs.forEach((d) => {
        const data = d.data();
        const type = data.type === "rect" ? "rect" : "sticky";
        items[d.id] = {
          id: d.id,
          type,
          x: data.x ?? 0,
          y: data.y ?? 0,
          text: data.text ?? "",
          width: data.width,
          height: data.height,
          fill: data.fill,
          createdBy: data.createdBy ?? "",
          updatedAt: data.updatedAt,
        };
      });
      setBoardItems(items);
    });
    return unsubscribe;
  }, [boardId, uid]);

  // Compute display position: use drag local coords when dragging, else Firestore
  const getDisplayItem = useCallback(
    (item: BoardItem): BoardItem => {
      if (dragState && dragState.itemId === item.id) {
        return { ...item, x: dragState.localX, y: dragState.localY };
      }
      return item;
    },
    [dragState]
  );

  // Rectangle creation: spawn at viewport center in world coords (default transform)
  const handleAddRect = useCallback(async () => {
    if (!uid || typeof uid !== "string") return;
    setCreateError(null);
    setIsCreating(true);
    const spawnX = Math.round(viewportSize.width / 2 - RECT_WIDTH / 2);
    const spawnY = Math.round(viewportSize.height / 2 - RECT_HEIGHT / 2);
    try {
      const itemsRef = collection(db, "boards", boardId, "items");
      await addDoc(itemsRef, {
        type: "rect",
        x: spawnX,
        y: spawnY,
        width: RECT_WIDTH,
        height: RECT_HEIGHT,
        fill: RECT_FILL,
        createdBy: uid,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create rectangle";
      setCreateError(msg);
    } finally {
      setIsCreating(false);
    }
  }, [boardId, uid, viewportSize.width, viewportSize.height]);

  // B) Reliable sticky creation with try/catch and feedback
  const handleAddSticky = useCallback(async () => {
    if (!uid || typeof uid !== "string") return;
    setCreateError(null);
    setIsCreating(true);

    let spawnX: number;
    let spawnY: number;

    if (lastBoardClick) {
      spawnX = Math.max(0, lastBoardClick.x - STICKY_WIDTH / 2);
      spawnY = Math.max(0, lastBoardClick.y - STICKY_HEIGHT / 2);
    } else {
      const rect = boardRef.current?.getBoundingClientRect();
      if (rect) {
        spawnX = Math.round(rect.left + rect.width / 2 - STICKY_WIDTH / 2);
        spawnY = Math.round(rect.top + rect.height / 2 - STICKY_HEIGHT / 2);
      } else {
        spawnX = Math.round(window.innerWidth / 2 - STICKY_WIDTH / 2);
        spawnY = Math.round(window.innerHeight / 2 - STICKY_HEIGHT / 2);
      }
    }

    try {
      const itemsRef = collection(db, "boards", boardId, "items");
      await addDoc(itemsRef, {
        type: "sticky",
        x: spawnX,
        y: spawnY,
        text: "New note",
        createdBy: uid,
        updatedAt: serverTimestamp(),
      });
      setLastBoardClick(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create sticky";
      setCreateError(msg);
    } finally {
      setIsCreating(false);
    }
  }, [boardId, uid, lastBoardClick]);

  // Board background click → store position for next spawn (not on sticky or HUD)
  const handleBoardClick = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const t = e.target as HTMLElement;
    if (t.closest("[data-sticky]") || t.closest("button") || t.closest("a") || t.closest("textarea")) return;
    setLastBoardClick({ x: e.clientX, y: e.clientY });
  }, []);

  const startEditing = useCallback((item: BoardItem) => {
    setEditingId(item.id);
    setEditingText(item.text ?? "");
  }, []);

  const persistStickyText = useCallback(
    async (itemId: string) => {
      if (editingId !== itemId) return;
      const itemsRef = collection(db, "boards", boardId, "items");
      const itemRef = doc(itemsRef, itemId);
      await updateDoc(itemRef, { text: editingText, updatedAt: serverTimestamp() });
      setEditingId(null);
    },
    [boardId, editingId, editingText]
  );

  const handleStickyBlur = useCallback(
    (itemId: string) => {
      persistStickyText(itemId);
    },
    [persistStickyText]
  );

  const handleStickyKeyDown = useCallback(
    (e: React.KeyboardEvent, itemId: string) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        persistStickyText(itemId);
      }
    },
    [persistStickyText]
  );

  const draggingItemId = dragState?.itemId ?? null;

  const handleCanvasMoveEnd = useCallback(
    async (id: string, x: number, y: number) => {
      try {
        const itemsRef = collection(db, "boards", boardId, "items");
        const itemRef = doc(itemsRef, id);
        await updateDoc(itemRef, {
          x: Math.round(x),
          y: Math.round(y),
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Revert will happen via Firestore sync
      }
    },
    [boardId]
  );

  const handleTextCommit = useCallback(
    async (id: string, nextText: string) => {
      try {
        const itemsRef = collection(db, "boards", boardId, "items");
        const itemRef = doc(itemsRef, id);
        await updateDoc(itemRef, { text: nextText, updatedAt: serverTimestamp() });
      } catch {
        // Revert will happen via Firestore sync
      }
    },
    [boardId]
  );

  const itemsArray = useMemo(() => Object.values(boardItems), [boardItems]);

  // D) Drag handlers: mousedown → mousemove → mouseup (persist on drop)
  const handleStickyMouseDown = useCallback(
    (e: React.MouseEvent, item: BoardItem) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      setActiveItemId(item.id);
      setDragState({
        itemId: item.id,
        startX: e.clientX,
        startY: e.clientY,
        itemStartX: item.x,
        itemStartY: item.y,
        localX: item.x,
        localY: item.y,
      });
    },
    []
  );

  useEffect(() => {
    const current = dragStateRef.current;
    if (!current) return;

    const onMove = (e: MouseEvent) => {
      setDragState((prev) => {
        if (!prev || prev.itemId !== current.itemId) return prev;
        const dx = e.clientX - prev.startX;
        const dy = e.clientY - prev.startY;
        return {
          ...prev,
          localX: prev.itemStartX + dx,
          localY: prev.itemStartY + dy,
        };
      });
    };

    const onUp = async () => {
      const state = dragStateRef.current;
      if (!state) return;
      const { itemId, localX, localY, itemStartX, itemStartY } = state;
      const moved = Math.abs(localX - itemStartX) > 4 || Math.abs(localY - itemStartY) > 4;
      setDragState(null);

      if (moved) {
        justDidDragRef.current = true;
        try {
          const itemsRef = collection(db, "boards", boardId, "items");
          const itemRef = doc(itemsRef, itemId);
          await updateDoc(itemRef, {
            x: Math.round(localX),
            y: Math.round(localY),
            updatedAt: serverTimestamp(),
          });
        } catch {
          // Revert UI will happen via Firestore sync
        }
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [boardId, draggingItemId]);

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
      lastActive: rtdbServerTimestamp(),
    };

    set(myRef, data);

    onDisconnect(myRef).update({ isOnline: false, lastActive: rtdbServerTimestamp() });

    const interval = setInterval(() => {
      update(myRef, { lastActive: rtdbServerTimestamp(), isOnline: true });
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
        lastActive: rtdbServerTimestamp(),
        isOnline: true,
      });
    };

    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [uid, myPresencePath]);

  // E) Sort items so active/dragged renders on top; stable sort by activeItemId
  const sortedItems = useMemo(() => {
    const items = Object.values(boardItems);
    return [...items].sort((a, b) => {
      if (a.id === activeItemId) return 1;
      if (b.id === activeItemId) return -1;
      return 0;
    });
  }, [boardItems, activeItemId]);

  return (
    <main
      ref={boardRef}
      data-board-background
      className="h-screen w-screen relative overflow-hidden bg-neutral-950 text-white"
      onClick={handleBoardClick}
    >
      {viewportSize.width > 0 && viewportSize.height > 0 && (
        <BoardCanvas
          width={viewportSize.width}
          height={viewportSize.height}
          items={itemsArray}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onMoveEnd={handleCanvasMoveEnd}
          onTextCommit={handleTextCommit}
        />
      )}
      {/* E) HUD: pointer-events-none on container, pointer-events-auto on interactive elements */}
      {uid === undefined && (
        <div className="absolute top-24 left-3 z-40 pointer-events-none">
          <div className="text-sm bg-black/60 rounded px-3 py-2">Loading auth...</div>
        </div>
      )}
      {uid === null && (
        <div className="absolute top-24 left-3 z-40 pointer-events-none">
          <div className="text-sm bg-black/60 rounded px-3 py-2 space-y-2">
            <div>Not signed in on this route.</div>
            <div className="pointer-events-auto">
              <button className="underline text-blue-500 cursor-pointer" onClick={signInHere}>
                Sign in with Google
              </button>
            </div>
            <div className="opacity-70 text-xs">
              Tip: use the same URL origin (prefer{" "}
              <Link className="underline pointer-events-auto" href="http://localhost:3000">
                http://localhost:3000
              </Link>
              ).
            </div>
          </div>
        </div>
      )}

      {/* B) Error HUD - top-left */}
      {createError && uid && (
        <div className="absolute top-24 left-3 z-40 pointer-events-none">
          <div className="text-sm bg-red-900/80 text-red-100 rounded px-3 py-2 max-w-xs">
            {createError}
          </div>
        </div>
      )}

      {uid && (
        <div className="fixed bottom-6 right-6 z-30 pointer-events-none flex flex-col sm:flex-row gap-2 items-end">
          <button
            type="button"
            onClick={handleAddSticky}
            disabled={isCreating}
            className="pointer-events-auto px-4 py-2 rounded-lg shadow-lg bg-amber-400 hover:bg-amber-500 disabled:opacity-60 disabled:cursor-not-allowed text-neutral-900 font-medium text-sm transition-colors"
            aria-label="Add sticky note"
          >
            {isCreating ? "Creating…" : "Add Sticky"}
          </button>
          <button
            type="button"
            onClick={handleAddRect}
            disabled={isCreating}
            className="pointer-events-auto px-4 py-2 rounded-lg shadow-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors"
            aria-label="Add rectangle"
          >
            {isCreating ? "Creating…" : "Add Rectangle"}
          </button>
        </div>
      )}

      {/* A) Only show stickies when authenticated - DOM stickies temporarily hidden (rendered via Konva) */}
      {false && uid && sortedItems.map((item) => {
        const display = getDisplayItem(item);
        const isActive = activeItemId === item.id || (dragState?.itemId === item.id);
        return (
          <div
            key={item.id}
            data-sticky
            className="absolute w-48 min-h-24 p-3 rounded-lg shadow-lg bg-amber-100 text-neutral-900 text-sm border border-amber-200 select-none cursor-grab active:cursor-grabbing"
            style={{
              left: display.x,
              top: display.y,
              zIndex: isActive ? 25 : 10,
              pointerEvents: "auto",
            }}
            onMouseDown={(e) => handleStickyMouseDown(e, item)}
            onClick={() => {
              if (justDidDragRef.current) {
                justDidDragRef.current = false;
                return;
              }
              startEditing(item);
            }}
          >
            {editingId === item.id ? (
              <textarea
                className="w-full min-h-[4rem] resize-none bg-transparent border-none outline-none text-inherit text-sm font-inherit p-0 cursor-text"
                value={editingText}
                onChange={(e) => setEditingText(e.target.value)}
                onBlur={() => handleStickyBlur(item.id)}
                onKeyDown={(e) => handleStickyKeyDown(e, item.id)}
                autoFocus
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="block whitespace-pre-wrap cursor-text" onMouseDown={(e) => e.stopPropagation()}>
                {item.text || "Sticky"}
              </span>
            )}
          </div>
        );
      })}

      {Object.entries(presenceMap).map(([key, p]) => {
        if (!p?.isOnline) return null;
        if (uid && key.startsWith(`${uid}-`)) return null;

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
