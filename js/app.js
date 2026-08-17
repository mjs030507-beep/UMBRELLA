const SAVED_KEY = "umbrella_saved_regions_v2";
const TEMP_KEY = "umbrella_temporary_regions_v2";
const LAST_WEATHER_DATE_KEY = "umbrella_last_weather_date_v2";
const FEEDBACK_KEY = "umbrella_feedback_v2";
const MAX_REGIONS = 10;
const RAIN_PROBABILITY = 50;
const state = { saved: [], temporary: [], temporaryByDate: {}, activeDate: null, calendarDate: null, weather: [], selectedDetail: null, chart: null, searchMode: "temporary", requestStarted: 0, lastWeatherDate: null, isLoading: false, midnightTimer: null };
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));

document.addEventListener("DOMContentLoaded", async () => {
  loadState(); bindEvents(); updateIcons();
  await initAnalytics();
  if (state.saved.length) showHome(); else showOnboarding();
});

function todaySeoul() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function loadJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; } }
function loadState() {
  state.saved = loadJson(SAVED_KEY, []);
  state.activeDate = todaySeoul();
  state.calendarDate = state.activeDate;
  state.lastWeatherDate = localStorage.getItem(LAST_WEATHER_DATE_KEY);
  const tempData = loadJson(TEMP_KEY, { byDate: {} });
  state.temporaryByDate = tempData.byDate || (tempData.date && tempData.regions ? { [tempData.date]: tempData.regions } : {});
  state.temporary = state.temporaryByDate[state.activeDate] || [];
  persistTemporary();
}
function persistSaved() { localStorage.setItem(SAVED_KEY, JSON.stringify(state.saved)); }
function persistTemporary() { state.temporaryByDate[state.activeDate] = state.temporary; localStorage.setItem(TEMP_KEY, JSON.stringify({ byDate: state.temporaryByDate })); }
function regionKey(region) { return region.id || `${region.name}|${region.lat}|${region.lon}`; }
function updateIcons() { if (window.lucide) window.lucide.createIcons(); }

function bindEvents() {
  const debouncedOnboarding = debounce((event) => search(event.target.value, "onboarding"), 350);
  const debouncedDialog = debounce((event) => search(event.target.value, "dialog"), 350);
  $("#onboarding-search").addEventListener("input", debouncedOnboarding);
  $("#dialog-search").addEventListener("input", debouncedDialog);
  $("#onboarding-complete").addEventListener("click", () => { if (state.saved.length) { persistSaved(); showHome(); } });
  $("#refresh-weather").addEventListener("click", () => loadWeather(true));
  $("#forecast-date").addEventListener("change", onForecastDateChange);
  $("#retry-weather").addEventListener("click", () => loadWeather(true));
  $("#temporary-add-open").addEventListener("click", () => openSearchDialog("temporary"));
  $("#manage-open").addEventListener("click", openManage);
  $("#manage-add").addEventListener("click", () => { $("#manage-dialog").close(); openSearchDialog("saved"); });
  $("#feedback-open").addEventListener("click", openFeedback);
  $("#feedback-form").addEventListener("submit", submitFeedback);
  $("#feedback-text").addEventListener("input", updateFeedbackForm);
  document.querySelectorAll('input[name="feedback-category"]').forEach((input) => input.addEventListener("change", updateFeedbackForm));
  $("#feedback-done").addEventListener("click", () => $("#feedback-dialog").close());
  document.querySelectorAll(".dialog-close").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
  document.querySelectorAll("dialog").forEach((dialog) => dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); }));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) checkForDateChange(); });
  window.addEventListener("focus", checkForDateChange);
  window.addEventListener("pageshow", checkForDateChange);
}
function debounce(fn, wait) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), wait); }; }

function openFeedback() {
  $("#feedback-form").reset();
  $("#feedback-form").classList.remove("hidden");
  $("#feedback-success").classList.add("hidden");
  updateFeedbackForm();
  $("#feedback-dialog").showModal();
  trackEvent("feedback_open", { forecast_date: state.activeDate });
  updateIcons();
}
function updateFeedbackForm() {
  const text = $("#feedback-text").value;
  const category = document.querySelector('input[name="feedback-category"]:checked');
  $("#feedback-count").textContent = `${text.length} / 500`;
  $("#feedback-submit").disabled = !category && !text.trim();
}
async function submitFeedback(event) {
  event.preventDefault();
  const category = document.querySelector('input[name="feedback-category"]:checked')?.value || "comment";
  const comment = $("#feedback-text").value.trim();
  const feedback = { id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`, category, comment, forecast_date: state.activeDate, created_at: new Date().toISOString() };
  const submitButton = $("#feedback-submit");
  submitButton.disabled = true; submitButton.textContent = "보내는 중...";
  try {
    const saved = loadJson(FEEDBACK_KEY, []); saved.push(feedback); localStorage.setItem(FEEDBACK_KEY, JSON.stringify(saved.slice(-50)));
    if (window.FEEDBACK_ENDPOINT) {
      const response = await fetch(window.FEEDBACK_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(feedback) });
      if (!response.ok) throw new Error("피드백 전송 실패");
    }
    trackEvent("feedback_submit", { feedback_category: category, has_comment: comment ? 1 : 0, comment, target_date: state.activeDate });
    $("#feedback-form").classList.add("hidden"); $("#feedback-success").classList.remove("hidden"); updateIcons();
  } catch (error) {
    submitButton.disabled = false; submitButton.textContent = "다시 보내기";
    alert("피드백을 보내지 못했어요. 잠시 후 다시 시도해주세요.");
  }
}

function showOnboarding() {
  $("#home").classList.add("hidden"); $("#onboarding").classList.remove("hidden"); $("#manage-open").classList.add("hidden"); renderSelectedPlaces();
}
function showHome() {
  $("#onboarding").classList.add("hidden"); $("#home").classList.remove("hidden"); $("#manage-open").classList.remove("hidden");
  initDatePicker(); updateDateLabel(); renderLoading(); loadWeather(); scheduleMidnightRefresh();
}
function nextSeoulDate(dateString, offsetDays = 1) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}
function initDatePicker() {
  const input = $("#forecast-date");
  input.min = todaySeoul(); input.max = nextSeoulDate(todaySeoul(), 7); input.value = state.activeDate;
}
function selectedDateObject() { return new Date(`${state.activeDate}T12:00:00+09:00`); }
function dateSubject() {
  if (state.activeDate === todaySeoul()) return "오늘";
  if (state.activeDate === nextSeoulDate(todaySeoul())) return "내일";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" }).format(selectedDateObject());
}
function temporaryDateLabel() { return state.activeDate === todaySeoul() ? "오늘만" : "이날만"; }
function updateDateLabel() {
  $("#today-label").textContent = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "long" }).format(selectedDateObject());
  $("#temporary-title").textContent = `${temporaryDateLabel()} 가는 장소`;
  $("#temporary-description").textContent = `${dateSubject()}의 우산 판단에만 포함돼요.`;
  $("#temporary-empty").textContent = `${dateSubject()} 추가한 장소가 없어요.`;
}
function onForecastDateChange(event) {
  const nextDate = event.target.value;
  if (!nextDate || nextDate === state.activeDate) return;
  const previousDate = state.activeDate;
  persistTemporary();
  state.activeDate = nextDate;
  state.temporary = state.temporaryByDate[nextDate] || [];
  updateDateLabel(); renderLoading(); loadWeather(true);
  trackEvent("date_change", { previous_date: previousDate, selected_date: nextDate, target_date: nextDate });
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
  if (state.calendarDate === currentDate) { scheduleMidnightRefresh(); return; }
  state.calendarDate = currentDate;
  Object.keys(state.temporaryByDate).filter((date) => date < currentDate).forEach((date) => delete state.temporaryByDate[date]);
  state.activeDate = currentDate;
  state.temporary = state.temporaryByDate[currentDate] || [];
  persistTemporary();
  initDatePicker(); updateDateLabel();
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
    return `<button class="search-result" data-index="${index}" type="button" ${duplicate ? "disabled" : ""}><span><strong>${escapeHtml(region.name)}</strong><span>${duplicate ? "이미 등록된 장소" : "선택한 날짜 예보에 추가"}</span></span><i data-lucide="${duplicate ? "check" : "plus"}"></i></button>`;
  }).join("");
  box.querySelectorAll(".search-result:not(:disabled)").forEach((button) => button.addEventListener("click", () => addRegion(results[Number(button.dataset.index)], target)));
  updateIcons();
}
function addRegion(region, target) {
  if (target === "onboarding" || state.searchMode === "saved") {
    if (state.saved.length >= MAX_REGIONS) { showInlineError("장소는 최대 10곳까지 등록할 수 있어요."); return; }
    if (!state.saved.some((item) => regionKey(item) === regionKey(region))) state.saved.push(region);
    persistSaved();
    trackEvent("region_selected", { region_name: region.name, region_count: state.saved.length + state.temporary.length, target_date: state.activeDate });
    if (target === "onboarding") { $("#onboarding-search").value = ""; $("#onboarding-results").innerHTML = ""; renderSelectedPlaces(); }
    else { $("#search-dialog").close(); openManage(); loadWeather(true); }
  } else {
    state.temporary.push(region); persistTemporary(); $("#search-dialog").close();
    trackEvent("region_selected", { region_name: region.name, region_count: state.saved.length + state.temporary.length, target_date: state.activeDate });
    trackEvent("temporary_region_add", { region_name: region.name, forecast_date: state.activeDate, saved_region_count: state.saved.length }); loadWeather(true);
  }
}
function renderSelectedPlaces() {
  $("#onboarding-count").textContent = `${state.saved.length} / ${MAX_REGIONS}`;
  $("#onboarding-complete").disabled = !state.saved.length;
  $("#onboarding-places").innerHTML = state.saved.map((region, index) => placeRow(region, index)).join("");
  $("#onboarding-places").querySelectorAll(".remove-button").forEach((button) => button.addEventListener("click", () => { const removed = state.saved.splice(Number(button.dataset.index), 1)[0]; persistSaved(); trackEvent("region_removed", { region_name: removed?.name, region_count: state.saved.length + state.temporary.length, target_date: state.activeDate }); renderSelectedPlaces(); })); updateIcons();
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
  state.searchMode = mode; $("#search-dialog-eyebrow").textContent = mode === "saved" ? "자주 가는 장소" : `${temporaryDateLabel()} 가는 장소`;
  $("#search-dialog-title").textContent = mode === "saved" ? "새 장소를 등록하세요" : `${dateSubject()} 방문할 곳을 검색하세요`;
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
    const removed = state.saved.splice(Number(button.dataset.index), 1)[0]; persistSaved(); trackEvent("region_removed", { region_name: removed?.name, region_count: state.saved.length + state.temporary.length, target_date: state.activeDate }); renderManage(); updateIcons();
    if (!state.saved.length) { $("#manage-dialog").close(); showOnboarding(); } else loadWeather(true);
  }));
  $("#manage-list").querySelectorAll(".nickname-input").forEach((input) => input.addEventListener("input", () => { updateNickname(Number(input.dataset.index), input.value); }));
  updateIcons();
}

function renderLoading() {
  $("#weather-error").classList.add("hidden"); $("#hero-status").className = "decision decision-loading";
  $("#hero-status").innerHTML = `<div class="decision-icon"><span class="spinner spinner-large"></span></div><div><p class="decision-label">${dateSubject()}의 우산 판단</p><h2>날씨를 확인하고 있어요</h2><p>저장한 장소의 예보를 불러오는 중입니다.</p></div>`;
  $("#saved-weather-list").innerHTML = state.saved.map(() => '<div class="skeleton"></div>').join("");
  $("#forecast-date").disabled = true;
}
async function loadWeather(force = false) {
  const regions = [...state.saved.map((r) => ({ ...r, temporary: false })), ...state.temporary.map((r) => ({ ...r, temporary: true }))];
  if (!regions.length || state.isLoading) return;
  state.isLoading = true;
  const requestedDate = state.activeDate;
  const queryId = recordWeatherSearch({ targetDate: requestedDate, regions });
  renderLoading(); state.requestStarted = performance.now();
  if (force && typeof weatherCache !== "undefined") weatherCache.clear();
  try {
    const response = await fetchWeatherBatch(regions, requestedDate); state.weather = response.results.map(summarizeWeather); renderHomeWeather();
    state.lastWeatherDate = requestedDate;
    localStorage.setItem(LAST_WEATHER_DATE_KEY, requestedDate);
    recordWeatherResult(queryId, { targetDate: requestedDate, regionCount: state.weather.length, success: true, apiElapsedMs: response.elapsedMs });
  } catch (error) {
    $("#weather-error").classList.remove("hidden"); $("#weather-error-message").textContent = error.message || "네트워크 연결을 확인해주세요.";
    $("#hero-status").innerHTML = '<div class="decision-icon">!</div><div><p class="decision-label">조회 실패</p><h2>날씨를 확인하지 못했어요</h2><p>연결을 확인한 뒤 다시 시도해주세요.</p></div>';
    recordWeatherResult(queryId, { targetDate: requestedDate, regionCount: regions.length, success: false, apiElapsedMs: Math.round(performance.now() - state.requestStarted), errorType: error?.name || "weather_fetch_error" });
  } finally {
    state.isLoading = false;
    $("#forecast-date").disabled = false;
    if (state.calendarDate !== todaySeoul()) setTimeout(checkForDateChange, 0);
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
  if (rainy.length) { hero.className = "decision decision-rain"; hero.innerHTML = `<div class="decision-icon">☂️</div><div><p class="decision-label">${dateSubject()}의 우산 판단</p><h2>${dateSubject()}은 우산을 챙기세요</h2><p>확인한 ${state.weather.length}곳 중 <strong>${rainy.length}곳</strong>에서 비가 예상됩니다.</p></div>`; }
  else { hero.className = "decision decision-clear"; hero.innerHTML = `<div class="decision-icon">☀️</div><div><p class="decision-label">${dateSubject()}의 우산 판단</p><h2>우산 없이 나가도 괜찮아요</h2><p>확인한 ${state.weather.length}곳에 비 소식이 없습니다.</p></div>`; }
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
function rainComment(maxProbability, totalPrecip) {
  const probabilityBand = maxProbability < 20 ? 0 : maxProbability < 40 ? 1 : maxProbability < 60 ? 2 : maxProbability < 80 ? 3 : 4;
  const amountBand = totalPrecip <= 0.05 ? 0 : totalPrecip <= 0.5 ? 1 : totalPrecip <= 2 ? 2 : totalPrecip <= 5 ? 3 : totalPrecip <= 15 ? 4 : 5;
  const comments = [
    [
      "비가 올 가능성이 매우 낮고, 예상되는 비의 양도 거의 없어요.",
      "비가 올 가능성은 낮으며, 예상되는 비의 양도 거의 없어요.",
      "비가 올 가능성은 있지만, 예상되는 비의 양은 거의 없어요.",
      "비가 올 가능성은 높지만, 내리더라도 아주 짧게 스칠 수 있어요.",
      "비가 올 가능성은 매우 높지만, 예상 강수량은 거의 없어요. 짧은 빗방울에 대비하세요.",
    ],
    [
      "비 가능성은 매우 낮지만, 약한 빗방울이 잠깐 떨어질 수 있어요.",
      "비 가능성은 낮지만, 내리더라도 매우 약하고 짧을 것으로 보여요.",
      "한때 약한 비가 내릴 수 있어요. 작은 우산이면 충분해요.",
      "비가 올 가능성이 높지만 양은 매우 적어요. 작은 우산을 챙기세요.",
      "비가 올 가능성이 매우 높지만 양은 매우 적어요. 휴대용 우산이면 충분해요.",
    ],
    [
      "비 가능성은 매우 낮지만, 내릴 경우 약한 비가 예상돼요.",
      "비 가능성은 낮지만 약한 비 예보가 있어요. 예보 변화를 확인하세요.",
      "약한 비가 내릴 수 있어요. 휴대용 우산을 챙기면 안심이에요.",
      "약한 비가 올 가능성이 높아요. 우산을 챙기는 편이 좋아요.",
      "약한 비가 내릴 가능성이 매우 높아요. 우산을 챙기세요.",
    ],
    [
      "비 가능성은 매우 낮지만, 내릴 경우 다소 비가 이어질 수 있어요.",
      "비 가능성은 낮게 잡혔지만 예상 강수량이 있어요. 최신 예보를 확인하세요.",
      "다소 비가 내릴 수 있어요. 외출할 때 우산을 준비하세요.",
      "비가 올 가능성이 높고 양도 적지 않아요. 우산을 꼭 챙기세요.",
      "비가 올 가능성이 매우 높고 제법 내릴 수 있어요. 우산을 꼭 챙기세요.",
    ],
    [
      "비 가능성은 매우 낮지만, 비가 내리면 강수량이 많을 수 있어요. 예보를 다시 확인하세요.",
      "비 가능성은 낮지만 강한 비로 바뀔 여지가 있어요. 최신 예보를 확인하세요.",
      "제법 많은 비가 내릴 수 있어요. 튼튼한 우산을 준비하세요.",
      "많은 비가 올 가능성이 높아요. 큰 우산과 빗길에 대비하세요.",
      "많은 비가 내릴 가능성이 매우 높아요. 외출 시 빗길에 주의하세요.",
    ],
    [
      "비 가능성은 매우 낮게 잡혔지만, 내릴 경우 많은 비가 될 수 있어요. 예보를 꼭 다시 확인하세요.",
      "비 가능성은 낮지만 예상 강수량이 매우 많아요. 예보 변동과 기상특보를 확인하세요.",
      "강한 비가 내릴 수 있어요. 외출 일정과 최신 예보를 확인하세요.",
      "강한 비가 올 가능성이 높아요. 큰 우산을 준비하고 빗길을 조심하세요.",
      "강한 비가 내릴 가능성이 매우 높아요. 가능하면 외출을 줄이고 기상특보를 확인하세요.",
    ],
  ];
  return comments[amountBand][probabilityBand];
}
function weatherRow(item) { const key = regionKey(item); const hasNickname = Boolean(item.nickname?.trim()); return `<div class="weather-row" data-key="${escapeHtml(key)}" role="button" tabindex="0" aria-label="${escapeHtml(displayRegionName(item))} 상세 날씨 보기"><span class="weather-place"><span class="weather-icon">${item.weather.emoji}</span><span class="weather-copy"><span class="weather-title-line"><span class="weather-name" title="${escapeHtml(displayRegionName(item))}">${escapeHtml(displayRegionName(item))}</span>${item.temporary ? "" : `<button class="nickname-edit-button" data-key="${escapeHtml(key)}" type="button" aria-label="${escapeHtml(displayRegionName(item))} 별명 수정" title="별명 수정"><i data-lucide="pencil"></i></button>`}</span>${hasNickname ? `<span class="weather-address" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>` : ""}<span class="weather-meta">${item.temporary ? `<span class="temporary-label">${temporaryDateLabel()}</span> · ` : ""}${formatTemperature(item)}</span></span></span><span class="weather-condition"><strong>${item.weather.label}</strong><span class="weather-meta">${item.rainPeriod}</span></span><span class="umbrella-badge ${item.umbrellaNeeded ? "umbrella-need" : "umbrella-none"}">${item.umbrellaNeeded ? "☂ 우산 필요" : "우산 불필요"}</span><i data-lucide="chevron-right"></i></div>`; }
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
  $("#detail-type").textContent = item.temporary ? `${temporaryDateLabel()} 가는 장소 · 상세 날씨` : item.nickname?.trim() ? item.name : "자주 가는 장소 · 상세 날씨"; $("#detail-name").textContent = displayRegionName(item);
  $("#detail-summary").innerHTML = `<div class="detail-metric"><span>우산 판단</span><strong>${item.umbrellaNeeded ? "☂ 우산 필요" : "우산 불필요"}</strong></div><div class="detail-metric"><span>최고 강수확률</span><strong>${item.maxProbability}%</strong></div><div class="detail-metric"><span>예상 강수량</span><strong>${item.totalPrecip.toFixed(1)} mm</strong></div>`;
  $("#rain-comment").textContent = rainComment(item.maxProbability, item.totalPrecip);
  const probabilities = item.raw.hourly?.precipitation_probability || []; const precipitation = item.raw.hourly?.precipitation || [];
  $("#hourly-list").innerHTML = [0,3,6,9,12,15,18,21].map((hour) => { const probability = probabilities[hour] ?? 0; const amount = precipitation[hour] || 0; return `<div class="hour-cell ${probability >= RAIN_PROBABILITY || amount > .1 ? "rain-hour" : ""}"><strong>${hour}시</strong><span>${probability}%</span><span>${amount.toFixed(1)}mm</span></div>`; }).join("");
  $("#detail-dialog").showModal(); renderChart(item); trackEvent("region_view", { region_name: item.name, temporary: item.temporary ? 1 : 0, region_count: state.weather.length, target_date: state.activeDate }); trackEvent("detail_chart_open", { region_name: item.name, region_count: state.weather.length, target_date: state.activeDate, chart_opened: 1 });
}
function renderChart(item) {
  if (!window.Chart) return;
  if (state.chart) state.chart.destroy();
  const amounts = (item.raw.hourly?.precipitation || []).slice(0, 24).map((value) => Number(value) || 0);
  const probabilities = (item.raw.hourly?.precipitation_probability || []).slice(0, 24).map((value) => Number(value) || 0);
  const labels = Array.from({ length: Math.max(amounts.length, probabilities.length) }, (_, hour) => `${hour}시`);
  state.chart = new Chart($("#precip-chart"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        { type: "bar", label: "예상 강수량", data: amounts, yAxisID: "amount", backgroundColor: "#2563a9", borderRadius: 3, barPercentage: .68, order: 2 },
        { type: "line", label: "강수확률", data: probabilities, yAxisID: "probability", borderColor: "#16875b", backgroundColor: "#16875b", borderWidth: 2, pointRadius: 2.5, pointHoverRadius: 5, tension: .28, order: 1 },
        { type: "line", label: "우산 기준 50%", data: labels.map(() => RAIN_PROBABILITY), yAxisID: "probability", borderColor: "#98a2b3", borderWidth: 1, borderDash: [5, 5], pointRadius: 0, tension: 0, order: 3 },
      ],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8, padding: 16 } },
        tooltip: { callbacks: { label: (context) => context.dataset.yAxisID === "amount" ? ` 예상 강수량 ${Number(context.raw).toFixed(1)} mm` : context.dataset.label === "강수확률" ? ` 강수확률 ${context.raw}%` : ` 우산 기준 ${context.raw}%` } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
        amount: { type: "linear", position: "left", beginAtZero: true, suggestedMax: 1, title: { display: true, text: "mm" }, grid: { color: "#edf0f3" } },
        probability: { type: "linear", position: "right", min: 0, max: 100, title: { display: true, text: "%" }, grid: { drawOnChartArea: false } },
      },
    },
  });
}
