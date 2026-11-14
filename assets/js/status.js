// Live status strip: real API health ping (every 15 s) and a UTC clock. No data is sent, only GET /api/health.
(function () {
  var api = document.getElementById("st-api"), ms = document.getElementById("st-ms"), clk = document.getElementById("st-clock"), dot = document.querySelector(".st-dot");
  if (!api || !clk || !dot) return;
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function tick() { var d = new Date(); clk.textContent = "UTC " + pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()) + ":" + pad(d.getUTCSeconds()); }
  function ping() {
    var t = performance.now();
    fetch("/api/health", { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("bad"); return r.json(); })
      .then(function () { api.textContent = "API ONLINE"; ms.textContent = Math.round(performance.now() - t) + " ms"; dot.classList.remove("off"); })
      .catch(function () { api.textContent = "API OFFLINE"; ms.textContent = ""; dot.classList.add("off"); });
  }
  tick(); setInterval(tick, 1000); ping(); setInterval(ping, 15000);
})();
