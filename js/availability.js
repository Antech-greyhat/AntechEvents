// Availability: a per-day free/busy view, manual busy periods, a month calendar
// for navigation, and a weekly summary. Conflict-aware and framework-free.
import { initShell } from "./app.js";
import { listEvents, createEvent } from "./services/eventservice.js";
import {
  listBusyPeriods,
  addBusyPeriod,
  deleteBusyPeriod,
} from "./services/availabilityservice.js";
import {
  createShare,
  listShares,
  setShareRevoked,
  updateSharePermissions,
  updateShareSnapshot,
  deleteShare,
  refreshOwnerShares,
  listSubmissions,
  setSubmissionStatus,
} from "./services/shareservice.js";
import { buildBusySnapshot } from "./utils/intervals.js";
import { findConflicts, CONFLICT } from "./conflicts.js";
import {
  icon,
  escapeHtml,
  toast,
  setBusy,
  confirmDialog,
  errorState,
  conflictBadge,
  openModal,
  copyToClipboard,
} from "./ui.js";
import {
  formatFullDate,
  formatTime,
  formatDuration,
  formatDateRange,
  formatRelativeDay,
  pluralize,
} from "./utils/formatters.js";
import {
  toDate,
  startOfDay,
  endOfDay,
  addDays,
  addMinutes,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  isSameDay,
  isToday,
  toDatetimeLocalValue,
  fromDatetimeLocalValue,
  getBrowserTimezone,
} from "./utils/dates.js";

const main = document.getElementById("pageMain");
let session = null;
let events = [];
let busy = [];
let conflictMap = new Map();

const now = new Date();
let selected = startOfDay(now);
let monthCursor = startOfMonth(now);

init();

async function init() {
  session = await initShell({ active: "availability" });
  if (!session) return;
  const dateParam = new URLSearchParams(location.search).get("date");
  const parsed = dateParam ? fromDatetimeLocalValue(`${dateParam}T00:00`) : null;
  if (parsed) {
    selected = startOfDay(parsed);
    monthCursor = startOfMonth(parsed);
  }
  await load();
}

async function load() {
  renderSkeleton();
  try {
    [events, busy] = await Promise.all([
      listEvents(session.user.uid),
      listBusyPeriods(session.user.uid),
    ]);
  } catch {
    main.innerHTML = errorState({
      title: "Couldn't load your availability",
      message: "There was a problem reaching your data. Check your connection and try again.",
    });
    const retry = main.querySelector("[data-retry]");
    if (retry) retry.addEventListener("click", load);
    return;
  }
  conflictMap = findConflicts(events.filter((e) => e.status !== "cancelled"));
  renderAll();
  // Keep any public share links in sync with the owner's latest schedule.
  // Best-effort and fire-and-forget: the page is usable even if this fails.
  refreshSharesQuietly();
}

async function refreshSharesQuietly() {
  try {
    const snapshot = buildBusySnapshot(events, busy, {
      fromDate: new Date(),
      days: 60,
    });
    await refreshOwnerShares(session.user.uid, snapshot);
  } catch {
    // No active links, or a transient error — the owner can refresh manually.
  }
}

function renderSkeleton() {
  main.innerHTML = `
    <div class="skeleton h-8 w-48"></div>
    <div class="mt-6 grid gap-6 lg:grid-cols-5">
      <div class="lg:col-span-3 space-y-3">
        <div class="skeleton h-11 w-full"></div>
        <div class="card card-pad"><div class="skeleton h-4 w-1/2"></div><div class="skeleton mt-3 h-3 w-2/3"></div></div>
      </div>
      <div class="lg:col-span-2"><div class="skeleton h-64 w-full"></div></div>
    </div>`;
}

// ---- Interval helpers -------------------------------------------------------

function mergeIntervals(items) {
  const sorted = items
    .filter((i) => i.start && i.end && i.end > i.start)
    .sort((a, b) => a.start - b.start);
  const merged = [];
  for (const item of sorted) {
    const last = merged[merged.length - 1];
    if (last && item.start <= last.end) {
      if (item.end > last.end) last.end = item.end;
    } else {
      merged.push({ start: new Date(item.start), end: new Date(item.end) });
    }
  }
  return merged;
}

function intersectsDay(start, end, dayStart, dayEnd) {
  const s = start;
  const e = end || start;
  return Boolean(s) && e >= dayStart && s <= dayEnd;
}

// Collects events and busy periods that touch a given day.
function itemsForDay(date) {
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);
  const items = [];
  events
    .filter((e) => e.status !== "cancelled")
    .forEach((e) => {
      const s = toDate(e.startAt);
      const en = toDate(e.endAt);
      if (intersectsDay(s, en, dayStart, dayEnd)) {
        items.push({
          kind: "event",
          id: e.id,
          title: e.title || "Untitled event",
          start: s,
          end: en,
          conflictState: (conflictMap.get(e.id) || {}).state,
        });
      }
    });
  busy.forEach((b) => {
    const s = toDate(b.startAt);
    const en = toDate(b.endAt);
    if (intersectsDay(s, en, dayStart, dayEnd)) {
      items.push({ kind: "busy", id: b.id, title: b.title || "Busy", start: s, end: en });
    }
  });
  return items.sort((a, b) => (a.start || 0) - (b.start || 0));
}

function dayBusyMinutes(date) {
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);
  const clipped = itemsForDay(date)
    .filter((i) => i.end && i.end > i.start)
    .map((i) => ({
      start: i.start < dayStart ? dayStart : i.start,
      end: i.end > dayEnd ? dayEnd : i.end,
    }));
  return mergeIntervals(clipped).reduce((sum, i) => sum + (i.end - i.start) / 60000, 0);
}

// Free windows are the gaps within the day not covered by any busy interval.
function freeWindows(date) {
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);
  const merged = mergeIntervals(
    itemsForDay(date)
      .filter((i) => i.end && i.end > i.start)
      .map((i) => ({
        start: i.start < dayStart ? dayStart : i.start,
        end: i.end > dayEnd ? dayEnd : i.end,
      }))
  );
  const windows = [];
  let cursor = new Date(dayStart);
  for (const block of merged) {
    if (block.start > cursor) windows.push({ start: new Date(cursor), end: new Date(block.start) });
    if (block.end > cursor) cursor = new Date(block.end);
  }
  if (cursor < dayEnd) windows.push({ start: new Date(cursor), end: new Date(dayEnd) });
  // Ignore trivial sub-15-minute slivers.
  return windows.filter((w) => (w.end - w.start) / 60000 >= 15);
}

function countForDay(date) {
  return itemsForDay(date).length;
}

// ---- Rendering --------------------------------------------------------------

function renderAll() {
  main.innerHTML = `
    <div class="flex items-center justify-between gap-3">
      <h1 class="text-2xl font-bold tracking-tight text-ink">Availability</h1>
      <button type="button" data-share class="btn btn-secondary btn-sm">${icon(
        "share",
        { size: 16 }
      )}Share</button>
    </div>
    <div class="mt-6 grid gap-6 lg:grid-cols-5">
      <div id="dayColumn" class="lg:col-span-3"></div>
      <div id="sideColumn" class="lg:col-span-2"></div>
    </div>`;
  renderDayColumn();
  renderSideColumn();
  const shareBtn = main.querySelector("[data-share]");
  if (shareBtn) shareBtn.addEventListener("click", openShareManager);
}

function dayNav() {
  const todayBadge = isToday(selected)
    ? `<span class="badge badge-clear">Today</span>`
    : "";
  return `
    <div class="flex items-center justify-between gap-2">
      <button type="button" data-day-prev class="btn-icon" aria-label="Previous day">${icon(
        "chevronLeft"
      )}</button>
      <div class="min-w-0 text-center">
        <p class="truncate text-sm font-semibold text-ink">${escapeHtml(
          formatFullDate(selected)
        )}</p>
        <div class="mt-0.5 flex items-center justify-center gap-2">${todayBadge}${
    isToday(selected) ? "" : `<button type="button" data-day-today class="text-xs font-medium text-primary hover:underline">Jump to today</button>`
  }</div>
      </div>
      <button type="button" data-day-next class="btn-icon" aria-label="Next day">${icon(
        "chevronRight"
      )}</button>
    </div>`;
}

function itemRow(item) {
  const isBusy = item.kind === "busy";
  const time = item.end
    ? `${formatTime(item.start)} – ${formatTime(item.end)}`
    : `${formatTime(item.start)} · no end time`;
  const accent = isBusy ? "border-l-slate-400" : "border-l-primary";
  const titleHtml = isBusy
    ? `<span class="text-sm font-medium text-ink">${escapeHtml(item.title)}</span>`
    : `<a href="/event?id=${encodeURIComponent(
        item.id
      )}" class="text-sm font-medium text-ink hover:text-primary hover:underline">${escapeHtml(
        item.title
      )}</a>`;
  const badge =
    !isBusy && item.conflictState === CONFLICT.conflict
      ? conflictBadge(item.conflictState)
      : "";
  const del = isBusy
    ? `<button type="button" data-del-busy="${escapeHtml(
        item.id
      )}" class="btn-icon shrink-0" aria-label="Remove busy time">${icon("trash", {
        size: 16,
      })}</button>`
    : "";
  return `
    <div class="flex items-center justify-between gap-3 border-l-2 ${accent} bg-surface py-2 pl-3 pr-1">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">${titleHtml}${badge}${
    isBusy ? `<span class="badge border border-line bg-subtle text-muted">Busy</span>` : ""
  }</div>
        <p class="mt-0.5 text-xs text-muted">${escapeHtml(time)}</p>
      </div>
      ${del}
    </div>`;
}

function freeRow(win) {
  const mins = Math.round((win.end - win.start) / 60000);
  return `<div class="flex items-center gap-2 py-1.5 pl-3 text-xs text-muted">
    <span class="text-success">${icon("check", { size: 14 })}</span>
    <span>Free ${escapeHtml(formatTime(win.start))} – ${escapeHtml(
    formatTime(win.end)
  )}</span>
    <span class="text-slate-400">· ${escapeHtml(formatDuration(mins))}</span>
  </div>`;
}

function renderDayColumn() {
  const column = document.getElementById("dayColumn");
  const items = itemsForDay(selected);
  const busyMinutes = Math.round(dayBusyMinutes(selected));
  const windows = freeWindows(selected);

  const summaryLine =
    busyMinutes > 0
      ? `${formatDuration(busyMinutes)} booked · ${items.length} ${pluralize(
          items.length,
          "item"
        )}`
      : "Nothing scheduled — free all day";

  const body = items.length
    ? `<div class="divide-y divide-line">${items.map(itemRow).join("")}</div>
       ${
         windows.length
           ? `<div class="mt-3 border-t border-line pt-2">
                <p class="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted">Free windows</p>
                ${windows.map(freeRow).join("")}
              </div>`
           : ""
       }`
    : `<div class="px-3 py-6 text-center">
         <p class="text-sm text-muted">No events or busy time for this day.</p>
       </div>`;

  column.innerHTML = `
    <div class="card card-pad">${dayNav()}</div>
    <div class="card mt-3 overflow-hidden">
      <div class="border-b border-line px-4 py-3">
        <p class="text-sm font-medium text-ink">${escapeHtml(summaryLine)}</p>
      </div>
      <div class="p-2">${body}</div>
    </div>

    <form id="busyForm" class="card card-pad mt-3 space-y-3" novalidate>
      <h2 class="text-sm font-semibold text-ink">Block out busy time</h2>
      <div>
        <label class="label" for="busyTitle">Label</label>
        <input id="busyTitle" type="text" class="input" placeholder="e.g. Focus time, commute" />
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <div>
          <label class="label" for="busyStart">Starts</label>
          <input id="busyStart" type="datetime-local" class="input" />
        </div>
        <div>
          <label class="label" for="busyEnd">Ends</label>
          <input id="busyEnd" type="datetime-local" class="input" />
        </div>
      </div>
      <p id="busyError" class="error-text" role="alert"></p>
      <div class="flex justify-end">
        <button type="submit" id="busySubmit" class="btn btn-primary btn-sm">${icon(
          "plus",
          { size: 16 }
        )}Add busy time</button>
      </div>
    </form>`;

  wireDayColumn();
}

function wireDayColumn() {
  const column = document.getElementById("dayColumn");
  column.querySelector("[data-day-prev]").addEventListener("click", () => {
    selected = startOfDay(addDays(selected, -1));
    syncMonthCursor();
    renderAll();
  });
  column.querySelector("[data-day-next]").addEventListener("click", () => {
    selected = startOfDay(addDays(selected, 1));
    syncMonthCursor();
    renderAll();
  });
  const today = column.querySelector("[data-day-today]");
  if (today)
    today.addEventListener("click", () => {
      selected = startOfDay(new Date());
      syncMonthCursor();
      renderAll();
    });

  column.querySelectorAll("[data-del-busy]").forEach((btn) => {
    btn.addEventListener("click", () => removeBusy(btn.getAttribute("data-del-busy")));
  });

  // Seed the busy form with sensible times on the selected day.
  const startInput = column.querySelector("#busyStart");
  const endInput = column.querySelector("#busyEnd");
  const seed = new Date(selected);
  seed.setHours(9, 0, 0, 0);
  startInput.value = toDatetimeLocalValue(seed);
  endInput.value = toDatetimeLocalValue(addMinutes(seed, 60));

  column.querySelector("#busyForm").addEventListener("submit", onAddBusy);
}

function syncMonthCursor() {
  monthCursor = startOfMonth(selected);
}

async function onAddBusy(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const title = form.querySelector("#busyTitle").value;
  const start = fromDatetimeLocalValue(form.querySelector("#busyStart").value);
  const end = fromDatetimeLocalValue(form.querySelector("#busyEnd").value);
  const errorEl = form.querySelector("#busyError");
  const fail = (msg) => {
    errorEl.textContent = msg;
    errorEl.classList.add("is-visible");
  };
  errorEl.classList.remove("is-visible");

  if (!start || !end) return fail("Choose a start and end time.");
  if (end <= start) return fail("End time must be after the start time.");

  const submit = form.querySelector("#busySubmit");
  setBusy(submit, true, "Adding…");
  try {
    await addBusyPeriod(session.user.uid, { title, startAt: start, endAt: end });
    toast("Busy time added.", "success");
    selected = startOfDay(start);
    await load();
  } catch {
    setBusy(submit, false);
    fail("Couldn't add busy time. Please try again.");
  }
}

async function removeBusy(id) {
  const ok = await confirmDialog({
    title: "Remove this busy time?",
    message: "It will no longer block out your availability.",
    confirmLabel: "Remove",
    cancelLabel: "Keep it",
    tone: "danger",
  });
  if (!ok) return;
  try {
    await deleteBusyPeriod(id);
    toast("Busy time removed.", "success");
    await load();
  } catch {
    toast("Couldn't remove it. Please try again.", "error");
  }
}

// ---- Side column: month calendar + weekly summary ---------------------------

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

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
    const count = countForDay(day);
    const isSel = isSameDay(day, selected);
    const today = isToday(day);
    const base =
      "relative flex h-10 flex-col items-center justify-center rounded-btn text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50";
    const tone = isSel
      ? "bg-primary text-white font-semibold"
      : `${inMonth ? "text-ink hover:bg-subtle" : "text-slate-400 hover:bg-subtle"}${
          today ? " ring-1 ring-primary/40" : ""
        }`;
    const dot =
      count > 0
        ? `<span class="mt-0.5 h-1.5 w-1.5 rounded-full ${
            isSel ? "bg-white" : "bg-primary"
          }"></span>`
        : `<span class="mt-0.5 h-1.5 w-1.5"></span>`;
    cells.push(
      `<button type="button" data-pick="${toDatetimeLocalValue(day).slice(
        0,
        10
      )}" class="${base} ${tone}" aria-label="${escapeHtml(
        formatFullDate(day)
      )}${count ? `, ${count} ${pluralize(count, "item")}` : ""}"${
        isSel ? ' aria-current="date"' : ""
      }><span>${day.getDate()}</span>${dot}</button>`
    );
  }
  return `
    <div class="card card-pad">
      <div class="flex items-center justify-between">
        <button type="button" data-month-prev class="btn-icon" aria-label="Previous month">${icon(
          "chevronLeft"
        )}</button>
        <p class="text-sm font-semibold text-ink">${escapeHtml(monthName)}</p>
        <button type="button" data-month-next class="btn-icon" aria-label="Next month">${icon(
          "chevronRight"
        )}</button>
      </div>
      <div class="mt-3 grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted">
        ${WEEKDAYS.map((d) => `<span>${d}</span>`).join("")}
      </div>
      <div class="mt-1 grid grid-cols-7 gap-1">${cells.join("")}</div>
    </div>`;
}

function weeklySummary() {
  const weekStart = startOfWeek(selected);
  const weekEnd = endOfWeek(selected);
  let totalMinutes = 0;
  let eventCount = 0;
  let busiest = { day: null, minutes: 0 };
  let freeDays = 0;

  for (let i = 0; i < 7; i += 1) {
    const day = addDays(weekStart, i);
    const minutes = dayBusyMinutes(day);
    const dayEvents = events.filter(
      (e) => e.status !== "cancelled" && isSameDay(e.startAt, day)
    ).length;
    eventCount += dayEvents;
    totalMinutes += minutes;
    if (minutes > busiest.minutes) busiest = { day, minutes };
    if (minutes === 0 && dayEvents === 0) freeDays += 1;
  }

  const rangeLabel = `${weekStart.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} – ${weekEnd.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;

  const stat = (label, value) =>
    `<div class="flex items-center justify-between py-2 text-sm">
      <span class="text-muted">${escapeHtml(label)}</span>
      <span class="font-medium text-ink">${escapeHtml(value)}</span>
    </div>`;

  return `
    <div class="card card-pad mt-4">
      <div class="flex items-center gap-2">
        <span class="text-primary">${icon("gauge", { size: 18 })}</span>
        <h2 class="text-sm font-semibold text-ink">This week</h2>
      </div>
      <p class="mt-0.5 text-xs text-muted">${escapeHtml(rangeLabel)}</p>
      <div class="mt-2 divide-y divide-line">
        ${stat("Booked time", totalMinutes > 0 ? formatDuration(Math.round(totalMinutes)) : "None")}
        ${stat("Events", String(eventCount))}
        ${stat(
          "Busiest day",
          busiest.day
            ? `${busiest.day.toLocaleDateString(undefined, { weekday: "short" })} · ${formatDuration(
                Math.round(busiest.minutes)
              )}`
            : "—"
        )}
        ${stat("Free days", String(freeDays))}
      </div>
    </div>`;
}

function renderSideColumn() {
  const column = document.getElementById("sideColumn");
  column.innerHTML = monthGrid() + weeklySummary();
  wireSideColumn();
}

function wireSideColumn() {
  const column = document.getElementById("sideColumn");
  column.querySelector("[data-month-prev]").addEventListener("click", () => {
    monthCursor = startOfMonth(addDays(startOfMonth(monthCursor), -1));
    renderSideColumn();
  });
  column.querySelector("[data-month-next]").addEventListener("click", () => {
    monthCursor = startOfMonth(addDays(endOfDay(startOfMonth(monthCursor)), 32));
    renderSideColumn();
  });
  column.querySelectorAll("[data-pick]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const value = fromDatetimeLocalValue(`${btn.getAttribute("data-pick")}T00:00`);
      if (!value) return;
      selected = startOfDay(value);
      monthCursor = startOfMonth(value);
      renderAll();
    });
  });
}

// ---- Share manager: create links, set permissions, review requests ----------

let shareModal = null;

function openShareManager() {
  shareModal = openModal({
    title: "Share your availability",
    contentHtml: `<div data-manager class="space-y-1"><div class="skeleton h-24 w-full"></div></div>`,
    onClose: () => {
      shareModal = null;
    },
  });
  refreshManager();
}

async function loadManagerData(uid) {
  const shares = await listShares(uid);
  const submissionsByToken = {};
  await Promise.all(
    shares.map(async (s) => {
      try {
        submissionsByToken[s.token] = await listSubmissions(s.token);
      } catch {
        submissionsByToken[s.token] = [];
      }
    })
  );
  return { shares, submissionsByToken };
}

async function refreshManager() {
  if (!shareModal) return;
  const container = shareModal.body.querySelector("[data-manager]");
  if (!container) return;
  let data;
  try {
    data = await loadManagerData(session.user.uid);
  } catch {
    container.innerHTML = `<p class="text-sm text-danger">Couldn't load your links. Please close this and try again.</p>`;
    return;
  }
  if (!shareModal) return;
  container.innerHTML = managerHtml(data);
  wireManager(container, data);
}

function managerHtml({ shares, submissionsByToken }) {
  const pending = [];
  shares.forEach((s) => {
    (submissionsByToken[s.token] || []).forEach((sub) => {
      if (sub.status === "pending") pending.push({ share: s, sub });
    });
  });
  return `${createSection()}${requestsSection(pending)}${linksSection(
    shares,
    submissionsByToken
  )}`;
}

function createSection() {
  const checkbox =
    'class="h-4 w-4 rounded border-line text-primary focus:ring-primary/50"';
  return `
    <section>
      <h3 class="text-sm font-semibold text-ink">Create a link</h3>
      <p class="mt-1 text-xs text-muted">Anyone with the link sees only your busy/free times — never event titles or details.</p>
      <form data-create-form class="mt-3 space-y-3" novalidate>
        <div>
          <label class="label" for="shareLabel">Label <span class="font-normal text-muted">(optional, only you see this)</span></label>
          <input id="shareLabel" type="text" class="input" maxlength="80" placeholder="e.g. Recruiting, Coffee chats" />
        </div>
        <div class="flex flex-col gap-2">
          <label class="flex items-center gap-2 text-sm text-ink"><input type="checkbox" data-allow-notes ${checkbox} /> Allow visitors to leave a note</label>
          <label class="flex items-center gap-2 text-sm text-ink"><input type="checkbox" data-allow-proposals ${checkbox} /> Allow visitors to propose a meeting <span class="text-muted">(you approve first)</span></label>
        </div>
        <div class="flex justify-end">
          <button type="submit" data-create-submit class="btn btn-primary btn-sm">${icon(
            "share",
            { size: 16 }
          )}Create link</button>
        </div>
      </form>
    </section>`;
}

function requestsSection(pending) {
  if (!pending.length) return "";
  return `
    <section class="mt-6 border-t border-line pt-5">
      <div class="flex items-center gap-2">
        <h3 class="text-sm font-semibold text-ink">Requests</h3>
        <span class="badge badge-registered">${pending.length}</span>
      </div>
      <p class="mt-1 text-xs text-muted">Pending notes and meeting requests. Nothing is on your calendar until you accept it.</p>
      <div class="mt-3 space-y-3">${pending.map(requestRow).join("")}</div>
    </section>`;
}

function requestRow({ share, sub }) {
  const isProposal = sub.type === "proposal";
  const from = sub.name || "Someone";
  const meta = [];
  if (sub.email)
    meta.push(
      `<a href="mailto:${escapeHtml(
        sub.email
      )}" class="text-primary hover:underline">${escapeHtml(sub.email)}</a>`
    );
  if (share.label) meta.push(escapeHtml(share.label));
  if (sub.createdAt) meta.push(`received ${escapeHtml(formatRelativeDay(sub.createdAt))}`);
  return `
    <div class="rounded-card border border-line p-3" data-request="${escapeHtml(
      sub.id
    )}" data-token="${escapeHtml(share.token)}">
      <div class="flex flex-wrap items-center gap-2">
        <span class="badge ${
          isProposal ? "badge-registered" : "border border-line bg-subtle text-muted"
        }">${isProposal ? "Meeting request" : "Note"}</span>
        <span class="text-sm font-medium text-ink">${escapeHtml(from)}</span>
      </div>
      ${
        meta.length
          ? `<p class="mt-1 text-xs text-muted">${meta.join(" · ")}</p>`
          : ""
      }
      ${
        isProposal
          ? `<p class="mt-1 text-sm font-medium text-ink">${escapeHtml(
              formatDateRange(sub.proposedStart, sub.proposedEnd)
            )}</p>`
          : ""
      }
      ${
        sub.message
          ? `<p class="mt-1 whitespace-pre-line text-sm text-muted">${escapeHtml(
              sub.message
            )}</p>`
          : ""
      }
      <div class="mt-2 flex justify-end gap-2">
        ${
          isProposal
            ? `<button type="button" data-accept class="btn btn-primary btn-sm">${icon(
                "check",
                { size: 16 }
              )}Accept &amp; add</button>`
            : ""
        }
        <button type="button" data-dismiss class="btn btn-secondary btn-sm">Dismiss</button>
      </div>
    </div>`;
}

function linksSection(shares, submissionsByToken) {
  const body = shares.length
    ? shares.map((s) => linkRow(s, submissionsByToken[s.token] || [])).join("")
    : `<p class="text-sm text-muted">No links yet — create one above.</p>`;
  return `
    <section class="mt-6 border-t border-line pt-5">
      <h3 class="text-sm font-semibold text-ink">Your links</h3>
      <div class="mt-3 space-y-3">${body}</div>
    </section>`;
}

function linkRow(share, subs) {
  const url = `${location.origin}/share?token=${encodeURIComponent(share.token)}`;
  const revoked = share.revoked === true;
  const pendingCount = subs.filter((x) => x.status === "pending").length;
  const checkbox =
    'class="h-4 w-4 rounded border-line text-primary focus:ring-primary/50"';
  return `
    <div class="rounded-card border border-line p-3 ${
      revoked ? "bg-subtle/40" : ""
    }" data-link="${escapeHtml(share.token)}">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-sm font-medium text-ink">${escapeHtml(
          share.label || "Untitled link"
        )}</span>
        ${
          revoked
            ? `<span class="badge badge-cancelled">Revoked</span>`
            : `<span class="badge badge-clear">Active</span>`
        }
        ${
          pendingCount
            ? `<span class="badge badge-registered">${pendingCount} pending</span>`
            : ""
        }
      </div>
      <div class="mt-2 flex items-center gap-2">
        <input type="text" class="input text-xs" readonly value="${escapeHtml(
          url
        )}" data-link-url aria-label="Share link URL" />
        <button type="button" data-copy class="btn btn-secondary btn-sm shrink-0">${icon(
          "copy",
          { size: 16 }
        )}Copy</button>
      </div>
      <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <label class="flex items-center gap-2 text-xs text-ink"><input type="checkbox" data-toggle-notes ${
          share.allowNotes ? "checked" : ""
        } ${checkbox} /> Notes</label>
        <label class="flex items-center gap-2 text-xs text-ink"><input type="checkbox" data-toggle-proposals ${
          share.allowProposals ? "checked" : ""
        } ${checkbox} /> Meeting proposals</label>
        <div class="ml-auto flex items-center gap-2">
          <button type="button" data-toggle-revoke class="btn btn-secondary btn-sm">${
            revoked ? "Enable" : "Revoke"
          }</button>
          <button type="button" data-delete-link class="btn-icon" aria-label="Delete link">${icon(
            "trash",
            { size: 16 }
          )}</button>
        </div>
      </div>
    </div>`;
}

function wireManager(container, data) {
  const createForm = container.querySelector("[data-create-form]");
  if (createForm) createForm.addEventListener("submit", onCreateShare);

  container.querySelectorAll("[data-request]").forEach((row) => {
    const token = row.getAttribute("data-token");
    const subId = row.getAttribute("data-request");
    const sub = (data.submissionsByToken[token] || []).find((x) => x.id === subId);
    const accept = row.querySelector("[data-accept]");
    const dismiss = row.querySelector("[data-dismiss]");
    if (accept)
      accept.addEventListener("click", () => onAcceptRequest(token, sub, accept));
    if (dismiss)
      dismiss.addEventListener("click", () =>
        onDismissRequest(token, subId, dismiss)
      );
  });

  container.querySelectorAll("[data-link]").forEach((row) => {
    const token = row.getAttribute("data-link");
    const share = data.shares.find((s) => s.token === token);
    const copyBtn = row.querySelector("[data-copy]");
    const urlInput = row.querySelector("[data-link-url]");
    if (copyBtn && urlInput)
      copyBtn.addEventListener("click", () =>
        copyToClipboard(urlInput.value, {
          successMessage: "Link copied.",
          errorMessage: "Couldn't copy the link.",
        })
      );
    const notes = row.querySelector("[data-toggle-notes]");
    const proposals = row.querySelector("[data-toggle-proposals]");
    if (notes)
      notes.addEventListener("change", () =>
        onTogglePermission(token, { allowNotes: notes.checked }, notes)
      );
    if (proposals)
      proposals.addEventListener("change", () =>
        onTogglePermission(token, { allowProposals: proposals.checked }, proposals)
      );
    const revoke = row.querySelector("[data-toggle-revoke]");
    if (revoke && share)
      revoke.addEventListener("click", () => onToggleRevoke(share, revoke));
    const del = row.querySelector("[data-delete-link]");
    if (del) del.addEventListener("click", () => onDeleteLink(token));
  });
}

function currentSnapshot() {
  return buildBusySnapshot(events, busy, { fromDate: new Date(), days: 60 });
}

async function onCreateShare(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const label = form.querySelector("#shareLabel").value;
  const allowNotes = form.querySelector("[data-allow-notes]").checked;
  const allowProposals = form.querySelector("[data-allow-proposals]").checked;
  const submit = form.querySelector("[data-create-submit]");
  setBusy(submit, true, "Creating…");
  try {
    const profile = session.profile || {};
    const ownerName =
      profile.displayName ||
      session.user.displayName ||
      session.user.email ||
      "";
    const timezone =
      (profile.preferences && profile.preferences.timezone) ||
      getBrowserTimezone();
    await createShare(
      session.user.uid,
      { label, ownerName, timezone, allowNotes, allowProposals },
      currentSnapshot()
    );
    toast("Share link created.", "success");
    await refreshManager();
  } catch {
    setBusy(submit, false);
    toast("Couldn't create the link. Please try again.", "error");
  }
}

async function onAcceptRequest(token, sub, button) {
  if (!sub) return;
  const start = toDate(sub.proposedStart);
  const end = toDate(sub.proposedEnd);
  if (!start || !end) {
    toast("This request is missing a valid time.", "error");
    return;
  }
  setBusy(button, true, "Adding…");
  try {
    const notes = [];
    if (sub.message) notes.push(sub.message);
    if (sub.email) notes.push(`Contact: ${sub.email}`);
    notes.push("Added from a shared availability request.");
    await createEvent(session.user.uid, {
      title: `Meeting with ${sub.name || "guest"}`,
      startAt: start,
      endAt: end,
      notes: notes.join("\n"),
      status: "planned",
    });
    await setSubmissionStatus(token, sub.id, "accepted");
    toast("Meeting added to your calendar.", "success");
    await load();
    await refreshManager();
  } catch {
    setBusy(button, false);
    toast("Couldn't accept this request. Please try again.", "error");
  }
}

async function onDismissRequest(token, subId, button) {
  setBusy(button, true, "Dismissing…");
  try {
    await setSubmissionStatus(token, subId, "dismissed");
    toast("Request dismissed.", "success");
    await refreshManager();
  } catch {
    setBusy(button, false);
    toast("Couldn't dismiss this. Please try again.", "error");
  }
}

async function onTogglePermission(token, patch, input) {
  input.disabled = true;
  try {
    await updateSharePermissions(token, patch);
    input.disabled = false;
    toast("Permissions updated.", "success");
  } catch {
    input.checked = !input.checked;
    input.disabled = false;
    toast("Couldn't update permissions. Please try again.", "error");
  }
}

async function onToggleRevoke(share, button) {
  const next = share.revoked !== true;
  setBusy(button, true, next ? "Revoking…" : "Enabling…");
  try {
    await setShareRevoked(share.token, next);
    // Re-enabling: refresh the snapshot so a stale window isn't served.
    if (!next) await updateShareSnapshot(share.token, currentSnapshot());
    toast(next ? "Link revoked." : "Link enabled.", "success");
    await refreshManager();
  } catch {
    setBusy(button, false);
    toast("Couldn't update the link. Please try again.", "error");
  }
}

async function onDeleteLink(token) {
  const ok = await confirmDialog({
    title: "Delete this link?",
    message:
      "The link will stop working immediately and its requests will be removed. This can't be undone.",
    confirmLabel: "Delete",
    cancelLabel: "Keep it",
    tone: "danger",
  });
  if (!ok) return;
  try {
    await deleteShare(token);
    toast("Link deleted.", "success");
    await refreshManager();
  } catch {
    toast("Couldn't delete the link. Please try again.", "error");
  }
}
