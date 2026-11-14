// Garak Bridge (F1): parse a garak report.jsonl IN THE BROWSER and build the Gap Map.
// Only allow-listed numeric/name fields are kept. Prompts and outputs are never copied.

export const MAX_REPORT_BYTES = 100 * 1024 * 1024;

// Source-backed list of garak limitations and where MemGuard stands. See docs/PRD.md section 3.
export const GAP_MAP = [
  { id: "L-G", limitation: "leakreplay replays public text excerpts; it does not test a company's own private records.",
    garak: "Checks if the model completes known public passages.", module: "Evidence Audit (record-level, your data)", status: "COVERED" },
  { id: "L-C", limitation: "Detectors are keyword or classifier based; hits need human review and arrive as many separate pass rates.",
    garak: "Pass/fail rates per probe and detector.", module: "Calibrated score at a fixed false-positive rate + one risk score with CI", status: "COVERED" },
  { id: "L-E", limitation: "garak is a scanner: it reports, it does not guard a live endpoint or show that a fix worked.",
    garak: "Finds failures.", module: "Shield (runtime guard) + Fix-and-Verify compare", status: "COVERED" },
  { id: "L-D", limitation: "Static, known probes: a clean scan means known patterns failed, not that the model is safe.",
    garak: "Library of published probes.", module: "Reports always list blind spots; never say “safe”", status: "PARTIAL" },
  { id: "L-B", limitation: "Mostly single-turn probes; multi-turn behaviour is weakly covered.",
    garak: "Single prompt, single reply.", module: "Prefix extraction probes (memorization only)", status: "PARTIAL" },
  { id: "L-F", limitation: "Full scans can take hours.",
    garak: "Broad probe sweep.", module: "Focused memorization audit; measured run time is shown", status: "PARTIAL" },
  { id: "L-A", limitation: "Tests the model endpoint, not the application; RAG and agent coverage is limited.",
    garak: "Model-level probes.", module: "Not covered. Use promptfoo or PyRIT.", status: "OUT_OF_SCOPE" },
];

export function parseGarakReport(text) {
  if (typeof text !== "string") throw new Error("Report must be text.");
  if (new Blob([text]).size > MAX_REPORT_BYTES) {
    const e = new Error("The report is larger than 100 MB."); e.code = "TOO_LARGE"; throw e;
  }

  const rows = [];
  let version = null, runId = null;

  // ── Helper: process one parsed JSON object ──────────────────────────────
  function processObj(obj) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;
    const et = String(obj.entry_type || "");
    if (et === "init" || et === "start_run setup") {
      version = version || (typeof obj.garak_version === "string" ? obj.garak_version.slice(0, 40) : null)
        || (typeof obj["_config.version"] === "string" ? obj["_config.version"].slice(0, 40) : null);
      runId = runId || (typeof obj.run === "string" ? obj.run.slice(0, 64) : null);
    }
    if (et === "eval") {
      const passed = Number(obj.passed);
      const total  = Number(obj.total_evaluated ?? obj.total);
      if (!Number.isFinite(passed) || !Number.isFinite(total)) return;
      rows.push({
        probe:    String(obj.probe    || "unknown").slice(0, 120),
        detector: String(obj.detector || "unknown").slice(0, 120),
        passed, total, passRate: total > 0 ? passed / total : null,
      });
    }
  }

  // ── Detect format: plain JSON (object/array) vs JSONL ───────────────────
  const trimmed = text.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    // Try to parse as a single JSON document first
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = null; }

    if (parsed !== null) {
      // It's valid JSON — could be an array of records or a single object
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (Array.isArray(item)) {
          // nested arrays
          for (const sub of item) processObj(sub);
        } else {
          processObj(item);
        }
      }
    } else {
      // Malformed JSON — fall through to JSONL line-by-line attempt
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        let obj;
        try { obj = JSON.parse(line); } catch {
          const e = new Error(`Line ${i + 1} is not valid JSON.`); e.code = "PARSE_ERROR"; e.line = i + 1; throw e;
        }
        processObj(obj);
      }
    }
  } else {
    // JSONL: one JSON object per line
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      let obj;
      try { obj = JSON.parse(line); } catch {
        const e = new Error(`Line ${i + 1} is not valid JSON.`); e.code = "PARSE_ERROR"; e.line = i + 1; throw e;
      }
      processObj(obj);
    }
  }

  if (!rows.length) {
    const e = new Error(
      "No eval rows found. Make sure the file contains garak evaluation records with entry_type=\"eval\". " +
      "Both *.report.jsonl (JSONL) and *.json (JSON array) formats are accepted."
    );
    e.code = "NO_EVAL_ROWS"; throw e;
  }

  const probes       = new Set(rows.map((r) => r.probe));
  const failingProbes = new Set(rows.filter((r) => r.passed < r.total).map((r) => r.probe));
  const leakRows     = rows.filter((r) => /leak|replay|memor/i.test(r.probe));
  return {
    garakVersion: version, runId,
    probesTotal: probes.size, probesWithHits: failingProbes.size,
    attempts: rows.reduce((a, r) => a + r.total, 0),
    failures: rows.reduce((a, r) => a + (r.total - r.passed), 0),
    leakProbes: leakRows.length,
    rows,
  };
}
