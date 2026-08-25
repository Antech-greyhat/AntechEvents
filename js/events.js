// Events agenda: search, status filter, and time scope over all of a user's events.
// Fetches once, then filters and groups in memory. Loading, empty, filtered-empty,
// and error states are all handled explicitly.
import { initShell } from "./app.js";
import { listEvents } from "./services/eventservice.js";
import { findConflicts } from "./conflicts.js";
import { eventCardHtml } from "./eventcard.js";
import { icon, escapeHtml, emptyState, errorState } from "./ui.js";
import { statusMeta, formatFullDate, formatRelativeDay, pluralize } from "./utils/formatters.js";
import { toDate, startOfDay } from "./utils/dates.js";
import { EVENT_STATUSES } from "./services/eventservice.js";

const main = document.getElementById("pageMain");
let session = null;
let allEvents = [];
let conflictMap = new Map();
const state = { scope: "upcoming", status: "all", query: "" };

init();

async function init() {
  session = await initShell({ active: "events" });
  if (!session) return;
  await load();
}

async function load() {
  main.innerHTML = loadingSkeleton();
  try {
    allEvents = await listEvents(session.user.uid);
  } catch {
    main.innerHTML = errorState({
      title: "Couldn't load your events",
      message: "There was a problem reaching your events. Check your connection and try again.",
    });
    const retry = main.querySelector("[data-retry]");
    if (retry) retry.addEventListener("click", load);
    return;
  }
  conflictMap = findConflicts(allEvents.filter((e) => e.status !== "cancelled"));
  renderPage();
}

function loadingSkeleton() {
  return `
    <div class="skeleton h-8 w-40"></div>
    <div class="mt-6 space-y-3">
      <div class="card card-pad"><div class="skeleton h-4 w-2/3"></div><div class="skeleton mt-3 h-3 w-1/2"></div></div>
      <div class="card card-pad"><div class="skeleton h-4 w-1/2"></div><div class="skeleton mt-3 h-3 w-2/3"></div></div>
    </div>`;
}

const SCOPES = [
  { key: "upcoming", label: "Upcoming" },
  { key: "all", label: "All" },
  { key: "past", label: "Past" },
];

function scopeButtons() {
  return SCOPES.map(
    (s) =>
      `<button type="button" data-scope="${s.key}" aria-pressed="${
        state.scope === s.key
      }" class="tab-link ${
        state.scope === s.key ? "tab-link-active" : ""
      } flex-none">${s.label}</button>`
  ).join("");
}

function statusChips() {
  const chip = (key, label) =>
    `<button type="button" data-status="${key}" aria-pressed="${
      state.status === key
    }" class="badge cursor-pointer border ${
      state.status === key
        ? "border-primary bg-primary/10 text-primary"
        : "border-line bg-surface text-muted hover:text-ink"
    }">${escapeHtml(label)}</button>`;
  return [
    chip("all", "All statuses"),
    ...EVENT_STATUSES.map((s) => chip(s, statusMeta[s].label)),
  ].join("");
}

function renderPage() {
  main.innerHTML = `
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h1 class="text-2xl font-bold tracking-tight text-ink">Events</h1>
      <a href="createevent.html" class="btn btn-primary hidden sm:inline-flex">${icon(
        "plus",
        { size: 16 }
      )}New event</a>
    </div>

    <div class="mt-5 space-y-3">
      <div class="relative">
        <span class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted">${icon(
          "search",
          { size: 18 }
        )}</span>
        <input id="eventSearch" type="search" inputmode="search" autocomplete="off" placeholder="Search by title, location, or organizer" class="input pl-10" value="${escapeHtml(
          state.query
        )}" aria-label="Search events" />
      </div>
      <div class="flex gap-1 overflow-x-auto rounded-btn border border-line bg-subtle p-1" role="group" aria-label="Time range">
        ${scopeButtons()}
      </div>
      <div class="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        ${statusChips()}
      </div>
    </div>

    <div id="eventsList" class="mt-6" aria-live="polite"></div>`;

  wireControls();
  renderList();
}

function wireControls() {
  const search = main.querySelector("#eventSearch");
  search.addEventListener("input", () => {
    state.query = search.value;
    renderList();
  });
  main.querySelectorAll("[data-scope]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.scope = btn.getAttribute("data-scope");
      syncPressed("[data-scope]", "data-scope", state.scope, "tab-link-active");
      renderList();
    });
  });
  main.querySelectorAll("[data-status]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.status = btn.getAttribute("data-status");
      renderList();
      refreshChips();
    });
  });
}

// Keeps aria-pressed and the active class in sync without a full re-render.
function syncPressed(selector, attr, value, activeClass) {
  main.querySelectorAll(selector).forEach((btn) => {
    const on = btn.getAttribute(attr) === value;
    btn.setAttribute("aria-pressed", String(on));
    if (activeClass) btn.classList.toggle(activeClass, on);
  });
}

function refreshChips() {
  const container = main.querySelector('[aria-label="Filter by status"]');
  if (container) {
    container.innerHTML = statusChips();
    container.querySelectorAll("[data-status]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.status = btn.getAttribute("data-status");
        renderList();
        refreshChips();
      });
    });
  }
}

function matchesQuery(event, q) {
  if (!q) return true;
  const haystack = [
    event.title,
    event.location,
    event.organizer,
    event.description,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

function applyFilters() {
  const now = Date.now();
  const q = state.query.trim().toLowerCase();
  return allEvents.filter((event) => {
    if (state.status !== "all" && event.status !== state.status) return false;
    if (!matchesQuery(event, q)) return false;
    const end = toDate(event.endAt) || toDate(event.startAt);
    const ended = end ? end.getTime() < now : false;
    if (state.scope === "upcoming" && ended) return false;
    if (state.scope === "past" && !ended) return false;
    return true;
  });
}

// Groups events into day sections, keyed and sorted by start time.
function groupByDay(events, descending) {
  const groups = new Map();
  const undated = [];
  for (const event of events) {
    const start = toDate(event.startAt);
    if (!start) {
      undated.push(event);
      continue;
    }
    const key = startOfDay(start).getTime();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  const keys = [...groups.keys()].sort((a, b) => (descending ? b - a : a - b));
  const sections = keys.map((key) => ({
    date: new Date(key),
    events: groups
      .get(key)
      .sort((a, b) => (toDate(a.startAt) || 0) - (toDate(b.startAt) || 0)),
  }));
  if (undated.length) sections.push({ date: null, events: undated });
  return sections;
}

function renderList() {
  const list = main.querySelector("#eventsList");
  if (!list) return;

  if (!allEvents.length) {
    list.innerHTML = emptyState({
      iconName: "calendarPlus",
      title: "No events yet",
      message: "Add your first event to start building your schedule.",
      actionHtml: `<a href="createevent.html" class="btn btn-primary">${icon(
        "plus",
        { size: 16 }
      )}Add your first event</a>`,
    });
    return;
  }

  const filtered = applyFilters();
  if (!filtered.length) {
    list.innerHTML = emptyState({
      iconName: "search",
      title: "No matching events",
      message: "Try a different search or clear your filters.",
      actionHtml: `<button type="button" data-clear class="btn btn-secondary">Clear filters</button>`,
    });
    const clear = list.querySelector("[data-clear]");
    if (clear) clear.addEventListener("click", clearFilters);
    return;
  }

  const sections = groupByDay(filtered, state.scope === "past");
  const count = filtered.length;
  list.innerHTML = `
    <p class="mb-3 text-sm text-muted">${count} ${pluralize(count, "event")}</p>
    <div class="space-y-6">
      ${sections
        .map(
          (section) => `
        <section>
          <h2 class="mb-2 flex items-baseline gap-2 text-sm font-semibold text-ink">
            <span>${section.date ? escapeHtml(formatRelativeDay(section.date)) : "Undated"}</span>
            ${
              section.date
                ? `<span class="text-xs font-normal text-muted">${escapeHtml(
                    formatFullDate(section.date)
                  )}</span>`
                : ""
            }
          </h2>
          <div class="space-y-3">
            ${section.events
              .map((e) =>
                eventCardHtml(e, {
                  conflictState: (conflictMap.get(e.id) || {}).state,
                })
              )
              .join("")}
          </div>
        </section>`
        )
        .join("")}
    </div>`;
}

function clearFilters() {
  state.scope = "upcoming";
  state.status = "all";
  state.query = "";
  renderPage();
}
