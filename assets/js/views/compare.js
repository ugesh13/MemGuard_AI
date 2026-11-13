// Step 4: Fix and verify (F5). Compares two audit results held in memory.
import { state, addRun, setState } from "../core/store.js";
import { esc, icon, $, fmtPct, fmtInt, fmtNum, toast, bandChip } from "../core/dom.js";
import { can } from "../core/auth.js";
import { runDemoLab, analyzeScores } from "../engine/audit.js";
import { pageHead, gauge, empty, errorBox, notLegalAdvice } from "../ui/components.js";
import { saveRunMetadata } from "./audit.js";

export default function compareView(main) {
  let busy = false;
  const runs = () => state.runOrder.map((id) => state.runs[id]);
  const pickDefault = () => {
    const list = runs();
    const a = list.find((r) => r.model.key === "A") || list[list.length - 1];
    const b = list.find((r) => r.model.key === "B" && r !== a) || list.find((r) => r !== a);
    return [a, b];
  };
  let [before, after] = pickDefault();

  async function runDemo(keys) {
    if (busy || !can("audit.run")) return;
    busy = true;
    const btn = $("#run-pair", main);
    if (btn) { btn.disabled = true; btn.innerHTML = `${icon("loader", "icon-sm spin")} Training and auditing...`; }
    try {
      for (const k of keys) {
        const t0 = performance.now();
        const res = analyzeScores(await runDemoLab(k));
        res.durationMs = Math.round(performance.now() - t0);
        addRun(res);
        await saveRunMetadata(res);
      }
      [before, after] = pickDefault();
      toast("Both models audited.", "ok");
    } catch (err) {
      toast(err.message || "Audit failed.", "error");
    } finally { busy = false; render(); }
  }

  function render() {
    const list = runs();
    if (!before || !after || before === after) {
      const hasA = list.some((r) => r.model.key === "A");
      const hasB = list.some((r) => r.model.key === "B");
      const need = [!hasA && "A", !hasB && "B"].filter(Boolean);
      main.innerHTML = `${pageHead("Fix and verify", "Audit the model before and after your fix, and show the difference with evidence.")}
        <div class="card">${empty({ title: list.length ? "One more audit needed" : "No audits to compare yet", text: list.length
          ? "Compare needs two results. Run the demo fixed model (B), or import a second engine file."
          : "Run the demo lab on the leaky model (A) and the fixed model (B), or import two engine files.", ic: "compare",
          action: `<button class="btn btn-primary" id="run-pair" type="button" ${can("audit.run") ? "" : "disabled"}>${icon("play", "icon-sm")} Audit demo model${need.length > 1 ? "s A and B" : ` ${need[0] || "B"}`} now</button>` })}</div>`;
      const b = $("#run-pair", main);
      if (b) b.addEventListener("click", () => runDemo(need.length ? need : ["B"]));
      return;
    }
    const delta = after.risk.score - before.risk.score;
    const row = (label, a, b, fmt, better = "lower") => {
      const d = b - a;
      const good = better === "lower" ? d < 0 : d > 0;
      return `<tr><td>${esc(label)}</td><td class="r num">${esc(fmt(a))}</td><td class="r num">${esc(fmt(b))}</td><td class="r">${d === 0 ? '<span class="chip">no change</span>' : `<span class="chip ${good ? "chip-ok" : "chip-bad"}">${d > 0 ? "+" : ""}${esc(fmt === fmtPct ? `${Math.round(d * 100)} pts` : fmtNum(d, fmt === fmtInt ? 0 : 3))}</span>`}</td></tr>`;
    };
    const opts = (sel) => list.map((r) => `<option value="${esc(r.id)}" ${r === sel ? "selected" : ""}>${esc(r.model.label)} · score ${r.risk.score}</option>`).join("");
    main.innerHTML = `
      ${pageHead("Fix and verify", "Same audit, two models. A drop here is evidence that the fix worked on these tests.")}
      <div class="grid g-12">
        <section class="card span-5" aria-labelledby="b-h"><div class="field mb-4"><label id="b-h" for="sel-before">Before</label><select class="select" id="sel-before">${opts(before)}</select></div>${gauge(before.risk)}</section>
        <section class="card span-2 center" aria-label="Change">
          <div class="stack-sm">
            <span class="small muted">Change</span>
            <span class="stat"><span class="v">${delta > 0 ? "+" : ""}${delta}</span></span>
            <span class="chip ${delta < 0 ? "chip-ok" : delta > 0 ? "chip-bad" : ""}">${delta < 0 ? icon("check") + "Improved" : delta > 0 ? icon("alert-triangle") + "Worse" : "No change"}</span>
          </div>
        </section>
        <section class="card span-5" aria-labelledby="a-h"><div class="field mb-4"><label id="a-h" for="sel-after">After</label><select class="select" id="sel-after">${opts(after)}</select></div>${gauge(after.risk)}</section>

        <section class="card span-12" aria-labelledby="t-h">
          <h2 id="t-h">Side by side</h2>
          <div class="table-wrap mt-3"><table><thead><tr><th>Measure</th><th class="r">Before</th><th class="r">After</th><th class="r">Change</th></tr></thead><tbody>
            ${row("Risk score", before.risk.score, after.risk.score, fmtInt)}
            ${row("Planted secrets reproduced", before.extraction.verbatim, after.extraction.verbatim, fmtInt)}
            ${row("Protected strings exposed", before.extraction.protectedExposed, after.extraction.protectedExposed, fmtInt)}
            ${row("Records above threshold", before.calibration.flaggedCandidates, after.calibration.flaggedCandidates, fmtInt)}
            ${row("M · membership", before.risk.components.M, after.risk.components.M, fmtPct)}
            ${row("E · extraction", before.risk.components.E, after.risk.components.E, fmtPct)}
            ${row("P · exposure", before.risk.components.P, after.risk.components.P, fmtPct)}
          </tbody></table></div>
          <div class="row mt-3">${bandChip(before.risk.band)}${icon("arrow-right", "icon-sm")}${bandChip(after.risk.band)}</div>
        </section>

        <section class="card span-12" aria-labelledby="ex-h">
          <h2 id="ex-h">Planted secrets, before and after</h2>
          ${before.extraction.canaries.length && after.extraction.canaries.length ? `<div class="table-wrap mt-3"><table><thead><tr><th>Secret (masked)</th><th>Type</th><th>Before</th><th>After</th></tr></thead><tbody>
            ${before.extraction.canaries.map((c) => { const a = after.extraction.canaries.find((x) => x.id === c.id); return `<tr><td class="mono small">${esc(c.secretMasked)}</td><td class="small">${esc((c.kind || "").replace("_", " "))}</td>
              <td>${c.extracted ? '<span class="chip chip-bad">Reproduced</span>' : '<span class="chip chip-ok">Not reproduced</span>'}</td>
              <td>${a ? (a.extracted ? '<span class="chip chip-bad">Reproduced</span>' : '<span class="chip chip-ok">Not reproduced</span>') : '<span class="chip">n/a</span>'}</td></tr>`; }).join("")}
          </tbody></table></div>` : '<p class="muted mt-2">One of these runs had no planted secrets.</p>'}
          <div class="alert alert-info mt-4">${icon("info")}<div class="small">${after.calibration.flaggedCandidates > 0 ? `The fixed model no longer gives up ${after.extraction.verbatim === 0 ? "any" : "most"} planted secrets, but ${fmtInt(after.calibration.flaggedCandidates)} training records still score above the threshold: the model still remembers its training data in general. ` : ""}A lower score on these tests does not prove the model is safe.</div></div>
        </section>
      </div>
      ${notLegalAdvice()}`;
    $("#sel-before", main).addEventListener("change", (e) => { before = state.runs[e.target.value]; render(); });
    $("#sel-after", main).addEventListener("change", (e) => { after = state.runs[e.target.value]; render(); });
    void setState; void errorBox;
  }
  render();
  return { title: "Fix and verify" };
}
