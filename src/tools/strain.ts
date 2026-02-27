import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WhoopClient } from "../whoop-client";
import { today, num, msToHours, toolResult, toolError, shortDate } from "./helpers";

function formatZones(z: any): string {
  if (!z) return "";
  const total = (z.zone_zero_milli || 0) + (z.zone_one_milli || 0) + (z.zone_two_milli || 0) +
    (z.zone_three_milli || 0) + (z.zone_four_milli || 0) + (z.zone_five_milli || 0);
  if (total === 0) return "";
  const p = (ms: number) => Math.round(ms / total * 100);
  return `Z0-1: ${p(z.zone_zero_milli + z.zone_one_milli)}% | Z2-3: ${p(z.zone_two_milli + z.zone_three_milli)}% | Z4-5: ${p(z.zone_four_milli + z.zone_five_milli)}%`;
}

function formatZonesDetailed(z: any): string {
  if (!z) return "";
  return [
    `  Z0: ${msToHours(z.zone_zero_milli || 0)}`,
    `  Z1: ${msToHours(z.zone_one_milli || 0)}`,
    `  Z2: ${msToHours(z.zone_two_milli || 0)}`,
    `  Z3: ${msToHours(z.zone_three_milli || 0)}`,
    `  Z4: ${msToHours(z.zone_four_milli || 0)}`,
    `  Z5: ${msToHours(z.zone_five_milli || 0)}`,
  ].join("\n");
}

export function registerStrainTool(server: McpServer, client: WhoopClient) {
  server.registerTool(
    "whoop_get_strain",
    {
      title: "WHOOP Strain",
      description:
        "Strain and workout analysis: daily exertion score, individual activities with HR zones, calories, and optimal strain targets. Supports multi-day trend analysis via the 'days' parameter.",
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
          // Single day: internal strain deep dive + v2 workouts
          const [deepDive, workouts, widget] = await Promise.all([
            client.getDeepDiveStrain(d).catch(() => null),
            client.getWorkoutsV2(10),
            client.getWidgetOverview().catch(() => null),
          ]);

          // Filter workouts to this date
          const dayStart = new Date(d + "T00:00:00").getTime();
          const dayEnd = dayStart + 86400000;
          const dayWorkouts = workouts.filter((w: any) => {
            const t = new Date(w.start).getTime();
            return t >= dayStart - 86400000 && t <= dayEnd; // generous range
          });

          // Extract strain score from deep dive
          let strainScore = "—";
          let optTarget = "";
          if (deepDive) {
            const scoreSection = deepDive.sections?.find((s: any) =>
              s.items?.some((i: any) => i.type === "SCORE_GAUGE")
            );
            const gauge = scoreSection?.items?.find((i: any) => i.type === "SCORE_GAUGE")?.content;
            if (gauge) {
              strainScore = gauge.score_display || "—";
              if (gauge.score_target != null) {
                const lo = gauge.lower_optimal_percentage;
                const hi = gauge.higher_optimal_percentage;
                if (lo != null && hi != null) {
                  optTarget = ` (optimal: ${num(lo * 21)}–${num(hi * 21)})`;
                }
              }
            }
          }

          // Fallback to widget
          if (strainScore === "—" && widget) {
            strainScore = widget.strain_string || "—";
            const opt = widget.optimal_strain_recommendation;
            if (opt) {
              optTarget = ` (optimal: ${num(opt.lower_optimal_strain)}–${num(opt.upper_optimal_strain)})`;
            }
          }

          const cals = widget?.calories_string || "—";

          const lines = [
            `Strain: ${shortDate(d + "T00:00:00")} — ${strainScore}${optTarget}`,
            `Calories: ${cals}`,
          ];

          if (dayWorkouts.length > 0) {
            lines.push("", "Activities:");
            for (const w of dayWorkouts) {
              const s = w.score || {};
              const duration = w.start && w.end
                ? msToHours(new Date(w.end).getTime() - new Date(w.start).getTime())
                : "—";
              lines.push(
                `  ${w.sport_name} — strain ${num(s.strain)}, avg HR ${s.average_heart_rate || "—"}, max HR ${s.max_heart_rate || "—"}, ${duration}, ${Math.round((s.kilojoule || 0) / 4.184)} kcal`
              );

              if (det === "full" && s.zone_durations) {
                lines.push(`    HR zones: ${formatZones(s.zone_durations)}`);
                if (s.distance_meter) lines.push(`    Distance: ${(s.distance_meter / 1000).toFixed(1)}km`);
              }
            }
          }

          // Coach insight from deep dive
          if (det === "full" && deepDive) {
            const contribSection = deepDive.sections?.find((s: any) =>
              s.items?.some((i: any) => i.type === "CONTRIBUTORS_TILE")
            );
            const tile = contribSection?.items?.find((i: any) => i.type === "CONTRIBUTORS_TILE")?.content;

            if (tile?.metrics) {
              lines.push("", "Contributors (vs 30-day baseline):");
              for (const m of tile.metrics) {
                lines.push(`  ${m.title}: ${m.status} (baseline: ${m.status_subtitle})`);
              }
            }

            const insight = tile?.footer?.items?.find((i: any) => i.type === "WHOOP_COACH_VOW")?.content?.vow;
            if (insight) lines.push("", `Coach insight: ${insight}`);
          }

          return toolResult(lines.join("\n"));
        }

        // Multi-day trend
        const [cycles, workouts] = await Promise.all([
          client.getCyclesV2(n),
          client.getWorkoutsV2(n * 3), // rough estimate
        ]);

        if (!cycles.length) return toolResult("No strain data available.");

        let totalStrain = 0, count = 0;
        const dailyLines: string[] = [];

        for (const c of cycles) {
          const s = c.score || {};
          if (s.strain == null) continue;
          count++;
          totalStrain += s.strain;

          // Find workouts for this cycle
          const cycleStart = new Date(c.start).getTime();
          const cycleEnd = c.end ? new Date(c.end).getTime() : Date.now();
          const cycleWorkouts = workouts.filter((w: any) => {
            const t = new Date(w.start).getTime();
            return t >= cycleStart && t <= cycleEnd;
          });

          const workoutNames = cycleWorkouts.map((w: any) => w.sport_name).join(", ") || "rest";
          dailyLines.push(`  ${shortDate(c.start)}: strain ${num(s.strain)} | ${workoutNames}`);
        }

        if (count === 0) return toolResult("No scored cycles in this range.");

        const avgStrain = (totalStrain / count).toFixed(1);
        const strains = cycles.filter((c: any) => c.score?.strain != null).map((c: any) => c.score.strain);
        const maxStrain = num(Math.max(...strains));
        const minStrain = num(Math.min(...strains));

        const lines = [
          `Strain trend: ${shortDate(cycles[cycles.length - 1].start)} – ${shortDate(cycles[0].start)} (${count} days)`,
          "",
          `Avg daily strain: ${avgStrain} | Range: ${minStrain}–${maxStrain}`,
          `Total workouts: ${workouts.length}`,
          "",
          "Daily:",
          ...dailyLines,
        ];

        // Patterns
        const patterns: string[] = [];
        let consecHigh = 0, maxConsecHigh = 0;
        for (const s of strains) {
          if (s > 14) { consecHigh++; maxConsecHigh = Math.max(maxConsecHigh, consecHigh); }
          else consecHigh = 0;
        }
        if (maxConsecHigh >= 3) patterns.push(`${maxConsecHigh} consecutive high-strain days (>14). Consider active recovery.`);

        const restDays = strains.filter((s: number) => s < 4).length;
        if (restDays === 0 && count >= 7) patterns.push("No rest days in this period.");

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
