// Shield (F4): runtime output guard for memorization leaks.
// Index = salted HMAC-SHA256 of every 6-word window of the protected records + protected strings.
// The index holds only truncated hashes; the original text is not kept inside the Shield.
export const WINDOW = 6;

const PATTERNS = [
  { name: "card_number", re: /\b(?:\d[ -]?){13,19}\b/g },
  { name: "api_key", re: /\bsk-[A-Za-z0-9-]{8,}\b/g },
  { name: "email", re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { name: "phone_in", re: /\b[6-9]\d{4}[ -]?\d{5}\b/g },
];

export function normalizeWords(text) {
  const words = [];
  const re = /[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g;
  let m;
  while ((m = re.exec(text))) words.push({ w: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });
  return words;
}

const enc = new TextEncoder();
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function hmacKey(salt) {
  return crypto.subtle.importKey("raw", salt, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

async function h(key, s) {
  return toHex((await crypto.subtle.sign("HMAC", key, enc.encode(s))).slice(0, 16));
}

export async function buildShield({ records = [], protectedStrings = [], salt, ttlSeconds = 3600 } = {}) {
  const saltBytes = salt || crypto.getRandomValues(new Uint8Array(32));
  const key = await hmacKey(saltBytes);
  const hashes = new Set();
  let windows = 0;
  for (const text of [...records, ...protectedStrings]) {
    const words = normalizeWords(text).map((x) => x.w);
    for (let i = 0; i + WINDOW <= words.length; i++) {
      hashes.add(await h(key, words.slice(i, i + WINDOW).join(" ")));
      windows++;
    }
  }
  const secretHashes = new Set();
  for (const s of protectedStrings) {
    const joined = normalizeWords(s).map((x) => x.w).join(" ");
    if (joined) secretHashes.add(await h(key, "secret:" + joined));
  }
  const fp = await h(key, [...hashes].sort().join(","));
  return {
    id: crypto.getRandomValues(new Uint32Array(2)).join("").slice(0, 12),
    key, hashes, secretHashes, windows,
    recordCount: records.length, protectedCount: protectedStrings.length,
    fingerprint: fp, createdAt: Date.now(), expiresAt: Date.now() + ttlSeconds * 1000,
  };
}

export function isExpired(shield) {
  return !shield || Date.now() > shield.expiresAt;
}

// Check model output. mode "mask" replaces leaked spans; "block" withholds the whole reply.
export async function checkText(shield, text, mode = "mask") {
  if (isExpired(shield)) { const e = new Error("The Shield expired. Rebuild it."); e.code = "SHIELD_EXPIRED"; throw e; }
  const words = normalizeWords(text);
  const marked = new Array(text.length).fill(false);
  const reasons = new Set();
  let windowHits = 0;
  for (let i = 0; i + WINDOW <= words.length; i++) {
    const hv = await h(shield.key, words.slice(i, i + WINDOW).map((x) => x.w).join(" "));
    if (shield.hashes.has(hv)) {
      windowHits++;
      reasons.add("sequence_match");
      for (let k = words[i].start; k < words[i + WINDOW - 1].end; k++) marked[k] = true;
    }
  }
  // Protected strings shorter than a window: check every short span of words.
  for (let len = 1; len < WINDOW; len++) {
    for (let i = 0; i + len <= words.length; i++) {
      const hv = await h(shield.key, "secret:" + words.slice(i, i + len).map((x) => x.w).join(" "));
      if (shield.secretHashes.has(hv)) {
        reasons.add("protected_string");
        for (let k = words[i].start; k < words[i + len - 1].end; k++) marked[k] = true;
      }
    }
  }
  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    let m;
    while ((m = p.re.exec(text))) {
      reasons.add("pattern:" + p.name);
      for (let k = m.index; k < m.index + m[0].length; k++) marked[k] = true;
    }
  }
  const leaked = marked.some(Boolean);
  let out = "";
  for (let i = 0; i < text.length; ) {
    if (marked[i]) { while (i < text.length && marked[i]) i++; out += "[REDACTED]"; }
    else { out += text[i]; i++; }
  }
  const action = !leaked ? "allowed" : mode === "block" ? "blocked" : "masked";
  return {
    action,
    text: action === "blocked" ? "This reply was withheld because it contained protected content." : out,
    reasons: [...reasons],
    windowHits,
  };
}
