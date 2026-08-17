import { cleanText, json, requireAdmin, sql } from "./_shared.js";
import { ensureSchema } from "./_schema.js";
import { buildSessionRows, calculateKpis } from "../lib/kpi.js";

function csvEscape(value) { const text = typeof value === "object" && value !== null ? JSON.stringify(value) : String(value ?? ""); return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }
function toCsv(rows) { if (!rows.length) return ""; const headers = Object.keys(rows[0]); return `\uFEFF${headers.join(",")}\n${rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")).join("\n")}`; }
function validVersion(value) { return ["all", "v1", "v2"].includes(value) ? value : "all"; }

async function loadData(version, from, to) {
  const sessions = await sql`SELECT session_id, anonymous_user_id, app_version, started_at, last_active_at, device_type FROM sessions WHERE (${version} = 'all' OR app_version = ${version}) AND started_at >= ${from}::timestamptz AND started_at < (${to}::date + INTERVAL '1 day') ORDER BY started_at DESC`;
  const queries = await sql`SELECT id, session_id, app_version, queried_at, target_date, regions, region_count, result_success, api_elapsed_ms, api_error FROM weather_queries WHERE (${version} = 'all' OR app_version = ${version}) AND queried_at >= ${from}::timestamptz AND queried_at < (${to}::date + INTERVAL '1 day') ORDER BY queried_at DESC`;
  const events = await sql`SELECT id, session_id, app_version, event_name, created_at, metadata FROM events WHERE (${version} = 'all' OR app_version = ${version}) AND created_at >= ${from}::timestamptz AND created_at < (${to}::date + INTERVAL '1 day') ORDER BY created_at DESC`;
  return { sessions, queries, events };
}

export default async (request) => {
  if (!requireAdmin(request)) return json({ error: "Unauthorized" }, 401);
  try {
    await ensureSchema();
    const url = new URL(request.url); const action = url.searchParams.get("action") || "dashboard";
    const version = validVersion(url.searchParams.get("version") || "all");
    const from = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("from") || "") ? url.searchParams.get("from") : "2000-01-01";
    const to = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("to") || "") ? url.searchParams.get("to") : "2999-12-31";

    if (action === "timeline") {
      const sessionId = cleanText(url.searchParams.get("session_id"), 100);
      const events = await sql`SELECT event_name, created_at, metadata FROM events WHERE session_id = ${sessionId} ORDER BY created_at ASC`;
      return json({ events });
    }

    const data = await loadData(version, from, to);
    if (action === "csv") {
      const table = url.searchParams.get("table"); let rows;
      if (table === "sessions") rows = data.sessions;
      else if (table === "weather_queries") rows = data.queries;
      else if (table === "events") rows = data.events;
      else if (table === "kpi_summary") {
        const comparisonData = version === "all" ? data : await loadData("all", from, to);
        rows = ["v1", "v2"].flatMap((appVersion) => {
          const scoped = { sessions: comparisonData.sessions.filter((row) => row.app_version === appVersion), queries: comparisonData.queries.filter((row) => row.app_version === appVersion), events: comparisonData.events.filter((row) => row.app_version === appVersion) };
          const kpi = calculateKpis(scoped);
          return [
            { app_version: appVersion, kpi: "multi_region_rate", numerator: kpi.multiRegion.numerator, denominator: kpi.multiRegion.denominator, rate: kpi.multiRegion.rate },
            { app_version: appVersion, kpi: "chart_open_rate", numerator: kpi.chartOpen.numerator, denominator: kpi.chartOpen.denominator, rate: kpi.chartOpen.rate },
            { app_version: appVersion, kpi: "date_change_rate", numerator: kpi.dateChange.numerator, denominator: kpi.dateChange.denominator, rate: kpi.dateChange.rate },
          ];
        });
      } else return json({ error: "Unknown CSV" }, 400);
      return new Response(toCsv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${table}.csv"`, "Cache-Control": "no-store" } });
    }

    const comparisonData = version === "all" ? data : await loadData("all", from, to);
    const comparison = {};
    for (const appVersion of ["v1", "v2"]) comparison[appVersion] = calculateKpis({ sessions: comparisonData.sessions.filter((row) => row.app_version === appVersion), queries: comparisonData.queries.filter((row) => row.app_version === appVersion), events: comparisonData.events.filter((row) => row.app_version === appVersion) });
    return json({ kpis: calculateKpis(data), comparison, sessions: buildSessionRows(data).slice(0, 200) });
  } catch (error) { console.error("admin failure", error); return json({ error: "Dashboard unavailable" }, 503); }
};
