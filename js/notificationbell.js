// Header notification bell: an unread badge, a dropdown of the five most recent
// items, "Mark all as read", and a "Show all" panel. Data is derived once on
// load (no real-time listeners). The static bell shell lives in the header
// markup (js/navigation.js); this module fills it in after initShell mounts the
// chrome, so every authenticated page gets a live bell without blocking render.
import { icon, escapeHtml, openModal, toast } from "./ui.js";
import { wireDropdown } from "./navigation.js";
import { deriveNotifications } from "./notifications.js";
import { loadNotificationData, markAllRead } from "./services/notificationservice.js";
import { openAttendanceDialog } from "./attendance.js";
import { formatTimeAgo } from "./utils/formatters.js";

const DROPDOWN_LIMIT = 5;

const state = { user: null, profile: null, list: [], events: [], dropdown: null };

function unreadItems() {
  return state.list.filter((n) => !n.read);
}

function itemHtml(n) {
  const unread = !n.read;
  const inner = `
    <span class="mt-0.5 shrink-0 text-muted">${icon(n.iconName || "info", {
      size: 16,
    })}</span>
    <span class="min-w-0 flex-1">
      <span class="flex items-center gap-1.5">
        ${
          unread
            ? '<span class="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary"></span>'
            : ""
        }
        <span class="truncate text-sm font-medium text-ink">${escapeHtml(
          n.title
        )}</span>
      </span>
      ${
        n.body
          ? `<span class="mt-0.5 block truncate text-xs text-muted">${escapeHtml(
              n.body
            )}</span>`
          : ""
      }
      <span class="mt-0.5 block text-[11px] text-slate-400">${escapeHtml(
        formatTimeAgo(n.at)
      )}</span>
    </span>`;
  const cls = `flex w-full cursor-pointer gap-3 px-3 py-2.5 text-left hover:bg-subtle ${
    unread ? "" : "opacity-70"
  }`;
  // Attendance items open the review dialog in place instead of navigating away.
  if (n.type === "attendance" && n.eventId) {
    return `<button type="button" data-review="${escapeHtml(
      n.eventId
    )}" class="${cls}">${inner}</button>`;
  }
  return `<a href="${escapeHtml(n.href || "#")}" class="${cls}">${inner}</a>`;
}

function dropdownHtml(list) {
  const hasUnread = list.some((n) => !n.read);
  const top = list.slice(0, DROPDOWN_LIMIT);
  const body = top.length
    ? top.map(itemHtml).join("")
    : `<div class="px-3 py-8 text-center">
        <span class="mb-2 inline-flex text-slate-300">${icon("checkCheck", {
          size: 24,
        })}</span>
        <p class="text-sm text-muted">You're all caught up.</p>
      </div>`;
  return `
    <div class="flex items-center justify-between border-b border-line px-3 py-2.5">
      <p class="text-sm font-semibold text-ink">Notifications</p>
      <button type="button" data-notif-readall class="text-xs font-medium text-primary hover:underline disabled:cursor-default disabled:text-muted disabled:no-underline"${
        hasUnread ? "" : " disabled"
      }>Mark all read</button>
    </div>
    <div class="max-h-80 divide-y divide-line overflow-y-auto">${body}</div>
    <div class="border-t border-line p-1.5">
      <button type="button" data-notif-more class="nav-link w-full justify-center text-sm font-medium text-primary">Show all notifications</button>
    </div>`;
}

function panelHtml(list) {
  if (!list.length) {
    return `<div class="py-6 text-center">
      <span class="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-subtle text-muted">${icon(
        "inbox",
        { size: 24 }
      )}</span>
      <h3 class="text-base font-semibold text-ink">No notifications</h3>
      <p class="mt-1 text-sm text-muted">Messages, meeting requests, and reminders will show up here.</p>
    </div>`;
  }
  const unread = list.filter((n) => !n.read).length;
  return `
    <div class="mb-3 flex items-center justify-between">
      <p class="text-sm text-muted">${unread} unread</p>
      <button type="button" data-notif-readall class="text-sm font-medium text-primary hover:underline disabled:text-muted disabled:no-underline"${
        unread ? "" : " disabled"
      }>Mark all as read</button>
    </div>
    <div class="divide-y divide-line overflow-hidden rounded-card border border-line">${list
      .map(itemHtml)
      .join("")}</div>`;
}

function renderBadge(badge) {
  if (!badge) return;
  const count = unreadItems().length;
  badge.innerHTML = count
    ? `<span class="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-none text-white">${
        count > 9 ? "9+" : count
      }</span>`
    : "";
}

function refresh(header) {
  renderBadge(header.querySelector("[data-notif-badge]"));
  const content = header.querySelector("[data-notif-content]");
  if (!content) return;
  content.innerHTML = dropdownHtml(state.list);
  const readAll = content.querySelector("[data-notif-readall]");
  if (readAll) readAll.addEventListener("click", () => doMarkAllRead(header));
  const more = content.querySelector("[data-notif-more]");
  if (more) more.addEventListener("click", () => openPanel(header));
  content.querySelectorAll("[data-review]").forEach((btn) =>
    btn.addEventListener("click", () => {
      if (state.dropdown) state.dropdown.close();
      openReview(header, btn.getAttribute("data-review"));
    })
  );
}

// Opens the attendance dialog for an event referenced by a notification. After a
// successful save it re-derives the feed so the item clears; afterSave lets the
// caller (e.g. the full panel) close itself first.
function openReview(header, eventId, afterSave) {
  const event = (state.events || []).find((e) => e.id === eventId);
  if (!event) return;
  openAttendanceDialog(event, {
    onSaved: () => {
      if (typeof afterSave === "function") afterSave();
      reload(header);
    },
  });
}

// Re-fetches and re-derives the feed in place (used after an attendance answer).
async function reload(header) {
  if (!state.user) return;
  let data;
  try {
    data = await loadNotificationData(state.user.uid);
  } catch {
    return;
  }
  state.events = data.events;
  state.list = deriveNotifications({
    events: data.events,
    submissions: data.submissions,
    profile: state.profile,
    now: new Date(),
  });
  refresh(header);
}

async function doMarkAllRead(header) {
  if (!state.user || !unreadItems().length) return;
  try {
    await markAllRead(state.user.uid);
  } catch {
    toast("Couldn't mark notifications as read.", "error");
    return;
  }
  state.list = state.list.map((n) => ({ ...n, read: true }));
  refresh(header);
  return true;
}

function openPanel(header) {
  // Close the dropdown through its controller so its document-level outside-click
  // and Escape listeners are torn down (a manual hide would leave them attached).
  if (state.dropdown) state.dropdown.close();

  const modal = openModal({ title: "Notifications", contentHtml: panelHtml(state.list) });
  const wirePanel = () => {
    modal.body.querySelectorAll("[data-review]").forEach((btn) =>
      btn.addEventListener("click", () =>
        openReview(header, btn.getAttribute("data-review"), modal.close)
      )
    );
    const readAll = modal.body.querySelector("[data-notif-readall]");
    if (!readAll) return;
    readAll.addEventListener("click", async () => {
      const changed = await doMarkAllRead(header);
      if (!changed) return;
      modal.body.innerHTML = panelHtml(state.list);
      wirePanel();
    });
  };
  wirePanel();
}

// Fills the header bell. Safe to call on any page: no-ops when the header has no
// bell shell (e.g. the public share page) or when there's no signed-in user.
export async function hydrateNotifications({ user, profile } = {}) {
  const header = document.getElementById("appHeader");
  if (!header || !user || !header.querySelector("[data-notif-toggle]")) return;

  state.user = user;
  state.profile = profile || null;
  state.list = [];
  state.events = [];

  state.dropdown = wireDropdown(header, {
    toggleSel: "[data-notif-toggle]",
    dropdownSel: "[data-notif-dropdown]",
  });

  let data;
  try {
    data = await loadNotificationData(user.uid);
  } catch {
    const content = header.querySelector("[data-notif-content]");
    if (content)
      content.innerHTML = `<div class="px-3 py-6 text-center text-sm text-muted">Couldn't load notifications right now.</div>`;
    return;
  }

  state.events = data.events;
  state.list = deriveNotifications({
    events: data.events,
    submissions: data.submissions,
    profile: state.profile,
    now: new Date(),
  });
  refresh(header);
}
