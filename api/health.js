import { send, methodGuard } from "./_lib/http.js";

export default function handler(req, res) {
  if (!methodGuard(req, res, ["GET"])) return;
  send(res, 200, {
    status: "ok",
    service: "memguard-api",
    version: "1.0.0",
    time: new Date().toISOString(),
    components: {
      receipt_signing: Boolean(process.env.RECEIPT_SIGNING_SECRET),
      supabase: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),
    },
  });
}
