// Login screen: two-step glass sign-in adapted from the supplied component,
// restyled to the MemGuard design system. Real Supabase auth, no fake timers, no confetti.
import { state } from "../core/store.js";
import { esc, icon, $, GOOGLE_LOGO, GITHUB_LOGO, BRAND_MARK } from "../core/dom.js";
import { signInWithPassword, signUp, oauthUrl, startGuest, authAvailable } from "../core/auth.js";
import { navigate } from "../core/router.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function loginView(main) {
  let mode = "signin";      // signin | signup
  let step = "email";       // email | password | confirm
  let email = "";
  let busy = false;
  let countdown = null;
  const accounts = authAvailable();
  const oauth = (state.config && state.config.oauth) || {};

  main.innerHTML = `<div class="auth">
    <div class="auth-brand">${BRAND_MARK}<span>MemGuard AI</span></div>
    <div>
      <section class="auth-card" aria-labelledby="auth-title">
        <div class="stack-sm">
          <h1 class="auth-title" id="auth-title"></h1>
          <p class="auth-sub" id="auth-sub"></p>
        </div>
        <div class="oauth-row" id="oauth-row">
          <button type="button" class="gbtn" id="google-btn" aria-label="Continue with Google">${GOOGLE_LOGO}<span>Google</span></button>
          <button type="button" class="gbtn" id="github-btn" aria-label="Continue with GitHub">${GITHUB_LOGO}<span>GitHub</span></button>
        </div>
        <div class="or" id="or">OR</div>
        <form id="auth-form" novalidate></form>
        <div id="auth-status" class="w-full" aria-live="polite"></div>
        <div class="auth-foot">
          <div id="switch-mode"></div>
        </div>
        <div class="w-full stack-sm ${state.config && state.config.demoMode === false ? "hide" : ""}">
          <button type="button" class="gbtn dark w-full" id="guest-btn">${icon("flask", "icon-sm")}<span>Explore the live demo without an account</span></button>
          <p class="small faint">The demo runs entirely in your browser on synthetic data. Nothing is saved.</p>
        </div>
      </section>
      <div class="auth-points">
        <span>${icon("cpu", "icon-sm")} Audit maths runs in your browser</span>
        <span>${icon("lock", "icon-sm")} Records are never uploaded</span>
        <span>${icon("layers", "icon-sm")} Built to run after garak</span>
      </div>
      <p class="small faint center mt-3"><a href="/privacy" data-link>What do we store?</a> · <a href="/method" data-link>How it works</a></p>
    </div>
  </div>`;

  const form = $("#auth-form", main);
  const statusEl = $("#auth-status", main);

  function setStatus(kind, text) {
    if (!text) { statusEl.innerHTML = ""; return; }
    const cls = kind === "error" ? "alert-error" : kind === "ok" ? "alert-ok" : "alert-info";
    statusEl.innerHTML = `<div class="alert ${cls}" role="${kind === "error" ? "alert" : "status"}">${icon(kind === "error" ? "alert-circle" : kind === "ok" ? "check" : "info")}<div class="small">${esc(text)}</div></div>`;
  }

  function header() {
    $("#auth-title", main).textContent = mode === "signin"
      ? (step === "email" ? "Sign in to MemGuard AI" : "Enter your password")
      : (step === "email" ? "Create your account" : step === "password" ? "Choose a password" : "One last step");
    $("#auth-sub", main).textContent = mode === "signin"
      ? (step === "email" ? "Run garak first. Then close the gaps." : "Signing in as " + email)
      : (step === "email" ? "Save audit history and signed receipts." : step === "password" ? "Use at least 8 characters." : "Confirm your password to continue.");
    $("#switch-mode", main).innerHTML = mode === "signin"
      ? `New to MemGuard? <button type="button" class="link-btn" id="to-signup">Create an account</button>`
      : `Already have an account? <button type="button" class="link-btn" id="to-signin">Sign in</button>`;
    const s = $("#to-signup", main), i = $("#to-signin", main);
    if (s) s.addEventListener("click", () => { mode = "signup"; step = "email"; setStatus(); draw(); });
    if (i) i.addEventListener("click", () => { mode = "signin"; step = "email"; setStatus(); draw(); });
    const showOauth = step === "email";
    $("#oauth-row", main).classList.toggle("hide", !showOauth);
    $("#or", main).classList.toggle("hide", !showOauth);
  }

  function emailField(readonly) {
    return `<label class="ginput-label" for="email">Email</label>
      <div class="ginput ${readonly ? "readonly" : ""}">
        <span class="lead-ic">${icon("mail")}</span>
        <input id="email" name="email" type="email" inputmode="email" autocomplete="username" autocapitalize="none" spellcheck="false"
          placeholder="you@company.com" value="${esc(email)}" ${readonly ? "readonly" : "required"} aria-describedby="email-err" />
        ${readonly ? "" : `<button type="submit" class="gbtn round dark" id="email-next" aria-label="Continue with email">${icon("arrow-right", "icon-sm")}</button>`}
      </div>
      <div id="email-err" class="field-error hide"></div>`;
  }

  function pwField(id, label, autocomplete) {
    return `<label class="ginput-label" for="${id}">${esc(label)}</label>
      <div class="ginput">
        <span class="lead-ic">${icon("lock")}</span>
        <input id="${id}" name="${id}" type="password" autocomplete="${autocomplete}" required aria-describedby="${id}-err" />
        <button type="button" class="toggle" data-toggle="${id}" aria-label="Show password" aria-pressed="false">${icon("eye", "icon-sm")}</button>
        <button type="submit" class="gbtn round dark" aria-label="${step === "confirm" || mode === "signin" ? (mode === "signin" ? "Sign in" : "Create account") : "Continue"}">${icon("arrow-right", "icon-sm")}</button>
      </div>
      <div id="${id}-err" class="field-error hide"></div>`;
  }

  function draw() {
    header();
    let inner = "";
    if (step === "email") inner = emailField(false);
    else if (step === "password") inner = emailField(true) + pwField("password", "Password", mode === "signin" ? "current-password" : "new-password");
    else inner = emailField(true) + `<input type="hidden" id="password-keep" />` + pwField("confirm", "Confirm password", "new-password");
    form.innerHTML = `<div class="auth-step">${inner}${step !== "email" ? `<button type="button" class="back-btn" id="back-btn">${icon("arrow-left", "icon-sm")} Go back</button>` : ""}</div>`;
    for (const t of form.querySelectorAll("[data-toggle]")) {
      t.addEventListener("click", () => {
        const inp = $("#" + t.dataset.toggle, form);
        const show = inp.type === "password";
        inp.type = show ? "text" : "password";
        t.setAttribute("aria-pressed", String(show));
        t.setAttribute("aria-label", show ? "Hide password" : "Show password");
        t.innerHTML = icon(show ? "eye-off" : "eye", "icon-sm");
      });
    }
    const back = $("#back-btn", form);
    if (back) back.addEventListener("click", () => { step = step === "confirm" ? "password" : "email"; pendingPassword = step === "email" ? "" : pendingPassword; setStatus(); draw(); });
    const focusId = step === "email" ? "email" : step === "password" ? "password" : "confirm";
    setTimeout(() => { const el = $("#" + focusId, form); if (el) el.focus(); }, 30);
  }

  let pendingPassword = "";

  function fieldError(id, msg) {
    const el = $(`#${id}-err`, form);
    const inp = $("#" + id, form);
    if (!el) return;
    el.classList.toggle("hide", !msg);
    el.innerHTML = msg ? `${icon("alert-circle", "icon-sm")}${esc(msg)}` : "";
    if (inp) inp.setAttribute("aria-invalid", msg ? "true" : "false");
  }

  function lock(on) {
    busy = on;
    for (const b of main.querySelectorAll("button")) b.disabled = on || (countdown !== null && b.type === "submit");
    form.setAttribute("aria-busy", String(on));
  }

  function startCountdown(seconds) {
    let left = seconds;
    countdown = setInterval(() => {
      left--;
      if (left <= 0) { clearInterval(countdown); countdown = null; setStatus(); lock(false); return; }
      setStatus("error", `Too many attempts. Try again in ${left} seconds.`);
    }, 1000);
    setStatus("error", `Too many attempts. Try again in ${left} seconds.`);
    lock(false);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy || countdown) return; // one request at a time
    setStatus();
    if (step === "email") {
      const v = $("#email", form).value.trim();
      if (!EMAIL_RE.test(v)) { fieldError("email", "Enter a valid email address."); return; }
      if (!accounts) { setStatus("info", "Accounts are not connected in this deployment yet. Use the live demo below."); return; }
      email = v; step = "password"; draw(); return;
    }
    if (step === "password") {
      const inp = $("#password", form);
      const pw = inp.value;
      if (!pw) { fieldError("password", "Enter your password."); return; }
      if (mode === "signup") {
        if (pw.length < 8) { fieldError("password", "Use at least 8 characters."); return; }
        pendingPassword = pw; inp.value = ""; step = "confirm"; draw(); return;
      }
      lock(true);
      setStatus("info", "Signing in...");
      try {
        await signInWithPassword(email, pw);
        inp.value = "";
        setStatus("ok", "Signed in.");
        navigate("/dashboard", { replace: true });
      } catch (err) {
        inp.value = "";
        if (err.status === 429) return startCountdown(err.retryAfter || 30);
        setStatus("error", err.message);
        lock(false);
        inp.focus();
      }
      return;
    }
    // confirm (sign-up)
    const c = $("#confirm", form);
    if (c.value !== pendingPassword) { fieldError("confirm", "Passwords do not match."); c.value = ""; return; }
    lock(true);
    setStatus("info", "Creating your account...");
    try {
      const r = await signUp(email, pendingPassword);
      pendingPassword = ""; c.value = "";
      if (r.signedIn) { navigate("/dashboard", { replace: true }); return; }
      mode = "signin"; step = "email"; draw();
      setStatus("ok", "Check your inbox to confirm your email, then sign in.");
      lock(false);
    } catch (err) {
      pendingPassword = ""; c.value = "";
      if (err.status === 429) return startCountdown(err.retryAfter || 60);
      setStatus("error", err.message);
      lock(false);
    }
  });

  $("#google-btn", main).addEventListener("click", () => {
    if (busy) return;
    if (!accounts || !oauth.google) { setStatus("info", "Google sign-in is not switched on for this deployment yet. Use the live demo, or email once accounts are connected."); return; }
    lock(true);
    setStatus("info", "Opening Google...");
    location.assign(oauthUrl("google"));
  });
  $("#github-btn", main).addEventListener("click", () => {
    if (busy) return;
    if (!accounts || !oauth.github) { setStatus("info", "GitHub sign-in is not available in this version. Use Google, email, or the live demo."); return; }
    lock(true);
    location.assign(oauthUrl("github"));
  });
  $("#guest-btn", main).addEventListener("click", () => {
    if (busy) return;
    startGuest();
    navigate("/dashboard", { replace: true });
  });

  if (!accounts) setStatus("info", "Accounts are not connected in this deployment yet. The live demo has every feature.");
  draw();
  return { title: "Sign in", unmount() { if (countdown) clearInterval(countdown); } };
}
