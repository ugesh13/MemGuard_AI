import { test } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { sign, verify, canonical } from "../api/_lib/receipts.js";
import { validate, buildGarakConfig } from "../api/_lib/garak-config.js";
import receiptHandler from "../api/receipt.js";
import verifyHandler from "../api/verify-receipt.js";
import garakHandler from "../api/garak-config.js";
import healthHandler from "../api/health.js";

function mockReq(method, body, headers = {}) {
  const r = Readable.from(body === undefined ? [] : [Buffer.from(typeof body === "string" ? body : JSON.stringify(body))]);
  r.method = method; r.headers = { "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}`, ...headers };
  return r;
}
function mockRes() {
  const res = { statusCode: 200, headers: {}, body: "" };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.end = (b) => { res.body = b || ""; };
  res.json = () => JSON.parse(res.body);
  return res;
}

test("receipts: sign/verify round trip; tampering fails", () => {
  const r = { receipt_id: "x", risk_score: 50, bytes_persisted: 0 };
  const s = sign(r, "k");
  assert.ok(verify(r, s, "k"));
  assert.ok(!verify({ ...r, risk_score: 51 }, s, "k"));
  assert.ok(!verify(r, s, "other"));
  assert.ok(!verify(r, "zz", "k"));
});
test("receipts: canonical form ignores unknown fields", () => {
  assert.equal(canonical({ receipt_id: "a", evil: "<script>" }), canonical({ receipt_id: "a" }));
});

test("garak config: validation rejects secrets and bad urls", () => {
  const e = validate({ kind: "openai_compatible", base_url: "javascript:alert(1)", model_name: "m", api_key_env: "sk-real-key" });
  assert.ok(e.base_url && e.api_key_env);
});
test("garak config: REST config follows garak's RestGenerator fields", () => {
  const c = buildGarakConfig({ kind: "rest", base_url: "https://x.test/gen", api_key_env: "KEY", response_field: "$.out" });
  const g = c.config.rest.RestGenerator;
  assert.equal(g.req_template_json_object.prompt, "$INPUT");
  assert.equal(g.response_json_field, "$.out");
  assert.equal(g.headers.Authorization, "Bearer $KEY");
});

test("api/health returns ok", async () => {
  const res = mockRes();
  await healthHandler(mockReq("GET"), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().status, "ok");
});
test("api/garak-config: 422 with field errors, 200 when valid, 405 on GET", async () => {
  let res = mockRes();
  await garakHandler(mockReq("POST", { kind: "nope" }), res);
  assert.equal(res.statusCode, 422);
  assert.ok(res.json().error.fields.kind);
  res = mockRes();
  await garakHandler(mockReq("POST", { kind: "openai_compatible", base_url: "http://localhost:11434/v1", model_name: "m", api_key_env: "TARGET_API_KEY" }), res);
  assert.equal(res.statusCode, 200);
  assert.match(res.json().commands.modern, /garak/);
  res = mockRes();
  await garakHandler(mockReq("GET"), res);
  assert.equal(res.statusCode, 405);
});
test("api/garak-config: garbage JSON gives clean 400", async () => {
  const res = mockRes();
  await garakHandler(mockReq("POST", "{not json"), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().error.code, "BAD_JSON");
});

test("api/receipt: 503 without secret; signs and verifies with secret; rejects bad hash", async () => {
  delete process.env.RECEIPT_SIGNING_SECRET;
  let res = mockRes();
  await receiptHandler(mockReq("POST", {}), res);
  assert.equal(res.statusCode, 503);

  process.env.RECEIPT_SIGNING_SECRET = "test-secret";
  const good = { model_label: "Demo model A", source: "demo_lab", risk_score: 97, risk_band: "CRITICAL", records_processed: 471, report_sha256: "a".repeat(64), records: ["SHOULD NOT BE ECHOED"] };
  res = mockRes();
  await receiptHandler(mockReq("POST", good), res);
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.receipt.bytes_persisted, 0);
  assert.equal(body.receipt.subject, "guest-session");
  assert.ok(!res.body.includes("SHOULD NOT BE ECHOED"));

  const vres = mockRes();
  await verifyHandler(mockReq("POST", { receipt: body.receipt, signature: body.signature }), vres);
  assert.equal(vres.json().valid, true);
  const tampered = mockRes();
  await verifyHandler(mockReq("POST", { receipt: { ...body.receipt, risk_score: 5 }, signature: body.signature }), tampered);
  assert.equal(tampered.json().valid, false);

  res = mockRes();
  await receiptHandler(mockReq("POST", { ...good, report_sha256: "nothex" }), res);
  assert.equal(res.statusCode, 422);
});

test("api: rate limit returns 429 with Retry-After", async () => {
  let last;
  for (let i = 0; i < 35; i++) {
    last = mockRes();
    await garakHandler(mockReq("POST", { kind: "x" }, { "x-forwarded-for": "9.9.9.9" }), last);
  }
  assert.equal(last.statusCode, 429);
  assert.ok(Number(last.headers["retry-after"]) > 0);
});
