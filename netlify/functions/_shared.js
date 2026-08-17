import { neon } from "@netlify/neon";

export const sql = neon();
export const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });
export const cleanText = (value, max = 200) => String(value ?? "").slice(0, max);
export const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

export function validEnvelope(body) {
  return body && cleanText(body.anonymous_user_id, 100) && cleanText(body.session_id, 100) && cleanText(body.app_version, 30);
}

export function requireAdmin(request) {
  const expected = process.env.ADMIN_SECRET;
  const supplied = request.headers.get("x-admin-secret");
  return Boolean(expected && supplied && expected.length >= 16 && supplied === expected);
}

export async function upsertSession(body) {
  const occurredAt = body.occurred_at || new Date().toISOString();
  await sql`
    INSERT INTO sessions (anonymous_user_id, session_id, app_version, started_at, last_active_at, device_type)
    VALUES (${cleanText(body.anonymous_user_id, 100)}, ${cleanText(body.session_id, 100)}, ${cleanText(body.app_version, 30)}, ${occurredAt}, ${occurredAt}, ${cleanText(body.device_type || "unknown", 20)})
    ON CONFLICT (session_id) DO UPDATE SET last_active_at = EXCLUDED.last_active_at
  `;
}

export function safeMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  return Object.fromEntries(Object.entries(metadata).slice(0, 30).map(([key, value]) => [cleanText(key, 60), typeof value === "string" ? cleanText(value, 500) : value]));
}
