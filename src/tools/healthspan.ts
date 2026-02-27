import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WhoopClient } from "../whoop-client";
import { today, toolResult, toolError } from "./helpers";

export function registerHealthspanTool(server: McpServer, client: WhoopClient) {
  server.registerTool(
    "whoop_get_healthspan",
    {
      title: "WHOOP Healthspan",
      description:
        "Biological age (WHOOP Age), pace of aging, and long-term health markers. Use for monthly reviews and big-picture health tracking.",
      inputSchema: {
        detail: z.enum(["summary", "full"]).optional().describe("Detail level (default: summary)"),
      },
    },
    async ({ detail }) => {
      try {
        const det = detail || "summary";
        const d = today();

        const healthspan = await client.getHealthspan(d);
        const content = healthspan.unlocked_content;

        if (!content) return toolResult("Healthspan data not available (may still be calibrating).");

        const amoeba = content.whoop_age_amoeba;
        const prev = content.previous_whoop_age_amoeba;

        const lines = [
          "Healthspan",
          "",
          `WHOOP Age: ${amoeba.age_value_display} (${amoeba.age_subtitle_display})`,
          `Pace of aging: ${amoeba.pace_of_aging_display} (${amoeba.pace_of_aging_subtitle_display})`,
        ];

        if (amoeba.is_calibrating) {
          lines.push("Status: still calibrating");
        }

        if (prev && !prev.is_calibrating) {
          lines.push(
            "",
            `Previous period: WHOOP Age ${prev.age_value_display}, pace ${prev.pace_of_aging_display}`
          );
        }

        if (content.date_picker) {
          lines.push(`Period: ${content.date_picker.current_date_range_display}`);
        }

        // Full mode: add health tab data
        if (det === "full") {
          try {
            const healthTab = await client.getHealthTab();
            if (healthTab?.sections) {
              lines.push("", "Health metrics:");

              for (const section of healthTab.sections) {
                for (const item of section.items || []) {
                  if (item.type === "HEALTHSPAN_METRIC_CARD" || item.type === "HEALTH_METRIC") {
                    const c = item.content || {};
                    lines.push(`  ${c.title || c.metric_title_display || "?"}: ${c.value_display || c.score_display || "—"}`);
                  }
                  if (item.type === "HEALTHSPAN_HERO_METRIC") {
                    for (const sub of item.content?.items || []) {
                      if (sub.type === "WHOOP_AGE_AMOEBA") continue;
                      const c = sub.content || {};
                      if (c.title || c.metric_title_display) {
                        lines.push(`  ${c.title || c.metric_title_display}: ${c.value_display || c.score_display || "—"}`);
                      }
                    }
                  }
                  if (item.type === "HEALTH_METRIC_LIST") {
                    for (const metric of item.content?.metrics || []) {
                      lines.push(`  ${metric.title_display || metric.title}: ${metric.value_display || "—"} ${metric.subtitle_display || ""}`);
                    }
                  }
                }
              }
            }
          } catch {
            // health tab not critical
          }
        }

        return toolResult(lines.join("\n"));
      } catch (e: any) {
        return toolError(e.message);
      }
    }
  );
}
