import { send, fail, readJson, rateLimit, methodGuard } from "./_lib/http.js";
import { validate, buildGarakConfig } from "./_lib/garak-config.js";

export default async function handler(req, res) {
  if (!methodGuard(req, res, ["POST"])) return;
  if (!rateLimit(req, res, { key: "garak-config", limit: 30 })) return;
  let body;
  try { body = await readJson(req, 8 * 1024); } catch (e) {
    return fail(res, e.status === 413 ? 413 : 400, "BAD_JSON", "Request body must be valid JSON.");
  }
  const errors = validate(body || {});
  if (Object.keys(errors).length) {
    return send(res, 422, { error: { code: "VALIDATION_ERROR", message: "Some fields need fixing.", hint: null, fields: errors } });
  }
  send(res, 200, buildGarakConfig(body));
}
