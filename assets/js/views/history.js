// Saved run history from Supabase: scores and counts only. Row Level Security limits rows to the owner.
import { state } from "../core/store.js";
import { esc, icon, $, fmtDate, fmtPct, fmtMs, toast, openModal, bandChip } from "../core/dom.js";
import { db, dbAvailable } from "../core/api.js";
import { can } from "../core/auth.js";
import { pageHead, empty, errorBox, skeletonRows } from "../ui/components.js";

export default async function historyView(main) {
  main.innerHTML = `${pageHead("Run history", "Scores and counts from your past audits. Record text, prompts and model output are never stored, so a past report cannot be re-opened: keep the PDF.")}
    <section class="card" aria-labelledby="h-h" aria-live="polite"><div class="card-head"><h2 id="h-h">Audits</h2><div id="h-actions"></div></div><div id="h-body">${skeletonRows(5)}</div></section>
    <section class="card mt-4" aria-labelledby="r-h"><h2 id="r-h">Signed receipts</h2><div id="r-body" class="mt-3">${skeletonRows(3)}</div></section>`;

  if (state.session.guest || !dbAvailable()) {
    const msg = state.session.guest ? "Demo sessions do not save history." : "History storage is not connected in this deployment.";
    $("#h-body", main).innerHTML = empty({ title: msg, text: "Sign in with an account to keep a scores-only log of your audits and receipts.", ic: "history", action: state.session.guest ? '<a class="btn btn-primary" href="/login" data-link>Sign in</a>' : "" });
    $("#r-body", main).innerHTML = "";
    return { title: "History" };
  }

  async function load() {
    try {
      const [runs, receipts] = await Promise.all([db.listRuns(), db.listReceipts()]);
      $("#h-actions", main).innerHTML = runs.length && can("history.delete") ? `<button class="btn btn-danger btn-sm" id="del-all" type="button">${icon("trash", "icon-sm")} Delete my history</button>` : "";
      $("#h-body", main).innerHTML = runs.length ? `<div class="table-wrap"><table><thead><tr><th>When</th><th>Model</th><th>Source</th><th class="r">Score</th><th>Band</th><th class="r">FPR</th><th class="r">Secrets flagged</th><th class="r">Records</th><th class="r">Time</th></tr></thead><tbody>
        ${runs.map((r) => `<tr><td class="small nowrap">${esc(fmtDate(r.created_at))}</td><td class="small">${esc(r.model_label)}</td><td><span class="chip ${r.source === "demo_lab" ? "chip-sample" : "chip-accent"}">${r.source === "demo_lab" ? "demo" : "engine"}</span></td>
          <td class="r num"><b>${esc(r.risk_score)}</b> <span class="faint small">${esc(r.ci_low)}-${esc(r.ci_high)}</span></td><td>${bandChip(r.risk_band)}</td><td class="r">${esc(fmtPct(r.fpr, 1))}</td><td class="r">${esc(fmtPct(r.tpr))}</td><td class="r">${esc(r.records_count)}</td><td class="r small">${esc(fmtMs(r.duration_ms))}</td></tr>`).join("")}
        </tbody></table></div>` : empty({ title: "No saved audits yet", text: "Run an audit while signed in and its scores appear here.", ic: "history", action: '<a class="btn btn-primary" href="/audit" data-link>Run an audit</a>' });
      $("#r-body", main).innerHTML = receipts.length ? `<div class="table-wrap"><table><thead><tr><th>Issued</th><th>Summary SHA-256</th><th>Signature</th></tr></thead><tbody>
        ${receipts.map((r) => `<tr><td class="small nowrap">${esc(fmtDate(r.issued_at))}</td><td class="mono small">${esc(r.report_sha256.slice(0, 20))}...</td><td class="mono small">${esc((r.signature || "").slice(0, 20))}...</td></tr>`).join("")}
        </tbody></table></div>` : '<p class="muted small">No receipts yet. Download an evidence pack from a report to get one.</p>';
      const del = $("#del-all", main);
      if (del) del.addEventListener("click", async () => {
        const m = openModal({ title: "Delete your saved history?", body: "<p>This permanently deletes your saved audit scores and garak summaries from the MemGuard database. Receipts linked to deleted runs keep their signature but lose the link.</p>",
          actions: [{ label: "Cancel", value: false }, { label: "Delete history", value: true, kind: "btn-danger" }] });
        if (!(await m.done)) return;
        del.disabled = true;
        try { await db.deleteMyHistory(); toast("Your saved history was deleted.", "ok"); load(); }
        catch (err) { toast(err.message, "error"); del.disabled = false; }
      });
    } catch (err) {
      $("#h-body", main).innerHTML = errorBox("Could not load your history.", { hint: err.message, retryId: "h-retry" });
      $("#r-body", main).innerHTML = "";
      const rb = $("#h-retry", main);
      if (rb) rb.addEventListener("click", () => { $("#h-body", main).innerHTML = skeletonRows(5); load(); });
    }
  }
  load();
  return { title: "History" };
}
