import type { Timestamp } from "firebase/firestore";

export interface Board {
  id: string;
  name: string;
  createdBy: string;       // UID of the creator
  createdAt: Timestamp;
  updatedAt: Timestamp;
  members: string[];        // Array of UIDs with access
  memberEmails: string[];   // For display purposes
}

export type BoardItem = {
  id: string;
  type: "sticky" | "rect" | "frame" | "text";
  x: number;
  y: number;
  text?: string;
  title?: string;
  width?: number;
  height?: number;
  fill?: string;
  fontSize?: number;
  createdBy: string;
  updatedAt?: unknown;
};

export type Connector = {
  id: string;
  boardId: string;
  fromId: string;
  toId: string;
  style: "line" | "arrow";
  color: string;
  createdBy: string;
  createdAt?: Timestamp;
};
