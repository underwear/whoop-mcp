import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WhoopClient } from "../whoop-client";
import { toolResult, toolError } from "./helpers";

export function registerBodyTool(server: McpServer, client: WhoopClient) {
  server.registerTool(
    "whoop_get_body",
    {
      title: "WHOOP Body",
      description:
        "Body measurements: height, weight, max heart rate. Static data, rarely changes. Use when contextualizing other metrics or when asked about body stats.",
      inputSchema: {},
    },
    async () => {
      try {
        const body = await client.getBodyMeasurements();

        const heightCm = Math.round(body.height_meter * 100);
        const bmi = body.weight_kilogram / (body.height_meter * body.height_meter);

        const lines = [
          "Body measurements",
          "",
          `Height: ${heightCm}cm`,
          `Weight: ${body.weight_kilogram}kg`,
          `BMI: ${bmi.toFixed(1)}`,
          `Max heart rate: ${body.max_heart_rate}bpm`,
        ];

        return toolResult(lines.join("\n"));
      } catch (e: any) {
        return toolError(e.message);
      }
    }
  );
}
