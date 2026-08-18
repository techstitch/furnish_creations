import { el } from "./fields.js";
import { apiFetch } from "./api.js";

const METRICS = [
  { key: "pageview", label: "Page views", varName: "--series-1" },
  { key: "whatsapp_click", label: "WhatsApp clicks", varName: "--series-2" },
  { key: "call_click", label: "Call clicks", varName: "--series-3" },
  { key: "cta_click", label: "Form submits", varName: "--series-4" },
];

const PRESETS = [
  { id: "today", label: "Today", days: 1 },
  { id: "7d", label: "Last 7 days", days: 7 },
  { id: "30d", label: "Last 30 days", days: 30 },
  { id: "90d", label: "Last 90 days", days: 90 },
];

const IST = "Asia/Kolkata";

function istToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function shiftKey(dateKey, deltaDays) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function rangeKeys(from, to) {
  const out = [];
  for (let k = from; k <= to; k = shiftKey(k, 1)) {
    out.push(k);
    if (out.length > 400) break;
  }
  return out;
}

const shortDate = (key) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

// One grouped query covers the whole range. The server returns only the days that
// actually have events, so the zero-filled grid is rebuilt here — every painter below
// indexes series[metric][day] directly and expects a number, not undefined.
async function fetchCounts(dayKeys) {
  const from = dayKeys[0];
  const to = dayKeys[dayKeys.length - 1];
  const { series: sparse } = await apiFetch(
    `stats.php?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
  );

  const series = Object.fromEntries(
    METRICS.map((m) => [m.key, Object.fromEntries(dayKeys.map((d) => [d, 0]))])
  );
  for (const metric of METRICS) {
    const counts = sparse?.[metric.key];
    if (!counts) continue;
    for (const [day, n] of Object.entries(counts)) {
      if (day in series[metric.key]) series[metric.key][day] = n;
    }
  }
  return series;
}

/* ---------------- chart ---------------- */

const NS = "http://www.w3.org/2000/svg";
const svgEl = (tag, attrs = {}) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

function niceMax(value) {
  if (value <= 4) return 4;
  const mag = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / mag) * mag;
}

function renderChart(series, dayKeys, visible) {
  const W = 900;
  const H = 300;
  const pad = { top: 16, right: 20, bottom: 34, left: 46 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const active = METRICS.filter((m) => visible.has(m.key));
  const peak = Math.max(
    1,
    ...active.flatMap((m) => dayKeys.map((d) => series[m.key][d] || 0))
  );
  const yMax = niceMax(peak);

  const x = (i) => (dayKeys.length === 1 ? plotW / 2 : (i / (dayKeys.length - 1)) * plotW);
  const y = (v) => plotH - (v / yMax) * plotH;

  const svg = svgEl("svg", {
    viewBox: `0 0 ${W} ${H}`,
    class: "chart-svg",
    role: "img",
    "aria-label": "Daily activity trend",
    preserveAspectRatio: "xMidYMid meet",
  });
  const plot = svgEl("g", { transform: `translate(${pad.left},${pad.top})` });
  svg.appendChild(plot);

  // Recessive gridlines + y ticks
  const TICKS = 4;
  for (let t = 0; t <= TICKS; t++) {
    const value = (yMax / TICKS) * t;
    const yy = y(value);
    plot.appendChild(svgEl("line", { x1: 0, x2: plotW, y1: yy, y2: yy, class: t === 0 ? "axis-line" : "grid-line" }));
    const label = svgEl("text", { x: -10, y: yy + 4, class: "tick-label", "text-anchor": "end" });
    label.textContent = String(Math.round(value));
    plot.appendChild(label);
  }

  // X labels — thinned so they never collide
  const step = Math.max(1, Math.ceil(dayKeys.length / 8));
  dayKeys.forEach((key, i) => {
    if (i % step && i !== dayKeys.length - 1) return;
    const label = svgEl("text", { x: x(i), y: plotH + 22, class: "tick-label", "text-anchor": "middle" });
    label.textContent = shortDate(key);
    plot.appendChild(label);
  });

  active.forEach((metric) => {
    const points = dayKeys.map((d, i) => [x(i), y(series[metric.key][d] || 0)]);
    const path = svgEl("path", {
      d: points.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" "),
      class: "series-line",
      stroke: `var(${metric.varName})`,
    });
    plot.appendChild(path);
    if (dayKeys.length === 1) {
      plot.appendChild(
        svgEl("circle", { cx: points[0][0], cy: points[0][1], r: 5, fill: `var(${metric.varName})`, class: "series-dot" })
      );
    }
  });

  // Hover layer: a crosshair that snaps to the nearest day and reads out every series.
  const crosshair = svgEl("line", { y1: 0, y2: plotH, class: "crosshair", opacity: 0 });
  plot.appendChild(crosshair);
  const markers = active.map((m) => {
    const dot = svgEl("circle", { r: 4.5, class: "hover-dot", fill: `var(${m.varName})`, opacity: 0 });
    plot.appendChild(dot);
    return { metric: m, dot };
  });

  const tooltip = el("div", { class: "chart-tooltip", hidden: true });
  const surface = svgEl("rect", { x: 0, y: 0, width: plotW, height: plotH, fill: "transparent", class: "hover-surface" });
  plot.appendChild(surface);

  const wrap = el("div", { class: "chart-wrap" }, [svg, tooltip]);

  function moveTo(clientX) {
    const box = svg.getBoundingClientRect();
    const scale = W / box.width;
    const localX = (clientX - box.left) * scale - pad.left;
    const i = Math.max(0, Math.min(dayKeys.length - 1, Math.round((localX / plotW) * (dayKeys.length - 1)) || 0));
    const px = x(i);

    crosshair.setAttribute("x1", px);
    crosshair.setAttribute("x2", px);
    crosshair.setAttribute("opacity", 1);
    markers.forEach(({ metric, dot }) => {
      dot.setAttribute("cx", px);
      dot.setAttribute("cy", y(series[metric.key][dayKeys[i]] || 0));
      dot.setAttribute("opacity", 1);
    });

    tooltip.innerHTML = "";
    tooltip.appendChild(el("p", { class: "tooltip-date", text: shortDate(dayKeys[i]) }));
    active.forEach((m) => {
      tooltip.appendChild(
        el("p", { class: "tooltip-row" }, [
          svgKey(m.varName),
          el("strong", { text: String(series[m.key][dayKeys[i]] || 0) }),
          el("span", { text: m.label }),
        ])
      );
    });
    tooltip.hidden = false;
    const left = (px + pad.left) / scale;
    tooltip.style.left = `${Math.min(Math.max(left, 70), box.width - 70)}px`;
  }

  svg.addEventListener("pointermove", (e) => moveTo(e.clientX));
  svg.addEventListener("pointerleave", () => {
    tooltip.hidden = true;
    crosshair.setAttribute("opacity", 0);
    markers.forEach(({ dot }) => dot.setAttribute("opacity", 0));
  });

  return wrap;
}

function svgKey(varName) {
  const s = document.createElementNS(NS, "svg");
  s.setAttribute("width", "14");
  s.setAttribute("height", "10");
  s.setAttribute("class", "series-key");
  const line = svgEl("line", { x1: 0, y1: 5, x2: 14, y2: 5, stroke: `var(${varName})`, "stroke-width": 2.5, "stroke-linecap": "round" });
  s.appendChild(line);
  return s;
}

/* ---------------- panel ---------------- */

export function renderAnalytics() {
  const state = {
    preset: "7d",
    from: shiftKey(istToday(), -6),
    to: istToday(),
    visible: new Set(METRICS.map((m) => m.key)),
    series: null,
    dayKeys: [],
  };

  const tiles = el("div", { class: "kpi-row" });
  const chartHost = el("div", { class: "chart-host" });
  const legend = el("div", { class: "legend" });
  const tableHost = el("div", { class: "table-host" });
  const rangeLabel = el("p", { class: "range-label" });

  const fromInput = el("input", { class: "input input-date", type: "date", value: state.from });
  const toInput = el("input", { class: "input input-date", type: "date", value: state.to });

  const presetRow = el("div", { class: "preset-row" },
    PRESETS.map((p) =>
      el("button", {
        class: `chip${state.preset === p.id ? " active" : ""}`,
        type: "button",
        "data-preset": p.id,
        text: p.label,
        onClick: () => {
          state.preset = p.id;
          state.to = istToday();
          state.from = shiftKey(state.to, -(p.days - 1));
          fromInput.value = state.from;
          toInput.value = state.to;
          syncChips();
          load();
        },
      })
    )
  );

  function syncChips() {
    presetRow.querySelectorAll(".chip").forEach((c) =>
      c.classList.toggle("active", c.dataset.preset === state.preset)
    );
  }

  function onCustomRange() {
    if (!fromInput.value || !toInput.value) return;
    if (fromInput.value > toInput.value) return;
    state.from = fromInput.value;
    state.to = toInput.value;
    state.preset = "custom";
    syncChips();
    load();
  }
  fromInput.addEventListener("change", onCustomRange);
  toInput.addEventListener("change", onCustomRange);

  function paintLegend() {
    legend.innerHTML = "";
    METRICS.forEach((m) => {
      const on = state.visible.has(m.key);
      legend.appendChild(
        el("button", {
          class: `legend-item${on ? "" : " off"}`,
          type: "button",
          "aria-pressed": String(on),
          onClick: () => {
            if (on && state.visible.size === 1) return;
            on ? state.visible.delete(m.key) : state.visible.add(m.key);
            paintLegend();
            paintChart();
          },
        }, [svgKey(m.varName), el("span", { text: m.label })])
      );
    });
  }

  function paintTiles() {
    tiles.innerHTML = "";
    METRICS.forEach((m) => {
      const total = state.dayKeys.reduce((sum, d) => sum + (state.series[m.key][d] || 0), 0);
      tiles.appendChild(
        el("div", { class: "kpi" }, [
          el("div", { class: "kpi-head" }, [svgKey(m.varName), el("span", { class: "kpi-label", text: m.label })]),
          el("p", { class: "kpi-value", text: total.toLocaleString("en-IN") }),
        ])
      );
    });
  }

  function paintChart() {
    chartHost.innerHTML = "";
    chartHost.appendChild(renderChart(state.series, state.dayKeys, state.visible));
  }

  // The table is the relief mechanism for the light-mode contrast warning on the
  // aqua/yellow series, and doubles as the keyboard-reachable view of every value.
  function paintTable() {
    tableHost.innerHTML = "";
    const head = el("tr", {}, [
      el("th", { text: "Date", scope: "col" }),
      ...METRICS.map((m) => el("th", { text: m.label, scope: "col" })),
    ]);
    const rows = [...state.dayKeys].reverse().map((d) =>
      el("tr", {}, [
        el("th", { scope: "row", text: shortDate(d) }),
        ...METRICS.map((m) => el("td", { text: String(state.series[m.key][d] || 0) })),
      ])
    );
    const totals = el("tr", { class: "total-row" }, [
      el("th", { scope: "row", text: "Total" }),
      ...METRICS.map((m) =>
        el("td", { text: String(state.dayKeys.reduce((s, d) => s + (state.series[m.key][d] || 0), 0)) })
      ),
    ]);
    tableHost.appendChild(
      el("details", { class: "table-details" }, [
        el("summary", { text: "View the numbers as a table" }),
        el("div", { class: "table-scroll" }, [
          el("table", { class: "data-table" }, [
            el("thead", {}, [head]),
            el("tbody", {}, [...rows, totals]),
          ]),
        ]),
      ])
    );
  }

  async function load() {
    state.dayKeys = rangeKeys(state.from, state.to);
    rangeLabel.textContent = `${shortDate(state.from)} – ${shortDate(state.to)} · ${state.dayKeys.length} day${
      state.dayKeys.length === 1 ? "" : "s"
    } (India time)`;
    root.classList.add("loading");
    try {
      state.series = await fetchCounts(state.dayKeys);
      paintTiles();
      paintChart();
      paintTable();
      errorBox.hidden = true;
    } catch (err) {
      errorBox.hidden = false;
      errorBox.textContent = `Could not load analytics: ${err.code || err.message}`;
    } finally {
      root.classList.remove("loading");
    }
  }

  const errorBox = el("p", { class: "alert alert-error", hidden: true });

  const root = el("div", { class: "analytics" }, [
    el("div", { class: "filter-row" }, [
      presetRow,
      el("div", { class: "custom-range" }, [
        el("label", { class: "range-lbl", text: "From" }),
        fromInput,
        el("label", { class: "range-lbl", text: "To" }),
        toInput,
      ]),
    ]),
    rangeLabel,
    errorBox,
    tiles,
    el("section", { class: "card chart-card" }, [
      el("header", { class: "card-head" }, [
        el("h3", { text: "Daily activity" }),
        legend,
      ]),
      chartHost,
      tableHost,
    ]),
  ]);

  paintLegend();
  load();
  return root;
}
