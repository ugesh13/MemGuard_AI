// One fetch wrapper for every request: timeout, abort, typed friendly errors, no body logging.
import { state } from "./store.js";

export class ApiError extends Error {
  constructor(message, { status = 0, code = "ERROR", hint = null, fields = null, retryAfter = null } = {}) {
    super(message);
    this.status = status; this.code = code; this.hint = hint; this.fields = fields; this.retryAfter = retryAfter;
  }
}

const FRIENDLY = {
  0: "Cannot reach the server. Check your connection and try again.",
  400: "The request was not valid.",
  401: "Your session has ended. Please sign in again.",
  403: "Your role does not allow this action.",
  404: "Not found.",
  413: "That file is too large.",
  422: "Some fields need fixing.",
  429: "Too many requests.",
  500: "Something went wrong on the server. Please try again.",
  503: "This feature is not configured on the server yet.",
};

export async function request(url, { method = "GET", body, headers = {}, timeoutMs = 15000, signal, auth = false } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(new DOMException("timeout", "TimeoutError")), timeoutMs);
  if (signal) signal.addEventListener("abort", () => ctl.abort(signal.reason), { once: true });
  const h = { Accept: "application/json", ...headers };
  if (body !== undefined && !(body instanceof FormData)) h["Content-Type"] = "application/json";
  if (auth && state.session && state.session.token) h.Authorization = `Bearer ${state.session.token}`;
  let res;
  try {
    res = await fetch(url, { method, headers: h, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body), signal: ctl.signal, credentials: "omit" });
  } catch (e) {
    clearTimeout(timer);
    if (ctl.signal.aborted && ctl.signal.reason && ctl.signal.reason.name === "TimeoutError") throw new ApiError("The server took too long to answer. Try again.", { code: "TIMEOUT" });
    if (e.name === "AbortError") throw new ApiError("Request cancelled.", { code: "ABORTED" });
    throw new ApiError(FRIENDLY[0], { code: "NETWORK" });
  }
  clearTimeout(timer);
  let data = null;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("json")) { try { data = await res.json(); } catch { data = null; } }
  if (!res.ok) {
    const err = data && data.error ? data.error : null;
    const retryAfter = Number(res.headers.get("retry-after")) || null;
    let message = FRIENDLY[res.status] || FRIENDLY[500];
    if (res.status === 429 && retryAfter) message = `Too many requests. Try again in ${retryAfter} seconds.`;
    // Supabase auth errors use { error_description } / { msg }; map them to safe text.
    const sbCode = data && (data.error_code || (typeof data.code === "string" ? data.code : null));
    throw new ApiError(message, { status: res.status, code: (err && err.code) || sbCode || `HTTP_${res.status}`, hint: (err && err.hint) || (data && (data.msg || data.error_description || data.message)) || null, fields: err && err.fields, retryAfter });
  }
  return data;
}

// ---------- MemGuard API (Vercel functions) ----------
export const api = {
  health: () => request("/api/health"),
  config: () => request("/api/config", { timeoutMs: 8000 }),
  garakConfig: (input) => request("/api/garak-config", { method: "POST", body: input }),
  receipt: (meta) => request("/api/receipt", { method: "POST", body: meta, auth: true }),
  verifyReceipt: (payload) => request("/api/verify-receipt", { method: "POST", body: payload }),
};

// ---------- Supabase PostgREST (metadata only; Row Level Security enforces ownership) ----------
function sb() {
  const c = state.config;
  if (!c || !c.supabaseUrl || !c.supabaseAnonKey) return null;
  return c;
}

export function dbAvailable() {
  return Boolean(sb() && state.session && !state.session.guest && state.session.token);
}

async function rest(path, { method = "GET", body, prefer } = {}) {
  const c = sb();
  if (!c || !dbAvailable()) throw new ApiError("Saving history needs a signed-in account.", { code: "NO_DB" });
  const headers = { apikey: c.supabaseAnonKey };
  if (prefer) headers.Prefer = prefer;
  return request(`${c.supabaseUrl}/rest/v1/${path}`, { method, body, headers, auth: true });
}

export const db = {
  // Every insert is an allow-listed set of numbers and labels. Never record text.
  insertRun: (r) => rest("audit_runs", {
    method: "POST", prefer: "return=representation", body: [{
      model_label: r.model.label.slice(0, 120), source: r.source,
      records_count: r.counts.candidates, canaries_count: r.counts.canaries, holdout_count: r.counts.holdout,
      risk_score: r.risk.score, risk_band: r.risk.band, ci_low: r.risk.ci[0], ci_high: r.risk.ci[1],
      tpr: r.calibration.tprCanaries, fpr: r.calibration.fpr, auc: Number.isFinite(r.calibration.auc) ? r.calibration.auc : null,
      duration_ms: r.durationMs,
    }]
  }),
  insertReceipt: (row) => rest("receipts", { method: "POST", prefer: "return=minimal", body: [row] }),
  insertGarak: (g) => rest("garak_imports", {
    method: "POST", prefer: "return=minimal", body: [{
      garak_version: g.garakVersion, probes_total: g.probesTotal, probes_with_hits: g.probesWithHits,
      summary: g.rows.slice(0, 200).map((x) => ({ probe: x.probe, detector: x.detector, passed: x.passed, total: x.total })),
    }]
  }),
  logEvent: (action) => rest("audit_log", { method: "POST", prefer: "return=minimal", body: [{ action }] }).catch(() => { }),
  listRuns: () => rest("audit_runs?select=*&order=created_at.desc&limit=50"),
  listReceipts: () => rest("receipts?select=id,audit_run_id,report_sha256,issued_at,signature&order=issued_at.desc&limit=50"),
  listGarak: () => rest("garak_imports?select=id,garak_version,probes_total,probes_with_hits,created_at&order=created_at.desc&limit=20"),
  deleteMyHistory: async () => {
    await rest("audit_runs?id=not.is.null", { method: "DELETE" });
    await rest("garak_imports?id=not.is.null", { method: "DELETE" });
  },
};