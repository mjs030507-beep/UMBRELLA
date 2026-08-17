import test from "node:test";
import assert from "node:assert/strict";
import { calculateKpis } from "../netlify/lib/kpi.js";

const sessions = (ids) => ids.map((session_id) => ({ session_id }));
const query = (session_id, region_count, id = session_id) => ({ id, session_id, region_count, result_success: true });
const event = (session_id, event_name) => ({ session_id, event_name });

test("사용자 A: 한 지역 조회만 하면 세 KPI 모두 미사용이다", () => {
  const result = calculateKpis({ sessions: sessions(["A"]), queries: [query("A", 1)], events: [] });
  assert.equal(result.multiRegion.rate, 0);
  assert.equal(result.chartOpen.rate, 0);
  assert.equal(result.dateChange.rate, 0);
});

test("사용자 B: 세 지역 조회와 그래프 열람을 각각 판정한다", () => {
  const result = calculateKpis({ sessions: sessions(["B"]), queries: [query("B", 3)], events: [event("B", "detail_chart_open")] });
  assert.equal(result.multiRegion.rate, 100);
  assert.equal(result.chartOpen.rate, 100);
  assert.equal(result.dateChange.rate, 0);
});

test("사용자 C: 반복 클릭은 횟수로, KPI 사용자는 고유 세션으로 센다", () => {
  const result = calculateKpis({
    sessions: sessions(["C"]), queries: [query("C", 2)],
    events: [event("C", "date_change"), event("C", "date_change"), event("C", "detail_chart_open"), event("C", "detail_chart_open"), event("C", "detail_chart_open")],
  });
  assert.equal(result.multiRegion.numerator, 1);
  assert.equal(result.chartOpen.numerator, 1);
  assert.equal(result.chartOpen.denominator, 1);
  assert.equal(result.totals.chartClicks, 3);
  assert.equal(result.dateChange.numerator, 1);
  assert.equal(result.totals.dateChanges, 2);
  assert.equal(result.totals.averageDateChanges, 2);
});

test("실패하거나 실행되지 않은 조회는 다지역 활용 분모와 분자에서 제외한다", () => {
  const result = calculateKpis({
    sessions: sessions(["ok", "failed", "no-query"]),
    queries: [query("ok", 1), { session_id: "failed", region_count: 4, result_success: false }], events: [],
  });
  assert.equal(result.multiRegion.denominator, 1);
  assert.equal(result.multiRegion.numerator, 0);
  assert.equal(result.totals.apiErrors, 1);
  assert.equal(result.totals.apiSuccessRate, 50);
});

test("한 세션에서 나중에 두 지역을 조회하면 다지역 활용 세션이다", () => {
  const result = calculateKpis({ sessions: sessions(["repeat"]), queries: [query("repeat", 1, "q1"), query("repeat", 3, "q2")], events: [] });
  assert.equal(result.multiRegion.numerator, 1);
  assert.equal(result.multiRegion.denominator, 1);
  assert.equal(result.multiRegion.rate, 100);
});
