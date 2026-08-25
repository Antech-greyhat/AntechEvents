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
