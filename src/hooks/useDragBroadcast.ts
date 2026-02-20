import { useCallback, useEffect, useRef } from "react";
import { ref, set, remove } from "firebase/database";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { rtdb, db } from "@/lib/firebase";

const DRAG_THROTTLE_MS = 50;

/**
 * Per-item hook that broadcasts drag position to RTDB during a drag and
 * commits the final position to Firestore on drag end.
 *
 * During drag:  writes { x, y, userId, timestamp } to
 *              /boards/{boardId}/dragging/{objectId} at most every 50 ms.
 * On drag end: writes final x/y to Firestore, then removes the RTDB entry.
 * On unmount:  removes any stale RTDB entry left by this client.
 */
export function useDragBroadcast(
  boardId: string,
  objectId: string,
  uid: string | null | undefined
) {
  const lastMoveRef = useRef<number>(0);

  const onDragMove = useCallback(
    (x: number, y: number) => {
      if (!uid) return;
      const now = performance.now();
      if (now - lastMoveRef.current < DRAG_THROTTLE_MS) return;
      lastMoveRef.current = now;
      const draggingRef = ref(rtdb, `boards/${boardId}/dragging/${objectId}`);
      set(draggingRef, {
        x: Math.round(x),
        y: Math.round(y),
        userId: uid,
        timestamp: Date.now(),
      }).catch(console.error);
    },
    [boardId, objectId, uid]
  );

  const onDragEnd = useCallback(
    (x: number, y: number) => {
      if (!uid) return;
      // Persist final position to Firestore (single write, replaces all in-flight RTDB positions)
      const itemRef = doc(db, "boards", boardId, "items", objectId);
      updateDoc(itemRef, {
        x: Math.round(x),
        y: Math.round(y),
        updatedAt: serverTimestamp(),
      }).catch(console.error);
      // Remove the RTDB interim entry so other clients revert to Firestore
      const draggingRef = ref(rtdb, `boards/${boardId}/dragging/${objectId}`);
      remove(draggingRef).catch(console.error);
    },
    [boardId, objectId, uid]
  );

  // Clean up any stale RTDB drag entry when the component unmounts
  useEffect(() => {
    return () => {
      if (!uid) return;
      const draggingRef = ref(rtdb, `boards/${boardId}/dragging/${objectId}`);
      remove(draggingRef).catch(() => {});
    };
  }, [boardId, objectId, uid]);

  return { onDragMove, onDragEnd };
}
