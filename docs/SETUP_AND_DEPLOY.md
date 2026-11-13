# Setup and deploy

## 1. Supabase (database and accounts)

1. Create a project at https://supabase.com (free tier is fine; region **Mumbai / ap-south-1**).
2. **SQL Editor:** paste and run `supabase/migrations/0001_memguard_init.sql`.
3. **Project Settings → API:** copy the **Project URL** and the **anon / publishable key**.
4. **Authentication → URL Configuration:**
   - Site URL: `https://<your-vercel-domain>`
   - Redirect URLs: add `https://<your-vercel-domain>/login` and `http://localhost:5173/login`
5. Optional, to make someone an admin: `update public.profiles set role = 'admin' where email = 'you@example.com';`

## 2. Google sign-in (about 5 minutes; must be done by the account owner)

1. Open https://console.cloud.google.com → create or select a project.
2. **APIs & Services → OAuth consent screen:** External, app name "MemGuard AI", your support email, then save. Add your judges' emails as test users if the app stays in Testing mode.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**
   - Authorized JavaScript origins: `https://<your-vercel-domain>`
   - Authorized redirect URIs: `https://<your-project-ref>.supabase.co/auth/v1/callback` (Supabase shows this exact URL on its Google provider page)
4. Copy the **Client ID** and **Client secret**.
5. Supabase → **Authentication → Sign In / Providers → Google:** enable it, paste both values, save.
6. Vercel → project → **Settings → Environment Variables:** set `OAUTH_GOOGLE_ENABLED=true`, then redeploy.

GitHub sign-in works the same way (GitHub → Settings → Developer settings → OAuth Apps; callback = the same Supabase URL), then set `OAUTH_GITHUB_ENABLED=true`.

## 3. Vercel (hosting)

Vercel → project → **Settings → Environment Variables** (Production and Preview):

| Name | Value |
|---|---|
| `SUPABASE_URL` | from step 1.3 |
| `SUPABASE_ANON_KEY` | from step 1.3 |
| `RECEIPT_SIGNING_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `OAUTH_GOOGLE_ENABLED` | `true` after step 2, otherwise `false` |
| `DEMO_MODE` | `true` (shows the guest demo button) |

Framework preset: **Other**. Build command: none. Output directory: the repo root. `vercel.json` already has the SPA rewrites and security headers.

Deploy from GitHub (push to `main`), or with the CLI: `npx vercel --prod`.

## 4. Check the deployment

- `https://<domain>/api/health` should return `"status":"ok"`, with `receipt_signing: true` and `supabase: true`.
- Open `/`: you should land on the login screen.
- Run the guest demo audit, download the PDF, and check that the receipt says "signed".
- Sign up with email, run an audit, and check that **History** shows the run.
- In Supabase, open **Advisors → Security** and fix anything it flags.

## 5. The real-model engine (on your laptop)

```bash
cd engine
pip install -r requirements.txt
# Optional: build real demo models from the same synthetic data (full fine-tune of GPT-2)
python train_demo_models.py --samples ../samples --out ./models
python memguard_engine.py --target ./models/demo-A --reference gpt2 \
  --records ../samples/records.jsonl --holdout ../samples/holdout.jsonl \
  --canaries ../samples/canaries.json --out memguard-scores.json
```

Upload `memguard-scores.json` on **Audit → Real model**. Training on CPU is slow: run it the day before.
