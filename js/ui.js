// Shared, framework-free UI kit: icons, toasts, modals, confirmations, badges,
// and state placeholders. All handlers are attached with addEventListener — no
// inline event attributes anywhere in the app.
import { statusMeta, conflictMeta } from "./utils/formatters.js";
import { CONFLICT } from "./conflicts.js";

// A single-style (Lucide-like) stroke icon set. Values are inner SVG markup.
const ICONS = {
  circleDashed: '<circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/>',
  clipboardCheck:
    '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkCheck: '<path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/>',
  ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  checkCircle: '<path d="M21.801 10A10 10 0 1 1 17 3.335"/><path d="m9 11 3 3L22 4"/>',
  xCircle:
    '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  alertTriangle:
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  calendar:
    '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  calendarCheck:
    '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="m9 16 2 2 4-4"/>',
  calendarPlus:
    '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M12 14v4"/><path d="M10 16h4"/>',
  calendarClock:
    '<path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h5"/><path d="M17.5 17.5 16 16.3V14"/><circle cx="16" cy="16" r="6"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  mapPin:
    '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  externalLink:
    '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  x: '<path d="M18 6 6 18"/><path d="M6 6l12 12"/>',
  pencil:
    '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  trash:
    '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  arrowLeft: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  menu: '<path d="M4 12h16"/><path d="M4 6h16"/><path d="M4 18h16"/>',
  layoutDashboard:
    '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
  settings:
    '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  logOut:
    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  sparkles:
    '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.962 0z"/>',
  shieldCheck:
    '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  moreVertical:
    '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>',
  gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
  building:
    '<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M16 10h.01"/>',
  note: '<path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5z"/><path d="M15 3v6h6"/>',
};

export function icon(name, { size = 20, className = "" } = {}) {
  const body = ICONS[name] || ICONS.info;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${className}" aria-hidden="true" focusable="false">${body}</svg>`;
}

// Multicolor Google brand mark for the sign-in button.
export function googleMark(size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;
}

export function escapeHtml(value) {
  return String(value === null || value === undefined ? "" : value).replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char]
  );
}

function spinner(size = 16) {
  return `<svg class="animate-spin" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" opacity="0.25"/><path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`;
}

// Status and conflict badges: color plus an icon and a text label (never color alone).
export function statusBadge(status) {
  const meta = statusMeta[status] || statusMeta.planned;
  return `<span class="badge ${meta.badge}">${icon(meta.icon, {
    size: 12,
  })}${escapeHtml(meta.label)}</span>`;
}

export function conflictBadge(state) {
  const meta = conflictMeta[state];
  if (!meta || state === CONFLICT.none) return "";
  return `<span class="badge ${meta.badge}">${icon(meta.icon, {
    size: 12,
  })}${escapeHtml(meta.label)}</span>`;
}

export function avatar(nameOrEmail, size = "h-9 w-9") {
  const initials = (nameOrEmail || "?").trim().slice(0, 2).toUpperCase();
  return `<span class="inline-flex ${size} items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">${escapeHtml(
    initials
  )}</span>`;
}

// Toggles a button between its normal and loading states, preserving its markup.
export function setBusy(button, busy, busyLabel = "Working…") {
  if (!button) return;
  if (busy) {
    if (button.dataset.originalHtml === undefined) {
      button.dataset.originalHtml = button.innerHTML;
    }
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.innerHTML = `${spinner()}<span>${escapeHtml(busyLabel)}</span>`;
  } else {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    if (button.dataset.originalHtml !== undefined) {
      button.innerHTML = button.dataset.originalHtml;
      delete button.dataset.originalHtml;
    }
  }
}

let toastRegion = null;
function ensureToastRegion() {
  if (toastRegion && document.body.contains(toastRegion)) return toastRegion;
  toastRegion = document.createElement("div");
  toastRegion.className =
    "pointer-events-none fixed inset-x-0 top-3 z-[70] flex flex-col items-center gap-2 px-3 sm:items-end sm:pr-4";
  toastRegion.setAttribute("aria-live", "polite");
  toastRegion.setAttribute("aria-atomic", "false");
  document.body.appendChild(toastRegion);
  return toastRegion;
}

const TOAST_ICON = {
  success: "checkCircle",
  error: "xCircle",
  warning: "alertTriangle",
  info: "info",
};
const TOAST_ICON_COLOR = {
  success: "text-success",
  error: "text-danger",
  warning: "text-warning",
  info: "text-info",
};

export function toast(message, type = "info", { duration = 4000 } = {}) {
  const region = ensureToastRegion();
  const item = document.createElement("div");
  item.className = `toast toast-${type} w-full max-w-sm`;
  item.setAttribute("role", type === "error" ? "alert" : "status");
  item.innerHTML = `
    <span class="mt-0.5 shrink-0 ${TOAST_ICON_COLOR[type] || "text-info"}">${icon(
      TOAST_ICON[type] || "info"
    )}</span>
    <p class="flex-1 leading-snug">${escapeHtml(message)}</p>
    <button type="button" class="btn-icon -mr-1 -mt-1 p-1" aria-label="Dismiss notification">${icon(
      "x",
      { size: 16 }
    )}</button>`;
  const remove = () => {
    item.classList.add("opacity-0");
    setTimeout(() => item.remove(), 150);
  };
  item.classList.add("transition-opacity");
  item.querySelector("button").addEventListener("click", remove);
  region.appendChild(item);
  if (duration > 0) setTimeout(remove, duration);
  return remove;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

// Generic accessible modal. Returns { root, body, close }. onClose fires exactly once.
export function openModal({ title = "", contentHtml = "", onClose } = {}) {
  const previouslyFocused = document.activeElement;
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  const titleId = `modalTitle_${Math.random().toString(36).slice(2, 9)}`;
  backdrop.innerHTML = `
    <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
      <div class="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <h2 id="${titleId}" class="text-base font-semibold text-ink">${escapeHtml(
          title
        )}</h2>
        <button type="button" class="btn-icon -mr-1" data-modal-close aria-label="Close dialog">${icon(
          "x"
        )}</button>
      </div>
      <div data-modal-body class="px-5 py-4">${contentHtml}</div>
    </div>`;

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKeydown, true);
    backdrop.remove();
    if (!document.querySelector(".modal-backdrop")) {
      document.body.classList.remove("overflow-hidden");
    }
    if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
    if (typeof onClose === "function") onClose();
  };

  function onKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "Tab") {
      const items = backdrop.querySelectorAll(FOCUSABLE);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  backdrop.addEventListener("mousedown", (event) => {
    if (event.target === backdrop) close();
  });
  backdrop.querySelector("[data-modal-close]").addEventListener("click", close);
  document.addEventListener("keydown", onKeydown, true);
  document.body.classList.add("overflow-hidden");
  document.body.appendChild(backdrop);

  const body = backdrop.querySelector("[data-modal-body]");
  const firstField = body.querySelector(FOCUSABLE);
  (firstField || backdrop.querySelector("[data-modal-close]")).focus();

  return { root: backdrop, body, close };
}

// Promise-based confirmation dialog for destructive or important actions.
export function confirmDialog({
  title = "Are you sure?",
  message = "",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "primary",
} = {}) {
  return new Promise((resolve) => {
    let outcome = false;
    const modal = openModal({
      title,
      contentHtml: `
        <p class="text-sm leading-relaxed text-muted">${escapeHtml(message)}</p>
        <div class="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" class="btn btn-secondary" data-cancel>${escapeHtml(
            cancelLabel
          )}</button>
          <button type="button" class="btn ${
            tone === "danger" ? "btn-danger" : "btn-primary"
          }" data-confirm>${escapeHtml(confirmLabel)}</button>
        </div>`,
      onClose: () => resolve(outcome),
    });
    modal.body.querySelector("[data-cancel]").addEventListener("click", () => {
      outcome = false;
      modal.close();
    });
    const confirmBtn = modal.body.querySelector("[data-confirm]");
    confirmBtn.addEventListener("click", () => {
      outcome = true;
      modal.close();
    });
    confirmBtn.focus();
  });
}

export function emptyState({
  iconName = "calendar",
  title = "Nothing here yet",
  message = "",
  actionHtml = "",
} = {}) {
  return `<div class="flex flex-col items-center justify-center rounded-card border border-dashed border-line bg-surface px-6 py-12 text-center">
    <span class="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-subtle text-muted">${icon(
      iconName,
      { size: 24 }
    )}</span>
    <h3 class="text-base font-semibold text-ink">${escapeHtml(title)}</h3>
    ${message ? `<p class="mt-1 max-w-sm text-sm text-muted">${escapeHtml(message)}</p>` : ""}
    ${actionHtml ? `<div class="mt-5">${actionHtml}</div>` : ""}
  </div>`;
}

export function errorState({
  title = "Something went wrong",
  message = "We couldn't load this right now. Please try again.",
} = {}) {
  return `<div class="flex flex-col items-center justify-center rounded-card border border-dashed border-danger/40 bg-danger/5 px-6 py-12 text-center">
    <span class="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">${icon(
      "alertTriangle",
      { size: 24 }
    )}</span>
    <h3 class="text-base font-semibold text-ink">${escapeHtml(title)}</h3>
    <p class="mt-1 max-w-sm text-sm text-muted">${escapeHtml(message)}</p>
    <button type="button" class="btn btn-secondary mt-5" data-retry>${icon(
      "arrowLeft"
    )}Try again</button>
  </div>`;
}

// Wires any [data-toggle-password] button to show/hide its sibling input.
export function wirePasswordToggles(root = document) {
  root.querySelectorAll("[data-toggle-password]").forEach((button) => {
    button.addEventListener("click", () => {
      const wrapper = button.closest(".relative");
      const input = wrapper && wrapper.querySelector("input");
      if (!input) return;
      const reveal = input.type === "password";
      input.type = reveal ? "text" : "password";
      button.setAttribute("aria-pressed", String(reveal));
      button.setAttribute("aria-label", reveal ? "Hide password" : "Show password");
    });
  });
}

export function skeletonCard() {
  return `<div class="card card-pad">
    <div class="skeleton h-4 w-2/3"></div>
    <div class="skeleton mt-3 h-3 w-1/2"></div>
    <div class="skeleton mt-4 h-3 w-1/3"></div>
  </div>`;
}

export function skeletonList(count = 3) {
  return `<div class="space-y-3">${Array.from({ length: count })
    .map(() => skeletonCard())
    .join("")}</div>`;
}
