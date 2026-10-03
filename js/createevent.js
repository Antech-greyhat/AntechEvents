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
import { icon, setBusy, escapeHtml, errorState, messageDialog } from "./ui.js";
import { statusMeta } from "./utils/formatters.js";
import {
  toDatetimeLocalValue,
  fromDatetimeLocalValue,
  addMinutes,
  getBrowserTimezone,
} from "./utils/dates.js";
import { validateEventInput, isValidUrl } from "./utils/validation.js";
import { REMINDER_PRESETS, REMINDER_DEFAULT_MINUTES } from "./reminders.js";

const params = new URLSearchParams(location.search);
const eventId = params.get("id");
const isEdit = Boolean(eventId);

const el = {};
let session = null;
let otherEvents = [];
let defaultDuration = 60;
let defaultReminder = REMINDER_DEFAULT_MINUTES;
let venueResults = [];
let selectedVenue = null;
let lastGeocodeAt = 0;
const geocodeCache = new Map();

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
    "priorityLow",
    "location",
    "locationField",
    "locationLink",
    "locationLinkError",
    "searchVenueBtn",
    "venueSearchStatus",
    "venueSearchResults",
    "venuePreview",
    "onlinePlatform",
    "eventUrl",
    "onlineField",
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
  applyMode(getSelectedMode());
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
  el.priorityLow.checked = event.priority === "low";
  el.location.value = event.location || "";
  el.locationLink.value = event.locationLink || "";
  if (event.locationLat != null && event.locationLon != null && Number.isFinite(Number(event.locationLat)) && Number.isFinite(Number(event.locationLon))) {
    selectedVenue = {
      name: event.location,
      display_name: event.location,
      lat: String(event.locationLat),
      lon: String(event.locationLon),
    };
    renderVenuePreview(selectedVenue, true);
  }
  el.onlinePlatform.value = event.onlinePlatform || "other";
  el.eventUrl.value = event.eventUrl || "";
  setMode(
    event.eventMode ||
      (event.eventUrl && !event.location ? "online" : "physical")
  );
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
  const eventMode = getSelectedMode();
  return {
    title: el.title.value,
    startAt: fromDatetimeLocalValue(el.startAt.value),
    endAt: fromDatetimeLocalValue(el.endAt.value),
    status: el.status.value,
    priority: el.priorityLow.checked ? "low" : "normal",
    eventMode,
    location: eventMode === "physical" ? el.location.value : "",
    locationLink: eventMode === "physical" ? el.locationLink.value : "",
    locationLat: eventMode === "physical" && selectedVenue ? Number(selectedVenue.lat) : null,
    locationLon: eventMode === "physical" && selectedVenue ? Number(selectedVenue.lon) : null,
    onlinePlatform: eventMode === "online" ? el.onlinePlatform.value : "",
    eventUrl: eventMode === "online" ? el.eventUrl.value : "",
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
  location: "locationError",
  eventUrl: "eventUrlError",
  locationLink: "locationLinkError",
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

// --- Event format (in person vs online) ------------------------------------

function getSelectedMode() {
  const checked = el.eventForm.querySelector('input[name="eventMode"]:checked');
  return checked ? checked.value : "physical";
}

// Show only the field that matches the chosen format.
function applyMode(mode) {
  const online = mode === "online";
  el.onlineField.hidden = !online;
  el.locationField.hidden = online;
}

function setMode(mode) {
  const radio = el.eventForm.querySelector(
    `input[name="eventMode"][value="${mode}"]`
  );
  if (radio) radio.checked = true;
  applyMode(mode);
}

// Clear any lingering validation error on the field a mode switch just hid.
function clearModeErrors() {
  ["location", "eventUrl", "locationLink"].forEach((field) => {
    const errEl = document.getElementById(ERROR_FIELDS[field]);
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
  el.location.addEventListener("input", () => {
    if (selectedVenue && el.location.value.trim() !== selectedVenue.display_name) {
      selectedVenue = null;
      el.venuePreview.hidden = true;
      el.locationLink.value = "";
    }
  });
  el.searchVenueBtn.addEventListener("click", searchVenue);
  ["eventUrl", "locationLink", "registrationUrl"].forEach((field) => {
    el[field].addEventListener("blur", () => validateLinkField(field));
    el[field].addEventListener("input", () => {
      if (el[field].getAttribute("aria-invalid") === "true" && isValidUrl(el[field].value)) {
        clearLinkError(field);
      }
    });
  });

  el.eventForm
    .querySelectorAll('input[name="eventMode"]')
    .forEach((radio) =>
      radio.addEventListener("change", () => {
        applyMode(getSelectedMode());
        clearModeErrors();
      })
    );

  // Keep Cancel returning to a sensible place.
  if (isEdit) {
    el.cancelBtn.setAttribute("href", `/event?id=${encodeURIComponent(eventId)}`);
    el.backLink.setAttribute("href", `/event?id=${encodeURIComponent(eventId)}`);
    el.backLink.querySelector("span:last-child").textContent = "Back to event";
  }

  el.eventForm.addEventListener("submit", onSubmit);
}

function validateLinkField(field) {
  const required = field === "eventUrl" && getSelectedMode() === "online";
  const value = el[field].value.trim();
  const message = !value && required
    ? "Add the link attendees will use to join."
    : value && !isValidUrl(value)
      ? field === "locationLink" ? "Enter a valid map link (for example, https://maps.google.com/…)." : "Enter a valid http:// or https:// link."
      : "";
  if (message) {
    const errorId = ERROR_FIELDS[field];
    const error = document.getElementById(errorId);
    error.textContent = message;
    error.classList.add("is-visible");
    el[field].classList.add("input-invalid");
    el[field].setAttribute("aria-invalid", "true");
  } else {
    clearLinkError(field);
  }
}

function clearLinkError(field) {
  const error = document.getElementById(ERROR_FIELDS[field]);
  if (error) {
    error.textContent = "";
    error.classList.remove("is-visible");
  }
  el[field].classList.remove("input-invalid");
  el[field].removeAttribute("aria-invalid");
}

async function searchVenue() {
  const query = el.location.value.trim();
  if (query.length < 3) {
    el.venueSearchStatus.textContent = "Enter at least 3 characters to search for a place.";
    el.location.focus();
    return;
  }
  el.searchVenueBtn.disabled = true;
  el.venueSearchStatus.textContent = "Searching map…";
  el.venueSearchResults.hidden = true;
  try {
    const key = query.toLocaleLowerCase();
    let matches = geocodeCache.get(key);
    if (!matches) {
      // Nominatim is user-triggered and cached per page session. Keep requests
      // at or below one per second as required by its public service policy.
      const wait = Math.max(0, 1100 - (Date.now() - lastGeocodeAt));
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
      const endpoint = window.ANTECH_GEOCODER_URL || "https://nominatim.openstreetmap.org/search";
      const url = new URL(endpoint);
      url.search = new URLSearchParams({ q: query, format: "jsonv2", addressdetails: "1", namedetails: "1", limit: "5" }).toString();
      lastGeocodeAt = Date.now();
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        referrerPolicy: "strict-origin",
      });
      if (!response.ok) throw new Error("Map search unavailable");
      matches = await response.json();
      geocodeCache.set(key, matches);
    }
    venueResults = matches;
    renderVenueResults();
    el.venueSearchStatus.textContent = matches.length
      ? `Choose the matching place. Map data © OpenStreetMap contributors.`
      : "No matching places found. Try a more specific venue or address.";
  } catch {
    el.venueSearchStatus.textContent = "Map search could not load. Check your connection or enter a map link instead.";
  } finally {
    el.searchVenueBtn.disabled = false;
  }
}

function renderVenueResults() {
  if (!venueResults.length) {
    el.venueSearchResults.hidden = true;
    return;
  }
  el.venueSearchResults.innerHTML = venueResults.map((place, index) => {
    const title = place.name || place.display_name.split(",")[0];
    return `<button type="button" data-venue-index="${index}" class="card w-full p-3 text-left hover:bg-subtle">
      <span class="block text-sm font-semibold text-ink">${escapeHtml(title)}</span>
      <span class="mt-0.5 block text-xs text-muted">${escapeHtml(place.display_name)}</span>
    </button>`;
  }).join("");
  el.venueSearchResults.hidden = false;
  el.venueSearchResults.querySelectorAll("[data-venue-index]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedVenue = venueResults[Number(button.dataset.venueIndex)];
      renderVenuePreview(selectedVenue, false);
    });
  });
}

function renderVenuePreview(place, confirmed) {
  const lat = Number(place.lat);
  const lon = Number(place.lon);
  const title = place.name || place.display_name.split(",")[0];
  const delta = 0.006;
  const bbox = [lon - delta, lat - delta, lon + delta, lat + delta].join(",");
  const embed = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${lat},${lon}`)}`;
  el.venuePreview.innerHTML = `<div class="p-4">
    <div class="flex items-start justify-between gap-3">
      <div><p class="text-xs font-medium uppercase tracking-wide text-muted">${confirmed ? "Confirmed venue" : "Venue preview"}</p>
        <h3 class="mt-1 text-base font-semibold text-ink">${escapeHtml(title)}</h3>
        <p class="mt-1 text-sm text-muted">${escapeHtml(place.display_name)}</p></div>
      <span class="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">${confirmed ? "Selected" : "Review"}</span>
    </div>
    <iframe title="Map showing ${escapeHtml(title)}" src="${escapeHtml(embed)}" loading="lazy" class="mt-3 h-48 w-full rounded-btn border-0" referrerpolicy="no-referrer"></iframe>
    <p class="mt-2 text-xs text-muted">Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" class="underline">OpenStreetMap contributors</a></p>
    <div class="mt-3 flex gap-2">
      ${confirmed ? `<button type="button" data-edit-venue class="btn btn-secondary btn-sm">Edit venue</button>` : `<button type="button" data-confirm-venue class="btn btn-primary btn-sm">Confirm this venue</button><button type="button" data-edit-venue class="btn btn-secondary btn-sm">Edit search</button>`}
    </div>
  </div>`;
  el.venuePreview.hidden = false;
  el.venuePreview.querySelector("[data-edit-venue]").addEventListener("click", () => {
    selectedVenue = null;
    el.venuePreview.hidden = true;
    el.venueSearchResults.hidden = false;
    el.location.focus();
  });
  const confirm = el.venuePreview.querySelector("[data-confirm-venue]");
  if (confirm) confirm.addEventListener("click", () => {
    el.location.value = place.display_name;
    el.locationLink.value = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lon}`)}`;
    selectedVenue = place;
    el.venueSearchResults.hidden = true;
    renderVenuePreview(place, true);
    el.venueSearchStatus.textContent = "Venue confirmed. You can still edit the address before saving.";
  });
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
    await messageDialog({
      iconName: isEdit ? "checkCircle" : "calendarCheck",
      tone: "success",
      title: isEdit ? "Event updated" : "Event created",
      message: isEdit
        ? "Your changes have been saved."
        : "Your event is saved. We'll open it next.",
      confirmLabel: isEdit ? "Done" : "View event",
    });
    location.href = `/event?id=${encodeURIComponent(targetId)}`;
  } catch {
    setBusy(el.submitBtn, false);
    el.submitError.textContent = "Couldn't save the event. Please try again.";
    el.submitError.classList.add("is-visible");
  }
}
