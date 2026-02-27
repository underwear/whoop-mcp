import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WhoopClient } from "./whoop-client";
import { registerOverviewTool } from "./tools/overview";
import { registerSleepTool } from "./tools/sleep";
import { registerRecoveryTool } from "./tools/recovery";
import { registerStrainTool } from "./tools/strain";
import { registerHealthspanTool } from "./tools/healthspan";
import { registerBodyTool } from "./tools/body";
import { registerJournalTool } from "./tools/journal";
import { registerCalendarTool } from "./tools/calendar";

export interface WhoopMcpServerConfig {
  email?: string;
  password?: string;
}

export function createWhoopMcpServer(config: WhoopMcpServerConfig) {
  const server = new McpServer({
    name: "whoop-mcp-server",
    version: "2.0.0",
  });

  const client = new WhoopClient(config);

  registerOverviewTool(server, client);
  registerSleepTool(server, client);
  registerRecoveryTool(server, client);
  registerStrainTool(server, client);
  registerHealthspanTool(server, client);
  registerBodyTool(server, client);
  registerJournalTool(server, client);
  registerCalendarTool(server, client);

  return server;
}
