import { createRemoteJWKSet, jwtVerify } from "jose";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!;

// ---- JWT verification via Google public JWKS (no service account needed) ----

const JWKS = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
  )
);

export interface FirebaseTokenPayload {
  uid: string;
  email?: string;
  [key: string]: unknown;
}

/**
 * Verifies a Firebase ID token using Google's public JWKS.
 * No service account credentials required.
 */
export async function verifyIdToken(token: string): Promise<FirebaseTokenPayload> {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `https://securetoken.google.com/${PROJECT_ID}`,
    audience: PROJECT_ID,
  });
  return { ...payload, uid: payload.sub! } as FirebaseTokenPayload;
}

// ---- Firebase Admin SDK for Firestore writes ----
// Requires FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.
// Falls back to Application Default Credentials (works on GCP / Cloud Run) if
// client email / private key are not set.

if (!getApps().length) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  initializeApp(
    process.env.FIREBASE_CLIENT_EMAIL && privateKey
      ? {
          credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey,
          }),
        }
      : { projectId: process.env.FIREBASE_PROJECT_ID }
  );
}

export const adminDb = getFirestore();
