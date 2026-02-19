"use client";

import { auth, db, FIREBASE_DATABASE_URL, FIREBASE_PROJECT_ID, rtdb } from "@/lib/firebase";
import type { BoardItem } from "@/types/board";
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { useRouter, useSearchParams } from "next/navigation";
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { onDisconnect, onValue, ref, remove, serverTimestamp as rtdbServerTimestamp, set, update } from "firebase/database";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { BoardCanvas } from "./BoardCanvas";

const STICKY_SIZE = 160;
const RECT_WIDTH = 200;
const RECT_HEIGHT = 120;
const RECT_FILL = "#C6DEF1";
const SIDEBAR_WIDTH = 192; // matches Tailwind w-48

const FILL_COLORS = [
  "#C9E4DE", // mint (sticky default)
  "#C6DEF1", // sky blue (rect default)
  "#FDEBD0", // peach
  "#D5E8D4", // sage
  "#E1D5E7", // lavender
  "#FFF2CC", // yellow
  "#FFD7D7", // blush
];

const STALE_PRESENCE_MS = 20000;

type Presence = {
  name: string;
  color: string;
  cursorX: number;
  cursorY: number;
  isOnline: boolean;
  lastActive: unknown;
};

function isPresenceActive(p: Presence | null | undefined): boolean {
  if (!p || p.isOnline !== true) return false;
  const t = p.lastActive;
  if (typeof t !== "number" || Number.isNaN(t)) return false;
  return Date.now() - t < STALE_PRESENCE_MS;
}

const COLORS = ["#e11d48", "#2563eb", "#16a34a", "#f59e0b", "#9333ea"];

function pickColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

export default function BoardClient({ boardId }: { boardId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const showDebug = searchParams.get("debug") === "1";
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
  const [rtdbError, setRtdbError] = useState<string | null>(null);
  const boardRef = useRef<HTMLElement | null>(null);
  const retryRef = useRef(false);
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
      spawnX = Math.max(0, lastBoardClick.x - STICKY_SIZE / 2);
      spawnY = Math.max(0, lastBoardClick.y - STICKY_SIZE / 2);
    } else {
      const rect = boardRef.current?.getBoundingClientRect();
      if (rect) {
        spawnX = Math.round(rect.left + rect.width / 2 - STICKY_SIZE / 2);
        spawnY = Math.round(rect.top + rect.height / 2 - STICKY_SIZE / 2);
      } else {
        spawnX = Math.round(window.innerWidth / 2 - STICKY_SIZE / 2);
        spawnY = Math.round(window.innerHeight / 2 - STICKY_SIZE / 2);
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

  const handleDeleteItem = useCallback(async () => {
    if (!selectedId) return;
    try {
      const itemRef = doc(collection(db, "boards", boardId, "items"), selectedId);
      await deleteDoc(itemRef);
      setSelectedId(null);
    } catch {
      // Firestore sync will reconcile
    }
  }, [boardId, selectedId]);

  const handleColorChange = useCallback(async (color: string) => {
    if (!selectedId) return;
    try {
      const itemRef = doc(collection(db, "boards", boardId, "items"), selectedId);
      await updateDoc(itemRef, { fill: color, updatedAt: serverTimestamp() });
    } catch {
      // Firestore sync will reconcile
    }
  }, [boardId, selectedId]);

  const handleSignOut = useCallback(async () => {
    await signOut(auth);
    router.push("/");
  }, [router]);

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

  // Presence subscription: only when authenticated (same gating as Firestore)
  useEffect(() => {
    if (typeof uid !== "string" || uid === "") {
      setPresenceMap({});
      setRtdbError(null);
      return;
    }
    setRtdbError(null);
    retryRef.current = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let unsub: (() => void) | null = null;

    const subscribe = () => {
      const pRef = ref(rtdb, `presence/${boardId}`);
      unsub = onValue(
        pRef,
        (snap) => {
          const val = snap.val() as Record<string, Presence> | null;
          setPresenceMap(val ?? {});
        },
        (error) => {
          console.error("RTDB onValue error", error);
          setRtdbError(error.message);
          if (error.message.includes("permission_denied") && !retryRef.current) {
            retryRef.current = true;
            timeoutId = setTimeout(subscribe, 500);
          }
        }
      );
    };

    subscribe();

    return () => {
      if (unsub) unsub();
      if (timeoutId != null) clearTimeout(timeoutId);
    };
  }, [boardId, uid]);

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

    onDisconnect(myRef).remove();

    const interval = setInterval(() => {
      update(myRef, { lastActive: rtdbServerTimestamp(), isOnline: true });
    }, 8000);

    return () => {
      clearInterval(interval);
      try {
        remove(myRef);
      } catch {
        // best effort cleanup on unmount
      }
    };
  }, [uid, myPresencePath]);

  const handleCursorMove = useCallback(
    (worldX: number, worldY: number) => {
      if (!uid || !myPresencePath) return;
      const myRef = ref(rtdb, myPresencePath);
      update(myRef, {
        cursorX: worldX,
        cursorY: worldY,
        lastActive: rtdbServerTimestamp(),
        isOnline: true,
      });
    },
    [uid, myPresencePath]
  );

  // Delete selected item via keyboard
  useEffect(() => {
    if (!selectedId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const active = document.activeElement as HTMLElement | null;
      if (active?.tagName === "TEXTAREA" || active?.tagName === "INPUT") return;
      handleDeleteItem();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, handleDeleteItem]);

  // E) Sort items so active/dragged renders on top; stable sort by activeItemId
  const sortedItems = useMemo(() => {
    const items = Object.values(boardItems);
    return [...items].sort((a, b) => {
      if (a.id === activeItemId) return 1;
      if (b.id === activeItemId) return -1;
      return 0;
    });
  }, [boardItems, activeItemId]);

  // Unique online users by uid (one entry per user; name/color from most recently active session)
  const uniqueOnlineUsers = useMemo(() => {
    if (!presenceMap || typeof uid !== "string") return [];
    const byUid = new Map<
      string,
      Array<{ key: string; p: Presence }>
    >();
    for (const [key, p] of Object.entries(presenceMap)) {
      if (!isPresenceActive(p)) continue;
      const entryUid = key.split("-")[0];
      if (entryUid === uid) continue;
      const list = byUid.get(entryUid) ?? [];
      list.push({ key, p });
      byUid.set(entryUid, list);
    }
    const result: Array<{ uid: string; name: string; color: string }> = [];
    const lastActiveTime = (x: unknown): number =>
      typeof x === "number" && !Number.isNaN(x) ? x : 0;
    byUid.forEach((sessions, entryUid) => {
      const sorted = [...sessions].sort(
        (a, b) =>
          lastActiveTime(b.p.lastActive) - lastActiveTime(a.p.lastActive)
      );
      const chosen = sorted[0];
      result.push({
        uid: entryUid,
        name: chosen.p.name || "Anonymous",
        color: chosen.p.color,
      });
    });
    return result;
  }, [presenceMap, uid]);
  const canvasWidth = Math.max(0, viewportSize.width - SIDEBAR_WIDTH);
  const selectedItem = selectedId ? boardItems[selectedId] : null;
  const selectedItemFill = selectedItem?.fill ?? (selectedItem?.type === "rect" ? "#C6DEF1" : "#C9E4DE");

  return (
    <main
      ref={boardRef}
      data-board-background
      className="h-screen w-screen relative overflow-hidden bg-gray-50 text-gray-900"
      onClick={handleBoardClick}
    >
      {/* Left sidebar */}
      <aside className="fixed left-0 top-0 h-screen w-48 bg-white border-r border-gray-200 z-40 flex flex-col p-3 gap-2">
        {uid && (
          <>
            <button
              type="button"
              onClick={handleAddSticky}
              disabled={isCreating}
              className="w-full rounded-lg px-3 py-2 bg-white border border-gray-200 hover:bg-gray-100 disabled:opacity-60 disabled:cursor-not-allowed text-gray-700 font-medium text-sm transition-colors text-left"
              aria-label="Add sticky note"
            >
              {isCreating ? "Creating…" : "Add Sticky"}
            </button>
            <button
              type="button"
              onClick={handleAddRect}
              disabled={isCreating}
              className="w-full rounded-lg px-3 py-2 bg-white border border-gray-200 hover:bg-gray-100 disabled:opacity-60 disabled:cursor-not-allowed text-gray-700 font-medium text-sm transition-colors text-left"
              aria-label="Add rectangle"
            >
              {isCreating ? "Creating…" : "Add Rectangle"}
            </button>

            {selectedId && (
              <>
                <hr className="border-gray-200" />
                <label className="text-xs text-gray-500 font-medium px-1">Color</label>
                <div className="flex flex-wrap gap-1.5 px-1">
                  {FILL_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => handleColorChange(color)}
                      className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                      style={{
                        background: color,
                        borderColor: selectedItemFill === color ? "#374151" : "#e5e7eb",
                        boxShadow: selectedItemFill === color ? "0 0 0 2px #374151" : undefined,
                      }}
                      aria-label={`Set color ${color}`}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleDeleteItem}
                  className="w-full rounded-lg px-3 py-2 bg-white border border-red-200 hover:bg-red-50 text-red-600 font-medium text-sm transition-colors text-left"
                  aria-label="Delete selected item"
                >
                  Delete
                </button>
              </>
            )}

            <div className="px-1">
              <p className="text-xs font-medium text-gray-500 mb-1">
                Online ({uniqueOnlineUsers.length})
              </p>
              <ul className="text-xs text-gray-600 space-y-0.5">
                {uniqueOnlineUsers.map((u) => (
                  <li key={u.uid} className="truncate" title={u.name}>
                    {u.name}
                  </li>
                ))}
                {uniqueOnlineUsers.length === 0 && (
                  <li className="text-gray-400">No one else online</li>
                )}
              </ul>
            </div>
          </>
        )}

        <div className="mt-auto">
          {uid && (
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full rounded-lg px-3 py-2 bg-white border border-gray-200 hover:bg-gray-100 text-gray-500 font-medium text-sm transition-colors text-left"
            >
              Sign Out
            </button>
          )}
        </div>
      </aside>

      {/* Canvas fills viewport to the right of the sidebar */}
      <div className="absolute top-0 left-48 right-0 bottom-0 z-0">
        {canvasWidth > 0 && viewportSize.height > 0 && (
          <BoardCanvas
            width={canvasWidth}
            height={viewportSize.height}
            items={itemsArray}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onMoveEnd={handleCanvasMoveEnd}
            onTextCommit={handleTextCommit}
            presenceMap={presenceMap}
            uid={uid}
            onCursorMove={handleCursorMove}
          />
        )}
      </div>

      {uid === undefined && (
        <div className="absolute top-4 left-52 z-40 pointer-events-none">
          <div className="text-sm bg-white/95 text-gray-700 rounded-lg px-3 py-2 border border-gray-200 shadow-sm">
            Loading auth...
          </div>
        </div>
      )}
      {uid === null && (
        <div className="absolute top-4 left-52 z-40 pointer-events-none">
          <div className="text-sm bg-white/95 text-gray-700 rounded-lg px-3 py-2 space-y-2 border border-gray-200 shadow-sm max-w-xs">
            <div>Not signed in on this route.</div>
            <div className="pointer-events-auto">
              <button className="underline text-blue-600 cursor-pointer hover:text-blue-700" onClick={signInHere}>
                Sign in with Google
              </button>
            </div>
            <div className="text-gray-500 text-xs">
              Tip: use the same URL origin (prefer{" "}
              <Link className="underline pointer-events-auto" href="http://localhost:3000">
                http://localhost:3000
              </Link>
              ).
            </div>
          </div>
        </div>
      )}

      {createError && uid && (
        <div className="absolute top-4 left-52 z-40 pointer-events-none">
          <div className="text-sm bg-red-50 text-red-800 rounded-lg px-3 py-2 max-w-xs border border-red-200">
            {createError}
          </div>
        </div>
      )}

      {showDebug && (
        <div className="fixed bottom-4 right-4 z-50 bg-gray-900 text-gray-100 text-xs font-mono rounded-lg p-3 shadow-lg max-w-xs overflow-auto max-h-48">
          <div className="font-semibold text-amber-400 mb-2">RTDB debug</div>
          <div className="space-y-1">
            <div>FIREBASE_PROJECT_ID: {FIREBASE_PROJECT_ID ?? "(undefined)"}</div>
            <div>FIREBASE_DATABASE_URL: {FIREBASE_DATABASE_URL ?? "(undefined)"}</div>
            <div>boardId: {boardId}</div>
            <div>uid: {uid ?? "(null)"}</div>
            <div>myPresencePath: {myPresencePath ?? "(null)"}</div>
            <div>presenceMap.keys.length: {Object.keys(presenceMap).length}</div>
            <div>first 3 keys: {Object.keys(presenceMap).slice(0, 3).join(", ") || "(none)"}</div>
            {rtdbError && <div className="text-red-400">rtdbError: {rtdbError}</div>}
          </div>
        </div>
      )}

      {/* DOM stickies hidden — rendered via Konva */}
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

    </main>
  );
}
