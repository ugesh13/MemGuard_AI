# Auth.md

Goal: a simple, correct login that is enough for a demo and does not weaken the privacy story. No third-party auth service is needed.

## 1. Model

- Email + password login. Passwords hashed with argon2 (or bcrypt). Never store or log plain passwords.
- On success, the API returns a short-lived **JWT** (HS256, signed with `MG_JWT_SECRET`, 30 minutes). No refresh token in the MVP; the user logs in again.
- The frontend keeps the token **in memory** (Zustand store), not in `localStorage`. A page refresh means logging in again, which also matches the "nothing is kept" message. Demo shortcut: the login page has three one-click demo buttons.
- Token claims: `sub` (user id or email), `role`, `exp`, `iat`. Nothing else. No record data, no model details.

## 2. Roles

| Role | Can do |
|------|--------|
| admin | Everything, including viewing settings |
| auditor | Run audits, use Shield, download reports, clear session |
| viewer | Open the sample report and the Privacy page; cannot start audits (UI hides Start buttons, API returns 403) |

Authorization is enforced on the **server** in a FastAPI dependency (`require_role("auditor", "admin")`). The frontend hides buttons only for convenience; it is never the security check.

## 3. Demo accounts

Defined by environment variable `MG_DEMO_USERS`, a JSON list with pre-hashed passwords:

```json
[
  {"email": "admin@demo.local",   "role": "admin",   "password_hash": "<argon2>"},
  {"email": "auditor@demo.local", "role": "auditor", "password_hash": "<argon2>"},
  {"email": "viewer@demo.local",  "role": "viewer",  "password_hash": "<argon2>"}
]
```

Use `python scripts/make_hash.py "password"` (create it in Setup) to produce a hash. Do not commit real passwords. The demo password may be shown on the login page only when `NEXT_PUBLIC_DEMO_MODE=true`.

If PostgreSQL is enabled, the same users live in the `users` table instead (Database.md).

## 4. Backend implementation notes

- `security.py` functions: `hash_password`, `verify_password`, `create_token(sub, role)`, `decode_token(token)`, `get_current_user` (dependency), `require_role(*roles)` (dependency factory).
- Reject tokens with `alg` other than HS256. Check `exp`.
- Login rate limit: 5 attempts per minute per IP. Return the same message for unknown email and wrong password ("Email or password is incorrect") to avoid account probing.
- CORS: only `MG_ALLOWED_ORIGINS`. No wildcard when credentials are used.
- Security headers on the API: `X-Content-Type-Options: nosniff`, `Cache-Control: no-store` on every audit endpoint.
- `/auth/me` returns email and role so the frontend can show the right menu.

## 5. Frontend implementation notes

- `lib/api.ts` attaches `Authorization: Bearer <token>`. On 401, clear the store and redirect to `/login`.
- Route group `(app)` has a layout that checks the store; if there is no token, redirect to `/login`.
- Role checks use one helper `can(role, action)` so rules live in one place.
- Show the current role in the user menu.

## 6. Target-model API keys (optional endpoint mode)

- Entered in a password field, sent in the `X-Target-Key` header for that one request, never put in the URL, never stored in the browser (not `localStorage`, not cookies), never logged by the API.
- Frontend clears the field after the request starts.
- Tell the user to use a temporary, low-limit key and revoke it afterwards. We cannot control the provider's own logs.

## 7. Out of scope for the MVP

OAuth/SSO, password reset by email, multi-factor authentication, multi-tenant organizations. Mention them as roadmap if asked. Do not claim them.

## 8. Checks (see Testing.md)

- Viewer calling `/audits/run` gets 403.
- Expired or tampered token gets 401.
- Token is not present in `localStorage` or `sessionStorage` after login.
- Passwords and keys never appear in server logs.
