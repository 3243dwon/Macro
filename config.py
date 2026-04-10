"""
Macro Pulse — Configuration
"""
import os

# ── FRED API ──────────────────────────────────────────────────────────────────
FRED_API_KEY = os.environ.get("FRED_API_KEY", "")

# ── FRED series to fetch ──────────────────────────────────────────────────────
FRED_SERIES = {
    "FED_FUNDS_UPPER": "DFEDTARU",
    "FED_FUNDS_LOWER": "DFEDTARL",
    "US_10Y":          "DGS10",
    "US_2Y":           "DGS2",
    "US_30Y":          "DGS30",
    "CPI":             "CPIAUCSL",
    "CORE_CPI":        "CPILFESL",
    "CORE_PCE":        "PCEPILFE",
    "UNEMPLOYMENT":    "UNRATE",
    "INITIAL_CLAIMS":  "ICSA",
    "NFP":             "PAYEMS",
    "ISM_MFG":         "MANEMP",
    "CONSUMER_CONF":   "UMCSENT",
    "IG_SPREAD":       "BAMLC0A0CM",
    "HY_SPREAD":       "BAMLH0A0HYM2",
    "SPREAD_2S10S":    "T10Y2Y",
}

# ── yfinance tickers ──────────────────────────────────────────────────────────
YFINANCE_TICKERS = {
    "SP500":   "^GSPC",
    "DOW":     "^DJI",
    "NASDAQ":  "^IXIC",
    "FTSE100": "^FTSE",
    "NIKKEI":  "^N225",
    "VIX":     "^VIX",
    "OIL_WTI": "CL=F",
    "OIL_BRT": "BZ=F",
    "GOLD":    "GC=F",
    "COPPER":  "HG=F",
    "DXY":     "DX-Y.NYB",
}

# ── File paths ────────────────────────────────────────────────────────────────
DATA_DIR       = "data"
OUTPUT_DIR     = "output"
INDICATORS_FILE = "data/indicators.json"
RULES_FILE      = "data/rules.json"
HTML_OUTPUT     = "output/macro_dashboard.html"
EXCEL_OUTPUT    = "output/macro_pulse.xlsx"

# ── History: how many FRED data points to look back for YoY / MoM ────────────
FRED_LOOKBACK_YEARS = 2   # fetch 2 years of history per series
