// Pure date helpers. No Firebase, no DOM — safe to unit test in isolation.

// Normalizes Firestore Timestamps, Date objects, ISO strings, and epoch numbers to a Date.
export function toDate(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === "object" && typeof value.toDate === "function") {
    try {
      return value.toDate();
    } catch {
      return null;
    }
  }
  if (typeof value === "object" && typeof value.seconds === "number") {
    return new Date(value.seconds * 1000);
  }
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

// Deterministic interval overlap: startA < endB && endA > startB.
export function overlaps(startA, endA, startB, endB) {
  const aStart = toDate(startA);
  const aEnd = toDate(endA);
  const bStart = toDate(startB);
  const bEnd = toDate(endB);
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  return aStart < bEnd && aEnd > bStart;
}

export function startOfDay(date) {
  const d = toDate(date) || new Date();
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function endOfDay(date) {
  const d = toDate(date) || new Date();
  const copy = new Date(d);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

export function addDays(date, amount) {
  const d = toDate(date) || new Date();
  const copy = new Date(d);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

export function addMinutes(date, amount) {
  const d = toDate(date) || new Date();
  return new Date(d.getTime() + amount * 60000);
}

// Week starts on Monday to match the agenda and calendar views.
export function startOfWeek(date) {
  const d = startOfDay(date);
  const day = (d.getDay() + 6) % 7;
  return addDays(d, -day);
}

export function endOfWeek(date) {
  return endOfDay(addDays(startOfWeek(date), 6));
}

export function startOfMonth(date) {
  const d = toDate(date) || new Date();
  return startOfDay(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function endOfMonth(date) {
  const d = toDate(date) || new Date();
  return endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

export function isSameDay(a, b) {
  const da = toDate(a);
  const db = toDate(b);
  if (!da || !db) return false;
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

export function isToday(date) {
  return isSameDay(date, new Date());
}

export function isPast(date) {
  const d = toDate(date);
  return d ? d.getTime() < Date.now() : false;
}

export function isFuture(date) {
  const d = toDate(date);
  return d ? d.getTime() > Date.now() : false;
}

export function durationMinutes(start, end) {
  const s = toDate(start);
  const e = toDate(end);
  if (!s || !e) return 0;
  return Math.max(0, Math.round((e.getTime() - s.getTime()) / 60000));
}

// Value string for <input type="datetime-local">, kept in the browser's local time.
export function toDatetimeLocalValue(date) {
  const d = toDate(date);
  if (!d) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export function fromDatetimeLocalValue(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export function getBrowserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
