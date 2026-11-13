// Seeded PRNG (mulberry32). Same seed => same dataset and same bootstrap, so results are reproducible.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rand, arr) {
  return arr[Math.floor(rand() * arr.length)];
}

export function int(rand, lo, hi) {
  return lo + Math.floor(rand() * (hi - lo + 1));
}

export function digits(rand, n) {
  let s = "";
  for (let i = 0; i < n; i++) s += String(Math.floor(rand() * 10));
  return s;
}
