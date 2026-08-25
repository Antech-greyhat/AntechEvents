// Availability: a per-day free/busy view, manual busy periods, a month calendar
// for navigation, and a weekly summary. Conflict-aware and framework-free.
import { initShell } from "./app.js";
import { listEvents } from "./services/eventservice.js";
import {
  listBusyPeriods,
  addBusyPeriod,
  deleteBusyPeriod,
} from "./services/availabilityservice.js";
import { findConflicts, CONFLICT } from "./conflicts.js";
import {
  icon,
  escapeHtml,
  toast,
  setBusy,
  confirmDialog,
  errorState,
  conflictBadge,
} from "./ui.js";
import {
  formatFullDate,
  formatTime,
  formatDuration,
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
    </div>
    <div class="mt-6 grid gap-6 lg:grid-cols-5">
      <div id="dayColumn" class="lg:col-span-3"></div>
      <div id="sideColumn" class="lg:col-span-2"></div>
    </div>`;
  renderDayColumn();
  renderSideColumn();
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
