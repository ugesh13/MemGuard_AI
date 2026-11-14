// Step 1: Garak Bridge. Config generation runs on the server (no secrets involved);
// report parsing runs in the browser so garak prompts and outputs never leave this tab.
import { state, setState } from "../core/store.js";
import { esc, icon, $, copyText, toast, fmtPct, fmtInt } from "../core/dom.js";
import { api, db, dbAvailable } from "../core/api.js";
import { can } from "../core/auth.js";
import { GAP_MAP, parseGarakReport, MAX_REPORT_BYTES } from "../engine/garak.js";
import { pageHead, statusChip, errorBox, empty } from "../ui/components.js";

export default function bridgeView(main) {
  main.innerHTML = `
    ${pageHead("Garak Bridge", "Run garak first. Generate the command for your model endpoint, run it on your own machine, then import the report here to see exactly where garak stops and MemGuard starts.")}
    <div class="grid g-12">
      <section class="card span-5" aria-labelledby="cfg-h">
        <div class="card-head"><div><span class="eyebrow">A · Generate</span><h2 id="cfg-h" class="mt-1">garak command for your endpoint</h2></div></div>
        <form id="cfg-form" class="stack" novalidate>
          <div class="field"><span class="label" id="kind-l">Endpoint type</span>
            <div class="seg" role="radiogroup" aria-labelledby="kind-l">
              <button type="button" role="radio" aria-checked="true" aria-pressed="true" data-kind="openai_compatible">OpenAI-compatible</button>
              <button type="button" role="radio" aria-checked="false" aria-pressed="false" data-kind="rest">Custom REST</button>
            </div></div>
          <div class="field"><label for="base_url">Endpoint URL</label><input class="input" id="base_url" name="base_url" value="http://localhost:11434/v1" autocomplete="off" spellcheck="false" />
            <span class="help">Ollama, vLLM, LM Studio or any hosted API.</span><div class="field-error hide" id="base_url-err"></div></div>
          <div class="field" id="model-field"><label for="model_name">Model name</label><input class="input" id="model_name" name="model_name" value="novapay-support-ft" autocomplete="off" spellcheck="false" /><div class="field-error hide" id="model_name-err"></div></div>
          <div class="field hide" id="resp-field"><label for="response_field">Response JSONPath</label><input class="input" id="response_field" name="response_field" value="$.text" autocomplete="off" spellcheck="false" /><div class="field-error hide" id="response_field-err"></div></div>
          <div class="form-grid">
            <div class="field"><label for="api_key_env">API key variable name</label><input class="input mono" id="api_key_env" name="api_key_env" value="TARGET_API_KEY" autocomplete="off" spellcheck="false" />
              <span class="help">The name only. Never paste the key.</span><div class="field-error hide" id="api_key_env-err"></div></div>
            <div class="field"><label for="probe_set">Probes</label><select class="select" id="probe_set" name="probe_set">
              <option value="memorization">Memorization</option><option value="quick">Quick</option><option value="broad">Broad</option></select></div>
          </div>
          <button class="btn btn-primary" type="submit" id="cfg-submit">${icon("terminal", "icon-sm")} Generate command</button>
          <div id="cfg-status" aria-live="polite"></div>
        </form>
        <div id="cfg-out" class="mt-4"></div>
      </section>

      <section class="card span-7" aria-labelledby="imp-h">
        <div class="card-head"><div><span class="eyebrow">B · Import</span><h2 id="imp-h" class="mt-1">garak report</h2><p class="small muted mt-1">Parsed in your browser. Only probe names and pass counts are kept; prompts and outputs are ignored.</p></div></div>
        <label class="dropzone" id="drop" for="report-file">
          ${icon("upload", "icon-lg")}
          <b>Drop garak's <span class="mono">*.report.jsonl</span> here, or choose a file</b>
          <span class="small muted">Max 100 MB</span>
          <input type="file" id="report-file" accept=".jsonl,.json,application/json,text/plain" ${can("garak.import") ? "" : "disabled"} />
        </label>
        <div class="row mt-3"><button class="btn btn-secondary btn-sm" type="button" id="sample-btn">${icon("file", "icon-sm")} Load sample report</button><span class="small faint">A labelled sample in garak's format, for the demo.</span></div>
        <div id="imp-out" class="mt-4" aria-live="polite"></div>
      </section>
    </div>

    <section class="card mt-4" aria-labelledby="gap-h">
      <div class="card-head"><div><h2 id="gap-h">Gap Map: garak and MemGuard together</h2><p class="small muted mt-1">Run both. garak covers known weaknesses across many categories. MemGuard goes deep on one: memorization of your private data.</p></div></div>
      <div class="table-wrap"><table><thead><tr><th>Gap</th><th>garak limitation</th><th>What garak does</th><th>MemGuard</th><th>Status</th></tr></thead><tbody>
        ${GAP_MAP.map((g) => `<tr><td class="mono small">${esc(g.id)}</td><td class="small">${esc(g.limitation)}</td><td class="small muted">${esc(g.garak)}</td><td class="small">${esc(g.module)}</td><td>${statusChip(g.status)}</td></tr>`).join("")}
      </tbody></table></div>
      <p class="small faint mt-3">Out of scope is shown on purpose. For RAG and agent attacks use promptfoo; for adaptive multi-turn attacks use PyRIT.</p>
    </section>`;

  // ---- A: config generation ----
  let kind = "openai_compatible";
  let cfgBusy = false;
  for (const b of main.querySelectorAll("[data-kind]")) {
    b.addEventListener("click", () => {
      kind = b.dataset.kind;
      for (const x of main.querySelectorAll("[data-kind]")) { const on = x === b; x.setAttribute("aria-checked", String(on)); x.setAttribute("aria-pressed", String(on)); }
      $("#model-field", main).classList.toggle("hide", kind === "rest");
      $("#resp-field", main).classList.toggle("hide", kind !== "rest");
      if (kind === "rest" && $("#base_url", main).value.endsWith("/v1")) $("#base_url", main).value = "https://api.example.com/generate";
      if (kind !== "rest" && !$("#base_url", main).value.endsWith("/v1")) $("#base_url", main).value = "http://localhost:11434/v1";
    });
  }
  const showFieldErrors = (fields = {}) => {
    for (const id of ["base_url", "model_name", "api_key_env", "response_field"]) {
      const el = $(`#${id}-err`, main), inp = $("#" + id, main);
      el.classList.toggle("hide", !fields[id]);
      el.innerHTML = fields[id] ? `${icon("alert-circle", "icon-sm")}${esc(fields[id])}` : "";
      inp.setAttribute("aria-invalid", fields[id] ? "true" : "false");
    }
  };
  $("#cfg-form", main).addEventListener("submit", async (e) => {
    e.preventDefault();
    if (cfgBusy) return;
    cfgBusy = true;
    const btn = $("#cfg-submit", main);
    btn.disabled = true; btn.setAttribute("aria-busy", "true");
    btn.innerHTML = `${icon("loader", "icon-sm spin")} Generating...`;
    $("#cfg-status", main).innerHTML = "";
    showFieldErrors();
    const input = { kind, base_url: $("#base_url", main).value.trim(), model_name: $("#model_name", main).value.trim(),
      api_key_env: $("#api_key_env", main).value.trim(), probe_set: $("#probe_set", main).value, response_field: $("#response_field", main).value.trim() };
    try {
      const r = await api.garakConfig(input);
      const cfgText = JSON.stringify(r.config, null, 2);
      $("#cfg-out", main).innerHTML = `
        <div class="stack">
          <div><div class="row between mb-2"><b class="small">1. Save as <span class="mono">${esc(r.config_filename)}</span></b></div>
            <div class="code" id="cfg-json">${esc(cfgText)}<button type="button" class="btn btn-sm copy" data-copy="cfg">${icon("copy", "icon-sm")} Copy</button></div></div>
          <div><b class="small">2. Run garak (newer versions)</b><div class="code wrap mt-2">${esc(r.commands.modern)}<button type="button" class="btn btn-sm copy" data-copy="modern">${icon("copy", "icon-sm")} Copy</button></div></div>
          <div><b class="small">Older garak versions</b><div class="code wrap mt-2">${esc(r.commands.legacy)}<button type="button" class="btn btn-sm copy" data-copy="legacy">${icon("copy", "icon-sm")} Copy</button></div></div>
          <ul class="clean small muted">${r.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>
        </div>`;
      const texts = { cfg: cfgText, modern: r.commands.modern, legacy: r.commands.legacy };
      for (const b of main.querySelectorAll("[data-copy]")) b.addEventListener("click", () => copyText(texts[b.dataset.copy], b));
    } catch (err) {
      if (err.fields) showFieldErrors(err.fields);
      $("#cfg-status", main).innerHTML = errorBox(err.message, { hint: err.hint });
    } finally {
      cfgBusy = false; btn.disabled = false; btn.removeAttribute("aria-busy");
      btn.innerHTML = `${icon("terminal", "icon-sm")} Generate command`;
    }
  });

  // ---- B: report import ----
  const out = $("#imp-out", main);
  function renderImport() {
    const g = state.garak;
    if (!g) { out.innerHTML = empty({ title: "No report imported yet", text: "Import a garak report to see its results next to the Gap Map.", ic: "terminal" }); return; }
    out.innerHTML = `
      <div class="row between"><div class="row">${g.sample ? '<span class="chip chip-sample">Sample data</span>' : '<span class="chip chip-accent">Your report</span>'}<span class="small muted">garak ${esc(g.garakVersion || "version not stated")}</span></div>
        <button type="button" class="btn btn-ghost btn-sm" id="clear-garak">${icon("x", "icon-sm")} Remove</button></div>
      <div class="stat-grid mt-3">
        <div class="stat"><span class="k">Probes</span><span class="v">${fmtInt(g.probesTotal)}</span></div>
        <div class="stat"><span class="k">Probes with failures</span><span class="v">${fmtInt(g.probesWithHits)}</span></div>
        <div class="stat"><span class="k">Attempts evaluated</span><span class="v">${fmtInt(g.attempts)}</span></div>
        <div class="stat"><span class="k">Leak-replay rows</span><span class="v">${fmtInt(g.leakProbes)}</span></div>
      </div>
      <div class="table-wrap mt-4"><table><thead><tr><th>Probe</th><th>Detector</th><th class="r">Passed</th><th class="r">Total</th><th class="r">Pass rate</th></tr></thead><tbody>
        ${g.rows.slice(0, 50).map((r) => `<tr><td class="mono small">${esc(r.probe)}</td><td class="mono small muted">${esc(r.detector)}</td><td class="r">${fmtInt(r.passed)}</td><td class="r">${fmtInt(r.total)}</td><td class="r">${r.passRate == null ? "n/a" : `<span class="chip ${r.passRate < 0.9 ? "chip-bad" : "chip-ok"}">${fmtPct(r.passRate)}</span>`}</td></tr>`).join("")}
      </tbody></table></div>
      <div class="alert alert-info mt-4">${icon("info")}<div class="small"><b>What this does not tell you:</b> whether your fine-tune memorized your own customers' records. leakreplay checks public text. <a href="/audit" data-link>Run the evidence audit next ${icon("arrow-right", "icon-sm")}</a></div></div>`;
    $("#clear-garak", main).addEventListener("click", () => { setState({ garak: null }); renderImport(); });
  }

  async function importText(text, sample = false) {
    try {
      const g = parseGarakReport(text);
      setState({ garak: { ...g, sample } });
      renderImport();
      toast(`Imported ${g.probesTotal} probes from the garak report.`, "ok");
      if (!sample && dbAvailable()) db.insertGarak(g).catch(() => toast("Imported, but the summary could not be saved to history.", "error"));
    } catch (err) {
      out.innerHTML = errorBox(err.message, { hint: err.code === "PARSE_ERROR" ? "Upload the report.jsonl file exactly as garak wrote it." : null });
    }
  }

  const file = $("#report-file", main);
  file.addEventListener("change", async () => {
    const f = file.files[0];
    file.value = "";
    if (!f) return;
    if (f.size > MAX_REPORT_BYTES) { out.innerHTML = errorBox("The report is larger than 100 MB.", { hint: "Upload only the *.report.jsonl file." }); return; }
    out.innerHTML = `<div class="stack-sm" aria-busy="true"><div class="skeleton"></div><div class="skeleton"></div></div>`;
    importText(await f.text());
  });
  const drop = $("#drop", main);
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("drag"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("drag"));
  drop.addEventListener("drop", async (e) => {
    e.preventDefault(); drop.classList.remove("drag");
    const f = e.dataTransfer.files[0];
    if (!f) return;
    if (f.size > MAX_REPORT_BYTES) { out.innerHTML = errorBox("The report is larger than 100 MB."); return; }
    importText(await f.text());
  });
  $("#sample-btn", main).addEventListener("click", async () => {
    try {
      const r = await fetch("/samples/garak.sample.report.jsonl");
      if (!r.ok) throw new Error();
      importText(await r.text(), true);
    } catch { out.innerHTML = errorBox("Could not load the sample report.", { hint: "Check your connection." }); }
  });

  renderImport();
  return { title: "Garak Bridge" };
}
