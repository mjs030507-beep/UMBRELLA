import { cleanText, json, safeMetadata, sql, upsertSession, validDate, validEnvelope } from "./_shared.js";
import { ensureSchema } from "./_schema.js";

const ALLOWED_EVENTS = new Set(["app_open", "region_selected", "region_removed", "weather_search", "weather_result_view", "detail_chart_open", "date_change", "api_error", "region_view", "temporary_region_add", "feedback_open", "feedback_submit"]);

export default async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!validEnvelope(body)) return json({ error: "Invalid identifiers" }, 400);

  try {
    await ensureSchema();
    await upsertSession(body);
    if (body.type === "event") {
      const eventName = cleanText(body.event_name, 60);
      if (!ALLOWED_EVENTS.has(eventName)) return json({ error: "Unsupported event" }, 400);
      await sql`INSERT INTO events (anonymous_user_id, session_id, app_version, event_name, created_at, metadata) VALUES (${cleanText(body.anonymous_user_id, 100)}, ${cleanText(body.session_id, 100)}, ${cleanText(body.app_version, 30)}, ${eventName}, ${body.occurred_at || new Date().toISOString()}, ${JSON.stringify(safeMetadata(body.metadata))}::jsonb)`;
      return json({ ok: true }, 201);
    }

    if (body.type === "weather_query_start") {
      if (!validDate(body.target_date) || !Array.isArray(body.regions)) return json({ error: "Invalid weather query" }, 400);
      const queryId = cleanText(body.query_id, 100);
      const regionCount = Math.max(0, Math.min(20, Number(body.region_count) || 0));
      const regions = body.regions.slice(0, 20).map((name) => cleanText(name, 200));
      await sql.transaction([
        sql`INSERT INTO weather_queries (id, anonymous_user_id, session_id, app_version, queried_at, target_date, regions, region_count) VALUES (${queryId}, ${cleanText(body.anonymous_user_id, 100)}, ${cleanText(body.session_id, 100)}, ${cleanText(body.app_version, 30)}, ${body.occurred_at || new Date().toISOString()}, ${body.target_date}, ${JSON.stringify(regions)}::jsonb, ${regionCount}) ON CONFLICT (id) DO NOTHING`,
        sql`INSERT INTO events (anonymous_user_id, session_id, app_version, event_name, created_at, metadata) VALUES (${cleanText(body.anonymous_user_id, 100)}, ${cleanText(body.session_id, 100)}, ${cleanText(body.app_version, 30)}, 'weather_search', ${body.occurred_at || new Date().toISOString()}, ${JSON.stringify({ target_date: body.target_date, region_count: regionCount })}::jsonb)`,
      ]);
      return json({ ok: true, query_id: queryId }, 201);
    }

    if (body.type === "weather_query_result") {
      const queryId = cleanText(body.query_id, 100); const success = body.result_success === true;
      const elapsed = Number.isFinite(Number(body.api_elapsed_ms)) ? Math.max(0, Math.round(Number(body.api_elapsed_ms))) : null;
      const error = body.api_error ? cleanText(body.api_error, 300) : null;
      const eventName = success ? "weather_result_view" : "api_error";
      await sql.transaction([
        sql`UPDATE weather_queries SET result_success = ${success}, api_elapsed_ms = ${elapsed}, api_error = ${error} WHERE id = ${queryId} AND session_id = ${cleanText(body.session_id, 100)}`,
        sql`INSERT INTO events (anonymous_user_id, session_id, app_version, event_name, created_at, metadata) VALUES (${cleanText(body.anonymous_user_id, 100)}, ${cleanText(body.session_id, 100)}, ${cleanText(body.app_version, 30)}, ${eventName}, ${body.occurred_at || new Date().toISOString()}, ${JSON.stringify(safeMetadata(body.metadata))}::jsonb)`,
      ]);
      return json({ ok: true }, 201);
    }
    return json({ error: "Unsupported telemetry type" }, 400);
  } catch (error) {
    console.error("telemetry failure", error);
    return json({ error: "Telemetry unavailable" }, 503);
  }
};
