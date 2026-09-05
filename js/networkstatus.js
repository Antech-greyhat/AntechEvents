// Subtle, non-permanent connectivity feedback. Announces going offline and coming
// back online through a small pill, without stealing layout space or auto-retrying
// anything (a failed destructive action must never silently repeat). Feature-detected.
import { icon } from "./ui.js";

let pill = null;
let hideTimer = null;

function ensurePill() {
  if (pill) return pill;
  pill = document.createElement("div");
  pill.id = "netStatusPill";
  pill.setAttribute("role", "status");
  pill.setAttribute("aria-live", "polite");
  pill.className =
    "fixed left-1/2 top-3 z-[80] flex -translate-x-1/2 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm transition-opacity duration-200";
  document.body.appendChild(pill);
  return pill;
}

function show(kind) {
  const el = ensurePill();
  clearTimeout(hideTimer);
  const offline = kind === "offline";
  el.className = `fixed left-1/2 top-3 z-[80] flex -translate-x-1/2 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm transition-opacity duration-200 ${
    offline
      ? "border-warning/40 bg-warning/10 text-warning"
      : "border-success/40 bg-success/10 text-success"
  }`;
  el.innerHTML = `${icon(offline ? "wifiOff" : "wifi", { size: 14 })}<span>${
    offline ? "You're offline" : "Back online"
  }</span>`;
  el.style.opacity = "1";
  // Keep the offline notice visible; auto-dismiss the transient "back online" one.
  if (!offline) {
    hideTimer = setTimeout(() => {
      el.style.opacity = "0";
    }, 3000);
  }
}

export function initNetworkStatus() {
  if (typeof window === "undefined" || !("onLine" in navigator)) return;
  window.addEventListener("offline", () => show("offline"));
  window.addEventListener("online", () => show("online"));
  if (!navigator.onLine) show("offline");
}
