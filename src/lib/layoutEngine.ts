import type { BoardItem } from "@/types/board";

type Position = { x: number; y: number };
export type BoardObjectMap = Map<string, BoardItem>;

function getItemSize(item: BoardItem): { w: number; h: number } {
  return {
    w: item.width ?? 200,
    h: item.height ?? (item.type === "sticky" ? 200 : item.type === "frame" ? 300 : item.type === "text" ? 40 : 120),
  };
}

/**
 * Arrange objects in a grid, respecting each object's actual size.
 * Columns are sized to the widest item in that column; rows to the tallest.
 */
export function computeGridLayout(
  objectIds: string[],
  objects: BoardObjectMap,
  options: {
    columns?: number;
    startX?: number;
    startY?: number;
    gapX?: number;
    gapY?: number;
  } = {}
): Map<string, Position> {
  const cols = options.columns ?? Math.ceil(Math.sqrt(objectIds.length));
  const startX = options.startX ?? 0;
  const startY = options.startY ?? 0;
  const gapX = options.gapX ?? 20;
  const gapY = options.gapY ?? 20;
  const numRows = Math.ceil(objectIds.length / cols);

  const colWidths = new Array<number>(cols).fill(0);
  const rowHeights = new Array<number>(numRows).fill(0);

  objectIds.forEach((id, i) => {
    const item = objects.get(id);
    const { w, h } = item ? getItemSize(item) : { w: 200, h: 160 };
    colWidths[i % cols] = Math.max(colWidths[i % cols], w);
    rowHeights[Math.floor(i / cols)] = Math.max(rowHeights[Math.floor(i / cols)], h);
  });

  const colX: number[] = [startX];
  for (let c = 1; c < cols; c++) {
    colX.push(colX[c - 1] + colWidths[c - 1] + gapX);
  }

  const rowY: number[] = [startY];
  for (let r = 1; r < numRows; r++) {
    rowY.push(rowY[r - 1] + rowHeights[r - 1] + gapY);
  }

  const result = new Map<string, Position>();
  objectIds.forEach((id, i) => {
    result.set(id, { x: Math.round(colX[i % cols]), y: Math.round(rowY[Math.floor(i / cols)]) });
  });
  return result;
}

/** Arrange objects in a single horizontal row. */
export function computeRowLayout(
  objectIds: string[],
  objects: BoardObjectMap,
  options: { startX?: number; startY?: number; gap?: number } = {}
): Map<string, Position> {
  const startX = options.startX ?? 0;
  const startY = options.startY ?? 0;
  const gap = options.gap ?? 20;

  const result = new Map<string, Position>();
  let x = startX;
  for (const id of objectIds) {
    result.set(id, { x: Math.round(x), y: Math.round(startY) });
    const item = objects.get(id);
    x += (item ? getItemSize(item).w : 200) + gap;
  }
  return result;
}

/** Arrange objects in a single vertical column. */
export function computeColumnLayout(
  objectIds: string[],
  objects: BoardObjectMap,
  options: { startX?: number; startY?: number; gap?: number } = {}
): Map<string, Position> {
  const startX = options.startX ?? 0;
  const startY = options.startY ?? 0;
  const gap = options.gap ?? 20;

  const result = new Map<string, Position>();
  let y = startY;
  for (const id of objectIds) {
    result.set(id, { x: Math.round(startX), y: Math.round(y) });
    const item = objects.get(id);
    y += (item ? getItemSize(item).h : 160) + gap;
  }
  return result;
}

// ─── Template layouts ─────────────────────────────────────────────────────────

const SWOT_W = 340;
const SWOT_H = 280;
const SWOT_GAP = 24;

/** SWOT analysis: 2×2 grid of frames centered on the given point. */
export function computeSWOTLayout(
  centerX: number,
  centerY: number
): {
  frames: Array<{ title: string; x: number; y: number; width: number; height: number; color: string }>;
} {
  const left = Math.round(centerX - SWOT_W - SWOT_GAP / 2);
  const top = Math.round(centerY - SWOT_H - SWOT_GAP / 2);
  return {
    frames: [
      { title: "Strengths",     x: left,                    y: top,                    width: SWOT_W, height: SWOT_H, color: "#BBF7D0" },
      { title: "Weaknesses",    x: left + SWOT_W + SWOT_GAP, y: top,                  width: SWOT_W, height: SWOT_H, color: "#FECACA" },
      { title: "Opportunities", x: left,                    y: top + SWOT_H + SWOT_GAP, width: SWOT_W, height: SWOT_H, color: "#BFDBFE" },
      { title: "Threats",       x: left + SWOT_W + SWOT_GAP, y: top + SWOT_H + SWOT_GAP, width: SWOT_W, height: SWOT_H, color: "#FDE68A" },
    ],
  };
}

const JOURNEY_W = 280;
const JOURNEY_H = 360;
const JOURNEY_GAP = 24;

/** User journey map: horizontal row of frames, one per stage, with connector metadata. */
export function computeJourneyMapLayout(
  stages: string[],
  centerX: number,
  centerY: number
): {
  frames: Array<{ title: string; x: number; y: number; width: number; height: number }>;
  connectors: Array<{ fromIndex: number; toIndex: number }>;
} {
  const totalW = stages.length * JOURNEY_W + (stages.length - 1) * JOURNEY_GAP;
  const left = Math.round(centerX - totalW / 2);
  const top = Math.round(centerY - JOURNEY_H / 2);

  const frames = stages.map((title, i) => ({
    title,
    x: left + i * (JOURNEY_W + JOURNEY_GAP),
    y: top,
    width: JOURNEY_W,
    height: JOURNEY_H,
  }));

  const connectors = stages.slice(0, -1).map((_, i) => ({ fromIndex: i, toIndex: i + 1 }));
  return { frames, connectors };
}

const RETRO_W = 300;
const RETRO_H = 500;
const RETRO_GAP = 24;

/** Retrospective: 3-column frame layout centered on the given point. */
export function computeRetroLayout(
  centerX: number,
  centerY: number
): {
  frames: Array<{ title: string; x: number; y: number; width: number; height: number; color: string }>;
} {
  const titles = ["What Went Well", "What Didn't", "Action Items"];
  const colors = ["#BBF7D0", "#FECACA", "#BFDBFE"];
  const totalW = titles.length * RETRO_W + (titles.length - 1) * RETRO_GAP;
  const left = Math.round(centerX - totalW / 2);
  const top = Math.round(centerY - RETRO_H / 2);

  return {
    frames: titles.map((title, i) => ({
      title,
      x: left + i * (RETRO_W + RETRO_GAP),
      y: top,
      width: RETRO_W,
      height: RETRO_H,
      color: colors[i],
    })),
  };
}
