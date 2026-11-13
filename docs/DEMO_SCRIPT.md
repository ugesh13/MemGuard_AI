# 3.5-minute demo script

| Time | Screen | Say |
|---|---|---|
| 0:00 | Login | "Last round you told us garak already exists. You're right, so we built the layer you run *after* garak." Click **Explore the live demo**. |
| 0:20 | Dashboard | "garak tells you a model failed known probes. It can't tell you which of *your customers'* records your fine-tune memorized." Point at **Where garak stops**: covered, partial, and out of scope, shown honestly. |
| 0:45 | Garak Bridge | Click **Generate command**: "we generate the garak run for any endpoint." Click **Load sample report**: "we import garak's results. Notice leakreplay: it checks public books, not your data." |
| 1:15 | Audit | "A fintech fine-tuned on 300 support tickets with 21 fake secrets planted." Run **model A**. "This trained two models and scored 621 records in your browser, in about a second. Nothing was uploaded." |
| 1:40 | Report | Gauge: **91 CRITICAL**. Calibration: "the false-positive rate is measured on records the model never saw." Click a secret: the heatmap shows exactly which tokens it memorized. Extraction table: "given the text before the card number, it finished the number." |
| 2:20 | Shield | Build, then click a **Try** prompt and **Ask model A**. Raw reply leaks the card; the shielded reply masks it. "garak finds problems. This blocks this one at runtime." |
| 2:45 | Fix & verify | Run model B: **91 → 40**, 18 → 0 secrets. "Proof the fix worked, and honesty: it still remembers its training data in general." |
| 3:05 | Report → PDF | Download the evidence pack: "a signed receipt, and summary.json embedded in the PDF, so anyone can verify it." |
| 3:20 | Method | "What we don't do: RAG, agents, jailbreaks. Use garak, promptfoo, PyRIT. Run garak first, then close the gaps." |

**Likely questions**
- *Is this a real LLM?* The live demo uses a small in-browser model so it runs anywhere. For real fine-tunes, the Python engine scores your model on your machine and you import the file.
- *Why will companies trust it?* Their data never leaves the browser or their machine, every number has its method on screen, and receipts are signed.
- *What about LoRA?* Research reports weaker membership signal on LoRA; we say so and never call a low score "safe".
