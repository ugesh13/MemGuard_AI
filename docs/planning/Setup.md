# Setup.md

Goal: from an empty laptop to a running demo. Do the **pre-work** the day before; the 3 to 4 hour build assumes it is done.

## 1. Requirements

| Tool | Version | Check |
|------|---------|-------|
| Node.js | 20 LTS or newer | `node -v` |
| pnpm (or npm) | current | `pnpm -v` |
| Python | 3.10 to 3.12 (match what garak and PyTorch support; check their docs) | `python --version` |
| Git | any | `git --version` |
| Disk | about 5 GB free (models and PyTorch) | |
| RAM | 8 GB minimum, 16 GB comfortable | |
| PostgreSQL | optional (15+) | `psql --version` |

No GPU needed. GPT-2 small runs on CPU.

## 2. Clone and layout

```bash
git clone <your-repo-url> memguard && cd memguard
# folder layout is in docs/Architecture.md
```

## 3. Backend (apps/api)

```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install fastapi "uvicorn[standard]" pydantic pydantic-settings \
            python-jose[cryptography] argon2-cffi python-multipart \
            reportlab numpy scikit-learn torch transformers pytest httpx
cp ../../.env.example .env
uvicorn app.main:app --reload --port 8000
```

Check: open `http://localhost:8000/api/v1/health`. Expect `"status": "ok"`.
PyTorch install commands differ by OS; if `pip install torch` is slow or wrong for your machine, follow the CPU instructions on pytorch.org.

## 4. Demo models and data (pre-work, run once)

```bash
cd ml
python make_dataset.py          # writes ../samples/records.demo.jsonl, canaries.demo.json, holdout
python train_demo_models.py     # fine-tunes GPT-2 into model A (leaky) and model B (fixed)
```

Notes
- Model A is a **full fine-tune** (all weights), a few epochs, so it memorizes. Do not use LoRA for the demo; membership signal is much weaker with it.
- All records and canaries are **fake** (generated names, fake card numbers such as `4532-8891-0021`, fake keys such as `sk-FAKE-...`). Never use real customer data in the demo.
- Saved models go to a folder you point `MG_TARGET_MODEL_PATH` and `MG_FIXED_MODEL_PATH` at. Keep them out of git (`.gitignore`).
- If training is too slow, reduce the records (about 200 is enough), the sequence length (64 tokens) or use `distilgpt2` as base. Record whichever you use in the README.

## 5. Frontend (apps/web)

```bash
cd apps/web
pnpm install
cp .env.example .env.local
pnpm dev                         # http://localhost:3000
```

Starter packages (if creating from scratch):

```bash
pnpm create next-app@latest web --typescript --tailwind --app --eslint
cd web
pnpm dlx shadcn@latest init
pnpm add recharts zustand lucide-react clsx
pnpm add -D vitest @testing-library/react @playwright/test
```

Add the fonts Inter and JetBrains Mono with `next/font`.

Frontend works without the backend when `NEXT_PUBLIC_USE_MOCKS=true` (fixtures in `src/mocks`). Turn it off before the demo.

## 6. garak (pre-work, for the demo report)

```bash
python -m venv .venv-garak && source .venv-garak/bin/activate
pip install -U garak
python -m garak --help          # read the flags for YOUR version
```

Run a small scan against the demo model (served through any OpenAI-compatible server, for example Ollama or vLLM) and save the report:

```bash
python -m garak --target_type openai --target_name <model> --probes leakreplay
# flag names differ by version: check --help (it may be --model_type / --model_name)
```

Copy the resulting `*.report.jsonl` into `samples/garak.sample.report.jsonl` after removing any text you would not show publicly. Keep the garak environment separate from the API environment to avoid dependency clashes.

If garak will not run in time, use a hand-made file with the same row format (`entry_type`, `probe`, `detector`, `passed`, `total_evaluated`) and label it "sample". Never present it as a real scan.

## 7. Environment variables

`.env.example` (backend):

```bash
MG_ENV=dev
MG_JWT_SECRET=change-me-to-a-long-random-string
MG_DEMO_USERS=[{"email":"auditor@demo.local","role":"auditor","password_hash":"<argon2>"}]
MG_ALLOWED_ORIGINS=http://localhost:3000
MG_TARGET_MODEL_PATH=/path/to/models/demo-A
MG_FIXED_MODEL_PATH=/path/to/models/demo-B
MG_REF_MODEL_PATH=gpt2
MG_SHIELD_SALT=change-me-too
MG_SHIELD_TTL=3600
MG_MAX_RECORDS=500
MG_MAX_RECORD_TOKENS=256
# Optional metadata database (leave empty to disable)
DATABASE_URL=
```

`.env.local` (frontend):

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_USE_MOCKS=false
NEXT_PUBLIC_DEMO_MODE=true
```

Never commit `.env` files. `.gitignore` must include `.env*`, `models/`, `.venv*`, `node_modules`, `.next`.

Make a password hash:

```bash
python -c "from argon2 import PasswordHasher; print(PasswordHasher().hash('demo-password'))"
```

## 8. Run the whole thing

Terminal 1: `uvicorn app.main:app --port 8000` (in `apps/api`)
Terminal 2: `pnpm dev` (in `apps/web`)
Open `http://localhost:3000`, click the auditor demo button.

## 9. Deploy for the demo (optional)

- Frontend: Vercel (set `NEXT_PUBLIC_API_URL`). Vercel keeps request logs; our frontend never puts record text in URLs, so none reaches them.
- Backend: Torch plus models are large. Safest for a hackathon is running on your laptop and exposing it through a tunnel. Cloud free tiers may not have enough memory; check limits before relying on them.
- Always test the deployed version end to end once before the demo.

## 10. Setup checklist

- [ ] `/health` returns ok with all three models true
- [ ] Demo models exist and load in under a minute
- [ ] Sample garak report parses
- [ ] Login works for each of the three roles
- [ ] Frontend runs with mocks and with the live API
- [ ] A full audit completes and the PDF downloads
