// Stock and comparison views (Milestone 3). Thresholds and zones come from config.yaml via index.json.
"use strict";
const ui = { range: "8", stmt: "q", cmpMetric: "roic", cmpSort: null };
try { Object.assign(ui, JSON.parse(localStorage.getItem("stocktool.ui") || "{}")); } catch {}
const saveUi = () => { try { localStorage.setItem("stocktool.ui", JSON.stringify(ui)); } catch {} };

const PILLARS = [["growth", "Growth"], ["quality", "Quality"], ["valuation", "Valuation"], ["context", "Context (not scored)"]];
// how each metric is charted: hist = quarterly series key; est = forward snapshot key shown as the latest point
// forward metrics: the value and its history come from analyst estimates only (never from reported results)
// Each is drawn as one chart: the reported (TTM) series by quarter, continued by analyst estimates.
// keyed by the scored (reported) metric; fkey = the analyst estimate overlaid on the same chart (unscored)
const CHART_SPEC = {
  rev_growth_yoy: { forward: true, fkey: "fwd_rev_growth", title: "Revenue growth", next: "fwd_rev_growth_next" },
  eps_growth_yoy: { forward: true, fkey: "fwd_eps_growth", title: "EPS growth", next: "fwd_eps_growth_next", revisions: true,
    note: "Estimates use analysts' adjusted EPS; the reported line is GAAP diluted EPS, so part of a gap can be accounting rather than outlook." },
  peg_ttm: { forward: true, fkey: "fwd_peg", title: "PEG", gauge: true },
};
const MERGED_REPORTED = new Set(); // reported twins are now the scored metrics themselves

// ---- one-line explanations ("i" buttons): metric texts live in config.yaml (about:), the rest here
const ABOUT_EXTRA = {
  price: "Last traded price of the shares you'd buy (for TSM, the US-listed ADR).",
  eps_ttm: "Diluted earnings per share over the last four reported quarters. Lynch's starting point: over time a stock follows its earnings.",
  mcap: "Price × shares outstanding: what the market values the whole company at today.",
  fwd_pe: "Price divided by expected EPS for the fiscal year in progress. Lynch judged a P/E only against the company's growth rate, never on its own.",
  pricechg: "Share-price change. Lynch cared little about short-term moves; shown for context, not scored.",
  stmt_rev: "Sales and bottom-line profit by quarter (or trailing 12 months). Lynch looked for both to rise together, year after year.",
  stmt_fcf: "Operating cash flow minus capital spending. Cash, not accounting profit, is what funds growth, dividends and buybacks.",
  alloc: "Type the amount you want to invest: it is split over Strong Buy and Buy stocks, more to higher scores (the workbook's DCA Plan rules, editable in config.yaml), and turned into whole shares at the last price.",
  overall: "The workbook's overall score: Growth 40%, Quality 30%, Valuation 30%, each the average of its metrics' points. Signals: Strong Buy, Buy, Hold, Caution, Avoid (cut-offs in config.yaml).",
  buy_score: "Business^0.7 × Valuation^0.3: Lynch's 'great company at a fair price' test. Unlike the overall average, a weak price drags a great business down (and vice versa).",
  business: "Growth and Quality only (valuation left out): is the company itself getting better, regardless of the share price?",
  outlook: "Warnings from analyst estimates: sharp slowdown expected next year, estimates being cut, or estimates far below reported growth. Shown next to the score but never scored.",
  stmt_cash: "Cash and short-term investments vs total debt at each quarter end. Lynch: more cash than debt means the company can't go bankrupt in a downturn.",
};
function aboutText(key) {
  const cfg = state.index.config;
  return (cfg.metrics[key] || cfg.reference_metrics[key] || {}).about || ABOUT_EXTRA[key] || "";
}
function infoBtn(key) { return ""; } // metric explanations live in the Methodology tab
function noteBtn(text) {
  return ` <button class="info" type="button" data-note="${esc(text)}" aria-label="More information">i</button>`;
}
// band legend under a chart: ✓ favorable, ~ mediocre, ✗ unfavorable, - - full points
function bandLegend(edges, hib, f, fullAt) {
  if (!edges) return "";
  const [a, b] = edges;
  const t = (v) => tidyLabel(f(v));
  const parts = hib
    ? [`<span class="bl ok">✓</span> ≥ ${t(b)}`, `<span class="bl mid">~</span> ${t(a)} to ${t(b)}`, `<span class="bl bad">✗</span> &lt; ${t(a)}`]
    : [`<span class="bl ok">✓</span> ≤ ${t(b)}`, `<span class="bl mid">~</span> ${t(b)} to ${t(a)}`, `<span class="bl bad">✗</span> &gt; ${t(a)}`];
  if (fullAt != null) parts.push(`<span class="bl full">- -</span> full points ${hib ? "" : "≤ "}${t(fullAt)}`);
  return `<div class="bands">${parts.map((x) => `<span>${x}</span>`).join("")}</div>`;
}
const tidyLabel = (txt) => String(txt).replace(/(\d)\.(\d*?)0+(?=\D*$)/, (m, a, b) => (b ? `${a}.${b}` : a));
const pop = (() => {
  const el = document.createElement("div");
  el.className = "about-pop"; el.setAttribute("role", "tooltip"); el.hidden = true;
  document.body.appendChild(el);
  let owner = null, pinned = false;
  const show = (btn) => {
    owner = btn;
    el.textContent = btn.dataset.note || aboutText(btn.dataset.about);
    el.hidden = false;
    const r = btn.getBoundingClientRect(), w = Math.min(320, window.innerWidth - 24);
    el.style.width = w + "px";
    el.style.left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2)) + "px";
    const below = r.bottom + 8 + el.offsetHeight < window.innerHeight;
    el.style.top = (below ? r.bottom + 8 : r.top - el.offsetHeight - 8) + "px";
  };
  const hide = () => { el.hidden = true; owner = null; pinned = false; };
  // mouse: show on hover; tap or click: pin open until tapped again or elsewhere
  document.addEventListener("pointerover", (e) => { const b = e.target.closest?.(".info"); if (b && e.pointerType === "mouse" && !pinned) show(b); });
  document.addEventListener("pointerout", (e) => { const b = e.target.closest?.(".info"); if (b && e.pointerType === "mouse" && !pinned) hide(); });
  document.addEventListener("click", (e) => {
    const b = e.target.closest?.(".info");
    if (b) {
      e.preventDefault(); e.stopPropagation();
      if (owner === b && pinned) { hide(); return; }
      show(b); pinned = true; return;
    }
    hide();
  });
  document.addEventListener("focusin", (e) => { if (e.target.classList?.contains("info")) show(e.target); });
  document.addEventListener("focusout", (e) => { if (e.target.classList?.contains("info")) hide(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
  window.addEventListener("scroll", hide, { passive: true });
  window.addEventListener("hashchange", hide);
  return { hide };
})();

const catRules = (cat) => (state.index.config.category_rules || {})[cat || state.index.config.categories?.default] || {};
const catLabel = (cat) => catRules(cat).label || cat || "";
// metric definitions; with a category, its own thresholds (e.g. stalwart growth expectations) replace the defaults
function metricDefs(category) {
  const cfg = state.index.config;
  const over = category ? (catRules(category).thresholds || {}) : {};
  const cuts = cfg.zones?.score_cuts || [3.33, 6.67];
  const at = (m, s) => (s <= 5 ? m.min + ((m.mid - m.min) * s) / 5 : m.mid + ((m.max - m.mid) * (s - 5)) / 5);
  const defs = [];
  for (const [key, m0] of Object.entries(cfg.metrics)) {
    const m = { ...m0, ...(over[key] || {}) };
    defs.push({ key, ...m, edges: [at(m, cuts[0]), at(m, cuts[1])], scored: true });
  }
  for (const [key, m] of Object.entries(cfg.reference_metrics)) {
    if (key === "yahoo_peg_5y") continue; // shown inside the PEG card
    const edges = m.bands || (m.min != null ? [at(m, cuts[0]), at(m, cuts[1])] : null);
    defs.push({ key, ...m, pillar: "context", edges, scored: false });
  }
  return defs;
}
const higherIsBetter = (def) => !def.edges || def.edges[1] > def.edges[0];

function fmtKind(kind) {
  return { pct: "pct", x: "x", x1: "x1", x2: "x2" }[kind] || "x2";
}
function deltaText(v, prev, kind) {
  if (v == null || prev == null) return null;
  const d = v - prev;
  if (kind === "pct") return `${d >= 0 ? "+" : "−"}${Math.abs(d * 100).toFixed(1)} pp`;
  return `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(kind === "x1" ? 1 : 2)}`;
}
function deltaHtml(v, prev, def, label) {
  const t = deltaText(v, prev, def.format);
  if (t == null) return `<span class="delta">${label} –</span>`;
  const up = v > prev, flat = Math.abs(v - prev) < 1e-12;
  const good = flat ? null : up === higherIsBetter(def);
  return `<span class="delta ${good == null ? "" : good ? "good" : "bad"}"${def.format === "pct" ? ' title="pp = percentage points: the change in the percentage itself"' : ""}>${flat ? "■" : up ? "▲" : "▼"} ${t} <span class="dl">${label}</span></span>`;
}
function zoneChip(v, def) {
  const z = Charts.zoneOf(v, def.edges);
  if (z == null) return "";
  const icon = ["▼", "■", "▲"][z];
  return `<span class="chip z${z}"><span aria-hidden="true">${icon}</span> ${Charts.ZONE_NAMES[z]}</span>`;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const shortLabel = (l) => l.replace(/^FQ(\d) FY(\d\d) \((\w+) (\d{4})\)$/, (_, q, fy, mon, yr) => `${mon} ${yr.slice(2)}`);

function sliceQuarters(qs) {
  if (ui.range === "all") return qs;
  return qs.slice(-Number(ui.range));
}

// drawdown: latest close vs the highest close in the last `days` days (0 or negative)
function fromHigh(series, days) {
  const { dates, close } = series;
  const cut = new Date(dates[dates.length - 1]); cut.setUTCDate(cut.getUTCDate() - days);
  const c = cut.toISOString().slice(0, 10);
  const win = close.filter((_, i) => dates[i] >= c);
  return win.length ? close[close.length - 1] / Math.max(...win) - 1 : null;
}

function pctChange(series, daysBack) {
  const { dates, close } = series;
  const last = close[close.length - 1];
  const target = new Date(dates[dates.length - 1]); target.setUTCDate(target.getUTCDate() - daysBack);
  const t = target.toISOString().slice(0, 10);
  let i = dates.findIndex((d) => d >= t);
  if (i < 0) return null;
  return last / close[i] - 1;
}

// value of a forward series on or before `daysBack` days before its last point
function seriesAgo(series, daysBack) {
  if (!series?.length) return null;
  const last = new Date(series[series.length - 1].date + "T00:00:00Z");
  last.setUTCDate(last.getUTCDate() - daysBack);
  const cut = last.toISOString().slice(0, 10);
  const pts = series.filter((p) => p.date <= cut && p.value != null);
  return pts.length ? pts[pts.length - 1] : null;
}
const shortDate = (iso) => new Date(iso + "T00:00:00Z").toLocaleDateString("en", { day: "numeric", month: "short", timeZone: "UTC" });
const fyName = (iso) => iso ? `FY ending ${new Date(iso + "T00:00:00Z").toLocaleDateString("en", { month: "short", year: "numeric", timeZone: "UTC" })}` : "fiscal year in progress";

const fyTag = (iso, plus = 0) => iso ? `FY${String((Number(iso.slice(0, 4)) + plus) % 100).padStart(2, "0")}E` : "FY E";
const addYears = (iso, k) => `${Number(iso.slice(0, 4)) + k}${iso.slice(4)}`;
const dayNum = (iso) => Date.parse(iso + "T00:00:00Z") / 864e5;

function forwardCard(card, def, d, f, f1, t, qs) {
  const spec = CHART_SPEC[def.key];
  const series = (d.forward_series || {})[spec.fkey] || [];
  const repDef = { ...def, edges: def.edges };
  const rep = qs.map((q) => q.metrics[def.key]);
  const lastQ = qs[qs.length - 1];
  const rv = rep[rep.length - 1], rPrev = rep[rep.length - 2], rYago = rep[rep.length - 5];
  const v = f[spec.fkey];
  const m30 = seriesAgo(series, 30), m90 = seriesAgo(series, 85);
  const fy0 = fyTag(f.fy_in_progress_end), fy1 = fyTag(f.fy_in_progress_end, 1);
  let nextV = spec.next ? f[spec.next] : null;
  if (def.key === "peg_ttm" && f.price && f.eps_est_1y > 0 && f.fwd_eps_growth_next > 0) {
    const capN = state.index.config.settings?.peg_growth_cap;
    nextV = (f.price / f.eps_est_1y) / ((capN ? Math.min(f.fwd_eps_growth_next, capN) : f.fwd_eps_growth_next) * 100);
  }
  const cell = (cap, val, chipDef) => `<div><span class="cap">${cap}</span><span class="big">${f1(val)}</span></div>`;
  let rev = "";
  if (spec.revisions && f.eps_revisions?.["0y"]) {
    const r = f.eps_revisions["0y"];
    rev = `<span class="delta">${r.upLast30days ?? 0} raised · ${r.downLast30days ?? 0} cut (30d)</span>`;
  }
  const notes = [];
  if (def.key === "peg_ttm") {
    const cap = state.index.config.settings?.peg_growth_cap;
    const capTxt = cap ? `, capped at ${Math.round(cap * 100)}%` : "";
    const gs = lastQ.metrics.peg_growth;
    notes.push(`Backward PEG: P/E on last-12-month earnings ÷ sustainable EPS growth = the lower of 1-year growth and the 3-year CAGR${capTxt} (now ${gs != null ? (gs * 100).toFixed(0) + "%" : "–"}); the chart line uses each quarter-end price. Forward PEG: P/E on ${fy0.slice(0, 4)} expected EPS (${f.fwd_pe != null ? f.fwd_pe.toFixed(1) : "–"}) ÷ expected EPS growth (${f.fwd_eps_growth != null ? (f.fwd_eps_growth * 100).toFixed(0) : "–"}%${capTxt})${nextV != null ? `; ${fy1.slice(0, 4)} estimate ${f1(nextV)}` : ""}. Gray marker on the forward gauge: Yahoo's 5-year PEG ${f.yahoo_peg_5y != null ? f.yahoo_peg_5y.toFixed(2) : "–"} (uncapped).`);
  }
  if (spec.note) notes.push(spec.note);
  if (def.key === "peg_ttm" && catRules(d.category).valuation_on_mid_cycle) {
    const pm = lastQ.metrics.peg_mid_cycle, pe = lastQ.metrics.pe_mid_cycle;
    notes.push(`${t} is tagged cyclical, so the score uses mid-cycle PEG: P/E on the average of the last 3 years' earnings (${pe != null ? pe.toFixed(1) + "×" : "no positive average"}) ÷ sustainable growth = ${pm != null ? pm.toFixed(2) : "–"}. The chart shows the regular PEG.`);
  }
  card.innerHTML = `<div class="card-h"><span>${esc(spec.title)}${notes.length ? noteBtn(notes.join(" ")) : ""}</span><span class="sub">reported + estimates</span></div>
    <div class="chg-grid">
      <span class="chg-l">Trend</span>
      <span>${deltaHtml(rv, rPrev, def, "q/q")} ${deltaHtml(rv, rYago, def, "y/y")}</span>
      ${m30 || m90 || rev ? `<span class="chg-l">Analysts (${fy0.slice(0, 4)})</span>
      <span>${m30 ? deltaHtml(v, m30.value, def, "30d") : ""} ${m90 ? deltaHtml(v, m90.value, def, "90d") : ""} ${rev}</span>` : ""}
    </div>
    ${def.key === "peg_ttm" ? `<div class="gpair">
      <div><span class="gcap"><b>Backward PEG</b> · reported, scored</span><div class="g g-back"></div></div>
      <div><span class="gcap"><b>Forward PEG</b> · ${fy0.slice(0, 4)} estimates, not scored</span><div class="g g-fwd"></div></div>
    </div>` : ""}
    <div class="c"></div>
    <div class="legend"><span><i class="lk line"></i>${def.key === "peg_ttm" ? "Backward PEG (trailing 12 months)" : "Reported (trailing 12 months)"}</span><span><i class="lk ring2"></i>${def.key === "peg_ttm" ? "Forward PEG, today" : "Analyst estimate, full fiscal year"}</span></div>
    ${bandLegend(def.edges, higherIsBetter(def), f1, def.max)}`;
}

function drawForwardCharts(card, def, d, f, f1, t, qs) {
  const spec = CHART_SPEC[def.key];
  if (def.key === "peg_ttm") {
    const back = d.now?.values?.peg_ttm;
    Charts.gauge(card.querySelector(".g-back"), { lo: 0, hi: 4, edges: def.edges, aria: `Backward PEG gauge`,
      markers: [{ value: back, label: back != null ? f1(back) : "n/a" }] });
    if (back == null) card.querySelector(".g-back").insertAdjacentHTML("beforeend", '<div class="sub">Not meaningful: earnings or growth are not positive.</div>');
    Charts.gauge(card.querySelector(".g-fwd"), { lo: 0, hi: 4, edges: def.edges, aria: `Forward PEG gauge`,
      markers: [{ value: f[spec.fkey], label: f1(f[spec.fkey]) }, { value: f.yahoo_peg_5y, label: "5y", secondary: true }] });
  }
  const fyEnd = f.fy_in_progress_end;
  let points = [];
  if (def.key === "peg_ttm") {
    const today = (f.pulled_at || "").slice(0, 10);
    if (today) points.push({ x: dayNum(today), value: f[spec.fkey], label: "Today",
      title: `Today · ${fyTag(fyEnd).slice(0, 4)} estimate`, note: "P/E on expected EPS ÷ expected growth" });
  } else if (fyEnd) {
    points.push({ x: dayNum(fyEnd), value: f[spec.fkey], label: fyTag(fyEnd), title: `Estimate for ${fyName(fyEnd)}`,
      note: "growth of the full fiscal year vs the year before" });
    if (spec.next && f[spec.next] != null)
      points.push({ x: dayNum(addYears(fyEnd, 1)), value: f[spec.next], label: fyTag(fyEnd, 1), title: `Estimate for ${fyName(addYears(fyEnd, 1))}` });
  }
  Charts.lineChart(card.querySelector(".c"), {
    labels: qs.map((q) => shortLabel(q.label)),
    titles: qs.map((q) => q.label + (q.provisional ? " · provisional" : "")),
    xs: qs.map((q) => dayNum(q.period_end)),
    values: qs.map((q) => q.metrics[def.key]),
    fmt: f1, edges: def.edges, height: 190, aria: `${spec.title}: reported and estimates`, fullAt: def.max,
    ...(def.key === "peg_ttm" ? { tickFmt: (v) => v.toFixed(1) } : {}),
    deltaFmt: (a, b) => deltaText(a, b, def.format),
    overlay: { name: "analyst estimate", points },
  });
}

async function stockView(t, sub) {
  const view = sub === "scorecard" || sub === "metrics" ? sub : (ui.stockSub || "metrics");
  ui.stockSub = view; saveUi();
  const [d, px] = await Promise.all([doc(t), load(`${t}_prices`).catch(() => null)]);
  const all = d.quarters;
  const qs = sliceQuarters(all);
  const last = all[all.length - 1];
  const f = d.forward || {};
  const defs = metricDefs(d.category);
  const ccy = d.currency;
  const mm = (k) => qs.map((q) => q.metrics[k]);

  // ---- header: price, EPS, market cap, price change, price chart
  const changes = px ? [["From 12-month high", null], ["1 month", 30], ["1 year", 365]].map(([l, days]) => [l, days == null ? fromHigh(px, 365) : pctChange(px, days)]) : [];
  const chgTiles = changes.map(([l, c]) => c == null ? "" : l === "From 12-month high"
    ? `<div class="tile chg ${c > -0.0005 ? "up" : "down"}"><div class="k">${l}</div><div class="v">${c > -0.0005 ? "At the high" : "▼ −" + Math.abs(c * 100).toFixed(1) + "%"}</div></div>`
    : `<div class="tile chg ${c >= 0 ? "up" : "down"}"><div class="k">${l}</div><div class="v">${c >= 0 ? "▲ +" : "▼ −"}${Math.abs(c * 100).toFixed(1)}%</div></div>`).join("");
  const epsNote = t === "TSM" ? "per share, NT$" : "per share";
  const subtabs = `<div class="subtabs" role="tablist">
      <a role="tab" href="#${esc(t)}/metrics" class="subtab ${view === "metrics" ? "on" : ""}" aria-selected="${view === "metrics"}">Metrics</a>
      <a role="tab" href="#${esc(t)}/scorecard" class="subtab ${view === "scorecard" ? "on" : ""}" aria-selected="${view === "scorecard"}">Scorecard</a>
    </div>`;
  const rangeCtl = `<div class="controls" role="group" aria-label="Quarters shown">
      <span class="ctl-l">Quarters</span>
      ${[["8", "8Q"], ["12", "12Q"], ["all", "All"]].map(([v, l]) => `<button class="seg ${ui.range === v ? "on" : ""}" data-range="${v}">${l}</button>`).join("")}
    </div>`;
  const pageHead = `
    <div class="title-row"><h1>${esc(t)} ${d.category ? `<span class="catchip">${esc(catLabel(d.category))}${noteBtn(catRules(d.category).about || "")}</span>` : ""}</h1>
      <div class="sub">Latest quarter <b>${esc(last.label)}</b>${last.provisional ? ' <span class="prov">provisional</span>' : ""} · next earnings ${esc(f.next_earnings || "–")}
      · estimates ${f.pulled_at ? ago(f.pulled_at) : "–"}${f.analysts ? ` · ${f.analysts} analysts` : ""}</div></div>
    ${subtabs}
    ${last.provisional ? `<div class="note">${esc(last.label)} uses Yahoo's figures until the SEC filing arrives. It will be replaced automatically and kept as an earlier version.</div>` : ""}`;

  if (view === "scorecard") {
    $("#view").innerHTML = `${pageHead}
      ${rangeCtl}
      <div id="scorecard"></div>
      <div id="scorecharts"></div>
      <p class="sub">How the scores are calculated: see the <a href="#method">Methodology</a> tab.</p>`;
    document.querySelectorAll("[data-range]").forEach((b) => b.addEventListener("click", () => { ui.range = b.dataset.range; saveUi(); route(true); }));
    renderScorecard($("#scorecard"), d, qs);
    renderScoreCharts($("#scorecharts"), d, qs);
    return;
  }

  $("#view").innerHTML = `${pageHead}
    <section class="hero">
      <div class="tiles">
        <div class="tile strong"><div class="k">Price (USD)</div><div class="v">${fmt(f.price, "usd")}</div></div>
        <div class="tile"><div class="k">EPS (TTM, ${epsNote})</div><div class="v">${fmt(last.metrics.eps_ttm, "x2")}</div></div>
        <div class="tile"><div class="k">Market cap (now)</div><div class="v">${fmt(f.market_cap_usd, "money", "USD")}</div></div>
        <div class="tile"><div class="k">Fwd P/E</div><div class="v">${f.fwd_pe != null ? f.fwd_pe.toFixed(1) + "×" : "–"}</div></div>
        ${chgTiles}
      </div>
      <div class="card"><div class="card-h"><span>Share price, last 12 months${infoBtn("pricechg")}</span></div><div id="pxchart"></div></div>
    </section>
    ${rangeCtl}
    <div id="pillars"></div>
    <h2>Financial statements</h2>
    <div class="controls" role="group" aria-label="Statement basis">
      ${[["q", "Quarterly"], ["ttm", "TTM"]].map(([v, l]) => `<button class="seg ${ui.stmt === v ? "on" : ""}" data-stmt="${v}">${l}</button>`).join("")}
    </div>
    <div class="grid3" id="stmts"></div>
    <details class="fold"><summary><span>Metric table</span><span class="chev" aria-hidden="true">▾</span></summary><div id="mtable"></div></details>
    <details class="fold"><summary><span>Sources: filings behind each quarter</span><span class="chev" aria-hidden="true">▾</span></summary><div id="srcs"></div></details>`;

  if (px) {
    const cut = new Date(px.dates[px.dates.length - 1]); cut.setUTCFullYear(cut.getUTCFullYear() - 1);
    const i0 = px.dates.findIndex((x) => x >= cut.toISOString().slice(0, 10));
    Charts.priceChart($("#pxchart"), px.dates.slice(i0), px.close.slice(i0), (v) => "$" + (v === 0 ? "0" : v >= 1000 ? Math.round(v).toLocaleString("en") : v.toFixed(v < 10 ? 2 : 0)));
  }
  document.querySelectorAll("[data-range]").forEach((b) => b.addEventListener("click", () => { ui.range = b.dataset.range; saveUi(); route(true); }));
  document.querySelectorAll("[data-stmt]").forEach((b) => b.addEventListener("click", () => { ui.stmt = b.dataset.stmt; saveUi(); route(true); }));

  // ---- metric trends, grouped by pillar
  const labels = qs.map((q) => shortLabel(q.label));
  const titles = qs.map((q) => q.label + (q.provisional ? " · provisional" : ""));
  const pill = $("#pillars");
  for (const [pk, pname] of PILLARS) {
    const ds = defs.filter((x) => x.pillar === pk);
    if (!ds.length) continue;
    const sec = document.createElement("section");
    sec.innerHTML = `<h2>${pname}${pk !== "context" ? ` <span class="sub">weight ${Math.round(state.index.config.pillars[pk].weight * 100)}%</span>` : ""}</h2><div class="grid3"></div>`;
    pill.appendChild(sec);
    const grid = sec.querySelector(".grid3");
    for (const def of ds) {
      if (MERGED_REPORTED.has(def.key)) continue;
      const spec = CHART_SPEC[def.key] || { hist: def.key };
      const card = document.createElement("div");
      card.className = "card metric";
      const kind = fmtKind(def.format);
      const f1 = (v) => fmt(v, kind, ccy);
      if (spec.forward) {
        forwardCard(card, def, d, f, f1, t, qs);
        grid.appendChild(card);
        drawForwardCharts(card, def, d, f, f1, t, qs);
        continue;
      }
      if (def.forward_only) {  // forward P/E: estimate-based, plotted by date
        const series = ((d.forward_series || {})[def.key] || []).filter((p) => p.value != null);
        const fv = f[def.key], m30 = seriesAgo(series, 30), m90 = seriesAgo(series, 85);
        card.innerHTML = `<div class="card-h"><span>${esc(def.label)}${noteBtn("Today's share price divided by analysts' EPS estimate for the fiscal year in progress (" + fyName(f.fy_in_progress_end) + "). Earlier points use Yahoo's 90-day EPS-estimate trend with the price on that day; later points are daily snapshots.")}</span></div>
          <div class="deltas">${m30 ? deltaHtml(fv, m30.value, def, "30d") : ""} ${m90 ? deltaHtml(fv, m90.value, def, "90d") : ""}</div>
          <div class="c"></div>${bandLegend(def.edges, higherIsBetter(def), f1)}`;
        grid.appendChild(card);
        if (series.length) {
          Charts.lineChart(card.querySelector(".c"), {
            labels: series.map((p) => shortDate(p.date)), titles: series.map((p) => `${shortDate(p.date)} · ${fyName(p.fy_end)}`),
            xs: series.map((p) => dayNum(p.date)), values: series.map((p) => p.value), fmt: f1, edges: def.edges,
            aria: `${def.label} over time`, deltaFmt: null,
          });
        } else card.querySelector(".c").innerHTML = '<div class="sub">No estimate history yet.</div>';
        continue;
      }
      const hist = mm(def.key);
      const cur = hist[hist.length - 1];
      const prev = hist[hist.length - 2], yago = hist[hist.length - 5];
      // P/E also shows today's value (latest earnings at today's price)
      let today = null;
      if (def.key === "pe_ttm" && f.market_cap_reporting && last.metrics.net_income_ttm > 0) {
        today = { x: dayNum((f.pulled_at || "").slice(0, 10)), value: f.market_cap_reporting / last.metrics.net_income_ttm, label: "Today",
          title: "Today: latest 12-month earnings at today's price" };
      }
      // metrics scored with a consistency factor (3Y EPS CAGR) say how steady the growth was
      const cons = def.consistency ? last.metrics[def.consistency] : null;
      const consTxt = cons != null ? `<span class="delta">EPS up in ${Math.round(cons * 12)} of the last 12 quarters (points × ${Math.round(cons * 100)}%)</span>` : "";
      card.innerHTML = `<div class="card-h"><span>${esc(def.label)}</span></div>
        <div class="deltas">${deltaHtml(cur, prev, def, "q/q")} ${deltaHtml(cur, yago, def, "y/y")} ${consTxt}</div>
        <div class="c"></div>
        ${bandLegend(def.edges, higherIsBetter(def), f1, def.max)}`;
      grid.appendChild(card);
      Charts.lineChart(card.querySelector(".c"), {
        labels, titles, values: hist, fmt: f1, edges: def.edges, aria: `${def.label} by quarter`, fullAt: def.max,
        deltaFmt: (a, b) => deltaText(a, b, def.format),
        ...(today ? { xs: qs.map((q) => dayNum(q.period_end)), overlay: { name: "today's price", zoneText: "", points: [today] } } : {}),
      });
    }
  }

  // ---- statements
  const st = $("#stmts");
  const money = (v) => fmt(v, "money", ccy);
  const ttm = ui.stmt === "ttm";
  const stmtCharts = [
    ["Revenue and net income", "stmt_rev", [["Revenue", ttm ? "revenue_ttm" : "revenue_q", "s1"], ["Net income", ttm ? "net_income_ttm" : "net_income_q", "s2"]]],
    ["Free cash flow", "stmt_fcf", [["Free cash flow", ttm ? "fcf_ttm" : "fcf_q", "s1"]]],
    ["Cash and debt (quarter end)", "stmt_cash", [["Cash + ST investments", "cash_and_st_inv", "s1"], ["Debt", "debt", "s2"]]],
  ];
  for (const [title, about, series] of stmtCharts) {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<div class="card-h"><span>${title}${infoBtn(about)}</span></div><div class="c"></div>` +
      (series.length > 1 ? `<div class="legend">${series.map(([n, , c]) => `<span><i class="lk box ${c}"></i>${n}</span>`).join("")}</div>` : "");
    st.appendChild(card);
    Charts.columnChart(card.querySelector(".c"), {
      labels, titles, fmt: money, aria: title,
      series: series.map(([name, key, cls]) => ({ name, cls, values: mm(key) })),
    });
  }

  // ---- table view (every charted value, plus changes)
  const tq = qs;
  const rowsT = [
    ...defs.filter((x) => !x.forward_only).map((x) => [x.key, x.label, fmtKind(x.format), x]),
    ["revenue_ttm", "TTM revenue", "money"], ["net_income_ttm", "TTM net income", "money"], ["fcf_ttm", "TTM FCF", "money"],
    ["eps_ttm", "TTM diluted EPS", "x2"], 
    ["market_cap_qe", "Market cap (qtr end)", "money"],
  ];
  const head = tq.map((q) => `<th>${esc(q.label).replace(" (", "<br>(")}${q.provisional ? ' <span class="prov">†</span>' : ""}</th>`).join("");
  const body = rowsT.map(([k, label, kind, def]) => {
    const vals = tq.map((q) => q.metrics[k]);
    const n = vals.length;
    const dq = def ? deltaText(vals[n - 1], vals[n - 2], def.format) : null;
    const dy = def ? deltaText(vals[n - 1], vals[n - 5], def.format) : null;
    return `<tr><td>${esc(label)}${def ? infoBtn(def.key) : ""}</td>${vals.map((v) => `<td>${fmt(v, kind, ccy)}</td>`).join("")}<td>${dq ?? "–"}</td><td>${dy ?? "–"}</td></tr>`;
  }).join("");
  $("#mtable").innerHTML = `<div class="tablewrap"><table><thead><tr><th>Metric</th>${head}<th>Δ last qtr</th><th>Δ 1 yr</th></tr></thead><tbody>${body}</tbody></table></div>
    <p class="sub">† provisional. Δ for percentages is in percentage points (pp).</p>`;
  $("#srcs").innerHTML = all.slice(-12).reverse().map((q) => `<div class="src"><b>${esc(q.label)}</b>${q.max_version > 1 ? ` · ${q.max_version} versions` : ""}: ` +
    q.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.form)} ${esc(s.filed)}</a>`).join("") + "</div>").join("");
}

async function compareView(sub) {
  const tabsHtml = `<div class="subtabs" role="tablist">
      <a role="tab" href="#compare" class="subtab ${sub !== "side" ? "on" : ""}">Compare all</a>
      <a role="tab" href="#compare/side" class="subtab ${sub === "side" ? "on" : ""}">Side-by-side</a></div>`;
  if (sub === "side") {
    $("#view").innerHTML = `<h1>Compare</h1>${tabsHtml}<div id="sbswrap"></div>`;
    await sideBySideView($("#sbswrap"));
    return;
  }
  const docs = await Promise.all(state.index.tickers.map((x) => doc(x.ticker)));
  const defs = metricDefs();
  const valueOf = (d, def) => {
    const spec = CHART_SPEC[def.key];
    if (def.forward_only) return d.forward ? d.forward[def.key] : null;
    return d.quarters[d.quarters.length - 1].metrics[def.key];
  };
  if (!defs.find((x) => x.key === ui.cmpMetric)) ui.cmpMetric = "roic";
  const def = defs.find((x) => x.key === ui.cmpMetric);
  const kind = fmtKind(def.format);
  const options = PILLARS.map(([pk, pn]) => `<optgroup label="${pn}">${defs.filter((x) => x.pillar === pk)
    .map((x) => `<option value="${x.key}" ${x.key === ui.cmpMetric ? "selected" : ""}>${esc(x.label)}</option>`).join("")}</optgroup>`).join("");
  const hib = higherIsBetter(def);
  const rows = docs.map((d) => ({ name: d.ticker, value: valueOf(d, def), href: d.ticker,
    title: `${d.ticker} · ${d.quarters[d.quarters.length - 1].label}` }))
    .sort((a, b) => (a.value == null) - (b.value == null) || (hib ? b.value - a.value : a.value - b.value));

  // table: every metric, every stock, with zone glyphs; sortable
  const tdefs = defs;
  const sortKey = ui.cmpSort;
  let order = docs.slice();
  if (sortKey) {
    const sd = tdefs.find((x) => x.key === sortKey.key);
    if (sd) order.sort((a, b) => {
      const va = valueOf(a, sd), vb = valueOf(b, sd);
      if (va == null) return 1; if (vb == null) return -1;
      return sortKey.dir * (va - vb);
    });
  }
  const head = tdefs.map((x) => `<th><button class="th" data-sort="${x.key}">${esc(x.label)}${sortKey?.key === x.key ? (sortKey.dir > 0 ? " ↑" : " ↓") : ""}</button>${infoBtn(x.key)}</th>`).join("");
  const body = order.map((d) => {
    const last = d.quarters[d.quarters.length - 1];
    return `<tr><td><a href="#${d.ticker}">${d.ticker}</a> <span class="src">${esc(shortLabel(last.label))}${last.provisional ? " †" : ""}</span></td>` +
      tdefs.map((x) => {
        const v = valueOf(d, x), z = Charts.zoneOf(v, x.edges);
        return `<td>${fmt(v, fmtKind(x.format), d.currency)}${z != null ? ` <span class="glyph z${z}" title="${Charts.ZONE_NAMES[z]}">${["▼", "■", "▲"][z]}</span>` : ""}</td>`;
      }).join("") + "</tr>";
  }).join("");

  $("#view").innerHTML = `<h1>Compare</h1>${tabsHtml}
    <div class="sub">Latest reported quarter for each stock. † = provisional (from Yahoo until the SEC filing arrives).</div>
    <div class="controls"><label class="ctl-l" for="cmpm">Metric</label><select id="cmpm">${options}</select></div>
    <div class="card"><div class="card-h"><span>${esc(def.label)}, ranked${infoBtn(def.key)}</span><span class="sub">${hib ? "higher is better" : "lower is better"}</span></div><div id="rank"></div></div>
    <details class="fold" id="allfold" ${ui.cmpTableOpen ? "open" : ""}><summary><span>All metrics, all stocks</span><span class="chev" aria-hidden="true">▾</span></summary><div>
    <div class="legend"><span><span class="glyph z2">▲</span> Favorable</span><span><span class="glyph z1">■</span> Mediocre</span><span><span class="glyph z0">▼</span> Unfavorable</span><span class="sub">Click a column to sort.</span></div>
    <div class="tablewrap"><table class="cmp"><thead><tr><th>Ticker</th>${head}</tr></thead><tbody>${body}</tbody></table></div></div></details>`;
  $("#allfold").addEventListener("toggle", (e) => { ui.cmpTableOpen = e.target.open; saveUi(); });
  Charts.rankChart($("#rank"), { rows, fmt: (v) => fmt(v, kind, "USD"), edges: def.edges, aria: `${def.label} by stock` });
  $("#cmpm").addEventListener("change", (e) => { ui.cmpMetric = e.target.value; saveUi(); route(true); });
  document.querySelectorAll("[data-sort]").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.sort, sd = tdefs.find((x) => x.key === k);
    const dflt = higherIsBetter(sd) ? -1 : 1;
    ui.cmpSort = ui.cmpSort?.key === k ? { key: k, dir: -ui.cmpSort.dir } : { key: k, dir: dflt };
    saveUi(); route(true);
  }));
}
