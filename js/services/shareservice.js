// Data access for shareable free/busy links and the requests visitors leave on
// them. A share doc's id *is* the capability token (see js/utils/token.js): the
// doc is publicly readable while not revoked, but can't be listed by the public,
// so possession of the link is the only way to reach it.
//
// Only merged busy time ranges are stored here — never event titles, locations,
// notes, or counts. The private `events` / `availability` collections are never
// exposed; this collection is the entire public surface.
import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from "../firebase.js";
import { toDate } from "../utils/dates.js";
import { randomToken } from "../utils/token.js";

const SHARES = "shares";
const SUBMISSIONS = "submissions";

function toTimestamp(value) {
  const date = toDate(value);
  return date ? Timestamp.fromDate(date) : null;
}

function clampString(value, max) {
  return (value == null ? "" : String(value)).trim().slice(0, max);
}

// Converts a { from, to, intervals:[{start,end}] } snapshot of Dates into the
// Firestore-ready shape (Timestamps), dropping any malformed intervals.
function serializeSnapshot(snapshot) {
  const from = toTimestamp(snapshot && snapshot.from);
  const to = toTimestamp(snapshot && snapshot.to);
  const intervals = ((snapshot && snapshot.intervals) || [])
    .map((i) => ({ start: toTimestamp(i.start), end: toTimestamp(i.end) }))
    .filter((i) => i.start && i.end);
  return { from, to, intervals };
}

function mapShareDoc(snap) {
  return { token: snap.id, ...(snap.data() || {}) };
}

// Sorts newest-first by a Firestore Timestamp field, tolerating missing values
// (a serverTimestamp reads back null until the write lands). Done in memory so
// the owner list query needs no composite index.
function byCreatedDesc(a, b) {
  const at = toDate(a.createdAt);
  const bt = toDate(b.createdAt);
  return (bt ? bt.getTime() : 0) - (at ? at.getTime() : 0);
}

// Creates a link and returns its token. `snapshot` is a busy snapshot built with
// buildBusySnapshot(); permissions default to view-only.
export async function createShare(ownerId, options, snapshot) {
  const opts = options || {};
  const token = randomToken();
  await setDoc(doc(db, SHARES, token), {
    ownerId,
    label: clampString(opts.label, 80),
    ownerName: clampString(opts.ownerName, 80),
    timezone: clampString(opts.timezone, 80),
    allowNotes: Boolean(opts.allowNotes),
    allowProposals: Boolean(opts.allowProposals),
    revoked: false,
    snapshot: serializeSnapshot(snapshot),
    snapshotUpdatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
  return token;
}

// Owner's own links, newest first. Queried by ownerId only (no composite index).
export async function listShares(ownerId) {
  const sharesQuery = query(
    collection(db, SHARES),
    where("ownerId", "==", ownerId)
  );
  const snapshot = await getDocs(sharesQuery);
  return snapshot.docs.map(mapShareDoc).sort(byCreatedDesc);
}

// Public read of a single link. NOTE: the security rules DENY `get` on a missing
// or revoked doc, so this REJECTS rather than resolving to null in those cases —
// callers must try/catch and treat any failure as "link unavailable".
export async function getShare(token) {
  const snap = await getDoc(doc(db, SHARES, token));
  return snap.exists() ? mapShareDoc(snap) : null;
}

export async function updateShareSnapshot(token, snapshot) {
  await updateDoc(doc(db, SHARES, token), {
    snapshot: serializeSnapshot(snapshot),
    snapshotUpdatedAt: serverTimestamp(),
  });
}

// Refreshes the stored snapshot for every non-revoked link the owner has, so the
// public view reflects the owner's latest events/busy periods.
export async function refreshOwnerShares(ownerId, snapshot) {
  const shares = await listShares(ownerId);
  const active = shares.filter((s) => s.revoked !== true);
  await Promise.all(active.map((s) => updateShareSnapshot(s.token, snapshot)));
  return active.length;
}

export async function setShareRevoked(token, revoked) {
  await updateDoc(doc(db, SHARES, token), { revoked: Boolean(revoked) });
}

// Updates only the permission flags that are present in `permissions`.
export async function updateSharePermissions(token, permissions) {
  const patch = {};
  if (typeof permissions.allowNotes === "boolean")
    patch.allowNotes = permissions.allowNotes;
  if (typeof permissions.allowProposals === "boolean")
    patch.allowProposals = permissions.allowProposals;
  if (Object.keys(patch).length === 0) return;
  await updateDoc(doc(db, SHARES, token), patch);
}

export async function deleteShare(token) {
  await deleteDoc(doc(db, SHARES, token));
}

// --- Submissions (notes and meeting proposals left by visitors) ---------------

// Public create. The rules enforce the parent link isn't revoked, the matching
// capability flag is on, and the field shapes/sizes below; keep this in sync with
// firebase/firestore.rules. Proposal timestamps are only attached for proposals.
export async function addSubmission(token, data) {
  const type = data.type === "proposal" ? "proposal" : "note";
  const payload = {
    type,
    name: clampString(data.name, 80),
    email: clampString(data.email, 160),
    message: clampString(data.message, 1000),
    status: "pending",
    createdAt: serverTimestamp(),
  };
  if (type === "proposal") {
    payload.proposedStart = toTimestamp(data.proposedStart);
    payload.proposedEnd = toTimestamp(data.proposedEnd);
  }
  const ref = await addDoc(
    collection(db, SHARES, token, SUBMISSIONS),
    payload
  );
  return ref.id;
}

// Owner-only: every request left on one of the owner's links, newest first.
export async function listSubmissions(token) {
  const snapshot = await getDocs(collection(db, SHARES, token, SUBMISSIONS));
  return snapshot.docs
    .map((snap) => ({ id: snap.id, ...(snap.data() || {}) }))
    .sort(byCreatedDesc);
}

const SUBMISSION_STATUSES = ["pending", "accepted", "dismissed"];

export async function setSubmissionStatus(token, subId, status) {
  const next = SUBMISSION_STATUSES.includes(status) ? status : "pending";
  await updateDoc(doc(db, SHARES, token, SUBMISSIONS, subId), { status: next });
}

export async function deleteSubmission(token, subId) {
  await deleteDoc(doc(db, SHARES, token, SUBMISSIONS, subId));
}
