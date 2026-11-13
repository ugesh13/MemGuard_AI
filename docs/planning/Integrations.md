# Integrations.md

What MemGuard connects to, how, and what it must never do with each. Everything here is either P0 for the demo or marked optional.

## 1. garak (core, P0)

**Relationship:** upstream scanner. MemGuard never wraps, forks or re-implements it.

| Direction | Mechanism | Detail |
|-----------|-----------|--------|
| MemGuard to garak | Generated config and command | `POST /garak/config` returns a generator option file and a command for the user to run themselves |
| garak to MemGuard | Report import | User uploads `*.report.jsonl` to `POST /garak/import` |

Facts the parser relies on (verify against your garak version):
- The report is JSON Lines. Each line has an `entry_type`. Rows with `eval` carry `probe`, `detector`, `passed`, `total_evaluated`.
- Hit logs carry `goal`, `prompt`, `output`, `triggers`, `score`, `probe`, `detector`, `generator`. MemGuard reads counts only.
- Targets can be a REST endpoint (`rest.RestGenerator` with `uri`, `method`, `headers`, `req_template_json_object` using `$INPUT`, `response_json`, `response_json_field`) or an OpenAI-compatible server through a generator option file.
- Flag names differ by version (`--target_type` or `--model_type`). The UI always shows "check `--help`".

Compatibility rule: if the file has an unknown shape, show a parse error with the line number. Do not guess.

## 2. Model sources (P0)

| Source | Use | Notes |
|--------|-----|-------|
| Local Hugging Face model folder | Target, fixed and reference models for Evidence mode | Loaded with Transformers. Paths come from `MG_*_PATH`, never from the client |
| Hugging Face Hub | One-time download of base `gpt2` | Downloading logs your IP on their side; do it during pre-work |
| OpenAI-compatible endpoint (Ollama, vLLM, hosted APIs) | Extraction mode and the Shield demo generation | Key via `X-Target-Key` for one request only |

Limit to state clearly: Evidence mode needs token probabilities of both models, which plain chat APIs do not give. That is why Evidence mode runs against local models.

## 3. Frontend hosting (optional)

- Vercel for the Next.js app. Environment variable `NEXT_PUBLIC_API_URL` points to the API.
- Hosting providers keep their own request logs. Our frontend keeps record text out of URLs and headers so none of it lands there.

## 4. Backend hosting (optional)

- Default: laptop plus a tunnel, because PyTorch and models are large.
- If using a cloud host, check memory and disk limits first and write the real limits down. Do not assume a free tier fits.

## 5. Database (optional)

PostgreSQL for metadata only (Database.md). Any managed free Postgres works. If it is down the API keeps working with `"persistence": "disabled"`.

## 6. Tools that cover what we do not (reference only, not integrated)

| Need | Tool | How we mention it |
|------|------|-------------------|
| RAG and application-level red teaming | promptfoo | "Use promptfoo for app-level and RAG tests" |
| Adaptive multi-turn attacks | PyRIT (Microsoft) | "Use PyRIT for adaptive multi-turn attacks" |
| Runtime guardrails in general | NeMo Guardrails | "Our Shield only targets memorization leaks; use a full guardrail layer for everything else" |
| Other membership-inference work | memaudit, ML Privacy Meter, Fast-MIA | Cite as related work; never claim we are the only tool |

## 7. CI (stretch, P1)

A GitHub Actions job can run the same checks without a UI:
1. Run garak against a staging endpoint.
2. Call MemGuard's scoring on a test set.
3. Fail the job when the risk band is HIGH or CRITICAL.

Keep the job secret-safe: keys come from repository secrets, nothing printed to the log, no artifacts that contain record text. Mark as roadmap unless built.

## 8. Reporting and compliance mapping

The PDF may mention that documentation of extraction testing can support a data-protection assessment. Keep wording to what sources say:
- The EDPB's December 2024 opinion says a model trained on personal data is not always anonymous, and that anonymity needs evidence that personal data cannot be extracted; documentation is a key part.
- India's DPDP Act penalties include up to Rs 250 crore for failing to maintain reasonable security safeguards.

Frame the pack as **supporting evidence**, not a certificate or legal advice. Add a line "This report is not legal advice."

## 9. Integration checklist

- [ ] garak sample report imported
- [ ] Generated garak command checked against the installed version
- [ ] All three demo models load from paths in `.env`
- [ ] Endpoint mode tested once with a local OpenAI-compatible server (optional)
- [ ] Hosted frontend reaches the API with correct CORS
