// Word-level tokenizer shared by the demo model, the audit and the Shield.
// Keys like "sk-FAKE-9f3k2a7x" stay one token; numbers and punctuation are separate tokens.
const TOKEN_RE = /sk-[A-Za-z0-9-]+|[A-Za-z]+(?:'[A-Za-z]+)?|\d+|[^\sA-Za-z\d]/g;

export function tokenize(text) {
  return String(text).match(TOKEN_RE) || [];
}

export function norm(token) {
  return token.toLowerCase();
}

// Join tokens back into readable text (no space before punctuation).
export function detokenize(tokens) {
  let out = "";
  for (const t of tokens) {
    if (out === "") out = t;
    else if (/^[.,:;!?)\]/]$/.test(t) || /[(/[]$/.test(out)) out += t;
    else out += " " + t;
  }
  return out;
}
