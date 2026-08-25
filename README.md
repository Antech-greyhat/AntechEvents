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

```
.
├── index.html                # Landing page
├── login.html  register.html # Auth screens
├── dashboard.html            # Central product experience
├── events.html  event.html   # List + detail
├── createevent.html          # Create / edit form (?id= to edit)
├── availability.html         # Free/busy, busy periods, month calendar
├── settings.html             # Account, preferences, notifications
├── css/
│   ├── input.css             # Tailwind entry: @theme tokens + component classes
│   └── output.css            # Compiled stylesheet (committed; regenerate on change)
├── js/
│   ├── firebase.js           # SDK init + single re-export surface (paste config here)
│   ├── app.js                # Auth-guarded shell bootstrap (initShell)
│   ├── auth.js               # Sign in / up / out, guards, error mapping
│   ├── navigation.js         # Header + mobile tab bar + account menu
│   ├── ui.js                 # Icons, toasts, modals, badges, state placeholders
│   ├── eventcard.js          # Reusable event card
│   ├── conflicts.js          # Deterministic overlap detection
│   ├── reminders.js          # Reminder timing + inert delivery boundary
│   ├── eventinbox.js         # Prepared Event Inbox boundary (disabled)
│   ├── <page>.js             # One controller per page (dashboard.js, events.js, …)
│   ├── services/             # Firestore data access (events, users, availability)
│   └── utils/                # dates, formatters, validation, storage
├── assets/icons/favicon.svg
├── firestore.rules           # Per-user ownership rules
├── firebase.json             # Hosting + rules config
└── package.json
```

**Layering:** pages render and wire only; all Firestore access lives in `js/services/*`;
pure logic (dates, formatting, validation, conflicts) has no Firebase or DOM
dependency and is trivially testable in isolation.

---

## Getting started

### 1. Install tooling

```bash
npm install
```

### 2. Add your Firebase config

Firebase web config values are **not secrets** — access is controlled by Firestore
security rules — but they are project-specific. In the Firebase console go to
**Project settings → Your apps → SDK setup and configuration**, then paste the
values into [`js/firebase.js`](js/firebase.js), replacing the `REPLACE_WITH_…`
placeholders:

```js
const firebaseConfig = {
  apiKey: "…",
  authDomain: "…",
  projectId: "…",
  storageBucket: "…",
  messagingSenderId: "…",
  appId: "…",
};
```

Until real values are present, the app detects the placeholders and shows a friendly
"Connect Firebase to continue" notice instead of failing with cryptic errors.

In the Firebase console also:

- **Authentication → Sign-in method:** enable **Email/Password** and **Google**.
- **Firestore Database:** create a database (production mode).

### 3. Compile the stylesheet

```bash
npm run build:css     # one-off, minified → css/output.css
npm run watch:css     # rebuild on change while developing
```

### 4. Run it locally

```bash
npm run serve         # http://localhost:5173
```

Any static file server works; the app is entirely client-side. `npm run dev` is an
alias for `watch:css` if you prefer to run the CSS watcher and a server separately.

---

## Firestore data model

Three owner-scoped collections:

- **`users/{uid}`** — profile and preferences (timezone, week start, default event
  length, default reminder, notification choices).
- **`events/{eventId}`** — `title` (required), `description`, `startAt`, `endAt`,
  `timezone`, `location`, `eventUrl`, `registrationUrl`, `organizer`, `notes`,
  `status`, `reminderSettings`, `ownerId`, `createdAt`, `updatedAt`.
  Statuses: `planned`, `registered`, `confirmed`, `attended`, `cancelled`.
- **`availability/{docId}`** — manually blocked busy periods (`title`, `startAt`,
  `endAt`, `ownerId`).

Dates are stored as Firestore `Timestamp`s. Conversion happens only at the service
boundary; the rest of the app works with plain `Date` objects.

### Security rules

[`firestore.rules`](firestore.rules) restricts every document to its authenticated
owner — reads and writes require `request.auth.uid == resource.data.ownerId`, and new
events must carry the caller's `ownerId` and a valid title. Client-side checks are
for UX only; **the rules are the actual authorization boundary.** Deploy them with:

```bash
firebase deploy --only firestore:rules
```

---

## Conflict detection

Two active events conflict when their intervals overlap — `startA < endB && endA > startB`.
Cancelled events never participate. When two events fall on the same day but at least
one is missing an end time, the result is a **possible conflict** rather than a false
certainty. See [`js/conflicts.js`](js/conflicts.js).

---

## Future-ready boundaries

Two integrations are intentionally scaffolded but **not** implemented, so they can be
added later without reworking the core experience:

- **Event Inbox** ([`js/eventinbox.js`](js/eventinbox.js)) — the planned flow is
  paste a link → a secure backend extracts details → review the draft → confirm →
  save. No extraction runs on the client today; the module returns a blank,
  reviewable draft shaped like the create form. Toggle `EVENT_INBOX_ENABLED` when the
  backend exists.
- **Email via Resend** ([`js/reminders.js`](js/reminders.js)) — reminder *timing* is
  computed on the client, but delivery is a no-op boundary. A secure backend (e.g. a
  Cloud Function) will read due reminders and call Resend. **The Resend API key must
  live only on that backend and never ship to the browser.**

---

## Conventions

- **No frameworks**, no inline CSS/`<style>`, no inline JS/`onclick`/`<script>` app
  logic. All behavior is attached with `addEventListener` from external ES modules.
- Filenames are lowercase with no dashes (`createevent.js`, `eventservice.js`).
- `camelCase` for identifiers, `PascalCase` for constructors.
- All user-supplied strings are escaped before insertion into HTML (`escapeHtml`).
- Design tokens live in one place (`@theme` in `css/input.css`); components consume
  them through Tailwind utilities and the shared component classes.

---

## License

Private project — all rights reserved.
