import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WhoopClient } from "../whoop-client";
import { today, recoveryEmoji, toolResult, toolError } from "./helpers";

export function registerCalendarTool(server: McpServer, client: WhoopClient) {
  server.registerTool(
    "whoop_get_calendar",
    {
      title: "WHOOP Calendar",
      description:
        "Monthly recovery calendar showing daily recovery states (green/yellow/red) with weekly patterns. Use for monthly reviews and spotting weekday patterns.",
      inputSchema: {
        month: z.string().optional().describe("Month as YYYY-MM (default: current month)"),
      },
    },
    async ({ month }) => {
      try {
        // Build a date within the target month
        const targetMonth = month || today().substring(0, 7);
        const dateForApi = `${targetMonth}-15`;

        const data = await client.getRecoveryCalendar(dateForApi);

        const lines = [
          `Recovery calendar: ${data.calendar_title_display || targetMonth}`,
          "",
        ];

        // Build day map
        const days = data.days_of_month || [];
        const dayMap = new Map<number, { state: string; cycleId: number }>();

        for (const day of days) {
          const num = parseInt(day.date_value_display);
          if (day.has_data && !isNaN(num)) {
            dayMap.set(num, { state: day.day_state, cycleId: day.cycle_id });
          }
        }

        // Determine the month/year
        const [yearStr, monthStr] = targetMonth.split("-");
        const year = parseInt(yearStr!);
        const monthNum = parseInt(monthStr!);
        const daysInMonth = new Date(year, monthNum, 0).getDate();
        const firstDayOfWeek = new Date(year, monthNum - 1, 1).getDay(); // 0=Sun

        // Build weekly rows (Mon-Sun)
        const stateEmoji = (state: string) => {
          if (state === "HIGH_RECOVERY") return "🟢";
          if (state === "MEDIUM_RECOVERY") return "🟡";
          if (state === "LOW_RECOVERY") return "🔴";
          return "  ";
        };

        const stateAbbr = (state: string) => {
          if (state === "HIGH_RECOVERY") return "H";
          if (state === "MEDIUM_RECOVERY") return "M";
          if (state === "LOW_RECOVERY") return "L";
          return " ";
        };

        lines.push("Mon Tue Wed Thu Fri Sat Sun");
        lines.push("─── ─── ─── ─── ─── ─── ───");

        // Convert JS day (0=Sun) to Mon-based (0=Mon)
        const monBasedFirst = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

        let weekLine = "    ".repeat(monBasedFirst);
        let dayNum = 1;

        // Track stats per weekday (Mon=0 to Sun=6)
        const weekdayStats: { total: number; low: number; medium: number; high: number; count: number }[] =
          Array.from({ length: 7 }, () => ({ total: 0, low: 0, medium: 0, high: 0, count: 0 }));

        for (let i = monBasedFirst; dayNum <= daysInMonth; i++) {
          const d = dayMap.get(dayNum);
          const weekdayIdx = i % 7;

          if (d) {
            weekLine += `${stateEmoji(d.state)}${String(dayNum).padStart(2)} `;
            if (d.state === "HIGH_RECOVERY") weekdayStats[weekdayIdx]!.high++;
            if (d.state === "MEDIUM_RECOVERY") weekdayStats[weekdayIdx]!.medium++;
            if (d.state === "LOW_RECOVERY") weekdayStats[weekdayIdx]!.low++;
            weekdayStats[weekdayIdx]!.count++;
          } else {
            weekLine += ` ${String(dayNum).padStart(2)} `;
          }

          dayNum++;

          if (weekdayIdx === 6 || dayNum > daysInMonth) {
            lines.push(weekLine.trimEnd());
            weekLine = "";
          }
        }

        // Stats summary
        let greenCount = 0, yellowCount = 0, redCount = 0, totalDays = 0;
        for (const day of days) {
          if (!day.has_data) continue;
          totalDays++;
          if (day.day_state === "HIGH_RECOVERY") greenCount++;
          if (day.day_state === "MEDIUM_RECOVERY") yellowCount++;
          if (day.day_state === "LOW_RECOVERY") redCount++;
        }

        lines.push(
          "",
          `Summary: 🟢 ${greenCount} green | 🟡 ${yellowCount} yellow | 🔴 ${redCount} red (${totalDays} days)`
        );

        // Weekday patterns
        const weekdayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        const weekdayScores = weekdayStats.map((ws, i) => {
          if (ws.count === 0) return null;
          const score = (ws.high * 100 + ws.medium * 50 + ws.low * 17) / ws.count;
          return { name: weekdayNames[i]!, score: Math.round(score), count: ws.count, low: ws.low };
        }).filter(Boolean) as { name: string; score: number; count: number; low: number }[];

        if (weekdayScores.length >= 5) {
          const sorted = [...weekdayScores].sort((a, b) => a.score - b.score);
          const worst = sorted[0]!;
          const best = sorted[sorted.length - 1]!;

          if (best.score - worst.score > 15) {
            lines.push(
              "",
              "Weekday patterns:",
              `  Best: ${best.name} (avg recovery score ~${best.score})`,
              `  Worst: ${worst.name} (avg recovery score ~${worst.score})`,
            );
          }
        }

        return toolResult(lines.join("\n"));
      } catch (e: any) {
        return toolError(e.message);
      }
    }
  );
}
