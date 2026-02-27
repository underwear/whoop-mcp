export function today(): string {
  return new Date().toISOString().split("T")[0]!;
}

export function msToHours(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.round((ms % 3600000) / 60000);
  return `${h}:${m.toString().padStart(2, "0")}`;
}

export function msToHoursDecimal(ms: number): number {
  return Math.round((ms / 3600000) * 10) / 10;
}

export function pct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${Math.round(n)}%`;
}

export function num(n: number | null | undefined, decimals = 1): string {
  if (n == null) return "—";
  return n.toFixed(decimals);
}

export function recoveryColor(score: number): string {
  if (score >= 67) return "green";
  if (score >= 34) return "yellow";
  return "red";
}

export function recoveryEmoji(score: number): string {
  if (score >= 67) return "🟢";
  if (score >= 34) return "🟡";
  return "🔴";
}

export function trendArrow(current: number, baseline: number): string {
  const diff = current - baseline;
  const pctDiff = baseline !== 0 ? Math.round((diff / baseline) * 100) : 0;
  if (Math.abs(pctDiff) < 3) return "→";
  return diff > 0 ? `↑${Math.abs(pctDiff)}%` : `↓${Math.abs(pctDiff)}%`;
}

export function toolResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

export function toolError(msg: string) {
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
}

/** Format a date string like "Feb 26" */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

/** Get dates going back N days from a given date */
export function datesBack(fromDate: string, days: number): string[] {
  const result: string[] = [];
  const d = new Date(fromDate + "T12:00:00");
  for (let i = 0; i < days; i++) {
    result.push(d.toISOString().split("T")[0]!);
    d.setDate(d.getDate() - 1);
  }
  return result;
}
