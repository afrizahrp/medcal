/**
 * Firebase Admin SDK initialization — server-side only.
 *
 * NEVER import this file in frontend/browser code.
 * NEVER expose credentials via NEXT_PUBLIC_* or client bundles.
 *
 * Initialization is lazy (on first use) and thread-safe (single instance).
 * Credentials are loaded from FIREBASE_SERVICE_ACCOUNT_JSON env var.
 */
import { initializeApp, cert, type App } from "firebase-admin/app";
import { getMessaging, type Messaging } from "firebase-admin/messaging";

let app: App | null = null;
let messaging: Messaging | null = null;

/**
 * Initialize Firebase Admin SDK if not already initialized.
 * Returns true if Firebase is available, false if credentials are missing.
 *
 * This function is idempotent — calling it multiple times is safe.
 */
export function initializeFirebaseAdmin(): boolean {
  if (app) {
    return true;
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    return false;
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountJson);
    app = initializeApp({
      credential: cert(serviceAccount),
    });
    messaging = getMessaging(app);
    return true;
  } catch (error) {
    // Log without exposing credentials
    console.error("[firebase-admin] Failed to initialize:", error instanceof Error ? error.message : "Unknown error");
    return false;
  }
}

/**
 * Check if Firebase Admin is initialized and available.
 */
export function isFirebaseInitialized(): boolean {
  return app !== null;
}

/**
 * Get Firebase Messaging instance.
 * Throws if Firebase is not initialized.
 */
export function getFirebaseMessaging(): Messaging {
  if (!messaging) {
    throw new Error("Firebase Admin not initialized. Call initializeFirebaseAdmin() first.");
  }
  return messaging;
}
