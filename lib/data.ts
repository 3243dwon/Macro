import fs from "fs";
import path from "path";
import { fetchFredData } from "./fred";
import { fetchYahooData } from "./yahoo";
import {
  assignSignals,
  generateCommentary,
  computeMomentum,
  generateDailyBrief,
  generateWeeklyWrap,
  generateForwardLook,
} from "./signals";
import type { DashboardData, Indicator, Indicators, Rules } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const INDICATORS_FILE = path.join(DATA_DIR, "indicators.json");
const RULES_FILE = path.join(DATA_DIR, "rules.json");

function loadJson(filePath: string): Record<string, unknown> {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

function saveJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export async function refreshData(): Promise<DashboardData> {
  const previousData = loadJson(INDICATORS_FILE) as Record<string, unknown>;
  const rules = loadJson(RULES_FILE) as Rules;

  // Fetch data from both sources
  const [fredData, yahooData] = await Promise.all([
    fetchFredData(previousData),
    fetchYahooData(previousData),
  ]);

  // Merge
  const indicators: Indicators = { ...fredData, ...yahooData };

  // Fallback: if live fetch returned null but we have cached data, use it
  if (previousData) {
    for (const [key, ind] of Object.entries(indicators)) {
      if (ind.value === null) {
        const cached = previousData[key] as Indicator | undefined;
        if (cached && typeof cached === "object" && cached.value !== null && cached.value !== undefined) {
          ind.value = cached.value;
          ind.previous = cached.previous ?? ind.previous;
          ind.direction = cached.direction ?? "\u25ac";
          ind.history = cached.history ?? ind.history;
          ind.value_date = cached.value_date;
          ind.previous_date = cached.previous_date;
          if (cached.value_str) ind.value_str = cached.value_str;
        }
      }
    }
  }

  // If first run, set previous = current
  if (Object.keys(previousData).length === 0) {
    for (const ind of Object.values(indicators)) {
      if (ind.previous === null) {
        ind.previous = ind.value;
      }
    }
  }

  // Assign signals
  assignSignals(indicators, rules);

  // Generate commentary
  for (const [key, ind] of Object.entries(indicators)) {
    ind.commentary = generateCommentary(key, ind);
  }

  // Compute momentum
  for (const ind of Object.values(indicators)) {
    ind.momentum = computeMomentum(ind);
  }

  // Compute 52-week range from history for indicators missing it
  for (const ind of Object.values(indicators)) {
    const history = ind.history || [];
    if (history.length > 0) {
      const values = history.map((h) => h[1]);
      if (ind.high52w === undefined) ind.high52w = Math.max(...values);
      if (ind.low52w === undefined) ind.low52w = Math.min(...values);
    }
  }

  // Timestamp
  const now = new Date();
  const timestamp = now.toISOString().replace("T", " ").slice(0, 16) + " UTC";

  // Generate summary panels
  const daily_brief = generateDailyBrief(indicators);

  // Weekly wrap: only regenerate Fri/Sat/Sun
  const dayOfWeek = now.getUTCDay();
  let weekly_wrap: string;
  if (dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0) {
    weekly_wrap = generateWeeklyWrap(indicators, previousData as Record<string, Indicator>);
  } else if (typeof previousData._weekly_wrap === "string") {
    weekly_wrap = previousData._weekly_wrap;
  } else {
    weekly_wrap = "Weekly wrap generates on Friday. Check back then.";
  }

  const forward_look = generateForwardLook(indicators);

  // Save to disk for caching
  const toSave: Record<string, unknown> = {
    ...indicators,
    _daily_brief: daily_brief,
    _weekly_wrap: weekly_wrap,
    _forward_look: forward_look,
    _meta: { last_updated: timestamp },
  };
  saveJson(INDICATORS_FILE, toSave);

  return { indicators, timestamp, daily_brief, weekly_wrap, forward_look };
}

export function getCachedData(): DashboardData | null {
  const raw = loadJson(INDICATORS_FILE);
  if (!raw || !raw._meta) return null;

  const meta = raw._meta as { last_updated: string };
  const daily_brief = (raw._daily_brief as string) || "";
  const weekly_wrap = (raw._weekly_wrap as string) || "";
  const forward_look = (raw._forward_look as DashboardData["forward_look"]) || [];

  // Extract indicators (skip underscore keys)
  const indicators: Indicators = {};
  for (const [key, val] of Object.entries(raw)) {
    if (!key.startsWith("_") && typeof val === "object" && val !== null && "label" in (val as Record<string, unknown>)) {
      indicators[key] = val as Indicator;
    }
  }

  return {
    indicators,
    timestamp: meta.last_updated,
    daily_brief,
    weekly_wrap,
    forward_look,
  };
}
