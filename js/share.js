// Public, unauthenticated controller for a shared free/busy link.
//
// Unlike every other page, this one does NOT call initShell()/requireAuth() — it
// is meant to be opened by anyone holding the capability URL (/share?token=…).
// It reads a single shares/{token} doc (merged busy times only) and renders a
// read-only free/busy calendar plus, when the owner allowed it, a note or a
// meeting-proposal form. Proposals are pending requests: nothing here ever writes
// to the owner's calendar — the owner approves from their availability page.
import { isFirebaseConfigured } from "./firebase.js";
import { getShare, addSubmission } from "./services/shareservice.js";
import { icon, escapeHtml, toast, setBusy, emptyState } from "./ui.js";
import {
  formatFullDate,
  formatTime,
  formatDuration,
  formatRelativeDay,
} from "./utils/formatters.js";
import {
  toDate,
  startOfDay,
  endOfDay,
  addDays,
  addMinutes,
  startOfMonth,
  startOfWeek,
  isSameDay,
  isToday,
  toDatetimeLocalValue,
  fromDatetimeLocalValue,
  getBrowserTimezone,
  overlaps,
} from "./utils/dates.js";
import { getItem, setItem } from "./utils/storage.js";
import { isValidEmail } from "./utils/validation.js";
import { mergeIntervals } from "./utils/intervals.js";
import { registerServiceWorker } from "./pwa.js";

registerServiceWorker();

const main = document.getElementById("pageMain");
const VISITOR_KEY = "shareVisitor";
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

let token = "";
let share = null;
let busyIntervals = [];
let flexibleIntervals = [];
let ownerName = "";
let linkLabel = "";
let windowFrom = null;
let windowTo = null;
let navMin = null;
let navMax = null;
let selected = null;
let monthCursor = null;
let formMode = "note";
let pendingPrefill = null;
let submitted = false;
let submittedType = "note";

init();

async function init() {
  const yearEl = document.querySelector("[data-year]");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  if (!isFirebaseConfigured) {
    return renderUnavailable(
      "This link can't be opened because the app isn't fully configured yet."
    );
  }

  token = (new URLSearchParams(location.search).get("token") || "").trim();
  if (!token) return renderUnavailable();

  try {
    share = await getShare(token);
  } catch {
    // The rules deny reads of missing or revoked links, so getShare rejects in
    // exactly those cases — treat any failure as "unavailable".
    return renderUnavailable();
  }
  if (!share || share.revoked === true) return renderUnavailable();

  hydrate();
  renderAll();
}

function hydrate() {
  const snap = share.snapshot || {};
  windowFrom = toDate(snap.from) || startOfDay(new Date());
  windowTo = toDate(snap.to) || endOfDay(addDays(windowFrom, 60));
  busyIntervals = mergeIntervals(
    (snap.intervals || []).map((i) => ({
      start: toDate(i.start),
      end: toDate(i.end),
    }))
  );
  // Not-important time the owner exposed as requestable. Kept separate from hard
  // busy: visitors can request these slots, but hard-busy time stays blocked.
  flexibleIntervals = mergeIntervals(
    (snap.flexible || []).map((i) => ({
      start: toDate(i.start),
      end: toDate(i.end),
    }))
  );
  ownerName = (share.ownerName || "").trim();
  linkLabel = (share.label || "").trim();
  navMin = startOfDay(windowFrom);
  navMax = startOfDay(windowTo);
  selected = clampDay(new Date());
  monthCursor = startOfMonth(selected);
  formMode = share.allowProposals ? "proposal" : "note";
  if (ownerName) document.title = `${ownerName}'s availability · AntechEvents`;
}

// ---- Interval helpers (operate on the merged snapshot) ----------------------

function clampDay(date) {
  let d = startOfDay(date);
  if (navMin && d < navMin) d = new Date(navMin);
  if (navMax && d > navMax) d = new Date(navMax);
  return d;
}

function busyForDay(date) {
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);
  return busyIntervals
    .filter((i) => i.end > dayStart && i.start < dayEnd)
    .map((i) => ({
      start: i.start < dayStart ? dayStart : i.start,
      end: i.end > dayEnd ? dayEnd : i.end,
    }))
    .sort((a, b) => a.start - b.start);
}

// Not-important (requestable) blocks clipped to a single day.
function flexibleForDay(date) {
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);
  return flexibleIntervals
    .filter((i) => i.end > dayStart && i.start < dayEnd)
    .map((i) => ({
      start: i.start < dayStart ? dayStart : i.start,
      end: i.end > dayEnd ? dayEnd : i.end,
    }))
    .sort((a, b) => a.start - b.start);
}

function hasBusyOnDay(date) {
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);
  return busyIntervals.some((i) => i.end > dayStart && i.start < dayEnd);
}

// Next :00/:15/:30/:45 boundary strictly after `date`. Keeps a "today" free
// window from starting in the past — datetime-local truncates to the minute, so
// offering the current partial minute would round back before now on submit.
function nextQuarterHour(date) {
  const d = new Date(date);
  d.setSeconds(0, 0);
  const step = 15;
  const add = step - (d.getMinutes() % step);
  d.setMinutes(d.getMinutes() + (add === step ? step : add));
  return d;
}

// Open windows within a day: the gaps not covered by any busy or flexible block,
// ≥15 min. Flexible (requestable) time is excluded here so it isn't also offered
// as a plain open window — it gets its own "request this" row instead. On today,
// the lower bound is the next quarter-hour so already-past time (and the current
// partial minute) isn't offered as a proposable slot.
function freeForDay(date) {
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);
  const lower = isToday(date) ? nextQuarterHour(new Date()) : dayStart;
  const winStart = windowFrom && windowFrom > lower ? new Date(windowFrom) : lower;
  const winEnd = windowTo && windowTo < dayEnd ? new Date(windowTo) : dayEnd;
  if (winEnd <= winStart) return [];
  const blocked = mergeIntervals([
    ...busyForDay(date),
    ...flexibleForDay(date),
  ]);
  const windows = [];
  let cursor = new Date(winStart);
  for (const block of blocked) {
    if (block.start > cursor) {
      windows.push({ start: new Date(cursor), end: new Date(block.start) });
    }
    if (block.end > cursor) cursor = new Date(block.end);
  }
  if (cursor < winEnd) windows.push({ start: new Date(cursor), end: new Date(winEnd) });
  return windows.filter((w) => (w.end - w.start) / 60000 >= 15);
}

// A meeting default runs 60 min, or the window length if it's shorter.
function clampProposalEnd(win) {
  const end = addMinutes(win.start, 60);
  return end < win.end ? end : new Date(win.end);
}

// First open window on or after `date`, scanning forward within the window.
function firstFreeWindowFrom(date) {
  let cursor = clampDay(date);
  for (let i = 0; i < 62 && cursor <= navMax; i += 1) {
    const windows = freeForDay(cursor);
    if (windows.length) return windows[0];
    cursor = startOfDay(addDays(cursor, 1));
  }
  return null;
}

// ---- Rendering --------------------------------------------------------------

function renderUnavailable(message) {
  main.innerHTML = `<div class="mx-auto max-w-lg py-6">${emptyState({
    iconName: "link",
    title: "This link is no longer available",
    message:
      message ||
      "The link may have been turned off by its owner, or it might be incorrect. Ask for a fresh link and try again.",
    actionHtml: `<a href="/" class="btn btn-secondary btn-sm">Go to AntechEvents</a>`,
  })}</div>`;
}

function renderAll() {
  const title = ownerName ? `${ownerName}'s availability` : "Shared availability";
  const visitorTz = getBrowserTimezone();
  const ownerTz = (share.timezone || "").trim();
  const tzNote =
    ownerTz && ownerTz !== visitorTz
      ? `Times are shown in your time zone (${escapeHtml(
          visitorTz
        )}). ${escapeHtml(ownerName || "This person")} is in ${escapeHtml(
          ownerTz
        )}.`
      : `Times are shown in your time zone (${escapeHtml(visitorTz)}).`;
  const updatedNote = share.snapshotUpdatedAt
    ? `<p class="mt-1 text-xs text-muted">Free/busy last updated ${escapeHtml(
        formatRelativeDay(share.snapshotUpdatedAt)
      )}.</p>`
    : "";

  main.innerHTML = `
    <div class="max-w-xl">
      <h1 class="text-2xl font-bold tracking-tight text-ink">${escapeHtml(
        title
      )}</h1>
      ${
        linkLabel
          ? `<p class="mt-1"><span class="badge border border-line bg-subtle text-muted">${escapeHtml(
              linkLabel
            )}</span></p>`
          : ""
      }
      <p class="mt-2 text-sm text-muted">${tzNote}</p>
      ${updatedNote}
    </div>
    <div class="mt-6 grid gap-6 lg:grid-cols-5">
      <div id="dayColumn" class="lg:col-span-3"></div>
      <div id="sideColumn" class="lg:col-span-2 space-y-6"></div>
    </div>`;
  renderDayColumn();
  renderSideColumn();
}

function dayNav() {
  const canPrev = startOfDay(addDays(selected, -1)) >= navMin;
  const canNext = startOfDay(addDays(selected, 1)) <= navMax;
  const today = startOfDay(new Date());
  const showToday =
    !isToday(selected) && today >= navMin && today <= navMax;
  const todayBadge = isToday(selected)
    ? `<span class="badge badge-clear">Today</span>`
    : "";
  return `
    <div class="flex items-center justify-between gap-2">
      <button type="button" data-day-prev class="btn-icon" aria-label="Previous day"${
        canPrev ? "" : " disabled"
      }>${icon("chevronLeft")}</button>
      <div class="min-w-0 text-center">
        <p class="truncate text-sm font-semibold text-ink">${escapeHtml(
          formatFullDate(selected)
        )}</p>
        <div class="mt-0.5 flex items-center justify-center gap-2">${todayBadge}${
    showToday
      ? `<button type="button" data-day-today class="text-xs font-medium text-primary hover:underline">Jump to today</button>`
      : ""
  }</div>
      </div>
      <button type="button" data-day-next class="btn-icon" aria-label="Next day"${
        canNext ? "" : " disabled"
      }>${icon("chevronRight")}</button>
    </div>`;
}

function busyRow(block) {
  return `<div class="flex items-center gap-3 bg-surface py-2 pl-3 pr-2">
    <span class="badge border border-line bg-subtle text-muted">Busy</span>
    <p class="text-xs text-muted">${escapeHtml(formatTime(block.start))} – ${escapeHtml(
    formatTime(block.end)
  )}</p>
  </div>`;
}

function freeRow(win) {
  const mins = Math.round((win.end - win.start) / 60000);
  const proposeBtn = share.allowProposals
    ? `<button type="button" class="btn btn-ghost btn-sm ml-auto" data-propose-start="${escapeHtml(
        toDatetimeLocalValue(win.start)
      )}" data-propose-end="${escapeHtml(
        toDatetimeLocalValue(clampProposalEnd(win))
      )}">Propose</button>`
    : "";
  return `<div class="flex items-center gap-2 py-1.5 pl-3 pr-2 text-xs text-muted">
    <span class="text-success">${icon("check", { size: 14 })}</span>
    <span>Free ${escapeHtml(formatTime(win.start))} – ${escapeHtml(
    formatTime(win.end)
  )}</span>
    <span class="text-slate-400">· ${escapeHtml(formatDuration(mins))}</span>
    ${proposeBtn}
  </div>`;
}

// A not-important slot the owner marked as requestable. The prefill covers the
// whole slot (the visitor is asking to take that time); it reuses the propose
// data attributes, so the day-column wiring handles it like any other prefill.
function flexRow(win) {
  const mins = Math.round((win.end - win.start) / 60000);
  return `<div class="flex items-center gap-2 py-1.5 pl-3 pr-2 text-xs">
    <span class="badge border border-warning/40 bg-warning/10 text-warning">Flexible</span>
    <span class="text-muted">${escapeHtml(formatTime(win.start))} – ${escapeHtml(
    formatTime(win.end)
  )}</span>
    <span class="text-slate-400">· ${escapeHtml(formatDuration(mins))}</span>
    <button type="button" class="btn btn-ghost btn-sm ml-auto" data-propose-start="${escapeHtml(
      toDatetimeLocalValue(win.start)
    )}" data-propose-end="${escapeHtml(
    toDatetimeLocalValue(win.end)
  )}">Request</button>
  </div>`;
}

function renderDayColumn() {
  const column = document.getElementById("dayColumn");
  const canRequest = Boolean(share.allowProposals);
  const hardBlocks = busyForDay(selected);
  const flexBlocks = flexibleForDay(selected);
  // Without proposals, flexible time can't be requested, so fold it into the
  // busy display. With proposals on, it gets its own requestable section.
  const blocks = canRequest
    ? hardBlocks
    : mergeIntervals([...hardBlocks, ...flexBlocks]);
  const windows = freeForDay(selected);
  const busyMins = Math.round(
    blocks.reduce((sum, b) => sum + (b.end - b.start) / 60000, 0)
  );
  const summaryLine =
    busyMins > 0
      ? `${formatDuration(busyMins)} busy`
      : canRequest && flexBlocks.length
      ? "Some time is requestable"
      : "Free all day";

  const busyList = blocks.length
    ? `<div class="divide-y divide-line">${blocks.map(busyRow).join("")}</div>`
    : `<div class="px-3 py-6 text-center"><p class="text-sm text-muted">No busy time on this day.</p></div>`;

  const flexList =
    canRequest && flexBlocks.length
      ? `<div class="mt-3 border-t border-line pt-2">
           <p class="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted">Flexible — request these</p>
           ${flexBlocks.map(flexRow).join("")}
         </div>`
      : "";

  const freeList = windows.length
    ? `<div class="mt-3 border-t border-line pt-2">
         <p class="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted">Open windows</p>
         ${windows.map(freeRow).join("")}
       </div>`
    : "";

  column.innerHTML = `
    <div class="card card-pad">${dayNav()}</div>
    <div class="card mt-3 overflow-hidden">
      <div class="border-b border-line px-4 py-3">
        <p class="text-sm font-medium text-ink">${escapeHtml(summaryLine)}</p>
      </div>
      <div class="p-2">${busyList}${flexList}${freeList}</div>
    </div>`;
  wireDayColumn();
}

function wireDayColumn() {
  const column = document.getElementById("dayColumn");
  const prev = column.querySelector("[data-day-prev]");
  const next = column.querySelector("[data-day-next]");
  if (prev && !prev.disabled)
    prev.addEventListener("click", () => {
      selected = clampDay(addDays(selected, -1));
      monthCursor = startOfMonth(selected);
      renderAll();
    });
  if (next && !next.disabled)
    next.addEventListener("click", () => {
      selected = clampDay(addDays(selected, 1));
      monthCursor = startOfMonth(selected);
      renderAll();
    });
  const today = column.querySelector("[data-day-today]");
  if (today)
    today.addEventListener("click", () => {
      selected = clampDay(new Date());
      monthCursor = startOfMonth(selected);
      renderAll();
    });

  column.querySelectorAll("[data-propose-start]").forEach((btn) => {
    btn.addEventListener("click", () => {
      formMode = "proposal";
      pendingPrefill = {
        start: btn.getAttribute("data-propose-start"),
        end: btn.getAttribute("data-propose-end"),
      };
      renderSideColumn();
      const field = document.getElementById("proposeStart");
      if (field) field.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
}

// ---- Side column: month calendar + action form -----------------------------

function monthGrid() {
  const gridStart = startOfWeek(startOfMonth(monthCursor));
  const monthName = monthCursor.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const day = addDays(gridStart, i);
    const inMonth = day.getMonth() === monthCursor.getMonth();
    const inWindow = day >= navMin && day <= navMax;
    const base =
      "relative flex h-10 flex-col items-center justify-center rounded-btn text-sm";
    if (!inWindow) {
      cells.push(
        `<span class="${base} text-slate-300" aria-hidden="true"><span>${day.getDate()}</span><span class="mt-0.5 h-1.5 w-1.5"></span></span>`
      );
      continue;
    }
    const isSel = isSameDay(day, selected);
    const today = isToday(day);
    const hasBusy = hasBusyOnDay(day);
    const tone = isSel
      ? "bg-primary text-white font-semibold"
      : `${inMonth ? "text-ink hover:bg-subtle" : "text-slate-400 hover:bg-subtle"}${
          today ? " ring-1 ring-primary/40" : ""
        }`;
    const dot = hasBusy
      ? `<span class="mt-0.5 h-1.5 w-1.5 rounded-full ${
          isSel ? "bg-white" : "bg-slate-400"
        }"></span>`
      : `<span class="mt-0.5 h-1.5 w-1.5"></span>`;
    const label = `${formatFullDate(day)}${hasBusy ? ", has busy time" : ", free"}`;
    cells.push(
      `<button type="button" data-pick="${toDatetimeLocalValue(day).slice(
        0,
        10
      )}" class="${base} ${tone} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50" aria-label="${escapeHtml(
        label
      )}"${isSel ? ' aria-current="date"' : ""}><span>${day.getDate()}</span>${dot}</button>`
    );
  }
  const prevDisabled = startOfMonth(monthCursor) <= startOfMonth(navMin);
  const nextDisabled = startOfMonth(monthCursor) >= startOfMonth(navMax);
  return `
    <div class="card card-pad">
      <div class="flex items-center justify-between">
        <button type="button" data-month-prev class="btn-icon" aria-label="Previous month"${
          prevDisabled ? " disabled" : ""
        }>${icon("chevronLeft")}</button>
        <p class="text-sm font-semibold text-ink">${escapeHtml(monthName)}</p>
        <button type="button" data-month-next class="btn-icon" aria-label="Next month"${
          nextDisabled ? " disabled" : ""
        }>${icon("chevronRight")}</button>
      </div>
      <div class="mt-3 grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted">
        ${WEEKDAYS.map((d) => `<span>${d}</span>`).join("")}
      </div>
      <div class="mt-1 grid grid-cols-7 gap-1">${cells.join("")}</div>
      <p class="mt-3 flex items-center gap-1.5 text-xs text-muted"><span class="h-1.5 w-1.5 rounded-full bg-slate-400"></span> Days with busy time</p>
    </div>`;
}

function visitor() {
  return getItem(VISITOR_KEY, {}) || {};
}

function identityFields(v) {
  return `<div class="grid gap-3 sm:grid-cols-2">
    <div>
      <label class="label" for="shareName">Your name</label>
      <input id="shareName" type="text" class="input" maxlength="80" value="${escapeHtml(
        v.name || ""
      )}" autocomplete="name" />
    </div>
    <div>
      <label class="label" for="shareEmail">Email <span class="font-normal text-muted">(optional)</span></label>
      <input id="shareEmail" type="email" class="input" maxlength="160" value="${escapeHtml(
        v.email || ""
      )}" autocomplete="email" />
    </div>
  </div>`;
}

function noteFields() {
  return `${identityFields(visitor())}
    <div>
      <label class="label" for="shareMessage">Note</label>
      <textarea id="shareMessage" class="input min-h-24" maxlength="1000" placeholder="Share a message, a scheduling question, or some context."></textarea>
    </div>`;
}

function proposalFields() {
  const slot = pendingPrefill || defaultSlot();
  pendingPrefill = null;
  const startVal = slot ? slot.start : "";
  const endVal = slot ? slot.end : "";
  return `${identityFields(visitor())}
    <div class="grid gap-3 sm:grid-cols-2">
      <div>
        <label class="label" for="proposeStart">Starts</label>
        <input id="proposeStart" type="datetime-local" class="input" value="${escapeHtml(
          startVal
        )}" />
      </div>
      <div>
        <label class="label" for="proposeEnd">Ends</label>
        <input id="proposeEnd" type="datetime-local" class="input" value="${escapeHtml(
          endVal
        )}" />
      </div>
    </div>
    <p id="proposeConflict" class="error-text" role="alert"></p>
    <div>
      <label class="label" for="shareMessage">Message <span class="font-normal text-muted">(optional)</span></label>
      <textarea id="shareMessage" class="input min-h-20" maxlength="1000" placeholder="What's the meeting about?"></textarea>
    </div>
    <p class="text-xs text-muted">Busy times are blocked. ${escapeHtml(
      ownerName || "This person"
    )} approves your request before anything lands on their calendar.</p>`;
}

function defaultSlot() {
  const win = firstFreeWindowFrom(selected);
  if (!win) return null;
  return {
    start: toDatetimeLocalValue(win.start),
    end: toDatetimeLocalValue(clampProposalEnd(win)),
  };
}

function segmentedToggle(mode) {
  const button = (m, label) =>
    `<button type="button" data-mode="${m}" class="flex-1 rounded-btn px-3 py-1.5 text-sm font-medium ${
      mode === m ? "bg-primary text-white" : "text-muted hover:bg-subtle"
    }">${escapeHtml(label)}</button>`;
  return `<div class="mt-3 flex gap-1 rounded-btn border border-line bg-subtle p-1">${button(
    "proposal",
    "Propose a meeting"
  )}${button("note", "Leave a note")}</div>`;
}

function actionCard() {
  const who = ownerName || "this person";
  if (submitted) {
    return `<div class="card card-pad">
      <div class="flex items-start gap-3">
        <span class="mt-0.5 text-success">${icon("checkCircle")}</span>
        <div>
          <h2 class="text-sm font-semibold text-ink">Sent — thank you</h2>
          <p class="mt-1 text-sm text-muted">${escapeHtml(who)} will review your ${
      submittedType === "request"
        ? "time request"
        : submittedType === "proposal"
        ? "meeting request"
        : "note"
    }. Nothing is added to their calendar until they accept it.</p>
          <button type="button" class="btn btn-secondary btn-sm mt-4" data-send-another>Send another</button>
        </div>
      </div>
    </div>`;
  }

  const canNote = Boolean(share.allowNotes);
  const canPropose = Boolean(share.allowProposals);
  if (!canNote && !canPropose) {
    return `<div class="card card-pad">
      <div class="flex items-start gap-3">
        <span class="mt-0.5 text-muted">${icon("info")}</span>
        <div>
          <h2 class="text-sm font-semibold text-ink">View only</h2>
          <p class="mt-1 text-sm text-muted">This link shows ${escapeHtml(
            who
          )}'s free/busy times. Leaving a note or proposing a meeting isn't enabled for this link.</p>
        </div>
      </div>
    </div>`;
  }

  const mode = canPropose && (formMode === "proposal" || !canNote) ? "proposal" : "note";
  formMode = mode;
  const toggle = canNote && canPropose ? segmentedToggle(mode) : "";
  const heading = mode === "proposal" ? "Propose a meeting" : "Leave a note";
  const fields = mode === "proposal" ? proposalFields() : noteFields();
  return `<div class="card card-pad" id="actionCard">
    <h2 class="text-sm font-semibold text-ink">${escapeHtml(heading)}</h2>
    ${toggle}
    <form id="shareForm" class="mt-3 space-y-3" novalidate>${fields}
      <p id="shareError" class="error-text" role="alert"></p>
      <div class="flex justify-end">
        <button type="submit" id="shareSubmit" class="btn btn-primary btn-sm">${icon(
          "send",
          { size: 16 }
        )}${mode === "proposal" ? "Send request" : "Send note"}</button>
      </div>
    </form>
  </div>`;
}

function renderSideColumn() {
  const column = document.getElementById("sideColumn");
  column.innerHTML = monthGrid() + actionCard();
  wireSideColumn();
  wireActionCard();
}

function wireSideColumn() {
  const column = document.getElementById("sideColumn");
  const prev = column.querySelector("[data-month-prev]");
  const next = column.querySelector("[data-month-next]");
  if (prev && !prev.disabled)
    prev.addEventListener("click", () => {
      monthCursor = startOfMonth(addDays(startOfMonth(monthCursor), -1));
      renderSideColumn();
    });
  if (next && !next.disabled)
    next.addEventListener("click", () => {
      monthCursor = startOfMonth(addDays(endOfDay(startOfMonth(monthCursor)), 32));
      renderSideColumn();
    });
  column.querySelectorAll("[data-pick]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const value = fromDatetimeLocalValue(`${btn.getAttribute("data-pick")}T00:00`);
      if (!value) return;
      selected = clampDay(value);
      monthCursor = startOfMonth(selected);
      renderAll();
    });
  });
}

function wireActionCard() {
  const column = document.getElementById("sideColumn");
  column.querySelectorAll("[data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      formMode = btn.getAttribute("data-mode");
      renderSideColumn();
    });
  });
  const another = column.querySelector("[data-send-another]");
  if (another)
    another.addEventListener("click", () => {
      submitted = false;
      renderSideColumn();
    });
  const form = column.querySelector("#shareForm");
  if (form) {
    form.addEventListener("submit", onSubmit);
    // Live conflict block (F1): disable the submit while the chosen time overlaps
    // hard-busy time, so a visitor can't send a request on a busy slot.
    const startEl = form.querySelector("#proposeStart");
    const endEl = form.querySelector("#proposeEnd");
    if (startEl && endEl) {
      const run = () => updateProposalConflict(form);
      ["input", "change"].forEach((ev) => {
        startEl.addEventListener(ev, run);
        endEl.addEventListener(ev, run);
      });
      run();
    }
  }
}

// Reflects, on every keystroke, whether the proposed time clashes with hard-busy
// time: shows an inline message and disables the submit until it's clear. The
// submit-time guard in onSubmit remains the authoritative backstop.
function updateProposalConflict(form) {
  const startEl = form.querySelector("#proposeStart");
  const endEl = form.querySelector("#proposeEnd");
  const submit = form.querySelector("#shareSubmit");
  const hint = form.querySelector("#proposeConflict");
  if (!startEl || !endEl || !submit) return;
  const start = fromDatetimeLocalValue(startEl.value);
  const end = fromDatetimeLocalValue(endEl.value);
  const clash = Boolean(
    start &&
      end &&
      end > start &&
      busyIntervals.some((b) => overlaps(start, end, b.start, b.end))
  );
  if (hint) {
    hint.textContent = clash
      ? `That overlaps when ${
          ownerName || "this person"
        } is busy — pick a clear time.`
      : "";
    hint.classList.toggle("is-visible", clash);
  }
  submit.disabled = clash;
  submit.classList.toggle("opacity-50", clash);
  submit.classList.toggle("cursor-not-allowed", clash);
}

async function onSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const errorEl = form.querySelector("#shareError");
  const fail = (msg) => {
    errorEl.textContent = msg;
    errorEl.classList.add("is-visible");
  };
  errorEl.classList.remove("is-visible");

  const name = form.querySelector("#shareName").value.trim();
  const email = form.querySelector("#shareEmail").value.trim();
  const message = form.querySelector("#shareMessage").value.trim();

  if (!name) return fail("Please add your name.");
  if (name.length > 80) return fail("Name must be 80 characters or fewer.");
  if (email && !isValidEmail(email)) return fail("That email address looks invalid.");
  if (email.length > 160) return fail("Email must be 160 characters or fewer.");
  if (message.length > 1000)
    return fail("Message must be 1000 characters or fewer.");

  const isTimed = formMode === "proposal" && Boolean(share.allowProposals);
  const data = {
    type: "note",
    name,
    email,
    message,
  };

  if (isTimed) {
    const start = fromDatetimeLocalValue(form.querySelector("#proposeStart").value);
    const end = fromDatetimeLocalValue(form.querySelector("#proposeEnd").value);
    if (!start || !end) return fail("Choose a start and end time.");
    if (end <= start) return fail("End time must be after the start time.");
    // 60s grace: datetime-local drops seconds, so a slot chosen at the current
    // minute can parse a few seconds behind "now" without being truly past.
    if (start.getTime() < Date.now() - 60000)
      return fail("Pick a time in the future.");
    if (windowFrom && start < windowFrom)
      return fail("Pick a time within the shared date range.");
    if (windowTo && end > windowTo)
      return fail("Pick a time within the shared date range.");
    if (busyIntervals.some((b) => overlaps(start, end, b.start, b.end)))
      return fail(
        `That overlaps when ${
          ownerName || "this person"
        } is busy. Pick an open window.`
      );
    // Overlapping a not-important (flexible) slot makes this a request to take
    // that time; otherwise it's a proposal for open time. The owner approves both.
    const isRequest = flexibleIntervals.some((f) =>
      overlaps(start, end, f.start, f.end)
    );
    data.type = isRequest ? "request" : "proposal";
    data.proposedStart = start;
    data.proposedEnd = end;
  } else if (!message) {
    return fail("Add a short note.");
  }

  const submit = form.querySelector("#shareSubmit");
  setBusy(submit, true, "Sending…");
  try {
    await addSubmission(token, data);
    setItem(VISITOR_KEY, { name, email });
    submitted = true;
    submittedType = data.type;
    const sentMsg =
      data.type === "request"
        ? "Time request sent."
        : data.type === "proposal"
        ? "Meeting request sent."
        : "Note sent.";
    toast(sentMsg, "success");
    renderSideColumn();
  } catch {
    setBusy(submit, false);
    fail("Couldn't send that just now. Please try again.");
  }
}
