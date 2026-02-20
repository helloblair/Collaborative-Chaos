"use client";

import type { BoardItem, Connector } from "@/types/board";
import type Konva from "konva";
import { Arrow, Circle, Group, Layer, Line, Rect, Stage, Text } from "react-konva";
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
    w: item.width ?? (item.type === "rect" ? 200 : STICKY_SIZE),
    h: item.height ?? (item.type === "rect" ? 120 : STICKY_SIZE),
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
  activeTool: "select" | "connect";
  onLocalDragMove: (id: string, x: number, y: number) => void;
  onLocalDragEnd: (id: string) => void;
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
}: RectItemProps) {
  const { onDragMove, onDragEnd } = useDragBroadcast(boardId, item.id, uid);
  const w = item.width ?? 200;
  const h = item.height ?? 120;
  const fill = item.fill ?? "#C6DEF1";
  return (
    <Group
      x={item.x}
      y={item.y}
      draggable={!isRemoteDragging && activeTool !== "connect"}
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
  activeTool: "select" | "connect";
  onLocalDragMove: (id: string, x: number, y: number) => void;
  onLocalDragEnd: (id: string) => void;
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
}: StickyItemProps) {
  const { onDragMove, onDragEnd } = useDragBroadcast(boardId, item.id, uid);
  const w = item.width ?? STICKY_SIZE;
  const h = item.height ?? STICKY_SIZE;
  const fill = item.fill ?? "#C9E4DE";
  return (
    <Group
      x={item.x}
      y={item.y}
      draggable={!isEditing && !isRemoteDragging && activeTool !== "connect"}
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
  activeTool?: "select" | "connect";
  connectSourceId?: string | null;
  selectedConnectorId?: string | null;
  onSelectConnector?: (id: string) => void;
  onBgClick?: () => void;
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
}: BoardCanvasProps) {
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [localPositions, setLocalPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [connectPreviewPos, setConnectPreviewPos] = useState<{ x: number; y: number } | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const isPanningRef = useRef(false);
  const panStartRef = useRef<{ x: number; y: number } | null>(null);
  const stageStartRef = useRef<{ x: number; y: number } | null>(null);
  const cursorThrottleRef = useRef(0);

  // Refs for stable callbacks that need current tool state
  const activeToolRef = useRef(activeTool);
  activeToolRef.current = activeTool;
  const connectSourceIdRef = useRef(connectSourceId);
  connectSourceIdRef.current = connectSourceId;

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

  const handleStickyDblClick = useCallback((item: BoardItem) => {
    setEditingId(item.id);
    setEditingValue(item.text ?? "");
  }, []);

  const editingItem = editingId ? items.find((i) => i.id === editingId) : null;

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

  useEffect(() => {
    if (editingId && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [editingId]);

  return (
    <div className="absolute inset-0 z-0">
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

          {/* Board items */}
          {items.map((item) => {
            const isSelected = item.id === selectedId;
            const isConnectSource = item.id === connectSourceId;
            // If another user is actively dragging this item, use their RTDB position
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
                onDblClick={handleStickyDblClick}
                boardId={boardId}
                uid={uid}
                isRemoteDragging={!!remoteEntry}
                activeTool={activeTool}
                onLocalDragMove={handleLocalDragMove}
                onLocalDragEnd={handleLocalDragEnd}
              />
            );
          })}
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

      {/* HTML textarea overlay for editing stickies only; positioned using pan/zoom */}
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
    </div>
  );
}
