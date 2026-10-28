import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";
import firebaseConfig from "@/app/config/firebaseConfig";

// Firebase ID tokens are signed with these public keys: https://firebase.google.com/docs/auth/admin/verify-id-tokens
const firebaseKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

/** The E.164 phone number proven by a Firebase phone-OTP sign-in, or null if the token isn't valid. */
export async function verifiedPhone(idToken: unknown): Promise<string | null> {
  if (typeof idToken !== "string" || !idToken) return null;
  const { projectId } = firebaseConfig;
  try {
    const { payload } = await jwtVerify(idToken, firebaseKeys, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });
    return typeof payload.phone_number === "string" ? payload.phone_number : null;
  } catch {
    return null;
  }
}
