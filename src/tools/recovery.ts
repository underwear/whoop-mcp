import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WhoopClient } from "../whoop-client";
import { today, num, pct, recoveryColor, recoveryEmoji, trendArrow, toolResult, toolError, shortDate } from "./helpers";

export function registerRecoveryTool(server: McpServer, client: WhoopClient) {
  server.registerTool(
    "whoop_get_recovery",
    {
      title: "WHOOP Recovery",
      description:
        "Recovery analysis including HRV, resting heart rate, SpO2, skin temperature, and sleep performance contributors. Supports multi-day trend analysis with pattern detection via the 'days' parameter.",
      inputSchema: {
        date: z.string().optional().describe("Date YYYY-MM-DD (default: today)"),
        days: z.number().min(1).max(30).optional().describe("Number of days for trend (default: 1)"),
        detail: z.enum(["summary", "full"]).optional().describe("Detail level (default: summary)"),
      },
    },
    async ({ date, days, detail }) => {
      try {
        const d = date || today();
        const n = days || 1;
        const det = detail || "summary";

        if (n === 1) {
          // Single day: v2 recovery (SpO2, skin temp) + internal deep dive (coach insight, contributors)
          const [v2Records, deepDive] = await Promise.all([
            client.getRecoveryV2(1),
            client.getDeepDiveRecovery(d).catch(() => null),
          ]);

          if (!v2Records.length) return toolResult("No recovery data available for this date.");

          const rec = v2Records[0];
          const s = rec.score || {};

          const lines = [
            `Recovery: ${shortDate(rec.created_at)} — ${pct(s.recovery_score)} (${recoveryColor(s.recovery_score)})`,
            "",
            `HRV: ${num(s.hrv_rmssd_milli)}ms`,
            `Resting HR: ${num(s.resting_heart_rate, 0)}bpm`,
            `SpO2: ${num(s.spo2_percentage)}%`,
            `Skin temp: ${num(s.skin_temp_celsius)}°C`,
          ];

          // Add contributors and coach insight from deep dive
          if (det === "full" && deepDive) {
            const contributorsSection = deepDive.sections?.find((s: any) =>
              s.items?.some((i: any) => i.type === "CONTRIBUTORS_TILE")
            );
            const tile = contributorsSection?.items?.find((i: any) => i.type === "CONTRIBUTORS_TILE")?.content;

            if (tile?.metrics) {
              lines.push("", "Contributors (vs 30-day baseline):");
              for (const m of tile.metrics) {
                lines.push(`  ${m.title}: ${m.status} (baseline: ${m.status_subtitle})`);
              }
            }

            const coachInsight = tile?.footer?.items?.find((i: any) => i.type === "WHOOP_COACH_VOW")?.content?.vow;
            if (coachInsight) {
              lines.push("", `Coach insight: ${coachInsight}`);
            }
          }

          return toolResult(lines.join("\n"));
        }

        // Multi-day trend
        const records = await client.getRecoveryV2(n);
        if (!records.length) return toolResult("No recovery data available.");

        let totalRec = 0, totalHrv = 0, totalRhr = 0, totalSpo2 = 0;
        let count = 0;
        let minRec = 100, maxRec = 0;

        const dailyLines: string[] = [];

        for (const rec of records) {
          const s = rec.score || {};
          if (s.recovery_score == null) continue;
          count++;

          totalRec += s.recovery_score;
          totalHrv += s.hrv_rmssd_milli || 0;
          totalRhr += s.resting_heart_rate || 0;
          totalSpo2 += s.spo2_percentage || 0;
          if (s.recovery_score < minRec) minRec = s.recovery_score;
          if (s.recovery_score > maxRec) maxRec = s.recovery_score;

          dailyLines.push(
            `  ${shortDate(rec.created_at)}: ${recoveryEmoji(s.recovery_score)}${pct(s.recovery_score)} | HRV ${num(s.hrv_rmssd_milli)}ms | RHR ${num(s.resting_heart_rate, 0)} | SpO2 ${num(s.spo2_percentage)}% | Skin ${num(s.skin_temp_celsius)}°C`
          );
        }

        if (count === 0) return toolResult("No scored recovery data in this range.");

        const avgRec = Math.round(totalRec / count);
        const avgHrv = Math.round(totalHrv / count * 10) / 10;
        const avgRhr = Math.round(totalRhr / count);
        const avgSpo2 = Math.round(totalSpo2 / count * 10) / 10;

        const lines = [
          `Recovery trend: ${shortDate(records[records.length - 1].created_at)} – ${shortDate(records[0].created_at)} (${count} days)`,
          "",
          `Avg recovery: ${avgRec}% | Range: ${Math.round(minRec)}%–${Math.round(maxRec)}%`,
          `Avg HRV: ${avgHrv}ms | Avg RHR: ${avgRhr}bpm | Avg SpO2: ${avgSpo2}%`,
          "",
          "Daily:",
          ...dailyLines,
        ];

        // Pattern detection
        const patterns: string[] = [];
        const recScores = records.filter((r: any) => r.score?.recovery_score != null).map((r: any) => r.score.recovery_score);

        const lowDays = recScores.filter((r: number) => r < 50).length;
        if (lowDays >= 3) patterns.push(`Recovery below 50% on ${lowDays} of ${count} days — possible overreaching.`);

        // HRV trend (is it declining?)
        const hrvValues = records.filter((r: any) => r.score?.hrv_rmssd_milli).map((r: any) => r.score.hrv_rmssd_milli);
        if (hrvValues.length >= 3) {
          const firstHalf = hrvValues.slice(Math.floor(hrvValues.length / 2));
          const secondHalf = hrvValues.slice(0, Math.floor(hrvValues.length / 2));
          const avgFirst = firstHalf.reduce((a: number, b: number) => a + b, 0) / firstHalf.length;
          const avgSecond = secondHalf.reduce((a: number, b: number) => a + b, 0) / secondHalf.length;
          if (avgSecond < avgFirst * 0.9) patterns.push(`HRV trending down: earlier avg ${num(avgFirst)}ms → recent ${num(avgSecond)}ms.`);
          if (avgSecond > avgFirst * 1.1) patterns.push(`HRV trending up: earlier avg ${num(avgFirst)}ms → recent ${num(avgSecond)}ms.`);
        }

        // Consecutive low days
        let maxConsecLow = 0, consecLow = 0;
        for (const s of recScores) {
          if (s < 50) { consecLow++; maxConsecLow = Math.max(maxConsecLow, consecLow); }
          else consecLow = 0;
        }
        if (maxConsecLow >= 3) patterns.push(`${maxConsecLow} consecutive days below 50% recovery.`);

        if (patterns.length > 0) {
          lines.push("", "Patterns:");
          patterns.forEach(p => lines.push(`  ⚠ ${p}`));
        }

        return toolResult(lines.join("\n"));
      } catch (e: any) {
        return toolError(e.message);
      }
    }
  );
}
