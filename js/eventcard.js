// Reusable event card used on the dashboard, events list, and availability views
// so an event always looks and behaves the same. The whole card is one tap target.
import { icon, escapeHtml, statusBadge, conflictBadge } from "./ui.js";
import { formatDateRange } from "./utils/formatters.js";

export function eventCardHtml(event, { conflictState = "noConflict" } = {}) {
  const cancelled = event.status === "cancelled";
  const location = event.location
    ? `<p class="flex items-center gap-1.5">${icon("mapPin", {
        size: 15,
        className: "shrink-0",
      })}<span class="truncate">${escapeHtml(event.location)}</span></p>`
    : "";
  return `<a href="/event?id=${encodeURIComponent(
    event.id
  )}" class="card-interactive card-pad group block ${
    cancelled ? "opacity-70" : ""
  }">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">${statusBadge(
          event.status
        )}${conflictBadge(conflictState)}</div>
        <h3 class="mt-2 truncate text-base font-semibold text-ink ${
          cancelled ? "line-through decoration-1" : ""
        }">${escapeHtml(event.title || "Untitled event")}</h3>
        <div class="mt-1.5 space-y-1 text-sm text-muted">
          <p class="flex items-center gap-1.5">${icon("clock", {
            size: 15,
            className: "shrink-0",
          })}<span>${escapeHtml(
    formatDateRange(event.startAt, event.endAt)
  )}</span></p>
          ${location}
        </div>
      </div>
      <span class="mt-0.5 shrink-0 text-slate-300 transition-colors group-hover:text-primary">${icon(
        "chevronRight"
      )}</span>
    </div>
  </a>`;
}
