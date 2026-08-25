<h1 align="center">
  <img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f4c5.svg" alt="Calendar" width="30" height="30" />
  AntechEvents
</h1>

<p align="center"><b>Your personal event command center — capture events, keep every link handy, schedule with confidence, and catch conflicts before they bite.</b></p>

<p align="center">
  <img src="https://img.shields.io/badge/HTML5-Semantic-E34F26?style=for-the-badge&logo=html5&logoColor=white" alt="HTML5" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-v4-38BDF8?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/JavaScript-ES_Modules-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript" />
  <img src="https://img.shields.io/badge/Firebase-Auth_%2B_Firestore-FFCA28?style=for-the-badge&logo=firebase&logoColor=black" alt="Firebase" />
  <img src="https://img.shields.io/badge/Firebase_Hosting-Clean_URLs-FFA000?style=for-the-badge&logo=firebase&logoColor=white" alt="Firebase Hosting" />
</p>

AntechEvents is a fast, framework-free multi-page app for tracking the events you're
planning or attending. It's built with **semantic HTML5**, **compiled Tailwind CSS**,
**modern vanilla JavaScript (ES modules)**, **Firebase Authentication**, and **Cloud
Firestore** — no React/Vue/Angular, no bundler, no runtime CSS-in-JS. Each page is
served at a clean, extensionless URL (`/dashboard`, not `/dashboard.html`).

---

## <img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f4da.svg" alt="Books" width="20" height="20" /> Table of Contents

- [Overview](#-overview)
- [Core Features](#-core-features)
- [Project Structure](#-project-structure)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
- [Running the Project](#-running-the-project)
- [Firebase Setup](#-firebase-setup)
- [Data Model](#-data-model)
- [Conflict Detection](#-conflict-detection)
- [Deferred Integrations](#-deferred-integrations)
- [Design & Conventions](#-design--conventions)
- [Deployment](#-deployment)
- [License](#-license)

---

## <img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f9ed.svg" alt="Compass" width="20" height="20" /> Overview

The goal is a calm, focused place to manage personal events without the friction of a
full calendar suite. AntechEvents brings together:

- a dashboard that answers "what's next?" at a glance
- an agenda grouped by day, with search, status filters, and time scopes
- one create/edit form with a live conflict preview
- deterministic overlap detection so you never double-book by accident
- a free/busy availability view with manually blocked busy periods
- per-user data, private by default and enforced by Firestore security rules

Every screen handles its loading, empty, filtered-empty, validation, and error states
explicitly, and the whole UI is built mobile-first with accessibility as a baseline.

---

## <img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f680.svg" alt="Rocket" width="20" height="20" /> Core Features

### 1. Landing experience

A public landing page (`/`) introducing the product, with clear calls to action into
sign-up and log-in. Authenticated visitors are sent straight to their dashboard.

### 2. Dashboard

The central experience (`/dashboard`): a time-of-day greeting, today's counts, your
next event, upcoming events, schedule conflicts, an availability summary, and quick
actions.

### 3. Events agenda

An agenda (`/events`) grouped by day, with full-text search across title, location, and
organizer, status filters, and an upcoming / all / past time scope.

### 4. Create & edit

One form (`/createevent`, `?id=` to edit) for both creating and editing, with inline
validation, progressive disclosure for optional details, a **live conflict preview**,
and a smart default end time drawn from your preferences.

### 5. Event detail & actions

A detail view (`/event?id=…`) with every action: edit, duplicate, mark confirmed /
attended, cancel, restore, open link, copy link, and delete behind an accessible
confirmation.

### 6. Availability

A per-day free/busy view (`/availability`) with manually blocked busy periods, a month
calendar for navigation, and a weekly summary.

### 7. Settings

Account name, scheduling preferences (timezone, week start, default duration and
reminder), and notification choices (`/settings`).

### 8. Accessible by default

Semantic landmarks, keyboard-navigable menus and modals with focus trapping, visible
focus rings, `aria-live` toasts, and status communicated with icon + text — never color
alone.

---

## <img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f5c2.svg" alt="Card index dividers" width="20" height="20" /> Project Structure

Each page lives in its own folder as `index.html`, so Hosting (and the local dev
server) serves it at a clean, extensionless path. Every asset and navigation reference
is **root-absolute** (`/css`, `/js`, `/dashboard`) so links resolve identically no
matter how deep the current URL is.

```text
.
├── index.html                  # Landing page              →  /
├── login/index.html            # Auth screens              →  /login
├── register/index.html         #                           →  /register
├── dashboard/index.html        # Central product experience →  /dashboard
├── events/index.html           # Agenda list               →  /events
├── event/index.html            # Event detail              →  /event?id=…
├── createevent/index.html      # Create / edit form        →  /createevent (?id= to edit)
├── availability/index.html     # Free/busy + month calendar →  /availability
├── settings/index.html         # Account, preferences       →  /settings
├── css/
│   ├── input.css               # Tailwind entry: @theme tokens + component classes
│   └── output.css              # Compiled stylesheet (committed; regenerate on change)
├── js/
│   ├── firebase.js             # SDK init + single re-export surface
│   ├── app.js                  # Auth-guarded shell bootstrap (initShell)
│   ├── auth.js                 # Sign in / up / out, guards, redirect safety
│   ├── navigation.js           # Header + mobile tab bar + account menu
│   ├── ui.js                   # Icons, toasts, modals, badges, state placeholders
│   ├── eventcard.js            # Reusable event card
│   ├── conflicts.js            # Deterministic overlap detection
│   ├── reminders.js            # Reminder timing + inert delivery boundary
│   ├── eventinbox.js           # Prepared Event Inbox boundary (disabled)
│   ├── <page>.js               # One controller per page (dashboard.js, events.js, …)
│   ├── services/               # Firestore data access (events, users, availability)
│   └── utils/                  # dates, formatters, validation, storage
├── assets/icons/favicon.svg
├── firebase/
│   ├── firestore.rules         # Per-user ownership rules
│   └── firestore.indexes.json  # Composite indexes (events, availability)
├── firebase.json               # Hosting + Firestore config
└── package.json
```

**Layering:** pages render and wire only; all Firestore access lives in `js/services/*`;
pure logic (dates, formatting, validation, conflicts) has no Firebase or DOM dependency
and is trivially testable in isolation.

---

## <img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f9f0.svg" alt="Toolbox" width="20" height="20" /> Tech Stack

| Logo | Technology |
| :--: | --- |
| <img src="https://cdn.simpleicons.org/html5/E34F26" alt="HTML5" width="22" height="22" /> | **HTML5** — semantic markup, one folder-per-page route |
| <img src="https://cdn.simpleicons.org/tailwindcss/38BDF8" alt="Tailwind CSS" width="22" height="22" /> | **Tailwind CSS v4** — compiled to `css/output.css` (no CDN) |
| <img src="https://cdn.simpleicons.org/javascript/F7DF1E" alt="JavaScript" width="22" height="22" /> | **JavaScript** — vanilla ES modules, one entry module per page |
| <img src="https://cdn.simpleicons.org/firebase/FFCA28" alt="Firebase Auth" width="22" height="22" /> | **Firebase Authentication** — email/password + Google |
| <img src="https://cdn.simpleicons.org/firebase/FFCA28" alt="Cloud Firestore" width="22" height="22" /> | **Cloud Firestore** — per-user ownership enforced by security rules |
| <img src="https://cdn.simpleicons.org/firebase/FFA000" alt="Firebase Hosting" width="22" height="22" /> | **Firebase Hosting** — clean, extensionless URLs |

There is no build step for JavaScript — modules are served as-is and import the Firebase
SDK from Google's pinned CDN. The only compile step is Tailwind → CSS.

---

## <img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/2699.svg" alt="Gear" width="20" height="20" /> Getting Started

You'll need **Node 18+**. The repo is wired to a Firebase project called `antechevent`;
point it at your own by editing the config in [`js/firebase.js`](js/firebase.js).

### 1. Clone and enter the project

```bash
git clone <repository-url> antechevents
cd antechevents
```

### 2. Install dev dependencies

```bash
npm install
```

Dependencies are dev-only: the Tailwind CLI and a static file server. The app ships no
runtime npm dependencies.

### 3. Compile the stylesheet

```bash
npm run build:css     # compile css/input.css → css/output.css (minified)
```

---

## <img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/25b6.svg" alt="Play" width="20" height="20" /> Running the Project

```bash
npm run serve         # static server at http://localhost:5173
```

The local server resolves clean URLs the same way Hosting does — `/dashboard` serves
`dashboard/index.html` — so what you see locally matches production.

There's no JavaScript build step; modules load the Firebase SDK from Google's pinned
CDN, so the only thing that compiles is the stylesheet. While working, run the watcher
in a second terminal to rebuild CSS on save:

```bash
npm run watch:css     # or: npm run dev
```

| Script | What it does |
| --- | --- |
| `npm run build:css` | One-off Tailwind compile to `css/output.css` (minified) |
| `npm run watch:css` | Rebuild `css/output.css` on every change |
| `npm run serve` | Serve the project at `http://localhost:5173` |
| `npm run dev` | Alias for `watch:css` |

---

## <img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f510.svg" alt="Locked with key" width="20" height="20" /> Firebase Setup

The web config in [`js/firebase.js`](js/firebase.js) is committed. These values aren't
secrets — Firestore rules do the enforcing — so they're safe to ship to the browser. To
back the app with your own project:

1. **Authentication → Sign-in method** — enable Email/Password and Google.
2. **Authentication → Settings → Authorized domains** — add `localhost` and your
   Firebase Hosting domain.
3. **Firestore Database** — create one in production mode.
4. Deploy the security rules and composite indexes:

   ```bash
   firebase deploy --only firestore:rules,firestore:indexes
   ```

Rules and indexes live in [`firebase/`](firebase/). The composite indexes backing the
`ownerId` + `startAt` queries (events and availability) are declared in
[`firebase/firestore.indexes.json`](firebase/firestore.indexes.json), so they deploy
with the command above — no manual index creation in the console required.

---

## <img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f5c3.svg" alt="Card file box" width="20" height="20" /> Data Model

Three collections, each scoped to its owner by `ownerId`:

| Collection             | Contents                                              |
| ---------------------- | ----------------------------------------------------- |
| `users/{uid}`          | Profile and scheduling/notification preferences.      |
| `events/{eventId}`     | A single event and its status.                        |
| `availability/{docId}` | A manually blocked busy period.                       |

An event document holds:

```text
title, description, startAt, endAt, timezone, location, eventUrl,
registrationUrl, organizer, notes, status, reminderSettings,
ownerId, createdAt, updatedAt
```

`status` is one of `planned`, `registered`, `confirmed`, `attended`, or `cancelled`.
Dates persist as Firestore `Timestamp`s and are converted to `Date` at the service
layer — nothing above `js/services/` ever touches a `Timestamp`.

### Security rules

[`firebase/firestore.rules`](firebase/firestore.rules) locks every document to its
owner: reads and writes require `request.auth.uid == resource.data.ownerId`, and new
events must carry the caller's `ownerId` and a non-empty title. The client-side checks
are there for a clean UX; the rules are the real authorization boundary.

---

## <img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/26a0.svg" alt="Warning" width="20" height="20" /> Conflict Detection

Two active events conflict when their intervals overlap:

```text
startA < endB && endA > startB
```

Cancelled events are ignored. If two events fall on the same day but one is missing an
end time, they're reported as a *possible* conflict rather than a definite one. The
logic lives in [`js/conflicts.js`](js/conflicts.js) and has no Firebase or DOM
dependency.

---

## <img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f9e9.svg" alt="Puzzle piece" width="20" height="20" /> Deferred Integrations

Two features are scaffolded behind boundaries so they can land later without touching
the core app:

- **Event Inbox** ([`js/eventinbox.js`](js/eventinbox.js)) — paste a link, have a
  backend extract the details, review the draft, save. Nothing runs client-side yet; the
  module returns an empty draft shaped like the create form. Flip `EVENT_INBOX_ENABLED`
  once the backend exists.
- **Email reminders** ([`js/reminders.js`](js/reminders.js)) — reminder timing is
  computed on the client, but delivery is a no-op. A backend (a Cloud Function, say) will
  read due reminders and call Resend. That key stays on the backend and never reaches the
  browser.

---

## <img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f3a8.svg" alt="Palette" width="20" height="20" /> Design & Conventions

- No frameworks, no inline styles, no inline event handlers. Behavior is wired with
  `addEventListener` from ES modules.
- Filenames are lowercase with no dashes (`createevent.js`, `eventservice.js`);
  `camelCase` for values, `PascalCase` for constructors.
- User input is escaped with `escapeHtml` before it reaches the DOM.
- Design tokens live in `@theme` in `css/input.css`; components consume them through
  Tailwind utilities.
- Internal links and assets are root-absolute so pages work identically from any URL
  depth.

---

## <img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f6a2.svg" alt="Ship" width="20" height="20" /> Deployment

The app deploys to **Firebase Hosting**. [`firebase.json`](firebase.json) enables
`cleanUrls` with `trailingSlash: false`, and the folder-per-page layout means each route
resolves to its `index.html` at a canonical, extensionless URL.

```bash
npm run build:css                                    # ensure css/output.css is current
firebase deploy --only hosting                       # ship the static site
firebase deploy --only firestore:rules,firestore:indexes   # ship rules + indexes
```

`firebase deploy` with no flags does all three at once. The `README.md`, `package.json`,
`css/input.css`, and `firebase/**` paths are excluded from the Hosting upload via the
`ignore` list in [`firebase.json`](firebase.json).

---

## <img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f4c4.svg" alt="Page" width="20" height="20" /> License

**Private. All rights reserved.**
