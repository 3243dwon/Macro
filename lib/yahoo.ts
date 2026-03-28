import yahooFinance from 'yahoo-finance2';
import { Indicator } from './types';

const TICKERS: Record<string, string> = {
  SP500: '^GSPC',
  DOW: '^DJI',
  NASDAQ: '^IXIC',
  FTSE100: '^FTSE',
  NIKKEI: '^N225',
  VIX: '^VIX',
  OIL_WTI: 'CL=F',
  OIL_BRT: 'BZ=F',
  GOLD: 'GC=F',
  COPPER: 'HG=F',
  DXY: 'DX-Y.NYB',
};

const LABELS: Record<string, string> = {
  SP500: 'S&P 500',
  DOW: 'Dow Jones',
  NASDAQ: 'Nasdaq Composite',
  FTSE100: 'FTSE 100',
  NIKKEI: 'Nikkei 225',
  VIX: 'VIX',
  OIL_WTI: 'WTI Crude Oil',
  OIL_BRT: 'Brent Crude',
  GOLD: 'Gold',
  COPPER: 'Copper',
  DXY: 'DXY (Dollar Index)',
};

const CATEGORIES: Record<string, string> = {
  SP500: 'Market Indices',
  DOW: 'Market Indices',
  NASDAQ: 'Market Indices',
  FTSE100: 'Market Indices',
  NIKKEI: 'Market Indices',
  VIX: 'Market Sentiment',
  OIL_WTI: 'Prices & Inflation',
  OIL_BRT: 'Prices & Inflation',
  GOLD: 'Prices & Inflation',
  COPPER: 'Prices & Inflation',
  DXY: 'Market Sentiment',
};

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function directionArrow(current: number, previous: number, threshold: number): string {
  const diff = current - previous;
  if (diff > threshold) return '▲';
  if (diff < -threshold) return '▼';
  return '▬';
}

function computeSMA(closes: number[], period: number): number | undefined {
  if (closes.length < period) return undefined;
  const slice = closes.slice(-period);
  return slice.reduce((sum, v) => sum + v, 0) / period;
}

export async function fetchYahooData(
  previousData: Record<string, any>
): Promise<Record<string, Indicator>> {
  const results: Record<string, Indicator> = {};

  const now = new Date();
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const period1 = formatDate(oneYearAgo);
  const period2 = formatDate(now);

  for (const [key, symbol] of Object.entries(TICKERS)) {
    try {
      let closes: number[] = [];
      let dates: Date[] = [];

      try {
        // Try chart API first
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chartResult: any = await yahooFinance.chart(symbol, {
          period1,
          period2,
        });
        if (chartResult?.quotes?.length) {
          for (const q of chartResult.quotes) {
            if (q.close != null && q.date) {
              closes.push(q.close);
              dates.push(new Date(q.date));
            }
          }
        }
      } catch {
        // Fallback to historical API
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const histResult: any[] = await yahooFinance.historical(symbol, {
          period1,
          period2,
        });
        if (histResult?.length) {
          for (const q of histResult) {
            if (q.close != null && q.date) {
              closes.push(q.close);
              dates.push(new Date(q.date));
            }
          }
        }
      }

      if (closes.length < 2) {
        throw new Error(`Insufficient data for ${key}`);
      }

      const current = closes[closes.length - 1];
      const previous = closes[closes.length - 2];
      const threshold = current * 0.001;

      const sma50 = computeSMA(closes, 50);
      const sma200 = computeSMA(closes, 200);

      const high52w = Math.max(...closes);
      const low52w = Math.min(...closes);

      // Build history as [date_str, value] pairs
      const history: [string, number][] = dates.map((d, i) => [
        formatDate(d),
        closes[i],
      ]);

      const indicator: Indicator = {
        label: LABELS[key],
        value: current,
        previous,
        direction: directionArrow(current, previous, threshold),
        unit: '',
        source: 'Yahoo Finance',
        category: CATEGORIES[key],
        value_date: formatDate(dates[dates.length - 1]),
        previous_date: formatDate(dates[dates.length - 2]),
        history,
        sma50,
        sma200,
        high52w,
        low52w,
      };

      // For GOLD, compute weekly percentage change
      if (key === 'GOLD' && closes.length >= 6) {
        const weekAgoClose = closes[closes.length - 6];
        indicator.weekly_pct = ((current / weekAgoClose) - 1) * 100;
      }

      results[key] = indicator;
    } catch (err) {
      console.error(`Failed to fetch ${key} (${symbol}):`, err);
      // Use previousData as fallback
      if (previousData[key]) {
        results[key] = previousData[key] as Indicator;
      }
    }
  }

  // Add PUT_CALL as a manual-input indicator
  results.PUT_CALL = {
    label: 'Put/Call Ratio',
    value: null,
    previous: null,
    direction: '▬',
    unit: '',
    source: 'Manual',
    category: 'Market Sentiment',
    value_date: null,
    previous_date: null,
    history: [],
    manual_input: true,
  };

  return results;
}
