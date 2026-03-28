import { getCachedData } from "@/lib/data";
import {
  SECTION_ORDER,
  SECTION_ICONS,
  CORRELATIONS,
  INDICATOR_GLOSSARY,
} from "@/lib/config";
import type { Indicator, Indicators, DashboardData } from "@/lib/types";
import DashboardClient from "./DashboardClient";

// ---------------------------------------------------------------------------
// Helper functions (ported from Python refresh_macro.py)
// ---------------------------------------------------------------------------

const RANGE_BAR_KEYS = new Set([
  "SP500", "DOW", "NASDAQ", "FTSE100", "NIKKEI",
  "VIX", "OIL_WTI", "OIL_BRT", "GOLD", "COPPER", "DXY",
  "US_10Y", "US_2Y", "US_30Y",
]);

function valueDisplay(key: string, ind: Indicator): string {
  const vs = ind.value_str;
  if (vs) return vs;
  const v = ind.value;
  if (v === null || v === undefined) return "N/A";
  const unit = ind.unit || "";
  if (["SP500", "DOW", "NASDAQ", "FTSE100", "NIKKEI"].includes(key))
    return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (["GOLD", "OIL_WTI", "OIL_BRT"].includes(key))
    return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (key === "COPPER") return `$${v.toFixed(3)}`;
  if (unit === "%" || unit.endsWith("% YoY")) return `${v.toFixed(2)}%`;
  if (unit === "bps") return `${v.toFixed(0)}bps`;
  if (key === "DXY") return v.toFixed(2);
  return v.toFixed(2);
}

function prevDisplay(key: string, ind: Indicator): string {
  const prev = ind.previous;
  if (prev === null || prev === undefined) return "\u2014";
  const unit = ind.unit || "";
  if (["SP500", "DOW", "NASDAQ", "FTSE100", "NIKKEI"].includes(key))
    return prev.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (["GOLD", "OIL_WTI", "OIL_BRT"].includes(key))
    return `$${prev.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (key === "INITIAL_CLAIMS") return `${(prev / 1000).toFixed(0)}K`;
  if (key === "NFP") return `${prev >= 0 ? "+" : ""}${prev.toFixed(0)}K`;
  if (unit === "%" || unit.endsWith("% YoY")) return `${prev.toFixed(2)}%`;
  if (unit === "bps") return `${prev.toFixed(0)}bps`;
  return prev.toFixed(2);
}

function prevDateDisplay(ind: Indicator): string {
  const pd = ind.previous_date;
  if (!pd) return "";
  try {
    const dt = new Date(pd + "T00:00:00");
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `(${dt.getDate()} ${months[dt.getMonth()]})`;
  } catch {
    return "";
  }
}

function sparklineSvg(key: string, ind: Indicator): string {
  const history = ind.history || [];
  if (!history || history.length < 2) return "";
  const pts = history.slice(-30);
  const values = pts.map((p) => p[1]);
  const mn = Math.min(...values);
  const mx = Math.max(...values);
  const rng = mx !== mn ? mx - mn : 1;
  const w = 120;
  const h = 30;
  const pad = 2;
  const coords: string[] = [];
  for (let i = 0; i < values.length; i++) {
    const x = pad + ((w - 2 * pad) * i) / (values.length - 1);
    const y = h - pad - ((h - 2 * pad) * (values[i] - mn)) / rng;
    coords.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  const sig = ind.signal || "NEUTRAL";
  const color = sig === "BULLISH" ? "#00e676" : sig === "BEARISH" ? "#ff4d4d" : "#ffd24d";
  const poly = coords.join(" ");
  const fillPoly = `${pad.toFixed(1)},${(h - pad).toFixed(1)} ${poly} ${(w - pad).toFixed(1)},${(h - pad).toFixed(1)}`;
  const lastParts = coords[coords.length - 1].split(",");
  const lx = lastParts[0];
  const ly = lastParts[1];
  return (
    `<svg class="sparkline" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<polyline points="${fillPoly}" fill="${color}22" stroke="none"/>` +
    `<polyline points="${poly}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="${lx}" cy="${ly}" r="2" fill="${color}"/>` +
    `</svg>`
  );
}

function rangeBarHtml(key: string, ind: Indicator): string {
  if (!RANGE_BAR_KEYS.has(key)) return "";
  const hi = ind.high52w;
  const lo = ind.low52w;
  const v = ind.value;
  if (hi === undefined || lo === undefined || v === null || v === undefined || hi === lo) return "";
  const pct = Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
  const unit = ind.unit || "";
  let loS: string;
  let hiS: string;
  if (["SP500", "DOW", "NASDAQ", "FTSE100", "NIKKEI"].includes(key)) {
    loS = lo.toLocaleString("en-US", { maximumFractionDigits: 0 });
    hiS = hi.toLocaleString("en-US", { maximumFractionDigits: 0 });
  } else if (["GOLD", "OIL_WTI", "OIL_BRT"].includes(key)) {
    loS = `$${lo.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
    hiS = `$${hi.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  } else if (key === "COPPER") {
    loS = `$${lo.toFixed(2)}`;
    hiS = `$${hi.toFixed(2)}`;
  } else if (unit === "%" || unit.endsWith("% YoY")) {
    loS = `${lo.toFixed(2)}%`;
    hiS = `${hi.toFixed(2)}%`;
  } else if (unit === "K") {
    loS = `${(lo / 1000).toFixed(0)}K`;
    hiS = `${(hi / 1000).toFixed(0)}K`;
  } else {
    loS = lo.toFixed(2);
    hiS = hi.toFixed(2);
  }
  return (
    `<div class="range-bar" title="52-week range">` +
    `<div class="range-label">52w range</div>` +
    `<div class="range-track">` +
    `<div class="range-fill" style="width:${pct.toFixed(1)}%"></div>` +
    `<div class="range-marker" style="left:${pct.toFixed(1)}%"></div>` +
    `</div>` +
    `<div class="range-labels"><span>${loS}</span><span>${hiS}</span></div></div>`
  );
}

function computeHeatScore(ind: Indicator): number {
  const sig = ind.signal || "NEUTRAL";
  const base = sig === "BULLISH" ? 1 : sig === "BEARISH" ? -1 : 0;
  const momentum = ind.momentum;
  let heat: number;
  if (momentum === "ACCEL" && base !== 0) {
    heat = base + (base > 0 ? 1 : -1);
  } else if (momentum === "DECEL" && base !== 0) {
    heat = 0;
  } else {
    heat = base;
  }
  return Math.max(-2, Math.min(2, heat));
}

const HEAT_COLORS: Record<string, string> = {
  "-2": "#ff1a1a",
  "-1": "#ff4d4d",
  "0": "#3d4663",
  "1": "#00c853",
  "2": "#00ff88",
};

function computeExtremity(ind: Indicator): number {
  const hi = ind.high52w;
  const lo = ind.low52w;
  const v = ind.value;
  if (hi === undefined || lo === undefined || v === null || v === undefined || hi === lo) return 0.5;
  const mid = (hi + lo) / 2;
  const rng = (hi - lo) / 2;
  return rng > 0 ? Math.min(1.0, Math.abs(v - mid) / rng) : 0.5;
}

const REGIME_COLORS: Record<string, string> = {
  EXPANSION: "#00e676",
  TIGHTENING: "#ff4d4d",
  SLOWDOWN: "#ffd24d",
  RECESSION: "#ff1a1a",
  RECOVERY: "#4d9fff",
  STAGFLATION: "#ff6b35",
  MIXED: "#8892b0",
};

function classifyRegimeFromValues(
  ff?: number | null, ffPrev?: number | null,
  unemp?: number | null, unempPrev?: number | null,
  cpi?: number | null, ism?: number | null,
  sp?: number | null, spPrev?: number | null,
  oil?: number | null, spSma200?: number | null,
): string {
  const ffRising = ff != null && ffPrev != null && ff > ffPrev + 0.01;
  const ffFalling = ff != null && ffPrev != null && ff < ffPrev - 0.01;
  const unempRising = unemp != null && unempPrev != null && unemp - unempPrev >= 0.1;
  const unempStableOrFalling = unemp != null && unempPrev != null && unemp <= unempPrev + 0.05;
  const spRising = sp != null && spPrev != null && sp > spPrev;
  const spAboveSma200 = sp != null && spSma200 != null && sp > spSma200;

  if (ism != null && ism < 47 && unempRising) return "RECESSION";
  if (oil != null && oil > 85 && cpi != null && cpi > 2.5) return "STAGFLATION";
  if (ffRising && cpi != null && cpi > 2.5) return "TIGHTENING";
  if (spAboveSma200 && unemp != null && unemp < 4.2 && (ism == null || ism > 50)) return "EXPANSION";
  if (spRising && unemp != null && unemp < 4.0) return "EXPANSION";
  if (ffFalling && spRising && unempStableOrFalling) return "RECOVERY";
  if (spRising && unempStableOrFalling && !ffRising) return "RECOVERY";
  if (ism != null && ism < 52 && !spRising) return "SLOWDOWN";
  return "MIXED";
}

function buildRegimeTimelineData(indicators: Indicators): { month: string; regime: string; color: string }[] {
  const histMap: Record<string, Record<string, number>> = {};
  for (const key of ["FED_FUNDS", "UNEMPLOYMENT", "CPI_YOY", "ISM_MFG", "SP500", "OIL_WTI"]) {
    histMap[key] = {};
    const history = indicators[key]?.history || [];
    for (const [d, v] of history) {
      histMap[key][d.slice(0, 7)] = v;
    }
  }
  const spHistory = indicators.SP500?.history || [];
  const spSma200Map: Record<string, number> = {};
  if (spHistory.length >= 200) {
    for (let i = 200; i < spHistory.length; i++) {
      const ym = spHistory[i][0].slice(0, 7);
      const window = spHistory.slice(Math.max(0, i - 199), i + 1).map((p) => p[1]);
      spSma200Map[ym] = window.reduce((a, b) => a + b, 0) / window.length;
    }
  }
  const spSma200Current = indicators.SP500?.sma200 ?? null;

  const today = new Date();
  const months: string[] = [];
  for (let i = 23; i >= 0; i--) {
    let m = today.getMonth() + 1 - i;
    let y = today.getFullYear();
    while (m <= 0) { m += 12; y -= 1; }
    months.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  const timeline: { month: string; regime: string; color: string }[] = [];
  const prevVals: Record<string, number | null> = {};
  for (const key of Object.keys(histMap)) prevVals[key] = null;
  for (const ym of months) {
    const vals: Record<string, number | undefined> = {};
    for (const key of Object.keys(histMap)) vals[key] = histMap[key][ym];
    const sma200 = spSma200Map[ym] ?? spSma200Current;
    const regime = classifyRegimeFromValues(
      vals.FED_FUNDS, prevVals.FED_FUNDS,
      vals.UNEMPLOYMENT, prevVals.UNEMPLOYMENT,
      vals.CPI_YOY, vals.ISM_MFG,
      vals.SP500, prevVals.SP500,
      vals.OIL_WTI, sma200,
    );
    timeline.push({ month: ym, regime, color: REGIME_COLORS[regime] || "#8892b0" });
    for (const key of Object.keys(histMap)) {
      if (vals[key] !== undefined) prevVals[key] = vals[key]!;
    }
  }
  return timeline;
}

function buildCurrentRegimeDescription(indicators: Indicators): { regime: string; color: string; description: string } {
  const cpi = indicators.CPI_YOY?.value ?? null;
  const unemp = indicators.UNEMPLOYMENT?.value ?? null;
  const unempPrev = indicators.UNEMPLOYMENT?.previous ?? null;
  const ism = indicators.ISM_MFG?.value ?? null;
  const ff = indicators.FED_FUNDS?.value ?? null;
  const ffPrev = indicators.FED_FUNDS?.previous ?? null;
  const sp = indicators.SP500?.value ?? null;
  const spPrev = indicators.SP500?.previous ?? null;
  const oil = indicators.OIL_WTI?.value ?? null;
  const spSma200 = indicators.SP500?.sma200 ?? null;

  const regime = classifyRegimeFromValues(ff, ffPrev, unemp, unempPrev, cpi, ism, sp, spPrev, oil, spSma200);
  const color = REGIME_COLORS[regime] || "#8892b0";
  const parts = [`Current regime: <strong style="color:${color}">${regime}</strong>`];
  if (regime === "STAGFLATION") {
    let desc = "Inflation elevated";
    if (cpi) desc += ` (CPI ${cpi.toFixed(1)}%)`;
    if (oil) desc += ` with oil at $${oil.toFixed(0)}`;
    if (ism) desc += ` while manufacturing weakens (ISM ${ism.toFixed(1)})`;
    parts.push(desc.trim() + ". Last similar period: 2022 Q2-Q3.");
  } else if (regime === "TIGHTENING") {
    let desc = "Fed in restrictive mode";
    if (ff) desc += ` at ${ff.toFixed(2)}%`;
    if (cpi) desc += `, inflation at ${cpi.toFixed(1)}%`;
    parts.push(desc + ". Bond market pricing sustained higher rates.");
  } else if (regime === "EXPANSION") {
    let desc = "Broad growth";
    if (unemp) desc += ` with unemployment at ${unemp.toFixed(1)}%`;
    if (ism) desc += `, ISM at ${ism.toFixed(1)}`;
    parts.push(desc + ". Risk assets favored.");
  } else if (regime === "SLOWDOWN") {
    let desc = "Growth decelerating";
    if (ism) desc += ` \u2014 ISM at ${ism.toFixed(1)}`;
    if (unemp) desc += `, unemployment at ${unemp.toFixed(1)}%`;
    parts.push(desc + ". Watch for recession signals.");
  } else if (regime === "RECESSION") {
    let desc = "Recessionary conditions";
    if (unemp) desc += ` \u2014 unemployment at ${unemp.toFixed(1)}%`;
    parts.push(desc + ". Defensive positioning warranted.");
  } else if (regime === "RECOVERY") {
    parts.push("Early recovery phase. Equities typically lead the upturn.");
  } else {
    parts.push("Mixed signals \u2014 no dominant regime. Multiple crosscurrents.");
  }
  return { regime, color, description: parts.join(" \u2014 ") };
}

function buildScenarios(indicators: Indicators): {
  title: string; probability: string; prob_color: string; border: string;
  content: string; impacts: [string, string, string][];
}[] {
  const scenarios: {
    title: string; probability: string; prob_color: string; border: string;
    content: string; impacts: [string, string, string][];
  }[] = [];
  const oil = indicators.OIL_WTI?.value ?? null;
  const vix = indicators.VIX?.value ?? null;
  const sp = indicators.SP500?.value ?? null;
  const pce = indicators.CORE_PCE_YOY?.value ?? null;
  const cpi = indicators.CPI_YOY?.value ?? null;
  const ff = indicators.FED_FUNDS?.value ?? null;
  const tenY = indicators.US_10Y?.value ?? null;
  const dxy = indicators.DXY?.value ?? null;

  if (oil && oil > 90) {
    const spLo = sp ? (sp * 0.93).toLocaleString("en-US", { maximumFractionDigits: 0 }) : "\u2014";
    const spHi = sp ? (sp * 0.96).toLocaleString("en-US", { maximumFractionDigits: 0 }) : "\u2014";
    const cpiLo = cpi ? (cpi + 0.3).toFixed(1) : "?";
    const cpiHi = cpi ? (cpi + 0.5).toFixed(1) : "?";
    const ffStr = ff ? `${ff.toFixed(2)}%` : "current level";
    scenarios.push({
      title: "Oil Stays Above $100",
      probability: oil > 95 ? "Medium" : "Low",
      prob_color: oil > 95 ? "#ffd24d" : "#8892b0",
      border: "#ff4d4d",
      content: `If WTI (currently $${oil.toFixed(0)}) remains above $100 for 4+ weeks: CPI likely rises to ${cpiLo}\u2013${cpiHi}%, consumer spending contracts 1\u20132%, Fed forced to hold at ${ffStr} or tighten, S&P 500 downside ${spLo}\u2013${spHi} range. Historical precedent: 2022 oil shock saw 3-month lag to peak CPI impact.`,
      impacts: [["CPI", "\u25b2", "#ff4d4d"], ["S&P 500", "\u25bc", "#ff4d4d"], ["Fed Funds", "\u25b2", "#ff4d4d"], ["Gold", "\u25b2", "#00e676"]],
    });
  }
  if (ff && ff > 4.0) {
    const tenLo = tenY ? (tenY - 0.3).toFixed(2) : "?";
    const tenHi = tenY ? (tenY - 0.2).toFixed(2) : "?";
    const spLo2 = sp ? (sp * 1.03).toLocaleString("en-US", { maximumFractionDigits: 0 }) : "?";
    const spHi2 = sp ? (sp * 1.05).toLocaleString("en-US", { maximumFractionDigits: 0 }) : "?";
    const dxyLo = dxy ? (dxy - 3).toFixed(0) : "?";
    const dxyHi = dxy ? (dxy - 2).toFixed(0) : "?";
    const prob = pce && pce > 2.5 ? "Low" : "Medium";
    const pceStr = pce ? `${pce.toFixed(1)}%` : "elevated";
    scenarios.push({
      title: "Fed Cuts by June",
      probability: prob,
      prob_color: prob === "Low" ? "#8892b0" : "#ffd24d",
      border: "#00e676",
      content: `If Fed delivers surprise cut from ${ff.toFixed(2)}%: 10Y likely drops to ${tenLo}\u2013${tenHi}%, S&P rallies to ${spLo2}\u2013${spHi2} in first week, DXY weakens toward ${dxyLo}\u2013${dxyHi}, gold benefits. Probability currently ${prob.toLowerCase()} given Core PCE at ${pceStr}.`,
      impacts: [["10Y Yield", "\u25bc", "#00e676"], ["S&P 500", "\u25b2", "#00e676"], ["DXY", "\u25bc", "#00e676"], ["Gold", "\u25b2", "#00e676"]],
    });
  }
  if (oil && oil > 85) {
    const vixStr = vix ? vix.toFixed(1) : "?";
    const spLo3 = sp ? (sp * 1.05).toLocaleString("en-US", { maximumFractionDigits: 0 }) : "?";
    const spHi3 = sp ? (sp * 1.08).toLocaleString("en-US", { maximumFractionDigits: 0 }) : "?";
    scenarios.push({
      title: "Geopolitical De-escalation",
      probability: "Low",
      prob_color: "#8892b0",
      border: "#00e676",
      content: `If geopolitical tensions ease: oil (currently $${oil.toFixed(0)}) could drop to $70\u201375, VIX (currently ${vixStr}) back below 18, equities rally to ${spLo3}\u2013${spHi3} on multiple expansion, credit spreads tighten 50\u201380bps.`,
      impacts: [["Oil", "\u25bc", "#00e676"], ["VIX", "\u25bc", "#00e676"], ["S&P 500", "\u25b2", "#00e676"], ["HY Spread", "\u25bc", "#00e676"]],
    });
  }
  return scenarios;
}

function detectChanges(indicators: Indicators): { key: string; label: string; old: string; new_val: string; context: string }[] {
  const relativeKeys = new Set(["SP500", "DOW", "NASDAQ", "FTSE100", "NIKKEI", "OIL_WTI", "OIL_BRT", "GOLD", "COPPER", "DXY", "VIX"]);
  const rateKeys = new Set(["FED_FUNDS", "US_2Y", "US_10Y", "US_30Y", "SPREAD_2S10S"]);
  const spreadKeys = new Set(["IG_SPREAD", "HY_SPREAD"]);
  const changes: { key: string; label: string; old: string; new_val: string; context: string }[] = [];
  for (const [key, ind] of Object.entries(indicators)) {
    const v = ind.value;
    const prev = ind.previous;
    if (v === null || v === undefined || prev === null || prev === undefined) continue;
    const diff = v - prev;
    let isSignificant = false;
    let context = "";
    if (relativeKeys.has(key)) {
      const pct = prev !== 0 ? Math.abs(diff / prev * 100) : 0;
      if (pct > 1.0) { isSignificant = true; context = `${(diff / prev * 100) >= 0 ? "+" : ""}${(diff / prev * 100).toFixed(1)}%`; }
    } else if (rateKeys.has(key)) {
      const bps = Math.abs(diff * 100);
      if (bps >= 5) { isSignificant = true; context = `${diff * 100 >= 0 ? "+" : ""}${(diff * 100).toFixed(0)}bps`; }
    } else if (spreadKeys.has(key)) {
      if (Math.abs(diff) >= 5) { isSignificant = true; context = `${diff >= 0 ? "+" : ""}${diff.toFixed(0)}bps`; }
    } else if (key === "NFP") {
      if (Math.abs(diff) >= 20) { isSignificant = true; context = `${diff >= 0 ? "+" : ""}${diff.toFixed(0)}K vs prior`; }
    } else if (key === "UNEMPLOYMENT") {
      if (Math.abs(diff) >= 0.1) { isSignificant = true; context = `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}pp`; }
    } else if (key === "INITIAL_CLAIMS") {
      if (Math.abs(diff) >= 5000) { isSignificant = true; context = `${diff >= 0 ? "+" : ""}${(diff / 1000).toFixed(0)}K`; }
    } else if (["CPI_YOY", "CORE_CPI_YOY", "CORE_PCE_YOY"].includes(key)) {
      if (Math.abs(diff) >= 0.1) { isSignificant = true; context = `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}pp`; }
    } else if (["ISM_MFG", "CONSUMER_CONF"].includes(key)) {
      if (Math.abs(diff) >= 1.0) { isSignificant = true; context = `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}pts`; }
    }
    if (isSignificant) {
      changes.push({ key, label: ind.label || key, old: prevDisplay(key, ind), new_val: valueDisplay(key, ind), context });
    }
  }
  return changes;
}

function getUpcomingReleases(): { name: string; dateStr: string; days: number; category: string }[] {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  function nextWeekdayOnOrAfter(d: Date, wd: number): Date {
    const result = new Date(d);
    const diff = (wd - result.getUTCDay() + 7) % 7;
    result.setUTCDate(result.getUTCDate() + diff);
    return result;
  }

  function firstWeekdayOfMonth(y: number, m: number, wd: number): Date {
    return nextWeekdayOnOrAfter(new Date(Date.UTC(y, m - 1, 1)), wd);
  }

  function nm(y: number, m: number): [number, number] {
    return m === 12 ? [y + 1, 1] : [y, m + 1];
  }

  const todayDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const releases: [string, Date, string][] = [];

  // NFP - first Friday
  let nfp = firstWeekdayOfMonth(todayDate.getUTCFullYear(), todayDate.getUTCMonth() + 1, 5);
  if (nfp <= todayDate) {
    const [ny, nmo] = nm(todayDate.getUTCFullYear(), todayDate.getUTCMonth() + 1);
    nfp = firstWeekdayOfMonth(ny, nmo, 5);
  }
  releases.push(["Nonfarm Payrolls", nfp, "Labour"]);

  // CPI - second Wednesday
  let cpi = new Date(firstWeekdayOfMonth(todayDate.getUTCFullYear(), todayDate.getUTCMonth() + 1, 3));
  cpi.setUTCDate(cpi.getUTCDate() + 7);
  if (cpi <= todayDate) {
    const [ny, nmo] = nm(todayDate.getUTCFullYear(), todayDate.getUTCMonth() + 1);
    cpi = new Date(firstWeekdayOfMonth(ny, nmo, 3));
    cpi.setUTCDate(cpi.getUTCDate() + 7);
  }
  releases.push(["CPI Release", cpi, "Inflation"]);

  // PCE - last Friday
  function lastFriday(y: number, m: number): Date {
    const [ny2, nm2] = nm(y, m);
    const last = new Date(Date.UTC(ny2, nm2 - 1, 0));
    const daysDiff = (last.getUTCDay() - 5 + 7) % 7;
    last.setUTCDate(last.getUTCDate() - daysDiff);
    return last;
  }
  let pce = lastFriday(todayDate.getUTCFullYear(), todayDate.getUTCMonth() + 1);
  if (pce <= todayDate) {
    const [ny, nmo] = nm(todayDate.getUTCFullYear(), todayDate.getUTCMonth() + 1);
    pce = lastFriday(ny, nmo);
  }
  releases.push(["Core PCE / Personal Income", pce, "Inflation"]);

  // Initial Claims - next Thursday
  const nxtThu = new Date(todayDate);
  const daysToThu = ((4 - todayDate.getUTCDay() + 7) % 7) || 7;
  nxtThu.setUTCDate(nxtThu.getUTCDate() + daysToThu);
  releases.push(["Initial Jobless Claims", nxtThu, "Labour"]);

  // ISM Manufacturing
  function firstBday(y: number, m: number): Date {
    const d = new Date(Date.UTC(y, m - 1, 1));
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return d;
  }
  let ism = firstBday(todayDate.getUTCFullYear(), todayDate.getUTCMonth() + 1);
  if (ism <= todayDate) {
    const [ny, nmo] = nm(todayDate.getUTCFullYear(), todayDate.getUTCMonth() + 1);
    ism = firstBday(ny, nmo);
  }
  releases.push(["ISM Manufacturing PMI", ism, "Activity"]);

  // FOMC
  const fomcDates = [
    "2025-01-29", "2025-03-19", "2025-05-07", "2025-06-18", "2025-07-30",
    "2025-09-17", "2025-10-29", "2025-12-17",
    "2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17", "2026-07-29",
    "2026-09-16", "2026-10-28", "2026-12-16",
    "2027-01-27", "2027-03-17",
  ];
  for (const ds of fomcDates) {
    const d = new Date(ds + "T00:00:00Z");
    if (d > todayDate) {
      releases.push(["FOMC Decision", d, "Rates"]);
      break;
    }
  }

  // Michigan Consumer Sentiment - second Friday
  let mich = new Date(firstWeekdayOfMonth(todayDate.getUTCFullYear(), todayDate.getUTCMonth() + 1, 5));
  mich.setUTCDate(mich.getUTCDate() + 7);
  if (mich <= todayDate) {
    const [ny, nmo] = nm(todayDate.getUTCFullYear(), todayDate.getUTCMonth() + 1);
    mich = new Date(firstWeekdayOfMonth(ny, nmo, 5));
    mich.setUTCDate(mich.getUTCDate() + 7);
  }
  releases.push(["Michigan Consumer Sentiment", mich, "Sentiment"]);

  releases.sort((a, b) => a[1].getTime() - b[1].getTime());

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const result = releases.slice(0, 5).map(([name, d, cat]) => {
    const days = Math.round((d.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
    const dateStr = `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
    return { name, dateStr, days, category: cat };
  });
  return result;
}

function generateNarrative(indicators: Indicators): string {
  const vixV = indicators.VIX?.value ?? null;
  const oilV = indicators.OIL_WTI?.value ?? null;
  const spV = indicators.SP500?.value ?? null;
  const spSma200 = indicators.SP500?.sma200 ?? null;
  const spHigh = indicators.SP500?.high52w ?? null;
  const unempV = indicators.UNEMPLOYMENT?.value ?? null;
  const unempPrev = indicators.UNEMPLOYMENT?.previous ?? null;
  const nfpV = indicators.NFP?.value ?? null;
  const cpiV = indicators.CPI_YOY?.value ?? null;
  const pceV = indicators.CORE_PCE_YOY?.value ?? null;
  const ff = indicators.FED_FUNDS;
  const ffStr = ff?.value_str || "N/A";
  const hyV = indicators.HY_SPREAD?.value ?? null;
  const spreadV = indicators.SPREAD_2S10S?.value ?? null;
  const consumerV = indicators.CONSUMER_CONF?.value ?? null;
  const dxyV = indicators.DXY?.value ?? null;

  const bull = Object.values(indicators).filter((i) => i.signal === "BULLISH").length;
  const bear = Object.values(indicators).filter((i) => i.signal === "BEARISH").length;

  const sentences: string[] = [];

  // Sentence 1
  const inflationHot = (oilV != null && oilV > 85) || (cpiV != null && cpiV > 3.0) || (pceV != null && pceV > 2.8);
  const laborWeak = (nfpV != null && nfpV < 50) || (unempV != null && unempPrev != null && unempV - unempPrev >= 0.1);
  const riskOff = vixV != null && vixV > 22 && spSma200 != null && spV != null && spV < spSma200;

  if (inflationHot && laborWeak) {
    const infBits: string[] = [];
    if (oilV != null && oilV > 85) infBits.push(`oil above $${oilV.toFixed(0)}`);
    if (cpiV != null && cpiV > 3.0) infBits.push(`CPI at ${cpiV.toFixed(1)}%`);
    else if (pceV != null && pceV > 2.8) infBits.push(`Core PCE at ${pceV.toFixed(1)}%`);
    const labBits: string[] = [];
    if (nfpV != null && nfpV < 50) labBits.push(`NFP at ${nfpV >= 0 ? "+" : ""}${nfpV.toFixed(0)}K`);
    if (unempV != null && unempPrev != null && unempV - unempPrev >= 0.1) labBits.push(`unemployment rising to ${unempV.toFixed(1)}%`);
    sentences.push(`Stagflation risk elevated: ${infBits.join(" and ")} while ${labBits.join(" and ")}.`);
  } else if (riskOff) {
    const drawdown = spHigh ? (spV! / spHigh - 1) * 100 : 0;
    let s = "Risk-off regime dominant: S&P 500 below 200-day SMA";
    if (drawdown < -3) s += ` (${drawdown.toFixed(1)}% from 52-week high)`;
    s += ` with VIX at ${vixV!.toFixed(0)}.`;
    sentences.push(s);
  } else if (bear > bull + 4) {
    sentences.push(`Broad macro deterioration \u2014 ${bear} bearish vs ${bull} bullish indicators.`);
  } else if (bull > bear + 4) {
    sentences.push(`Constructive macro backdrop with ${bull} bullish signals leading.`);
  } else {
    sentences.push(`Mixed macro regime \u2014 ${bear} bearish, ${bull} bullish signals competing.`);
  }

  // Sentence 2
  let s2 = `Fed on hold at ${ffStr}`;
  if (ff?.value != null && ff?.previous != null) {
    if (ff.value < ff.previous - 0.01) s2 = `Fed cutting \u2014 funds rate at ${ffStr}`;
    else if (ff.value > ff.previous + 0.01) s2 = `Fed hiking \u2014 funds rate at ${ffStr}`;
  }
  if (spreadV != null) {
    if (spreadV < 0) s2 += `; yield curve inverted (${spreadV >= 0 ? "+" : ""}${spreadV.toFixed(2)}%) signaling recession risk`;
    else if (spreadV > 0.3) s2 += `; curve steepening at ${spreadV.toFixed(2)}%`;
  }
  s2 += ".";
  sentences.push(s2);

  // Sentence 3
  const stress: string[] = [];
  if (vixV != null && vixV > 25) stress.push(`elevated volatility (VIX ${vixV.toFixed(0)})`);
  if (hyV != null && hyV > 400) stress.push(`HY spreads at ${hyV.toFixed(0)}bps`);
  if (consumerV != null && consumerV < 70) stress.push(`consumer sentiment depressed (${consumerV.toFixed(0)})`);
  if (dxyV != null && dxyV < 98) stress.push(`weak dollar (DXY ${dxyV.toFixed(1)})`);
  else if (dxyV != null && dxyV > 106) stress.push(`strong dollar (DXY ${dxyV.toFixed(1)}) pressuring EM`);
  if (stress.length > 0) {
    const tag = bear > bull ? "risk-off positioning dominant" : "markets navigating crosscurrents";
    sentences.push(stress.slice(0, 3).join(" | ") + ` \u2014 ${tag}.`);
  }

  return sentences.join(" ");
}

function buildMacroMapData(indicators: Indicators): { nodes: MacroMapNode[]; edges: MacroMapEdge[] } {
  const sigColors: Record<string, string> = { BULLISH: "#00e676", BEARISH: "#ff4d4d", NEUTRAL: "#ffd24d" };
  const shortLabels: Record<string, string> = {
    FED_FUNDS: "Fed Funds", US_2Y: "2Y", US_10Y: "10Y", US_30Y: "30Y", SPREAD_2S10S: "2s10s",
    CPI_YOY: "CPI", CORE_CPI_YOY: "Core CPI", CORE_PCE_YOY: "Core PCE",
    UNEMPLOYMENT: "Unemp", INITIAL_CLAIMS: "Claims", NFP: "NFP",
    ISM_MFG: "ISM", CONSUMER_CONF: "Cons.Conf",
    IG_SPREAD: "IG", HY_SPREAD: "HY",
    VIX: "VIX", SP500: "S&P", DOW: "Dow", NASDAQ: "Nasdaq",
    FTSE100: "FTSE", NIKKEI: "Nikkei",
    OIL_WTI: "WTI", OIL_BRT: "Brent", GOLD: "Gold",
    COPPER: "Copper", DXY: "DXY", PUT_CALL: "P/C",
  };
  const positions: Record<string, [number, number]> = {
    FED_FUNDS: [150, 120], US_2Y: [300, 80], US_10Y: [450, 100],
    US_30Y: [450, 200], SPREAD_2S10S: [600, 80],
    CPI_YOY: [600, 320], CORE_CPI_YOY: [750, 280], CORE_PCE_YOY: [750, 380],
    UNEMPLOYMENT: [120, 400], INITIAL_CLAIMS: [120, 300],
    NFP: [260, 350], ISM_MFG: [260, 460],
    CONSUMER_CONF: [260, 250], IG_SPREAD: [900, 160], HY_SPREAD: [900, 260],
    VIX: [750, 120], SP500: [550, 240], DOW: [550, 380],
    NASDAQ: [550, 480], FTSE100: [1000, 420], NIKKEI: [1000, 320],
    OIL_WTI: [420, 420], OIL_BRT: [420, 520],
    GOLD: [900, 460], COPPER: [750, 480],
    DXY: [900, 360], PUT_CALL: [750, 180],
  };

  const nodes: MacroMapNode[] = [];
  for (const [key, ind] of Object.entries(indicators)) {
    const sig = ind.signal || "NEUTRAL";
    const ext = computeExtremity(ind);
    const radius = 15 + ext * 15;
    const pos = positions[key] || [550, 300];
    nodes.push({
      id: key, label: ind.label || key,
      short: shortLabels[key] || key.slice(0, 6),
      signal: sig, color: sigColors[sig] || "#ffd24d",
      radius: Math.round(radius * 10) / 10,
      ix: pos[0], iy: pos[1],
    });
  }
  const edgeDefs: { source: string; target: string; label: string }[] = [
    { source: "FED_FUNDS", target: "US_2Y", label: "rate transmission" },
    { source: "US_2Y", target: "US_10Y", label: "rate expectations" },
    { source: "US_10Y", target: "SPREAD_2S10S", label: "curve shape" },
    { source: "OIL_WTI", target: "CPI_YOY", label: "energy \u2192 inflation" },
    { source: "CPI_YOY", target: "CORE_PCE_YOY", label: "headline \u2192 core" },
    { source: "CORE_PCE_YOY", target: "FED_FUNDS", label: "inflation \u2192 policy" },
    { source: "OIL_WTI", target: "SP500", label: "margin pressure" },
    { source: "VIX", target: "SP500", label: "fear \u2192 equities" },
    { source: "SP500", target: "VIX", label: "sell-off \u2192 vol spike" },
    { source: "UNEMPLOYMENT", target: "CONSUMER_CONF", label: "jobs \u2192 sentiment" },
    { source: "HY_SPREAD", target: "VIX", label: "credit stress \u2192 vol" },
    { source: "DXY", target: "COPPER", label: "dollar \u2192 commodities" },
    { source: "DXY", target: "GOLD", label: "dollar \u2192 gold" },
    { source: "GOLD", target: "US_10Y", label: "real yields link" },
    { source: "OIL_BRT", target: "OIL_WTI", label: "global \u2192 US crude" },
    { source: "NFP", target: "UNEMPLOYMENT", label: "payrolls \u2192 jobs" },
    { source: "ISM_MFG", target: "SP500", label: "PMI \u2192 equities" },
    { source: "US_10Y", target: "SP500", label: "yields \u2192 valuations" },
    { source: "IG_SPREAD", target: "HY_SPREAD", label: "credit contagion" },
  ];
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = edgeDefs.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Types for computed data passed to client
// ---------------------------------------------------------------------------

interface MacroMapNode {
  id: string; label: string; short: string; signal: string;
  color: string; radius: number; ix: number; iy: number;
}

interface MacroMapEdge {
  source: string; target: string; label: string;
}

export interface ComputedDashboardData {
  indicators: Indicators;
  timestamp: string;
  daily_brief: string;
  weekly_wrap: string;
  forward_look: DashboardData["forward_look"];
  // Computed
  narrative: string;
  counts: { BULLISH: number; BEARISH: number; NEUTRAL: number };
  regimeLabel: string;
  regimeColor: string;
  vixStr: string;
  oilStr: string;
  spStr: string;
  vixVal: number | null;
  // History / meta for JS
  historyData: Record<string, [string, number][]>;
  indMeta: Record<string, { label: string; direction: string; value: string; signal: string }>;
  correlations: Record<string, string[]>;
  heatData: Record<string, number>;
  macroMapNodes: MacroMapNode[];
  macroMapEdges: MacroMapEdge[];
  regimeTimeline: { month: string; regime: string; color: string }[];
  // Pre-built HTML chunks
  changesHtml: string;
  heatmapCellsHtml: string;
  sectionsHtml: string;
  scenariosHtml: string;
  upcomingHtml: string;
  timelineHtml: string;
  regimeDescription: string;
  glossary: Record<string, string>;
  termGlossary: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Build all pre-rendered HTML sections server-side
// ---------------------------------------------------------------------------

function buildAllData(data: DashboardData): ComputedDashboardData {
  const { indicators, timestamp, daily_brief, weekly_wrap, forward_look } = data;

  // Signal counts
  const counts = { BULLISH: 0, BEARISH: 0, NEUTRAL: 0 };
  for (const ind of Object.values(indicators)) {
    const s = (ind.signal || "NEUTRAL") as keyof typeof counts;
    counts[s] = (counts[s] || 0) + 1;
  }

  // Regime label
  let regimeLabel: string;
  let regimeColor: string;
  if (counts.BEARISH > counts.BULLISH + 3) {
    regimeLabel = "RISK-OFF"; regimeColor = "#ff4d4d";
  } else if (counts.BULLISH > counts.BEARISH + 3) {
    regimeLabel = "RISK-ON"; regimeColor = "#4dff91";
  } else {
    regimeLabel = "MIXED / CAUTIOUS"; regimeColor = "#ffd24d";
  }

  // Topbar stats
  const vixVal = indicators.VIX?.value ?? null;
  const oilVal = indicators.OIL_WTI?.value ?? null;
  const spVal = indicators.SP500?.value ?? null;
  const vixStr = vixVal != null ? vixVal.toFixed(2) : "N/A";
  const oilStr = oilVal != null ? `$${oilVal.toFixed(2)}` : "N/A";
  const spStr = spVal != null ? spVal.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "N/A";

  // Narrative
  const narrative = generateNarrative(indicators);

  // History data
  const historyData: Record<string, [string, number][]> = {};
  for (const [key, ind] of Object.entries(indicators)) {
    if (ind.history && ind.history.length > 0) historyData[key] = ind.history;
  }

  // Indicator metadata for JS
  const indMeta: Record<string, { label: string; direction: string; value: string; signal: string }> = {};
  for (const [key, ind] of Object.entries(indicators)) {
    indMeta[key] = {
      label: ind.label || key,
      direction: ind.direction || "\u25ac",
      value: valueDisplay(key, ind),
      signal: ind.signal || "NEUTRAL",
    };
  }

  // Heat data
  const heatData: Record<string, number> = {};
  for (const [key, ind] of Object.entries(indicators)) {
    const heat = computeHeatScore(ind);
    ind.heat_score = heat;
    heatData[key] = heat;
  }

  // Changes
  const changesList = detectChanges(indicators);
  let changesHtml = "";
  if (changesList.length > 0) {
    let changeItems = "";
    for (const ch of changesList) {
      changeItems += `<div class="change-item"><span class="change-name">${ch.label}</span><span class="change-vals">${ch.old} &rarr; ${ch.new_val}</span><span class="change-ctx">${ch.context}</span></div>`;
    }
    changesHtml = `<div class="changes-inline"><div class="changes-inline-header" data-action="toggleChanges"><span>\u26a1 Show changes (${changesList.length})</span><span class="changes-toggle" id="changes-toggle">\u25b6</span></div><div class="changes-body collapsed" id="changes-body">${changeItems}</div></div>`;
  }

  // Heatmap cells
  let heatmapCellsHtml = "";
  for (const [key, ind] of Object.entries(indicators)) {
    const hs = ind.heat_score ?? 0;
    const bg = HEAT_COLORS[hs] || "#3d4663";
    let labelShort = ind.label || key;
    if (labelShort.length > 16) labelShort = labelShort.slice(0, 14) + "\u2026";
    const hmVal = valueDisplay(key, ind);
    const hmSig = ind.signal || "NEUTRAL";
    heatmapCellsHtml += `<div class="hm-cell" data-key="${key}" style="background:${bg}" data-action="switchToCard" title="${ind.label || key}: ${hmVal} (${hmSig})"><span class="hm-label">${labelShort}</span><span class="hm-val">${hmVal}</span></div>`;
  }

  // Macro map
  const { nodes: macroMapNodes, edges: macroMapEdges } = buildMacroMapData(indicators);

  // Regime timeline
  const regimeTimeline = buildRegimeTimelineData(indicators);
  const { description: regimeDescription } = buildCurrentRegimeDescription(indicators);

  // Timeline HTML
  const monthNames: Record<string, string> = {
    "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr",
    "05": "May", "06": "Jun", "07": "Jul", "08": "Aug",
    "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec",
  };
  let tlSegments = "";
  let tlMonthLabels = "";
  for (const td of regimeTimeline) {
    const monthShort = td.month.slice(5);
    tlSegments += `<div class="tl-segment" style="background:${td.color}" title="${td.month}: ${td.regime}"><span class="tl-month">${monthShort}</span></div>`;
    const monthNum = td.month.slice(5, 7);
    tlMonthLabels += `<span>${monthNames[monthNum] || monthNum}</span>`;
  }
  const usedRegimes = [...new Set(regimeTimeline.map((td) => td.regime))];
  let tlLegend = "";
  for (const r of usedRegimes) {
    const c = REGIME_COLORS[r] || "#8892b0";
    tlLegend += `<span style="color:${c}">\u25a0 ${r}</span>`;
  }
  const timelineHtml = `<section class="timeline-section"><h2 class="section-title">\ud83d\udcc5 Macro Regime Timeline (24 months)</h2><div class="tl-bar">${tlSegments}<div class="tl-marker" title="You are here"><div class="tl-dot"></div><span class="tl-marker-label">NOW</span></div></div><div class="tl-month-labels">${tlMonthLabels}</div><div class="tl-legend">${tlLegend}</div><p class="tl-description">${regimeDescription}</p></section>`;

  // Scenarios
  const scenarios = buildScenarios(indicators);
  let scenariosHtml = "";
  if (scenarios.length > 0) {
    let scenariosParts = "";
    for (const sc of scenarios) {
      let impactsItems = "";
      for (const [sname, sarrow, scolor] of sc.impacts) {
        impactsItems += `<span class="sc-impact" style="color:${scolor}">${sarrow} ${sname}</span>`;
      }
      scenariosParts += `<div class="scenario-box" style="border-color:${sc.border}"><div class="sc-header"><span class="sc-title">${sc.title}</span><span class="sc-prob" style="color:${sc.prob_color}">${sc.probability}</span></div><p class="sc-content">${sc.content}</p><div class="sc-impacts">${impactsItems}</div></div>`;
    }
    scenariosHtml = `<section class="section scenarios-section"><h2 class="section-title">\ud83d\udcca Scenarios</h2><div class="scenarios-grid">${scenariosParts}</div></section>`;
  }

  // Section cards
  const bySection: Record<string, [string, Indicator][]> = {};
  for (const [key, ind] of Object.entries(indicators)) {
    const cat = ind.category || "Other";
    if (!bySection[cat]) bySection[cat] = [];
    bySection[cat].push([key, ind]);
  }

  let sectionsHtml = "";
  for (const section of SECTION_ORDER) {
    const items = bySection[section] || [];
    if (items.length === 0) continue;
    const icon = SECTION_ICONS[section] || "";
    let cards = "";
    for (const [key, ind] of items) {
      const sig = ind.signal || "NEUTRAL";
      const sigClass = sig.toLowerCase();
      const arrow = ind.direction || "\u25ac";
      const arrowClass = arrow === "\u25b2" ? "up" : arrow === "\u25bc" ? "down" : "flat";
      const val = valueDisplay(key, ind);
      const prev = prevDisplay(key, ind);
      const pdate = prevDateDisplay(ind);
      const commentary = ind.commentary || "";
      const manual = ind.manual_input ? "\ud83d\udd8a Manual Input" : "";
      const hasHistory = ind.history && ind.history.length > 0 ? "true" : "false";
      const rbar = rangeBarHtml(key, ind);
      const spark = sparklineSvg(key, ind);
      const momentum = ind.momentum;
      let mtag = "";
      if (momentum && arrowClass !== "flat") {
        const mcls = momentum === "ACCEL" ? "accel" : "decel";
        mtag = `<span class="momentum-tag ${mcls}">${momentum}</span>`;
      }
      const tooltip = INDICATOR_GLOSSARY[key] || "";
      const tooltipAttr = tooltip ? ` data-tooltip="${tooltip}"` : "";
      const heat = ind.heat_score ?? 0;
      cards += `<div class="card" data-key="${key}" data-signal="${sigClass}" data-has-history="${hasHistory}" data-heat="${heat}"><div class="card-header"><span class="card-name"${tooltipAttr}>${ind.label || key}</span><span class="signal-badge ${sigClass}">${sig}</span></div><div class="card-body"><span class="value" data-original="${val}">${val}</span><span class="arrow ${arrowClass}">${arrow}</span>${mtag}</div>${spark}<div class="card-prev">prev: <span class="prev-val">${prev}</span>${pdate ? ` <span class="prev-date">${pdate}</span>` : ""}${manual ? `<span class="manual-tag">${manual}</span>` : ""}</div>${rbar}<div class="commentary">${commentary}</div><div class="chart-panel"><div class="chart-periods"><button class="period-btn" data-period="1W">1W</button><button class="period-btn" data-period="1M">1M</button><button class="period-btn active" data-period="3M">3M</button><button class="period-btn" data-period="6M">6M</button><button class="period-btn" data-period="1Y">1Y</button></div><div class="chart-wrap"><canvas class="chart-canvas"></canvas></div><div class="related-section"></div></div></div>`;
    }
    sectionsHtml += `<section class="section"><h2 class="section-title">${icon} ${section}</h2><div class="cards-grid">${cards}</div></section>`;
    // Insert scenarios after Market Indices
    if (section === "Market Indices") {
      sectionsHtml += scenariosHtml;
    }
  }

  // Upcoming releases
  const upcomingReleases = getUpcomingReleases();
  const catColors: Record<string, string> = {
    Inflation: "#ff4d4d", Labour: "#4d9fff", Activity: "#ffd24d",
    Rates: "#a855f7", Sentiment: "#00e676", Growth: "#ff6b35",
  };
  let upcomingItems = "";
  for (const { name, dateStr, days, category } of upcomingReleases) {
    let badge: string;
    if (days === 0) badge = '<span class="countdown-badge today">TODAY</span>';
    else if (days === 1) badge = '<span class="countdown-badge tomorrow">1d</span>';
    else if (days <= 7) badge = `<span class="countdown-badge soon">${days}d</span>`;
    else badge = `<span class="countdown-badge">${days}d</span>`;
    const catColor = catColors[category] || "var(--muted)";
    const catBadge = `<span class="cat-badge" style="color:${catColor};border-color:${catColor}44;background:${catColor}18">${category}</span>`;
    upcomingItems += `<div class="upcoming-item"><div class="rel-top">${badge}<span class="rel-date">${dateStr}</span></div><span class="rel-name">${name}</span><div class="rel-bottom">${catBadge}</div></div>`;
  }
  const upcomingHtml = `<section class="section upcoming"><h2 class="section-title">\ud83d\udcc5 Upcoming Releases</h2><div class="upcoming-grid">${upcomingItems}</div></section>`;

  // Term glossary
  const termGlossary: Record<string, string> = {
    "200-day SMA": "Average price over 200 trading days \u2014 key long-term trend indicator",
    "50-day SMA": "Average price over 50 trading days \u2014 short-term trend indicator",
    "SMA": "Simple Moving Average \u2014 average closing price over N days",
    "YoY": "Year-over-Year \u2014 comparing to the same period last year",
    "MoM": "Month-over-Month \u2014 change from the previous month",
    "bps": "Basis points \u2014 1/100th of a percentage point (100bps = 1%)",
    "yield curve": "Graph of yields across maturities \u2014 shape signals economic expectations",
    "inverted": "Short-term yields above long-term \u2014 recession warning signal",
    "steepening": "Gap between long and short-term yields widening \u2014 typically bullish",
    "risk-off": "Investors fleeing to safe assets like bonds and gold",
    "risk-on": "Investors favoring stocks and higher-yielding assets",
    "flight-to-safety": "Rapid shift into safe-haven assets during market stress",
    "hawkish": "Favoring tighter monetary policy (higher rates) to fight inflation",
    "dovish": "Favoring looser monetary policy (lower rates) to support growth",
    "restrictive": "Rates above neutral \u2014 actively slowing economic growth",
    "accommodative": "Rates below neutral \u2014 actively supporting economic growth",
    "disinflation": "Inflation rate declining but still positive",
    "stagflation": "Simultaneous high inflation and weak growth",
    "Sahm Rule": "Recession trigger: 3-month avg unemployment rises 0.5%+ from its low",
    "term premium": "Extra yield for holding longer-term bonds vs rolling short-term",
    "contraction": "Economic shrinkage \u2014 declining output and employment",
    "expansion": "Economic growth \u2014 rising output and employment",
    "capitulation": "Panic selling \u2014 often marks market bottoms",
    "complacency": "Excessive calm that can precede sudden corrections",
    "goldilocks": "Moderate growth without excessive inflation",
    "contrarian": "Trading against prevailing sentiment",
    "FOMC": "Federal Open Market Committee \u2014 sets US interest rate policy",
    "OPEC": "Organization of Petroleum Exporting Countries \u2014 oil supply cartel",
    "GFC": "Global Financial Crisis of 2008",
  };

  return {
    indicators,
    timestamp,
    daily_brief,
    weekly_wrap,
    forward_look,
    narrative,
    counts,
    regimeLabel,
    regimeColor,
    vixStr,
    oilStr,
    spStr,
    vixVal,
    historyData,
    indMeta,
    correlations: CORRELATIONS,
    heatData,
    macroMapNodes,
    macroMapEdges,
    regimeTimeline,
    changesHtml,
    heatmapCellsHtml,
    sectionsHtml,
    scenariosHtml,
    upcomingHtml,
    timelineHtml,
    regimeDescription,
    glossary: INDICATOR_GLOSSARY,
    termGlossary,
  };
}

// ---------------------------------------------------------------------------
// Page component (server)
// ---------------------------------------------------------------------------

export default async function DashboardPage() {
  const data = getCachedData();

  if (!data) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          background: "#0b0f19",
          color: "#e8eaf2",
          fontFamily: "'DM Sans', sans-serif",
          gap: "1rem",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>
          \u26a1 Macro Pulse
        </h1>
        <p style={{ color: "#8892b0", maxWidth: 420, textAlign: "center" }}>
          No cached data available. Hit the refresh endpoint to populate data:
        </p>
        <code
          style={{
            background: "#131929",
            border: "1px solid #252e4a",
            borderRadius: 8,
            padding: "12px 20px",
            color: "#4d9fff",
            fontSize: "0.85rem",
          }}
        >
          POST /api/refresh
        </code>
        <a
          href="/api/refresh"
          style={{
            marginTop: "1rem",
            background: "#4d9fff22",
            border: "1px solid #4d9fff",
            color: "#4d9fff",
            padding: "8px 20px",
            borderRadius: 8,
            textDecoration: "none",
            fontSize: "0.85rem",
          }}
        >
          Refresh Now
        </a>
      </div>
    );
  }

  const computed = buildAllData(data);

  return <DashboardClient data={computed} />;
}
