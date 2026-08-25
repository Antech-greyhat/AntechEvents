// Presentation-only formatting helpers built on Intl and the date utilities.
import {
  toDate,
  isSameDay,
  isToday,
  startOfDay,
  durationMinutes,
} from "./dates.js";

const dateFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});

const dateFullFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

export function formatDate(value) {
  const d = toDate(value);
  return d ? dateFmt.format(d) : "—";
}

export function formatFullDate(value) {
  const d = toDate(value);
  return d ? dateFullFmt.format(d) : "—";
}

export function formatTime(value) {
  const d = toDate(value);
  return d ? timeFmt.format(d) : "—";
}

export function formatDateTime(value) {
  const d = toDate(value);
  return d ? `${dateFmt.format(d)}, ${timeFmt.format(d)}` : "—";
}

// "Today", "Tomorrow", "Yesterday", or a short date for anything else.
export function formatRelativeDay(value) {
  const d = toDate(value);
  if (!d) return "—";
  const today = startOfDay(new Date());
  const diff = Math.round((startOfDay(d) - today) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return dateFmt.format(d);
}

// Compact range: same day collapses to one date with a time span.
export function formatDateRange(start, end) {
  const s = toDate(start);
  const e = toDate(end);
  if (!s) return "—";
  if (!e) return formatDateTime(s);
  if (isSameDay(s, e)) {
    return `${dateFmt.format(s)}, ${timeFmt.format(s)} – ${timeFmt.format(e)}`;
  }
  return `${formatDateTime(s)} → ${formatDateTime(e)}`;
}

export function formatDuration(minutes) {
  const total = Number(minutes) || 0;
  if (total <= 0) return "";
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours) return `${hours}h`;
  return `${mins}m`;
}

export function formatEventDuration(start, end) {
  return formatDuration(durationMinutes(start, end));
}

// Metadata for each lifecycle status: label, badge class, and icon name.
export const statusMeta = {
  planned: { label: "Planned", badge: "badge-planned", icon: "circleDashed" },
  registered: { label: "Registered", badge: "badge-registered", icon: "clipboardCheck" },
  confirmed: { label: "Confirmed", badge: "badge-confirmed", icon: "check" },
  attended: { label: "Attended", badge: "badge-attended", icon: "checkCheck" },
  cancelled: { label: "Cancelled", badge: "badge-cancelled", icon: "ban" },
};

export function statusLabel(status) {
  return (statusMeta[status] || statusMeta.planned).label;
}

// Metadata for conflict states.
export const conflictMeta = {
  noConflict: { label: "No conflict", badge: "badge-clear", icon: "check" },
  conflict: { label: "Conflict", badge: "badge-conflict", icon: "alertTriangle" },
  possibleConflict: {
    label: "Possible conflict",
    badge: "badge-possible",
    icon: "info",
  },
};

export function initialsFrom(nameOrEmail) {
  const value = (nameOrEmail || "").trim();
  if (!value) return "?";
  const parts = value.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function truncate(text, max = 120) {
  const value = String(text || "");
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

export function pluralize(count, singular, plural) {
  return count === 1 ? singular : plural || `${singular}s`;
}
