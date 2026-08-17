const WEATHER_CACHE_TTL = 30 * 60 * 1000;
const weatherCache = new Map();
const geocodeCache = new Map();

function wmoToKorean(code) {
  if (code === 0) return { label: "맑음", emoji: "☀️" };
  if ([1, 2].includes(code)) return { label: "구름 조금", emoji: "🌤️" };
  if ([3, 45, 48].includes(code)) return { label: code === 3 ? "흐림" : "안개", emoji: "☁️" };
  if ([51, 53, 55, 61, 63, 65, 66, 67].includes(code)) return { label: "비", emoji: "🌧️" };
  if ([80, 81, 82].includes(code)) return { label: "소나기", emoji: "🌦️" };
  if ([95, 96, 99].includes(code)) return { label: "뇌우", emoji: "⛈️" };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { label: "눈", emoji: "🌨️" };
  return { label: "정보 없음", emoji: "☁️" };
}

function isBroken(item) {
  const arrays = Object.entries(item.hourly || {}).filter(([key, value]) => key !== "time" && Array.isArray(value)).map(([, value]) => value);
  return arrays.length > 0 && arrays.every((values) => values.every((value) => value == null));
}

async function requestWeather(regions, date, useKma) {
  const params = new URLSearchParams({
    latitude: regions.map((r) => r.lat).join(","), longitude: regions.map((r) => r.lon).join(","),
    timezone: "Asia/Seoul", start_date: date, end_date: date,
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max",
    hourly: "precipitation,precipitation_probability,temperature_2m,weather_code"
  });
  if (useKma) params.set("models", "kma_seamless");
  const started = performance.now();
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!response.ok) throw new Error(`날씨 API 오류 (${response.status})`);
  const json = await response.json();
  return { data: Array.isArray(json) ? json : [json], elapsed: Math.round(performance.now() - started) };
}

async function fetchWeatherBatch(regions, date) {
  if (!regions.length) return { results: [], elapsedMs: 0, fromCache: false, fromFallback: false };
  const key = JSON.stringify({ date, coords: regions.map((r) => [r.lat, r.lon]) });
  const cached = weatherCache.get(key);
  if (cached && Date.now() - cached.time < WEATHER_CACHE_TTL) return { ...cached.value, elapsedMs: 0, fromCache: true };
  let response = await requestWeather(regions, date, true);
  let elapsedMs = response.elapsed;
  let fromFallback = false;
  if (response.data.every(isBroken)) {
    response = await requestWeather(regions, date, false);
    elapsedMs += response.elapsed;
    fromFallback = true;
  }
  if (response.data.length !== regions.length) throw new Error("지역별 예보 응답이 올바르지 않습니다.");
  const value = { results: response.data.map((raw, index) => ({ ...regions[index], raw })), elapsedMs, fromCache: false, fromFallback };
  weatherCache.set(key, { time: Date.now(), value });
  return value;
}

function isAdministrative(props) {
  return props.osm_key === "place" || (props.osm_key === "boundary" && ["administrative", "legal"].includes(props.osm_value));
}

function displayName(props) {
  const parts = [props.state, props.county, props.city, props.district, props.name].filter(Boolean);
  return [...new Set(parts)].join(" ") || "이름 없음";
}

async function searchRegionsByKeyword(keyword) {
  const query = keyword.trim();
  if (!query) return [];
  if (geocodeCache.has(query)) return geocodeCache.get(query);
  const params = new URLSearchParams({ q: query, limit: "30", lat: "36.5", lon: "127.8", lang: "default" });
  const response = await fetch(`https://photon.komoot.io/api/?${params}`);
  if (!response.ok) throw new Error(`지역 검색 오류 (${response.status})`);
  const json = await response.json();
  const korean = (json.features || []).filter((f) => f.properties?.countrycode === "KR");
  const candidates = korean.some((f) => isAdministrative(f.properties)) ? korean.filter((f) => isAdministrative(f.properties)) : korean;
  const seen = new Set();
  const results = [];
  candidates.forEach((feature) => {
    const [lon, lat] = feature.geometry.coordinates;
    const name = displayName(feature.properties);
    const key = `${name}|${lat.toFixed(3)}|${lon.toFixed(3)}`;
    if (!seen.has(key) && results.length < 15) { seen.add(key); results.push({ id: key, name, lat, lon }); }
  });
  geocodeCache.set(query, results);
  return results;
}
