// Event data access. All Firestore reads/writes for events live here — no rendering,
// no auth logic. Callers pass Date objects; timestamps are handled at this boundary.
import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from "../firebase.js";
import { normalizeUrl } from "../utils/validation.js";
import { getBrowserTimezone, toDate } from "../utils/dates.js";

export const EVENT_STATUSES = [
  "planned",
  "registered",
  "confirmed",
  "attended",
  "cancelled",
];

// Blank model used to seed the create form.
export function emptyEvent() {
  return {
    title: "",
    description: "",
    startAt: null,
    endAt: null,
    timezone: getBrowserTimezone(),
    location: "",
    eventUrl: "",
    registrationUrl: "",
    organizer: "",
    notes: "",
    status: "planned",
    eventMode: "physical",
    priority: "normal",
    reminderSettings: { enabled: false, minutesBefore: 60 },
  };
}

function toTimestamp(value) {
  const date = toDate(value);
  return date ? Timestamp.fromDate(date) : null;
}

// Normalizes and trims form input into a Firestore-ready payload.
function buildPayload(input) {
  return {
    title: (input.title || "").trim(),
    description: (input.description || "").trim(),
    startAt: toTimestamp(input.startAt),
    endAt: toTimestamp(input.endAt),
    timezone: input.timezone || getBrowserTimezone(),
    location: (input.location || "").trim(),
    eventUrl: input.eventUrl ? normalizeUrl(input.eventUrl) : "",
    registrationUrl: input.registrationUrl
      ? normalizeUrl(input.registrationUrl)
      : "",
    organizer: (input.organizer || "").trim(),
    notes: (input.notes || "").trim(),
    status: EVENT_STATUSES.includes(input.status) ? input.status : "planned",
    // Online vs physical. This was previously dropped here and never persisted.
    eventMode: input.eventMode === "online" ? "online" : "physical",
    // "low" marks a not-important event whose time others may request.
    priority: input.priority === "low" ? "low" : "normal",
    reminderSettings: input.reminderSettings || {
      enabled: false,
      minutesBefore: 60,
    },
  };
}

export function mapEventDoc(snapshot) {
  return { id: snapshot.id, ...(snapshot.data() || {}) };
}

export async function createEvent(ownerId, input) {
  const payload = {
    ...buildPayload(input),
    ownerId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, "events"), payload);
  return ref.id;
}

export async function updateEvent(eventId, input) {
  const payload = { ...buildPayload(input), updatedAt: serverTimestamp() };
  await updateDoc(doc(db, "events", eventId), payload);
}

export async function getEvent(eventId) {
  const snapshot = await getDoc(doc(db, "events", eventId));
  return snapshot.exists() ? mapEventDoc(snapshot) : null;
}

// Owner-scoped list ordered by start time; bounded to keep reads efficient.
export async function listEvents(ownerId, { max = 500 } = {}) {
  const eventsQuery = query(
    collection(db, "events"),
    where("ownerId", "==", ownerId),
    orderBy("startAt", "asc"),
    limit(max)
  );
  const snapshot = await getDocs(eventsQuery);
  return snapshot.docs.map(mapEventDoc);
}

export async function setEventStatus(eventId, status) {
  const next = EVENT_STATUSES.includes(status) ? status : "planned";
  await updateDoc(doc(db, "events", eventId), {
    status: next,
    updatedAt: serverTimestamp(),
  });
}

// Narrow write used when a not-important event is superseded by an approved
// request: it's tagged as secondary to the new main event and stops counting
// as a conflict (see js/conflicts.js). Deliberately kept off buildPayload so
// ordinary edits never clear it. Pass null to un-mark.
export async function setEventSecondary(eventId, primaryId) {
  await updateDoc(doc(db, "events", eventId), {
    secondaryOfId: primaryId || null,
    updatedAt: serverTimestamp(),
  });
}

// Records the owner's post-event answer (F5). "Attended" also flips status to
// the existing "attended" state so no new status/badge is needed; "didn't
// attend" keeps the current status but stores the reason. reviewedAt is stamped
// server-side and is what stops the app from asking again (see the attendance
// notification in js/notifications.js). Like secondaryOfId this is kept off
// buildPayload so an ordinary edit never wipes the recorded answer. The caller
// passes a plain object; only known fields are persisted.
export async function setAttendance(eventId, attendance) {
  const input = attendance || {};
  const attended = input.attended === true;
  const record = {
    attended,
    notes: attended ? (input.notes || "").trim() : "",
    reasonCategory: attended ? "" : input.reasonCategory || "",
    reasonDetail: attended ? "" : (input.reasonDetail || "").trim(),
    reviewedAt: serverTimestamp(),
  };
  const payload = { attendance: record, updatedAt: serverTimestamp() };
  if (attended) payload.status = "attended";
  await updateDoc(doc(db, "events", eventId), payload);
}

export async function deleteEvent(eventId) {
  await deleteDoc(doc(db, "events", eventId));
}

// Clones an event as a fresh "planned" draft owned by the same user.
export async function duplicateEvent(ownerId, event) {
  const input = {
    ...event,
    title: `Copy of ${event.title || "Untitled event"}`,
    status: "planned",
    startAt: toDate(event.startAt),
    endAt: toDate(event.endAt),
  };
  return createEvent(ownerId, input);
}
