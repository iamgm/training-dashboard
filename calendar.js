const CAL_DATA_URL = "data/calendar.json";
const CAL_EMPTY_COLOR = "#ebedf0";
const CAL_NEUTRAL_COLOR = "#64748b";
const CAL_LIGHT_FROM = 80;
const CAL_LIGHT_TO = 36;
const CAL_MAX_SATURATION = 72;
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

const $ = (id) => document.getElementById(id);

const state = { data: null, mode: "rolling", year: null, color: "both" };

const COLOR_MODES = [
  {
    key: "both",
    label: "Type + duration",
    hint: "Hue = workout type, shade = duration",
  },
  { key: "type", label: "Type", hint: "Hue = workout type, one shade" },
  { key: "duration", label: "Duration", hint: "Shade = duration, no type" },
];

function parseIsoDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function isoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function startOfWeek(date) {
  const copy = new Date(date);
  const offset = (copy.getDay() + 6) % 7;
  return addDays(copy, -offset);
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function formatDuration(minutes) {
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours && mins) return `${hours}h ${String(mins).padStart(2, "0")}m`;
  if (hours) return `${hours}h`;
  return `${mins}m`;
}

function hexToHsl(hex) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;
  if (!delta) return { h: 0, s: 0 };
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  return { h: (hue * 60 + 360) % 360, s: saturation * 100 };
}

// Lightness is fixed per level, so the same level looks equally dark for every
// workout type. Opacity would not work: it mixes each hue with white unevenly.
function levelColor(hex, level, levels) {
  const { h, s } = hexToHsl(hex);
  const ratio = levels <= 1 ? 0 : (level - 1) / (levels - 1);
  const lightness = CAL_LIGHT_FROM + (CAL_LIGHT_TO - CAL_LIGHT_FROM) * ratio;
  const saturation = Math.min(s, CAL_MAX_SATURATION);
  return `hsl(${h.toFixed(0)} ${saturation.toFixed(0)}% ${lightness.toFixed(0)}%)`;
}

function levelFor(minutes, steps) {
  for (const step of steps) {
    if (step.max_min != null && minutes <= step.max_min) return step.level;
  }
  return steps[steps.length - 1].level;
}

// One switch for what the grid encodes: hue + shade, hue only, or shade only.
// The duration ramp uses the same neutral as the legend swatches, so the
// legend stays truthful in every mode.
function cellColor(type, level, levels) {
  const base = TYPE_COLORS[type] || TYPE_COLORS.Undefined;
  if (state.color === "type") return base;
  if (state.color === "duration") {
    return levelColor(CAL_NEUTRAL_COLOR, level, levels);
  }
  return levelColor(base, level, levels);
}

function tooltip(day) {
  const parts = [
    parseIsoDate(day.date).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
    day.type,
  ];
  if (day.distance_km > 0) parts.push(`${day.distance_km.toFixed(1)} km`);
  parts.push(formatDuration(day.minutes));
  if (day.shoes && day.shoes.length) parts.push(day.shoes.join(", "));
  return parts.join(" \u00b7 ");
}

function rangeFor(mode, year) {
  const today = startOfToday();
  if (mode === "year") {
    const start = new Date(year, 0, 1);
    const end = year === today.getFullYear() ? today : new Date(year, 11, 31);
    return { start, end };
  }
  const start = addDays(new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()), 1);
  return { start, end: today };
}

function makeTab(label, active, onClick, hint) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "cal-tab";
  button.textContent = label;
  button.setAttribute("aria-pressed", String(active));
  if (hint) button.title = hint;
  button.addEventListener("click", onClick);
  return button;
}

function renderTabs() {
  const tabs = $("cal-tabs");
  tabs.innerHTML = "";
  const options = [{ key: "rolling", label: "12 months" }].concat(
    (state.data.years || []).map((year) => ({
      key: String(year),
      label: String(year),
    })),
  );

  for (const option of options) {
    const active =
      state.mode === "rolling"
        ? option.key === "rolling"
        : option.key === String(state.year);
    tabs.appendChild(
      makeTab(option.label, active, () => {
        if (option.key === "rolling") {
          state.mode = "rolling";
          state.year = null;
        } else {
          state.mode = "year";
          state.year = Number(option.key);
        }
        render();
      }),
    );
  }
}

function renderModes() {
  const modes = $("cal-modes");
  modes.innerHTML = "";
  for (const option of COLOR_MODES) {
    modes.appendChild(
      makeTab(
        option.label,
        state.color === option.key,
        () => {
          if (state.color === option.key) return;
          state.color = option.key;
          render();
        },
        option.hint,
      ),
    );
  }
}

function renderRangeLabel(start, end) {
  const format = (date) =>
    date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  const first = format(start);
  const last = format(end);
  $("cal-range").textContent = first === last ? first : `${first} \u2013 ${last}`;
}

function renderGrid(start, end) {
  const { steps, days } = state.data;
  const levels = steps.length;
  const dayMap = new Map(days.map((day) => [day.date, day]));
  const gridStart = startOfWeek(start);
  const gridEnd = addDays(startOfWeek(end), 6);

  const weekStarts = [];
  for (let cursor = gridStart; cursor <= gridEnd; cursor = addDays(cursor, 7)) {
    weekStarts.push(cursor);
  }

  const columns = `repeat(${weekStarts.length}, var(--cal-cell))`;
  const grid = $("cal-grid");
  grid.innerHTML = "";
  grid.style.gridTemplateColumns = columns;

  const todayIso = isoDate(startOfToday());

  for (const weekStart of weekStarts) {
    for (let index = 0; index < 7; index += 1) {
      const date = addDays(weekStart, index);
      const cell = document.createElement("div");
      cell.className = "cal-cell";

      if (date < start || date > end) {
        cell.classList.add("outside");
      } else {
        const iso = isoDate(date);
        const day = dayMap.get(iso);
        if (day) {
          const level = levelFor(day.minutes, steps);
          cell.style.background = cellColor(day.type, level, levels);
          cell.classList.add("filled");
          cell.tabIndex = 0;
          cell.setAttribute("role", "img");
          const label = tooltip(day);
          cell.title = label;
          cell.setAttribute("aria-label", label);
        } else {
          cell.style.background = CAL_EMPTY_COLOR;
        }
        if (iso === todayIso) cell.classList.add("today");
      }

      grid.appendChild(cell);
    }
  }

  const months = $("cal-months");
  months.innerHTML = "";
  months.style.gridTemplateColumns = columns;
  weekStarts.forEach((weekStart, column) => {
    for (let index = 0; index < 7; index += 1) {
      const date = addDays(weekStart, index);
      if (date.getDate() === 1 && date >= start && date <= end) {
        const label = document.createElement("span");
        label.className = "cal-month";
        label.style.gridColumn = String(column + 1);
        label.textContent = MONTHS_SHORT[date.getMonth()];
        months.appendChild(label);
        break;
      }
    }
  });
}

function renderLegend() {
  const types = $("legend-types");
  types.innerHTML = "";
  const title = document.createElement("span");
  title.className = "legend-title";
  title.textContent = "Type";
  types.appendChild(title);

  for (const [name, color] of Object.entries(TYPE_COLORS)) {
    if (name === "Undefined") continue;
    const item = document.createElement("span");
    item.className = "legend-item";
    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.background = color;
    const label = document.createElement("span");
    label.textContent = name;
    item.append(swatch, label);
    types.appendChild(item);
  }

  const levels = $("legend-levels");
  levels.innerHTML = "";
  const levelTitle = document.createElement("span");
  levelTitle.className = "legend-title";
  levelTitle.textContent = "Duration";
  levels.appendChild(levelTitle);

  const { steps } = state.data;
  steps.forEach((step, index) => {
    const previous = index === 0 ? null : steps[index - 1].max_min;
    let text;
    if (step.max_min == null) text = `>${previous}m`;
    else if (previous == null) text = `\u2264${step.max_min}m`;
    else text = `${previous}\u2013${step.max_min}m`;

    const item = document.createElement("span");
    item.className = "legend-item";
    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.background = levelColor(CAL_NEUTRAL_COLOR, step.level, steps.length);
    const label = document.createElement("span");
    label.textContent = text;
    item.append(swatch, label);
    levels.appendChild(item);
  });

  // Keep only the legend that matches the current colour mode, but always keep
  // the "rest" swatch: empty days stay grey in every mode.
  types.hidden = state.color === "duration";
  levels.hidden = state.color === "type";

  const rest = document.createElement("span");
  rest.className = "legend-item";
  const restSwatch = document.createElement("span");
  restSwatch.className = "legend-swatch";
  restSwatch.style.background = CAL_EMPTY_COLOR;
  const restLabel = document.createElement("span");
  restLabel.textContent = "rest";
  rest.append(restSwatch, restLabel);
  (levels.hidden ? types : levels).appendChild(rest);
}

function render() {
  const { start, end } = rangeFor(state.mode, state.year);
  renderTabs();
  renderModes();
  renderRangeLabel(start, end);
  renderGrid(start, end);
  renderLegend();
}

async function init() {
  try {
    const response = await fetch(CAL_DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`${CAL_DATA_URL}: ${response.status}`);
    const data = await response.json();
    if (!data.days || !data.days.length) {
      showStatus("No workouts yet.");
      return;
    }
    state.data = data;
    render();
    $("calendar").hidden = false;
    $("status").hidden = true;

    const updated = new Date(data.generated_at);
    $("updated").textContent = `Last updated: ${updated.toLocaleString("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    })}`;
  } catch (error) {
    showStatus(`Could not load calendar: ${error.message}`, true);
  }
}

function showStatus(message, isError = false) {
  const element = $("status");
  element.textContent = message;
  element.hidden = false;
  element.classList.toggle("error", isError);
}

init();
