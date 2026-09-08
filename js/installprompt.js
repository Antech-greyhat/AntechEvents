// Contextual "install this app" prompt. Never nags on first visit: it only offers
// installation once the user has shown intent (real events exist) and hasn't already
// installed or dismissed it. The deferred beforeinstallprompt event is captured so we
// can trigger the native prompt from our own button. Feature-detected throughout.
// iOS has no beforeinstallprompt, so there we show the manual Add-to-Home-Screen steps.
import { icon } from "./ui.js";
import { getItem, setItem } from "./utils/storage.js";

const DISMISS_KEY = "installPromptDismissed";
let deferredPrompt = null;
let pending = null;

// Chromium fires this instead of prompting; stash it to trigger later on our terms.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    // The event often arrives after the dashboard has already rendered (common on
    // Android, where an engagement heuristic delays it). Retry any request that
    // bailed earlier only because no prompt was available yet.
    if (pending) {
      const request = pending;
      pending = null;
      maybeShowInstallCard(request.container, { hasValue: request.hasValue });
    }
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    pending = null;
  });
}

export function isInstalled() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

// iOS (including iPadOS 13+, which reports as a Mac) never fires beforeinstallprompt.
function isIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iphone|ipad|ipod/i.test(ua)) return true;
  return /macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
}

// Renders a dismissible install card into `container` when it makes sense to ask.
// hasValue gates on demonstrated use (e.g. the user has created events).
export function maybeShowInstallCard(container, { hasValue = false } = {}) {
  if (!container) return;
  if (isInstalled() || !hasValue || getItem(DISMISS_KEY)) {
    pending = null;
    return;
  }

  // No native prompt available: on iOS guide the manual flow; elsewhere remember the
  // request and let the beforeinstallprompt handler above render it when it fires.
  if (!deferredPrompt) {
    if (isIOS()) {
      pending = null;
      renderIosCard(container);
    } else {
      pending = { container, hasValue };
    }
    return;
  }

  pending = null;
  renderPromptCard(container);
}

// A dismiss button shared by both card variants.
function dismissButton() {
  return `<button type="button" data-install-dismiss class="btn btn-ghost btn-sm">Not now</button>`;
}

function wireDismiss(container) {
  const clear = () => {
    container.innerHTML = "";
  };
  container.querySelector("[data-install-dismiss]").addEventListener("click", () => {
    setItem(DISMISS_KEY, true);
    clear();
  });
  return clear;
}

// Chromium path: our own button triggers the deferred native prompt.
function renderPromptCard(container) {
  container.innerHTML = `
    <section class="mt-6" aria-label="Install AntechEvents">
      <div class="flex items-center gap-3 rounded-card border border-primary/20 bg-primary/5 p-4">
        <span class="shrink-0 text-primary">${icon("download", { size: 20 })}</span>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium text-ink">Install AntechEvents</p>
          <p class="mt-0.5 text-sm text-muted">Add it to your device for quick, full-screen access.</p>
        </div>
        ${dismissButton()}
        <button type="button" data-install-accept class="btn btn-primary btn-sm">Install</button>
      </div>
    </section>`;

  const clear = wireDismiss(container);
  container.querySelector("[data-install-accept]").addEventListener("click", async () => {
    if (!deferredPrompt) return clear();
    deferredPrompt.prompt();
    try {
      await deferredPrompt.userChoice;
    } catch {
      // Ignore: the user closing the native prompt is not an error.
    }
    deferredPrompt = null;
    clear();
  });
}

// iOS path: there is no programmatic prompt, so explain the Share -> Add to Home
// Screen steps instead of offering a button that could never work.
function renderIosCard(container) {
  container.innerHTML = `
    <section class="mt-6" aria-label="Install AntechEvents">
      <div class="rounded-card border border-primary/20 bg-primary/5 p-4">
        <div class="flex items-center gap-3">
          <span class="shrink-0 text-primary">${icon("download", { size: 20 })}</span>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-ink">Install AntechEvents</p>
            <p class="mt-0.5 text-sm text-muted">Add it to your Home Screen for quick, full-screen access.</p>
          </div>
          ${dismissButton()}
        </div>
        <ol class="mt-3 space-y-1.5 text-sm text-muted">
          <li>1. Tap the Share button in your browser's toolbar.</li>
          <li>2. Choose <span class="font-medium text-ink">Add to Home Screen</span>.</li>
          <li>3. Tap <span class="font-medium text-ink">Add</span> to finish.</li>
        </ol>
      </div>
    </section>`;

  wireDismiss(container);
}
