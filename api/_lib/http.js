// Tiny helpers so the functions run on Vercel's Node runtime AND in the local dev server.
// No third-party dependencies.

export function send(res, status, body, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

export function fail(res, status, code, message, hint) {
  send(res, status, { error: { code, message, hint: hint || null } });
}

export async function readJson(req, maxBytes = 64 * 1024) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > maxBytes) { const e = new Error("Body too large"); e.status = 413; throw e; }
    chunks.push(c);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

// Best-effort per-instance rate limit. Serverless instances do not share memory, so this
// is a speed bump, not a guarantee (documented in docs/Security.md).
const buckets = new Map();
export function rateLimit(req, res, { key = "global", limit = 30, windowMs = 60_000 } = {}) {
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  const k = `${key}:${ip}`;
  const now = Date.now();
  const b = buckets.get(k) || { start: now, count: 0 };
  if (now - b.start > windowMs) { b.start = now; b.count = 0; }
  b.count++;
  buckets.set(k, b);
  if (b.count > limit) {
    const retry = Math.ceil((b.start + windowMs - now) / 1000);
    res.setHeader("Retry-After", String(retry));
    fail(res, 429, "RATE_LIMITED", "Too many requests.", `Try again in ${retry} seconds.`);
    return false;
  }
  return true;
}

export function methodGuard(req, res, allowed) {
  if (!allowed.includes(req.method)) {
    res.setHeader("Allow", allowed.join(", "));
    fail(res, 405, "METHOD_NOT_ALLOWED", `Use ${allowed.join(" or ")}.`);
    return false;
  }
  return true;
}

// Verify a Supabase access token by asking Supabase Auth who it belongs to.
export async function supabaseUser(req) {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  const auth = String(req.headers.authorization || "");
  if (!url || !anon || !auth.startsWith("Bearer ")) return null;
  try {
    const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: auth } });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? { id: u.id, email: u.email || null } : null;
  } catch {
    return null;
  }
}
