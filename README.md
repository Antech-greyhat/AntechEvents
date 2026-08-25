# AntechEvents

A mobile-first **personal event command center**. Track the events you're planning
or attending, see what's next, catch scheduling conflicts before they bite, and
review your availability at a glance.

Built as a fast, framework-free multi-page app: **semantic HTML5**, **compiled
Tailwind CSS**, **modern vanilla JavaScript (ES modules)**, **Firebase
Authentication**, and **Cloud Firestore**. No React/Vue/Angular, no bundler, no
runtime CSS-in-JS.

---

## Features

- **Dashboard** — a time-of-day greeting, today's counts, your next event, upcoming
  events, schedule conflicts, an availability summary, and quick actions.
- **Events** — an agenda grouped by day with search, status filters, and an
  upcoming / all / past time scope.
- **Create & edit** — one form for both, with inline validation, progressive
  disclosure for optional details, a **live conflict preview**, and a smart default
  end time.
- **Event detail** — full details plus every action: edit, duplicate, mark
  confirmed / attended, cancel, restore, open link, copy link, and delete (with an
  accessible confirmation).
- **Availability** — a per-day free/busy view, manually blocked busy periods, a
  month calendar for navigation, and a weekly summary.
- **Settings** — account name, scheduling preferences, and notification choices.
- **Every state handled** — loading skeletons, empty states, filtered-empty states,
  validation errors, and error-with-retry throughout.
- **Accessible by default** — semantic landmarks, keyboard-navigable menus and
  modals with focus trapping, visible focus rings, `aria-live` toasts, and status
  communicated with icon + text (never color alone).

---

## Tech stack

| Concern        | Choice                                                        |
| -------------- | ------------------------------------------------------------- |
| Markup         | Semantic HTML5, one page per route                            |
| Styling        | Tailwind CSS v4, compiled to `css/output.css` (no CDN)        |
| Behavior       | Vanilla ES modules, one entry module per page                 |
| Auth           | Firebase Authentication (email/password + Google)             |
| Data           | Cloud Firestore, per-user ownership enforced by security rules|
| Email (future) | Resend, via a secure backend — **never** called from the client |

There is no build step for JavaScript — modules are served as-is and import the
Firebase SDK from Google's pinned CDN. The only compile step is Tailwind → CSS.

---

## Project structure

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

Each page lives in its own folder as `index.html`, so Hosting (and the local dev
server) serves it at a clean, extensionless path — `/dashboard`, not `/dashboard.html`.
Every asset and navigation reference is **root-absolute** (`/css`, `/js`, `/dashboard`)
so links resolve identically regardless of the current URL's depth.

**Layering:** pages render and wire only; all Firestore access lives in `js/services/*`;
pure logic (dates, formatting, validation, conflicts) has no Firebase or DOM
dependency and is trivially testable in isolation.

---

## Firebase setup

The web config in `js/firebase.js` is committed. These values aren't secrets —
Firestore rules do the enforcing — so they're safe to ship to the browser. To back
the app with your own project:

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

## Data model

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

[`firebase/firestore.rules`](firebase/firestore.rules) locks every document to its owner: reads and
writes require `request.auth.uid == resource.data.ownerId`, and new events must carry
the caller's `ownerId` and a non-empty title. The client-side checks are there for a
clean UX; the rules are the real authorization boundary.

## Conflict detection

Two active events conflict when their intervals overlap:

```text
startA < endB && endA > startB
```

Cancelled events are ignored. If two events fall on the same day but one is missing an
end time, they're reported as a *possible* conflict rather than a definite one. The
logic lives in [`js/conflicts.js`](js/conflicts.js) and has no Firebase or DOM
dependency.

## Deferred integrations

Two features are scaffolded behind boundaries so they can land later without touching
the core app:

- **Event Inbox** ([`js/eventinbox.js`](js/eventinbox.js)) — paste a link, have a
  backend extract the details, review the draft, save. Nothing runs client-side yet;
  the module returns an empty draft shaped like the create form. Flip
  `EVENT_INBOX_ENABLED` once the backend exists.
- **Email reminders** ([`js/reminders.js`](js/reminders.js)) — reminder timing is
  computed on the client, but delivery is a no-op. A backend (a Cloud Function, say)
  will read due reminders and call Resend. That key stays on the backend and never
  reaches the browser.

## Conventions

- No frameworks, no inline styles, no inline event handlers. Behavior is wired with
  `addEventListener` from ES modules.
- Filenames are lowercase with no dashes (`createevent.js`, `eventservice.js`);
  `camelCase` for values, `PascalCase` for constructors.
- User input is escaped with `escapeHtml` before it reaches the DOM.
- Design tokens live in `@theme` in `css/input.css`; components consume them through
  Tailwind utilities.

## License

Private. All rights reserved.
