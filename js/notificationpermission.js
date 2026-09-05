// Client-only local notifications. No FCM, no tokens, no server: on the free plan
// there is nothing to *send* a background push, so instead we surface reminders the
// app already derives on load as real OS notifications via the service worker. This
// works only while a tab is open, which is stated plainly in the opt-in copy.
import { formatTime } from "./utils/formatters.js";

// Session guard so the same reminder can't re-fire on repeated loads within a tab.
const shownThisSession = new Set();

export function notificationsSupported() {
  return typeof Notification !== "undefined" && "serviceWorker" in navigator;
}

export function permissionState() {
  return notificationsSupported() ? Notification.permission : "unsupported";
}

// Requests permission on an explicit user action only. Resolves to the resulting
// state ("granted" | "denied" | "default" | "unsupported").
export async function requestNotificationPermission() {
  if (!notificationsSupported()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

// Fires OS notifications for reminder items that are due now, once per tab session.
// Privacy: title + start time only — never notes, location, or organizer. Silently
// no-ops unless permission is granted and a service worker controls the page.
export async function fireDueReminders(list, events) {
  if (permissionState() !== "granted") return;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return;

  const byId = new Map((events || []).map((e) => [e.id, e]));
  for (const n of list || []) {
    if (n.type !== "reminder" || n.read) continue;
    const key = n.id;
    if (shownThisSession.has(key)) continue;
    shownThisSession.add(key);

    const eventId = key.startsWith("rem:") ? key.slice(4) : null;
    const event = eventId ? byId.get(eventId) : null;
    const body = event && event.startAt ? `Starts at ${formatTime(event.startAt)}` : "";
    reg.showNotification(n.title, {
      body,
      tag: key,
      renotify: false,
      icon: "/assets/icons/favicon.svg",
      badge: "/assets/icons/favicon.svg",
      data: { href: n.href || "/dashboard" },
    });
  }
}
