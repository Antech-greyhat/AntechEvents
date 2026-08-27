// Post-event attendance loop (F5). Once an event's end time has passed we ask
// the owner whether they actually made it. "Yes" lets them jot optional notes;
// "No" asks for a reason, with quick chips that adapt to whether the event was
// online or in person, plus everyday reasons that apply either way. A bare
// yes/no is always enough — the extra detail is optional — but the answer is
// recorded (attendance.reviewedAt) so the app stops asking. No backend: this is
// a modal that writes through the event service.
import { openModal, icon, escapeHtml, toast, setBusy } from "./ui.js";
import { setAttendance } from "./services/eventservice.js";
import { formatDateRange } from "./utils/formatters.js";

// Reason chips shown when the owner didn't attend. Context chips depend on the
// event mode; overall chips always apply.
const PHYSICAL_REASONS = [
  { key: "transport", label: "Transport / fare" },
  { key: "location", label: "Couldn't find the place" },
];
const ONLINE_REASONS = [
  { key: "network", label: "Network / connection" },
  { key: "link", label: "Link didn't work" },
];
const OVERALL_REASONS = [
  { key: "busy", label: "Too busy" },
  { key: "forgot", label: "Forgot" },
  { key: "asleep", label: "Was asleep" },
  { key: "other", label: "Something else" },
];

// Flat key→label lookup so other views (e.g. the event detail page) can render a
// stored reason without re-deriving the mode-specific lists.
const REASON_LABELS = [
  ...PHYSICAL_REASONS,
  ...ONLINE_REASONS,
  ...OVERALL_REASONS,
].reduce((map, r) => {
  map[r.key] = r.label;
  return map;
}, {});

export function attendanceReasonLabel(key) {
  return REASON_LABELS[key] || "";
}

const CHOICE_BASE =
  "flex items-center justify-center gap-2 rounded-btn border px-4 py-3 text-sm font-medium transition-colors";
const CHOICE_OFF = "border-line bg-surface text-ink hover:bg-subtle";
const CHOICE_ON_YES = "border-success/50 bg-success/10 text-success";
const CHOICE_ON_NO = "border-warning/50 bg-warning/10 text-warning";

const CHIP_BASE =
  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors";
const CHIP_OFF = "border-line bg-surface text-ink hover:bg-subtle";
const CHIP_ON = "border-primary bg-primary/10 text-primary";

function reasonsFor(event) {
  const context =
    event.eventMode === "online" ? ONLINE_REASONS : PHYSICAL_REASONS;
  return [...context, ...OVERALL_REASONS];
}

function chipHtml(reason) {
  return `<button type="button" aria-pressed="false" data-reason="${escapeHtml(
    reason.key
  )}" class="${CHIP_BASE} ${CHIP_OFF}">${escapeHtml(reason.label)}</button>`;
}

// Opens the "How did it go?" dialog for a past event. onSaved runs after a
// successful write so the calling view can refresh (dashboard, notification bell).
export function openAttendanceDialog(event, { onSaved } = {}) {
  if (!event || !event.id) return;
  const title = (event.title || "").trim() || "Untitled event";
  const when = formatDateRange(event.startAt, event.endAt);
  const reasons = reasonsFor(event);

  const modal = openModal({
    title: "How did it go?",
    contentHtml: `
      <div class="min-w-0">
        <p class="truncate text-sm font-medium text-ink">${escapeHtml(title)}</p>
        ${
          when
            ? `<p class="mt-0.5 flex items-center gap-1.5 text-xs text-muted">${icon(
                "clock",
                { size: 13 }
              )}<span class="truncate">${escapeHtml(when)}</span></p>`
            : ""
        }
      </div>

      <p class="mt-4 mb-2 text-sm font-medium text-ink">Did you attend?</p>
      <div class="grid grid-cols-2 gap-2" role="group" aria-label="Did you attend?">
        <button type="button" aria-pressed="false" data-choice="yes" class="${CHOICE_BASE} ${CHOICE_OFF}">${icon(
          "checkCircle",
          { size: 16 }
        )}Yes, I did</button>
        <button type="button" aria-pressed="false" data-choice="no" class="${CHOICE_BASE} ${CHOICE_OFF}">${icon(
          "xCircle",
          { size: 16 }
        )}No, I didn't</button>
      </div>

      <div data-panel="yes" class="mt-4 hidden">
        <label for="attNotes" class="label">Notes or remarks <span class="font-normal text-muted">(optional)</span></label>
        <textarea id="attNotes" data-notes rows="3" maxlength="1000" class="input" placeholder="Anything worth remembering — takeaways, follow-ups, who you met…"></textarea>
      </div>

      <div data-panel="no" class="mt-4 hidden">
        <p class="label">What got in the way? <span class="font-normal text-muted">(optional)</span></p>
        <div class="flex flex-wrap gap-2">
          ${reasons.map(chipHtml).join("")}
        </div>
        <label for="attDetail" class="label mt-3">Add a note <span class="font-normal text-muted">(optional)</span></label>
        <input id="attDetail" data-detail type="text" maxlength="200" class="input" placeholder="A quick detail, if you like" />
      </div>

      <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" class="btn btn-secondary" data-cancel>Not now</button>
        <button type="button" class="btn btn-primary" data-save disabled>Save</button>
      </div>`,
  });

  const body = modal.body;
  const yesPanel = body.querySelector('[data-panel="yes"]');
  const noPanel = body.querySelector('[data-panel="no"]');
  const choiceButtons = body.querySelectorAll("[data-choice]");
  const saveBtn = body.querySelector("[data-save]");

  let choice = null;
  let reason = null;

  choiceButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      choice = btn.getAttribute("data-choice");
      yesPanel.classList.toggle("hidden", choice !== "yes");
      noPanel.classList.toggle("hidden", choice !== "no");
      saveBtn.disabled = false;
      choiceButtons.forEach((b) => {
        const kind = b.getAttribute("data-choice");
        const active = kind === choice;
        const on = kind === "yes" ? CHOICE_ON_YES : CHOICE_ON_NO;
        b.setAttribute("aria-pressed", String(active));
        b.className = `${CHOICE_BASE} ${active ? on : CHOICE_OFF}`;
      });
      const focusTarget =
        choice === "yes"
          ? yesPanel.querySelector("[data-notes]")
          : noPanel.querySelector("[data-reason]");
      if (focusTarget) focusTarget.focus();
    });
  });

  body.querySelectorAll("[data-reason]").forEach((chip) => {
    chip.addEventListener("click", () => {
      const key = chip.getAttribute("data-reason");
      reason = reason === key ? null : key;
      body.querySelectorAll("[data-reason]").forEach((c) => {
        const active = c.getAttribute("data-reason") === reason;
        c.setAttribute("aria-pressed", String(active));
        c.className = `${CHIP_BASE} ${active ? CHIP_ON : CHIP_OFF}`;
      });
    });
  });

  body.querySelector("[data-cancel]").addEventListener("click", modal.close);

  saveBtn.addEventListener("click", async () => {
    if (!choice) return;
    const attended = choice === "yes";
    const record = attended
      ? { attended: true, notes: body.querySelector("[data-notes]").value }
      : {
          attended: false,
          reasonCategory: reason || "",
          reasonDetail: body.querySelector("[data-detail]").value,
        };
    setBusy(saveBtn, true, "Saving…");
    try {
      await setAttendance(event.id, record);
    } catch {
      setBusy(saveBtn, false);
      toast("Couldn't save your answer. Please try again.", "error");
      return;
    }
    // Close this dialog and refresh the caller first, then acknowledge — the
    // confirmation is itself a modal now, so showing it before closing would
    // stack two modals on top of each other.
    modal.close();
    if (typeof onSaved === "function") onSaved();
    toast(attended ? "Glad you made it — saved." : "Thanks — noted.", "success");
  });
}
