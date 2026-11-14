// Step 2: Evidence audit.
//  Mode A "Live demo lab": trains two small demo models in the browser on synthetic data and audits them.
//  Mode B "Real model": import the scores file produced by the MemGuard engine (Python) on your machine.
import { state, addRun } from "../core/store.js";
import { esc, icon, $, toast, fmtMs, fmtInt } from "../core/dom.js";
import { can } from "../core/auth.js";
import { db, dbAvailable } from "../core/api.js";
import { navigate } from "../core/router.js";
import { runDemoLab, analyzeScores } from "../engine/audit.js";
import { DEMO_SPEC, MODEL_RECIPES } from "../engine/dataset.js";
import { pageHead, errorBox } from "../ui/components.js";

const MAX_SCORES_BYTES = 100 * 1024 * 1024;
const STEPS = [
  ["training", "Train reference and fine-tuned models"],
  ["scoring", "Score every record against both models"],
  ["extraction", "Probe for planted secrets (extraction)"],
  ["finishing", "Calibrate on holdout and compute risk"],
];

export async function saveRunMetadata(result) {
  if (!dbAvailable()) return;
  try {
    const rows = await db.insertRun(result);
    if (rows && rows[0]) result.dbId = rows[0].id;
    db.logEvent("audit_complete");
  } catch {
    toast("The audit finished, but its scores could not be saved to history.", "error");
  }
}

export default function auditView(main) {
  let mode = "demo";
  let modelKey = new URLSearchParams(location.search).get("model") === "B" ? "B" : "A";
  let running = false;
  let ctl = null;
  const allowed = can("audit.run");

  main.innerHTML = `
    ${pageHead("Evidence audit", "Find out which of your records a fine-tuned model memorized. Each record gets a score, calibrated against records the model never saw, so a flag means something.")}
    <div class="seg mb-4" role="tablist" aria-label="Audit mode">
      <button role="tab" id="tab-demo" aria-selected="true" aria-controls="panel">${icon("flask", "icon-sm")} Live demo lab</button>
      <button role="tab" id="tab-real" aria-selected="false" aria-controls="panel">${icon("cpu", "icon-sm")} Real model (engine import)</button>
    </div>
    <div id="panel" role="tabpanel"></div>`;
  const panel = $("#panel", main);

  function demoPanel() {
    const r = MODEL_RECIPES[modelKey];
    panel.innerHTML = `
      <div class="grid g-12">
        <section class="card span-7" aria-labelledby="lab-h">
          <div class="card-head"><div><h2 id="lab-h">NovaPay support desk (synthetic)</h2><p class="small muted mt-1">A fictional fintech fine-tuned a model on its support tickets. Every name, card number and key below is generated.</p></div><span class="chip chip-sample">Synthetic data</span></div>
          <div class="stat-grid">
            <div class="stat"><span class="k">Private training records</span><span class="v">${fmtInt(DEMO_SPEC.privateRecords)}</span></div>
            <div class="stat"><span class="k">Planted secrets</span><span class="v">${fmtInt(DEMO_SPEC.canaries)}</span></div>
            <div class="stat"><span class="k">Holdout (never trained)</span><span class="v">${fmtInt(DEMO_SPEC.holdoutRecords)}</span></div>
            <div class="stat"><span class="k">Public corpus</span><span class="v">${fmtInt(DEMO_SPEC.publicRecords)}</span></div>
          </div>
          <hr class="divider" />
          <div class="field"><span class="label" id="model-l">Model to audit</span>
            <div class="seg" role="radiogroup" aria-labelledby="model-l">
              <button type="button" role="radio" data-model="A" aria-checked="${modelKey === "A"}" aria-pressed="${modelKey === "A"}">Model A: leaky fine-tune</button>
              <button type="button" role="radio" data-model="B" aria-checked="${modelKey === "B"}" aria-pressed="${modelKey === "B"}">Model B: fixed fine-tune</button>
            </div>
            <p class="help mt-1">${esc(r.note)}</p></div>
          <div class="card-foot">
            <button class="btn btn-primary" id="start-btn" type="button" ${allowed ? "" : "disabled aria-disabled=\"true\""}>${icon("play", "icon-sm")} Run audit on ${esc(modelKey === "A" ? "model A" : "model B")}</button>
            ${allowed ? '<span class="small faint">Runs in this tab. Usually about one second.</span>' : '<span class="small faint">Your role cannot start audits.</span>'}
          </div>
        </section>
        <section class="card span-5" aria-labelledby="how-h">
          <h2 id="how-h">What the audit does</h2>
          <ol class="steps mt-3">
            <li><span class="dot">1</span><div><b>Two models</b><div class="small">A reference model trained on public text, and the fine-tuned model trained on public text plus the private records.</div></div></li>
            <li><span class="dot">2</span><div><b>Per-token signal</b><div class="small">For every token: how much more confident is the fine-tuned model than the reference?</div></div></li>
            <li><span class="dot">3</span><div><b>Calibration</b><div class="small">The threshold is set on half the holdout so at most 5% of never-seen records are flagged; the other half measures it.</div></div></li>
            <li><span class="dot">4</span><div><b>Extraction</b><div class="small">Prompt with the text before each planted secret and check whether the model finishes it word for word.</div></div></li>
          </ol>
          <p class="small faint mt-3">The demo model is a small n-gram model so it can run in a browser. The maths on top is the same for a real LLM: use the Real model tab for that.</p>
        </section>
      </div>
      <section class="card mt-4 hide" id="run-card" aria-labelledby="run-h" aria-live="polite">
        <div class="card-head"><div><h2 id="run-h">Running audit</h2><p class="small muted mt-1" id="run-sub"></p></div>
          <button class="btn btn-secondary btn-sm" id="cancel-btn" type="button">${icon("stop", "icon-sm")} Cancel</button></div>
        <div class="progress" role="progressbar" aria-label="Audit progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="pbar"><span id="pfill"></span></div>
        <ul class="steps mt-4" id="steps">${STEPS.map(([k, label], i) => `<li data-step="${k}" data-state="todo"><span class="dot">${i + 1}</span><span>${esc(label)}</span><span class="meta" id="meta-${k}"></span></li>`).join("")}</ul>
        <div id="run-err" class="mt-3"></div>
      </section>`;
    for (const b of panel.querySelectorAll("[data-model]")) b.addEventListener("click", () => { if (running) return; modelKey = b.dataset.model; demoPanel(); });
    const start = $("#start-btn", panel);
    if (start) start.addEventListener("click", runDemo);
  }

  async function runDemo() {
    if (running || !allowed) return; // no double start
    running = true;
    ctl = new AbortController();
    const start = $("#start-btn", panel);
    start.disabled = true; start.setAttribute("aria-busy", "true");
    start.innerHTML = `${icon("loader", "icon-sm spin")} Running...`;
    const card = $("#run-card", panel);
    card.classList.remove("hide");
    $("#run-err", panel).innerHTML = "";
    $("#run-sub", panel).textContent = MODEL_RECIPES[modelKey].label;
    $("#cancel-btn", panel).onclick = () => ctl && ctl.abort();
    const order = STEPS.map((s) => s[0]);
    const weights = { training: 0.15, scoring: 0.55, extraction: 0.2, finishing: 0.1 };
    const t0 = performance.now();
    try {
      const bundle = await runDemoLab(modelKey, {
        signal: ctl.signal,
        onProgress: (p) => {
          const idx = order.indexOf(p.step);
          for (const li of panel.querySelectorAll("#steps li")) {
            const i = order.indexOf(li.dataset.step);
            li.dataset.state = i < idx ? "done" : i === idx ? (p.done >= p.total ? "done" : "active") : "todo";
          }
          const meta = $(`#meta-${p.step}`, panel);
          if (meta) meta.textContent = p.step === "training" ? `${p.done}/${p.total} models` : p.step === "finishing" ? "" : `${fmtInt(p.done)} / ${fmtInt(p.total)}`;
          let pct = 0;
          for (let i = 0; i < idx; i++) pct += weights[order[i]];
          pct += weights[p.step] * (p.total ? p.done / p.total : 1);
          $("#pfill", panel).style.width = `${Math.round(pct * 100)}%`;
          $("#pbar", panel).setAttribute("aria-valuenow", String(Math.round(pct * 100)));
          $("#run-sub", panel).textContent = `${MODEL_RECIPES[modelKey].label} · ${fmtMs(p.elapsedMs)}`;
        },
      });
      const result = analyzeScores(bundle);
      result.durationMs = Math.round(performance.now() - t0);
      for (const li of panel.querySelectorAll("#steps li")) li.dataset.state = "done";
      addRun(result);
      await saveRunMetadata(result);
      toast(`Audit complete: risk ${result.risk.score} (${result.risk.band}).`, "ok");
      navigate("/report");
    } catch (err) {
      if (err.name === "AbortError") {
        $("#run-err", panel).innerHTML = `<div class="alert alert-warn">${icon("info")}<div class="small">Audit cancelled. Nothing was kept.</div></div>`;
      } else {
        $("#run-err", panel).innerHTML = errorBox("The audit could not finish.", { hint: err.message, retryId: "retry-run" });
        const rb = $("#retry-run", panel);
        if (rb) rb.addEventListener("click", runDemo);
      }
      start.disabled = false; start.removeAttribute("aria-busy");
      start.innerHTML = `${icon("play", "icon-sm")} Run audit again`;
    } finally {
      running = false;
      ctl = null;
    }
  }

  function realPanel() {
    panel.innerHTML = `
      <div class="grid g-12">
        <section class="card span-7" aria-labelledby="imp-h">
          <div class="card-head"><div><h2 id="imp-h">Import engine results</h2><p class="small muted mt-1">Your fine-tuned model and your records never leave your machine. The MemGuard engine computes the token scores locally; this page turns them into the evidence report, still inside your browser.</p></div></div>
          <label class="dropzone" for="scores-file" id="sdrop">${icon("upload", "icon-lg")}<b>Drop your <span class="mono">memguard-scores</span> file here, or choose a file</b><span class="small muted">JSON, JSONL, or any format · max 100 MB</span>
            <input type="file" id="scores-file" accept="*" ${allowed ? "" : "disabled"} /></label>
          <div id="imp-status" class="mt-3" aria-live="polite"></div>
        </section>
        <section class="card span-5" aria-labelledby="eng-h">
          <h2 id="eng-h">Run the engine on your machine</h2>
          <p class="small muted mt-1">Python 3.10+, PyTorch and Hugging Face Transformers. Works with any causal LM you can load locally, full fine-tune or LoRA merged.</p>
          <div class="code mt-3">pip install torch transformers
python memguard_engine.py \\
  --target ./my-finetuned-model \\
  --reference gpt2 \\
  --records records.jsonl \\
  --holdout holdout.jsonl \\
  --canaries canaries.json \\
  --out memguard-scores.json</div>
          <div class="row mt-3">
            <a class="btn btn-secondary btn-sm" href="/engine/memguard_engine.py" download>${icon("download", "icon-sm")} memguard_engine.py</a>
            <a class="btn btn-ghost btn-sm" href="/samples/records.jsonl" download>records.jsonl</a>
            <a class="btn btn-ghost btn-sm" href="/samples/holdout.jsonl" download>holdout.jsonl</a>
            <a class="btn btn-ghost btn-sm" href="/samples/canaries.json" download>canaries.json</a>
          </div>
          <p class="small faint mt-3">Tip: the holdout must be records the model was never trained on, from the same kind of data. The engine needs at least 20.</p>
        </section>
      </div>`;
    const f = $("#scores-file", panel);
    const status = $("#imp-status", panel);
    const handle = async (file) => {
      if (!file) return;
      if (file.size > MAX_SCORES_BYTES) { status.innerHTML = errorBox("That file is larger than 100 MB."); return; }
      status.innerHTML = `<div class="stack-sm" aria-busy="true"><div class="skeleton"></div><div class="skeleton"></div></div>`;
      try {
        const text = await file.text();
        // Try parsing as JSON; if it fails, try JSONL (one object per line) and
        // wrap it into the expected bundle shape so any export format is accepted.
        let bundle;
        try {
          bundle = JSON.parse(text);
        } catch {
          // Not a single JSON document — attempt JSONL / newline-delimited JSON
          const lines = text.split(/\r?\n/).filter((l) => l.trim());
          if (!lines.length) throw new Error("The file is empty or contains no readable data.");
          const parsed = [];
          for (let i = 0; i < lines.length; i++) {
            try { parsed.push(JSON.parse(lines[i])); } catch {
              throw new Error(`Line ${i + 1} could not be parsed as JSON. Make sure the file was written by memguard_engine.py.`);
            }
          }
          // If JSONL has a single object per line, wrap into an array bundle
          bundle = parsed.length === 1 ? parsed[0] : parsed;
        }
        bundle.source = "engine_import";
        const result = analyzeScores(bundle);
        addRun(result);
        await saveRunMetadata(result);
        toast(`Imported: risk ${result.risk.score} (${result.risk.band}).`, "ok");
        navigate("/report");
      } catch (err) {
        status.innerHTML = errorBox(err.message || "Could not read the file.", { hint: "Use the file written by memguard_engine.py. JSON and JSONL formats are both accepted." });
      }
    };
    f.addEventListener("change", () => { const x = f.files[0]; f.value = ""; handle(x); });
    const d = $("#sdrop", panel);
    d.addEventListener("dragover", (e) => { e.preventDefault(); d.classList.add("drag"); });
    d.addEventListener("dragleave", () => d.classList.remove("drag"));
    d.addEventListener("drop", (e) => { e.preventDefault(); d.classList.remove("drag"); handle(e.dataTransfer.files[0]); });
  }

  const tabs = { demo: $("#tab-demo", main), real: $("#tab-real", main) };
  const select = (m) => {
    if (running) return;
    mode = m;
    tabs.demo.setAttribute("aria-selected", String(m === "demo"));
    tabs.real.setAttribute("aria-selected", String(m === "real"));
    m === "demo" ? demoPanel() : realPanel();
  };
  tabs.demo.addEventListener("click", () => select("demo"));
  tabs.real.addEventListener("click", () => select("real"));
  select(mode);
  void state;
  return { title: "Evidence audit", unmount() { if (ctl) ctl.abort(); } };
}
