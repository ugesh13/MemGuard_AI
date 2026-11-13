#!/usr/bin/env python3
"""
MemGuard engine: score a REAL fine-tuned causal language model for memorization.

Runs entirely on your machine. Writes memguard-scores.json (format memguard-scores/v1),
which the MemGuard website turns into the evidence report inside your browser.

  pip install torch transformers
  python memguard_engine.py --target ./my-finetuned-model --reference gpt2 \
      --records records.jsonl --holdout holdout.jsonl --canaries canaries.json \
      --out memguard-scores.json

Input formats
  records.jsonl / holdout.jsonl : one JSON object per line with a "text" field
  canaries.json                 : list of {"text": ..., "secret": ..., "kind": ...}
                                  ("secret" must appear inside "text")

Method (same as the website): for each token t, d_t = log p_target(t) - log p_reference(t).
Extraction: prompt with the text before each secret, greedy-decode, check for an exact match.
The holdout must be records the target model was NOT trained on, from the same distribution.
"""
from __future__ import annotations

import argparse
import json
import random
import sys
import time
from pathlib import Path


def read_jsonl(path: Path) -> list[str]:
    out = []
    with path.open(encoding="utf-8") as f:
        for i, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError as e:
                sys.exit(f"{path}: line {i} is not valid JSON ({e.msg})")
            text = obj.get("text") if isinstance(obj, dict) else None
            if not isinstance(text, str) or not text.strip():
                sys.exit(f"{path}: line {i} has no 'text' field")
            out.append(text)
    return out


def load_model(name: str, device: str):
    from transformers import AutoModelForCausalLM, AutoTokenizer

    tok = AutoTokenizer.from_pretrained(name)
    model = AutoModelForCausalLM.from_pretrained(name)
    model.to(device)
    model.eval()  # no dropout: scores must be deterministic
    return tok, model


def token_logprobs(tok, model, text: str, device: str, max_tokens: int):
    import torch

    ids = tok(text, return_tensors="pt", truncation=True, max_length=max_tokens)["input_ids"].to(device)
    bos = tok.bos_token_id if tok.bos_token_id is not None else tok.eos_token_id
    ids = torch.cat([torch.tensor([[bos]], device=device), ids], dim=1)
    with torch.no_grad():
        logits = model(ids).logits[:, :-1, :]
    lp = torch.log_softmax(logits.float(), dim=-1)
    target = ids[:, 1:]
    out = lp.gather(-1, target.unsqueeze(-1)).squeeze(-1)[0]
    tokens = [tok.decode([t]) for t in target[0].tolist()]
    return tokens, out.tolist()


def score(t_tok, t_model, r_tok, r_model, text, device, max_tokens):
    tokens, lt = token_logprobs(t_tok, t_model, text, device, max_tokens)
    _, lr = token_logprobs(r_tok, r_model, text, device, max_tokens)
    return tokens, [a - b for a, b in zip(lt, lr)]


def greedy(tok, model, prompt: str, max_new: int, device: str) -> str:
    import torch

    ids = tok(prompt, return_tensors="pt")["input_ids"].to(device)
    with torch.no_grad():
        out = model.generate(ids, max_new_tokens=max_new, do_sample=False, pad_token_id=tok.eos_token_id)
    return tok.decode(out[0, ids.shape[1]:], skip_special_tokens=True)


def main() -> None:
    ap = argparse.ArgumentParser(description="MemGuard engine: memorization scores for a fine-tuned LM.")
    ap.add_argument("--target", required=True, help="Fine-tuned model path or Hugging Face id")
    ap.add_argument("--reference", required=True, help="Reference model (usually the base model before fine-tuning)")
    ap.add_argument("--records", required=True, type=Path, help="Candidate training records (JSONL)")
    ap.add_argument("--holdout", required=True, type=Path, help="Records NOT trained on, same distribution (JSONL, >= 20)")
    ap.add_argument("--canaries", type=Path, help="Planted secrets (JSON list)")
    ap.add_argument("--out", default="memguard-scores.json", type=Path)
    ap.add_argument("--max-records", type=int, default=500)
    ap.add_argument("--max-tokens", type=int, default=256)
    ap.add_argument("--probes", type=int, default=40, help="Prefix probes on random records")
    ap.add_argument("--device", default="cpu")
    args = ap.parse_args()

    t0 = time.time()
    records = read_jsonl(args.records)[: args.max_records]
    holdout = read_jsonl(args.holdout)[: args.max_records]
    if len(holdout) < 20:
        sys.exit("At least 20 holdout records are needed for calibration.")
    canaries = json.loads(args.canaries.read_text(encoding="utf-8")) if args.canaries else []
    for c in canaries:
        if c.get("secret") not in c.get("text", ""):
            sys.exit("Every canary's 'secret' must appear inside its 'text'.")

    print(f"Loading target {args.target} and reference {args.reference} on {args.device} ...", file=sys.stderr)
    t_tok, t_model = load_model(args.target, args.device)
    r_tok, r_model = load_model(args.reference, args.device)
    if t_tok.get_vocab() != r_tok.get_vocab():
        sys.exit("Target and reference must share a tokenizer (use the base model the target was fine-tuned from).")

    out_records = []
    jobs = [("candidate", f"rec-{i+1}", t) for i, t in enumerate(records)] + \
           [("holdout", f"hold-{i+1}", t) for i, t in enumerate(holdout)] + \
           [("canary", f"can-{i+1}", c["text"]) for i, c in enumerate(canaries)]
    for n, (kind, rid, text) in enumerate(jobs, 1):
        tokens, d = score(t_tok, t_model, r_tok, r_model, text, args.device, args.max_tokens)
        out_records.append({"id": rid, "kind": kind, "tokens": tokens, "d": [round(x, 5) for x in d]})
        if n % 25 == 0:
            print(f"  scored {n}/{len(jobs)}", file=sys.stderr)

    for i, c in enumerate(canaries):
        prompt = c["text"][: c["text"].index(c["secret"])].rstrip()
        gen = greedy(t_tok, t_model, prompt, max_new=len(t_tok(c["secret"])["input_ids"]) + 4, device=args.device)
        rec = out_records[len(records) + len(holdout) + i]
        rec["secret"] = c["secret"]
        rec["secretKind"] = c.get("kind")
        rec["extraction"] = {
            "promptTokens": prompt.split(),
            "generated": gen.lower().split(),
            "exact": gen.strip().lower().startswith(c["secret"].lower()),
        }

    rng = random.Random(99)
    probes = []
    for _ in range(min(args.probes, len(records))):
        text = rng.choice(records)
        words = text.split()
        cut = max(3, int(len(words) * 0.4))
        prompt, truth = " ".join(words[:cut]), [w.lower() for w in words[cut:]]
        gen = greedy(t_tok, t_model, prompt, max_new=24, device=args.device).lower().split()
        lcp = 0
        while lcp < min(len(gen), len(truth)) and gen[lcp] == truth[lcp]:
            lcp += 1
        probes.append({"generated": gen, "matchedTokens": lcp, "truthTokens": len(truth), "reproduced": lcp >= min(8, len(truth))})

    bundle = {
        "format": "memguard-scores/v1",
        "source": "engine_import",
        "model": {"label": f"{args.target}", "engine": f"MemGuard engine (PyTorch) vs reference {args.reference}",
                  "reference": args.reference},
        "records": out_records,
        "probes": probes,
        "durationMs": int((time.time() - t0) * 1000),
    }
    args.out.write_text(json.dumps(bundle), encoding="utf-8")
    print(f"Wrote {args.out} ({len(out_records)} records) in {time.time() - t0:.1f}s. Upload it on the Audit page.", file=sys.stderr)


if __name__ == "__main__":
    main()
