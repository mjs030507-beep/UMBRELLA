const percent = (numerator, denominator) => denominator ? Math.round((numerator / denominator) * 1000) / 10 : 0;

export function calculateKpis({ sessions = [], queries = [], events = [] }) {
  const successful = queries.filter((query) => query.result_success === true);
  const completed = queries.filter((query) => query.result_success !== null && query.result_success !== undefined);
  const querySessions = new Set(successful.map((query) => query.session_id));
  const multiSessions = new Set(successful.filter((query) => Number(query.region_count) >= 2).map((query) => query.session_id));
  const chartEvents = events.filter((event) => event.event_name === "detail_chart_open" && querySessions.has(event.session_id));
  const chartSessions = new Set(chartEvents.map((event) => event.session_id));
  const dateEvents = events.filter((event) => event.event_name === "date_change" && querySessions.has(event.session_id));
  const dateSessions = new Set(dateEvents.map((event) => event.session_id));
  const errorCount = completed.filter((query) => query.result_success === false).length;
  const averageRegions = successful.length ? successful.reduce((sum, query) => sum + Number(query.region_count || 0), 0) / successful.length : 0;

  return {
    multiRegion: { numerator: multiSessions.size, denominator: querySessions.size, rate: percent(multiSessions.size, querySessions.size) },
    chartOpen: { numerator: chartSessions.size, denominator: querySessions.size, rate: percent(chartSessions.size, querySessions.size) },
    dateChange: { numerator: dateSessions.size, denominator: querySessions.size, rate: percent(dateSessions.size, querySessions.size) },
    totals: {
      uniqueSessions: new Set(sessions.map((session) => session.session_id)).size,
      querySessions: querySessions.size,
      weatherQueries: queries.length,
      averageRegions: Math.round(averageRegions * 10) / 10,
      chartClicks: chartEvents.length,
      dateChanges: dateEvents.length,
      averageDateChanges: querySessions.size ? Math.round((dateEvents.length / querySessions.size) * 10) / 10 : 0,
      apiSuccessRate: percent(completed.length - errorCount, completed.length),
      apiErrors: errorCount,
    },
  };
}

export function buildSessionRows({ sessions = [], queries = [], events = [] }) {
  return sessions.map((session) => {
    const sessionQueries = queries.filter((query) => query.session_id === session.session_id);
    const sessionEvents = events.filter((event) => event.session_id === session.session_id);
    return {
      started_at: session.started_at, app_version: session.app_version, session_id: session.session_id,
      max_region_count: Math.max(0, ...sessionQueries.map((query) => Number(query.region_count || 0))),
      weather_queries: sessionQueries.length,
      chart_opened: sessionEvents.some((event) => event.event_name === "detail_chart_open"),
      chart_clicks: sessionEvents.filter((event) => event.event_name === "detail_chart_open").length,
      date_changes: sessionEvents.filter((event) => event.event_name === "date_change").length,
      api_errors: sessionQueries.filter((query) => query.result_success === false).length,
    };
  }).sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
}
