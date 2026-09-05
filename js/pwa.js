// Service worker registration and the user-controlled update flow. Kept out of
// inline scripts so pages register the worker with a single external import. All
// capabilities are feature-detected; unsupported browsers get the normal web app.
import { icon } from "./ui.js";

let refreshing = false;

// Shows an unobtrusive bottom banner when a new worker is waiting. The update is
// applied only on click — never mid-interaction — then the page reloads once.
function showUpdateBanner(worker) {
  if (document.getElementById("pwaUpdateBanner")) return;
  const banner = document.createElement("div");
  banner.id = "pwaUpdateBanner";
  banner.setAttribute("role", "status");
  banner.setAttribute("aria-live", "polite");
  banner.className =
    "fixed inset-x-0 bottom-0 z-[80] mx-auto mb-[calc(env(safe-area-inset-bottom)+1rem)] flex w-[calc(100%-2rem)] max-w-md items-center gap-3 rounded-card border border-line bg-surface p-3 shadow-lg sm:bottom-4";
  banner.innerHTML = `
    <span class="shrink-0 text-primary">${icon("refreshCw", { size: 18 })}</span>
    <p class="min-w-0 flex-1 text-sm text-ink">A new version of AntechEvents is available.</p>
    <button type="button" data-pwa-dismiss class="btn btn-ghost btn-sm">Later</button>
    <button type="button" data-pwa-update class="btn btn-primary btn-sm">Update</button>`;
  document.body.appendChild(banner);
  banner.querySelector("[data-pwa-dismiss]").addEventListener("click", () => banner.remove());
  banner.querySelector("[data-pwa-update]").addEventListener("click", () => {
    banner.remove();
    worker.postMessage({ type: "SKIP_WAITING" });
  });
}

export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        registration.addEventListener("updatefound", () => {
          const incoming = registration.installing;
          if (!incoming) return;
          incoming.addEventListener("statechange", () => {
            // A waiting worker only means an update when one already controls the page.
            if (incoming.state === "installed" && navigator.serviceWorker.controller) {
              showUpdateBanner(incoming);
            }
          });
        });
      })
      .catch(() => {});
  });

  // The new worker took control after SKIP_WAITING — reload once to pick it up.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    location.reload();
  });
}
