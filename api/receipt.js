// Issues a signed Data Handling Receipt. Receives ONLY metadata (scores, counts, a SHA-256 of
// the PDF). Never receives records, model output or keys.
import { randomUUID } from "node:crypto";
import { send, fail, readJson, rateLimit, methodGuard, supabaseUser } from "./_lib/http.js";
import { sign } from "./_lib/receipts.js";

const BANDS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const SOURCES = ["demo_lab", "engine_import"];

export default async function handler(req, res) {
  if (!methodGuard(req, res, ["POST"])) return;
  if (!rateLimit(req, res, { key: "receipt", limit: 20 })) return;
  const secret = process.env.RECEIPT_SIGNING_SECRET;
  if (!secret) return fail(res, 503, "SIGNING_DISABLED", "Receipt signing is not configured on this server.", "Set RECEIPT_SIGNING_SECRET.");

  let b;
  try { b = await readJson(req, 4 * 1024); } catch {
    return fail(res, 400, "BAD_JSON", "Request body must be valid JSON.");
  }
  // Strict allow-list: anything else in the body is ignored.
  const fields = {};
  if (typeof b.model_label !== "string" || b.model_label.length > 120) fields.model_label = "Required, max 120 characters.";
  if (!SOURCES.includes(b.source)) fields.source = "Unknown source.";
  if (!Number.isInteger(b.risk_score) || b.risk_score < 0 || b.risk_score > 100) fields.risk_score = "Integer 0-100.";
  if (!BANDS.includes(b.risk_band)) fields.risk_band = "Unknown band.";
  if (!Number.isInteger(b.records_processed) || b.records_processed < 0 || b.records_processed > 1e7) fields.records_processed = "Invalid count.";
  if (typeof b.report_sha256 !== "string" || !/^[0-9a-f]{64}$/.test(b.report_sha256)) fields.report_sha256 = "Must be a SHA-256 hex digest.";
  if (Object.keys(fields).length) {
    return send(res, 422, { error: { code: "VALIDATION_ERROR", message: "Receipt request is invalid.", hint: null, fields } });
  }

  const user = await supabaseUser(req);
  const receipt = {
    receipt_id: randomUUID(),
    issued_at: new Date().toISOString(),
    subject: user ? `user:${user.id}` : "guest-session",
    model_label: b.model_label,
    source: b.source,
    risk_score: b.risk_score,
    risk_band: b.risk_band,
    records_processed: b.records_processed,
    report_sha256: b.report_sha256,
    processed_in: "browser memory (records, scores and model output never sent to this server)",
    bytes_persisted: 0,
    not_deletable_by_us: "Your model host's logs, your own machine, and standard hosting request logs (which contain no audit content).",
  };
  send(res, 200, { receipt, signature: sign(receipt, secret), algorithm: "HMAC-SHA256" });
}
