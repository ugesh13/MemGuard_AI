// Minimal History-API router. Vercel rewrites every non-file path to index.html.
const routes = new Map();
let current = null;
let onChange = () => {};

export function route(path, view, opts = {}) { routes.set(path, { view, ...opts }); }
export function onRoute(fn) { onChange = fn; }

export function navigate(path, { replace = false } = {}) {
  if (replace) history.replaceState(null, "", path);
  else history.pushState(null, "", path);
  render();
}

export function currentPath() { return location.pathname.replace(/\/+$/, "") || "/"; }

export async function render() {
  const path = currentPath();
  const r = routes.get(path) || routes.get("*");
  if (current && current.unmount) { try { current.unmount(); } catch { /* ignore */ } }
  current = null;
  current = await onChange(path, r);
}

export function startRouter() {
  window.addEventListener("popstate", render);
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-link]");
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || a.target === "_blank") return;
    const href = a.getAttribute("href");
    if (!href || !href.startsWith("/")) return;
    e.preventDefault();
    navigate(href);
  });
  render();
}
