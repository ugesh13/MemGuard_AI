import { esc, icon } from "../core/dom.js";
import { pageHead } from "../ui/components.js";

const ROWS = [
  ["Your records, holdout and planted secrets", "This browser tab's memory", "Never", "Refresh, sign out or Clear data"],
  ["Model scores, heatmaps, extraction results", "This browser tab's memory", "Never", "Refresh, sign out or Clear data"],
  ["garak report prompts and outputs", "Not read at all", "Never", "-"],
  ["Shield index", "Salted hashes in this tab's memory", "Never", "Expires after 1 hour, or Remove Shield"],
  ["Evidence pack PDF", "Built in your browser, downloaded to you", "Never", "Delete the file"],
  ["Risk score, band, counts, timings", "MemGuard database (signed-in users)", "Yes, scores only", "Run history → Delete my history"],
  ["garak summary (probe names and pass counts)", "MemGuard database (signed-in users)", "Yes, aggregates only", "Run history → Delete my history"],
  ["Receipt (scores + SHA-256 + signature)", "MemGuard database and your PDF", "Yes", "Run history → Delete my history"],
  ["Your sign-in token", "This tab's memory", "Never written to storage", "Refresh or sign out"],
  ["Target model API keys", "Never requested", "Never", "-"],
];

export default function privacyView(main) {
  main.innerHTML = `
    ${pageHead("Privacy", "Short version: your records and your model's output never leave your browser. We keep scores, never content.")}
    <div class="grid g-12">
      <section class="card span-12" aria-labelledby="p1">
        <h2 id="p1">What is processed, and where</h2>
        <div class="table-wrap mt-3"><table><thead><tr><th>Data</th><th>Where it lives</th><th>Stored by us?</th><th>How it is removed</th></tr></thead><tbody>
          ${ROWS.map((r) => `<tr>${r.map((c, i) => `<td class="small">${i === 2 ? `<span class="chip ${c.startsWith("Never") ? "chip-ok" : "chip-accent"}">${esc(c)}</span>` : esc(c)}</td>`).join("")}</tr>`).join("")}
        </tbody></table></div>
      </section>
      <section class="card span-6" aria-labelledby="p2">
        <h2 id="p2">What we cannot delete</h2>
        <ul class="checklist no mt-3">
          <li>${icon("alert-triangle")}<span class="small">Logs kept by your model host or API provider when you run garak or the engine.</span></li>
          <li>${icon("alert-triangle")}<span class="small">Files on your own machine (engine input and output, downloaded PDFs).</span></li>
          <li>${icon("alert-triangle")}<span class="small">Standard request logs at our hosting and database providers. Our pages never put audit content in URLs or headers, so none reaches those logs.</span></li>
        </ul>
      </section>
      <section class="card span-6" aria-labelledby="p3">
        <h2 id="p3">Signed receipts</h2>
        <p class="small muted mt-2">Every evidence pack carries a Data Handling Receipt signed by the MemGuard server with HMAC-SHA256. The server sees only the score, band, record count and the SHA-256 of the scores-only summary embedded in the PDF. Check any receipt on the <a href="/verify" data-link>Verify page</a>.</p>
        <div class="code mt-3">{ "receipt_id": "…", "bytes_persisted": 0,
  "processed_in": "browser memory",
  "report_sha256": "9f2c…", "risk_band": "CRITICAL" }</div>
      </section>
      <section class="card span-12" aria-labelledby="p4">
        <h2 id="p4">Security measures</h2>
        <ul class="clean small mt-3">
          <li>Strict Content Security Policy: scripts only from this site, no inline scripts, no third-party trackers or analytics.</li>
          <li>Database protected by Row Level Security: each account can only read and delete its own rows; the schema has no column that can hold record text.</li>
          <li>Passwords and Google sign-in handled by Supabase Auth; we never see or store passwords.</li>
          <li>All text from files and servers is escaped before display to prevent script injection.</li>
        </ul>
        <p class="small faint mt-3">This page describes how the software works. It is not legal advice.</p>
      </section>
    </div>`;
  return { title: "Privacy" };
}
