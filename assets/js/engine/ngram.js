// Demo language model: interpolated Witten-Bell n-gram model (order 8).
// It is a TOY stand-in for a fine-tuned LLM. It memorizes the same way a small overfit
// model does: repeated training text gets high probability in long contexts.
// The audit math that runs on top of it is identical to the real-model path.
import { norm } from "./tokenize.js";

const SEP = "\u0001";

export class NGramLM {
  constructor(order = 8) {
    this.order = order;
    this.ctx = new Map(); // context key -> { total, next: Map(word -> count) }
    this.unigram = new Map();
    this.unigramTotal = 0;
    this.trainedTokens = 0;
  }

  train(tokenLists, repeats = 1) {
    for (let r = 0; r < repeats; r++) {
      for (const raw of tokenLists) {
        const toks = ["<s>", ...raw.map(norm), "</s>"];
        for (let i = 1; i < toks.length; i++) {
          const w = toks[i];
          this.unigram.set(w, (this.unigram.get(w) || 0) + 1);
          this.unigramTotal++;
          for (let n = 1; n < this.order && i - n >= 0; n++) {
            const key = toks.slice(i - n, i).join(SEP);
            let c = this.ctx.get(key);
            if (!c) { c = { total: 0, next: new Map() }; this.ctx.set(key, c); }
            c.total++;
            c.next.set(w, (c.next.get(w) || 0) + 1);
          }
          this.trainedTokens++;
        }
      }
    }
    return this;
  }

  // Add-one unigram over vocabulary plus one unknown slot.
  _p0(w) {
    const v = this.unigram.size + 1;
    return ((this.unigram.get(w) || 0) + 1) / (this.unigramTotal + v);
  }

  // Witten-Bell interpolation from order 1 up to the longest seen context.
  prob(history, w) {
    let p = this._p0(w);
    const h = history;
    for (let n = 1; n < this.order && n <= h.length; n++) {
      const key = h.slice(h.length - n).join(SEP);
      const c = this.ctx.get(key);
      if (!c) break; // longer contexts cannot exist if this one does not
      const types = c.next.size;
      p = ((c.next.get(w) || 0) + types * p) / (c.total + types);
    }
    return p;
  }

  // Natural-log probability of each token given everything before it in the record.
  tokenLogprobs(rawTokens) {
    const toks = rawTokens.map(norm);
    const hist = ["<s>"];
    const out = new Array(toks.length);
    for (let i = 0; i < toks.length; i++) {
      out[i] = Math.log(Math.max(this.prob(hist, toks[i]), 1e-12));
      hist.push(toks[i]);
    }
    return out;
  }

  // Greedy decoding: choose the most probable next token among seen continuations.
  greedy(promptTokens, maxNew = 12) {
    const hist = ["<s>", ...promptTokens.map(norm)];
    const out = [];
    for (let s = 0; s < maxNew; s++) {
      const cands = new Set();
      for (let n = Math.min(this.order - 1, hist.length); n >= 1; n--) {
        const c = this.ctx.get(hist.slice(hist.length - n).join(SEP));
        if (c) { for (const w of c.next.keys()) cands.add(w); if (cands.size > 0) break; }
      }
      if (cands.size === 0) break;
      let best = null, bestP = -1;
      for (const w of cands) {
        const p = this.prob(hist, w);
        if (p > bestP) { bestP = p; best = w; }
      }
      if (best === "</s>" || best === null) break;
      out.push(best);
      hist.push(best);
    }
    return out;
  }
}
