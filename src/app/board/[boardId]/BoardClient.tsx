"use client";

import { auth, db, FIREBASE_DATABASE_URL, FIREBASE_PROJECT_ID, rtdb } from "@/lib/firebase";
import { getBoard, joinBoard } from "@/lib/boards";
import type { Board, BoardItem, Connector } from "@/types/board";
import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { useRouter, useSearchParams } from "next/navigation";
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
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

const TEXT_COLORS = [
  "#1c1917", // near-black (default)
  "#374151", // gray
  "#1e40af", // blue
  "#166534", // green
  "#9a3412", // orange
  "#7e22ce", // purple
  "#be123c", // rose
];

const FONT_SIZES = [12, 16, 20, 28, 40];

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
  const isInviteLink = searchParams.get("invite") === "true";
  const [uid, setUid] = useState<string | null | undefined>(undefined);
  const [boardAccess, setBoardAccess] = useState<"loading" | "ok" | "not-found" | "forbidden">("loading");
  const [boardMeta, setBoardMeta] = useState<Board | null>(null);
  const [joiningBoard, setJoiningBoard] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [presenceMap, setPresenceMap] = useState<Record<string, Presence>>({});
  const [boardItems, setBoardItems] = useState<Record<string, BoardItem>>({});
  const [connectors, setConnectors] = useState<Record<string, Connector>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<"select" | "connect" | "frame">("select");
  const [pendingFrameTitleId, setPendingFrameTitleId] = useState<string | null>(null);
  const [pendingTextEditId, setPendingTextEditId] = useState<string | null>(null);
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);
  const [lastBoardClick, setLastBoardClick] = useState<{ x: number; y: number } | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [rtdbError, setRtdbError] = useState<string | null>(null);
  const [remoteDragging, setRemoteDragging] = useState<Record<string, { x: number; y: number; userId: string; timestamp: number }>>({});
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

  const myPresencePath = uid ? `boards/${boardId}/presence/${uid}-${localSessionId}` : null;

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

  // Board membership check: runs whenever uid or boardId changes
  useEffect(() => {
    if (typeof uid !== "string") {
      setBoardAccess("loading");
      return;
    }
    setBoardAccess("loading");
    getBoard(boardId)
      .then((board) => {
        if (!board) {
          setBoardAccess("not-found");
        } else if (!board.members.includes(uid)) {
          setBoardMeta(null);
          setBoardAccess("forbidden");
        } else {
          setBoardMeta(board);
          setBoardAccess("ok");
        }
      })
      .catch(() => setBoardAccess("forbidden"));
  }, [boardId, uid]);

  const handleJoinBoard = useCallback(async () => {
    if (typeof uid !== "string") return;
    const user = auth.currentUser;
    if (!user) return;
    setJoiningBoard(true);
    try {
      await joinBoard(boardId, uid, user.email ?? "");
      // Re-fetch to confirm membership and load board meta
      const board = await getBoard(boardId);
      if (board) {
        setBoardMeta(board);
        setBoardAccess("ok");
      }
    } catch {
      // leave as forbidden — user sees error state
    } finally {
      setJoiningBoard(false);
    }
  }, [boardId, uid]);

  const handleShareLink = useCallback(() => {
    const url = `${window.location.origin}/board/${boardId}?invite=true`;
    navigator.clipboard.writeText(url).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    });
  }, [boardId]);

  // A) Auth-gated Firestore: only subscribe when uid is non-null string and access confirmed
  useEffect(() => {
    if (boardAccess !== "ok" || typeof uid !== "string" || uid === "") {
      setBoardItems({});
      return;
    }
    const itemsRef = collection(db, "boards", boardId, "items");
    const unsubscribe = onSnapshot(
      itemsRef,
      (snapshot) => {
        const items: Record<string, BoardItem> = {};
        snapshot.docs.forEach((d) => {
          const data = d.data();
          const rawType = data.type;
          const type = rawType === "rect" ? "rect" : rawType === "frame" ? "frame" : rawType === "text" ? "text" : "sticky";
          items[d.id] = {
            id: d.id,
            type,
            x: data.x ?? 0,
            y: data.y ?? 0,
            text: data.text ?? "",
            title: data.title ?? "",
            width: data.width,
            height: data.height,
            fill: data.fill,
            fontSize: data.fontSize,
            createdBy: data.createdBy ?? "",
            updatedAt: data.updatedAt,
          };
        });
        setBoardItems(items);
      },
      (err) => {
        console.error("[board] items snapshot permission error:", err.code, err.message);
      }
    );
    return unsubscribe;
  }, [boardId, uid, boardAccess]);

  // Connectors subscription
  useEffect(() => {
    if (boardAccess !== "ok" || typeof uid !== "string" || uid === "") {
      setConnectors({});
      return;
    }
    const connectorsRef = collection(db, "boards", boardId, "connectors");
    const unsubscribe = onSnapshot(
      connectorsRef,
      (snapshot) => {
        const conns: Record<string, Connector> = {};
        snapshot.docs.forEach((d) => {
          const data = d.data();
          conns[d.id] = {
            id: d.id,
            boardId,
            fromId: data.fromId ?? "",
            toId: data.toId ?? "",
            style: data.style === "line" ? "line" : "arrow",
            color: data.color ?? "#374151",
            createdBy: data.createdBy ?? "",
            createdAt: data.createdAt,
          };
        });
        setConnectors(conns);
      },
      (err) => {
        console.error("[board] connectors snapshot error:", err.code, err.message);
      }
    );
    return unsubscribe;
  }, [boardId, uid, boardAccess]);

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

  // Subscribe to other users' active drags from RTDB; filter out own entries
  useEffect(() => {
    if (boardAccess !== "ok" || typeof uid !== "string" || uid === "") {
      setRemoteDragging({});
      return;
    }
    const draggingRef = ref(rtdb, `boards/${boardId}/dragging`);
    const unsub = onValue(draggingRef, (snap) => {
      const val = snap.val() as Record<string, { x: number; y: number; userId: string; timestamp: number }> | null;
      const filtered: Record<string, { x: number; y: number; userId: string; timestamp: number }> = {};
      for (const [id, entry] of Object.entries(val ?? {})) {
        if (entry.userId !== uid) filtered[id] = entry;
      }
      setRemoteDragging(filtered);
    });
    return () => unsub();
  }, [boardId, uid, boardAccess]);

  // Delete selected item with connector cascade
  const handleDeleteItem = useCallback(async () => {
    if (!selectedId) return;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(collection(db, "boards", boardId, "items"), selectedId));
      // Cascade: delete all connectors referencing this item
      for (const conn of Object.values(connectors)) {
        if (conn.fromId === selectedId || conn.toId === selectedId) {
          batch.delete(doc(collection(db, "boards", boardId, "connectors"), conn.id));
        }
      }
      await batch.commit();
      setSelectedId(null);
    } catch {
      // Firestore sync will reconcile
    }
  }, [boardId, selectedId, connectors]);

  // Delete selected connector
  const handleDeleteConnector = useCallback(async () => {
    if (!selectedConnectorId) return;
    try {
      await deleteDoc(doc(collection(db, "boards", boardId, "connectors"), selectedConnectorId));
      setSelectedConnectorId(null);
    } catch {
      // Firestore sync will reconcile
    }
  }, [boardId, selectedConnectorId]);

  const handleColorChange = useCallback(async (color: string) => {
    if (!selectedId) return;
    try {
      const itemRef = doc(collection(db, "boards", boardId, "items"), selectedId);
      await updateDoc(itemRef, { fill: color, updatedAt: serverTimestamp() });
    } catch {
      // Firestore sync will reconcile
    }
  }, [boardId, selectedId]);

  const handleCreateFrame = useCallback(
    async (x: number, y: number, w: number, h: number) => {
      if (!uid || typeof uid !== "string") return;
      try {
        const itemsRef = collection(db, "boards", boardId, "items");
        const docRef = await addDoc(itemsRef, {
          type: "frame",
          x: Math.round(x),
          y: Math.round(y),
          width: Math.round(w),
          height: Math.round(h),
          title: "Frame",
          fill: "#6366f1",
          createdBy: uid,
          updatedAt: serverTimestamp(),
        });
        setActiveTool("select");
        setPendingFrameTitleId(docRef.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to create frame";
        setCreateError(msg);
      }
    },
    [boardId, uid]
  );

  const handleAddText = useCallback(async () => {
    if (!uid || typeof uid !== "string") return;
    setCreateError(null);
    setIsCreating(true);
    const spawnX = Math.round(viewportSize.width / 2 - 100);
    const spawnY = Math.round(viewportSize.height / 2 - 20);
    try {
      const itemsRef = collection(db, "boards", boardId, "items");
      const docRef = await addDoc(itemsRef, {
        type: "text",
        x: spawnX,
        y: spawnY,
        width: 200,
        text: "",
        fontSize: 16,
        fill: "#1c1917",
        createdBy: uid,
        updatedAt: serverTimestamp(),
      });
      setPendingTextEditId(docRef.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create text";
      setCreateError(msg);
    } finally {
      setIsCreating(false);
    }
  }, [boardId, uid, viewportSize.width, viewportSize.height]);

  const handleFontSizeChange = useCallback(async (size: number) => {
    if (!selectedId) return;
    try {
      const itemRef = doc(collection(db, "boards", boardId, "items"), selectedId);
      await updateDoc(itemRef, { fontSize: size, updatedAt: serverTimestamp() });
    } catch {
      // Firestore sync will reconcile
    }
  }, [boardId, selectedId]);

  const handleFrameTitleCommit = useCallback(
    async (id: string, title: string) => {
      try {
        const itemRef = doc(collection(db, "boards", boardId, "items"), id);
        await updateDoc(itemRef, { title, updatedAt: serverTimestamp() });
      } catch {
        // Firestore sync will reconcile
      }
    },
    [boardId]
  );

  const handleFrameTransform = useCallback(
    async (id: string, x: number, y: number, width: number, height: number) => {
      try {
        const itemRef = doc(collection(db, "boards", boardId, "items"), id);
        await updateDoc(itemRef, {
          x: Math.round(x),
          y: Math.round(y),
          width: Math.round(width),
          height: Math.round(height),
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Firestore sync will reconcile
      }
    },
    [boardId]
  );

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
  const connectorsArray = useMemo(() => Object.values(connectors), [connectors]);

  // Handle item clicks — routes by active tool
  const handleItemClick = useCallback(
    async (id: string) => {
      if (activeTool === "select") {
        setSelectedId(id);
        setSelectedConnectorId(null);
        return;
      }
      // Connect mode — frames are not connectable
      if (typeof uid !== "string" || !uid) return;
      if (boardItems[id]?.type === "frame") return;
      if (!connectSourceId) {
        setConnectSourceId(id);
      } else if (connectSourceId === id) {
        // Clicked same item — cancel source
        setConnectSourceId(null);
      } else {
        // Create connector between source and target
        try {
          await addDoc(collection(db, "boards", boardId, "connectors"), {
            fromId: connectSourceId,
            toId: id,
            style: "arrow",
            color: "#374151",
            createdBy: uid,
            createdAt: serverTimestamp(),
          });
        } catch (err) {
          console.error("[board] failed to create connector:", err);
        }
        setConnectSourceId(null);
      }
    },
    [activeTool, connectSourceId, boardId, uid, boardItems]
  );

  // Handle connector selection
  const handleSelectConnector = useCallback((id: string) => {
    setSelectedConnectorId(id);
    setSelectedId(null);
  }, []);

  // Handle canvas background click — clears selections and cancels connect source
  const handleBgClick = useCallback(() => {
    if (activeTool === "connect") {
      setConnectSourceId(null);
    }
    setSelectedConnectorId(null);
  }, [activeTool]);

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

  // Presence subscription: only when authenticated and board access confirmed
  useEffect(() => {
    if (boardAccess !== "ok" || typeof uid !== "string" || uid === "") {
      setPresenceMap({});
      setRtdbError(null);
      return;
    }
    setRtdbError(null);
    retryRef.current = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let unsub: (() => void) | null = null;

    const subscribe = () => {
      const pRef = ref(rtdb, `boards/${boardId}/presence`);
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
  }, [boardId, uid, boardAccess]);

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

  // Keyboard: Delete/Backspace to delete selection; Escape to cancel connect mode
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      if (active?.tagName === "TEXTAREA" || active?.tagName === "INPUT") return;

      if (e.key === "Escape") {
        if (activeTool === "connect") {
          setConnectSourceId(null);
        }
        if (activeTool !== "select") {
          setActiveTool("select");
        }
        setSelectedConnectorId(null);
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedId) {
          handleDeleteItem();
        } else if (selectedConnectorId) {
          handleDeleteConnector();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, selectedConnectorId, activeTool, handleDeleteItem, handleDeleteConnector]);

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
  const selectedItemFill = selectedItem?.fill ?? (
    selectedItem?.type === "text" ? "#1c1917" :
    selectedItem?.type === "rect" ? "#C6DEF1" :
    selectedItem?.type === "frame" ? "#6366f1" : "#C9E4DE"
  );
  const selectedItemFontSize = selectedItem?.fontSize ?? 16;

  return (
    <main
      ref={boardRef}
      data-board-background
      className="h-screen w-screen relative overflow-hidden bg-gray-50 text-gray-900"
      onClick={handleBoardClick}
    >
      {/* Left sidebar */}
      <aside className="fixed left-0 top-0 h-screen w-48 bg-white border-r border-gray-200 z-40 flex flex-col p-3 gap-2">
        <Link
          href="/"
          className="w-full rounded-lg px-3 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-500 font-medium text-sm transition-colors text-left"
        >
          ← My Boards
        </Link>
        {boardMeta && (
          <p className="px-1 text-xs font-semibold text-gray-700 truncate" title={boardMeta.name}>
            {boardMeta.name}
          </p>
        )}
        {uid && boardAccess === "ok" && (
          <>
            <button
              type="button"
              onClick={handleAddSticky}
              disabled={isCreating || activeTool !== "select"}
              className="w-full rounded-lg px-3 py-2 bg-white border border-gray-200 hover:bg-gray-100 disabled:opacity-60 disabled:cursor-not-allowed text-gray-700 font-medium text-sm transition-colors text-left"
              aria-label="Add sticky note"
            >
              {isCreating ? "Creating…" : "Add Sticky"}
            </button>
            <button
              type="button"
              onClick={handleAddRect}
              disabled={isCreating || activeTool !== "select"}
              className="w-full rounded-lg px-3 py-2 bg-white border border-gray-200 hover:bg-gray-100 disabled:opacity-60 disabled:cursor-not-allowed text-gray-700 font-medium text-sm transition-colors text-left"
              aria-label="Add rectangle"
            >
              {isCreating ? "Creating…" : "Add Rectangle"}
            </button>
            <button
              type="button"
              onClick={handleAddText}
              disabled={isCreating || activeTool !== "select"}
              className="w-full rounded-lg px-3 py-2 bg-white border border-gray-200 hover:bg-gray-100 disabled:opacity-60 disabled:cursor-not-allowed text-gray-700 font-medium text-sm transition-colors text-left"
              aria-label="Add text"
            >
              {isCreating ? "Creating…" : "Add Text"}
            </button>

            {/* Frame tool toggle */}
            <button
              type="button"
              onClick={() => {
                const next = activeTool === "frame" ? "select" : "frame";
                setActiveTool(next);
                setSelectedId(null);
                setSelectedConnectorId(null);
              }}
              className={`w-full rounded-lg px-3 py-2 border font-medium text-sm transition-colors text-left ${
                activeTool === "frame"
                  ? "bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700"
                  : "bg-white border-gray-200 hover:bg-gray-100 text-gray-700"
              }`}
              aria-label="Add frame"
            >
              {activeTool === "frame" ? "Click & drag…" : "Frame"}
            </button>

            {/* Connect tool toggle */}
            <button
              type="button"
              onClick={() => {
                const next = activeTool === "connect" ? "select" : "connect";
                setActiveTool(next);
                setConnectSourceId(null);
                setSelectedId(null);
                setSelectedConnectorId(null);
              }}
              className={`w-full rounded-lg px-3 py-2 border font-medium text-sm transition-colors text-left ${
                activeTool === "connect"
                  ? "bg-blue-600 border-blue-600 text-white hover:bg-blue-700"
                  : "bg-white border-gray-200 hover:bg-gray-100 text-gray-700"
              }`}
              aria-label="Connect objects"
            >
              {activeTool === "connect"
                ? connectSourceId
                  ? "Click target…"
                  : "Click source…"
                : "Connect"}
            </button>

            {selectedId && activeTool === "select" && (
              <>
                <hr className="border-gray-200" />
                {selectedItem?.type === "text" ? (
                  <>
                    <label className="text-xs text-gray-500 font-medium px-1">Text Color</label>
                    <div className="flex flex-wrap gap-1.5 px-1">
                      {TEXT_COLORS.map((color) => (
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
                          aria-label={`Set text color ${color}`}
                        />
                      ))}
                    </div>
                    <label className="text-xs text-gray-500 font-medium px-1">Size</label>
                    <div className="flex flex-wrap gap-1 px-1">
                      {FONT_SIZES.map((size) => (
                        <button
                          key={size}
                          type="button"
                          onClick={() => handleFontSizeChange(size)}
                          className={`rounded px-2 py-0.5 text-xs font-medium border transition-colors ${
                            selectedItemFontSize === size
                              ? "bg-gray-800 text-white border-gray-800"
                              : "bg-white text-gray-600 border-gray-200 hover:bg-gray-100"
                          }`}
                          aria-label={`Font size ${size}`}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
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
                  </>
                )}
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

            {selectedConnectorId && (
              <>
                <hr className="border-gray-200" />
                <p className="text-xs text-gray-500 font-medium px-1">Connector selected</p>
                <button
                  type="button"
                  onClick={handleDeleteConnector}
                  className="w-full rounded-lg px-3 py-2 bg-white border border-red-200 hover:bg-red-50 text-red-600 font-medium text-sm transition-colors text-left"
                  aria-label="Delete selected connector"
                >
                  Delete Connector
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

        <div className="mt-auto flex flex-col gap-2">
          {uid && boardAccess === "ok" && (
            <>
              <button
                type="button"
                onClick={handleShareLink}
                className="w-full rounded-lg px-3 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium text-sm transition-colors text-left"
              >
                {copyFeedback ? "Link copied!" : "Share…"}
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full rounded-lg px-3 py-2 bg-white border border-gray-200 hover:bg-gray-100 text-gray-500 font-medium text-sm transition-colors text-left"
              >
                Sign Out
              </button>
            </>
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
            onItemClick={handleItemClick}
            onTextCommit={handleTextCommit}
            presenceMap={presenceMap}
            uid={uid}
            onCursorMove={handleCursorMove}
            boardId={boardId}
            remoteDragging={remoteDragging}
            connectors={connectorsArray}
            activeTool={activeTool}
            connectSourceId={connectSourceId}
            selectedConnectorId={selectedConnectorId}
            onSelectConnector={handleSelectConnector}
            onBgClick={handleBgClick}
            onFrameCreate={handleCreateFrame}
            onFrameTitleCommit={handleFrameTitleCommit}
            onItemTransform={handleFrameTransform}
            frameTitleEditingId={pendingFrameTitleId}
            textEditingId={pendingTextEditId}
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

      {typeof uid === "string" && boardAccess === "not-found" && (
        <div className="absolute top-4 left-52 z-40 pointer-events-none">
          <div className="text-sm bg-white/95 text-gray-700 rounded-lg px-3 py-2 border border-gray-200 shadow-sm">
            Board not found.{" "}
            <Link href="/" className="underline text-blue-600 pointer-events-auto">
              Go to My Boards
            </Link>
          </div>
        </div>
      )}
      {typeof uid === "string" && boardAccess === "forbidden" && (
        <div className="absolute top-4 left-52 z-40">
          {isInviteLink ? (
            <div className="text-sm bg-white/95 text-gray-700 rounded-lg px-4 py-3 border border-gray-200 shadow-sm flex items-center gap-3">
              <span>You&apos;ve been invited to this board.</span>
              <button
                type="button"
                onClick={handleJoinBoard}
                disabled={joiningBoard}
                className="rounded-lg px-3 py-1 bg-gray-900 text-white text-xs font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                {joiningBoard ? "Joining…" : "Join Board"}
              </button>
              <Link href="/" className="text-xs text-gray-400 hover:text-gray-600 underline">
                Decline
              </Link>
            </div>
          ) : (
            <div className="text-sm bg-white/95 text-gray-700 rounded-lg px-3 py-2 border border-gray-200 shadow-sm pointer-events-none">
              You don&apos;t have access to this board.{" "}
              <Link href="/" className="underline text-blue-600 pointer-events-auto">
                Go to My Boards
              </Link>
            </div>
          )}
        </div>
      )}

      {createError && uid && boardAccess === "ok" && (
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
            <div>connectors: {connectorsArray.length}</div>
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
