# API.md

Base URL: `http://localhost:8000/api/v1` (local). All bodies are JSON unless stated. All endpoints except `/health` and `/auth/login` require `Authorization: Bearer <jwt>`.

**Privacy contract for every endpoint:** request bodies and responses are never logged, never written to disk, and never stored in the database. The only server-side state is the in-memory Shield index.

## 1. Conventions

- Errors: `{ "error": { "code": "STRING", "message": "Human readable", "hint": "How to fix" } }`
- Status codes: 200 OK, 201 created, 400 bad input, 401 not logged in, 403 role not allowed, 404 not found, 413 too large, 422 validation, 429 rate limited, 500 internal (no body details).
- Limits (env-configurable): `MG_MAX_RECORDS=500`, `MG_MAX_RECORD_TOKENS=256`, upload max 5 MB.
- Streaming uses newline-delimited JSON (NDJSON) over a POST response. Content type `application/x-ndjson`. Disable proxy buffering.

## 2. Endpoints

### GET /health
No auth. Response:
```json
{ "status": "ok", "models": { "target": true, "reference": true, "fixed": true }, "persistence": "disabled" }
```

### POST /auth/login
```json
{ "email": "auditor@demo.local", "password": "..." }
```
Response 200: `{ "access_token": "...", "token_type": "bearer", "expires_in": 1800, "role": "auditor" }`

### GET /auth/me
Response: `{ "email": "auditor@demo.local", "role": "auditor" }`

### POST /garak/config  (F1)
Builds a garak generator config and a command for the user's endpoint. Does not contact the endpoint and does not store the key.
```json
{
  "kind": "openai_compatible",
  "base_url": "http://localhost:11434/v1",
  "model_name": "my-finetune",
  "api_key_env": "TARGET_API_KEY"
}
```
Response:
```json
{
  "config_filename": "garak-target.json",
  "config": { "...": "generator options" },
  "command": "python -m garak --target_type openai --target_name my-finetune --generator_option_file garak-target.json --probes leakreplay",
  "notes": ["Flag names differ between garak versions. Run `python -m garak --help` and adjust.", "Set the key in your own shell. MemGuard does not receive it."]
}
```
The generated config is a template. It must be verified against the user's garak version.

### POST /garak/import  (F1)
`multipart/form-data` with `file` (report.jsonl or hitlog.jsonl). Response (aggregated, no prompts or outputs):
```json
{
  "garak_version": "0.13.2",
  "probes_total": 12,
  "probes_with_hits": 3,
  "rows": [
    { "probe": "leakreplay.LiteratureComplete", "detector": "leakreplay.StartsWith", "passed": 28, "total": 30, "pass_rate": 0.933 }
  ],
  "gap_map": [
    { "id": "L-G", "limitation": "Replays public text, not your private records", "module": "F2 Evidence Audit", "status": "COVERED" },
    { "id": "L-A", "limitation": "RAG and agent coverage is limited", "module": "None", "status": "OUT_OF_SCOPE" }
  ]
}
```
Errors: 422 `GARAK_PARSE_ERROR` with the first bad line number.

### POST /audits/run  (F2, F3, F7, F8)  streaming
Request:
```json
{
  "mode": "evidence",
  "target": "demo-A",
  "reference": "base",
  "records": ["Customer Riya, card 4532-8891-0021 ...", "..."],
  "canaries": ["sk-FAKE-93hd72...", "4532-8891-0021"],
  "holdout": ["clean record 1", "..."],
  "options": { "extraction_chain": false, "quick_mode": false, "max_new_tokens": 40 }
}
```
Notes: `target` and `reference` are labels resolved by the server from `MG_*` environment variables. Clients never send file paths. `holdout` are clean records the model never saw, used for calibration.

Stream events (one JSON per line):
```json
{ "event": "progress", "step": "scoring", "done": 120, "total": 500, "elapsed_ms": 18400 }
{ "event": "record", "index": 7, "score": 0.83, "flagged": true, "tokens": [{"t":"4532","d":2.1},{"t":"-8891","d":1.9}] }
{ "event": "calibration", "threshold": 0.41, "fpr": 0.05, "tpr": 0.85, "auc": 0.93, "canaries_found": 17, "canaries_total": 20 }
{ "event": "extraction", "probes": 40, "reproduced": 9, "canaries_extracted": 3 }
{ "event": "result", "risk": { "score": 78, "band": "CRITICAL", "ci": [70, 85], "components": { "M": 0.80, "E": 0.70, "P": 0.90 } }, "blind_spots": ["..."], "duration_ms": 91200 }
```
Errors: 400 `RECORDS_TOO_MANY`, 400 `MODEL_NOT_FOUND`, 413, 422.

### POST /shield/index  (F4)
```json
{ "name": "customer-chats", "records": ["..."], "protected_strings": ["4532-8891-0021"] }
```
Response: `{ "shield_id": "uuid", "record_count": 500, "ttl_seconds": 3600, "fingerprint": "ab12..." }`

### POST /shield/check  (F4)
```json
{ "shield_id": "uuid", "text": "Sure, the card number is 4532-8891-0021.", "mode": "mask" }
```
Response:
```json
{ "action": "masked", "text": "Sure, the card number is [REDACTED].", "reasons": ["protected_string"] }
```
`mode` is `block` or `mask`. Response never echoes the matched secret except inside the masked text the caller already sent.

### POST /shield/generate  (F4 demo)
Runs the chosen demo model and passes the reply through the Shield in one call so the UI can show raw versus guarded output side by side.
```json
{ "shield_id": "uuid", "model": "demo-A", "prompt": "Dear customer, your card number is", "mode": "mask" }
```
Response: `{ "raw": "...", "guarded": "...", "action": "masked" }`

### POST /compare  (F5)
Pure function over two audit results posted by the client.
```json
{ "before": { "risk": { "score": 78 } }, "after": { "risk": { "score": 21 } } }
```
Response: `{ "delta": -57, "before_band": "CRITICAL", "after_band": "MEDIUM", "improved": true }`

### POST /reports/pdf  (F6)
Body: the final `result` object plus run metadata. Response: `application/pdf` bytes generated in memory with header `X-MemGuard-Receipt-Id`. The PDF includes the Data Handling Receipt.

### DELETE /session
Wipes the caller's in-memory Shield indexes and returns a receipt:
```json
{ "receipt_id": "uuid", "wiped": { "shield_indexes": 1 }, "bytes_persisted": 0, "timestamp": "2026-11-14T10:00:00Z" }
```

## 3. Rate limits and security

- 30 requests per minute per user on non-streaming endpoints, 5 audit runs per hour per user (demo values, env-configurable).
- CORS: only `MG_ALLOWED_ORIGINS`.
- Reject uploads whose content type or extension is not expected.
- Target model API keys, if the optional endpoint mode is used, go in the `X-Target-Key` header, are held in a local variable for one request, and are never logged or stored.

## 4. Role access

| Endpoint | viewer | auditor | admin |
|----------|:------:|:-------:|:-----:|
| /garak/*, /audits/run, /shield/*, /reports/pdf, /compare | read-only demo outputs | yes | yes |
| /session (DELETE) | yes | yes | yes |
| User management (not in MVP) | no | no | yes |

See Auth.md for how roles are enforced.
