// Login screen controller. Rendering/wiring only — auth logic lives in auth.js.
import { isFirebaseConfigured } from "./firebase.js";
import {
  redirectIfAuthed,
  signInEmail,
  signInWithGoogle,
  resetPassword,
  mapAuthError,
  safeNextPath,
} from "./auth.js";
import { toast, setBusy, wirePasswordToggles } from "./ui.js";
import { isValidEmail, isNonEmpty } from "./utils/validation.js";

const form = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const submitBtn = document.getElementById("submitBtn");
const googleBtn = document.getElementById("googleBtn");
const formError = document.getElementById("formError");
const forgotLink = document.getElementById("forgotLink");

wirePasswordToggles();

function showError(message) {
  formError.textContent = message;
  formError.classList.add("is-visible");
}
function clearError() {
  formError.textContent = "";
  formError.classList.remove("is-visible");
}
function nextTarget() {
  return safeNextPath(new URLSearchParams(location.search).get("next"));
}

if (!isFirebaseConfigured) {
  document.querySelector("[data-config-note]").hidden = false;
  submitBtn.disabled = true;
  googleBtn.disabled = true;
} else {
  redirectIfAuthed();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!isValidEmail(email)) {
    showError("Enter a valid email address.");
    emailInput.focus();
    return;
  }
  if (!isNonEmpty(password)) {
    showError("Enter your password.");
    passwordInput.focus();
    return;
  }
  setBusy(submitBtn, true, "Logging in…");
  try {
    await signInEmail(email, password);
    location.href = nextTarget();
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
    location.href = nextTarget();
  } catch (error) {
    setBusy(googleBtn, false);
    showError(mapAuthError(error));
  }
});

forgotLink.addEventListener("click", async () => {
  clearError();
  const email = emailInput.value.trim();
  if (!isValidEmail(email)) {
    showError('Enter your email above, then tap "Forgot password?".');
    emailInput.focus();
    return;
  }
  try {
    await resetPassword(email);
    toast("Password reset email sent. Check your inbox.", "success");
  } catch (error) {
    showError(mapAuthError(error));
  }
});
