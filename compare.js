// Compare → Side-by-side: up to 3 stocks on the same charts. Each stock keeps one colour AND one marker shape
// everywhere (blue ●, orange ■, green ▲), shown in the picker, the value rows, the chart and the hover readout.
"use strict";

const SBS_SLOTS = [{ cls: "s1", shape: "circle", glyph: "●" }, { cls: "s2", shape: "square", glyph: "■" }, { cls: "s3", shape: "triangle", glyph: "▲" }];

// plain-language titles and one-line descriptions
const PLAIN = {
  rev_growth_yoy: ["Sales growth", "How much sales grew over the last 12 months, compared with the 12 months before."],
  eps_growth_yoy: ["Profit-per-share growth", "How much earnings per share grew over the last 12 months (EPS growth)."],
  rev_cagr_3y: ["Sales growth, 3-year average", "Average yearly sales growth over the last three years."],
  roic: ["Return on invested money", "Profit after tax for every $1 invested in the business (ROIC)."],
  fcf_margin: ["Cash kept from sales", "Cash left from each $1 of sales after paying for investment (free-cash-flow margin)."],
  net_debt_ebitda: ["Debt burden", "Years of profit needed to pay off debt. Below 0 means more cash than debt (net debt / EBITDA)."],
  peg_ttm: ["Price vs growth", "Share price relative to earnings, adjusted for growth. Around 1 is fair, below 1 is cheap (PEG)."],
  fcf_yield: ["Cash return on the price", "Yearly free cash flow as a share of the company's market value (FCF yield)."],
  rule_of_40: ["Growth + cash margin", "Sales growth plus free-cash-flow margin. 40% or more is strong (Rule of 40)."],
  p_fcf: ["Price vs cash flow", "Market value divided by yearly free cash flow: how many years of cash flow the price buys."],
};
const STMTS = [  // same wording as the stock pages
  ["revenue_ttm", "Revenue (TTM)", ""],
  ["net_income_ttm", "Net income (TTM)", ""],
  ["fcf_ttm", "Free cash flow (TTM)", ""],
  ["net_cash", "Cash minus debt (quarter end)", ""],
];

function svgShape(parent, shape, cx, cy, r, cls) {
  if (shape === "square") return Charts._svg("rect", { x: cx - r, y: cy - r, width: 2 * r, height: 2 * r, rx: 1, class: cls }, parent);
  if (shape === "triangle") return Charts._svg("path", { d: `M${cx},${cy - r * 1.2}L${cx + r * 1.15},${cy + r * 0.9}L${cx - r * 1.15},${cy + r * 0.9}Z`, class: cls }, parent);
  return Charts._svg("circle", { cx, cy, r, class: cls }, parent);
}

// Multi-stock line chart on a date axis (companies report on different calendars).
// series: [{ name, slot, points: [{ x: dayNumber, v, title }] }]
function multiLineChart(wrap, opts) {
  wrap.classList.add("chart");
  const tip = Charts._tip(wrap);
  Charts._responsive(wrap, (W) => {
    wrap.querySelector("svg")?.remove();
    const H = opts.height || 200, L = 52, R = 46, T = 12, B = 26;
    const all = opts.series.flatMap((s) => s.points.filter((p) => p.v != null));
    if (!all.length) { wrap.innerHTML = '<div class="sub">No data.</div>'; return; }
    let lo = Math.min(...all.map((p) => p.v)), hi = Math.max(...all.map((p) => p.v));
    if (opts.edges) { lo = Math.min(lo, ...opts.edges); hi = Math.max(hi, ...opts.edges); }
    if (opts.zeroLine) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    const pad = (hi - lo || Math.abs(hi) || 1) * 0.1;
    if (!(opts.zeroLine && lo === 0)) lo -= pad;   // money charts that never go below zero start at $0
    hi += pad;
    const ticks = Charts._ticks(lo, hi);
    lo = Math.min(lo, ticks[0]); hi = Math.max(hi, ticks[ticks.length - 1]);
    const x0 = Math.min(...all.map((p) => p.x)), x1 = Math.max(...all.map((p) => p.x));
    const x = (d) => L + (x1 === x0 ? (W - L - R) / 2 : ((d - x0) * (W - L - R)) / (x1 - x0));
    const y = (v) => T + ((hi - v) * (H - T - B)) / (hi - lo);
    const svg = Charts._svg("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.aria || "chart" });
    if (opts.edges) {
      const [a, b] = opts.edges, hib = b > a;
      const bounds = hib ? [[lo, a, 0], [a, b, 1], [b, hi, 2]] : [[lo, b, 2], [b, a, 1], [a, hi, 0]];
      for (const [z0, z1, zone] of bounds) {
        const top = y(Math.min(Math.max(z1, lo), hi)), bot = y(Math.max(Math.min(z0, hi), lo));
        if (bot - top > 0.5) Charts._svg("rect", { x: L, y: top, width: W - L - R, height: bot - top, class: `zone z${zone} faint` }, svg);
      }
    }
    for (const t of ticks) {
      if (t < lo || t > hi) continue;
      Charts._svg("line", { x1: L, x2: W - R, y1: y(t), y2: y(t), class: t === 0 && opts.zeroLine ? "baseline" : "grid" }, svg);
      const tx = Charts._svg("text", { x: L - 6, y: y(t) + 4, class: "tick", "text-anchor": "end" }, svg);
      tx.textContent = Charts._tidy(opts.fmt(t));
    }
    if (opts.fullAt != null && opts.fullAt >= lo && opts.fullAt <= hi) {
      Charts._svg("line", { x1: L, x2: W - R, y1: y(opts.fullAt), y2: y(opts.fullAt), class: "full-line" }, svg);
    }
    // x-axis: quarter ends as short month labels, spaced so they never collide
    const dates = [...new Set(all.map((p) => p.x))].sort((a, b) => a - b);
    // always label the latest date (bottom-right), then walk back keeping labels at least 60px apart
    const keep = [];
    let edge = Infinity;
    for (let k = dates.length - 1; k >= 0; k--) {
      const px = x(dates[k]);
      if (edge - px >= 60) { keep.push(dates[k]); edge = px; }
    }
    for (const d of keep) {
      const tx = Charts._svg("text", { x: x(d), y: H - 8, class: "tick", "text-anchor": "middle" }, svg);
      tx.textContent = new Date(d * 864e5).toLocaleDateString("en", { month: "short", year: "2-digit", timeZone: "UTC" });
    }
    // one line + one marker shape per stock
    const ends = [];
    opts.series.forEach((s) => {
      const slot = SBS_SLOTS[s.slot];
      const pts = s.points.filter((p) => p.v != null).sort((a, b) => a.x - b.x);
      if (!pts.length) return;
      Charts._svg("path", { d: pts.map((p, i) => `${i ? "L" : "M"}${x(p.x).toFixed(1)},${y(p.v).toFixed(1)}`).join(""), class: `mline ${slot.cls}` }, svg);
      pts.forEach((p) => svgShape(svg, slot.shape, x(p.x), y(p.v), 4, `mdot ${slot.cls}`));
      const last = pts[pts.length - 1];
      ends.push({ s, slot, px: x(last.x), py: y(last.v) });
    });
    // name each line at its end, only where the names don't overlap (the legend row above covers the rest)
    ends.sort((a, b) => a.py - b.py);
    let prevY = -1e9;
    for (const e of ends) {
      if (e.py - prevY < 13) continue;
      const tx = Charts._svg("text", { x: e.px + 8, y: e.py + 4, class: "end-label" }, svg);
      tx.textContent = e.s.name;
      prevY = e.py;
    }
    // hover: crosshair on the nearest quarter, readout of every stock near that date
    const cross = Charts._svg("line", { y1: T, y2: H - B, class: "cross", visibility: "hidden" }, svg);
    const hit = Charts._svg("rect", { x: L - 10, y: 0, width: W - L - R + 20, height: H, class: "hit", tabindex: 0 }, svg);
    let cur = dates.length - 1;
    const show = (k) => {
      cur = k;
      const d = dates[k];
      cross.setAttribute("x1", x(d)); cross.setAttribute("x2", x(d)); cross.setAttribute("visibility", "visible");
      const rows = opts.series.map((s) => {
        const near = s.points.filter((p) => p.v != null && Math.abs(p.x - d) <= 50).sort((a, b) => Math.abs(a.x - d) - Math.abs(b.x - d))[0];
        return { key: `box ${SBS_SLOTS[s.slot].cls}`, value: near ? opts.fmt(near.v) : "–", label: `${s.name}${near ? " · " + near.title : ""}` };
      });
      const ys = opts.series.flatMap((s) => s.points.filter((p) => p.v != null && Math.abs(p.x - d) <= 50).map((p) => y(p.v)));
      tip.show(x(d), ys.length ? Math.min(...ys) : T + 20, new Date(d * 864e5).toLocaleDateString("en", { month: "short", year: "numeric", timeZone: "UTC" }), rows);
    };
    const idx = (ev) => {
      const px = ev.clientX - svg.getBoundingClientRect().left;
      let best = 0;
      dates.forEach((d, k) => { if (Math.abs(x(d) - px) < Math.abs(x(dates[best]) - px)) best = k; });
      return best;
    };
    hit.addEventListener("pointermove", (ev) => show(idx(ev)));
    hit.addEventListener("pointerdown", (ev) => show(idx(ev)));
    hit.addEventListener("pointerleave", () => { tip.hide(); cross.setAttribute("visibility", "hidden"); });
    hit.addEventListener("focus", () => show(cur));
    hit.addEventListener("blur", () => { tip.hide(); cross.setAttribute("visibility", "hidden"); });
    hit.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowLeft") { show(Math.max(0, cur - 1)); ev.preventDefault(); }
      if (ev.key === "ArrowRight") { show(Math.min(dates.length - 1, cur + 1)); ev.preventDefault(); }
    });
    wrap.prepend(svg);
  });
}

async function sideBySideView(el) {
  const tickers = state.index.tickers.map((x) => x.ticker);
  let pick = Array.isArray(ui.sbs) ? ui.sbs.slice(0, 3) : ["NVDA", "MSFT", "TSM"];
  while (pick.length < 3) pick.push("");
  const chosen = pick.map((t, i) => ({ t, slot: i })).filter((p) => p.t && tickers.includes(p.t));
  const docs = await Promise.all(chosen.map((p) => doc(p.t)));
  const stocks = chosen.map((p, i) => {
    const d = docs[i];
    const fx = d.currency === "USD" ? 1 : (d.forward?.market_cap_usd && d.forward?.market_cap_reporting ? d.forward.market_cap_usd / d.forward.market_cap_reporting : null);
    return { ...p, d, fx, qs: sliceQuarters(d.quarters) };
  });

  const picker = pick.map((t, i) => `<label class="sbs-pick"><span class="sbs-key ${SBS_SLOTS[i].cls}" aria-hidden="true">${SBS_SLOTS[i].glyph}</span>
      <select data-slot="${i}" aria-label="Stock ${i + 1}"><option value="">—</option>${tickers.map((x) => `<option ${x === t ? "selected" : ""}>${x}</option>`).join("")}</select></label>`).join("");
  el.innerHTML = `
    <div class="sub">Pick up to three stocks. Each stock keeps the same colour and marker shape on every chart.</div>
    <div class="sbs-picks">${picker}</div>
    <div class="controls" role="group" aria-label="Quarters shown"><span class="ctl-l">Quarters</span>
      ${[["8", "8Q"], ["12", "12Q"], ["all", "All"]].map(([v, l]) => `<button class="seg ${ui.range === v ? "on" : ""}" data-range="${v}">${l}</button>`).join("")}</div>
    <div id="sbs"></div>
    ${stocks.some((s) => s.d.currency !== "USD") ? '<p class="sub fine">Money amounts for TSM are converted from NT$ to US$ at today\'s exchange rate so all stocks share one scale.</p>' : ""}`;
  el.querySelectorAll("select[data-slot]").forEach((s) => s.addEventListener("change", () => {
    const next = pick.slice(); next[Number(s.dataset.slot)] = s.value;
    ui.sbs = next; saveUi(); route(true);
  }));
  el.querySelectorAll("[data-range]").forEach((b) => b.addEventListener("click", () => { ui.range = b.dataset.range; saveUi(); route(true); }));
  if (!stocks.length) { $("#sbs").innerHTML = '<div class="note">Pick at least one stock.</div>'; return; }

  const host = $("#sbs");
  const defs = metricDefs();
  const card = (grid, title, desc, better, values, fmtV, edges, aria, zeroLine, fullAt) => {
    const c = document.createElement("div");
    c.className = "card sbs-card";
    c.innerHTML = `<div class="card-h"><span>${esc(title)}</span>${better ? `<span class="sub">${better}</span>` : ""}</div>
      <div class="sbs-vals">${values.map((v) => `<span class="sbs-val"><span class="sbs-key ${SBS_SLOTS[v.slot].cls}" aria-hidden="true">${SBS_SLOTS[v.slot].glyph}</span>
        <span class="sbs-t">${esc(v.t)}</span> <b>${v.v == null ? "–" : fmtV(v.v)}</b></span>`).join("")}</div>
      <div class="c"></div>${edges ? bandLegend(edges, better === "higher is better", fmtV, fullAt) : ""}`;
    grid.appendChild(c);
    multiLineChart(c.querySelector(".c"), {
      fmt: fmtV, edges, aria, zeroLine, fullAt,
      series: values.map((v) => ({ name: v.t, slot: v.slot, points: v.points })),
    });
  };
  const qName = (q) => `quarter to ${new Date(q.period_end + "T00:00:00Z").toLocaleDateString("en", { month: "short", year: "numeric", timeZone: "UTC" })}${q.provisional ? " (preliminary)" : ""}`;
  const series = (s, getter) => s.qs.map((q) => ({ x: dayNum(q.period_end), v: getter(q), title: qName(q) }));

  for (const [pk, pname] of [["growth", "Growth"], ["quality", "Quality"], ["valuation", "Valuation"], ["context", "Context (not scored)"]]) {
    const ds = defs.filter((x) => x.pillar === pk);
    if (!ds.length) continue;
    const sec = document.createElement("section");
    sec.innerHTML = `<h2>${pname}</h2><div class="grid3"></div>`;
    host.appendChild(sec);
    for (const def of ds) {
      const kind = fmtKind(def.format);
      const title = def.label, desc = ""; // same titles as the stock pages
      const values = stocks.map((s) => {
        const pts = def.forward_only  // estimate-based metrics: plotted by date from the estimate history
          ? ((s.d.forward_series || {})[def.key] || []).filter((p) => !ui.range || ui.range === "all" || dayNum(p.date) >= dayNum(s.qs[0]?.period_end || p.date))
              .map((p) => ({ x: dayNum(p.date), v: p.value, title: "estimate, " + shortDate(p.date) }))
          : series(s, (q) => q.metrics[def.key]);
        const last = pts.filter((p) => p.v != null).pop();
        return { t: s.t, slot: s.slot, v: last?.v ?? null, points: pts };
      });
      card(sec.querySelector(".grid3"), title, desc, higherIsBetter(def) ? "higher is better" : "lower is better",
        values, (v) => fmt(v, kind, "USD"), def.edges, `${title}: ${stocks.map((s) => s.t).join(", ")}`, false, def.max);
    }
  }
  const sec = document.createElement("section");
  sec.innerHTML = `<h2>Financial statements <span class="sub">US$, last 12 months</span></h2><div class="grid3"></div>`;
  host.appendChild(sec);
  for (const [key, title, desc] of STMTS) {
    const values = stocks.map((s) => {
      const get = (q) => {
        const m = q.metrics;
        const raw = key === "net_cash" ? (m.cash_and_st_inv != null && m.debt != null ? m.cash_and_st_inv - m.debt : null) : m[key];
        return raw == null || s.fx == null ? null : raw * s.fx;
      };
      const pts = series(s, get);
      const last = pts.filter((p) => p.v != null).pop();
      return { t: s.t, slot: s.slot, v: last?.v ?? null, points: pts };
    });
    card(sec.querySelector(".grid3"), title, desc, "", values, (v) => fmt(v, "money", "USD"), null, `${title}: ${stocks.map((s) => s.t).join(", ")}`, true);
  }
}
