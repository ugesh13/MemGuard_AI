import { state, clearSessionData } from "../core/store.js";
import { esc, icon, $, toast } from "../core/dom.js";
import { api } from "../core/api.js";
import { signOut } from "../core/auth.js";
import { navigate } from "../core/router.js";
import { pageHead } from "../ui/components.js";

export default function settingsView(main) {
  const s = state.session;
  const c = state.config || {};
  main.innerHTML = `
    ${pageHead("Settings", "Your account and the status of this deployment.")}
    <div class="grid g-12">
      <section class="card span-6" aria-labelledby="s1">
        <h2 id="s1">Account</h2>
        <dl class="stack mt-3">
          <div class="row between"><dt class="muted small">Signed in as</dt><dd class="m0">${esc(s.guest ? "Guest (demo session)" : s.user.email)}</dd></div>
          <div class="row between"><dt class="muted small">Role</dt><dd class="m0"><span class="chip">${esc(s.role)}</span></dd></div>
          <div class="row between"><dt class="muted small">Sign-in method</dt><dd class="m0">${esc(s.provider)}</dd></div>
          <div class="row between"><dt class="muted small">Session token</dt><dd class="m0 small">Kept in memory only; ends on refresh</dd></div>
        </dl>
        <div class="card-foot"><button class="btn btn-danger btn-sm" id="clear" type="button">${icon("trash", "icon-sm")} Clear session data</button><button class="btn btn-secondary btn-sm" id="out" type="button">${icon("logout", "icon-sm")} Sign out</button></div>
      </section>
      <section class="card span-6" aria-labelledby="s2">
        <h2 id="s2">Deployment status</h2>
        <ul class="checklist mt-3" id="status">
          <li><span class="status-dot" id="d-api"></span><span class="small" id="t-api">Checking API...</span></li>
          <li><span class="status-dot ${c.supabaseUrl ? "ok" : "warn"}"></span><span class="small">Accounts and history: ${c.supabaseUrl ? "connected (Supabase)" : "not connected"}</span></li>
          <li><span class="status-dot ${c.oauth && c.oauth.google ? "ok" : "warn"}"></span><span class="small">Google sign-in: ${c.oauth && c.oauth.google ? "on" : "off"}</span></li>
          <li><span class="status-dot" id="d-sign"></span><span class="small" id="t-sign">Receipt signing: checking...</span></li>
          <li><span class="status-dot ok"></span><span class="small">Audit engine: in-browser, works offline</span></li>
        </ul>
        <p class="small faint mt-3">Limits: 5 MB garak reports, 25 MB engine files, Shield expires after 1 hour.</p>
      </section>
    </div>`;
  $("#clear", main).addEventListener("click", () => { const n = clearSessionData(); toast(`Cleared ${n.runs} result(s) from memory.`, "ok"); });
  $("#out", main).addEventListener("click", async () => { await signOut(); navigate("/login", { replace: true }); });
  api.health().then((h) => {
    $("#d-api", main).className = "status-dot ok"; $("#t-api", main).textContent = `API healthy (version ${h.version})`;
    $("#d-sign", main).className = `status-dot ${h.components.receipt_signing ? "ok" : "warn"}`;
    $("#t-sign", main).textContent = `Receipt signing: ${h.components.receipt_signing ? "on" : "off"}`;
  }).catch(() => {
    const d = $("#d-api", main); if (!d) return;
    d.className = "status-dot bad"; $("#t-api", main).textContent = "API not reachable";
    $("#d-sign", main).className = "status-dot bad"; $("#t-sign", main).textContent = "Receipt signing: unknown";
  });
  return { title: "Settings" };
}
