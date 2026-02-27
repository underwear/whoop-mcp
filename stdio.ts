import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createWhoopMcpServer } from "./src/server";

const email = process.env.WHOOP_EMAIL;
const password = process.env.WHOOP_PASSWORD;

if (!email || !password) {
  console.error("WHOOP_EMAIL and WHOOP_PASSWORD environment variables are required");
  process.exit(1);
}

const server = createWhoopMcpServer({ email, password });
const transport = new StdioServerTransport();

await server.connect(transport);
