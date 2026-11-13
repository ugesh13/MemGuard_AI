// Signed Data Handling Receipts. HMAC-SHA256 over a canonical JSON form.
import { createHmac, timingSafeEqual } from "node:crypto";

export const RECEIPT_FIELDS = [
  "receipt_id", "issued_at", "subject", "model_label", "source",
  "risk_score", "risk_band", "records_processed", "report_sha256",
  "processed_in", "bytes_persisted", "not_deletable_by_us",
];

export function canonical(receipt) {
  const o = {};
  for (const k of RECEIPT_FIELDS) o[k] = receipt[k] === undefined ? null : receipt[k];
  return JSON.stringify(o);
}

export function sign(receipt, secret) {
  return createHmac("sha256", secret).update(canonical(receipt)).digest("hex");
}

export function verify(receipt, signature, secret) {
  if (typeof signature !== "string" || !/^[0-9a-f]{64}$/.test(signature)) return false;
  const expected = Buffer.from(sign(receipt, secret), "hex");
  const got = Buffer.from(signature, "hex");
  return expected.length === got.length && timingSafeEqual(expected, got);
}
