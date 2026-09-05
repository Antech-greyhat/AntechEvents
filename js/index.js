// Landing page: send already-authenticated visitors to their dashboard.
import { isFirebaseConfigured } from "./firebase.js";
import { redirectIfAuthed } from "./auth.js";
import { registerServiceWorker } from "./pwa.js";

registerServiceWorker();

const yearEl = document.querySelector("[data-year]");
if (yearEl) yearEl.textContent = String(new Date().getFullYear());

if (isFirebaseConfigured) {
  redirectIfAuthed("/dashboard");
}
