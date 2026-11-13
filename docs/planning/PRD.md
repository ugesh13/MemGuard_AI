# PRD: MemGuard AI — the layer you run after garak

Version 1.0 | Last verified: 2026-11-14 | Team Technova | Build window: 3 to 4 hours (Round 3)

## 1. One-line summary

garak scans a model for known weaknesses. MemGuard AI picks up where a garak scan stops: it proves which of your private records a fine-tuned model memorized, blocks those leaks at runtime, shows whether a fix worked, and produces an evidence report. Nothing the user uploads is stored.

Tagline: **Run garak first. Then close the gaps.**

## 2. Problem

Companies fine-tune LLMs on private data (customer chats, internal code, records). Those models can reproduce training data word for word. A broad scanner can tell a team "the model failed some probes". It does not tell them which of their own records leaked, it does not stop the leak in production, and it does not show that a fix worked.

## 3. Why "garak first, then MemGuard" (gap analysis)

MemGuard is a **complement**, never a replacement. Every limitation below is backed by a source. Do not claim anything that is not in this table.

| ID | garak limitation (source-backed) | Source | MemGuard module | Status in 3 to 4 h |
|----|----------------------------------|--------|-----------------|--------------------|
| L-A | Tests model endpoints, not whole applications. RAG pipeline coverage is limited to a few indirect-injection cases. Agent testing is limited. | AppSec Santa comparison; Rubin Lake tech radar | None | OUT OF SCOPE. Roadmap. Say: use promptfoo or PyRIT for that. |
| L-B | Most probes are single-turn; multi-turn attacks are poorly covered. | QAwerk red-teaming tools comparison | F7 Extraction chain | STRETCH. Covers memorization extraction only, not general multi-turn attacks. |
| L-C | Detectors use keywords or classifiers; hits need human review. | Rubin Lake tech radar | F2 Evidence audit + F3 Risk score | COVERED for memorization only. Does not replace garak's jailbreak detectors. |
| L-D | Probes are static; a clean scan means known patterns failed, not that the model is safe. | NeMo Guardrails scanning docs; QAwerk | F2 report always lists blind spots; wording is never "safe" | COVERED as reporting honesty. We do not claim to find unknown exploits. |
| L-E | It is a scanner. It does not remediate and does not guard a live endpoint. | garak project description ("checks if an LLM can be made to fail") | F4 Shield + F5 Fix-and-Verify | COVERED for memorization leaks only. General guardrails already exist (for example NeMo Guardrails). |
| L-F | Full scans can take hours. | Red Hat Developer garak tutorial; StationX garak tutorial | F8 Quick mode with measured timing | STRETCH. Only claim a number we measured. |
| L-G | leakreplay probes replay public text excerpts. They do not check a company's own private records. | AVID / garak leakreplay probe listings (our reading) | F2 Evidence audit on the company's own records | COVERED. This is our main differentiator. |

Not used as claims because we could not verify them: "scores drift over time", "scores are not normalized", "scans take days", "37% detector error rate".

## 4. Users and jobs to be done

| User | Job | Pain today |
|------|-----|------------|
| ML engineer | "Did my fine-tune memorize customer data?" | Runs garak, gets pass/fail rates, no record-level answer |
| Security / AppSec lead | "Prove to my CISO the model is not leaking secrets" | A "pass" is not evidence |
| DPO / compliance | "Give me documentation for a regulator" | No evidence pack |

Workflow we sell: (1) run garak, (2) upload the garak report to MemGuard, (3) run the memorization evidence audit, (4) apply a fix or the Shield, (5) re-audit, (6) download the evidence pack.

## 5. Scope

### Must have (the 3 to 4 hour build)
- F1 Garak Bridge: generate a garak config for the user's endpoint, import a garak report, show the Gap Map.
- F2 Evidence Audit: record-level memorization score, token heatmap, canary calibration.
- F3 Risk Score: normalized 0 to 100 score with band and confidence interval.
- F4 Shield: runtime output guard based on hashed word sequences and secret patterns.
- F5 Fix-and-Verify: before and after comparison of two models.
- F6 Evidence Pack: PDF report plus Data Handling Receipt.

### Stretch (only if everything above passes its tests)
- F7 Extraction chain (iterative prefix extension).
- F8 Quick mode with measured timing.
- MCP server wrapper (see MCP.md).

### Out of scope (say so honestly)
RAG and agent indirect prompt injection, brand-new exploit discovery, hallucination or truth checking, multi-tenant billing, production-scale models above a few billion parameters.

## 6. Core user flow

1. Login (demo account) and land on the Dashboard.
2. Garak Bridge: enter endpoint, copy the generated garak command, run garak, upload the report, see the Gap Map.
3. New Audit: pick the target model and reference model, upload candidate records (and optional planted canaries).
4. Audit Run: live progress, then the Evidence Report with heatmap and risk score.
5. Shield: build a protected index from the same records, test a prompt, see it blocked.
6. Compare: audit the fixed model, see the score drop.
7. Download the Evidence Pack PDF. Clear session data and receive a deletion receipt.

## 7. Functional requirements

| ID | Requirement | Pass condition |
|----|-------------|----------------|
| FR-1 | Parse a garak report.jsonl and hit log | Sample report yields correct probe count and pass rates |
| FR-2 | Score every uploaded record against target and reference models | Planted canaries rank in the top 10 percent of scores in the demo |
| FR-3 | Show token-level heatmap for any record | Highest-scoring tokens are visibly highlighted |
| FR-4 | Compute risk score, band and 95 percent confidence interval | Formula in Features.md reproduced by unit test |
| FR-5 | Shield blocks replies containing protected sequences | Planted secret is blocked or masked in the demo |
| FR-6 | Compare two audit results | Delta view shows before, after, and change |
| FR-7 | Generate PDF in memory | No file written to disk (privacy test) |
| FR-8 | Data Handling Receipt in every PDF | States what was and was not retained |
| FR-9 | Clear session data and return a receipt | In-memory stores are empty afterwards |

## 8. Non-functional requirements

- **Privacy:** no uploaded record, model output or API key is written to disk, database or logs. Database holds metadata only (see Database.md).
- **Honesty:** the UI and PDF never say "safe". They say "no leak found by these tests" and list blind spots.
- **Performance:** report the measured audit time. Target: demo audit under 3 minutes on a laptop CPU. Adjust after measuring.
- **Accessibility:** contrast AA, keyboard reachable, reduced-motion respected.

## 9. Success metrics (demo acceptance)

- Model A (leaky): risk band HIGH or CRITICAL, at least 80 percent of planted canaries flagged at 5 percent false positive rate on the clean holdout.
- Model B (fixed): risk score at least 40 points lower than model A.
- Shield on model A: 100 percent of planted canaries blocked or masked in the scripted demo prompts.
- Full demo path runs without error three times in a row.

These numbers are targets for our own test data. They are not general accuracy claims.

## 10. Business model (hypothesis, not validated)

| Plan | Who | Hypothesis |
|------|-----|------------|
| Per audit | Teams auditing one model before launch | Pay once per audit |
| Subscription | Teams that fine-tune often | Re-audit on every new fine-tune |
| On-prem | Banks, hospitals, law firms | Self-hosted because the audit needs model access and private data |

First customers to test with: fintech, healthcare and legal teams that fine-tune models on private data. No customer has been interviewed yet.

## 11. Risks and honest limits

1. Real models give weaker membership signals than an overfit demo model. EZ-MIA authors report detection can differ sharply by fine-tuning method (for example full fine-tuning versus LoRA), so the demo uses full fine-tuning.
2. Gray-box scoring needs the target and a reference model. A customer must run MemGuard on their own machine.
3. The Shield cannot stop paraphrased leaks.
4. Risk weights are design choices, not scientifically validated.
5. memaudit (open source) and ML Privacy Meter already exist in the broader space. Never say "nobody does this".

## 12. Likely judge questions

- "Why not just garak?" garak finds known weaknesses. We show which of your records leaked, block them, and prove the fix. Run both.
- "Do you replace garak?" No. We complement it and import its report.
- "Is your detector perfect?" No. Numbers are from our test set. Reports list blind spots.
- "What about RAG and agents?" Out of scope here. Use promptfoo or PyRIT for that.
- "Where is data stored?" Nowhere. In-memory only. Metadata-only database.

## 13. Sources

- garak reporting: https://reference.garak.ai/en/stable/reporting.html
- garak REST generator: https://reference.garak.ai/en/stable/generators/rest.html
- AppSec Santa, garak vs promptfoo: https://appsecsanta.com/ai-security-tools/garak-vs-promptfoo
- Rubin Lake technology radar, garak: https://rubinlake.com/es/technology-radar/ai-security-and-governance/garak
- QAwerk, red teaming tools compared: https://qawerk.com/blog/llm-red-teaming-tools/
- NeMo Guardrails, vulnerability scanning: https://mintlify.com/NVIDIA-NeMo/Guardrails/evaluation/vulnerability-scanning
- EZ-MIA (ACL 2026): https://arxiv.org/html/2601.12104
- EDPB opinion summary (IAPP): https://iapp.org/news/a/edpb-weighs-in-on-key-questions-on-personal-data-in-ai-models
- DPDP penalties (up to Rs 250 crore applies to the security-safeguards duty, section 8(5)): https://www.konfirmity.com/blog/dpdp-penalties
- memaudit: https://discuss.huggingface.co/t/open-source-memorization-privacy-auditor-for-trainer-trl-fine-tunes-canary-mia-regurgitation-testing-with-a-real-case-study/179370
- ML Privacy Meter: https://arxiv.org/pdf/2007.09339
