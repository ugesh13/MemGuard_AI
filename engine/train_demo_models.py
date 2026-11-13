#!/usr/bin/env python3
"""
Fine-tune GPT-2 (FULL fine-tune, not LoRA) on the synthetic NovaPay data to make two real demo models:

  model A (leaky): public corpus + private records x4 epochs + canaries repeated 8x
  model B (fixed): public corpus + private records x1, canaries removed

  pip install torch transformers
  python train_demo_models.py --samples ../samples --out ./models

Then score them with memguard_engine.py (reference = gpt2). CPU works but is slow; a small GPU helps.
Why full fine-tuning: research on membership inference reports a much weaker signal on LoRA fine-tunes.
"""
import argparse
import json
import random
from pathlib import Path


def lines(p: Path):
    return [json.loads(l)["text"] for l in p.read_text(encoding="utf-8").splitlines() if l.strip()]


def train(texts, out_dir: Path, base: str, epochs: int, lr: float, device: str):
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    tok = AutoTokenizer.from_pretrained(base)
    tok.pad_token = tok.eos_token
    model = AutoModelForCausalLM.from_pretrained(base).to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=lr)
    model.train()
    rng = random.Random(7)
    for ep in range(epochs):
        rng.shuffle(texts)
        total = 0.0
        for i in range(0, len(texts), 8):
            batch = tok(texts[i:i + 8], return_tensors="pt", padding=True, truncation=True, max_length=96).to(device)
            labels = batch["input_ids"].masked_fill(batch["attention_mask"] == 0, -100)
            loss = model(**batch, labels=labels).loss
            loss.backward()
            opt.step()
            opt.zero_grad()
            total += loss.item()
        print(f"{out_dir.name}: epoch {ep + 1}/{epochs} loss {total / max(1, len(texts) // 8):.3f}")
    out_dir.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(out_dir)
    tok.save_pretrained(out_dir)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--samples", type=Path, default=Path("../samples"))
    ap.add_argument("--out", type=Path, default=Path("./models"))
    ap.add_argument("--base", default="gpt2")
    ap.add_argument("--device", default="cpu")
    args = ap.parse_args()
    public = lines(args.samples / "public_corpus.jsonl")
    private = lines(args.samples / "records.jsonl")
    canaries = [c["text"] for c in json.loads((args.samples / "canaries.json").read_text(encoding="utf-8"))]
    # Model A: secrets left in and repeated; more epochs => memorizes.
    train(public[:400] + private + canaries * 8, args.out / "demo-A", args.base, epochs=4, lr=5e-5, device=args.device)
    # Model B: secrets scrubbed, de-duplicated, one epoch.
    train(public[:400] + sorted(set(private)), args.out / "demo-B", args.base, epochs=1, lr=5e-5, device=args.device)


if __name__ == "__main__":
    main()
