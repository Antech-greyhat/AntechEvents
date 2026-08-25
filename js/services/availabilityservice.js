// Availability data access: manually-blocked busy periods stored per owner.
// Free/busy computation combines these with events in the availability page.
import {
  db,
  collection,
  doc,
  getDocs,
  addDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from "../firebase.js";
import { toDate } from "../utils/dates.js";

function toTimestamp(value) {
  const date = toDate(value);
  return date ? Timestamp.fromDate(date) : null;
}

export async function listBusyPeriods(ownerId, { max = 300 } = {}) {
  const busyQuery = query(
    collection(db, "availability"),
    where("ownerId", "==", ownerId),
    orderBy("startAt", "asc"),
    limit(max)
  );
  const snapshot = await getDocs(busyQuery);
  return snapshot.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
}

export async function addBusyPeriod(ownerId, { title, startAt, endAt }) {
  const payload = {
    ownerId,
    title: (title || "Busy").trim() || "Busy",
    startAt: toTimestamp(startAt),
    endAt: toTimestamp(endAt),
    createdAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, "availability"), payload);
  return ref.id;
}

export async function deleteBusyPeriod(periodId) {
  await deleteDoc(doc(db, "availability", periodId));
}
