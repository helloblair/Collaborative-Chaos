import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Board } from "@/types/board";

const boardsCol = collection(db, "boards");

export async function createBoard(
  name: string,
  uid: string,
  email: string
): Promise<string> {
  const ref = doc(boardsCol);
  await setDoc(ref, {
    id: ref.id,
    name,
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    members: [uid],
    memberEmails: [email],
  });
  return ref.id;
}

export async function getBoard(boardId: string): Promise<Board | null> {
  const snap = await getDoc(doc(boardsCol, boardId));
  return snap.exists() ? (snap.data() as Board) : null;
}

// Add the requesting user to the board's members array (self-join via invite link).
export async function joinBoard(
  boardId: string,
  uid: string,
  email: string
): Promise<void> {
  await updateDoc(doc(boardsCol, boardId), {
    members: arrayUnion(uid),
    memberEmails: arrayUnion(email),
    updatedAt: serverTimestamp(),
  });
}

// Remove a member (owner only — enforced by Firestore rules).
export async function removeMember(
  boardId: string,
  uidToRemove: string,
  emailToRemove: string
): Promise<void> {
  await updateDoc(doc(boardsCol, boardId), {
    members: arrayRemove(uidToRemove),
    memberEmails: arrayRemove(emailToRemove),
    updatedAt: serverTimestamp(),
  });
}

// Delete the board document (owner only). Subcollection cleanup requires a Cloud Function.
export async function deleteBoard(boardId: string): Promise<void> {
  await deleteDoc(doc(boardsCol, boardId));
}

export function subscribeUserBoards(
  uid: string,
  callback: (boards: Board[]) => void
): () => void {
  const q = query(boardsCol, where("members", "array-contains", uid));
  return onSnapshot(q, (snap) => {
    const boards = snap.docs.map((d) => d.data() as Board);
    boards.sort((a, b) => {
      const toMs = (ts: unknown) =>
        ts && typeof (ts as { toMillis?: () => number }).toMillis === "function"
          ? (ts as { toMillis: () => number }).toMillis()
          : 0;
      return toMs(b.updatedAt) - toMs(a.updatedAt);
    });
    callback(boards);
  });
}
