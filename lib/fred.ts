import { Indicator } from "./types";
import { FRED_SERIES } from "./config";

const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function directionArrow(
  current: number | null,
  previous: number | null,
  threshold: number,
): string {
  if (current === null || previous === null) return "▬";
  const diff = current - previous;
  if (diff > threshold) return "▲";
  if (diff < -threshold) return "▼";
  return "▬";
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return formatDate(d);
}

function last365(history: [string, number][]): [string, number][] {
  const cutoff = daysAgo(365);
  return history.filter(([d]) => d >= cutoff);
}

// ---------------------------------------------------------------------------
// FRED fetch helper
// ---------------------------------------------------------------------------

async function getFredSeries(
  seriesId: string,
  apiKey: string,
  startDate?: string,
): Promise<{ date: string; value: number }[]> {
  const params = new URLSearchParams({
    series_id: seriesId,
    api_key: apiKey,
    file_type: "json",
  });
  if (startDate) params.set("observation_start", startDate);

  const url = `${FRED_BASE}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`FRED ${seriesId}: HTTP ${res.status}`);
  }
  const json = (await res.json()) as {
    observations: { date: string; value: string }[];
  };

  return json.observations
    .filter((o) => o.value !== ".")
    .map((o) => ({ date: o.date, value: parseFloat(o.value) }));
}

// ---------------------------------------------------------------------------
// Builder helpers
// ---------------------------------------------------------------------------

function makeIndicator(partial: Partial<Indicator>): Indicator {
  return {
    label: "",
    value: null,
    previous: null,
    direction: "▬",
    unit: "",
    source: "FRED",
    category: "",
    value_date: null,
    previous_date: null,
    history: [],
    ...partial,
  };
}

function simpleRate(
  data: { date: string; value: number }[],
  label: string,
  category: string,
  unit: string,
  threshold: number,
): Indicator {
  if (data.length < 2) {
    return makeIndicator({ label, category, unit });
  }
  const current = data[data.length - 1];
  const prev = data[data.length - 2];
  const history = last365(data.map((d) => [d.date, d.value]));
  return makeIndicator({
    label,
    value: current.value,
    previous: prev.value,
    direction: directionArrow(current.value, prev.value, threshold),
    unit,
    category,
    value_date: current.date,
    previous_date: prev.date,
    history,
  });
}

// ---------------------------------------------------------------------------
// Main fetch
// ---------------------------------------------------------------------------

export async function fetchFredData(
  previousData: Record<string, any>,
): Promise<Record<string, Indicator>> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    console.error("FRED_API_KEY not set");
    return {};
  }

  const startDate2y = daysAgo(365 * 2);
  const startDate800 = daysAgo(800);

  const result: Record<string, Indicator> = {};

  // --- FED_FUNDS -----------------------------------------------------------
  try {
    const [upper, lower] = await Promise.all([
      getFredSeries(FRED_SERIES.FED_FUNDS_UPPER, apiKey, startDate2y),
      getFredSeries(FRED_SERIES.FED_FUNDS_LOWER, apiKey, startDate2y),
    ]);
    if (upper.length >= 2 && lower.length >= 1) {
      const cur = upper[upper.length - 1];
      const prev = upper[upper.length - 2];
      const lowerVal = lower[lower.length - 1].value;
      const upperVal = cur.value;
      result.FED_FUNDS = makeIndicator({
        label: "Fed Funds Rate",
        value: upperVal,
        previous: prev.value,
        value_str: `${lowerVal.toFixed(2)}-${upperVal.toFixed(2)}%`,
        direction: directionArrow(upperVal, prev.value, 0.01),
        unit: "%",
        category: "Rates & Monetary Policy",
        value_date: cur.date,
        previous_date: prev.date,
        history: last365(upper.map((d) => [d.date, d.value])),
      });
    } else {
      result.FED_FUNDS = makeIndicator({
        label: "Fed Funds Rate",
        category: "Rates & Monetary Policy",
        unit: "%",
      });
    }
  } catch (e) {
    console.error("FRED FED_FUNDS error:", e);
    result.FED_FUNDS = makeIndicator({
      label: "Fed Funds Rate",
      category: "Rates & Monetary Policy",
      unit: "%",
    });
  }

  // --- Treasury yields -----------------------------------------------------
  const treasurySpecs: [string, string, string][] = [
    ["US_2Y", FRED_SERIES.US_2Y, "US 2Y Treasury"],
    ["US_10Y", FRED_SERIES.US_10Y, "US 10Y Treasury"],
    ["US_30Y", FRED_SERIES.US_30Y, "US 30Y Treasury"],
  ];

  await Promise.all(
    treasurySpecs.map(async ([key, seriesId, label]) => {
      try {
        const data = await getFredSeries(seriesId, apiKey, startDate2y);
        result[key] = simpleRate(
          data,
          label,
          "Rates & Monetary Policy",
          "%",
          0.05,
        );
      } catch (e) {
        console.error(`FRED ${key} error:`, e);
        result[key] = makeIndicator({
          label,
          category: "Rates & Monetary Policy",
          unit: "%",
        });
      }
    }),
  );

  // --- 2s10s Spread --------------------------------------------------------
  try {
    const data = await getFredSeries(
      FRED_SERIES.SPREAD_2S10S,
      apiKey,
      startDate2y,
    );
    result.SPREAD_2S10S = simpleRate(
      data,
      "2s10s Spread",
      "Rates & Monetary Policy",
      "%",
      0.02,
    );
  } catch (e) {
    console.error("FRED SPREAD_2S10S error:", e);
    result.SPREAD_2S10S = makeIndicator({
      label: "2s10s Spread",
      category: "Rates & Monetary Policy",
      unit: "%",
    });
  }

  // --- YoY Inflation indicators --------------------------------------------
  const inflationSpecs: [string, string, string][] = [
    ["CPI_YOY", FRED_SERIES.CPI, "CPI YoY"],
    ["CORE_CPI_YOY", FRED_SERIES.CORE_CPI, "Core CPI YoY"],
    ["CORE_PCE_YOY", FRED_SERIES.CORE_PCE, "Core PCE YoY"],
  ];

  await Promise.all(
    inflationSpecs.map(async ([key, seriesId, label]) => {
      try {
        const data = await getFredSeries(seriesId, apiKey, startDate800);

        // Build full YoY series (pct_change over 12 periods)
        const yoySeries: { date: string; value: number }[] = [];
        for (let i = 12; i < data.length; i++) {
          const prev12 = data[i - 12].value;
          if (prev12 !== 0) {
            const yoy = ((data[i].value / prev12 - 1) * 100);
            yoySeries.push({ date: data[i].date, value: parseFloat(yoy.toFixed(2)) });
          }
        }

        if (yoySeries.length >= 2) {
          const current = yoySeries[yoySeries.length - 1];
          const prev = yoySeries[yoySeries.length - 2];
          result[key] = makeIndicator({
            label,
            value: current.value,
            previous: prev.value,
            direction: directionArrow(current.value, prev.value, 0.05),
            unit: "% YoY",
            category: "Prices & Inflation",
            value_date: current.date,
            previous_date: prev.date,
            history: last365(yoySeries.map((d) => [d.date, d.value])),
          });
        } else {
          result[key] = makeIndicator({
            label,
            category: "Prices & Inflation",
            unit: "% YoY",
          });
        }
      } catch (e) {
        console.error(`FRED ${key} error:`, e);
        result[key] = makeIndicator({
          label,
          category: "Prices & Inflation",
          unit: "% YoY",
        });
      }
    }),
  );

  // --- Unemployment --------------------------------------------------------
  try {
    const data = await getFredSeries(
      FRED_SERIES.UNEMPLOYMENT,
      apiKey,
      startDate2y,
    );
    result.UNEMPLOYMENT = simpleRate(
      data,
      "Unemployment Rate (U-3)",
      "Real Economy",
      "%",
      0.05,
    );
  } catch (e) {
    console.error("FRED UNEMPLOYMENT error:", e);
    result.UNEMPLOYMENT = makeIndicator({
      label: "Unemployment Rate (U-3)",
      category: "Real Economy",
      unit: "%",
    });
  }

  // --- Initial Claims ------------------------------------------------------
  try {
    const data = await getFredSeries(
      FRED_SERIES.INITIAL_CLAIMS,
      apiKey,
      startDate2y,
    );
    if (data.length >= 2) {
      const current = data[data.length - 1];
      const prev = data[data.length - 2];
      const valK = Math.round(current.value / 1000);
      result.INITIAL_CLAIMS = makeIndicator({
        label: "Initial Jobless Claims",
        value: current.value,
        previous: prev.value,
        value_str: `${valK}K`,
        direction: directionArrow(current.value, prev.value, 1000),
        unit: "K",
        category: "Real Economy",
        value_date: current.date,
        previous_date: prev.date,
        history: last365(data.map((d) => [d.date, d.value])),
      });
    } else {
      result.INITIAL_CLAIMS = makeIndicator({
        label: "Initial Jobless Claims",
        category: "Real Economy",
        unit: "K",
      });
    }
  } catch (e) {
    console.error("FRED INITIAL_CLAIMS error:", e);
    result.INITIAL_CLAIMS = makeIndicator({
      label: "Initial Jobless Claims",
      category: "Real Economy",
      unit: "K",
    });
  }

  // --- NFP (MoM change) ---------------------------------------------------
  try {
    const data = await getFredSeries(FRED_SERIES.NFP, apiKey, startDate2y);
    if (data.length >= 2) {
      const current = data[data.length - 1];
      const prev = data[data.length - 2];
      const momCurrent = current.value - prev.value;

      let momPrev: number | null = null;
      if (data.length >= 3) {
        momPrev = prev.value - data[data.length - 3].value;
      }

      const sign = momCurrent >= 0 ? "+" : "";
      const valStr = `${sign}${Math.round(momCurrent)}K`;

      // Build MoM history for last ~12 months
      const momHistory: [string, number][] = [];
      for (let i = 1; i < data.length; i++) {
        momHistory.push([data[i].date, data[i].value - data[i - 1].value]);
      }

      result.NFP = makeIndicator({
        label: "Nonfarm Payrolls (MoM)",
        value: momCurrent,
        previous: momPrev,
        value_str: valStr,
        direction: directionArrow(momCurrent, momPrev, 10),
        unit: "K",
        category: "Real Economy",
        value_date: current.date,
        previous_date: prev.date,
        history: last365(momHistory),
      });
    } else {
      result.NFP = makeIndicator({
        label: "Nonfarm Payrolls (MoM)",
        category: "Real Economy",
        unit: "K",
      });
    }
  } catch (e) {
    console.error("FRED NFP error:", e);
    result.NFP = makeIndicator({
      label: "Nonfarm Payrolls (MoM)",
      category: "Real Economy",
      unit: "K",
    });
  }

  // --- ISM Manufacturing (manual input) ------------------------------------
  if (previousData?.ISM_MFG) {
    result.ISM_MFG = { ...previousData.ISM_MFG, manual_input: true };
  } else {
    result.ISM_MFG = makeIndicator({
      label: "ISM Mfg PMI",
      category: "Real Economy",
      manual_input: true,
    });
  }

  // --- Consumer Confidence (Michigan) --------------------------------------
  try {
    const data = await getFredSeries(
      FRED_SERIES.CONSUMER_CONF,
      apiKey,
      startDate2y,
    );
    result.CONSUMER_CONF = simpleRate(
      data,
      "Consumer Confidence (Michigan)",
      "Real Economy",
      "",
      0.5,
    );
  } catch (e) {
    console.error("FRED CONSUMER_CONF error:", e);
    result.CONSUMER_CONF = makeIndicator({
      label: "Consumer Confidence (Michigan)",
      category: "Real Economy",
    });
  }

  // --- Credit Spreads (IG & HY) --------------------------------------------
  const spreadSpecs: [string, string, string][] = [
    ["IG_SPREAD", FRED_SERIES.IG_SPREAD, "IG Credit Spread"],
    ["HY_SPREAD", FRED_SERIES.HY_SPREAD, "HY Credit Spread"],
  ];

  await Promise.all(
    spreadSpecs.map(async ([key, seriesId, label]) => {
      try {
        const data = await getFredSeries(seriesId, apiKey, startDate2y);

        // FRED returns percentage points — multiply by 100 for basis points
        const bpsData = data.map((d) => ({
          date: d.date,
          value: d.value * 100,
        }));

        if (bpsData.length >= 2) {
          const current = bpsData[bpsData.length - 1];
          const prev = bpsData[bpsData.length - 2];
          result[key] = makeIndicator({
            label,
            value: parseFloat(current.value.toFixed(1)),
            previous: parseFloat(prev.value.toFixed(1)),
            direction: directionArrow(current.value, prev.value, 5),
            unit: "bps",
            category: "Market Sentiment",
            value_date: current.date,
            previous_date: prev.date,
            history: last365(
              bpsData.map((d) => [d.date, parseFloat(d.value.toFixed(1))]),
            ),
          });
        } else {
          result[key] = makeIndicator({
            label,
            category: "Market Sentiment",
            unit: "bps",
          });
        }
      } catch (e) {
        console.error(`FRED ${key} error:`, e);
        result[key] = makeIndicator({
          label,
          category: "Market Sentiment",
          unit: "bps",
        });
      }
    }),
  );

  return result;
}
