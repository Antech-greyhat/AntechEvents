// Prepared boundary for the future Event Inbox. Intended flow:
//   1) user pastes an event URL or invitation text
//   2) a secure backend extracts structured event info
//   3) user reviews the extracted draft
//   4) user confirms
//   5) the event is saved via eventservice
// No extraction runs on the client today. This returns a blank, reviewable draft
// shaped like the create form so the flow can be added later without reworking
// the core event experience.
import { emptyEvent } from "./services/eventservice.js";

export const EVENT_INBOX_ENABLED = false;

export function createDraftFromInput(rawInput = "") {
  const draft = emptyEvent();
  // A future backend will populate fields from rawInput; kept verbatim for review.
  draft.notes = rawInput ? String(rawInput).trim() : "";
  return { draft, source: "manual", extracted: false };
}

export function futureFlowSteps() {
  return [
    "Paste an event link or invitation text",
    "A secure backend extracts the details",
    "Review and adjust the draft",
    "Confirm to save it to your events",
  ];
}
