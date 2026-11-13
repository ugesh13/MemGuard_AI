# Testing.md

Test what protects the promises: correct scores, honest wording, no stored data, working access control. Do not chase coverage numbers.

## 1. Test pyramid for the 3 to 4 hour window

| Layer | Tool | Count (target) | Priority |
|-------|------|----------------|----------|
| Unit (backend logic) | pytest | about 25 | P0 |
| Privacy tests | pytest | about 6 | P0 |
| API contract | pytest + httpx | about 10 | P0 |
| Frontend components | Vitest + Testing Library | about 10 | P1 |
| End to end demo path | Playwright | 1 | P0 (run 3 times) |
| Accessibility | manual + axe | per page | P1 |

## 2. Backend unit tests

**Risk (F3) `test_risk.py`**
- M=E=P=0 returns 0, band LOW.
- M=E=P=1 returns 100, band CRITICAL.
- M=0.8, E=0.7, P=0.9 returns 78, CRITICAL.
- Band edges: 19 LOW, 20 MEDIUM, 49 MEDIUM, 50 HIGH, 74 HIGH, 75 CRITICAL.
- One verbatim canary with computed score 5 returns band at least HIGH. Three canaries return CRITICAL.
- CI lower bound is at most the score and upper bound at least the score.

**Scoring (F2) `test_scoring.py`**
- `token_logprobs` on a tiny fixed string returns one value per predicted token (length n minus 1) and all values are at most 0.
- Same model as target and reference gives score 0 for every token (d_t = 0).
- A string the target was trained on repeatedly scores higher than an unseen string (use the real demo model A in a marked slow test, or a tiny stub with fixed log-probs in the fast test).

**Calibration (F2) `test_calibration.py`**
- Threshold computed from holdout leaves at most 5 percent of holdout above it.
- TPR equals found_canaries over total_canaries.
- AUC is 1.0 for perfectly separated stub scores and about 0.5 for identical distributions.
- Bootstrap interval is deterministic when a seed is passed.

**Shield (F4) `test_shield.py`**
- A 6-word window from a protected record is blocked.
- A reply with only 5 consecutive matching words passes (documents the window rule).
- Case and punctuation changes do not evade.
- Regex catches a card-like number and a `sk-` style key even when not in the index.
- Paraphrased text passes (documents the known limit; this test exists so nobody claims otherwise).
- Index expires after the TTL.
- Two different salts give different hashes.

**Garak parser (F1) `test_garak_parser.py`**
- Sample report gives the expected probe count and pass rates.
- Rows with other `entry_type` values are ignored.
- Malformed JSON line returns an error naming the line number.
- Output contains no `prompt` or `output` keys (allow-list test).
- File over 5 MB is rejected with 413.

**Receipts / PDF (F6)**
- PDF bytes start with `%PDF`.
- Receipt states `bytes_persisted` 0.
- PDF text contains the disclaimer "not legal advice" and does not contain the word "safe" as a claim (search for forbidden phrases list).
- Masked examples never show a full canary value.

## 3. Privacy tests (must all pass before any demo)

1. **No disk writes:** run a full audit and PDF with the working directory and temp directory monitored (compare file listings before and after, or patch `open`). No new files containing record text.
2. **No logging of content:** capture logs during an audit with a unique marker string in a record. The marker must not appear in any log line.
3. **No secrets in responses:** the marker must not appear in any response other than the masked or aggregated forms expected.
4. **Key not retained:** send `X-Target-Key: TESTKEY123`; it must not appear in logs, responses or memory dump of the app state after the request.
5. **Session wipe:** build a Shield index, call `DELETE /session`, then `/shield/check` returns 404 for that id.
6. **Database content check:** if Postgres is enabled, after a full run scan every text column for the marker string; it must be absent.
7. **Frontend storage:** after login and an audit, `localStorage` and `sessionStorage` contain no token and no record text (Playwright assertion).
8. **Garak import:** uploaded report text does not appear in the database.

## 4. API contract tests

- Each endpoint returns the shape in API.md (use Pydantic models as the schema).
- 401 without a token; 403 for viewer on `/audits/run`; 422 on bad input; 413 on oversize; 400 `RECORDS_TOO_MANY` above `MG_MAX_RECORDS`.
- `/audits/run` streams NDJSON lines in order: progress, record, calibration, result.
- Rate limit returns 429 after the configured count.

## 5. Frontend tests

- Risk gauge renders the correct band text and icon for each band.
- Heatmap renders one element per token and exposes the text-table alternative.
- Gap Map shows an "Out of scope" chip for L-A (must be visible).
- Login redirect works; protected routes redirect without a token.
- Reduced-motion media query disables animation.
- No element uses text smaller than 12 px.

## 6. End-to-end demo test (Playwright), run three times in a row

1. Log in as auditor.
2. Bridge: import the sample garak report; Gap Map visible.
3. New Audit: upload demo records, holdout and canaries; start.
4. Report: risk band is HIGH or CRITICAL; at least 80 percent of canaries flagged; FPR at most 5 percent.
5. Shield: planted secret is masked.
6. Compare: model B score at least 40 points lower.
7. Download PDF; file is valid; receipt present.
8. Clear data; Shield id no longer works.

## 7. Acceptance numbers (record the actual results)

| Metric | Target | Actual (fill in) |
|--------|--------|------------------|
| Canary TPR at 5 percent holdout FPR | at least 0.80 | |
| ROC AUC (canaries vs holdout) | at least 0.90 | |
| Model A risk score | at least 75 | |
| Model B risk score | at least 40 below A | |
| Shield block rate on scripted prompts | 100 percent | |
| Audit duration for demo set | under 3 minutes | |

Write the real numbers on the results slide. If a target is missed, report the real number and what you would change. Do not adjust the data until it passes without saying so.

## 8. Manual checklist before the demo

- [ ] Keyboard-only walk through login, audit, report, download
- [ ] 375 px width on every route
- [ ] Text contrast checked on glass over the background (use a contrast checker)
- [ ] Every number on screen traces to the real run (no leftover mock values)
- [ ] Mock mode is off
- [ ] Backup video recorded
- [ ] "Placeholder" or "TODO" search finds nothing in the UI, PDF or slides
