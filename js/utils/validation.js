// Input validation helpers. Pure functions returning booleans or structured errors.

export function isNonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function isValidEmail(email) {
  if (typeof email !== "string") return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// Prepends https:// when a scheme is missing so bare domains are accepted.
export function normalizeUrl(url) {
  const trimmed = (url || "").trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function isValidUrl(url) {
  if (!isNonEmpty(url)) return false;
  try {
    const parsed = new URL(normalizeUrl(url));
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// Returns a list of human-readable requirements the password fails.
export function passwordIssues(password) {
  const issues = [];
  if (typeof password !== "string" || password.length < 8) {
    issues.push("at least 8 characters");
  }
  if (!/[A-Za-z]/.test(password || "")) issues.push("one letter");
  if (!/[0-9]/.test(password || "")) issues.push("one number");
  return issues;
}

// Validates the event form model. Expects startAt/endAt as Date objects or null.
export function validateEventInput(input) {
  const errors = {};
  if (!isNonEmpty(input.title)) {
    errors.title = "Give your event a title.";
  } else if (input.title.trim().length > 200) {
    errors.title = "Title must be 200 characters or fewer.";
  }
  if (!input.startAt) {
    errors.startAt = "Choose when the event starts.";
  }
  if (input.startAt && input.endAt && input.endAt <= input.startAt) {
    errors.endAt = "End time must be after the start time.";
  }
  if (input.eventMode === "online") {
    if (!isNonEmpty(input.eventUrl)) {
      errors.eventUrl = "Add the link attendees will use to join.";
    } else if (!isValidUrl(input.eventUrl)) {
      errors.eventUrl = "Enter a valid link, including http:// or https://.";
    }
  } else if (input.eventMode === "physical") {
    if (!isNonEmpty(input.location)) {
      errors.location = "Add where this event takes place.";
    }
  } else if (isNonEmpty(input.eventUrl) && !isValidUrl(input.eventUrl)) {
    errors.eventUrl = "Enter a valid link, including http:// or https://.";
  }
  if (isNonEmpty(input.registrationUrl) && !isValidUrl(input.registrationUrl)) {
    errors.registrationUrl = "Enter a valid registration link.";
  }
  return { valid: Object.keys(errors).length === 0, errors };
}
