export type BoardItem = {
  id: string;
  type: "sticky" | "rect";
  x: number;
  y: number;
  text?: string;
  width?: number;
  height?: number;
  fill?: string;
  createdBy: string;
  updatedAt?: unknown;
};
