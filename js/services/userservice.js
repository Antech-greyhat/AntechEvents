// User profile and preferences data access.
import {
  db,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "../firebase.js";
import { getBrowserTimezone } from "../utils/dates.js";

export function defaultPreferences() {
  return {
    timezone: getBrowserTimezone(),
    weekStartsOn: 1,
    defaultEventDurationMinutes: 60,
    defaultReminderMinutes: 60,
    notifications: {
      conflictAlerts: true,
      reminders: true,
      weeklySummary: false,
    },
  };
}

export async function getUserProfile(uid) {
  const snapshot = await getDoc(doc(db, "users", uid));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

// Creates the profile document on first sign-in; returns the current profile.
export async function ensureUserProfile(user) {
  const ref = doc(db, "users", user.uid);
  const snapshot = await getDoc(ref);
  if (snapshot.exists()) {
    return { id: snapshot.id, ...snapshot.data() };
  }
  const profile = {
    uid: user.uid,
    email: user.email || "",
    displayName: user.displayName || "",
    preferences: defaultPreferences(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, profile);
  return { id: user.uid, ...profile };
}

export async function updateUserProfile(uid, data) {
  await updateDoc(doc(db, "users", uid), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function updatePreferences(uid, preferences) {
  await updateDoc(doc(db, "users", uid), {
    preferences,
    updatedAt: serverTimestamp(),
  });
}
