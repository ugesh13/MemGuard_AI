// MemGuard AI front-end entry point.
import { state, setState, subscribe } from "./core/store.js";
import { api } from "./core/api.js";
import { consumeOAuthRedirect, signOut } from "./core/auth.js";
import { route, onRoute, startRouter, navigate, currentPath } from "./core/router.js";
import { $, esc, icon, toast, BRAND_MARK, applyDynamic } from "./core/dom.js";

import loginView from "./views/login.js";
import dashboardView from "./views/dashboard.js";
import bridgeView from "./views/bridge.js";
import auditView from "./views/audit.js";
import reportView from "./views/report.js";
import shieldView from "./views/shield.js";
import compareView from "./views/compare.js";
import historyView from "./views/history.js";
import methodView from "./views/method.js";
import privacyView from "./views/privacy.js";
import verifyView from "./views/verify.js";
import settingsView from "./views/settings.js";
import notFoundView from "./views/notfound.js";

const NAV = [
  { path: "/dashboard", label: "Dashboard", ic: "layers" },
  { path: "/bridge", label: "Garak Bridge", step: 1 },
  { path: "/audit", label: "Audit", step: 2 },
  { path: "/report", label: "Report", ic: "file-check" },
  { path: "/shield", label: "Shield", step: 3 },
  { path: "/compare", label: "Fix & Verify", step: 4 },
];

route("/login", loginView, { public: true, bare: true });
route("/verify", verifyView, { public: true });
route("/privacy", privacyView, { public: true });
route("/method", methodView, { public: true });
route("/dashboard", dashboardView);
route("/bridge", bridgeView);
route("/audit", auditView);
route("/report", reportView);
route("/shield", shieldView);
route("/compare", compareView);
route("/history", historyView);
route("/settings", settingsView);
route("*", notFoundView, { public: true });

function navHtml(path) {
  const s = state.session;
  const initials = s ? (s.guest ? "G" : (s.user.email || "?").slice(0, 1).toUpperCase()) : "";
  return `<header class="nav" role="banner">
    <a class="brand" href="/dashboard" data-link aria-label="MemGuard AI home">${BRAND_MARK}<span>MemGuard AI<small>after garak</small></span></a>
    <nav class="nav-links" id="nav-links" aria-label="Main">
      ${NAV.map((n) => `<a class="nav-link" href="${n.path}" data-link ${path === n.path ? 'aria-current="page"' : ""}>${n.step ? `<span class="step-no">${n.step}</span>` : icon(n.ic, "icon-sm")}<span>${esc(n.label)}</span></a>`).join("")}
    </nav>
    <div class="nav-right">
      <button class="btn btn-ghost btn-icon menu-btn" id="menu-btn" aria-expanded="false" aria-controls="nav-links" aria-label="Open menu">${icon("menu")}</button>
      ${s ? `<button class="user-chip" id="user-btn" aria-haspopup="menu" aria-expanded="false"><span class="avatar">${esc(initials)}</span><span class="who"><b>${esc(s.guest ? "Guest" : s.user.email)}</b><span>${esc(s.guest ? "demo session" : s.role)}</span></span></button>` : `<a class="btn btn-primary btn-sm" href="/login" data-link>Sign in</a>`}
    </div>
    <div class="dropdown glass glass-strong hide" id="user-menu" role="menu">
      <a role="menuitem" href="/history" data-link>${icon("history", "icon-sm")} Run history</a>
      <a role="menuitem" href="/method" data-link>${icon("target", "icon-sm")} Method &amp; limits</a>
      <a role="menuitem" href="/privacy" data-link>${icon("lock", "icon-sm")} Privacy</a>
      <a role="menuitem" href="/verify" data-link>${icon("file-check", "icon-sm")} Verify a receipt</a>
      <a role="menuitem" href="/settings" data-link>${icon("sliders", "icon-sm")} Settings</a>
      <hr />
      <button role="menuitem" type="button" id="signout-btn">${icon("logout", "icon-sm")} Sign out and clear data</button>
    </div>
  </header>`;
}

function wireNav() {
  const menuBtn = $("#menu-btn"), links = $("#nav-links"), userBtn = $("#user-btn"), menu = $("#user-menu");
  if (menuBtn) menuBtn.addEventListener("click", () => {
    const open = links.classList.toggle("open");
    menuBtn.setAttribute("aria-expanded", String(open));
  });
  if (links) links.addEventListener("click", () => links.classList.remove("open"));
  if (userBtn) {
    userBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = menu.classList.toggle("hide") === false;
      userBtn.setAttribute("aria-expanded", String(open));
      if (open) menu.querySelector("a,button").focus();
    });
    document.addEventListener("click", (e) => { if (!menu.contains(e.target)) { menu.classList.add("hide"); userBtn.setAttribute("aria-expanded", "false"); } });
    menu.addEventListener("keydown", (e) => { if (e.key === "Escape") { menu.classList.add("hide"); userBtn.focus(); } });
    menu.addEventListener("click", (e) => { if (e.target.closest("a")) menu.classList.add("hide"); });
  }
  const so = $("#signout-btn");
  if (so) so.addEventListener("click", async () => { await signOut(); toast("Signed out. Everything held in this tab was cleared.", "ok"); navigate("/login", { replace: true }); });
}

onRoute(async (path, r) => {
  const app = $("#app");
  if (path === "/") { navigate(state.session ? "/dashboard" : "/login", { replace: true }); return null; }
  if (!r.public && !state.session) { navigate("/login", { replace: true }); return null; }
  if (path === "/login" && state.session) { navigate("/dashboard", { replace: true }); return null; }

  if (r.bare) {
    app.innerHTML = `<main id="main" tabindex="-1"></main>`;
  } else {
    app.innerHTML = `${navHtml(path)}<main id="main" class="main" tabindex="-1"></main>
      <a class="privacy-badge" href="/privacy" data-link><span class="pulse"></span>Nothing is stored</a>
      <footer class="footer">MemGuard AI by Team Technova. Run garak first, then close the gaps. <a href="/method" data-link>Method &amp; limits</a> · <a href="/privacy" data-link>Privacy</a></footer>`;
    wireNav();
  }
  const main = $("#main");
  const view = await r.view(main, { path });
  applyDynamic(main);
  document.title = `${(view && view.title) || "MemGuard AI"} · MemGuard AI`;
  if (path !== "/login") main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
  return view;
});

// Offline banner
function offlineBanner() {
  let el = $("#offline");
  if (!state.online) {
    if (!el) {
      el = document.createElement("div");
      el.id = "offline";
      el.className = "offline alert alert-warn glass";
      el.setAttribute("role", "status");
      el.innerHTML = `${icon("wifi-off")}<div><b>You are offline.</b> In-browser audits keep working; sign-in, receipts and history need a connection.</div>`;
      document.body.appendChild(el);
    }
  } else if (el) el.remove();
}
window.addEventListener("online", () => { setState({ online: true }); offlineBanner(); });
window.addEventListener("offline", () => { setState({ online: false }); offlineBanner(); });

// Sign out automatically when the token expires.
setInterval(() => {
  const s = state.session;
  if (s && !s.guest && Date.now() > s.expiresAt) {
    signOut();
    toast("Your session expired. Please sign in again.", "info");
    navigate("/login", { replace: true });
  }
}, 30_000);

subscribe(() => {});

async function boot() {
  try {
    const cfg = await api.config();
    setState({ config: cfg });
  } catch {
    setState({ config: { supabaseUrl: null, supabaseAnonKey: null, oauth: {}, demoMode: true, offline: true } });
  }
  const r = await consumeOAuthRedirect();
  if (r && r.ok) history.replaceState(null, "", "/dashboard");
  if (r && r.error) setTimeout(() => toast(r.error, "error"), 300);
  offlineBanner();
  startRouter();
  void currentPath;
}

boot();
