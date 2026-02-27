import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WhoopClient } from "../whoop-client";
import { toolResult, toolError } from "./helpers";

export function registerJournalTool(server: McpServer, client: WhoopClient) {
  server.registerTool(
    "whoop_get_journal_insights",
    {
      title: "WHOOP Journal Insights",
      description:
        "Shows which logged behaviors (alcohol, supplements, workouts, etc.) correlate with better or worse recovery, based on WHOOP journal entries over the past 90 days. Use for behavior-change advice and pattern analysis.",
      inputSchema: {},
    },
    async () => {
      try {
        const data = await client.getBehaviorImpact();

        const lines = [
          "Journal behavior impact on recovery",
          `(${data.header?.last_refresh_text_display || ""})`,
          "",
        ];

        const positive: string[] = [];
        const negative: string[] = [];
        const insufficient: string[] = [];

        for (const tile of data.tiles || []) {
          if (tile.type === "IMPACT_TILE") {
            for (const card of tile.content?.impact_cards || []) {
              const name = card.impact_card_title_display || "?";
              const pctDisplay = card.impact_percentage_display || "";

              if (pctDisplay.startsWith("+")) {
                positive.push(`  ${name}: ${pctDisplay} recovery`);
              } else if (pctDisplay.startsWith("-")) {
                negative.push(`  ${name}: ${pctDisplay} recovery`);
              }
            }
          }
          if (tile.type === "INSUFFICIENT_IMPACT_TILE") {
            for (const card of tile.content?.impact_cards || []) {
              insufficient.push(card.impact_card_title_display || "?");
            }
          }
        }

        if (positive.length > 0) {
          lines.push("Helps recovery:");
          lines.push(...positive);
          lines.push("");
        }

        if (negative.length > 0) {
          lines.push("Hurts recovery:");
          lines.push(...negative);
          lines.push("");
        }

        if (insufficient.length > 0) {
          lines.push(`Need more data: ${insufficient.join(", ")}`);
        }

        if (positive.length === 0 && negative.length === 0) {
          lines.push("Not enough journal data yet. Keep logging to unlock insights.");
        }

        return toolResult(lines.join("\n"));
      } catch (e: any) {
        return toolError(e.message);
      }
    }
  );
}
