import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "./firebase";

// Upsert basic profile on every login. merge:true preserves createdAt from first write.
export async function upsertUserProfile(user: User): Promise<void> {
  await setDoc(
    doc(db, "users", user.uid),
    {
      uid: user.uid,
      email: user.email ?? "",
      displayName: user.displayName ?? "",
      photoURL: user.photoURL ?? null,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

// Returns the UID for a given email, or null if not found.
export async function lookupUserByEmail(email: string): Promise<string | null> {
  const q = query(
    collection(db, "users"),
    where("email", "==", email.toLowerCase().trim()),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return (snap.docs[0].data().uid as string) ?? null;
}
