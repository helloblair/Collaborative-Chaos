"use client";

import type { BoardItem, Connector } from "@/types/board";
import type Konva from "konva";
import { Arrow, Circle, Group, Layer, Line, Rect, Stage, Text, Transformer } from "react-konva";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDragBroadcast } from "@/hooks/useDragBroadcast";

const STICKY_SIZE = 160;
const STICKY_PADDING = 12;
const SCALE_BY = 1.05;
const MIN_SCALE = 0.4;
const MAX_SCALE = 2.5;
/** World extent for background and grid so they persist when panning/zooming (layer coords) */
const WORLD_HALF = 20000;
const GRID_STEP = 40;
const CURSOR_THROTTLE_MS = 40;
const STALE_PRESENCE_MS = 20000;
const FRAME_LABEL_H = 26;
const FRAME_MIN_SIZE = 80;
const ITEM_MIN_SIZE = 40;

export type PresenceEntry = {
  name: string;
  color: string;
  cursorX: number;
  cursorY: number;
  isOnline: boolean;
  lastActive?: unknown;
};

export type DraggingEntry = {
  x: number;
  y: number;
  userId: string;
  timestamp: number;
};

function isPresenceActive(p: PresenceEntry | null | undefined): boolean {
  if (!p || p.isOnline !== true) return false;
  const t = p.lastActive;
  if (typeof t !== "number" || Number.isNaN(t)) return false;
  return Date.now() - t < STALE_PRESENCE_MS;
}

// ─── Connector geometry helpers ───────────────────────────────────────────────

function getItemBounds(item: BoardItem): { x: number; y: number; w: number; h: number } {
  return {
    x: item.x,
    y: item.y,
    w: item.width ?? (item.type === "rect" ? 200 : item.type === "frame" ? 300 : STICKY_SIZE),
    h: item.height ?? (item.type === "rect" ? 120 : item.type === "frame" ? 200 : item.type === "text" ? (item.fontSize ?? 16) * 2 : STICKY_SIZE),
  };
}

function getEdgePoint(
  rect: { x: number; y: number; w: number; h: number },
  targetCenter: { x: number; y: number }
): { x: number; y: number } {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const dx = targetCenter.x - cx;
  const dy = targetCenter.y - cy;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  if (absDx === 0 && absDy === 0) return { x: cx, y: cy };
  if (absDx * rect.h > absDy * rect.w) {
    const sign = Math.sign(dx);
    return { x: cx + sign * rect.w / 2, y: cy + dy * (rect.w / 2) / absDx };
  } else {
    const sign = Math.sign(dy);
    return { x: cx + dx * (rect.h / 2) / absDy, y: cy + sign * rect.h / 2 };
  }
}

// ─── ConnectorLine sub-component ─────────────────────────────────────────────

type ConnectorLineProps = {
  conn: Connector;
  fromItem: BoardItem;
  toItem: BoardItem;
  isSelected: boolean;
  onSelect: (id: string) => void;
};

function ConnectorLine({ conn, fromItem, toItem, isSelected, onSelect }: ConnectorLineProps) {
  const fromBounds = getItemBounds(fromItem);
  const toBounds = getItemBounds(toItem);
  const fromCenter = { x: fromBounds.x + fromBounds.w / 2, y: fromBounds.y + fromBounds.h / 2 };
  const toCenter = { x: toBounds.x + toBounds.w / 2, y: toBounds.y + toBounds.h / 2 };
  const fromPt = getEdgePoint(fromBounds, toCenter);
  const toPt = getEdgePoint(toBounds, fromCenter);

  const stroke = isSelected ? "#f59e0b" : conn.color;
  const strokeWidth = isSelected ? 3 : 2;
  const pts = [fromPt.x, fromPt.y, toPt.x, toPt.y];

  if (conn.style === "arrow") {
    return (
      <Arrow
        points={pts}
        stroke={stroke}
        fill={stroke}
        strokeWidth={strokeWidth}
        pointerLength={10}
        pointerWidth={8}
        hitStrokeWidth={12}
        onClick={() => onSelect(conn.id)}
      />
    );
  }
  return (
    <Line
      points={pts}
      stroke={stroke}
      strokeWidth={strokeWidth}
      hitStrokeWidth={12}
      onClick={() => onSelect(conn.id)}
    />
  );
}

// ─── Per-item sub-components (allow calling useDragBroadcast per item) ────────

type RectItemProps = {
  item: BoardItem;
  isSelected: boolean;
  isConnectSource: boolean;
  onSelect: (id: string) => void;
  onItemClick?: (id: string) => void;
  boardId: string;
  uid: string | null | undefined;
  isRemoteDragging: boolean;
  activeTool: "select" | "connect" | "frame";
  onLocalDragMove: (id: string, x: number, y: number) => void;
  onLocalDragEnd: (id: string) => void;
  onGroupMount: (id: string, node: Konva.Group | null) => void;
  onTransformEnd: (id: string, x: number, y: number, width: number, height: number, rotation: number) => void;
};

function RectItem({
  item,
  isSelected,
  isConnectSource,
  onSelect,
  onItemClick,
  boardId,
  uid,
  isRemoteDragging,
  activeTool,
  onLocalDragMove,
  onLocalDragEnd,
  onGroupMount,
  onTransformEnd,
}: RectItemProps) {
  const { onDragMove, onDragEnd } = useDragBroadcast(boardId, item.id, uid);
  const groupRef = useRef<Konva.Group | null>(null);
  const w = item.width ?? 200;
  const h = item.height ?? 120;
  const fill = item.fill ?? "#C6DEF1";

  useEffect(() => {
    onGroupMount(item.id, groupRef.current);
    return () => { onGroupMount(item.id, null); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  return (
    <Group
      ref={(node) => { groupRef.current = node; }}
      x={item.x}
      y={item.y}
      rotation={item.rotation ?? 0}
      draggable={!isRemoteDragging && activeTool === "select"}
      onDragStart={() => onSelect(item.id)}
      onClick={() => {
        if (activeTool !== "connect") onSelect(item.id);
        onItemClick?.(item.id);
      }}
      onDragMove={(e) => {
        onDragMove(e.target.x(), e.target.y());
        onLocalDragMove(item.id, e.target.x(), e.target.y());
      }}
      onDragEnd={(e) => {
        onDragEnd(e.target.x(), e.target.y());
        onLocalDragEnd(item.id);
      }}
      onTransformEnd={() => {
        const node = groupRef.current;
        if (!node) return;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();
        node.scaleX(1);
        node.scaleY(1);
        onTransformEnd(
          item.id,
          node.x(),
          node.y(),
          Math.max(ITEM_MIN_SIZE, Math.round(w * scaleX)),
          Math.max(ITEM_MIN_SIZE, Math.round(h * scaleY)),
          node.rotation(),
        );
      }}
    >
      <Rect
        width={w}
        height={h}
        fill={fill}
        stroke={isConnectSource ? "#2563eb" : isSelected ? "#f59e0b" : undefined}
        strokeWidth={isConnectSource || isSelected ? 2 : 0}
        shadowColor="black"
        shadowBlur={8}
        shadowOpacity={0.2}
      />
    </Group>
  );
}

type StickyItemProps = {
  item: BoardItem;
  isSelected: boolean;
  isConnectSource: boolean;
  isEditing: boolean;
  onSelect: (id: string) => void;
  onItemClick?: (id: string) => void;
  onDblClick: (item: BoardItem) => void;
  boardId: string;
  uid: string | null | undefined;
  isRemoteDragging: boolean;
  activeTool: "select" | "connect" | "frame";
  onLocalDragMove: (id: string, x: number, y: number) => void;
  onLocalDragEnd: (id: string) => void;
  onGroupMount: (id: string, node: Konva.Group | null) => void;
  onTransformEnd: (id: string, x: number, y: number, width: number, height: number, rotation: number) => void;
};

function StickyItem({
  item,
  isSelected,
  isConnectSource,
  isEditing,
  onSelect,
  onItemClick,
  onDblClick,
  boardId,
  uid,
  isRemoteDragging,
  activeTool,
  onLocalDragMove,
  onLocalDragEnd,
  onGroupMount,
  onTransformEnd,
}: StickyItemProps) {
  const { onDragMove, onDragEnd } = useDragBroadcast(boardId, item.id, uid);
  const groupRef = useRef<Konva.Group | null>(null);
  const w = item.width ?? STICKY_SIZE;
  const h = item.height ?? STICKY_SIZE;
  const fill = item.fill ?? "#C9E4DE";

  useEffect(() => {
    onGroupMount(item.id, groupRef.current);
    return () => { onGroupMount(item.id, null); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  return (
    <Group
      ref={(node) => { groupRef.current = node; }}
      x={item.x}
      y={item.y}
      rotation={item.rotation ?? 0}
      draggable={!isEditing && !isRemoteDragging && activeTool === "select"}
      onDragStart={() => onSelect(item.id)}
      onClick={() => {
        if (activeTool !== "connect") onSelect(item.id);
        onItemClick?.(item.id);
      }}
      onDblClick={() => activeTool !== "connect" && onDblClick(item)}
      onDragMove={(e) => {
        onDragMove(e.target.x(), e.target.y());
        onLocalDragMove(item.id, e.target.x(), e.target.y());
      }}
      onDragEnd={(e) => {
        onDragEnd(e.target.x(), e.target.y());
        onLocalDragEnd(item.id);
      }}
      onTransformEnd={() => {
        const node = groupRef.current;
        if (!node) return;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();
        node.scaleX(1);
        node.scaleY(1);
        onTransformEnd(
          item.id,
          node.x(),
          node.y(),
          Math.max(ITEM_MIN_SIZE, Math.round(w * scaleX)),
          Math.max(ITEM_MIN_SIZE, Math.round(h * scaleY)),
          node.rotation(),
        );
      }}
    >
      <Rect
        width={w}
        height={h}
        fill={fill}
        cornerRadius={8}
        stroke={isConnectSource ? "#2563eb" : isSelected ? "#f59e0b" : undefined}
        strokeWidth={isConnectSource || isSelected ? 2 : 0}
        shadowColor="black"
        shadowBlur={8}
        shadowOpacity={0.2}
      />
      <Text
        x={STICKY_PADDING}
        y={STICKY_PADDING}
        width={w - STICKY_PADDING * 2}
        height={h - STICKY_PADDING * 2}
        text={item.text ?? "Sticky"}
        fontSize={14}
        fontFamily="sans-serif"
        fill="#1c1917"
        listening={false}
        wrap="word"
      />
    </Group>
  );
}

// ─── TextItem sub-component ───────────────────────────────────────────────────

type TextItemProps = {
  item: BoardItem;
  isSelected: boolean;
  isConnectSource: boolean;
  isEditing: boolean;
  onSelect: (id: string) => void;
  onItemClick?: (id: string) => void;
  onDblClick: (item: BoardItem) => void;
  boardId: string;
  uid: string | null | undefined;
  isRemoteDragging: boolean;
  activeTool: "select" | "connect" | "frame";
  onLocalDragMove: (id: string, x: number, y: number) => void;
  onLocalDragEnd: (id: string) => void;
  onGroupMount: (id: string, node: Konva.Group | null) => void;
  onTransformEnd: (id: string, x: number, y: number, width: number, height: number, rotation: number) => void;
};

function TextItem({
  item,
  isSelected,
  isConnectSource,
  isEditing,
  onSelect,
  onItemClick,
  onDblClick,
  boardId,
  uid,
  isRemoteDragging,
  activeTool,
  onLocalDragMove,
  onLocalDragEnd,
  onGroupMount,
  onTransformEnd,
}: TextItemProps) {
  const { onDragMove, onDragEnd } = useDragBroadcast(boardId, item.id, uid);
  const groupRef = useRef<Konva.Group | null>(null);
  const textNodeRef = useRef<Konva.Text | null>(null);
  const [textH, setTextH] = useState(24);
  const w = item.width ?? 200;
  const fontSize = item.fontSize ?? 16;
  const fill = item.fill ?? "#1c1917";

  useEffect(() => {
    onGroupMount(item.id, groupRef.current);
    return () => { onGroupMount(item.id, null); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  // Track rendered text height after each render so the hit/selection rect stays accurate
  useEffect(() => {
    const node = textNodeRef.current;
    if (node) {
      const h = Math.max(fontSize * 1.5, node.height());
      if (h !== textH) setTextH(h);
    }
  });

  return (
    <Group
      ref={(node) => { groupRef.current = node; }}
      x={item.x}
      y={item.y}
      rotation={item.rotation ?? 0}
      draggable={!isEditing && !isRemoteDragging && activeTool === "select"}
      onDragStart={() => onSelect(item.id)}
      onClick={() => {
        if (activeTool !== "connect") onSelect(item.id);
        onItemClick?.(item.id);
      }}
      onDblClick={() => activeTool !== "connect" && onDblClick(item)}
      onDragMove={(e) => {
        onDragMove(e.target.x(), e.target.y());
        onLocalDragMove(item.id, e.target.x(), e.target.y());
      }}
      onDragEnd={(e) => {
        onDragEnd(e.target.x(), e.target.y());
        onLocalDragEnd(item.id);
      }}
      onTransformEnd={() => {
        const node = groupRef.current;
        if (!node) return;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();
        node.scaleX(1);
        node.scaleY(1);
        onTransformEnd(
          item.id,
          node.x(),
          node.y(),
          Math.max(ITEM_MIN_SIZE, Math.round(w * scaleX)),
          Math.max(ITEM_MIN_SIZE, Math.round(textH * scaleY)),
          node.rotation(),
        );
      }}
    >
      {/* Transparent hit area + selection ring */}
      <Rect
        width={w}
        height={textH}
        fill="transparent"
        stroke={isConnectSource ? "#2563eb" : isSelected ? "#f59e0b" : "transparent"}
        strokeWidth={isConnectSource || isSelected ? 1.5 : 0}
        dash={isSelected ? [4, 3] : undefined}
        cornerRadius={2}
      />
      {/* Text content — hidden while HTML textarea is active to avoid overlap */}
      <Text
        ref={(node) => { textNodeRef.current = node; }}
        width={w}
        text={item.text || "Text"}
        fontSize={fontSize}
        fontFamily="sans-serif"
        fill={isEditing ? "rgba(0,0,0,0)" : fill}
        wrap="word"
        lineHeight={1.4}
        listening={false}
      />
    </Group>
  );
}

// ─── FrameItem sub-component ──────────────────────────────────────────────────

type FrameItemProps = {
  item: BoardItem;
  isSelected: boolean;
  onSelect: (id: string) => void;
  boardId: string;
  uid: string | null | undefined;
  isRemoteDragging: boolean;
  activeTool: "select" | "connect" | "frame";
  onLocalDragMove: (id: string, x: number, y: number) => void;
  onLocalDragEnd: (id: string) => void;
  onDblClick: (item: BoardItem) => void;
  onGroupMount: (id: string, node: Konva.Group | null) => void;
  onTransformEnd: (id: string, x: number, y: number, width: number, height: number, rotation: number) => void;
};

function FrameItem({
  item,
  isSelected,
  onSelect,
  boardId,
  uid,
  isRemoteDragging,
  activeTool,
  onLocalDragMove,
  onLocalDragEnd,
  onDblClick,
  onGroupMount,
  onTransformEnd,
}: FrameItemProps) {
  const { onDragMove, onDragEnd } = useDragBroadcast(boardId, item.id, uid);
  const groupRef = useRef<Konva.Group | null>(null);
  const w = item.width ?? 300;
  const h = item.height ?? 200;
  const borderColor = item.fill ?? "#6366f1";

  useEffect(() => {
    onGroupMount(item.id, groupRef.current);
    return () => { onGroupMount(item.id, null); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  return (
    <Group
      ref={(node) => { groupRef.current = node; }}
      x={item.x}
      y={item.y}
      draggable={!isRemoteDragging && activeTool === "select"}
      onDragStart={() => onSelect(item.id)}
      onClick={() => {
        if (activeTool === "select") onSelect(item.id);
      }}
      onDblClick={() => activeTool === "select" && onDblClick(item)}
      onDragMove={(e) => {
        onDragMove(e.target.x(), e.target.y());
        onLocalDragMove(item.id, e.target.x(), e.target.y());
      }}
      onDragEnd={(e) => {
        onDragEnd(e.target.x(), e.target.y());
        onLocalDragEnd(item.id);
      }}
      onTransformEnd={() => {
        const node = groupRef.current;
        if (!node) return;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();
        node.scaleX(1);
        node.scaleY(1);
        onTransformEnd(
          item.id,
          node.x(),
          node.y(),
          Math.max(FRAME_MIN_SIZE, Math.round(w * scaleX)),
          Math.max(FRAME_MIN_SIZE, Math.round(h * scaleY)),
          0,
        );
      }}
    >
      {/* Main frame rect */}
      <Rect
        width={w}
        height={h}
        fill="rgba(255,255,255,0.06)"
        stroke={isSelected ? "#f59e0b" : borderColor}
        strokeWidth={2}
        cornerRadius={4}
        dash={isSelected ? undefined : [10, 5]}
      />
      {/* Title bar at top */}
      <Rect
        width={w}
        height={FRAME_LABEL_H}
        fill={isSelected ? "#f59e0b" : borderColor}
        opacity={0.9}
        cornerRadius={[4, 4, 0, 0]}
        listening={false}
      />
      <Text
        x={8}
        y={(FRAME_LABEL_H - 13) / 2}
        width={w - 16}
        height={FRAME_LABEL_H}
        text={item.title ?? "Frame"}
        fontSize={13}
        fontFamily="sans-serif"
        fill="#ffffff"
        fontStyle="600"
        ellipsis={true}
        listening={false}
      />
    </Group>
  );
}

// ─── Main canvas component ────────────────────────────────────────────────────

export type BoardCanvasProps = {
  width: number;
  height: number;
  items: BoardItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onItemClick?: (id: string) => void;
  onTextCommit: (id: string, nextText: string) => void;
  presenceMap?: Record<string, PresenceEntry>;
  uid?: string | null;
  onCursorMove?: (worldX: number, worldY: number) => void;
  boardId: string;
  remoteDragging?: Record<string, DraggingEntry>;
  connectors?: Connector[];
  activeTool?: "select" | "connect" | "frame";
  connectSourceId?: string | null;
  selectedConnectorId?: string | null;
  onSelectConnector?: (id: string) => void;
  onBgClick?: () => void;
  onFrameCreate?: (x: number, y: number, w: number, h: number) => void;
  onFrameTitleCommit?: (id: string, title: string) => void;
  onItemTransform?: (id: string, x: number, y: number, width: number, height: number, rotation: number) => void;
  frameTitleEditingId?: string | null;
  textEditingId?: string | null;
};

export function BoardCanvas({
  width,
  height,
  items,
  selectedId,
  onSelect,
  onItemClick,
  onTextCommit,
  presenceMap = {},
  uid = null,
  onCursorMove,
  boardId,
  remoteDragging = {},
  connectors = [],
  activeTool = "select",
  connectSourceId = null,
  selectedConnectorId = null,
  onSelectConnector,
  onBgClick,
  onFrameCreate,
  onFrameTitleCommit,
  onItemTransform,
  frameTitleEditingId = null,
  textEditingId = null,
}: BoardCanvasProps) {
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [localPositions, setLocalPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [connectPreviewPos, setConnectPreviewPos] = useState<{ x: number; y: number } | null>(null);
  const [frameDrawRect, setFrameDrawRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [frameTitleEditId, setFrameTitleEditId] = useState<string | null>(null);
  const [frameTitleValue, setFrameTitleValue] = useState("");

  const stageRef = useRef<Konva.Stage | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const frameTitleInputRef = useRef<HTMLInputElement | null>(null);

  const isPanningRef = useRef(false);
  const panStartRef = useRef<{ x: number; y: number } | null>(null);
  const stageStartRef = useRef<{ x: number; y: number } | null>(null);
  const cursorThrottleRef = useRef(0);
  const frameDrawStartRef = useRef<{ x: number; y: number } | null>(null);
  const frameDrawRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  frameDrawRectRef.current = frameDrawRect;

  // Refs for stable callbacks
  const activeToolRef = useRef(activeTool);
  activeToolRef.current = activeTool;
  const connectSourceIdRef = useRef(connectSourceId);
  connectSourceIdRef.current = connectSourceId;
  const onFrameCreateRef = useRef(onFrameCreate);
  onFrameCreateRef.current = onFrameCreate;

  // Transformer and item node refs (all types)
  const itemNodesRef = useRef<Map<string, Konva.Group>>(new Map());
  const transformerRef = useRef<Konva.Transformer | null>(null);

  const handleGroupMount = useCallback((id: string, node: Konva.Group | null) => {
    if (node) {
      itemNodesRef.current.set(id, node);
    } else {
      itemNodesRef.current.delete(id);
    }
  }, []);

  // Sync Transformer to the currently selected item
  const selectedItem = useMemo(() => items.find((i) => i.id === selectedId), [items, selectedId]);

  useEffect(() => {
    const tr = transformerRef.current;
    if (!tr) return;
    if (selectedId) {
      const node = itemNodesRef.current.get(selectedId);
      if (node) {
        tr.nodes([node]);
        tr.getLayer()?.batchDraw();
      } else {
        tr.nodes([]);
      }
    } else {
      tr.nodes([]);
      tr.getLayer()?.batchDraw();
    }
  }, [selectedId]);

  // Trigger frame title editing when parent requests it
  const prevFrameTitleEditingIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (frameTitleEditingId && frameTitleEditingId !== prevFrameTitleEditingIdRef.current) {
      prevFrameTitleEditingIdRef.current = frameTitleEditingId;
      const frame = items.find((i) => i.id === frameTitleEditingId);
      if (frame) {
        setFrameTitleEditId(frameTitleEditingId);
        setFrameTitleValue(frame.title ?? "Frame");
      }
    }
  }, [frameTitleEditingId, items]);

  // Auto-start text editing when parent creates a new text item
  const prevTextEditingIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (textEditingId && textEditingId !== prevTextEditingIdRef.current) {
      prevTextEditingIdRef.current = textEditingId;
      const textItem = items.find((i) => i.id === textEditingId);
      if (textItem) {
        setEditingId(textEditingId);
        setEditingValue(textItem.text ?? "");
      }
    }
  }, [textEditingId, items]);

  // Effective item positions: prefer local drag > remote drag > Firestore
  const effectiveItemsById = useMemo(() => {
    const map: Record<string, BoardItem> = {};
    for (const item of items) {
      const localPos = localPositions[item.id];
      const remoteEntry = remoteDragging[item.id];
      if (localPos) {
        map[item.id] = { ...item, x: localPos.x, y: localPos.y };
      } else if (remoteEntry) {
        map[item.id] = { ...item, x: remoteEntry.x, y: remoteEntry.y };
      } else {
        map[item.id] = item;
      }
    }
    return map;
  }, [items, remoteDragging, localPositions]);

  const handleLocalDragMove = useCallback((id: string, x: number, y: number) => {
    setLocalPositions((prev) => ({ ...prev, [id]: { x, y } }));
  }, []);

  const handleLocalDragEnd = useCallback((id: string) => {
    setLocalPositions((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const handleWheel = useCallback(
    (e: { evt: WheelEvent }) => {
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const oldScale = stage.scaleX();
      const oldX = stage.x();
      const oldY = stage.y();
      const direction = e.evt.deltaY > 0 ? -1 : 1;
      const newScale = oldScale * Math.pow(SCALE_BY, direction);
      const clampedScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
      const mousePointTo = {
        x: (pointer.x - oldX) / oldScale,
        y: (pointer.y - oldY) / oldScale,
      };
      setStageScale(clampedScale);
      setStagePos({
        x: pointer.x - mousePointTo.x * clampedScale,
        y: pointer.y - mousePointTo.y * clampedScale,
      });
    },
    []
  );

  const handleStageMouseDown = useCallback(
    (e: { target: { getStage: () => { getPointerPosition: () => { x: number; y: number } | null } | null; name: () => string } }) => {
      const clickedStage = (e.target as unknown) === stageRef.current;
      const clickedBg = e.target.name() === "bg";
      if (clickedStage || clickedBg) {
        const stage = stageRef.current;
        if (!stage) return;
        const pos = stage.getPointerPosition();
        if (pos) {
          if (activeToolRef.current === "frame") {
            // Start drawing a frame instead of panning
            const worldX = (pos.x - stage.x()) / stage.scaleX();
            const worldY = (pos.y - stage.y()) / stage.scaleY();
            frameDrawStartRef.current = { x: worldX, y: worldY };
            setFrameDrawRect(null);
            return;
          }
          isPanningRef.current = true;
          panStartRef.current = { x: pos.x, y: pos.y };
          stageStartRef.current = { x: stage.x(), y: stage.y() };
        }
      }
    },
    []
  );

  const handleStageTouchStart = useCallback(
    (e: { target: { getStage: () => { getPointerPosition: () => { x: number; y: number } | null } | null; name: () => string } }) => {
      const clickedStage = (e.target as unknown) === stageRef.current;
      const clickedBg = e.target.name() === "bg";
      if (clickedStage || clickedBg) {
        const stage = stageRef.current;
        if (!stage) return;
        const pos = stage.getPointerPosition();
        if (pos) {
          isPanningRef.current = true;
          panStartRef.current = { x: pos.x, y: pos.y };
          stageStartRef.current = { x: stage.x(), y: stage.y() };
        }
      }
    },
    []
  );

  const handleStageMouseMove = useCallback(
    (e: { target: { getStage: () => Konva.Stage | null } }) => {
      const stage = e.target.getStage();
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (pointer) {
        const worldX = (pointer.x - stage.x()) / stage.scaleX();
        const worldY = (pointer.y - stage.y()) / stage.scaleY();

        if (onCursorMove) {
          const now = performance.now();
          if (now - cursorThrottleRef.current >= CURSOR_THROTTLE_MS) {
            cursorThrottleRef.current = now;
            onCursorMove(worldX, worldY);
          }
        }

        // Update preview line position in connect mode
        if (activeToolRef.current === "connect" && connectSourceIdRef.current) {
          setConnectPreviewPos({ x: worldX, y: worldY });
        }

        // Update frame draw preview
        if (activeToolRef.current === "frame" && frameDrawStartRef.current) {
          const start = frameDrawStartRef.current;
          setFrameDrawRect({
            x: Math.min(start.x, worldX),
            y: Math.min(start.y, worldY),
            w: Math.abs(worldX - start.x),
            h: Math.abs(worldY - start.y),
          });
        }
      }
      if (!isPanningRef.current || !panStartRef.current || !stageStartRef.current) return;
      if (!pointer) return;
      const dx = pointer.x - panStartRef.current.x;
      const dy = pointer.y - panStartRef.current.y;
      setStagePos({
        x: stageStartRef.current.x + dx,
        y: stageStartRef.current.y + dy,
      });
    },
    [onCursorMove]
  );

  const handleStageTouchMove = useCallback(
    (e: { target: { getStage: () => Konva.Stage | null } }) => {
      if (!isPanningRef.current || !panStartRef.current || !stageStartRef.current) return;
      const stage = e.target.getStage();
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const dx = pointer.x - panStartRef.current.x;
      const dy = pointer.y - panStartRef.current.y;
      setStagePos({
        x: stageStartRef.current.x + dx,
        y: stageStartRef.current.y + dy,
      });
    },
    []
  );

  const handleStageMouseUp = useCallback(() => {
    // Complete frame draw
    if (frameDrawStartRef.current && activeToolRef.current === "frame") {
      const rect = frameDrawRectRef.current;
      if (rect && rect.w > FRAME_MIN_SIZE && rect.h > FRAME_MIN_SIZE) {
        onFrameCreateRef.current?.(rect.x, rect.y, rect.w, rect.h);
      }
      frameDrawStartRef.current = null;
      setFrameDrawRect(null);
      return;
    }
    isPanningRef.current = false;
    panStartRef.current = null;
    stageStartRef.current = null;
  }, []);

  const handleStageTouchEnd = useCallback(() => {
    isPanningRef.current = false;
    panStartRef.current = null;
    stageStartRef.current = null;
  }, []);

  const commitEdit = useCallback(
    (id: string) => {
      onTextCommit(id, editingValue);
      setEditingId(null);
    },
    [editingValue, onTextCommit]
  );

  const cancelEdit = useCallback(() => {
    setEditingId(null);
  }, []);

  // Used by both sticky and text items
  const handleTextDblClick = useCallback((item: BoardItem) => {
    setEditingId(item.id);
    setEditingValue(item.text ?? "");
  }, []);

  const handleFrameDblClick = useCallback((item: BoardItem) => {
    setFrameTitleEditId(item.id);
    setFrameTitleValue(item.title ?? "Frame");
  }, []);

  const commitFrameTitle = useCallback(
    (id: string) => {
      onFrameTitleCommit?.(id, frameTitleValue);
      setFrameTitleEditId(null);
    },
    [frameTitleValue, onFrameTitleCommit]
  );

  const editingItem = editingId ? items.find((i) => i.id === editingId) : null;
  const frameTitleEditItem = frameTitleEditId ? items.find((i) => i.id === frameTitleEditId) : null;

  // Other users' cursors to render (world coords, exclude self; only recent sessions)
  const otherPresences = useMemo(() => {
    return Object.entries(presenceMap).filter(
      ([key, p]) =>
        isPresenceActive(p) &&
        !(uid && key.startsWith(`${uid}-`))
    ) as [string, PresenceEntry][];
  }, [presenceMap, uid]);

  // Subtle grid lines every 40px across the full world so they persist when panning/zooming
  const gridLines = useMemo(() => {
    const vertical: number[] = [];
    for (let x = -WORLD_HALF; x <= WORLD_HALF; x += GRID_STEP) {
      vertical.push(x, -WORLD_HALF, x, WORLD_HALF);
    }
    const horizontal: number[] = [];
    for (let y = -WORLD_HALF; y <= WORLD_HALF; y += GRID_STEP) {
      horizontal.push(-WORLD_HALF, y, WORLD_HALF, y);
    }
    return { vertical, horizontal };
  }, []);

  // Preview line for connect mode: dashed line from source edge to cursor
  const previewLine = useMemo(() => {
    if (activeTool !== "connect" || !connectSourceId || !connectPreviewPos) return null;
    const sourceItem = effectiveItemsById[connectSourceId];
    if (!sourceItem) return null;
    const bounds = getItemBounds(sourceItem);
    const srcEdge = getEdgePoint(bounds, connectPreviewPos);
    return (
      <Line
        key="connector-preview"
        points={[srcEdge.x, srcEdge.y, connectPreviewPos.x, connectPreviewPos.y]}
        stroke="#2563eb"
        strokeWidth={1.5}
        dash={[6, 4]}
        listening={false}
      />
    );
  }, [activeTool, connectSourceId, connectPreviewPos, effectiveItemsById]);

  // Split items for z-ordering: frames behind everything else
  const frameItems = useMemo(() => items.filter((i) => i.type === "frame"), [items]);
  const nonFrameItems = useMemo(() => items.filter((i) => i.type !== "frame"), [items]);

  useEffect(() => {
    if (editingId && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [editingId]);

  // Auto-resize textarea height for text-type items while editing
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta || !editingItem || editingItem.type !== "text") return;
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + "px";
  }, [editingValue, editingItem]);

  useEffect(() => {
    if (frameTitleEditId && frameTitleInputRef.current) {
      frameTitleInputRef.current.focus();
      frameTitleInputRef.current.select();
    }
  }, [frameTitleEditId]);

  return (
    <div className={`absolute inset-0 z-0${activeTool === "frame" ? " cursor-crosshair" : ""}`}>
      <Stage
        ref={stageRef}
        width={width}
        height={height}
        scaleX={stageScale}
        scaleY={stageScale}
        x={stagePos.x}
        y={stagePos.y}
        onWheel={handleWheel}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onTouchStart={handleStageTouchStart}
        onTouchMove={handleStageTouchMove}
        onTouchEnd={handleStageTouchEnd}
      >
        <Layer>
          {/* Background: full world extent; onClick clears connector/item selection */}
          <Rect
            name="bg"
            x={-WORLD_HALF}
            y={-WORLD_HALF}
            width={WORLD_HALF * 2}
            height={WORLD_HALF * 2}
            fill="#f5f5f5"
            onClick={() => onBgClick?.()}
          />
          {/* Subtle grid lines every 40px */}
          <Line points={gridLines.vertical} stroke="#f3f4f6" strokeWidth={1} listening={false} />
          <Line points={gridLines.horizontal} stroke="#f3f4f6" strokeWidth={1} listening={false} />

          {/* Frames — rendered first so they appear behind all other content */}
          {frameItems.map((item) => {
            const displayItem = effectiveItemsById[item.id] ?? item;
            const remoteEntry = remoteDragging[item.id];
            return (
              <FrameItem
                key={item.id}
                item={displayItem}
                isSelected={item.id === selectedId}
                onSelect={onSelect}
                boardId={boardId}
                uid={uid}
                isRemoteDragging={!!remoteEntry}
                activeTool={activeTool}
                onLocalDragMove={handleLocalDragMove}
                onLocalDragEnd={handleLocalDragEnd}
                onDblClick={handleFrameDblClick}
                onGroupMount={handleGroupMount}
                onTransformEnd={(id, x, y, w, h, rotation) => onItemTransform?.(id, x, y, w, h, rotation)}
              />
            );
          })}

          {/* Preview line while selecting connector target */}
          {previewLine}

          {/* Connectors — rendered before items so items appear on top */}
          {connectors.map((conn) => {
            const fromItem = effectiveItemsById[conn.fromId];
            const toItem = effectiveItemsById[conn.toId];
            if (!fromItem || !toItem) return null;
            return (
              <ConnectorLine
                key={conn.id}
                conn={conn}
                fromItem={fromItem}
                toItem={toItem}
                isSelected={conn.id === selectedConnectorId}
                onSelect={onSelectConnector ?? (() => {})}
              />
            );
          })}

          {/* Board items (stickies and rects) */}
          {nonFrameItems.map((item) => {
            const isSelected = item.id === selectedId;
            const isConnectSource = item.id === connectSourceId;
            const remoteEntry = remoteDragging[item.id];
            const displayItem = effectiveItemsById[item.id] ?? item;

            if (item.type === "rect") {
              return (
                <RectItem
                  key={item.id}
                  item={displayItem}
                  isSelected={isSelected}
                  isConnectSource={isConnectSource}
                  onSelect={onSelect}
                  onItemClick={onItemClick}
                  boardId={boardId}
                  uid={uid}
                  isRemoteDragging={!!remoteEntry}
                  activeTool={activeTool}
                  onLocalDragMove={handleLocalDragMove}
                  onLocalDragEnd={handleLocalDragEnd}
                  onGroupMount={handleGroupMount}
                  onTransformEnd={(id, x, y, w, h, rotation) => onItemTransform?.(id, x, y, w, h, rotation)}
                />
              );
            }

            if (item.type === "text") {
              return (
                <TextItem
                  key={item.id}
                  item={displayItem}
                  isSelected={isSelected}
                  isConnectSource={isConnectSource}
                  isEditing={editingId === item.id}
                  onSelect={onSelect}
                  onItemClick={onItemClick}
                  onDblClick={handleTextDblClick}
                  boardId={boardId}
                  uid={uid}
                  isRemoteDragging={!!remoteEntry}
                  activeTool={activeTool}
                  onLocalDragMove={handleLocalDragMove}
                  onLocalDragEnd={handleLocalDragEnd}
                  onGroupMount={handleGroupMount}
                  onTransformEnd={(id, x, y, w, h, rotation) => onItemTransform?.(id, x, y, w, h, rotation)}
                />
              );
            }

            return (
              <StickyItem
                key={item.id}
                item={displayItem}
                isSelected={isSelected}
                isConnectSource={isConnectSource}
                isEditing={editingId === item.id}
                onSelect={onSelect}
                onItemClick={onItemClick}
                onDblClick={handleTextDblClick}
                boardId={boardId}
                uid={uid}
                isRemoteDragging={!!remoteEntry}
                activeTool={activeTool}
                onLocalDragMove={handleLocalDragMove}
                onLocalDragEnd={handleLocalDragEnd}
                onGroupMount={handleGroupMount}
                onTransformEnd={(id, x, y, w, h, rotation) => onItemTransform?.(id, x, y, w, h, rotation)}
              />
            );
          })}

          {/* Frame draw preview while dragging to create */}
          {frameDrawRect && (
            <Rect
              x={frameDrawRect.x}
              y={frameDrawRect.y}
              width={frameDrawRect.w}
              height={frameDrawRect.h}
              fill="rgba(99,102,241,0.06)"
              stroke="#6366f1"
              strokeWidth={2}
              dash={[8, 4]}
              listening={false}
            />
          )}

          {/* Transformer for move/resize/rotate on all selected items */}
          <Transformer
            ref={transformerRef}
            rotateEnabled={selectedItem?.type !== "frame"}
            keepRatio={false}
            boundBoxFunc={(oldBox, newBox) => {
              const minSize = selectedItem?.type === "frame" ? FRAME_MIN_SIZE : ITEM_MIN_SIZE;
              if (newBox.width < minSize || newBox.height < minSize) return oldBox;
              return newBox;
            }}
          />
        </Layer>
        {/* Ephemeral layer — redraws at cursor frequency without touching board objects */}
        <Layer listening={false}>
          {/* Other users' cursors (world space) */}
          {otherPresences.map(([key, p]) => (
            <Group key={key} x={p.cursorX} y={p.cursorY} listening={false}>
              <Circle radius={5} fill={p.color} stroke="#fff" strokeWidth={1} />
              <Text
                x={10}
                y={-6}
                text={p.name || "Anonymous"}
                fontSize={12}
                fontFamily="sans-serif"
                fill={p.color}
                listening={false}
              />
            </Group>
          ))}
        </Layer>
      </Stage>

      {/* HTML textarea overlay for editing stickies; positioned using pan/zoom */}
      {editingItem && editingId === editingItem.id && editingItem.type === "sticky" && (
        <textarea
            ref={textareaRef}
            className="absolute border border-emerald-300 rounded-lg shadow-lg resize-none outline-none z-50 text-neutral-900 text-sm font-sans p-3 box-border"
            style={{
              backgroundColor: "#C9E4DE",
              left: editingItem.x * stageScale + stagePos.x + STICKY_PADDING * stageScale,
              top: editingItem.y * stageScale + stagePos.y + STICKY_PADDING * stageScale,
              width: ((editingItem.width ?? STICKY_SIZE) - STICKY_PADDING * 2) * stageScale,
              height: ((editingItem.height ?? STICKY_SIZE) - STICKY_PADDING * 2) * stageScale,
              fontSize: Math.max(12, 14 * stageScale),
            }}
            value={editingValue}
            onChange={(e) => setEditingValue(e.target.value)}
            onBlur={() => commitEdit(editingId)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                commitEdit(editingId);
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelEdit();
              }
            }}
            aria-label="Edit sticky text"
          />
      )}

      {/* HTML textarea overlay for editing standalone text items */}
      {editingItem && editingId === editingItem.id && editingItem.type === "text" && (() => {
        const displayX = (effectiveItemsById[editingItem.id]?.x ?? editingItem.x) * stageScale + stagePos.x;
        const displayY = (effectiveItemsById[editingItem.id]?.y ?? editingItem.y) * stageScale + stagePos.y;
        const fs = Math.max(10, (editingItem.fontSize ?? 16) * stageScale);
        return (
          <textarea
            ref={textareaRef}
            className="absolute resize-none outline-none z-50 font-sans box-border overflow-hidden"
            style={{
              left: displayX,
              top: displayY,
              width: (editingItem.width ?? 200) * stageScale,
              minHeight: fs * 1.6,
              fontSize: fs,
              lineHeight: 1.4,
              color: editingItem.fill ?? "#1c1917",
              background: "rgba(255,255,255,0.85)",
              borderRadius: 3,
              padding: `${2 * stageScale}px ${4 * stageScale}px`,
            }}
            value={editingValue}
            onChange={(e) => setEditingValue(e.target.value)}
            onBlur={() => commitEdit(editingId)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                commitEdit(editingId);
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelEdit();
              }
            }}
            aria-label="Edit text"
          />
        );
      })()}

      {/* HTML input overlay for editing frame title */}
      {frameTitleEditItem && frameTitleEditId === frameTitleEditItem.id && (
        <input
          ref={frameTitleInputRef}
          type="text"
          className="absolute outline-none z-50 font-sans font-semibold text-white px-2 box-border"
          style={{
            left: (effectiveItemsById[frameTitleEditItem.id]?.x ?? frameTitleEditItem.x) * stageScale + stagePos.x,
            top: (effectiveItemsById[frameTitleEditItem.id]?.y ?? frameTitleEditItem.y) * stageScale + stagePos.y,
            width: (frameTitleEditItem.width ?? 300) * stageScale,
            height: FRAME_LABEL_H * stageScale,
            backgroundColor: (frameTitleEditItem.fill ?? "#6366f1") + "e6",
            fontSize: Math.max(10, 13 * stageScale),
            borderRadius: `${4 * stageScale}px ${4 * stageScale}px 0 0`,
          }}
          value={frameTitleValue}
          onChange={(e) => setFrameTitleValue(e.target.value)}
          onBlur={() => commitFrameTitle(frameTitleEditId)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitFrameTitle(frameTitleEditId);
            } else if (e.key === "Escape") {
              e.preventDefault();
              setFrameTitleEditId(null);
            }
          }}
          aria-label="Edit frame title"
        />
      )}
    </div>
  );
}
