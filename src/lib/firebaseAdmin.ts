import { createRemoteJWKSet, jwtVerify } from "jose";

// Firebase ID tokens are standard JWTs signed by Google.
// We verify them against Google's public JWKS — no service account key required.
const JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!;

// jose caches the JWKS and refreshes automatically
const JWKS = createRemoteJWKSet(new URL(JWKS_URL));

export interface FirebaseTokenPayload {
  uid: string;
  email?: string;
  [key: string]: unknown;
}

/**
 * Verifies a Firebase ID token and returns its decoded payload.
 * Throws if the token is invalid or expired.
 */
export async function verifyIdToken(token: string): Promise<FirebaseTokenPayload> {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `https://securetoken.google.com/${PROJECT_ID}`,
    audience: PROJECT_ID,
  });

  return { ...payload, uid: payload.sub! } as FirebaseTokenPayload;
}
