// Local dev server: static files + /api/* functions + SPA fallback + the same security headers as vercel.json.
// Usage: RECEIPT_SIGNING_SECRET=dev-secret node scripts/serve.mjs   (PORT defaults to 5173)
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const vercel = JSON.parse(await readFile(join(root, "vercel.json"), "utf8"));
const globalHeaders = vercel.headers.find((h) => h.source === "/(.*)").headers;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".jsonl": "application/x-ndjson", ".svg": "image/svg+xml", ".woff": "font/woff", ".png": "image/png", ".py": "text/x-python; charset=utf-8", ".txt": "text/plain; charset=utf-8" };

const server = http.createServer(async (req, res) => {
  for (const h of globalHeaders) if (h.key !== "Strict-Transport-Security") res.setHeader(h.key, h.key === "Content-Security-Policy" ? h.value.replace("; upgrade-insecure-requests", "") : h.value);
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname.startsWith("/api/")) {
      const name = url.pathname.slice(5).replace(/[^a-z0-9-]/gi, "");
      const mod = await import(pathToFileURL(join(root, "api", `${name}.js`)).href);
      return await mod.default(req, res);
    }
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    let file = join(root, p);
    if (!file.startsWith(root)) throw new Error("bad path");
    let ok = false;
    try { ok = (await stat(file)).isFile(); } catch { ok = false; }
    if (!ok || /^\/(api|tests|scripts|supabase|node_modules)\//.test(p) || p === "/package.json") file = join(root, "index.html");
    const body = await readFile(file);
    res.setHeader("Content-Type", TYPES[extname(file)] || "application/octet-stream");
    if (file.endsWith("index.html")) res.setHeader("Cache-Control", "no-store");
    res.end(body);
  } catch (e) {
    if (e.code === "ERR_MODULE_NOT_FOUND") { res.statusCode = 404; res.setHeader("Content-Type", "application/json"); return res.end('{"error":{"code":"NOT_FOUND","message":"No such endpoint."}}'); }
    res.statusCode = 500; res.end("Server error");
  }
});
const port = Number(process.env.PORT || 5173);
server.listen(port, () => console.log(`MemGuard dev server on http://localhost:${port}`));
