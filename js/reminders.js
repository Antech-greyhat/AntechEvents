// Reminder scheduling intent and the integration boundary for future delivery.
// This module computes WHEN a reminder should fire; it never sends anything and
// holds no secrets. A secure backend (e.g. Cloud Functions calling Resend) will
// own actual delivery, keeping the Resend API key off the client entirely.
import { toDate, addMinutes } from "./utils/dates.js";

export const REMINDER_DEFAULT_MINUTES = 60;

export const REMINDER_PRESETS = [
  { minutes: 0, label: "At start time" },
  { minutes: 15, label: "15 minutes before" },
  { minutes: 30, label: "30 minutes before" },
  { minutes: 60, label: "1 hour before" },
  { minutes: 1440, label: "1 day before" },
];

export function nextReminderTime(event) {
  const start = toDate(event && event.startAt);
  const settings = (event && event.reminderSettings) || {};
  if (!start || !settings.enabled) return null;
  const minutes = Number(settings.minutesBefore) || REMINDER_DEFAULT_MINUTES;
  return addMinutes(start, -minutes);
}

export function describeReminder(event) {
  const settings = (event && event.reminderSettings) || {};
  if (!settings.enabled) return "No reminder";
  const minutes = Number(settings.minutesBefore);
  if (!minutes) return "At start time";
  if (minutes >= 1440 && minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days} day${days > 1 ? "s" : ""} before`;
  }
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours > 1 ? "s" : ""} before`;
  }
  return `${minutes} minutes before`;
}

// Future boundary: a secure backend will read due reminders and send email.
// Intentionally inert on the client so no secret ever ships to the browser.
export async function requestReminderDelivery() {
  return {
    scheduled: false,
    reason: "Server-side reminder delivery is not enabled yet.",
  };
}
