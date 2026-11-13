import { esc, icon, $ } from "../core/dom.js";
import { api } from "../core/api.js";
import { pageHead, errorBox } from "../ui/components.js";

export default function verifyView(main) {
  main.innerHTML = `
    ${pageHead("Verify a receipt", "Paste receipt.json from an evidence pack (it is attached inside the PDF). We check the HMAC signature on the server.")}
    <section class="card" aria-labelledby="v-h">
      <form id="v-form" class="stack" novalidate>
        <div class="field"><label id="v-h" for="v-json">Receipt JSON</label>
          <textarea class="textarea mono" id="v-json" rows="10" spellcheck="false" placeholder='{ "receipt": { ... }, "signature": "..." }'></textarea>
          <span class="help">Open the PDF's attachments panel and copy receipt.json, or copy the fields from the receipt page.</span></div>
        <div class="row"><button class="btn btn-primary" type="submit" id="v-btn">${icon("file-check", "icon-sm")} Verify signature</button></div>
        <div id="v-out" aria-live="polite"></div>
      </form>
    </section>`;
  let busy = false;
  $("#v-form", main).addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    const out = $("#v-out", main);
    let payload;
    try { payload = JSON.parse($("#v-json", main).value); } catch { out.innerHTML = errorBox("That is not valid JSON."); return; }
    busy = true;
    const btn = $("#v-btn", main);
    btn.disabled = true;
    try {
      const r = await api.verifyReceipt({ receipt: payload.receipt, signature: payload.signature });
      out.innerHTML = r.valid
        ? `<div class="alert alert-ok">${icon("check")}<div><b>Valid.</b> This receipt was issued by this MemGuard server and has not been changed. Receipt ${esc(payload.receipt.receipt_id || "")}.</div></div>`
        : `<div class="alert alert-error">${icon("x")}<div><b>Not valid.</b> The receipt was changed, or it was not issued by this server.</div></div>`;
    } catch (err) {
      out.innerHTML = errorBox(err.message, { hint: err.hint });
    } finally { busy = false; btn.disabled = false; }
  });
  return { title: "Verify a receipt" };
}
