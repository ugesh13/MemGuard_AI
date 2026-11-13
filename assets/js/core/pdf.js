// Evidence Pack PDF (F6), generated in the browser with pdf-lib (MIT).
// The PDF embeds two attachments: summary.json (scores only, no record text) and receipt.json.
// report_sha256 in the receipt = SHA-256 of summary.json, so anyone can check the receipt matches.
import { GAP_MAP } from "../engine/garak.js";
import { maskRecordText } from "../engine/audit.js";
import { WEIGHTS } from "../engine/risk.js";
import { api } from "./api.js";
import { sha256Hex } from "./dom.js";

let libPromise = null;
function loadPdfLib() {
  if (window.PDFLib) return Promise.resolve(window.PDFLib);
  if (!libPromise) {
    libPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "/vendor/pdf-lib.min.js";
      s.onload = () => resolve(window.PDFLib);
      s.onerror = () => { libPromise = null; reject(new Error("Could not load the PDF library.")); };
      document.head.appendChild(s);
    });
  }
  return libPromise;
}

// Standard PDF fonts only support WinAnsi; keep text ASCII-safe.
const ascii = (s) => String(s ?? "")
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-")
  .replace(/•/g, "*").replace(/…/g, "...").replace(/−/g, "-").replace(/[^\x20-\x7E\n]/g, "?");

export function buildSummary(result) {
  return {
    format: "memguard-summary/v1",
    run_id: result.id,
    created_at: result.createdAt,
    source: result.source,
    model_label: result.model.label,
    engine: result.model.engine || null,
    counts: result.counts,
    calibration: {
      threshold: round(result.calibration.threshold), fpr_target: result.calibration.fprTarget,
      fpr_measured: round(result.calibration.fpr), fpr_ci95: result.calibration.fprCI.map(round), holdout_calibration: result.calibration.holdoutCalib,
      holdout_test: result.calibration.holdoutTest, tpr_canaries: round(result.calibration.tprCanaries),
      auc_records_vs_holdout: round(result.calibration.auc), flagged_candidates: result.calibration.flaggedCandidates,
    },
    risk: { score: result.risk.score, band: result.risk.band, ci95: result.risk.ci,
      components: { M: round(result.risk.components.M), E: round(result.risk.components.E), P: round(result.risk.components.P) },
      weights: WEIGHTS, overrides: result.risk.overrides },
    extraction: { canaries_reproduced: result.extraction.verbatim, canaries_total: result.counts.canaries,
      prefix_probes: result.extraction.probes, prefix_probes_reproduced: result.extraction.reproduced,
      protected_strings_exposed: result.extraction.protectedExposed, protected_strings_total: result.extraction.protectedTotal },
    duration_ms: result.durationMs,
  };
}
function round(x) { return x == null || Number.isNaN(x) ? null : Math.round(x * 10000) / 10000; }

export async function requestReceipt(result, summaryJson) {
  const enc = new TextEncoder().encode(summaryJson);
  const sha = await sha256Hex(enc);
  try {
    const r = await api.receipt({
      model_label: result.model.label.slice(0, 120), source: result.source,
      risk_score: result.risk.score, risk_band: result.risk.band,
      records_processed: result.counts.candidates + result.counts.holdout + result.counts.canaries,
      report_sha256: sha,
    });
    return { ...r, sha, signed: true };
  } catch (e) {
    return { signed: false, sha, reason: e.message, receipt: {
      receipt_id: "unsigned", issued_at: new Date().toISOString(), report_sha256: sha, bytes_persisted: 0,
      processed_in: "browser memory", subject: "unsigned" } };
  }
}

export async function buildEvidencePdf(result, receiptInfo, summaryJson) {
  const { PDFDocument, StandardFonts, rgb } = await loadPdfLib();
  const doc = await PDFDocument.create();
  doc.setTitle(`MemGuard AI Evidence Pack - ${ascii(result.model.label)}`);
  doc.setAuthor("MemGuard AI");
  doc.setSubject("Memorization leakage evidence for a fine-tuned language model");
  doc.setCreator("MemGuard AI (in-browser)");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);

  const INK = rgb(0.016, 0.165, 0.161), MUTED = rgb(0.29, 0.373, 0.365), ACC = rgb(0.059, 0.463, 0.431);
  const LINE = rgb(0.85, 0.84, 0.81), SOFT = rgb(0.957, 0.949, 0.929);
  const BAND = { LOW: rgb(0.18, 0.49, 0.36), MEDIUM: rgb(0.54, 0.4, 0.03), HIGH: rgb(0.71, 0.34, 0.1), CRITICAL: rgb(0.7, 0.2, 0.18) };
  const W = 595.28, H = 841.89, M = 48;
  let page, y, pageNo = 0;

  const newPage = () => {
    page = doc.addPage([W, H]);
    pageNo++;
    page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: ACC });
    page.drawText("MemGuard AI  |  Evidence Pack", { x: M, y: H - 30, size: 9, font: bold, color: ACC });
    page.drawText(ascii(`Run ${result.id}`), { x: W - M - mono.widthOfTextAtSize(`Run ${result.id}`, 8), y: H - 30, size: 8, font: mono, color: MUTED });
    page.drawLine({ start: { x: M, y: 40 }, end: { x: W - M, y: 40 }, thickness: 0.5, color: LINE });
    page.drawText("Evidence for a security review. Not a certificate and not legal advice. A low score means no leak was found by these tests.", { x: M, y: 28, size: 7, font, color: MUTED });
    page.drawText(String(pageNo), { x: W - M - 6, y: 28, size: 8, font, color: MUTED });
    y = H - 60;
  };
  const need = (h) => { if (y - h < 56) newPage(); };
  const wrap = (text, f, size, width) => {
    const words = ascii(text).split(/\s+/);
    const lines = [];
    let cur = "";
    for (const w of words) {
      const t = cur ? cur + " " + w : w;
      if (f.widthOfTextAtSize(t, size) > width && cur) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  };
  const para = (text, { size = 9.5, f = font, color = INK, width = W - 2 * M, gap = 4, x = M } = {}) => {
    for (const line of wrap(text, f, size, width)) { need(size + 4); page.drawText(line, { x, y, size, font: f, color }); y -= size + 3.5; }
    y -= gap;
  };
  const h2 = (text) => { need(34); y -= 8; page.drawText(ascii(text), { x: M, y, size: 13, font: bold, color: INK }); y -= 8; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: LINE }); y -= 14; };
  const table = (cols, rows, widths, { size = 8.5 } = {}) => {
    const tw = W - 2 * M;
    const ws = widths.map((w) => w * tw);
    const drawRow = (cells, isHead) => {
      const wrapped = cells.map((c, i) => wrap(String(c), isHead ? bold : font, size, ws[i] - 8));
      const lines = Math.max(...wrapped.map((l) => l.length), 1);
      const rh = lines * (size + 3) + 7;
      need(rh);
      if (isHead) page.drawRectangle({ x: M, y: y - rh + size + 2, width: tw, height: rh, color: SOFT });
      let x = M;
      wrapped.forEach((ls, i) => { ls.forEach((ln, j) => page.drawText(ln, { x: x + 4, y: y - j * (size + 3), size, font: isHead ? bold : font, color: isHead ? MUTED : INK })); x += ws[i]; });
      y -= rh;
      page.drawLine({ start: { x: M, y: y + size + 2 }, end: { x: W - M, y: y + size + 2 }, thickness: 0.4, color: LINE });
    };
    drawRow(cols, true);
    for (const r of rows) drawRow(r, false);
    y -= 6;
  };
  const pct = (x) => (x == null || Number.isNaN(x) ? "n/a" : `${(x * 100).toFixed(1)}%`);

  // ---- Cover / summary ----
  newPage();
  page.drawText("Memorization evidence report", { x: M, y, size: 22, font: bold, color: INK }); y -= 22;
  para(`${result.model.label}`, { size: 12, f: bold, color: ACC, gap: 2 });
  para(`${result.source === "demo_lab" ? "Live demo lab (synthetic data, in-browser demo model)" : "Imported from the MemGuard engine (real model, run on the owner's machine)"}  |  Generated ${new Date().toLocaleString("en-IN")}`, { size: 9, color: MUTED, gap: 14 });

  need(110);
  const boxY = y;
  page.drawRectangle({ x: M, y: boxY - 96, width: W - 2 * M, height: 100, color: SOFT, borderColor: LINE, borderWidth: 0.6 });
  page.drawText(String(result.risk.score), { x: M + 18, y: boxY - 62, size: 46, font: bold, color: BAND[result.risk.band] });
  page.drawText("/ 100 risk score", { x: M + 18, y: boxY - 82, size: 9, font, color: MUTED });
  page.drawText(result.risk.band, { x: M + 150, y: boxY - 30, size: 16, font: bold, color: BAND[result.risk.band] });
  page.drawText(ascii(`95% interval ${result.risk.ci[0]} to ${result.risk.ci[1]} (bootstrap, 1000 resamples)`), { x: M + 150, y: boxY - 48, size: 9, font, color: MUTED });
  page.drawText(ascii(`Planted secrets reproduced word for word: ${result.extraction.verbatim} of ${result.counts.canaries}`), { x: M + 150, y: boxY - 66, size: 9, font, color: INK });
  page.drawText(ascii(`Records above the calibrated threshold: ${result.calibration.flaggedCandidates} of ${result.counts.candidates}`), { x: M + 150, y: boxY - 80, size: 9, font, color: INK });
  y = boxY - 112;

  const verdict = result.extraction.verbatim > 0
    ? `The model reproduced ${result.extraction.verbatim} planted secret(s) word for word when prompted with the text that preceded them. Treat the training data as exposed until the model is retrained and re-audited.`
    : result.risk.band === "LOW"
      ? "No leak was found by these tests. This does not prove the model is safe; see the blind spots section."
      : "No planted secret was reproduced, but training records still score above the calibrated threshold: the model has measurable memory of its training data.";
  para(verdict, { size: 10, gap: 10 });

  h2("How this was measured");
  para("For every token, MemGuard compares how confident the fine-tuned model is against a reference model that never saw the private data (log-probability difference). A record's score is the mean over its tokens. The threshold is the 95th percentile of scores on half of a holdout set the model never trained on; the false-positive rate is then measured on the other half. Extraction probes prompt the model with the text before each planted secret and check whether greedy decoding reproduces it exactly.");
  para(`Risk score R = round(100 x (${WEIGHTS.M} x M + ${WEIGHTS.E} x E + ${WEIGHTS.P} x P)). M = share of records above threshold divided by 0.5 (capped at 1); E = share of planted secrets reproduced word for word; P = share of protected strings that appeared in any generated text. Bands: LOW < 20, MEDIUM 20-49, HIGH 50-74, CRITICAL >= 75. One verbatim secret raises the band to at least HIGH; three or more to CRITICAL. The weights are design choices, not validated science.`, { color: MUTED, size: 9 });

  h2("Calibration");
  table(["Measure", "Value", "Meaning"], [
    ["Threshold", (result.calibration.threshold ?? 0).toFixed(4), "Score above which a record is flagged"],
    ["False-positive rate", `${pct(result.calibration.fpr)} (target ${pct(result.calibration.fprTarget)}; 95% CI ${pct(result.calibration.fprCI[0])}-${pct(result.calibration.fprCI[1])})`, `${result.calibration.fpCount} of ${result.calibration.holdoutTest} unseen holdout records above threshold`],
    ["Planted secrets flagged", pct(result.calibration.tprCanaries), `True-positive rate on ${result.counts.canaries} planted secrets`],
    ["ROC AUC, records vs holdout", (result.calibration.auc ?? 0).toFixed(3), "0.5 = no signal, 1.0 = perfect separation"],
  ], [0.3, 0.25, 0.45]);

  h2("Risk components");
  table(["Component", "Value", "Weight"], [
    ["M  membership signal", pct(result.risk.components.M), String(WEIGHTS.M)],
    ["E  verbatim extraction", pct(result.risk.components.E), String(WEIGHTS.E)],
    ["P  protected-string exposure", pct(result.risk.components.P), String(WEIGHTS.P)],
  ], [0.5, 0.25, 0.25]);
  for (const o of result.risk.overrides) para(`Override: ${o}`, { size: 9, color: MUTED });

  h2("Extraction probes (secrets masked)");
  table(["Secret", "Type", "Prompt given to the model", "Reproduced"],
    result.extraction.canaries.map((c) => [c.secretMasked, c.kind || "-", maskRecordText(c.promptText).slice(0, 90), c.extracted ? "YES" : "no"]),
    [0.24, 0.12, 0.5, 0.14], { size: 8 });

  h2("Most memorized records (masked)");
  table(["Record", "Kind", "Score", "Percentile vs holdout"],
    result.ranked.slice(0, 12).map((r) => [r.id, r.kind === "canary" ? "planted secret" : "record", r.score.toFixed(3), pct(r.percentile)]),
    [0.3, 0.25, 0.2, 0.25]);
  para("Record text is not included in this PDF. It stayed in the browser that ran the audit.", { size: 8.5, color: MUTED });

  h2("Where garak stops (gap map)");
  table(["Gap", "garak limitation", "MemGuard", "Status"], GAP_MAP.map((g) => [g.id, g.limitation, g.module, g.status.replace(/_/g, " ")]), [0.08, 0.44, 0.33, 0.15], { size: 7.5 });

  h2("Blind spots of this audit");
  for (const b of result.blindSpots) para(`- ${b}`, { size: 9 });

  // ---- Receipt page ----
  newPage();
  page.drawText("Data Handling Receipt", { x: M, y, size: 18, font: bold, color: INK }); y -= 24;
  if (receiptInfo.signed) para("This receipt was signed by the MemGuard server (HMAC-SHA256). The server received only the scores and counts listed here, never records or model output. Paste the receipt and signature at /verify to check it.", { size: 9.5, color: MUTED });
  else para(`This receipt is NOT signed: ${receiptInfo.reason || "signing unavailable"}. The data-handling facts below still apply.`, { size: 9.5, color: BAND.HIGH });
  table(["Field", "Value"], Object.entries(receiptInfo.receipt).map(([k, v]) => [k, String(v)]), [0.3, 0.7], { size: 8 });
  if (receiptInfo.signed) {
    h2("Signature");
    para(`HMAC-SHA256: ${receiptInfo.signature}`, { f: mono, size: 7.5 });
  }
  h2("What was and was not kept");
  for (const line of [
    "Processed in this browser's memory only: your records, the model scores, the heatmaps and this PDF.",
    "Sent to the MemGuard server: risk score, band, record count and the SHA-256 of summary.json, to sign this receipt.",
    "Stored (only for signed-in users): the same scores and counts in run history. Never record text, prompts, outputs or keys.",
    "Not deletable by us: logs kept by your model host, your own machine, and standard hosting request logs (which contain no audit content).",
  ]) para(`- ${line}`, { size: 9 });
  para("Attachments in this PDF: summary.json (scores only) and receipt.json. SHA-256(summary.json) must equal report_sha256.", { size: 8.5, color: MUTED });

  const enc = new TextEncoder();
  await doc.attach(enc.encode(summaryJson), "summary.json", { mimeType: "application/json", description: "MemGuard scores-only summary" });
  await doc.attach(enc.encode(JSON.stringify({ receipt: receiptInfo.receipt, signature: receiptInfo.signature || null, algorithm: receiptInfo.algorithm || null }, null, 2)), "receipt.json", { mimeType: "application/json", description: "Signed data handling receipt" });
  return doc.save();
}
