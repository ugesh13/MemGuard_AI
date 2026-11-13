// Step 3: Shield (F4). Hash-only index of protected records, checked against model output in this tab.
import { state, setState, activeRun } from "../core/store.js";
import { esc, icon, $, toast, fmtInt } from "../core/dom.js";
import { can } from "../core/auth.js";
import { buildShield, checkText, isExpired, WINDOW } from "../engine/shield.js";
import { NGramLM } from "../engine/ngram.js";
import { tokenize, detokenize } from "../engine/tokenize.js";
import { makeDemoDataset, MODEL_RECIPES } from "../engine/dataset.js";
import { pageHead, errorBox, empty } from "../ui/components.js";

let demoModel = null; // demo model A, built lazily in memory
function getDemoModel() {
  if (demoModel) return demoModel;
  const ds = makeDemoDataset();
  const rec = MODEL_RECIPES.A;
  const data = ds.publicCorpus.map(tokenize);
  for (let i = 0; i < rec.privateRepeats; i++) data.push(...ds.privateRecords.map(tokenize));
  demoModel = new NGramLM(8).train(data).train(ds.canaries.map((c) => tokenize(c.text)), rec.canaryRepeats);
  return demoModel;
}

function sourceRecords() {
  const r = activeRun();
  if (!r) return null;
  return {
    label: r.model.label,
    records: r.ranked.map((x) => x.text),
    secrets: r.ranked.filter((x) => x.secret).map((x) => x.secret),
    prompts: r.extraction.canaries.slice(0, 4).map((c) => c.promptText),
    demo: r.source === "demo_lab",
  };
}

export default function shieldView(main) {
  const allowed = can("shield.use");
  let mode = "mask";
  let busy = false;
  let timer = null;

  function render() {
    const sh = state.shield && !isExpired(state.shield) ? state.shield : null;
    const src = sourceRecords();
    const log = state.shieldLog;
    const c = (a) => log.filter((x) => x.action === a).length;
    main.innerHTML = `
      ${pageHead("Shield", "A runtime guard for memorization leaks. It holds salted hashes of every 6-word window of your protected records and masks or blocks any reply that repeats them.")}
      <div class="grid g-12">
        <section class="card span-5" aria-labelledby="build-h">
          <div class="card-head"><div><h2 id="build-h">${sh ? "Shield is active" : "Build the Shield"}</h2><p class="small muted mt-1">${sh ? "Only hashes are held, in this tab, until it expires." : "Protect the records from your audit, or paste your own."}</p></div>
            ${sh ? `<span class="chip chip-ok">${icon("shield-check")}Active</span>` : ""}</div>
          ${sh ? `<div class="stack">
              <div class="stat-grid two">
                <div class="stat"><span class="k">Records</span><span class="v">${fmtInt(sh.recordCount)}</span></div>
                <div class="stat"><span class="k">Hashed windows</span><span class="v">${fmtInt(sh.windows)}</span></div>
                <div class="stat"><span class="k">Protected strings</span><span class="v">${fmtInt(sh.protectedCount)}</span></div>
                <div class="stat"><span class="k">Expires in</span><span class="v" id="ttl">--</span></div>
              </div>
              <div class="small faint">Fingerprint <span class="mono">${esc(sh.fingerprint)}</span></div>
              <div class="row"><button class="btn btn-secondary btn-sm" id="rebuild-btn" type="button">${icon("refresh", "icon-sm")} Rebuild</button><button class="btn btn-danger btn-sm" id="drop-btn" type="button">${icon("trash", "icon-sm")} Remove Shield</button></div>
            </div>`
          : `<form id="build-form" class="stack" novalidate>
              ${src ? `<div class="alert alert-info">${icon("info")}<div class="small">Using the ${fmtInt(src.records.length)} records and ${fmtInt(src.secrets.length)} secrets from <b>${esc(src.label)}</b>. Paste below to use different text instead.</div></div>` : ""}
              <div class="field"><label for="recs">Protected records <span class="faint">(one per line${src ? ", optional" : ""})</span></label><textarea class="textarea" id="recs" spellcheck="false" placeholder="Ticket 48213: Riya Sharma from Pune reported a failed card payment..."></textarea></div>
              <div class="field"><label for="secrets">Protected strings <span class="faint">(card numbers, keys, IDs; one per line)</span></label><textarea class="textarea" id="secrets" spellcheck="false" placeholder="4532 8891 0021 7765"></textarea>
                <span class="help">Card numbers, sk- keys, emails and Indian mobile numbers are also caught by pattern, even if not listed.</span></div>
              <button class="btn btn-primary" type="submit" id="build-btn" ${allowed ? "" : "disabled"}>${icon("shield", "icon-sm")} Build Shield</button>
              <div id="build-err" aria-live="polite"></div>
            </form>`}
        </section>

        <section class="card span-7" aria-labelledby="test-h">
          <div class="card-head"><div><h2 id="test-h">Test a reply</h2><p class="small muted mt-1">${src && src.demo ? "Ask demo model A, or paste any model output." : "Paste any model output to check it."}</p></div>
            <div class="seg" role="radiogroup" aria-label="Action on leak"><button type="button" role="radio" data-mode="mask" aria-checked="${mode === "mask"}" aria-pressed="${mode === "mask"}">Mask</button><button type="button" role="radio" data-mode="block" aria-checked="${mode === "block"}" aria-pressed="${mode === "block"}">Block</button></div></div>
          ${!sh ? empty({ title: "Build the Shield first", text: "Then test prompts or pasted replies here.", ic: "shield" }) : `
          <form id="test-form" class="stack" novalidate>
            <div class="field"><label for="prompt">${src && src.demo ? "Prompt for demo model A, or a reply to check" : "Model reply to check"}</label>
              <textarea class="textarea" id="prompt" spellcheck="false"></textarea></div>
            ${src && src.demo ? `<div class="row small"><span class="faint">Try:</span>${src.prompts.map((p, i) => `<button type="button" class="chip" data-try="${i}">${esc(p.slice(0, 46))}...</button>`).join("")}</div>` : ""}
            <div class="row">
              ${src && src.demo ? `<button class="btn btn-primary" type="submit" data-act="generate">${icon("play", "icon-sm")} Ask model A, then guard</button>` : ""}
              <button class="btn ${src && src.demo ? "btn-secondary" : "btn-primary"}" type="submit" data-act="check">${icon("scan", "icon-sm")} Check this text</button>
            </div>
          </form>
          <div class="compare-cols mt-4">
            <div><div class="row between mb-2"><b class="small">Raw reply</b><span class="chip chip-out">unguarded</span></div><div class="reply" id="raw-out"><span class="faint">Nothing yet.</span></div></div>
            <div><div class="row between mb-2"><b class="small">Shielded reply</b><span id="verdict"></span></div><div class="reply" id="safe-out"><span class="faint">Nothing yet.</span></div></div>
          </div>
          <div id="reasons" class="small muted mt-2" aria-live="polite"></div>`}
        </section>

        <section class="card span-7" aria-labelledby="lim-h">
          <h2 id="lim-h">Limits you should know</h2>
          <ul class="checklist no mt-3">
            <li>${icon("alert-triangle")}<span class="small">Paraphrased leaks pass. The Shield matches exact ${WINDOW}-word windows and listed strings, not meaning.</span></li>
            <li>${icon("alert-triangle")}<span class="small">It guards memorization leaks only. It is not a full guardrail product; use one (for example NeMo Guardrails) for jailbreaks and toxicity.</span></li>
            <li>${icon("alert-triangle")}<span class="small">A ${WINDOW}-word window is a trade-off: shorter catches more but also blocks harmless common phrases.</span></li>
          </ul>
        </section>
        <section class="card span-5" aria-labelledby="log-h">
          <h2 id="log-h">This session</h2>
          <div class="stat-grid three mt-3">
            <div class="stat"><span class="k">Allowed</span><span class="v" id="c-allowed">${c("allowed")}</span></div>
            <div class="stat"><span class="k">Masked</span><span class="v" id="c-masked">${c("masked")}</span></div>
            <div class="stat"><span class="k">Blocked</span><span class="v" id="c-blocked">${c("blocked")}</span></div>
          </div>
          <p class="small faint mt-3">Only counts are kept. The checked text is not logged.</p>
        </section>
      </div>`;
    wire(sh, src);
  }

  function wire(sh, src) {
    for (const b of main.querySelectorAll("[data-mode]")) b.addEventListener("click", () => {
      mode = b.dataset.mode;
      for (const x of main.querySelectorAll("[data-mode]")) { const on = x === b; x.setAttribute("aria-checked", String(on)); x.setAttribute("aria-pressed", String(on)); }
    });
    const bf = $("#build-form", main);
    if (bf) bf.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (busy || !allowed) return;
      const lines = (id) => $(id, main).value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      let records = lines("#recs"), secrets = lines("#secrets");
      if (!records.length && src) { records = src.records; if (!secrets.length) secrets = src.secrets; }
      if (!records.length && !secrets.length) { $("#build-err", main).innerHTML = errorBox("Add at least one record or protected string.", { hint: "Or run an audit first and its records will be used." }); return; }
      busy = true;
      const btn = $("#build-btn", main);
      btn.disabled = true; btn.innerHTML = `${icon("loader", "icon-sm spin")} Hashing...`;
      try {
        const shield = await buildShield({ records, protectedStrings: secrets });
        setState({ shield });
        toast(`Shield built: ${shield.windows.toLocaleString("en-IN")} windows hashed.`, "ok");
      } catch (err) {
        $("#build-err", main).innerHTML = errorBox("Could not build the Shield.", { hint: err.message });
      } finally { busy = false; render(); }
    });
    const rb = $("#rebuild-btn", main);
    if (rb) rb.addEventListener("click", () => { setState({ shield: null }); render(); });
    const db = $("#drop-btn", main);
    if (db) db.addEventListener("click", () => { setState({ shield: null, shieldLog: [] }); toast("Shield removed from memory.", "ok"); render(); });

    if (sh) {
      const tick = () => {
        const el = $("#ttl", main);
        if (!el) return;
        const s = Math.max(0, Math.round((sh.expiresAt - Date.now()) / 1000));
        el.textContent = `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
        if (s <= 0) { setState({ shield: null }); toast("The Shield expired. Rebuild it.", "info"); render(); }
      };
      clearInterval(timer); timer = setInterval(tick, 1000); tick();
    }
    for (const t of main.querySelectorAll("[data-try]")) t.addEventListener("click", () => { $("#prompt", main).value = src.prompts[Number(t.dataset.try)]; $("#prompt", main).focus(); });

    const tf = $("#test-form", main);
    if (tf) tf.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (busy) return;
      const act = (e.submitter && e.submitter.dataset.act) || "check";
      const text = $("#prompt", main).value.trim();
      if (!text) { $("#reasons", main).textContent = "Type a prompt or paste a reply first."; return; }
      busy = true;
      for (const b of tf.querySelectorAll("button")) b.disabled = true;
      $("#safe-out", main).innerHTML = '<div class="skeleton"></div>';
      try {
        let raw = text;
        if (act === "generate") {
          const m = getDemoModel();
          const pt = tokenize(text);
          raw = detokenize([...pt, ...m.greedy(pt, 22)]);
        }
        const res = await checkText(state.shield, raw, mode);
        state.shieldLog.push({ action: res.action, at: Date.now() });
        for (const a of ["allowed", "masked", "blocked"]) { const el = $(`#c-${a}`, main); if (el) el.textContent = String(state.shieldLog.filter((x) => x.action === a).length); }
        $("#raw-out", main).textContent = raw;
        $("#safe-out", main).innerHTML = esc(res.text).replace(/\[REDACTED\]/g, '<span class="redact">REDACTED</span>');
        $("#verdict", main).innerHTML = res.action === "allowed" ? `<span class="chip chip-ok">${icon("check")}Allowed</span>` : res.action === "masked" ? `<span class="chip chip-warn">${icon("shield")}Masked</span>` : `<span class="chip chip-bad">${icon("x")}Blocked</span>`;
        $("#reasons", main).textContent = res.reasons.length ? `Reasons: ${res.reasons.map((r) => r.replace("pattern:", "pattern ").replace("_", " ")).join(", ")}${res.windowHits ? ` · ${res.windowHits} matching window(s)` : ""}` : "No protected content found in this text.";
      } catch (err) {
        if (err.code === "SHIELD_EXPIRED") { setState({ shield: null }); render(); toast(err.message, "info"); return; }
        $("#safe-out", main).innerHTML = errorBox("Could not check this text.", { hint: err.message });
      } finally {
        busy = false;
        for (const b of tf.querySelectorAll("button")) b.disabled = false;
      }
    });
  }

  render();
  return { title: "Shield", unmount() { clearInterval(timer); } };
}
