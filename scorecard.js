// Milestone 4: scorecard (per stock) and the Scores overview. Scores are computed by the pipeline
// (stocktool/scoring.py, the workbook's formula) and stored per quarter with versions.
"use strict";

const PILLAR_ROWS = [["overall", "Overall"], ["p_growth", "Growth"], ["p_quality", "Quality"], ["p_valuation", "Valuation"]];
const SIGNAL_ORDER = ["STRONG BUY", "BUY", "HOLD", "CAUTION", "AVOID"];

// Heat color: diverging around the midpoint (5 points / 50%), green above, red below, neutral at the middle.
function heat(score10) {
  if (score10 == null) return "";
  const d = (score10 - 5) / 5; // -1..1
  const pct = Math.round(Math.min(1, Math.abs(d)) * 42);
  const col = d >= 0 ? "var(--z-good)" : "var(--z-bad)";
  return `background: color-mix(in srgb, ${col} ${pct}%, var(--surface));`;
}
const pctScore = (v) => (v == null ? "–" : Math.round(v * 100) + "");
const ptsScore = (v) => (v == null ? "–" : v.toFixed(1));
function signalOf(overall) {
  if (overall == null) return null;
  const cuts = Object.entries(state.index.config.signals).sort((a, b) => b[1] - a[1]);
  for (const [label, cut] of cuts) if (overall >= cut) return label;
  return "AVOID";
}
function signalChip(sig) {
  if (!sig) return "";
  const cls = { "STRONG BUY": "z2", BUY: "z2", HOLD: "z1", CAUTION: "z0", AVOID: "z0" }[sig];
  const icon = { "STRONG BUY": "▲▲", BUY: "▲", HOLD: "■", CAUTION: "▼", AVOID: "▼▼" }[sig];
  return `<span class="chip ${cls}"><span aria-hidden="true">${icon}</span> ${sig}</span>`;
}
function scoreDelta(a, b, scale = 100, unit = "") {
  if (a == null || b == null) return '<span class="delta">–</span>';
  const d = (a - b) * scale;
  const shown = Math.abs(d).toFixed(scale === 100 ? 0 : 1);
  if (Number(shown) === 0) return '<span class="delta">■ 0</span>';
  return `<span class="delta ${d > 0 ? "good" : "bad"}">${d > 0 ? "▲ +" : "▼ −"}${Math.abs(d).toFixed(scale === 100 ? 0 : 1)}${unit}</span>`;
}

function driverText(dr, ccy) {
  const def = metricDefs().find((x) => x.key === dr.metric);
  const kind = fmtKind(def.format);
  const eff = dr.effect * 100;
  return `<li><b class="${eff > 0 ? "good-t" : "bad-t"}">${eff > 0 ? "+" : "−"}${Math.abs(eff).toFixed(1)}</b>
    <span>${esc(def.label)}: ${fmt(dr.from, kind, ccy)} → ${fmt(dr.to, kind, ccy)}
    <span class="sub">(${ptsScore(dr.points_from)} → ${ptsScore(dr.points_to)} pts)</span></span></li>`;
}

function renderScorecard(el, d, qs) {
  const defs = metricDefs(d.category).filter((x) => x.scored);
  const now = d.now || {};
  const midCycle = !!catRules(d.category).valuation_on_mid_cycle;
  const ns = now.scores || {};
  const all = d.quarters;
  const lastQ = all[all.length - 1], prevQ = all[all.length - 2], yagoQ = all[all.length - 5];
  const mq = (q, k) => q?.metrics?.[k];
  const sig = now.signal;

  // ---- summary
  const pillarTiles = [["p_growth", "Growth"], ["p_quality", "Quality"], ["p_valuation", "Valuation"], ["buy_score", "Lynch buy score"], ["business", "Business trend"]]
    .map(([k, l]) => `<div class="stile"><div class="k">${l}${k === "buy_score" ? infoBtn("buy_score") : k === "business" ? infoBtn("business") : ""}</div>
      <div class="v" style="${heat(ns[k] != null ? ns[k] * 10 : null)}">${pctScore(ns[k])}</div>
      <div class="d">${scoreDelta(mq(lastQ, k), mq(prevQ, k))} q/q</div></div>`).join("");
  const flags = d.outlook || [];
  const flagHtml = flags.length
    ? `<ul class="flags">${flags.map((f) => `<li><span class="warn" aria-hidden="true">⚠</span> ${esc(f.text)}</li>`).join("")}</ul>`
    : `<div class="sub">No warnings: estimates don't point to a sharp slowdown, and analysts aren't cutting.</div>`;

  // ---- heatmap
  const cols = [...qs.map((q) => ({ q, label: shortLabel(q.label), title: q.label, prov: q.provisional })),
    { now: true, label: "Now", title: `Now: latest fundamentals at today's price (${(now.as_of || "").slice(0, 10)})` }];
  const val = (c, k) => (c.now ? (k.startsWith("s_") ? ns[k] : ns[k]) : mq(c.q, k));
  const rawKey = (k) => (k === "peg_ttm" && midCycle ? "peg_mid_cycle" : k);
  const raw = (c, k) => (c.now ? now.values?.[rawKey(k)] : mq(c.q, rawKey(k)));
  const head = cols.map((c, i) => `<th class="${c.now ? "nowcol" : ""}"><button class="th qbtn" data-col="${i}" title="${esc(c.title)}">${esc(c.label)}${c.prov ? " †" : ""}</button></th>`).join("");
  const rowPillar = PILLAR_ROWS.map(([k, l]) => `<tr class="${k === "overall" ? "row-overall" : "row-pillar"}"><td>${l}${k !== "overall" ? ` <span class="sub">${Math.round(state.index.config.pillars[k.slice(2)].weight * 100)}%</span>` : ""}</td>` +
    cols.map((c) => { const v = val(c, k); return `<td class="hc ${c.now ? "nowcol" : ""}" style="${heat(v != null ? v * 10 : null)}">${pctScore(v)}</td>`; }).join("") +
    `<td>${scoreDelta(val(cols[cols.length - 2], k), mq(prevQ, k))}</td></tr>`).join("");
  const pillarName = (p) => p[0].toUpperCase() + p.slice(1);
  const rowMetric = defs.map((def, i) => (i === 0 || defs[i - 1].pillar !== def.pillar
      ? `<tr class="grp"><td colspan="${cols.length + 2}">${pillarName(def.pillar)}</td></tr>` : "") +
    `<tr><td class="mname">${esc(def.label)}${def.key === "peg_ttm" && midCycle ? " (mid-cycle)" : ""}${infoBtn(def.key)}</td>` +
    cols.map((c) => {
      const v = val(c, `s_${def.key}`), r = raw(c, def.key);
      return `<td class="hc ${c.now ? "nowcol" : ""}" style="${heat(v)}" title="${esc(def.label)}: ${esc(fmt(r, fmtKind(def.format), d.currency))}">${ptsScore(v)}</td>`;
    }).join("") + `<td>${scoreDelta(mq(lastQ, `s_${def.key}`), mq(prevQ, `s_${def.key}`), 1)}</td></tr>`).join("");

  el.innerHTML = `
    <div class="sc-top">
      <div class="sc-overall">
        <div class="k">Overall score, now${infoBtn("overall")}</div>
        <div class="sc-big" style="${heat(ns.overall != null ? ns.overall * 10 : null)}">${pctScore(ns.overall)}</div>
        <div>${signalChip(sig)}</div>
        ${now.signal_cap ? `<div class="note capnote">Cyclical near the top of its cycle: operating margin is in the top ${Math.round((1 - (catRules(d.category).peak_margin_percentile ?? 0.8)) * 100)}% of its 5-year range, so the signal is capped at ${esc(now.signal_cap)} (the score alone says ${esc(now.signal_uncapped)}).</div>` : ""}
        <div class="deltas">${scoreDelta(mq(lastQ, "overall"), mq(prevQ, "overall"))}<span class="dl">q/q</span>
          ${scoreDelta(mq(lastQ, "overall"), mq(yagoQ, "overall"))}<span class="dl">y/y</span></div>
      </div>
      <div class="stiles">${pillarTiles}</div>
    </div>
    <div class="grid2">
      <div class="card"><div class="card-h"><span>What moved the score</span>
        <select id="drvq" aria-label="Quarter">${[...all.slice(-8).map((q) => `<option value="${q.period_end}">${esc(q.label)}</option>`), `<option value="now" selected>Now vs ${esc(shortLabel(lastQ.label))}</option>`].reverse().join("")}</select></div>
        <div id="drv"></div></div>
      <div class="card"><div class="card-h"><span>Outlook (analyst estimates, not scored)${infoBtn("outlook")}</span><span class="sub">${flags.length} warning${flags.length === 1 ? "" : "s"}</span></div>${flagHtml}</div>
    </div>
    <div class="tablewrap heatwrap"><table class="heat"><thead><tr><th>Score</th>${head}<th>Δ last qtr</th></tr></thead>
      <tbody>${rowPillar}${rowMetric}</tbody></table></div>
    <div class="sub">How to read this table${noteBtn("Pillars and overall in % (0–100); metrics in points (0–10): 0 at the threshold's min, 5 at mid, 10 at max. Hover a cell for the underlying value. \"Now\" re-prices valuation at today's price. † = provisional quarter.")}</div>`;

  const showDrivers = (key) => {
    let list, title;
    if (key === "now") { list = now.drivers || []; title = `Today's price vs ${lastQ.label} quarter end`; }
    else {
      list = (d.drivers || {})[key] || [];
      const i = all.findIndex((q) => q.period_end === key);
      title = i > 0 ? `${all[i].label} vs ${all[i - 1].label}` : "";
    }
    const i = all.findIndex((q) => q.period_end === key);
    const o1 = key === "now" ? ns.overall : mq(all[i], "overall"), o0 = key === "now" ? mq(lastQ, "overall") : mq(all[i - 1], "overall");
    $("#drv").innerHTML = `<div class="sub">${esc(title)}: overall ${pctScore(o0)} → ${pctScore(o1)} ${scoreDelta(o1, o0)}</div>` +
      (list.length ? `<ul class="drivers">${list.map((x) => driverText(x, d.currency)).join("")}</ul><div class="sub fine">Points added to or taken from the overall score${noteBtn("Effect on the overall score (0–100) of each metric, taken alone: the metric is put back to its previous value and the change in the overall score is measured.")}</div>`
        : `<div class="sub">No metric moved enough to change the score.</div>`);
  };
  $("#drvq").addEventListener("change", (e) => showDrivers(e.target.value));
  el.querySelectorAll(".qbtn").forEach((b) => b.addEventListener("click", () => {
    const c = cols[Number(b.dataset.col)];
    const key = c.now ? "now" : c.q.period_end;
    if ([...$("#drvq").options].some((o) => o.value === key)) { $("#drvq").value = key; showDrivers(key); $("#drvq").scrollIntoView({ block: "nearest" }); }
  }));
  showDrivers("now");
  const hw = el.querySelector(".heatwrap");
  if (hw) hw.scrollLeft = hw.scrollWidth; // open on the latest quarters and "Now" (narrow screens)
}

// ---- Scores overview: every stock, ranked, with history aligned by calendar quarter
async function scoresView() {
  const tk = state.index.tickers;
  const cqs = [...new Set(tk.flatMap((x) => (x.score_history || []).map((h) => h.cq)))].sort().slice(-8);
  const sortKey = ui.scoreSort || "overall";
  const rows = tk.slice().sort((a, b) => (b.now?.[sortKey] ?? -1) - (a.now?.[sortKey] ?? -1));
  const head = cqs.map((c) => `<th>${c.slice(2, 4)} ${c.slice(5)}</th>`).join("");
  const body = rows.map((x) => {
    const h = x.score_history || [];
    const byCq = Object.fromEntries(h.map((q) => [q.cq, q]));
    const last = h[h.length - 1], prev = h[h.length - 2], yago = h[h.length - 5];
    return `<tr><td><a href="#${x.ticker}">${x.ticker}</a></td>
      <td class="catcell">${esc(catLabel(x.category))}</td>
      <td>${signalChip(x.signal)}${x.signal_cap ? ' <span class="sub" title="Cyclical near its peak: signal capped">capped</span>' : ""}</td>
      <td class="hc" style="${heat(x.now?.overall != null ? x.now.overall * 10 : null)}"><b>${pctScore(x.now?.overall)}</b></td>
      <td>${scoreDelta(last?.overall, prev?.overall)}</td><td>${scoreDelta(last?.overall, yago?.overall)}</td>
      ${["p_growth", "p_quality", "p_valuation", "buy_score"].map((k) => `<td class="hc" style="${heat(x.now?.[k] != null ? x.now[k] * 10 : null)}">${pctScore(x.now?.[k])}</td>`).join("")}
      <td>${x.flags ? `<a href="#${x.ticker}" class="warnlink">⚠ ${x.flags}</a>` : '<span class="sub">–</span>'}</td>
      ${cqs.map((c) => { const q = byCq[c]; return `<td class="hc" style="${heat(q?.overall != null ? q.overall * 10 : null)}" title="${q ? esc(q.label) : ""}">${pctScore(q?.overall)}</td>`; }).join("")}
    </tr>`;
  }).join("");
  const sortBtn = (k, l) => `<button class="th" data-ssort="${k}">${l}${sortKey === k ? " ↓" : ""}</button>`;
  $("#view").innerHTML = `<h1>Scores</h1>
    <div class="sub">Overall score now (latest reported quarter, valuation at today's price), with its history by calendar quarter.
    Quarters of companies with other fiscal calendars are aligned to the nearest calendar quarter end. Click a stock for its scorecard.</div>
    <div class="tablewrap"><table class="heat overview"><thead><tr><th>Stock</th><th>Category</th><th>Signal</th><th>${sortBtn("overall", "Overall")}</th><th>Δ q/q</th><th>Δ y/y</th>
      <th>${sortBtn("p_growth", "Growth")}</th><th>${sortBtn("p_quality", "Quality")}</th><th>${sortBtn("p_valuation", "Valuation")}</th><th>${sortBtn("buy_score", "Lynch buy")}</th>
      <th>Outlook</th>${head}</tr></thead><tbody>${body}</tbody></table></div>
    <p class="sub">Signals: Strong Buy ≥ ${state.index.config.signals["STRONG BUY"] * 100}, Buy ≥ ${state.index.config.signals.BUY * 100}, Hold ≥ ${state.index.config.signals.HOLD * 100}, Caution ≥ ${state.index.config.signals.CAUTION * 100}, else Avoid (config.yaml). ⚠ = Outlook warnings from analyst estimates (not scored).</p>
    <div id="alloc"></div>`;
  document.querySelectorAll("[data-ssort]").forEach((b) => b.addEventListener("click", () => { ui.scoreSort = b.dataset.ssort; saveUi(); route(true); }));
  renderAllocator($("#alloc"));
}

// ---- score charts: overall + pillars (0–100), and each metric's points (0–10), by quarter, with "Now"
function renderScoreCharts(el, d, qs) {
  const cfg = state.index.config;
  const ns = d.now?.scores || {};
  const today = (d.now?.as_of || "").slice(0, 10);
  const xs = qs.map((q) => dayNum(q.period_end));
  const labels = qs.map((q) => shortLabel(q.label));
  const titles = qs.map((q) => q.label + (q.provisional ? " · provisional" : ""));
  const cuts = cfg.zones?.score_cuts || [3.33, 6.67];
  const sig = cfg.signals;
  el.innerHTML = `<h2>Scores over time</h2>
    <div class="grid2 sc-charts" id="pchart"></div>
    <h2>Metric points over time <span class="sub">0–10 per metric</span></h2>
    <div id="mchart"></div>`;
  const make = (host, title, key, scale, edges, about, sub, legend) => {
    const card = document.createElement("div");
    card.className = "card metric";
    const vals = qs.map((q) => (q.metrics[key] == null ? null : q.metrics[key] * scale));
    const nowV = ns[key] == null ? null : ns[key] * scale;
    const fmtS = scale === 100 ? (v) => Math.round(v) + "" : (v) => v.toFixed(1);
    card.innerHTML = `<div class="card-h"><span>${esc(title)}</span>${sub || ""}</div><div class="c"></div>
      ${legend || bandLegend(edges, true, fmtS)}`;
    host.appendChild(card);
    Charts.lineChart(card.querySelector(".c"), {
      labels, titles, xs, values: vals, fmt: fmtS, edges, height: 160,
      domain: scale === 100 ? [0, 100] : [0, 10], ticks: scale === 100 ? [0, 25, 50, 75, 100] : [0, 5, 10],
      aria: `${title} score by quarter`,
      deltaFmt: (a, b) => `${a - b >= 0 ? "+" : "−"}${Math.abs(a - b).toFixed(scale === 100 ? 0 : 1)}`,
      overlay: today && nowV != null ? { name: "now, at today's price", zoneText: "",
        points: [{ x: dayNum(today), value: nowV, label: "Now", title: `Now (${today}): latest fundamentals, today's price` }] } : null,
    });
  };
  const pc = el.querySelector("#pchart");
  make(pc, "Overall", "overall", 100, [sig.HOLD * 100, sig.BUY * 100], "overall", "",
    `<div class="bands"><span><span class="bl ok">✓</span> ≥ ${sig.BUY * 100} Buy or Strong Buy</span><span><span class="bl mid">~</span> ${sig.HOLD * 100} to ${sig.BUY * 100} Hold</span><span><span class="bl bad">✗</span> &lt; ${sig.HOLD * 100} Caution or Avoid</span></div>`);
  for (const [k, l] of [["p_growth", "Growth"], ["p_quality", "Quality"], ["p_valuation", "Valuation"]]) {
    make(pc, `${l} (${Math.round(cfg.pillars[k.slice(2)].weight * 100)}%)`, k, 100, [cuts[0] * 10, cuts[1] * 10]);
  }
  const mc = el.querySelector("#mchart");
  for (const [pk, w] of Object.entries(cfg.pillars)) {
    const ds = metricDefs().filter((x) => x.scored && x.pillar === pk);
    if (!ds.length) continue;
    const sec = document.createElement("section");
    sec.innerHTML = `<h3>${pk[0].toUpperCase() + pk.slice(1)} <span class="sub">weight ${Math.round(w.weight * 100)}%</span></h3><div class="grid3"></div>`;
    mc.appendChild(sec);
    for (const def of ds) make(sec.querySelector(".grid3"), def.label, `s_${def.key}`, 1, cuts, def.key);
  }
}

// ---- Methodology tab: generated from config.yaml so it always matches what is scored
async function methodView() {
  const cfg = state.index.config;
  const defs = metricDefs();
  const sig = cfg.signals;
  const fmtT = (v, f) => (f === "pct" ? `${+(v * 100).toFixed(1)}%` : `${v}×`);
  const rows = defs.filter((x) => x.scored).map((x) => `<tr><td>${esc(x.label)}</td><td>${esc(x.pillar)}</td>
    <td>${fmtT(x.min, x.format)}</td><td>${fmtT(x.mid, x.format)}</td><td>${fmtT(x.max, x.format)}</td>
    <td>${x.max < x.min ? "lower" : "higher"}</td><td class="wrap">${esc(x.about || "")}</td></tr>`).join("");
  const pil = Object.entries(cfg.pillars).map(([k, v]) => `<li><b>${k[0].toUpperCase() + k.slice(1)}</b> ${Math.round(v.weight * 100)}%: ${defs.filter((x) => x.scored && x.pillar === k).map((x) => esc(x.label)).join(", ")}</li>`).join("");
  $("#view").innerHTML = `<div class="method">
    <h1>Scorecard methodology</h1>
    <p class="sub">Generated from config.yaml, so it always matches what is actually scored. The formula is the one in your Excel workbook (Config and Scores tabs);
    the scoring code is tested to reproduce the workbook's scores exactly.</p>

    <h2>1. What is scored</h2>
    <p>Every quarter is scored the same way, on <b>reported</b> figures from SEC filings (10-Q/10-K, and TSMC's 6-K reports).
    Flow metrics use the trailing four quarters (TTM). Analyst estimates are shown next to the reported numbers but are <b>not scored</b>:
    they have no quarterly history, change daily, and can't be traced to a filing. They feed the Outlook warnings instead.</p>

    <h2>2. Points per metric (0–10)</h2>
    <p>Each metric earns <b>0 points at its minimum, 5 at the midpoint and 10 at the maximum</b>, in a straight line in between, capped at 0 and 10.
    For "lower is better" metrics (net debt/EBITDA, PEG) the minimum is the high number.
    Example: FCF yield 2% → 2 ÷ 3 × 5 = 3.3 points; 4% → 5 + (4 − 3) ÷ (5 − 3) × 5 = 7.5 points.</p>
    <p><b>Two metrics measure sustainable growth, as Lynch did</b> (changed on 14 November 2026, because the one-year versions gave every stock full points):</p>
    <ul>
      <li><b>3Y EPS CAGR</b>: average yearly EPS growth over three years, and its points are multiplied by <b>consistency</b>, the share of the
      last 12 quarters in which trailing EPS was higher than a year earlier. Steady growers keep full points; cyclical swings and one-off jumps
      score less. When EPS three years ago was zero or negative, 1-year growth is used instead (still multiplied by consistency).</li>
      <li><b>PEG</b>: P/E divided by <b>sustainable growth</b>, the lower of 1-year EPS growth and the 3-year CAGR${cfg.settings.peg_growth_cap
      ? `, capped at ${Math.round(cfg.settings.peg_growth_cap * 100)}% (Lynch rarely trusted growth above about 25% a year to last). The analyst-estimate PEG uses the same cap.`
      : ` (no cap). Each stock page shows both the <b>backward PEG</b> (reported earnings and growth, scored) and the <b>forward PEG</b> (analysts' P/E and growth for the fiscal year in progress, not scored).`}</li>
    </ul>
    <div class="tablewrap"><table class="mtab"><thead><tr><th>Metric</th><th>Pillar</th><th>0 pts</th><th>5 pts</th><th>10 pts</th><th>Better</th><th>What it is</th></tr></thead><tbody>${rows}</tbody></table></div>

    <h3>Context metrics (shown, not scored)</h3>
    <div class="tablewrap"><table class="mtab"><thead><tr><th>Metric</th><th>Bands</th><th>What it is</th></tr></thead><tbody>${defs.filter((x) => !x.scored)
      .map((x) => `<tr><td>${esc(x.label)}</td><td>${x.bands ? (x.bands[1] > x.bands[0] ? `favorable ≥ ${fmtT(x.bands[1], x.format)}, unfavorable &lt; ${fmtT(x.bands[0], x.format)}` : `favorable ≤ ${fmtT(x.bands[1], x.format)}, unfavorable &gt; ${fmtT(x.bands[0], x.format)}`) : "–"}</td><td class="wrap">${esc(x.about || "")}</td></tr>`).join("")}</tbody></table></div>
    <p class="sub">Revenue growth, EPS growth and PEG charts also show analysts' estimates (orange). Estimates use analysts' adjusted EPS, while the reported line is GAAP diluted EPS,
    so part of a gap between them can be accounting rather than outlook.</p>

    <h2>2b. Peter Lynch's stock categories</h2>
    <p>Lynch judged each kind of company by its own yardstick. Each stock carries a category from config.yaml (your judgement; edit it there):</p>
    <div class="tablewrap"><table class="mtab"><thead><tr><th>Category</th><th>Stocks</th><th>How it is scored</th></tr></thead><tbody>
      ${Object.entries(cfg.category_rules || {}).map(([k, r]) => `<tr><td>${esc(r.label || k)}</td>
        <td>${esc(state.index.tickers.filter((x) => x.category === k).map((x) => x.ticker).join(", ") || "–")}</td>
        <td class="wrap">${esc(r.about || "")}${r.thresholds ? " Growth thresholds: " + Object.entries(r.thresholds).map(([m, t]) => `${(cfg.metrics[m] || {}).label || m} ${t.min * 100}% / ${t.mid * 100}% / ${t.max * 100}%`).join("; ") + "." : ""}</td></tr>`).join("")}
    </tbody></table></div>

    <h2>3. Pillars and overall score (0–100)</h2>
    <ul>${pil}</ul>
    <p><b>Pillar score</b> = average of its metrics' points × 10 (metrics without data are skipped).
    <b>Overall</b> = the pillar scores weighted as above (re-weighted if a pillar has no data).</p>
    <p><b>Signal</b>: Strong Buy ≥ ${sig["STRONG BUY"] * 100}, Buy ≥ ${sig.BUY * 100}, Hold ≥ ${sig.HOLD * 100}, Caution ≥ ${sig.CAUTION * 100}, otherwise Avoid.</p>
    <p><b>Lynch buy score</b> = Business<sup>0.7</sup> × Valuation<sup>0.3</sup>, where Business is Growth and Quality weighted together.
    Unlike the overall average, a weak price pulls a great business down (and a cheap price can't rescue a weak one): Lynch's "great company at a fair price".
    <b>Business trend</b> = Growth and Quality only, so you can see whether the company itself is improving regardless of the share price.</p>

    <h2>4. Quarters, "Now" and versions</h2>
    <p>Each column of the heatmap is a reported quarter, valued at that quarter-end's share price. <b>Now</b> uses the latest quarter's fundamentals at
    today's price, so only the valuation metrics differ. A quarter marked † is provisional (from Yahoo) until the SEC filing arrives.
    Scores are stored with versions: if a company restates a quarter, the new score is added and the old one is kept.</p>
    <p><b>What moved the score</b> puts each metric back to its previous value, one at a time, and shows how much of the change in the overall score it explains.</p>

    <h2>5. Zones on the charts</h2>
    <p>Each metric's 0–10 points are split into thirds: <b>unfavorable</b> below ${cfg.zones.score_cuts[0]} points, <b>mediocre</b> up to ${cfg.zones.score_cuts[1]},
    <b>favorable</b> above. The overall score's chart uses the signal cut-offs instead (Buy and above, Hold, Caution and below).</p>

    <h2>6. Outlook warnings (not scored)</h2>
    <ul>
      <li>Next fiscal year's revenue or EPS growth estimate falls into a <b>lower zone</b> than this year's, or turns negative.</li>
      <li>This year's estimate is in a lower zone than the reported growth.</li>
      <li>This year's EPS estimate was <b>cut by more than ${cfg.outlook.estimate_cut_90d * 100}%</b> over 90 days.</li>
      <li>More analysts <b>cut</b> than raised this year's EPS estimate in the last 30 days.</li>
    </ul>

    <h2>7. Where the numbers come from</h2>
    <p>Reported figures: SEC EDGAR (XBRL company facts; TSMC's quarterly 6-K consolidated reports). Prices, FX and analyst estimates: Yahoo Finance.
    Every quarter on a stock's Metrics view links to the filings it uses. Data refreshes every day; history is never overwritten.</p>
    <h2>8. Deploy cash (Scores tab)</h2>
    <p>Only stocks with a <b>${esc((cfg.allocation?.eligible_signals || []).join(" or "))}</b> signal receive money; Hold and below get nothing.
    Each gets a weight of its ${cfg.allocation?.score === "overall" ? "overall score" : "Lynch buy score"} raised to the power ${cfg.allocation?.tilt ?? 2}
    (so stronger scores get clearly more), capped at ${Math.round((cfg.allocation?.max_share ?? 0.3) * 100)}% of the amount; orders under
    ${fmt(cfg.allocation?.min_order ?? 25, "usd")} are dropped. Whole shares: first the shares that fit each stock's target, then, strongest first, one more
    where that lands closer to the target, then any remainder strongest first (never past twice a stock's target). What can't be placed stays as cash.
    These are the rules of your workbook's DCA Plan, without current holdings. It is a calculation, not financial advice.</p>

    <p class="sub">To change thresholds, weights, signal cut-offs, warning or allocation rules, edit config.yaml in the GitHub repository; the dashboard rebuilds automatically.</p>
  </div>`;
}

// ---- Cash allocator: split an amount over Strong Buy / Buy stocks (rules in config.yaml → allocation),
// following the workbook's DCA Plan engine: weight = score^tilt, capped per stock, tiny orders dropped.
function allocate(amount, fractional) {
  const a = state.index.config.allocation || {};
  const elig = new Set(a.eligible_signals || ["STRONG BUY", "BUY"]);
  const key = a.score || "buy_score";
  const tilt = a.tilt ?? 2, minOrder = a.min_order ?? 25;
  let pool = state.index.tickers
    .filter((x) => elig.has(x.signal) && x.now?.[key] != null && x.price > 0)
    .map((x) => ({ t: x.ticker, signal: x.signal, score: x.now[key], price: x.price }))
    .sort((p, q) => q.score - p.score);
  const notes = [];
  let cap = a.max_share ?? 0.3;
  // weights with a per-stock cap (water-filling: capped names fixed, the rest re-spread)
  const shares = () => {
    const n = pool.length;
    if (!n) return;
    const c = Math.max(cap, 1 / n);
    if (c > cap) notes.push(`Only ${n} eligible stock${n === 1 ? "" : "s"}, so the ${Math.round(cap * 100)}% cap was raised to ${Math.round(c * 100)}% to place all the money.`);
    pool.forEach((p) => { p.w = p.score ** tilt; p.share = null; });
    let free = 1, open = pool.slice();
    for (;;) {
      const tw = open.reduce((s, p) => s + p.w, 0);
      const over = open.filter((p) => (p.w / tw) * free > c + 1e-12);
      if (!over.length) { open.forEach((p) => (p.share = (p.w / tw) * free)); break; }
      over.forEach((p) => { p.share = c; free -= c; });
      open = open.filter((p) => !over.includes(p));
      if (!open.length) break;
    }
  };
  shares();
  // drop orders below the minimum and re-spread
  for (;;) {
    const small = pool.filter((p) => p.share * amount < minOrder);
    if (!small.length || small.length === pool.length) break;
    small.forEach((p) => notes.push(`${p.t} dropped: its share (${fmt(p.share * amount, "usd")}) is below the ${fmt(minOrder, "usd")} minimum order.`));
    pool = pool.filter((p) => !small.includes(p));
    shares();
  }
  const capAmt = Math.max(cap, 1 / Math.max(pool.length, 1)) * amount;
  pool.forEach((p) => { p.target = p.share * amount; p.qty = 0; p.cost = 0; });
  let left = amount;
  if (fractional) {
    pool.forEach((p) => { p.qty = Math.floor((p.target / p.price) * 1000) / 1000; p.cost = p.qty * p.price; });
    left = amount - pool.reduce((s, p) => s + p.cost, 0);
  } else {
    // 1) whole shares up to each target
    pool.forEach((p) => { p.qty = Math.floor(p.target / p.price + 1e-9); p.cost = p.qty * p.price; });
    left = amount - pool.reduce((s, p) => s + p.cost, 0);
    // 2) strongest first: one more share where that lands closer to the target than stopping short
    for (const p of pool) {
      if (p.price <= left + 1e-9 && p.cost + p.price - p.target <= p.target - p.cost && p.cost + p.price <= capAmt + 1e-9) {
        p.qty += 1; p.cost += p.price; left -= p.price;
      }
    }
    // 3) spend what is left, strongest first, one share at a time: within the per-stock cap and never more
    //    than twice a stock's target (so a weak, cheap stock can't soak up money meant for stronger ones)
    for (let again = true; again;) {
      again = false;
      for (const p of pool) {
        const lim = Math.min(capAmt, 2 * p.target);
        if (p.price <= left + 1e-9 && p.cost + p.price <= lim + 1e-9) { p.qty += 1; p.cost += p.price; left -= p.price; again = true; break; }
      }
    }
    if (left > Math.min(...pool.map((p) => p.price))) {
      notes.push(`${fmt(left, "usd")} stays as cash: one more share of any stock would push it past its weight limit. A larger amount places it.`);
    }
    pool.filter((p) => p.qty === 0).forEach((p) => notes.push(`${p.t}: no shares; its share of the money (${fmt(p.target, "usd")}) is less than one share at ${fmt(p.price, "usd")}; the money went to other stocks, strongest first.`));
  }
  const excluded = state.index.tickers.filter((x) => !elig.has(x.signal)).map((x) => `${x.ticker} (${x.signal})`);
  return { rows: pool, left, notes, excluded, key, tilt, cap };
}

function renderAllocator(el) {
  let amount = 10000;
  try {
    const s = JSON.parse(localStorage.getItem("stocktool.alloc") || "{}");
    if (s.amount > 0) amount = s.amount;
  } catch {}
  const a = state.index.config.allocation || {};
  const scoreName = (a.score || "buy_score") === "buy_score" ? "Lynch buy score" : "overall score";
  el.innerHTML = `<div class="card alloc">
    <div class="card-h"><span>Deploy cash${infoBtn("alloc")}</span><span class="sub">Strong Buy and Buy only</span></div>
    <div class="alloc-in">
      <label>Amount (USD) <input id="amt" type="number" inputmode="decimal" min="0" step="100" value="${amount}"></label>
    </div>
    <div id="allocout"></div>
    <p class="sub fine">Prices from the last refresh (${esc(ago(state.index.tickers[0]?.price_at || state.index.generated_at))}). Not financial advice.${noteBtn(`A mechanical split using the rules in config.yaml: weight = ${scoreName}^${a.tilt ?? 2}, at most ${Math.round((a.max_share ?? 0.3) * 100)}% per stock, orders under ${fmt(a.min_order ?? 25, "usd")} dropped, whole shares, strongest first. Check the live price before placing an order.`)}</p>
  </div>`;
  const draw = () => {
    const amt = Number($("#amt").value) || 0;
    const frac = false; // whole shares only
    try { localStorage.setItem("stocktool.alloc", JSON.stringify({ amount: amt })); } catch {}
    if (amt <= 0) { $("#allocout").innerHTML = '<div class="sub">Enter an amount.</div>'; return; }
    const r = allocate(amt, frac);
    if (!r.rows.length) { $("#allocout").innerHTML = '<div class="note">No stock currently has a Strong Buy or Buy signal.</div>'; return; }
    const total = r.rows.reduce((s, p) => s + p.cost, 0);
    // the answer first (shares, cost), the reasons after: on a phone the first columns are what's visible
    const body = r.rows.map((p) => `<tr><td><a href="#${p.t}/scorecard">${p.t}</a></td>
      <td><b>${frac ? p.qty.toFixed(3) : p.qty}</b></td><td>${fmt(p.cost, "usd")}</td><td>${fmt(p.price, "usd")}</td>
      <td>${(p.share * 100).toFixed(1)}%</td><td>${pctScore(p.score)}</td><td>${signalChip(p.signal)}</td></tr>`).join("");
    $("#allocout").innerHTML = `<div class="tablewrap"><table class="alloc-t"><thead><tr><th>Stock</th><th>Shares to buy</th><th>Cost</th><th>Price</th><th>Weight</th><th>Score</th><th>Signal</th></tr></thead>
      <tbody>${body}</tbody><tfoot><tr><td>Total invested</td><td></td><td><b>${fmt(total, "usd")}</b></td><td colspan="4"></td></tr>
      <tr><td>Cash left over</td><td></td><td>${fmt(r.left, "usd")}</td><td colspan="4"></td></tr></tfoot></table></div>
      ${r.notes.length || r.excluded.length ? `<details class="fold"><summary><span>Details: why some stocks get no shares</span><span class="chev" aria-hidden="true">▾</span></summary><div>
        ${r.notes.length ? `<ul class="flags">${[...new Set(r.notes)].map((n) => `<li><span class="warn" aria-hidden="true">•</span> ${esc(n)}</li>`).join("")}</ul>` : ""}
        ${r.excluded.length ? `<div class="sub">Not buying (Hold and below): ${esc(r.excluded.join(", "))}.</div>` : ""}</div></details>` : ""}`;
  };
  $("#amt").addEventListener("input", draw);
  draw();
}
