// Authentication logic, kept separate from rendering and data services.
import {
  auth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
} from "./firebase.js";
import { ensureUserProfile } from "./services/userservice.js";

// Resolves once with the current user (or null) after Firebase restores state.
export function onAuthReady() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        unsubscribe();
        resolve(user || null);
      },
      () => {
        unsubscribe();
        resolve(null);
      }
    );
  });
}

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export function getCurrentUser() {
  return auth.currentUser;
}

// Guards a post-login redirect target: only same-origin absolute paths (a single
// leading slash) are honored, so a crafted ?next= can't send users off-site.
export function safeNextPath(value, fallback = "/dashboard") {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

// Redirects unauthenticated visitors to login, preserving where they were headed.
export async function requireAuth() {
  const user = await onAuthReady();
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    location.replace(`/login?next=${next}`);
    return null;
  }
  return user;
}

// Sends already-authenticated users away from public auth screens.
export async function redirectIfAuthed(fallback = "/dashboard") {
  const user = await onAuthReady();
  if (user) {
    const params = new URLSearchParams(location.search);
    location.replace(safeNextPath(params.get("next"), fallback));
    return true;
  }
  return false;
}

export async function signInEmail(email, password) {
  const credential = await signInWithEmailAndPassword(
    auth,
    email.trim(),
    password
  );
  return credential.user;
}

export async function signUpEmail(name, email, password) {
  const credential = await createUserWithEmailAndPassword(
    auth,
    email.trim(),
    password
  );
  if (name && name.trim()) {
    await updateProfile(credential.user, { displayName: name.trim() });
  }
  await ensureUserProfile(credential.user);
  return credential.user;
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  const credential = await signInWithPopup(auth, provider);
  await ensureUserProfile(credential.user);
  return credential.user;
}

export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email.trim());
}

export async function signOutUser() {
  await signOut(auth);
}

// Maps Firebase auth error codes to clear, actionable messages.
export function mapAuthError(error) {
  const code = (error && error.code) || "";
  const messages = {
    "auth/invalid-email": "That email address looks invalid.",
    "auth/user-not-found": "Email or password is incorrect.",
    "auth/wrong-password": "Email or password is incorrect.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/email-already-in-use": "An account with this email already exists.",
    "auth/weak-password": "Choose a stronger password (at least 6 characters).",
    "auth/too-many-requests":
      "Too many attempts. Please wait a moment and try again.",
    "auth/popup-closed-by-user": "Sign-in was cancelled.",
    "auth/popup-blocked":
      "Your browser blocked the sign-in popup. Allow popups and try again.",
    "auth/network-request-failed":
      "Network error. Check your connection and try again.",
    "auth/operation-not-allowed":
      "This sign-in method isn't enabled for the project yet.",
  };
  return messages[code] || error?.message || "Something went wrong. Please try again.";
}
