// Small SVG chart kit for the scorecard: zone-banded line charts, grouped columns, a price line,
// a zone gauge and a ranked bar chart. No dependencies. Every chart redraws on resize and has a
// hover/touch/keyboard readout; every value is also in a table elsewhere on the page.
"use strict";
const NS = "http://www.w3.org/2000/svg";
const ZONE_NAMES = ["Unfavorable", "Mediocre", "Favorable"];

function svgEl(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// zone of a value given [unfav/mid edge, mid/fav edge]; works for higher- and lower-is-better
function zoneOf(v, edges) {
  if (v == null || !edges) return null;
  const [a, b] = edges;
  const hib = b > a;
  if (hib ? v >= b : v <= b) return 2;
  if (hib ? v >= a : v <= a) return 1;
  return 0;
}

function niceTicks(lo, hi, n = 4) {
  const span = hi - lo || Math.abs(hi) || 1;
  const raw = span / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) || 10 * mag;
  // first label at or below the lowest value, last at or above the highest: the chart starts and ends on a label
  const ticks = [];
  const start = Math.floor(lo / step + 1e-9) * step, end = Math.ceil(hi / step - 1e-9) * step;
  for (let t = start; t <= end + step * 1e-9; t += step) ticks.push(+t.toFixed(10));
  return ticks;
}

// drop meaningless trailing zeros: "100.0%" -> "100%", "2.00×" -> "2×", "$25.0B" -> "$25B", "0.50×" -> "0.5×"
function tidyTick(txt) {
  return String(txt).replace(/(\d)\.(\d*?)0+(?=\D*$)/, (m, a, b) => (b ? `${a}.${b}` : a));
}

// Shared tooltip: one floating box per chart wrapper. Rows are built with textContent.
function makeTip(wrap) {
  const tip = document.createElement("div");
  tip.className = "tip";
  tip.hidden = true;
  wrap.appendChild(tip);
  return {
    show(x, y, title, rows) {
      tip.replaceChildren();
      const h = document.createElement("div"); h.className = "tip-h"; h.textContent = title; tip.appendChild(h);
      for (const r of rows) {
        const row = document.createElement("div"); row.className = "tip-r";
        if (r.key) { const k = document.createElement("span"); k.className = `key ${r.key}`; if (r.color) k.style.background = r.color; row.appendChild(k); }
        const v = document.createElement("b"); v.textContent = r.value; row.appendChild(v);
        if (r.label) { const l = document.createElement("span"); l.className = "tip-l"; l.textContent = r.label; row.appendChild(l); }
        tip.appendChild(row);
      }
      tip.hidden = false;
      const w = wrap.clientWidth, tw = tip.offsetWidth;
      tip.style.left = Math.max(0, Math.min(w - tw, x - tw / 2)) + "px";
      tip.style.top = Math.max(0, y - tip.offsetHeight - 12) + "px";
    },
    hide() { tip.hidden = true; },
  };
}

function responsive(wrap, draw) {
  let lastW = 0;
  const run = () => { const w = wrap.clientWidth; if (w && w !== lastW) { lastW = w; draw(w); } };
  new ResizeObserver(run).observe(wrap);
  run();
}

// Line chart over three horizontal zones, with an optional estimate overlay.
// opts: labels[], titles[], values[], fmt(v), edges [a,b] | null, deltaFmt(v,prev), height,
//       xs[] numeric positions for the values (needed with an overlay; e.g. days),
//       overlay { name, points: [{ x, value, label, title, note }] } drawn in the second series color,
//       continuing from the last reported value.
function lineChart(wrap, opts) {
  wrap.classList.add("chart");
  const tip = makeTip(wrap);
  responsive(wrap, (W) => {
    wrap.querySelector("svg")?.remove();
    const H = opts.height || 170, L = 46, R = 14, T = 10, B = 26;
    const nMain = opts.values.length;
    const ov = (opts.overlay?.points || []).filter((p) => p.value != null);
    // unified point list: main (reported) first, then overlay (estimates)
    const pts = opts.values.map((v, i) => ({ kind: "main", i, v, pos: opts.xs ? opts.xs[i] : i, label: opts.labels[i], title: opts.titles?.[i] || opts.labels[i] }));
    ov.forEach((p) => pts.push({ kind: "est", v: p.value, pos: p.x, label: p.label, title: p.title || p.label, note: p.note }));
    const n = pts.length;
    const vals = pts.map((p) => p.v).filter((v) => v != null);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (opts.edges) { lo = Math.min(lo, ...opts.edges); hi = Math.max(hi, ...opts.edges); }
    if (opts.zeroBased && lo > 0) lo = 0;
    let ticks;
    if (opts.domain) { [lo, hi] = opts.domain; ticks = opts.ticks || niceTicks(lo, hi); }
    else {
      const pad = (hi - lo || Math.abs(hi) || 1) * 0.12;
      lo -= pad; hi += pad;
      ticks = niceTicks(lo, hi);
      lo = Math.min(lo, ticks[0]); hi = Math.max(hi, ticks[ticks.length - 1]);
    }
    const p0 = Math.min(...pts.map((p) => p.pos)), p1 = Math.max(...pts.map((p) => p.pos));
    const x = (k) => L + (p1 === p0 ? (W - L - R) / 2 : ((pts[k].pos - p0) * (W - L - R)) / (p1 - p0));
    const y = (v) => T + ((hi - v) * (H - T - B)) / (hi - lo);
    const svg = svgEl("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.aria || "chart" });
    // zones
    if (opts.edges) {
      const [a, b] = opts.edges, hib = b > a;
      const bounds = hib ? [[lo, a, 0], [a, b, 1], [b, hi, 2]] : [[lo, b, 2], [b, a, 1], [a, hi, 0]];
      for (const [z0, z1, zone] of bounds) {
        const top = y(Math.min(Math.max(z1, lo), hi)), bot = y(Math.max(Math.min(z0, hi), lo));
        if (bot - top <= 0.5) continue;
        svgEl("rect", { x: L, y: top, width: W - L - R, height: bot - top, class: `zone z${zone}` }, svg);
        if (bot - top >= 14) {
          const t = svgEl("text", { x: L + 4, y: top + 11, class: "zone-label", "text-anchor": "start" }, svg);
          t.textContent = ZONE_NAMES[zone];
        }
      }
    }
    for (const t of ticks) {
      if (t < lo || t > hi) continue;
      svgEl("line", { x1: L, x2: W - R, y1: y(t), y2: y(t), class: "grid" }, svg);
      const tx = svgEl("text", { x: L - 6, y: y(t) + 4, class: "tick", "text-anchor": "end" }, svg);
      tx.textContent = opts.tickFmt ? opts.tickFmt(t) : tidyTick(opts.fmt(t));
    }
    // a light divider where reported data ends and estimates begin
    const lastMain = pts.map((p, k) => (p.kind === "main" && p.v != null ? k : -1)).filter((k) => k >= 0).pop();
    if (ov.length && lastMain != null) {
      const xd = x(lastMain);
      svgEl("rect", { x: xd, y: T, width: Math.max(0, W - R - xd), height: H - T - B, class: "future" }, svg);
      const t = svgEl("text", { x: W - R - 4, y: H - B - 5, class: "zone-label", "text-anchor": "end" }, svg);
      t.textContent = opts.overlay.zoneText ?? "estimates";
    }
    // x labels: keep the last, walk back keeping labels >= 58px apart
    const keep = new Set([n - 1]);
    let edge = x(n - 1);
    for (let k = n - 2; k >= 0; k--) if (edge - x(k) >= 58) { keep.add(k); edge = x(k); }
    pts.forEach((p, k) => {
      if (!keep.has(k)) return;
      const tx = svgEl("text", { x: x(k), y: H - 8, class: p.kind === "est" ? "tick est-tick" : "tick",
        "text-anchor": k === 0 && x(0) - L < 20 ? "start" : k === n - 1 && n > 1 ? "end" : "middle" }, svg);
      tx.textContent = p.label;
    });
    // reported line (gaps where values are missing)
    let d = "", pen = false;
    pts.forEach((p, k) => {
      if (p.kind !== "main") return;
      if (p.v == null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${x(k).toFixed(1)},${y(p.v).toFixed(1)}`; pen = true;
    });
    svgEl("path", { d, class: "series-line" }, svg);
    // estimate line continues from the last reported point
    if (ov.length) {
      let de = lastMain != null ? `M${x(lastMain).toFixed(1)},${y(pts[lastMain].v).toFixed(1)}` : "";
      pts.forEach((p, k) => { if (p.kind === "est") de += `${de ? "L" : "M"}${x(k).toFixed(1)},${y(p.v).toFixed(1)}`; });
      svgEl("path", { d: de, class: "est-line" }, svg);
    }
    pts.forEach((p, k) => {
      if (p.v == null) return;
      svgEl("circle", { cx: x(k), cy: y(p.v), r: p.kind === "est" ? 4.5 : 4, class: p.kind === "est" ? "dot-est2" : "dot" }, svg);
    });
    // value labels: the latest reported value and every estimate, placed above or below their point so none overlap
    const boxes = [];
    const overlaps = (b) => boxes.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);
    const label = (k) => {
      const txt = opts.fmt(pts[k].v), w = txt.length * 6.6 + 4, px = x(k), py = y(pts[k].v);
      const anchor = px + w / 2 > W - R + 10 ? "end" : px - w / 2 < L ? "start" : "middle";
      const bx = anchor === "end" ? px - w + 4 : anchor === "start" ? px - 4 : px - w / 2;
      for (const dy of [-9, 17, -22, 30]) {
        const b = { x0: bx, x1: bx + w, y0: py + dy - 11, y1: py + dy + 2 };
        if (b.y0 < 0 || b.y1 > H - B + 2 || overlaps(b)) continue;
        boxes.push(b);
        const tx = svgEl("text", { x: anchor === "end" ? px + 4 : anchor === "start" ? px - 4 : px, y: py + dy, class: "end-label", "text-anchor": anchor }, svg);
        tx.textContent = txt;
        return;
      }
    };
    // reserve the space of every marker so labels never cover a point
    pts.forEach((p, k) => { if (p.v != null) boxes.push({ x0: x(k) - 4, x1: x(k) + 4, y0: y(p.v) - 4, y1: y(p.v) + 4 }); });
    if (lastMain != null) label(lastMain);
    pts.forEach((p, k) => { if (p.kind === "est" && p.v != null) label(k); });
    // optional reference line where a metric earns full points
    if (opts.fullAt != null && opts.fullAt >= lo && opts.fullAt <= hi) {
      svgEl("line", { x1: L, x2: W - R, y1: y(opts.fullAt), y2: y(opts.fullAt), class: "full-line" }, svg);
    }
    // hover / touch / keyboard: nearest point, reported or estimate
    const cross = svgEl("line", { y1: T, y2: H - B, class: "cross", visibility: "hidden" }, svg);
    const hit = svgEl("rect", { x: L - 10, y: 0, width: W - L - R + 20, height: H, class: "hit", tabindex: 0 }, svg);
    let cur = lastMain ?? 0;
    const show = (k) => {
      cur = k;
      const p = pts[k];
      cross.setAttribute("x1", x(k)); cross.setAttribute("x2", x(k)); cross.setAttribute("visibility", "visible");
      const rows = [];
      if (p.v == null) rows.push({ value: "no data" });
      else {
        const z = zoneOf(p.v, opts.edges);
        rows.push({ key: p.kind === "est" ? "ring2" : "line", value: opts.fmt(p.v),
          label: [p.kind === "est" ? (opts.overlay.name || "estimate") : "reported", z != null ? ZONE_NAMES[z] : ""].filter(Boolean).join(" · ") });
        if (p.kind === "main" && opts.deltaFmt) {
          const v1 = opts.values[p.i - 1], v4 = opts.values[p.i - 4];
          if (p.i >= 1 && v1 != null) rows.push({ value: opts.deltaFmt(p.v, v1), label: "vs prior quarter" });
          if (p.i >= 4 && v4 != null) rows.push({ value: opts.deltaFmt(p.v, v4), label: "vs 1 year earlier" });
        }
        if (p.note) rows.push({ value: "", label: p.note });
      }
      tip.show(x(k), p.v == null ? T + 20 : y(p.v), p.title, rows);
    };
    const idx = (ev) => {
      const px = ev.clientX - svg.getBoundingClientRect().left;
      let best = 0;
      for (let k = 1; k < n; k++) if (Math.abs(x(k) - px) < Math.abs(x(best) - px)) best = k;
      return best;
    };
    hit.addEventListener("pointermove", (ev) => show(idx(ev)));
    hit.addEventListener("pointerdown", (ev) => show(idx(ev)));
    hit.addEventListener("pointerleave", () => { tip.hide(); cross.setAttribute("visibility", "hidden"); });
    hit.addEventListener("focus", () => show(cur));
    hit.addEventListener("blur", () => { tip.hide(); cross.setAttribute("visibility", "hidden"); });
    hit.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowLeft") { show(Math.max(0, cur - 1)); ev.preventDefault(); }
      if (ev.key === "ArrowRight") { show(Math.min(n - 1, cur + 1)); ev.preventDefault(); }
    });
    wrap.prepend(svg);
  });
}

// Grouped columns (e.g. revenue and net income per quarter). series: [{name, values, cls}]
function columnChart(wrap, opts) {
  wrap.classList.add("chart");
  const tip = makeTip(wrap);
  responsive(wrap, (W) => {
    wrap.querySelector("svg")?.remove();
    const H = opts.height || 180, L = 52, R = 10, T = 10, B = 26;
    const n = opts.labels.length, k = opts.series.length;
    const all = opts.series.flatMap((s) => s.values).filter((v) => v != null);
    let lo = Math.min(0, ...all), hi = Math.max(0, ...all);
    const ticks = niceTicks(lo, hi);
    lo = Math.min(lo, ticks[0]); hi = Math.max(hi, ticks[ticks.length - 1]);
    const y = (v) => T + ((hi - v) * (H - T - B)) / (hi - lo || 1);
    const band = (W - L - R) / n;
    const gap = 2;
    const bw = Math.max(2, Math.min(24, (band * 0.7 - gap * (k - 1)) / k));
    const groupW = bw * k + gap * (k - 1);
    const svg = svgEl("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.aria || "chart" });
    for (const t of ticks) {
      svgEl("line", { x1: L, x2: W - R, y1: y(t), y2: y(t), class: t === 0 ? "baseline" : "grid" }, svg);
      const tx = svgEl("text", { x: L - 6, y: y(t) + 4, class: "tick", "text-anchor": "end" }, svg);
      tx.textContent = tidyTick(opts.fmt(t));
    }
    const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - L - R) / 62))));
    const groups = [];
    opts.labels.forEach((lab, i) => {
      const gx = L + band * i + (band - groupW) / 2;
      const g = svgEl("g", { class: "col-group" }, svg);
      opts.series.forEach((s, j) => {
        const v = s.values[i];
        if (v == null || v === 0) return;
        const x0 = gx + j * (bw + gap), y0 = y(Math.max(v, 0)), y1 = y(Math.min(v, 0));
        const r = Math.min(4, bw / 2, (y1 - y0) / 2);
        // rounded at the data end, square at the baseline
        const dPath = v > 0
          ? `M${x0},${y1}V${y0 + r}Q${x0},${y0} ${x0 + r},${y0}H${x0 + bw - r}Q${x0 + bw},${y0} ${x0 + bw},${y0 + r}V${y1}Z`
          : `M${x0},${y0}V${y1 - r}Q${x0},${y1} ${x0 + r},${y1}H${x0 + bw - r}Q${x0 + bw},${y1} ${x0 + bw},${y1 - r}V${y0}Z`;
        svgEl("path", { d: dPath, class: `col ${s.cls}` }, g);
      });
      const crowd = i !== n - 1 && (n - 1 - i) * band < 58;
      if ((i % every === 0 && !crowd) || i === n - 1) {
        const tx = svgEl("text", { x: L + band * i + band / 2, y: H - 8, class: "tick", "text-anchor": i === n - 1 ? "end" : "middle" }, svg);
        if (i === n - 1) tx.setAttribute("x", W - R);
        tx.textContent = lab;
      }
      groups.push({ i, g, cx: L + band * i + band / 2 });
    });
    const hit = svgEl("rect", { x: L, y: 0, width: W - L - R, height: H, class: "hit", tabindex: 0 }, svg);
    let cur = n - 1;
    const show = (i) => {
      cur = i;
      groups.forEach((g) => g.g.classList.toggle("lift", g.i === i));
      const vals = opts.series.map((s) => s.values[i]).filter((v) => v != null);
      tip.show(groups[i].cx, y(Math.max(0, ...vals)), opts.titles?.[i] || opts.labels[i],
        opts.series.map((s) => ({ key: `box ${s.cls}`, value: s.values[i] == null ? "–" : opts.fmt(s.values[i]), label: s.name })));
    };
    const idx = (ev) => Math.max(0, Math.min(n - 1, Math.floor((ev.clientX - svg.getBoundingClientRect().left - L) / band)));
    hit.addEventListener("pointermove", (ev) => show(idx(ev)));
    hit.addEventListener("pointerdown", (ev) => show(idx(ev)));
    hit.addEventListener("pointerleave", () => { tip.hide(); groups.forEach((g) => g.g.classList.remove("lift")); });
    hit.addEventListener("focus", () => show(cur));
    hit.addEventListener("blur", () => { tip.hide(); groups.forEach((g) => g.g.classList.remove("lift")); });
    hit.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowLeft") { show(Math.max(0, cur - 1)); ev.preventDefault(); }
      if (ev.key === "ArrowRight") { show(Math.min(n - 1, cur + 1)); ev.preventDefault(); }
    });
    wrap.prepend(svg);
  });
}

// Price line with a light area wash and crosshair.
function priceChart(wrap, dates, closes, fmt) {
  wrap.classList.add("chart");
  const tip = makeTip(wrap);
  responsive(wrap, (W) => {
    wrap.querySelector("svg")?.remove();
    const H = 190, L = 46, R = 10, T = 10, B = 26, n = closes.length;
    // y-axis from $0 so the size of moves reads true
    let lo = 0, hi = Math.max(...closes) * 1.02;
    const ticks = niceTicks(lo, hi);
    hi = ticks[ticks.length - 1];
    const x = (i) => L + (i * (W - L - R)) / (n - 1 || 1);
    const y = (v) => T + ((hi - v) * (H - T - B)) / (hi - lo || 1);
    const svg = svgEl("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Share price" });
    for (const t of ticks) {
      if (t < lo || t > hi) continue;
      svgEl("line", { x1: L, x2: W - R, y1: y(t), y2: y(t), class: "grid" }, svg);
      const tx = svgEl("text", { x: L - 6, y: y(t) + 4, class: "tick", "text-anchor": "end" }, svg);
      tx.textContent = tidyTick(fmt(t));
    }
    // month ticks
    let lastM = "";
    const minGap = 56; let lastX = -1e9;
    dates.forEach((d, i) => {
      const m = d.slice(0, 7);
      if (m !== lastM) {
        lastM = m;
        if (i === 0 || x(i) - lastX < minGap || x(i) > W - R - 20) return;
        lastX = x(i);
        const tx = svgEl("text", { x: x(i), y: H - 8, class: "tick", "text-anchor": "middle" }, svg);
        tx.textContent = new Date(d + "T00:00:00Z").toLocaleString("en", { month: "short", timeZone: "UTC" });
      }
    });
    const line = closes.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
    svgEl("path", { d: `${line}L${x(n - 1)},${H - B}L${x(0)},${H - B}Z`, class: "area" }, svg);
    svgEl("path", { d: line, class: "series-line" }, svg);
    svgEl("circle", { cx: x(n - 1), cy: y(closes[n - 1]), r: 4, class: "dot" }, svg);
    const cross = svgEl("line", { y1: T, y2: H - B, class: "cross", visibility: "hidden" }, svg);
    const hit = svgEl("rect", { x: L, y: 0, width: W - L - R, height: H, class: "hit", tabindex: 0 }, svg);
    let cur = n - 1;
    const show = (i) => {
      cur = i;
      cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.setAttribute("visibility", "visible");
      const chg = closes[i] / closes[0] - 1;
      tip.show(x(i), y(closes[i]), new Date(dates[i] + "T00:00:00Z").toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
        [{ key: "line", value: fmt(closes[i]), label: "close" }, { value: (chg >= 0 ? "+" : "") + (chg * 100).toFixed(1) + "%", label: "since start of range" }]);
    };
    const idx = (ev) => Math.max(0, Math.min(n - 1, Math.round(((ev.clientX - svg.getBoundingClientRect().left - L) * (n - 1)) / (W - L - R))));
    hit.addEventListener("pointermove", (ev) => show(idx(ev)));
    hit.addEventListener("pointerdown", (ev) => show(idx(ev)));
    hit.addEventListener("pointerleave", () => { tip.hide(); cross.setAttribute("visibility", "hidden"); });
    hit.addEventListener("focus", () => show(cur));
    hit.addEventListener("blur", () => { tip.hide(); cross.setAttribute("visibility", "hidden"); });
    hit.addEventListener("keydown", (ev) => {
      if (ev.key === "ArrowLeft") { show(Math.max(0, cur - 5)); ev.preventDefault(); }
      if (ev.key === "ArrowRight") { show(Math.min(n - 1, cur + 5)); ev.preventDefault(); }
    });
    wrap.prepend(svg);
  });
}

// Zone gauge: three zone segments on a scale, a marker for the value, optional second marker.
// opts: lo, hi, edges [a,b], value, fmt, markers [{value, label}]
function gauge(wrap, opts) {
  wrap.classList.add("chart", "gauge");
  responsive(wrap, (W) => {
    wrap.querySelector("svg")?.remove();
    const H = 64, L = 8, R = 8, Y = 26, BH = 10;
    const { lo, hi } = opts;
    const x = (v) => L + ((Math.min(Math.max(v, lo), hi) - lo) * (W - L - R)) / (hi - lo);
    const svg = svgEl("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.aria || "gauge" });
    const [a, b] = opts.edges, hib = b > a;
    const segs = hib ? [[lo, a, 0], [a, b, 1], [b, hi, 2]] : [[lo, b, 2], [b, a, 1], [a, hi, 0]];
    segs.forEach(([s0, s1, z], k) => {
      const x0 = x(s0) + (k ? 1 : 0), x1 = x(s1) - (k < 2 ? 1 : 0);
      if (x1 > x0) svgEl("rect", { x: x0, y: Y, width: x1 - x0, height: BH, rx: k === 0 || k === 2 ? 5 : 0, class: `gseg z${z}` }, svg);
      const tx = svgEl("text", { x: (x(s0) + x(s1)) / 2, y: Y + BH + 16, class: "tick", "text-anchor": "middle" }, svg);
      tx.textContent = ZONE_NAMES[z];
    });
    for (const m of opts.markers || []) {
      if (m.value == null) continue;
      const mx = x(m.value);
      svgEl("path", { d: `M${mx - 6},${Y - 10}L${mx + 6},${Y - 10}L${mx},${Y - 2}Z`, class: m.secondary ? "gmark2" : "gmark" }, svg);
      if (m.secondary) continue; // explained in the card text; a second label would collide
      const tx = svgEl("text", { x: mx, y: Y - 14, class: "gval", "text-anchor": "middle" }, svg);
      tx.textContent = m.label;
      wrap.prepend(svg); // measure, then keep the label inside the chart
      const bw = tx.getBBox().width;
      tx.setAttribute("x", Math.max(L + bw / 2, Math.min(W - R - bw / 2, mx)));
      svg.remove();
    }
    wrap.prepend(svg);
  });
}

// Ranked horizontal bars across stocks for one metric, over zones. rows: [{name, value, href}]
function rankChart(wrap, opts) {
  wrap.classList.add("chart");
  const tip = makeTip(wrap);
  responsive(wrap, (W) => {
    wrap.querySelector("svg")?.remove();
    const rows = opts.rows.filter((r) => r.value != null);
    const rowH = 28, L = 58, R = 64, T = 6, H = T + rows.length * rowH + 22;
    const vals = rows.map((r) => r.value);
    let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
    if (opts.edges) { lo = Math.min(lo, ...opts.edges); hi = Math.max(hi, ...opts.edges); }
    const ticks = niceTicks(lo, hi, 4);
    lo = Math.min(lo, ticks[0]); hi = Math.max(hi, ticks[ticks.length - 1]);
    const x = (v) => L + ((v - lo) * (W - L - R)) / (hi - lo || 1);
    const svg = svgEl("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.aria || "chart" });
    if (opts.edges) {
      const [a, b] = opts.edges, hib = b > a;
      const segs = hib ? [[lo, a, 0], [a, b, 1], [b, hi, 2]] : [[lo, b, 2], [b, a, 1], [a, hi, 0]];
      for (const [s0, s1, z] of segs) {
        const x0 = x(Math.max(s0, lo)), x1 = x(Math.min(s1, hi));
        if (x1 - x0 > 0.5) svgEl("rect", { x: x0, y: T, width: x1 - x0, height: rows.length * rowH, class: `zone z${z}` }, svg);
      }
    }
    for (const t of ticks) {
      svgEl("line", { x1: x(t), x2: x(t), y1: T, y2: T + rows.length * rowH, class: t === 0 ? "baseline" : "grid" }, svg);
      const tx = svgEl("text", { x: x(t), y: H - 6, class: "tick", "text-anchor": "middle" }, svg);
      tx.textContent = tidyTick(opts.fmt(t));
    }
    rows.forEach((r, i) => {
      const cy = T + i * rowH + rowH / 2, bh = 14, v = r.value;
      const x0 = x(Math.min(0, v)), x1 = x(Math.max(0, v));
      const rr = Math.min(4, (x1 - x0) / 2);
      const d = v >= 0
        ? `M${x0},${cy - bh / 2}H${x1 - rr}Q${x1},${cy - bh / 2} ${x1},${cy - bh / 2 + rr}V${cy + bh / 2 - rr}Q${x1},${cy + bh / 2} ${x1 - rr},${cy + bh / 2}H${x0}Z`
        : `M${x1},${cy - bh / 2}H${x0 + rr}Q${x0},${cy - bh / 2} ${x0},${cy - bh / 2 + rr}V${cy + bh / 2 - rr}Q${x0},${cy + bh / 2} ${x0 + rr},${cy + bh / 2}H${x1}Z`;
      const g = svgEl("g", { class: "rank-row" }, svg);
      svgEl("path", { d, class: "col s1" }, g);
      const name = svgEl("text", { x: L - 8, y: cy + 4, class: "rank-name", "text-anchor": "end" }, g);
      name.textContent = r.name;
      const val = svgEl("text", { x: v >= 0 ? x1 + 6 : x0 - 6, y: cy + 4, class: "end-label", "text-anchor": v >= 0 ? "start" : "end" }, g);
      if (v < 0 && x0 - 6 < L + 30) { val.setAttribute("x", x1 + 6); val.setAttribute("text-anchor", "start"); }
      val.textContent = opts.fmt(v);
      const hit = svgEl("rect", { x: 0, y: cy - rowH / 2, width: W, height: rowH, class: "hit", tabindex: 0 }, g);
      const show = () => {
        g.classList.add("lift");
        const z = zoneOf(v, opts.edges);
        tip.show(x1, cy - 6, r.title || r.name, [{ key: "box s1", value: opts.fmt(v), label: z != null ? ZONE_NAMES[z] : "" }]);
      };
      const hide = () => { g.classList.remove("lift"); tip.hide(); };
      hit.addEventListener("pointerenter", show); hit.addEventListener("pointerdown", show);
      hit.addEventListener("pointerleave", hide); hit.addEventListener("focus", show); hit.addEventListener("blur", hide);
      if (r.href) hit.addEventListener("click", () => { location.hash = r.href; });
    });
    wrap.prepend(svg);
  });
}

window.Charts = { lineChart, columnChart, priceChart, gauge, rankChart, zoneOf, ZONE_NAMES , _svg: svgEl, _tip: makeTip, _responsive: responsive, _ticks: niceTicks, _tidy: tidyTick };
