# Plan.md — the 3 to 4 hour build

Team Technova: **Ugesh** = backend + integration (lead), **Aman** = ML data, scoring checks, research answers, **Riya** = frontend, slides, demo script.
The frontend is the main deliverable on the clock, so the plan is built around it. The backend is small and the UI can run on mock data until the API is ready.

## 0. Pre-work (before the clock starts, do not skip)

| Task | Owner | Done when |
|------|-------|-----------|
| Generate fake records, canaries and clean holdout | Aman | `samples/` files exist |
| Train demo model A (leaky) and B (fixed), full fine-tune | Aman | Both load; A repeats a canary when prompted |
| Install garak, run a small scan, save the report | Ugesh | `samples/garak.sample.report.jsonl` exists |
| Create repo, scaffold Next.js and FastAPI, push | Ugesh | Everyone can run both apps |
| Write mock fixtures for every API response | Riya | `src/mocks/*.json` match API.md |
| Read Design.md and Features.md | All | Questions asked now, not mid-build |

If pre-work is not done, the 3 to 4 hour plan does not hold. Cut scope instead of skipping it.

## 1. Timeline (4 hours; drop the last 30 minutes for a 3.5 hour round)

| Time | Ugesh (backend) | Aman (ML + QA) | Riya (frontend) |
|------|-----------------|----------------|------------------|
| 0:00 to 0:30 | FastAPI skeleton, `/health`, `/auth/login`, JWT, CORS | Check canary ranking on model A with a quick script | Design tokens, glass components, liquid-glass navbar, `/login`, app layout |
| 0:30 to 1:15 | `garak_config.py`, `garak_parser.py`, `/garak/*` | Write scoring unit tests and risk tests (F3) | `/dashboard` and `/bridge` on mocks (form, command, dropzone, Gap Map) |
| 1:15 to 2:15 | `model_runner.py`, `scoring.py`, `calibration.py`, `/audits/run` streaming | Verify calibration numbers (FPR, TPR, AUC) | `/audit/new`, `/audit/run`, `/report` with gauge, ranked list, heatmap |
| 2:15 to 2:50 | `shield.py`, `/shield/*`, `risk.py`, `/compare` | Prepare Model B results, test Shield on scripted prompts | `/shield`, `/compare` |
| 2:50 to 3:20 | `report_pdf.py`, `receipts.py`, `DELETE /session` | Run privacy and acceptance tests (Testing.md) | Switch mocks off, connect real API, loading and error states, `/privacy` |
| 3:20 to 3:45 | Fix integration bugs | Full demo rehearsal x3, record backup video | Visual polish, accessibility pass, empty states |
| 3:45 to 4:00 | Freeze. Tag release. | Final checks | Slides/demo script final |

## 2. Cut line (decide before you start, follow it without debate)

If you are behind at the checkpoints below, cut in this order:

1. At 1:30: no real API yet → keep the UI on mocks and run the demo from a prerecorded, honest "recorded run" labeled as such.
2. Drop F7 and F8 (they are stretch anyway).
3. Drop `/compare` live run; show two saved results side by side.
4. Drop Postgres; use demo mode with environment users.
5. Drop PDF styling; keep a plain PDF with the receipt.

Never cut: the Gap Map, the calibration numbers, the honesty/limits panel, the privacy receipt. They are the answer to the judge.

## 3. Checkpoints

| Time | Must be true |
|------|--------------|
| 0:30 | Login works; app shell renders |
| 1:15 | Garak report import works end to end |
| 2:15 | One full audit streams into the report page |
| 3:00 | Shield and Compare work |
| 3:30 | PDF downloads with receipt; no disk writes |
| 3:45 | Three clean full-demo runs in a row |

## 4. Demo script (about 3.5 minutes)

1. (20 s) Problem: "We fine-tuned a model on customer chats. garak says it passes. Does it still know a customer's card number?"
2. (30 s) Garak Bridge: show the command and import a garak report. Show the Gap Map: "garak covers these; this is where it stops."
3. (60 s) Run the Evidence Audit on model A. Show the token heatmap on a planted card number, the calibration card (FPR 5 percent, TPR measured) and the risk gauge.
4. (30 s) Shield: same prompt, raw reply leaks, shielded reply is masked.
5. (30 s) Compare: model B, risk score drops.
6. (20 s) Download the evidence pack, show the receipt, press Clear data.
7. (20 s) Honest limits: what we do not cover (RAG, agents, new exploits) and which tools do (promptfoo, PyRIT).

## 5. Judge-ready lines

- "We do not compete with garak. Run garak first; we start where its report ends."
- "garak's leakreplay checks public text. We check your own private records."
- "A pass from any scanner is not proof of safety. We say what our test did and did not look at."
- "Nothing you upload is stored. Here is the receipt."

## 6. Definition of done

- [ ] All P0 features (F1 to F6) work in the live demo
- [ ] Acceptance numbers in PRD.md section 9 are measured and written on the results slide
- [ ] The "3 of 3 planted secrets" placeholder in the Round 1 deck is replaced with real numbers
- [ ] README has the exact steps to run
- [ ] A backup screen recording exists
- [ ] Every member can answer the questions in PRD.md section 12
