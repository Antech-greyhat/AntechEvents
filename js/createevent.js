// Create / edit event form controller. Handles both modes via ?id=. Validates
// inline, previews schedule conflicts live, and defaults the end time from prefs.
import { initShell } from "./app.js";
import {
  getEvent,
  createEvent,
  updateEvent,
  listEvents,
  EVENT_STATUSES,
} from "./services/eventservice.js";
import { detectConflict, CONFLICT } from "./conflicts.js";
import { icon, toast, setBusy, escapeHtml, errorState } from "./ui.js";
import { statusMeta } from "./utils/formatters.js";
import {
  toDatetimeLocalValue,
  fromDatetimeLocalValue,
  addMinutes,
  getBrowserTimezone,
} from "./utils/dates.js";
import { validateEventInput } from "./utils/validation.js";
import { REMINDER_PRESETS, REMINDER_DEFAULT_MINUTES } from "./reminders.js";

const params = new URLSearchParams(location.search);
const eventId = params.get("id");
const isEdit = Boolean(eventId);

const el = {};
let session = null;
let otherEvents = [];
let defaultDuration = 60;
let defaultReminder = REMINDER_DEFAULT_MINUTES;

init();

async function init() {
  session = await initShell({ active: isEdit ? "events" : "create" });
  if (!session) return;

  cacheElements();
  const prefs = (session.profile && session.profile.preferences) || {};
  defaultDuration = Number(prefs.defaultEventDurationMinutes) || 60;
  defaultReminder = Number(prefs.defaultReminderMinutes) || REMINDER_DEFAULT_MINUTES;

  populateStatusOptions();
  populateReminderOptions();
  wireForm();

  if (isEdit) {
    await loadForEdit();
  } else {
    seedNewEvent();
  }

  loadOtherEvents();
}

function cacheElements() {
  [
    "eventForm",
    "formLoading",
    "formError",
    "pageHeading",
    "pageSubhead",
    "title",
    "startAt",
    "endAt",
    "status",
    "location",
    "eventUrl",
    "description",
    "organizer",
    "timezone",
    "registrationUrl",
    "notes",
    "reminderEnabled",
    "reminderTimingWrap",
    "reminderMinutes",
    "reminderSummary",
    "conflictHint",
    "submitError",
    "submitBtn",
    "cancelBtn",
    "backLink",
  ].forEach((id) => {
    el[id] = document.getElementById(id);
  });
}

function populateStatusOptions() {
  el.status.innerHTML = EVENT_STATUSES.map(
    (s) => `<option value="${s}">${escapeHtml(statusMeta[s].label)}</option>`
  ).join("");
}

function populateReminderOptions() {
  el.reminderMinutes.innerHTML = REMINDER_PRESETS.map(
    (p) => `<option value="${p.minutes}">${escapeHtml(p.label)}</option>`
  ).join("");
}

function seedNewEvent() {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  const nextHour = addMinutes(start, 60);
  el.startAt.value = toDatetimeLocalValue(nextHour);
  el.endAt.value = toDatetimeLocalValue(addMinutes(nextHour, defaultDuration));
  el.timezone.value = getBrowserTimezone();
  el.reminderMinutes.value = String(defaultReminder);
  updateConflictHint();
}

async function loadForEdit() {
  el.eventForm.hidden = true;
  el.formLoading.hidden = false;
  el.pageHeading.textContent = "Edit event";
  el.pageSubhead.textContent = "Update the details and save your changes.";
  document.title = "Edit event · AntechEvents";

  let event = null;
  try {
    event = await getEvent(eventId);
  } catch {
    showLoadError(
      "Couldn't load this event",
      "There was a problem reaching it. Check your connection and try again."
    );
    return;
  }

  if (!event || event.ownerId !== session.user.uid) {
    showLoadError(
      "Event not found",
      "This event may have been deleted, or you don't have access to it."
    );
    return;
  }

  fillForm(event);
  el.formLoading.hidden = true;
  el.eventForm.hidden = false;
  updateConflictHint();
}

function showLoadError(title, message) {
  el.formLoading.hidden = true;
  el.eventForm.hidden = true;
  el.formError.hidden = false;
  el.formError.innerHTML = errorState({ title, message });
  const retry = el.formError.querySelector("[data-retry]");
  if (retry) retry.addEventListener("click", () => location.reload());
}

function fillForm(event) {
  el.title.value = event.title || "";
  el.startAt.value = toDatetimeLocalValue(event.startAt);
  el.endAt.value = toDatetimeLocalValue(event.endAt);
  el.status.value = EVENT_STATUSES.includes(event.status) ? event.status : "planned";
  el.location.value = event.location || "";
  el.eventUrl.value = event.eventUrl || "";
  el.description.value = event.description || "";
  el.organizer.value = event.organizer || "";
  el.timezone.value = event.timezone || getBrowserTimezone();
  el.registrationUrl.value = event.registrationUrl || "";
  el.notes.value = event.notes || "";
  const reminder = event.reminderSettings || {};
  el.reminderEnabled.checked = Boolean(reminder.enabled);
  el.reminderMinutes.value = String(
    Number(reminder.minutesBefore) || defaultReminder
  );
  syncReminderUi();
}

async function loadOtherEvents() {
  try {
    const all = await listEvents(session.user.uid);
    otherEvents = all.filter((e) => e.id !== eventId);
  } catch {
    otherEvents = [];
  }
  updateConflictHint();
}

function readModel() {
  return {
    title: el.title.value,
    startAt: fromDatetimeLocalValue(el.startAt.value),
    endAt: fromDatetimeLocalValue(el.endAt.value),
    status: el.status.value,
    location: el.location.value,
    eventUrl: el.eventUrl.value,
    description: el.description.value,
    organizer: el.organizer.value,
    timezone: el.timezone.value.trim() || getBrowserTimezone(),
    registrationUrl: el.registrationUrl.value,
    notes: el.notes.value,
    reminderSettings: {
      enabled: el.reminderEnabled.checked,
      minutesBefore: Number(el.reminderMinutes.value) || 0,
    },
  };
}

const ERROR_FIELDS = {
  title: "titleError",
  startAt: "startError",
  endAt: "endError",
  eventUrl: "eventUrlError",
  registrationUrl: "registrationUrlError",
};

function clearErrors() {
  el.submitError.textContent = "";
  el.submitError.classList.remove("is-visible");
  Object.entries(ERROR_FIELDS).forEach(([field, errId]) => {
    const errEl = document.getElementById(errId);
    if (errEl) {
      errEl.textContent = "";
      errEl.classList.remove("is-visible");
    }
    const input = el[field];
    if (input) {
      input.classList.remove("input-invalid");
      input.removeAttribute("aria-invalid");
    }
  });
}

function showFieldErrors(errors) {
  let firstInvalid = null;
  Object.entries(ERROR_FIELDS).forEach(([field, errId]) => {
    if (!errors[field]) return;
    const errEl = document.getElementById(errId);
    if (errEl) {
      errEl.textContent = errors[field];
      errEl.classList.add("is-visible");
    }
    const input = el[field];
    if (input) {
      input.classList.add("input-invalid");
      input.setAttribute("aria-invalid", "true");
      if (!firstInvalid) firstInvalid = input;
    }
  });
  if (firstInvalid) firstInvalid.focus();
}

// Live, non-blocking preview of whether the chosen time overlaps other events.
function updateConflictHint() {
  const start = fromDatetimeLocalValue(el.startAt.value);
  if (!start) {
    el.conflictHint.hidden = true;
    return;
  }
  const target = {
    id: eventId || "__draft__",
    startAt: start,
    endAt: fromDatetimeLocalValue(el.endAt.value),
    status: el.status.value,
  };
  if (target.status === "cancelled") {
    el.conflictHint.hidden = true;
    return;
  }
  const { state, conflicts } = detectConflict(target, otherEvents);
  const names = conflicts
    .map((c) => c.title || "Untitled event")
    .slice(0, 3)
    .join(", ");

  if (state === CONFLICT.conflict) {
    setHint(
      "danger",
      "alertTriangle",
      `Overlaps ${conflicts.length} event${conflicts.length > 1 ? "s" : ""}`,
      names
    );
  } else if (state === CONFLICT.possible) {
    setHint(
      "warning",
      "info",
      "Possible conflict",
      `Same day as ${names}. Add an end time to be sure.`
    );
  } else {
    setHint("success", "checkCircle", "No conflicts at this time", "");
  }
}

function setHint(tone, iconName, title, detail) {
  const tones = {
    danger: "border-danger/30 bg-danger/5 text-danger",
    warning: "border-warning/30 bg-warning/5 text-warning",
    success: "border-success/30 bg-success/5 text-success",
  };
  el.conflictHint.className = `rounded-btn border px-3 py-2 text-sm ${tones[tone]}`;
  el.conflictHint.innerHTML = `
    <span class="flex items-center gap-2 font-medium">${icon(iconName, {
      size: 16,
    })}<span>${escapeHtml(title)}</span></span>
    ${detail ? `<span class="mt-0.5 block pl-6 text-ink/70">${escapeHtml(detail)}</span>` : ""}`;
  el.conflictHint.hidden = false;
}

function syncReminderUi() {
  const on = el.reminderEnabled.checked;
  el.reminderTimingWrap.hidden = !on;
  if (!on) {
    el.reminderSummary.textContent = "Off";
    return;
  }
  const opt = el.reminderMinutes.options[el.reminderMinutes.selectedIndex];
  el.reminderSummary.textContent = opt ? opt.textContent : "On";
}

function wireForm() {
  // Default the end time to start + preferred duration when it trails the start.
  el.startAt.addEventListener("change", () => {
    const start = fromDatetimeLocalValue(el.startAt.value);
    const end = fromDatetimeLocalValue(el.endAt.value);
    if (start && (!end || end <= start)) {
      el.endAt.value = toDatetimeLocalValue(addMinutes(start, defaultDuration));
    }
    updateConflictHint();
  });
  el.endAt.addEventListener("change", updateConflictHint);
  el.status.addEventListener("change", updateConflictHint);
  el.reminderEnabled.addEventListener("change", syncReminderUi);
  el.reminderMinutes.addEventListener("change", syncReminderUi);

  // Keep Cancel returning to a sensible place.
  if (isEdit) {
    el.cancelBtn.setAttribute("href", `event.html?id=${encodeURIComponent(eventId)}`);
    el.backLink.setAttribute("href", `event.html?id=${encodeURIComponent(eventId)}`);
    el.backLink.querySelector("span:last-child").textContent = "Back to event";
  }

  el.eventForm.addEventListener("submit", onSubmit);
}

async function onSubmit(event) {
  event.preventDefault();
  clearErrors();
  const model = readModel();
  const { valid, errors } = validateEventInput(model);
  if (!valid) {
    showFieldErrors(errors);
    return;
  }

  setBusy(el.submitBtn, true, "Saving…");
  try {
    let targetId = eventId;
    if (isEdit) {
      await updateEvent(eventId, model);
    } else {
      targetId = await createEvent(session.user.uid, model);
    }
    toast(isEdit ? "Event updated." : "Event created.", "success");
    location.href = `event.html?id=${encodeURIComponent(targetId)}`;
  } catch {
    setBusy(el.submitBtn, false);
    el.submitError.textContent = "Couldn't save the event. Please try again.";
    el.submitError.classList.add("is-visible");
  }
}
