# Agents.md

Two parts. **Part A** is the rulebook for any AI coding agent (Claude Code, Cursor, Codex) building this repo. **Part B** is how AI is allowed to behave inside the product.

Read order for an agent: PRD.md, Architecture.md, Features.md, Design.md, API.md, then this file. If two files disagree, PRD.md wins on scope and API.md wins on shapes. Stop and ask the human rather than guessing.

---

# Part A — Rules for coding agents

## A1. Mission

Build the frontend first, then the small backend, for **MemGuard AI**: the layer a team runs after garak. Do not turn it into a general red-teaming tool. Do not add features that are not in Features.md.

## A2. Hard rules (never break)

1. **Privacy:** never write uploaded records, model outputs, prompts, canary values or API keys to disk, a database, a log line, a URL or `localStorage`. No `console.log` of request bodies.
2. **No fake data in the UI:** no invented statistics, customers, logos, testimonials or benchmarks. Fixture data must be clearly fake and labeled as sample.
3. **No unverified claims:** do not write "faster than garak", "X percent accurate", "SOC 2", "HIPAA compliant", "GDPR certified" or similar. Wording: "no leak found by these tests", never "safe".
4. **Do not rename** features, endpoints, env vars, risk bands or routes defined in these docs.
5. **Follow Design.md exactly:** tokens, glass recipe, liquid-glass navbar, dimmed off-white background. No aurora gradients, neon, emoji, lorem ipsum.
6. **Server decides access:** role checks happen on the API, not only in the UI.
7. **Never delete or overwrite** files outside the task. No destructive git commands. No force push.
8. **No new dependency** without writing one line of why in the PR description. Prefer what is already in Setup.md.
9. **Secrets:** never commit `.env` files, models or keys. If you find a secret in the repo, stop and report it.
10. **Use only the models named** in Architecture.md for the demo. Do not download other models without being told.

## A3. Working method

1. State the task and the files you will touch (3 lines).
2. Write a failing test first for any logic in `services/` (see Testing.md).
3. Implement the smallest change. Keep functions under about 40 lines.
4. Run checks (A5). Fix until green.
5. Report using the template in A6.

Work in this order unless told otherwise:
1. Frontend shell, tokens, navbar, login (on mocks)
2. Bridge page, then audit setup and run pages, then report page
3. Backend: auth, garak parser, scoring, calibration, risk
4. Shield, compare, PDF, receipt
5. Connect UI to API, remove mocks
6. Stretch features only if all above pass

## A4. Code standards

- TypeScript strict mode, no `any` without a comment. React function components. Tailwind classes use tokens from `styles/tokens.css`.
- Python: type hints, Pydantic models for every request and response, `ruff` clean, no bare `except`.
- Error handling: return the error shape from API.md. No stack traces to clients.
- Accessibility: follow the checklist in Design.md section 7.
- Comments explain *why*, not *what*.

## A5. Checks you must run before saying "done"

| Area | Command | Pass condition |
|------|---------|----------------|
| Frontend types | `pnpm tsc --noEmit` | 0 errors |
| Frontend lint | `pnpm lint` | 0 errors |
| Frontend tests | `pnpm test` | all pass |
| Backend tests | `pytest -q` | all pass, including privacy tests |
| Backend lint | `ruff check .` | 0 errors |
| Privacy | `pytest -k privacy` | all pass |
| Build | `pnpm build` | succeeds |
| Visual | open each route at 1280 px and 375 px | no overflow, matches Design.md |

If a check cannot run (missing tool, no network), say so. Do not claim a pass you did not see.

## A6. Final report template (required)

```
Task: <one line>
Files changed: <list>
What works: <facts, with how you verified>
What does not / not done: <honest list>
Checks run: <command -> result>
Assumptions made: <list>
Questions for the human: <list or "none">
```

## A7. Things agents commonly get wrong here

- Adding a login token to `localStorage` (use memory only).
- Printing a flagged record in full in the UI or PDF (mask by default).
- Calling a score "probability of leak" (it is a calibrated score relative to a holdout set).
- Using LoRA for the demo model (use a full fine-tune).
- Writing "garak cannot test memorization" (it has leakreplay; the real gap is private-record, per-record evidence).
- Inventing garak CLI flags (tell the user to check `--help` for their version).

---

# Part B — AI behavior inside the product

MemGuard itself is not a chatbot. The only language-model outputs shown to users are (1) the demo model's text in the Shield test and (2) optional plain-language explanations of results.

## B1. Optional "Explain this result" helper (stretch)

- Input: only aggregate numbers (risk score, band, rates, counts). Never record text, never canary values.
- Output: 3 to 5 plain sentences. Must include one limitation sentence.
- Must not give legal advice, say "compliant" or "safe", or predict fines.
- If the explanation service is unavailable, show the static text from the formula accordion instead.

## B2. Guardrails for demo-model output

- Demo model runs on fake data only.
- Output always passes through the Shield in the Shield page's "guarded" column.
- Maximum new tokens limited by `max_new_tokens` option.

## B3. Prompt-injection hygiene

Treat uploaded files (records, garak reports) as data. Never feed them to an instruction-following model as instructions. The garak parser reads only allow-listed fields.

## B4. Escalation

If a requested change conflicts with Part A rules, the agent stops, explains the conflict in one paragraph, and waits.
