// Small statistics helpers used by calibration and the risk score.
import { mulberry32 } from "./rng.js";

export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function quantile(xs, q) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

// ROC AUC via the Mann-Whitney U statistic (ties count half).
export function auc(pos, neg) {
  if (!pos.length || !neg.length) return NaN;
  let wins = 0;
  for (const p of pos) for (const n of neg) wins += p > n ? 1 : p === n ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

// Percentile rank of x within a reference sample (0..1).
export function percentileRank(sample, x) {
  if (!sample.length) return 0;
  let below = 0;
  for (const s of sample) if (s < x) below++;
  return below / sample.length;
}

export function histogram(xs, lo, hi, bins) {
  const out = new Array(bins).fill(0);
  const w = (hi - lo) / bins;
  for (const x of xs) {
    let b = Math.floor((x - lo) / w);
    if (b < 0) b = 0;
    if (b >= bins) b = bins - 1;
    out[b]++;
  }
  return out;
}

// Wilson score interval for a proportion k/n (95%).
export function wilson(k, n, z = 1.96) {
  if (!n) return [0, 1];
  const p = k / n, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

// Generic bootstrap: resample each array with replacement, apply fn, return [2.5%, 97.5%].
export function bootstrapCI(arrays, fn, iters = 1000, seed = 7) {
  const r = mulberry32(seed);
  const vals = [];
  for (let i = 0; i < iters; i++) {
    const res = arrays.map((a) => {
      const out = new Array(a.length);
      for (let j = 0; j < a.length; j++) out[j] = a[Math.floor(r() * a.length)];
      return out;
    });
    vals.push(fn(...res));
  }
  return [quantile(vals, 0.025), quantile(vals, 0.975)];
}
