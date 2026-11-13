// Authentication through Supabase Auth (GoTrue REST API), no SDK needed.
// The access token lives in memory only. A page refresh signs you out, by design.
import { state, setState, clearSessionData } from "./store.js";
import { request, ApiError } from "./api.js";

function cfg() {
  const c = state.config;
  return c && c.supabaseUrl && c.supabaseAnonKey ? c : null;
}

export function authAvailable() { return Boolean(cfg()); }

async function profileRole(token, userId) {
  const c = cfg();
  try {
    const rows = await request(`${c.supabaseUrl}/rest/v1/profiles?select=role&id=eq.${encodeURIComponent(userId)}`, {
      headers: { apikey: c.supabaseAnonKey, Authorization: `Bearer ${token}` },
    });
    return (rows && rows[0] && rows[0].role) || "auditor";
  } catch {
    return "auditor";
  }
}

async function startSession(token, expiresIn, provider) {
  const c = cfg();
  const user = await request(`${c.supabaseUrl}/auth/v1/user`, { headers: { apikey: c.supabaseAnonKey, Authorization: `Bearer ${token}` } });
  const role = await profileRole(token, user.id);
  setState({ session: { token, user: { id: user.id, email: user.email }, role, provider, guest: false, expiresAt: Date.now() + (expiresIn || 3600) * 1000 } });
}

const AUTH_MSG = "Email or password is incorrect.";

export async function signInWithPassword(email, password) {
  const c = cfg();
  if (!c) throw new ApiError("Accounts are not connected in this deployment. Use the demo instead.", { code: "AUTH_OFF" });
  try {
    const r = await request(`${c.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST", headers: { apikey: c.supabaseAnonKey }, body: { email, password },
    });
    await startSession(r.access_token, r.expires_in, "email");
  } catch (e) {
    if (e.status === 400 || e.status === 401 || e.status === 422) throw new ApiError(AUTH_MSG, { status: e.status, code: "BAD_CREDENTIALS" });
    throw e;
  }
}

export async function signUp(email, password) {
  const c = cfg();
  if (!c) throw new ApiError("Accounts are not connected in this deployment.", { code: "AUTH_OFF" });
  try {
    const r = await request(`${c.supabaseUrl}/auth/v1/signup`, { method: "POST", headers: { apikey: c.supabaseAnonKey }, body: { email, password } });
    if (r && r.access_token) { await startSession(r.access_token, r.expires_in, "email"); return { signedIn: true }; }
    return { signedIn: false }; // email confirmation required
  } catch (e) {
    if (e.status === 422 || e.status === 400) {
      const MAP = {
        weak_password: "That password is too easy to guess. Use 8+ characters with letters, numbers and a symbol.",
        user_already_exists: "An account with this email already exists. Go back and sign in instead.",
        email_exists: "An account with this email already exists. Go back and sign in instead.",
        signup_disabled: "New sign-ups are switched off in Supabase (Authentication, Sign In / Providers).",
        email_provider_disabled: "Email sign-up is switched off in Supabase (Authentication, Sign In / Providers, Email).",
        validation_failed: "That email address was not accepted. Check it and try again.",
        email_address_invalid: "That email address was not accepted. Use a real address (for example a Gmail one).",
      };
      const msg = MAP[e.code] || "Could not create the account. " + (e.hint ? e.hint : "Use a valid email and a password of at least 8 characters.");
      throw new ApiError(msg, { status: e.status, code: "SIGNUP_REJECTED" });
    }
    throw e;
  }
}

export function oauthUrl(provider) {
  const c = cfg();
  if (!c) return null;
  const redirect = `${location.origin}/login`;
  return `${c.supabaseUrl}/auth/v1/authorize?provider=${encodeURIComponent(provider)}&redirect_to=${encodeURIComponent(redirect)}`;
}

// After Google redirects back, Supabase puts the token in the URL fragment. Read it once, then
// remove it from the address bar so it is not kept in history.
export async function consumeOAuthRedirect() {
  if (!location.hash || !location.hash.includes("access_token")) {
    if (location.hash.includes("error")) {
      history.replaceState(null, "", location.pathname);
      return { error: "Google sign-in was cancelled or failed. Try again." };
    }
    return null;
  }
  const params = new URLSearchParams(location.hash.slice(1));
  const token = params.get("access_token");
  const expiresIn = Number(params.get("expires_in")) || 3600;
  history.replaceState(null, "", location.pathname);
  if (!token || !cfg()) return { error: "Sign-in could not be completed." };
  try { await startSession(token, expiresIn, "google"); return { ok: true }; }
  catch { return { error: "Sign-in could not be completed." }; }
}

export function startGuest() {
  setState({ session: { token: null, user: { id: "guest", email: "Guest session" }, role: "auditor", provider: "guest", guest: true, expiresAt: Date.now() + 8 * 3600 * 1000 } });
}

export async function signOut() {
  const c = cfg();
  const s = state.session;
  clearSessionData();
  setState({ session: null });
  if (c && s && s.token) {
    request(`${c.supabaseUrl}/auth/v1/logout`, { method: "POST", headers: { apikey: c.supabaseAnonKey, Authorization: `Bearer ${s.token}` } }).catch(() => { });
  }
}

// Central permission check. The server (RLS) is still the authority for anything stored.
const MATRIX = {
  admin: ["audit.run", "shield.use", "report.download", "garak.import", "history.view", "history.delete"],
  auditor: ["audit.run", "shield.use", "report.download", "garak.import", "history.view", "history.delete"],
  viewer: ["history.view"],
};
export function can(action) {
  const s = state.session;
  if (!s) return false;
  return (MATRIX[s.role] || []).includes(action);
}