import { state, activeRun, clearSessionData } from "../core/store.js";
import { esc, icon, fmtDate, fmtMs, toast, openModal, $ } from "../core/dom.js";
import { GAP_MAP } from "../engine/garak.js";
import { gauge, statusChip } from "../ui/components.js";
import { dbAvailable, db } from "../core/api.js";

export default async function dashboardView(main) {
  const s = state.session;
  const run = activeRun();
  const name = s.guest ? "there" : (s.user.email || "").split("@")[0];
  const counts = { COVERED: 0, PARTIAL: 0, OUT_OF_SCOPE: 0 };
  for (const g of GAP_MAP) counts[g.status]++;
  const done = {
    bridge: Boolean(state.garak),
    audit: state.runOrder.length > 0,
    shield: Boolean(state.shield),
    compare: Object.values(state.runs).some((r) => r.model && r.model.key === "B") && Object.values(state.runs).some((r) => r.model && r.model.key === "A"),
  };
  const step = (n, path, title, text, ic, isDone, cta) => `
    <a class="glass flow-card" href="${path}" data-link>
      <div class="row between"><span class="icon-tile">${icon(ic)}</span>${isDone ? `<span class="chip chip-ok">${icon("check")}Done this session</span>` : `<span class="n">STEP ${n}</span>`}</div>
      <h3>${esc(title)}</h3><p class="muted">${esc(text)}</p>
      <div class="go"><span class="small"><b>${esc(cta)}</b></span>${icon("arrow-right", "icon-sm")}</div>
    </a>`;

  main.innerHTML = `
    ${s.guest ? `<div class="alert alert-info mb-4" role="status">${icon("flask")}<div class="small"><b>Demo session.</b> Everything runs in this browser tab on synthetic data. Sign in to keep run history and signed receipts.</div></div>` : ""}
    <section class="glass hero-card">
      <div class="stack">
        <span class="eyebrow">Hello ${esc(name)}</span>
        <h1>Prove what your fine-tuned model remembers.</h1>
        <p class="lead">garak tells you a model failed some known probes. MemGuard tells you <b>which of your own records</b> it memorized, blocks those leaks at runtime, and shows whether your fix worked.</p>
        <div class="pipeline" aria-label="Workflow">
          <div class="node"><b>garak</b><span>known weaknesses</span></div><span class="arrow">${icon("arrow-right", "icon-sm")}</span>
          <div class="node ours"><b>Evidence audit</b><span>your records</span></div><span class="arrow">${icon("arrow-right", "icon-sm")}</span>
          <div class="node ours"><b>Shield</b><span>block at runtime</span></div><span class="arrow">${icon("arrow-right", "icon-sm")}</span>
          <div class="node ours"><b>Fix &amp; verify</b><span>prove it</span></div>
        </div>
        <div class="row mt-2">
          <a class="btn btn-primary" href="/audit" data-link>${icon("play", "icon-sm")} Run an audit</a>
          <a class="btn btn-secondary" href="/bridge" data-link>Start from a garak report</a>
        </div>
      </div>
      <div class="card glass-strong">
        ${run ? `<div class="stack-sm center"><span class="small muted">Latest audit in this session</span><b>${esc(run.model.label)}</b></div>
          <div class="mt-3">${gauge(run.risk)}</div>
          <div class="row mt-3"><a class="btn btn-secondary btn-sm w-full" href="/report" data-link>Open the evidence report</a></div>`
        : `<div class="empty"><div class="icon-tile">${icon("gauge", "icon-lg")}</div><h3>No audit yet</h3><p class="muted small">Run the live demo audit to see a real memorization score, computed in your browser in about a second.</p><a class="btn btn-primary btn-sm" href="/audit" data-link>Run the demo audit</a></div>`}
      </div>
    </section>

    <div class="section-title"><h2>Your workflow</h2></div>
    <div class="grid g-12">
      <div class="span-3">${step(1, "/bridge", "Import garak results", "Generate the garak command for your endpoint, then import its report to see where it stops.", "terminal", done.bridge, "Garak Bridge")}</div>
      <div class="span-3">${step(2, "/audit", "Audit your records", "Score every record for memorization, calibrated on records the model never saw.", "scan", done.audit, "Evidence audit")}</div>
      <div class="span-3">${step(3, "/shield", "Guard the endpoint", "Mask or block replies that repeat protected records or secrets.", "shield", done.shield, "Shield")}</div>
      <div class="span-3">${step(4, "/compare", "Fix and verify", "Audit the retrained model and show the score drop with evidence.", "compare", done.compare, "Fix & verify")}</div>
    </div>

    <div class="grid g-12 mt-4">
      <section class="card span-7" aria-labelledby="gap-h">
        <div class="card-head"><div><h2 id="gap-h">Where garak stops</h2><p class="small muted">Source-backed gaps we close, and the ones we do not claim.</p></div>
          <div class="row"><span class="chip chip-ok">${counts.COVERED} covered</span><span class="chip chip-warn">${counts.PARTIAL} partial</span><span class="chip chip-out">${counts.OUT_OF_SCOPE} out of scope</span></div></div>
        <div class="table-wrap"><table><thead><tr><th>garak limitation</th><th>Status</th></tr></thead><tbody>
          ${GAP_MAP.slice(0, 5).map((g) => `<tr><td class="small">${esc(g.limitation)}</td><td>${statusChip(g.status)}</td></tr>`).join("")}
          <tr><td class="small">${esc(GAP_MAP[6].limitation)}</td><td>${statusChip("OUT_OF_SCOPE")}</td></tr>
        </tbody></table></div>
        <div class="card-foot"><a href="/method" data-link class="small">See every gap with sources ${icon("chevron", "icon-sm")}</a></div>
      </section>
      <section class="card span-5" aria-labelledby="sess-h">
        <div class="card-head"><div><h2 id="sess-h">This session</h2><p class="small muted">Held in this tab's memory only.</p></div></div>
        <ul class="checklist">
          <li>${icon("scan")}<div><b>${state.runOrder.length}</b> audit result${state.runOrder.length === 1 ? "" : "s"} in memory${run ? `<div class="small faint">Last: ${esc(fmtDate(run.createdAt))} · ${esc(fmtMs(run.durationMs))}</div>` : ""}</div></li>
          <li>${icon("terminal")}<div>${state.garak ? `garak report imported: <b>${state.garak.probesTotal}</b> probes` : "No garak report imported"}</div></li>
          <li>${icon("shield")}<div>${state.shield ? `Shield active, <b>${state.shield.windows.toLocaleString("en-IN")}</b> hashed windows` : "Shield not built"}</div></li>
          <li>${icon("database")}<div id="hist-line">${s.guest ? "History is off in demo sessions" : dbAvailable() ? "Loading saved run history..." : "History storage is not connected"}</div></li>
        </ul>
        <div class="card-foot"><button class="btn btn-danger btn-sm" id="clear-btn" type="button">${icon("trash", "icon-sm")} Clear session data</button><a class="small" href="/privacy" data-link>What is stored?</a></div>
      </section>
    </div>`;

  $("#clear-btn", main).addEventListener("click", async () => {
    const m = openModal({ title: "Clear this session's data?", body: "<p>This removes every audit result, the Shield index and the imported garak summary from this tab. Saved run history (scores only) is not affected.</p>",
      actions: [{ label: "Cancel", value: false }, { label: "Clear data", value: true, kind: "btn-danger" }] });
    if (await m.done) {
      const c = clearSessionData();
      toast(`Cleared ${c.runs} result(s), ${c.shield} Shield index and ${c.garak} garak summary from memory.`, "ok");
      dashboardView(main);
    }
  });

  if (!s.guest && dbAvailable()) {
    try {
      const rows = await db.listRuns();
      const el = $("#hist-line", main);
      if (el) el.innerHTML = `<b>${rows.length}</b> saved run${rows.length === 1 ? "" : "s"} (scores only) · <a href="/history" data-link>History</a>`;
    } catch {
      const el = $("#hist-line", main);
      if (el) el.textContent = "Could not load history right now.";
    }
  }
  return { title: "Dashboard" };
}
