// Deterministic conflict detection for personal events.
// A conflict exists when two active events overlap: startA < endB && endA > startB.
// Cancelled events never participate in active conflict detection.
import { toDate, overlaps, isSameDay } from "./utils/dates.js";

export const CONFLICT = {
  none: "noConflict",
  conflict: "conflict",
  possible: "possibleConflict",
};

// Resolves an event to a {start, end} interval; end may be null when unknown.
export function eventInterval(event) {
  const start = toDate(event && event.startAt);
  const end = toDate(event && event.endAt);
  return { start, end };
}

function isActive(event) {
  return event && event.status !== "cancelled";
}

// Compares one target event against a list of others.
// Returns { state, conflicts } where conflicts is the list of overlapping events.
export function detectConflict(target, others) {
  const target_interval = eventInterval(target);
  if (!target_interval.start) {
    return { state: CONFLICT.possible, conflicts: [], reason: "missingStart" };
  }
  if (!isActive(target)) {
    return { state: CONFLICT.none, conflicts: [] };
  }

  const candidates = (others || []).filter(
    (event) => event && event.id !== target.id && isActive(event)
  );

  const hardConflicts = [];
  const uncertain = [];

  for (const event of candidates) {
    const other = eventInterval(event);
    if (!other.start) continue;
    const bothRanged = target_interval.end && other.end;
    if (bothRanged) {
      if (
        overlaps(
          target_interval.start,
          target_interval.end,
          other.start,
          other.end
        )
      ) {
        hardConflicts.push(event);
      }
    } else if (isSameDay(target_interval.start, other.start)) {
      // Same day but at least one event lacks an end time — data is incomplete.
      uncertain.push(event);
    }
  }

  if (hardConflicts.length) {
    return { state: CONFLICT.conflict, conflicts: hardConflicts };
  }
  if (uncertain.length) {
    return { state: CONFLICT.possible, conflicts: uncertain };
  }
  return { state: CONFLICT.none, conflicts: [] };
}

// Builds a Map of eventId → { state, conflicts } for a whole list of events.
export function findConflicts(events) {
  const list = events || [];
  const map = new Map();
  for (const event of list) {
    if (!event || !event.id) continue;
    map.set(event.id, detectConflict(event, list));
  }
  return map;
}

// True when any active event in the list conflicts with another.
export function hasAnyConflict(events) {
  const map = findConflicts(events);
  for (const value of map.values()) {
    if (value.state === CONFLICT.conflict) return true;
  }
  return false;
}
