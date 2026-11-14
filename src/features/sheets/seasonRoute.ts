import { ACTIVE_YEAR, HISTORY_YEAR, type HistoryTarget } from "./seasonal";

export function historyRoute(hash: string): HistoryTarget | null {
  const match = /^#\/sheets\/2025(?:\/([^/]+))?$/.exec(hash);
  if (!match) return null; // All default/unknown routes select explicit launch year.
  try {
    const subject = match[1] ? decodeURIComponent(match[1]) : undefined;
    return { year: HISTORY_YEAR, ...(subject ? { subject } : {}) };
  } catch { return null; }
}
export function sheetRoute(history: HistoryTarget | null) {
  return history ? `#/sheets/${history.year}${history.subject ? `/${encodeURIComponent(history.subject)}` : ""}` : `#/sheets/${ACTIVE_YEAR}`;
}
