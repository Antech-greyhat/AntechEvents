// Settings controller: account profile, scheduling preferences, and notification
// choices. Persists to the user's profile document and Firebase Auth display name.
import { initShell } from "./app.js";
import { auth, updateProfile } from "./firebase.js";
import { signOutUser } from "./auth.js";
import {
  getUserProfile,
  updateUserProfile,
  updatePreferences,
  defaultPreferences,
} from "./services/userservice.js";
import { icon, escapeHtml, toast, setBusy } from "./ui.js";
import { getBrowserTimezone } from "./utils/dates.js";
import { isNonEmpty } from "./utils/validation.js";
import { REMINDER_PRESETS } from "./reminders.js";
import {
  notificationsSupported,
  permissionState,
  requestNotificationPermission,
} from "./notificationpermission.js";

const body = document.getElementById("settingsBody");
let session = null;
let prefs = defaultPreferences();

init();

async function init() {
  session = await initShell({ active: "settings" });
  if (!session) return;

  let profile = session.profile;
  if (!profile) {
    try {
      profile = await getUserProfile(session.user.uid);
    } catch {
      profile = null;
    }
  }
  prefs = { ...defaultPreferences(), ...((profile && profile.preferences) || {}) };
  prefs.notifications = {
    ...defaultPreferences().notifications,
    ...((profile && profile.preferences && profile.preferences.notifications) || {}),
  };

  render(profile);
}

const DURATIONS = [
  { value: 30, label: "30 minutes" },
  { value: 45, label: "45 minutes" },
  { value: 60, label: "1 hour" },
  { value: 90, label: "1.5 hours" },
  { value: 120, label: "2 hours" },
];

function options(list, current) {
  return list
    .map(
      (o) =>
        `<option value="${o.value}"${
          Number(current) === Number(o.value) ? " selected" : ""
        }>${escapeHtml(o.label)}</option>`
    )
    .join("");
}

function toggleRow(id, label, description, checked) {
  return `
    <label class="flex items-start justify-between gap-4 py-3">
      <span class="min-w-0">
        <span class="block text-sm font-medium text-ink">${escapeHtml(label)}</span>
        <span class="mt-0.5 block text-sm text-muted">${escapeHtml(description)}</span>
      </span>
      <input id="${id}" type="checkbox" class="mt-1 h-4 w-4 shrink-0 rounded border-line text-primary focus-visible:ring-primary/50"${
    checked ? " checked" : ""
  } />
    </label>`;
}

// Device reminders opt-in. These are local OS notifications shown while a tab is
// open — free and backend-less — so the copy is explicit that they can't fire when
// the app is fully closed (that would need the future server integration above).
function deviceRemindersBlock() {
  if (!notificationsSupported()) {
    return `<div class="mt-4 rounded-btn border border-line bg-subtle px-3 py-2 text-sm text-muted">Device reminders aren't supported in this browser.</div>`;
  }
  const state = permissionState();
  if (state === "granted") {
    return `<div class="mt-4 flex items-start gap-2 rounded-btn border border-success/30 bg-success/5 px-3 py-2 text-sm text-ink">
      <span class="mt-0.5 shrink-0 text-success">${icon("bell", { size: 16 })}</span>
      <span>Device reminders are on. AntechEvents can show a reminder while a tab is open — even in the background.</span>
    </div>`;
  }
  if (state === "denied") {
    return `<div class="mt-4 flex items-start gap-2 rounded-btn border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-ink">
      <span class="mt-0.5 shrink-0 text-warning">${icon("bell", { size: 16 })}</span>
      <span>Device reminders are blocked. To turn them on, allow notifications for this site in your browser settings.</span>
    </div>`;
  }
  return `<div class="mt-4 rounded-btn border border-line bg-surface px-3 py-3">
    <p class="text-sm text-ink">Stay ahead of your events. Enable device reminders so AntechEvents can notify you before an event starts while a tab is open.</p>
    <button type="button" id="enableReminders" class="btn btn-secondary btn-sm mt-3">${icon(
      "bell",
      { size: 15 }
    )}Enable reminders</button>
  </div>`;
}

function render(profile) {
  const displayName = (profile && profile.displayName) || session.user.displayName || "";
  const email = session.user.email || "";
  const detectedTz = getBrowserTimezone();

  body.innerHTML = `
    <form id="settingsForm" class="space-y-4" novalidate>
      <section class="card card-pad">
        <h2 class="text-base font-semibold text-ink">Account</h2>
        <p class="mt-0.5 text-sm text-muted">How you appear across AntechEvents.</p>
        <div class="mt-4 space-y-4">
          <div>
            <label class="label" for="displayName">Name</label>
            <input id="displayName" type="text" maxlength="100" class="input" value="${escapeHtml(
              displayName
            )}" placeholder="Your name" />
            <p id="nameError" class="error-text" role="alert"></p>
          </div>
          <div>
            <label class="label" for="email">Email</label>
            <input id="email" type="email" class="input bg-subtle" value="${escapeHtml(
              email
            )}" readonly aria-readonly="true" />
            <p class="hint">Your email is managed by your sign-in method.</p>
          </div>
        </div>
      </section>

      <section class="card card-pad">
        <h2 class="text-base font-semibold text-ink">Scheduling preferences</h2>
        <p class="mt-0.5 text-sm text-muted">Defaults applied when you create events.</p>
        <div class="mt-4 grid gap-4 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <label class="label" for="timezone">Timezone</label>
            <input id="timezone" type="text" class="input" value="${escapeHtml(
              prefs.timezone || detectedTz
            )}" placeholder="${escapeHtml(detectedTz)}" />
            <p class="hint">Detected: ${escapeHtml(detectedTz)}.</p>
          </div>
          <div>
            <label class="label" for="weekStartsOn">Week starts on</label>
            <select id="weekStartsOn" class="input">
              <option value="1"${Number(prefs.weekStartsOn) === 1 ? " selected" : ""}>Monday</option>
              <option value="0"${Number(prefs.weekStartsOn) === 0 ? " selected" : ""}>Sunday</option>
            </select>
          </div>
          <div>
            <label class="label" for="defaultDuration">Default event length</label>
            <select id="defaultDuration" class="input">${options(
              DURATIONS,
              prefs.defaultEventDurationMinutes
            )}</select>
          </div>
          <div class="sm:col-span-2">
            <label class="label" for="defaultReminder">Default reminder</label>
            <select id="defaultReminder" class="input">${options(
              REMINDER_PRESETS.map((p) => ({ value: p.minutes, label: p.label })),
              prefs.defaultReminderMinutes
            )}</select>
          </div>
        </div>
      </section>

      <section class="card card-pad">
        <h2 class="text-base font-semibold text-ink">Notifications</h2>
        <p class="mt-0.5 text-sm text-muted">Choose what you'd like to be notified about.</p>
        <div class="mt-2 divide-y divide-line">
          ${toggleRow(
            "notifyConflicts",
            "Conflict alerts",
            "Warn me when a new event overlaps an existing one.",
            prefs.notifications.conflictAlerts
          )}
          ${toggleRow(
            "notifyReminders",
            "Event reminders",
            "Email me before an event starts.",
            prefs.notifications.reminders
          )}
          ${toggleRow(
            "notifyWeekly",
            "Weekly summary",
            "A Monday overview of the week ahead.",
            prefs.notifications.weeklySummary
          )}
        </div>
        ${deviceRemindersBlock()}
        <div class="mt-3 flex items-start gap-2 rounded-btn border border-info/30 bg-info/5 px-3 py-2 text-sm text-ink">
          <span class="mt-0.5 shrink-0 text-info">${icon("mail", { size: 16 })}</span>
          <span>Email delivery arrives soon, powered by a secure backend integration. Your choices are saved now and take effect once it's enabled.</span>
        </div>
      </section>

      <p id="saveError" class="error-text" role="alert"></p>

      <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" id="signOutBtn" class="btn btn-ghost text-danger hover:bg-danger/10">${icon(
          "logOut",
          { size: 16 }
        )}Sign out</button>
        <button type="submit" id="saveBtn" class="btn btn-primary">Save changes</button>
      </div>
    </form>`;

  wire();
}

function wire() {
  document.getElementById("settingsForm").addEventListener("submit", onSave);
  const enableBtn = document.getElementById("enableReminders");
  if (enableBtn) {
    enableBtn.addEventListener("click", async () => {
      setBusy(enableBtn, true, "Requesting…");
      const result = await requestNotificationPermission();
      setBusy(enableBtn, false);
      if (result === "granted") {
        toast("Device reminders are on.", "success");
      } else if (result === "denied") {
        toast("Notifications are blocked. Enable them in your browser settings.", "warning");
      }
      render(session.profile);
    });
  }
  document.getElementById("signOutBtn").addEventListener("click", async () => {
    try {
      await signOutUser();
    } finally {
      location.href = "/";
    }
  });
}

async function onSave(event) {
  event.preventDefault();
  const nameError = document.getElementById("nameError");
  const saveError = document.getElementById("saveError");
  nameError.classList.remove("is-visible");
  saveError.classList.remove("is-visible");

  const displayName = document.getElementById("displayName").value.trim();
  if (!isNonEmpty(displayName)) {
    nameError.textContent = "Enter your name.";
    nameError.classList.add("is-visible");
    document.getElementById("displayName").focus();
    return;
  }

  const nextPrefs = {
    timezone: document.getElementById("timezone").value.trim() || getBrowserTimezone(),
    weekStartsOn: Number(document.getElementById("weekStartsOn").value),
    defaultEventDurationMinutes: Number(document.getElementById("defaultDuration").value),
    defaultReminderMinutes: Number(document.getElementById("defaultReminder").value),
    notifications: {
      conflictAlerts: document.getElementById("notifyConflicts").checked,
      reminders: document.getElementById("notifyReminders").checked,
      weeklySummary: document.getElementById("notifyWeekly").checked,
    },
  };

  const saveBtn = document.getElementById("saveBtn");
  setBusy(saveBtn, true, "Saving…");
  try {
    await updateUserProfile(session.user.uid, { displayName });
    await updatePreferences(session.user.uid, nextPrefs);
    if (auth.currentUser) {
      await updateProfile(auth.currentUser, { displayName }).catch(() => {});
    }
    prefs = nextPrefs;
    setBusy(saveBtn, false);
    toast("Settings saved.", "success");
  } catch {
    setBusy(saveBtn, false);
    saveError.textContent = "Couldn't save your settings. Please try again.";
    saveError.classList.add("is-visible");
  }
}
