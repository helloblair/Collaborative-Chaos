import type { BoardItem } from "@/types/board";

const TYPES: BoardItem["type"][] = ["sticky", "rect", "circle", "text", "heart"];
const FILLS = ["#C9E4DE", "#C6DEF1", "#FDEBD0", "#D5E8D4", "#E1D5E7", "#FFF2CC", "#FFD7D7"];

export function generateStressTestItems(
  count: number,
  viewportCenter: { x: number; y: number },
  spreadRadius = 3000,
): Omit<BoardItem, "id" | "createdBy" | "updatedAt">[] {
  const items: Omit<BoardItem, "id" | "createdBy" | "updatedAt">[] = [];
  for (let i = 0; i < count; i++) {
    const type = TYPES[i % TYPES.length];
    const angle = (i / count) * Math.PI * 2 * 10; // spiral
    const radius = (i / count) * spreadRadius;
    const x = viewportCenter.x + Math.cos(angle) * radius;
    const y = viewportCenter.y + Math.sin(angle) * radius;
    items.push({
      type,
      x: Math.round(x),
      y: Math.round(y),
      width: type === "text" ? 200 : type === "sticky" ? 160 : 150,
      height: type === "text" ? undefined : type === "sticky" ? 160 : 150,
      text: type === "sticky" || type === "text" ? `Item ${i + 1}` : undefined,
      fill: FILLS[i % FILLS.length],
      fontSize: type === "text" ? 16 : undefined,
    });
  }
  return items;
}
