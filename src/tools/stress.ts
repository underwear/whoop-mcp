import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WhoopClient } from "../whoop-client";
import { toolResult, toolError } from "./helpers";

// The stress-bff response is a large UI (BFF) blob; pull just the meaningful
// fields. Paths verified against live data 15.07.26.
function pick(dto: any) {
  const g = dto?.gauge || {};
  const graph = dto?.stress_graph || {};
  return {
    score: g.gauge_score_display ?? graph.stress_graph_score ?? null, // "1.8"
    min: g.gauge_min_display ?? "0.0",
    max: g.gauge_max_display ?? "3.0",
    label: g.gauge_subtext_display ?? graph.stress_graph_label ?? null, // LOW/MEDIUM/HIGH
    state: dto?.stress_state ?? graph.stress_graph_state ?? null,       // BALANCED/…
    updated: dto?.last_updated_display ?? null,                          // "4:57 PM"
  };
}

export function registerStressTool(server: McpServer, client: WhoopClient) {
  server.registerTool(
    "whoop_get_stress",
    {
      title: "WHOOP Stress Monitor",
      description:
        "Real-time Stress Monitor: current stress score on a 0.0–3.0 scale with label " +
        "(LOW/MEDIUM/HIGH), balance state, and last-updated time. Driven by live HR/HRV.",
      inputSchema: {
        timestamp: z
          .string()
          .optional()
          .describe("ISO timestamp to query (default: now)"),
      },
    },
    async ({ timestamp }) => {
      try {
        const dto = await client.getStress(timestamp);
        const s = pick(dto);
        if (s.score == null) return toolResult("Stress Monitor data not available right now.");
        const lines = [
          `Stress Monitor: ${s.score} / ${s.max}${s.label ? ` — ${s.label}` : ""}`,
          s.state ? `State: ${s.state}` : "",
          s.updated ? `Last updated: ${s.updated}` : "",
        ].filter(Boolean);
        return toolResult(lines.join("\n"));
      } catch (e: any) {
        return toolError(e.message);
      }
    }
  );
}
