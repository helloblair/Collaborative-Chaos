"use client";

import type { BoardItem } from "@/types/board";
import type Konva from "konva";
import { Group, Layer, Rect, Stage, Text } from "react-konva";
import { useCallback, useEffect, useRef, useState } from "react";

const STICKY_WIDTH = 192;
const STICKY_HEIGHT = 96;
const STICKY_PADDING = 12;
const SCALE_BY = 1.05;
const MIN_SCALE = 0.4;
const MAX_SCALE = 2.5;

export type BoardCanvasProps = {
  width: number;
  height: number;
  items: BoardItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMoveEnd: (id: string, x: number, y: number) => void;
  onTextCommit: (id: string, nextText: string) => void;
};

export function BoardCanvas({
  width,
  height,
  items,
  selectedId,
  onSelect,
  onMoveEnd,
  onTextCommit,
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

  const handleWheel = useCallback(
    (e: { evt: WheelEvent; target: { getStage: () => { getPointerPosition: () => { x: number; y: number } | null } | null } }) => {
      e.evt.preventDefault();
      const stage = e.target.getStage();
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const direction = e.evt.deltaY > 0 ? -1 : 1;
      const newScale = stageScale * Math.pow(SCALE_BY, direction);
      const clampedScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
      const mousePointTo = {
        x: (pointer.x - stagePos.x) / stageScale,
        y: (pointer.y - stagePos.y) / stageScale,
      };
      setStageScale(clampedScale);
      setStagePos({
        x: pointer.x - mousePointTo.x * clampedScale,
        y: pointer.y - mousePointTo.y * clampedScale,
      });
    },
    [stageScale, stagePos]
  );

  const handleStageMouseDown = useCallback(
    (e: { target: { getStage: () => { getPointerPosition: () => { x: number; y: number } | null } | null; name: () => string } }) => {
      const stage = e.target.getStage();
      if (!stage) return;
      const clickedStage = (e.target as unknown) === stage;
      const clickedBg = e.target.name() === "bg";
      if (clickedStage || clickedBg) {
        const pos = stage.getPointerPosition();
        if (pos) {
          isPanningRef.current = true;
          panStartRef.current = { x: pos.x, y: pos.y };
          stageStartRef.current = { ...stagePos };
        }
      }
    },
    [stagePos]
  );

  const handleStageTouchStart = useCallback(
    (e: { target: { getStage: () => { getPointerPosition: () => { x: number; y: number } | null } | null; name: () => string } }) => {
      const stage = e.target.getStage();
      if (!stage) return;
      const clickedStage = (e.target as unknown) === stage;
      const clickedBg = e.target.name() === "bg";
      if (clickedStage || clickedBg) {
        const pos = stage.getPointerPosition();
        if (pos) {
          isPanningRef.current = true;
          panStartRef.current = { x: pos.x, y: pos.y };
          stageStartRef.current = { ...stagePos };
        }
      }
    },
    [stagePos]
  );

  const handleStageMouseMove = useCallback(
    (e: { target: { getStage: () => { getPointerPosition: () => { x: number; y: number } | null } | null } }) => {
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

  const handleStageTouchMove = useCallback(
    (e: { target: { getStage: () => { getPointerPosition: () => { x: number; y: number } | null } | null } }) => {
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
          {/* Background: must be first so it's behind stickies; hit when clicking empty space */}
          <Rect
            name="bg"
            x={0}
            y={0}
            width={width}
            height={height}
            fill="#0a0a0a"
          />
          {items.map((item) => {
            const isSelected = item.id === selectedId;

            if (item.type === "rect") {
              const w = item.width ?? 200;
              const h = item.height ?? 120;
              const fill = item.fill ?? "#60a5fa";
              return (
                <Group
                  key={item.id}
                  x={item.x}
                  y={item.y}
                  draggable
                  onDragStart={() => onSelect(item.id)}
                  onClick={() => onSelect(item.id)}
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

            // sticky
            const w = item.width ?? STICKY_WIDTH;
            const h = item.height ?? STICKY_HEIGHT;
            const fill = item.fill ?? "#fef3c7";
            return (
              <Group
                key={item.id}
                x={item.x}
                y={item.y}
                draggable={editingId !== item.id}
                onDragStart={() => onSelect(item.id)}
                onClick={() => onSelect(item.id)}
                onDblClick={() => handleStickyDblClick(item)}
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
      </Stage>

      {/* HTML textarea overlay for editing stickies only; positioned using pan/zoom */}
      {editingItem && editingId === editingItem.id && editingItem.type === "sticky" && (
        <textarea
            ref={textareaRef}
            className="absolute border border-amber-400 rounded-lg shadow-lg resize-none outline-none z-50 bg-amber-50 text-neutral-900 text-sm font-sans p-3 box-border"
            style={{
              left: editingItem.x * stageScale + stagePos.x + STICKY_PADDING * stageScale,
              top: editingItem.y * stageScale + stagePos.y + STICKY_PADDING * stageScale,
              width: ((editingItem.width ?? STICKY_WIDTH) - STICKY_PADDING * 2) * stageScale,
              height: ((editingItem.height ?? STICKY_HEIGHT) - STICKY_PADDING * 2) * stageScale,
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
