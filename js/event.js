// Event detail controller: full details, live conflict panel, and every event
// action (edit, duplicate, status changes, cancel, delete). Not-found is handled.
import { initShell } from "./app.js";
import {
  getEvent,
  setEventStatus,
  deleteEvent,
  duplicateEvent,
  listEvents,
} from "./services/eventservice.js";
import { detectConflict, CONFLICT } from "./conflicts.js";
import {
  icon,
  escapeHtml,
  toast,
  setBusy,
  statusBadge,
  conflictBadge,
  priorityBadges,
  confirmDialog,
  errorState,
} from "./ui.js";
import {
  statusMeta,
  formatFullDate,
  formatDateRange,
  formatEventDuration,
} from "./utils/formatters.js";
import { describeReminder } from "./reminders.js";
import { attendanceReasonLabel } from "./attendance.js";

const params = new URLSearchParams(location.search);
const eventId = params.get("id");
const container = () => document.getElementById("detail");

let session = null;
let currentEvent = null;
let otherEvents = [];

init();

async function init() {
  session = await initShell({ active: "events" });
  if (!session) return;
  if (!eventId) {
    renderNotFound();
    return;
  }
  await load();
}

async function load() {
  let event = null;
  try {
    event = await getEvent(eventId);
  } catch {
    renderError();
    return;
  }
  if (!event || event.ownerId !== session.user.uid) {
    renderNotFound();
    return;
  }
  currentEvent = event;
  document.title = `${event.title || "Event"} · AntechEvents`;
  try {
    const all = await listEvents(session.user.uid);
    otherEvents = all.filter((e) => e.id !== eventId);
  } catch {
    otherEvents = [];
  }
  render();
}

function renderError() {
  container().innerHTML = errorState({
    title: "Couldn't load this event",
    message: "There was a problem reaching it. Check your connection and try again.",
  });
  const retry = container().querySelector("[data-retry]");
  if (retry) retry.addEventListener("click", load);
}

function renderNotFound() {
  container().innerHTML = `
    <div class="card card-pad text-center">
      <span class="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-subtle text-muted">${icon(
        "calendar",
        { size: 24 }
      )}</span>
      <h1 class="text-lg font-semibold text-ink">Event not found</h1>
      <p class="mt-1 text-sm text-muted">This event may have been deleted, or you don't have access to it.</p>
      <a href="/events" class="btn btn-primary mt-5">${icon("list", {
        size: 16,
      })}Back to all events</a>
    </div>`;
}

function infoRow(iconName, label, valueHtml) {
  return `<div class="flex gap-3 py-2.5">
    <span class="mt-0.5 shrink-0 text-muted">${icon(iconName, { size: 18 })}</span>
    <div class="min-w-0">
      <p class="text-xs font-medium uppercase tracking-wide text-muted">${escapeHtml(
        label
      )}</p>
      <div class="mt-0.5 text-sm text-ink">${valueHtml}</div>
    </div>
  </div>`;
}

function linkRow(label, url) {
  const safe = escapeHtml(url);
  return `<div class="flex items-center justify-between gap-3 py-2.5">
    <div class="min-w-0">
      <p class="text-xs font-medium uppercase tracking-wide text-muted">${escapeHtml(
        label
      )}</p>
      <a href="${safe}" target="_blank" rel="noopener noreferrer" class="mt-0.5 block truncate text-sm font-medium text-primary hover:underline">${safe}</a>
    </div>
    <div class="flex shrink-0 gap-1">
      <a href="${safe}" target="_blank" rel="noopener noreferrer" class="btn-icon" aria-label="Open ${escapeHtml(
        label
      )}">${icon("externalLink", { size: 18 })}</a>
      <button type="button" class="btn-icon" data-copy="${safe}" aria-label="Copy ${escapeHtml(
        label
      )}">${icon("copy", { size: 18 })}</button>
    </div>
  </div>`;
}

function conflictPanel() {
  const { state, conflicts } = detectConflict(currentEvent, otherEvents);
  if (state === CONFLICT.none || currentEvent.status === "cancelled") return "";
  const isHard = state === CONFLICT.conflict;
  const tone = isHard
    ? "border-danger/30 bg-danger/5"
    : "border-warning/30 bg-warning/5";
  const iconTone = isHard ? "text-danger" : "text-warning";
  const title = isHard
    ? `Overlaps ${conflicts.length} other event${conflicts.length > 1 ? "s" : ""}`
    : "Possible conflict";
  const note = isHard
    ? "These events share the same time. Consider adjusting one of them."
    : "These events fall on the same day but are missing end times, so the overlap is uncertain.";
  const items = conflicts
    .map(
      (c) =>
        `<a href="/event?id=${encodeURIComponent(
          c.id
        )}" class="flex items-center justify-between gap-2 rounded-btn bg-surface px-3 py-2 text-sm hover:bg-subtle">
          <span class="min-w-0 truncate font-medium text-ink">${escapeHtml(
            c.title || "Untitled event"
          )}</span>
          <span class="shrink-0 text-xs text-muted">${escapeHtml(
            formatDateRange(c.startAt, c.endAt)
          )}</span>
        </a>`
    )
    .join("");
  return `
    <section class="mt-4 rounded-card border ${tone} p-4" aria-label="Schedule conflict">
      <div class="flex items-center gap-2">
        <span class="${iconTone}">${icon("alertTriangle", { size: 18 })}</span>
        <h2 class="text-sm font-semibold text-ink">${escapeHtml(title)}</h2>
      </div>
      <p class="mt-1 text-sm text-muted">${escapeHtml(note)}</p>
      <div class="mt-3 space-y-2">${items}</div>
    </section>`;
}

// Builds the status-transition and management buttons available for this status.
function actionButtons() {
  const status = currentEvent.status;
  const buttons = [];
  buttons.push(
    `<a href="/createevent?id=${encodeURIComponent(
      currentEvent.id
    )}" class="btn btn-secondary btn-sm">${icon("pencil", { size: 15 })}Edit</a>`
  );
  if (currentEvent.eventUrl) {
    buttons.push(
      `<a href="${escapeHtml(
        currentEvent.eventUrl
      )}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm">${icon(
        "externalLink",
        { size: 15 }
      )}${currentEvent.eventMode === "online" ? "Join online" : "Open link"}</a>`
    );
  }
  if (status === "planned" || status === "registered") {
    buttons.push(
      `<button type="button" data-status="confirmed" class="btn btn-secondary btn-sm">${icon(
        "check",
        { size: 15 }
      )}Mark confirmed</button>`
    );
  }
  if (status !== "attended" && status !== "cancelled") {
    buttons.push(
      `<button type="button" data-status="attended" class="btn btn-secondary btn-sm">${icon(
        "checkCheck",
        { size: 15 }
      )}Mark attended</button>`
    );
  }
  buttons.push(
    `<button type="button" data-duplicate class="btn btn-secondary btn-sm">${icon(
      "copy",
      { size: 15 }
    )}Duplicate</button>`
  );
  if (status === "cancelled") {
    buttons.push(
      `<button type="button" data-status="planned" class="btn btn-secondary btn-sm">${icon(
        "circleDashed",
        { size: 15 }
      )}Restore</button>`
    );
  } else {
    buttons.push(
      `<button type="button" data-cancel class="btn btn-ghost btn-sm text-warning hover:bg-warning/10">${icon(
        "ban",
        { size: 15 }
      )}Cancel event</button>`
    );
  }
  return buttons.join("");
}

function detailCards() {
  const event = currentEvent;
  const duration = formatEventDuration(event.startAt, event.endAt);
  const cards = [];

  // When
  let whenRows = infoRow(
    "clock",
    "Date & time",
    escapeHtml(formatDateRange(event.startAt, event.endAt))
  );
  if (duration) {
    whenRows += infoRow("gauge", "Duration", escapeHtml(duration));
  }
  if (event.timezone) {
    whenRows += infoRow("info", "Timezone", escapeHtml(event.timezone));
  }
  whenRows += infoRow("bell", "Reminder", escapeHtml(describeReminder(event)));
  cards.push(`<div class="card card-pad divide-y divide-line">${whenRows}</div>`);

  // Where + organizer
  let placeRows = "";
  if (event.eventMode === "online") {
    placeRows += infoRow("video", "Format", "Online");
  }
  if (event.location) {
    placeRows += infoRow("mapPin", "Location", escapeHtml(event.location));
  }
  if (event.organizer) {
    placeRows += infoRow("building", "Organizer", escapeHtml(event.organizer));
  }
  if (placeRows) {
    cards.push(`<div class="card card-pad divide-y divide-line">${placeRows}</div>`);
  }

  // Links
  let linkRows = "";
  if (event.eventUrl)
    linkRows += linkRow(
      event.eventMode === "online" ? "Attending link" : "Event link",
      event.eventUrl
    );
  if (event.registrationUrl)
    linkRows += linkRow("Registration", event.registrationUrl);
  if (linkRows) {
    cards.push(`<div class="card card-pad divide-y divide-line">${linkRows}</div>`);
  }

  // Description + notes
  if (event.description) {
    cards.push(
      `<div class="card card-pad">
        <h2 class="text-xs font-medium uppercase tracking-wide text-muted">Description</h2>
        <p class="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">${escapeHtml(
          event.description
        )}</p>
      </div>`
    );
  }
  if (event.notes) {
    cards.push(
      `<div class="card card-pad">
        <h2 class="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">${icon(
          "note",
          { size: 14 }
        )}Notes</h2>
        <p class="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">${escapeHtml(
          event.notes
        )}</p>
      </div>`
    );
  }

  // Post-event review read-back (F5): shown once the owner has answered "how did
  // it go?", so a "didn't attend" reason isn't write-only.
  const attendance = event.attendance;
  if (attendance && attendance.reviewedAt) {
    const attended = attendance.attended === true;
    const reason = attended
      ? ""
      : attendanceReasonLabel(attendance.reasonCategory);
    const heading = attended ? "You attended" : "You didn't attend";
    const detail = attended ? attendance.notes : attendance.reasonDetail;
    cards.push(
      `<div class="card card-pad">
        <h2 class="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">${icon(
          attended ? "checkCheck" : "xCircle",
          { size: 14 }
        )}How it went</h2>
        <p class="mt-2 text-sm font-medium text-ink">${escapeHtml(heading)}${
          reason ? ` · ${escapeHtml(reason)}` : ""
        }</p>
        ${
          detail
            ? `<p class="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted">${escapeHtml(
                detail
              )}</p>`
            : ""
        }
      </div>`
    );
  }

  return cards.join('<div class="h-4"></div>');
}

function render() {
  const event = currentEvent;
  const cancelled = event.status === "cancelled";
  container().innerHTML = `
    <div class="flex flex-wrap items-center gap-2">
      ${statusBadge(event.status)}
      ${conflictBadge(detectConflict(event, otherEvents).state)}
      ${priorityBadges(event)}
    </div>
    <h1 class="mt-2 text-2xl font-bold tracking-tight text-ink ${
      cancelled ? "line-through decoration-1" : ""
    }">${escapeHtml(event.title || "Untitled event")}</h1>
    <p class="mt-1 text-sm text-muted">${escapeHtml(formatFullDate(event.startAt))}</p>

    <div class="mt-4 flex flex-wrap gap-2">${actionButtons()}</div>

    ${conflictPanel()}

    <div class="mt-4">${detailCards()}</div>

    <section class="mt-6 rounded-card border border-danger/20 bg-surface p-4" aria-label="Danger zone">
      <h2 class="text-sm font-semibold text-ink">Delete this event</h2>
      <p class="mt-1 text-sm text-muted">Permanently removes the event. This can't be undone.</p>
      <button type="button" data-delete class="btn btn-danger btn-sm mt-3">${icon(
        "trash",
        { size: 15 }
      )}Delete event</button>
    </section>`;

  wire();
}

function wire() {
  const root = container();

  root.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", () => copyText(btn.getAttribute("data-copy")));
  });

  root.querySelectorAll("[data-status]").forEach((btn) => {
    btn.addEventListener("click", () => changeStatus(btn, btn.getAttribute("data-status")));
  });

  const dupBtn = root.querySelector("[data-duplicate]");
  if (dupBtn) dupBtn.addEventListener("click", () => onDuplicate(dupBtn));

  const cancelBtn = root.querySelector("[data-cancel]");
  if (cancelBtn) cancelBtn.addEventListener("click", onCancel);

  const deleteBtn = root.querySelector("[data-delete]");
  if (deleteBtn) deleteBtn.addEventListener("click", onDelete);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Link copied to clipboard.", "success");
  } catch {
    toast("Couldn't copy the link.", "error");
  }
}

async function changeStatus(button, status) {
  setBusy(button, true, "Updating…");
  try {
    await setEventStatus(eventId, status);
    toast(`Marked as ${statusMeta[status].label.toLowerCase()}.`, "success");
    await load();
  } catch {
    setBusy(button, false);
    toast("Couldn't update the event. Please try again.", "error");
  }
}

async function onDuplicate(button) {
  setBusy(button, true, "Duplicating…");
  try {
    const newId = await duplicateEvent(session.user.uid, currentEvent);
    await toast("Event duplicated.", "success");
    location.href = `/event?id=${encodeURIComponent(newId)}`;
  } catch {
    setBusy(button, false);
    toast("Couldn't duplicate the event. Please try again.", "error");
  }
}

async function onCancel() {
  const ok = await confirmDialog({
    title: "Cancel this event?",
    message:
      "It will be marked as cancelled and excluded from conflict checks. You can restore it later.",
    confirmLabel: "Cancel event",
    cancelLabel: "Keep it",
    tone: "danger",
  });
  if (!ok) return;
  try {
    await setEventStatus(eventId, "cancelled");
    toast("Event cancelled.", "success");
    await load();
  } catch {
    toast("Couldn't cancel the event. Please try again.", "error");
  }
}

async function onDelete() {
  const ok = await confirmDialog({
    title: "Delete this event?",
    message: `"${currentEvent.title || "Untitled event"}" will be permanently deleted. This can't be undone.`,
    confirmLabel: "Delete",
    cancelLabel: "Keep it",
    tone: "danger",
  });
  if (!ok) return;
  try {
    await deleteEvent(eventId);
    await toast("Event deleted.", "success");
    location.href = "/events";
  } catch {
    toast("Couldn't delete the event. Please try again.", "error");
  }
}
