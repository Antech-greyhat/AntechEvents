// Contextual "install this app" prompt. Never nags on first visit: it only offers
// installation once the user has shown intent (real events exist) and hasn't already
// installed or dismissed it. The deferred beforeinstallprompt event is captured so we
// can trigger the native prompt from our own button. Feature-detected throughout.
import { icon } from "./ui.js";
import { getItem, setItem } from "./utils/storage.js";

const DISMISS_KEY = "installPromptDismissed";
let deferredPrompt = null;

// Chromium fires this instead of prompting; stash it to trigger later on our terms.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
  });
}

export function isInstalled() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

// Renders a dismissible install card into `container` when it makes sense to ask.
// hasValue gates on demonstrated use (e.g. the user has created events).
export function maybeShowInstallCard(container, { hasValue = false } = {}) {
  if (!container) return;
  if (isInstalled() || !deferredPrompt || !hasValue || getItem(DISMISS_KEY)) return;

  container.innerHTML = `
    <section class="mt-6" aria-label="Install AntechEvents">
      <div class="flex items-center gap-3 rounded-card border border-primary/20 bg-primary/5 p-4">
        <span class="shrink-0 text-primary">${icon("download", { size: 20 })}</span>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium text-ink">Install AntechEvents</p>
          <p class="mt-0.5 text-sm text-muted">Add it to your device for quick, full-screen access.</p>
        </div>
        <button type="button" data-install-dismiss class="btn btn-ghost btn-sm">Not now</button>
        <button type="button" data-install-accept class="btn btn-primary btn-sm">Install</button>
      </div>
    </section>`;

  const clear = () => {
    container.innerHTML = "";
  };
  container.querySelector("[data-install-dismiss]").addEventListener("click", () => {
    setItem(DISMISS_KEY, true);
    clear();
  });
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
