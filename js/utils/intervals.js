// Pure interval math shared by the availability view and the share snapshot.
// No Firebase, no DOM — safe to unit test in isolation.
import { toDate, startOfDay, endOfDay, addDays } from "./dates.js";

// Merges overlapping or touching intervals so busy time isn't double-counted.
// Input items are { start, end } (Date-like); output is a sorted list of disjoint
// { start, end } Dates. Zero- or negative-length intervals are dropped.
export function mergeIntervals(items) {
  const sorted = (items || [])
    .map((i) => ({ start: toDate(i.start), end: toDate(i.end) }))
    .filter((i) => i.start && i.end && i.end > i.start)
    .sort((a, b) => a.start - b.start);
  const merged = [];
  for (const item of sorted) {
    const last = merged[merged.length - 1];
    if (last && item.start <= last.end) {
      if (item.end > last.end) last.end = item.end;
    } else {
      merged.push({ start: new Date(item.start), end: new Date(item.end) });
    }
  }
  return merged;
}

// Builds a privacy-safe free/busy snapshot: merged busy intervals within a
// rolling window, derived from non-cancelled events + manual busy periods.
// Times only — no titles, locations, or item counts. Callers convert the Date
// intervals to Firestore Timestamps at the storage boundary.
export function buildBusySnapshot(events = [], busy = [], { fromDate, days = 60 } = {}) {
  const from = startOfDay(fromDate || new Date());
  const to = endOfDay(addDays(from, days));
  const clip = (s, e) => ({
    start: s < from ? from : s,
    end: e > to ? to : e,
  });
  const raw = [];
  (events || [])
    .filter((e) => e && e.status !== "cancelled")
    .forEach((e) => {
      const s = toDate(e.startAt);
      const en = toDate(e.endAt);
      if (s && en && en > s && en >= from && s <= to) raw.push(clip(s, en));
    });
  (busy || []).forEach((b) => {
    const s = toDate(b.startAt);
    const en = toDate(b.endAt);
    if (s && en && en > s && en >= from && s <= to) raw.push(clip(s, en));
  });
  return { from, to, intervals: mergeIntervals(raw) };
}
