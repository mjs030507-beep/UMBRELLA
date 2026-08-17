const SAVED_KEY = "umbrella_saved_regions_v2";
const TEMP_KEY = "umbrella_temporary_regions_v2";
const LAST_WEATHER_DATE_KEY = "umbrella_last_weather_date_v2";
const MAX_REGIONS = 10;
const RAIN_PROBABILITY = 50;
const state = { saved: [], temporary: [], weather: [], selectedDetail: null, chart: null, searchMode: "temporary", requestStarted: 0, lastWeatherDate: null, isLoading: false, midnightTimer: null };
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));

document.addEventListener("DOMContentLoaded", () => {
  loadState(); bindEvents(); initAnalytics(); updateIcons();
  if (state.saved.length) showHome(); else showOnboarding();
});

function todaySeoul() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function loadJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; } }
function loadState() {
  state.saved = loadJson(SAVED_KEY, []);
  state.lastWeatherDate = localStorage.getItem(LAST_WEATHER_DATE_KEY);
  const tempData = loadJson(TEMP_KEY, { date: todaySeoul(), regions: [] });
  state.temporary = tempData.date === todaySeoul() ? tempData.regions : [];
  persistTemporary();
}
function persistSaved() { localStorage.setItem(SAVED_KEY, JSON.stringify(state.saved)); }
function persistTemporary() { localStorage.setItem(TEMP_KEY, JSON.stringify({ date: todaySeoul(), regions: state.temporary })); }
function regionKey(region) { return region.id || `${region.name}|${region.lat}|${region.lon}`; }
function updateIcons() { if (window.lucide) window.lucide.createIcons(); }

function bindEvents() {
  const debouncedOnboarding = debounce((event) => search(event.target.value, "onboarding"), 350);
  const debouncedDialog = debounce((event) => search(event.target.value, "dialog"), 350);
  $("#onboarding-search").addEventListener("input", debouncedOnboarding);
  $("#dialog-search").addEventListener("input", debouncedDialog);
  $("#onboarding-complete").addEventListener("click", () => { if (state.saved.length) { persistSaved(); showHome(); } });
  $("#refresh-weather").addEventListener("click", () => loadWeather(true));
  $("#retry-weather").addEventListener("click", () => loadWeather(true));
  $("#temporary-add-open").addEventListener("click", () => openSearchDialog("temporary"));
  $("#manage-open").addEventListener("click", openManage);
  $("#manage-add").addEventListener("click", () => { $("#manage-dialog").close(); openSearchDialog("saved"); });
  document.querySelectorAll(".dialog-close").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
  document.querySelectorAll("dialog").forEach((dialog) => dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); }));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) checkForDateChange(); });
  window.addEventListener("focus", checkForDateChange);
  window.addEventListener("pageshow", checkForDateChange);
}
function debounce(fn, wait) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); }; }

function showOnboarding() {
  $("#home").classList.add("hidden"); $("#onboarding").classList.remove("hidden"); $("#manage-open").classList.add("hidden"); renderSelectedPlaces();
}
function showHome() {
  $("#onboarding").classList.add("hidden"); $("#home").classList.remove("hidden"); $("#manage-open").classList.remove("hidden");
  updateTodayLabel(); renderLoading(); loadWeather(); scheduleMidnightRefresh();
}
function updateTodayLabel() { $("#today-label").textContent = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "long" }).format(new Date()); }
function nextSeoulDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
function scheduleMidnightRefresh() {
  clearTimeout(state.midnightTimer);
  const tomorrow = nextSeoulDate(todaySeoul());
  const nextMidnight = new Date(`${tomorrow}T00:00:00+09:00`).getTime();
  const delay = Math.max(1000, nextMidnight - Date.now() + 1000);
  state.midnightTimer = setTimeout(() => { checkForDateChange(); scheduleMidnightRefresh(); }, delay);
}
function checkForDateChange() {
  if ($("#home").classList.contains("hidden") || state.isLoading) return;
  const currentDate = todaySeoul();
  if (state.lastWeatherDate === currentDate) { scheduleMidnightRefresh(); return; }
  state.temporary = [];
  persistTemporary();
  updateTodayLabel();
  renderLoading();
  loadWeather(true);
  scheduleMidnightRefresh();
}

async function search(query, target) {
  const box = target === "onboarding" ? $("#onboarding-results") : $("#dialog-results");
  const spinner = target === "onboarding" ? $("#onboarding-spinner") : $("#dialog-spinner");
  if (!query.trim()) { box.innerHTML = ""; return; }
  spinner.classList.remove("hidden"); box.innerHTML = '<p class="search-hint">검색 중...</p>';
  try { renderSearchResults(await searchRegionsByKeyword(query), target); }
  catch { box.innerHTML = '<p class="search-hint">검색하지 못했어요. 잠시 후 다시 시도해주세요.</p>'; }
  finally { spinner.classList.add("hidden"); }
}
function renderSearchResults(results, target) {
  const box = target === "onboarding" ? $("#onboarding-results") : $("#dialog-results");
  if (!results.length) { box.innerHTML = '<p class="search-hint">다른 지역명으로 검색해보세요.</p>'; return; }
  const existing = state.searchMode === "saved" || target === "onboarding" ? state.saved : [...state.saved, ...state.temporary];
  box.innerHTML = results.map((region, index) => {
    const duplicate = existing.some((item) => regionKey(item) === regionKey(region));
    return `<button class="search-result" data-index="${index}" type="button" ${duplicate ? "disabled" : ""}><span><strong>${escapeHtml(region.name)}</strong><span>${duplicate ? "이미 등록된 장소" : "오늘 예보에 추가"}</span></span><i data-lucide="${duplicate ? "check" : "plus"}"></i></button>`;
  }).join("");
  box.querySelectorAll(".search-result:not(:disabled)").forEach((button) => button.addEventListener("click", () => addRegion(results[Number(button.dataset.index)], target)));
  updateIcons();
}
function addRegion(region, target) {
  if (target === "onboarding" || state.searchMode === "saved") {
    if (state.saved.length >= MAX_REGIONS) { showInlineError("장소는 최대 10곳까지 등록할 수 있어요."); return; }
    if (!state.saved.some((item) => regionKey(item) === regionKey(region))) state.saved.push(region);
    persistSaved();
    if (target === "onboarding") { $("#onboarding-search").value = ""; $("#onboarding-results").innerHTML = ""; renderSelectedPlaces(); }
    else { $("#search-dialog").close(); openManage(); loadWeather(true); }
  } else {
    state.temporary.push(region); persistTemporary(); $("#search-dialog").close();
    trackEvent("temporary_region_add", { region_name: region.name, saved_region_count: state.saved.length }); loadWeather(true);
  }
}
function renderSelectedPlaces() {
  $("#onboarding-count").textContent = `${state.saved.length} / ${MAX_REGIONS}`;
  $("#onboarding-complete").disabled = !state.saved.length;
  $("#onboarding-places").innerHTML = state.saved.map((region, index) => placeRow(region, index)).join("");
  $("#onboarding-places").querySelectorAll(".remove-button").forEach((button) => button.addEventListener("click", () => { state.saved.splice(Number(button.dataset.index), 1); persistSaved(); renderSelectedPlaces(); })); updateIcons();
  $("#onboarding-places").querySelectorAll(".nickname-input").forEach((input) => input.addEventListener("input", () => updateNickname(Number(input.dataset.index), input.value)));
}
function placeRow(region, index) { return `<div class="selected-place"><span class="place-pin"><i data-lucide="map-pin"></i></span><span class="place-edit"><span class="place-address" title="${escapeHtml(region.name)}">${escapeHtml(region.name)}</span><input class="nickname-input" data-index="${index}" value="${escapeHtml(region.nickname || "")}" maxlength="20" placeholder="별명 입력 (예: 집, 회사)" aria-label="${escapeHtml(region.name)} 별명"></span><button class="remove-button" data-index="${index}" type="button" aria-label="${escapeHtml(region.name)} 삭제"><i data-lucide="trash-2"></i></button></div>`; }
function updateNickname(index, value) {
  if (!state.saved[index]) return;
  state.saved[index].nickname = value.trimStart().slice(0, 20);
  const weatherItem = state.weather.find((item) => regionKey(item) === regionKey(state.saved[index]));
  if (weatherItem) { weatherItem.nickname = state.saved[index].nickname; renderHomeWeather(); }
  persistSaved();
}
function showInlineError(message) { const error = $("#onboarding-error"); error.textContent = message; error.classList.remove("hidden"); setTimeout(() => error.classList.add("hidden"), 3000); }

function openSearchDialog(mode) {
  state.searchMode = mode; $("#search-dialog-eyebrow").textContent = mode === "saved" ? "자주 가는 장소" : "오늘만 가는 장소";
  $("#search-dialog-title").textContent = mode === "saved" ? "새 장소를 등록하세요" : "오늘 방문할 곳을 검색하세요";
  $("#dialog-search").value = ""; $("#dialog-results").innerHTML = '<p class="search-hint">동, 구, 읍·면 단위로 검색할 수 있어요.</p>'; $("#search-dialog").showModal(); setTimeout(() => $("#dialog-search").focus(), 50); updateIcons();
}
function openManage() {
  renderManage(); $("#manage-dialog").showModal(); updateIcons();
}
function renderManage() {
  $("#manage-count").textContent = `${state.saved.length} / ${MAX_REGIONS}`;
  $("#manage-add").disabled = state.saved.length >= MAX_REGIONS;
  $("#manage-list").innerHTML = state.saved.map((region, index) => `<div class="manage-row"><span class="place-pin"><i data-lucide="map-pin"></i></span><span class="place-edit"><span class="place-address" title="${escapeHtml(region.name)}">${escapeHtml(region.name)}</span><input class="nickname-input" data-index="${index}" value="${escapeHtml(region.nickname || "")}" maxlength="20" placeholder="별명 입력 (예: 집, 회사)" aria-label="${escapeHtml(region.name)} 별명"></span><button class="remove-button" data-index="${index}" type="button" aria-label="삭제"><i data-lucide="trash-2"></i></button></div>`).join("");
  $("#manage-list").querySelectorAll(".remove-button").forEach((button) => button.addEventListener("click", () => {
    state.saved.splice(Number(button.dataset.index), 1); persistSaved(); renderManage(); updateIcons();
    if (!state.saved.length) { $("#manage-dialog").close(); showOnboarding(); } else loadWeather(true);
  }));
  $("#manage-list").querySelectorAll(".nickname-input").forEach((input) => input.addEventListener("input", () => { updateNickname(Number(input.dataset.index), input.value); }));
  updateIcons();
}

function renderLoading() {
  $("#weather-error").classList.add("hidden"); $("#hero-status").className = "decision decision-loading";
  $("#hero-status").innerHTML = '<div class="decision-icon"><span class="spinner spinner-large"></span></div><div><p class="decision-label">오늘의 우산 판단</p><h2>날씨를 확인하고 있어요</h2><p>저장한 장소의 예보를 불러오는 중입니다.</p></div>';
  $("#saved-weather-list").innerHTML = state.saved.map(() => '<div class="skeleton"></div>').join("");
}
async function loadWeather(force = false) {
  const regions = [...state.saved.map((r) => ({ ...r, temporary: false })), ...state.temporary.map((r) => ({ ...r, temporary: true }))];
  if (!regions.length || state.isLoading) return;
  state.isLoading = true;
  const requestedDate = todaySeoul();
  renderLoading(); state.requestStarted = performance.now();
  if (force && typeof weatherCache !== "undefined") weatherCache.clear();
  try {
    const response = await fetchWeatherBatch(regions, requestedDate); state.weather = response.results.map(summarizeWeather); renderHomeWeather();
    state.lastWeatherDate = requestedDate;
    localStorage.setItem(LAST_WEATHER_DATE_KEY, requestedDate);
    trackFirstResult({ region_count: state.weather.length, saved_region_count: state.saved.length, api_elapsed_ms: response.elapsedMs, api_error: 0, chart_opened: 0 });
  } catch (error) {
    $("#weather-error").classList.remove("hidden"); $("#weather-error-message").textContent = error.message || "네트워크 연결을 확인해주세요.";
    $("#hero-status").innerHTML = '<div class="decision-icon">!</div><div><p class="decision-label">조회 실패</p><h2>날씨를 확인하지 못했어요</h2><p>연결을 확인한 뒤 다시 시도해주세요.</p></div>';
    trackEvent("weather_result_view", { region_count: regions.length, saved_region_count: state.saved.length, api_elapsed_ms: Math.round(performance.now() - state.requestStarted), api_error: 1 });
  } finally {
    state.isLoading = false;
    if (requestedDate !== todaySeoul()) setTimeout(checkForDateChange, 0);
  }
  updateIcons();
}
function summarizeWeather(region) {
  const hourly = region.raw.hourly || {}; const probabilities = (hourly.precipitation_probability || []).slice(0, 24); const precipitation = (hourly.precipitation || []).slice(0, 24);
  const rainyHours = probabilities.map((probability, hour) => ({ probability: probability || 0, amount: precipitation[hour] || 0, hour })).filter((item) => item.probability >= RAIN_PROBABILITY || item.amount > 0.1);
  const peak = rainyHours.reduce((best, item) => item.probability > best.probability ? item : best, { probability: 0, amount: 0, hour: 12 });
  const daily = region.raw.daily || {}; const code = rainyHours.length ? hourly.weather_code?.[peak.hour] : daily.weather_code?.[0];
  return { ...region, weather: wmoToKorean(code), umbrellaNeeded: rainyHours.length > 0, rainPeriod: formatRainPeriod(rainyHours), maxProbability: Math.max(0, ...probabilities.map((v) => v || 0)), totalPrecip: daily.precipitation_sum?.[0] || 0, minTemp: daily.temperature_2m_min?.[0], maxTemp: daily.temperature_2m_max?.[0] };
}
function formatRainPeriod(hours) {
  if (!hours.length) return "비 소식 없음"; const first = hours[0].hour; const last = hours[hours.length - 1].hour;
  const period = first < 6 ? "새벽" : first < 12 ? "오전" : first < 18 ? "오후" : "저녁"; return first === last ? `${period} ${first}시 비` : `${period} ${first}–${last}시 비`;
}
function renderHomeWeather() {
  const rainy = state.weather.filter((item) => item.umbrellaNeeded); const hero = $("#hero-status");
  if (rainy.length) { hero.className = "decision decision-rain"; hero.innerHTML = `<div class="decision-icon">☂️</div><div><p class="decision-label">오늘의 우산 판단</p><h2>오늘은 우산을 챙기세요</h2><p>확인한 ${state.weather.length}곳 중 <strong>${rainy.length}곳</strong>에서 비가 예상됩니다.</p></div>`; }
  else { hero.className = "decision decision-clear"; hero.innerHTML = `<div class="decision-icon">☀️</div><div><p class="decision-label">오늘의 우산 판단</p><h2>우산 없이 나가도 괜찮아요</h2><p>확인한 ${state.weather.length}곳에 비 소식이 없습니다.</p></div>`; }
  const saved = state.weather.filter((item) => !item.temporary); const temporary = state.weather.filter((item) => item.temporary);
  $("#saved-count").textContent = `${saved.length}곳`; $("#saved-weather-list").innerHTML = saved.map(weatherRow).join("");
  $("#temporary-weather-list").innerHTML = temporary.map(weatherRow).join(""); $("#temporary-empty").classList.toggle("hidden", temporary.length > 0);
  document.querySelectorAll(".weather-row").forEach((row) => {
    row.addEventListener("click", (event) => { if (!event.target.closest(".nickname-edit-button")) openDetail(row.dataset.key); });
    row.addEventListener("keydown", (event) => { if ((event.key === "Enter" || event.key === " ") && !event.target.closest(".nickname-edit-button")) { event.preventDefault(); openDetail(row.dataset.key); } });
  });
  document.querySelectorAll(".nickname-edit-button").forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); startInlineNicknameEdit(button.dataset.key); }));
  updateIcons();
}
function displayRegionName(item) { return item.nickname?.trim() || item.name; }
function weatherRow(item) { const key = regionKey(item); const hasNickname = Boolean(item.nickname?.trim()); return `<div class="weather-row" data-key="${escapeHtml(key)}" role="button" tabindex="0" aria-label="${escapeHtml(displayRegionName(item))} 상세 날씨 보기"><span class="weather-place"><span class="weather-icon">${item.weather.emoji}</span><span class="weather-copy"><span class="weather-title-line"><span class="weather-name" title="${escapeHtml(displayRegionName(item))}">${escapeHtml(displayRegionName(item))}</span>${item.temporary ? "" : `<button class="nickname-edit-button" data-key="${escapeHtml(key)}" type="button" aria-label="${escapeHtml(displayRegionName(item))} 별명 수정" title="별명 수정"><i data-lucide="pencil"></i></button>`}</span>${hasNickname ? `<span class="weather-address" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>` : ""}<span class="weather-meta">${item.temporary ? '<span class="temporary-label">오늘만</span> · ' : ""}${formatTemperature(item)}</span></span></span><span class="weather-condition"><strong>${item.weather.label}</strong><span class="weather-meta">${item.rainPeriod}</span></span><span class="umbrella-badge ${item.umbrellaNeeded ? "umbrella-need" : "umbrella-none"}">${item.umbrellaNeeded ? "☂ 우산 필요" : "우산 불필요"}</span><i data-lucide="chevron-right"></i></div>`; }
function startInlineNicknameEdit(key) {
  const item = state.weather.find((region) => regionKey(region) === key && !region.temporary);
  const savedIndex = state.saved.findIndex((region) => regionKey(region) === key);
  const row = [...document.querySelectorAll(".weather-row")].find((element) => element.dataset.key === key);
  if (!item || savedIndex < 0 || !row) return;
  const titleLine = row.querySelector(".weather-title-line");
  titleLine.innerHTML = `<input class="inline-nickname-input" value="${escapeHtml(item.nickname || "")}" maxlength="20" placeholder="별명 입력 (예: 집)" aria-label="별명 입력">`;
  const input = titleLine.querySelector("input");
  let finished = false;
  const finish = (save) => {
    if (finished) return;
    finished = true;
    if (save) updateNickname(savedIndex, input.value);
    else renderHomeWeather();
  };
  input.addEventListener("click", (event) => event.stopPropagation());
  input.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter") { event.preventDefault(); finish(true); }
    if (event.key === "Escape") { event.preventDefault(); finish(false); }
  });
  input.addEventListener("blur", () => finish(true));
  input.focus(); input.select();
}
function formatTemperature(item) { return Number.isFinite(item.minTemp) ? `${Math.round(item.minTemp)}° / ${Math.round(item.maxTemp)}°` : "기온 정보 없음"; }

function openDetail(key) {
  const item = state.weather.find((region) => regionKey(region) === key); if (!item) return; state.selectedDetail = item;
  $("#detail-type").textContent = item.temporary ? "오늘만 가는 장소 · 상세 날씨" : item.nickname?.trim() ? item.name : "자주 가는 장소 · 상세 날씨"; $("#detail-name").textContent = displayRegionName(item);
  $("#detail-summary").innerHTML = `<div class="detail-metric"><span>우산 판단</span><strong>${item.umbrellaNeeded ? "☂ 우산 필요" : "우산 불필요"}</strong></div><div class="detail-metric"><span>최고 강수확률</span><strong>${item.maxProbability}%</strong></div><div class="detail-metric"><span>오늘 강수량</span><strong>${item.totalPrecip.toFixed(1)} mm</strong></div>`;
  const probabilities = item.raw.hourly?.precipitation_probability || []; const precipitation = item.raw.hourly?.precipitation || [];
  $("#hourly-list").innerHTML = [0,3,6,9,12,15,18,21].map((hour) => `<div class="hour-cell ${(precipitation[hour] || 0) > .1 ? "rain-hour" : ""}"><strong>${hour}시</strong><span>${probabilities[hour] ?? 0}%</span><span>${(precipitation[hour] || 0).toFixed(1)}mm</span></div>`).join("");
  $("#detail-dialog").showModal(); renderChart(item); trackEvent("region_view", { region_name: item.name, temporary: item.temporary ? 1 : 0, region_count: state.weather.length }); trackEvent("detail_chart_open", { region_name: item.name, chart_opened: 1 });
}
function renderChart(item) {
  if (!window.Chart) return; if (state.chart) state.chart.destroy(); const values = (item.raw.hourly?.precipitation || []).slice(0, 24);
  state.chart = new Chart($("#precip-chart"), { type: "bar", data: { labels: values.map((_, hour) => `${hour}시`), datasets: [{ data: values, backgroundColor: values.map((v) => v > .1 ? "#2563a9" : "#dfe7ee"), borderRadius: 3, barPercentage: .72 }] }, options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => ` ${context.raw.toFixed(1)} mm` } } }, scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } }, y: { beginAtZero: true, grid: { color: "#edf0f3" } } } } });
}
