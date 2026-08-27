// Pure notification derivation. No Firebase, no DOM.
//
// The app has no backend, so notifications are neither stored nor pushed — they
// are recomputed on each load from data the owner can already read: visitor
// submissions on their share links, upcoming events with reminders due, and
// recently-ended events awaiting an attendance answer. "Read" state is a single
// timestamp cursor on the user profile (notificationsReadAt); anything newer is
// unread. True delivery while the app is closed would need a secure backend and
// is intentionally out of scope.
import { toDate } from "./utils/dates.js";
import { formatRelativeDay, formatDateRange } from "./utils/formatters.js";
import { nextReminderTime } from "./reminders.js";

// Only surface recently-ended events so a long backlog of un-reviewed past
// events can't flood the feed on first load.
const ATTENDANCE_LOOKBACK_DAYS = 30;

const TYPE_ICON = {
  message: "messageSquare",
  proposal: "calendarClock",
  request: "calendarPlus",
  schedule: "calendarCheck",
  reminder: "bell",
  attendance: "checkCheck",
};

export function notificationIcon(type) {
  return TYPE_ICON[type] || "info";
}

function make(id, type, title, body, at, href) {
  return {
    id,
    type,
    title,
    body: body || "",
    at: at || null,
    href: href || "#",
    iconName: notificationIcon(type),
  };
}

function slotText(sub) {
  const start = toDate(sub.proposedStart);
  if (!start) return (sub.message || "").trim();
  return formatDateRange(sub.proposedStart, sub.proposedEnd);
}

function isRead(at, readAt) {
  if (!at) return true;
  if (!readAt) return false;
  return at.getTime() <= readAt.getTime();
}

// events: listEvents() result. submissions: a flat list, each tagged with its
// parent link's shareToken/shareLabel. profile: the user profile doc (for
// notificationsReadAt + preferences.notifications). now: a Date.
export function deriveNotifications({
  events = [],
  submissions = [],
  profile = null,
  now = new Date(),
} = {}) {
  const nowMs = now.getTime();
  const readAt = toDate(profile && profile.notificationsReadAt);
  const prefs =
    (profile && profile.preferences && profile.preferences.notifications) || {};
  const remindersOn = prefs.reminders !== false;
  const lookbackMs = ATTENDANCE_LOOKBACK_DAYS * 86400000;
  const out = [];

  for (const sub of submissions) {
    if (!sub) continue;
    const who = (sub.name || "").trim() || "Someone";
    const at = toDate(sub.createdAt);
    const id = `sub:${sub.shareToken}:${sub.id}`;
    const href = "/availability";
    if (sub.status === "pending" && sub.type === "note") {
      out.push(make(id, "message", `New note from ${who}`, sub.message, at, href));
    } else if (sub.status === "pending" && sub.type === "proposal") {
      out.push(
        make(id, "proposal", `Meeting proposal from ${who}`, slotText(sub), at, href)
      );
    } else if (sub.status === "pending" && sub.type === "request") {
      out.push(
        make(id, "request", `Time request from ${who}`, slotText(sub), at, href)
      );
    } else if (
      sub.status === "accepted" &&
      (sub.type === "proposal" || sub.type === "request")
    ) {
      out.push(
        make(id, "schedule", `Scheduled with ${who}`, slotText(sub), at, href)
      );
    }
  }

  for (const event of events) {
    if (!event || event.status === "cancelled") continue;
    const start = toDate(event.startAt);
    const end = toDate(event.endAt) || start;
    const title = (event.title || "").trim() || "Untitled event";
    const href = `/event?id=${encodeURIComponent(event.id)}`;

    if (remindersOn) {
      const remindAt = nextReminderTime(event);
      if (remindAt && remindAt.getTime() <= nowMs && start && start.getTime() > nowMs) {
        out.push(
          make(
            `rem:${event.id}`,
            "reminder",
            `Reminder: ${title}`,
            `Starts ${formatRelativeDay(start)}`,
            remindAt,
            href
          )
        );
      }
    }

    const reviewed = event.attendance && event.attendance.reviewedAt;
    if (
      end &&
      end.getTime() < nowMs &&
      nowMs - end.getTime() <= lookbackMs &&
      event.status !== "attended" &&
      !reviewed
    ) {
      out.push({
        ...make(
          `att:${event.id}`,
          "attendance",
          `How did "${title}" go?`,
          "Let us know if you attended.",
          end,
          href
        ),
        // Lets the bell open the attendance dialog for this event directly
        // instead of just linking to its detail page.
        eventId: event.id,
      });
    }
  }

  out.sort((a, b) => (b.at ? b.at.getTime() : 0) - (a.at ? a.at.getTime() : 0));
  return out.map((n) => ({ ...n, read: isRead(n.at, readAt) }));
}

export function unreadCount(list) {
  return (list || []).filter((n) => !n.read).length;
}
