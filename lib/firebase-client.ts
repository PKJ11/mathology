import { getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import firebaseConfig from "@/app/config/firebaseConfig";

// Browser-only. Firebase web config is public by design; access is governed by the Firebase project settings.
export function firebaseAuth() {
  const auth = getAuth(getApps()[0] ?? initializeApp(firebaseConfig));
  auth.useDeviceLanguage();
  return auth;
}
