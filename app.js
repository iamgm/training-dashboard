const DATA_BASE = "data";
const PLOT_CONFIG = { responsive: true, displayModeBar: false };

const TYPE_COLORS = {
  Undefined: "#CBD5E1",
  Recovery: "#8B5CF6",
  "Low Intsty": "#2563EB",
  "Low Intsty Long": "#06B6D4",
  Tempo: "#F59E0B",
  HIIT: "#EF4444",
  "Indoor bike": "#10B981",
};

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const LOLLIPOP_Y = {
  showgrid: false,
  zeroline: false,
  showline: false,
  showticklabels: false,
  ticks: "",
};

const $ = (id) => document.getElementById(id);

let paceLabelData = [];
let paceAverageAnnotation = null;

function colorFor(type) {
  if (TYPE_COLORS[type]) return TYPE_COLORS[type];
  let hash = 0;
  for (const char of type) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 65% 45%)`;
}

function fmtPace(minutes) {
  if (minutes == null || !isFinite(minutes)) return "\u2014";
  const total = Math.round(minutes * 60);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function fmtDuration(minutes) {
  if (minutes == null || !isFinite(minutes)) return "\u2014";
  const total = Math.round(minutes * 60);
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return `${hours}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function fmtShortDuration(minutes) {
  if (minutes == null || !isFinite(minutes)) return "";
  const total = Math.round(minutes);
  if (total < 60) return `${total}m`;
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

function fmtHoursMinutes(minutes) {
  if (minutes == null || !isFinite(minutes)) return "";
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

function fmtKm(value) {
  if (value == null || !isFinite(value)) return "";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function numeric(values) {
  return values.filter((value) => value != null && isFinite(value));
}

function monthDateTicks(monthKey) {
  if (!monthKey) return {};
  const [year, month] = monthKey.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const tickvals = [];
  const ticktext = [];
  for (let day = 1; day <= daysInMonth; day += 7) {
    tickvals.push(`${monthKey}-${String(day).padStart(2, "0")}`);
    ticktext.push(`${MONTHS_SHORT[month - 1]} ${day}`);
  }
  return { tickvals, ticktext };
}

function hourTicks(values) {
  const numbers = numeric(values);
  if (!numbers.length) return {};
  const max = Math.max(...numbers);
  const steps = [30, 60, 120, 180, 240, 360, 480, 720, 1440];
  let step = steps[steps.length - 1];
  for (const candidate of steps) {
    if (max / candidate <= 8) {
      step = candidate;
      break;
    }
  }
  const maxTick = Math.ceil(max / step) * step;
  const tickvals = [];
  for (let value = 0; value <= maxTick + 0.001; value += step) {
    tickvals.push(value);
  }
  return {
    tickvals,
    ticktext: tickvals.map((value) => `${Math.round(value / 60)}h`),
    range: [0, maxTick + step * 0.4],
  };
}

function rangeToZero(values, ticks, headroom = 1.08) {
  const numbers = numeric(values);
  if (!numbers.length) return {};
  const lastTick = ticks.tickvals && ticks.tickvals.length
    ? ticks.tickvals[ticks.tickvals.length - 1]
    : Math.max(...numbers);
  const top = Math.max(lastTick, Math.max(...numbers) * headroom);
  return { range: [0, top] };
}

function paddedRange(values, padRatio = 0.25, minPad = 0.3) {
  const numbers = numeric(values);
  if (!numbers.length) return {};
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  const pad = Math.max((max - min) * padRatio, minPad);
  return { range: [min - pad, max + pad] };
}

function baseLayout(yTitle, yExtra = {}, xExtra = {}, marginLeft = 18) {
  return {
    margin: { l: marginLeft, r: 20, t: 12, b: 84 },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: "Inter, system-ui, sans-serif", color: "#374151", size: 12 },
    xaxis: {
      type: "date",
      title: { text: "Date", standoff: 10 },
      showgrid: false,
      zeroline: false,
      showline: true,
      linecolor: "#E5E7EB",
      ticks: "outside",
      ticklen: 4,
      tickcolor: "#9CA3AF",
      tickformat: "%b %d",
      ...xExtra,
    },
    yaxis: {
      title: { text: yTitle || "" },
      gridcolor: "#EEF2F7",
      zeroline: false,
      ...yExtra,
    },
    legend: {
      orientation: "h",
      y: -0.22,
      x: 0,
      font: { size: 10 },
      itemwidth: 30,
    },
    hovermode: "closest",
    showlegend: true,
  };
}

function groupByType(dates, values, types) {
  const byType = new Map();
  dates.forEach((date, index) => {
    const value = values[index];
    if (value == null || !isFinite(value) || value <= 0) return;
    const type = types[index] || "Undefined";
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type).push({ x: date, y: value });
  });
  return byType;
}

function lollipopTraces(dates, values, types, options) {
  const byType = groupByType(dates, values, types);
  const stems = [];
  const markers = [];

  for (const [type, points] of byType.entries()) {
    const color = colorFor(type);
    const xs = [];
    const ys = [];
    for (const point of points) {
      xs.push(point.x, point.x, null);
      ys.push(options.baseline(point.y), point.y, null);
    }

    stems.push({
      x: xs,
      y: ys,
      mode: "lines",
      type: "scatter",
      line: { color, width: 1.5 },
      opacity: 0.5,
      hoverinfo: "skip",
      showlegend: false,
      legendgroup: type,
    });

    const marker = {
      x: points.map((point) => point.x),
      y: points.map((point) => point.y),
      customdata: points.map((point) => options.hover(point.y)),
      mode: "markers",
      type: "scatter",
      name: type,
      legendgroup: type,
      marker: { color, size: 9, line: { color: "#fff", width: 1 } },
      hovertemplate: `%{x|%d %b %Y}<br><b>${type}</b><br>%{customdata}<extra></extra>`,
    };

    if (options.withText !== false) {
      marker.mode = "markers+text";
      marker.text = points.map((point) => options.label(point.y));
      marker.textposition = "top center";
      marker.textfont = { size: 12, color: "#374151" };
      marker.cliponaxis = false;
    }

    markers.push(marker);
  }

  return [...stems, ...markers];
}

function paceAnnotation(label) {
  return {
    x: label.x,
    y: label.y,
    text: label.text,
    showarrow: false,
    xanchor: "center",
    yanchor: "bottom",
    yshift: 12,
    bgcolor: "rgba(255, 255, 255, 0.92)",
    borderpad: 1,
    font: { size: 12, color: "#1F2937" },
  };
}

function visiblePaceAnnotations() {
  const gd = $("chart-pace");
  const visible = new Set();
  (gd.data || []).forEach((trace) => {
    if (
      trace.name &&
      trace.visible !== "legendonly" &&
      trace.visible !== false
    ) {
      visible.add(trace.name);
    }
  });
  const annotations = paceLabelData
    .filter((label) => visible.has(label.type))
    .map(paceAnnotation);
  if (paceAverageAnnotation) annotations.push(paceAverageAnnotation);
  return annotations;
}

function bindPaceLegend() {
  const gd = $("chart-pace");
  if (gd.__paceLegendBound || typeof gd.on !== "function") return;
  gd.__paceLegendBound = true;
  const sync = () => {
    Plotly.relayout(gd, { annotations: visiblePaceAnnotations() });
  };
  gd.on("plotly_legendclick", () => setTimeout(sync, 0));
  gd.on("plotly_legenddoubleclick", () => setTimeout(sync, 0));
}

function emptyChart(containerId, title, message) {
  Plotly.react(
    containerId,
    [],
    {
      ...baseLayout(null),
      xaxis: { visible: false },
      yaxis: { visible: false },
      annotations: [
        {
          text: message,
          showarrow: false,
          x: 0.5,
          y: 0.5,
          xref: "paper",
          yref: "paper",
          font: { color: "#9CA3AF", size: 13 },
        },
      ],
    },
    PLOT_CONFIG,
  );
}

function renderMonth(payload) {
  const kpis = payload.kpis;
  $("kpi-distance").textContent = Number(kpis.total_distance_km || 0).toFixed(1);
  $("kpi-total-distance").textContent = Number(
    kpis.lifetime_distance_km || 0,
  ).toFixed(1);
  $("kpi-pace").textContent = kpis.average_pace_label || "\u2014";
  $("kpi-workouts").textContent = String(kpis.workouts || 0);

  const charts = payload.charts;
  const dateTicks = monthDateTicks(payload.month);

  const distanceValues = charts.distance.values;
  if (!numeric(distanceValues.filter((value) => value > 0)).length) {
    emptyChart("chart-distance", "Distance (km)", "No runs with distance this month");
  } else {
    Plotly.react(
      "chart-distance",
      lollipopTraces(
        charts.distance.dates,
        distanceValues,
        charts.distance.types,
        {
          baseline: () => 0,
          label: fmtKm,
          hover: (value) => `${fmtKm(value)} km`,
        },
      ),
      baseLayout(
        null,
        { ...LOLLIPOP_Y, ...rangeToZero(distanceValues, {}, 1.18) },
        dateTicks,
      ),
      PLOT_CONFIG,
    );
  }

  const timeValues = charts.time.values;
  if (!numeric(timeValues.filter((value) => value > 0)).length) {
    emptyChart("chart-time", "Time", "No workouts this month");
  } else {
    Plotly.react(
      "chart-time",
      lollipopTraces(charts.time.dates, timeValues, charts.time.types, {
        baseline: () => 0,
        label: fmtShortDuration,
        hover: (value) => fmtDuration(value),
      }),
      baseLayout(
        null,
        { ...LOLLIPOP_Y, ...rangeToZero(timeValues, {}, 1.14) },
        dateTicks,
      ),
      PLOT_CONFIG,
    );
  }

  const monthTime = charts.month_time;
  const monthTicks = hourTicks(monthTime.total);
  const lastIndex = monthTime.total.length - 1;
  const lastTotal = monthTime.total[lastIndex];
  const annotations = [];
  if (lastTotal != null && monthTime.dates.length) {
    annotations.push({
      x: monthTime.dates[lastIndex],
      y: lastTotal,
      text: fmtHoursMinutes(lastTotal),
      showarrow: false,
      xanchor: "right",
      yanchor: "bottom",
      yshift: 6,
      bgcolor: "rgba(255, 255, 255, 0.85)",
      borderpad: 2,
      font: { size: 12, color: "#1F2937" },
    });
  }

  Plotly.react(
    "chart-month-time",
    [
      {
        x: monthTime.dates,
        y: monthTime.total,
        customdata: monthTime.total.map(fmtDuration),
        mode: "lines+markers",
        type: "scatter",
        marker: { color: "#94A3B8", size: 4 },
        line: { color: "#94A3B8", width: 2, shape: "hv" },
        fill: "tozeroy",
        fillcolor: "rgba(148, 163, 184, 0.14)",
        name: "Total time",
        hovertemplate:
          "%{x|%d %b %Y}<br>Total: <b>%{customdata}</b><extra></extra>",
      },
      {
        x: monthTime.dates,
        y: monthTime.run,
        customdata: monthTime.run.map(fmtDuration),
        mode: "lines+markers",
        type: "scatter",
        marker: { color: "#2563EB", size: 4 },
        line: { color: "#2563EB", width: 2, shape: "hv" },
        fill: "tozeroy",
        fillcolor: "rgba(37, 99, 235, 0.18)",
        name: "Run time",
        hovertemplate:
          "%{x|%d %b %Y}<br>Run: <b>%{customdata}</b><extra></extra>",
      },
    ],
    {
      ...baseLayout(
        null,
        {
          ...monthTicks,
          showgrid: true,
          gridcolor: "#EEF2F7",
          showline: false,
        },
        dateTicks,
        52,
      ),
      annotations,
    },
    PLOT_CONFIG,
  );

  const paceValues = charts.pace.values;
  const paceNumbers = numeric(paceValues);
  const averagePace =
    kpis.average_pace_min != null
      ? kpis.average_pace_min
      : paceNumbers.length
        ? paceNumbers.reduce((sum, value) => sum + value, 0) / paceNumbers.length
        : null;

  if (!paceNumbers.length) {
    paceLabelData = [];
    paceAverageAnnotation = null;
    emptyChart("chart-pace", "Pace (min/km)", "No pace data this month");
  } else {
    const traces = lollipopTraces(
      charts.pace.dates,
      paceValues,
      charts.pace.types,
      {
        baseline: () => averagePace,
        label: fmtPace,
        hover: (value) => `${fmtPace(value)} min/km`,
        withText: false,
      },
    );

    paceLabelData = [];
    paceAverageAnnotation = null;
    for (const [type, points] of groupByType(
      charts.pace.dates,
      paceValues,
      charts.pace.types,
    ).entries()) {
      for (const point of points) {
        paceLabelData.push({
          type,
          x: point.x,
          y: point.y,
          text: fmtPace(point.y),
        });
      }
    }

    const annotations = paceLabelData.map(paceAnnotation);

    if (averagePace != null) {
      const first = charts.pace.dates[0];
      const last = charts.pace.dates[charts.pace.dates.length - 1];
      traces.unshift({
        x: [first, last],
        y: [averagePace, averagePace],
        mode: "lines",
        type: "scatter",
        line: { color: "#9CA3AF", width: 1.5, dash: "dash" },
        hoverinfo: "skip",
        showlegend: false,
      });
      paceAverageAnnotation = {
        xref: "paper",
        x: 1,
        y: averagePace,
        text: `avg ${fmtPace(averagePace)}`,
        showarrow: false,
        xanchor: "right",
        yanchor: "bottom",
        font: { size: 10, color: "#6B7280" },
      };
      annotations.push(paceAverageAnnotation);
    }

    Plotly.react(
      "chart-pace",
      traces,
      {
        ...baseLayout(
          null,
          {
            ...LOLLIPOP_Y,
            ...paddedRange(
              paceNumbers.concat(averagePace != null ? [averagePace] : []),
            ),
          },
          dateTicks,
        ),
        annotations,
      },
      PLOT_CONFIG,
    );
    bindPaceLegend();
  }
}

function renderShoes(shoes) {
  const body = $("shoes-body");
  body.innerHTML = "";

  if (!shoes.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 8;
    cell.className = "muted";
    cell.textContent = "No shoes in inventory";
    row.appendChild(cell);
    body.appendChild(row);
  } else {
    for (const shoe of shoes) {
      const row = document.createElement("tr");
      const cells = [
        shoe.name,
        (shoe.intended_use || []).join(", ") || "\u2014",
        shoe.start_date || "\u2014",
        shoe.end_date || "\u2014",
        `${Number(shoe.planned_km || 0).toFixed(1)} km`,
        `${Number(shoe.actual_km || 0).toFixed(1)} km`,
        `${Number(shoe.remaining_km || 0).toFixed(1)} km`,
        shoe.status,
      ];
      cells.forEach((text, index) => {
        const cell = document.createElement("td");
        cell.textContent = text;
        if (index === 7) {
          cell.className = `status status-${String(shoe.status).toLowerCase()}`;
        }
        row.appendChild(cell);
      });
      body.appendChild(row);
    }
  }

  $("shoes-section").hidden = false;
}

function showStatus(message, isError = false) {
  const element = $("status");
  element.textContent = message;
  element.hidden = false;
  element.classList.toggle("error", isError);
}

function setLoading(isLoading) {
  $("month-select").disabled = isLoading;
  document.body.classList.toggle("is-loading", isLoading);
}

async function loadJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

async function init() {
  try {
    const months = await loadJson(`${DATA_BASE}/months.json`);
    const select = $("month-select");
    select.innerHTML = "";

    for (const month of months.months || []) {
      const option = document.createElement("option");
      option.value = month.value;
      option.textContent = month.label;
      select.appendChild(option);
    }

    if (!months.months || !months.months.length) {
      showStatus("No workouts yet.");
      return;
    }

    const latest = months.latest || months.months[0].value;
    select.value = latest;

    const version = encodeURIComponent(months.generated_at || "");
    const [payload, shoes] = await Promise.all([
      loadJson(`${DATA_BASE}/${latest}.json?v=${version}`),
      loadJson(`${DATA_BASE}/shoes.json?v=${version}`),
    ]);

    $("kpis").hidden = false;
    $("charts").hidden = false;
    $("status").hidden = true;
    renderMonth(payload);
    renderShoes(shoes.shoes || []);

    const updated = new Date(months.generated_at);
    $("updated").textContent = `Last updated: ${updated.toLocaleString("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    })}`;

    select.addEventListener("change", async () => {
      try {
        setLoading(true);
        const next = await loadJson(
          `${DATA_BASE}/${select.value}.json?v=${version}`,
        );
        renderMonth(next);
        setLoading(false);
      } catch (error) {
        setLoading(false);
        showStatus(`Could not load ${select.value}: ${error.message}`, true);
      }
    });
  } catch (error) {
    showStatus(`Could not load dashboard: ${error.message}`, true);
  }
}

init();
