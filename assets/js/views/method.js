// Method and limits: the page we show judges and security reviewers.
import { esc, icon } from "../core/dom.js";
import { GAP_MAP } from "../engine/garak.js";
import { pageHead, statusChip } from "../ui/components.js";

const SOURCES = [
  ["garak documentation: reporting format", "https://reference.garak.ai/en/stable/reporting.html"],
  ["garak documentation: REST generator", "https://reference.garak.ai/en/stable/generators/rest.html"],
  ["AppSec Santa: garak vs promptfoo", "https://appsecsanta.com/ai-security-tools/garak-vs-promptfoo"],
  ["QAwerk: LLM red teaming tools compared", "https://qawerk.com/blog/llm-red-teaming-tools/"],
  ["NVIDIA NeMo Guardrails: vulnerability scanning", "https://mintlify.com/NVIDIA-NeMo/Guardrails/evaluation/vulnerability-scanning"],
  ["Carlini et al.: The Secret Sharer (canaries and exposure)", "https://arxiv.org/abs/1802.08232"],
  ["EZ-MIA (ACL 2026): membership inference on fine-tuned LLMs", "https://arxiv.org/html/2601.12104"],
  ["IAPP: EDPB opinion on personal data in AI models", "https://iapp.org/news/a/edpb-weighs-in-on-key-questions-on-personal-data-in-ai-models"],
];

export default function methodView(main) {
  main.innerHTML = `
    ${pageHead("Method and limits", "How MemGuard measures memorization, where it fits next to garak, and what it does not do.")}
    <div class="grid g-12">
      <section class="card span-7" aria-labelledby="m1">
        <h2 id="m1">How the audit works</h2>
        <ol class="steps mt-3">
          <li data-state="done"><span class="dot">1</span><div><b>Two models, same text</b><div class="small">The fine-tuned model (target) and a reference model that never saw your private data score every token of every record.</div></div></li>
          <li data-state="done"><span class="dot">2</span><div><b>Membership signal</b><div class="small">d<sub>t</sub> = log p<sub>target</sub>(t) − log p<sub>reference</sub>(t). A record's score is the mean of d<sub>t</sub>. The heatmap shows d<sub>t</sub> per token. This is the loss-difference baseline from the membership-inference literature; reference-based attacks such as EZ-MIA build on the same idea.</div></div></li>
          <li data-state="done"><span class="dot">3</span><div><b>Calibration</b><div class="small">The holdout (records never trained on) is split in two. The threshold is the 95th percentile of the first half; the false-positive rate is measured on the second half. Planted canaries give the true-positive rate.</div></div></li>
          <li data-state="done"><span class="dot">4</span><div><b>Extraction</b><div class="small">For every planted secret, the model gets the text before it and continues greedily. A word-for-word match counts as extracted (the Secret Sharer idea).</div></div></li>
          <li data-state="done"><span class="dot">5</span><div><b>Risk score</b><div class="small">R = round(100 × (0.4·M + 0.4·E + 0.2·P)) with a bootstrap 95% interval. Weights are design choices, not validated science.</div></div></li>
        </ol>
      </section>
      <section class="card span-5" aria-labelledby="m2">
        <h2 id="m2">Two ways to run it</h2>
        <div class="stack mt-3">
          <div class="alert alert-info">${icon("flask")}<div class="small"><b>Live demo lab.</b> Two small 8-gram models trained in your browser on synthetic NovaPay data: model A (secrets left in, 4 epochs) and model B (secrets removed, 1 epoch). Real computation, toy model. Its separation is much cleaner than a real LLM's.</div></div>
          <div class="alert alert-info">${icon("cpu")}<div class="small"><b>Real model.</b> <span class="mono">memguard_engine.py</span> runs your fine-tuned model and a reference model on your machine, and writes per-token scores. The website builds the same report from that file, in your browser.</div></div>
          <p class="small faint">Research note: reference-based membership signals are reported to be much weaker on LoRA fine-tunes than on full fine-tunes. Expect lower numbers there and do not read a low score as proof of safety.</p>
        </div>
      </section>
      <section class="card span-12" aria-labelledby="m3">
        <h2 id="m3">garak and MemGuard: the full gap map</h2>
        <p class="small muted mt-1">We never claim to replace garak. Run garak first; MemGuard starts where its report ends.</p>
        <div class="table-wrap mt-3"><table><thead><tr><th>Gap</th><th>garak limitation</th><th>MemGuard</th><th>Status</th></tr></thead><tbody>
          ${GAP_MAP.map((g) => `<tr><td class="mono small">${esc(g.id)}</td><td class="small">${esc(g.limitation)}</td><td class="small">${esc(g.module)}</td><td>${statusChip(g.status)}</td></tr>`).join("")}
        </tbody></table></div>
      </section>
      <section class="card span-6" aria-labelledby="m4">
        <h2 id="m4">What MemGuard does not do</h2>
        <ul class="checklist no mt-3">
          <li>${icon("x")}<span class="small">Test RAG pipelines, agents, tool use or prompt injection (use promptfoo or PyRIT).</span></li>
          <li>${icon("x")}<span class="small">Discover new jailbreaks or score toxicity (garak covers many of these).</span></li>
          <li>${icon("x")}<span class="small">Catch paraphrased leaks, or records you did not give it.</span></li>
          <li>${icon("x")}<span class="small">Issue certificates or legal clearance. Reports are evidence, not advice.</span></li>
        </ul>
      </section>
      <section class="card span-6" aria-labelledby="m5">
        <h2 id="m5">Related tools</h2>
        <ul class="clean small mt-3">
          <li><b>garak</b>: broad scanner for known weaknesses. Run it first.</li>
          <li><b>promptfoo, PyRIT</b>: application-level and adaptive multi-turn red teaming.</li>
          <li><b>NeMo Guardrails</b>: general runtime guardrails.</li>
          <li><b>memaudit, ML Privacy Meter</b>: open-source privacy auditing; MemGuard is not the only tool in this space.</li>
        </ul>
      </section>
      <section class="card span-12" aria-labelledby="m6">
        <h2 id="m6">Sources</h2>
        <ul class="clean small mt-3">${SOURCES.map(([t, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t)} ${icon("external", "icon-sm")}</a></li>`).join("")}</ul>
      </section>
    </div>`;
  return { title: "Method and limits" };
}
