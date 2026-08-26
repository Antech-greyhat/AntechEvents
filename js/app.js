// App shell bootstrap for authenticated pages: guards auth, ensures the user
// profile exists, and mounts shared navigation. Returns { user, profile } or null.
import { isFirebaseConfigured } from "./firebase.js";
import { requireAuth, signOutUser } from "./auth.js";
import { ensureUserProfile } from "./services/userservice.js";
import { mountChrome } from "./navigation.js";
import { icon, messageDialog, showPageLoader } from "./ui.js";

function mountBrandHeader() {
  const header = document.getElementById("appHeader");
  if (!header) return;
  header.innerHTML = `
    <header class="sticky top-0 z-40 border-b border-line bg-surface">
      <div class="container-app flex h-14 items-center">
        <a href="/" class="flex items-center gap-2 text-base font-semibold text-ink">
          <span class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">${icon(
            "calendarCheck",
            { size: 18 }
          )}</span>
          <span>AntechEvents</span>
        </a>
      </div>
    </header>`;
}

// Shown when Firebase config is still the placeholder — avoids cryptic errors.
function renderConfigNotice() {
  mountBrandHeader();
  const main = document.getElementById("pageMain");
  if (!main) return;
  main.innerHTML = `
    <div class="mx-auto max-w-lg py-10">
      <div class="card card-pad text-center">
        <span class="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-warning/10 text-warning">${icon(
          "shieldCheck",
          { size: 24 }
        )}</span>
        <h1 class="text-lg font-semibold text-ink">Connect Firebase to continue</h1>
        <p class="mt-2 text-sm leading-relaxed text-muted">AntechEvents needs your Firebase web config. Open
          <code class="rounded bg-subtle px-1.5 py-0.5 text-xs">js/firebase.js</code>, replace the placeholder
          values with your project's configuration, then reload this page.</p>
        <a href="/" class="btn btn-secondary mt-5">${icon("arrowLeft")}Back to home</a>
      </div>
    </div>`;
}

export async function initShell({ active = "dashboard" } = {}) {
  if (!isFirebaseConfigured) {
    renderConfigNotice();
    return null;
  }
  const user = await requireAuth();
  if (!user) return null;

  let profile = null;
  try {
    profile = await ensureUserProfile(user);
  } catch {
    // Profile creation is best-effort; the page still works without it.
  }

  mountChrome({
    active,
    user,
    onSignOut: async () => {
      const confirmed = await messageDialog({
        iconName: "logOut",
        tone: "primary",
        title: "Sign out",
        message:
          "You'll be signed out of AntechEvents and returned to the home page.",
        confirmLabel: "Sign out",
        cancelLabel: "Stay signed in",
      });
      if (!confirmed) return;
      showPageLoader("Signing you out…");
      try {
        await signOutUser();
      } finally {
        location.href = "/";
      }
    },
  });

  return { user, profile };
}
