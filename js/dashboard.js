// Dashboard: today's overview, next event, upcoming, conflicts, availability, and
// quick actions. Handles loading, empty, error, and conflict states explicitly.
import { initShell } from "./app.js";
import { listEvents, setEventStatus } from "./services/eventservice.js";
import { listBusyPeriods } from "./services/availabilityservice.js";
import { findConflicts, CONFLICT } from "./conflicts.js";
import { eventCardHtml } from "./eventcard.js";
import {
  icon,
  escapeHtml,
  toast,
  statusBadge,
  conflictBadge,
  errorState,
  skeletonList,
  setBusy,
  openModal,
} from "./ui.js";
import {
  toDate,
  isToday,
  startOfDay,
  endOfDay,
  addDays,
} from "./utils/dates.js";
import {
  formatRelativeDay,
  formatTime,
  formatDateRange,
  formatDuration,
  pluralize,
} from "./utils/formatters.js";
import { futureFlowSteps } from "./eventinbox.js";

const main = document.getElementById("pageMain");
let session = null;

init();

async function init() {
  session = await initShell({ active: "dashboard" });
  if (!session) return;
  await load();
}

async function load() {
  main.innerHTML = loadingSkeleton();
  let events = [];
  let busy = [];
  try {
    [events, busy] = await Promise.all([
      listEvents(session.user.uid),
      listBusyPeriods(session.user.uid).catch(() => []),
    ]);
  } catch {
    renderError();
    return;
  }
  render(events, busy);
}

function renderError() {
  main.innerHTML = errorState({
    title: "Couldn't load your dashboard",
    message: "There was a problem reaching your events. Check your connection and try again.",
  });
  const retry = main.querySelector("[data-retry]");
  if (retry) retry.addEventListener("click", load);
}

function loadingSkeleton() {
  return `
    <div class="skeleton h-7 w-56"></div>
    <div class="mt-6 grid grid-cols-3 gap-3">
      <div class="card card-pad"><div class="skeleton h-3 w-14"></div><div class="skeleton mt-3 h-6 w-8"></div></div>
      <div class="card card-pad"><div class="skeleton h-3 w-14"></div><div class="skeleton mt-3 h-6 w-8"></div></div>
      <div class="card card-pad"><div class="skeleton h-3 w-14"></div><div class="skeleton mt-3 h-6 w-8"></div></div>
    </div>
    <div class="mt-6">${skeletonList(3)}</div>`;
}

function greetingText() {
  const hour = new Date().getHours();
  const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = (session.user.displayName || "").trim().split(/\s+/)[0];
  return firstName ? `${part}, ${escapeHtml(firstName)}` : part;
}

function statTile(label, value, iconName) {
  return `<div class="card card-pad">
    <div class="flex items-center justify-between">
      <p class="text-xs font-medium uppercase tracking-wide text-muted">${label}</p>
      <span class="text-muted">${icon(iconName, { size: 16 })}</span>
    </div>
    <p class="mt-2 text-2xl font-semibold text-ink">${value}</p>
  </div>`;
}

// Merges overlapping intervals so booked time isn't double-counted.
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

function todaysIntervals(events, busy) {
  const dayStart = startOfDay(new Date());
  const dayEnd = endOfDay(new Date());
  const clip = (s, e) => ({
    start: s < dayStart ? dayStart : s,
    end: e > dayEnd ? dayEnd : e,
  });
  const items = [];
  events
    .filter((e) => e.status !== "cancelled")
    .forEach((e) => {
      const s = toDate(e.startAt);
      const e2 = toDate(e.endAt) || s;
      if (s && e2 && e2 >= dayStart && s <= dayEnd) items.push(clip(s, e2));
    });
  busy.forEach((b) => {
    const s = toDate(b.startAt);
    const e2 = toDate(b.endAt) || s;
    if (s && e2 && e2 >= dayStart && s <= dayEnd) items.push(clip(s, e2));
  });
  return mergeIntervals(items);
}

function availabilitySummary(events, busy) {
  const merged = todaysIntervals(events, busy);
  const now = new Date();
  const bookedMinutes = merged.reduce(
    (sum, i) => sum + (i.end - i.start) / 60000,
    0
  );
  const current = merged.find((i) => i.start <= now && now < i.end);
  let status;
  if (current) {
    status = `Busy until ${formatTime(current.end)}`;
  } else {
    const next = merged.find((i) => i.start > now);
    status = next ? `Free until ${formatTime(next.start)}` : "Free for the rest of today";
  }
  return { bookedMinutes: Math.round(bookedMinutes), status };
}

function render(events, busy) {
  const active = events.filter((e) => e.status !== "cancelled");
  const now = new Date();
  const in7 = addDays(now, 7);

  const upcoming = active
    .filter((e) => {
      const end = toDate(e.endAt) || toDate(e.startAt);
      return end && end.getTime() >= now.getTime();
    })
    .sort((a, b) => (toDate(a.startAt) || 0) - (toDate(b.startAt) || 0));

  const conflictMap = findConflicts(active);
  const conflicted = active.filter(
    (e) => (conflictMap.get(e.id) || {}).state === CONFLICT.conflict
  );

  const todaysCount = active.filter((e) => isToday(e.startAt)).length;
  const next7Count = upcoming.filter((e) => {
    const s = toDate(e.startAt);
    return s && s <= in7;
  }).length;

  const featured = upcoming[0] || null;
  const moreUpcoming = upcoming.slice(1, 6);
  const availability = availabilitySummary(events, busy);

  const sections = [];

  // Greeting + quick actions row
  sections.push(`
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-ink">${greetingText()}</h1>
        <p class="mt-1 text-sm text-muted">${escapeHtml(formatRelativeDay(now))} · ${new Date().toLocaleDateString(
          undefined,
          { month: "long", day: "numeric", year: "numeric" }
        )}</p>
      </div>
      <a href="createevent.html" class="btn btn-primary hidden sm:inline-flex">${icon(
        "plus",
        { size: 16 }
      )}New event</a>
    </div>`);

  // 1. Today overview
  sections.push(`
    <section class="mt-6" aria-label="Today overview">
      <div class="grid grid-cols-3 gap-3">
        ${statTile("Today", String(todaysCount), "calendar")}
        ${statTile("Next 7 days", String(next7Count), "calendarClock")}
        ${statTile("Conflicts", String(conflicted.length), "alertTriangle")}
      </div>
    </section>`);

  // 2. Next upcoming event (featured)
  sections.push(featuredSection(featured, conflictMap));

  // 3. Upcoming events
  if (moreUpcoming.length) {
    sections.push(`
      <section class="mt-6" aria-labelledby="upcomingHeading">
        <div class="mb-3 flex items-center justify-between">
          <h2 id="upcomingHeading" class="text-base font-semibold text-ink">Upcoming</h2>
          <a href="events.html" class="text-sm font-medium text-primary hover:underline">View all</a>
        </div>
        <div class="space-y-3">
          ${moreUpcoming
            .map((e) =>
              eventCardHtml(e, {
                conflictState: (conflictMap.get(e.id) || {}).state,
              })
            )
            .join("")}
        </div>
      </section>`);
  }

  // 4. Schedule conflicts
  sections.push(conflictSection(conflicted, conflictMap, upcoming.length));

  // 5. Availability summary
  sections.push(`
    <section class="mt-6" aria-labelledby="availHeading">
      <h2 id="availHeading" class="mb-3 text-base font-semibold text-ink">Availability</h2>
      <a href="availability.html" class="card-interactive card-pad group flex items-center justify-between gap-3">
        <div>
          <p class="text-sm font-medium text-ink">${escapeHtml(availability.status)}</p>
          <p class="mt-1 text-sm text-muted">${
            availability.bookedMinutes > 0
              ? `${formatDuration(availability.bookedMinutes)} booked today`
              : "Nothing booked today"
          }</p>
        </div>
        <span class="text-slate-300 transition-colors group-hover:text-primary">${icon(
          "chevronRight"
        )}</span>
      </a>
    </section>`);

  // 6. Quick actions
  sections.push(`
    <section class="mt-6" aria-labelledby="quickHeading">
      <h2 id="quickHeading" class="mb-3 text-base font-semibold text-ink">Quick actions</h2>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        ${quickAction("createevent.html", "plus", "Add event")}
        ${quickAction("events.html", "list", "View calendar")}
        ${quickAction("availability.html", "calendarClock", "Check availability")}
        <button type="button" data-inbox class="card-interactive card-pad flex flex-col items-start gap-2 text-left">
          <span class="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent">${icon(
            "sparkles",
            { size: 18 }
          )}</span>
          <span class="flex items-center gap-1.5 text-sm font-medium text-ink">Event Inbox <span class="badge badge-planned">Soon</span></span>
        </button>
      </div>
    </section>`);

  main.innerHTML = sections.join("");
  wire();
}

function quickAction(href, iconName, label) {
  return `<a href="${href}" class="card-interactive card-pad flex flex-col items-start gap-2">
    <span class="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">${icon(
      iconName,
      { size: 18 }
    )}</span>
    <span class="text-sm font-medium text-ink">${label}</span>
  </a>`;
}

function featuredSection(event, conflictMap) {
  if (!event) {
    return `
      <section class="mt-6" aria-labelledby="nextHeading">
        <h2 id="nextHeading" class="mb-3 text-base font-semibold text-ink">Up next</h2>
        <div class="card card-pad text-center">
          <span class="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-subtle text-muted">${icon(
            "calendar",
            { size: 24 }
          )}</span>
          <h3 class="text-base font-semibold text-ink">No upcoming events</h3>
          <p class="mt-1 text-sm text-muted">You're all clear. Add your next event to get started.</p>
          <a href="createevent.html" class="btn btn-primary mt-4">${icon("plus", {
            size: 16,
          })}Add your first event</a>
        </div>
      </section>`;
  }
  const state = (conflictMap.get(event.id) || {}).state;
  const canConfirm = event.status === "planned" || event.status === "registered";
  const openLink = event.eventUrl
    ? `<a href="${escapeHtml(event.eventUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm">${icon(
        "externalLink",
        { size: 15 }
      )}Open link</a>`
    : "";
  return `
    <section class="mt-6" aria-labelledby="nextHeading">
      <h2 id="nextHeading" class="mb-3 text-base font-semibold text-ink">Up next</h2>
      <div class="card card-pad ring-1 ring-primary/10">
        <p class="text-xs font-semibold uppercase tracking-wide text-primary">${escapeHtml(
          formatRelativeDay(event.startAt)
        )}</p>
        <h3 class="mt-1 text-lg font-semibold text-ink">
          <a href="event.html?id=${encodeURIComponent(
            event.id
          )}" class="hover:underline">${escapeHtml(event.title || "Untitled event")}</a>
        </h3>
        <div class="mt-2 flex flex-wrap items-center gap-2">${statusBadge(
          event.status
        )}${conflictBadge(state)}</div>
        <div class="mt-3 space-y-1.5 text-sm text-muted">
          <p class="flex items-center gap-2">${icon("clock", {
            size: 16,
          })}<span>${escapeHtml(formatDateRange(event.startAt, event.endAt))}</span></p>
          ${
            event.location
              ? `<p class="flex items-center gap-2">${icon("mapPin", {
                  size: 16,
                })}<span>${escapeHtml(event.location)}</span></p>`
              : ""
          }
        </div>
        <div class="mt-4 flex flex-wrap gap-2">
          <a href="event.html?id=${encodeURIComponent(
            event.id
          )}" class="btn btn-primary btn-sm">View details</a>
          ${openLink}
          ${
            canConfirm
              ? `<button type="button" data-confirm-next="${encodeURIComponent(
                  event.id
                )}" class="btn btn-secondary btn-sm">${icon("check", {
                  size: 15,
                })}Mark confirmed</button>`
              : ""
          }
        </div>
      </div>
    </section>`;
}

function conflictSection(conflicted, conflictMap, upcomingCount) {
  if (!conflicted.length) {
    if (!upcomingCount) return "";
    return `
      <section class="mt-6" aria-label="Schedule conflicts">
        <div class="flex items-center gap-2 rounded-card border border-success/30 bg-success/5 px-4 py-3 text-sm text-ink">
          <span class="text-success">${icon("checkCircle", { size: 18 })}</span>
          <span>No conflicts in your upcoming schedule.</span>
        </div>
      </section>`;
  }
  return `
    <section class="mt-6" aria-labelledby="conflictHeading">
      <div class="mb-3 flex items-center gap-2">
        <span class="text-danger">${icon("alertTriangle", { size: 18 })}</span>
        <h2 id="conflictHeading" class="text-base font-semibold text-ink">
          ${conflicted.length} schedule ${pluralize(conflicted.length, "conflict")}
        </h2>
      </div>
      <div class="space-y-3">
        ${conflicted
          .map((e) =>
            eventCardHtml(e, { conflictState: (conflictMap.get(e.id) || {}).state })
          )
          .join("")}
      </div>
      <p class="mt-2 text-xs text-muted">Open a conflicting event to review the overlap or adjust its time.</p>
    </section>`;
}

function wire() {
  const confirmBtn = main.querySelector("[data-confirm-next]");
  if (confirmBtn) {
    confirmBtn.addEventListener("click", async () => {
      const id = decodeURIComponent(confirmBtn.getAttribute("data-confirm-next"));
      setBusy(confirmBtn, true, "Updating…");
      try {
        await setEventStatus(id, "confirmed");
        toast("Marked as confirmed.", "success");
        await load();
      } catch {
        setBusy(confirmBtn, false);
        toast("Couldn't update the event. Please try again.", "error");
      }
    });
  }

  const inboxBtn = main.querySelector("[data-inbox]");
  if (inboxBtn) inboxBtn.addEventListener("click", openInboxModal);
}

function openInboxModal() {
  const steps = futureFlowSteps()
    .map(
      (step, index) =>
        `<li class="flex gap-3"><span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">${
          index + 1
        }</span><span class="text-sm text-muted">${escapeHtml(step)}</span></li>`
    )
    .join("");
  const modal = openModal({
    title: "Event Inbox — coming soon",
    contentHtml: `
      <p class="text-sm leading-relaxed text-muted">Soon you'll be able to paste an event link or invitation and turn it into an event in a few taps. Extraction will run on a secure backend — your data stays private.</p>
      <ol class="mt-4 space-y-3">${steps}</ol>
      <div class="mt-5 flex justify-end">
        <button type="button" class="btn btn-primary" data-close>Got it</button>
      </div>`,
  });
  modal.body.querySelector("[data-close]").addEventListener("click", modal.close);
}
