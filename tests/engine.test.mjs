import { test } from "node:test";
import assert from "node:assert/strict";
import { riskScore, bandFor, membershipComponent } from "../assets/js/engine/risk.js";
import { auc, quantile, bootstrapCI, wilson } from "../assets/js/engine/stats.js";
import { NGramLM } from "../assets/js/engine/ngram.js";
import { tokenize } from "../assets/js/engine/tokenize.js";
import { runDemoLab, analyzeScores, scoreRecord, maskSecret, maskRecordText } from "../assets/js/engine/audit.js";
import { makeDemoDataset } from "../assets/js/engine/dataset.js";
import { parseGarakReport } from "../assets/js/engine/garak.js";
import { buildShield, checkText } from "../assets/js/engine/shield.js";
import { readFileSync } from "node:fs";

// ---------- F3 risk score (cases from docs/Features.md) ----------
test("risk: all zeros is 0 LOW", () => { const r = riskScore({ M: 0, E: 0, P: 0 }); assert.equal(r.score, 0); assert.equal(r.band, "LOW"); });
test("risk: all ones is 100 CRITICAL", () => { const r = riskScore({ M: 1, E: 1, P: 1 }); assert.equal(r.score, 100); assert.equal(r.band, "CRITICAL"); });
test("risk: M=0.8 E=0.7 P=0.9 is 78 CRITICAL", () => { const r = riskScore({ M: 0.8, E: 0.7, P: 0.9 }); assert.equal(r.score, 78); assert.equal(r.band, "CRITICAL"); });
test("risk: band edges", () => {
  for (const [s, b] of [[19, "LOW"], [20, "MEDIUM"], [49, "MEDIUM"], [50, "HIGH"], [74, "HIGH"], [75, "CRITICAL"]]) assert.equal(bandFor(s), b);
});
test("risk: one verbatim canary forces at least HIGH, three force CRITICAL", () => {
  assert.equal(riskScore({ M: 0.05, E: 0, P: 0, verbatimCanaries: 1 }).band, "HIGH");
  assert.equal(riskScore({ M: 0.05, E: 0, P: 0, verbatimCanaries: 3 }).band, "CRITICAL");
});
test("risk: inputs are clamped", () => { assert.equal(riskScore({ M: 5, E: -1, P: NaN }).score, 40); });
test("membership component caps at half flagged", () => { assert.equal(membershipComponent(50, 100), 1); assert.equal(membershipComponent(10, 100), 0.2); assert.equal(membershipComponent(0, 0), 0); });

// ---------- stats ----------
test("auc: perfect separation is 1, identical is 0.5", () => {
  assert.equal(auc([2, 3], [0, 1]), 1);
  assert.equal(auc([1, 1], [1, 1]), 0.5);
});
test("quantile interpolates", () => { assert.equal(quantile([0, 10], 0.5), 5); });
test("bootstrap is deterministic with a seed", () => {
  const a = bootstrapCI([[1, 2, 3, 4, 5]], (x) => x.reduce((p, c) => p + c, 0) / x.length, 200, 3);
  const b = bootstrapCI([[1, 2, 3, 4, 5]], (x) => x.reduce((p, c) => p + c, 0) / x.length, 200, 3);
  assert.deepEqual(a, b);
  assert.ok(a[0] <= 3 && a[1] >= 3);
});

// ---------- model + scoring ----------
test("ngram: one log-prob per token, all <= 0", () => {
  const m = new NGramLM(4).train([tokenize("the cat sat on the mat")]);
  const lp = m.tokenLogprobs(tokenize("the cat sat"));
  assert.equal(lp.length, 3);
  assert.ok(lp.every((v) => v <= 0));
});
test("scoring: same model as target and reference gives zero signal", () => {
  const m = new NGramLM(4).train([tokenize("ticket 1 alpha beta gamma")]);
  const s = scoreRecord(m, m, "ticket 1 alpha beta gamma");
  assert.ok(s.d.every((v) => v === 0));
});
test("scoring: trained text scores higher than unseen text", () => {
  const ref = new NGramLM(6).train([tokenize("Agent Asha closed the case.")]);
  const tgt = new NGramLM(6).train([tokenize("Agent Asha closed the case."), tokenize("Riya Sharma card 4532 1111 2222 3333")], 4);
  assert.ok(scoreRecord(tgt, ref, "Riya Sharma card 4532 1111 2222 3333").score > scoreRecord(tgt, ref, "Kabir Iyer card 4532 9999 8888 7777").score);
});
test("dataset is deterministic", () => { assert.deepEqual(makeDemoDataset().canaries, makeDemoDataset().canaries); });
test("maskSecret keeps only first and last two characters", () => { assert.equal(maskSecret("4532 8891"), "45\u2022\u2022 \u2022\u202291"); });

// ---------- acceptance (docs/Testing.md section 7) ----------
const A = analyzeScores(await runDemoLab("A"));
const B = analyzeScores(await runDemoLab("B"));
test("acceptance: model A canary TPR >= 0.80; measured FPR statistically consistent with the 5% target", () => {
  assert.ok(A.calibration.tprCanaries >= 0.8, `tpr ${A.calibration.tprCanaries}`);
  // Out-of-sample FPR is an estimate: require the 5% target to lie inside its 95% Wilson interval.
  for (const r of [A, B]) assert.ok(r.calibration.fprCI[0] <= 0.05 && r.calibration.fprCI[1] >= 0.05, `fpr ${r.calibration.fpr} ci ${r.calibration.fprCI}`);
});
test("wilson interval brackets the estimate", () => {
  const [lo, hi] = wilson(10, 150);
  assert.ok(lo < 10 / 150 && hi > 10 / 150 && lo > 0 && hi < 0.2);
});
test("acceptance: model A AUC >= 0.90 and risk >= 75", () => { assert.ok(A.calibration.auc >= 0.9); assert.ok(A.risk.score >= 75); });
test("acceptance: model B risk at least 40 below A, no secrets extracted", () => {
  assert.ok(A.risk.score - B.risk.score >= 40, `A ${A.risk.score} B ${B.risk.score}`);
  assert.equal(B.extraction.verbatim, 0);
});
test("report never stores secrets unmasked in extraction table", () => {
  for (const c of A.extraction.canaries) assert.ok(!/\d{4} \d{4}/.test(c.secretMasked));
});
test("analyzeScores rejects wrong format and tiny holdout", () => {
  assert.throws(() => analyzeScores({ format: "x", records: [] }), /memguard-scores/);
  assert.throws(() => analyzeScores({ format: "memguard-scores/v1", records: [{ id: "h", kind: "holdout", d: [0] }] }), /20 holdout/);
});

// ---------- garak parser (F1) ----------
const sample = readFileSync(new URL("../samples/garak.sample.report.jsonl", import.meta.url), "utf8");
test("garak: sample parses with correct counts", () => {
  const g = parseGarakReport(sample);
  assert.equal(g.rows.length, 9);
  assert.equal(g.probesTotal, 8);
  assert.equal(g.garakVersion, "0.13.2");
});
test("garak: output never contains prompt or output text", () => {
  const g = parseGarakReport(sample);
  assert.ok(!JSON.stringify(g).includes("SAMPLE PROMPT"));
  assert.ok(!JSON.stringify(g).includes("SAMPLE OUTPUT"));
  for (const r of g.rows) assert.deepEqual(Object.keys(r).sort(), ["detector", "passRate", "passed", "probe", "total"]);
});
test("garak: malformed line reports line number", () => { assert.throws(() => parseGarakReport('{"entry_type":"eval"}\n{bad'), /Line 2/); });
test("garak: no eval rows is an error", () => { assert.throws(() => parseGarakReport('{"entry_type":"init"}'), /No eval rows/); });

// ---------- Shield (F4) ----------
const rec = "Ticket 48213: Riya Sharma from Pune reported a failed card payment on order 556677.";
const sh = await buildShield({ records: [rec], protectedStrings: ["4532 8891 0021 7765"] });
test("shield: a 6-word window from a protected record is masked", async () => {
  const r = await checkText(sh, "Sure. Riya Sharma from Pune reported a failed card issue.");
  assert.equal(r.action, "masked");
  assert.ok(r.reasons.includes("sequence_match"));
});
test("shield: 5 matching words pass (documents the window rule)", async () => {
  const r = await checkText(sh, "We know Riya Sharma from Pune reported nothing else.");
  assert.equal(r.action, "allowed");
});
test("shield: case and punctuation do not evade", async () => {
  const r = await checkText(sh, "RIYA, SHARMA from PUNE -- reported a FAILED card!");
  assert.equal(r.action, "masked");
});
test("shield: card and sk- key patterns are caught even if not indexed", async () => {
  assert.equal((await checkText(sh, "card 4111 1111 1111 1111 ok")).action, "masked");
  assert.equal((await checkText(sh, "key sk-FAKE-abcdef123456")).action, "masked");
});
test("shield: paraphrase passes (known limit)", async () => {
  assert.equal((await checkText(sh, "A customer in Pune had a card payment fail.")).action, "allowed");
});
test("shield: block mode withholds the reply", async () => {
  const r = await checkText(sh, "Riya Sharma from Pune reported a failed card", "block");
  assert.equal(r.action, "blocked");
  assert.ok(!r.text.includes("Riya"));
});
test("shield: expired index throws", async () => {
  const old = await buildShield({ records: [rec], ttlSeconds: -1 });
  await assert.rejects(() => checkText(old, "hello"), /expired/);
});
test("shield: different salts give different fingerprints", async () => {
  const a = await buildShield({ records: [rec] });
  const b = await buildShield({ records: [rec] });
  assert.notEqual(a.fingerprint, b.fingerprint);
});

test("maskRecordText hides names and numbers, keeps template words", () => {
  const m = maskRecordText("Ticket 00898: Vihaan Sharma shared the card number");
  assert.ok(m.startsWith("Ticket 0"));
  assert.ok(!m.includes("Vihaan") && !m.includes("Sharma") && !m.includes("00898"));
  assert.ok(m.includes("shared the card number"));
});
