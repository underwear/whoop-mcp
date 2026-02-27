import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WhoopClient } from "../whoop-client";
import { today, num, pct, toolResult, toolError } from "./helpers";

export function registerOverviewTool(server: McpServer, client: WhoopClient) {
  server.registerTool(
    "whoop_get_overview",
    {
      title: "WHOOP Overview",
      description:
        "Daily health dashboard: recovery, sleep, strain scores, today's activities, and optimal strain target. Use as the default starting point for any health check; use domain-specific tools (sleep/recovery/strain) for deeper analysis.",
      inputSchema: {
        date: z.string().optional().describe("Date YYYY-MM-DD (default: today)"),
      },
    },
    async ({ date }) => {
      try {
        const d = date || today();

        // Fetch widget (compact scores + optimal strain) and home (activities, stats)
        const [widget, home] = await Promise.all([
          client.getWidgetOverview(),
          client.getHome(d),
        ]);

        const live = home.metadata?.whoop_live_metadata;
        const cycle = home.metadata?.cycle_metadata;

        // Extract activities from overview pillar
        const activities: string[] = [];
        const overviewPillar = home.pillars?.find((p: any) => p.type === "OVERVIEW");
        if (overviewPillar) {
          for (const section of overviewPillar.sections || []) {
            for (const item of section.items || []) {
              if (item.type === "ITEMS_CARD") {
                for (const sub of item.content?.items || []) {
                  if (sub.type === "ACTIVITY") {
                    const c = sub.content;
                    activities.push(
                      `  ${c.title} — strain ${c.score_display}, ${c.start_time_text}–${c.end_time_text}`
                    );
                  }
                }
              }
            }
          }
        }

        // Extract key statistics
        const stats: string[] = [];
        if (overviewPillar) {
          for (const section of overviewPillar.sections || []) {
            for (const item of section.items || []) {
              if (item.type === "KEY_STATISTIC") {
                const c = item.content;
                stats.push(
                  `  ${c.title}: ${c.current_value_display} (30d avg: ${c.thirty_day_value_display})`
                );
              }
            }
          }
        }

        // Optimal strain
        const optStrain = widget.optimal_strain_recommendation;
        const optLine = optStrain
          ? `Optimal strain today: ${num(optStrain.lower_optimal_strain)}–${num(optStrain.upper_optimal_strain)} (target: ${num(optStrain.optimal_strain)})`
          : "";

        const sleepHours = live ? (live.ms_of_sleep / 3600000).toFixed(1) : "—";

        const lines = [
          `WHOOP Overview — ${cycle?.cycle_date_display || d}`,
          "",
          `Recovery: ${widget.recovery_string} (${widget.recovery_state?.toLowerCase()})`,
          `Sleep: ${widget.sleep_string} performance | ${sleepHours}h`,
          `Strain: ${widget.strain_string} | Calories: ${widget.calories_string}`,
          `HRV: ${widget.hrv_string}ms`,
        ];

        if (optLine) lines.push(optLine);

        if (activities.length > 0) {
          lines.push("", "Activities:");
          lines.push(...activities);
        }

        if (stats.length > 0) {
          lines.push("", "Key stats (vs 30-day avg):");
          lines.push(...stats);
        }

        return toolResult(lines.join("\n"));
      } catch (e: any) {
        return toolError(e.message);
      }
    }
  );
}
