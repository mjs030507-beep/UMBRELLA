const ANALYTICS_KEYS = {
  anonymousUserId: "umbrella_anonymous_user_id",
  sessionId: "umbrella_session_id",
  sessionStartedAt: "umbrella_session_started_at",
  lastEventAt: "umbrella_last_event_at",
  localQueue: "umbrella_telemetry_queue",
};

const analyticsConfig = { appVersion: "v2", gaMeasurementId: "" };
const GA_EVENTS = new Set(["region_selected", "region_removed", "weather_search", "weather_result_view", "detail_chart_open", "date_change", "api_error"]);

function makeId() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function anonymousUserId() { let value = localStorage.getItem(ANALYTICS_KEYS.anonymousUserId); if (!value) { value = makeId(); localStorage.setItem(ANALYTICS_KEYS.anonymousUserId, value); } return value; }
function sessionId() { let value = sessionStorage.getItem(ANALYTICS_KEYS.sessionId); if (!value) { value = makeId(); sessionStorage.setItem(ANALYTICS_KEYS.sessionId, value); } return value; }
function deviceType() { if (matchMedia("(max-width: 767px)").matches) return "mobile"; if (matchMedia("(max-width: 1024px)").matches) return "tablet"; return "desktop"; }
function getSavedCount() { try { return JSON.parse(localStorage.getItem("umbrella_saved_regions_v2") || "[]").length; } catch { return 0; } }

async function loadAnalyticsConfig() {
  try { const response = await fetch("/.netlify/functions/public-config"); if (response.ok) Object.assign(analyticsConfig, await response.json()); }
  catch (error) { console.info("로컬 분석 설정을 사용합니다.", error); }
  if (analyticsConfig.gaMeasurementId) initGa4(analyticsConfig.gaMeasurementId);
}
function initGa4(measurementId) {
  if (document.querySelector(`script[data-ga-id="${measurementId}"]`)) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag("js", new Date()); window.gtag("config", measurementId, { send_page_view: true });
  const script = document.createElement("script"); script.async = true; script.dataset.gaId = measurementId;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`; document.head.appendChild(script);
}
async function initAnalytics() {
  const now = Date.now();
  if (!sessionStorage.getItem(ANALYTICS_KEYS.sessionStartedAt)) sessionStorage.setItem(ANALYTICS_KEYS.sessionStartedAt, String(now));
  sessionStorage.setItem(ANALYTICS_KEYS.lastEventAt, String(now));
  await loadAnalyticsConfig(); trackEvent("app_open", { saved_region_count: getSavedCount(), device_type: deviceType() }); flushTelemetryQueue();
}
function gaParameters(parameters) {
  const allowed = ["app_version", "region_count", "target_date", "api_elapsed_ms", "error_type", "previous_date", "selected_date"];
  return Object.fromEntries(allowed.filter((key) => parameters[key] !== undefined && parameters[key] !== null).map((key) => [key, parameters[key]]));
}
function eventEnvelope(eventName, metadata = {}) {
  const now = Date.now(); const previous = Number(sessionStorage.getItem(ANALYTICS_KEYS.lastEventAt) || now);
  sessionStorage.setItem(ANALYTICS_KEYS.lastEventAt, String(now));
  return { type: "event", anonymous_user_id: anonymousUserId(), session_id: sessionId(), app_version: analyticsConfig.appVersion, device_type: deviceType(), event_name: eventName, occurred_at: new Date(now).toISOString(), metadata: { ...metadata, dwell_sec: Math.round((now - previous) / 100) / 10 } };
}
function trackEvent(eventName, metadata = {}) {
  const envelope = eventEnvelope(eventName, metadata);
  if (GA_EVENTS.has(eventName) && typeof window.gtag === "function") window.gtag("event", eventName, gaParameters({ ...metadata, app_version: analyticsConfig.appVersion }));
  sendTelemetry(envelope); return envelope;
}
function recordWeatherSearch({ targetDate, regions }) {
  const queryId = makeId(); const metadata = { target_date: targetDate, region_count: regions.length };
  if (typeof window.gtag === "function") window.gtag("event", "weather_search", gaParameters({ ...metadata, app_version: analyticsConfig.appVersion }));
  const ready = sendTelemetry({ type: "weather_query_start", query_id: queryId, anonymous_user_id: anonymousUserId(), session_id: sessionId(), app_version: analyticsConfig.appVersion, device_type: deviceType(), occurred_at: new Date().toISOString(), target_date: targetDate, regions: regions.map((region) => region.name), region_count: regions.length });
  return { id: queryId, ready };
}
async function recordWeatherResult(query, { targetDate, regionCount, success, apiElapsedMs, errorType = null }) {
  await query.ready;
  const eventName = success ? "weather_result_view" : "api_error";
  const metadata = { target_date: targetDate, region_count: regionCount, api_elapsed_ms: apiElapsedMs, error_type: errorType };
  if (typeof window.gtag === "function") window.gtag("event", eventName, gaParameters({ ...metadata, app_version: analyticsConfig.appVersion }));
  sendTelemetry({ type: "weather_query_result", query_id: query.id, anonymous_user_id: anonymousUserId(), session_id: sessionId(), app_version: analyticsConfig.appVersion, device_type: deviceType(), occurred_at: new Date().toISOString(), result_success: success, api_elapsed_ms: apiElapsedMs, api_error: errorType, metadata });
}
async function sendTelemetry(payload, queueOnFailure = true) {
  try { const response = await fetch("/.netlify/functions/telemetry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), keepalive: true }); if (!response.ok) throw new Error(`telemetry ${response.status}`); }
  catch (error) { if (queueOnFailure) queueTelemetry(payload); console.info("행동 로그를 임시 보관했습니다.", error); }
}
function queueTelemetry(payload) { try { const queue = JSON.parse(localStorage.getItem(ANALYTICS_KEYS.localQueue) || "[]"); queue.push(payload); localStorage.setItem(ANALYTICS_KEYS.localQueue, JSON.stringify(queue.slice(-100))); } catch (error) { console.warn("행동 로그 임시 보관 실패", error); } }
async function flushTelemetryQueue() { let queue; try { queue = JSON.parse(localStorage.getItem(ANALYTICS_KEYS.localQueue) || "[]"); } catch { return; } if (!queue.length) return; localStorage.removeItem(ANALYTICS_KEYS.localQueue); for (const payload of queue) await sendTelemetry(payload, true); }
