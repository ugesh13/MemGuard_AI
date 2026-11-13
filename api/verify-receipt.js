import { send, fail, readJson, rateLimit, methodGuard } from "./_lib/http.js";
import { verify } from "./_lib/receipts.js";

export default async function handler(req, res) {
  if (!methodGuard(req, res, ["POST"])) return;
  if (!rateLimit(req, res, { key: "verify", limit: 30 })) return;
  const secret = process.env.RECEIPT_SIGNING_SECRET;
  if (!secret) return fail(res, 503, "SIGNING_DISABLED", "Receipt signing is not configured on this server.");
  let b;
  try { b = await readJson(req, 8 * 1024); } catch {
    return fail(res, 400, "BAD_JSON", "Paste the full receipt JSON from the PDF.");
  }
  if (!b || typeof b.receipt !== "object" || typeof b.signature !== "string") {
    return fail(res, 422, "VALIDATION_ERROR", "Expected { receipt, signature }.");
  }
  send(res, 200, { valid: verify(b.receipt, b.signature, secret) });
}
