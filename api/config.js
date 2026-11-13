// Public runtime config for the browser. Only values that are safe to expose.
// The Supabase anon key is designed to be public; Row Level Security protects the data.
import { send, methodGuard } from "./_lib/http.js";

export default function handler(req, res) {
  if (!methodGuard(req, res, ["GET"])) return;
  send(res, 200, {
    supabaseUrl: process.env.SUPABASE_URL || null,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || null,
    oauth: {
      google: process.env.OAUTH_GOOGLE_ENABLED === "true",
      github: process.env.OAUTH_GITHUB_ENABLED === "true",
    },
    demoMode: process.env.DEMO_MODE !== "false",
  });
}
