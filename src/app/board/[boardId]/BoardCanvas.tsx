"use client";

import type { BoardItem } from "@/types/board";
import type Konva from "konva";
import { Circle, Group, Layer, Line, Rect, Stage, Text } from "react-konva";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

function isPresenceActive(p: PresenceEntry | null | undefined): boolean {
  if (!p || p.isOnline !== true) return false;
  const t = p.lastActive;
  if (typeof t !== "number" || Number.isNaN(t)) return false;
  return Date.now() - t < STALE_PRESENCE_MS;
}

export type BoardCanvasProps = {
  width: number;
  height: number;
  items: BoardItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMoveEnd: (id: string, x: number, y: number) => void;
  onTextCommit: (id: string, nextText: string) => void;
  presenceMap?: Record<string, PresenceEntry>;
  uid?: string | null;
  onCursorMove?: (worldX: number, worldY: number) => void;
};

export function BoardCanvas({
  width,
  height,
  items,
  selectedId,
  onSelect,
  onMoveEnd,
  onTextCommit,
  presenceMap = {},
  uid = null,
  onCursorMove,
}: BoardCanvasProps) {
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const stageRef = useRef<Konva.Stage | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const isPanningRef = useRef(false);
  const panStartRef = useRef<{ x: number; y: number } | null>(null);
  const stageStartRef = useRef<{ x: number; y: number } | null>(null);
  // Throttle live drag broadcasts to ~50ms so other clients see smooth movement
  const moveThrottleRef = useRef(0);
  const cursorThrottleRef = useRef(0);

  const handleWheel = useCallback(
    (e: { evt: WheelEvent }) => {
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      // Read live values from the Konva node so rapid scroll events don't use stale closure state
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
    [] // stageRef is stable — no deps needed
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
    [] // stageRef is stable — no deps needed
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
    [] // stageRef is stable — no deps needed
  );

  const handleStageMouseMove = useCallback(
    (e: { target: { getStage: () => Konva.Stage | null } }) => {
      const stage = e.target.getStage();
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (pointer && onCursorMove) {
        const now = performance.now();
        if (now - cursorThrottleRef.current >= CURSOR_THROTTLE_MS) {
          cursorThrottleRef.current = now;
          const worldX = (pointer.x - stage.x()) / stage.scaleX();
          const worldY = (pointer.y - stage.y()) / stage.scaleY();
          onCursorMove(worldX, worldY);
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
          {/* Background: full world extent so it persists when panning/zooming; hit when clicking empty space */}
          <Rect
            name="bg"
            x={-WORLD_HALF}
            y={-WORLD_HALF}
            width={WORLD_HALF * 2}
            height={WORLD_HALF * 2}
            fill="#f5f5f5"
          />
          {/* Subtle grid lines every 40px */}
          <Line points={gridLines.vertical} stroke="#f3f4f6" strokeWidth={1} listening={false} />
          <Line points={gridLines.horizontal} stroke="#f3f4f6" strokeWidth={1} listening={false} />
          {items.map((item) => {
            const isSelected = item.id === selectedId;

            if (item.type === "rect") {
              const w = item.width ?? 200;
              const h = item.height ?? 120;
              const fill = item.fill ?? "#C6DEF1";
              return (
                <Group
                  key={item.id}
                  x={item.x}
                  y={item.y}
                  draggable
                  onDragStart={() => onSelect(item.id)}
                  onClick={() => onSelect(item.id)}
                  onDragMove={(e) => {
                    const now = performance.now();
                    if (now - moveThrottleRef.current < 50) return;
                    moveThrottleRef.current = now;
                    const node = e.target;
                    onMoveEnd(item.id, node.x(), node.y());
                  }}
                  onDragEnd={(e) => {
                    const node = e.target;
                    onMoveEnd(item.id, node.x(), node.y());
                  }}
                >
                  <Rect
                    width={w}
                    height={h}
                    fill={fill}
                    stroke={isSelected ? "#f59e0b" : undefined}
                    strokeWidth={isSelected ? 2 : 0}
                    shadowColor="black"
                    shadowBlur={8}
                    shadowOpacity={0.2}
                  />
                </Group>
              );
            }

            // sticky (square, mint default)
            const w = item.width ?? STICKY_SIZE;
            const h = item.height ?? STICKY_SIZE;
            const fill = item.fill ?? "#C9E4DE";
            return (
              <Group
                key={item.id}
                x={item.x}
                y={item.y}
                draggable={editingId !== item.id}
                onDragStart={() => onSelect(item.id)}
                onClick={() => onSelect(item.id)}
                onDblClick={() => handleStickyDblClick(item)}
                onDragMove={(e) => {
                  const now = performance.now();
                  if (now - moveThrottleRef.current < 50) return;
                  moveThrottleRef.current = now;
                  const node = e.target;
                  onMoveEnd(item.id, node.x(), node.y());
                }}
                onDragEnd={(e) => {
                  const node = e.target;
                  onMoveEnd(item.id, node.x(), node.y());
                }}
              >
                <Rect
                  width={w}
                  height={h}
                  fill={fill}
                  cornerRadius={8}
                  stroke={isSelected ? "#f59e0b" : undefined}
                  strokeWidth={isSelected ? 2 : 0}
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
