# Architecture (as built)

```mermaid
flowchart LR
  subgraph Customer machine
    G[garak scan] -->|report.jsonl| B
    E[memguard_engine.py<br/>target + reference LM] -->|memguard-scores.json| B
  end
  subgraph Browser tab (memory only)
    B[MemGuard SPA] --> AU[Audit + calibration + risk]
    AU --> SH[Shield HMAC index]
    AU --> PDF[Evidence pack PDF]
  end
  B -->|config, garak command| V[Vercel functions]
  PDF -->|score, band, count, SHA-256| V
  V -->|signed receipt| PDF
  B -->|email / Google sign-in| SA[Supabase Auth]
  B -->|scores-only rows, RLS| DB[(Supabase Postgres)]
```

## Decisions

| Decision | Why | Trade-off |
|---|---|---|
| Audit runs in the browser | Records and model output never reach our servers, so the privacy promise is simple to state and verify | Large files are limited by browser memory (we cap engine files at 25 MB) |
| Real models are scored by a local Python engine | Evidence mode needs token log-probabilities from both models; chat APIs don't expose them | The customer runs one script |
| In-browser n-gram demo model | Gives a live, honest, instant demo with no GPU | Much cleaner signal than a real LLM; labelled everywhere as demo |
| Vanilla ES modules, no build step | Zero dependencies to break on demo day; strict CSP is easy | More manual DOM code |
| Supabase for auth and metadata | Managed auth with Google OAuth and RLS, free tier | Session token kept in memory only, so a refresh signs you out (by design) |
| Server-signed receipts (HMAC) | A third party can verify a receipt wasn't edited | Proves origin, not what the browser did; we state that |
| Holdout split for calibration | The FPR is measured on records not used to set the threshold | Needs 20+ holdout records |

## API (Vercel functions)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Status and which components are configured |
| GET | `/api/config` | Public runtime config (Supabase URL and anon key, OAuth flags) |
| POST | `/api/garak-config` | Validates input, returns a garak generator config and commands (both flag styles) |
| POST | `/api/receipt` | Signs a Data Handling Receipt from an allow-listed set of metadata fields |
| POST | `/api/verify-receipt` | Verifies a receipt's HMAC signature (constant-time compare) |

Errors use one format: `{ "error": { "code", "message", "hint", "fields?" } }`. A best-effort per-instance rate limit returns 429 with `Retry-After`. On serverless it's a speed bump, not a guarantee.

## Data model (Supabase)

`profiles` (role), `audit_runs` (scores and counts), `receipts` (SHA-256 and signature, `bytes_persisted` CHECK = 0), `garak_imports` (probe, detector, passed and total only, enforced by a CHECK function), `audit_log` (action names). RLS is on for every table; users read and delete only their own rows; there are no update policies.
