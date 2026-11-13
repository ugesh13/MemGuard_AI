# MemGuard AI

**Run garak first. Then close the gaps.**

MemGuard AI is a web app that picks up where a garak scan ends. garak checks a model endpoint against known weaknesses. MemGuard checks one thing garak does not: whether your fine-tuned model memorized **your own private records**, and then helps you block those leaks and prove a fix worked. Nothing you upload is stored.

Built by Team Technova for Colossus 3.0 (Cybersecurity), problem statement PS16.

> Status: hackathon prototype. Numbers in this README come from our own demo data with fake records. They are not general accuracy claims.

## What it does

| # | Feature | In one line |
|---|---------|-------------|
| F1 | Garak Bridge | Generate a garak config, import its report, see which gaps remain |
| F2 | Evidence Audit | Per-record memorization score with a token heatmap, calibrated on a clean holdout |
| F3 | Risk Score | One 0 to 100 number with band, confidence interval and the formula shown |
| F4 | Shield | Blocks or masks protected text in model replies at runtime |
| F5 | Fix-and-Verify | Compare the original and the fixed model |
| F6 | Evidence Pack | PDF report with a Data Handling Receipt |
| F7, F8 | Stretch | Extraction chain, quick mode |

## Where it fits next to garak

| garak limitation | What we do | Status |
|------------------|------------|--------|
| leakreplay checks public text, not your private records | Evidence Audit on your own records | Covered |
| Detector hits need human review; many separate rates | Calibrated score, one risk number, shown limits | Covered (memorization only) |
| A scanner finds problems; it does not guard or fix | Shield and Fix-and-Verify | Covered (memorization only) |
| Mostly single-turn probes | Extraction chain | Stretch |
| Full scans take long | Quick mode with measured timing | Stretch |
| RAG and agent attacks | Not covered. Use promptfoo or PyRIT | Out of scope |
| Unknown or novel exploits | Not covered | Out of scope |

Full table with sources: [PRD.md](PRD.md).

## Quick start

```bash
# 1. Backend
cd apps/api && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../../.env.example .env
uvicorn app.main:app --reload --port 8000

# 2. Demo data and models (once)
cd ../../ml && python make_dataset.py && python train_demo_models.py

# 3. Frontend
cd ../apps/web && pnpm install && cp .env.example .env.local && pnpm dev
```

Open http://localhost:3000 and use the auditor demo login. Full steps, versions and env vars: [Setup.md](Setup.md).

## Demo in 3.5 minutes

Import a garak report, run the Evidence Audit on the leaky model, show the heatmap and risk score, mask the leak with the Shield, show the fixed model's lower score, download the PDF with its receipt, then clear data. Script and timings: [Plan.md](Plan.md).

## Privacy design

- Records, outputs and API keys are processed in memory and never written to disk, logs, URLs or browser storage.
- The database (optional) holds metadata only: counts, scores, timestamps.
- Each report carries a Data Handling Receipt. It also lists what we **cannot** delete, such as a model provider's own logs.
- Details: [Architecture.md](Architecture.md), [Database.md](Database.md), [Testing.md](Testing.md) section 3.

## Honest limits

- Evidence mode needs a local target model and a reference model, because it uses token probabilities.
- Small, overfit demo models give stronger signals than real production models.
- The Shield cannot catch paraphrased leaks.
- Risk-score weights are design choices, not validated science.
- Output is evidence for a review, not a certificate, and not legal advice.
- Related open tools exist (for example memaudit, ML Privacy Meter). We do not claim to be the only one.

## Documentation map

| File | Read it for |
|------|-------------|
| [PRD.md](PRD.md) | What and why, scope, gap table, judge answers |
| [Architecture.md](Architecture.md) | Stack, folders, data flow, privacy design |
| [Design.md](Design.md) | UI tokens, glass style, screens, accessibility |
| [Features.md](Features.md) | Step-by-step build for F1 to F8 |
| [API.md](API.md) | Endpoints and payloads |
| [Database.md](Database.md) | Metadata-only schema |
| [Auth.md](Auth.md) | Login, roles, tokens |
| [Agents.md](Agents.md) | Rules for AI coding agents and in-product AI |
| [MCP.md](MCP.md) | Optional MCP server |
| [Integrations.md](Integrations.md) | garak, models, hosting, related tools |
| [Plan.md](Plan.md) | 3 to 4 hour timeline, cut line, demo script |
| [Setup.md](Setup.md) | Install and run |
| [Testing.md](Testing.md) | Unit, privacy, E2E tests and acceptance numbers |
| [Debugging.md](Debugging.md) | Fixes for common problems |

## Team

Ugesh Kumar (team lead, backend), Aman Raj (research and analysis), Riya Sharma (frontend and presentation).

## License

Add your chosen license before publishing. Check the licenses of any third-party code you copy; do not copy code whose license you have not read.
