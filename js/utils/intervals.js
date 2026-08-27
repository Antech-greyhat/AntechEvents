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

// Subtracts a set of "cut" intervals from each "base" interval, returning the
// remaining disjoint pieces. Both inputs are lists of { start, end } Date-likes;
// output is sorted, merged, and free of zero-length slivers. Pure.
export function subtractIntervals(base, cut) {
  const cuts = mergeIntervals(cut);
  const out = [];
  for (const b of mergeIntervals(base)) {
    let segments = [{ start: b.start, end: b.end }];
    for (const c of cuts) {
      const next = [];
      for (const seg of segments) {
        if (c.end <= seg.start || c.start >= seg.end) {
          next.push(seg); // no overlap — keep the segment whole
          continue;
        }
        if (c.start > seg.start) next.push({ start: seg.start, end: c.start });
        if (c.end < seg.end) next.push({ start: c.end, end: seg.end });
      }
      segments = next;
    }
    out.push(...segments);
  }
  return mergeIntervals(out);
}

// Builds a privacy-safe free/busy snapshot: merged busy intervals within a
// rolling window, derived from non-cancelled events + manual busy periods.
// Times only — no titles, locations, or item counts. Not-important events that
// haven't been superseded are surfaced separately as `flexible` (requestable)
// time. Callers convert the Date intervals to Firestore Timestamps at the
// storage boundary.
export function buildBusySnapshot(events = [], busy = [], { fromDate, days = 60 } = {}) {
  const from = startOfDay(fromDate || new Date());
  const to = endOfDay(addDays(from, days));
  const clip = (s, e) => ({
    start: s < from ? from : s,
    end: e > to ? to : e,
  });
  const hard = [];
  const flex = [];
  (events || [])
    .filter((e) => e && e.status !== "cancelled")
    .forEach((e) => {
      const s = toDate(e.startAt);
      const en = toDate(e.endAt);
      if (!(s && en && en > s && en >= from && s <= to)) return;
      const clipped = clip(s, en);
      if (e.priority === "low" && !e.secondaryOfId) {
        flex.push(clipped);
      } else {
        hard.push(clipped);
      }
    });
  (busy || []).forEach((b) => {
    const s = toDate(b.startAt);
    const en = toDate(b.endAt);
    if (s && en && en > s && en >= from && s <= to) hard.push(clip(s, en));
  });
  const intervals = mergeIntervals(hard);
  // Flexible time must never overlap hard-busy time.
  const flexible = subtractIntervals(flex, intervals);
  return { from, to, intervals, flexible };
}
