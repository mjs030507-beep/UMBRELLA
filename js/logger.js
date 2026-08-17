const SESSION_KEY = "umbrella_session";
const SESSION_START_KEY = "umbrella_session_started_at";
const LAST_EVENT_KEY = "umbrella_last_event_at";

function sessionId() {
  let value = sessionStorage.getItem(SESSION_KEY);
  if (!value) { value = crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10); sessionStorage.setItem(SESSION_KEY, value); }
  return value;
}

function initAnalytics() {
  if (!sessionStorage.getItem(SESSION_START_KEY)) sessionStorage.setItem(SESSION_START_KEY, String(Date.now()));
  trackEvent("app_open", { saved_region_count: getSavedCount() });
}

function getSavedCount() {
  try { return JSON.parse(localStorage.getItem("umbrella_saved_regions_v2") || "[]").length; } catch { return 0; }
}

function trackEvent(name, parameters = {}) {
  const now = Date.now();
  const lastEventAt = Number(sessionStorage.getItem(LAST_EVENT_KEY) || now);
  sessionStorage.setItem(LAST_EVENT_KEY, String(now));
  const payload = { session_id: sessionId(), dwell_sec: Math.round((now - lastEventAt) / 100) / 10, ...parameters };
  if (typeof window.gtag === "function") window.gtag("event", name, payload);
  else { window.dataLayer = window.dataLayer || []; window.dataLayer.push({ event: name, ...payload }); }
  try {
    const logs = JSON.parse(localStorage.getItem("umbrella_event_log_v2") || "[]");
    logs.push({ event_name: name, event_time: new Date().toISOString(), ...payload });
    localStorage.setItem("umbrella_event_log_v2", JSON.stringify(logs.slice(-200)));
  } catch (error) { console.warn("이벤트 로그 저장 실패", error); }
}

function trackFirstResult(details) {
  if (sessionStorage.getItem("umbrella_result_recorded")) return;
  const start = Number(sessionStorage.getItem(SESSION_START_KEY) || Date.now());
  sessionStorage.setItem("umbrella_result_recorded", "1");
  trackEvent("weather_result_view", { ...details, ttfd_sec: Math.round((Date.now() - start) / 100) / 10 });
}
