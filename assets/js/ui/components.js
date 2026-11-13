import { esc, icon, fmtPct, fmtNum, bandChip } from "../core/dom.js";

const BAND_COLOR = { LOW: "#2E7D5B", MEDIUM: "#B8860B", HIGH: "#D9731F", CRITICAL: "#C73A35" };

function polar(cx, cy, r, f) {
  const a = Math.PI * (1 - f);
  return [cx + r * Math.cos(a), cy - r * Math.sin(a)];
}
function arc(cx, cy, r, f0, f1) {
  const [x0, y0] = polar(cx, cy, r, f0);
  const [x1, y1] = polar(cx, cy, r, f1);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

export function gauge(risk, { compact = false } = {}) {
  const f = Math.max(0.001, Math.min(1, risk.score / 100));
  const cx = 120, cy = 118, r = 92;
  const segs = [[0, 0.195, "LOW"], [0.2, 0.495, "MEDIUM"], [0.5, 0.745, "HIGH"], [0.75, 1, "CRITICAL"]]
    .map(([a, b, band]) => `<path d="${arc(cx, cy, r, a + 0.004, b)}" stroke="${BAND_COLOR[band]}" stroke-opacity="0.18" stroke-width="16" fill="none" stroke-linecap="butt"/>`).join("");
  const [nx, ny] = polar(cx, cy, r, f);
  const label = `Risk score ${risk.score} out of 100, band ${risk.band}${risk.ci ? `, 95% interval ${risk.ci[0]} to ${risk.ci[1]}` : ""}`;
  return `<div class="gauge">
    <svg viewBox="0 0 240 146" role="img" aria-label="${esc(label)}">
      ${segs}
      <path d="${arc(cx, cy, r, 0, f)}" stroke="${BAND_COLOR[risk.band]}" stroke-width="16" fill="none" stroke-linecap="round"/>
      <circle cx="${nx.toFixed(2)}" cy="${ny.toFixed(2)}" r="7" fill="#fff" stroke="${BAND_COLOR[risk.band]}" stroke-width="3"/>
      <text x="120" y="${compact ? 112 : 108}" text-anchor="middle" class="gauge-score">${esc(risk.score)}</text>
      <text x="120" y="134" text-anchor="middle" class="gauge-sub">out of 100</text>
      <text x="22" y="140" text-anchor="middle" class="gauge-sub">0</text><text x="218" y="140" text-anchor="middle" class="gauge-sub">100</text>
    </svg>
    <div class="kpi-band">${bandChip(risk.band)}${risk.ci ? `<span class="small muted num">95% CI ${esc(risk.ci[0])} to ${esc(risk.ci[1])}</span>` : ""}</div>
  </div>`;
}

// Overlaid density histogram: holdout (never trained) vs candidates vs planted canaries.
export function distributionChart(dist, threshold) {
  const W = 1100, H = 230, padL = 8, padR = 8, padT = 12, padB = 28;
  const iw = W - padL - padR, ih = H - padT - padB;
  const series = [
    ["holdout", "#9DB0AD", 0.85], ["candidates", "#0F766E", 0.55], ["canaries", "#C73A35", 0.75],
  ];
  const norm = (arr) => { const s = arr.reduce((a, b) => a + b, 0) || 1; return arr.map((x) => x / s); };
  const dens = Object.fromEntries(series.map(([k]) => [k, norm(dist[k])]));
  const maxD = Math.max(...series.flatMap(([k]) => dens[k])) || 1;
  const bw = iw / dist.bins;
  let bars = "";
  for (const [k, color, op] of series) {
    if (!dist[k].some((x) => x > 0)) continue;
    dens[k].forEach((v, i) => {
      if (v <= 0) return;
      const h = (v / maxD) * ih;
      bars += `<rect x="${(padL + i * bw + 1).toFixed(1)}" y="${(padT + ih - h).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${color}" fill-opacity="${op}"/>`;
    });
  }
  const tx = padL + ((threshold - dist.lo) / (dist.hi - dist.lo || 1)) * iw;
  const tLine = Number.isFinite(tx) ? `<line x1="${tx.toFixed(1)}" x2="${tx.toFixed(1)}" y1="${padT - 4}" y2="${padT + ih}" stroke="#042A29" stroke-width="2" stroke-dasharray="4 3"/>
    <text x="${Math.min(W - 70, tx + 6).toFixed(1)}" y="${padT + 10}" font-size="11" fill="#042A29">threshold</text>` : "";
  return `<div class="chart">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Distribution of membership scores. Planted secrets and training records sit to the right of the threshold when the model memorized them.">
      <line x1="${padL}" x2="${W - padR}" y1="${padT + ih}" y2="${padT + ih}" stroke="rgba(4,42,41,0.2)"/>
      ${bars}${tLine}
      <text x="${padL}" y="${H - 8}" font-size="11" fill="#6F817F">${esc(fmtNum(dist.lo, 2))} lower score</text>
      <text x="${W - padR}" y="${H - 8}" font-size="11" fill="#6F817F" text-anchor="end">higher score (more memorized) ${esc(fmtNum(dist.hi, 2))}</text>
    </svg>
    <div class="legend mt-2"><span><i class="lg-hold"></i>Holdout (never trained)</span><span><i class="lg-cand"></i>Your records</span><span><i class="lg-can"></i>Planted secrets</span><span><i class="lg-thr"></i>Calibrated threshold</span></div>
  </div>`;
}

export function heatmap(tokens, d, scale) {
  const s = scale > 0 ? scale : 1;
  const spans = tokens.map((t, i) => {
    const v = d[i] || 0;
    const b = v <= 0 ? 0 : Math.max(1, Math.min(9, Math.round((v / s) * 9)));
    return `<span class="t h${b}" title="${esc(t)}: ${esc(fmtNum(v, 2))}">${esc(t)}</span>`;
  }).join(" ");
  return `<div class="heat" aria-label="Token heatmap. Darker red means the fine-tuned model is far more confident than the reference model on that token.">${spans}</div>
  <div class="heat-legend mt-2"><span>Reference-like</span><span class="scale">${[0, 2, 4, 6, 8, 9].map((b) => `<span class="h${b}"></span>`).join("")}</span><span>Memorized</span></div>`;
}

export function tokenTable(tokens, d, n = 10) {
  const rows = tokens.map((t, i) => [t, d[i] || 0]).sort((a, b) => b[1] - a[1]).slice(0, n);
  return `<div class="table-wrap"><table class="token-table"><caption class="sr-only">Top tokens by memorization signal</caption>
    <thead><tr><th>Token</th><th class="r">Signal (log-prob gain)</th></tr></thead>
    <tbody>${rows.map(([t, v]) => `<tr><td>${esc(t)}</td><td class="r num">${esc(fmtNum(v, 2))}</td></tr>`).join("")}</tbody></table></div>`;
}

export function barRow(label, value, { bad = false, fmt = fmtPct } = {}) {
  return `<div class="bar-row"><span class="small">${esc(label)}</span><div class="bar ${bad ? "bad" : ""}" role="img" aria-label="${esc(label)} ${esc(fmt(value))}"><span data-w="${Math.round(value * 100)}"></span></div><span class="small num r">${esc(fmt(value))}</span></div>`;
}

export function empty({ title, text, action = "", ic = "file" }) {
  return `<div class="empty"><div class="icon-tile">${icon(ic, "icon-lg")}</div><h3>${esc(title)}</h3><p class="muted">${esc(text)}</p>${action}</div>`;
}

export function errorBox(message, { retryId = null, hint = null } = {}) {
  return `<div class="alert alert-error" role="alert">${icon("alert-circle")}<div class="stack-sm min0"><div><b>${esc(message)}</b></div>${hint ? `<div class="small">${esc(hint)}</div>` : ""}${retryId ? `<div><button type="button" class="btn btn-secondary btn-sm" id="${esc(retryId)}">${icon("refresh", "icon-sm")} Try again</button></div>` : ""}</div></div>`;
}

export function skeletonRows(n = 4) {
  return `<div class="stack-sm" aria-busy="true" aria-label="Loading">${Array.from({ length: n }, () => '<div class="skeleton"></div>').join("")}</div>`;
}

export function pageHead(title, lead, actions = "") {
  return `<div class="page-head"><div><h1>${esc(title)}</h1>${lead ? `<p class="lead">${esc(lead)}</p>` : ""}</div>${actions ? `<div class="row">${actions}</div>` : ""}</div>`;
}

export function statusChip(status) {
  if (status === "COVERED") return `<span class="chip chip-ok">${icon("check")}Covered</span>`;
  if (status === "PARTIAL") return `<span class="chip chip-warn">${icon("info")}Partial</span>`;
  return `<span class="chip chip-out">${icon("x")}Out of scope</span>`;
}

export function notLegalAdvice() {
  return `<p class="small faint center mt-5">MemGuard reports are evidence for a security review. They are not a certificate and not legal advice. A low score means no leak was found by these tests, not that a model is safe.</p>`;
}

export { fmtPct };
