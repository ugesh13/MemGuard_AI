# MemGuard AI

**Run garak first. Then close the gaps.**

MemGuard AI is a web app for teams that fine-tune LLMs on private data. NVIDIA's garak scans a model for *known* weaknesses. MemGuard picks up where a garak report stops. It proves **which of your own records** a fine-tuned model memorized, blocks those leaks at runtime, and shows whether a fix worked. Your records and model output never leave your browser.

Team Technova (Ugesh Kumar, Aman Raj, Riya Sharma) · Colossus 3.0, Cybersecurity, PS16

---

## What it does

| Step | Page | What happens | Where it runs |
|---|---|---|---|
| 1 | **Garak Bridge** | Generates the garak config and command for your endpoint (server), imports garak's `report.jsonl` and shows the Gap Map | Command: Vercel function. Report parsing: your browser |
| 2 | **Evidence audit** | Scores every record for memorization: per-token log-prob gain of the fine-tuned model over a reference model, calibrated on records the model never saw, plus extraction probes for planted secrets | Your browser |
| 2b | **Report** | Risk score 0–100 with a bootstrap 95% CI, calibration (FPR, TPR, AUC), score distribution, masked record list, token heatmap, extraction table, blind spots | Your browser |
| 2c | **Evidence pack** | PDF with the summary and a **server-signed Data Handling Receipt** (HMAC-SHA256). `summary.json` and `receipt.json` are embedded in the PDF | PDF: browser. Signature: Vercel function |
| 3 | **Shield** | Runtime guard: salted HMAC hashes of every 6-word window of protected records, plus secret patterns. Masks or blocks leaking replies | Your browser |
| 4 | **Fix & verify** | Compares the model before and after the fix, side by side | Your browser |
| | **History** | Scores-only log of past runs and receipts | Supabase (Row Level Security) |
| | **Verify** | Checks any receipt's signature | Vercel function |

**Two audit modes**
- **Live demo lab:** trains two small 8-gram models in the browser on synthetic "NovaPay" support tickets. Model A is the leaky fine-tune: secrets left in, 4 epochs. Model B is the fixed one: secrets removed, 1 epoch. The computation is real; the model is a toy.
- **Real model:** `engine/memguard_engine.py` runs your fine-tuned model and a reference model on *your* machine and writes `memguard-scores.json`. The website builds the same report from that file, in the browser.

## How it complements garak (it doesn't replace it)

| garak limitation | MemGuard | Status |
|---|---|---|
| leakreplay checks public text, not your private records | Record-level evidence audit on your data | Covered |
| Detector hits need human review; many separate pass rates | Calibrated threshold at 5% FPR, one risk score with CI | Covered |
| Scanner only: no runtime guard, no proof a fix worked | Shield + Fix & verify | Covered (memorization only) |
| A clean scan ≠ safe | Every report lists its blind spots and never says "safe" | Partial |
| Mostly single-turn | Prefix extraction probes | Partial (memorization only) |
| Full scans can take hours | Focused audit with measured run time | Partial |
| RAG and agent attacks | Not covered. Use promptfoo or PyRIT | Out of scope |

Sources are listed on the Method page and in `docs/planning/PRD.md`.

## Measured results (demo lab, synthetic data)

These numbers come from `npm test`. They are deterministic for the built-in seed.

| | Model A (leaky) | Model B (fixed) |
|---|---|---|
| Risk score | **91 CRITICAL** (95% CI 85–98) | **40 MEDIUM** |
| Planted secrets reproduced word for word | 18 / 21 | 0 / 21 |
| False-positive rate on 150 unseen holdout records (target 5%) | 6.7% (10/150) | 5.3% (8/150) |
| Planted secrets above threshold (TPR) | 100% | 0% |
| Training records above threshold | 300 / 300 | 300 / 300 |

The false-positive rate is measured out-of-sample, so it moves around the 5% target. 6.7% is within its 95% interval. Model B still flags every training record: removing the secrets stopped extraction, but the model still remembers its training data in general. The report says so.

The demo model is a small n-gram model, so its signal is far cleaner than a real LLM's. Do not quote these numbers as accuracy on real models. Run the engine on a real fine-tune for those.

## Stack

- **Frontend:** a vanilla ES-module single-page app (no build step), with a custom design system: alabaster, glass and a liquid-glass navbar, per `docs/planning/Design.md`. Inter is self-hosted. pdf-lib (MIT) generates the PDF.
- **Backend:** Vercel Node functions in `api/`: `health`, `config`, `garak-config`, `receipt`, `verify-receipt`. No dependencies.
- **Database and auth:** Supabase. Email/password and Google OAuth through Supabase Auth; Postgres holds metadata only, with Row Level Security (`supabase/migrations/`).
- **Real-model engine:** Python, PyTorch and Transformers (`engine/`).

## Run locally

```bash
node -v                      # 20+
RECEIPT_SIGNING_SECRET=dev-secret npm run dev   # http://localhost:5173
npm test                     # 43 unit + API tests
PLAYWRIGHT_BROWSERS_PATH=... npm run test:e2e   # 25 browser checks + screenshots (needs Playwright)
```

No `npm install` is needed. Without Supabase variables, sign-in shows "not connected" and the guest demo works fully.

Deploying, connecting Supabase and enabling Google sign-in: **[docs/SETUP_AND_DEPLOY.md](docs/SETUP_AND_DEPLOY.md)**.

## Privacy model

- Records, scores, heatmaps, the Shield index and the PDF exist only in the browser tab's memory. The app never touches `localStorage`, `sessionStorage`, cookies or IndexedDB (an end-to-end test checks this).
- The server receives only the risk score, band, record count and a SHA-256, to sign the receipt.
- The database schema has no column that can hold record text. `bytes_persisted` is constrained to `0`.
- A strict CSP forbids inline scripts, inline styles and third-party scripts. All untrusted text is escaped.

## Honest limits

- Evidence mode needs token probabilities, so the real-model engine runs where the model is.
- Reference-based membership signals are reported to be much weaker on LoRA fine-tunes.
- The Shield cannot catch paraphrased leaks.
- The risk weights (0.4 / 0.4 / 0.2) are design choices, not validated science.
- Reports are evidence for a review, not a certificate and not legal advice.
- `engine/memguard_engine.py` was syntax-checked but **not run** in the build environment (no PyTorch there). Test it on your machine before the demo.

## Repository map

```
index.html                 SPA shell
assets/css/app.css         design system
assets/js/app.js           routes, navbar, boot
assets/js/core/            dom/escaping, store (memory only), api client, auth (Supabase), router, pdf
assets/js/engine/          n-gram model, dataset, audit + calibration, risk, stats, shield, garak parser
assets/js/views/           login, dashboard, bridge, audit, report, shield, compare, history, method, privacy, verify, settings
api/                       Vercel functions (+ _lib helpers)
supabase/migrations/       schema + RLS
engine/                    Python engine for real models + GPT-2 demo fine-tuning
samples/                   synthetic demo data + labelled sample garak report
tests/                     unit, API and end-to-end tests
docs/                      setup/deploy, architecture, demo script, planning docs
```
