// Reads for the derived notification feed, plus the single write that advances
// the "read" cursor. There is no notifications collection: the feed is computed
// on load (see js/notifications.js) from the owner's own events + the
// submissions left on their share links.
import { db, doc, updateDoc, serverTimestamp } from "../firebase.js";
import { listEvents } from "./eventservice.js";
import { listShares, listSubmissions } from "./shareservice.js";

// Gathers everything the deriver needs in as few reads as the no-backend model
// allows: the owner's events, their share links, and each link's submissions.
// Returns { events, submissions } where every submission is tagged with its
// parent link's token + label. Individual failures degrade to empty lists so a
// single unreadable link never blanks the whole bell.
export async function loadNotificationData(uid) {
  const [events, shares] = await Promise.all([
    listEvents(uid).catch(() => []),
    listShares(uid).catch(() => []),
  ]);
  const submissionLists = await Promise.all(
    shares.map((share) =>
      listSubmissions(share.token)
        .then((subs) =>
          subs.map((sub) => ({
            ...sub,
            shareToken: share.token,
            shareLabel: share.label || "",
          }))
        )
        .catch(() => [])
    )
  );
  return { events, submissions: submissionLists.flat() };
}

// Marks everything up to now as read by advancing the profile cursor.
export async function markAllRead(uid) {
  await updateDoc(doc(db, "users", uid), {
    notificationsReadAt: serverTimestamp(),
  });
}
