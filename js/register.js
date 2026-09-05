// Register screen controller. Rendering/wiring only — auth logic lives in auth.js.
import { isFirebaseConfigured } from "./firebase.js";
import {
  redirectIfAuthed,
  signUpEmail,
  signInWithGoogle,
  mapAuthError,
} from "./auth.js";
import { setBusy, wirePasswordToggles, showPageLoader } from "./ui.js";
import { isValidEmail, isNonEmpty, passwordIssues } from "./utils/validation.js";
import { registerServiceWorker } from "./pwa.js";

registerServiceWorker();

const form = document.getElementById("registerForm");
const nameInput = document.getElementById("name");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const submitBtn = document.getElementById("submitBtn");
const googleBtn = document.getElementById("googleBtn");
const formError = document.getElementById("formError");

wirePasswordToggles();

function showError(message) {
  formError.textContent = message;
  formError.classList.add("is-visible");
}
function clearError() {
  formError.textContent = "";
  formError.classList.remove("is-visible");
}

if (!isFirebaseConfigured) {
  document.querySelector("[data-config-note]").hidden = false;
  submitBtn.disabled = true;
  googleBtn.disabled = true;
} else {
  redirectIfAuthed("/dashboard");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();
  const name = nameInput.value.trim();
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!isNonEmpty(name)) {
    showError("Enter your name.");
    nameInput.focus();
    return;
  }
  if (!isValidEmail(email)) {
    showError("Enter a valid email address.");
    emailInput.focus();
    return;
  }
  const issues = passwordIssues(password);
  if (issues.length) {
    showError(`Your password needs ${issues.join(", ")}.`);
    passwordInput.focus();
    return;
  }
  setBusy(submitBtn, true, "Creating account…");
  try {
    await signUpEmail(name, email, password);
    showPageLoader("Setting up your account…");
    location.href = "/dashboard";
  } catch (error) {
    setBusy(submitBtn, false);
    showError(mapAuthError(error));
  }
});

googleBtn.addEventListener("click", async () => {
  clearError();
  setBusy(googleBtn, true, "Connecting…");
  try {
    await signInWithGoogle();
    showPageLoader("Preparing your dashboard…");
    location.href = "/dashboard";
  } catch (error) {
    setBusy(googleBtn, false);
    showError(mapAuthError(error));
  }
});
