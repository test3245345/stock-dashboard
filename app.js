// Stock Scorecard: static dashboard shell. Data comes from data/*.json, written by the scheduled refresh.
const state = { index: null, docs: {} };
const $ = (s) => document.querySelector(s);

function fmt(v, kind, ccy) {
  if (v === null || v === undefined || Number.isNaN(v)) return "–";
  if (kind === "pct") return (v * 100).toFixed(1) + "%";
  if (kind === "x1") return v.toFixed(1) + "×";
  if (kind === "x") return v.toFixed(2) + "×";
  if (kind === "usd") return "$" + v.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (kind === "x2") return v.toFixed(2);
  if (kind === "money") {
    const sym = ccy === "TWD" ? "NT$" : "$";
    if (v === 0) return sym + "0";
    const a = Math.abs(v);
    if (a >= 1e12) return sym + (v / 1e12).toFixed(2) + "T";
    if (a >= 1e9) return sym + (v / 1e9).toFixed(a >= 1e11 ? 0 : 1) + "B";
    return sym + (v / 1e6).toFixed(0) + "M";
  }
  return String(v);
}
const ago = (iso) => {
  const h = (Date.now() - new Date(iso).getTime()) / 36e5;
  return h < 1 ? "just now" : h < 48 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} days ago`;
};

// ---- data access: plain JSON locally, AES-GCM-encrypted files on the public site ----
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const store = { // browser storage can be blocked (private mode): never let that break the page
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

async function fetchText(path) {
  const r = await fetch(path, { cache: "no-store" });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.text();
}

async function decrypt(key, text) {
  const raw = b64(text.trim());
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, key, raw.slice(12));
  return new TextDecoder().decode(plain);
}

async function keyFromPassword(pw, meta) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: hexToBytes(meta.salt), iterations: meta.iterations }, base, 256);
  return bits;
}
const hexToBytes = (hex) => new Uint8Array(hex.match(/../g).map((h) => parseInt(h, 16)));
const aesKey = (bits) => crypto.subtle.importKey("raw", bits, "AES-GCM", false, ["decrypt"]);

function askPassword(meta) {
  return new Promise((resolve) => {
    $("#tabs").innerHTML = "";
    $("#freshness").textContent = "Locked";
    $("#view").innerHTML = `
      <form id="unlock" class="unlock">
        <h1>Unlock dashboard</h1>
        <p class="sub">The data on this site is encrypted. Enter the dashboard password.</p>
        <input id="pw" type="password" autocomplete="current-password" placeholder="Password" required>
        <label class="sub"><input id="remember" type="checkbox" checked> Remember on this device</label>
        <button type="submit">Unlock</button>
        <div id="pwmsg" class="sub"></div>
      </form>`;
    $("#pw").focus();
    $("#unlock").addEventListener("submit", async (e) => {
      e.preventDefault();
      $("#pwmsg").textContent = "Checking…";
      try {
        const bits = await keyFromPassword($("#pw").value, meta);
        const key = await aesKey(bits);
        await decrypt(key, meta.check); // throws on a wrong password
        if ($("#remember").checked) store.set(`stocktool.key.${meta.salt}`, toB64(bits));
        resolve(key);
      } catch {
        $("#pwmsg").innerHTML = '<span class="bad">Wrong password.</span>';
      }
    });
  });
}

async function unlock() {
  let meta = null;
  try { meta = JSON.parse(await fetchText("data/meta.json")); } catch { return null; } // no meta = plain local copy
  if (!meta.encrypted) return null;
  state.meta = meta;
  const saved = store.get(`stocktool.key.${meta.salt}`);
  if (saved) {
    try {
      const key = await aesKey(b64(saved));
      await decrypt(key, meta.check);
      return key;
    } catch { store.del(`stocktool.key.${meta.salt}`); }
  }
  return askPassword(meta);
}

async function load(name) {
  if (state.key) return JSON.parse(await decrypt(state.key, await fetchText(`data/${name}.enc`)));
  return JSON.parse(await fetchText(`data/${name}.json`));
}

function lock() {
  if (state.meta) store.del(`stocktool.key.${state.meta.salt}`);
  location.reload();
}

async function doc(t) {
  if (!state.docs[t]) state.docs[t] = await load(t);
  return state.docs[t];
}

function tabs(active) {
  const t = state.index.tickers.map((x) => x.ticker);
  const links = t.map((x) => `<a href="#${x}${ui.stockSub === "scorecard" ? "/scorecard" : ""}" class="${x === active ? "active" : ""}">${x}</a>`);
  links.push('<span class="sep"></span>');
  links.push(`<a href="#scores" class="${active === "scores" ? "active" : ""}">Scores</a>`);
  links.push(`<a href="#compare" class="${active === "compare" ? "active" : ""}">Compare</a>`);
  links.push(`<a href="#method" class="${active === "method" ? "active" : ""}">Methodology</a>`);
  links.push(`<a href="#status" class="${active === "status" ? "active" : ""}">Data status</a>`);
  $("#tabs").innerHTML = links.join("");
  $("#tabs a.active")?.scrollIntoView({ inline: "center", block: "nearest" });
}

async function statusView() {
  const run = state.index.run;
  const staleDays = state.index.config.settings.stale_after_days;
  const rows = state.index.tickers.map((x) => {
    const days = Math.round((Date.now() - new Date(x.period_end).getTime()) / 864e5);
    const stale = days > staleDays;
    const res = run.results.find((r) => r.ticker === x.ticker);
    return `<tr><td>${x.ticker}</td><td>${x.latest}</td><td class="${stale ? "bad" : "ok"}">${days} days${stale ? " · overdue" : ""}</td>
      <td>${x.provisional ? '<span class="prov">provisional</span>' : '<span class="ok">filed</span>'}</td>
      <td>${x.next_earnings || "–"}</td><td>${res ? res.new_fact_versions : "–"}</td><td>${res ? res.new_metric_versions : "–"}</td></tr>`;
  }).join("");
  const fails = run.failed.map((f) => `<div class="note"><b>${f.ticker}</b> failed: ${f.error}</div>`).join("");
  $("#view").innerHTML = `<h1>Data status</h1>
    <div class="sub">Last refresh ${run.finished_at} (${ago(run.finished_at)}) · status <b class="${run.status === "ok" ? "ok" : "bad"}">${run.status}</b> · run ${run.run_id}</div>
    ${fails}
    <div class="tablewrap"><table><thead><tr><th>Ticker</th><th>Latest quarter</th><th>Since quarter end</th><th>Latest figures</th>
    <th>Next earnings</th><th>New filings data this run</th><th>New metric versions this run</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="sub">History is append-only: a restated or newly filed quarter is stored as a new version, never overwritten.</p>`;
}

async function route(keepScroll) {
  const full = decodeURIComponent(location.hash.slice(1)) || state.index.tickers[0].ticker;
  const [h, sub] = full.split("/");
  tabs(h);
  try {
    if (h === "scores") await scoresView();
    else if (h === "compare") await compareView(sub);
    else if (h === "status") await statusView();
    else if (h === "method") await methodView();
    else await stockView(h, sub);
  } catch (e) {
    $("#view").innerHTML = `<div class="note">Could not load ${h}: ${e.message}</div>`;
  }
  if (!keepScroll) window.scrollTo(0, 0);
}

(async function init() {
  try {
    state.key = await unlock();
    state.index = await load("index");
  } catch (e) {
    $("#view").innerHTML = `<div class="note">No data yet: ${e.message}</div>`;
    return;
  }
  const run = state.index.run;
  $("#freshness").innerHTML = `Updated ${ago(run.finished_at)}${run.status !== "ok" ? ` · <span class="bad">${run.status}</span>` : ""}` +
    (state.key ? ' · <a href="#" id="lock">Lock</a>' : "");
  $("#lock")?.addEventListener("click", (e) => { e.preventDefault(); lock(); });
  window.addEventListener("hashchange", route);
  route();
})();
