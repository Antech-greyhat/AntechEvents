// Shared application chrome: sticky header with primary nav and account menu,
// plus a thumb-friendly mobile tab bar. Rendering only — auth is passed in.
import { icon, avatar, escapeHtml } from "./ui.js";

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: "layoutDashboard", href: "/dashboard" },
  { key: "events", label: "Events", icon: "list", href: "/events" },
  { key: "availability", label: "Availability", icon: "calendarClock", href: "/availability" },
];

function desktopLinks(active) {
  return NAV_ITEMS.map((item) => {
    const isActive = item.key === active;
    return `<a href="${item.href}" class="nav-link ${
      isActive ? "nav-link-active" : ""
    }"${isActive ? ' aria-current="page"' : ""}>${icon(item.icon, {
      size: 18,
    })}<span>${item.label}</span></a>`;
  }).join("");
}

function headerHtml(active, name, email) {
  return `
    <header class="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur">
      <div class="container-app flex h-14 items-center justify-between gap-3">
        <a href="/dashboard" class="flex items-center gap-2 text-base font-semibold text-ink">
          <span class="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">${icon(
            "calendarCheck",
            { size: 18 }
          )}</span>
          <span>AntechEvents</span>
        </a>
        <nav class="hidden items-center gap-1 md:flex" aria-label="Primary">
          ${desktopLinks(active)}
        </nav>
        <div class="flex items-center gap-2">
          <a href="/createevent" class="btn btn-primary btn-sm hidden sm:inline-flex">${icon(
            "plus",
            { size: 16 }
          )}<span>New event</span></a>
          <div class="relative" data-user-menu>
            <button type="button" data-user-toggle aria-haspopup="menu" aria-expanded="false" class="rounded-full ring-offset-2 ring-offset-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50" aria-label="Account menu">
              ${avatar(name)}
            </button>
            <div data-user-dropdown role="menu" class="absolute right-0 mt-2 hidden w-56 origin-top-right rounded-card border border-line bg-surface p-1.5 shadow-lg">
              <div class="px-3 py-2">
                <p class="truncate text-sm font-medium text-ink">${escapeHtml(name)}</p>
                <p class="truncate text-xs text-muted">${escapeHtml(email)}</p>
              </div>
              <div class="my-1 h-px bg-line"></div>
              <a href="/settings" class="nav-link" role="menuitem">${icon(
                "settings",
                { size: 18 }
              )}<span>Settings</span></a>
              <button type="button" data-signout role="menuitem" class="nav-link w-full text-left text-danger hover:bg-danger/10 hover:text-danger">${icon(
                "logOut",
                { size: 18 }
              )}<span>Sign out</span></button>
            </div>
          </div>
        </div>
      </div>
    </header>`;
}

function tab(active, key, iconName, label, href) {
  const isActive = key === active;
  return `<a href="${href}" class="tab-link ${
    isActive ? "tab-link-active" : ""
  }"${isActive ? ' aria-current="page"' : ""}>${icon(iconName, {
    size: 20,
  })}<span>${label}</span></a>`;
}

function tabsHtml(active) {
  return `
    <nav class="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="Primary">
      <div class="mx-auto flex max-w-md items-stretch">
        ${tab(active, "dashboard", "layoutDashboard", "Home", "/dashboard")}
        ${tab(active, "events", "list", "Events", "/events")}
        <a href="/createevent" class="flex flex-1 flex-col items-center justify-center py-1.5" aria-label="New event"${
          active === "create" ? ' aria-current="page"' : ""
        }>
          <span class="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white shadow-sm">${icon(
            "plus",
            { size: 20 }
          )}</span>
        </a>
        ${tab(active, "availability", "calendarClock", "Free", "/availability")}
        ${tab(active, "settings", "settings", "Settings", "/settings")}
      </div>
    </nav>`;
}

function wireUserMenu(root, onSignOut) {
  const toggle = root.querySelector("[data-user-toggle]");
  const dropdown = root.querySelector("[data-user-dropdown]");
  if (!toggle || !dropdown) return;

  const close = () => {
    dropdown.classList.add("hidden");
    toggle.setAttribute("aria-expanded", "false");
    document.removeEventListener("click", onOutside, true);
    document.removeEventListener("keydown", onKey);
  };
  const open = () => {
    dropdown.classList.remove("hidden");
    toggle.setAttribute("aria-expanded", "true");
    document.addEventListener("click", onOutside, true);
    document.addEventListener("keydown", onKey);
  };
  function onOutside(event) {
    if (!root.contains(event.target)) close();
  }
  function onKey(event) {
    if (event.key === "Escape") {
      close();
      toggle.focus();
    }
  }

  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    dropdown.classList.contains("hidden") ? open() : close();
  });
  const signout = root.querySelector("[data-signout]");
  if (signout && typeof onSignOut === "function") {
    signout.addEventListener("click", () => {
      close();
      onSignOut();
    });
  }
}

// Renders header + mobile tabs into their placeholders and wires the account menu.
export function mountChrome({ active = "dashboard", user, onSignOut } = {}) {
  const name = (user && (user.displayName || user.email)) || "Account";
  const email = (user && user.email) || "";
  const header = document.getElementById("appHeader");
  const tabs = document.getElementById("appTabs");
  if (header) {
    header.innerHTML = headerHtml(active, name, email);
    wireUserMenu(header, onSignOut);
  }
  if (tabs) {
    tabs.innerHTML = tabsHtml(active);
  }
}
