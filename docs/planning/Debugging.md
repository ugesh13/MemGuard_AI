# Debugging.md

Fast fixes for the problems most likely to hit during a 3 to 4 hour build. Rule: reproduce first, change one thing at a time, and never debug by printing record text.

## 1. Quick triage order

1. Is the API up? `GET /api/v1/health`.
2. Does the browser Network tab show the request and its status?
3. Read the API terminal for the error line (it contains no record text by design).
4. Run the failing backend function from a pytest or Python shell with a tiny input.
5. Only then change code.

## 2. Backend and ML problems

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `/health` shows a model as false | Wrong path in `.env` or model folder incomplete | Check `MG_*_PATH`; folder must hold config, weights and tokenizer files |
| Model load takes minutes or runs out of memory | Loading in float32 on a small machine, or loading on every request | Load once at startup and cache; use `distilgpt2`; close other apps |
| All token scores near 0 | Target and reference are the same weights, or tokenizers differ | Confirm A is the fine-tuned folder and the reference is the base; use the same tokenizer |
| Canaries do not rank high | Model A did not memorize | Train more epochs, more repetitions of the canary, full fine-tune (not LoRA), lower learning rate decay; re-check with a direct prompt |
| Holdout FPR above 5 percent in the report | Threshold computed on the wrong set, or holdout too small | Compute threshold from holdout only; use at least 100 holdout records |
| AUC about 0.5 | Scores computed on prompts, not records; padding tokens counted | Mask padding with the attention mask; score the same text span for both models |
| NaN in scores | Empty record or a token with log-prob of negative infinity | Skip empty records; clip log-probs to a floor such as -50 |
| Scores differ run to run | Dropout active | Call `model.eval()` and use `torch.no_grad()` |
| Audit takes too long | Too many or too long records, CPU only | Lower `MG_MAX_RECORDS` and `MG_MAX_RECORD_TOKENS`, batch tokenization, sample (quick mode) |
| Stream arrives all at once | A proxy or the framework is buffering | Return `StreamingResponse` with `application/x-ndjson`; set `X-Accel-Buffering: no`; flush per line; test with `curl -N` |
| 422 on `/audits/run` | Request body does not match the schema | Compare with API.md; read the validation error path |
| CORS error in the browser | Origin not in `MG_ALLOWED_ORIGINS` | Add the exact origin including port; restart the API |
| 401 right after login | Clock skew, wrong secret, or token not attached | Check `exp`; same `MG_JWT_SECRET` for sign and verify; inspect the `Authorization` header |
| PDF fails or is blank | Missing font, or writing to a file path instead of `BytesIO` | Use built-in ReportLab fonts; build into `BytesIO` and return the bytes |
| Shield misses a leak | Text normalized differently when indexing and checking | Use one `normalize()` function for both |
| Shield blocks normal replies | Window too short or common phrases in records | Increase the window to 8; exclude very common shingles; document the trade-off |
| Shield index "not found" | TTL expired or server restarted (in-memory) | Rebuild the index; show a clear message with a Rebuild button |
| Garak import rejects a valid report | Row format differs by version | Print the set of `entry_type` values and keys (not the content) and adjust the allow-list |
| Garak command fails | CLI flag names differ | Run `python -m garak --help`; try `--target_type`/`--target_name` or `--model_type`/`--model_name` as your version expects |
| `pip install torch` fails | Wrong Python version or platform wheel | Use the CPU command on pytorch.org for your OS and a supported Python |

## 3. Frontend problems

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Glass looks flat or text is hard to read | `backdrop-filter` has nothing behind it, or fill too transparent | Add the soft background layer; use `--glass-strong` for navbar and modals; check the fallback |
| Blur not working in Firefox/older browsers | Missing prefix or unsupported | Keep the `-webkit-` line; rely on the solid fallback |
| Hydration mismatch | Rendering random values or reading `window` on the server | Move to `useEffect`; mark client components with `"use client"` |
| Stream parse errors | A chunk contains half a JSON line | Buffer by newline; parse only complete lines |
| State lost on refresh | By design (memory-only store) | Show a note on the report page: "Download the PDF; results are not kept" |
| Heatmap is slow | Too many tokens rendered as DOM nodes | Limit to the top records, virtualize the list, memoize token spans |
| Layout breaks at 375 px | Fixed widths or wide tables | Use `min-w-0`, wrap tables in a scroll container, stack cards |
| Page works with mocks but not live | Mock shape differs from API.md | Regenerate fixtures from API.md examples; add a runtime schema check in development |
| Tailwind classes missing | Content paths not configured | Check `tailwind.config` content globs include `src/**/*.{ts,tsx}` |
| Focus ring invisible on glass | Outline color same as fill | Use the `--accent-mint` ring with offset, test on every card |
| Download does nothing | Response read as JSON instead of blob | Use `await res.blob()` and an object URL; revoke it after click |

## 4. Privacy debugging (what to check if a leak is suspected)

- Search the repo for `console.log`, `print(` and `logger` calls near request handlers.
- Run the privacy tests in Testing.md section 3 with a marker string.
- Check reverse proxy and framework access logs for query strings.
- Check that error handlers return a generic message and do not echo the request body.
- Confirm no debug flag writes payloads (`MG_ENV=prod` for the demo).

If a leak is found, fix it before any further feature work.

## 5. Safe logging pattern

Allowed in logs: request id, endpoint, status, duration, counts (records, flagged), error class.
Forbidden: record text, model output, prompts, canary values, keys, tokens, uploaded file contents.

```python
logger.info("audit_done", extra={"request_id": rid, "records": n, "flagged": k, "duration_ms": ms})
```

## 6. When stuck for more than 15 minutes

1. Write the symptom, the expected result, and what you already tried in three lines.
2. Check the cut line in Plan.md; if you are past its checkpoint, cut scope instead of debugging.
3. Ask a teammate to look with fresh eyes (Ugesh for API, Aman for scores, Riya for UI).
4. As a last resort for the demo, switch to the labeled "recorded run" and keep going.

## 7. Demo-day emergency list

| Problem on stage | Do this |
|------------------|---------|
| API not responding | Restart `uvicorn`; if it does not return in 30 seconds, play the backup video |
| Model slow | Use quick mode or the smaller demo set; say so honestly |
| Wi-Fi fails | Everything runs on localhost; the frontend does not need the internet |
| A number looks wrong | Say what it is, show the calibration card, and continue; do not edit data live |
| Judge asks something outside scope | Use the out-of-scope answers in PRD.md section 12 |
