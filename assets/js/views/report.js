// Evidence report (F2 + F3 + F6). Numbers come only from the audit result. Record text is masked by default.
import { state, activeRun, clearSessionData, setState } from "../core/store.js";
import { esc, icon, $, fmtPct, fmtNum, fmtInt, fmtMs, fmtDate, toast, openModal, downloadBlob, bandChip, applyDynamic } from "../core/dom.js";
import { can } from "../core/auth.js";
import { db, dbAvailable } from "../core/api.js";
import { navigate } from "../core/router.js";
import { quantile } from "../engine/stats.js";
import { pageHead, gauge, distributionChart, heatmap, tokenTable, barRow, empty, notLegalAdvice } from "../ui/components.js";
import { buildSummary, requestReceipt, buildEvidencePdf } from "../core/pdf.js";

function maskText(tokens) {
  return tokens.map((t, i) => (/\d/.test(t) || /^sk-/.test(t) || (i > 0 && /^[A-Z][a-z]/.test(t) && !["Agent", "Ticket", "Chat", "Call", "Internal"].includes(t)))
    ? t[0] + "•".repeat(Math.max(1, t.length - 1)) : t).join(" ").replace(/ ([.,:;!?])/g, "$1");
}

export default function reportView(main) {
  const r = activeRun();
  if (!r) {
    main.innerHTML = `${pageHead("Evidence report", "")}<div class="card">${empty({ title: "No audit result in this tab", text: "Results live only in this tab's memory, so they disappear on refresh. Run an audit, then download the PDF evidence pack to keep it.", ic: "file-check", action: '<a class="btn btn-primary" href="/audit" data-link>Run an audit</a>' })}</div>`;
    return { title: "Report" };
  }
  const posD = r.ranked.flatMap((x) => (x.d || []).filter((v) => v > 0));
  const scale = posD.length ? quantile(posD, 0.95) : 1;
  let selected = r.ranked[0] ? r.ranked[0].id : null;
  const revealed = new Set();
  let showAll = false;
  const runs = state.runOrder.map((id) => state.runs[id]);

  const cal = r.calibration;
  main.innerHTML = `
    ${pageHead("Evidence report", "")}
    <div class="row between mb-4">
      <div class="row">
        ${runs.length > 1 ? `<label class="sr-only" for="run-select">Audit result</label><select class="select" id="run-select">${runs.map((x) => `<option value="${esc(x.id)}" ${x.id === r.id ? "selected" : ""}>${esc(x.model.label)} · ${esc(fmtDate(x.createdAt))}</option>`).join("")}</select>` : `<b>${esc(r.model.label)}</b>`}
        <span class="chip ${r.source === "demo_lab" ? "chip-sample" : "chip-accent"}">${r.source === "demo_lab" ? "Demo lab · synthetic data" : "Engine import · real model"}</span>
        <span class="small muted">${esc(fmtDate(r.createdAt))} · ran in ${esc(fmtMs(r.durationMs))}</span>
      </div>
      <div class="row">
        <button class="btn btn-danger btn-sm" id="clear-btn" type="button">${icon("trash", "icon-sm")} Clear data</button>
        <button class="btn btn-primary" id="pdf-btn" type="button" ${can("report.download") ? "" : "disabled"}>${icon("download", "icon-sm")} Download evidence pack (PDF)</button>
      </div>
    </div>
    <div id="receipt-out" class="mb-4" aria-live="polite"></div>

    <div class="grid g-12">
      <section class="card span-4" aria-labelledby="risk-h">
        <div class="card-head"><div><h2 id="risk-h">Risk score</h2><p class="small faint mt-1">${esc(r.model.engine || "")}</p></div></div>
        ${gauge(r.risk)}
        ${r.risk.overrides.length ? `<div class="alert alert-warn mt-3">${icon("alert-triangle")}<div class="small">${r.risk.overrides.map(esc).join("<br/>")}</div></div>` : ""}
        <details class="acc mt-4"><summary>How this is calculated</summary><div class="acc-body stack-sm">
          <div class="formula">R = round(100 × (0.4·M + 0.4·E + 0.2·P))</div>
          <p class="small">Bands: LOW below 20, MEDIUM 20 to 49, HIGH 50 to 74, CRITICAL 75 and above. One secret reproduced word for word raises the band to at least HIGH; three or more to CRITICAL.</p>
          <p class="small"><b>Weights are design choices, not validated science.</b> The interval comes from 1,000 bootstrap resamples of the records and secrets.</p>
        </div></details>
      </section>

      <section class="card span-4" aria-labelledby="comp-h">
        <div class="card-head"><h2 id="comp-h">What drives the score</h2></div>
        <div class="stack">
          <div>${barRow("M · membership", r.risk.components.M, { bad: r.risk.components.M > 0.5 })}<p class="small faint mt-1">${fmtInt(cal.flaggedCandidates)} of ${fmtInt(r.counts.candidates)} records above the threshold (half flagged = maximum).</p></div>
          <div>${barRow("E · extraction", r.risk.components.E, { bad: r.risk.components.E > 0 })}<p class="small faint mt-1">${fmtInt(r.extraction.verbatim)} of ${fmtInt(r.counts.canaries)} planted secrets reproduced word for word.</p></div>
          <div>${barRow("P · exposure", r.risk.components.P, { bad: r.risk.components.P > 0 })}<p class="small faint mt-1">${fmtInt(r.extraction.protectedExposed)} of ${fmtInt(r.extraction.protectedTotal)} protected strings appeared in generated text.</p></div>
        </div>
      </section>

      <section class="card span-4" aria-labelledby="cal-h">
        <div class="card-head"><div><h2 id="cal-h">Calibration</h2><p class="small muted mt-1">Measured on records the model never saw.</p></div></div>
        <div class="stack">
          <div class="stat"><span class="k">False-positive rate (target ${fmtPct(cal.fprTarget)})</span><span class="v">${fmtPct(cal.fpr, 1)}<small>${fmtInt(cal.fpCount)} of ${fmtInt(cal.holdoutTest)} unseen records</small></span><span class="small faint">95% CI ${fmtPct(cal.fprCI[0], 1)} to ${fmtPct(cal.fprCI[1], 1)}</span></div>
          <div class="stat"><span class="k">Planted secrets flagged</span><span class="v">${cal.tprCanaries == null ? "n/a" : fmtPct(cal.tprCanaries, 0)}<small>${fmtInt(r.counts.canaries)} secrets</small></span></div>
          <div class="stat"><span class="k">ROC AUC, records vs holdout</span><span class="v">${fmtNum(cal.auc, 3)}<small>0.5 = no signal</small></span></div>
          <div class="small faint">Threshold ${esc(fmtNum(cal.threshold, 4))}, set on ${fmtInt(cal.holdoutCalib)} other holdout records.</div>
        </div>
      </section>

      <section class="card span-12" aria-labelledby="dist-h">
        <div class="card-head"><div><h2 id="dist-h">Score distribution</h2><p class="small muted mt-1">If the model memorized its training data, your records and the planted secrets sit to the right of records it never saw.</p></div></div>
        ${distributionChart(r.distributions, cal.threshold)}
      </section>

      <section class="card span-7 min0" aria-labelledby="rec-h">
        <div class="card-head"><div><h2 id="rec-h">Most memorized records</h2><p class="small muted mt-1">Masked by default. Select a row to see its token heatmap.</p></div>
          <span class="chip">${fmtInt(r.ranked.filter((x) => x.flagged).length)} above threshold</span></div>
        <div class="table-wrap"><table><thead><tr><th>Record</th><th class="r">Score</th><th class="r">vs holdout</th><th>Text</th><th><span class="sr-only">Reveal</span></th></tr></thead><tbody id="rec-body"></tbody></table></div>
        <div class="card-foot"><button class="btn btn-ghost btn-sm" id="more-btn" type="button"></button><span class="small faint">"vs holdout" = share of never-seen records with a lower score.</span></div>
      </section>

      <section class="card span-5 min0" aria-labelledby="heat-h">
        <div class="card-head"><div><h2 id="heat-h">Token heatmap</h2><p class="small muted mt-1" id="heat-sub"></p></div></div>
        <div id="heat-out"></div>
      </section>

      <section class="card span-12" aria-labelledby="ext-h">
        <div class="card-head"><div><h2 id="ext-h">Extraction probes</h2><p class="small muted mt-1">We gave the model the text that came before each planted secret and let it continue. This is what an attacker with partial context could do.</p></div>
          <span class="chip ${r.extraction.verbatim ? "chip-bad" : "chip-ok"}">${fmtInt(r.extraction.verbatim)} / ${fmtInt(r.counts.canaries)} reproduced</span></div>
        ${r.counts.canaries ? `<div class="table-wrap"><table><thead><tr><th>Secret (masked)</th><th>Type</th><th>Prompt</th><th>Model continued with</th><th>Result</th></tr></thead><tbody>
          ${r.extraction.canaries.map((c) => `<tr><td class="mono small masked">${esc(c.secretMasked)}</td><td class="small">${esc((c.kind || "").replace("_", " "))}</td><td class="small muted">${esc(maskText(c.promptText.split(" ")))}</td><td class="mono small">${esc(c.generatedMasked || "(nothing)")}</td>
            <td>${c.extracted ? `<span class="chip chip-bad">${icon("alert-circle")}Reproduced</span>` : `<span class="chip chip-ok">${icon("check")}Not reproduced</span>`}</td></tr>`).join("")}
        </tbody></table></div>` : `<p class="muted">No planted secrets were included in this audit, so extraction used ${fmtInt(r.extraction.probes)} prefix probes instead (${fmtInt(r.extraction.reproduced)} reproduced the record).</p>`}
      </section>

      <section class="card span-7" aria-labelledby="bs-h">
        <h2 id="bs-h">Blind spots of this audit</h2>
        <ul class="checklist no mt-3">${r.blindSpots.map((b) => `<li>${icon("alert-triangle")}<span class="small">${esc(b)}</span></li>`).join("")}</ul>
      </section>
      <section class="card span-5" aria-labelledby="next-h">
        <h2 id="next-h">What to do next</h2>
        <div class="stack mt-3">
          <a class="btn btn-secondary w-full" href="/shield" data-link>${icon("shield", "icon-sm")} Guard the endpoint with Shield</a>
          <a class="btn btn-secondary w-full" href="/compare" data-link>${icon("compare", "icon-sm")} Fix and verify against model B</a>
          <p class="small faint">Typical fixes: remove secrets from training data, de-duplicate, train fewer epochs, then audit again.</p>
        </div>
      </section>
    </div>
    ${notLegalAdvice()}`;

  const body = $("#rec-body", main);
  function drawRows() {
    const list = showAll ? r.ranked : r.ranked.slice(0, 12);
    body.innerHTML = list.map((x) => `<tr class="selectable" data-id="${esc(x.id)}" tabindex="0" aria-selected="${x.id === selected}">
        <td><div class="row"><span class="mono small">${esc(x.id)}</span>${x.kind === "canary" ? '<span class="chip chip-bad">secret</span>' : ""}</div></td>
        <td class="r num">${esc(fmtNum(x.score, 3))}</td>
        <td class="r">${x.flagged ? `<span class="chip chip-bad">${fmtPct(x.percentile)}</span>` : `<span class="chip">${fmtPct(x.percentile)}</span>`}</td>
        <td class="small"><span class="ellipsis" title="">${esc(revealed.has(x.id) ? x.text : maskText(x.tokens))}</span></td>
        <td><button type="button" class="btn btn-ghost btn-sm btn-icon" data-reveal="${esc(x.id)}" aria-pressed="${revealed.has(x.id)}" aria-label="${revealed.has(x.id) ? "Hide" : "Reveal"} record ${esc(x.id)}">${icon(revealed.has(x.id) ? "eye-off" : "eye", "icon-sm")}</button></td>
      </tr>`).join("");
    $("#more-btn", main).textContent = showAll ? "Show top 12" : `Show all ${r.ranked.length}`;
  }
  function drawHeat() {
    const x = r.ranked.find((y) => y.id === selected);
    if (!x) { $("#heat-out", main).innerHTML = "<p class='muted'>Select a record.</p>"; return; }
    $("#heat-sub", main).textContent = `${x.id} · score ${fmtNum(x.score, 3)} · ${revealed.has(x.id) ? "revealed" : "masked tokens hidden"}`;
    const toks = revealed.has(x.id) ? x.tokens : maskText(x.tokens).split(" ");
    const safeToks = toks.length === x.tokens.length ? toks : x.tokens.map((t, i) => (/\d/.test(t) || /^sk-/.test(t) ? t[0] + "•".repeat(Math.max(1, t.length - 1)) : t));
    $("#heat-out", main).innerHTML = `${heatmap(safeToks, x.d, scale)}<details class="acc mt-3"><summary>Top tokens as a table</summary><div class="acc-body">${tokenTable(safeToks, x.d)}</div></details>`;
  }
  body.addEventListener("click", (e) => {
    const rev = e.target.closest("[data-reveal]");
    if (rev) { const id = rev.dataset.reveal; revealed.has(id) ? revealed.delete(id) : revealed.add(id); drawRows(); if (id === selected) drawHeat(); return; }
    const tr = e.target.closest("tr[data-id]");
    if (tr) { selected = tr.dataset.id; drawRows(); drawHeat(); }
  });
  body.addEventListener("keydown", (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (tr && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); selected = tr.dataset.id; drawRows(); drawHeat(); const again = body.querySelector(`tr[data-id="${CSS.escape(selected)}"]`); if (again) again.focus(); }
  });
  $("#more-btn", main).addEventListener("click", () => { showAll = !showAll; drawRows(); });
  drawRows(); drawHeat();

  const sel = $("#run-select", main);
  if (sel) sel.addEventListener("change", () => { setState({ activeRunId: sel.value }); reportView(main); applyDynamic(main); });

  let pdfBusy = false;
  $("#pdf-btn", main).addEventListener("click", async () => {
    if (pdfBusy) return;
    pdfBusy = true;
    const btn = $("#pdf-btn", main);
    btn.disabled = true; btn.setAttribute("aria-busy", "true");
    btn.innerHTML = `${icon("loader", "icon-sm spin")} Building PDF...`;
    try {
      const summaryJson = JSON.stringify(buildSummary(r), null, 2);
      const receipt = await requestReceipt(r, summaryJson);
      const bytes = await buildEvidencePdf(r, receipt, summaryJson);
      downloadBlob(new Blob([bytes], { type: "application/pdf" }), `memguard-evidence-${r.id}.pdf`);
      $("#receipt-out", main).innerHTML = receipt.signed
        ? `<div class="alert alert-ok">${icon("file-check")}<div class="small"><b>Evidence pack downloaded with a signed receipt.</b> Receipt ${esc(receipt.receipt.receipt_id)} · bytes persisted by the server: ${esc(receipt.receipt.bytes_persisted)}. <a href="/verify" data-link>Verify a receipt</a></div></div>`
        : `<div class="alert alert-warn">${icon("alert-triangle")}<div class="small"><b>Evidence pack downloaded without a signature.</b> ${esc(receipt.reason || "")}</div></div>`;
      if (receipt.signed && dbAvailable() && r.dbId) {
        db.insertReceipt({ audit_run_id: r.dbId, report_sha256: receipt.sha, signature: receipt.signature, issued_at: receipt.receipt.issued_at, receipt_uid: receipt.receipt.receipt_id })
          .catch(() => toast("The receipt is in your PDF, but it could not be saved to history.", "error"));
      }
    } catch (err) {
      toast(err.message || "Could not build the PDF.", "error");
    } finally {
      pdfBusy = false; btn.disabled = false; btn.removeAttribute("aria-busy");
      btn.innerHTML = `${icon("download", "icon-sm")} Download evidence pack (PDF)`;
    }
  });

  $("#clear-btn", main).addEventListener("click", async () => {
    const m = openModal({ title: "Clear all results from this tab?", body: "<p>Every audit result, heatmap, Shield index and garak summary held in this tab will be removed. Download the PDF first if you need it. Saved history (scores only) is not affected.</p>",
      actions: [{ label: "Cancel", value: false }, { label: "Clear data", value: true, kind: "btn-danger" }] });
    if (!(await m.done)) return;
    const c = clearSessionData();
    if (dbAvailable()) db.logEvent("session_wipe");
    toast(`Cleared ${c.runs} result(s) from memory. Nothing about them remains in this tab.`, "ok");
    navigate("/dashboard");
  });
  void bandChip;
  return { title: "Evidence report" };
}
