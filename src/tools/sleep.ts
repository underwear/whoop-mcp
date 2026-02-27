import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WhoopClient } from "../whoop-client";
import { today, msToHours, msToHoursDecimal, pct, num, toolResult, toolError, shortDate } from "./helpers";

function formatSingleDay(rec: any, sleepStress?: string, detail?: string): string {
  const score = rec.score || {};
  const stages = score.stage_summary || {};
  const need = score.sleep_needed || {};

  const inBed = msToHours(stages.total_in_bed_time_milli || 0);
  const totalSleep = (stages.total_in_bed_time_milli || 0) - (stages.total_awake_time_milli || 0);
  const sleepH = msToHours(totalSleep);
  const light = msToHours(stages.total_light_sleep_time_milli || 0);
  const deep = msToHours(stages.total_slow_wave_sleep_time_milli || 0);
  const rem = msToHours(stages.total_rem_sleep_time_milli || 0);
  const awake = msToHours(stages.total_awake_time_milli || 0);

  const totalMs = totalSleep || 1;
  const lightPct = Math.round((stages.total_light_sleep_time_milli || 0) / totalMs * 100);
  const deepPct = Math.round((stages.total_slow_wave_sleep_time_milli || 0) / totalMs * 100);
  const remPct = Math.round((stages.total_rem_sleep_time_milli || 0) / totalMs * 100);
  const awakePct = Math.round((stages.total_awake_time_milli || 0) / (stages.total_in_bed_time_milli || 1) * 100);

  const neededH = msToHoursDecimal(
    (need.baseline_milli || 0) + (need.need_from_sleep_debt_milli || 0) + (need.need_from_recent_strain_milli || 0)
  );

  const lines = [
    `Sleep: ${shortDate(rec.start)} — ${pct(score.sleep_performance_percentage)} performance`,
    "",
    `Hours: ${sleepH} (needed ${neededH}h — baseline ${msToHoursDecimal(need.baseline_milli || 0)}h + debt ${msToHoursDecimal(need.need_from_sleep_debt_milli || 0)}h + strain ${msToHoursDecimal(need.need_from_recent_strain_milli || 0)}h)`,
    `Performance: ${pct(score.sleep_performance_percentage)} | Consistency: ${pct(score.sleep_consistency_percentage)} | Efficiency: ${pct(score.sleep_efficiency_percentage)}`,
    `Stages: Light ${light} (${lightPct}%) | Deep ${deep} (${deepPct}%) | REM ${rem} (${remPct}%) | Awake ${awake} (${awakePct}%)`,
    `Disturbances: ${stages.disturbance_count ?? "—"} | Sleep cycles: ${stages.sleep_cycle_count ?? "—"}`,
    `Respiratory rate: ${num(score.respiratory_rate)} rpm`,
  ];

  if (sleepStress) {
    lines.push(`Sleep stress: ${sleepStress}`);
  }

  if (detail === "full") {
    lines.push(
      "",
      "Breakdown:",
      `  In bed: ${inBed}`,
      `  Nap: ${rec.nap ? "yes" : "no"}`,
      `  Sleep needed baseline: ${msToHours(need.baseline_milli || 0)}`,
      `  Sleep debt component: ${msToHours(need.need_from_sleep_debt_milli || 0)}`,
      `  Strain component: ${msToHours(need.need_from_recent_strain_milli || 0)}`,
      `  Nap component: ${msToHours(need.need_from_recent_nap_milli || 0)}`,
    );
  }

  return lines.join("\n");
}

export function registerSleepTool(server: McpServer, client: WhoopClient) {
  server.registerTool(
    "whoop_get_sleep",
    {
      title: "WHOOP Sleep",
      description:
        "Sleep analysis with stage breakdown (light/deep/REM), debt tracking, performance and consistency metrics. Supports single-night deep-dive or multi-day trend analysis via the 'days' parameter.",
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
          // Single day: dev v2 sleep + internal sleep stress
          const [sleepRecords, lastNight] = await Promise.all([
            client.getSleepV2(1),
            client.getSleepLastNight(d).catch(() => null),
          ]);

          if (!sleepRecords.length) return toolResult("No sleep data available for this date.");

          // Extract sleep stress from last-night deep dive
          let sleepStress: string | undefined;
          if (lastNight?.sections) {
            const stressSection = lastNight.sections.find((s: any) => s.id === "sleep_stress");
            const arrowStat = stressSection?.items?.[0]?.content?.arrow_stat;
            if (Array.isArray(arrowStat) && arrowStat[0]) {
              sleepStress = `${arrowStat[0].current_stat_text} (30d avg: ${arrowStat[0].historic_stat_text})`;
            }
          }

          return toolResult(formatSingleDay(sleepRecords[0], sleepStress, det));
        }

        // Multi-day trend
        const records = await client.getSleepV2(n);
        if (!records.length) return toolResult("No sleep data available.");

        // Compute averages
        let totalPerf = 0, totalEff = 0, totalConsist = 0;
        let totalLightMs = 0, totalDeepMs = 0, totalRemMs = 0, totalAwakeMs = 0, totalSleepMs = 0;
        let count = 0;

        const dailyLines: string[] = [];

        for (const rec of records) {
          const s = rec.score || {};
          const st = s.stage_summary || {};
          if (s.sleep_performance_percentage == null) continue;
          count++;

          totalPerf += s.sleep_performance_percentage || 0;
          totalEff += s.sleep_efficiency_percentage || 0;
          totalConsist += s.sleep_consistency_percentage || 0;

          const sleepMs = (st.total_in_bed_time_milli || 0) - (st.total_awake_time_milli || 0);
          totalSleepMs += sleepMs;
          totalLightMs += st.total_light_sleep_time_milli || 0;
          totalDeepMs += st.total_slow_wave_sleep_time_milli || 0;
          totalRemMs += st.total_rem_sleep_time_milli || 0;
          totalAwakeMs += st.total_awake_time_milli || 0;

          const deepPct = sleepMs > 0 ? Math.round((st.total_slow_wave_sleep_time_milli || 0) / sleepMs * 100) : 0;

          dailyLines.push(
            `  ${shortDate(rec.start)}: ${msToHours(sleepMs)} | ${pct(s.sleep_performance_percentage)} perf | Deep ${deepPct}%`
          );
        }

        if (count === 0) return toolResult("No scored sleep data in this range.");

        const avgPerf = Math.round(totalPerf / count);
        const avgEff = Math.round(totalEff / count);
        const avgConsist = Math.round(totalConsist / count);
        const avgSleepH = msToHoursDecimal(totalSleepMs / count);
        const avgDeepPct = totalSleepMs > 0 ? Math.round(totalDeepMs / totalSleepMs * 100) : 0;
        const avgRemPct = totalSleepMs > 0 ? Math.round(totalRemMs / totalSleepMs * 100) : 0;
        const avgLightPct = totalSleepMs > 0 ? Math.round(totalLightMs / totalSleepMs * 100) : 0;

        const lines = [
          `Sleep trend: ${shortDate(records[records.length - 1].start)} – ${shortDate(records[0].start)} (${count} days)`,
          "",
          `Avg hours: ${avgSleepH}h`,
          `Avg performance: ${avgPerf}% | Efficiency: ${avgEff}% | Consistency: ${avgConsist}%`,
          `Avg stages: Light ${avgLightPct}% | Deep ${avgDeepPct}% | REM ${avgRemPct}%`,
          "",
          "Daily:",
          ...dailyLines,
        ];

        // Pattern detection
        const patterns: string[] = [];
        const perfs = records.filter((r: any) => r.score?.sleep_performance_percentage != null)
          .map((r: any) => r.score.sleep_performance_percentage);
        const lowPerfDays = perfs.filter((p: number) => p < 70).length;
        if (lowPerfDays >= 3) patterns.push(`Sleep performance below 70% on ${lowPerfDays} of ${count} nights.`);

        if (avgDeepPct < 15) patterns.push(`Deep sleep averaging only ${avgDeepPct}% — below typical 15-20% range.`);

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
