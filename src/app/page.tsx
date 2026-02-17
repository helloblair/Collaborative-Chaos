"use client";

import { auth } from "@/lib/firebase";
import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { useEffect, useState } from "react";

export default function Home() {
  const [user, setUser] = useState(() => auth.currentUser);

  useEffect(() => auth.onAuthStateChanged(setUser), []);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">CollabBoard</h1>

      {!user ? (
        <button
          className="px-4 py-2 rounded bg-black text-white"
          onClick={login}
        >
          Sign in with Google
        </button>
      ) : (
        <div className="space-y-3">
          <div className="text-sm">
            Signed in as: {user.displayName}
          </div>
          <button
            className="underline"
            onClick={() => signOut(auth)}
          >
            Sign out
          </button>
        </div>
      )}
    </main>
  );
}
