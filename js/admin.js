const ADMIN_SECRET_KEY = "umbrella_admin_secret";
const byId = (id) => document.getElementById(id);
const fmt = new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" });
const escapeAdmin = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));

document.addEventListener("DOMContentLoaded", () => {
  bindAdminEvents();
  if (sessionStorage.getItem(ADMIN_SECRET_KEY)) openDashboard();
  if (window.lucide) window.lucide.createIcons();
});

function bindAdminEvents() {
  byId("login-form").addEventListener("submit", async (event) => { event.preventDefault(); sessionStorage.setItem(ADMIN_SECRET_KEY, byId("admin-secret").value); await openDashboard(); });
  byId("logout").addEventListener("click", () => { sessionStorage.removeItem(ADMIN_SECRET_KEY); location.reload(); });
  byId("apply-filter").addEventListener("click", loadDashboard);
  byId("csv-toggle").addEventListener("click", () => byId("csv-options").classList.toggle("hidden"));
  document.querySelectorAll("[data-table]").forEach((button) => button.addEventListener("click", () => downloadCsv(button.dataset.table)));
  byId("timeline-close").addEventListener("click", () => byId("timeline-dialog").close());
}

function queryParams(extra = {}) {
  const params = new URLSearchParams({ version: byId("version-filter").value, ...extra });
  if (byId("from-date").value) params.set("from", byId("from-date").value);
  if (byId("to-date").value) params.set("to", byId("to-date").value);
  return params;
}
async function adminFetch(params) {
  const response = await fetch(`/.netlify/functions/admin-data?${params}`, { headers: { "x-admin-secret": sessionStorage.getItem(ADMIN_SECRET_KEY) || "" } });
  if (response.status === 401) throw new Error("unauthorized");
  if (!response.ok) throw new Error("dashboard");
  return response;
}
async function openDashboard() {
  try { await loadDashboard(); byId("admin-login").classList.add("hidden"); byId("dashboard").classList.remove("hidden"); byId("login-error").classList.add("hidden"); }
  catch (error) { sessionStorage.removeItem(ADMIN_SECRET_KEY); byId("login-error").classList.remove("hidden"); }
}
async function loadDashboard() {
  const response = await adminFetch(queryParams()); const data = await response.json();
  renderKpis(data.kpis); renderComparison(data.comparison); renderSessions(data.sessions);
  byId("dashboard-updated").textContent = `${fmt.format(new Date())} 갱신`;
}
function renderKpis(kpis) {
  const cards = [
    ["다지역 활용률", kpis.multiRegion, "2개 이상 지역을 조회한 세션"],
    ["상세 그래프 열람률", kpis.chartOpen, "그래프 열람 세션"],
    ["날짜 변경률", kpis.dateChange, "날짜 변경 세션"],
  ];
  byId("kpi-cards").innerHTML = cards.map(([label, value, detail]) => `<article class="kpi-card"><p>${label}</p><strong>${value.rate.toFixed(1)}%</strong><span>${detail} ${value.numerator} / 조회 세션 ${value.denominator}</span></article>`).join("");
  const totals = [["전체 고유 세션", kpis.totals.uniqueSessions], ["날씨 조회 세션", kpis.totals.querySessions], ["총 날씨 조회", kpis.totals.weatherQueries], ["평균 선택 지역", kpis.totals.averageRegions], ["그래프 클릭", kpis.totals.chartClicks], ["날짜 변경", kpis.totals.dateChanges], ["평균 날짜 변경", kpis.totals.averageDateChanges], ["API 정상 조회율", `${kpis.totals.apiSuccessRate.toFixed(1)}%`], ["API 오류", kpis.totals.apiErrors]];
  byId("support-metrics").innerHTML = totals.map(([label, value]) => `<div class="support-metric"><span>${label}</span><strong>${value}</strong></div>`).join("");
}
function renderComparison(comparison) {
  const rows = [["다지역 활용률", "multiRegion"], ["상세 그래프 열람률", "chartOpen"], ["날짜 변경률", "dateChange"]];
  byId("comparison-body").innerHTML = rows.map(([label, key]) => { const before = comparison.v1[key].rate; const after = comparison.v2[key].rate; const delta = Math.round((after - before) * 10) / 10; return `<tr><td>${label}</td><td>${before.toFixed(1)}%</td><td>${after.toFixed(1)}%</td><td class="${delta >= 0 ? "delta-positive" : "delta-negative"}">${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%p</td></tr>`; }).join("");
}
function renderSessions(rows) {
  byId("sessions-body").innerHTML = rows.length ? rows.map((row) => `<tr><td>${fmt.format(new Date(row.started_at))}</td><td>${row.app_version}</td><td><button class="session-link" data-session="${row.session_id}">${row.session_id.slice(0, 8)}</button></td><td>${row.max_region_count}</td><td>${row.weather_queries}</td><td>${row.chart_opened ? `예 (${row.chart_clicks})` : "아니오"}</td><td>${row.date_changes}</td><td>${row.api_errors}</td></tr>`).join("") : '<tr><td class="admin-empty" colspan="8">조건에 맞는 데이터가 없습니다.</td></tr>';
  document.querySelectorAll(".session-link").forEach((button) => button.addEventListener("click", () => openTimeline(button.dataset.session)));
}
async function openTimeline(sessionId) {
  const response = await adminFetch(queryParams({ action: "timeline", session_id: sessionId })); const data = await response.json();
  byId("timeline-session").textContent = sessionId.slice(0, 12);
  byId("timeline-list").innerHTML = data.events.map((event) => `<li><strong>${escapeAdmin(event.event_name)}</strong><time>${fmt.format(new Date(event.created_at))}</time><pre>${escapeAdmin(JSON.stringify(event.metadata, null, 2))}</pre></li>`).join("") || "<li>이벤트가 없습니다.</li>";
  byId("timeline-dialog").showModal(); if (window.lucide) window.lucide.createIcons();
}
async function downloadCsv(table) {
  byId("csv-options").classList.add("hidden"); const response = await adminFetch(queryParams({ action: "csv", table }));
  const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `${table}.csv`; link.click(); URL.revokeObjectURL(url);
}
