import type { Indicator, ForwardScenario } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safe(v: number | null | undefined): number {
  return v ?? 0;
}

function fmt(v: number | null | undefined, decimals = 2): string {
  if (v == null) return 'N/A';
  return v.toFixed(decimals);
}

function commaInt(v: number | null | undefined): string {
  if (v == null) return 'N/A';
  return Math.round(v).toLocaleString('en-US');
}

function commaDec(v: number | null | undefined, decimals = 2): string {
  if (v == null) return 'N/A';
  return v.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function pct(v: number | null | undefined, decimals = 2): string {
  if (v == null) return 'N/A';
  return `${v.toFixed(decimals)}%`;
}

function bpsStr(v: number | null | undefined): string {
  if (v == null) return 'N/A';
  return `${Math.round(v)}bps`;
}

function direction(ind: Indicator): string {
  return ind.direction ?? 'unchanged';
}

function changeBps(ind: Indicator): number {
  if (ind.value == null || ind.previous == null) return 0;
  return (ind.value - ind.previous) * 100;
}

function changeAbs(ind: Indicator): number {
  if (ind.value == null || ind.previous == null) return 0;
  return ind.value - ind.previous;
}

function weeklyPct(ind: Indicator): number {
  return ind.weekly_pct ?? 0;
}

// ---------------------------------------------------------------------------
// 8. valueDisplay
// ---------------------------------------------------------------------------

const EQUITY_KEYS = ['SP500', 'DOW', 'NASDAQ', 'FTSE100', 'NIKKEI'];

export function valueDisplay(key: string, ind: Indicator): string {
  if (ind.value == null) return ind.value_str ?? 'N/A';

  if (EQUITY_KEYS.includes(key)) {
    return commaInt(ind.value);
  }
  if (key === 'GOLD' || key === 'OIL_WTI' || key === 'OIL_BRT') {
    return `$${commaDec(ind.value)}`;
  }
  if (key === 'COPPER') {
    return `$${fmt(ind.value, 3)}`;
  }
  if (key === 'DXY') {
    return fmt(ind.value, 2);
  }
  if (
    key === 'IG_SPREAD' ||
    key === 'HY_SPREAD'
  ) {
    return bpsStr(ind.value);
  }
  if (
    [
      'CPI_YOY',
      'CORE_CPI_YOY',
      'CORE_PCE_YOY',
      'UNEMPLOYMENT',
      'FED_FUNDS',
      'US_10Y',
      'US_2Y',
      'US_30Y',
      'SPREAD_2S10S',
    ].includes(key)
  ) {
    return pct(ind.value);
  }
  if (ind.value_str) return ind.value_str;
  return fmt(ind.value, 2);
}

// ---------------------------------------------------------------------------
// 9. prevDisplay
// ---------------------------------------------------------------------------

export function prevDisplay(key: string, ind: Indicator): string {
  if (ind.previous == null) return 'N/A';

  if (EQUITY_KEYS.includes(key)) {
    return commaInt(ind.previous);
  }
  if (key === 'GOLD' || key === 'OIL_WTI' || key === 'OIL_BRT') {
    return `$${commaDec(ind.previous)}`;
  }
  if (key === 'COPPER') {
    return `$${fmt(ind.previous, 3)}`;
  }
  if (key === 'DXY') {
    return fmt(ind.previous, 2);
  }
  if (key === 'IG_SPREAD' || key === 'HY_SPREAD') {
    return bpsStr(ind.previous);
  }
  if (
    [
      'CPI_YOY',
      'CORE_CPI_YOY',
      'CORE_PCE_YOY',
      'UNEMPLOYMENT',
      'FED_FUNDS',
      'US_10Y',
      'US_2Y',
      'US_30Y',
      'SPREAD_2S10S',
    ].includes(key)
  ) {
    return pct(ind.previous);
  }
  return fmt(ind.previous, 2);
}

// ---------------------------------------------------------------------------
// 1. assignSignals
// ---------------------------------------------------------------------------

export function assignSignals(
  indicators: Record<string, Indicator>,
  rules: Record<string, any>,
): void {
  for (const [key, ind] of Object.entries(indicators)) {
    const v = safe(ind.value);
    const prev = safe(ind.previous);
    const rule = rules[key] ?? {};

    switch (key) {
      // --- VIX ---
      case 'VIX': {
        const bearishAbove = rule.bearish_above ?? 20;
        const bullishBelow = rule.bullish_below ?? 15;
        if (v > bearishAbove) {
          ind.signal = 'BEARISH';
        } else if (v < bullishBelow) {
          ind.signal = 'BULLISH';
        } else {
          ind.signal = 'NEUTRAL';
        }
        break;
      }

      // --- Treasury yields ---
      case 'US_10Y':
      case 'US_2Y':
      case 'US_30Y': {
        const bps = changeBps(ind);
        const threshold = rule.threshold ?? 3;
        if (key === 'US_10Y' && v > 4.5) {
          ind.signal = 'BEARISH';
        } else if (key === 'US_30Y' && v > 4.8) {
          ind.signal = 'BEARISH';
        } else if (bps > threshold) {
          ind.signal = 'BEARISH';
        } else if (bps < -threshold) {
          ind.signal = 'BULLISH';
        } else {
          ind.signal = 'NEUTRAL';
        }
        break;
      }

      // --- Inflation ---
      case 'CPI_YOY':
      case 'CORE_CPI_YOY':
      case 'CORE_PCE_YOY': {
        const bearishAbove = rule.bearish_above ?? (key === 'CORE_PCE_YOY' ? 2.8 : 3.5);
        const bullishBelow = rule.bullish_below ?? (key === 'CORE_PCE_YOY' ? 2.2 : 2.5);
        if (v > bearishAbove) {
          ind.signal = 'BEARISH';
        } else if (v < bullishBelow) {
          ind.signal = 'BULLISH';
        } else {
          ind.signal = 'NEUTRAL';
        }
        break;
      }

      // --- Unemployment ---
      case 'UNEMPLOYMENT': {
        const change = v - prev;
        if (change >= 0.1 || v > 4.5) {
          ind.signal = 'BEARISH';
        } else if (v < 4.0) {
          ind.signal = 'BULLISH';
        } else {
          ind.signal = 'NEUTRAL';
        }
        break;
      }

      // --- Non-Farm Payrolls ---
      case 'NFP': {
        if (v < 0) {
          ind.signal = 'BEARISH';
        } else if (v > 150) {
          ind.signal = 'BULLISH';
        } else {
          ind.signal = 'NEUTRAL';
        }
        break;
      }

      // --- ISM Manufacturing ---
      case 'ISM_MFG': {
        if (v < 50) {
          ind.signal = 'BEARISH';
        } else if (v > 55) {
          ind.signal = 'BULLISH';
        } else {
          ind.signal = 'NEUTRAL';
        }
        break;
      }

      // --- Credit spreads ---
      case 'IG_SPREAD': {
        if (v > 200) {
          ind.signal = 'BEARISH';
        } else if (v < 100) {
          ind.signal = 'BULLISH';
        } else {
          ind.signal = 'NEUTRAL';
        }
        break;
      }
      case 'HY_SPREAD': {
        if (v > 500) {
          ind.signal = 'BEARISH';
        } else if (v < 300) {
          ind.signal = 'BULLISH';
        } else {
          ind.signal = 'NEUTRAL';
        }
        break;
      }

      // --- Consumer confidence ---
      case 'CONSUMER_CONF': {
        const drop = prev - v;
        if (v < 80 || drop > 5) {
          ind.signal = 'BEARISH';
        } else if (v > 100) {
          ind.signal = 'BULLISH';
        } else {
          ind.signal = 'NEUTRAL';
        }
        break;
      }

      // --- Oil ---
      case 'OIL_WTI': {
        if (v > 90) {
          ind.signal = 'BEARISH';
        } else if (v >= 50 && v <= 75) {
          ind.signal = 'BULLISH';
        } else {
          ind.signal = 'NEUTRAL';
        }
        break;
      }
      case 'OIL_BRT': {
        if (v > 95) {
          ind.signal = 'BEARISH';
        } else if (v >= 55 && v <= 80) {
          ind.signal = 'BULLISH';
        } else {
          ind.signal = 'NEUTRAL';
        }
        break;
      }

      // --- Copper ---
      case 'COPPER': {
        if (v > 4) {
          ind.signal = 'BULLISH';
        } else if (v < 3) {
          ind.signal = 'BEARISH';
        } else {
          ind.signal = 'NEUTRAL';
        }
        break;
      }

      // --- Dollar ---
      case 'DXY': {
        if (v > 105) {
          ind.signal = 'BEARISH';
        } else if (v < 100) {
          ind.signal = 'BULLISH';
        } else {
          ind.signal = 'NEUTRAL';
        }
        break;
      }

      // --- Initial Claims ---
      case 'INITIAL_CLAIMS': {
        if (v > 300000) {
          ind.signal = 'BEARISH';
        } else if (v < 220000) {
          ind.signal = 'BULLISH';
        } else {
          ind.signal = 'NEUTRAL';
        }
        break;
      }

      // --- Equity indices ---
      case 'SP500':
      case 'DOW':
      case 'NASDAQ':
      case 'FTSE100':
      case 'NIKKEI': {
        const sma50 = ind.sma50 ?? null;
        const sma200 = ind.sma200 ?? null;
        if (sma200 != null && v < sma200) {
          ind.signal = 'BEARISH';
        } else if (sma50 != null && v > sma50) {
          ind.signal = 'BULLISH';
        } else {
          ind.signal = 'NEUTRAL';
        }
        break;
      }

      // --- Gold ---
      case 'GOLD': {
        const wp = weeklyPct(ind);
        if (wp < -3) {
          ind.signal = 'BEARISH';
        } else if (wp > 1.5) {
          ind.signal = 'BULLISH';
        } else {
          ind.signal = 'NEUTRAL';
        }
        break;
      }

      // --- 2s10s Spread ---
      case 'SPREAD_2S10S': {
        if (v < 0) {
          ind.signal = 'BEARISH';
        } else if (v > 0.5) {
          ind.signal = 'BULLISH';
        } else {
          ind.signal = 'NEUTRAL';
        }
        break;
      }

      // --- Fed Funds ---
      case 'FED_FUNDS': {
        if (ind.previous != null && v < prev - 0.01) {
          ind.signal = 'BULLISH';
        } else if (ind.previous != null && v > prev + 0.01) {
          ind.signal = 'BEARISH';
        } else {
          ind.signal = 'NEUTRAL';
        }
        break;
      }

      // --- Put/Call ratio (contrarian) ---
      case 'PUT_CALL': {
        if (v > 1.2) {
          ind.signal = 'BULLISH'; // contrarian bullish on extreme fear
        } else if (v > 1.0) {
          ind.signal = 'BEARISH';
        } else if (v < 0.7) {
          ind.signal = 'BULLISH';
        } else {
          ind.signal = 'NEUTRAL';
        }
        break;
      }

      default:
        ind.signal = 'NEUTRAL';
    }
  }
}

// ---------------------------------------------------------------------------
// 2. generateCommentary
// ---------------------------------------------------------------------------

export function generateCommentary(key: string, ind: Indicator): string {
  const v = ind.value;
  const prev = ind.previous;
  const dir = direction(ind);

  if (v == null) return `${ind.label}: data unavailable.`;

  switch (key) {
    // --- VIX ---
    case 'VIX': {
      let context: string;
      if (v > 40) {
        context =
          'This is capitulation territory -- markets are pricing in extreme tail risk. Historically, readings this extreme have preceded short-term bottoms, but the path can be violent.';
      } else if (v > 30) {
        context =
          'Deep fear is embedded in options markets. Hedging costs are elevated and dealers are likely short gamma, amplifying moves in both directions.';
      } else if (v > 20) {
        context =
          'Elevated but not extreme. The market is pricing in meaningful uncertainty -- likely driven by upcoming catalysts or unresolved macro risks.';
      } else if (v < 15) {
        context =
          'Complacency reigns. Low VIX can persist, but options are cheap here. A volatility expansion from these levels can be swift and punishing.';
      } else {
        context =
          'Vol is in a normal range. Not much signal here beyond a market that sees no immediate catalyst for a sharp move.';
      }
      return `VIX at ${fmt(v)} ${dir}. ${context}`;
    }

    // --- Fed Funds ---
    case 'FED_FUNDS': {
      let action: string;
      if (prev != null && v < prev - 0.01) {
        action = 'The Fed has CUT rates -- a dovish pivot signaling concern about growth or financial conditions.';
      } else if (prev != null && v > prev + 0.01) {
        action = 'The Fed HIKED -- tightening continues. Policy is leaning into inflation at the expense of growth.';
      } else {
        action = 'The Fed is HOLDING steady. No change signals patience, waiting for more data before the next move.';
      }
      return `Fed Funds at ${ind.value_str ?? pct(v)} -- ${action}`;
    }

    // --- US 10Y ---
    case 'US_10Y': {
      const bps = changeBps(ind);
      const bpsDir = bps >= 0 ? 'up' : 'down';
      let levelCommentary: string;
      if (v > 5.0) {
        levelCommentary =
          'Yields above 5% are restrictive territory not seen since pre-GFC. This reprices every risk asset and pressures housing, corporates, and government financing costs.';
      } else if (v > 4.5) {
        levelCommentary =
          'The 10Y above 4.5% tightens financial conditions materially. Mortgage rates follow, equity multiples compress, and duration-sensitive sectors feel the pain.';
      } else if (v > 4.0) {
        levelCommentary =
          'Yields in the 4-4.5% range reflect a market adjusting to higher-for-longer. Not yet crisis territory, but enough to weigh on rate-sensitive sectors.';
      } else if (v > 3.5) {
        levelCommentary =
          'The 10Y in the mid-3s to 4% range is relatively neutral -- consistent with moderate growth expectations and gradual disinflation.';
      } else {
        levelCommentary =
          'Sub-3.5% yields suggest the market is pricing in significant growth slowdown or imminent easing. Risk assets typically benefit, but the signal can also be ominous.';
      }
      return `10Y Treasury at ${pct(v)}, ${bpsDir} ${Math.abs(Math.round(bps))}bps. ${levelCommentary}`;
    }

    // --- US 2Y ---
    case 'US_2Y': {
      const bps = changeBps(ind);
      const bpsDir = bps >= 0 ? 'up' : 'down';
      let commentary: string;
      if (v > 5.0) {
        commentary =
          'The 2Y above 5% signals aggressive near-term rate expectations. The market sees the Fed staying higher for longer -- or going higher still.';
      } else if (v > 4.5) {
        commentary =
          'Elevated short-end yields reflect hawkish Fed expectations. This is tightening financial conditions in real-time.';
      } else if (v > 4.0) {
        commentary =
          'The 2Y in the 4-4.5% zone shows the market expecting a patient Fed. Cuts are priced out of the near-term horizon.';
      } else {
        commentary =
          'Below 4%, the 2Y is pricing in rate cuts. The front end is leading the easing narrative.';
      }
      return `2Y Treasury at ${pct(v)}, ${bpsDir} ${Math.abs(Math.round(bps))}bps. ${commentary}`;
    }

    // --- US 30Y ---
    case 'US_30Y': {
      const bps = changeBps(ind);
      const bpsDir = bps >= 0 ? 'up' : 'down';
      let commentary: string;
      if (v > 5.0) {
        commentary =
          'The long bond above 5% is a major stress signal. It reprices pension liabilities, real estate, and infrastructure financing across the economy.';
      } else if (v > 4.5) {
        commentary =
          'The 30Y above 4.5% reflects term premium expansion and persistent inflation expectations. Long-duration assets face headwinds.';
      } else if (v > 4.0) {
        commentary =
          'The 30Y in the 4-4.5% range is tight but manageable. Markets are pricing in structurally higher rates but not a crisis.';
      } else {
        commentary =
          'Below 4%, the long end is signaling benign inflation expectations or flight-to-quality demand.';
      }
      return `30Y Treasury at ${pct(v)}, ${bpsDir} ${Math.abs(Math.round(bps))}bps. ${commentary}`;
    }

    // --- 2s10s Spread ---
    case 'SPREAD_2S10S': {
      let commentary: string;
      if (v < 0) {
        commentary =
          'The curve is INVERTED -- the classic recession harbinger. Every US recession since 1970 has been preceded by inversion, though timing varies. The deeper the inversion, the louder the warning.';
      } else if (v > 0.5) {
        commentary =
          'The curve is steepening, which typically signals the market expects future easing or improving growth. Watch whether this is a bull steepener (rates falling) or bear steepener (long end rising).';
      } else {
        commentary =
          'The curve is relatively flat. The market sees limited differentiation between near-term and long-term rate expectations. A transitional state.';
      }
      return `2s10s spread at ${fmt(v)}%. ${commentary}`;
    }

    // --- CPI YoY ---
    case 'CPI_YOY': {
      let commentary: string;
      if (v > 5) {
        commentary =
          'Headline CPI above 5% is a policy emergency. The Fed must act aggressively, and consumers feel the squeeze. This level erodes real wages and consumer confidence simultaneously.';
      } else if (v > 3.5) {
        commentary =
          'Inflation running above 3.5% keeps the Fed hawkish. Rate cuts are off the table and markets must price in extended restrictive policy.';
      } else if (v > 2.5) {
        commentary =
          'Inflation above the 2% target but trending in the right direction. The Fed can be patient, but the last mile of disinflation is proving sticky.';
      } else if (v > 2.0) {
        commentary =
          'Near the 2% target. The inflation fight is largely won at this level, giving the Fed room to consider growth and employment mandates.';
      } else {
        commentary =
          'Below 2% -- deflation risk enters the conversation. The Fed would likely pivot to supporting growth and inflation expectations.';
      }
      return `CPI YoY at ${pct(v)}. ${commentary}`;
    }

    // --- Core CPI YoY ---
    case 'CORE_CPI_YOY': {
      let commentary: string;
      if (v > 5) {
        commentary =
          'Core CPI above 5% strips out food/energy noise and reveals entrenched inflation. Services, shelter, and wages are all running hot. The Fed has no choice but to stay restrictive.';
      } else if (v > 3.5) {
        commentary =
          'Core inflation above 3.5% is uncomfortable. The sticky components -- shelter, services -- are not cooperating with the disinflation narrative.';
      } else if (v > 2.5) {
        commentary =
          'Core above 2.5% shows progress but incomplete. The Fed watches core closely and this level keeps them cautious on easing.';
      } else {
        commentary =
          'Core CPI at or below 2.5% is consistent with the Fed\'s comfort zone. Conditions are aligning for a more neutral policy stance.';
      }
      return `Core CPI YoY at ${pct(v)}. ${commentary}`;
    }

    // --- Core PCE YoY ---
    case 'CORE_PCE_YOY': {
      let commentary: string;
      if (v > 4) {
        commentary =
          'Core PCE above 4% is the Fed\'s nightmare -- this is their preferred gauge and it\'s screaming. Expect hawkish rhetoric and no relief for risk assets.';
      } else if (v > 3) {
        commentary =
          'Core PCE above 3% means the Fed\'s 2% target remains distant. The market should not expect cuts at this level.';
      } else if (v > 2.5) {
        commentary =
          'Core PCE in the 2.5-3% range is the "almost there" zone. Progress is real but the Fed will want sustained readings before acting.';
      } else if (v > 2.0) {
        commentary =
          'Core PCE near 2% -- essentially at target. The Fed has maximum flexibility here and the focus shifts to employment and financial stability.';
      } else {
        commentary =
          'Core PCE below 2% opens the door to meaningful easing. The inflation battle is over at this level.';
      }
      return `Core PCE YoY at ${pct(v)}. ${commentary}`;
    }

    // --- Unemployment ---
    case 'UNEMPLOYMENT': {
      const change = changeAbs(ind);
      let commentary: string;
      if (v > 5.0) {
        commentary =
          'Unemployment above 5% signals a labour market in distress. Historically, once the unemployment rate rises this much, momentum carries it higher. The Sahm Rule is likely triggered.';
      } else if (v > 4.5) {
        commentary =
          'Above 4.5% and rising -- the labour market is cooling faster than the Fed would like. This shifts the balance of risks from inflation to employment.';
      } else if (v > 4.0) {
        commentary =
          'Unemployment in the low 4s is consistent with a healthy but normalizing labor market. Not yet a warning sign, but the trend matters.';
      } else {
        commentary =
          'Below 4% the labour market remains historically tight. Wage pressures may persist, giving the Fed less room to ease.';
      }
      const changeStr =
        change >= 0.1
          ? ` Rising ${fmt(change, 1)}pp from prior -- a deteriorating trend.`
          : change <= -0.1
            ? ` Down ${fmt(Math.abs(change), 1)}pp from prior -- improvement.`
            : '';
      return `Unemployment at ${pct(v)}.${changeStr} ${commentary}`;
    }

    // --- Initial Claims ---
    case 'INITIAL_CLAIMS': {
      let commentary: string;
      if (v > 350000) {
        commentary =
          'Claims above 350K are recessionary. Layoffs are broad-based and accelerating. Expect consumer spending to weaken and confidence to deteriorate.';
      } else if (v > 300000) {
        commentary =
          'Claims pushing above 300K signal meaningful labour market softening. The trend is more important than any single print, but this is concerning.';
      } else if (v > 250000) {
        commentary =
          'Claims in the 250-300K range suggest a cooling but not collapsing labor market. Consistent with a gradual slowdown.';
      } else if (v > 220000) {
        commentary =
          'Claims in the 220-250K range are healthy. The labor market is absorbing shocks and layoffs remain contained.';
      } else {
        commentary =
          'Claims below 220K signal an exceptionally tight labor market. Employers are hoarding workers and layoff risk is minimal.';
      }
      return `Initial claims at ${commaInt(v)}. ${commentary}`;
    }

    // --- NFP ---
    case 'NFP': {
      let commentary: string;
      if (v < 0) {
        commentary =
          'Negative payrolls -- the economy is shedding jobs. This is a recession signal and markets will price in aggressive easing.';
      } else if (v < 100) {
        commentary =
          'Below 100K is a soft print. Not enough to keep up with population growth. The labor market is losing momentum.';
      } else if (v < 200) {
        commentary =
          'Payrolls in the 100-200K range are moderate -- enough to sustain the expansion but not enough to fuel inflation fears. A Goldilocks zone for the Fed.';
      } else if (v < 300) {
        commentary =
          'Strong payroll gains above 200K suggest robust labour demand. This can keep wage growth elevated and makes the Fed\'s job harder.';
      } else {
        commentary =
          'Blockbuster payrolls above 300K -- the labour market is on fire. Good for workers, but this keeps inflation pressure alive and cuts off the table.';
      }
      return `Non-Farm Payrolls at ${commaInt(v)}K. ${commentary}`;
    }

    // --- ISM Manufacturing ---
    case 'ISM_MFG': {
      let commentary: string;
      if (v > 55) {
        commentary =
          'ISM above 55 signals robust manufacturing expansion. Order books are full and the industrial economy is firing. Bullish for cyclicals and commodities.';
      } else if (v > 50) {
        commentary =
          'ISM above 50 -- manufacturing is expanding, but modestly. Not a ringing endorsement of the cycle but at least the factory sector isn\'t contracting.';
      } else if (v > 45) {
        commentary =
          'ISM below 50 is contraction territory. The manufacturing recession continues. New orders and employment sub-indices likely confirm weakness.';
      } else {
        commentary =
          'ISM below 45 signals deep manufacturing contraction. Historically associated with broader economic recessions. Watch for contagion into services.';
      }
      return `ISM Manufacturing at ${fmt(v, 1)}. ${commentary}`;
    }

    // --- Consumer Confidence ---
    case 'CONSUMER_CONF': {
      const drop = prev != null ? prev - v : 0;
      let commentary: string;
      if (v < 80) {
        commentary =
          'Confidence below 80 is recessionary. Consumers are retrenching -- spending will follow sentiment lower. Discretionary sectors face headwinds.';
      } else if (v < 100) {
        commentary =
          'Confidence below 100 shows a cautious consumer. Not panicking, but not opening wallets either. Spending growth likely to moderate.';
      } else {
        commentary =
          'Confidence above 100 reflects an optimistic consumer willing to spend. Supports the economic expansion and risk asset performance.';
      }
      const dropStr =
        drop > 5
          ? ` Notable: a ${fmt(drop, 1)}-point drop from prior -- sharp deterioration in sentiment.`
          : '';
      return `Consumer Confidence at ${fmt(v, 1)}.${dropStr} ${commentary}`;
    }

    // --- IG Spread ---
    case 'IG_SPREAD': {
      let commentary: string;
      if (v > 200) {
        commentary =
          'IG spreads above 200bps signal significant credit stress. Investment-grade borrowers are being repriced -- a sign that credit markets see rising default risk even among quality names.';
      } else if (v > 150) {
        commentary =
          'Spreads in the 150-200bps range are elevated. Credit markets are nervous but not panicking. Issuance may slow and borrowing costs are climbing for corporates.';
      } else if (v > 100) {
        commentary =
          'Spreads in the 100-150bps range are normal to slightly tight. Credit markets are functioning and access to capital is healthy.';
      } else {
        commentary =
          'Sub-100bps spreads are extremely tight. Either credit risk is truly low or markets are complacent. Historically, very tight spreads precede widening episodes.';
      }
      return `IG Credit Spread at ${Math.round(v)}bps. ${commentary}`;
    }

    // --- HY Spread ---
    case 'HY_SPREAD': {
      let commentary: string;
      if (v > 600) {
        commentary =
          'HY spreads above 600bps signal distress. The junk bond market is pricing in a wave of defaults. This is a systemic risk indicator -- credit markets are seizing up.';
      } else if (v > 500) {
        commentary =
          'HY spreads above 500bps are crisis-adjacent. Lower-quality borrowers are being shut out of capital markets and refinancing risk is acute.';
      } else if (v > 400) {
        commentary =
          'Spreads in the 400-500bps range show meaningful stress but not panic. The market is differentiating between strong and weak credits.';
      } else if (v > 300) {
        commentary =
          'HY spreads in the 300-400bps range are historically normal. Credit conditions are supportive for risk assets.';
      } else {
        commentary =
          'Sub-300bps HY spreads are extremely tight -- the market sees minimal default risk. Great for issuers, but investors are not being compensated for much risk.';
      }
      return `HY Credit Spread at ${Math.round(v)}bps. ${commentary}`;
    }

    // --- S&P 500 ---
    case 'SP500': {
      const sma50 = ind.sma50;
      const sma200 = ind.sma200;
      const high52w = ind.high52w;
      let commentary = `S&P 500 at ${commaInt(v)} ${dir}.`;
      if (sma200 != null && v < sma200) {
        commentary += ` Trading BELOW the 200-day SMA (${commaInt(sma200)}) -- the primary trend is broken. Institutional systematic strategies reduce exposure here and momentum turns negative.`;
      } else if (sma50 != null && v > sma50) {
        commentary += ` Holding above the 50-day SMA (${commaInt(sma50)}) -- the near-term trend is intact and dip-buying is supported.`;
      }
      if (high52w != null) {
        const pctFromHigh = ((high52w - v) / high52w) * 100;
        if (pctFromHigh > 10) {
          commentary += ` Down ${fmt(pctFromHigh, 1)}% from the 52-week high (${commaInt(high52w)}) -- correction territory.`;
        } else if (pctFromHigh > 20) {
          commentary += ` Down ${fmt(pctFromHigh, 1)}% from the 52-week high -- bear market territory.`;
        } else if (pctFromHigh < 2) {
          commentary += ` Near the 52-week high (${commaInt(high52w)}) -- price discovery mode.`;
        }
      }
      return commentary;
    }

    // --- DOW ---
    case 'DOW': {
      let commentary = `Dow at ${commaInt(v)} ${dir}.`;
      const sma200 = ind.sma200;
      const sma50 = ind.sma50;
      if (sma200 != null && v < sma200) {
        commentary += ` Below the 200-day SMA -- the blue-chip index has lost its primary uptrend. Defensive positioning is warranted.`;
      } else if (sma50 != null && v > sma50) {
        commentary += ` Holding above the 50-day SMA -- the industrial bellwether maintains its near-term trend.`;
      }
      return commentary;
    }

    // --- NASDAQ ---
    case 'NASDAQ': {
      let commentary = `Nasdaq at ${commaInt(v)} ${dir}.`;
      const sma200 = ind.sma200;
      const sma50 = ind.sma50;
      if (sma200 != null && v < sma200) {
        commentary += ` Below the 200-day SMA -- tech and growth have lost leadership. Rising rates and multiple compression are taking their toll.`;
      } else if (sma50 != null && v > sma50) {
        commentary += ` Above the 50-day SMA -- growth and tech leadership is intact. Risk appetite remains healthy.`;
      }
      return commentary;
    }

    // --- FTSE100 ---
    case 'FTSE100': {
      let commentary = `FTSE 100 at ${commaInt(v)} ${dir}.`;
      const sma200 = ind.sma200;
      const sma50 = ind.sma50;
      if (sma200 != null && v < sma200) {
        commentary += ` Below the 200-day SMA -- UK equities are under pressure. Brexit legacy, energy costs, and global risk-off are all potential drivers.`;
      } else if (sma50 != null && v > sma50) {
        commentary += ` Holding above the 50-day SMA -- the UK large-cap index maintains its near-term trend.`;
      }
      return commentary;
    }

    // --- NIKKEI ---
    case 'NIKKEI': {
      let commentary = `Nikkei 225 at ${commaInt(v)} ${dir}.`;
      const sma200 = ind.sma200;
      const sma50 = ind.sma50;
      if (sma200 != null && v < sma200) {
        commentary += ` Below the 200-day SMA -- Japanese equities have broken trend. Watch yen strength and BOJ policy for catalysts.`;
      } else if (sma50 != null && v > sma50) {
        commentary += ` Above the 50-day SMA -- Japan's equity renaissance continues. Weak yen and corporate governance reforms are tailwinds.`;
      }
      return commentary;
    }

    // --- Oil WTI ---
    case 'OIL_WTI': {
      let commentary: string;
      if (v > 100) {
        commentary =
          'WTI above $100 is an economic headwind. Energy costs at this level act as a tax on consumers and compress corporate margins. Stagflation risk rises.';
      } else if (v > 90) {
        commentary =
          'WTI above $90 is uncomfortable. Not yet crisis, but enough to show up in headline CPI and weigh on consumer sentiment. OPEC+ supply discipline is working.';
      } else if (v > 75) {
        commentary =
          'WTI in the $75-90 range is elevated but manageable. Energy companies profit while the broader economy absorbs the cost without major stress.';
      } else if (v >= 50) {
        commentary =
          'WTI in the $50-75 range is the sweet spot -- enough to sustain E&P investment but not enough to crimp the consumer. Goldilocks for the energy-economy balance.';
      } else {
        commentary =
          'WTI below $50 signals demand destruction or supply glut. Energy sector faces capital discipline pressure and credit stress. Deflationary signal.';
      }
      return `WTI Crude at $${fmt(v)}. ${commentary}`;
    }

    // --- Oil Brent ---
    case 'OIL_BRT': {
      let commentary: string;
      if (v > 100) {
        commentary =
          'Brent above $100 puts global growth at risk. Emerging markets and energy importers face acute pressure. Central banks must balance inflation against growth headwinds.';
      } else if (v > 95) {
        commentary =
          'Brent above $95 is supply-driven tightness. OPEC+ controls the narrative and the market has limited spare capacity buffers.';
      } else if (v > 80) {
        commentary =
          'Brent in the $80-95 range is firm but not destabilizing. The global oil market is balanced with a slight supply deficit.';
      } else if (v >= 55) {
        commentary =
          'Brent in the $55-80 range supports both producers and consumers. A balanced oil market that doesn\'t dominate the macro narrative.';
      } else {
        commentary =
          'Brent below $55 reflects weak demand or oversupply. Petrostates face fiscal pressure and energy credit weakens.';
      }
      return `Brent Crude at $${fmt(v)}. ${commentary}`;
    }

    // --- Gold ---
    case 'GOLD': {
      const wp = weeklyPct(ind);
      let commentary: string;
      if (v > 2500) {
        commentary =
          'Gold above $2,500 reflects deep concern about fiat stability, geopolitical risk, or inflation expectations. Central bank buying and de-dollarization flows are structural supports.';
      } else if (v > 2000) {
        commentary =
          'Gold above $2,000 signals sustained demand for safe havens. Real rates, dollar direction, and geopolitical risk are the key drivers at this level.';
      } else if (v > 1800) {
        commentary =
          'Gold in the $1,800-2,000 range is historically elevated but not extreme. Consistent with moderate inflation hedging and portfolio diversification demand.';
      } else {
        commentary =
          'Gold below $1,800 suggests risk appetite is healthy and real rates are sufficiently positive to reduce gold\'s appeal.';
      }
      const wpStr = wp !== 0 ? ` Weekly move: ${wp > 0 ? '+' : ''}${fmt(wp, 1)}%.` : '';
      return `Gold at $${commaDec(v)}.${wpStr} ${commentary}`;
    }

    // --- Copper ---
    case 'COPPER': {
      let commentary: string;
      if (v > 4.5) {
        commentary =
          'Dr. Copper above $4.50 is a strong growth signal. Industrial demand is robust and supply constraints are binding. Bullish for global cyclicals and EM.';
      } else if (v > 4.0) {
        commentary =
          'Copper above $4 signals healthy industrial demand. China construction, green energy transition, and EV production are key demand drivers.';
      } else if (v > 3.5) {
        commentary =
          'Copper in the $3.50-4.00 range is neutral. Neither screaming growth nor signaling recession. Watch China PMIs for direction.';
      } else if (v > 3.0) {
        commentary =
          'Copper in the $3.00-3.50 range suggests softening industrial demand. Global manufacturing may be contracting.';
      } else {
        commentary =
          'Copper below $3.00 is a recession signal. Industrial demand has cratered. Dr. Copper\'s diagnosis: the global economy is sick.';
      }
      return `Copper at $${fmt(v, 3)}. ${commentary}`;
    }

    // --- DXY ---
    case 'DXY': {
      let commentary: string;
      if (v > 110) {
        commentary =
          'The dollar above 110 is a wrecking ball for global markets. EM currencies, commodities, and multinational earnings all suffer. Dollar strength at this level is itself a tightening force.';
      } else if (v > 105) {
        commentary =
          'DXY above 105 reflects either US growth outperformance or global risk aversion. Either way, it\'s a headwind for international assets and commodity prices.';
      } else if (v > 100) {
        commentary =
          'DXY in the 100-105 range is firm but not extreme. The dollar is supported by yield differentials and relative growth.';
      } else if (v > 95) {
        commentary =
          'DXY below 100 is a tailwind for risk assets, EM, and commodities. Dollar weakness reflects either narrowing rate differentials or improved global growth prospects.';
      } else {
        commentary =
          'DXY below 95 signals broad dollar weakness. Either the Fed is easing aggressively or global growth is outperforming the US. Bullish for international diversification.';
      }
      return `Dollar Index (DXY) at ${fmt(v)}. ${commentary}`;
    }

    // --- Put/Call ---
    case 'PUT_CALL': {
      let commentary: string;
      if (v > 1.2) {
        commentary =
          'P/C ratio above 1.2 -- extreme put buying signals peak fear. Contrarian bullish: when everyone is hedged, the market often reverses. Watch for a sentiment washout bottom.';
      } else if (v > 1.0) {
        commentary =
          'P/C ratio above 1.0 shows elevated hedging demand. The market is nervous. Not yet contrarian extreme, but caution is embedded in positioning.';
      } else if (v > 0.7) {
        commentary =
          'P/C ratio in the 0.7-1.0 range is normal. No extreme in either direction. Sentiment is balanced.';
      } else {
        commentary =
          'P/C ratio below 0.7 signals excessive bullishness and complacency. Call buying dominance often precedes corrections. Contrarian warning.';
      }
      return `Put/Call ratio at ${fmt(v)}. ${commentary}`;
    }

    default:
      return `${ind.label} at ${valueDisplay(key, ind)} ${dir}.`;
  }
}

// ---------------------------------------------------------------------------
// 3. computeMomentum
// ---------------------------------------------------------------------------

export function computeMomentum(ind: Indicator): string | null {
  if (!ind.history || ind.history.length < 6) return null;

  const last6 = ind.history.slice(-6).map(([, val]) => val);
  const latestChange = Math.abs(last6[5] - last6[4]);
  const priorChanges = [];
  for (let i = 1; i < 5; i++) {
    priorChanges.push(Math.abs(last6[i] - last6[i - 1]));
  }

  const avgPrior =
    priorChanges.reduce((a, b) => a + b, 0) / priorChanges.length;

  if (avgPrior === 0) return null;

  const ratio = latestChange / avgPrior;

  if (ratio > 1.5) return 'ACCEL';
  if (ratio < 0.5) return 'DECEL';
  return null;
}

// ---------------------------------------------------------------------------
// 4. generateNarrative
// ---------------------------------------------------------------------------

export function generateNarrative(
  indicators: Record<string, Indicator>,
): string {
  const get = (key: string) => indicators[key]?.value ?? null;
  const sig = (key: string) => indicators[key]?.signal ?? 'NEUTRAL';

  // Count bearish/bullish signals
  let bearishCount = 0;
  let bullishCount = 0;
  for (const ind of Object.values(indicators)) {
    if (ind.signal === 'BEARISH') bearishCount++;
    if (ind.signal === 'BULLISH') bullishCount++;
  }

  // Sentence 1: Dominant theme
  const cpiVal = get('CPI_YOY');
  const corePceVal = get('CORE_PCE_YOY');
  const unemployment = get('UNEMPLOYMENT');
  const ismMfg = get('ISM_MFG');
  const vix = get('VIX');
  const hySpread = get('HY_SPREAD');
  const consumerConf = get('CONSUMER_CONF');
  const dxy = get('DXY');

  const inflationHot =
    (cpiVal != null && cpiVal > 3.5) ||
    (corePceVal != null && corePceVal > 3.0);
  const growthWeak =
    (unemployment != null && unemployment > 4.5) ||
    (ismMfg != null && ismMfg < 48);

  let sentence1: string;
  if (inflationHot && growthWeak) {
    sentence1 =
      'The macro picture is flashing stagflation risk -- inflation remains sticky while growth indicators are deteriorating, the worst combination for risk assets.';
  } else if (bearishCount > bullishCount * 2 && bearishCount >= 5) {
    sentence1 =
      'Signals point to broad deterioration across the macro dashboard -- this is a risk-off environment where capital preservation trumps return-seeking.';
  } else if (vix != null && vix > 30 && hySpread != null && hySpread > 500) {
    sentence1 =
      'Markets are in risk-off mode with elevated volatility and widening credit spreads signaling acute stress across asset classes.';
  } else if (bullishCount > bearishCount * 2 && bullishCount >= 5) {
    sentence1 =
      'The macro backdrop is constructive -- a plurality of indicators are flashing bullish, supporting risk-on positioning across equities and credit.';
  } else {
    sentence1 =
      'The macro environment is mixed with crosscurrents across growth, inflation, and financial conditions -- requiring selective positioning rather than broad directional bets.';
  }

  // Sentence 2: Fed / rates context
  const fedSig = sig('FED_FUNDS');
  const spreadSig = sig('SPREAD_2S10S');
  const spreadVal = get('SPREAD_2S10S');

  let sentence2: string;
  if (fedSig === 'BULLISH') {
    sentence2 =
      'The Fed has pivoted to cutting rates, providing a tailwind for duration and rate-sensitive assets.';
  } else if (fedSig === 'BEARISH') {
    sentence2 =
      'The Fed continues tightening, keeping upward pressure on yields and downward pressure on valuations.';
  } else {
    sentence2 =
      'The Fed remains on hold, keeping policy restrictive while waiting for clearer signals from the data.';
  }

  if (spreadVal != null && spreadVal < 0) {
    sentence2 +=
      ' The yield curve remains inverted -- a persistent recession warning that the market cannot ignore.';
  } else if (spreadVal != null && spreadVal > 0.5) {
    sentence2 +=
      ' The curve has steepened, which historically supports risk assets and bank profitability.';
  }

  // Sentence 3: Financial conditions
  const stressSignals: string[] = [];
  if (vix != null && vix > 25) stressSignals.push('elevated VIX');
  if (hySpread != null && hySpread > 400)
    stressSignals.push('widening HY spreads');
  if (consumerConf != null && consumerConf < 85)
    stressSignals.push('weak consumer confidence');
  if (dxy != null && dxy > 105) stressSignals.push('strong dollar headwinds');

  let sentence3: string;
  if (stressSignals.length >= 3) {
    sentence3 = `Financial conditions are tightening with ${stressSignals.join(', ')} -- a combination that historically precedes earnings downgrades and risk asset repricing.`;
  } else if (stressSignals.length > 0) {
    sentence3 = `Watch ${stressSignals.join(' and ')} as potential stress points that could escalate if the macro trajectory worsens.`;
  } else {
    sentence3 =
      'Financial conditions remain broadly supportive with no acute stress signals across volatility, credit, or currency markets.';
  }

  return `${sentence1} ${sentence2} ${sentence3}`;
}

// ---------------------------------------------------------------------------
// Helper: biggestMover
// ---------------------------------------------------------------------------

function biggestMover(
  indicators: Record<string, Indicator>,
): { key: string; ind: Indicator; pctChange: number } | null {
  let best: { key: string; ind: Indicator; pctChange: number } | null = null;

  for (const [key, ind] of Object.entries(indicators)) {
    if (ind.value == null || ind.previous == null || ind.previous === 0)
      continue;
    const pctChange = Math.abs(
      ((ind.value - ind.previous) / ind.previous) * 100,
    );
    if (!best || pctChange > best.pctChange) {
      best = { key, ind, pctChange };
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// 5. generateDailyBrief
// ---------------------------------------------------------------------------

export function generateDailyBrief(
  indicators: Record<string, Indicator>,
): string {
  const get = (key: string) => indicators[key]?.value ?? null;
  const sig = (key: string) => indicators[key]?.signal ?? 'NEUTRAL';

  // Sentence 1: biggest mover
  const mover = biggestMover(indicators);
  let sentence1: string;
  if (mover) {
    const dir = mover.ind.direction ?? 'moved';
    sentence1 = `The biggest mover today is ${mover.ind.label}, ${dir} ${fmt(mover.pctChange, 1)}% -- ${mover.ind.signal === 'BEARISH' ? 'a bearish signal' : mover.ind.signal === 'BULLISH' ? 'a bullish development' : 'worth monitoring'}.`;
  } else {
    sentence1 =
      'Markets are quiet with no standout movers across the macro dashboard.';
  }

  // Sentence 2: cross-indicator read
  const vix = get('VIX');
  const sp500Sig = sig('SP500');
  const hySpread = get('HY_SPREAD');
  let sentence2: string;
  if (
    vix != null &&
    vix > 25 &&
    sp500Sig === 'BEARISH' &&
    hySpread != null &&
    hySpread > 400
  ) {
    sentence2 =
      'Cross-asset signals are aligned bearish: equities, vol, and credit are all flashing caution simultaneously.';
  } else if (
    vix != null &&
    vix < 15 &&
    sp500Sig === 'BULLISH'
  ) {
    sentence2 =
      'Risk-on conditions prevail: low vol and above-trend equities suggest the path of least resistance is higher.';
  } else {
    sentence2 =
      'Cross-asset signals are sending mixed messages -- no clear directional consensus from the major risk indicators.';
  }

  // Sentence 3: calendar awareness
  const today = new Date();
  const dayOfWeek = today.getDay();
  let sentence3: string;
  if (dayOfWeek === 5) {
    sentence3 =
      'Heading into the weekend, watch for position squaring and reduced liquidity that can amplify late-session moves.';
  } else if (dayOfWeek === 1) {
    sentence3 =
      'Monday sessions often set the tone for the week -- early price action will signal whether weekend developments shift the narrative.';
  } else {
    sentence3 =
      'Keep an eye on the data calendar and Fed speakers for potential catalysts that could break the current range.';
  }

  // Sentence 4: actionable takeaway
  let bearishCount = 0;
  let bullishCount = 0;
  for (const ind of Object.values(indicators)) {
    if (ind.signal === 'BEARISH') bearishCount++;
    if (ind.signal === 'BULLISH') bullishCount++;
  }

  let sentence4: string;
  if (bearishCount > bullishCount + 5) {
    sentence4 =
      'The weight of evidence favors defensive positioning -- reduce risk exposure and raise cash until signals improve.';
  } else if (bullishCount > bearishCount + 5) {
    sentence4 =
      'The signal balance supports risk-on positioning -- lean into equities and credit while the macro wind is at your back.';
  } else {
    sentence4 =
      'With signals evenly split, stay nimble and wait for conviction before making major allocation shifts.';
  }

  return `${sentence1} ${sentence2} ${sentence3} ${sentence4}`;
}

// ---------------------------------------------------------------------------
// 6. generateWeeklyWrap
// ---------------------------------------------------------------------------

export function generateWeeklyWrap(
  indicators: Record<string, Indicator>,
  previousData: Record<string, any>,
): string {
  // Sentence 1: scorecard
  let bearishCount = 0;
  let bullishCount = 0;
  let neutralCount = 0;
  for (const ind of Object.values(indicators)) {
    if (ind.signal === 'BEARISH') bearishCount++;
    else if (ind.signal === 'BULLISH') bullishCount++;
    else neutralCount++;
  }

  const total = bearishCount + bullishCount + neutralCount;
  const sentence1 = `Weekly scorecard: ${bullishCount} bullish, ${bearishCount} bearish, ${neutralCount} neutral out of ${total} indicators tracked.`;

  // Sentence 2: biggest movers of the week
  const mover = biggestMover(indicators);
  let sentence2: string;
  if (mover) {
    sentence2 = `The standout move this week was ${mover.ind.label} (${mover.ind.direction} ${fmt(mover.pctChange, 1)}%), which ${mover.ind.signal === 'BEARISH' ? 'is flashing a bearish warning' : mover.ind.signal === 'BULLISH' ? 'supports the constructive narrative' : 'warrants continued monitoring'}.`;
  } else {
    sentence2 =
      'No single indicator dominated price action this week -- moves were broadly distributed.';
  }

  // Sentence 3: regime shift check
  const prevBearish = previousData?.bearish_count ?? bearishCount;
  const shift = bearishCount - prevBearish;
  let sentence3: string;
  if (shift >= 3) {
    sentence3 =
      'Regime shift alert: the number of bearish signals increased meaningfully week-over-week, suggesting a deteriorating macro backdrop that may require portfolio adjustment.';
  } else if (shift <= -3) {
    sentence3 =
      'Regime shift alert: bearish signals declined significantly this week, pointing to an improving macro environment and potential for risk-on rotation.';
  } else {
    sentence3 =
      'No material regime shift this week -- the macro environment remains broadly consistent with prior readings.';
  }

  // Sentence 4: dominant theme
  const get = (key: string) => indicators[key]?.value ?? null;
  const cpiVal = get('CPI_YOY');
  const corePceVal = get('CORE_PCE_YOY');
  const unemployment = get('UNEMPLOYMENT');
  const ismMfg = get('ISM_MFG');
  const inflationHot =
    (cpiVal != null && cpiVal > 3.5) ||
    (corePceVal != null && corePceVal > 3.0);
  const growthWeak =
    (unemployment != null && unemployment > 4.5) ||
    (ismMfg != null && ismMfg < 48);

  let sentence4: string;
  if (inflationHot && growthWeak) {
    sentence4 =
      'The dominant theme remains stagflation risk -- sticky inflation and weakening growth create the most challenging environment for asset allocators.';
  } else if (bearishCount > bullishCount * 2) {
    sentence4 =
      'Risk-off dominated the week with bearish signals outnumbering bullish signals by a wide margin.';
  } else if (bullishCount > bearishCount * 2) {
    sentence4 =
      'The week was constructive with bullish signals firmly in the majority -- risk appetite remains robust.';
  } else {
    sentence4 =
      'The week told a story of crosscurrents -- no single theme dominated as growth, inflation, and policy pulled in different directions.';
  }

  // Sentence 5: next week preview
  let sentence5: string;
  if (bearishCount > bullishCount) {
    sentence5 =
      'Looking ahead, the bias is defensive. Monitor whether this week\'s bearish signals intensify or begin to stabilize -- the trend is the message.';
  } else if (bullishCount > bearishCount) {
    sentence5 =
      'Looking ahead, the constructive setup supports maintaining risk exposure. Watch for any cracks in credit or labor data that could shift the narrative.';
  } else {
    sentence5 =
      'Next week will be pivotal -- the current signal balance is near equilibrium and upcoming data releases could tip the scale in either direction.';
  }

  return `${sentence1} ${sentence2} ${sentence3} ${sentence4} ${sentence5}`;
}

// ---------------------------------------------------------------------------
// 7. generateForwardLook
// ---------------------------------------------------------------------------

export function generateForwardLook(
  indicators: Record<string, Indicator>,
): ForwardScenario[] {
  const get = (key: string) => indicators[key]?.value ?? null;
  const sig = (key: string) => indicators[key]?.signal ?? 'NEUTRAL';

  const scenarios: ForwardScenario[] = [];

  const oilWti = get('OIL_WTI');
  const oilBrt = get('OIL_BRT');
  const cpiYoy = get('CPI_YOY');
  const corePce = get('CORE_PCE_YOY');
  const coreCpi = get('CORE_CPI_YOY');
  const unemployment = get('UNEMPLOYMENT');
  const nfp = get('NFP');
  const initialClaims = get('INITIAL_CLAIMS');
  const ismMfg = get('ISM_MFG');
  const hySpread = get('HY_SPREAD');
  const igSpread = get('IG_SPREAD');
  const dxy = get('DXY');
  const fedFunds = get('FED_FUNDS');
  const vix = get('VIX');
  const consumerConf = get('CONSUMER_CONF');

  // --- Oil shock persistence ---
  if (oilWti != null && oilWti > 85) {
    scenarios.push({
      title: 'Oil Shock Persistence',
      probability: oilWti > 95 ? '35-45%' : '20-30%',
      prob_color: oilWti > 95 ? '#ff4d4d' : '#ffd24d',
      text: `WTI at $${fmt(oilWti)} suggests supply constraints could persist. If oil remains elevated for another quarter, expect headline CPI to re-accelerate, consumer spending to weaken, and airline/transport margins to compress. The Fed would face a difficult choice between fighting inflation and supporting growth.`,
      impacts: [
        ['Energy', 'BULLISH', 'Producers benefit from sustained high prices'],
        ['Consumer Discretionary', 'BEARISH', 'Gasoline costs crowd out spending'],
        ['Airlines', 'BEARISH', 'Jet fuel costs compress margins'],
      ],
    });
  }

  // --- Labour market cracks ---
  if (
    (unemployment != null && unemployment > 4.2) ||
    (initialClaims != null && initialClaims > 260000) ||
    (nfp != null && nfp < 100)
  ) {
    scenarios.push({
      title: 'Labour Market Cracks',
      probability:
        unemployment != null && unemployment > 4.5 ? '40-50%' : '25-35%',
      prob_color:
        unemployment != null && unemployment > 4.5 ? '#ff4d4d' : '#ffd24d',
      text: `Signs of labour market softening are emerging${unemployment != null ? ` with unemployment at ${pct(unemployment)}` : ''}${initialClaims != null ? ` and initial claims at ${commaInt(initialClaims)}` : ''}. If this trend accelerates, the Sahm Rule could trigger, forcing the Fed to pivot from inflation-fighting to recession-prevention. Consumer spending -- 70% of GDP -- would come under direct pressure.`,
      impacts: [
        ['Fed Policy', 'BULLISH', 'Labour weakness triggers rate cuts'],
        ['Consumer Staples', 'BULLISH', 'Defensive rotation into necessities'],
        ['Financials', 'BEARISH', 'Loan losses rise with unemployment'],
      ],
    });
  }

  // --- Inflation re-acceleration ---
  if (
    (cpiYoy != null && cpiYoy > 3.0) ||
    (corePce != null && corePce > 2.8) ||
    (coreCpi != null && coreCpi > 3.5)
  ) {
    scenarios.push({
      title: 'Inflation Re-acceleration',
      probability: cpiYoy != null && cpiYoy > 4.0 ? '30-40%' : '15-25%',
      prob_color: cpiYoy != null && cpiYoy > 4.0 ? '#ff4d4d' : '#ffd24d',
      text: `Inflation metrics remain elevated${cpiYoy != null ? ` with headline CPI at ${pct(cpiYoy)}` : ''}${corePce != null ? ` and Core PCE at ${pct(corePce)}` : ''}. A second wave of inflation driven by services stickiness, housing, or energy could force the Fed back into hiking mode. This would be the most damaging scenario for the 60/40 portfolio.`,
      impacts: [
        ['Duration', 'BEARISH', 'Rates reprice higher, bonds sell off'],
        ['Growth Stocks', 'BEARISH', 'Higher discount rates compress multiples'],
        ['Commodities', 'BULLISH', 'Real assets benefit from inflation'],
      ],
    });
  }

  // --- Geopolitical de-escalation ---
  if (
    (oilWti != null && oilWti > 80) ||
    (vix != null && vix > 20)
  ) {
    scenarios.push({
      title: 'Geopolitical De-escalation',
      probability: '10-20%',
      prob_color: '#4d9fff',
      text: 'A resolution or material de-escalation of ongoing geopolitical tensions (Middle East, Ukraine-Russia, US-China trade) would remove risk premia embedded across oil, volatility, and safe-haven assets. Markets would likely see a sharp relief rally with rotation from defensives into cyclicals.',
      impacts: [
        ['Energy', 'BEARISH', 'Risk premium unwinds, oil prices fall'],
        ['Global Equities', 'BULLISH', 'Risk-on rally across markets'],
        ['Gold', 'BEARISH', 'Safe-haven demand evaporates'],
      ],
    });
  }

  // --- Soft landing ---
  if (
    (cpiYoy != null && cpiYoy < 3.5) &&
    (unemployment != null && unemployment < 4.5) &&
    (ismMfg != null && ismMfg > 48)
  ) {
    scenarios.push({
      title: 'Soft Landing Achieved',
      probability: '25-35%',
      prob_color: '#00e676',
      text: `The data is consistent with a soft landing narrative -- inflation is trending down${cpiYoy != null ? ` at ${pct(cpiYoy)}` : ''}, unemployment remains contained${unemployment != null ? ` at ${pct(unemployment)}` : ''}, and manufacturing is stabilizing. If this trajectory holds, the Fed can ease gradually while corporate earnings recover. The goldilocks scenario.`,
      impacts: [
        ['Equities', 'BULLISH', 'Earnings growth resumes with lower rates'],
        ['Credit', 'BULLISH', 'Spreads tighten as default fears recede'],
        ['Duration', 'BULLISH', 'Front-end rates fall as Fed eases'],
      ],
    });
  }

  // --- Credit stress ---
  if (
    (hySpread != null && hySpread > 400) ||
    (igSpread != null && igSpread > 150)
  ) {
    scenarios.push({
      title: 'Credit Stress Escalation',
      probability: hySpread != null && hySpread > 500 ? '30-40%' : '15-25%',
      prob_color: hySpread != null && hySpread > 500 ? '#ff4d4d' : '#ffd24d',
      text: `Credit spreads are widening${hySpread != null ? ` with HY at ${Math.round(hySpread)}bps` : ''}${igSpread != null ? ` and IG at ${Math.round(igSpread)}bps` : ''}, signaling growing default risk. If spreads continue to widen, refinancing costs will become prohibitive for leveraged borrowers, potentially triggering a default cycle. Watch CCC-rated issuers and leveraged loan markets for early contagion signals.`,
      impacts: [
        ['High Yield', 'BEARISH', 'Default cycle accelerates'],
        ['Financials', 'BEARISH', 'Bank loan books deteriorate'],
        ['Treasuries', 'BULLISH', 'Flight to quality drives yields lower'],
      ],
    });
  }

  // --- Dollar breakdown ---
  if (dxy != null && dxy < 102) {
    scenarios.push({
      title: 'Dollar Breakdown',
      probability: dxy < 98 ? '30-40%' : '15-25%',
      prob_color: dxy < 98 ? '#ffd24d' : '#4d9fff',
      text: `The dollar index at ${fmt(dxy)} is weakening, potentially signaling a structural shift in capital flows. A sustained dollar decline would benefit EM equities, commodities, and US multinationals while pressuring dollar-denominated debt. De-dollarization trends and narrowing rate differentials could accelerate the move.`,
      impacts: [
        ['Emerging Markets', 'BULLISH', 'EM assets rally on weaker dollar'],
        ['Commodities', 'BULLISH', 'Dollar-denominated commodities reprice higher'],
        ['US Importers', 'BEARISH', 'Import costs rise, margins compress'],
      ],
    });
  }

  // --- Fed surprise cut ---
  if (
    fedFunds != null &&
    fedFunds > 4.0 &&
    ((vix != null && vix > 25) ||
      (hySpread != null && hySpread > 450) ||
      (unemployment != null && unemployment > 4.3))
  ) {
    scenarios.push({
      title: 'Fed Surprise Cut',
      probability: vix != null && vix > 30 ? '20-30%' : '10-15%',
      prob_color: '#4d9fff',
      text: `With the Fed Funds rate at ${pct(fedFunds)} and stress building${vix != null && vix > 25 ? ` (VIX at ${fmt(vix)})` : ''}${hySpread != null && hySpread > 450 ? ` (HY spreads at ${Math.round(hySpread)}bps)` : ''}, an emergency or accelerated cut becomes plausible if conditions deteriorate rapidly. An inter-meeting cut would signal the Fed sees something breaking beneath the surface.`,
      impacts: [
        ['Equities', 'BULLISH', 'Short-term relief rally on easing'],
        ['Dollar', 'BEARISH', 'Rate cuts weaken dollar support'],
        ['Gold', 'BULLISH', 'Real rates fall, gold benefits'],
      ],
    });
  }

  // Sort by relevance (higher probability first) and return top 3
  const probOrder = (p: string): number => {
    const match = p.match(/(\d+)-(\d+)%/);
    if (!match) return 0;
    return (parseInt(match[1]) + parseInt(match[2])) / 2;
  };

  scenarios.sort((a, b) => probOrder(b.probability) - probOrder(a.probability));

  return scenarios.slice(0, 3);
}

// ---------------------------------------------------------------------------
// 10. classifyRegime
// ---------------------------------------------------------------------------

export function classifyRegime(
  indicators: Record<string, Indicator>,
): { regime: string; color: string; description: string } {
  const get = (key: string) => indicators[key]?.value ?? null;
  const sig = (key: string) => indicators[key]?.signal ?? 'NEUTRAL';

  const cpiYoy = get('CPI_YOY');
  const corePce = get('CORE_PCE_YOY');
  const unemployment = get('UNEMPLOYMENT');
  const ismMfg = get('ISM_MFG');
  const nfp = get('NFP');
  const consumerConf = get('CONSUMER_CONF');
  const hySpread = get('HY_SPREAD');
  const sp500Sig = sig('SP500');
  const vix = get('VIX');
  const fedSig = sig('FED_FUNDS');
  const spreadVal = get('SPREAD_2S10S');

  const inflationHot =
    (cpiYoy != null && cpiYoy > 3.5) ||
    (corePce != null && corePce > 3.0);
  const inflationCool =
    (cpiYoy != null && cpiYoy < 2.5) &&
    (corePce == null || corePce < 2.5);
  const growthWeak =
    (unemployment != null && unemployment > 4.5) ||
    (ismMfg != null && ismMfg < 48) ||
    (nfp != null && nfp < 0);
  const growthStrong =
    (unemployment != null && unemployment < 4.0) &&
    (ismMfg != null && ismMfg > 52);
  const creditStress = hySpread != null && hySpread > 500;
  const curveInverted = spreadVal != null && spreadVal < 0;

  // RECESSION: broad deterioration
  if (
    growthWeak &&
    creditStress &&
    (sp500Sig === 'BEARISH' || (vix != null && vix > 30))
  ) {
    return {
      regime: 'RECESSION',
      color: '#ff1a1a',
      description:
        'Multiple indicators confirm recessionary conditions: growth is contracting, credit stress is acute, and risk assets are under pressure. Capital preservation is the priority.',
    };
  }

  // STAGFLATION: hot inflation + weak growth
  if (inflationHot && growthWeak) {
    return {
      regime: 'STAGFLATION',
      color: '#ff6b35',
      description:
        'The worst of both worlds: inflation remains elevated while growth is deteriorating. Traditional portfolio hedges fail in this environment -- real assets and cash outperform.',
    };
  }

  // TIGHTENING: Fed hiking, inflation hot, growth still OK
  if (
    inflationHot &&
    !growthWeak &&
    (fedSig === 'BEARISH' || fedSig === 'NEUTRAL')
  ) {
    return {
      regime: 'TIGHTENING',
      color: '#ff4d4d',
      description:
        'The Fed is tightening to combat inflation while growth holds up. Duration is the enemy. Short-duration, value, and commodities outperform in this regime.',
    };
  }

  // EXPANSION: strong growth, manageable inflation
  if (growthStrong && !inflationHot) {
    return {
      regime: 'EXPANSION',
      color: '#00e676',
      description:
        'The economy is firing on all cylinders with strong growth and contained inflation. Risk assets thrive -- lean into equities, credit, and cyclicals.',
    };
  }

  // RECOVERY: Fed easing, growth improving from weakness
  if (fedSig === 'BULLISH' && !inflationHot) {
    return {
      regime: 'RECOVERY',
      color: '#4d9fff',
      description:
        'The Fed is easing and inflation is not a threat. Early-cycle dynamics favor beaten-down cyclicals, small caps, and credit. Duration extends as rates fall.',
    };
  }

  // SLOWDOWN: growth softening but no recession yet
  if (
    (unemployment != null && unemployment > 4.0 && unemployment <= 4.5) ||
    (ismMfg != null && ismMfg >= 48 && ismMfg < 50) ||
    (consumerConf != null && consumerConf < 90) ||
    curveInverted
  ) {
    return {
      regime: 'SLOWDOWN',
      color: '#ffd24d',
      description:
        'Growth is decelerating but not yet contracting. This is the watchful waiting phase -- defensives and quality factors outperform while the market prices in whether this becomes a recession.',
    };
  }

  // MIXED: no clear regime
  return {
    regime: 'MIXED',
    color: '#8892b0',
    description:
      'Indicators are sending conflicting signals with no dominant macro regime. Stay diversified and nimble -- clarity will come from upcoming data releases.',
  };
}
