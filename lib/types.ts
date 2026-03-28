export interface Indicator {
  label: string;
  value: number | null;
  previous: number | null;
  value_str?: string;
  direction: string;
  unit: string;
  source: string;
  category: string;
  value_date: string | null;
  previous_date: string | null;
  history: [string, number][];
  signal?: string;
  commentary?: string;
  momentum?: string | null;
  high52w?: number;
  low52w?: number;
  sma50?: number;
  sma200?: number;
  weekly_pct?: number;
  manual_input?: boolean;
  heat_score?: number;
}

export interface Indicators {
  [key: string]: Indicator;
}

export interface DashboardData {
  indicators: Indicators;
  timestamp: string;
  daily_brief: string;
  weekly_wrap: string;
  forward_look: ForwardScenario[];
}

export interface ForwardScenario {
  title: string;
  probability: string;
  prob_color: string;
  text: string;
  impacts: [string, string, string][];
}

export interface Rules {
  [key: string]: Record<string, number | boolean | number[]>;
}
